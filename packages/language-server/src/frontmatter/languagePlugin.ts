import {
	type CodeMapping,
	type LanguagePlugin,
	type VirtualCode,
	forEachEmbeddedCode,
} from '@volar/language-core';
import type ts from 'typescript';
import type { URI } from 'vscode-uri';
import YAML, {
	parseDocument,
	isScalar,
	LineCounter,
	YAMLError,
	isPair,
	CST,
	isMap,
	isSeq,
	isCollection,
} from 'yaml';
import type { AstroInstall } from '../utils.js';

const FRONTMATTER_OFFSET = 4;

export function getFrontmatterLanguagePlugin(
	astroInstall: AstroInstall | undefined,
	ts: typeof import('typescript')
): LanguagePlugin<URI, MarkdownVirtualCode> {
	return {
		getLanguageId(scriptId) {
			if (scriptId.path.endsWith('.md')) {
				return 'markdown';
			}
		},
		createVirtualCode(scriptId, languageId, snapshot) {
			if (languageId === 'markdown') {
				const fileName = scriptId.fsPath.replace(/\\/g, '/');
				return new MarkdownVirtualCode(fileName, snapshot);
			}
		},
		updateVirtualCode(scriptId, virtualCode, newSnapshot, ctx) {
			return virtualCode.updateSnapshot(newSnapshot);
		},
		typescript: {
			extraFileExtensions: [{ extension: 'md', isMixedContent: true, scriptKind: 7 }],
			getServiceScript(astroCode) {
				for (const code of forEachEmbeddedCode(astroCode)) {
					if (code.id === 'frontmatter') {
						return {
							code,
							extension: '.ts',
							scriptKind: 3 satisfies ts.ScriptKind.TS,
						};
					}
				}
				return undefined;
			},
		},
	};
}

export class MarkdownVirtualCode implements VirtualCode {
	id: string = 'markdown';
	languageId: string = 'markdown';
	mappings!: CodeMapping[];
	embeddedCodes!: VirtualCode[];

	lastValidContent: {
		source: string;
		generated: string;
		mappings: CodeMapping[];
	} = {
		source: '',
		generated: '',
		mappings: [],
	};

	yamlErrors: YAMLError[] = [];

	constructor(
		public fileName: string,
		public snapshot: ts.IScriptSnapshot
	) {
		this.updateSnapshot(snapshot);
	}

	updateSnapshot(snapshot: ts.IScriptSnapshot) {
		this.mappings = [
			{
				sourceOffsets: [0],
				generatedOffsets: [0],
				lengths: [this.snapshot.getLength()],
				data: {
					verification: true,
					completion: true,
					semantic: true,
					navigation: true,
					structure: true,
					format: true,
				},
			},
		];

		this.embeddedCodes = [];
		this.snapshot = snapshot;

		const frontmatter = this.snapshot.getText(
			FRONTMATTER_OFFSET,
			this.snapshot.getText(0, this.snapshot.getLength()).indexOf('---', 3)
		);
		const frontmatterMappings: CodeMapping[] = [];
		const lineCounter = new LineCounter();
		const frontmatterContent = parseDocument(frontmatter, {
			keepSourceTokens: true,
			lineCounter: lineCounter,
			strict: false,
			logLevel: 'silent',
		});

		let hasLeadingWhitespace = frontmatter.startsWith('\n');
		let hasTrailingWhitespace = frontmatter.endsWith('\n\n');

		let resultText = 'import type { InferInputSchema } from "astro:content";\n\n({\n';
		let parsedContent = '';

		if (hasLeadingWhitespace) {
			parsedContent += '\n';
			frontmatterMappings.push({
				sourceOffsets: [FRONTMATTER_OFFSET],
				generatedOffsets: [resultText.length],
				lengths: [0],
				data: {
					verification: true,
					completion: true,
					semantic: true,
					navigation: true,
					structure: true,
					format: false,
				},
			});
		}

		YAML.visit(frontmatterContent, function (key, value, path) {
			if (isCollection(value)) {
				if (isMap(value)) {
					// Go through all the items in the map
					value.items.forEach((item) => {
						// The items from a map are guaranteed to be pairs
						if (isScalar(item.key)) {
							if (item.value === null) {
								const valueKey = JSON.stringify(item.key.toJS(frontmatterContent));

								frontmatterMappings.push({
									generatedOffsets: [resultText.length + parsedContent.length],
									sourceOffsets: [item.key.range![0] + FRONTMATTER_OFFSET],
									lengths: CST.isScalar(item.key.srcToken)
										? [item.key.srcToken.source.length]
										: [0],
									data: {
										verification: true,
										completion: true,
										semantic: true,
										navigation: true,
										structure: true,
										format: false,
									},
								});

								parsedContent += `${valueKey}\n`;
							}

							// If we have a fully formed pair with a scalar key and a scalar value
							if (isScalar(item.value)) {
								const valueKey = JSON.stringify(item.key.toJS(frontmatterContent));
								const valueValue = JSON.stringify(item.value.toJS(frontmatterContent));

								// Key
								let generatedOffsets = [resultText.length + parsedContent.length];
								let generatedLengths = [valueKey.length];
								let sourceOffsets = [item.key.range![0] + FRONTMATTER_OFFSET];
								let sourceLengths = CST.isScalar(item.key.srcToken)
									? [item.key.srcToken.source.length]
									: [0];

								// Map the value if it's not "null"
								if (valueValue !== 'null') {
									generatedOffsets.push(
										resultText.length + parsedContent.length + valueKey.length + 2
									);
									generatedLengths.push(valueValue.length);

									sourceOffsets.push(item.value.range![0] + FRONTMATTER_OFFSET);

									let sourceLength = CST.isScalar(item.value.srcToken)
										? item.value.srcToken.source.length
										: 0;
									sourceLengths.push(sourceLength);
								}

								frontmatterMappings.push({
									generatedOffsets,
									sourceOffsets,
									lengths: sourceLengths,
									generatedLengths,
									data: {
										verification: true,
										completion: true,
										semantic: true,
										navigation: true,
										structure: true,
										format: false,
									},
								});

								parsedContent += `${valueKey}: ${valueValue},\n`;
							}

							return YAML.visit.REMOVE;
						}
					});

					return YAML.visit.REMOVE;
				}

				if (isSeq(value)) {
					console.log('SEQ', value);
				}
			}

			if (isScalar(value)) {
				const valueValue = JSON.stringify(value.toJS(frontmatterContent));

				frontmatterMappings.push({
					generatedOffsets: [resultText.length + parsedContent.length],
					sourceOffsets: [value.range![0] + FRONTMATTER_OFFSET],
					lengths: [valueValue.length],
					generatedLengths: [valueValue.length],
					data: {
						verification: true,
						completion: true,
						semantic: true,
						navigation: true,
						structure: true,
						format: false,
					},
				});

				parsedContent += `${valueValue},\n`;

				return YAML.visit.REMOVE;
			}
		});

		resultText += parsedContent;

		if (hasTrailingWhitespace) {
			frontmatterMappings.push({
				sourceOffsets: [this.snapshot.getText(0, this.snapshot.getLength()).indexOf('---', 3) - 1],
				generatedOffsets: [resultText.length],
				lengths: [0],
				data: {
					verification: true,
					completion: true,
					semantic: false,
					navigation: true,
					structure: true,
					format: false,
				},
			});

			resultText += '\n';
		}

		frontmatterMappings.push({
			generatedOffsets: [
				resultText.length + '}) '.length,
				resultText.length + '}) '.length + 'satisfies'.length,
			],
			sourceOffsets: [0, this.snapshot.getText(0, this.snapshot.getLength()).indexOf('---', 3) + 3],
			lengths: [0, 0], // We only have diagnostics here, so no need to map the length, just the edges are fine
			data: {
				verification: true,
				completion: false,
				semantic: false,
				navigation: false,
				structure: false,
				format: false,
			},
		});

		resultText += '}) satisfies InferInputSchema<"blog">;\n\n';

		this.embeddedCodes.push({
			id: 'frontmatter',
			languageId: 'typescript',
			snapshot: {
				getText: (start, end) => resultText.substring(start, end),
				getLength: () => resultText.length,
				getChangeRange: () => undefined,
			},
			mappings: frontmatterMappings,
		});

		return this;
	}
}
