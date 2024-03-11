import { Position } from '@volar/language-server';
import assert from 'node:assert/strict';
import { describe, before, it } from 'node:test';
import { type LanguageServer, getLanguageServer } from '../server.js';

describe('TypeScript Addons - Completions', async () => {
	let languageServer: LanguageServer;

	before(async () => (languageServer = await getLanguageServer()));

	it('Can provide neat snippets', async () => {
		const document = await languageServer.openFakeDocument('---\nprerender\n---', 'astro');
		const completions = await languageServer.handle.sendCompletionRequest(
			document.uri,
			Position.create(1, 10)
		);

		const prerenderCompletions = completions?.items.filter((item) => item.label === 'prerender');
		assert.notEqual(prerenderCompletions, '');
	});
});
