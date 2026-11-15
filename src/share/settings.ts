// 共有URLの設定（共有機能）。
import { DEFAULT_LOOP, type LoopSettings } from '../core/loop';

export interface ShareSettings {
  /** 形式の版番号。同じ記録から違う踊りや音になる変更をしたら上げる（共有機能 設計判断 No.7） */
  version: number;
  /** `#r=` から終わりまでの文字数の上限（N4） */
  maxChars: number;
  /** 分身の周の番号の上限（計算し直しが重くなりすぎる URL を止める） */
  maxLoop: number;
  /** 記録の範囲（周の終わりの刻み）を求めるループの設定 */
  loop: LoopSettings;
}

export const DEFAULT_SHARE: ShareSettings = {
  version: 1,
  maxChars: 4000,
  maxLoop: 240,
  loop: DEFAULT_LOOP,
};
