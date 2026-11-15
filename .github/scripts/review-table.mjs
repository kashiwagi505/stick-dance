#!/usr/bin/env node
// レビュー指摘表の指摘IDを検査するスクリプト。
// 正本: ドキュメント/管理表/AGENTS.md「レビュー指摘表の採番」、ドキュメント/管理表/レビュー指摘表.md 2-1
//
//   node .github/scripts/review-table.mjs check   レビュー指摘表のIDの形式・重複を検査する（CIで実行）
//
// 指摘IDは `REV-nnn`（3桁以上）の通し番号。並行ブランチで同じ番号を付けた場合は取り込む側が振り直す決まりなので、
// 重複が残っていればここで落とす。
// （前案件では担当者別の作業ファイルへ分割起票する運用を試したが、廃止して1表に戻した。）
// 依存なし（Node.js 18 以上）。

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = path.join(ROOT, 'ドキュメント', '管理表');
const MAIN = path.join(DIR, 'レビュー指摘表.md');

const MAIN_ID_RE = /^REV-\d{3,}$/;

function rel(file) { return path.relative(ROOT, file).replace(/\\/g, '/'); }

// 行の1列目だけを見る。備考は他の指摘を参照する（例: 「関連: REV-118」「旧ID REV-K001」）ため、
// 行全体から REV-nnn を拾うと参照先まで拾って誤検知になる。
function readIds(text, file) {
  const rows = [];
  text.replace(/\r\n/g, '\n').split('\n').forEach((line, i) => {
    const m = /^\| *(REV-[A-Z]?\d+) *\|/.exec(line);
    if (m) rows.push({ id: m[1], where: `${rel(file)}:${i + 1}` });
  });
  return rows;
}

async function check() {
  const errors = [];
  const seen = new Map();

  const rows = readIds(await fs.readFile(MAIN, 'utf8'), MAIN);
  for (const { id, where } of rows) {
    if (!MAIN_ID_RE.test(id)) errors.push(`${where}: 指摘ID「${id}」が REV-nnn の形式ではありません（通し番号を付ける）`);
    if (!seen.has(id)) seen.set(id, []);
    seen.get(id).push(where);
  }
  for (const [id, wheres] of seen) {
    if (wheres.length > 1) errors.push(`指摘ID ${id} が ${wheres.length} 箇所で使われています（${wheres.join(' / ')}）。後から取り込む側が最大番号＋1へ振り直し、備考に旧IDを残してください（正本: ドキュメント/管理表/AGENTS.md）`);
  }

  if (errors.length) {
    for (const e of errors) console.error(`::error::${e}`);
    process.exit(1);
  }
  console.log(`レビュー指摘表の検査OK（${rows.length} 件、重複なし）`);
}

const mode = process.argv[2];
if (mode !== 'check') {
  console.error('使い方: node .github/scripts/review-table.mjs check');
  process.exit(2);
}
await check();
