import ts, { ImportDeclaration, SourceFile, SyntaxKind, Node } from 'typescript';
import {
	CancellationToken,
	CompletionContext,
	DefinitionLink,
	Diagnostic,
	Hover,
	LocationLink,
	Position,
	SignatureHelp,
	SignatureHelpContext,
} from 'vscode-languageserver';
import { join as pathJoin, dirname as pathDirname } from 'path';
import { ConfigManager, LSTypescriptConfig } from '../../core/config';
import { AstroDocument, DocumentManager } from '../../core/documents';
import { isNotNullOrUndefined, pathToUrl } from '../../utils';
import { AppCompletionList, Plugin } from '../interfaces';
import { CompletionEntryWithIdentifer, CompletionsProviderImpl } from './features/CompletionsProvider';
import { DiagnosticsProviderImpl } from './features/DiagnosticsProvider';
import { HoverProviderImpl } from './features/HoverProvider';
import { SignatureHelpProviderImpl } from './features/SignatureHelpProvider';
import { SnapshotFragmentMap } from './features/utils';
import { LanguageServiceManager } from './LanguageServiceManager';
import { convertToLocationRange, ensureRealFilePath, isVirtualFilePath, toVirtualAstroFilePath } from './utils';

type BetterTS = typeof ts & {
	getTouchingPropertyName(sourceFile: SourceFile, pos: number): Node;
};

export class TypeScriptPlugin implements Plugin {
	__name = 'typescript';

	private configManager: ConfigManager;
	private readonly languageServiceManager: LanguageServiceManager;

	private readonly completionProvider: CompletionsProviderImpl;
	private readonly hoverProvider: HoverProviderImpl;
	private readonly signatureHelpProvider: SignatureHelpProviderImpl;
	private readonly diagnosticsProvider: DiagnosticsProviderImpl;

	constructor(docManager: DocumentManager, configManager: ConfigManager, workspaceUris: string[]) {
		this.configManager = configManager;
		this.languageServiceManager = new LanguageServiceManager(docManager, workspaceUris, configManager);

		this.completionProvider = new CompletionsProviderImpl(this.languageServiceManager);
		this.hoverProvider = new HoverProviderImpl(this.languageServiceManager);
		this.signatureHelpProvider = new SignatureHelpProviderImpl(this.languageServiceManager);
		this.diagnosticsProvider = new DiagnosticsProviderImpl(this.languageServiceManager);
	}

	async doHover(document: AstroDocument, position: Position): Promise<Hover | null> {
		return this.hoverProvider.doHover(document, position);
	}

	async getCompletions(
		document: AstroDocument,
		position: Position,
		completionContext?: CompletionContext
	): Promise<AppCompletionList<CompletionEntryWithIdentifer> | null> {
		const completions = await this.completionProvider.getCompletions(document, position, completionContext);

		return completions;
	}

	async getDefinitions(document: AstroDocument, position: Position): Promise<DefinitionLink[]> {
		const { lang, tsDoc } = await this.languageServiceManager.getLSAndTSDoc(document);
		const mainFragment = await tsDoc.createFragment();

		const filePath = tsDoc.filePath;
		const tsFilePath = toVirtualAstroFilePath(filePath);

		const fragmentPosition = mainFragment.getGeneratedPosition(position);
		const fragmentOffset = mainFragment.offsetAt(fragmentPosition);

		let defs = lang.getDefinitionAndBoundSpan(tsFilePath, fragmentOffset);

		if (!defs || !defs.definitions) {
			return [];
		}

		// Resolve all imports if we can
		if (this.goToDefinitionFoundOnlyAlias(tsFilePath, defs.definitions!)) {
			let importDef = this.getGoToDefinitionRefsForImportSpecifier(tsFilePath, fragmentOffset, lang);
			if (importDef) {
				defs = importDef;
			}
		}

		const docs = new SnapshotFragmentMap(this.languageServiceManager);
		docs.set(tsDoc.filePath, { fragment: mainFragment, snapshot: tsDoc });

		const result = await Promise.all(
			defs.definitions!.map(async (def) => {
				const { fragment, snapshot } = await docs.retrieve(def.fileName);

				const fileName = ensureRealFilePath(def.fileName);

				// Since we converted our files to TSX and we don't have sourcemaps, we don't know where the function is, unfortunate
				const textSpan = isVirtualFilePath(tsFilePath) ? { start: 0, length: 0 } : def.textSpan;

				return LocationLink.create(
					pathToUrl(fileName),
					convertToLocationRange(fragment, textSpan),
					convertToLocationRange(fragment, textSpan),
					convertToLocationRange(mainFragment, defs!.textSpan)
				);
			})
		);
		return result.filter(isNotNullOrUndefined);
	}

	async getDiagnostics(document: AstroDocument, cancellationToken?: CancellationToken): Promise<Diagnostic[]> {
		if (!this.featureEnabled('diagnostics')) {
			return [];
		}

		return this.diagnosticsProvider.getDiagnostics(document, cancellationToken);
	}

	async getSignatureHelp(
		document: AstroDocument,
		position: Position,
		context: SignatureHelpContext | undefined,
		cancellationToken?: CancellationToken
	): Promise<SignatureHelp | null> {
		return this.signatureHelpProvider.getSignatureHelp(document, position, context, cancellationToken);
	}

	private goToDefinitionFoundOnlyAlias(tsFileName: string, defs: readonly ts.DefinitionInfo[]) {
		return !!(defs.length === 1 && defs[0].kind === 'alias' && defs[0].fileName === tsFileName);
	}

	private getGoToDefinitionRefsForImportSpecifier(
		tsFilePath: string,
		offset: number,
		lang: ts.LanguageService
	): ts.DefinitionInfoAndBoundSpan | undefined {
		const program = lang.getProgram();
		const sourceFile = program?.getSourceFile(tsFilePath);
		if (sourceFile) {
			let node = (ts as BetterTS).getTouchingPropertyName(sourceFile, offset);
			if (node && node.kind === SyntaxKind.Identifier) {
				if (node.parent.kind === SyntaxKind.ImportClause) {
					let decl = node.parent.parent as ImportDeclaration;
					let spec = ts.isStringLiteral(decl.moduleSpecifier) && decl.moduleSpecifier.text;
					if (spec) {
						let fileName = pathJoin(pathDirname(tsFilePath), spec);
						let start = node.pos + 1;
						let def: ts.DefinitionInfoAndBoundSpan = {
							definitions: [
								{
									kind: 'alias',
									fileName,
									name: '',
									containerKind: '',
									containerName: '',
									textSpan: {
										start: 0,
										length: 0,
									},
								} as ts.DefinitionInfo,
							],
							textSpan: {
								start,
								length: node.end - start,
							},
						};
						return def;
					}
				}
			}
		}
	}

	private featureEnabled(feature: keyof LSTypescriptConfig) {
		return (
			this.configManager.enabled('typescript.enabled') && this.configManager.enabled(`typescript.${feature}.enabled`)
		);
	}
}
