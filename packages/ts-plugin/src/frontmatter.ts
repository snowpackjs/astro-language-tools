import { yaml2ts } from '@astrojs/yaml2ts';
import {
	type CodeMapping,
	type LanguagePlugin,
	type VirtualCode,
	forEachEmbeddedCode,
} from '@volar/language-core';
import { pathToFileURL } from 'node:url';
import type ts from 'typescript';

const SUPPORTED_FRONTMATTER_EXTENSIONS = { md: 'markdown', mdx: 'mdx', mdoc: 'mdoc' };
const SUPPORTED_FRONTMATTER_EXTENSIONS_KEYS = Object.keys(SUPPORTED_FRONTMATTER_EXTENSIONS);
const SUPPORTED_FRONTMATTER_EXTENSIONS_VALUES = Object.values(SUPPORTED_FRONTMATTER_EXTENSIONS);

export const frontmatterRE = /^---(.*?)^---/ms;

export type CollectionConfig = {
	folder: string;
	config: {
		collections: {
			hasSchema: boolean;
			name: string;
		}[];
		entries: Record<string, string>;
	};
};

function getCollectionName(collectionConfigs: CollectionConfig[], fsPath: string) {
	for (const collection of collectionConfigs) {
		if (collection.config.entries[fsPath]) {
			return collection.config.entries[fsPath];
		}
	}
}

export function getFrontmatterLanguagePlugin(
	collectionConfigs: CollectionConfig[],
): LanguagePlugin<string, FrontmatterHolder> {
	return {
		getLanguageId(scriptId) {
			const fileType = SUPPORTED_FRONTMATTER_EXTENSIONS_KEYS.find((ext) =>
				scriptId.endsWith(`.${ext}`),
			);

			if (fileType) {
				return SUPPORTED_FRONTMATTER_EXTENSIONS[
					fileType as keyof typeof SUPPORTED_FRONTMATTER_EXTENSIONS
				];
			}
		},
		createVirtualCode(scriptId, languageId, snapshot) {
			if (SUPPORTED_FRONTMATTER_EXTENSIONS_VALUES.includes(languageId)) {
				const fileName = scriptId.replace(/\\/g, '/');
				return new FrontmatterHolder(
					fileName,
					languageId,
					snapshot,
					getCollectionName(collectionConfigs, pathToFileURL(fileName).toString().toLowerCase()),
				);
			}
		},
		typescript: {
			extraFileExtensions: SUPPORTED_FRONTMATTER_EXTENSIONS_KEYS.map((ext) => ({
				extension: ext,
				isMixedContent: true,
				scriptKind: 7,
			})),
			getServiceScript(astroCode) {
				for (const code of forEachEmbeddedCode(astroCode)) {
					if (code.id === 'frontmatter-ts') {
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

export class FrontmatterHolder implements VirtualCode {
	id = 'frontmatter-holder';
	mappings!: CodeMapping[];
	embeddedCodes!: VirtualCode[];

	constructor(
		public fileName: string,
		public languageId: string,
		public snapshot: ts.IScriptSnapshot,
		public collection: string | undefined,
	) {
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

		if (!this.collection) return;

		const frontmatterContent = frontmatterRE.exec(
			this.snapshot.getText(0, this.snapshot.getLength()),
		)?.[0];

		if (!frontmatterContent) return;

		const yaml2tsResult = yaml2ts(frontmatterContent, this.collection);
		this.embeddedCodes.push(yaml2tsResult.virtualCode);
	}
}
