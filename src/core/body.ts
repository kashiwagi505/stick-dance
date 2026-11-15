// 体の物理（踊り機能 設計判断 No.1・No.2）。試作の Verlet 法を引き継ぐ。
// 四則演算と Math.sqrt だけで書き、同じ入力から必ず同じ姿勢にする（技術選定 3.1）。
import { PULLS, type PullKey } from './keys';
import { JOINTS, type DanceSettings, type Joint } from './settings';

/** 点（足もとの真ん中が原点、右が x の正、上が y の負。単位は舞台 960×540 の 1px） */
export interface Point {
  x: number;
  y: number;
}

/** 姿勢（JOINTS の順の11点） */
export type Pose = readonly Point[];

/** 点の名前 → 姿勢の配列の位置 */
const at = (j: Joint): number => JOINTS.indexOf(j);

/** 立ち姿 */
export function restPose(settings: DanceSettings): Pose {
  return JOINTS.map((j) => ({ x: settings.rest[j].x, y: settings.rest[j].y }));
}

/** 2点の距離 */
function distance(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

/** 1人の体。1刻みずつ進める */
export class Body {
  private readonly x: number[];
  private readonly y: number[];
  private readonly ox: number[];
  private readonly oy: number[];
  private readonly ax: number[];
  private readonly ay: number[];
  private readonly stickLengths: number[];
  private readonly softLengths: number[];

  constructor(private readonly settings: DanceSettings) {
    const rest = restPose(settings);
    this.x = rest.map((p) => p.x);
    this.y = rest.map((p) => p.y);
    this.ox = [...this.x];
    this.oy = [...this.y];
    this.ax = this.x.map(() => 0);
    this.ay = this.x.map(() => 0);
    const len = (a: Joint, b: Joint): number => distance(settings.rest[a].x, settings.rest[a].y, settings.rest[b].x, settings.rest[b].y);
    this.stickLengths = settings.sticks.map(([a, b]) => len(a, b));
    this.softLengths = settings.softSticks.map(([a, b]) => len(a, b));
  }

  /** 今の姿勢 */
  pose(): Pose {
    return this.x.map((x, i) => ({ x, y: this.y[i] ?? 0 }));
  }

  /** 押しているキーで1刻み進める */
  step(held: ReadonlySet<PullKey>): void {
    const s = this.settings;
    const n = JOINTS.length;
    for (let i = 0; i < n; i++) {
      this.ax[i] = 0;
      this.ay[i] = 0;
    }
    // キーで手を引き、ほかの点をつられさせる（試作と同じ足し方）。キーの番号の順に足して、順番を決めておく
    const keys = [...held].sort((a, b) => a - b);
    for (const key of keys) {
      const pull = PULLS[key];
      if (!pull) continue;
      const fx = pull.x * s.pull;
      const fy = pull.y * s.pull;
      this.push(at(pull.hand), fx, fy, 1);
      const elbow = pull.hand === 'lHand' ? 'lElbow' : 'rElbow';
      for (const [part, rate] of s.follow) {
        const joint: Joint = part === 'elbow' ? elbow : part;
        this.push(at(joint), fx, fy, rate);
      }
    }
    // 腰が下がったら膝を外へ開く
    const pelvis = at('pelvis');
    const squat = Math.max(0, (this.y[pelvis] ?? 0) - s.rest.pelvis.y) * s.squat;
    this.ax[at('lKnee')] = (this.ax[at('lKnee')] ?? 0) - squat;
    this.ax[at('rKnee')] = (this.ax[at('rKnee')] ?? 0) + squat;
    // 速さを減らして進め、立ち姿へ引き戻す
    for (let i = 0; i < n; i++) {
      const joint = JOINTS[i];
      if (!joint) continue;
      const r = s.rest[joint];
      const x = this.x[i] ?? 0;
      const y = this.y[i] ?? 0;
      const vx = (x - (this.ox[i] ?? 0)) * s.damping;
      const vy = (y - (this.oy[i] ?? 0)) * s.damping;
      this.ox[i] = x;
      this.oy[i] = y;
      this.x[i] = x + vx + (this.ax[i] ?? 0) + (r.x - x) * r.spring;
      this.y[i] = y + vy + (this.ay[i] ?? 0) + (r.y - y) * r.spring;
    }
    // 棒の長さを直し、床より下へ行かせない
    for (let it = 0; it < s.iterations; it++) {
      s.sticks.forEach(([a, b], k) => this.solve(at(a), at(b), this.stickLengths[k] ?? 0, 1));
      s.softSticks.forEach(([a, b, strength], k) => this.solve(at(a), at(b), this.softLengths[k] ?? 0, strength));
      for (let i = 0; i < n; i++) if ((this.y[i] ?? 0) > 0) this.y[i] = 0;
    }
  }

  private push(i: number, fx: number, fy: number, rate: number): void {
    this.ax[i] = (this.ax[i] ?? 0) + fx * rate;
    this.ay[i] = (this.ay[i] ?? 0) + fy * rate;
  }

  /** 2点の距離を長さ len へ近づける（strength = 1 で一度に戻す） */
  private solve(a: number, b: number, len: number, strength: number): void {
    const px = this.x[a] ?? 0;
    const py = this.y[a] ?? 0;
    const qx = this.x[b] ?? 0;
    const qy = this.y[b] ?? 0;
    const dx = qx - px;
    const dy = qy - py;
    const d = Math.sqrt(dx * dx + dy * dy) || 0.001;
    const diff = ((d - len) / d) * 0.5 * strength;
    this.x[a] = px + dx * diff;
    this.y[a] = py + dy * diff;
    this.x[b] = qx - dx * diff;
    this.y[b] = qy - dy * diff;
  }
}
