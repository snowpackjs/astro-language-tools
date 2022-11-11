import { URI, Utils } from 'vscode-uri';
import { FrameworkExt, getFrameworkFromFilePath, isAstroFilePath, isFrameworkFilePath } from '../utils';
import { AstroSnapshot, TypeScriptDocumentSnapshot } from './DocumentSnapshot';
import { toTSX as svelte2tsx } from '@astrojs/svelte-language-integration';
import { toTSX as vue2tsx } from '@astrojs/vue-language-integration';
import { toPascalCase, urlToPath } from '../../../utils';
import { EncodedSourceMap } from '@jridgewell/trace-mapping';

// Utilities to create Snapshots from different contexts
export function createFromDocument(document: AstroDocument, ts: typeof import('typescript/lib/tsserverlibrary')) {
	const { code, map } = astro2tsx(document.getText(), urlToPath(document.getURL()) || '');

	const sourceMap = JSON.parse(map) as EncodedSourceMap;
	return new AstroSnapshot(document, code, sourceMap, ts.ScriptKind.TSX);
}

/**
 * Returns an Astro or Framework or a ts/js snapshot from a file path, depending on the file contents.
 * @param filePath path to the file
 * @param createDocument function that is used to create a document in case it's an Astro file
 */
export function createFromFilePath(
	filePath: string,
	createDocument: (filePath: string, text: string) => AstroDocument,
	ts: typeof import('typescript/lib/tsserverlibrary')
) {
	if (isAstroFilePath(filePath)) {
		return createFromAstroFilePath(filePath, createDocument, ts);
	} else if (isFrameworkFilePath(filePath)) {
		const framework = getFrameworkFromFilePath(filePath);
		return createFromFrameworkFilePath(filePath, framework, ts);
	} else {
		return createFromTSFilePath(filePath, ts);
	}
}

/**
 * Return a Framework or a TS snapshot from a file path, depending on the file contents
 * Unlike createFromFilePath, this does not support creating an Astro snapshot
 */
export function createFromNonAstroFilePath(
	filePath: string,
	ts: typeof import('typescript/lib/tsserverlibrary'),
	forceText?: string
) {
	if (isFrameworkFilePath(filePath)) {
		const framework = getFrameworkFromFilePath(filePath);
		return createFromFrameworkFilePath(filePath, framework, ts, forceText);
	} else {
		return createFromTSFilePath(filePath, ts, forceText);
	}
}

/**
 * Returns a ts/js snapshot from a file path.
 * @param filePath path to the js/ts file
 * @param options options that apply in case it's a svelte file
 */
export function createFromTSFilePath(
	filePath: string,
	ts: typeof import('typescript/lib/tsserverlibrary'),
	forceText?: string
) {
	const originalText = forceText ?? ts.sys.readFile(filePath) ?? '';
	return new TypeScriptDocumentSnapshot(0, filePath, originalText, getScriptKindFromFileName(filePath, ts), true);
}

/**
 * Returns an Astro snapshot from a file path.
 * @param filePath path to the Astro file
 * @param createDocument function that is used to create a document
 */
export function createFromAstroFilePath(
	filePath: string,
	createDocument: (filePath: string, text: string) => AstroDocument,
	ts: typeof import('typescript/lib/tsserverlibrary')
) {
	const originalText = ts.sys.readFile(filePath) ?? '';
	return createFromDocument(createDocument(filePath, originalText), ts);
}

export function createFromFrameworkFilePath(
	filePath: string,
	framework: FrameworkExt,
	ts: typeof import('typescript/lib/tsserverlibrary'),
	forceText?: string
) {
	const className = classNameFromFilename(filePath);
	const originalText = forceText ?? ts.sys.readFile(filePath) ?? '';
	let code = '';

	if (framework === 'svelte') {
		const svelteIntegration = importSvelteIntegration(filePath);
		if (svelteIntegration) {
			code = svelteIntegration.toTSX(originalText, className);
		}
	} else if (framework === 'vue') {
		const vueIntegration = importVueIntegration(filePath);
		if (vueIntegration) {
			code = vueIntegration.toTSX(originalText, className);
		}
	}

	return new TypeScriptDocumentSnapshot(0, filePath, code, ts.ScriptKind.TSX, false);
}

export function classNameFromFilename(filename: string): string {
	const url = URI.parse(filename);
	const withoutExtensions = Utils.basename(url).slice(0, -Utils.extname(url).length);

	const withoutInvalidCharacters = withoutExtensions
		.split('')
		// Although "-" is invalid, we leave it in, pascal-case-handling will throw it out later
		.filter((char) => /[A-Za-z$_\d-]/.test(char))
		.join('');
	const firstValidCharIdx = withoutInvalidCharacters
		.split('')
		// Although _ and $ are valid first characters for classes, they are invalid first characters
		// for tag names. For a better import autocompletion experience, we therefore throw them out.
		.findIndex((char) => /[A-Za-z]/.test(char));

	const withoutLeadingInvalidCharacters = withoutInvalidCharacters.substr(firstValidCharIdx);
	const inPascalCase = toPascalCase(withoutLeadingInvalidCharacters);
	const finalName = firstValidCharIdx === -1 ? `A${inPascalCase}` : inPascalCase;

	return finalName;
}
