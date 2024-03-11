import { Position } from '@volar/language-server';
import assert from 'node:assert/strict';
import { describe, before, it } from 'node:test';
import { LanguageServer, getLanguageServer } from '../server.js';

describe('CSS - Hover', () => {
	let languageServer: LanguageServer;

	before(async () => {
		languageServer = await getLanguageServer();
	});

	it('Can get hover in style tags', async () => {
		const document = await languageServer.openFakeDocument(
			'<style>\nh1 {\ncolor: red;\n}\n</style>',
			'astro'
		);
		const hover = await languageServer.handle.sendHoverRequest(document.uri, Position.create(2, 7));

		assert.notEqual(hover?.contents, '');
	});
});
