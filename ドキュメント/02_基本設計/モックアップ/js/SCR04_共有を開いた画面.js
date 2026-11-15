// SCR04 共有を開いた画面 モックアップの動き。文言は設計書 ../画面設計/SCR04_共有を開いた画面.md の 3章・6章が正本。
(() => {
  const PEOPLE = [0, 1, 3, 4];
  const FAIL = '楽器の音を読み込めませんでした。通信できる状態にして、再読み込みしてください。';
  const STATES = {
    loading: { panel: 'before', primary: '準備中', disabled: true, status: ['wait', '楽器の音を読み込んでいます'], joined: 0 },
    ready: { panel: 'before', primary: '再生する', joined: 0 },
    loadfail: { panel: 'before', primary: '再読み込みする', status: ['error', FAIL], joined: 0, noNote: true },
    playing: { panel: null, joined: 2 },
    end: { panel: 'end', primary: '自分も踊る', secondary: 'もう一度見る', joined: PEOPLE.length },
    broken: { panel: 'error', primary: '自分も踊る', status: ['error', 'URLが途中で切れているか、形がこわれているため、再生できません。'], empty: true },
    version: { panel: 'error', primary: '自分も踊る', status: ['error', '別の版の棒人間ダンシングで作られたURLのため、再生できません。'], empty: true },
  };
  const TITLES = { before: '共有された踊り', end: 'おわり', error: 'この共有URLは開けませんでした' };
  let st = STATES.loading;
  const $ = (id) => document.getElementById(id);

  function show(name) {
    st = STATES[name];
    $('panel').hidden = !st.panel;
    $('progress').textContent = st.panel === 'end' ? 'おわり' : st.panel === null ? `鑑賞中 — ${st.joined} / ${PEOPLE.length} 人` : '';
    if (st.panel) {
      $('panel-title').textContent = TITLES[st.panel];
      $('panel-lead').hidden = st.panel !== 'before';
      $('panel-lead').textContent = `${PEOPLE.length}人の分身が踊ります`;
      $('primary').textContent = st.primary;
      $('primary').disabled = !!st.disabled;
      $('secondary').hidden = !st.secondary;
      $('secondary').textContent = st.secondary ?? '';
      const [kind, text] = st.status ?? ['wait', ''];
      $('status').className = `status status--${kind}`;
      $('status').setAttribute('role', kind === 'error' ? 'alert' : 'status');
      $('status').textContent = text;
      $('panel-note').hidden = st.panel !== 'before' || !!st.noNote;
      if (!st.disabled) $('primary').focus();
    }
    $('stage').hidden = false;
    document.querySelectorAll('[data-mock-state]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mockState === name)));
  }

  window.MockViewing.start({
    canvas: $('stage'), scoreEl: $('score'), people: PEOPLE,
    getJoined: () => (st.empty ? -1 : st.joined),
    getStill: () => st.panel !== null,
  });
  // 開けなかったときは舞台に誰も出さない（譜面の帯も出さない）
  const observer = () => { $('score').style.visibility = st.empty ? 'hidden' : ''; requestAnimationFrame(observer); };
  observer();
  $('primary').addEventListener('click', () => { if (st.panel === 'before' && st.primary === '再生する') show('playing'); });
  $('secondary').addEventListener('click', () => show('playing'));
  document.querySelectorAll('[data-mock-state]').forEach((b) => b.addEventListener('click', () => show(b.dataset.mockState)));
  const initial = new URLSearchParams(location.search).get('state');
  show(initial in STATES ? initial : 'loading');
})();
