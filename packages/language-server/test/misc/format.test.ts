import { Range } from '@volar/language-server';
import { expect } from 'chai';
import { describe } from 'mocha';
import { getLanguageServer, type LanguageServer } from '../server.js';

describe('Formatting', () => {
	let languageServer: LanguageServer;

	before(async () => (languageServer = await getLanguageServer()));

	it('Can format document', async () => {
		const document = await languageServer.openFakeDocument(`---\n\n\n---`, 'astro');
		const formatEdits = await languageServer.handle.sendDocumentFormattingRequest(document.uri, {
			tabSize: 2,
			insertSpaces: true,
		});

		expect(formatEdits).to.deep.equal([
			{
				range: Range.create(0, 0, 3, 3),
				newText: '---\n\n---\n',
			},
		]);
	});
});
