import * as vscode from 'vscode-languageserver';
import { TextDocumentIdentifier } from 'vscode-languageserver';
import { ConfigManager } from './core/config/ConfigManager';
import { DocumentManager } from './core/documents/DocumentManager';
import { DiagnosticsManager } from './core/DiagnosticsManager';
import { AstroPlugin } from './plugins/astro/AstroPlugin';
import { CSSPlugin } from './plugins/css/CSSPlugin';
import { HTMLPlugin } from './plugins/html/HTMLPlugin';
import { AppCompletionItem } from './plugins/interfaces';
import { PluginHost } from './plugins/PluginHost';
import { TypeScriptPlugin } from './plugins/typescript/TypeScriptPlugin';
import { debounceThrottle, urlToPath } from './utils';
import { AstroDocument } from './core/documents';

const TagCloseRequest: vscode.RequestType<
	vscode.TextDocumentPositionParams,
	string | null,
	any
> = new vscode.RequestType('html/tag');

// Start the language server
export function startLanguageServer(connection: vscode.Connection) {
	// Create our managers
	const configManager = new ConfigManager();
	const documentManager = new DocumentManager();
	const pluginHost = new PluginHost(documentManager);

	connection.onInitialize((params: vscode.InitializeParams) => {
		const workspaceUris = params.workspaceFolders?.map(folder => folder.uri.toString()) ?? [params.rootUri ?? ''];

		// Register plugins
		pluginHost.registerPlugin(new HTMLPlugin(configManager));
		pluginHost.registerPlugin(new CSSPlugin(configManager));

		// We don't currently support running the TypeScript and Astro plugin in the browser
		if (params.initializationOptions.environment !== 'browser') {
			pluginHost.registerPlugin(new AstroPlugin(configManager));
			pluginHost.registerPlugin(new TypeScriptPlugin(documentManager, configManager, workspaceUris));
		}

		// Update language-server config with what the user supplied to us at launch
		configManager.updateConfig(params.initializationOptions.configuration.astro);
		configManager.updateEmmetConfig(params.initializationOptions.configuration.emmet);

		return {
			capabilities: {
				textDocumentSync: vscode.TextDocumentSyncKind.Incremental,
				completionProvider: {
					resolveProvider: true,
				},
				colorProvider: true,
				hoverProvider: true,
			},
		};
	});

	// On update of the user configuration of the language-server
	connection.onDidChangeConfiguration(({ settings }: vscode.DidChangeConfigurationParams) => {
		configManager.updateConfig(settings.astro);
		configManager.updateEmmetConfig(settings.emmet);
	});

	// Documents
	connection.onDidOpenTextDocument((params: vscode.DidOpenTextDocumentParams) => {
		documentManager.openDocument(params.textDocument);
		documentManager.markAsOpenedInClient(params.textDocument.uri);
	});
	connection.onDidCloseTextDocument((params: vscode.DidCloseTextDocumentParams) =>
		documentManager.closeDocument(params.textDocument.uri)
	);
	connection.onDidChangeTextDocument((params: vscode.DidChangeTextDocumentParams) => {
		documentManager.updateDocument(params.textDocument, params.contentChanges);
	});

	const diagnosticsManager = new DiagnosticsManager(
		connection.sendDiagnostics,
		documentManager,
		pluginHost.getDiagnostics.bind(pluginHost)
	);

	const updateAllDiagnostics = debounceThrottle(() => diagnosticsManager.updateAll(), 1000);

	connection.onDidChangeWatchedFiles(evt => {
		const params = evt.changes
			.map(change => ({
				fileName: urlToPath(change.uri),
				changeType: change.type,
			}))
			.filter(change => !!change.fileName);

		pluginHost.onWatchFileChanges(params);
		updateAllDiagnostics();
	});

	// Features
	connection.onHover((params: vscode.HoverParams) => pluginHost.doHover(params.textDocument, params.position));

	connection.onCompletion((params: vscode.CompletionParams, cancellationToken) => {
		return pluginHost.getCompletions(params.textDocument, params.position, params.context, cancellationToken);
	});
	connection.onCompletionResolve(completionItem => {
		const data = (completionItem as AppCompletionItem).data as TextDocumentIdentifier;

		if (!data) {
			return completionItem;
		}
		return pluginHost.resolveCompletion(data, completionItem);
	});

	connection.onDocumentColor((params: vscode.DocumentColorParams) => pluginHost.getDocumentColors(params.textDocument));
	connection.onColorPresentation((params: vscode.ColorPresentationParams) =>
		pluginHost.getColorPresentations(params.textDocument, params.range, params.color)
	);

	connection.onRequest(TagCloseRequest, (evt: any) => pluginHost.doTagComplete(evt.textDocument, evt.position));

	connection.onDidSaveTextDocument(updateAllDiagnostics);
	connection.onNotification('$/onDidChangeNonAstroFile', async (e: any) => {
		const path = urlToPath(e.uri);
		if (path) {
			pluginHost.updateNonAstroFile(path, e.changes);
		}
		updateAllDiagnostics();
	});

	documentManager.on(
		'documentChange',
		debounceThrottle(async (document: AstroDocument) => diagnosticsManager.update(document), 1000)
	);
	documentManager.on('documentClose', (document: AstroDocument) => diagnosticsManager.removeDiagnostics(document));

	// Taking off 🚀
	connection.onInitialized(() => {
		connection.console.log('Successfully initialized! 🚀');
	});

	connection.listen();
}
