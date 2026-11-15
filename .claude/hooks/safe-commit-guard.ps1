# PreToolUse（Bash / PowerShell）フック。
# index 全体を巻き込むコミット操作と、統合ブランチへの直接コミット、git stash を拒否する。
# 正本: ドキュメント/基準書/Git運用手順.md「1. ブランチ構成」「4. 並行作業（複数セッション）」「7. やってはいけないこと」
#
# 拒否する理由（いずれも実際に事故が起きている）:
#   - 素の git commit は git add <パス> の直後でも index 全体を拾う
#     （例: WBS 4ファイルのはずのコミットに117ファイル、レビュー指摘表の更新に555ファイル）
#   - git commit --amend にパス指定は存在せず、必ず index 全体を拾う
#     （2026-09-02、別セッションのSCR90関連10ファイルを取り込んだ）
#   - git commit -a はステージしていない変更まで拾う
#   - dev/自分の名前 への直接コミットは、作業ブランチのマージ先を塞ぐ（2026-09-07に8件）
#   - git stash は他セッションの未コミット変更まで巻き上げる（復元されない stash が3件残った）
#
# 許可する形:
#   git commit -- <パス...>  /  git commit --only <パス>  /  git commit --include <パス>
#   コンフリクト解消中（.git/MERGE_HEAD あり）は index 全体のコミットが正しいため許可する
#   統合ブランチ上でも、WBS/ 配下をパス指定したコミットは許可する（/wbs-push の運用）
#   git stash list / show / pop / apply / drop（残った stash を確認・復元・破棄する操作）は許可する
# フックの出力はClaude Codeが読み取る。日本語が化けないよう出力をUTF-8に固定する。
[Console]::OutputEncoding = New-Object Text.UTF8Encoding $false

. (Join-Path $PSScriptRoot 'hook-input.ps1')
$json = Read-HookInput -Hook 'safe-commit-guard'
if (-not $json) { exit 0 }

$cmd = $json.tool_input.command
if (-not $cmd) { exit 0 }

$isCommit = $cmd -match '(?<![\w-])git\s+(-C\s+\S+\s+)?commit(?![\w-])'
$isStash = $cmd -match '(?<![\w-])git\s+(-C\s+\S+\s+)?stash(?![\w-])'
if (-not $isCommit -and -not $isStash) { exit 0 }

$cwd = $json.cwd
if (-not $cwd) { $cwd = (Get-Location).Path }
# git -C <パス> があれば、そのパスのリポジトリで判定する
$gitPath = $cwd
if ($cmd -match '(?<![\w-])git\s+-C\s+("([^"]+)"|''([^'']+)''|(\S+))') {
    $p = if ($Matches[2]) { $Matches[2] } elseif ($Matches[3]) { $Matches[3] } else { $Matches[4] }
    if ($p -and -not ($p -match '^\$')) { $gitPath = $p }
}

function Deny {
    param([string]$Reason)
    $out = @{
        hookSpecificOutput = @{
            hookEventName            = 'PreToolUse'
            permissionDecision       = 'deny'
            permissionDecisionReason = $Reason
        }
    } | ConvertTo-Json -Compress
    [Console]::Out.WriteLine($out)
    exit 0
}

# --- git stash ---
if ($isStash) {
    # 確認・復元・破棄は許可する。作る操作（引数なし / push / save / -u 等）だけ拒否する
    if ($cmd -notmatch '(?<![\w-])stash\s+(list|show|pop|apply|drop|branch)(?![\w-])') {
        Deny -Reason 'git stash は使いません。同じツリーの他セッションの未コミット変更まで巻き上げ、復元されないまま残った実績があります。区切りが良ければパス指定でコミットし（git commit -- <path> -m "..."）、中途半端ならパッチに書き出してください（git diff -- <path> > "$env:TEMP\wt-carry.patch"）。正本: ドキュメント/基準書/Git運用手順.md「7. やってはいけないこと」。'
    }
    if (-not $isCommit) { exit 0 }
}

# --- git commit ---
# フラグの判定は git commit の部分（次の ; & | 改行まで）だけで行う。
# コマンド全体で見ると、同じ行の別コマンド（例: git log --all）のフラグを commit のものと取り違える。
$commitSeg = [regex]::Match($cmd, '(?<![\w-])git\s+(-C\s+\S+\s+)?commit(?![\w-])[^;&|\r\n]*').Value

if ($commitSeg -match '(?<![\w-])--amend(?![\w-])') {
    Deny -Reason 'git commit --amend はパス指定ができず、index 全体（他セッションのステージ済み変更を含む）を必ず取り込みます。amend せず、次のコミットの本文で補ってください。メッセージの書き損じは放置して構いません（正本: ドキュメント/基準書/Git運用手順.md）。'
}

if ($commitSeg -match '(?<![\w-])-a(?![\w-])' -or $commitSeg -match '(?<![\w-])--all(?![\w-])') {
    Deny -Reason 'git commit -a / --all はステージしていない変更まで取り込みます。コミット対象をパス指定してください。例: git commit -- <path> -m "..."（正本: ドキュメント/基準書/Git運用手順.md）。'
}

# コンフリクト解消中は index 全体のコミットが正しい（統合ブランチへのマージコミットもここに含まれる）
$gitDir = & git -C $gitPath rev-parse --path-format=absolute --git-dir 2>$null
if ($LASTEXITCODE -eq 0 -and $gitDir) {
    if (Test-Path (Join-Path $gitDir 'MERGE_HEAD')) { exit 0 }
    if (Test-Path (Join-Path $gitDir 'CHERRY_PICK_HEAD')) { exit 0 }
}

# --- 統合ブランチ（master・dev/自分の名前）への直接コミット ---
$branch = ''
try { $branch = (& git -C $gitPath rev-parse --abbrev-ref HEAD 2>$null | Select-Object -First 1) } catch { }
if ($branch) { $branch = "$branch".Trim() }
if ($branch -eq 'master' -or $branch -match '^dev/[^-/]+$') {
    # /wbs-push（WBS/ 配下をパス指定でコミット）だけは許可する
    if ($cmd -notmatch 'WBS[/\\]') {
        Deny -Reason "$branch は統合ブランチで、直接コミットしない決まりです（正本: ドキュメント/基準書/Git運用手順.md「1. ブランチ構成」）。統合ブランチに入るのは作業ブランチのマージ（git merge --no-ff）だけです。編集とコミットは /worktree-start で作った作業ツリーの作業ブランチで行ってください。WBS/ 配下だけのコミットは例外として許可されます。"
    }
}

# パス指定があるか（-- 以降のパス、または --only / --include）
$hasPathSpec = $false
if ($cmd -match '(?<![\w-])--only(?![\w-])' -or $cmd -match '(?<![\w-])--include(?![\w-])') { $hasPathSpec = $true }
# "git commit ... -- <何か>" の形。-- の後ろに引数が続く場合だけパス指定とみなす
if ($cmd -match 'commit\b[^|;&]*?\s--\s+\S') { $hasPathSpec = $true }

if (-not $hasPathSpec) {
    Deny -Reason 'パス指定のない git commit は、git add <パス> の直後でも index 全体を取り込みます。並行セッションのステージ済み変更まで自分のコミットへ入るため、対象をパス指定してください。例: git commit -- <path1> <path2> -m "..."（正本: ドキュメント/基準書/Git運用手順.md）。コンフリクト解消中のコミットは自動で許可されます。'
}

exit 0
