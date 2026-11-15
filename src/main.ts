// 画面の入口。いまはトップページの仮の表示と、舞台の canvas を置くだけ。
// 画面の構成（トップ・踊る・鑑賞・共有を開いた画面）は基本設計で決める（要件定義 README 7章）。
// 遊べる試作は prototype/index.html にある
import { DEFAULT_LOOP, loopSeconds } from './core/loop';
import { createStage } from './view/stage';

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('#app が見つからない');

const title = document.createElement('h1');
title.textContent = '棒人間ダンシング';
const note = document.createElement('p');
note.textContent = `準備中（ループ ${DEFAULT_LOOP.bars} 小節・約 ${loopSeconds(DEFAULT_LOOP).toFixed(1)} 秒）`;
app.append(title, note);
createStage(app);
