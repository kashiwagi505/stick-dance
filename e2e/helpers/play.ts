import type { BrowserContext, Page } from '@playwright/test';
import { expect } from '../fixtures/test';

// 遊ぶ操作の組み立て（テスト方針4-3: 前提は画面操作で作る。時間は固定せず、画面の文字が変わるのを待つ）。

/** 1周（124 BPM の4小節）は約7.7秒。周をまたぐ待ちの上限に使う */
export const LOOP_MS = 7_800;

/** トップを開き、読み込みが終わってから「はじめる」を押して踊る画面へ進む */
export async function startDancing(page: Page): Promise<void> {
  await page.goto('/');
  const start = page.getByRole('button', { name: 'はじめる' });
  await expect(start).toBeEnabled({ timeout: 20_000 });
  await start.click();
  await expect(page.getByRole('heading', { name: '踊る' })).toBeAttached();
}

/** 分身の数の表示 */
export function layerCount(page: Page) {
  return page.getByText(/^分身 \d \/ 5$/);
}

/**
 * 分身が n 人になるまで、W・S・↑・↓ を順に短く押し続けて踊る。
 * 頭が揺れ続けるので、1周で分身が残る数を十分に超えて鳴る
 */
export async function danceUntilLayers(page: Page, n: number): Promise<void> {
  const keys = ['KeyW', 'KeyS', 'ArrowUp', 'ArrowDown'];
  const deadline = Date.now() + LOOP_MS * 2.5;
  for (let i = 0; Date.now() < deadline; i++) {
    if (!(await layerCount(page).isVisible())) return; // 鑑賞へ切り替わった（5人目が残ったなど）
    if ((await layerCount(page).textContent()) === `分身 ${n} / 5`) return;
    const key = keys[i % keys.length] ?? 'KeyW';
    await page.keyboard.down(key);
    await page.waitForTimeout(160); // キーを押している長さ（体を引く操作そのもの）
    await page.keyboard.up(key);
  }
  await expect(layerCount(page)).toHaveText(`分身 ${n} / 5`);
}

/** 1周踊って分身を1人残し、Enter で鑑賞へ進んで、鑑賞画面に切り替わるのを待つ */
export async function danceOneAndView(page: Page): Promise<void> {
  await startDancing(page);
  await danceUntilLayers(page, 1);
  await page.keyboard.press('Enter');
  await expect(page.getByText(/^鑑賞中 — 1 \/ \d 人$/)).toBeVisible({ timeout: LOOP_MS * 2 });
}

/** 鑑賞が終わって「おわり」の操作が出るのを待つ（鑑賞は 分身の数＋1 周） */
export async function waitViewingEnd(page: Page, people = 2): Promise<void> {
  await expect(page.getByRole('heading', { name: 'おわり' })).toBeVisible({ timeout: LOOP_MS * (people + 2) });
}

/** ケースの中で遊んで共有URLを作り、クリップボードから読む（テスト方針4-3） */
export async function makeShareUrl(context: BrowserContext): Promise<string> {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const page = await context.newPage();
  await danceOneAndView(page);
  await waitViewingEnd(page);
  await page.getByRole('button', { name: '共有URLをコピーする' }).click();
  await expect(page.getByText('共有URLをコピーしました。チャットやSNSに貼って渡せます。')).toBeVisible();
  const url = await page.evaluate(() => navigator.clipboard.readText());
  await page.close();
  return url;
}

/** 画面が隠れた・戻ったことにする（spec 側で visibilitychange を起こす。テスト方針4-8） */
export async function setHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((h) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

/** ページと同じサイトの外への通信を集める */
export function watchExternalRequests(page: Page, origin: string): string[] {
  const out: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.protocol.startsWith('http') && u.origin !== origin) out.push(r.url());
  });
  return out;
}

/** 横スクロールが出ていないか（ページの幅が表示幅に収まる） */
export async function hasHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
}
