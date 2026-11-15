// 記録 ⇔ 共有URL（共有機能）。`#r=<版>.<中身>`。中身は記録を詰めたバイト列を deflate-raw で圧縮し、
// URL で使える Base64 にしたもの。失敗は例外ではなく戻り値で返す（実装方針5章）。
import { isInstrument, isPullKey } from '../core/keys';
import { loopStartTick, type LoopSettings } from '../core/loop';
import type { DanceRecord, KeyEvent, LayerRecord } from '../core/record';
import type { ShareSettings } from './settings';

/** 作った結果 */
export type EncodeResult = { ok: true; hash: string } | { ok: false; reason: 'tooLong' };
/** 読み戻した結果 */
export type DecodeResult = { ok: true; record: DanceRecord } | { ok: false; reason: 'broken' | 'version' };

const PREFIX = '#r=';
const DOWN_BIT = 0b1000;
const BROKEN: DecodeResult = { ok: false, reason: 'broken' };

/** 記録 → `#r=...`（最後の分身の周の終わりより後の入力は入れない。設計判断 No.3） */
export async function encodeRecord(record: DanceRecord, settings: ShareSettings, loop: LoopSettings = settings.loop): Promise<EncodeResult> {
  const end = endTick(record.layers, loop);
  const events = record.events.filter((e) => e.tick < end);
  const bytes: number[] = [record.layers.length];
  for (const l of record.layers) {
    writeVarint(bytes, l.loop);
    bytes.push(l.instrument);
  }
  writeVarint(bytes, events.length);
  let prev = 0;
  for (const e of events) {
    writeVarint(bytes, e.tick - prev);
    bytes.push(e.key | (e.down ? DOWN_BIT : 0));
    prev = e.tick;
  }
  const packed = await transform(new Uint8Array(bytes), new CompressionStream('deflate-raw'));
  const hash = `${PREFIX}${settings.version}.${toBase64Url(packed)}`;
  if (hash.length > settings.maxChars) return { ok: false, reason: 'tooLong' };
  return { ok: true, hash };
}

/** `#...`（ページの URL の # 以降）→ 記録 */
export async function decodeRecord(hash: string, settings: ShareSettings, loop: LoopSettings = settings.loop): Promise<DecodeResult> {
  if (!hash.startsWith(PREFIX)) return BROKEN;
  const body = hash.slice(PREFIX.length);
  const dot = body.indexOf('.');
  if (dot <= 0) return BROKEN;
  const versionText = body.slice(0, dot);
  if (!/^\d+$/.test(versionText)) return BROKEN;
  if (Number(versionText) !== settings.version) return { ok: false, reason: 'version' };
  const packed = fromBase64Url(body.slice(dot + 1));
  if (!packed || packed.length === 0) return BROKEN;
  let bytes: Uint8Array;
  try {
    bytes = await transform(packed, new DecompressionStream('deflate-raw'));
  } catch {
    // 展開できない中身は「壊れている」（内部の詳細は外に出さない）
    return BROKEN;
  }
  const record = readRecord(bytes, settings, loop);
  return record ? { ok: true, record } : BROKEN;
}

/** バイト列を読み、決まりに合うか確かめる（設計判断 No.5）。合わなければ null */
function readRecord(bytes: Uint8Array, settings: ShareSettings, loop: LoopSettings): DanceRecord | null {
  const reader = new Reader(bytes);
  const n = reader.byte();
  if (n === null || n < 1 || n > 5) return null;
  const layers: LayerRecord[] = [];
  for (let i = 0; i < n; i++) {
    const loopNo = reader.varint();
    const instrument = reader.byte();
    if (loopNo === null || instrument === null || !isInstrument(instrument)) return null;
    if (loopNo > settings.maxLoop) return null;
    const prev = layers[layers.length - 1];
    if (prev && loopNo <= prev.loop) return null;
    layers.push({ loop: loopNo, instrument });
  }
  const count = reader.varint();
  if (count === null) return null;
  const end = endTick(layers, loop);
  const held = new Set<number>();
  const events: KeyEvent[] = [];
  let tick = 0;
  for (let i = 0; i < count; i++) {
    const delta = reader.varint();
    const code = reader.byte();
    if (delta === null || code === null) return null;
    if ((code & ~(DOWN_BIT | 0b111)) !== 0) return null;
    const key = code & 0b111;
    const down = (code & DOWN_BIT) !== 0;
    if (!isPullKey(key)) return null;
    if (held.has(key) === down) return null;
    tick += delta;
    if (tick >= end) return null;
    if (down) held.add(key);
    else held.delete(key);
    events.push({ tick, key, down });
  }
  if (!reader.atEnd()) return null;
  return { events, layers };
}

/** 記録の範囲の終わり（最後の分身の周の次の周の頭の刻み） */
function endTick(layers: readonly LayerRecord[], loop: LoopSettings): number {
  const last = layers[layers.length - 1];
  return last ? loopStartTick(loop, last.loop + 1) : 0;
}

/** 可変長整数（7ビットずつ下位から。続きがあれば最上位ビットを1） */
function writeVarint(out: number[], value: number): void {
  let v = value;
  while (v >= 0x80) {
    out.push((v % 0x80) | 0x80);
    v = Math.floor(v / 0x80);
  }
  out.push(v);
}

/** バイト列を前から読む */
class Reader {
  private at = 0;
  constructor(private readonly bytes: Uint8Array) {}

  byte(): number | null {
    const b = this.bytes[this.at];
    if (b === undefined) return null;
    this.at++;
    return b;
  }

  varint(): number | null {
    let value = 0;
    let scale = 1;
    for (let i = 0; i < 5; i++) {
      const b = this.byte();
      if (b === null) return null;
      value += (b & 0x7f) * scale;
      if ((b & 0x80) === 0) return value;
      scale *= 0x80;
    }
    return null;
  }

  atEnd(): boolean {
    return this.at === this.bytes.length;
  }
}

/** 圧縮・展開（ブラウザ標準の CompressionStream・DecompressionStream） */
async function transform(input: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const piped = new Blob([new Uint8Array(input)]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(piped).arrayBuffer());
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** バイト列 → URL で使える Base64（-・_、詰め物なし） */
export function toBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += ALPHABET[(n >> 18) & 63] ?? '';
    out += ALPHABET[(n >> 12) & 63] ?? '';
    if (b !== undefined) out += ALPHABET[(n >> 6) & 63] ?? '';
    if (c !== undefined) out += ALPHABET[n & 63] ?? '';
  }
  return out;
}

/** URL で使える Base64 → バイト列。Base64 にない文字や、ありえない長さなら null */
function fromBase64Url(text: string): Uint8Array | null {
  if (text.length % 4 === 1) return null;
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of text) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) return null;
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}
