# PreToolUse（Edit / Write）フック。
# 本体の作業ツリーでファイルを編集しようとしたら拒否する。編集は /worktree-start で作った作業ツリーで行う。
# 正本: ドキュメント/基準書/Git運用手順.md「1. ブランチ構成」「4. 並行作業（複数セッション）」
#
# 拒否する理由: 本体ツリーは dev/自分の名前 を集めて PR を出す場所で、index が常にきれいでないとマージを受けられない。
# 「他のセッションがいるときだけ分ける」運用では、2本目が本体ツリーで始まった時点で両方が止まった。
# リマインドでは守られないため拒否で止める。
#
# 対象外:
#   - WBS/ 配下の編集（/wbs-push がパス指定でmasterへ反映する運用。分離しなくてよい）
#   - .claude/hooks/ 配下（分離できない状況での自己修復を妨げない）
#   - output/ 配下（.gitignore 対象。コミットされないため index を汚しようがない）
#   - リポジトリ外のファイル（スクラッチパッド等）
#   - 既に作業ツリーにいるセッション（ただし master・dev/自分の名前 の直接編集は場所を問わず拒否）
# フックの出力はClaude Codeが読み取る。日本語が化けないよう出力をUTF-8に固定する。
[Console]::OutputEncoding = New-Object Text.UTF8Encoding $false

. (Join-Path $PSScriptRoot 'hook-input.ps1')
$json = Read-HookInput -Hook 'worktree-guard'
if (-not $json) { exit 0 }

. (Join-Path $PSScriptRoot 'session-registry.ps1')

$sid = $json.session_id
$cwd = $json.cwd
if (-not $cwd) { $cwd = (Get-Location).Path }
$file = $json.tool_input.file_path
if (-not $sid -or -not $file) { exit 0 }

function Deny([string]$Text) {
    $payload = @{
        hookSpecificOutput = @{
            hookEventName            = 'PreToolUse'
            permissionDecision       = 'deny'
            permissionDecisionReason = $Text
        }
    } | ConvertTo-Json -Compress
    [Console]::Out.WriteLine($payload)
    exit 0
}

$repoRoot = ($cwd -replace '\\', '/').TrimEnd('/')
$target = ($file -replace '\\', '/')

# リポジトリ外は対象外
if (-not $target.ToLowerInvariant().StartsWith($repoRoot.ToLowerInvariant() + '/')) { exit 0 }

$rel = $target.Substring($repoRoot.Length + 1)
# WBS/ 配下（/wbs-push でmasterへ反映する運用）とフック自身は対象外
if ($rel -like 'WBS/*') { exit 0 }
if ($rel -like '.claude/hooks/*') { exit 0 }
# output/ 配下は .gitignore 対象で、コミットに巻き込まれる余地がないため対象外
if ($rel -like 'output/*') { exit 0 }

# 統合ブランチ（master・dev/自分の名前）では場所を問わず編集させない（正本「1. ブランチ構成」）。
$branch = ''
try { $branch = (& git -C $cwd rev-parse --abbrev-ref HEAD 2>$null | Select-Object -First 1) } catch { }
if ($branch) { $branch = "$branch".Trim() }
if ($branch -eq 'master') {
    Deny("master を直接編集しようとしています。master への直接コミットは運用上の禁止事項です（正本「7. やってはいけないこと」）。/worktree-start <作業名> で作業ツリーを作り、そこで $rel を編集してください。")
}

# 本体ツリーでは編集させない。作業は /worktree-start で作った作業ツリーで行う（正本「4. 並行作業（複数セッション）」）。
if (Test-InMainWorktree -Cwd $cwd) {
    $others = @(Get-OtherLiveSessions -SessionId $sid -Cwd $cwd | Where-Object { $_ })
    $extra = ''
    if ($others.Count -gt 0) {
        $conflict = @()
        foreach ($o in $others) {
            if ($o.edited -and (@($o.edited) -contains $rel)) { $conflict += $o.sessionId }
        }
        $extra = " 現在、他に $($others.Count) 件のセッションが動いています。"
        if ($conflict.Count -gt 0) {
            $extra += " $rel は他セッション（$($conflict -join ', ')）も編集済みです。分離後、その分を上書きしていないか確認してください。"
        }
    }
    $where = if ($branch) { "（現在のブランチ: $branch）" } else { '' }
    Deny("ここは本体の作業ツリーで、ファイルを編集しない場所です$where。本体ツリーは dev/自分の名前 に master を取り込み、作業ブランチを集めて PR を出すためだけに使います（正本: ドキュメント/基準書/Git運用手順.md「2. 日々の作業の流れ」）。/worktree-start <作業名> で作業ツリーと作業ブランチを作り、そこで $rel を編集してください。WBS/ 配下だけの作業なら分離は不要です。$extra")
}

# 作業ツリーにいるが、ブランチが個人の統合ブランチになっている（本来は起きない）
if ($branch -match '^dev/[^-/]+$') {
    Deny("$branch は個人の統合ブランチで、直接編集しない決まりです（正本「1. ブランチ構成」）。git switch -c $branch-<作業名> で作業ブランチを切ってから $rel を編集してください。")
}

exit 0
