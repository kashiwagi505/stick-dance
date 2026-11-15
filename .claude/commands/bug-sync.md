---
description: master 上で対応の終わった未採番のバグファイル（バグ/未採番/）に BUG-nnn を採番してバグ表3章の表へ転記し、PR なしで master へ反映する（kashiwagiだけが実行）
argument-hint: （引数なし）
---

このスキルは [Git運用手順](../../ドキュメント/基準書/Git運用手順.md)「PRを経ない反映の例外」の2つ目（バグの採番と転記）を実行する。

バグの正本は [バグ表](../../ドキュメント/04_テスト/02_バグ表.md) 3章の表で、1件が1行（バグ表2-0）。起票（`/bug-new`）は番号を付けずに `バグ/未採番/<担当者>-<日時>.md` を作業ブランチへ置き、PR で master へ入る。**番号を付けて表へ転記するのは master 上のこのコマンド（と毎朝9時の GitHub Actions）だけ**にして、採番の取り合いを無くす。転記の対象は**対応の終わったファイル**（`状態` が `修正済`・`確認済`・`取り下げ`）だけで、転記できたファイルは消える。`未対応`・`対応中` のファイルは据え置く。

## 対象と対象外

- **対象**: `origin/master` の `バグ/未採番/` のうち `状態` が `修正済`・`確認済`・`取り下げ` のものを採番して3章の表へ転記し、元のファイルを消して master へ反映する。毎朝9時（JST）に GitHub Actions（[bug-table-sync.yml](../../.github/workflows/bug-table-sync.yml)）が同じ処理を自動で行うので、このコマンドは**対応を終えた分をすぐ表へ載せたいときの手動実行**。顧客提出・集計・リリース判定の前、自動実行が動かなかったとき（Actions の失敗・無効化）に呼ぶ。
- **実行者はkashiwagiだけ**（`kashiwagi505`）。採番する人を1人にして、手順違いや同時実行を避ける。他の人はkashiwagiに依頼するか、翌朝の Actions を待つ。
- **対象外**: バグの起票（`/bug-new`）、まだ対応の終わっていないバグ（`未対応`・`対応中` は採番せず据え置く）、転記済みのバグの記入の訂正。修正・確認の記入は、転記されるまで作業ブランチで `未採番/` のファイルへ書き、転記後に直す場合だけ3章の該当行を書き換えて通常のPRに含める。自分のブランチにしか無い未採番ファイルは、そのPRが master に入ってから次の実行で採番される。

## 手順

### 0. 実行者を確認する

```powershell
gh api user --jq .login
```

`kashiwagi505` でなければ**何もせず停止**し、「採番はkashiwagiが実行する運用。翌朝9時の Actions を待つかkashiwagiに依頼する」と報告する。

### 1. 一時worktreeで master の未採番を採番し、表へ転記する

```powershell
git fetch origin
$tmp = Join-Path $env:TEMP "bug-sync-worktree"
git worktree add --detach $tmp origin/master
Push-Location $tmp
node .github/scripts/bug-table.mjs check   # 表と未採番ファイルの書式・ID重複の検査
node .github/scripts/bug-table.mjs sync    # 対応の終わった 未採番/*.md → 3章の表の末尾へ転記し、元のファイルを消す
Pop-Location
git -C $tmp status --short
```

- `check` が失敗したら（ファイル名と見出しの不一致、項目の欠け、値の書式違反、表の外に落ちた行）、直さずに停止して該当箇所と理由を報告する。直すのは通常のPR。
- `sync` が「未採番のファイルはありません」または「転記できる未採番はありません」なら、**表も未採番も変わっていない**ので、その旨（据え置き件数を含める）を報告して終了する。手順2のコミットは作らない。
- `sync` の出力（`転記: <旧名> → BUG-nnn`、`据え置き: <旧名>（状態 ...）`）は報告に使うので控えておく。

### 2. 採番と転記だけをコミットして push する

```powershell
git -C $tmp add -A -- "ドキュメント/04_テスト/バグ" "ドキュメント/04_テスト/02_バグ表.md"
git -C $tmp commit -m "バグ表: 未採番 n 件を BUG-xxx〜BUG-yyy に採番して表へ転記する"
git -C $tmp push origin HEAD:master
```

コミット前に検証する: `git -C $tmp -c core.quotepath=false show --name-only --pretty=format: HEAD` の各行が `ドキュメント/04_テスト/バグ/` 配下か `ドキュメント/04_テスト/02_バグ表.md` **だけ**であること。他のパスがあれば `git -C $tmp reset --soft HEAD~1` で取り消して停止し、報告する。

- **push が拒否されたら**（master が進んだ場合）: `git -C $tmp fetch origin` → `git -C $tmp reset --hard origin/master` → 手順1からやり直す（番号は master の状態から採り直される）。2回失敗したら停止して報告する。

終わったら一時worktreeを片付ける。

```powershell
git worktree remove --force $tmp
git worktree prune
```

### 3. 自分のブランチへ取り込む

本体ツリー（`dev/自分の名前`）で `git fetch origin` → `git merge origin/master`。作業ツリーにいる場合は、そこで `git merge origin/master` してよい。表の末尾へ行が増えるため、同じ場所へ行を足している他の作業とコンフリクトすることがある。その場合は**両方の行を残す**（同じIDの行が2つできたときだけ内容を突き合わせる）。迷ったら停止して報告する。

## 禁止事項

- `kashiwagi505` 以外での実行
- `バグ/` 配下と `02_バグ表.md` 以外のパスを含むコミットの push
- 手で `BUG-nnn` を付けること、3章の表へ手で行を足すこと（どちらもスクリプトの出力を正とする）
- `git push --force`・`git rebase`

## 報告と終了条件

反映したコミット（または「変更なし」）、転記の対応（`<旧名> → BUG-nnn` と対象）、**据え置いた件数と理由**（状態が `未対応`・`対応中`）、表の件数、`check` で見つかった問題を1〜5行で報告して終了する。採番されたバグの修正に着手している人がいれば、`git merge origin/master` で番号を取り込むよう添える。
