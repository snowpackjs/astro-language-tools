import * as path from 'node:path';
import {
	type Diagnostic,
	DiagnosticSeverity,
	FullDocumentDiagnosticReport,
	Range,
} from '@volar/language-server';
import { expect } from 'chai';
import { before, describe, it } from 'mocha';
import { type LanguageServer, getLanguageServer } from '../server.js';

describe('TypeScript - Diagnostics', async () => {
	let languageServer: LanguageServer;

	before(async () => (languageServer = await getLanguageServer()));

	it('Can get diagnostics in the frontmatter', async () => {
		const document = await languageServer.openFakeDocument('---\nNotAThing\n---', 'astro');
		const diagnostics = (await languageServer.handle.sendDocumentDiagnosticRequest(
			document.uri
		)) as FullDocumentDiagnosticReport;

		// We should only have one error here.
		expect(diagnostics.items).length(1);

		// Data here is Volar specific, and is not too relevant to test. We'll throw it out.
		const diagnostic: Diagnostic = { ...diagnostics.items[0], data: {} };

		expect(diagnostic).to.deep.equal({
			code: 2304,
			data: {},
			message: "Cannot find name 'NotAThing'.",
			range: Range.create(1, 0, 1, 9),
			severity: DiagnosticSeverity.Error,
			source: 'ts',
		});
	});

	it('Can get diagnostics in the template', async () => {
		const document = await languageServer.openFakeDocument('---\n\n---\n{nope}', 'astro');
		const diagnostics = (await languageServer.handle.sendDocumentDiagnosticRequest(
			document.uri
		)) as FullDocumentDiagnosticReport;
		expect(diagnostics.items).length(1);

		const diagnostic: Diagnostic = { ...diagnostics.items[0], data: {} };
		expect(diagnostic).to.deep.equal({
			code: 2304,
			data: {},
			message: "Cannot find name 'nope'.",
			range: Range.create(3, 1, 3, 5),
			severity: DiagnosticSeverity.Error,
			source: 'ts',
		});
	});

	it('shows enhanced diagnostics', async () => {
		const document = await languageServer.handle.openTextDocument(
			path.resolve(__dirname, '..', 'fixture', 'enhancedDiagnostics.astro'),
			'astro'
		);
		const diagnostics = (await languageServer.handle.sendDocumentDiagnosticRequest(
			document.uri
		)) as FullDocumentDiagnosticReport;
		expect(diagnostics.items).length(2);

		diagnostics.items = diagnostics.items.map((diag) => ({ ...diag, data: {} }));
		expect(diagnostics.items).to.deep.equal([
			{
				code: 2322,
				data: {},
				message:
					"Type '{ \"client:idle\": true; }' is not assignable to type 'HTMLAttributes'.\n  Property 'client:idle' does not exist on type 'HTMLAttributes'.\n\nClient directives are only available on framework components.",
				range: Range.create(5, 5, 5, 16),
				severity: DiagnosticSeverity.Error,
				source: 'ts',
			},
			{
				code: 2307,
				data: {},
				message:
					"Cannot find module 'astro:content' or its corresponding type declarations.\n\nIf you're using content collections, make sure to run `astro dev`, `astro build` or `astro sync` to first generate the types so you can import from them. If you already ran one of those commands, restarting the language server might be necessary in order for the change to take effect.",
				range: Range.create(1, 31, 1, 46),
				severity: 1,
				source: 'ts',
			},
		]);
	});

	it('can get diagnostics in script tags', async () => {
		const document = await languageServer.openFakeDocument(
			`<script>const something: string = "Hello";something;</script><div><script>console.log(doesnotexist);</script></div>`,
			'astro'
		);
		const diagnostics = (await languageServer.handle.sendDocumentDiagnosticRequest(
			document.uri
		)) as FullDocumentDiagnosticReport;
		expect(diagnostics.items).length(1);
	});
});
