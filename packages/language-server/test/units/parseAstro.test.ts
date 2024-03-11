import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getAstroMetadata } from '../../src/core/parseAstro.js';
import { createCompilerPoint, createCompilerPosition } from '../utils.js';

describe('parseAstro - Can parse astro files', () => {
	it('Can parse files', () => {
		const input = `---\n--- <div>Astro!</div>`;
		const metadata = getAstroMetadata('file.astro', input);

		assert.deepEqual(metadata.ast, {
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
		assert.deepEqual(metadata.frontmatter, {
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
		assert.deepEqual(metadata.diagnostics, []);
	});

	it('properly return frontmatter states', () => {
		const inputClosed = `---\n--- <div>Astro!</div>`;
		assert.equal(getAstroMetadata('file.astro', inputClosed).frontmatter.status, 'closed');

		const inputOpen = `---\n<div>Astro!</div>`;
		assert.equal(getAstroMetadata('file.astro', inputOpen).frontmatter.status, 'open');

		const inputNull = `<div>Astro!</div>`;
		assert.equal(getAstroMetadata('file.astro', inputNull).frontmatter.status, 'doesnt-exist');
	});
});
