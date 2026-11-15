// 拍の頭の位置 → 鳴らす音（音の並び機能）。四則演算と切り捨てだけで決め、同じ拍から必ず同じ音にする。
import type { Instrument } from '../core/keys';
import type { DanceSettings } from '../core/settings';
import type { StepSample } from '../core/simulation';
import { percKindOf, type DrumKind, type MusicSettings, type PercKind } from './settings';

/** 鳴らす音1つ */
export interface Note {
  /** 拍（踊っている最中は通し番号、分身の並びでは周の中の位置） */
  step: number;
  /** 人の番号（0始まり。1人目＝0） */
  person: number;
  instrument: Instrument;
  /** 段（0〜10） */
  degree: number;
  /** 鳴らす高さ（MIDI 番号。打楽器は空） */
  midis: number[];
  /** 打楽器の種類（打楽器のときだけ） */
  perc?: PercKind;
  /** パン（−1〜1） */
  pan: number;
}

/** 伴奏の打つもの1つ */
export type AccompanimentHit = { kind: DrumKind } | { kind: 'bass'; midi: number };

const STEPS_PER_BAR = 8;

/** 頭の高さ → 段（0〜10。設計判断 No.2） */
export function degreeOf(headY: number, music: MusicSettings, dance: DanceSettings): number {
  const top = music.scale.length - 1;
  // 段の位置（0〜top）を、割る回数を1回にして求める（境目の丸めがぶれないように）
  const position = ((dance.rest.head.y + music.headDown - headY) * top) / (music.headUp + music.headDown);
  return Math.max(0, Math.min(top, Math.floor(position + 0.5)));
}

/** 頭の左右のずれ → パン（D25。設計判断 No.4） */
export function panOf(headX: number, music: MusicSettings): number {
  const ratio = Math.max(-1, Math.min(1, headX / music.panRange));
  return ratio * music.panWidth;
}

/** 段と楽器 → 鳴らす高さ（設計判断 No.3） */
function pitches(instrument: Instrument, degree: number, step: number, music: MusicSettings): number[] {
  const base = music.scale[degree] ?? 0;
  switch (instrument) {
    case 0:
      return [base];
    case 1:
      return [base - 24 + (step % 2 === 1 ? 12 : 0)];
    case 2: {
      const root = base - 12;
      return [root, root + 7, root + 12];
    }
    case 3:
      return [base + 12];
    case 4:
      return [];
  }
}

/** 拍1つ → 音（動いていなければ null） */
export function noteFor(sample: StepSample, instrument: Instrument, person: number, music: MusicSettings, dance: DanceSettings): Note | null {
  if (!sample.moved) return null;
  const degree = degreeOf(sample.head.y, music, dance);
  const note: Note = {
    step: sample.step,
    person,
    instrument,
    degree,
    midis: pitches(instrument, degree, sample.step, music),
    pan: panOf(sample.head.x, music),
  };
  if (instrument === 4) note.perc = percKindOf(degree);
  return note;
}

/** 分身1人の1周の音の並び（鳴らない拍は null。拍の番号は周の中の位置） */
export function layerNotes(samples: readonly StepSample[], instrument: Instrument, person: number, music: MusicSettings, dance: DanceSettings): (Note | null)[] {
  return samples.map((sample, i) => {
    const note = noteFor(sample, instrument, person, music, dance);
    return note ? { ...note, step: i } : null;
  });
}

/** 周の中の拍 → 伴奏の打つもの（設計判断 No.6） */
export function accompaniment(stepInLoop: number, music: MusicSettings): AccompanimentHit[] {
  const beat = stepInLoop % STEPS_PER_BAR;
  const hits: AccompanimentHit[] = [];
  if (stepInLoop === 0) hits.push({ kind: 'crash' });
  if (beat % 2 === 0) hits.push({ kind: 'kick' });
  if (beat === 2 || beat === 6) hits.push({ kind: 'snare' });
  hits.push({ kind: beat % 2 === 0 ? 'hihatClosed' : 'hihatHalf' });
  if (music.accompanimentBass && beat % 2 === 0) {
    const bar = Math.floor(stepInLoop / STEPS_PER_BAR);
    const root = music.chordRoots[bar % music.chordRoots.length] ?? 0;
    hits.push({ kind: 'bass', midi: root });
  }
  return hits;
}
