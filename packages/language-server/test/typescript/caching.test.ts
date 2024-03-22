import { readdir } from 'node:fs/promises';
import path from 'node:path';
import {
	FileChangeType,
	type FullDocumentDiagnosticReport,
	type MarkupContent,
} from '@volar/language-server';
import { expect } from 'chai';
import { mkdir, rm, writeFile } from 'fs/promises';
import { URI } from 'vscode-uri';
import { type LanguageServer, getLanguageServer } from '../server.js';

const fixtureDir = path.join(__dirname, '../fixture');

// TODO: Skipping this suite for now, I can't seems to be able to replicate the notifications being sent correctly, not sure if it's a bug in the test or in Volar
describe.skip('TypeScript - Cache invalidation', async () => {
	let languageServer: LanguageServer;

	async function createFile(name: string, contents: string) {
		const filePath = path.join(fixtureDir, 'caching', name);
		const fileURI = URI.file(filePath).toString();
		await writeFile(filePath, '');
		await languageServer.handle.didChangeWatchedFiles([
			{
				uri: fileURI,
				type: FileChangeType.Created,
			},
		]);
		const openedDocument = await languageServer.handle.openTextDocument(filePath, 'astro');
		await languageServer.handle.updateTextDocument(fileURI, [
			{
				newText: contents,
				range: {
					start: { line: 0, character: 0 },
					end: { line: 0, character: 0 },
				},
			},
		]);

		return openedDocument;
	}

	async function removeFile(name: string) {
		const fileURI = URI.file(path.join(fixtureDir, 'caching', name)).toString();
		await rm(path.join(fixtureDir, 'caching', name));
		await languageServer.handle.didChangeWatchedFiles([
			{
				uri: fileURI,
				type: FileChangeType.Deleted,
			},
		]);
	}

	before(async () => {
		languageServer = await getLanguageServer();

		try {
			await mkdir(path.join(fixtureDir, 'caching'));
		} catch (e) {}

		await createFile('toBeDeleted.astro', '');
	});

	it('Can get paths completions for new files', async () => {
		const fileNames = ['PathCompletion.astro', 'PathCompletion2.astro'];

		const document = await languageServer.handle.openTextDocument(
			path.join(fixtureDir, 'cachingTest.astro'),
			'astro'
		);

		// Try two different files, to make sure the cache capture everything
		for (const fileName of fileNames) {
			await createFile(fileName, '');

			const completions = await languageServer.handle.sendCompletionRequest(document.uri, {
				line: 1,
				character: 33,
			});

			const labels = completions?.items.map((i) => i.label);
			expect(labels).to.include(fileName, `Expected ${fileName} to be in the completions`);
		}
	});

	it('Does not get path completions for removed files', async () => {
		const document = await languageServer.handle.openTextDocument(
			path.join(fixtureDir, 'cachingTest.astro'),
			'astro'
		);

		await removeFile('toBeDeleted.astro');

		const directoryContent = await readdir(path.join(fixtureDir, '/caching'));
		expect(directoryContent).to.not.include('toBeDeleted.astro');

		const completions = await languageServer.handle.sendCompletionRequest(document.uri, {
			line: 1,
			character: 33,
		});

		const labels = completions?.items.map((i) => i.label);
		expect(labels).to.not.include(
			'toBeDeleted.astro',
			`Expected toBeDeleted.astro to not be in the completions, since the file was deleted`
		);
	});

	it('Can get auto-imports for new files', async () => {
		const fileNames = ['AutoImport.astro', 'AutoImport2.astro'];

		const document = await languageServer.handle.openTextDocument(
			path.join(fixtureDir, 'cachingTest.astro'),
			'astro'
		);

		// Try two different files, to make sure the cache capture everything
		for (const fileName of fileNames) {
			await createFile(fileName, '');

			const imports = await languageServer.handle.sendCompletionRequest(document.uri, {
				line: 4,
				character: 9,
			});

			const labels = imports?.items.map((i) => i.label);
			const className = fileName.slice(0, -'.astro'.length);
			expect(labels).to.include(className, `Expected ${className} to be in the auto-imports`);
		}
	});

	it('New files have access to context of the project', async () => {
		const existingDocument = await languageServer.handle.openTextDocument(
			path.join(fixtureDir, 'importFromSuperModule.astro'),
			'astro'
		);

		const existingDiagnostics = (await languageServer.handle.sendDocumentDiagnosticRequest(
			existingDocument.uri
		)) as FullDocumentDiagnosticReport;

		expect(existingDiagnostics.items).to.have.length(
			0,
			'Expected no diagnostics, as the file is part of the project'
		);

		const document = await createFile(
			'WillImportFromSuperModule.astro',
			'---\n\nimport { hello } from "im-a-super-module";\n\nhello;\n\n---\n'
		);

		const diagnostics = (await languageServer.handle.sendDocumentDiagnosticRequest(
			document.uri
		)) as FullDocumentDiagnosticReport;

		expect(diagnostics.items).to.have.length(
			0,
			'Expected no diagnostics, as new files should have access to the module declaration in the project like already existing files.'
		);

		const hoverSuperModule = await languageServer.handle.sendHoverRequest(document.uri, {
			line: 1,
			character: 25,
		});

		expect((hoverSuperModule?.contents as MarkupContent).value).to.include(
			'module "im-a-super-module"'
		);
	});

	after(async () => {
		// Delete all the temp files
		await rm(path.join(fixtureDir, 'caching'), { recursive: true });
	});
});
