import type { LanguageServiceManager } from '../LanguageServiceManager';
import ts from 'typescript';
import { Hover, Position } from 'vscode-languageserver';
import { AstroDocument, getFirstNonWhitespaceIndex, mapObjWithRangeToOriginal } from '../../../core/documents';
import { HoverProvider } from '../../interfaces';
import { getMarkdownDocumentation } from '../previewer';
import { convertRange, toVirtualAstroFilePath } from '../utils';
import { AstroSnapshot } from '../snapshots/DocumentSnapshot';

const partsMap = new Map([['JSX attribute', 'HTML attribute']]);

export class HoverProviderImpl implements HoverProvider {
	constructor(private readonly languageServiceManager: LanguageServiceManager) {}

	async doHover(document: AstroDocument, position: Position): Promise<Hover | null> {
		const { lang, tsDoc } = await this.languageServiceManager.getLSAndTSDoc(document);
		const fragment = await tsDoc.createFragment();

		const offset = fragment.offsetAt(fragment.getGeneratedPosition(position));
		const filePath = toVirtualAstroFilePath(tsDoc.filePath);

		const html = document.html;
		const documentOffset = document.offsetAt(position);
		const node = html.findNodeAt(documentOffset);

		let info: ts.QuickInfo | undefined;

		if (node.tag === 'script') {
			const index = document.scriptTags.findIndex((value) => value.container.start == node.start);

			const scriptFilePath = tsDoc.filePath + `/script${index}.ts`;
			const scriptTagSnapshot = (tsDoc as AstroSnapshot).scriptTagSnapshots[index];
			const scriptOffset = scriptTagSnapshot.offsetAt(scriptTagSnapshot.getGeneratedPosition(position));

			info = lang.getQuickInfoAtPosition(scriptFilePath, scriptOffset);

			if (info) {
				info.textSpan.start = fragment.offsetAt(
					scriptTagSnapshot.getOriginalPosition(scriptTagSnapshot.positionAt(info.textSpan.start))
				);
			}
		} else {
			info = lang.getQuickInfoAtPosition(filePath, offset);
		}

		if (!info) {
			return null;
		}

		const textSpan = info.textSpan;

		const displayParts: ts.SymbolDisplayPart[] = (info.displayParts || []).map((value) => ({
			text: partsMap.has(value.text) ? partsMap.get(value.text)! : value.text,
			kind: value.kind,
		}));
		const declaration = ts.displayPartsToString(displayParts);
		const documentation = getMarkdownDocumentation(info.documentation, info.tags);

		// https://microsoft.github.io/language-server-protocol/specification#textDocument_hover
		const contents = ['```typescript', declaration, '```']
			.concat(documentation ? ['---', documentation] : [])
			.join('\n');

		return mapObjWithRangeToOriginal(fragment, {
			range: convertRange(fragment, textSpan),
			contents,
		});
	}
}
