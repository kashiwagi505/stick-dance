// 記録から踊りを計算し直す（踊り機能 4章、鑑賞機能 設計判断 No.1）。
// 踊っている最中と同じ Simulation を、刻み0の立ち姿から記録の入力どおりに進める。
import type { Pose } from './body';
import { loopOfTick, loopStartTick, stepsPerLoop, type LoopSettings } from './loop';
import type { DanceRecord } from './record';
import type { Layer } from './session';
import type { DanceSettings } from './settings';
import { Simulation, type StepSample } from './simulation';

/** 記録から、分身ごとの姿勢と拍を作る（分身の並びは記録のとおり） */
export function replay(record: DanceRecord, dance: DanceSettings, loop: LoopSettings): Layer[] {
  const wanted = new Set(record.layers.map((l) => l.loop));
  const poses = new Map<number, Pose[]>();
  const samples = new Map<number, StepSample[]>();
  const per = stepsPerLoop(loop);
  const push = <T>(map: Map<number, T[]>, key: number, value: T): void => {
    if (!wanted.has(key)) return;
    const list = map.get(key) ?? [];
    list.push(value);
    map.set(key, list);
  };
  const onPose = (tick: number, pose: Pose): void => push(poses, loopOfTick(loop, tick), pose);
  const onStep = (sample: StepSample): void => push(samples, Math.floor(sample.step / per), sample);

  const sim = new Simulation(dance, loop);
  for (const e of record.events) {
    sim.advanceTo(e.tick, onPose, onStep);
    sim.setKey(e.key, e.down);
  }
  const last = Math.max(-1, ...record.layers.map((l) => l.loop));
  sim.advanceTo(loopStartTick(loop, last + 1), onPose, onStep);

  return record.layers.map((l) => ({
    loop: l.loop,
    instrument: l.instrument,
    poses: poses.get(l.loop) ?? [],
    samples: samples.get(l.loop) ?? [],
  }));
}
