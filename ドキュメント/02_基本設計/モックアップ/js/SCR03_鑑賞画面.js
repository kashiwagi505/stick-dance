// SCR03 鑑賞画面 モックアップの動き。文言は設計書 ../画面設計/SCR03_鑑賞画面.md の 3章・6章が正本。
(() => {
  const PEOPLE = [0, 1, 2, 3, 4];
  const STATES = {
    playing: { joined: 3, end: false },
    end: { joined: 5, end: true, copy: '' },
    copied: { joined: 5, end: true, copy: 'ok' },
    failed: { joined: 5, end: true, copy: 'ng' },
    paused: { joined: 3, end: false, paused: true },
  };
  let st = STATES.playing;
  const $ = (id) => document.getElementById(id);

  function show(name) {
    st = STATES[name];
    $('progress').textContent = st.end ? 'おわり' : `鑑賞中 — ${st.joined} / ${PEOPLE.length} 人`;
    $('end').hidden = !st.end;
    $('paused').hidden = !st.paused;
    const s = $('copy-status');
    s.className = `status ${st.copy === 'ng' ? 'status--error' : 'status--info'}`;
    s.setAttribute('role', st.copy === 'ng' ? 'alert' : 'status');
    s.textContent = st.copy === 'ok' ? '共有URLをコピーしました。チャットやSNSに貼って渡せます。'
      : st.copy === 'ng' ? 'コピーできませんでした。下の欄のURLを選んでコピーしてください。' : '';
    $('url-box').hidden = st.copy !== 'ng';
    if (st.copy === 'ng') $('share-url').select();
    if (st.end && !st.copy) $('copy').focus();
    document.querySelectorAll('[data-mock-state]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mockState === name)));
  }

  window.MockViewing.start({
    canvas: $('stage'), scoreEl: $('score'), people: PEOPLE,
    getJoined: () => st.joined, getStill: () => st.end || !!st.paused,
  });
  $('copy').addEventListener('click', () => show('copied'));
  $('again').addEventListener('click', () => show('playing'));
  document.querySelectorAll('[data-mock-state]').forEach((b) => b.addEventListener('click', () => show(b.dataset.mockState)));
  const initial = new URLSearchParams(location.search).get('state');
  show(initial in STATES ? initial : 'playing');
})();
