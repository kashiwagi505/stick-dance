// 刻みを進め、拍を決める流れ（踊り機能 3章）。踊っている最中（DanceSession）と、
// 記録からの計算し直し（replay）で同じものを使う。同じ入力からは必ず同じ姿勢と拍になる。
import { Body, type Point, type Pose } from './body';
import type { PullKey } from './keys';
import { noteTick, type LoopSettings } from './loop';
import type { DanceSettings } from './settings';

export type { Point, Pose };

/** 拍（8分音符）の、音を決める刻みの頭の位置と、動いたか */
export interface StepSample {
  /** 拍の通し番号（踊り始めが0） */
  step: number;
  head: Point;
  moved: boolean;
}

const HEAD = 0; // JOINTS の先頭が頭

/**
 * 体を刻みごとに進め、拍を決める。
 * 刻み t の処理は「t の姿勢を渡す → 音を決める刻みが t の拍を決める → t の入力を当てて t+1 へ進める」の順。
 */
export class Simulation {
  private readonly body: Body;
  private readonly held = new Set<PullKey>();
  private current = 0;
  private nextStep = 0;
  private lastHead: Point | null = null;

  constructor(
    private readonly dance: DanceSettings,
    private readonly loop: LoopSettings,
  ) {
    this.body = new Body(dance);
  }

  /** まだ計算していない最初の刻み（今の姿勢はこの刻みのもの） */
  get tick(): number {
    return this.current;
  }

  /** 今の姿勢 */
  pose(): Pose {
    return this.body.pose();
  }

  /** 押しているキー */
  heldKeys(): ReadonlySet<PullKey> {
    return this.held;
  }

  /** 今の刻みの入力を当てる（次に進める計算から効く） */
  setKey(key: PullKey, down: boolean): void {
    if (down) this.held.add(key);
    else this.held.delete(key);
  }

  /**
   * 刻み until の手前まで進める。刻みごとに姿勢を onPose へ、決まった拍を onStep へ渡す。
   */
  advanceTo(until: number, onPose: (tick: number, pose: Pose) => void, onStep: (sample: StepSample) => void): void {
    while (this.current < until) {
      const pose = this.body.pose();
      onPose(this.current, pose);
      while (noteTick(this.loop, this.nextStep, this.dance.noteLeadTicks) <= this.current) {
        onStep(this.sample(pose));
        this.nextStep++;
      }
      this.body.step(this.held);
      this.current++;
    }
  }

  private sample(pose: Pose): StepSample {
    const h = pose[HEAD] ?? { x: 0, y: 0 };
    const head = { x: h.x, y: h.y };
    let moved = false;
    if (this.lastHead) {
      const dx = head.x - this.lastHead.x;
      const dy = head.y - this.lastHead.y;
      moved = Math.sqrt(dx * dx + dy * dy) > this.dance.moveThreshold;
    }
    this.lastHead = head;
    return { step: this.nextStep, head, moved };
  }
}
