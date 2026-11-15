import * as fs from 'node:fs';
import * as path from 'node:path';
import { e2eRoot } from './helpers/paths';

/** テスト開始前、前回実行分の証跡を削除する（証跡の取り忘れ・ケース失敗を古い証跡で隠さないため） */
export default async function globalSetup(): Promise<void> {
  const evidenceDir = path.join(e2eRoot, 'evidence');
  fs.rmSync(evidenceDir, { recursive: true, force: true });
  console.log('テスト開始: e2e/evidence を削除しました（今回の実行分だけが残ります）。');
}
