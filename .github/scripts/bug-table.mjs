#!/usr/bin/env node
// バグ表の検査・転記スクリプト。
// 正本: ドキュメント/04_テスト/02_バグ表.md 2章（起票は1バグ1ファイル、記録は3章の表1つ）
//
//   node .github/scripts/bug-table.mjs check  3章の表と バグ/未採番/*.md の形式・ID重複・必須項目を検査する（CIで実行）
//   node .github/scripts/bug-table.mjs sync   対応の終わった バグ/未採番/*.md に BUG-nnn を採番して3章の表へ転記し、元のファイルを消す
//                                             （状態が 未対応・対応中 のものは採番せず据え置く。
//                                              master 上で /bug-sync と bug-table-sync.yml だけが実行する）
//
// 依存なし（Node.js 18 以上）。Windows / Linux で同じ結果になるよう、出力は LF・UTF-8（BOM無し）で書く。

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TABLE = path.join(ROOT, 'ドキュメント', '04_テスト', '02_バグ表.md');
const PENDING_DIR = path.join(ROOT, 'ドキュメント', '04_テスト', 'バグ', '未採番');
const START = '<!-- bug-table:start -->';
const END = '<!-- bug-table:end -->';

// 列の順序は 02_バグ表.md 3章の見出しと同じ。先頭の バグID は転記時に採番して付ける。
const COLUMNS = ['検出工程', '検出日', '検出者', '対象', '事象', '重要度', '混入工程', '原因', '対応内容', '修正コミット', '状態', '確認日', '密度計上', '備考'];
const REQUIRED = ['検出工程', '検出日', '検出者', '対象', '事象', '重要度', '状態'];
const SEVERITIES = ['致命的', '重大', '中', '軽微'];
const STATES = ['未対応', '対応中', '修正済', '確認済', '取り下げ'];
// 転記する状態。`未対応`・`対応中` は本人がまだ未採番ファイルへ書き足している最中なので据え置く
// （消すと、修正内容を書いた作業ブランチ側と削除がぶつかる。2-0）
const SYNC_STATES = ['修正済', '確認済', '取り下げ'];
// 結合テストは「誰が最初に事象に気づいたか」で人間・AIに分ける（バグ表1章）
const PHASES = ['結合テスト（人間）', '結合テスト（AI）', 'システムテスト', 'リリース後'];
const ID_RE = /^BUG-(\d{3,})$/;
// 未採番ファイル名: <担当者ローマ字>-<YYYYMMDD>-<HHmmss>（例: yamada-20260908-193012）。担当者と時刻で一意にし、番号を持たない。
const PENDING_RE = /^[a-z][a-z0-9]*-\d{8}-\d{6}$/;

// Markdown の表セルを分割する。`\|` はセル内の縦棒としてそのまま残す。
function splitCells(line) {
  const cells = [];
  let cur = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '\\' && line[i + 1] === '|') { cur += '\\|'; i++; continue; }
    if (ch === '|') { cells.push(cur); cur = ''; continue; }
    cur += ch;
  }
  cells.push(cur);
  // 先頭と末尾の `|` の外側は空文字になる
  if (cells.length && cells[0].trim() === '') cells.shift();
  if (cells.length && cells[cells.length - 1].trim() === '') cells.pop();
  return cells.map((c) => c.trim());
}

function idNumber(id) { return Number(id.slice(4)); }
function rel(file) { return path.relative(ROOT, file).replace(/\\/g, '/'); }

function fail(errors) {
  for (const e of errors) console.error(`::error::${e}`);
  process.exit(1);
}

// 値の書式を検査する。表の行にも未採番ファイルにも同じ規則を当てる。
function checkFields(where, fields, errors) {
  for (const col of REQUIRED) {
    if (!fields[col]) errors.push(`${where}: 起票時に必須の項目「${col}」が空です`);
  }
  if (fields['検出日'] && !/^\d{4}-\d{2}-\d{2}$/.test(fields['検出日'])) errors.push(`${where}: 検出日「${fields['検出日']}」は YYYY-MM-DD で書きます`);
  if (fields['確認日'] && !/^\d{4}-\d{2}-\d{2}$/.test(fields['確認日'])) errors.push(`${where}: 確認日「${fields['確認日']}」は YYYY-MM-DD で書きます`);
  if (fields['重要度'] && !SEVERITIES.includes(fields['重要度'])) errors.push(`${where}: 重要度「${fields['重要度']}」は 2-2 の値ではありません`);
  if (fields['状態'] && !STATES.includes(fields['状態'])) errors.push(`${where}: 状態「${fields['状態']}」は 2-3 の値ではありません`);
  if (fields['検出工程'] && !PHASES.includes(fields['検出工程'])) errors.push(`${where}: 検出工程「${fields['検出工程']}」は 1 章の値ではありません`);
  if (fields['密度計上'] && !['○', '—'].includes(fields['密度計上'])) errors.push(`${where}: 密度計上「${fields['密度計上']}」は ○ / — のどちらかにします`);
}

// --- 3章の表（正本） --------------------------------------------------------

async function readTable() {
  const text = (await fs.readFile(TABLE, 'utf8')).replace(/^﻿/, '');
  return text.replace(/\r\n/g, '\n');
}

// マーカーは「その行にマーカーだけがある行」で探す。本文中でマーカー名を説明として書いても
// （2章の「場所 | 役割」表のように）表の範囲と取り違えないようにするため。
function findMarkerLines(lines) {
  const s = lines.findIndex((l) => l.trim() === START);
  const e = s < 0 ? -1 : lines.findIndex((l, i) => i > s && l.trim() === END);
  return [s, e];
}

// マーカーの間を読み、バグの行だけを取り出す。見出し行・区切り行は行番号で覚えておく。
function parseTable(text, errors) {
  const lines = text.split('\n');
  const [s, e] = findMarkerLines(lines);
  if (s < 0 || e < 0) { errors.push(`${rel(TABLE)} に ${START} 〜 ${END} のマーカー行がありません（マーカーは行にそれだけを置く）`); return null; }
  // マーカーはHTMLコメントなので、空行で区切らないと後続の表がHTMLブロックに飲み込まれ、
  // Markdownの表として描画されずに生のテキストで出る（Obsidian・GitHub とも）。
  if (lines[s + 1] !== undefined && lines[s + 1].trim()) errors.push(`${rel(TABLE)}:${s + 2}: ${START} の直後に空行が要ります（無いと表が描画されません）`);
  if (lines[e - 1] !== undefined && lines[e - 1].trim()) errors.push(`${rel(TABLE)}:${e}: ${END} の直前に空行が要ります（無いと表が描画されません）`);
  const rows = [];
  const seen = new Map();
  for (let i = s + 1; i < e; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    if (!line.startsWith('|')) { errors.push(`${rel(TABLE)}:${i + 1}: 表の中に表以外の行があります`); continue; }
    const cells = splitCells(line);
    if (cells[0] === 'バグID' || /^-+$/.test(cells[0])) continue;
    const where = `${rel(TABLE)}:${i + 1}`;
    if (!ID_RE.test(cells[0])) { errors.push(`${where}: 先頭の列「${cells[0]}」が BUG-nnn の形式ではありません`); continue; }
    if (cells.length !== COLUMNS.length + 1) { errors.push(`${where}: ${cells[0]} の列数が ${cells.length}（期待 ${COLUMNS.length + 1}）です`); continue; }
    if (seen.has(cells[0])) errors.push(`${where}: バグID ${cells[0]} が重複しています（${seen.get(cells[0])}）`);
    seen.set(cells[0], where);
    const fields = {};
    COLUMNS.forEach((c, k) => { fields[c] = cells[k + 1]; });
    checkFields(where, fields, errors);
    rows.push({ id: cells[0], fields, line: i });
  }
  // マーカーの外にバグの行が落ちていないか（表が別の場所へ書かれていないか）
  for (let i = 0; i < lines.length; i++) {
    if (i > s && i < e) continue;
    if (/^\| *BUG-\d+ *\|/.test(lines[i])) errors.push(`${rel(TABLE)}:${i + 1}: バグの行がマーカーの外にあります（3章の ${START} 〜 ${END} の間へ移す）`);
  }
  return { lines, start: s, end: e, rows };
}

// --- 未採番（起票直後の1バグ1ファイル） --------------------------------------

async function readPending(errors) {
  const pending = [];
  let names = [];
  try { names = await fs.readdir(PENDING_DIR); } catch { return pending; }
  for (const name of names.sort()) {
    if (!name.endsWith('.md') || name === 'README.md') continue;
    const stem = name.slice(0, -3);
    const file = path.join(PENDING_DIR, name);
    const r = rel(file);
    if (!PENDING_RE.test(stem)) { errors.push(`${r}: ファイル名が <担当者ローマ字>-<YYYYMMDD>-<HHmmss>.md の形式ではありません`); continue; }
    const text = (await fs.readFile(file, 'utf8')).replace(/^﻿/, '');
    const lines = text.split(/\r?\n/);
    const title = lines.find((l) => l.startsWith('# '));
    if (!title || title.slice(2).trim() !== stem) errors.push(`${r}: 見出し「# ${stem}」がファイル名と一致しません`);
    const fields = {};
    for (const l of lines) {
      if (!l.startsWith('|')) continue;
      const cells = splitCells(l);
      if (cells.length !== 2) continue;
      if (cells[0] === '項目' || /^-+$/.test(cells[0])) continue;
      if (fields[cells[0]] !== undefined) errors.push(`${r}: 項目「${cells[0]}」が重複しています`);
      fields[cells[0]] = cells[1];
    }
    for (const col of COLUMNS) {
      if (fields[col] === undefined) errors.push(`${r}: 項目「${col}」の行がありません（空でも行は置く）`);
    }
    for (const key of Object.keys(fields)) {
      if (!COLUMNS.includes(key)) errors.push(`${r}: 項目「${key}」はバグ表の列にありません（列を増やさない。影響調査ルール）`);
    }
    checkFields(r, fields, errors);
    pending.push({ id: stem, fields, path: file, file: r });
  }
  // 転記順: 検出日の早い順、同日ならファイル名（担当者・起票時刻）順。実行のたびに同じ順になる
  pending.sort((a, b) => (a.fields['検出日'] || '').localeCompare(b.fields['検出日'] || '') || a.id.localeCompare(b.id));
  return pending;
}

// --- モード -----------------------------------------------------------------

async function check() {
  const errors = [];
  const text = await readTable();
  const table = parseTable(text, errors);
  const pending = await readPending(errors);
  if (errors.length) fail(errors);
  console.log(`バグ表の検査OK（表 ${table.rows.length} 件、未採番 ${pending.length} 件）`);
}

// 対応の終わった未採番ファイル（状態が SYNC_STATES）に BUG-nnn を付けて3章の表の末尾へ転記し、元のファイルを消す。
// 未対応・対応中 のファイルは採番せずそのまま残す（据え置き）。
// 番号は表にある最大＋1 から順に、検出日→ファイル名の順で振る。
// master 上で /bug-sync と bug-table-sync.yml だけが実行する（採番する場所を1つにして番号の取り合いを無くす）。
async function sync() {
  const errors = [];
  const text = await readTable();
  const table = parseTable(text, errors);
  const pending = await readPending(errors);
  if (errors.length) fail(errors);
  if (!pending.length) { console.log(`未採番のファイルはありません（表 ${table.rows.length} 件）`); return; }

  const ready = pending.filter((p) => SYNC_STATES.includes(p.fields['状態']));
  const held = pending.filter((p) => !SYNC_STATES.includes(p.fields['状態']));
  // 据え置きは「転記:」で始めない。bug-table-sync.yml が `grep -c '^転記:'` で転記件数を数えるため
  for (const p of held) console.log(`据え置き: ${p.id}（状態 ${p.fields['状態']}）`);
  if (!ready.length) { console.log(`転記できる未採番はありません（表 ${table.rows.length} 件、据え置き ${held.length} 件）`); return; }

  let n = table.rows.length ? Math.max(...table.rows.map((r) => idNumber(r.id))) : 0;
  const added = [];
  for (const p of ready) {
    n += 1;
    const id = `BUG-${String(n).padStart(3, '0')}`;
    // 空セルは「| |」（空白1つ）にする。既存の行の書式と同じにする
    const row = `| ${id} | ${COLUMNS.map((c) => p.fields[c] || '').join(' | ')} |`.replace(/\|  \|/g, '| |').replace(/\|  \|/g, '| |');
    added.push(row);
    console.log(`転記: ${p.id} → ${id}（${p.fields['対象']}）`);
  }
  // 表の最後の行の直後へ足す。マーカーの内側には Markdown が表として描画されるよう空行を置いてあるので、
  // END の直前へ入れると空行をまたいで表が切れてしまう。
  let at = table.end;
  while (at - 1 > table.start && !table.lines[at - 1].trim()) at -= 1;
  const next = [...table.lines.slice(0, at), ...added, ...table.lines.slice(at)].join('\n');
  await fs.writeFile(TABLE, next, 'utf8');
  for (const p of ready) await fs.unlink(p.path);
  const first = `BUG-${String(n - ready.length + 1).padStart(3, '0')}`;
  const heldNote = held.length ? `。据え置き ${held.length} 件（状態が 未対応・対応中）` : '';
  console.log(`${ready.length} 件を転記しました（${first}〜BUG-${String(n).padStart(3, '0')}）。転記した未採番のファイルは消しました${heldNote}`);
}

const mode = process.argv[2];
const run = { check, sync }[mode];
if (!run) {
  console.error('使い方: node .github/scripts/bug-table.mjs <check|sync>');
  process.exit(2);
}
await run();
