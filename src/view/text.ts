// 利用者向けの文言（実装方針4章）。正本は各画面設計の 3章・6章（SCR01〜SCR04・DLG01）。
// 楽器の名前・音階の名前・打楽器の種類の名前は src/music/settings.ts から受け取り、ここには書かない。

export const TEXT = {
  title: '棒人間ダンシング',
  top: {
    lead: 'キーで棒人間を引っぱると、踊りが音になる。',
    loadingButton: '準備中',
    start: 'はじめる',
    reload: '再読み込みする',
    loading: '楽器の音を読み込んでいます',
    loadFailed: '楽器の音を読み込めませんでした。通信できる状態にして、再読み込みしてください。',
    soundNote: '音が出ます',
    credit: 'クレジット',
  },
  play: {
    heading: '踊る',
    instruments: '楽器',
    used: '済',
    count: (n: number, max: number): string => `分身 ${n} / ${max}`,
    removeLast: '最後の1人を消す',
    toViewing: '鑑賞へ',
    toViewingReserved: '周の終わりで鑑賞へ',
    dancing: (person: number, notes: number, keep: number): string =>
      `${person}人目を踊っています — この周 ${notes}音` + (notes >= keep ? '（周の終わりに残ります）' : `（${keep}音で残ります）`),
    reserved: 'この周が終わったら鑑賞に入ります',
    kept: (person: number): string => `— ${person}人目が残りました`,
    removed: (person: number): string => `— ${person}人目を消しました`,
    hintTitle: 'キーで手を引っぱる',
    hintLeft: '画面の左の手',
    hintRight: '画面の右の手',
    hintSound: '頭が動くと、その高さの音が鳴る',
    hintInstrumentBefore: '',
    hintInstrumentAfter: ' で楽器を選べます',
    ghostLabel: (person: number, instrument: string): string => `${person}人目・${instrument}`,
    stage: '舞台',
  },
  pause: {
    title: '一時停止中',
    bySpace: ' で続きから',
    byHidden: '画面に戻ると続きから',
  },
  viewing: {
    heading: '鑑賞',
    progress: (joined: number, n: number): string => `鑑賞中 — ${joined} / ${n} 人`,
    all: (n: number): string => `鑑賞中 — 全員（${n}人）`,
    end: 'おわり',
    copy: '共有URLをコピーする',
    again: 'もう一度見る',
    copied: '共有URLをコピーしました。チャットやSNSに貼って渡せます。',
    copyFailed: 'コピーできませんでした。下の欄のURLを選んでコピーしてください。',
    tooLong: 'この曲は長すぎて共有URLにできませんでした。',
    urlLabel: '共有URL',
    reloadWarning: 'コピーしないまま再読み込みすると、この曲は消えます。',
  },
  shared: {
    heading: '共有された踊り',
    lead: (n: number): string => `${n}人の分身が踊ります`,
    play: '再生する',
    danceToo: '自分も踊る',
    failedTitle: 'この共有URLは開けませんでした',
    broken: 'URLが途中で切れているか、形がこわれているため、再生できません。',
    version: '別の版の棒人間ダンシングで作られたURLのため、再生できません。',
  },
  credit: {
    title: 'クレジット',
    intro: 'このゲームは、次の素材とライブラリを使っています。ありがとうございます。',
    note: '旋律・和音・高い旋律の音と手拍子は、このゲームの中で作った音です。',
    close: '閉じる',
  },
} as const;

/** クレジットの窓の中身（DLG01 3.1 No.3〜4・4章）。素材の記録（ドキュメント/素材/）と同じ変更で直す */
export const CREDITS: readonly { group: string; items: readonly { name: string; author: string; license: string; use: string }[] }[] = [
  {
    group: '楽器の音',
    items: [
      { name: 'Virtuosity Drums', author: 'Versilian Studios / Karoryfer Samples', license: 'CC0 1.0', use: '伴奏のドラムと、5人目・打楽器のタンバリン・トライアングルの音' },
      { name: 'Black And Blue Basses', author: 'Karoryfer Samples', license: 'CC0 1.0', use: '2人目・ベースの音' },
    ],
  },
  {
    group: '書体',
    items: [{ name: 'Stick', author: 'Fontworks Inc.', license: 'SIL Open Font License 1.1', use: 'タイトルの文字' }],
  },
  {
    group: '音を鳴らすしくみ',
    items: [{ name: 'Tone.js', author: 'Yotam Mann ほか', license: 'MIT License', use: '楽器の音の読み込みと鳴らし方' }],
  },
];
