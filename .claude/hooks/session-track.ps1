# PostToolUse（Edit / Write）フック。
# 登録簿の最終更新時刻（心拍）と、このセッションが編集したファイルを記録する。
# 正本: ドキュメント/基準書/Git運用手順.md「並行作業（複数セッション）」
#
# 記録した編集ファイルの用途は2つ。
#   1. 本体ツリーで編集が始まってしまったとき、作業ツリーへ移送する対象を特定する
#   2. 他セッションと同じファイルを触っていないかの検出（worktree-guard が使う）
. (Join-Path $PSScriptRoot 'hook-input.ps1')
$json = Read-HookInput -Hook 'session-track'
if (-not $json) { exit 0 }

. (Join-Path $PSScriptRoot 'session-registry.ps1')

$sid = $json.session_id
$cwd = $json.cwd
if (-not $cwd) { $cwd = (Get-Location).Path }
if (-not $sid) { exit 0 }

$edited = @()
$file = $json.tool_input.file_path
if ($file) {
    $repoRoot = ($cwd -replace '\\', '/').TrimEnd('/')
    $target = ($file -replace '\\', '/')
    if ($target.ToLowerInvariant().StartsWith($repoRoot.ToLowerInvariant() + '/')) {
        $edited = @($target.Substring($repoRoot.Length + 1))
    }
}

Update-SessionRecord -SessionId $sid -Cwd $cwd -EditedPaths $edited
exit 0
