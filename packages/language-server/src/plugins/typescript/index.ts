import { ServicePlugin, ServicePluginInstance, TextDocumentEdit } from '@volar/language-server';
import { create as createTypeScriptService } from 'volar-service-typescript';
import { AstroFile } from '../../core/index.js';
import {
	editShouldBeInFrontmatter,
	ensureProperEditForFrontmatter,
	ensureRangeIsInFrontmatter,
} from '../utils.js';
import { enhancedProvideCompletionItems, enhancedResolveCompletionItem } from './completions.js';
import { enhancedProvideSemanticDiagnostics } from './diagnostics.js';

export const create = (ts: typeof import('typescript')): ServicePlugin => {
	const tsServicePlugin = createTypeScriptService(
		ts as typeof import('typescript/lib/tsserverlibrary')
	);
	return {
		...tsServicePlugin,
		create(context): ServicePluginInstance {
			const tsService = tsServicePlugin.create(context);
			return {
				...tsService,
				transformCompletionItem(item) {
					const [_, source] = context.language.files.getVirtualFile(
						context.env.uriToFileName(item.data.uri)
					);
					const file = source?.virtualFile?.[0];
					if (!(file instanceof AstroFile) || !context.language.typescript) return undefined;
					if (file.scriptFiles.includes(item.data.fileName)) return undefined;

					const newLine =
						context.language.typescript.languageServiceHost
							.getCompilationSettings()
							.newLine?.toString() ?? '\n';
					if (item.additionalTextEdits) {
						item.additionalTextEdits = item.additionalTextEdits.map((edit) => {
							// HACK: There's a weird situation sometimes where some components (especially Svelte) will get imported as type imports
							// for some unknown reason. This work around the problem by always ensuring a normal import for components
							if (item.data.isComponent && edit.newText.includes('import type')) {
								edit.newText.replace('import type', 'import');
							}

							if (editShouldBeInFrontmatter(edit.range)) {
								return ensureProperEditForFrontmatter(edit, file.astroMeta.frontmatter, newLine);
							}

							return edit;
						});
					}

					return item;
				},
				transformCodeAction(item) {
					if (item.kind !== 'quickfix') return undefined;
					const originalUri = item.data.uri.replace('.tsx', '');

					const [_, source] = context.language.files.getVirtualFile(
						context.env.uriToFileName(originalUri)
					);
					const file = source?.virtualFile?.[0];
					if (!(file instanceof AstroFile) || !context.language.typescript) return undefined;
					if (
						file.scriptFiles.includes(
							context.env.uriToFileName(item.diagnostics?.[0].data.documentUri)
						)
					)
						return undefined;

					const document = context.documents.get(
						context.env.fileNameToUri(file.fileName),
						file.languageId,
						file.snapshot
					);
					const newLine =
						context.language.typescript.languageServiceHost
							.getCompilationSettings()
							.newLine?.toString() ?? '\n';
					if (!item.edit?.documentChanges) return undefined;
					item.edit.documentChanges = item.edit.documentChanges.map((change) => {
						if (TextDocumentEdit.is(change)) {
							change.textDocument.uri = originalUri;
							if (change.edits.length === 1) {
								change.edits = change.edits.map((edit) => {
									const editInFrontmatter = editShouldBeInFrontmatter(edit.range, document);
									if (editInFrontmatter.itShould) {
										return ensureProperEditForFrontmatter(
											edit,
											file.astroMeta.frontmatter,
											newLine,
											editInFrontmatter.position
										);
									}

									return edit;
								});
							} else {
								if (file.astroMeta.frontmatter.status === 'closed') {
									change.edits = change.edits.map((edit) => {
										const editInFrontmatter = editShouldBeInFrontmatter(edit.range, document);
										if (editInFrontmatter.itShould) {
											edit.range = ensureRangeIsInFrontmatter(
												edit.range,
												file.astroMeta.frontmatter,
												editInFrontmatter.position
											);
										}
										return edit;
									});
								} else {
									// TODO: Handle when there's multiple edits and a new frontmatter is potentially needed
									if (
										change.edits.some((edit) => {
											return editShouldBeInFrontmatter(edit.range, document).itShould;
										})
									) {
										console.error(
											'Code actions with multiple edits that require potentially creating a frontmatter are currently not implemented. In the meantime, please manually insert a frontmatter in your file before using this code action.'
										);
										change.edits = [];
									}
								}
							}
						}
						return change;
					});

					return item;
				},
				async provideCompletionItems(document, position, completionContext, token) {
					const originalCompletions = await tsService.provideCompletionItems!(
						document,
						position,
						completionContext,
						token
					);
					if (!originalCompletions) return null;

					return enhancedProvideCompletionItems(originalCompletions);
				},
				async resolveCompletionItem(item, token) {
					const resolvedCompletionItem = await tsService.resolveCompletionItem!(item, token);
					if (!resolvedCompletionItem) return item;

					return enhancedResolveCompletionItem(resolvedCompletionItem);
				},
				async provideSemanticDiagnostics(document, token) {
					const [_, source] = context.language.files.getVirtualFile(
						context.env.uriToFileName(document.uri)
					);
					const file = source?.virtualFile?.[0];
					let astroDocument = undefined;

					if (file instanceof AstroFile) {
						// If we have compiler errors, our TSX isn't valid so don't bother showing TS errors
						if (file.hasCompilationErrors) return null;

						astroDocument = context.documents.get(
							context.env.fileNameToUri(file.sourceFileName),
							file.languageId,
							file.snapshot
						);
					}

					const diagnostics = await tsService.provideSemanticDiagnostics!(document, token);
					if (!diagnostics) return null;

					return enhancedProvideSemanticDiagnostics(diagnostics, astroDocument?.lineCount);
				},
			};
		},
	};
};
