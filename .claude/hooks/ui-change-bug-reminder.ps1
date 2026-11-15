# UI関連ファイル（画面テンプレート・CSS/JS）の編集を検知し、
# 実装済み画面へのUI変更ならバグ表への起票を促すリマインドをAIへ注入する。
# 正本: ドキュメント/04_テスト/02_バグ表.md 1章（実装完了後のUI変更はバグとして管理する）
. (Join-Path $PSScriptRoot 'hook-input.ps1')
$json = Read-HookInput -Hook 'ui-change-bug-reminder'
if (-not $json) { exit 0 }
$f = $json.tool_input.file_path
if (-not $f) { exit 0 }
$f = $f -replace '\\', '/'
# 画面の実装ファイルが置かれるパス（正規表現）。画面（Canvas の描画と HTML の画面）は src/view/、HTMLの入口はルートの index.html。
# ルートは本体ツリー（stick-dance/）か作業ツリー（.claude/worktrees/<作業名>/）。prototype/ などの index.html は対象にしない
$UiPathPattern = '/(src/view/|(stick-dance|\.claude/worktrees/[^/]+)/index\.html$)'
if ($f -notmatch $UiPathPattern) { exit 0 }

# リマインドはセッションにつき1回だけ注入する（毎編集で繰り返さない）
$sid = $json.session_id
if (-not $sid) { $sid = 'unknown' }
$flag = Join-Path $env:TEMP ("棒人間ダンシング-ui-bug-reminder-" + $sid)
if (Test-Path $flag) { exit 0 }
New-Item -ItemType File -Path $flag -Force | Out-Null

$msg = 'UI関連ファイルが編集された。この変更が「実装完了後の画面へのUI変更」（デザイン修正・見た目の変更・設計書との乖離修正）に該当する場合、バグ表（ドキュメント/04_テスト/02_バグ表.md）への起票が必須（同1章）。未起票なら、.agents/harness-resolution.md のバグ書式に沿って起票してから作業を続けるか、起票内容を依頼者に確認する。未実装画面の新規実装作業であればこのリマインドは対象外。'
$out = @{ hookSpecificOutput = @{ hookEventName = 'PostToolUse'; additionalContext = $msg } } | ConvertTo-Json -Compress
[Console]::Out.WriteLine($out)
exit 0
