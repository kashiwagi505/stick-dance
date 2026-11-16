// 鳴らし方の設定（音量・音色・予約）。耳で決める仮の数値はここ1か所に置く（実装方針9章、音の設計方針 4章）。
// 音量・音色は共有URLの再現性に関わらないので、変えても版番号は上げない。

export interface AudioSettings {
  /** 全体の音量（デシベル） */
  masterDb: number;
  /** 伴奏のドラムの音量（デシベル） */
  drumsDb: number;
  /** 楽器ごとの音量（デシベル。1人目〜5人目の楽器の順） */
  instrumentDb: readonly [number, number, number, number, number];
  /** 1つの音の長さ（秒） */
  noteSeconds: number;
  /** 描画のたびに、今からこの秒数先までの拍を予約する（鑑賞・伴奏） */
  scheduleAheadSeconds: number;
}

export const DEFAULT_AUDIO: AudioSettings = {
  masterDb: -4,
  drumsDb: -8,
  instrumentDb: [-12, -6, -16, -14, -8],
  noteSeconds: 0.22,
  scheduleAheadSeconds: 0.12,
};
