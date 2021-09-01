import * as ts from 'typescript';
import { readFileSync } from 'fs';
import { TextDocumentContentChangeEvent, Position } from 'vscode-languageserver';
import { Document, DocumentMapper, IdentityMapper } from '../../core/documents';
import { isInTag, positionAt, offsetAt } from '../../core/documents/utils';
import { pathToUrl } from '../../utils';
import { getScriptKindFromFileName, isAstroFilePath, toVirtualAstroFilePath } from './utils';

const ASTRO_DEFINITION = readFileSync(require.resolve('../../../astro.d.ts'));

/**
 * The mapper to get from original snapshot positions to generated and vice versa.
 */
export interface SnapshotFragment extends DocumentMapper {
  positionAt(offset: number): Position;
  offsetAt(position: Position): number;
}

export interface DocumentSnapshot extends ts.IScriptSnapshot {
  version: number;
  filePath: string;
  scriptKind: ts.ScriptKind;
  positionAt(offset: number): Position;
  /**
   * Instantiates a source mapper.
   * `destroyFragment` needs to be called when
   * it's no longer needed / the class should be cleaned up
   * in order to prevent memory leaks.
   */
  getFragment(): Promise<DocumentFragmentSnapshot>;
  /**
   * Needs to be called when source mapper
   * is no longer needed / the class should be cleaned up
   * in order to prevent memory leaks.
   */
  destroyFragment(): void;
  /**
   * Convenience function for getText(0, getLength())
   */
  getFullText(): string;
}

export const createDocumentSnapshot = (filePath: string, currentText: string | null, createDocument?: (_filePath: string, text: string) => Document): DocumentSnapshot => {
  const text = currentText || (ts.sys.readFile(filePath) ?? '');

  if (isAstroFilePath(filePath)) {
    if (!createDocument) throw new Error('Astro documents require the "createDocument" utility to be provided');
    const snapshot = new AstroDocumentSnapshot(createDocument(filePath, text));
    return snapshot;
  }

  return new TypeScriptDocumentSnapshot(0, filePath, text);
};

class AstroDocumentSnapshot implements DocumentSnapshot {
  version = this.doc.version;
  scriptKind = ts.ScriptKind.Unknown;

  constructor(private doc: Document) {}

  async getFragment(): Promise<DocumentFragmentSnapshot> {
    const uri = pathToUrl(this.filePath);
    const mapper = await this.getMapper(uri);
    return new DocumentFragmentSnapshot(mapper, this.doc);
  }

  async destroyFragment() {
    return;
  }

  get text() {
    let raw = this.doc.getText();
    return this.transformContent(raw);
  }

  /** @internal */
  private transformContent(content: string) {
    let raw = content.replace(/---/g, '///');
    return (
      raw +
      // Add TypeScript definitions
      this.addProps(raw, ASTRO_DEFINITION.toString('utf-8'))
    );
  }

  private addProps(content: string, dtsContent: string): string {
    let defaultExportType = 'Record<string, any>';
    // Using TypeScript to parse here would cause a double-parse, slowing down the extension
    // This needs to be done a different way when the new compiler is added.
    if(/(interface|type) Props/.test(content)) {
      defaultExportType = 'Props';
    }
    return dtsContent + '\n' + `export default function (props: ${defaultExportType}): string;`
  }

  get filePath() {
    return this.doc.getFilePath() || '';
  }

  getText(start: number, end: number) {
    return this.text.substring(start, end);
  }

  getLength() {
    return this.text.length;
  }

  getFullText() {
    return this.text;
  }

  getChangeRange() {
    return undefined;
  }

  positionAt(offset: number) {
    return positionAt(offset, this.text);
  }

  getLineContainingOffset(offset: number) {
    const chunks = this.getText(0, offset).split('\n');
    return chunks[chunks.length - 1];
  }

  offsetAt(position: Position) {
    return offsetAt(position, this.text);
  }

  private getMapper(uri: string) {
    return new IdentityMapper(uri);
  }
}

export class DocumentFragmentSnapshot implements Omit<DocumentSnapshot, 'getFragment' | 'destroyFragment'>, SnapshotFragment {
  version: number;
  filePath: string;
  url: string;
  text: string;

  scriptKind = ts.ScriptKind.TSX;
  scriptInfo = null;

  constructor(private mapper: any, private parent: Document) {
    const filePath = parent.getFilePath();
    if (!filePath) throw new Error('Cannot create a document fragment from a non-local document');
    const text = parent.getText();
    this.version = parent.version;
    this.filePath = toVirtualAstroFilePath(filePath);
    this.url = toVirtualAstroFilePath(filePath);
    this.text = this.transformContent(text);
  }

  /** @internal */
  private transformContent(content: string) {
    return (
      content.replace(/---/g, '///') +
      // Add TypeScript definitions
      ASTRO_DEFINITION
    );
  }

  getText(start: number, end: number) {
    return this.text.substring(start, end);
  }

  getLength() {
    return this.text.length;
  }

  getFullText() {
    return this.text;
  }

  getChangeRange() {
    return undefined;
  }

  positionAt(offset: number) {
    return positionAt(offset, this.text);
  }

  getLineContainingOffset(offset: number) {
    const chunks = this.getText(0, offset).split('\n');
    return chunks[chunks.length - 1];
  }

  offsetAt(position: Position): number {
    return offsetAt(position, this.text);
  }

  getOriginalPosition(pos: Position): Position {
    return this.mapper.getOriginalPosition(pos);
  }

  getGeneratedPosition(pos: Position): Position {
    return this.mapper.getGeneratedPosition(pos);
  }

  isInGenerated(pos: Position): boolean {
    return !isInTag(pos, this.parent.styleInfo);
  }

  getURL(): string {
    return this.url;
  }
}

export class TypeScriptDocumentSnapshot implements DocumentSnapshot {
  scriptKind = getScriptKindFromFileName(this.filePath);
  scriptInfo = null;
  url: string;

  constructor(public version: number, public readonly filePath: string, private text: string) {
    this.url = pathToUrl(filePath);
  }

  getText(start: number, end: number) {
    return this.text.substring(start, end);
  }

  getLength() {
    return this.text.length;
  }

  getFullText() {
    return this.text;
  }

  getChangeRange() {
    return undefined;
  }

  positionAt(offset: number) {
    return positionAt(offset, this.text);
  }

  offsetAt(position: Position): number {
    return offsetAt(position, this.text);
  }

  async getFragment(): Promise<DocumentFragmentSnapshot> {
    return this as unknown as any;
  }

  getOriginalPosition(pos: Position): Position {
    return pos;
  }

  destroyFragment() {
    // nothing to clean up
  }

  getLineContainingOffset(offset: number) {
    const chunks = this.getText(0, offset).split('\n');
    return chunks[chunks.length - 1];
  }

  update(changes: TextDocumentContentChangeEvent[]): void {
    for (const change of changes) {
      let start = 0;
      let end = 0;
      if ('range' in change) {
        start = this.offsetAt(change.range.start);
        end = this.offsetAt(change.range.end);
      } else {
        end = this.getLength();
      }

      this.text = this.text.slice(0, start) + change.text + this.text.slice(end);
    }

    this.version++;
  }
}
