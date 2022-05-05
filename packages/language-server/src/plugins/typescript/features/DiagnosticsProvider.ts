import ts from 'typescript';
import { CancellationToken } from 'vscode-languageserver';
import { Diagnostic, DiagnosticTag } from 'vscode-languageserver-types';
import { AstroDocument, mapRangeToOriginal } from '../../../core/documents';
import { DiagnosticsProvider } from '../../interfaces';
import { LanguageServiceManager } from '../LanguageServiceManager';
import { AstroSnapshot, SnapshotFragment } from '../snapshots/DocumentSnapshot';
import { convertRange, mapSeverity, toVirtualAstroFilePath } from '../utils';

type BoundaryTuple = [number, number];

interface BoundaryParseResults {
	script: BoundaryTuple[];
	markdown: BoundaryTuple[];
}

export class DiagnosticsProviderImpl implements DiagnosticsProvider {
	constructor(private readonly languageServiceManager: LanguageServiceManager) {}

	async getDiagnostics(document: AstroDocument, _cancellationToken?: CancellationToken): Promise<Diagnostic[]> {
		// Don't return diagnostics for files inside node_modules. These are considered read-only
		// and they would pollute the output for astro check
		if (document.getFilePath()?.includes('/node_modules/') || document.getFilePath()?.includes('\\node_modules\\')) {
			return [];
		}

		const { lang, tsDoc } = await this.languageServiceManager.getLSAndTSDoc(document);

		const filePath = toVirtualAstroFilePath(tsDoc.filePath);
		const fragment = await tsDoc.createFragment();

		let scriptDiagnostics: ts.Diagnostic[] = [];

		document.scriptTags.forEach((scriptTag) => {
			const index = document.scriptTags.findIndex((value) => value.container.start == scriptTag.container.start);
			const scriptFilePath = tsDoc.filePath + `/script${index}.ts`;
			const scriptTagSnapshot = (tsDoc as AstroSnapshot).scriptTagSnapshots[index];

			const scriptDiagnostic = [
				...lang.getSyntacticDiagnostics(scriptFilePath),
				...lang.getSuggestionDiagnostics(scriptFilePath),
				...lang.getSemanticDiagnostics(scriptFilePath),
			].map((diag) => {
				if (diag.start && !diag.relatedInformation) {
					diag.start = fragment.offsetAt(
						scriptTagSnapshot.getOriginalPosition(scriptTagSnapshot.positionAt(diag.start))
					);
				}

				// HACK: There seems to be some sort of internal cache somewhere for diagnostics
				// And as such, when mapping to the fragment, we might be operating on a already-mapped diagnostic
				// I don't really get it but this works for now...
				diag.relatedInformation = [
					{
						start: 0,
						category: 0,
						code: 0,
						file: undefined,
						length: 0,
						messageText: '',
					},
				];

				return diag;
			});

			scriptDiagnostics.push(...scriptDiagnostic);
		});

		const { script: scriptBoundaries } = this.getTagBoundaries(lang, filePath);

		const syntaxDiagnostics = lang.getSyntacticDiagnostics(filePath);
		const suggestionDiagnostics = lang.getSuggestionDiagnostics(filePath);
		const semanticDiagnostics = lang.getSemanticDiagnostics(filePath);

		const diagnostics: ts.Diagnostic[] = [
			...syntaxDiagnostics,
			...suggestionDiagnostics,
			...semanticDiagnostics,
		].filter((diag) => {
			return isNoWithinBoundary(scriptBoundaries, diag);
		});

		diagnostics.push(...scriptDiagnostics);

		return diagnostics
			.map<Diagnostic>((diagnostic) => ({
				range: convertRange(tsDoc, diagnostic),
				severity: mapSeverity(diagnostic.category),
				source: 'ts',
				message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
				code: diagnostic.code,
				tags: getDiagnosticTag(diagnostic),
			}))
			.map(mapRange(fragment, document))
			.filter((diag) => {
				return (
					hasNoNegativeLines(diag) &&
					isNoJSXImplicitRuntimeWarning(diag) &&
					isNoJSXMustHaveOneParent(diag) &&
					isNoCantEndWithTS(diag) &&
					isNoSpreadExpected(diag) &&
					isNoCantResolveJSONModule(diag) &&
					isNoCantReturnOutsideFunction(diag) &&
					isNoJsxCannotHaveMultipleAttrsError(diag)
				);
			})
			.map(enhanceIfNecessary);
	}

	private getTagBoundaries(lang: ts.LanguageService, tsFilePath: string): BoundaryParseResults {
		const program = lang.getProgram();
		const sourceFile = program?.getSourceFile(tsFilePath);

		const boundaries: BoundaryParseResults = {
			script: [],
			markdown: [],
		};

		if (!sourceFile) {
			return boundaries;
		}

		function findTags(parent: ts.Node) {
			ts.forEachChild(parent, (node) => {
				if (ts.isJsxElement(node)) {
					let tagName = node.openingElement.tagName.getText();

					switch (tagName) {
						case 'script': {
							ts.getLineAndCharacterOfPosition(sourceFile!, node.getStart());
							boundaries.script.push([node.getStart(), node.getEnd()]);
							break;
						}
						case 'Markdown': {
							boundaries.markdown.push([node.getStart(), node.getEnd()]);
							break;
						}
					}
				}
				findTags(node);
			});
		}

		findTags(sourceFile);
		return boundaries;
	}
}

function getDiagnosticTag(diagnostic: ts.Diagnostic): DiagnosticTag[] {
	const tags: DiagnosticTag[] = [];
	if (diagnostic.reportsUnnecessary) {
		tags.push(DiagnosticTag.Unnecessary);
	}
	if (diagnostic.reportsDeprecated) {
		tags.push(DiagnosticTag.Deprecated);
	}
	return tags;
}

function mapRange(fragment: SnapshotFragment, _document: AstroDocument): (value: Diagnostic) => Diagnostic {
	return (diagnostic) => {
		let range = mapRangeToOriginal(fragment, diagnostic.range);

		if (range.start.line < 0) {
			// Could be a props error?
			// From svelte
		}

		return { ...diagnostic, range };
	};
}

/**
 * In some rare cases mapping of diagnostics does not work and produces negative lines.
 * We filter out these diagnostics with negative lines because else the LSP
 * apparently has a hickup and does not show any diagnostics at all.
 */
function hasNoNegativeLines(diagnostic: Diagnostic): boolean {
	return diagnostic.range.start.line >= 0 && diagnostic.range.end.line >= 0;
}

/**
 * Astro allows multiple attributes to have the same name
 */
function isNoJsxCannotHaveMultipleAttrsError(diagnostic: Diagnostic) {
	return diagnostic.code !== 17001;
}

/** Astro allows component with multiple root elements */
function isNoJSXMustHaveOneParent(diagnostic: Diagnostic) {
	return diagnostic.code !== 2657;
}

/** Astro allows `.ts` ending for imports, unlike TypeScript */
function isNoCantEndWithTS(diagnostic: Diagnostic) {
	return diagnostic.code !== 2691;
}

function isNoSpreadExpected(diagnostic: Diagnostic) {
	return diagnostic.code !== 1005;
}

function isNoJSXImplicitRuntimeWarning(diagnostic: Diagnostic) {
	return diagnostic.code !== 7016 && diagnostic.code !== 2792;
}

/**
 * Ignore "Can't return outside of function body"
 * This is technically a valid diagnostic, but due to how we format our TSX, the frontmatter is at top-level so we have
 * to ignore this. It wasn't a problem before because users didn't need to return things but they can now with SSR
 */
function isNoCantReturnOutsideFunction(diagnostic: Diagnostic) {
	return diagnostic.code !== 1108;
}

/**
 * Astro allows users to import JSON modules
 */
function isNoCantResolveJSONModule(diagnostic: Diagnostic) {
	return diagnostic.code !== 2732;
}

/**
 * Some diagnostics have JSX-specific nomenclature or unclear description. Enhance them for more clarity.
 */
function enhanceIfNecessary(diagnostic: Diagnostic): Diagnostic {
	if (diagnostic.code === 2322) {
		// For the rare case where an user might try to put a client directive on something that is not a component
		if (diagnostic.message.includes("Property 'client:") && diagnostic.message.includes("to type 'HTMLProps")) {
			return {
				...diagnostic,
				message: 'Client directives are only available on framework components',
			};
		}
	}
	return diagnostic;
}

function isWithinBoundaries(boundaries: BoundaryTuple[], start: number): boolean {
	for (let [bstart, bend] of boundaries) {
		if (start > bstart && start < bend) {
			return true;
		}
	}
	return false;
}

function diagnosticIsWithinBoundaries(
	sourceFile: ts.SourceFile | undefined,
	boundaries: BoundaryTuple[],
	diagnostic: Diagnostic | ts.Diagnostic
) {
	if ('start' in diagnostic) {
		if (diagnostic.start == null) return false;
		return isWithinBoundaries(boundaries, diagnostic.start);
	}

	if (!sourceFile) return false;

	let startRange = (diagnostic as Diagnostic).range.start;
	let pos = ts.getPositionOfLineAndCharacter(sourceFile, startRange.line, startRange.character);
	return isWithinBoundaries(boundaries, pos);
}

function isNoWithinBoundary(boundaries: BoundaryTuple[], diagnostic: ts.Diagnostic) {
	return !diagnosticIsWithinBoundaries(undefined, boundaries, diagnostic);
}
