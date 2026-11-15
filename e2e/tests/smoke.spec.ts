import { expect, test } from '../fixtures/test';

// 起動確認。画面が描画され、コンソールにエラーが出ないこと。
// 画面ができたら、テスト方針の手順（/gen-e2e-scenario → /gen-e2e）で作るシナリオに置き換える
test('起動するとゲームの画面（canvas）が出て、エラーが出ない', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto('/');
  await expect(page.locator('#app canvas')).toBeVisible();
  expect(errors).toEqual([]);
});
