import * as kit from '@volar/kit';
import { Diagnostic, DiagnosticSeverity } from '@volar/language-server';
import fg from 'fast-glob';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { getLanguageModule } from './core/index.js';
import { getSvelteLanguageModule } from './core/svelte.js';
import { getVueLanguageModule } from './core/vue.js';
import { getAstroInstall } from './utils.js';

import { create as createAstroService } from './plugins/astro.js';
import { create as createTypeScriptService } from './plugins/typescript/index.js';

// Export those for downstream consumers
export { Diagnostic, DiagnosticSeverity };

export interface CheckResult {
	status: 'completed' | 'cancelled' | undefined;
	fileChecked: number;
	errors: number;
	warnings: number;
	hints: number;
	fileResult: {
		errors: kit.Diagnostic[];
		fileUrl: URL;
		fileContent: string;
		text: string;
	}[];
}

export class AstroCheck {
	private ts!: typeof import('typescript/lib/tsserverlibrary.js');
	public linter!: ReturnType<(typeof kit)['createTypeScriptChecker']>;

	constructor(
		private readonly workspacePath: string,
		private readonly typescriptPath: string | undefined,
		private readonly tsconfigPath: string | undefined
	) {
		this.initialize();
	}

	/**
	 * Lint a list of files or the entire project and optionally log the errors found
	 * @param fileNames List of files to lint, if undefined, all files included in the project will be linted
	 * @param logErrors Whether to log errors by itself. This is disabled by default.
	 * @return {CheckResult} The result of the lint, including a list of errors, the file's content and its file path.
	 */
	public async lint({
		fileNames = undefined,
		cancel = () => false,
		logErrors = undefined,
	}: {
		fileNames?: string[] | undefined;
		cancel?: () => boolean;
		logErrors?:
			| {
					level: 'error' | 'warning' | 'hint';
			  }
			| undefined;
	}): Promise<CheckResult> {
		const files =
			fileNames !== undefined ? fileNames : this.linter.languageHost.getScriptFileNames();

		const result: CheckResult = {
			status: undefined,
			fileChecked: 0,
			errors: 0,
			warnings: 0,
			hints: 0,
			fileResult: [],
		};
		for (const file of files) {
			if (cancel()) {
				result.status = 'cancelled';
				return result;
			}
			const fileDiagnostics = await this.linter.check(file);

			// Filter diagnostics based on the logErrors level
			const fileDiagnosticsToPrint = fileDiagnostics.filter((diag) => {
				const severity = diag.severity ?? DiagnosticSeverity.Error;
				switch (logErrors?.level ?? 'hint') {
					case 'error':
						return severity <= DiagnosticSeverity.Error;
					case 'warning':
						return severity <= DiagnosticSeverity.Warning;
					case 'hint':
						return severity <= DiagnosticSeverity.Hint;
				}
			});

			if (fileDiagnostics.length > 0) {
				const errorText = this.linter.printErrors(file, fileDiagnosticsToPrint);

				if (logErrors !== undefined && errorText) {
					console.info(errorText);
				}

				const fileSnapshot = this.linter.languageHost.getScriptSnapshot(file);
				const fileContent = fileSnapshot?.getText(0, fileSnapshot.getLength());

				result.fileResult.push({
					errors: fileDiagnostics,
					fileContent: fileContent ?? '',
					fileUrl: pathToFileURL(file),
					text: errorText,
				});

				result.errors += fileDiagnostics.filter(
					(diag) => diag.severity === DiagnosticSeverity.Error
				).length;
				result.warnings += fileDiagnostics.filter(
					(diag) => diag.severity === DiagnosticSeverity.Warning
				).length;
				result.hints += fileDiagnostics.filter(
					(diag) => diag.severity === DiagnosticSeverity.Hint
				).length;
			}

			result.fileChecked += 1;
		}

		result.status = 'completed';
		return result;
	}

	private initialize() {
		this.ts = this.typescriptPath ? require(this.typescriptPath) : require('typescript');
		const tsconfigPath = this.getTsconfig();

		const astroInstall = getAstroInstall([this.workspacePath]);
		const languages = [
			getLanguageModule(typeof astroInstall === 'string' ? undefined : astroInstall, this.ts),
			getSvelteLanguageModule(),
			getVueLanguageModule(),
		];
		const services = [createTypeScriptService(this.ts), createAstroService(this.ts)];

		if (tsconfigPath) {
			this.linter = kit.createTypeScriptChecker(languages, services, tsconfigPath);
		} else {
			this.linter = kit.createTypeScriptInferredChecker(languages, services, () => {
				return fg.sync('**/*.astro', {
					cwd: this.workspacePath,
					ignore: ['node_modules'],
					absolute: true,
				});
			});
		}
	}

	private getTsconfig() {
		if (this.tsconfigPath) {
			if (!existsSync(this.tsconfigPath)) {
				throw new Error(`Specified tsconfig file \`${this.tsconfigPath}\` does not exist.`);
			}

			return this.tsconfigPath;
		}

		const searchPath = this.workspacePath;

		const tsconfig =
			this.ts.findConfigFile(searchPath, this.ts.sys.fileExists) ||
			this.ts.findConfigFile(searchPath, this.ts.sys.fileExists, 'jsconfig.json');

		return tsconfig;
	}
}
