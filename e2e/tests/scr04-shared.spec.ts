import { expect, test } from '../fixtures/test';
import { saveEvidence } from '../helpers/evidence';
import { makeShareUrl, waitViewingEnd, watchExternalRequests } from '../helpers/play';

const SCREEN = 'SCR04';
const BROKEN_URL = '/#r=1.@@@@';
const OTHER_VERSION_URL = '/#r=0.AAAA';

test.describe('SCR04 共有を開いた画面', () => {
  test('SCR04-01 共有URLを開くと「n人の分身が踊ります」が出て、読み込みが終わると「再生する」が押せる', async ({ page, context }) => {
    test.setTimeout(90_000);
    const url = await makeShareUrl(context);
    await page.goto(url);
    await expect(page.getByRole('heading', { name: '共有された踊り', level: 3 })).toBeVisible();
    await expect(page.getByText(/^\d人の分身が踊ります$/)).toBeVisible();
    await expect(page.getByText('音が出ます')).toBeVisible();
    const play = page.getByRole('button', { name: '再生する' });
    await expect(play).toBeEnabled({ timeout: 20_000 });
    await expect(play).toBeFocused();
    await saveEvidence(page, SCREEN, 'SCR04-01', 1);
  });

  test('SCR04-02 「再生する」で遊ばずに鑑賞が始まり、終わると「自分も踊る」「もう一度見る」が出る', async ({ page, context }) => {
    test.setTimeout(120_000);
    const url = await makeShareUrl(context);
    await page.goto(url);
    await page.getByRole('button', { name: '再生する' }).click();
    await expect(page.getByText(/^鑑賞中 — 1 \/ \d 人$/)).toBeVisible();
    await saveEvidence(page, SCREEN, 'SCR04-02', 1);
    await waitViewingEnd(page);
    await expect(page.getByRole('button', { name: '自分も踊る' })).toBeFocused();
    await expect(page.getByRole('button', { name: 'もう一度見る' })).toBeVisible();
    await saveEvidence(page, SCREEN, 'SCR04-02', 2);
  });

  test('SCR04-03 見終わったあと「自分も踊る」で #r= が消えてトップに切り替わる', async ({ page, context }) => {
    test.setTimeout(120_000);
    const url = await makeShareUrl(context);
    await page.goto(url);
    await page.getByRole('button', { name: '再生する' }).click();
    await waitViewingEnd(page);
    await page.getByRole('button', { name: '自分も踊る' }).click();
    await expect(page.getByRole('heading', { level: 1, name: '棒人間ダンシング' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'はじめる' })).toBeEnabled();
    expect(new URL(page.url()).hash).toBe('');
    await saveEvidence(page, SCREEN, 'SCR04-03', 1);
  });

  test('SCR04-04 壊れたURLは再生せず、開けなかった理由と「自分も踊る」が出る', async ({ page }) => {
    await page.goto(BROKEN_URL);
    await expect(page.getByRole('heading', { name: 'この共有URLは開けませんでした' })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveText('URLが途中で切れているか、形がこわれているため、再生できません。');
    await expect(page.getByRole('button', { name: '自分も踊る' })).toBeEnabled();
    await expect(page.getByRole('button', { name: '再生する' })).toHaveCount(0);
    await saveEvidence(page, SCREEN, 'SCR04-04', 1);
  });

  test('SCR04-05 版の違うURLは再生せず、版が違うことを出す', async ({ page }) => {
    await page.goto(OTHER_VERSION_URL);
    await expect(page.getByRole('alert')).toHaveText('別の版の棒人間ダンシングで作られたURLのため、再生できません。');
    await expect(page.getByRole('button', { name: '再生する' })).toHaveCount(0);
    await saveEvidence(page, SCREEN, 'SCR04-05', 1);
  });

  test('SCR04-06 開けなかったとき「自分も踊る」でトップに切り替わり遊び始められる', async ({ page }) => {
    await page.goto(BROKEN_URL);
    await page.getByRole('button', { name: '自分も踊る' }).click();
    await expect(page.getByRole('button', { name: 'はじめる' })).toBeEnabled({ timeout: 20_000 });
    expect(new URL(page.url()).hash).toBe('');
    await saveEvidence(page, SCREEN, 'SCR04-06', 1);
  });

  test('SCR04-07 楽器の音を読み込めないと「再読み込みする」と失敗の案内が出る', async ({ page, context }) => {
    test.setTimeout(90_000);
    const url = await makeShareUrl(context);
    await page.route('**/sounds/**', (r) => r.abort());
    await page.goto(url);
    await expect(page.getByRole('button', { name: '再読み込みする' })).toBeEnabled({ timeout: 20_000 });
    await expect(page.getByRole('alert')).toHaveText('楽器の音を読み込めませんでした。通信できる状態にして、再読み込みしてください。');
    await saveEvidence(page, SCREEN, 'SCR04-07', 1);
  });

  test('SCR04-08 開けなかったときの表示に内部の詳細が出ない', async ({ page }) => {
    await page.goto(BROKEN_URL);
    await expect(page.getByRole('alert')).toBeVisible();
    const text = (await page.locator('body').innerText()).toLowerCase();
    for (const word of ['error', 'exception', 'stack', 'at ', 'undefined', 'typeerror']) expect(text).not.toContain(word);
    await saveEvidence(page, SCREEN, 'SCR04-08', 1);
  });

  test('SCR04-09 共有URLを開いて再生し終わるまで、同じサイトの外へ通信しない', async ({ page, context, baseURL }) => {
    test.setTimeout(120_000);
    const url = await makeShareUrl(context);
    const external = watchExternalRequests(page, new URL(baseURL ?? '').origin);
    await page.goto(url);
    await page.getByRole('button', { name: '再生する' }).click();
    await waitViewingEnd(page);
    expect(external).toEqual([]);
    await saveEvidence(page, SCREEN, 'SCR04-09', 1);
  });
});
