// 画面の表示の数値（SCR02〜SCR04）。仮の数値はここ1か所に置く（実装方針9章）。
// 表示だけに使い、踊りと音には効かないので、変えても共有URLの版番号は上げない。

export const VIEW_SETTINGS = {
  /** 舞台（Canvas）の大きさ（デザインシステム 1.1） */
  stageWidth: 960,
  stageHeight: 540,
  /** 床の高さ（舞台の高さに対する割合） */
  floorRatio: 0.84,
  /** 踊る画面の分身の大きさ（自分を1として）と、舞台の幅に対する位置（SCR02 4章 No.2） */
  ghostScale: 0.55,
  ghostSlots: [0.16, 0.84, 0.3, 0.7],
  /** 鑑賞の分身の大きさ: min(viewScaleMax, viewScaleSpread ÷ (人数＋1))（SCR03 4章 No.2） */
  viewScaleMax: 0.85,
  viewScaleSpread: 2.6,
  /** 音階のはしごの、自分の足もとからの右へのずれ */
  ladderOffset: 180,
  /** 通り道の点が消えるまでの秒数 */
  trailSeconds: 4,
  /** 鳴った瞬間の光の秒数（拍の半分） */
  flashSeconds: 0.12,
  /** 「はじめる」「再生する」「もう一度見る」から、拍0までの間（秒） */
  startLeadSeconds: 0.15,
  /** 体の線の太さ・頭の半径（舞台 960×540 のとき。デザインシステム 1.4） */
  lineWidth: 7,
  headRadius: 20,
  /** キーで引いている向きの線の長さ */
  pullMarkLength: 40,
} as const;
