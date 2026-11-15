// 画面の入口。各層をつなぐだけで、処理の中身は各層に置く（実装方針1章）。
// URL に #r= があれば共有を開いた画面（SCR04）、無ければトップ（SCR01）。画面はページ遷移せず表示を切り替える。
import './view/styles/tokens.css';
import './view/styles/components.css';
import './view/styles/top.css';
import './view/styles/play.css';
import './view/styles/viewing.css';
import './view/styles/credit.css';
import { SoundEngine, loadSounds } from './audio/engine';
import { decodeRecord } from './share/share';
import { DEFAULT_SHARE } from './share/settings';
import { mountPlay } from './view/play';
import { mountTop } from './view/top';
import { mountSharedFailure, mountViewing } from './view/viewing';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('#app が見つからない');
const app = root;

let engine: SoundEngine | null = null;
const getEngine = (): SoundEngine => (engine ??= new SoundEngine());
let cleanup: () => void = () => undefined;

function showTop(): void {
  cleanup();
  cleanup = mountTop(app, loadSounds(), () => void startDancing());
}

async function startDancing(): Promise<void> {
  await SoundEngine.start();
  cleanup();
  cleanup = mountPlay(app, getEngine(), (record, start) => {
    cleanup = mountViewing(app, { kind: 'own', record, start, engine: getEngine() });
  });
}

/** 「自分も踊る」: #r= を消してトップへ（ブラウザの「戻る」で共有URLへ戻れるよう履歴は足す） */
function danceToo(): void {
  history.pushState(null, '', `${location.pathname}${location.search}`);
  showTop();
}

async function route(): Promise<void> {
  cleanup();
  if (!location.hash.startsWith('#r=')) {
    showTop();
    return;
  }
  const result = await decodeRecord(location.hash, DEFAULT_SHARE);
  if (!result.ok) {
    mountSharedFailure(app, result.reason, danceToo);
    return;
  }
  cleanup = mountViewing(app, { kind: 'shared', record: result.record, getEngine, onDanceToo: danceToo });
}

window.addEventListener('popstate', () => void route());
void route();
