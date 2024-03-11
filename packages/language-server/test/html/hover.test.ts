import { Position } from '@volar/language-server';
import assert from 'node:assert/strict';
import { describe, before, it } from 'node:test';
import { type LanguageServer, getLanguageServer } from '../server.js';

describe('HTML - Hover', () => {
	let languageServer: LanguageServer;

	before(async () => (languageServer = await getLanguageServer()));

	it('Can provide hover for HTML tags', async () => {
		const document = await languageServer.openFakeDocument(`<q`, 'astro');
		const hover = await languageServer.handle.sendHoverRequest(document.uri, Position.create(0, 2));

		assert.notEqual(hover, null);
	});

	it('Can provide hover for HTML attributes', async () => {
		const document = await languageServer.openFakeDocument(`<blockquote c`, 'astro');
		const hover = await languageServer.handle.sendHoverRequest(
			document.uri,
			Position.create(0, 13)
		);

		assert.notEqual(hover, null);
	});
});
