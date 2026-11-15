import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures/test';
import { saveEvidence } from '../helpers/evidence';
import { LOOP_MS, danceUntilLayers, hasHorizontalScroll, layerCount, setHidden, startDancing } from '../helpers/play';

const SCREEN = 'SCR02';

/** 楽器の選択の i 番目（0始まり）のボタン */
const instrument = (page: Page, i: number) => page.getByRole('group', { name: '楽器' }).getByRole('button').nth(i);
/** いまの案内の「この周 m音」の m */
async function notesThisLoop(page: Page): Promise<number> {
  const text = (await page.getByText(/人目を踊っています — この周 \d+音/).textContent()) ?? '';
  return Number(/この周 (\d+)音/.exec(text)?.[1] ?? NaN);
}

test.describe('SCR02 踊る画面', () => {
  test('SCR02-01 初期表示: 1 旋律・分身 0 / 5・ボタンは押せない・ヒントと1人目の案内が出る', async ({ page }) => {
    await startDancing(page);
    await expect(instrument(page, 0)).toHaveAttribute('aria-pressed', 'true');
    await expect(layerCount(page)).toHaveText('分身 0 / 5');
    await expect(page.getByRole('button', { name: '最後の1人を消す' })).toBeDisabled();
    await expect(page.getByRole('button', { name: '鑑賞へ' })).toBeDisabled();
    const hint = page.getByRole('region', { name: 'キーで手を引っぱる' });
    for (const k of ['W', 'A', 'S', 'D', '↑', '←', '↓', '→']) await expect(hint.getByText(k, { exact: true })).toBeVisible();
    await expect(hint.getByText('頭が動くと、その高さの音が鳴る')).toBeVisible();
    await expect(page.getByText(/^1人目を踊っています — この周 \d+音（4音で残ります）$/)).toBeVisible();
    await saveEvidence(page, SCREEN, 'SCR02-01', 1);
  });

  test('SCR02-02 数字キーとクリックで楽器を選べる', async ({ page }) => {
    await startDancing(page);
    await page.keyboard.press('Digit3');
    await expect(instrument(page, 2)).toHaveAttribute('aria-pressed', 'true');
    await expect(instrument(page, 0)).toHaveAttribute('aria-pressed', 'false');
    await saveEvidence(page, SCREEN, 'SCR02-02', 1);
    await instrument(page, 4).click();
    await expect(instrument(page, 4)).toHaveAttribute('aria-pressed', 'true');
    await saveEvidence(page, SCREEN, 'SCR02-02', 2);
  });

  test('SCR02-03 手を引くキーを押し続けると「この周 m音」が増える', async ({ page }) => {
    await startDancing(page);
    for (let i = 0; i < 8; i++) {
      const key = i % 2 ? 'KeyW' : 'KeyS';
      await page.keyboard.down(key);
      await page.waitForTimeout(200);
      await page.keyboard.up(key);
    }
    await expect.poll(() => notesThisLoop(page)).toBeGreaterThan(0);
    await saveEvidence(page, SCREEN, 'SCR02-03', 1);
  });

  test('SCR02-04 1周踊り続けると分身が1人残り、旋律に「済」、次はベース、ヒントが消える', async ({ page }) => {
    test.setTimeout(60_000);
    await startDancing(page);
    await danceUntilLayers(page, 1);
    await expect(page.getByText('— 1人目が残りました')).toBeVisible();
    await expect(instrument(page, 0)).toContainText('済');
    await expect(instrument(page, 1)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('region', { name: 'キーで手を引っぱる' })).toBeHidden({ timeout: LOOP_MS });
    await saveEvidence(page, SCREEN, 'SCR02-04', 1);
  });

  test('SCR02-05 何も押さない周は残らず、1周目の終わりでヒントが消える', async ({ page }) => {
    test.setTimeout(60_000);
    await startDancing(page);
    await expect(page.getByRole('region', { name: 'キーで手を引っぱる' })).toBeHidden({ timeout: LOOP_MS * 2 });
    await expect(page.getByText(/^1人目を踊っています — この周 0音/)).toBeVisible();
    await expect(layerCount(page)).toHaveText('分身 0 / 5');
    await saveEvidence(page, SCREEN, 'SCR02-05', 1);
  });

  test('SCR02-06 Backspace で最後の1人を消せる', async ({ page }) => {
    test.setTimeout(60_000);
    await startDancing(page);
    await danceUntilLayers(page, 1);
    await page.keyboard.press('Backspace');
    await expect(layerCount(page)).toHaveText('分身 0 / 5');
    await expect(page.getByText('— 1人目を消しました')).toBeVisible();
    await expect(page.getByRole('button', { name: '最後の1人を消す' })).toBeDisabled();
    await saveEvidence(page, SCREEN, 'SCR02-06', 1);
  });

  test('SCR02-07 Enter で鑑賞を予約し、周の終わりで鑑賞画面に切り替わる', async ({ page }) => {
    test.setTimeout(60_000);
    await startDancing(page);
    await danceUntilLayers(page, 1);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: '周の終わりで鑑賞へ' })).toBeDisabled();
    await expect(page.getByText('この周が終わったら鑑賞に入ります')).toBeVisible();
    await expect(instrument(page, 2)).toBeDisabled();
    await saveEvidence(page, SCREEN, 'SCR02-07', 1);
    await expect(page.getByText(/^鑑賞中 — 1 \/ \d 人$/)).toBeVisible({ timeout: LOOP_MS * 2 });
    await expect(page.getByRole('heading', { name: '鑑賞' })).toBeAttached();
    await saveEvidence(page, SCREEN, 'SCR02-07', 2);
  });

  test('SCR02-08 受け付けないキーを押しても、楽器・分身の数・画面が変わらない', async ({ page }) => {
    await startDancing(page);
    for (const k of ['KeyQ', 'Digit7', 'Digit0', 'KeyZ']) await page.keyboard.press(k);
    await expect(instrument(page, 0)).toHaveAttribute('aria-pressed', 'true');
    await expect(layerCount(page)).toHaveText('分身 0 / 5');
    await expect(page.getByRole('heading', { name: '踊る' })).toBeAttached();
    await saveEvidence(page, SCREEN, 'SCR02-08', 1);
  });

  test('SCR02-09 Space で一時停止し、もう一度 Space で続きから', async ({ page }) => {
    await startDancing(page);
    await page.keyboard.press('Space');
    const paused = page.getByRole('status').filter({ has: page.getByRole('heading', { name: '一時停止中' }) });
    await expect(paused).toBeVisible();
    await expect(paused).toContainText('Space で続きから');
    await saveEvidence(page, SCREEN, 'SCR02-09', 1);
    await page.keyboard.press('Space');
    await expect(paused).toBeHidden();
    await saveEvidence(page, SCREEN, 'SCR02-09', 2);
  });

  test('SCR02-10 画面が隠れると一時停止し、戻ると自動で続きから', async ({ page }) => {
    await startDancing(page);
    await setHidden(page, true);
    const paused = page.getByRole('status').filter({ has: page.getByRole('heading', { name: '一時停止中' }) });
    await expect(paused).toBeVisible();
    await expect(paused).toContainText('画面に戻ると続きから');
    await saveEvidence(page, SCREEN, 'SCR02-10', 1);
    await setHidden(page, false);
    await expect(paused).toBeHidden();
    await saveEvidence(page, SCREEN, 'SCR02-10', 2);
  });

  test('SCR02-11 5人目が残ると、その周の終わりで自動で鑑賞画面に切り替わる', async ({ page }) => {
    test.setTimeout(180_000);
    await startDancing(page);
    for (let n = 1; n <= 4; n++) await danceUntilLayers(page, n);
    await saveEvidence(page, SCREEN, 'SCR02-11', 1);
    await danceUntilLayers(page, 5);
    await expect(page.getByText('鑑賞中 — 1 / 5 人')).toBeVisible({ timeout: LOOP_MS * 2 });
    await saveEvidence(page, SCREEN, 'SCR02-11', 2);
  });

  test('SCR02-12 Desktop Chrome の表示幅で横スクロールが出ない', async ({ page }) => {
    await startDancing(page);
    expect(await hasHorizontalScroll(page)).toBe(false);
    await saveEvidence(page, SCREEN, 'SCR02-12', 1);
  });
});
