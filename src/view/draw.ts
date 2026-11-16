// 舞台（Canvas 2D）の描き方。棒人間・床・音階のはしご・通り道の点・分身の名前（SCR02〜SCR04）。
// 色はデザインシステムのトークンから読む。
import type { Pose } from '../core/body';
import { PULLS, type PullKey } from '../core/keys';
import { DEFAULT_DANCE, JOINTS } from '../core/settings';
import { DEFAULT_MUSIC } from '../music/settings';
import { token } from './dom';
import { VIEW_SETTINGS as V } from './settings';

const at = (name: (typeof JOINTS)[number]): number => JOINTS.indexOf(name);

/** 舞台の色（毎回 CSS を読まないよう、最初に1回読む） */
export interface Palette {
  stage: string;
  floor: string;
  light: string;
  haze: string;
  font: string;
}

export function readPalette(): Palette {
  return {
    stage: token('--color-stage'),
    floor: token('--color-floor'),
    light: token('--color-light'),
    haze: token('--color-haze'),
    font: token('--font-body'),
  };
}

/** 床の高さ（舞台の上からの px） */
export const floorY = V.stageHeight * V.floorRatio;

/** 舞台を消して床を描く（地は Canvas の後ろの背景の絵が見える。play.css） */
export function clearStage(ctx: CanvasRenderingContext2D, p: Palette): void {
  ctx.clearRect(0, 0, V.stageWidth, V.stageHeight);
  ctx.strokeStyle = p.floor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, floorY + 2);
  ctx.lineTo(V.stageWidth, floorY + 2);
  ctx.stroke();
}

/** 棒人間を1人描く。(x, 床) が足もと、scale は大きさ。glow なら頭を色で塗って光らせる */
export function drawFigure(ctx: CanvasRenderingContext2D, pose: Pose, x: number, scale: number, color: string, glow: boolean, p: Palette): void {
  const pt = (name: (typeof JOINTS)[number]): [number, number] => {
    const q = pose[at(name)] ?? { x: 0, y: 0 };
    return [x + q.x * scale, floorY + q.y * scale];
  };
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = V.lineWidth * Math.max(scale, 0.6);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [a, b] of DEFAULT_DANCE.sticks) {
    if (a === 'head') continue;
    ctx.beginPath();
    ctx.moveTo(...pt(a));
    ctx.lineTo(...pt(b));
    ctx.stroke();
  }
  const [hx, hy] = pt('head');
  ctx.beginPath();
  ctx.arc(hx, hy, V.headRadius * scale, 0, Math.PI * 2);
  ctx.fillStyle = glow ? color : p.stage;
  if (glow) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 24;
  }
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.stroke();
  ctx.restore();
}

/** 押しているキーの手から、引いている向きへ短い線を出す */
export function drawPulls(ctx: CanvasRenderingContext2D, pose: Pose, x: number, held: ReadonlySet<PullKey>, p: Palette): void {
  ctx.save();
  ctx.strokeStyle = p.light;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (const k of held) {
    const d = PULLS[k];
    const hand = d ? pose[at(d.hand)] : undefined;
    if (!d || !hand) continue;
    const sx = x + hand.x;
    const sy = floorY + hand.y;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + d.x * V.pullMarkLength, sy + d.y * V.pullMarkLength);
    ctx.stroke();
  }
  ctx.restore();
}

/** はしごの名前1つ。from〜to の段をまとめて指し、at の段の高さに出す */
export interface LadderLabel {
  text: string;
  from: number;
  to: number;
  at: number;
  /** 0 = 左の列、1 = 右の列 */
  column: 0 | 1;
}

/** 音の名前のはしご: 1段に1つ。段の間が文字より狭いので、2列に互い違いに置く */
export function scaleLabels(names: readonly string[]): LadderLabel[] {
  return names.map((text, i) => ({ text, from: i, to: i, at: i, column: i % 2 === 1 ? 1 : 0 }));
}

/**
 * 打楽器のはしご: 同じ種類の続く段を1つにまとめ、まとまりの真ん中の段に1列で出す。
 * 種類の名前は長いので、段ごとに出すと重なって読めない（SCR02 3.1 No.4）
 */
export function groupLabels(kinds: readonly string[]): LadderLabel[] {
  const out: LadderLabel[] = [];
  let from = 0;
  for (let i = 1; i <= kinds.length; i++) {
    if (i === kinds.length || kinds[i] !== kinds[from]) {
      out.push({ text: kinds[from] ?? '', from, to: i - 1, at: Math.floor((from + i - 1) / 2), column: 0 });
      from = i;
    }
  }
  return out;
}

/** 音階のはしご（SCR02 3.1 No.4）。current は今の頭の段、ringing は鳴っている段（無ければ -1） */
export function drawLadder(ctx: CanvasRenderingContext2D, x: number, steps: number, labels: readonly LadderLabel[], current: number, ringing: number, color: string, p: Palette): void {
  const m = DEFAULT_MUSIC;
  const top = steps - 1;
  const lx = x + V.ladderOffset;
  const yOf = (i: number): number => floorY + DEFAULT_DANCE.rest.head.y + m.headDown - (i / top) * (m.headUp + m.headDown);
  ctx.save();
  ctx.font = `16px ${p.font}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= top; i++) {
    const hot = i === ringing;
    ctx.fillStyle = hot ? color : i === current ? p.light : p.floor;
    ctx.fillRect(lx, yOf(i) - 2, hot ? 36 : 24, 4);
  }
  for (const l of labels) {
    const within = (i: number): boolean => i >= l.from && i <= l.to;
    ctx.fillStyle = within(ringing) ? color : within(current) ? p.light : p.haze;
    ctx.fillText(l.text, lx + (l.column === 1 ? 72 : 44), yOf(l.at));
  }
  ctx.restore();
}

/** 通り道の点（鳴った拍の頭の位置。時間とともに薄くなる） */
export function drawTrail(ctx: CanvasRenderingContext2D, dots: readonly { x: number; y: number; age: number }[], p: Palette): void {
  ctx.save();
  ctx.fillStyle = p.light;
  for (const d of dots) {
    ctx.globalAlpha = Math.max(0, 1 - d.age / V.trailSeconds) * 0.5;
    ctx.beginPath();
    ctx.arc(d.x, floorY + d.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** 分身の足もとの名前 */
export function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, color: string, p: Palette): void {
  ctx.save();
  ctx.font = `16px ${p.font}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.fillText(text, x, floorY + 32);
  ctx.restore();
}
