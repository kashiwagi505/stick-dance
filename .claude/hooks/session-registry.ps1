# セッション登録簿の共通処理。フック本体（session-start / session-track / worktree-guard）から読み込む。
# 目的: 同じリポジトリで並行して動いているセッションを数え、編集の取り合いを検出する。
# 正本: ドキュメント/基準書/Git運用手順.md「4. 並行作業（複数セッション）」
#
# 登録簿の置き場所は %TEMP% 配下。リポジトリへ入れない（作業ファイルを追跡対象にしない）。
# 生存判定は最終更新時刻で行う。セッションの終了通知は落ちたときに来ないため、
# 一定時間更新がない登録は死んだものとして無視し、さらに古いものはファイルごと消す。

$script:SessionRegistryRoot = Join-Path $env:TEMP '棒人間ダンシング-sessions'

# 作業ツリーの置き場所。/worktree-start は本体ツリー配下の .claude/worktrees/ に作る
# （Claude Code は .claude/worktrees/ の外へ移るとき permission-root relocation の確認を毎回出し、
#  これは許可ルールでは抑制できないため）。.gitignore に入れてあるので追跡対象にはならない。
# %TEMP% 側は移行前に作られたツリーの旧置き場。残骸を拾い漏らさないよう当面あわせて見る。
$script:WorktreeRootRelative = '.claude/worktrees'
$script:LegacyWorktreeRoot = Join-Path $env:TEMP '棒人間ダンシング-worktrees'
# /merge-pr がマージ前の検証に使う常設ツリー。ブランチを持たない detached なので作業ツリーではなく、
# 片付け候補として通知しない（正本: .claude/commands/merge-pr.md 手順2）
$script:VerificationWorktreeName = 'merge-check'
$script:SessionAliveMinutes = 15
$script:SessionPurgeHours = 24

function Get-RepoKey {
    param([string]$Path)
    if (-not $Path) { return 'unknown' }
    # 同一リポジトリの別worktreeも同じキーにする（共通の .git を指すため）
    $common = & git -C $Path rev-parse --path-format=absolute --git-common-dir 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $common) { return 'unknown' }
    return ($common -replace '\\', '/').ToLowerInvariant()
}

function Get-WorktreeEntries {
    param([string]$Path)
    # git worktree list --porcelain を { path, head, branch } の配列にする。1件目が本体ツリー。
    $lines = & git -C $Path worktree list --porcelain 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $lines) { return @() }
    $entries = @()
    $cur = $null
    foreach ($line in $lines) {
        if ($line -like 'worktree *') {
            if ($cur) { $entries += $cur }
            $cur = [ordered]@{ path = (($line.Substring(9) -replace '\\', '/').TrimEnd('/')); head = ''; branch = '' }
        } elseif ($cur -and $line -like 'HEAD *') {
            $cur.head = $line.Substring(5).Trim()
        } elseif ($cur -and $line -like 'branch *') {
            $cur.branch = ($line.Substring(7).Trim() -replace '^refs/heads/', '')
        }
    }
    if ($cur) { $entries += $cur }
    return $entries
}

function Get-MainWorktree {
    param([string]$Path)
    # git worktree list の1行目が本体ツリー。作業ツリーかどうかの判定に使う。
    $entries = @(Get-WorktreeEntries -Path $Path)
    if ($entries.Count -eq 0) { return $null }
    return $entries[0].path
}

function Update-SessionRecord {
    param(
        [string]$SessionId,
        [string]$Cwd,
        [string[]]$EditedPaths = @()
    )
    if (-not $SessionId) { return }
    $repoKey = Get-RepoKey -Path $Cwd
    if ($repoKey -eq 'unknown') { return }

    if (-not (Test-Path $script:SessionRegistryRoot)) {
        New-Item -ItemType Directory -Path $script:SessionRegistryRoot -Force | Out-Null
    }
    $file = Join-Path $script:SessionRegistryRoot ($SessionId + '.json')

    $edited = @()
    if (Test-Path $file) {
        try {
            $prev = Get-Content $file -Raw -Encoding utf8 | ConvertFrom-Json
            if ($prev.edited) { $edited = @($prev.edited) }
        } catch { $edited = @() }
    }
    foreach ($p in $EditedPaths) {
        if ($p -and ($edited -notcontains $p)) { $edited += $p }
    }

    $record = [ordered]@{
        sessionId = $SessionId
        repoKey   = $repoKey
        cwd       = ($Cwd -replace '\\', '/').TrimEnd('/')
        updatedAt = (Get-Date).ToString('o')
        edited    = $edited
    }
    $record | ConvertTo-Json -Depth 4 | Set-Content -Path $file -Encoding utf8
}

function Remove-StaleSessionRecords {
    # 最終更新から SessionPurgeHours を過ぎた登録をファイルごと消す（生存判定には使われない残骸）。
    if (-not (Test-Path $script:SessionRegistryRoot)) { return 0 }
    $limit = (Get-Date).AddHours(-$script:SessionPurgeHours)
    $removed = 0
    foreach ($f in Get-ChildItem -Path $script:SessionRegistryRoot -Filter '*.json' -ErrorAction SilentlyContinue) {
        $stale = $false
        try {
            $r = Get-Content $f.FullName -Raw -Encoding utf8 | ConvertFrom-Json
            $updated = [datetime]::MinValue
            if (-not [datetime]::TryParse($r.updatedAt, [ref]$updated)) { $stale = $true }
            elseif ($updated -lt $limit) { $stale = $true }
        } catch { $stale = $true }
        if ($stale) {
            try { Remove-Item -LiteralPath $f.FullName -Force -ErrorAction Stop; $removed++ } catch { }
        }
    }
    return $removed
}

function Get-OtherLiveSessions {
    param(
        [string]$SessionId,
        [string]$Cwd
    )
    $repoKey = Get-RepoKey -Path $Cwd
    if ($repoKey -eq 'unknown') { return @() }
    if (-not (Test-Path $script:SessionRegistryRoot)) { return @() }

    $limit = (Get-Date).AddMinutes(-$script:SessionAliveMinutes)
    $others = @()
    foreach ($f in Get-ChildItem -Path $script:SessionRegistryRoot -Filter '*.json' -ErrorAction SilentlyContinue) {
        try { $r = Get-Content $f.FullName -Raw -Encoding utf8 | ConvertFrom-Json } catch { continue }
        if (-not $r.sessionId -or $r.sessionId -eq $SessionId) { continue }
        if ($r.repoKey -ne $repoKey) { continue }
        $updated = [datetime]::MinValue
        if (-not [datetime]::TryParse($r.updatedAt, [ref]$updated)) { continue }
        if ($updated -lt $limit) { continue }
        $others += $r
    }
    return $others
}

function Test-InMainWorktree {
    param([string]$Cwd)
    $main = Get-MainWorktree -Path $Cwd
    if (-not $main) { return $true }
    $here = ($Cwd -replace '\\', '/').TrimEnd('/')
    return $here.ToLowerInvariant() -eq $main.ToLowerInvariant()
}

function Get-LeftoverWorktrees {
    param([string]$Cwd)
    # 本体ツリーから見た作業ツリーの残り。
    #   done    : ブランチが本体のブランチ（dev/自分の名前）へ取り込み済みで、未コミット変更も無い → /worktree-end で消してよい
    #   pending : 未反映のコミットか未コミット変更がある → 作業中か、片付け前に /worktree-end が必要
    #   orphan  : 作業ツリーの置き場所にディレクトリだけ残り、git worktree list に載っていない → 残骸。削除してよい
    $result = @()
    $entries = @(Get-WorktreeEntries -Path $Cwd)
    if ($entries.Count -eq 0) { return $result }
    $mainPath = $entries[0].path
    $registered = @()
    for ($i = 1; $i -lt $entries.Count; $i++) {
        $e = $entries[$i]
        $registered += $e.path.ToLowerInvariant()
        if ((Split-Path $e.path -Leaf) -eq $script:VerificationWorktreeName) { continue }
        $dirty = $true
        $merged = $false
        if (Test-Path $e.path) {
            $st = & git -C $e.path status --porcelain 2>$null
            $dirty = ($LASTEXITCODE -ne 0) -or (@($st | Where-Object { $_ }).Count -gt 0)
        }
        if ($e.head) {
            & git -C $mainPath merge-base --is-ancestor $e.head HEAD 2>$null
            $merged = ($LASTEXITCODE -eq 0)
        }
        $state = if ($merged -and -not $dirty) { 'done' } else { 'pending' }
        $result += [ordered]@{ path = $e.path; branch = $e.branch; state = $state; dirty = $dirty; merged = $merged }
    }
    # 現行の置き場所（本体ツリー配下）と旧置き場所（%TEMP%）の両方から残骸を拾う。
    $roots = @((Join-Path $mainPath $script:WorktreeRootRelative), $script:LegacyWorktreeRoot)
    foreach ($root in $roots) {
        if (-not (Test-Path $root)) { continue }
        foreach ($d in Get-ChildItem -Path $root -Directory -ErrorAction SilentlyContinue) {
            $p = ($d.FullName -replace '\\', '/').TrimEnd('/')
            if ($d.Name -eq $script:VerificationWorktreeName) { continue }
            if ($registered -notcontains $p.ToLowerInvariant()) {
                $result += [ordered]@{ path = $p; branch = ''; state = 'orphan'; dirty = $false; merged = $false }
            }
        }
    }
    return $result
}
