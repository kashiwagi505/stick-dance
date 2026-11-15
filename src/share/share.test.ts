import { describe, expect, it } from 'vitest';
import type { PullKey } from '../core/keys';
import { DEFAULT_LOOP, loopStartTick } from '../core/loop';
import type { DanceRecord, KeyEvent } from '../core/record';
import { replay } from '../core/replay';
import { DEFAULT_DANCE } from '../core/settings';
import { layerNotes } from '../music/notes';
import { DEFAULT_MUSIC } from '../music/settings';
import { decodeRecord, encodeRecord, toBase64Url } from './share';
import { DEFAULT_SHARE } from './settings';

const L = DEFAULT_LOOP;

/** 周 loops のあいだ、W・S と ↑・↓ を交互に押し続けた入力（5人分の踊りに相当する長さ） */
function busyEvents(loops: number, period: number): KeyEvent[] {
  const events: KeyEvent[] = [];
  const end = loopStartTick(L, loops);
  let k = 0;
  for (let t = 0; t + period < end; t += period) {
    const key = ([0, 2, 4, 6] as const)[k % 4] as PullKey;
    events.push({ tick: t, key, down: true }, { tick: t + period - 3, key, down: false });
    k++;
  }
  return events;
}

const fiveRecord: DanceRecord = {
  events: busyEvents(5, 9),
  layers: [0, 1, 2, 3, 4].map((loop) => ({ loop, instrument: ((loop * 2) % 5) as 0 | 1 | 2 | 3 | 4 })),
};

const hashOf = async (r: DanceRecord): Promise<string> => {
  const made = await encodeRecord(r, DEFAULT_SHARE);
  if (!made.ok) throw new Error(made.reason);
  return made.hash;
};

describe('共有URLの往復（F8・AC3・N3）', () => {
  it('記録 → URL → 記録で元の記録と一致する', async () => {
    const back = await decodeRecord(await hashOf(fiveRecord), DEFAULT_SHARE);
    expect(back).toEqual({ ok: true, record: fiveRecord });
  });

  it('読み戻した記録から計算した姿勢の列と音の並びも、元の記録からのものと一致する', async () => {
    const back = await decodeRecord(await hashOf(fiveRecord), DEFAULT_SHARE);
    if (!back.ok) throw new Error('読み戻せない');
    const a = replay(fiveRecord, DEFAULT_DANCE, L);
    const b = replay(back.record, DEFAULT_DANCE, L);
    expect(b).toEqual(a);
    const notes = (r: typeof a) => r.map((x, i) => layerNotes(x.samples, x.instrument, i, DEFAULT_MUSIC, DEFAULT_DANCE));
    expect(notes(b)).toEqual(notes(a));
  });

  it('同じ記録からは同じURLになる', async () => {
    expect(await hashOf(fiveRecord)).toBe(await hashOf(fiveRecord));
  });

  it('URLは #r=<版>. で始まり、版は今の版番号', async () => {
    const h = await hashOf(fiveRecord);
    expect(h.startsWith(`#r=${DEFAULT_SHARE.version}.`)).toBe(true);
    expect(h).toMatch(/^#r=\d+\.[A-Za-z0-9_-]+$/);
  });

  it('5人分をふつうに踊った記録が、長さの上限に収まる（N4）', async () => {
    expect((await hashOf(fiveRecord)).length).toBeLessThanOrEqual(DEFAULT_SHARE.maxChars);
  });

  it('記録の範囲（最後の分身の周の終わり）より後の入力はURLに入れない', async () => {
    const extra: DanceRecord = { events: [...fiveRecord.events, { tick: loopStartTick(L, 5) + 3, key: 1, down: true }], layers: fiveRecord.layers };
    const back = await decodeRecord(await hashOf(extra), DEFAULT_SHARE);
    expect(back).toEqual({ ok: true, record: fiveRecord });
  });
});

describe('長すぎる記録', () => {
  it('上限を超えるときはURLを作らず「長すぎる」を返す', async () => {
    // 押す長さと間を不規則にした（よく縮まない）長い記録
    const events: KeyEvent[] = [];
    let t = 0;
    let seed = 7;
    for (let i = 0; i < 2000; i++) {
      seed = (seed * 1103515245 + 12345) % 2147483648; // テストの中だけの決まった並び（乱数は使わない）
      const key = (seed % 8) as PullKey;
      t += 1 + (seed % 13);
      events.push({ tick: t, key, down: true }, { tick: t + 1 + (seed % 5), key, down: false });
      t += 2 + (seed % 5);
    }
    const long: DanceRecord = { events, layers: [{ loop: 59, instrument: 0 }] };
    expect(await encodeRecord(long, { ...DEFAULT_SHARE, maxChars: 200 })).toEqual({ ok: false, reason: 'tooLong' });
  });
});

describe('壊れたURL・版の違うURL（共有機能 設計判断 No.5〜8）', () => {
  const broken = async (hash: string) => expect(await decodeRecord(hash, DEFAULT_SHARE)).toEqual({ ok: false, reason: 'broken' });

  it('版が違えば、古くても新しくても「版が違う」を返す', async () => {
    const body = (await hashOf(fiveRecord)).split('.')[1] ?? '';
    expect(await decodeRecord(`#r=0.${body}`, DEFAULT_SHARE)).toEqual({ ok: false, reason: 'version' });
    expect(await decodeRecord(`#r=${DEFAULT_SHARE.version + 1}.${body}`, DEFAULT_SHARE)).toEqual({ ok: false, reason: 'version' });
  });

  it('形の違う文字列は「壊れている」を返す（例外を投げない）', async () => {
    await broken('');
    await broken('#r=');
    await broken('#r=1');
    await broken('#r=x.AAAA');
    await broken('#r=1.@@@@');
    await broken('#r=1.AAAA');
  });

  it('途中で切れたURLは「壊れている」', async () => {
    const h = await hashOf(fiveRecord);
    await broken(h.slice(0, h.length - 8));
  });

  /** 詰めたバイト列を、そのまま圧縮してURLにする（中身の確かめを試すため） */
  async function hashOfBytes(bytes: number[]): Promise<string> {
    const stream = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    const packed = new Uint8Array(await new Response(stream).arrayBuffer());
    return `#r=${DEFAULT_SHARE.version}.${toBase64Url(packed)}`;
  }

  it('中身の決まりに合わないものは「壊れている」', async () => {
    // 分身1人（周0・楽器0）、キー入力1つ（刻み1で W を押す）は正しい
    expect((await decodeRecord(await hashOfBytes([1, 0, 0, 1, 1, 0b1000]), DEFAULT_SHARE)).ok).toBe(true);
    await broken(await hashOfBytes([0, 0])); // 分身0人
    await broken(await hashOfBytes([6, 0, 0, 1, 0, 2, 0, 3, 0, 4, 0, 5, 0, 0])); // 分身6人
    await broken(await hashOfBytes([1, 0, 5, 0])); // 楽器が 0〜4 の外
    await broken(await hashOfBytes([2, 1, 0, 1, 0, 0])); // 周の番号が重なる
    await broken(await hashOfBytes([2, 2, 0, 1, 0, 0])); // 周の番号が小さい順でない
    await broken(await hashOfBytes([1, 0, 0, 1, 1])); // バイト列が足りない
    await broken(await hashOfBytes([1, 0, 0, 1, 1, 0b1000, 7])); // バイト列が余る
    await broken(await hashOfBytes([1, 0, 0, 1, 1, 0b10000])); // キーが 0〜7 の外（使っていないビット）
    await broken(await hashOfBytes([1, 0, 0, 2, 1, 0b1000, 1, 0b1000])); // 押したまま押す
    await broken(await hashOfBytes([1, 0, 0, 1, 1, 0])); // 押していないのに離す
    await broken(await hashOfBytes([1, 0, 0, 1, 0xf4, 0x03, 0b1000])); // 最後の分身の周の終わりより後の入力（刻み 500）
  });

  it('周の番号が上限を超える記録は「壊れている」', async () => {
    const r: DanceRecord = { events: [], layers: [{ loop: DEFAULT_SHARE.maxLoop + 1, instrument: 0 }] };
    await broken(await hashOf(r));
  });
});
