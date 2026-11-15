import { test as base, expect } from '@playwright/test';

// spec は @playwright/test を直接 import せず、ここから test / expect を取る。
// 全ケース共通の前提が必要になったら、ここで page を上書きして強制する（テスト方針4-3）。
// DB は無いため、ケースの独立性は「ケースごとに新しいページで始める」ことで保つ（Playwright の既定動作）。
//
// 時間と音の扱い（テスト方針4-3・4-8）: 時間は早送りも固定もせず、音の機能も本物のまま動かす。
// そのため全ケース共通で差し替えるものは無い。周をまたぐ待ちは画面の文字が変わるのを待つ（helpers/play.ts）。
// 共有URLはケースの中で遊んで作り（helpers/play.ts の makeShareUrl）、壊れたURL・版の違うURLだけ固定の文字列にする。
export const test = base;

export { expect };
