// SCR03・SCR04 のモックアップで共通に使う、鑑賞の舞台と譜面の帯の仮の描画。
// 物理と音は持たず、決めた形の踊りを時間で揺らして見せるだけ。
window.MockViewing = (() => {
  const S = window.MockStage;

  // people: 楽器の番号の並び（1人目から）。joined: 加わった人数（0 なら全員を立ち姿で並べる）
  function start({ canvas, scoreEl, people, getJoined, getStill }) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const baseY = 540 * 0.84;
    let playhead;
    let builtFor = -1;

    function frame(now) {
      const joined = getJoined();
      const still = getStill();
      const t = still ? 0 : now / 1000;
      const step = Math.floor(t / S.BEAT) % 32;
      const shown = joined === 0 ? people.length : joined;
      if (builtFor !== joined) {
        playhead = S.buildScore(scoreEl, people.map((g, k) => ({
          color: S.COLORS[g], notes: S.notesFor(g), lit: joined === 0 || k < joined,
        })));
        builtFor = joined;
      }
      ctx.clearRect(0, 0, W, 540);
      S.floor(ctx, baseY);
      const scale = Math.min(0.85, 2.6 / (shown + 1));
      for (let k = 0; k < shown; k++) {
        const g = people[k];
        const x = (W * (k + 1)) / (shown + 1);
        const glow = !still && S.notesFor(g).has(step) && (t % S.BEAT) < S.BEAT / 2;
        S.figure(ctx, S.pose(g, t, !still), x, baseY, scale, S.COLORS[g], glow);
        S.label(ctx, `${k + 1}人目・${S.NAMES[g]}`, x, baseY + 32, S.COLORS[g]);
      }
      playhead.hidden = still;
      playhead.style.left = `${S.cellX(step) + 9}px`;
      scoreEl.querySelectorAll('.is-ringing').forEach((c) => c.classList.remove('is-ringing'));
      if (!still) scoreEl.querySelectorAll(`.score__cell:nth-child(${step + 1}).is-on`).forEach((c) => c.classList.add('is-ringing'));
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  return { start };
})();
