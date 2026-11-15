import { describe, expect, it } from 'vitest';
import { Body, restPose } from './body';
import { PULLS, type PullKey } from './keys';
import { DEFAULT_LOOP, loopStartTick, noteTick, stepTick, stepsPerLoop } from './loop';
import { DanceSession } from './session';
import { replay } from './replay';
import { DEFAULT_DANCE, JOINTS } from './settings';
import { joinedAt, viewingLoops } from './viewing';

const D = DEFAULT_DANCE;
const L = DEFAULT_LOOP;
const W: PullKey = 0;
const S: PullKey = 2;
const UP: PullKey = 4;
const LEFT_ARROW: PullKey = 5;
const HEAD = JOINTS.indexOf('head');
const L_HAND = JOINTS.indexOf('lHand');
const R_HAND = JOINTS.indexOf('rHand');

/** 押しているキーを n 刻みぶん保ったまま、体を進める */
function run(body: Body, held: PullKey[], n: number): void {
  const set = new Set(held);
  for (let i = 0; i < n; i++) body.step(set);
}

/** 1周の長さ（刻み） */
const loopTicks = (k: number): number => loopStartTick(L, k + 1) - loopStartTick(L, k);

/**
 * 周 k のあいだ、W と S を period 刻みごとに入れ替えて押し続ける（頭が揺れ続け、たくさん鳴る）。
 * 押した刻みを返す
 */
function danceLoop(session: DanceSession, k: number, period = 12): void {
  const start = loopStartTick(L, k);
  const limit = endOfLoopSteps(k);
  let key: PullKey = W;
  for (let t = start; t + period <= limit; t += period) {
    session.advanceTo(t);
    session.press(key, true, t);
    session.advanceTo(t + period - 2);
    session.press(key, false, t + period - 2);
    key = key === W ? S : W;
  }
  session.advanceTo(limit);
}

/** 周 k の最後の拍まで決まり、次の周の拍0（分身の判定）はまだ決まっていない刻み */
function endOfLoopSteps(k: number): number {
  return noteTick(L, stepsPerLoop(L) * (k + 1), D.noteLeadTicks);
}

/** 周 k のあいだ、何も押さずに過ごす */
function idleLoop(session: DanceSession, k: number): void {
  session.advanceTo(endOfLoopSteps(k));
}

describe('拍と刻みの対応（踊り機能 設計判断 No.4・No.5）', () => {
  it('拍の頭の刻みは「拍 × 1800 ÷ テンポ」の切り捨て', () => {
    expect(stepTick(L, 0)).toBe(0);
    expect(stepTick(L, 1)).toBe(Math.floor(1800 / L.bpm));
    expect(stepTick(L, 32)).toBe(Math.floor((32 * 1800) / L.bpm));
    expect(stepTick({ bpm: 120, bars: 4 }, 2)).toBe(30); // 120 BPM では1拍ちょうど15刻み
  });

  it('周の頭は拍 32×周 の刻み。124 BPM では周の長さが 464 か 465 刻み', () => {
    expect(loopStartTick(L, 1)).toBe(stepTick(L, stepsPerLoop(L)));
    for (let k = 0; k < 8; k++) expect([464, 465]).toContain(loopTicks(k));
  });

  it('音を決める刻みは拍の頭から先読みの分だけ前で、0より前にはならない', () => {
    expect(noteTick(L, 10, D.noteLeadTicks)).toBe(stepTick(L, 10) - D.noteLeadTicks);
    expect(noteTick(L, 0, D.noteLeadTicks)).toBe(0);
  });
});

describe('体の物理（F1）', () => {
  it('はじめは立ち姿', () => {
    const body = new Body(D);
    const rest = restPose(D);
    expect(body.pose()).toEqual(rest);
    expect(rest[HEAD]).toEqual({ x: D.rest.head.x, y: D.rest.head.y });
  });

  it('何も押さなければ立ち姿のまま動かない', () => {
    const body = new Body(D);
    run(body, [], 120);
    body.pose().forEach((p, i) => {
      const r = restPose(D)[i];
      expect(p.x).toBeCloseTo(r?.x ?? NaN, 6);
      expect(p.y).toBeCloseTo(r?.y ?? NaN, 6);
    });
  });

  it('W を押している間、画面の左側の手が上へ引かれ、体がつられて動く', () => {
    const body = new Body(D);
    run(body, [W], 20);
    const p = body.pose();
    expect(p[L_HAND]?.y).toBeLessThan(D.rest.lHand.y - 10);
    expect(p[HEAD]?.y).toBeLessThan(D.rest.head.y); // 頭もつられて上へ
    expect(Math.abs((p[R_HAND]?.y ?? 0) - D.rest.rHand.y)).toBeLessThan(Math.abs((p[L_HAND]?.y ?? 0) - D.rest.lHand.y));
  });

  it('← を押すと画面の右側の手が画面の左へ引かれる（引く向きは画面どおり）', () => {
    expect(PULLS[LEFT_ARROW]).toEqual({ hand: 'rHand', x: -1, y: 0 });
    const body = new Body(D);
    run(body, [LEFT_ARROW], 20);
    expect(body.pose()[R_HAND]?.x).toBeLessThan(D.rest.rHand.x - 10);
  });

  it('離すと立ち姿へ揺れ戻る', () => {
    const body = new Body(D);
    run(body, [UP], 30);
    const pulled = body.pose()[R_HAND]?.y ?? 0;
    run(body, [], 600);
    const back = body.pose()[R_HAND]?.y ?? 0;
    expect(Math.abs(back - D.rest.rHand.y)).toBeLessThan(Math.abs(pulled - D.rest.rHand.y) / 10);
  });

  it('どの点も床（y=0）より下へ行かない', () => {
    const body = new Body(D);
    run(body, [S, 6], 120);
    for (const p of body.pose()) expect(p.y).toBeLessThanOrEqual(0);
  });

  it('同じ入力からは、2回計算しても姿勢の列が完全に一致する（N3）', () => {
    const trace = (): number[] => {
      const body = new Body(D);
      const out: number[] = [];
      for (let t = 0; t < 400; t++) {
        const held = new Set<PullKey>(t % 50 < 25 ? [W, 7] : [S]);
        body.step(held);
        for (const p of body.pose()) out.push(p.x, p.y);
      }
      return out;
    };
    expect(trace()).toEqual(trace());
  });
});

describe('踊っている間の拍と分身（F3・F4・F5）', () => {
  it('何も押さなければ頭は動かず、どの拍も鳴らない', () => {
    const s = new DanceSession(D, L);
    const steps = s.advanceTo(endOfLoopSteps(0));
    expect(steps.length).toBe(stepsPerLoop(L));
    expect(steps.every((x) => !x.sample.moved)).toBe(true);
  });

  it('拍は音を決める刻みに着いたときに1つずつ決まり、拍の番号が欠けない', () => {
    const s = new DanceSession(D, L);
    const a = s.advanceTo(noteTick(L, 3, D.noteLeadTicks));
    expect(a.map((x) => x.sample.step)).toEqual([0, 1, 2]);
    const b = s.advanceTo(noteTick(L, 3, D.noteLeadTicks) + 1);
    expect(b.map((x) => x.sample.step)).toEqual([3]);
  });

  it('手を引き続けると頭が動き、動いた拍が鳴る', () => {
    const s = new DanceSession(D, L);
    danceLoop(s, 0);
    expect(s.notesThisLoop).toBeGreaterThanOrEqual(D.keepMinNotes);
  });

  it('1周で分身が残る数以上鳴らすと、周の終わりにその周が分身として残る', () => {
    const s = new DanceSession(D, L);
    danceLoop(s, 0);
    expect(s.layers.length).toBe(0);
    const steps = s.advanceTo(noteTick(L, 32, D.noteLeadTicks) + 1);
    expect(steps.some((x) => x.kept)).toBe(true);
    expect(s.layers.length).toBe(1);
    expect(s.layers[0]?.loop).toBe(0);
    expect(s.layers[0]?.samples.length).toBe(stepsPerLoop(L));
  });

  it('鳴らした数が足りない周は残らない（ちょうど・直前の境界）', () => {
    // 動いた拍の数を数え、境界の手前かどうかで残る・残らないが分かれることを、設定の値から確かめる
    const s = new DanceSession(D, L);
    idleLoop(s, 0);
    s.advanceTo(noteTick(L, 32, D.noteLeadTicks) + 1);
    expect(s.layers.length).toBe(0);
    const t = new DanceSession({ ...D, keepMinNotes: 1 }, L);
    t.press(W, true, 0);
    t.advanceTo(endOfLoopSteps(0));
    expect(t.notesThisLoop).toBeGreaterThanOrEqual(1);
    const moved = t.notesThisLoop;
    const u = new DanceSession({ ...D, keepMinNotes: moved }, L);
    u.press(W, true, 0);
    u.advanceTo(loopStartTick(L, 1) + 1);
    expect(u.layers.length).toBe(1); // ちょうど
    const v = new DanceSession({ ...D, keepMinNotes: moved + 1 }, L);
    v.press(W, true, 0);
    v.advanceTo(loopStartTick(L, 1) + 1);
    expect(v.layers.length).toBe(0); // 1つ足りない
  });

  it('分身は最大5人。5人目が残ったら踊りを終える', () => {
    const s = new DanceSession(D, L);
    for (let k = 0; k < D.maxLayers; k++) danceLoop(s, k);
    s.advanceTo(loopStartTick(L, D.maxLayers) + 1);
    expect(s.layers.length).toBe(D.maxLayers);
    expect(s.finished).toBe(true);
  });

  it('最後の1人を消せる。0人のときは何も起きない', () => {
    const s = new DanceSession(D, L);
    expect(s.removeLast()).toBe(false);
    danceLoop(s, 0);
    danceLoop(s, 1);
    s.advanceTo(loopStartTick(L, 2) + 1);
    expect(s.layers.length).toBe(2);
    expect(s.removeLast()).toBe(true);
    expect(s.layers.map((x) => x.loop)).toEqual([0]);
  });

  it('楽器は選ばなければ、まだ使っていない楽器を番号の小さい順に付ける（D8）', () => {
    const s = new DanceSession(D, L);
    expect(s.instrument).toBe(0);
    danceLoop(s, 0);
    danceLoop(s, 1);
    s.advanceTo(loopStartTick(L, 2) + 1);
    expect(s.layers.map((x) => x.instrument)).toEqual([0, 1]);
    expect(s.instrument).toBe(2);
  });

  it('選んだ楽器が分身の楽器になり、次の人は使っていない楽器のうち番号の小さいもの', () => {
    const s = new DanceSession(D, L);
    s.selectInstrument(3);
    danceLoop(s, 0);
    s.advanceTo(loopStartTick(L, 1) + 1);
    expect(s.layers[0]?.instrument).toBe(3);
    expect(s.instrument).toBe(0);
  });

  it('周の途中で楽器を替えたら、動いた拍でいちばん多く使った楽器がその人の楽器になる', () => {
    // 1周の最初の8拍は 2（ベース）、残りの24拍は 5（打楽器）で踊る
    const s = new DanceSession(D, L);
    s.selectInstrument(1);
    s.press(W, true, 0);
    s.advanceTo(noteTick(L, 8, D.noteLeadTicks));
    s.selectInstrument(4);
    danceLoop(s, 0);
    s.advanceTo(loopStartTick(L, 1) + 1);
    expect(s.layers[0]?.instrument).toBe(4);
    // 2人目の楽器は、使っていないもののうち番号の小さいもの
    expect(s.instrument).toBe(0);
  });

  // 踊った周の次の周の頭は、まだ体が揺れていて少し鳴る。何もしない周が残らないよう、残る数を引き上げて確かめる
  const calm = { ...D, keepMinNotes: 12 };

  it('鑑賞へは分身が1人以上いるときだけ予約でき、予約した周の終わりで踊りを終える', () => {
    const s = new DanceSession(calm, L);
    expect(s.reserveViewing()).toBe(false);
    danceLoop(s, 0);
    s.advanceTo(loopStartTick(L, 1) + 1);
    expect(s.reserveViewing()).toBe(true);
    idleLoop(s, 1);
    s.advanceTo(loopStartTick(L, 2) + 1);
    expect(s.finished).toBe(true);
    expect(s.layers.length).toBe(1);
  });

  it('予約した周が残る数に届いていれば、その周も残してから終える', () => {
    const s = new DanceSession(D, L);
    danceLoop(s, 0);
    s.advanceTo(loopStartTick(L, 1) + 1);
    s.reserveViewing();
    danceLoop(s, 1);
    s.advanceTo(loopStartTick(L, 2) + 1);
    expect(s.finished).toBe(true);
    expect(s.layers.length).toBe(2);
  });

  it('予約のあとに全員消して周が終わったら、予約を取り消して踊りを続ける', () => {
    const s = new DanceSession(calm, L);
    danceLoop(s, 0);
    s.advanceTo(loopStartTick(L, 1) + 1);
    s.reserveViewing();
    s.removeLast();
    idleLoop(s, 1);
    s.advanceTo(loopStartTick(L, 2) + 1);
    expect(s.finished).toBe(false);
    expect(s.reserved).toBe(false);
  });

  it('予約のあとは楽器を選び直せない', () => {
    const s = new DanceSession(D, L);
    danceLoop(s, 0);
    s.advanceTo(loopStartTick(L, 1) + 1);
    s.reserveViewing();
    const before = s.instrument;
    s.selectInstrument(4);
    expect(s.instrument).toBe(before);
  });

  it('同じキーを押したまま押す・押していないのに離すは記録しない', () => {
    const s = new DanceSession(D, L);
    s.press(W, true, 0);
    s.press(W, true, 3);
    s.press(S, false, 4);
    s.press(W, false, 5);
    expect(s.record().events).toEqual([]); // 分身が0人なら記録は空（記録の範囲 = 最後の分身の周まで）
    expect(s.allEvents().map((e) => [e.tick, e.key, e.down])).toEqual([
      [0, W, true],
      [5, W, false],
    ]);
  });

  it('計算済みの刻みより前の入力は、計算済みの次の刻みに付く', () => {
    const s = new DanceSession(D, L);
    s.advanceTo(100);
    s.press(W, true, 90);
    expect(s.allEvents()[0]?.tick).toBe(100);
  });

  it('一時停止に入るときは、押しているキーをすべて離したことにする', () => {
    const s = new DanceSession(D, L);
    s.press(W, true, 0);
    s.press(UP, true, 0);
    s.advanceTo(30);
    s.releaseAll(30);
    expect(s.allEvents().filter((e) => !e.down).map((e) => e.key).sort()).toEqual([W, UP].sort());
  });
});

describe('記録（技術選定 3.1）と計算し直し（N3）', () => {
  it('記録に入るのはキー入力と、分身ごとの周の番号と楽器だけ', () => {
    const s = new DanceSession(D, L);
    danceLoop(s, 0);
    s.advanceTo(loopStartTick(L, 1) + 1);
    const r = s.record();
    expect(Object.keys(r).sort()).toEqual(['events', 'layers']);
    expect(r.layers).toEqual([{ loop: 0, instrument: 0 }]);
    for (const e of r.events) expect(Object.keys(e).sort()).toEqual(['down', 'key', 'tick']);
  });

  it('記録は最後の分身の周の終わりより前の入力だけを持つ', () => {
    const s = new DanceSession(D, L);
    danceLoop(s, 0);
    danceLoop(s, 1); // 2周目も踊るが、消すので記録の範囲は1周目まで
    s.advanceTo(loopStartTick(L, 2) + 1);
    s.removeLast();
    const end = loopStartTick(L, 1);
    expect(s.record().events.every((e) => e.tick < end)).toBe(true);
    expect(s.record().events.length).toBeGreaterThan(0);
  });

  it('記録から計算し直した分身は、踊っていたときの分身と同じ姿勢と同じ拍（頭の位置・動いたか）になる', () => {
    const s = new DanceSession(D, L);
    idleLoop(s, 0);
    danceLoop(s, 1, 10);
    danceLoop(s, 2, 17);
    danceLoop(s, 3, 23);
    s.advanceTo(loopStartTick(L, 4) + 1);
    s.removeLast(); // 消した周の入力も、後の分身の動きに影響しないことを確かめる
    danceLoop(s, 4, 13);
    s.advanceTo(loopStartTick(L, 5) + 1);
    expect(s.layers.map((x) => x.loop)).toEqual([1, 2, 4]);
    const again = replay(s.record(), D, L);
    expect(again.length).toBe(3);
    again.forEach((layer, i) => {
      const live = s.layers[i];
      expect(layer.loop).toBe(live?.loop);
      expect(layer.instrument).toBe(live?.instrument);
      expect(layer.samples).toEqual(live?.samples);
      expect(layer.poses.length).toBe(loopTicks(layer.loop));
      expect(layer.poses).toEqual(live?.poses.slice(0, layer.poses.length));
    });
  });

  it('同じ記録から2回計算し直しても一致する', () => {
    const s = new DanceSession(D, L);
    danceLoop(s, 0);
    s.advanceTo(loopStartTick(L, 1) + 1);
    expect(replay(s.record(), D, L)).toEqual(replay(s.record(), D, L));
  });

  it('違う踊りの記録からは、違う拍の並びになる（AC1 の数えられる部分）', () => {
    const a = new DanceSession(D, L);
    danceLoop(a, 0, 12);
    a.advanceTo(loopStartTick(L, 1) + 1);
    const b = new DanceSession(D, L);
    danceLoop(b, 0, 30);
    b.advanceTo(loopStartTick(L, 1) + 1);
    expect(replay(a.record(), D, L)[0]?.samples).not.toEqual(replay(b.record(), D, L)[0]?.samples);
  });
});

describe('鑑賞の周の順番（F7・鑑賞機能 設計判断 No.2）', () => {
  it('n 人のとき、周 i には i+1 人が加わり、全員そろってから終わりの周を流す', () => {
    expect(viewingLoops(3, D)).toBe(3 + D.endingLoops);
    expect([0, 1, 2, 3].map((i) => joinedAt(3, i))).toEqual([1, 2, 3, 3]);
    expect(joinedAt(5, 4)).toBe(5);
  });
});
