// 録音の素材の一覧（音の読み込みと再生機能 設計判断 No.1・No.2）。出所と権利は ドキュメント/素材/音の記録.md。
// ファイルは public/sounds/ に置き、同じサイトから配信する（外のサイトから読まない）。
import type { DrumKind } from '../music/settings';

/** 伴奏のドラム（Virtuosity Drums の近めのマイク。CC0） */
export const DRUM_FILES: Readonly<Record<DrumKind, string>> = {
  kick: 'drums/kick.mp3',
  snare: 'drums/snare.mp3',
  hihatClosed: 'drums/hihat-closed.mp3',
  hihatHalf: 'drums/hihat-half.mp3',
  crash: 'drums/crash.mp3',
};

/** 5人目・打楽器の録音（Virtuosity Drums の打楽器。CC0） */
export const PERC_FILES: Readonly<Record<'tambourine' | 'triangle', string>> = {
  tambourine: 'perc/tambourine.mp3',
  triangle: 'perc/triangle.mp3',
};

/** 2人目・ベース（Black And Blue Basses の指弾き。CC0）。音名 → ファイル。3半音おき。間の音は Sampler が高さを変えて鳴らす */
export const BASS_FILES: Readonly<Record<string, string>> = {
  B1: 'bass/B1.mp3',
  D2: 'bass/D2.mp3',
  F2: 'bass/F2.mp3',
  Ab2: 'bass/Ab2.mp3',
  B2: 'bass/B2.mp3',
  D3: 'bass/D3.mp3',
  F3: 'bass/F3.mp3',
  Ab3: 'bass/Ab3.mp3',
  B3: 'bass/B3.mp3',
  D4: 'bass/D4.mp3',
  F4: 'bass/F4.mp3',
  Ab4: 'bass/Ab4.mp3',
};
