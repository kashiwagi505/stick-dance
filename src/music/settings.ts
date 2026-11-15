// 音の決め方の設定（音の設計方針 1〜3章、音の並び機能）。仮の数値はここ1か所に置く（実装方針9章）。
// 段・音・パン・楽器の割り当てを、同じ記録から違う音になる形で変えたら、共有URLの版番号を上げる。

/** 打楽器の音の種類 */
export type PercKind = 'clap' | 'tambourine' | 'lightClap' | 'triangle';

/** 伴奏の打つもの */
export type DrumKind = 'kick' | 'snare' | 'hihatClosed' | 'hihatHalf' | 'crash';

export interface MusicSettings {
  /** 音階（A マイナーペンタトニックの11段。MIDI 番号） */
  scale: readonly number[];
  /** 立ち姿の頭から上へ、この距離（px）までを段に割る */
  headUp: number;
  /** 立ち姿の頭から下へ、この距離（px）までを段に割る */
  headDown: number;
  /** 頭の左右のずれをこの距離（px）で割ってパン（−1〜1）にする */
  panRange: number;
  /** パンの振れ幅（0〜1。端でどこまで振るか。耳で決める） */
  panWidth: number;
  /** 伴奏のベースを鳴らすか（2人目と役がかぶるので既定は鳴らさない。耳で決める） */
  accompanimentBass: boolean;
  /** コード進行の根音（1小節ずつ。伴奏のベースを鳴らすときだけ使う） */
  chordRoots: readonly number[];
}

export const DEFAULT_MUSIC: MusicSettings = {
  scale: [57, 60, 62, 64, 67, 69, 72, 74, 76, 79, 81],
  headUp: 45,
  headDown: 85,
  panRange: 140,
  panWidth: 0.8,
  accompanimentBass: false,
  chordRoots: [45, 41, 36, 43],
};

/** 楽器の名前（1人目〜5人目。画面の文言はここから受け取る。実装方針4章） */
export const INSTRUMENT_NAMES = ['旋律', 'ベース', '和音', '高い旋律', '打楽器'] as const;

/** 音階の段の名前（はしごに出す） */
export const SCALE_NAMES = ['ラ', 'ド', 'レ', 'ミ', 'ソ', 'ラ', 'ド', 'レ', 'ミ', 'ソ', 'ラ'] as const;

/** 打楽器の種類の名前（はしごに出す） */
export const PERC_NAMES: Readonly<Record<PercKind, string>> = {
  clap: '手拍子',
  tambourine: 'タンバリン',
  lightClap: '軽い手拍子',
  triangle: 'トライアングル',
};

/** 打楽器の段 → 種類（低い 0〜2 手拍子、3〜5 タンバリン、6〜8 軽い手拍子、9〜10 トライアングル） */
export function percKindOf(degree: number): PercKind {
  if (degree <= 2) return 'clap';
  if (degree <= 5) return 'tambourine';
  if (degree <= 8) return 'lightClap';
  return 'triangle';
}
