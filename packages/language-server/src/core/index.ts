import type { DiagnosticMessage, ParseResult } from '@astrojs/compiler/types';
import {
	FileCapabilities,
	FileKind,
	FileRangeCapabilities,
	type Language,
	type VirtualFile,
} from '@volar/language-core';
import * as path from 'node:path';
import type ts from 'typescript/lib/tsserverlibrary';
import type { HTMLDocument } from 'vscode-html-languageservice';
import { astro2tsx } from './astro2tsx';
import { FrontmatterStatus, getAstroMetadata } from './parseAstro';
import { extractStylesheets } from './parseCSS';
import { parseHTML } from './parseHTML';
import { extractScriptTags } from './parseJS.js';
import type { AstroInstall } from './utils';

export function getLanguageModule(
	astroInstall: AstroInstall | undefined,
	ts: typeof import('typescript/lib/tsserverlibrary.js')
): Language<AstroFile> {
	return {
		createVirtualFile(fileName, snapshot) {
			if (fileName.endsWith('.astro')) {
				return new AstroFile(fileName, snapshot, ts);
			}
		},
		updateVirtualFile(astroFile, snapshot) {
			astroFile.update(snapshot);
		},
		resolveHost(host) {
			return {
				...host,
				getScriptFileNames() {
					const fileNames = host.getScriptFileNames();
					return [
						...(astroInstall
							? ['./env.d.ts', './astro-jsx.d.ts'].map((filePath) =>
									ts.sys.resolvePath(path.resolve(astroInstall.path, filePath))
							  )
							: []),
						...fileNames,
					];
				},
				getCompilationSettings() {
					const baseCompilationSettings = host.getCompilationSettings();
					return {
						...baseCompilationSettings,
						module: ts.ModuleKind.ESNext ?? 99,
						target: ts.ScriptTarget.ESNext ?? 99,
						jsx: ts.JsxEmit.Preserve ?? 1,
						jsxImportSource: undefined,
						jsxFactory: 'astroHTML',
						resolveJsonModule: true,
						allowJs: true,
						isolatedModules: true,
						moduleResolution:
							baseCompilationSettings.moduleResolution === ts.ModuleResolutionKind.Classic ||
							!baseCompilationSettings.moduleResolution
								? ts.ModuleResolutionKind.Node10
								: baseCompilationSettings.moduleResolution,
					};
				},
			};
		},
	};
}

export class AstroFile implements VirtualFile {
	kind = FileKind.TextFile;
	capabilities = FileCapabilities.full;

	fileName: string;
	mappings!: VirtualFile['mappings'];
	embeddedFiles!: VirtualFile['embeddedFiles'];
	astroMeta!: ParseResult & { frontmatter: FrontmatterStatus };
	compilerDiagnostics!: DiagnosticMessage[];
	htmlDocument!: HTMLDocument;
	codegenStacks = [];

	constructor(
		public sourceFileName: string,
		public snapshot: ts.IScriptSnapshot,
		private readonly ts: typeof import('typescript/lib/tsserverlibrary.js')
	) {
		this.fileName = sourceFileName;
		this.onSnapshotUpdated();
	}

	get hasCompilationErrors(): boolean {
		return this.compilerDiagnostics.filter((diag) => diag.severity === 1).length > 0;
	}

	public update(newSnapshot: ts.IScriptSnapshot) {
		this.snapshot = newSnapshot;
		this.onSnapshotUpdated();
	}

	onSnapshotUpdated() {
		this.mappings = [
			{
				sourceRange: [0, this.snapshot.getLength()],
				generatedRange: [0, this.snapshot.getLength()],
				data: FileRangeCapabilities.full,
			},
		];

		this.astroMeta = getAstroMetadata(this.snapshot.getText(0, this.snapshot.getLength()));

		const { htmlDocument, virtualFile: htmlVirtualFile } = parseHTML(
			this.fileName,
			this.snapshot,
			this.astroMeta.frontmatter.status === 'closed'
				? this.astroMeta.frontmatter.position.end.offset
				: 0
		);
		this.htmlDocument = htmlDocument;

		htmlVirtualFile.embeddedFiles.push(
			...extractStylesheets(this.fileName, this.snapshot, htmlDocument, this.astroMeta.ast),
			...extractScriptTags(this.fileName, this.snapshot, htmlDocument, this.astroMeta.ast)
		);

		this.embeddedFiles = [];
		this.embeddedFiles.push(htmlVirtualFile);

		const tsx = astro2tsx(
			this.snapshot.getText(0, this.snapshot.getLength()),
			this.fileName,
			this.ts,
			htmlDocument
		);

		this.compilerDiagnostics = tsx.diagnostics;
		this.embeddedFiles.push(tsx.virtualFile);
	}
}
