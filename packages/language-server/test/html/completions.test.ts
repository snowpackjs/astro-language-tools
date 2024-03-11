import { Position } from '@volar/language-server';
import assert from 'node:assert/strict';
import { describe, before, it } from 'node:test';
import { type LanguageServer, getLanguageServer } from '../server.js';

describe('HTML - Completions', () => {
	let languageServer: LanguageServer;

	before(async () => (languageServer = await getLanguageServer()));

	it('Can provide completions for HTML tags', async () => {
		const document = await languageServer.openFakeDocument(`<q`, 'astro');
		const completions = await languageServer.handle.sendCompletionRequest(
			document.uri,
			Position.create(0, 2)
		);

		assert.notEqual(completions!.items, '');
		assert.equal(completions!.items[0].label, 'blockquote');
	});

	it('Can provide completions for HTML attributes', async () => {
		const document = await languageServer.openFakeDocument(`<blockquote c`, 'astro');
		const completions = await languageServer.handle.sendCompletionRequest(
			document.uri,
			Position.create(0, 13)
		);

		assert.notEqual(completions!.items, '');
		assert.equal(completions!.items[0].label, 'cite');
	});
});
