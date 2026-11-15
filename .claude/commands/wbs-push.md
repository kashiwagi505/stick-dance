---
description: WBS配下だけの変更をPRなしでmasterへ反映する（タスクの状態・実績、ダッシュボード・振り返り等の共有）
argument-hint: [変更の一言説明（省略可。差分から読み取る）]
---

変更内容: $ARGUMENTS

このスキルは [Git運用手順](../../ドキュメント/基準書/Git運用手順.md) の「PRを経ない反映の例外」を実行する。
`WBS/` 配下は進捗管理の情報で、masterに反映されて初めてダッシュボードが全員の最新になる。
ビルドにも影響しないため、コード変更のPRを待たずに反映するための手順。

## 対象と対象外

- **対象**: `WBS/` 配下のファイルだけの変更（タスクの起票・状態・実績・メモ、ダッシュボード、テンプレート、振り返り、決定事項、`WBS/AGENTS.md` などの運用ルールを含む）。
- **対象外**: `WBS/` 以外を1ファイルでも含む変更。通常のPR（`/create-pr`）で出す。
  コード変更に伴うタスク更新も従来どおりそのPRに同梱してよい（このスキルは必須ではない）。

## 実行手順

### 1. 前提確認

1. 現在のブランチが `dev/自分の名前` または作業ブランチ（`dev/自分の名前-作業名`）であることを確認する。**`master` にいたら即座に停止してユーザーに報告する。**
   （`WBS/` 配下は `worktree-guard` フックの対象外なので、統合ブランチ上で編集していることもある）
2. `git status --porcelain` で変更を確認し、`WBS/` 配下の変更（未追跡の新規ファイルを含む）があることを確かめる。
   無ければ「WBSの変更はありません」と報告して終了する。
3. `WBS/` 以外の変更が混ざっていても構わない。**触らずそのまま残す**（次のステップで WBS/ だけをコミットするため）。
4. 他人が `owner` のタスクへの変更が含まれていないか差分を確認する（[WBS/AGENTS.md](../../WBS/AGENTS.md) 守ること1）。
   含まれていたら、代理入力の依頼があったか確認してから進む。

### 2. WBSの変更だけをコミットする

```powershell
git add -- WBS/
git commit -m "WBS: （何をしたかが一目でわかる日本語）"
```

コミット後に必ず検証する: `git show --name-only --pretty=format: HEAD` の全パスが `WBS/` 配下であること。
**1つでも配下でないパスがあれば、`git reset --soft HEAD~1` で取り消して停止し、ユーザーに報告する。**

### 3. 一時worktreeでmasterへ反映する

devブランチには未マージのコード変更が積まれていることがあるため、ブランチごとpushせず、
**このコミット1つだけ**を origin/master の上に cherry-pick して push する。

```powershell
git fetch origin
$sha = git rev-parse HEAD
$tmp = Join-Path $env:TEMP "wbs-push-worktree"
git worktree add --detach $tmp origin/master
git -C $tmp cherry-pick $sha
git -C $tmp push origin HEAD:master
git worktree remove $tmp
```

- **cherry-pick がコンフリクトしたら**: `git -C $tmp cherry-pick --abort` → worktree を削除して停止し、
  ユーザーに報告する（同じファイルがmaster側でも変わっているケース。通常の①取り込みで解消してから再実行する。
  ダッシュボード・テンプレート・`WBS/AGENTS.md` など全員が触る共有ファイルでは起こりうる）。
- **cherry-pick が「empty」になったら**: 内容がすでにmasterにある。push せず worktree を削除して、その旨を報告する。
- **push が拒否されたら**（fetch後にmasterが進んだ場合）: worktree内で `git fetch origin` → `git reset --hard origin/master`
  → cherry-pick からやり直す。2回失敗したら停止して報告する。

### 4. 自分のブランチへ取り込む

masterに入った同じ内容を自分のブランチにも取り込み、履歴を揃える。

```powershell
git fetch origin
git merge origin/master
```

- 内容が同一なのでWBSファイル自体はコンフリクトしない。他のファイルでコンフリクトやエラーが出た場合は
  通常の「① 作業開始: 最新を取り込む」（Git運用手順）と同じ扱いで対処し、迷ったら停止して報告する。
- 未コミットの変更が邪魔でマージできない場合は、マージを諦めてその旨を報告してよい（次回の①で取り込まれる）。

## 禁止事項

- `WBS/` 以外のパスを含むコミットのpush（このスキルの例外は `WBS/` 配下限定）
- `git push --force`・`git rebase`
- コンフリクトの自己流解消（停止して報告する）

## 報告と終了条件

次を1〜3行で報告して終了する。

- masterへ反映したコミットと、更新したファイル・変更点（タスクなら status/actual の前後など）
- 手順4のマージ結果（取り込んだ／スキップした）
