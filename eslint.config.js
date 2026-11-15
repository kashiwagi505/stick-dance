// 静的解析の設定（npm run check の一部）。
// 誤検知を除外するときは、対象ファイルとルールの両方を指定して絞る。ルール単位の全体除外はしない（AGENTS.md「静的解析」）。
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// 層の境界（技術選定の設計方針 2章）を、書くだけのルールにせず機械で止める。
// 各層が読んではいけない層とライブラリを並べる
const layers = (...names) => names.flatMap((n) => [`**/${n}`, `**/${n}/*`, `${n}/*`]);
const LIB_VIEW = { group: ['phaser', 'phaser/*'], message: '描画（Phaser）は view/ だけが読む' };
const LIB_AUDIO = { group: ['tone', 'tone/*'], message: '音（Tone.js）は audio/ と view/ だけが読む' };
const restrict = (...patterns) => ['error', { patterns }];

// 同じ記録からは必ず同じ曲にする（技術選定の設計方針 3.1、判断ログ D19）。
// music/ では乱数と現在時刻を直接使わず、記録に入った種から動く乱数（music/random.ts）を使う
const NO_NONDETERMINISM = [
  'error',
  { object: 'Math', property: 'random', message: '記録の種から動く乱数（music/random.ts）を使う' },
  { object: 'Date', property: 'now', message: 'music/ は現在時刻を使わない' },
  { object: 'performance', property: 'now', message: 'music/ は現在時刻を使わない' },
];

export default tseslint.config(
  {
    // 対象はアプリ（src/）・E2E（e2e/）・設定ファイル。ハーネスの補助スクリプト（.github/・.claude/）はアプリのコードではないため見ない
    ignores: [
      'dist/',
      'node_modules/',
      '.github/',
      '.claude/',
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
    files: ['src/data/**/*.ts'],
    rules: {
      'no-restricted-imports': restrict(LIB_VIEW, LIB_AUDIO, { group: layers('core', 'music', 'share', 'audio', 'view'), message: 'data/ は他の層を読まない' }),
    },
  },
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': restrict(LIB_VIEW, LIB_AUDIO, { group: layers('music', 'share', 'audio', 'view'), message: 'core/ が読んでよいのは data/ だけ' }),
    },
  },
  {
    files: ['src/music/**/*.ts'],
    rules: {
      'no-restricted-imports': restrict(LIB_VIEW, LIB_AUDIO, { group: layers('share', 'audio', 'view'), message: 'music/ が読んでよいのは core/ と data/ だけ' }),
      'no-restricted-properties': NO_NONDETERMINISM,
    },
  },
  {
    files: ['src/share/**/*.ts'],
    rules: {
      'no-restricted-imports': restrict(LIB_VIEW, LIB_AUDIO, { group: layers('audio', 'view'), message: 'share/ が読んでよいのは core/ と music/ だけ' }),
    },
  },
  {
    files: ['src/audio/**/*.ts'],
    rules: {
      'no-restricted-imports': restrict(LIB_VIEW, { group: layers('view'), message: 'audio/ は view/ を読まない' }),
    },
  },
);
