// SCR02〜SCR04 のモックアップで共通に使う、舞台（Canvas）と譜面の帯の仮の描画。
// 物理は計算せず、決めた形の踊りを時間で揺らして見せるだけ（実装の物理とは別物）。
// 寸法・色は デザインシステム（../画面設計/デザインシステム/）の値を読む。
window.MockStage = (() => {
  const css = getComputedStyle(document.documentElement);
  const v = (name) => css.getPropertyValue(name).trim();
  const COLORS = [1, 2, 3, 4, 5].map((n) => v(`--color-inst-${n}`));
  const NAMES = ['旋律', 'ベース', '和音', '高い旋律', '打楽器'];
  const SCALE_NAMES = ['ラ', 'ド', 'レ', 'ミ', 'ソ', 'ラ', 'ド', 'レ', 'ミ', 'ソ', 'ラ'];
  const BEAT = 60 / 124 / 2; // 8分音符（秒）

  // 立ち姿（足もとを原点）。試作の DEF.rest と同じ形
  const REST = {
    head: [0, -250], neck: [0, -212], pelvis: [0, -120],
    lElbow: [-42, -172], lHand: [-70, -132], rElbow: [42, -172], rHand: [70, -132],
    lKnee: [-20, -60], lFoot: [-26, 0], rKnee: [20, -60], rFoot: [26, 0],
  };
  const STICKS = [['head', 'neck'], ['neck', 'pelvis'], ['neck', 'lElbow'], ['lElbow', 'lHand'], ['neck', 'rElbow'],
    ['rElbow', 'rHand'], ['pelvis', 'lKnee'], ['lKnee', 'lFoot'], ['pelvis', 'rKnee'], ['rKnee', 'rFoot']];

  // 人ごとに違う「決めた形の踊り」。seed で揺れ方を変える（モックアップの見た目のためだけ）
  function pose(seed, t, moving) {
    const p = {};
    const a = moving ? 1 : 0;
    const ph = t * Math.PI * 2 / (BEAT * 4) + seed * 1.7;
    for (const [k, [x, y]] of Object.entries(REST)) p[k] = [x, y];
    p.lHand = [-70 + Math.sin(ph) * 30 * a, -132 - (Math.cos(ph * 0.5) + 1) * 55 * a];
    p.lElbow = [-42 + Math.sin(ph) * 10 * a, -172 - (Math.cos(ph * 0.5) + 1) * 18 * a];
    p.rHand = [70 + Math.cos(ph * 1.3) * 26 * a, -132 + Math.sin(ph) * 40 * a];
    p.rElbow = [42 + Math.cos(ph * 1.3) * 8 * a, -172 + Math.sin(ph) * 12 * a];
    const sway = Math.sin(ph * 0.5) * 22 * a;
    const bob = (Math.cos(ph) + 1) * 14 * a;
    for (const k of ['head', 'neck', 'pelvis']) p[k] = [p[k][0] + sway * (k === 'pelvis' ? 0.5 : 1), p[k][1] + bob];
    p.lKnee = [-20 + sway * 0.3, -60 + bob * 0.4];
    p.rKnee = [20 + sway * 0.3, -60 + bob * 0.4];
    return p;
  }

  function figure(ctx, p, x, y, s, color, glow) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.strokeStyle = color;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [a, b] of STICKS) {
      if (a === 'head') continue;
      ctx.beginPath();
      ctx.moveTo(...p[a]);
      ctx.lineTo(...p[b]);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(p.head[0], p.head[1], 20, 0, Math.PI * 2);
    ctx.fillStyle = glow ? color : v('--color-stage');
    if (glow) { ctx.shadowColor = color; ctx.shadowBlur = 24; }
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.stroke();
    ctx.restore();
  }

  function floor(ctx, y) {
    ctx.strokeStyle = v('--color-floor');
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, y + 2);
    ctx.lineTo(ctx.canvas.width, y + 2);
    ctx.stroke();
  }

  function label(ctx, text, x, y, color) {
    ctx.font = `16px ${v('--font-body')}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  // 譜面の帯の DOM を作る。rows = [{ color, notes: Set<拍>, lit: boolean }]
  function buildScore(el, rows) {
    el.innerHTML = '';
    rows.forEach((r) => {
      const row = document.createElement('div');
      row.className = 'score__row';
      row.style.setProperty('--note-color', r.color);
      for (let i = 0; i < 32; i++) {
        const c = document.createElement('span');
        c.className = 'score__cell';
        if (r.lit && r.notes.has(i)) c.classList.add('is-on');
        row.append(c);
      }
      el.append(row);
    });
    const head = document.createElement('span');
    head.className = 'score__playhead';
    el.append(head);
    return head;
  }

  // 拍 i の左端（px）。マス 20px・間 4px・小節の区切り +20px
  const cellX = (i) => i * 24 + Math.floor(i / 8) * 20;

  // 決めた譜面（人ごとに鳴る拍）
  function notesFor(seed) {
    const s = new Set();
    for (let i = 0; i < 32; i++) if ((i * (seed + 3) + seed * 5) % 7 < 3) s.add(i);
    return s;
  }

  return { COLORS, NAMES, SCALE_NAMES, BEAT, pose, figure, floor, label, buildScore, cellX, notesFor, REST };
})();
