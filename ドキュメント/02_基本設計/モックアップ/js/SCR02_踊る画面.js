// SCR02 踊る画面 モックアップの動き。物理と音は持たず、状態ごとの見た目を時間で揺らして見せる。
// 文言は設計書 ../画面設計/SCR02_踊る画面.md の 3章・6章が正本。
(() => {
  const S = window.MockStage;
  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const baseY = 540 * 0.84;
  const play = document.querySelector('.play');
  const hint = document.getElementById('hint');
  const paused = document.getElementById('paused');
  const guide = document.getElementById('guide');
  const event = document.getElementById('event');
  const count = document.getElementById('count');
  const remove = document.getElementById('remove');
  const view = document.getElementById('view');
  const scoreEl = document.getElementById('score');
  const instButtons = [...document.querySelectorAll('.instrument')];
  const SLOTS = [0.16, 0.84, 0.3, 0.7];
  const KEEP = 4;

  const STATES = {
    first: { ghosts: [], me: 0, notes: 2, hint: true },
    two: { ghosts: [0, 1], me: 2, notes: 5, event: '— 2人目が残りました' },
    toview: { ghosts: [0, 1], me: 2, notes: 5, toView: true },
    paused: { ghosts: [0, 1], me: 2, notes: 3, paused: true },
  };
  let st = STATES.first;
  let playhead;
  let myNotes = new Set();

  function show(name) {
    st = STATES[name];
    play.dataset.state = name;
    hint.hidden = !st.hint;
    paused.hidden = !st.paused;
    count.textContent = `分身 ${st.ghosts.length} / 5`;
    remove.disabled = st.ghosts.length === 0;
    view.disabled = st.ghosts.length === 0 || st.toView;
    view.textContent = st.toView ? '周の終わりで鑑賞へ' : '鑑賞へ';
    instButtons.forEach((b, k) => {
      b.setAttribute('aria-pressed', String(k === st.me));
      b.querySelector('.instrument__used').textContent = st.ghosts.includes(k) ? '済' : '';
      b.disabled = !!st.toView;
    });
    const n = st.ghosts.length + 1;
    guide.textContent = st.toView
      ? 'この周が終わったら鑑賞に入ります'
      : `${n}人目を踊っています — この周 ${st.notes}音` + (st.notes >= KEEP ? '（周の終わりに残ります）' : `（${KEEP}音で残ります）`);
    event.textContent = st.event ?? '';
    myNotes = new Set([...S.notesFor(st.me + 7)].filter((i) => i < 14));
    playhead = S.buildScore(scoreEl, [
      ...st.ghosts.map((g) => ({ color: S.COLORS[g], notes: S.notesFor(g), lit: true })),
      { color: S.COLORS[st.me], notes: myNotes, lit: true },
    ]);
    document.querySelectorAll('[data-mock-state]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mockState === name)));
  }

  function draw(now) {
    const t = st.paused ? 3.2 : now / 1000;
    const step = Math.floor(t / S.BEAT) % 32;
    ctx.clearRect(0, 0, W, 540);
    S.floor(ctx, baseY);

    st.ghosts.forEach((g, k) => {
      const x = W * SLOTS[k];
      // 踊っている間は分身の音を鳴らさないので、光らせない（設計書 3.1 No.6、判断ログ D26）
      S.figure(ctx, S.pose(g, t, true), x, baseY, 0.55, S.COLORS[g], false);
      S.label(ctx, `${k + 1}人目・${S.NAMES[g]}`, x, baseY + 32, S.COLORS[g]);
    });

    // 自分と音階のはしご
    const p = S.pose(9, t, true);
    const color = S.COLORS[st.me];
    const ringing = myNotes.has(step) && (t % S.BEAT) < S.BEAT / 2;
    S.figure(ctx, p, W / 2, baseY, 1, color, ringing);
    const restY = baseY - 250;
    const idx = Math.max(0, Math.min(10, Math.round((restY + 85 - (baseY + p.head[1])) / 130 * 10)));
    const lx = W / 2 + 180;
    ctx.font = `16px ${getComputedStyle(document.body).fontFamily}`;
    ctx.textAlign = 'left';
    // 打楽器は同じ種類の段をまとめ、真ん中の段に1列で出す（設計書 3.1 No.4）
    const PERC = [['手拍子', 0, 2], ['タンバリン', 3, 5], ['軽い手拍子', 6, 8], ['トライアングル', 9, 10]];
    for (let i = 0; i < 11; i++) {
      const y = restY + 85 - (i / 10) * 130;
      const hot = ringing && i === idx;
      const cur = i === idx;
      ctx.fillStyle = hot ? color : cur ? '#f4f0ff' : '#2e2a4a';
      ctx.fillRect(lx, y - 2, hot ? 36 : 24, 4);
      if (st.me === 4) {
        const g = PERC.find(([, a, b]) => i === Math.floor((a + b) / 2));
        if (g) {
          const inside = idx >= g[1] && idx <= g[2];
          ctx.fillStyle = inside && ringing ? color : inside ? '#f4f0ff' : '#9d97bb';
          ctx.fillText(g[0], lx + 44, y + 6);
        }
        continue;
      }
      ctx.fillStyle = hot ? color : cur ? '#f4f0ff' : '#9d97bb';
      ctx.fillText(S.SCALE_NAMES[i], lx + (i % 2 ? 72 : 44), y + 6); // 段の間が狭いので2列に互い違い
    }

    playhead.style.left = `${S.cellX(step) + 9}px`;
    scoreEl.querySelectorAll('.score__cell.is-ringing').forEach((c) => c.classList.remove('is-ringing'));
    if (!st.paused) {
      // 光るのは今の自分の段（いちばん下）だけ
      scoreEl.querySelectorAll(`.score__row:last-of-type .score__cell:nth-child(${step + 1}).is-on`).forEach((c) => c.classList.add('is-ringing'));
    }
    requestAnimationFrame(draw);
  }

  document.querySelectorAll('[data-mock-state]').forEach((b) => b.addEventListener('click', () => show(b.dataset.mockState)));
  instButtons.forEach((b, k) => b.addEventListener('click', () => { st = { ...st, me: k }; instButtons.forEach((x, j) => x.setAttribute('aria-pressed', String(j === k))); }));
  const initial = new URLSearchParams(location.search).get('state');
  show(initial in STATES ? initial : 'first');
  requestAnimationFrame(draw);
})();
