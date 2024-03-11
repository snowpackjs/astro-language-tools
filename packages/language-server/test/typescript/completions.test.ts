import { Position } from '@volar/language-server';
import assert from 'node:assert/strict';
import { after, describe, before, it } from 'node:test';
import { type LanguageServer, getLanguageServer } from '../server.js';

describe('TypeScript - Completions', async () => {
	let languageServer: LanguageServer;

	before(async () => (languageServer = await getLanguageServer()));

	it('Can get completions in the frontmatter', async () => {
		const document = await languageServer.openFakeDocument('---\nc\n---', 'astro');
		const completions = await languageServer.handle.sendCompletionRequest(
			document.uri,
			Position.create(1, 1)
		);

		assert.notEqual(completions?.items, '');
	});

	it('Can get completions in the template', async () => {
		const document = await languageServer.openFakeDocument('{c}', 'astro');
		const completions = await languageServer.handle.sendCompletionRequest(
			document.uri,
			Position.create(0, 1)
		);

		assert.notEqual(completions?.items, '');
	});

	it('sort completions starting with `astro:` higher than other imports', async () => {
		const document = await languageServer.openFakeDocument('<Image', 'astro');
		const completions = await languageServer.handle.sendCompletionRequest(
			document.uri,
			Position.create(0, 6)
		);

		const imageCompletion = completions?.items.find(
			(item) => item.labelDetails?.description === 'astro:assets'
		);

		assert.equal(imageCompletion?.sortText, '\x00￿16');
	});

	it('Can get completions in all kinds of script tags', async () => {
		const documents = [
			'<script>\nconsole.\n</script>',
			'<script type="module">\nconsole.\n</script>',
			'<script is:inline>\nconsole.\n</script>',
		];

		for (const doc of documents) {
			const document = await languageServer.openFakeDocument(doc, 'astro');
			const completions = await languageServer.handle.sendCompletionRequest(
				document.uri,
				Position.create(1, 8)
			);

			const allLabels = completions?.items.map((item) => item.label);
			assert.notEqual(completions?.items, '');
			assert.equal(allLabels.includes('log'), true);
		}
	});
});
