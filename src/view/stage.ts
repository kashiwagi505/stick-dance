// 舞台（棒人間を描く canvas）。描画は Canvas 2D を直接使う（技術選定の設計方針 1章）
export function createStage(parent: HTMLElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 540;
  canvas.setAttribute('aria-label', '舞台');
  parent.append(canvas);

  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#14161c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // 立ち姿の棒人間（仮）
    ctx.strokeStyle = '#e8e8ee';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    const x = canvas.width / 2;
    const y = canvas.height * 0.85;
    const line = (x1: number, y1: number, x2: number, y2: number): void => {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    };
    line(x, y - 212, x, y - 120);
    line(x, y - 212, x - 70, y - 132);
    line(x, y - 212, x + 70, y - 132);
    line(x, y - 120, x - 26, y);
    line(x, y - 120, x + 26, y);
    ctx.beginPath();
    ctx.arc(x, y - 250, 20, 0, Math.PI * 2);
    ctx.stroke();
  }
  return canvas;
}
