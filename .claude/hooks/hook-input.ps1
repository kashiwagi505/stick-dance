# 全フック共通の標準入力読み取り。各フックの先頭で dot-source して使う。
# 正本: ドキュメント/基準書/コマンド・スキル利用ガイド.md「フック一覧」
#
# なぜ必要か:
#   Claude Code はフックへ UTF-8 の JSON を標準入力で渡すが、Windows PowerShell の
#   [Console]::InputEncoding は既定で shift_jis。[Console]::In で読むと日本語が化け、
#   バイト境界によっては2バイト文字が JSON の区切り記号（" や }）を飲み込んで
#   ConvertFrom-Json が例外になる。各フックは catch { exit 0 } で素通りしていたため、
#   prompt-log は記録を落とし、worktree-guard と safe-commit-guard は拒否すべき操作を
#   通していた（Issue #146）。日本語を含む依頼で不定期に起きる。
#   コンソールのエンコーディングに依存しないよう、標準入力を UTF-8 として直接読む。
#
# パース失敗を黙って捨てない:
#   失敗したら .claude/tmp/hook-errors.log へ1行残す。フックの振る舞い（素通り）は変えない。
#   正常なら作られないファイルなので、**存在すること自体が異常のサイン**になる。
#   5日間気づかなかったのは、失敗が痕跡を残さなかったため。

# 標準入力を UTF-8 として読み、JSON として返す。失敗したら $null を返す。
function Read-HookInput {
    param([Parameter(Mandatory = $true)][string]$Hook)

    $reader = New-Object IO.StreamReader([Console]::OpenStandardInput(), (New-Object Text.UTF8Encoding $false))
    $raw = $reader.ReadToEnd()
    try {
        return $raw | ConvertFrom-Json
    } catch {
        Write-HookInputError -Hook $Hook -Raw $raw -Reason $_.Exception.Message
        return $null
    }
}

# 失敗の記録。ここで例外を出すとフック自体が落ちるため、書けなければ黙って諦める。
function Write-HookInputError {
    param([string]$Hook, [string]$Raw, [string]$Reason)

    try {
        $dir = Join-Path $PSScriptRoot '..\tmp'
        if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
        $head = if ($Raw) { ($Raw.Substring(0, [Math]::Min($Raw.Length, 120))) -replace '[\r\n]', ' ' } else { '(空)' }
        $line = "{0}`t{1}`t{2}`t{3}" -f (Get-Date).ToString('o'), $Hook, ($Reason -replace '[\r\n]', ' '), $head
        [IO.File]::AppendAllText((Join-Path $dir 'hook-errors.log'), $line + [Environment]::NewLine, (New-Object Text.UTF8Encoding $false))
    } catch { }
}
