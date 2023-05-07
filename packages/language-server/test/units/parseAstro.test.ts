import { expect } from 'chai';
import { describe, it } from 'mocha';
import { createCompilerPoint, createCompilerPosition } from '../../src/core/compilerUtils.js';
import { getAstroMetadata } from '../../src/core/parseAstro.js';

describe('parseAstro - Can parse astro files', () => {
	it('Can parse files', () => {
		const input = `---\n--- <div>Astro!</div>`;
		const metadata = getAstroMetadata(input);

		expect(metadata.ast).to.deep.equal({
			children: [
				{
					position: createCompilerPosition(
						createCompilerPoint(1, 1, 0),
						createCompilerPoint(2, 4, 7)
					),
					type: 'frontmatter',
					value: '\n',
				},
				{
					attributes: [],
					children: [
						{
							position: createCompilerPosition(
								createCompilerPoint(2, 10, 13),
								createCompilerPoint(2, 16, 19)
							),
							type: 'text',
							value: 'Astro!',
						},
					],
					name: 'div',
					position: createCompilerPosition(
						createCompilerPoint(2, 5, 8),
						createCompilerPoint(2, 22, 25)
					),
					type: 'element',
				},
			],
			type: 'root',
		});
		expect(metadata.frontmatter).to.deep.equal({
			status: 'closed',
			position: {
				start: {
					line: 1,
					offset: 0,
					column: 1,
				},
				end: {
					line: 2,
					column: 4,
					offset: 7,
				},
			},
		});
		expect(metadata.diagnostics).to.deep.equal([]);
	});

	it('properly return frontmatter states', () => {
		const inputClosed = `---\n--- <div>Astro!</div>`;
		expect(getAstroMetadata(inputClosed).frontmatter.status).to.equal('closed');

		const inputOpen = `---\n<div>Astro!</div>`;
		expect(getAstroMetadata(inputOpen).frontmatter.status).to.equal('open');

		const inputNull = `<div>Astro!</div>`;
		expect(getAstroMetadata(inputNull).frontmatter.status).to.equal('doesnt-exist');
	});
});
