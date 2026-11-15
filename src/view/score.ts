// 譜面の帯（デザインシステム components/譜面の帯.md）。人ごとの段 × 1周の拍のマス。読み上げない飾り。
import { h } from './dom';

/** 段1つの中身: 楽器の色と、点いている拍 */
export interface ScoreRow {
  color: string;
  on: ReadonlySet<number>;
}

/** 拍 i のマスの左端（px）。マス 20px・間 4px・小節の区切り +20px */
const cellX = (i: number): number => i * 24 + Math.floor(i / 8) * 20;

export class Score {
  readonly element: HTMLElement;
  private rows: HTMLElement[][] = [];
  private readonly playhead: HTMLElement;
  private ringing: HTMLElement[] = [];

  constructor(private readonly steps: number) {
    this.playhead = h('span', { class: 'score__playhead' });
    this.element = h('div', { class: 'score', 'aria-hidden': 'true' });
  }

  /** 段を作り直す */
  setRows(rows: readonly ScoreRow[]): void {
    this.element.replaceChildren();
    this.rows = rows.map((r) => {
      const row = h('div', { class: 'score__row' });
      row.style.setProperty('--note-color', r.color);
      const cells = Array.from({ length: this.steps }, (_, i) => {
        const c = h('span', { class: r.on.has(i) ? 'score__cell is-on' : 'score__cell' });
        row.append(c);
        return c;
      });
      this.element.append(row);
      return cells;
    });
    this.element.append(this.playhead);
  }

  /** 段 row の拍 step を点ける（鳴った瞬間なら一瞬光らせる） */
  light(row: number, step: number, ring: boolean): void {
    const c = this.rows[row]?.[step];
    if (!c) return;
    c.classList.add('is-on');
    if (ring) {
      c.classList.add('is-ringing');
      this.ringing.push(c);
    }
  }

  /** 拍 step の点いているマスを一瞬光らせる（分身・鑑賞） */
  ringColumn(step: number, rows: readonly number[]): void {
    for (const r of rows) {
      const c = this.rows[r]?.[step];
      if (c?.classList.contains('is-on')) {
        c.classList.add('is-ringing');
        this.ringing.push(c);
      }
    }
  }

  /** 光を消す */
  clearRinging(): void {
    for (const c of this.ringing) c.classList.remove('is-ringing');
    this.ringing = [];
  }

  /** 段 row のマスを全部消す */
  clearRow(row: number): void {
    for (const c of this.rows[row] ?? []) c.classList.remove('is-on', 'is-ringing');
  }

  /** 再生位置の柱を拍 step に置く（null なら隠す） */
  setPlayhead(step: number | null): void {
    this.playhead.hidden = step === null;
    if (step !== null) this.playhead.style.left = `${cellX(step) + 9}px`;
  }
}
