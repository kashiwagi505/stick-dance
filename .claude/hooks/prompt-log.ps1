# UserPromptSubmit フック。
# 人が送ったプロンプトを正規化して記録し、同じ趣旨が3回目になったら仕組み化を提案する。
# 正本: ドキュメント/基準書/コマンド・スキル利用ガイド.md「フック一覧」
#
# なぜ必要か:
#   同じ指示を何回打ったかを知る手段が無いため、「そこまでの回数にはならない」という
#   見込みで仕組み化を見送ってしまう。実測では委譲8回・pull/push 21回・説明の平易さ6回。
#   回数はログに残っているのに誰も数えていなかった。ここで数える。
#
# 3回にしている理由: 2回だと失敗時のリトライ（「もう一度試す」23回）まで拾ってしまう。
#
# 拾えるのは字面の近い繰り返しだけ。言い回しの違う繰り返しは /rule-review が読んでまとめる。
# フックの出力はClaude Codeが読み取る。日本語が化けないよう出力をUTF-8に固定する。
[Console]::OutputEncoding = New-Object Text.UTF8Encoding $false

. (Join-Path $PSScriptRoot 'hook-input.ps1')
$json = Read-HookInput -Hook 'prompt-log'
if (-not $json) { exit 0 }

$threshold = 3
$compareWindow = 300      # 直近何件と比べるか
$similarity = 0.4         # 文字bigramのJaccard係数の下限（包含率0.8と併用）

$cwd = $json.cwd
if (-not $cwd) { $cwd = (Get-Location).Path }
$logDir = Join-Path $cwd '.claude\tmp'
$logPath = Join-Path $logDir 'prompt-log.jsonl'

# --- プロンプト本文を取り出す ---
# UserPromptSubmit の入力に本文が含まれる保証がないため、無ければ transcript から最後の人間の発言を読む。
$text = $json.prompt
if (-not $text -and $json.transcript_path -and (Test-Path $json.transcript_path)) {
    try {
        $lines = Get-Content $json.transcript_path -Tail 40 -Encoding utf8
        for ($i = $lines.Count - 1; $i -ge 0; $i--) {
            try { $e = $lines[$i] | ConvertFrom-Json } catch { continue }
            if ($e.type -ne 'user') { continue }
            $c = $e.message.content
            if ($c -is [string]) { $text = $c; break }
            if ($c) {
                $t = ($c | Where-Object { $_.type -eq 'text' } | Select-Object -First 1).text
                if ($t) { $text = $t; break }
            }
        }
    } catch { }
}
if (-not $text) { exit 0 }

# --- 対象外 ---
$text = $text.Trim()
if ($text.Length -lt 4) { exit 0 }
if ($text.StartsWith('/')) { exit 0 }            # スラッシュコマンドは既に仕組み化済み
if ($text -match '^<[a-z-]+>') { exit 0 }        # ハーネスが生成した入力

# --- 正規化: 全角→半角、英字小文字化、記号と空白を落とし、依頼表現の語尾を落とす ---
# 「プルして」「プルしてほしい」「プルして下さい」を同じものとして扱うため。
# 語尾だけが違う繰り返しは実測でも多い（丁寧さの揺れであって、指示の中身は同じ）。
$endings = @(
    'してほしい', 'してください', 'して下さい', 'してくれ',
    'おねがいします', 'お願いします', 'おねがい', 'お願い',
    'いただけますか', 'いただきたい', 'もらえますか', 'もらえる',
    'ほしい', 'ください', '下さい', 'くれる',
    'ですか', 'ますか', 'でしょうか', 'です', 'ます'
)
function Get-Normalized {
    param([string]$s)
    $t = $s.Substring(0, [Math]::Min($s.Length, 200))
    $t = $t.Normalize([Text.NormalizationForm]::FormKC).ToLowerInvariant()
    $t = $t -replace '[\s\p{P}\p{S}]', ''
    for ($n = 0; $n -lt 3; $n++) {
        $before = $t
        foreach ($e in $script:endings) {
            if ($t.Length -gt $e.Length + 2 -and $t.EndsWith($e)) {
                $t = $t.Substring(0, $t.Length - $e.Length)
                break
            }
        }
        if ($t -eq $before) { break }
    }
    return $t
}
$norm = Get-Normalized $text
if ($norm.Length -lt 4) { exit 0 }

function Get-Bigrams {
    param([string]$s)
    $set = New-Object 'System.Collections.Generic.HashSet[string]'
    for ($i = 0; $i -lt $s.Length - 1; $i++) { [void]$set.Add($s.Substring($i, 2)) }
    return ,$set
}

# --- 過去分と突き合わせる ---
$past = @()
if (Test-Path $logPath) {
    $past = @(Get-Content $logPath -Tail $compareWindow -Encoding utf8 | ForEach-Object {
        try { $_ | ConvertFrom-Json } catch { $null }
    } | Where-Object { $_ })
}

$mine = Get-Bigrams $norm
$hits = @()
foreach ($p in $past) {
    if (-not $p.norm) { continue }
    if ($p.norm -eq $norm) { $hits += $p; continue }
    $theirs = Get-Bigrams $p.norm
    # PowerShell 5.1 では Linq.Enumerable のジェネリック解決ができないため HashSet の演算を使う
    $work = New-Object 'System.Collections.Generic.HashSet[string]' (, [string[]]$mine)
    $work.IntersectWith($theirs)
    $inter = $work.Count
    $union = $mine.Count + $theirs.Count - $inter
    if ($union -le 0) { continue }
    $jaccard = $inter / $union
    # 短い指示はJaccardだと不利になるため、包含率（短い側にどれだけ含まれるか）と併用する。
    # 包含率だけだと「直して」が「設計書を直してほしい」に一致してしまうので、Jaccardで下限を切る。
    $minCount = [Math]::Min($mine.Count, $theirs.Count)
    $overlap = if ($minCount -gt 0) { $inter / $minCount } else { 0 }
    if ($overlap -ge 0.8 -and $jaccard -ge $similarity) { $hits += $p }
}

# --- 記録する ---
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$alreadyProposed = ($hits | Where-Object { $_.proposed }).Count -gt 0
$count = $hits.Count + 1
$record = [ordered]@{
    at       = (Get-Date).ToString('o')
    norm     = $norm
    text     = $text.Substring(0, [Math]::Min($text.Length, 300))
    count    = $count
    proposed = ($count -ge $threshold -and -not $alreadyProposed)
}
Add-Content -Path $logPath -Value ($record | ConvertTo-Json -Compress) -Encoding utf8

# --- しきい値に達したら1回だけ提案する ---
if ($count -lt $threshold -or $alreadyProposed) { exit 0 }

$samples = ($hits | Select-Object -Last 2 | ForEach-Object { '「' + $_.text.Substring(0, [Math]::Min($_.text.Length, 40)) + '」' }) -join '、'
$msg = @"
この趣旨の指示は $count 回目です（過去分: $samples）。
毎回打ち直している指示は、仕組みに上げると1回で済みます。作業を続ける前に、ユーザーへ /rule-new を提案してください。
ただし勝手にルールを作らないこと。恒久ルールにするか、期限付きの暫定ルールにするか、仕組みにしないかは人が決めます。
この提案はこの趣旨につき1回だけ出ます。断られたら以後は黙って作業を続けてください。
"@
$out = @{ hookSpecificOutput = @{ hookEventName = 'UserPromptSubmit'; additionalContext = $msg } } | ConvertTo-Json -Compress
[Console]::Out.WriteLine($out)
exit 0
