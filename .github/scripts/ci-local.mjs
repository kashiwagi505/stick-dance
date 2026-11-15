#!/usr/bin/env node
// GitHub Actions（ci.yml・pr-target.yml）の検査を、ローカルの作業ツリーで同じ内容で実行する。
// /merge-pr がマージ前のゲートとしてこれを呼ぶ（Actions の有無に依存しない）。
//
//   node .github/scripts/ci-local.mjs --base origin/master --head-ref dev/yamada
//
//   --base      比較先（既定: origin/master）。この ref と HEAD の merge-base を PR の分岐点として使う
//   --head-ref  PR の head ブランチ名。渡すと pr-target.yml と同じ向き先チェックを行う
//
// 実行するのは「数秒で終わる検査」だけ。ci.yml のうちビルド検査（npm run check）は数分かかるため、
// 要否だけを判定して最後の BUILD 行に出し、実行は呼び出し側（/merge-pr）に任せる。
//
// 検査対象のファイルは、このスクリプト自身の位置から決まる。PR のマージ結果を検査したい場合は、
// マージ結果をチェックアウトした作業ツリーの中にあるこのファイルを実行する。
//
// 依存なし（Node.js 18 以上）。Actions を常用する運用に切り替えるなら、ci.yml の結果を見るのが正で、この経路は不要になる。

import { promises as fs } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BUG_TABLE = path.join('ドキュメント', '04_テスト', '02_バグ表.md');

// ビルド・テスト（npm run check）の結果が変わりうるパス。ここに触れていなければ回さない
// （ドキュメントだけのPRで毎回待たないため）。
const BUILD_PATHS = [
  /^src\//,
  /^e2e\//,
  /^index\.html$/,
  /^package(-lock)?\.json$/,
  /^tsconfig\.json$/,
  /^vite\.config\.ts$/,
  /^eslint\.config\.js$/,
];

const results = [];
function record(name, ok, message) { results.push({ name, ok, message }); }

function git(...args) {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', windowsHide: true });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

function node(script, ...args) {
  const r = spawnSync(process.execPath, [path.join(ROOT, '.github', 'scripts', script), ...args],
    { cwd: ROOT, encoding: 'utf8', windowsHide: true });
  return { ok: r.status === 0, out: `${r.stdout || ''}${r.stderr || ''}`.trim() };
}

function bugIds(text) {
  return [...new Set([...text.matchAll(/^\| *(BUG-\d+) *\|/gm)].map((m) => m[1]))].sort();
}

// --- 引数 -------------------------------------------------------------------

const argv = process.argv.slice(2);
function opt(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}
const base = opt('--base', 'origin/master');
const headRef = opt('--head-ref', '');

// --- 1. PRの向き先（pr-target.yml と同じ判定） -------------------------------

if (!headRef) {
  record('向き先', true, '--head-ref が未指定のため判定を省略');
} else if (/^dev\/[^/-]+-.+$/.test(headRef)) {
  const integration = headRef.replace(/^(dev\/[^/-]+)-.*$/, '$1');
  record('向き先', false,
    `作業ブランチ（${headRef}）から master へ直接PRを出しています。${integration} へマージしてから、${integration} → master のPRを出してください（Git運用手順「1. ブランチ構成」）`);
} else {
  record('向き先', true, `head=${headRef} → master`);
}

// --- 2. 分岐点（merge-base） -------------------------------------------------

const mb = git('merge-base', 'HEAD', base);
if (!mb.ok) {
  record('分岐点', false, `${base} との merge-base を取れません（git fetch origin を先に実行してください）: ${mb.err}`);
} else {
  record('分岐点', true, `${base} との merge-base = ${mb.out.slice(0, 8)}`);
}

// --- 3. バグ表の検査（ci.yml と同じ） ----------------------------------------

const bugCheck = node('bug-table.mjs', 'check');
record('バグ表の書式', bugCheck.ok, bugCheck.out);

// --- 4. バグ表へ手で足した行（ci.yml と同じ） --------------------------------
// 採番は master 上の /bug-sync だけが行う。PR の差分で BUG-nnn が増えていたら手で足している。
// IDは行の1列目からだけ採る（備考欄が他のバグを参照するため、行全体から拾うと誤検知になる）。

if (mb.ok) {
  const baseTable = git('show', `${mb.out}:${BUG_TABLE.replace(/\\/g, '/')}`);
  const headText = await fs.readFile(path.join(ROOT, BUG_TABLE), 'utf8').catch(() => '');
  const before = baseTable.ok ? bugIds(baseTable.out) : [];
  const after = bugIds(headText);
  const added = after.filter((id) => !before.includes(id));
  if (added.length) {
    record('バグ表の採番', false,
      `バグ表3章へ手で行を足しています: ${added.join(' ')}。起票は /bug-new で バグ/未採番/ にファイルを置き、採番と転記は master 上の /bug-sync に任せてください`);
  } else {
    record('バグ表の採番', true, `${after.length} 件。追加された行: なし`);
  }
}

// --- 5. レビュー指摘表の検査（ci.yml と同じ） --------------------------------

const reviewCheck = node('review-table.mjs', 'check');
record('レビュー指摘表', reviewCheck.ok, reviewCheck.out);

// --- 6. ビルド検査（npm run check）の要否 -----------------------------------------------

let build = { required: false, files: [] };
if (mb.ok) {
  const changed = git('diff', '--name-only', mb.out, 'HEAD');
  const files = changed.ok ? changed.out.split('\n').filter(Boolean) : [];
  build.files = files.filter((f) => BUILD_PATHS.some((re) => re.test(f)));
  build.required = build.files.length > 0;
  record('変更ファイル', true, `${files.length} 件（うち ビルド検査の対象 ${build.files.length} 件）`);
}

// --- 出力 -------------------------------------------------------------------

for (const r of results) {
  console.log(`${r.ok ? 'OK  ' : 'NG  '}${r.name}: ${r.message.replace(/\n/g, '\n      ')}`);
}

if (build.required) {
  console.log(`\nBUILD: required（${build.files.slice(0, 10).join(', ')}${build.files.length > 10 ? ` ほか${build.files.length - 10}件` : ''}）`);
} else {
  console.log('\nBUILD: skip（BUILD_PATHS に該当する変更なし）');
}

const failed = results.filter((r) => !r.ok);
if (failed.length) {
  console.error(`\n検査NG: ${failed.map((r) => r.name).join('、')}`);
  process.exit(1);
}
console.log('\n検査OK（残りは npm run check）');
