import { expect, test } from '../fixtures/test';
import { saveEvidence } from '../helpers/evidence';

const SCREEN = 'DLG01';

test.describe('DLG01 クレジットの窓', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'クレジット' }).click();
  });

  test('DLG01-01 区分と素材ごとの名前・作者・ライセンスが出る', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: 'クレジット' });
    await expect(dialog.getByRole('heading', { level: 3 })).toHaveText(['楽器の音', '書体', '音を鳴らすしくみ']);
    for (const name of ['Virtuosity Drums', 'Black And Blue Basses', 'Stick', 'Tone.js']) await expect(dialog.getByText(name, { exact: true })).toBeVisible();
    await expect(dialog.getByText('Versilian Studios / Karoryfer Samples ／ CC0 1.0')).toBeVisible();
    await expect(dialog.getByText('Karoryfer Samples ／ CC0 1.0', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Fontworks Inc. ／ SIL Open Font License 1.1')).toBeVisible();
    await expect(dialog.getByText('Yotam Mann ほか ／ MIT License')).toBeVisible();
    await expect(dialog.getByText('このゲームは、次の素材とライブラリを使っています。ありがとうございます。')).toBeVisible();
    await expect(dialog.getByText('旋律・和音・高い旋律の音と手拍子は、このゲームの中で作った音です。')).toBeVisible();
    await saveEvidence(page, SCREEN, 'DLG01-01', 1);
  });

  test('DLG01-02 開くと「閉じる」にフォーカスがあり、押すと閉じて「クレジット」にフォーカスが戻る', async ({ page }) => {
    const close = page.getByRole('button', { name: '閉じる' });
    await expect(close).toBeFocused();
    await close.click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'クレジット' })).toBeFocused();
    await saveEvidence(page, SCREEN, 'DLG01-02', 1);
  });

  test('DLG01-03 Esc で閉じてトップに戻る', async ({ page }) => {
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: '棒人間ダンシング' })).toBeVisible();
    await saveEvidence(page, SCREEN, 'DLG01-03', 1);
  });
});
