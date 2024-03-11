import { Range } from '@volar/language-server';
import assert from 'node:assert/strict';
import { describe, before, it } from 'node:test';
import { type LanguageServer, getLanguageServer } from '../server.js';

describe('Formatting', () => {
	let languageServer: LanguageServer;

	before(async () => (languageServer = await getLanguageServer()));

	it('Can format document', async () => {
		const document = await languageServer.openFakeDocument(`---\n\n\n---`, 'astro');
		const formatEdits = await languageServer.handle.sendDocumentFormattingRequest(document.uri, {
			tabSize: 2,
			insertSpaces: true,
		});

		assert.deepEqual(formatEdits, [
			{
				range: Range.create(0, 0, 3, 3),
				newText: '---\n\n---\n',
			},
		]);
	});
});
