// SCR01 トップ画面 モックアップの動き。
// 状態（準備中・準備完了・読み込みの失敗）の見た目を切り替えるだけで、音は読み込まない。
// 文言は設計書 ../画面設計/SCR01_トップ画面.md の 3章・6章が正本。
(() => {
  const TEXT = {
    loading: { button: '準備中', status: '楽器の音を読み込んでいます', statusKind: 'wait', disabled: true },
    ready: { button: 'はじめる', status: '', statusKind: 'wait', disabled: false },
    error: {
      button: '再読み込みする',
      status: '楽器の音を読み込めませんでした。通信できる状態にして、再読み込みしてください。',
      statusKind: 'error',
      disabled: false,
    },
  };

  const top = document.querySelector('.top');
  const start = document.getElementById('start');
  const status = document.getElementById('status');
  const log = document.getElementById('mock-log');
  const mockButtons = document.querySelectorAll('[data-mock-state]');

  function show(state) {
    const t = TEXT[state];
    top.dataset.state = state;
    start.textContent = t.button;
    start.disabled = t.disabled;
    status.className = `status status--${t.statusKind}`;
    status.setAttribute('role', t.statusKind === 'error' ? 'alert' : 'status');
    status.textContent = t.status;
    mockButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mockState === state)));
    log.textContent = '';
  }

  start.addEventListener('click', () => {
    log.textContent = top.dataset.state === 'error'
      ? '→ ページを再読み込みする'
      : '→ 音を始めて SCR02 踊る へ切り替わる';
  });
  document.getElementById('credit').addEventListener('click', () => {
    log.textContent = '→ DLG01 クレジットの窓を開く';
  });
  mockButtons.forEach((b) => b.addEventListener('click', () => show(b.dataset.mockState)));

  // 開いた直後は「準備中」。URL の ?state=ready などで最初の状態を選べる
  const initial = new URLSearchParams(location.search).get('state');
  show(initial in TEXT ? initial : 'loading');
})();
