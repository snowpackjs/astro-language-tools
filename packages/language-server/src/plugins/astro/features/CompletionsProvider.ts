import type { AppCompletionList, CompletionsProvider } from '../../interfaces';
import type { FunctionDeclaration } from 'typescript';
import type { AstroDocument, DocumentManager } from '../../../core/documents';
import {
	CompletionContext,
	Position,
	CompletionList,
	CompletionItem,
	CompletionItemKind,
	CompletionTriggerKind,
	InsertTextFormat,
	MarkupContent,
	MarkupKind,
	TextEdit,
} from 'vscode-languageserver';
import ts from 'typescript';
import { LanguageServiceManager } from '../../typescript/LanguageServiceManager';
import { isInComponentStartTag, isInsideExpression } from '../../../core/documents/utils';
import { isPossibleComponent } from '../../../utils';
import { toVirtualAstroFilePath, toVirtualFilePath } from '../../typescript/utils';
import { getLanguageService, Node } from 'vscode-html-languageservice';
import { astroDirectives } from '../../html/features/astro-attributes';
import { removeDataAttrCompletion } from '../../html/utils';

export class CompletionsProviderImpl implements CompletionsProvider {
	private readonly languageServiceManager: LanguageServiceManager;

	public directivesHTMLLang = getLanguageService({
		customDataProviders: [astroDirectives],
		useDefaultDataProvider: false,
	});

	constructor(languageServiceManager: LanguageServiceManager) {
		this.languageServiceManager = languageServiceManager;
	}

	async getCompletions(
		document: AstroDocument,
		position: Position,
		completionContext?: CompletionContext
	): Promise<AppCompletionList | null> {
		let items: CompletionItem[] = [];

		if (completionContext?.triggerCharacter === '-') {
			const frontmatter = this.getComponentScriptCompletion(document, position, completionContext);
			if (frontmatter) items.push(frontmatter);
		}

		const html = document.html;
		const offset = document.offsetAt(position);
		const node = html.findNodeAt(offset);

		if (isInComponentStartTag(html, offset) && !isInsideExpression(document.getText(), node.start, offset)) {
			const props = await this.getPropCompletions(document, position, completionContext);
			if (props.length) {
				items.push(...props);
			}

			const isAstro = await this.isAstroComponent(document, node);
			if (!isAstro) {
				const directives = removeDataAttrCompletion(this.directivesHTMLLang.doComplete(document, position, html).items);
				items.push(...directives);
			}
		}

		return CompletionList.create(items, true);
	}

	private getComponentScriptCompletion(
		document: AstroDocument,
		position: Position,
		completionContext?: CompletionContext
	): CompletionItem | null {
		const base = {
			kind: CompletionItemKind.Snippet,
			label: '---',
			sortText: '\0',
			preselect: true,
			detail: 'Component script',
			insertTextFormat: InsertTextFormat.Snippet,
			commitCharacters: ['-'],
		};
		const prefix = document.getLineUntilOffset(document.offsetAt(position));

		if (document.astroMeta.frontmatter.state === null) {
			return {
				...base,
				insertText: '---\n$0\n---',
				textEdit: prefix.match(/^\s*\-+/)
					? TextEdit.replace({ start: { ...position, character: 0 }, end: position }, '---\n$0\n---')
					: undefined,
			};
		}
		if (document.astroMeta.frontmatter.state === 'open') {
			return {
				...base,
				insertText: '---',
				textEdit: prefix.match(/^\s*\-+/)
					? TextEdit.replace({ start: { ...position, character: 0 }, end: position }, '---')
					: undefined,
			};
		}
		return null;
	}

	private async getPropCompletions(
		document: AstroDocument,
		position: Position,
		completionContext?: CompletionContext
	): Promise<CompletionItem[]> {
		const offset = document.offsetAt(position);
		const html = document.html;

		const node = html.findNodeAt(offset);
		if (!isPossibleComponent(node)) {
			return [];
		}
		const inAttribute = node.start + node.tag!.length < offset;
		if (!inAttribute) {
			return [];
		}

		if (completionContext?.triggerCharacter === '/' || completionContext?.triggerCharacter === '>') {
			return [];
		}

		// If inside of attribute value, skip.
		if (
			completionContext &&
			completionContext.triggerKind === CompletionTriggerKind.TriggerCharacter &&
			completionContext.triggerCharacter === '"'
		) {
			return [];
		}

		const componentName = node.tag!;
		const { lang, tsDoc } = await this.languageServiceManager.getLSAndTSDoc(document);

		// Get the source file
		const tsFilePath = toVirtualAstroFilePath(tsDoc.filePath);

		const program = lang.getProgram();
		const sourceFile = program?.getSourceFile(tsFilePath);
		const typeChecker = program?.getTypeChecker();
		if (!sourceFile || !typeChecker) {
			return [];
		}

		// Get the import statement
		const imp = this.getImportedSymbol(sourceFile, componentName);
		const importType = imp && typeChecker.getTypeAtLocation(imp);
		if (!importType) {
			return [];
		}

		// Get the component's props type
		const componentType = this.getPropType(importType, typeChecker);
		if (!componentType) {
			return [];
		}

		let completionItems: CompletionItem[] = [];

		// Add completions for this component's props type properties
		const properties = componentType.getProperties().filter((property) => property.name !== 'children') || [];

		properties.forEach((property) => {
			const type = typeChecker.getTypeOfSymbolAtLocation(property, imp);
			let completionItem = this.getCompletionItemForProperty(property, typeChecker, type);
			completionItems.push(completionItem);
		});

		// Ensure that props shows up first as a completion, despite this plugin being ran after the HTML one
		completionItems = completionItems.map((item) => {
			return { ...item, sortText: '_' };
		});

		return completionItems;
	}

	private getImportedSymbol(sourceFile: ts.SourceFile, identifier: string): ts.ImportSpecifier | ts.Identifier | null {
		for (let list of sourceFile.getChildren()) {
			for (let node of list.getChildren()) {
				if (ts.isImportDeclaration(node)) {
					let clauses = node.importClause;
					if (!clauses) return null;
					let namedImport = clauses.getChildAt(0);

					if (ts.isNamedImports(namedImport)) {
						for (let imp of namedImport.elements) {
							// Iterate the named imports
							if (imp.name.getText() === identifier) {
								return imp;
							}
						}
					} else if (ts.isIdentifier(namedImport)) {
						if (namedImport.getText() === identifier) {
							return namedImport;
						}
					}
				}
			}
		}

		return null;
	}

	private getPropType(type: ts.Type, typeChecker: ts.TypeChecker): ts.Type | null {
		const sym = type?.getSymbol();
		if (!sym) {
			return null;
		}

		for (const decl of sym?.getDeclarations() || []) {
			const fileName = toVirtualFilePath(decl.getSourceFile().fileName);
			if (fileName.endsWith('.tsx') || fileName.endsWith('.jsx')) {
				if (!ts.isFunctionDeclaration(decl)) {
					console.error(`We only support function components for tsx/jsx at the moment.`);
					continue;
				}
				const fn = decl as FunctionDeclaration;
				if (!fn.parameters.length) continue;
				const param1 = fn.parameters[0];
				const type = typeChecker.getTypeAtLocation(param1);
				return type;
			}
		}

		return null;
	}

	private getCompletionItemForProperty(mem: ts.Symbol, typeChecker: ts.TypeChecker, type: ts.Type) {
		const typeString = typeChecker.typeToString(type);

		let insertText = mem.name;
		switch (typeString) {
			case 'string':
				insertText = `${mem.name}="$1"`;
				break;
			case 'boolean':
				insertText = mem.name;
				break;
			default:
				insertText = `${mem.name}={$1}`;
				break;
		}

		let item: CompletionItem = {
			label: mem.name,
			detail: typeString,
			insertText: insertText,
			insertTextFormat: InsertTextFormat.Snippet,
			commitCharacters: [],
		};

		mem.getDocumentationComment(typeChecker);
		let description = mem
			.getDocumentationComment(typeChecker)
			.map((val) => val.text)
			.join('\n');

		if (description) {
			let docs: MarkupContent = {
				kind: MarkupKind.Markdown,
				value: description,
			};
			item.documentation = docs;
		}
		return item;
	}

	private async isAstroComponent(document: AstroDocument, node: Node): Promise<boolean> {
		const { lang, tsDoc } = await this.languageServiceManager.getLSAndTSDoc(document);

		// Get the source file
		const tsFilePath = toVirtualAstroFilePath(tsDoc.filePath);

		const program = lang.getProgram();
		const sourceFile = program?.getSourceFile(tsFilePath);
		const typeChecker = program?.getTypeChecker();
		if (!sourceFile || !typeChecker) {
			return false;
		}

		const componentName = node.tag!;
		const imp = this.getImportedSymbol(sourceFile, componentName);
		const importType = imp && typeChecker.getTypeAtLocation(imp);
		if (!importType) {
			return false;
		}

		const symbolDeclaration = importType.getSymbol()?.declarations;

		if (symbolDeclaration) {
			const fileName = symbolDeclaration[0].getSourceFile().fileName;

			return fileName.endsWith('.astro');
		}

		return false;
	}
}
