// 実装側の CSS がデザインシステム（正本）とずれていないことを確かめる（デザインシステム readme.md 3章）。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../..');
const ds = resolve(root, 'ドキュメント/02_基本設計/画面設計/デザインシステム');
const read = (p: string): string => readFileSync(p, 'utf8');

/** CSS のカスタムプロパティ（--名前: 値;）を取り出す */
function customProperties(css: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    const [, name, value] = m;
    if (name && value) out.set(name, value.trim());
  }
  return out;
}

/** コメントを除いた CSS の規則（空白をそろえる） */
function rules(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim();
}

describe('デザインシステムの写し', () => {
  it('tokens.css のトークンの名前と値が正本と同じ', () => {
    const src = customProperties(read(resolve(__dirname, 'tokens.css')));
    const canon = customProperties(read(resolve(ds, 'tokens/tokens.css')));
    expect(src.size).toBeGreaterThan(0);
    expect(Object.fromEntries(src)).toEqual(Object.fromEntries(canon));
  });

  it('components.css の規則が正本（部品.css）と同じ', () => {
    expect(rules(read(resolve(__dirname, 'components.css')))).toBe(rules(read(resolve(ds, 'components/部品.css'))));
  });

  it('タイトル書体とライセンス本文が正本と同じものを配信する', () => {
    expect(readFileSync(resolve(root, 'public/fonts/StickTitle.woff2'))).toEqual(readFileSync(resolve(ds, 'fonts/StickTitle.woff2')));
    expect(read(resolve(root, 'public/fonts/OFL.txt'))).toBe(read(resolve(ds, 'fonts/OFL.txt')));
  });
});
