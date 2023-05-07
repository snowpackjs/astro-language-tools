import {
	CompletionItem,
	CompletionItemKind,
	CompletionList,
	ServiceContext,
} from '@volar/language-service';
import { getDefaultHTMLDataProvider } from 'vscode-html-languageservice';
import { AstroFile } from '../../core/index.js';
import {
	ensureRangeIsInFrontmatter,
	getNewFrontmatterEdit,
	getOpenFrontmatterEdit,
} from '../../utils.js';

const defaultHTMLProvider = getDefaultHTMLDataProvider();
const defaultTags = new Set(defaultHTMLProvider.provideTags().map((tag) => tag.name));
const defaultAttributes = new Set(
	defaultHTMLProvider.provideTags().flatMap((tag) => tag.attributes.map((attr) => attr.name))
);

export function enhancedProvideCompletionItems(completions: CompletionList): CompletionList {
	completions.items = completions.items.filter(isValidCompletion).map((completion) => {
		const source = completion?.data?.originalItem?.source;
		if (source) {
			// For components import, use the file kind and sort them higher, as they're often what the user want over something else
			if (['.astro', '.svelte', '.vue'].some((ext) => source.endsWith(ext))) {
				completion.kind = CompletionItemKind.File;
				completion.detail = completion.detail + '\n\n' + source;
				completion.sortText = '\0';
				completion.data.isComponent = true;
			}
		}

		return completion;
	});

	return completions;
}

export function enhancedResolveCompletionItem(
	resolvedCompletion: CompletionItem,
	originalItem: CompletionItem,
	context: ServiceContext
): CompletionItem {
	// Make sure we keep our icons even when the completion is resolved
	if (resolvedCompletion.data.isComponent) {
		resolvedCompletion.detail = getDetailForFileCompletion(
			resolvedCompletion.detail ?? '',
			resolvedCompletion.data.originalItem.source
		);
	}

	// Properly handle completions with actions to make sure their edits end up in the frontmatter when needed
	const [_, source] = context.documents.getVirtualFileByUri(originalItem.data.uri);
	const file = source?.root;
	if (!(file instanceof AstroFile) || !context.host) return resolvedCompletion;

	const newLine = context.host.getNewLine ? context.host.getNewLine() : '\n';

	resolvedCompletion.additionalTextEdits = resolvedCompletion.additionalTextEdits?.map((edit) => {
		if (file.astroMeta.frontmatter.status === 'doesnt-exist') {
			return getNewFrontmatterEdit(edit, newLine);
		}

		if (file.astroMeta.frontmatter.status === 'open') {
			return getOpenFrontmatterEdit(edit, newLine);
		}

		edit.range = ensureRangeIsInFrontmatter(edit.range, file.astroMeta.frontmatter);

		return edit;
	});

	return resolvedCompletion;
}

function getDetailForFileCompletion(detail: string, source: string): string {
	return `${detail}\n\n${source}`;
}

// When Svelte components are imported, we have to reference the svelte2tsx's types to properly type the component
// An unfortunate downside of this is that it pollutes completions, so let's filter those internal types manually
const svelte2tsxTypes = new Set([
	'Svelte2TsxComponent',
	'Svelte2TsxComponentConstructorParameters',
	'SvelteComponentConstructor',
	'SvelteActionReturnType',
	'SvelteTransitionConfig',
	'SvelteTransitionReturnType',
	'SvelteAnimationReturnType',
	'SvelteWithOptionalProps',
	'SvelteAllProps',
	'SveltePropsAnyFallback',
	'SvelteSlotsAnyFallback',
	'SvelteRestProps',
	'SvelteSlots',
	'SvelteStore',
]);

function isValidCompletion(completion: CompletionItem) {
	const isSvelte2tsxCompletion =
		completion.label.startsWith('__sveltets_') || svelte2tsxTypes.has(completion.label);

	if (defaultTags.has(completion.label) || defaultAttributes.has(completion.label)) return false;
	if (isSvelte2tsxCompletion) return false;

	return true;
}
