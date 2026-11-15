---
description: 作業ツリーの成果を dev/自分の名前 へマージし、ツリー・ブランチを片付けたうえで /create-pr へつなぐ
argument-hint: <作業名（省略時は現在のツリー）>
---

# 作業ツリーを閉じる（マージ → 片付け → PR）

`/worktree-start` で作った作業ツリーの成果を `dev/自分の名前` へ取り込み、ツリーと作業ブランチを消す。最後に `/create-pr` の手順へ続けて、`dev/自分の名前` から master へPRを出す。放置したツリーはディスクを食い、`git worktree list` に残って次の判断を誤らせる。

正本: [Git運用手順](../../ドキュメント/基準書/Git運用手順.md)「2. 日々の作業の流れ」④⑤

## 対象と対象外

- **対象**: 作業ツリーでの作業がひと区切りついたとき（1件の作業につき1回。1日1回以上を目安に溜めない）。片付け忘れのツリー（`session-start` フックが知らせる）を作業名指定で消すとき。
- **対象外**: `/run-impl-loop` の実行中（そちらの手順4がマージとPR作成まで含む。完了後の片付けだけはこのコマンドで行う）。

## 手順

### 1. 作業ツリーの状態を確認する

作業ツリーの中で行う。作業名を指定された場合は、そのツリー（`.claude/worktrees/<作業名>`）のブランチについて本体ツリーから確認する。

```powershell
git worktree list
git status --short
git log --oneline dev/自分の名前..HEAD
```

- 未コミットの変更が残っていたら、内容を確認して**パス指定で**日本語のコミットにする（`git commit -- <パス> -m "..."`）。無関係な変更が混ざっていたらコミットを分ける。判断できない変更は消さずに停止して報告する。
- `dev/自分の名前` へ未反映のコミットが無い（差分ゼロ）なら、手順2〜3を飛ばして手順5の片付けへ進む。

### 2. 統合ブランチの最新を取り込み、テストする

作業ツリーの中で行う。**マージ。rebase 禁止。**

```powershell
git fetch origin
git merge dev/自分の名前
npm run check
```

- コンフリクトが出たら**ここ（作業ブランチ側）で**解消する。判断に迷う箇所は勝手に解消せず、ユーザーに状況を報告して指示を待つ。
- ドキュメントだけの変更でも、マージを行った場合は `npm run check` を実行する。**失敗したまま先へ進まない。**
- [ドキュメント/AGENTS.md](../../ドキュメント/AGENTS.md) の「連動して更新するもの」の表と差分（`git diff dev/自分の名前...HEAD`）を照らし、片側だけ更新されているものがあれば同じ作業ブランチで直してコミットする。判断できないものは「要確認」として控えておき、PR説明に書く。

### 3. 作業ブランチを push する

本体ツリーへ戻る前に必ず行う。戻れなくなっても作業が失われないようにするため。

```powershell
git push -u origin dev/自分の名前-<作業名>
```

### 4. 本体ツリーへ戻り、dev/自分の名前 へマージする

Claude Code の `ExitWorktree`（`action: "keep"`。ツリーの削除は手順5で行う）で本体ツリーへ戻る。作業ツリーの中からはそのツリーを削除できず、本体ツリーの git も操作できない。

```powershell
git status --short                       # 本体ツリーは空であること
git merge --no-ff dev/自分の名前-<作業名>
git push origin dev/自分の名前
```

- 本体ツリーに未コミットの変更が残っているとマージできない。本体ツリーは編集しない決まりなので、**残っていたらそれ自体が事故のサイン**。誰の変更かを確かめ、判断がつかなければ停止して報告する。
- ここで新たなコンフリクトは出ない（手順2で `dev/自分の名前` を取り込み済み）。出た場合は、手順2以降に `dev/自分の名前` が動いている。`git merge --abort` して、作業ツリーで手順2からやり直す。
- **ここではPRを出さない。** PRは手順6。

### 5. 片付ける

本体ツリーで行う。

DBを使わないため、ツリーとブランチのほかに消す検証環境は無い。そのツリーで起動したアプリ（`npm run dev`）やE2Eが残っていれば先に止める（ファイルを掴んだままだとツリーを消せない）。

**ツリー**: Windows では `git worktree remove` が失敗することがある。失敗したら実体を消してから登録を掃除する。実体だけ残す状態にしない。

```powershell
git worktree remove ".claude\worktrees\<作業名>"
# 失敗した場合
Remove-Item -Recurse -Force ".claude\worktrees\<作業名>"
git worktree prune
```

`Remove-Item` でも消えないときは、**エラー文で原因を見分ける**。3種類あり、対処が違う。`git worktree remove` が失敗しても登録だけは消えている場合があるので、まず `git worktree list` を見て、登録が残っていれば `git worktree prune` する。

| エラー文 | 原因 | 対処 |
|---|---|---|
| `Filename too long` | `node_modules` の深い階層や、Playwrightの結果（`e2e\test-results\`・`e2e\playwright-report\`）に日本語の長いテスト名のファイルがあり、Windowsのパス長上限を超える | 空ディレクトリを robocopy で上書きして中身を消してから削除する（下記） |
| `Invalid argument` / `being used by another process` | そのツリーで起動したアプリ（`npm run dev`）・E2E・Vitestの監視（`npm run test:watch`）のプロセスがファイルを掴んでいる | どのプロセスかを確かめ、**このツリーのものだけ**止めてから消す。他のツリー・他セッションのプロセスは止めない。判断がつかなければ、消せたものだけ消して残りを報告する |
| 最上位のディレクトリだけ消せない（中身は0件） | そのディレクトリを作業ディレクトリにしているプロセスがある | 中身が消えていれば放置してよい。`git worktree prune` 済みなら `git worktree list` にも出ない |

パス長で消せないときは、空のディレクトリを `robocopy /MIR` で上書きすると中身を消せる（robocopy はパス長上限の影響を受けない）。**削除先を取り違えると中身が消えるため、`$target` の値を実行前に必ず確認する。**

```powershell
$target = ".claude\worktrees\<作業名>"
$empty = Join-Path $env:TEMP ("empty-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $empty | Out-Null
robocopy $empty $target /MIR /NFL /NDL /NJH /NJS /R:1 /W:1 | Out-Null   # 戻り値2は削除を行った正常終了
Remove-Item -Recurse -Force $target -ErrorAction Continue
Remove-Item -Recurse -Force $empty
git worktree prune
```

**作業ブランチ**: `dev/自分の名前` に取り込み済みなので `-d` で消える。`-d` が失敗する（未マージ）なら消さずに報告する。`-D` は使わない。リモートの作業ブランチも消す（`dev/自分の名前` を push 済みなので成果は残っている）。

```powershell
git branch -d dev/自分の名前-<作業名>
git push origin --delete dev/自分の名前-<作業名>
```

### 6. PR を出す

本体ツリー（`dev/自分の名前`、未コミット変更なし）にいる状態で、[create-pr](create-pr.md) の「4. push と PR 作成」以降を続けて実行する。手順2で「要確認」とした事項があれば PR 説明へ書く。

## 終わり方

`git worktree list` の結果、消したツリー・ブランチ、PR の URL（既存PRを更新した場合はその旨）、`npm run check` の結果を報告する。停止した場合は理由と次にやる操作を報告する。
