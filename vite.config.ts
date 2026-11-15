import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ command, mode }) => {
  // .env の SERVER_PORT で待受ポートを決める。並行作業で作業ツリーを分けたときにツリーごとに変える
  const env = loadEnv(mode, process.cwd(), '');
  const port = Number(env.SERVER_PORT ?? 5000);

  return {
    // GitHub Pages はリポジトリ名のパス（/stick-dance/）で配信される（技術選定の設計方針 3.5）。
    // 開発サーバーと E2E はルートで動かす
    base: command === 'build' ? '/stick-dance/' : '/',
    server: {
      port,
      // ポートが埋まっていたら別の番号へ逃げずに失敗させる（E2Eが別ツリーのアプリを見に行かないように）
      strictPort: true,
    },
    test: {
      include: ['src/**/*.test.ts'],
      passWithNoTests: true,
    },
  };
});
