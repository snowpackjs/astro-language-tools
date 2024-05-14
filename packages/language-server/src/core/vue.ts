import {
	type CodeInformation,
	type LanguagePlugin,
	type Mapping,
	type VirtualCode,
	forEachEmbeddedCode,
} from '@volar/language-core';
import type ts from 'typescript';
import { URI } from 'vscode-uri';
import { framework2tsx } from './utils.js';

export function getVueLanguageModule(): LanguagePlugin<VueVirtualCode> {
	return {
		getLanguageId(scriptId) {
			if (scriptId.endsWith('.vue')) {
				return 'vue';
			}
		},
		createVirtualCode(scriptId, languageId, snapshot) {
			if (languageId === 'vue') {
				const fileName = scriptId.includes('://')
					? URI.parse(scriptId).fsPath.replace(/\\/g, '/')
					: scriptId;
				return new VueVirtualCode(fileName, snapshot);
			}
		},
		updateVirtualCode(_scriptId, vueCode, snapshot) {
			vueCode.update(snapshot);
			return vueCode;
		},
		typescript: {
			extraFileExtensions: [{ extension: 'vue', isMixedContent: true, scriptKind: 7 }],
			getServiceScript(vueCode) {
				for (const code of forEachEmbeddedCode(vueCode)) {
					if (code.id === 'tsx') {
						return {
							code,
							extension: '.tsx',
							scriptKind: 4 satisfies ts.ScriptKind.TSX,
						};
					}
				}
			},
		},
	};
}

class VueVirtualCode implements VirtualCode {
	id = 'root';
	languageId = 'vue';
	mappings!: Mapping<CodeInformation>[];
	embeddedCodes!: VirtualCode[];
	codegenStacks = [];

	constructor(
		public fileName: string,
		public snapshot: ts.IScriptSnapshot
	) {
		this.onSnapshotUpdated();
	}

	public update(newSnapshot: ts.IScriptSnapshot) {
		this.snapshot = newSnapshot;
		this.onSnapshotUpdated();
	}

	private onSnapshotUpdated() {
		this.mappings = [];

		this.embeddedCodes = [];
		this.embeddedCodes.push(
			framework2tsx(this.fileName, this.snapshot.getText(0, this.snapshot.getLength()), 'vue')
		);
	}
}
