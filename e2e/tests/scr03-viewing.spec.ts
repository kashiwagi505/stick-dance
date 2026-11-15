import { expect, test } from '../fixtures/test';
import { saveEvidence } from '../helpers/evidence';
import { LOOP_MS, danceOneAndView, setHidden, waitViewingEnd, watchExternalRequests } from '../helpers/play';

const SCREEN = 'SCR03';

test.describe('SCR03 鑑賞画面', () => {
  test.beforeEach(async ({ context }) => {
    test.setTimeout(90_000);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  });

  test('SCR03-01 「鑑賞中 — 1 / n 人」が出て、終わるまで「共有URLをコピーする」は出ない', async ({ page }) => {
    await danceOneAndView(page);
    await expect(page.getByRole('heading', { name: '鑑賞' })).toBeAttached();
    await expect(page.getByRole('button', { name: '共有URLをコピーする' })).toBeHidden();
    await saveEvidence(page, SCREEN, 'SCR03-01', 1);
  });

  test('SCR03-02 最後の周が終わると「おわり」と、コピー・もう一度見る・再読み込みの注意が出る', async ({ page }) => {
    await danceOneAndView(page);
    await waitViewingEnd(page);
    const copy = page.getByRole('button', { name: '共有URLをコピーする' });
    await expect(copy).toBeFocused();
    await expect(page.getByRole('button', { name: 'もう一度見る' })).toBeVisible();
    await expect(page.getByText('コピーしないまま再読み込みすると、この曲は消えます。')).toBeVisible();
    await saveEvidence(page, SCREEN, 'SCR03-02', 1);
  });

  test('SCR03-03 「共有URLをコピーする」でコピーでき、クリップボードに #r=1. で始まる共有URLが入る', async ({ page }) => {
    await danceOneAndView(page);
    await waitViewingEnd(page);
    await page.getByRole('button', { name: '共有URLをコピーする' }).click();
    await expect(page.getByText('共有URLをコピーしました。チャットやSNSに貼って渡せます。')).toBeVisible();
    const url = await page.evaluate(() => navigator.clipboard.readText());
    expect(new URL(url).hash).toMatch(/^#r=1\.[A-Za-z0-9_-]+$/);
    await saveEvidence(page, SCREEN, 'SCR03-03', 1);
  });

  test('SCR03-04 コピーに失敗すると案内が出て、共有URLの欄に共有URLが入る', async ({ page }) => {
    // クリップボードへの書き込みが失敗する状態を spec 側で作る（アプリには手を入れない）
    await page.addInitScript(() => {
      Object.defineProperty(navigator.clipboard, 'writeText', { value: () => Promise.reject(new Error('denied')) });
    });
    await danceOneAndView(page);
    await waitViewingEnd(page);
    await page.getByRole('button', { name: '共有URLをコピーする' }).click();
    await expect(page.getByRole('alert')).toHaveText('コピーできませんでした。下の欄のURLを選んでコピーしてください。');
    await expect(page.getByLabel('共有URL')).toHaveValue(/#r=1\./);
    await saveEvidence(page, SCREEN, 'SCR03-04', 1);
  });

  test('SCR03-05 「もう一度見る」で頭から再生し直す', async ({ page }) => {
    await danceOneAndView(page);
    await waitViewingEnd(page);
    await page.getByRole('button', { name: 'もう一度見る' }).click();
    await expect(page.getByRole('heading', { name: 'おわり' })).toBeHidden();
    await expect(page.getByText(/^鑑賞中 — 1 \/ \d 人$/)).toBeVisible();
    await saveEvidence(page, SCREEN, 'SCR03-05', 1);
  });

  test('SCR03-06 コピーした共有URLを開くと、遊ばずに共有を開いた画面が出る', async ({ page, context }) => {
    await danceOneAndView(page);
    await waitViewingEnd(page);
    await page.getByRole('button', { name: '共有URLをコピーする' }).click();
    const url = await page.evaluate(() => navigator.clipboard.readText());
    const shared = await context.newPage();
    await shared.goto(url);
    await expect(shared.getByRole('heading', { name: '共有された踊り', level: 3 })).toBeVisible();
    await expect(shared.getByText(/^\d人の分身が踊ります$/)).toBeVisible();
    await expect(shared.getByRole('heading', { name: '踊る' })).toHaveCount(0);
    await saveEvidence(shared, SCREEN, 'SCR03-06', 1);
  });

  test('SCR03-07 鑑賞中に画面が隠れると一時停止し、戻ると続きから', async ({ page }) => {
    await danceOneAndView(page);
    await setHidden(page, true);
    const paused = page.getByRole('status').filter({ has: page.getByRole('heading', { name: '一時停止中' }) });
    await expect(paused).toBeVisible();
    await saveEvidence(page, SCREEN, 'SCR03-07', 1);
    await setHidden(page, false);
    await expect(paused).toBeHidden();
    await expect(page.getByText(/^鑑賞中/)).toBeVisible({ timeout: LOOP_MS });
    await saveEvidence(page, SCREEN, 'SCR03-07', 2);
  });

  test('SCR03-08 鑑賞から共有URLのコピーまで、同じサイトの外へ通信しない', async ({ page, baseURL }) => {
    const external = watchExternalRequests(page, new URL(baseURL ?? '').origin);
    await danceOneAndView(page);
    await waitViewingEnd(page);
    await page.getByRole('button', { name: '共有URLをコピーする' }).click();
    await expect(page.getByText('共有URLをコピーしました。チャットやSNSに貼って渡せます。')).toBeVisible();
    expect(external).toEqual([]);
    await saveEvidence(page, SCREEN, 'SCR03-08', 1);
  });
});
