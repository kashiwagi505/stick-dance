// 手を引くキー（F1）。画面の左側の手＝WASD、画面の右側の手＝矢印キー。引く向きは画面の上下左右。
// 番号は共有URLの記録にそのまま入る（共有機能 設計判断 No.2）。並びを変えたら版番号を上げる。

/** 手を引くキーの番号（0〜7） */
export type PullKey = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** キーごとの、引く手と向き（x: 右が正、y: 下が正） */
export interface PullDirection {
  hand: 'lHand' | 'rHand';
  x: -1 | 0 | 1;
  y: -1 | 0 | 1;
}

/** キーの番号 → 引く手と向き。0〜3 は W・A・S・D、4〜7 は ↑・←・↓・→ */
export const PULLS: readonly PullDirection[] = [
  { hand: 'lHand', x: 0, y: -1 },
  { hand: 'lHand', x: -1, y: 0 },
  { hand: 'lHand', x: 0, y: 1 },
  { hand: 'lHand', x: 1, y: 0 },
  { hand: 'rHand', x: 0, y: -1 },
  { hand: 'rHand', x: -1, y: 0 },
  { hand: 'rHand', x: 0, y: 1 },
  { hand: 'rHand', x: 1, y: 0 },
];

/** キーの番号として正しいか（外から来た数を確かめる） */
export function isPullKey(n: number): n is PullKey {
  return Number.isInteger(n) && n >= 0 && n <= 7;
}

/** 楽器の番号（0〜4 = 1人目 旋律〜5人目 打楽器） */
export type Instrument = 0 | 1 | 2 | 3 | 4;

/** 楽器の番号として正しいか */
export function isInstrument(n: number): n is Instrument {
  return Number.isInteger(n) && n >= 0 && n <= 4;
}
