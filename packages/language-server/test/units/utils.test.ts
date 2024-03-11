import type { Point } from '@astrojs/compiler/types.js';
import { Range } from '@volar/language-server';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Node } from 'vscode-html-languageservice';
import * as html from 'vscode-html-languageservice';
import { getTSXRangesAsLSPRanges, safeConvertToTSX } from '../../src/core/astro2tsx.js';
import * as compilerUtils from '../../src/core/compilerUtils.js';
import { getAstroMetadata } from '../../src/core/parseAstro.js';
import * as utils from '../../src/plugins/utils.js';

describe('Utilities', async () => {
	it('isTsDocument - properly return if a document is JavaScript', () => {
		assert.equal(utils.isJSDocument('javascript'), true);
		assert.equal(utils.isJSDocument('typescript'), true);
		assert.equal(utils.isJSDocument('javascriptreact'), true);
		assert.equal(utils.isJSDocument('typescriptreact'), true);
	});

	it('isPossibleComponent - properly return if a node is a component', () => {
		const node = {
			tag: 'div',
		} as Node;
		assert.equal(utils.isPossibleComponent(node), false);

		const component = {
			tag: 'MyComponent',
		} as Node;
		assert.equal(utils.isPossibleComponent(component), true);

		const namespacedComponent = {
			tag: 'components.MyOtherComponent',
		} as Node;
		assert.equal(utils.isPossibleComponent(namespacedComponent), true);
	});

	it('isInComponentStartTag - properly return if a given offset is inside the start tag of a component', () => {
		const htmlLs = html.getLanguageService();
		const htmlContent = `<div><Component astr></Component></div>`;
		const htmlDoc = htmlLs.parseHTMLDocument({ getText: () => htmlContent } as any);

		assert.equal(utils.isInComponentStartTag(htmlDoc, 3), false);
		assert.equal(utils.isInComponentStartTag(htmlDoc, 16), true);
	});

	it('isInsideExpression - properly return if a given position is inside a JSX expression', () => {
		const template = `<div>{expression}</div>`;
		assert.equal(utils.isInsideExpression(template, 0, 0), false);
		assert.equal(utils.isInsideExpression(template, 0, 6), true);
	});

	it('isInsideFrontmatter - properly return if a given offset is inside the frontmatter', () => {
		const hasFrontmatter = getAstroMetadata('file.astro', '---\nfoo\n---\n');
		assert.equal(utils.isInsideFrontmatter(0, hasFrontmatter.frontmatter), false);
		assert.equal(utils.isInsideFrontmatter(6, hasFrontmatter.frontmatter), true);
		assert.equal(utils.isInsideFrontmatter(15, hasFrontmatter.frontmatter), false);
		const noFrontmatter = getAstroMetadata('file.astro', '<div></div>');
		assert.equal(utils.isInsideFrontmatter(0, noFrontmatter.frontmatter), false);
		assert.equal(utils.isInsideFrontmatter(6, noFrontmatter.frontmatter), false);
		const openFrontmatter = getAstroMetadata('file.astro', '---\nfoo\n');
		assert.equal(utils.isInsideFrontmatter(0, openFrontmatter.frontmatter), false);
		assert.equal(utils.isInsideFrontmatter(6, openFrontmatter.frontmatter), true);
	});

	it('PointToPosition - properly transform a Point from the Astro compiler to an LSP Position', () => {
		const point: Point = {
			line: 1,
			column: 2,
			offset: 3,
		};
		assert.deepEqual(compilerUtils.PointToPosition(point), {
			line: 0,
			character: 1,
		});
	});

	it('ensureRangeIsInFrontmatter - properly return a range inside the frontmatter', () => {
		const beforeFrontmatterRange = html.Range.create(0, 0, 0, 0);
		const input = '---\nfoo\n---\n';
		const tsx = safeConvertToTSX(input, { filename: 'file.astro' });
		const tsxRanges = getTSXRangesAsLSPRanges(tsx);
		const astroMetadata = { tsxRanges, ...getAstroMetadata('file.astro', input) };

		assert.deepEqual(utils.ensureRangeIsInFrontmatter(beforeFrontmatterRange, astroMetadata), Range.create(2, 0, 2, 0));

		const insideFrontmatterRange = html.Range.create(1, 0, 1, 0);
		assert.deepEqual(utils.ensureRangeIsInFrontmatter(insideFrontmatterRange, astroMetadata), Range.create(2, 0, 2, 0));
		const outsideFrontmatterRange = html.Range.create(6, 0, 6, 0);
		assert.deepEqual(utils.ensureRangeIsInFrontmatter(outsideFrontmatterRange, astroMetadata), Range.create(2, 0, 2, 0));
	});

	it('getNewFrontmatterEdit - properly return a new frontmatter edit', () => {
		const input = '<div></div>';
		const tsx = safeConvertToTSX(input, { filename: 'file.astro' });
		const tsxRanges = getTSXRangesAsLSPRanges(tsx);
		const astroMetadata = { tsxRanges, ...getAstroMetadata('file.astro', input) };
		const edit = utils.getNewFrontmatterEdit(
			{ range: Range.create(43, 0, 44, 0), newText: 'foo' },
			astroMetadata,
			'\n'
		);
		assert.deepEqual(edit, {
			range: Range.create(2, 0, 2, 0),
			newText: '---\nfoo---\n\n',
		});
	});

	it('getOpenFrontmatterEdit - properly return an open frontmatter edit', () => {
		const input = '<div></div>';
		const tsx = safeConvertToTSX(input, { filename: 'file.astro' });
		const tsxRanges = getTSXRangesAsLSPRanges(tsx);
		const astroMetadata = { tsxRanges, ...getAstroMetadata('file.astro', input) };
		const edit = utils.getOpenFrontmatterEdit(
			{ range: Range.create(2, 0, 2, 0), newText: 'foo' },
			astroMetadata,
			'\n'
		);

		assert.deepEqual(edit, {
			range: Range.create(2, 0, 2, 0),
			newText: '\nfoo---',
		});
	});
});
