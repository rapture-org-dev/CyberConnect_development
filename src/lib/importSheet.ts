import Encoding from 'encoding-japanese';
import * as XLSX from 'xlsx';

/** Postgres `text` columns reject NUL (U+0000). Strip from any imported string. */
export function stripTextNuls(s: string): string {
  return s.replace(/\u0000/g, '');
}

/**
 * Decode CSV bytes for import. Tries strict UTF-8 first (Google Sheets, exports with BOM),
 * then Shift_JIS / EUC-JP / ISO-2022-JP — Excel on Japanese Windows often saves CSV as Shift_JIS,
 * which becomes Unicode replacement characters in columns when misread as UTF-8.
 */
export function decodeCsvFileText(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes.length === 0) return '';

  const hasUtf8Bom =
    bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const utf8Payload = hasUtf8Bom ? bytes.subarray(3) : bytes;

  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(utf8Payload);
    return stripBom(text);
  } catch {
    /* not valid UTF-8 */
  }

  const detected = Encoding.detect(bytes);
  const order: Array<'SJIS' | 'EUCJP' | 'JIS'> =
    detected === 'SJIS' || detected === 'EUCJP' || detected === 'JIS'
      ? [detected, ...(['SJIS', 'EUCJP', 'JIS'] as const).filter((e) => e !== detected)]
      : ['SJIS', 'EUCJP', 'JIS'];

  let best: string | null = null;
  let bestRepl = Infinity;
  for (const from of order) {
    const s = Encoding.convert(bytes, { to: 'UNICODE', from, type: 'string' });
    const repl = (s.match(/\uFFFD/g) || []).length;
    if (repl < bestRepl) {
      bestRepl = repl;
      best = s;
      if (repl === 0) break;
    }
  }

  if (best != null) {
    return stripBom(best);
  }

  return stripBom(new TextDecoder('utf-8', { fatal: false }).decode(bytes));
}

function stripBom(s: string): string {
  return s.replace(/^\ufeff/, '');
}

/**
 * Parse an XLSX worksheet into header names and row objects without losing columns.
 * Default `sheet_to_json` drops duplicate header keys (same Excel column name twice)
 * and can mis-handle sparse trailing columns — both break batch import mapping.
 */
export function parseWorksheetForImport(worksheet: XLSX.WorkSheet): {
  columns: string[];
  rows: Record<string, unknown>[];
} {
  const aoa = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    raw: false,
    defval: '',
  }) as unknown[][];

  if (!aoa.length) {
    return { columns: [], rows: [] };
  }

  const widths = aoa.map((r) => (Array.isArray(r) ? r.length : 0));
  const width = Math.max(0, ...widths);
  if (width === 0) {
    return { columns: [], rows: [] };
  }

  const headerCells = padRow(aoa[0] ?? [], width);
  const uniqueHeaders = makeUniqueHeaders(headerCells);

  const rows: Record<string, unknown>[] = [];
  for (let r = 1; r < aoa.length; r++) {
    const raw = aoa[r];
    if (!Array.isArray(raw) && raw === undefined) continue;
    const cells = padRow(Array.isArray(raw) ? raw : [], width);
    const isEmpty = cells.every((c) => normalizeCell(c) === '');
    if (isEmpty) continue;

    const row: Record<string, unknown> = {};
    for (let c = 0; c < width; c++) {
      row[uniqueHeaders[c]] = normalizeImportedCell(cells[c]);
    }
    rows.push(row);
  }

  return { columns: uniqueHeaders, rows };
}

function padRow(row: unknown[], width: number): unknown[] {
  const out: unknown[] = [];
  for (let i = 0; i < width; i++) {
    out.push(i < row.length ? row[i] : '');
  }
  return out;
}

function normalizeCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  return stripTextNuls(String(v)).trim();
}

/**
 * When UTF-8 bytes were interpreted as Latin-1/Windows-1252, recover by re-reading code units as bytes.
 * Must NOT run on strings that are already correct Unicode: BMP Japanese uses code points > 255 (e.g. の),
 * and taking only the low byte per unit corrupts text ("UI/UXの改善" → "UI/UXn9�").
 */
export function recoverUtf8MisreadAsLatin1(s: string): string {
  const t = s.trim();
  if (!t) return t;
  if (!/[\u0080-\uFFFF]/.test(t)) return t;

  // Already real Hiragana/Katakana/Kanji/Hangul — not Latin-1-per-byte mojibake.
  if (/\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Han}|\p{Script=Hangul}/u.test(t)) {
    return t;
  }

  try {
    const bytes = new Uint8Array(t.length);
    for (let i = 0; i < t.length; i++) bytes[i] = t.charCodeAt(i) & 0xff;
    const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    const origRepl = (t.match(/\uFFFD/g) || []).length;
    const decRepl = (decoded.match(/\uFFFD/g) || []).length;
    if (decRepl > origRepl) return t;

    if (/[\u3040-\u30ff\u4e00-\u9fff\u3000-\u303f]/.test(decoded) || /修正|完了|確認/.test(decoded)) {
      return decoded.trim();
    }
    if (decoded && decoded !== t && !/\uFFFD{2,}/.test(decoded)) return decoded.trim();
  } catch {
    /* ignore */
  }
  return t;
}

function normalizeImportedCell(v: unknown): unknown {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return stripTextNuls(recoverUtf8MisreadAsLatin1(v));
  return v;
}

function makeUniqueHeaders(headerCells: unknown[]): string[] {
  const counts = new Map<string, number>();
  return headerCells.map((cell, i) => {
    let base = normalizeCell(cell);
    base = i === 0 ? stripBom(base) : base;
    if (!base) base = `Column ${i + 1}`;
    const n = (counts.get(base) ?? 0) + 1;
    counts.set(base, n);
    return n === 1 ? base : `${base} (${n})`;
  });
}
