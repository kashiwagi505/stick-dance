import { test as base, expect } from '@playwright/test';

// spec は @playwright/test を直接 import せず、ここから test / expect を取る。
// 全ケース共通の前提（判定の差し替え・時間の固定など）が必要になったら、ここで page を上書きして強制する（テスト方針4-3）。
// DB は無いため、ケースの独立性は「ケースごとに新しいページで始める」ことで保つ（Playwright の既定動作）。
export const test = base;

export { expect };
