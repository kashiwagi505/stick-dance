# SessionStart フック。
# 自分を登録簿へ登録し、本体ツリーにいるセッションへ「ここでは編集せず /worktree-start で作業ツリーを作る」ことと、
# master の未取り込み・片付け忘れの作業ツリー・stash を伝える。
# 正本: ドキュメント/基準書/Git運用手順.md「2. 日々の作業の流れ」「4. 並行作業（複数セッション）」
#
# ここで行うのは通知と登録簿の掃除だけで、編集を止めるのは worktree-guard.ps1（PreToolUse）。
# リマインドだけでは守られないため、実効はガード側が持つ。
# フックの出力はClaude Codeが読み取る。日本語が化けないよう出力をUTF-8に固定する。
[Console]::OutputEncoding = New-Object Text.UTF8Encoding $false

. (Join-Path $PSScriptRoot 'hook-input.ps1')
$json = Read-HookInput -Hook 'session-start'
if (-not $json) { exit 0 }

. (Join-Path $PSScriptRoot 'session-registry.ps1')

$sid = $json.session_id
$cwd = $json.cwd
if (-not $cwd) { $cwd = (Get-Location).Path }
if (-not $sid) { exit 0 }

Remove-StaleSessionRecords | Out-Null
$others = @(Get-OtherLiveSessions -SessionId $sid -Cwd $cwd | Where-Object { $_ })
Update-SessionRecord -SessionId $sid -Cwd $cwd

$notes = @()

# --- 有効な暫定ルールを読み込ませる ---
# 「着手前に暫定ルールを読む」と書くだけでは守られない（進め方のルールは検査できない）。
# 有効な行がある場合だけ、機械的にコンテキストへ入れる。
$provPath = Join-Path $cwd 'ドキュメント\基準書\暫定ルール.md'
if (Test-Path $provPath) {
    $rows = @(Get-Content $provPath -Encoding utf8 |
        Where-Object { $_ -match '^\|' -and $_ -notmatch '^\|\s*-' -and $_ -notmatch '^\|\s*ID\s*\|' -and $_ -notmatch '現在なし' })
    # 「撤回済み」節より前の行だけを有効とみなす
    $lines = Get-Content $provPath -Encoding utf8
    $endIdx = ($lines | Select-String -Pattern '^## 撤回済み' | Select-Object -First 1).LineNumber
    if ($endIdx) {
        $active = @($lines[0..($endIdx - 2)] |
            Where-Object { $_ -match '^\|' -and $_ -notmatch '^\|\s*-' -and $_ -notmatch '^\|\s*ID\s*\|' -and $_ -notmatch '現在なし' })
    } else {
        $active = $rows
    }
    if ($active.Count -gt 0) {
        $notes += @"
有効な暫定ルールが $($active.Count) 件あります（正本: ドキュメント/基準書/暫定ルール.md）。恒久ルールと同じ強さで従ってください。
$($active -join "`n")
"@
    }
}

$curBranch = ''
try { $curBranch = (& git -C $cwd rev-parse --abbrev-ref HEAD 2>$null | Select-Object -First 1) } catch { }
if ($curBranch) { $curBranch = "$curBranch".Trim() }

$inMain = Test-InMainWorktree -Cwd $cwd

if ($inMain) {
    # --- 本体ツリー: 編集しない場所であることを伝える ---
    $othersText = ''
    if ($others.Count -gt 0) { $othersText = "同じリポジトリで他に $($others.Count) 件のセッションが動いています。" }
    $notes += @"
あなたは本体の作業ツリー（ブランチ: $curBranch）にいます。本体ツリーはファイルを編集しない場所で、dev/自分の名前 に master を取り込む・作業ブランチを集める・PRを出すためだけに使います（正本: ドキュメント/基準書/Git運用手順.md「2. 日々の作業の流れ」）。$othersText
ファイル編集を伴う作業は、最初の Edit / Write の前に /worktree-start <作業名> で作業ツリーと作業ブランチを作り、そこへ移ってください。WBS/ 配下だけの作業は分離不要です。分けずに Edit / Write を実行しようとすると、フックが編集を拒否します。
作業が終わったら /worktree-end で dev/自分の名前 へマージしてツリーを消し、続けて /create-pr で master へPRを出します。
"@

    if ($curBranch -eq 'master') {
        $notes += "本体ツリーのブランチが master になっています。本体ツリーは dev/自分の名前 を置く場所です。git switch dev/自分の名前 で戻してください（正本「1. ブランチ構成」）。"
    } elseif ($curBranch -and $curBranch -notmatch '^dev/[^-/]+$') {
        $notes += "本体ツリーのブランチが $curBranch になっています。本体ツリーは dev/自分の名前 を置く場所で、作業ブランチは作業ツリーでチェックアウトします。作業中の変更が無いことを確認してから git switch dev/自分の名前 で戻してください。"
    }

    # --- master の未取り込み ---
    # 人に毎回「プルして」と言わせないため、開始時に未取り込みの件数を機械的に伝える（正本「2. 日々の作業の流れ」①）。
    # ここで行うのは fetch（読み取り）と件数の通知までで、merge はしない。
    # コンフリクトはどちらを採るかの判断が要るため、取り込みはAIが手順に沿って行う。
    if ($curBranch -match '^dev/[^-/]+$') {
        # 本体ツリーには複数のセッションが入るため、10分以内にfetchが済んでいれば省く。
        $fetchHead = Join-Path $cwd '.git\FETCH_HEAD'
        $fresh = $false
        if (Test-Path $fetchHead) {
            $fresh = ((Get-Date) - (Get-Item $fetchHead).LastWriteTime).TotalMinutes -lt 10
        }
        if (-not $fresh) { & git -C $cwd fetch origin --quiet 2>$null | Out-Null }
        $behind = 0
        try {
            $counts = (& git -C $cwd rev-list --left-right --count "$curBranch...origin/master" 2>$null | Select-Object -First 1)
            if ("$counts".Trim() -match '^(\d+)\s+(\d+)$') { $behind = [int]$Matches[2] }
        } catch { }
        if ($behind -gt 0) {
            $notes += @"
master が $curBranch へ $behind コミット未取り込みです。**人の指示を待たず、いま取り込んでください**（正本「2. 日々の作業の流れ」①）。
git fetch origin → git merge origin/master → git push origin $curBranch
コンフリクトが出たら、どちらを採るかを勝手に決めず、両側の内容と解消案を示してユーザーに決めてもらってください（選択肢が1つしかないものは解消して報告に回してよい）。マージの途中のままセッションを終えないこと。
"@
        }
    }

    # --- 本体ツリーに未コミット変更が残っている ---
    $st = @(& git -C $cwd status --porcelain 2>$null | Where-Object { $_ })
    if ($st.Count -gt 0) {
        $notes += "本体ツリーに未コミットの変更が $($st.Count) 件残っています。本体ツリーは編集しない決まりなので、これ自体が事故のサインです。誰の変更かを確かめ、判断がつかなければユーザーに確認してください（git status --short）。"
    }

    # --- 片付け忘れの作業ツリー ---
    $left = @(Get-LeftoverWorktrees -Cwd $cwd | Where-Object { $_ })
    if ($left.Count -gt 0) {
        $done = @($left | Where-Object { $_.state -eq 'done' })
        $pending = @($left | Where-Object { $_.state -eq 'pending' })
        $orphan = @($left | Where-Object { $_.state -eq 'orphan' })
        $lines = @()
        foreach ($w in $done) { $lines += "  - 片付け候補: $($w.path)（$($w.branch)。$curBranch へ取り込み済み・未コミット変更なし）→ /worktree-end $(Split-Path $w.path -Leaf)" }
        foreach ($w in $pending) {
            $why = @()
            if (-not $w.merged) { $why += "$curBranch へ未反映のコミットあり" }
            if ($w.dirty) { $why += '未コミットの変更あり' }
            $lines += "  - 作業中または未反映: $($w.path)（$($w.branch)。$($why -join '、')）。他のセッションが使っている可能性があります。消さないでください"
        }
        foreach ($w in $orphan) { $lines += "  - 残骸: $($w.path)（git worktree list に載っていないディレクトリ。Remove-Item -Recurse -Force で削除してよい）" }
        $notes += @"
作業ツリーが $($left.Count) 件残っています（正本「4. 並行作業（複数セッション）」の「片付け忘れの見つけ方」）。
$($lines -join "`n")
"@
    }

    # --- stash が残っている ---
    $stash = @(& git -C $cwd stash list 2>$null | Where-Object { $_ })
    if ($stash.Count -gt 0) {
        $notes += "git stash が $($stash.Count) 件残っています。この運用では stash を作りません。中身を確認して（git stash show -p stash@{N}）復元するか破棄するかをユーザーに確認してください。"
    }
} else {
    # --- 作業ツリー: ブランチの確認だけ ---
    if ($curBranch -eq 'master' -or $curBranch -match '^dev/[^-/]+$') {
        $notes += @"
作業ツリーにいますが、ブランチが $curBranch（統合ブランチ）です。統合ブランチは直接編集しません（正本「1. ブランチ構成」）。git switch -c dev/自分の名前-<作業名> で作業ブランチを切ってから編集してください。
"@
    }
}

if ($notes.Count -eq 0) { exit 0 }

$out = @{ hookSpecificOutput = @{ hookEventName = 'SessionStart'; additionalContext = ($notes -join "`n`n") } } | ConvertTo-Json -Compress
[Console]::Out.WriteLine($out)
exit 0
