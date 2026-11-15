// 踊っている間の状態（SCR02。踊り機能）。記録・今の周・分身・選んでいる楽器・鑑賞の予約を進める。
// 物理と拍は Simulation に任せ、記録からの計算し直し（replay）と同じ結果になる。
import type { Pose } from './body';
import type { Instrument, PullKey } from './keys';
import { loopOfTick, loopStartTick, stepsPerLoop, type LoopSettings } from './loop';
import type { DanceRecord, KeyEvent } from './record';
import type { DanceSettings } from './settings';
import { Simulation, type StepSample } from './simulation';

/** 分身1人（周の姿勢と32拍ぶんの拍） */
export interface Layer {
  loop: number;
  instrument: Instrument;
  /** その周の刻みごとの姿勢（周の頭の刻みから） */
  poses: Pose[];
  /** その周の拍（周の頭の拍から32個） */
  samples: StepSample[];
}

/** 決まった拍1つと、そのときに起きたこと */
export interface SessionStep {
  sample: StepSample;
  /** その拍の音を決めた刻みに選ばれていた楽器 */
  instrument: Instrument;
  /** この拍が周の頭で、直前の周が分身として残った */
  kept: boolean;
  /** この拍が周の頭で、踊りを終えた（鑑賞へ） */
  finished: boolean;
}

/** 分身の、刻み tick の姿勢（周の中の同じ位置。周が1刻み短いときは最後の姿勢） */
export function layerPoseAt(layer: Layer, loop: LoopSettings, tick: number): Pose | undefined {
  const offset = tick - loopStartTick(loop, loopOfTick(loop, tick));
  return layer.poses[Math.min(offset, layer.poses.length - 1)];
}

/** 踊っている間の状態 */
export class DanceSession {
  private readonly sim: Simulation;
  private readonly events: KeyEvent[] = [];
  private readonly pending: KeyEvent[] = [];
  private readonly logicalHeld = new Set<PullKey>();
  private readonly kept: Layer[] = [];
  private readonly posesByLoop = new Map<number, Pose[]>();
  private loopSamples: { sample: StepSample; instrument: Instrument }[] = [];
  private stepLoop = 0;
  private current: Instrument = 0;
  private reservedFlag = false;
  private finishedFlag = false;

  constructor(
    private readonly dance: DanceSettings,
    private readonly loopSettings: LoopSettings,
  ) {
    this.sim = new Simulation(dance, loopSettings);
  }

  /** 残った分身（残った順） */
  get layers(): readonly Layer[] {
    return this.kept;
  }

  /** いま選んでいる楽器 */
  get instrument(): Instrument {
    return this.current;
  }

  /** いちばん新しく決まった拍の周（0始まり） */
  get loop(): number {
    return this.stepLoop;
  }

  /** いちばん新しく決まった拍の周で、これまでに鳴った（動いた）拍の数 */
  get notesThisLoop(): number {
    return this.loopSamples.filter((x) => x.sample.moved).length;
  }

  /** 鑑賞へ進む予約があるか */
  get reserved(): boolean {
    return this.reservedFlag;
  }

  /** 踊りを終えたか（鑑賞へ切り替える） */
  get finished(): boolean {
    return this.finishedFlag;
  }

  /** 計算済みの最後の刻みの次（今の姿勢の刻み） */
  get tick(): number {
    return this.sim.tick;
  }

  /** 今の姿勢 */
  pose(): Pose {
    return this.sim.pose();
  }

  /** 今の物理に効いている押しているキー */
  heldKeys(): ReadonlySet<PullKey> {
    return this.sim.heldKeys();
  }

  /**
   * キーを押した・離した。tick は音の時計から求めた今の刻み。
   * 計算済みの刻みより前なら計算済みの次の刻みに付ける（踊り機能 設計判断 No.8）。
   * 押したまま押す・押していないのに離すは記録しない（同 No.7）
   */
  press(key: PullKey, down: boolean, tick: number): void {
    if (this.finishedFlag) return;
    if (this.logicalHeld.has(key) === down) return;
    if (down) this.logicalHeld.add(key);
    else this.logicalHeld.delete(key);
    const last = this.pending[this.pending.length - 1]?.tick ?? this.sim.tick;
    const event: KeyEvent = { tick: Math.max(tick, this.sim.tick, last), key, down };
    this.events.push(event);
    this.pending.push(event);
  }

  /** 押しているキーをすべて離したことにする（一時停止。同 No.14） */
  releaseAll(tick: number): void {
    for (const key of [...this.logicalHeld].sort((a, b) => a - b)) this.press(key, false, tick);
  }

  /** 楽器を選ぶ。鑑賞の予約のあとは選べない */
  selectInstrument(instrument: Instrument): void {
    if (this.reservedFlag || this.finishedFlag) return;
    this.current = instrument;
  }

  /** いちばん新しく残った分身を消す。0人なら false */
  removeLast(): boolean {
    if (this.finishedFlag || this.kept.length === 0) return false;
    this.kept.pop();
    return true;
  }

  /** 鑑賞へ進む予約をする。分身が0人なら false */
  reserveViewing(): boolean {
    if (this.finishedFlag || this.kept.length === 0) return false;
    this.reservedFlag = true;
    return true;
  }

  /** 刻み tick の手前まで進め、その間に決まった拍を返す */
  advanceTo(tick: number): SessionStep[] {
    const out: SessionStep[] = [];
    if (this.finishedFlag) return out;
    const onPose = (t: number, pose: Pose): void => this.keepPose(t, pose);
    const onStep = (sample: StepSample): void => {
      if (this.finishedFlag) return;
      out.push(this.decide(sample));
    };
    while (this.pending.length > 0 && (this.pending[0]?.tick ?? Infinity) < tick) {
      const e = this.pending.shift();
      if (!e) break;
      this.sim.advanceTo(e.tick, onPose, onStep);
      this.sim.setKey(e.key, e.down);
    }
    this.sim.advanceTo(tick, onPose, onStep);
    return out;
  }

  /** これまでのキー入力すべて（記録の範囲で切る前） */
  allEvents(): readonly KeyEvent[] {
    return this.events;
  }

  /** 記録（最後の分身の周の終わりより前のキー入力と、分身の一覧。共有機能 設計判断 No.3） */
  record(): DanceRecord {
    const lastLayer = this.kept[this.kept.length - 1];
    if (!lastLayer) return { events: [], layers: [] };
    const end = loopStartTick(this.loopSettings, lastLayer.loop + 1);
    return {
      events: this.events.filter((e) => e.tick < end).map((e) => ({ ...e })),
      layers: this.kept.map((l) => ({ loop: l.loop, instrument: l.instrument })),
    };
  }

  private keepPose(tick: number, pose: Pose): void {
    const loop = loopOfTick(this.loopSettings, tick);
    let list = this.posesByLoop.get(loop);
    if (!list) {
      list = [];
      this.posesByLoop.set(loop, list);
      this.posesByLoop.delete(loop - 2); // 分身になった周の配列は分身が持っている
    }
    list.push(pose);
  }

  private decide(sample: StepSample): SessionStep {
    const per = stepsPerLoop(this.loopSettings);
    const loop = Math.floor(sample.step / per);
    let kept = false;
    if (loop !== this.stepLoop) {
      kept = this.closeLoop(this.stepLoop);
      this.stepLoop = loop;
      this.loopSamples = [];
    }
    if (this.finishedFlag) return { sample, instrument: this.current, kept, finished: true };
    this.loopSamples.push({ sample, instrument: this.current });
    return { sample, instrument: this.current, kept, finished: false };
  }

  /** 周の終わりの判定（踊り機能 設計判断 No.10〜13）。分身が残ったら true */
  private closeLoop(loop: number): boolean {
    const moved = this.loopSamples.filter((x) => x.sample.moved);
    let kept = false;
    if (moved.length >= this.dance.keepMinNotes && this.kept.length < this.dance.maxLayers) {
      this.kept.push({
        loop,
        instrument: majority(moved.map((x) => x.instrument)),
        poses: this.posesByLoop.get(loop) ?? [],
        samples: this.loopSamples.map((x) => x.sample),
      });
      this.current = nextUnused(this.kept.map((l) => l.instrument));
      kept = true;
    }
    if (this.kept.length >= this.dance.maxLayers || this.reservedFlag) {
      if (this.kept.length > 0) this.finishedFlag = true;
      else this.reservedFlag = false;
    }
    return kept;
  }
}

/** いちばん多い楽器（同じ数なら番号の小さいほう） */
function majority(list: readonly Instrument[]): Instrument {
  const counts = [0, 0, 0, 0, 0];
  for (const i of list) counts[i] = (counts[i] ?? 0) + 1;
  let best: Instrument = 0;
  for (const i of [1, 2, 3, 4] as const) if ((counts[i] ?? 0) > (counts[best] ?? 0)) best = i;
  return best;
}

/** 使っていない楽器のうち番号のいちばん小さいもの。全部使われていれば 0 */
function nextUnused(used: readonly Instrument[]): Instrument {
  for (const i of [0, 1, 2, 3, 4] as const) if (!used.includes(i)) return i;
  return 0;
}
