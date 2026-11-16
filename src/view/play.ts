// SCR02 踊る画面（画面設計 SCR02_踊る画面.md）。キーを受けて踊りへ渡し、決まった拍を音にして予約し、描く。
import { SoundEngine } from '../audio/engine';
import { isInstrument, type PullKey } from '../core/keys';
import { DEFAULT_LOOP, stepSeconds, stepsPerLoop } from '../core/loop';
import type { DanceRecord } from '../core/record';
import { DanceSession, layerPoseAt, type Layer } from '../core/session';
import { DEFAULT_DANCE, TICKS_PER_SECOND } from '../core/settings';
import { accompaniment, degreeOf, layerNotes, noteFor, type Note } from '../music/notes';
import { DEFAULT_MUSIC, INSTRUMENT_NAMES, PERC_NAMES, SCALE_NAMES, percKindOf } from '../music/settings';
import { h, instrumentColor, key } from './dom';
import { clearStage, drawFigure, drawLabel, drawLadder, drawPulls, drawTrail, groupLabels, readPalette, scaleLabels } from './draw';
import { Score } from './score';
import { VIEW_SETTINGS as V } from './settings';
import { TEXT } from './text';

const D = DEFAULT_DANCE;
const L = DEFAULT_LOOP;
const M = DEFAULT_MUSIC;
const T = TEXT.play;

/** キーボードのキー → 手を引くキーの番号（F1。画面の左側の手＝WASD、画面の右側の手＝矢印キー） */
const PULL_CODES: Readonly<Record<string, PullKey>> = {
  KeyW: 0,
  KeyA: 1,
  KeyS: 2,
  KeyD: 3,
  ArrowUp: 4,
  ArrowLeft: 5,
  ArrowDown: 6,
  ArrowRight: 7,
};

/** 拍の時刻に画面へ反映する出来事 */
type Visual =
  | { time: number; kind: 'live'; step: number; degree: number; x: number; y: number }
  | { time: number; kind: 'ghost'; person: number; step: number }
  | { time: number; kind: 'loop'; loop: number };

/** 踊る画面を出す。踊りを終えたら onFinish に記録と鑑賞の始まり（音の時計の時刻）を渡す。片付ける関数を返す */
export function mountPlay(root: HTMLElement, engine: SoundEngine, onFinish: (record: DanceRecord, start: number) => void): () => void {
  const session = new DanceSession(D, L);
  const per = stepsPerLoop(L);
  const stepSec = stepSeconds(L);
  const t0 = SoundEngine.now() + V.startLeadSeconds;
  const palette = readPalette();
  // はしごの名前（音の名前は段ごと、打楽器は同じ種類の段をまとめる。SCR02 3.1 No.4）
  const scaleNameLabels = scaleLabels(SCALE_NAMES);
  const percLabels = groupLabels(SCALE_NAMES.map((_, i) => PERC_NAMES[percKindOf(i)]));

  // ---- 画面の組み立て（モックアップ SCR02_踊る画面.html と同じ形） ----
  const instButtons = INSTRUMENT_NAMES.map((name, i) => {
    const b = h('button', { type: 'button', class: 'instrument', 'aria-pressed': 'false' }, h('span', { class: 'instrument__num' }, String(i + 1)), name, h('span', { class: 'instrument__used' }));
    b.style.setProperty('--inst', `var(--color-inst-${i + 1})`);
    b.addEventListener('click', () => select(i));
    return b;
  });
  const count = h('p', { class: 'play__count' });
  const remove = h('button', { type: 'button', class: 'button button--secondary' }, T.removeLast);
  const toView = h('button', { type: 'button', class: 'button button--primary' }, T.toViewing);
  const canvas = h('canvas', { class: 'stage__canvas', width: String(V.stageWidth), height: String(V.stageHeight), 'aria-label': T.stage });
  const hint = h(
    'section',
    { class: 'overlay play__hint', 'aria-labelledby': 'hint-title' },
    h('h3', { class: 'overlay__title', id: 'hint-title' }, T.hintTitle),
    h(
      'ul',
      { class: 'hint__list' },
      h('li', {}, h('span', { class: 'hint__keys' }, key('W'), key('A'), key('S'), key('D')), T.hintLeft),
      h('li', {}, h('span', { class: 'hint__keys' }, key('↑'), key('←'), key('↓'), key('→')), T.hintRight),
      h('li', {}, T.hintSound),
    ),
    h('p', { class: 'overlay__note' }, key('1'), '〜', key('5'), T.hintInstrumentAfter),
  );
  const pauseNote = h('p', { class: 'overlay__note' });
  const paused = h('section', { class: 'overlay overlay--center', role: 'status', 'aria-labelledby': 'paused-title', hidden: true }, h('h3', { class: 'overlay__title', id: 'paused-title' }, TEXT.pause.title), pauseNote);
  const guide = h('span');
  const event = h('span', { role: 'status' });
  const score = new Score(per);
  const main = h(
    'main',
    { class: 'play' },
    h('h1', { class: 'visually-hidden' }, TEXT.title),
    h('h2', { class: 'visually-hidden' }, T.heading),
    h('div', { class: 'play__bar' }, h('div', { class: 'instruments', role: 'group', 'aria-label': T.instruments }, ...instButtons), count, h('div', { class: 'play__actions' }, remove, toView)),
    h('div', { class: 'stage' }, canvas, hint, paused),
    h('p', { class: 'play__guide' }, guide, event),
    score.element,
  );
  root.replaceChildren(main);
  const ctx = canvas.getContext('2d');

  // ---- 状態 ----
  let ghostNotes: (Note | null)[][] = [];
  let liveOn = new Set<number>();
  const visuals: Visual[] = [];
  const trail: { x: number; y: number; time: number }[] = [];
  let liveFlash = -Infinity;
  let liveRinging = -1;
  const ghostFlash: number[] = [];
  let pauseReason: 'space' | 'hidden' | null = null;
  let raf = 0;
  let ended = false;

  const currentTick = (): number => Math.max(0, Math.floor((SoundEngine.now() - t0) * TICKS_PER_SECOND));

  function rebuildLayers(): void {
    ghostNotes = session.layers.map((l, k) => layerNotes(l.samples, l.instrument, k, M, D));
    score.setRows([
      ...session.layers.map((l, k) => ({ color: instrumentColor(l.instrument), on: stepsOf(ghostNotes[k] ?? []) })),
      { color: instrumentColor(session.instrument), on: liveOn },
    ]);
  }

  function refreshControls(): void {
    const used = new Set<number>(session.layers.map((l: Layer) => l.instrument));
    instButtons.forEach((b, i) => {
      b.setAttribute('aria-pressed', String(i === session.instrument));
      const mark = b.querySelector('.instrument__used');
      if (mark) mark.textContent = used.has(i) ? T.used : '';
      b.disabled = session.reserved;
    });
    count.textContent = T.count(session.layers.length, D.maxLayers);
    remove.disabled = session.layers.length === 0;
    toView.disabled = session.layers.length === 0 || session.reserved;
    toView.textContent = session.reserved ? T.toViewingReserved : T.toViewing;
    guide.textContent = session.reserved ? T.reserved : T.dancing(session.layers.length + 1, session.notesThisLoop, D.keepMinNotes);
  }

  function select(i: number): void {
    if (!isInstrument(i) || pauseReason) return;
    session.selectInstrument(i);
    rebuildLayers();
    refreshControls();
  }

  function removeLast(): void {
    const n = session.layers.length;
    if (!session.removeLast()) return;
    event.textContent = T.removed(n);
    rebuildLayers();
    refreshControls();
  }

  function reserve(): void {
    if (session.reserveViewing()) refreshControls();
  }

  async function pause(reason: 'space' | 'hidden'): Promise<void> {
    if (pauseReason) return;
    pauseReason = reason;
    session.releaseAll(currentTick());
    pauseNote.replaceChildren(...(reason === 'space' ? [key('Space'), TEXT.pause.bySpace] : [TEXT.pause.byHidden]));
    paused.hidden = false;
    await SoundEngine.pause();
  }

  async function resume(): Promise<void> {
    if (!pauseReason) return;
    pauseReason = null;
    paused.hidden = true;
    await SoundEngine.resume();
  }

  // ---- 拍を音と出来事にする ----
  function handleSteps(): void {
    if (pauseReason) return;
    for (const s of session.advanceTo(currentTick())) {
      const step = s.sample.step;
      const inLoop = step % per;
      const time = t0 + step * stepSec;
      if (s.kept) {
        event.textContent = T.kept(session.layers.length);
        liveOn = new Set();
        rebuildLayers();
      }
      if (s.finished) {
        finish(time);
        return;
      }
      if (inLoop === 0 && step > 0) {
        if (!s.kept) event.textContent = '';
        visuals.push({ time, kind: 'loop', loop: step / per });
      }
      for (const hit of accompaniment(inLoop, M)) engine.playAccompaniment(hit, time);
      const note = noteFor(s.sample, s.instrument, session.layers.length, M, D);
      if (note) {
        engine.playNote(note, time, 'live');
        visuals.push({ time, kind: 'live', step: inLoop, degree: note.degree, x: s.sample.head.x, y: s.sample.head.y });
      }
      ghostNotes.forEach((notes, k) => {
        const n = notes[inLoop];
        if (!n) return;
        engine.playNote(n, time, 'ghost');
        visuals.push({ time, kind: 'ghost', person: k, step: inLoop });
      });
    }
  }

  function applyVisuals(now: number): void {
    score.clearRinging();
    while (visuals.length > 0 && (visuals[0]?.time ?? Infinity) <= now) {
      const v = visuals.shift();
      if (!v) break;
      if (v.kind === 'loop') {
        liveOn = new Set();
        score.clearRow(session.layers.length);
        if (v.loop >= 1) hint.hidden = true;
      } else if (v.kind === 'live') {
        liveOn.add(v.step);
        score.light(session.layers.length, v.step, true);
        liveFlash = v.time;
        liveRinging = v.degree;
        trail.push({ x: v.x, y: v.y, time: v.time });
      } else {
        ghostFlash[v.person] = v.time;
        score.ringColumn(v.step, [v.person]);
      }
    }
    while (trail.length > 0 && now - (trail[0]?.time ?? now) > V.trailSeconds) trail.shift();
  }

  function draw(now: number): void {
    if (!ctx) return;
    const tick = session.tick;
    clearStage(ctx, palette);
    session.layers.forEach((layer, k) => {
      const pose = layerPoseAt(layer, L, tick);
      const x = V.stageWidth * (V.ghostSlots[k] ?? 0.5);
      const color = instrumentColor(layer.instrument);
      if (pose) drawFigure(ctx, pose, x, V.ghostScale, color, now - (ghostFlash[k] ?? -Infinity) < V.flashSeconds, palette);
      drawLabel(ctx, T.ghostLabel(k + 1, INSTRUMENT_NAMES[layer.instrument]), x, color, palette);
    });
    const cx = V.stageWidth / 2;
    const color = instrumentColor(session.instrument);
    const pose = session.pose();
    drawTrail(ctx, trail.map((d) => ({ x: cx + d.x, y: d.y, age: now - d.time })), palette);
    const glow = now - liveFlash < V.flashSeconds;
    drawFigure(ctx, pose, cx, 1, color, glow, palette);
    drawPulls(ctx, pose, cx, session.heldKeys(), palette);
    const labels = session.instrument === 4 ? percLabels : scaleNameLabels;
    drawLadder(ctx, cx, SCALE_NAMES.length, labels, degreeOf(pose[0]?.y ?? 0, M, D), glow ? liveRinging : -1, color, palette);
    const sinceStart = now - t0;
    score.setPlayhead(sinceStart >= 0 ? Math.floor(sinceStart / stepSec) % per : null);
  }

  function frame(): void {
    if (ended) return;
    const now = SoundEngine.now();
    handleSteps();
    if (ended) return;
    applyVisuals(now);
    refreshControls();
    draw(now);
    raf = requestAnimationFrame(frame);
  }

  function finish(start: number): void {
    ended = true;
    const record = session.record();
    cleanup();
    onFinish(record, start);
  }

  // ---- 入力 ----
  function onKeyDown(e: KeyboardEvent): void {
    const pull = PULL_CODES[e.code];
    if (pull !== undefined) {
      e.preventDefault();
      if (!pauseReason && !e.repeat) session.press(pull, true, currentTick());
      return;
    }
    const onButton = document.activeElement instanceof HTMLButtonElement;
    if (e.code === 'Space') {
      if (onButton) return; // フォーカス中のボタンを押す操作として扱う
      e.preventDefault();
      if (!e.repeat) void (pauseReason === 'space' ? resume() : pause('space'));
      return;
    }
    if (pauseReason || e.repeat) return;
    const digit = /^Digit([1-5])$/.exec(e.code);
    if (digit) {
      select(Number(digit[1]) - 1);
      return;
    }
    if (e.code === 'Backspace') {
      e.preventDefault();
      removeLast();
      return;
    }
    if (e.code === 'Enter' && !onButton) reserve();
  }

  function onKeyUp(e: KeyboardEvent): void {
    const pull = PULL_CODES[e.code];
    if (pull !== undefined && !pauseReason) session.press(pull, false, currentTick());
  }

  function onBlur(): void {
    session.releaseAll(currentTick());
  }

  function onVisibility(): void {
    if (document.visibilityState === 'hidden') void pause('hidden');
    else if (pauseReason === 'hidden') void resume();
  }

  remove.addEventListener('click', removeLast);
  toView.addEventListener('click', reserve);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onVisibility);

  function cleanup(): void {
    ended = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    document.removeEventListener('visibilitychange', onVisibility);
  }

  rebuildLayers();
  refreshControls();
  raf = requestAnimationFrame(frame);
  return cleanup;
}

/** 音の並びのうち、鳴る拍の番号 */
function stepsOf(notes: readonly (Note | null)[]): Set<number> {
  const out = new Set<number>();
  notes.forEach((n, i) => {
    if (n) out.add(i);
  });
  return out;
}

