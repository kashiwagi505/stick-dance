// 踊り（物理・分身・鑑賞の周）の仮の数値。遊んで決めるため、ここ1か所に名前を付けて置く（実装方針9章）。
// 値を変えて同じ記録から違う踊りになるなら、共有URLの版番号を上げる（共有機能 設計判断 No.7）。

/** 体の点の名前（試作と同じ11点） */
export type Joint =
  | 'head'
  | 'neck'
  | 'pelvis'
  | 'lElbow'
  | 'lHand'
  | 'rElbow'
  | 'rHand'
  | 'lKnee'
  | 'lFoot'
  | 'rKnee'
  | 'rFoot';

/** 体の点の並び（姿勢の配列はこの順） */
export const JOINTS: readonly Joint[] = ['head', 'neck', 'pelvis', 'lElbow', 'lHand', 'rElbow', 'rHand', 'lKnee', 'lFoot', 'rKnee', 'rFoot'];

/** 物理の設定 */
export interface DanceSettings {
  /** 立ち姿（足もとの真ん中が原点、上が y の負）と、立ち姿へ引き戻す強さ */
  rest: Readonly<Record<Joint, { x: number; y: number; spring: number }>>;
  /** 棒（長さを保つ2点） */
  sticks: readonly (readonly [Joint, Joint])[];
  /** ゆるい棒（2点・保つ強さ） */
  softSticks: readonly (readonly [Joint, Joint, number])[];
  /** キーで手を引く強さ（試作の「強」） */
  pull: number;
  /** 手を引いたときに、ほかの点がつられる割合 */
  follow: readonly (readonly ['elbow' | 'neck' | 'head' | 'pelvis', number])[];
  /** 腰が下がったときに膝を外へ開く強さ */
  squat: number;
  /** 1刻みごとに速さに掛ける値（減速） */
  damping: number;
  /** 棒の長さを直す回数 */
  iterations: number;
  /** 頭がこれより大きく動いた拍だけ鳴る（px） */
  moveThreshold: number;
  /** 1周でこの数以上鳴らすと分身が残る */
  keepMinNotes: number;
  /** 分身の最大人数 */
  maxLayers: number;
  /** 拍の音を、拍の頭のこの刻み数だけ前の頭の位置で決める（予約の先読み。操作から音までの遅れになる） */
  noteLeadTicks: number;
  /** 鑑賞で、全員そろってから流す周の数 */
  endingLoops: number;
}

/** 試作 prototype/index.html の値を引き継いだ既定値 */
export const DEFAULT_DANCE: DanceSettings = {
  rest: {
    head: { x: 0, y: -250, spring: 0.008 },
    neck: { x: 0, y: -212, spring: 0.008 },
    pelvis: { x: 0, y: -120, spring: 0.012 },
    lElbow: { x: -42, y: -172, spring: 0.01 },
    lHand: { x: -70, y: -132, spring: 0.012 },
    rElbow: { x: 42, y: -172, spring: 0.01 },
    rHand: { x: 70, y: -132, spring: 0.012 },
    lKnee: { x: -20, y: -60, spring: 0.02 },
    lFoot: { x: -26, y: 0, spring: 0.05 },
    rKnee: { x: 20, y: -60, spring: 0.02 },
    rFoot: { x: 26, y: 0, spring: 0.05 },
  },
  sticks: [
    ['head', 'neck'],
    ['neck', 'pelvis'],
    ['neck', 'lElbow'],
    ['lElbow', 'lHand'],
    ['neck', 'rElbow'],
    ['rElbow', 'rHand'],
    ['pelvis', 'lKnee'],
    ['lKnee', 'lFoot'],
    ['pelvis', 'rKnee'],
    ['rKnee', 'rFoot'],
  ],
  softSticks: [['head', 'pelvis', 0.15]],
  pull: 2.0,
  follow: [
    ['elbow', 0.4],
    ['neck', 0.45],
    ['head', 0.2],
    ['pelvis', 0.3],
  ],
  squat: 0.02,
  damping: 0.93,
  iterations: 6,
  moveThreshold: 5,
  keepMinNotes: 4,
  maxLayers: 5,
  noteLeadTicks: 6,
  endingLoops: 1,
};

/** 物理の1秒あたりの刻みの数 */
export const TICKS_PER_SECOND = 60;
