import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { describe, before, it } from 'node:test';
import { AstroCheck, CheckResult } from '../../dist/check.js';

describe('AstroCheck', async () => {
	let checker: AstroCheck;
	let result: CheckResult;

	before(async function (this: any) {
		// First init can sometimes be slow in CI, even though the rest of the tests will be fast.
		this.timeout(50000);
		checker = new AstroCheck(
			path.resolve(__dirname, 'fixture'),
			require.resolve('typescript/lib/typescript.js'),
			undefined
		);
		result = await checker.lint({});
	});

	it('Can check files and return errors', async () => {
		assert.notEqual(result, undefined);
		assert.equal(result.fileResult.length, 4);
	});

	it("Returns the file's URL", async () => {
		assert.notEqual(result.fileResult[0].fileUrl, undefined);
		assert.equal(result.fileResult[0].fileUrl instanceof URL, true);
	});

	it("Returns the file's content", async () => {
		assert.notEqual(result.fileResult[0].fileContent, undefined);
		assert.deepEqual(result.fileResult[0].fileContent, `---${os.EOL}console.log(doesntExist);${os.EOL}---${os.EOL}`);
	});

	it('Can return the total amount of errors, warnings and hints', async () => {
		assert.equal(result.errors, 2);
		assert.equal(result.warnings, 1);
		assert.equal(result.hints, 1);
	});

	it('Can return the total amount of files checked', async () => {
		assert.equal(result.fileChecked, 6);
	});

	it('Can return the status of the check', async () => {
		assert.equal(result.status, 'completed');
	});
});
