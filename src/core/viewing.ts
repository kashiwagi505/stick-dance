// 鑑賞の周の順番（鑑賞機能 設計判断 No.2）。
import type { DanceSettings } from './settings';

/** n 人の鑑賞の周の数（1周に1人ずつ加え、全員そろってから終わりの周を流す） */
export function viewingLoops(n: number, dance: DanceSettings): number {
  return n + dance.endingLoops;
}

/** 鑑賞の周 viewLoop（0始まり）に加わっている人数 */
export function joinedAt(n: number, viewLoop: number): number {
  return Math.min(n, viewLoop + 1);
}
