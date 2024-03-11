import { Position } from '@volar/language-server';
import assert from 'node:assert/strict';
import { describe, before, it } from 'node:test';
import { LanguageServer, getLanguageServer } from '../server.js';

describe('CSS - Completions', () => {
	let languageServer: LanguageServer;

	before(async () => (languageServer = await getLanguageServer()));

	it('Can provide completions for CSS properties', async () => {
		const document = await languageServer.openFakeDocument(`<style>.foo { colo }</style>`, 'astro');
		const completions = await languageServer.handle.sendCompletionRequest(
			document.uri,
			Position.create(0, 18)
		);

		assert.notEqual(completions!.items, '');
	});

	it('Can provide completions for CSS values', async () => {
		const document = await languageServer.openFakeDocument(
			`<style>.foo { color: re }</style>`,
			'astro'
		);
		const completions = await languageServer.handle.sendCompletionRequest(
			document.uri,
			Position.create(0, 21)
		);

		assert.notEqual(completions!.items, '');
	});

	it('Can provide completions inside inline styles', async () => {
		const document = await languageServer.openFakeDocument(`<div style="color: ;"></div>`, 'astro');
		const completions = await languageServer.handle.sendCompletionRequest(
			document.uri,
			Position.create(0, 18)
		);

		assert.notEqual(completions!.items, '');
		assert.equal(completions?.items.map((i) => i.label).includes('aliceblue'), true);
	});
});
