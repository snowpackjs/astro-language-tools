import type { CompletionList, ServicePlugin, ServicePluginInstance } from '@volar/language-server';
import { AstroFile } from '../../core/index.js';
import { isInsideFrontmatter, isJSDocument } from '../utils.js';
import { getSnippetCompletions } from './snippets.js';

export const create = (): ServicePlugin => {
	return {
		create(context): ServicePluginInstance {
			return {
				isAdditionalCompletion: true,
				// Q: Why the empty transform and resolve functions?
				// A: Volar will skip mapping the completion items if those functions are defined, as such we can return the snippets
				// completions as-is, this is notably useful for snippets that insert to the frontmatter, since we don't need to map anything.
				transformCompletionItem(item) {
					return item;
				},
				provideCompletionItems(document, position, completionContext, token) {
					if (
						!context ||
						!isJSDocument ||
						token.isCancellationRequested ||
						completionContext.triggerKind === 2
					)
						return null;

					const [_, source] = context.language.files.getVirtualFile(
						context.env.uriToFileName(document.uri)
					);
					const file = source?.virtualFile?.[0];
					if (!(file instanceof AstroFile)) return undefined;

					if (!isInsideFrontmatter(document.offsetAt(position), file.astroMeta.frontmatter))
						return null;

					const completionList: CompletionList = {
						items: [],
						isIncomplete: false,
					};

					completionList.items.push(...getSnippetCompletions(file.astroMeta.frontmatter));

					return completionList;
				},
				resolveCompletionItem(item) {
					return item;
				},
			};
		},
	};
};
