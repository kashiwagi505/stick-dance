import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Page } from '@playwright/test';
import { e2eRoot } from './paths';

/**
 * ページ全体の高さがこの値を超えたら、上端からこの高さぶんだけを撮る。
 * Chromium は縦横いずれかが 32767px を超えるスクリーンショットを撮れず、
 * 縦に長い画面では証跡の保存ごと失敗するため。
 */
const MAX_SCREENSHOT_HEIGHT = 32000;

/** 証跡スクリーンショットを evidence/<画面ID>/<ケースID>_<連番2桁>.png へ保存する */
export async function saveEvidence(page: Page, screenId: string, caseId: string, seq: number): Promise<void> {
  const dir = path.join(e2eRoot, 'evidence', screenId);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${caseId}_${String(seq).padStart(2, '0')}.png`);

  const pageSize = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  }));

  if (pageSize.height > MAX_SCREENSHOT_HEIGHT) {
    await page.screenshot({
      path: file,
      clip: { x: 0, y: 0, width: pageSize.width, height: MAX_SCREENSHOT_HEIGHT },
    });
    return;
  }

  await page.screenshot({ path: file, fullPage: true });
}
