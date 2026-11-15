import { describe, expect, it } from 'vitest';
import type { Instrument } from '../core/keys';
import { DEFAULT_DANCE } from '../core/settings';
import type { StepSample } from '../core/simulation';
import { accompaniment, degreeOf, layerNotes, noteFor, panOf } from './notes';
import { DEFAULT_MUSIC, percKindOf } from './settings';

const M = DEFAULT_MUSIC;
const restY = DEFAULT_DANCE.rest.head.y;
const span = M.headUp + M.headDown;
/** 段 i のちょうど真ん中の頭の高さ */
const yOfDegree = (i: number): number => restY + M.headDown - (i / 10) * span;
const sample = (step: number, x: number, y: number, moved = true): StepSample => ({ step, head: { x, y }, moved });

describe('頭の高さ → 段（F2・音の並び機能 設計判断 No.2）', () => {
  it('立ち姿の頭から下へ headDown が段0、上へ headUp が段10', () => {
    expect(degreeOf(restY + M.headDown, M, DEFAULT_DANCE)).toBe(0);
    expect(degreeOf(restY - M.headUp, M, DEFAULT_DANCE)).toBe(10);
  });

  it('範囲の外は端の段に収める', () => {
    expect(degreeOf(restY + M.headDown + 100, M, DEFAULT_DANCE)).toBe(0);
    expect(degreeOf(restY - M.headUp - 100, M, DEFAULT_DANCE)).toBe(10);
  });

  it('11段のどれかに丸め、段の境目（ちょうど半分）で上の段へ変わる', () => {
    for (let i = 0; i <= 10; i++) expect(degreeOf(yOfDegree(i), M, DEFAULT_DANCE)).toBe(i);
    const half = span / 20; // 段の間の半分
    expect(degreeOf(yOfDegree(4) - half, M, DEFAULT_DANCE)).toBe(5); // ちょうど境目
    expect(degreeOf(yOfDegree(4) - half + 0.01, M, DEFAULT_DANCE)).toBe(4); // 境目の直前
  });
});

describe('鳴る拍（D4）', () => {
  it('頭が動いた拍だけ鳴り、動いていない拍は鳴らない', () => {
    expect(noteFor(sample(3, 0, yOfDegree(5), false), 0, 0, M, DEFAULT_DANCE)).toBeNull();
    expect(noteFor(sample(3, 0, yOfDegree(5), true), 0, 0, M, DEFAULT_DANCE)).not.toBeNull();
  });
});

describe('楽器ごとの段の使い方（F5・音の設計方針 3章）', () => {
  const at = (inst: Instrument, degree: number, step = 4) => noteFor(sample(step, 0, yOfDegree(degree)), inst, 0, M, DEFAULT_DANCE);

  it('旋律は段の音そのもの', () => {
    expect(at(0, 0)?.midis).toEqual([M.scale[0]]);
    expect(at(0, 10)?.midis).toEqual([M.scale[10]]);
  });

  it('ベースは2オクターブ下。奇数の拍だけ1オクターブ上へ行き来する', () => {
    const s = M.scale[5] ?? 0;
    expect(at(1, 5, 4)?.midis).toEqual([s - 24]);
    expect(at(1, 5, 5)?.midis).toEqual([s - 12]);
  });

  it('和音は段の音の1オクターブ下を根音にしたパワーコード（根音・5度・オクターブ）', () => {
    const r = (M.scale[3] ?? 0) - 12;
    expect(at(2, 3)?.midis).toEqual([r, r + 7, r + 12]);
  });

  it('高い旋律は1オクターブ上', () => {
    expect(at(3, 7)?.midis).toEqual([(M.scale[7] ?? 0) + 12]);
  });

  it('打楽器は段で種類が変わる（0〜2 手拍子、3〜5 タンバリン、6〜8 軽い手拍子、9〜10 トライアングル）', () => {
    expect([0, 2, 3, 5, 6, 8, 9, 10].map((d) => at(4, d)?.perc)).toEqual(['clap', 'clap', 'tambourine', 'tambourine', 'lightClap', 'lightClap', 'triangle', 'triangle']);
    expect(percKindOf(2)).toBe('clap');
    expect(at(4, 4)?.midis).toEqual([]);
  });

  it('音には拍・人の番号・楽器・段が入り、どの音がどの人のものか区別できる（AC2・F6）', () => {
    const n = noteFor(sample(7, 0, yOfDegree(2)), 3, 2, M, DEFAULT_DANCE);
    expect(n).toMatchObject({ step: 7, person: 2, instrument: 3, degree: 2 });
  });
});

describe('パン（D25）', () => {
  it('真ん中は0、左にいれば左（負）、右にいれば右（正）。端は振れ幅で止まる', () => {
    expect(panOf(0, M)).toBe(0);
    expect(panOf(-M.panRange / 2, M)).toBeCloseTo(-M.panWidth / 2, 10);
    expect(panOf(M.panRange / 2, M)).toBeCloseTo(M.panWidth / 2, 10);
    expect(panOf(M.panRange * 3, M)).toBe(M.panWidth);
    expect(panOf(-M.panRange * 3, M)).toBe(-M.panWidth);
  });

  it('楽器の音（高さ）はパンで変わらない', () => {
    const left = noteFor(sample(1, -100, yOfDegree(6)), 0, 0, M, DEFAULT_DANCE);
    const right = noteFor(sample(1, 100, yOfDegree(6)), 0, 0, M, DEFAULT_DANCE);
    expect(left?.midis).toEqual(right?.midis);
    expect(left?.pan).toBeLessThan(0);
    expect(right?.pan).toBeGreaterThan(0);
  });
});

describe('分身1人の1周の音の並び', () => {
  it('32拍ぶんで、鳴らない拍は空き。拍の番号は周の中の位置', () => {
    const samples = Array.from({ length: 32 }, (_, i) => sample(64 + i, 0, yOfDegree(i % 11), i % 3 === 0));
    const notes = layerNotes(samples, 0, 1, M, DEFAULT_DANCE);
    expect(notes.length).toBe(32);
    notes.forEach((n, i) => {
      if (i % 3 === 0) expect(n).toMatchObject({ step: i, person: 1, degree: i % 11 });
      else expect(n).toBeNull();
    });
  });

  it('同じ拍の並びからは同じ音の並び、違う踊りからは違う音の並び（AC1 の数えられる部分）', () => {
    const a = Array.from({ length: 32 }, (_, i) => sample(i, 0, yOfDegree(i % 11)));
    const b = Array.from({ length: 32 }, (_, i) => sample(i, 0, yOfDegree(10 - (i % 11))));
    expect(layerNotes(a, 0, 0, M, DEFAULT_DANCE)).toEqual(layerNotes(a, 0, 0, M, DEFAULT_DANCE));
    expect(layerNotes(a, 0, 0, M, DEFAULT_DANCE)).not.toEqual(layerNotes(b, 0, 0, M, DEFAULT_DANCE));
  });
});

describe('伴奏（音の設計方針 2章）', () => {
  const kinds = (step: number) => accompaniment(step, M).map((h) => h.kind).sort();

  it('キックは毎拍（偶数の拍）、スネアは2・4拍目、ハイハットは表が閉じ・裏が半開き', () => {
    expect(kinds(0)).toEqual(['crash', 'hihatClosed', 'kick'].sort());
    expect(kinds(1)).toEqual(['hihatHalf']);
    expect(kinds(2)).toEqual(['hihatClosed', 'kick', 'snare'].sort());
    expect(kinds(4)).toEqual(['hihatClosed', 'kick'].sort());
    expect(kinds(6)).toEqual(['hihatClosed', 'kick', 'snare'].sort());
    expect(kinds(7)).toEqual(['hihatHalf']);
  });

  it('シンバルはループの頭だけ', () => {
    expect(kinds(8)).toEqual(['hihatClosed', 'kick'].sort());
    expect(kinds(31)).toEqual(['hihatHalf']);
  });

  it('伴奏のベースは既定では鳴らさない。鳴らす設定なら偶数の拍に根音', () => {
    expect(accompaniment(0, M).some((h) => h.kind === 'bass')).toBe(false);
    const withBass = accompaniment(8, { ...M, accompanimentBass: true });
    expect(withBass.find((h) => h.kind === 'bass')).toMatchObject({ midi: M.chordRoots[1] });
  });
});
