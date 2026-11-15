// 記録（技術選定 3.1）。キー入力と、分身ごとの周の番号と楽器だけを持つ。
import type { Instrument, PullKey } from './keys';

/** キー入力（何刻み目に、どのキーを押した・離した） */
export interface KeyEvent {
  tick: number;
  key: PullKey;
  down: boolean;
}

/** 分身1人の記録（どの周の踊りか、どの楽器か） */
export interface LayerRecord {
  loop: number;
  instrument: Instrument;
}

/** 記録。踊り始めから最後の分身の周の終わりまでのキー入力と、分身の一覧（周の番号の小さい順） */
export interface DanceRecord {
  events: KeyEvent[];
  layers: LayerRecord[];
}
