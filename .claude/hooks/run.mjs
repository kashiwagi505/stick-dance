// hook の入口。.claude/settings.json から `node .claude/hooks/run.mjs <スクリプト名>.ps1` で呼ぶ。
// Windows では PowerShell のスクリプトをそのまま動かす（標準入力と終了コードを引き継ぐので、exit 2 の拒否も効く）。
// Windows 以外（自宅Mac）では何もしない。スクリプトは Windows PowerShell 5.1 と $env:TEMP 前提で、Mac では動かないため。
// Mac では hook の守り（worktree-guard・safe-commit-guard など）が効かないので、Git運用手順を自分で守る。
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

if (process.platform !== 'win32') process.exit(0);

const script = process.argv[2];
if (!script) {
  console.error('run.mjs: スクリプト名を渡してください');
  process.exit(1);
}
const r = spawnSync(
  'powershell.exe',
  ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join('.claude', 'hooks', script)],
  { stdio: 'inherit' },
);
process.exit(r.status ?? 1);
