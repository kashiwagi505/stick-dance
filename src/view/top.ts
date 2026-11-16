// SCR01 トップ画面（画面設計 SCR01_トップ画面.md）と、DLG01 クレジットの窓。
import type { LoadResult } from '../audio/engine';
import { CREDITS, TEXT } from './text';
import { h, setStatus } from './dom';

const SVG = 'http://www.w3.org/2000/svg';

/** 舞台の飾りの棒人間（SVG。読み上げない） */
function figure(): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'figure');
  svg.setAttribute('viewBox', '0 0 120 200');
  svg.setAttribute('width', '120');
  svg.setAttribute('height', '200');
  const g = document.createElementNS(SVG, 'g');
  g.setAttribute('fill', 'none');
  g.setAttribute('stroke-linecap', 'round');
  g.setAttribute('stroke-linejoin', 'round');
  const parts: [string, Record<string, string>][] = [
    ['circle', { class: 'figure__head', cx: '60', cy: '26', r: '16' }],
    ['path', { class: 'figure__body', d: 'M60 44 V118' }],
    ['path', { class: 'figure__arm', d: 'M60 58 L28 98' }],
    ['path', { class: 'figure__arm figure__arm--right', d: 'M60 58 L92 98' }],
    ['path', { d: 'M60 118 L40 196 M60 118 L80 196' }],
  ];
  for (const [tag, attrs] of parts) {
    const el = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    g.append(el);
  }
  svg.append(g);
  return svg;
}

/** トップを出す。読み込みが終わり「はじめる」を押したら onStart を呼ぶ */
export function mountTop(root: HTMLElement, loaded: Promise<LoadResult>, onStart: () => void): () => void {
  const spots = [4, 2, 1, 3, 5].map((n) => h('div', { class: `spot spot--${n}` }, h('span', { class: 'spot__cone' }), h('span', { class: 'spot__mark' })));
  const start = h('button', { type: 'button', class: 'button button--primary', disabled: true }, TEXT.top.loadingButton);
  const status = h('p', { class: 'status status--wait', role: 'status' }, TEXT.top.loading);
  const note = h('p', { class: 'top__note' }, TEXT.top.soundNote);
  const credit = h('button', { type: 'button', class: 'button button--secondary top__credit' }, TEXT.top.credit);
  const stage = h('div', { class: 'top__stage', 'aria-hidden': 'true' }, ...spots, h('span', { class: 'top__floor' }));
  stage.insertBefore(figure(), stage.lastChild);
  const main = h(
    'main',
    { class: 'top', 'data-state': 'loading' },
    h('h1', { class: 'top__title' }, TEXT.title),
    h('p', { class: 'top__lead' }, TEXT.top.lead),
    stage,
    h('div', { class: 'top__action' }, start, status, note),
    credit,
  );
  root.replaceChildren(main);

  let failed = false;
  let alive = true;
  void loaded.then((r) => {
    if (!alive) return;
    if (r.ok) {
      main.dataset.state = 'ready';
      start.textContent = TEXT.top.start;
      start.disabled = false;
      setStatus(status, 'wait', '');
    } else {
      failed = true;
      main.dataset.state = 'error';
      start.textContent = TEXT.top.reload;
      start.disabled = false;
      setStatus(status, 'error', TEXT.top.loadFailed);
    }
  });
  start.addEventListener('click', () => {
    if (failed) location.reload();
    else onStart();
  });
  credit.addEventListener('click', () => openCredit(credit));
  return () => {
    alive = false;
  };
}

/** クレジットの窓を開く（DLG01）。閉じたら opener へフォーカスを戻す */
export function openCredit(opener: HTMLElement): void {
  const close = h('button', { type: 'button', class: 'button button--secondary' }, TEXT.credit.close);
  const dialog = h(
    'dialog',
    { class: 'dialog credit', 'aria-labelledby': 'credit-title' },
    h('h2', { class: 'dialog__title', id: 'credit-title' }, TEXT.credit.title),
    h('p', { class: 'credit__intro' }, TEXT.credit.intro),
    ...CREDITS.map((group, i) =>
      h(
        'section',
        { class: 'credit__group', 'aria-labelledby': `credit-group-${i}` },
        h('h3', { id: `credit-group-${i}` }, group.group),
        h('dl', {}, ...group.items.map((item) => h('div', { class: 'credit__item' }, h('dt', {}, item.name), h('dd', {}, `${item.author} ／ ${item.license}`), h('dd', { class: 'credit__use' }, item.use)))),
      ),
    ),
    h('p', { class: 'credit__note' }, TEXT.credit.note),
    h('p', { class: 'credit__note' }, TEXT.credit.imageNote),
    h('div', { class: 'credit__close' }, close),
  );
  document.body.append(dialog);
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    dialog.remove();
    opener.focus();
  });
  dialog.showModal();
  close.focus();
}
