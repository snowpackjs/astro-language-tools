import { Position, Range } from 'vscode-languageserver';
import { HTMLDocument, Node } from 'vscode-html-languageservice';
import { clamp, isInRange } from '../../utils';
import { parseHtml } from './parseHtml';

export interface TagInformation {
	content: string;
	attributes: Record<string, string>;
	start: number;
	end: number;
	startPos: Position;
	endPos: Position;
	container: { start: number; end: number };
	closed: boolean;
}

export function* walk(node: Node): Generator<Node, void, unknown> {
	for (let child of node.children) {
		yield* walk(child);
	}
	yield node;
}

/**
 * Extracts a tag (style or script) from the given text
 * and returns its start, end and the attributes on that tag.
 *
 * @param source text content to extract tag from
 * @param tag the tag to extract
 */
function extractTags(text: string, tag: 'script' | 'style' | 'template', html?: HTMLDocument): TagInformation[] {
	const rootNodes = html?.roots || parseHtml(text).roots;
	const matchedNodes = rootNodes.filter((node) => node.tag === tag);

	if (tag === 'style' && !matchedNodes.length && rootNodes.length) {
		for (let child of walk(rootNodes[0])) {
			if (child.tag === 'style') {
				matchedNodes.push(child);
			}
		}
	}

	return matchedNodes.map(transformToTagInfo);

	function transformToTagInfo(matchedNode: Node) {
		const start = matchedNode.startTagEnd ?? matchedNode.start;
		const end = matchedNode.endTagStart ?? matchedNode.end;
		const startPos = positionAt(start, text);
		const endPos = positionAt(end, text);
		const container = {
			start: matchedNode.start,
			end: matchedNode.end,
		};
		const content = text.substring(start, end);

		return {
			content,
			attributes: parseAttributes(matchedNode.attributes),
			start,
			end,
			startPos,
			endPos,
			container,
			// vscode-html-languageservice types does not contain this, despite it existing. Annoying
			closed: (matchedNode as any).closed,
		};
	}
}

export function extractStyleTags(source: string, html?: HTMLDocument): TagInformation[] {
	const styles = extractTags(source, 'style', html);

	if (!styles.length) {
		return [];
	}

	return styles;
}

function parseAttributes(rawAttrs: Record<string, string | null> | undefined): Record<string, string> {
	const attrs: Record<string, string> = {};
	if (!rawAttrs) {
		return attrs;
	}

	Object.keys(rawAttrs).forEach((attrName) => {
		const attrValue = rawAttrs[attrName];
		attrs[attrName] = attrValue === null ? attrName : removeOuterQuotes(attrValue);
	});
	return attrs;

	function removeOuterQuotes(attrValue: string) {
		if (
			(attrValue.startsWith('"') && attrValue.endsWith('"')) ||
			(attrValue.startsWith("'") && attrValue.endsWith("'"))
		) {
			return attrValue.slice(1, attrValue.length - 1);
		}
		return attrValue;
	}
}

/**
 * Returns the node if offset is inside a HTML start tag
 */
export function getNodeIfIsInHTMLStartTag(html: HTMLDocument, offset: number): Node | undefined {
	const node = html.findNodeAt(offset);
	if (!!node.tag && node.tag[0] === node.tag[0].toLowerCase() && (!node.startTagEnd || offset < node.startTagEnd)) {
		return node;
	}
}

/**
 * Return if a Node is a Component
 */
export function isComponentTag(node: Node) {
	if (!node.tag) {
		return false;
	}
	const firstChar = node.tag[0];
	return /[A-Z]/.test(firstChar);
}

/**
 * Return if a given offset is inside the start tag of a component
 */
export function isInComponentStartTag(html: HTMLDocument, offset: number): boolean {
	const node = html.findNodeAt(offset);
	return isComponentTag(node) && (!node.startTagEnd || offset < node.startTagEnd);
}

/**
 * Return if the current position is in a specific tag
 */
export function isInTag(position: Position, tagInfo: TagInformation | null): tagInfo is TagInformation {
	return !!tagInfo && isInRange(Range.create(tagInfo.startPos, tagInfo.endPos), position);
}

/**
 * Return if a given position is inside a JSX expression
 */
export function isInsideExpression(html: string, tagStart: number, position: number) {
	const charactersInNode = html.substring(tagStart, position);
	return charactersInNode.lastIndexOf('{') > charactersInNode.lastIndexOf('}');
}

/**
 * Returns if a given offset is inside of the document frontmatter
 */
export function isInsideFrontmatter(text: string, offset: number): boolean {
	let start = text.slice(0, offset).trim().split('---').length;
	let end = text.slice(offset).trim().split('---').length;

	return start > 1 && start < 3 && end >= 1;
}

/**
 * Get the line and character based on the offset
 * @param offset The index of the position
 * @param text The text for which the position should be retrived
 * @param lineOffsets number Array with offsets for each line. Computed if not given
 */
export function positionAt(offset: number, text: string, lineOffsets = getLineOffsets(text)): Position {
	offset = clamp(offset, 0, text.length);

	let low = 0;
	let high = lineOffsets.length;
	if (high === 0) {
		return Position.create(0, offset);
	}

	while (low <= high) {
		const mid = Math.floor((low + high) / 2);
		const lineOffset = lineOffsets[mid];

		if (lineOffset === offset) {
			return Position.create(mid, 0);
		} else if (offset > lineOffset) {
			low = mid + 1;
		} else {
			high = mid - 1;
		}
	}

	// low is the least x for which the line offset is larger than the current offset
	// or array.length if no line offset is larger than the current offset
	const line = low - 1;
	return Position.create(line, offset - lineOffsets[line]);
}

/**
 * Get the offset of the line and character position
 * @param position Line and character position
 * @param text The text for which the offset should be retrived
 * @param lineOffsets number Array with offsets for each line. Computed if not given
 */
export function offsetAt(position: Position, text: string, lineOffsets = getLineOffsets(text)): number {
	if (position.line >= lineOffsets.length) {
		return text.length;
	} else if (position.line < 0) {
		return 0;
	}

	const lineOffset = lineOffsets[position.line];
	const nextLineOffset = position.line + 1 < lineOffsets.length ? lineOffsets[position.line + 1] : text.length;

	return clamp(nextLineOffset, lineOffset, lineOffset + position.character);
}

/**
 * Gets word range at position.
 * Delimiter is by default a whitespace, but can be adjusted.
 */
export function getWordRangeAt(
	str: string,
	pos: number,
	delimiterRegex = { left: /\S+$/, right: /\s/ }
): { start: number; end: number } {
	let start = str.slice(0, pos).search(delimiterRegex.left);
	if (start < 0) {
		start = pos;
	}

	let end = str.slice(pos).search(delimiterRegex.right);
	if (end < 0) {
		end = str.length;
	} else {
		end = end + pos;
	}

	return { start, end };
}

export function getLineOffsets(text: string) {
	const lineOffsets = [];
	let isLineStart = true;

	for (let i = 0; i < text.length; i++) {
		if (isLineStart) {
			lineOffsets.push(i);
			isLineStart = false;
		}
		const ch = text.charAt(i);
		isLineStart = ch === '\r' || ch === '\n';
		if (ch === '\r' && i + 1 < text.length && text.charAt(i + 1) === '\n') {
			i++;
		}
	}

	if (isLineStart && text.length > 0) {
		lineOffsets.push(text.length);
	}

	return lineOffsets;
}

/**
 * Gets index of first-non-whitespace character.
 */
export function getFirstNonWhitespaceIndex(str: string): number {
	return str.length - str.trimStart().length;
}
