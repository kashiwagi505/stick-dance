// ループの刻み（音の設計方針 1章）。純粋な計算だけを置く。
// 時刻は呼び出し側（音の時計）から秒で受け取る（技術選定の設計方針 3.2）

/** 1小節の刻み（8分音符） */
export const STEPS_PER_BAR = 8;

export interface LoopSettings {
  /** テンポ（1分あたりの4分音符の数） */
  bpm: number;
  /** ループの小節数 */
  bars: number;
}

/** POP（判断ログ D22）。小節数は D5 の4小節。長さは音の設計方針 4章で見直し中 */
export const DEFAULT_LOOP: LoopSettings = { bpm: 124, bars: 4 };

/** 8分音符1つの長さ（秒） */
export function stepSeconds(s: LoopSettings): number {
  return 60 / s.bpm / 2;
}

/** 1周の刻みの数 */
export function stepsPerLoop(s: LoopSettings): number {
  return s.bars * STEPS_PER_BAR;
}

/** 1周の長さ（秒） */
export function loopSeconds(s: LoopSettings): number {
  return stepSeconds(s) * stepsPerLoop(s);
}

/**
 * ループの頭からの経過秒を、何周目の何刻み目かに直す。
 * 境目の丸めで刻みがずれないよう、刻みの番号は整数の割り算で求める
 */
export function positionAt(s: LoopSettings, elapsed: number): { loop: number; step: number } {
  if (elapsed < 0) return { loop: 0, step: 0 };
  const total = Math.floor(elapsed / stepSeconds(s) + 1e-9);
  const per = stepsPerLoop(s);
  return { loop: Math.floor(total / per), step: total % per };
}
