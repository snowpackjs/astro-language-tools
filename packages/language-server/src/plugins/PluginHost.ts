import {
	CancellationToken,
	Color,
	ColorInformation,
	ColorPresentation,
	CompletionContext,
	CompletionItem,
	CompletionList,
	DefinitionLink,
	Diagnostic,
	FoldingRange,
	Hover,
	Position,
	Range,
	SignatureHelp,
	SignatureHelpContext,
	TextDocumentContentChangeEvent,
	TextDocumentIdentifier,
} from 'vscode-languageserver';
import type { AppCompletionItem, Plugin, LSProvider } from './interfaces';
import { flatten } from 'lodash';
import { DocumentManager } from '../core/documents/DocumentManager';

enum ExecuteMode {
	None,
	FirstNonNull,
	Collect,
}

export class PluginHost {
	private plugins: Plugin[] = [];

	constructor(private docManager: DocumentManager) {}

	registerPlugin(plugin: Plugin) {
		this.plugins.push(plugin);
	}

	async doHover(textDocument: TextDocumentIdentifier, position: Position): Promise<Hover | null> {
		const document = this.getDocument(textDocument.uri);

		return this.execute<Hover>('doHover', [document, position], ExecuteMode.FirstNonNull);
	}

	async getCompletions(
		textDocument: TextDocumentIdentifier,
		position: Position,
		completionContext?: CompletionContext
	): Promise<CompletionList> {
		const document = this.getDocument(textDocument.uri);

		const completions = (
			await this.execute<CompletionList>('getCompletions', [document, position, completionContext], ExecuteMode.Collect)
		).filter((completion) => completion != null);

		let flattenedCompletions = flatten(completions.map((completion) => completion.items));
		const isIncomplete = completions.reduce(
			(incomplete, completion) => incomplete || completion.isIncomplete,
			false as boolean
		);

		return CompletionList.create(flattenedCompletions, isIncomplete);
	}

	async resolveCompletion(
		textDocument: TextDocumentIdentifier,
		completionItem: AppCompletionItem
	): Promise<CompletionItem> {
		const document = this.getDocument(textDocument.uri);

		const result = await this.execute<CompletionItem>(
			'resolveCompletion',
			[document, completionItem],
			ExecuteMode.FirstNonNull
		);

		return result ?? completionItem;
	}

	async getDiagnostics(textDocument: TextDocumentIdentifier): Promise<Diagnostic[]> {
		const document = this.getDocument(textDocument.uri);

		return flatten(await this.execute<Diagnostic[]>('getDiagnostics', [document], ExecuteMode.Collect));
	}

	async doTagComplete(textDocument: TextDocumentIdentifier, position: Position): Promise<string | null> {
		const document = this.getDocument(textDocument.uri);

		return this.execute<string | null>('doTagComplete', [document, position], ExecuteMode.FirstNonNull);
	}

	async getFoldingRanges(textDocument: TextDocumentIdentifier): Promise<FoldingRange[] | null> {
		const document = this.getDocument(textDocument.uri);

		const foldingRanges = flatten(
			await this.execute<FoldingRange[]>('getFoldingRanges', [document], ExecuteMode.Collect)
		).filter((completion) => completion != null);

		return foldingRanges;
	}

	async getDefinitions(
		textDocument: TextDocumentIdentifier,
		position: Position
	): Promise<DefinitionLink[] | Location[]> {
		const document = this.getDocument(textDocument.uri);

		const definitions = flatten(
			await this.execute<DefinitionLink[]>('getDefinitions', [document, position], ExecuteMode.Collect)
		);

		return definitions;
	}

	async getDocumentColors(textDocument: TextDocumentIdentifier): Promise<ColorInformation[]> {
		const document = this.getDocument(textDocument.uri);

		return flatten(await this.execute<ColorInformation[]>('getDocumentColors', [document], ExecuteMode.Collect));
	}

	async getColorPresentations(
		textDocument: TextDocumentIdentifier,
		range: Range,
		color: Color
	): Promise<ColorPresentation[]> {
		const document = this.getDocument(textDocument.uri);

		return flatten(
			await this.execute<ColorPresentation[]>('getColorPresentations', [document, range, color], ExecuteMode.Collect)
		);
	}

	async getSignatureHelp(
		textDocument: TextDocumentIdentifier,
		position: Position,
		context: SignatureHelpContext | undefined,
		cancellationToken: CancellationToken
	): Promise<SignatureHelp | null> {
		const document = this.getDocument(textDocument.uri);
		if (!document) {
			throw new Error('Cannot call methods on an unopened document');
		}

		return await this.execute<any>(
			'getSignatureHelp',
			[document, position, context, cancellationToken],
			ExecuteMode.FirstNonNull
		);
	}

	onWatchFileChanges(onWatchFileChangesParams: any[]): void {
		for (const support of this.plugins) {
			support.onWatchFileChanges?.(onWatchFileChangesParams);
		}
	}

	updateNonAstroFile(fileName: string, changes: TextDocumentContentChangeEvent[]): void {
		for (const support of this.plugins) {
			support.updateNonAstroFile?.(fileName, changes);
		}
	}

	private getDocument(uri: string) {
		const document = this.docManager.get(uri);
		if (!document) {
			throw new Error('Cannot call methods on an unopened document');
		}
		return document;
	}

	private execute<T>(name: keyof LSProvider, args: any[], mode: ExecuteMode.FirstNonNull): Promise<T | null>;
	private execute<T>(name: keyof LSProvider, args: any[], mode: ExecuteMode.Collect): Promise<T[]>;
	private execute(name: keyof LSProvider, args: any[], mode: ExecuteMode.None): Promise<void>;
	private async execute<T>(name: keyof LSProvider, args: any[], mode: ExecuteMode): Promise<(T | null) | T[] | void> {
		const plugins = this.plugins.filter((plugin) => typeof plugin[name] === 'function');

		switch (mode) {
			case ExecuteMode.FirstNonNull:
				for (const plugin of plugins) {
					const res = await this.tryExecutePlugin(plugin, name, args, null);
					if (res != null) {
						return res;
					}
				}
				return null;
			case ExecuteMode.Collect:
				return Promise.all(
					plugins.map((plugin) => {
						let ret = this.tryExecutePlugin(plugin, name, args, []);
						return ret;
					})
				);
			case ExecuteMode.None:
				await Promise.all(plugins.map((plugin) => this.tryExecutePlugin(plugin, name, args, null)));
				return;
		}
	}

	private async tryExecutePlugin(plugin: any, fnName: string, args: any[], failValue: any) {
		try {
			return await plugin[fnName](...args);
		} catch (e) {
			console.error(e);
			return failValue;
		}
	}
}
