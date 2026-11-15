import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { defineConfig, devices } from '@playwright/test';

// 待受ポートはアプリと同じ .env を共用する（二重管理しない）
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

// アプリの待受ポート。並行作業でツリーを分けたとき、.env の SERVER_PORT でツリーごとに変える。
const appPort = process.env.SERVER_PORT ?? '5000';
const appOrigin = `http://localhost:${appPort}`;

export default defineConfig({
  testDir: './tests',
  // 音と画面は音の時刻で進むため、ケースを並列に流すと負荷で時刻の判定がぶれる。直列に流す
  workers: 1,
  timeout: 30_000,
  // テスト開始前、前回実行分の証跡を削除する（古い証跡で失敗を隠さない）
  globalSetup: './global-setup.ts',
  use: {
    baseURL: appOrigin,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  // 動作環境はPCのChromeだけ（非機能要件 N1）。スマホ・タブレットのプロジェクトは置かない
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'npm run dev',
      cwd: path.resolve(__dirname, '..'),
      url: `${appOrigin}/`,
      // 並行セッションが別ツリーで立てたサーバーを再利用すると、相手の終了でこちらが落ちる。
      // 自分のポートのサーバーは自分で起動する。
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
