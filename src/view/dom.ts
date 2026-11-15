// HTML の要素を組み立てる小さな道具（画面ごとの描画で使う）。

type Child = Node | string | null | undefined | false;

/** 要素を作る。props の class・text 以外は属性として付ける */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, string | boolean | undefined> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') el.className = String(v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children) if (c) el.append(c);
  return el;
}

/** キーの印（デザインシステム 1.3） */
export function key(label: string): HTMLElement {
  return h('kbd', { class: 'key' }, label);
}

/** 状態の案内の中身を入れ替える（種類: wait・info・error。デザインシステム 状態の案内） */
export function setStatus(el: HTMLElement, kind: 'wait' | 'info' | 'error', text: string): void {
  el.className = `status status--${kind}`;
  el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  el.textContent = text;
}

/** CSS のトークン（--名前）の値を読む */
export function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** 楽器の色（--color-inst-1〜5） */
export function instrumentColor(instrument: number): string {
  return token(`--color-inst-${instrument + 1}`);
}
