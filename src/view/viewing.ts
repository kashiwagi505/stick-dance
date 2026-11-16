// SCR03 鑑賞画面・SCR04 共有を開いた画面（画面設計 SCR03・SCR04、鑑賞機能）。
// どちらも記録から計算し直した踊りと音を、1周ごとに1人ずつ加えて再生する。
import { SoundEngine, loadSounds } from '../audio/engine';
import { restPose } from '../core/body';
import { DEFAULT_LOOP, loopOfTick, loopSeconds, loopStartTick, stepSeconds, stepsPerLoop } from '../core/loop';
import type { DanceRecord } from '../core/record';
import { replay } from '../core/replay';
import { DEFAULT_DANCE, TICKS_PER_SECOND } from '../core/settings';
import { joinedAt, viewingLoops } from '../core/viewing';
import { accompaniment, layerNotes } from '../music/notes';
import { DEFAULT_MUSIC, INSTRUMENT_NAMES } from '../music/settings';
import { encodeRecord } from '../share/share';
import { DEFAULT_SHARE } from '../share/settings';
import { h, instrumentColor, setStatus } from './dom';
import { clearStage, drawFigure, drawLabel, readPalette } from './draw';
import { Score } from './score';
import { VIEW_SETTINGS as V } from './settings';
import { TEXT } from './text';

const D = DEFAULT_DANCE;
const L = DEFAULT_LOOP;
const M = DEFAULT_MUSIC;

/** どこから来た鑑賞か */
export type ViewingMode =
  | { kind: 'own'; record: DanceRecord; start: number; engine: SoundEngine }
  | { kind: 'shared'; record: DanceRecord; getEngine: () => SoundEngine; onDanceToo: () => void };

/** 鑑賞を出す。片付ける関数を返す */
export function mountViewing(root: HTMLElement, mode: ViewingMode): () => void {
  const layers = replay(mode.record, D, L);
  const n = layers.length;
  const notes = layers.map((l, k) => layerNotes(l.samples, l.instrument, k, M, D));
  const per = stepsPerLoop(L);
  const stepSec = stepSeconds(L);
  const totalLoops = viewingLoops(n, D);
  const totalSteps = totalLoops * per;
  const palette = readPalette();
  const rest = restPose(D);
  const own = mode.kind === 'own';

  // ---- 画面の組み立て（モックアップ SCR03・SCR04 と同じ形） ----
  const progress = h('p', { class: 'view__progress', role: 'status' });
  const canvas = h('canvas', { class: 'stage__canvas', width: String(V.stageWidth), height: String(V.stageHeight), 'aria-label': TEXT.play.stage });
  const panelTitle = h('h3', { class: 'overlay__title', id: 'panel-title' });
  const panelLead = h('p', { class: 'view__lead' });
  const primary = h('button', { type: 'button', class: 'button button--primary' });
  const secondary = h('button', { type: 'button', class: 'button button--secondary' }, TEXT.viewing.again);
  const status = h('p', { class: 'status status--info', role: 'status' });
  const urlInput = h('input', { id: 'share-url', type: 'text', readonly: true });
  const urlBox = h('div', { class: 'view__url', hidden: true }, h('label', { for: 'share-url' }, TEXT.viewing.urlLabel), urlInput);
  const note = h('p', { class: 'overlay__note' });
  const panel = h('section', { class: 'overlay overlay--center view__end', role: 'status', 'aria-labelledby': 'panel-title', hidden: true }, panelTitle, panelLead, h('div', { class: 'view__buttons' }, primary, secondary), status, urlBox, note);
  const paused = h(
    'section',
    { class: 'overlay overlay--center', role: 'status', 'aria-labelledby': 'paused-title', hidden: true },
    h('h3', { class: 'overlay__title', id: 'paused-title' }, TEXT.pause.title),
    h('p', { class: 'overlay__note' }, TEXT.pause.byHidden),
  );
  const score = new Score(per);
  root.replaceChildren(
    h(
      'main',
      { class: 'screen view' },
      h('h1', { class: 'visually-hidden' }, TEXT.title),
      h('h2', { class: 'visually-hidden' }, own ? TEXT.viewing.heading : TEXT.shared.heading),
      progress,
      h('div', { class: 'stage' }, canvas, panel, paused),
      score.element,
    ),
  );
  const ctx = canvas.getContext('2d');

  // ---- 状態 ----
  let engine: SoundEngine | null = own ? mode.engine : null;
  let start = 0;
  let nextStep = 0;
  let playing = false;
  let shownJoined = -1;
  let raf = 0;
  let hidden = false;
  let shareUrl: string | null = null;
  /** 主ボタンを押したときにすること */
  let action: 'copy' | 'play' | 'danceToo' | 'reload' | 'none' = 'none';
  const flash: number[] = [];
  const pendingFlash: { time: number; person: number; step: number }[] = [];

  function setRows(joined: number): void {
    score.setRows(layers.map((l, k) => ({ color: instrumentColor(l.instrument), on: k < joined ? stepsOf(notes[k] ?? []) : new Set<number>() })));
  }

  function play(at: number): void {
    start = at;
    nextStep = 0;
    playing = true;
    shownJoined = -1;
    panel.hidden = true;
    pendingFlash.length = 0;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  function schedule(now: number): void {
    if (!engine) return;
    while (nextStep < totalSteps && start + nextStep * stepSec < now + engine.aheadSeconds) {
      const time = start + nextStep * stepSec;
      const inLoop = nextStep % per;
      const joined = joinedAt(n, Math.floor(nextStep / per));
      for (const hit of accompaniment(inLoop, M)) engine.playAccompaniment(hit, time);
      for (let k = 0; k < joined; k++) {
        const nt = notes[k]?.[inLoop];
        if (!nt) continue;
        engine.playNote(nt, time);
        pendingFlash.push({ time, person: k, step: inLoop });
      }
      nextStep++;
    }
  }

  function draw(now: number, joined: number, still: boolean): void {
    if (!ctx) return;
    clearStage(ctx, palette);
    const shown = still && !playing ? n : joined;
    const scale = Math.min(V.viewScaleMax, V.viewScaleSpread / (shown + 1));
    const tick = Math.max(0, Math.floor((now - start) * TICKS_PER_SECOND));
    const offset = tick - loopStartTick(L, loopOfTick(L, tick));
    for (let k = 0; k < shown; k++) {
      const layer = layers[k];
      if (!layer) continue;
      const pose = still ? rest : (layer.poses[Math.min(offset, layer.poses.length - 1)] ?? rest);
      const x = (V.stageWidth * (k + 1)) / (shown + 1);
      const color = instrumentColor(layer.instrument);
      drawFigure(ctx, pose, x, scale, color, !still && now - (flash[k] ?? -Infinity) < V.flashSeconds, palette);
      drawLabel(ctx, TEXT.play.ghostLabel(k + 1, INSTRUMENT_NAMES[layer.instrument]), x, color, palette);
    }
  }

  function frame(): void {
    const now = SoundEngine.now();
    if (!hidden) schedule(now);
    const elapsed = now - start;
    if (elapsed >= totalLoops * loopSeconds(L)) {
      end();
      return;
    }
    const viewLoop = Math.max(0, Math.floor(elapsed / loopSeconds(L)));
    const joined = joinedAt(n, viewLoop);
    if (joined !== shownJoined) {
      shownJoined = joined;
      setRows(joined);
    }
    progress.textContent = viewLoop >= n ? TEXT.viewing.all(n) : TEXT.viewing.progress(joined, n);
    score.clearRinging();
    while (pendingFlash.length > 0 && (pendingFlash[0]?.time ?? Infinity) <= now) {
      const f = pendingFlash.shift();
      if (!f) break;
      flash[f.person] = f.time;
      score.ringColumn(f.step, [f.person]);
    }
    score.setPlayhead(elapsed >= 0 ? Math.floor(elapsed / stepSec) % per : null);
    draw(now, joined, false);
    raf = requestAnimationFrame(frame);
  }

  function end(): void {
    playing = false;
    cancelAnimationFrame(raf);
    progress.textContent = TEXT.viewing.end;
    setRows(n);
    score.setPlayhead(null);
    draw(SoundEngine.now(), n, true);
    showPanel('end');
  }

  // ---- 重ねる案内（再生の前・おわり） ----
  function showPanel(kind: 'before' | 'end'): void {
    panel.hidden = false;
    urlBox.hidden = true;
    panelTitle.textContent = kind === 'end' ? TEXT.viewing.end : TEXT.shared.heading;
    panelLead.hidden = kind !== 'before';
    panelLead.textContent = TEXT.shared.lead(n);
    secondary.hidden = kind !== 'end';
    note.hidden = !(kind === 'before' || own);
    note.textContent = own ? TEXT.viewing.reloadWarning : TEXT.top.soundNote;
    setStatus(status, 'info', '');
    if (own) {
      action = 'copy';
      primary.textContent = TEXT.viewing.copy;
      primary.disabled = shareUrl === null;
      void prepareUrl();
    } else if (kind === 'end') {
      action = 'danceToo';
      primary.textContent = TEXT.shared.danceToo;
      primary.disabled = false;
    } else {
      action = 'none';
      primary.textContent = TEXT.top.loadingButton;
    }
    if (!primary.disabled) primary.focus();
  }

  async function prepareUrl(): Promise<void> {
    if (shareUrl) return;
    const made = await encodeRecord(mode.record, DEFAULT_SHARE);
    if (!made.ok) {
      setStatus(status, 'error', TEXT.viewing.tooLong);
      primary.disabled = true;
      return;
    }
    shareUrl = `${location.origin}${location.pathname}${location.search}${made.hash}`;
    primary.disabled = false;
    primary.focus();
  }

  async function copy(): Promise<void> {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setStatus(status, 'info', TEXT.viewing.copied);
      urlBox.hidden = true;
    } catch {
      // ブラウザがコピーを許さなかった。URL を欄に出して選ぶ（SCR03 6章 No.2）
      setStatus(status, 'error', TEXT.viewing.copyFailed);
      urlInput.value = shareUrl;
      urlBox.hidden = false;
      urlInput.select();
    }
  }

  async function onPrimary(): Promise<void> {
    if (action === 'copy') await copy();
    else if (action === 'reload') location.reload();
    else if (mode.kind === 'shared' && action === 'danceToo') mode.onDanceToo();
    else if (mode.kind === 'shared' && action === 'play') {
      await SoundEngine.start();
      engine ??= mode.getEngine();
      play(SoundEngine.now() + V.startLeadSeconds);
    }
  }

  function onAgain(): void {
    play(SoundEngine.now() + V.startLeadSeconds);
  }

  function onVisibility(): void {
    if (!playing) return;
    if (document.visibilityState === 'hidden') {
      hidden = true;
      paused.hidden = false;
      void SoundEngine.pause();
    } else if (hidden) {
      hidden = false;
      paused.hidden = true;
      void SoundEngine.resume();
    }
  }

  primary.addEventListener('click', () => void onPrimary());
  secondary.addEventListener('click', onAgain);
  document.addEventListener('visibilitychange', onVisibility);

  if (own) {
    play(mode.start);
  } else {
    // 再生の前: 全員を立ち姿で並べ、譜面の帯は全段を点けて見せる。楽器の音を読み込む
    setRows(n);
    score.setPlayhead(null);
    draw(0, n, true);
    showPanel('before');
    primary.disabled = true;
    setStatus(status, 'wait', TEXT.top.loading);
    void loadSounds().then((r) => {
      if (playing) return;
      if (r.ok) {
        action = 'play';
        primary.textContent = TEXT.shared.play;
        primary.disabled = false;
        setStatus(status, 'info', '');
        primary.focus();
      } else {
        action = 'reload';
        primary.textContent = TEXT.top.reload;
        primary.disabled = false;
        note.hidden = true;
        setStatus(status, 'error', TEXT.top.loadFailed);
      }
    });
  }

  return () => {
    cancelAnimationFrame(raf);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

/** 共有URLが開けなかったときの画面（SCR04 3.1 No.5） */
export function mountSharedFailure(root: HTMLElement, reason: 'broken' | 'version', onDanceToo: () => void): void {
  const canvas = h('canvas', { class: 'stage__canvas', width: String(V.stageWidth), height: String(V.stageHeight), 'aria-label': TEXT.play.stage });
  const status = h('p', { class: 'status' });
  setStatus(status, 'error', reason === 'version' ? TEXT.shared.version : TEXT.shared.broken);
  const button = h('button', { type: 'button', class: 'button button--primary' }, TEXT.shared.danceToo);
  button.addEventListener('click', onDanceToo);
  root.replaceChildren(
    h(
      'main',
      { class: 'screen view' },
      h('h1', { class: 'visually-hidden' }, TEXT.title),
      h('h2', { class: 'visually-hidden' }, TEXT.shared.heading),
      h('p', { class: 'view__progress' }),
      h(
        'div',
        { class: 'stage' },
        canvas,
        h('section', { class: 'overlay overlay--center view__end', role: 'status', 'aria-labelledby': 'failed-title' }, h('h3', { class: 'overlay__title', id: 'failed-title' }, TEXT.shared.failedTitle), status, h('div', { class: 'view__buttons' }, button)),
      ),
    ),
  );
  const ctx = canvas.getContext('2d');
  if (ctx) clearStage(ctx, readPalette());
  button.focus();
}

function stepsOf(list: readonly (unknown | null)[]): Set<number> {
  const out = new Set<number>();
  list.forEach((x, i) => {
    if (x) out.add(i);
  });
  return out;
}
