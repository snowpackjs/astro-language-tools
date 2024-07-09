import { Position } from '@volar/language-server';
import { expect } from 'chai';
import { describe } from 'mocha';
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

		expect(completions!.items).to.not.be.empty;
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

		expect(completions!.items).to.not.be.empty;
	});

	it('Can provide completions inside inline styles', async () => {
		const document = await languageServer.openFakeDocument(`<div style="color: ;"></div>`, 'astro');
		const completions = await languageServer.handle.sendCompletionRequest(
			document.uri,
			Position.create(0, 18)
		);

		expect(completions!.items).to.not.be.empty;
		expect(completions?.items.map((i) => i.label)).to.include('aliceblue');
	});

	it('Can provide completions inside inline styles with multi-bytes characters in the file', async () => {
		const document = await languageServer.openFakeDocument(
			`<div>あ</div><div style="color: ;"></div>`,
			'astro'
		);
		const completions = await languageServer.handle.sendCompletionRequest(
			document.uri,
			Position.create(0, 30)
		);

		expect(completions!.items).to.not.be.empty;
		expect(completions?.items.map((i) => i.label)).to.include('aliceblue');
	});
});
