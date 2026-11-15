// 静的解析の設定（npm run check の一部）。
// 誤検知を除外するときは、対象ファイルとルールの両方を指定して絞る。ルール単位の全体除外はしない（AGENTS.md「静的解析」）。
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// 層の境界（技術選定の設計方針 2章）を、書くだけのルールにせず機械で止める。
// 各層が読んではいけない層とライブラリを並べる
const layers = (...names) => names.flatMap((n) => [`**/${n}`, `**/${n}/*`, `${n}/*`]);
const LIB_AUDIO = { group: ['tone', 'tone/*'], message: '音（Tone.js）は audio/ だけが読む' };
const restrict = (...patterns) => ['error', { patterns }];

// 同じ入力からは必ず同じ踊りと音にする（技術選定の設計方針 3.1、判断ログ D19）。
// core/・music/・share/ では、乱数・現在時刻と、ブラウザによって結果が変わりうる Math の関数を使わない。
// 平方根は Math.sqrt（四則演算と同じく、規格で結果が1つに決まっている）を使う
const BROWSER_DEPENDENT = 'ブラウザによって結果が変わりうる。core/・music/・share/ では使わない（技術選定 3.1）';
const NO_NONDETERMINISM = [
  'error',
  { object: 'Math', property: 'random', message: '乱数は使わない（使うなら記録に種を入れた自作の乱数）' },
  { object: 'Date', property: 'now', message: '時刻は引数で受け取る（技術選定 3.2）' },
  { object: 'performance', property: 'now', message: '時刻は引数で受け取る（技術選定 3.2）' },
  ...['hypot', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'exp', 'expm1', 'log', 'log1p', 'log2', 'log10', 'pow', 'cbrt', 'sinh', 'cosh', 'tanh'].map((fn) => ({
    object: 'Math',
    property: fn,
    message: `Math.${fn} は${BROWSER_DEPENDENT}`,
  })),
];
// 純粋な層は画面・音・時計に触れない（単体テストで時刻と入力を渡して確かめるため）
const NO_BROWSER = ['error', 'window', 'document', 'requestAnimationFrame', 'setTimeout', 'setInterval', 'AudioContext', 'localStorage'];

export default tseslint.config(
  {
    // 対象はアプリ（src/）・E2E（e2e/）・設定ファイル。ハーネスの補助スクリプト（.github/・.claude/）と試作（prototype/）は見ない
    ignores: [
      'dist/',
      'node_modules/',
      '.github/',
      '.claude/',
      'prototype/',
      'e2e/node_modules/',
      'e2e/playwright-report/',
      'e2e/test-results/',
      'ドキュメント/',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': restrict(LIB_AUDIO, { group: layers('music', 'share', 'audio', 'view'), message: 'core/ は他の層を読まない' }),
      'no-restricted-properties': NO_NONDETERMINISM,
      'no-restricted-globals': NO_BROWSER,
    },
  },
  {
    files: ['src/music/**/*.ts'],
    rules: {
      'no-restricted-imports': restrict(LIB_AUDIO, { group: layers('share', 'audio', 'view'), message: 'music/ が読んでよいのは core/ だけ' }),
      'no-restricted-properties': NO_NONDETERMINISM,
      'no-restricted-globals': NO_BROWSER,
    },
  },
  {
    files: ['src/share/**/*.ts'],
    rules: {
      'no-restricted-imports': restrict(LIB_AUDIO, { group: layers('audio', 'view'), message: 'share/ が読んでよいのは core/ と music/ だけ' }),
      'no-restricted-properties': NO_NONDETERMINISM,
    },
  },
  {
    files: ['src/audio/**/*.ts'],
    rules: {
      'no-restricted-imports': restrict({ group: layers('view', 'share'), message: 'audio/ が読んでよいのは core/ と music/ だけ' }),
    },
  },
  {
    files: ['src/view/**/*.ts'],
    rules: {
      'no-restricted-imports': restrict(LIB_AUDIO),
    },
  },
);
