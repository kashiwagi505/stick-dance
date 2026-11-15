import { expect, test } from '../fixtures/test';
import { saveEvidence } from '../helpers/evidence';
import { hasHorizontalScroll, startDancing, watchExternalRequests } from '../helpers/play';

const SCREEN = 'SCR01';
const FAILED = '楽器の音を読み込めませんでした。通信できる状態にして、再読み込みしてください。';

test.describe('SCR01 トップ画面', () => {
  test('SCR01-01 タイトルとリード文が出て、読み込み中は「準備中」、読み込みが終わると「はじめる」が押せる', async ({ page }) => {
    // 読み込み中の表示を確かめるため、音のファイルの応答を spec 側で止めておき、確かめてから流す
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    await page.route('**/sounds/**', async (route) => {
      await gate;
      await route.continue();
    });
    await page.goto('/');
    await expect(page.getByRole('button', { name: '準備中' })).toBeDisabled();
    await expect(page.getByRole('status').filter({ hasText: '楽器の音を読み込んでいます' })).toBeVisible();
    await saveEvidence(page, SCREEN, 'SCR01-01', 1);
    release();
    await expect(page.getByRole('heading', { level: 1, name: '棒人間ダンシング' })).toBeVisible();
    await expect(page.getByText('キーで棒人間を引っぱると、踊りが音になる。')).toBeVisible();
    await expect(page.getByText('音が出ます')).toBeVisible();
    await expect(page.getByRole('button', { name: 'クレジット' })).toBeEnabled();
    const start = page.getByRole('button', { name: 'はじめる' });
    await expect(start).toBeEnabled({ timeout: 20_000 });
    await expect(page.getByText('楽器の音を読み込んでいます')).toHaveCount(0);
    await saveEvidence(page, SCREEN, 'SCR01-01', 2);
  });

  test('SCR01-02 楽器の音を読み込めないと「再読み込みする」と失敗の案内が出る', async ({ page }) => {
    await page.route('**/sounds/**', (r) => r.abort());
    await page.goto('/');
    await expect(page.getByRole('button', { name: '再読み込みする' })).toBeEnabled({ timeout: 20_000 });
    await expect(page.getByRole('alert')).toHaveText(FAILED);
    await expect(page.getByText('音が出ます')).toBeHidden();
    await expect(page.getByRole('button', { name: 'はじめる' })).toHaveCount(0);
    await saveEvidence(page, SCREEN, 'SCR01-02', 1);
  });

  test('SCR01-03 読み込みに失敗したあと「再読み込みする」で読み込み直して遊べる', async ({ page }) => {
    await page.route('**/sounds/**', (r) => r.abort());
    await page.goto('/');
    const reload = page.getByRole('button', { name: '再読み込みする' });
    await expect(reload).toBeEnabled({ timeout: 20_000 });
    await page.unroute('**/sounds/**');
    await reload.click();
    await expect(page.getByRole('button', { name: 'はじめる' })).toBeEnabled({ timeout: 20_000 });
    await saveEvidence(page, SCREEN, 'SCR01-03', 1);
  });

  test('SCR01-04 トップで踊りのキーを押しても何も起きない', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'はじめる' })).toBeEnabled({ timeout: 20_000 });
    for (const k of ['KeyW', 'ArrowUp', 'Digit1', 'Space']) await page.keyboard.press(k);
    await expect(page.getByRole('heading', { level: 1, name: '棒人間ダンシング' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '踊る' })).toHaveCount(0);
    await saveEvidence(page, SCREEN, 'SCR01-04', 1);
  });

  test('SCR01-05 「はじめる」で踊る画面に切り替わり、分身0人・1 旋律・ヒント・1人目の案内が出る', async ({ page }) => {
    await startDancing(page);
    await expect(page.getByText('分身 0 / 5')).toBeVisible();
    await expect(page.getByRole('group', { name: '楽器' }).getByRole('button').first()).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('heading', { name: 'キーで手を引っぱる' })).toBeVisible();
    await expect(page.getByText(/^1人目を踊っています — この周 \d+音/)).toBeVisible();
    await saveEvidence(page, SCREEN, 'SCR01-05', 1);
  });

  test('SCR01-06 「クレジット」でクレジットの窓が開く', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'クレジット' }).click();
    await expect(page.getByRole('dialog', { name: 'クレジット' })).toBeVisible();
    await saveEvidence(page, SCREEN, 'SCR01-06', 1);
  });

  test('SCR01-07 開いてから読み込みが終わるまで、同じサイトの外へ通信しない', async ({ page, baseURL }) => {
    const external = watchExternalRequests(page, new URL(baseURL ?? '').origin);
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'はじめる' })).toBeEnabled({ timeout: 20_000 });
    expect(external).toEqual([]);
    await saveEvidence(page, SCREEN, 'SCR01-07', 1);
  });

  test('SCR01-08 Desktop Chrome の表示幅で横スクロールが出ない', async ({ page }) => {
    await page.goto('/');
    expect(await hasHorizontalScroll(page)).toBe(false);
    await saveEvidence(page, SCREEN, 'SCR01-08', 1);
  });
});
