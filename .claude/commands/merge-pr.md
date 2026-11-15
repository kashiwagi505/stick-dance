---
description: PR番号を受け取り、CI相当の検査・AIレビュー・レビュー指摘への返信漏れ・approveを機械チェックし、問題なければマージする
argument-hint: [PR番号（省略時は現在ブランチのPR）]
---

対象PR: $ARGUMENTS

このコマンドは [Git運用手順](../../ドキュメント/基準書/Git運用手順.md) の「⑥ レビューしてマージする」を実行する。
AIレビュー・人のレビューの指摘に**返信がないままマージされる**のを防ぐため、マージは必ずこのコマンド経由で行う。

> **検査はローカルで回す（Actions に依存しない）。** 前案件では Actions が課金停止で止まり、CI・AI自動レビュー・
> `@merge-pr` がすべて動かなくなった。GitHub のAPI本体（PRの取得・レビュースレッド・approve・マージ）だけで
> 完結するように、このコマンドがマージ可否に関わる検査を**ローカルで実行して**からマージする。
> Actions を常用する場合は末尾の「Actions を常用する場合」を参照する。

## 対象と対象外

- **対象**: `dev/○○` → `master` のPRのマージ操作と、その直前のゲート（CI相当の検査・AIレビュー・返信漏れ・approve）。
- **対象外**: PRの作成（/create-pr、/run-impl-loop）、指摘への**返信・修正そのもの**（人が行う）。

> **本体ツリーから実行する。** 手順2は別の作業ツリー（`merge-check`）でgitを動かすため、作業ツリーに隔離された
> セッションからは実行できない（Claude Code が「隔離されたセッションのgit操作は自分のツリーに限る」と拒否する）。
> 作業ツリーにいるときは `/worktree-end` で本体ツリーへ戻ってから実行する。

## 検査の順番

軽い検査から回して、落ちるときは早く落ちるようにしてある。上から順に実行し、**NGが出た時点で停止して報告する**（先へ進まない）。

| # | 検査 | かかる時間 | 代替しているもの |
|---|---|---|---|
| 1 | 前提確認（open・コンフリクト・PR特定） | 数秒 | — |
| 2 | CI相当のローカル検査（向き先・バグ表・レビュー指摘表） | 数秒 | ci.yml / pr-target.yml |
| 3 | AIレビュー（未実施 or head更新時のみ） | 数分 | claude-pr-review.yml |
| 4 | レビュー指摘への返信漏れ | 数秒 | — |
| 5 | approve | 数秒 | — |
| 6 | `npm run check`（コードが変わったPRのみ） | 数分 | ci.yml |
| 7 | マージ | 数秒 | claude-merge.yml |

## 1. 前提確認

1. [Git運用手順](../../ドキュメント/基準書/Git運用手順.md) を全文読む（未読の場合）。
2. 対象PRを特定する。引数のPR番号を優先し、省略時は現在ブランチのPR。

   ```powershell
   gh pr view <番号> --json number,title,state,isDraft,mergeable,headRefName,headRefOid,baseRefName,author
   ```

   省略時は特定したPR番号・タイトルを報告してから先へ進む。
3. 次のいずれかなら**停止して報告する**。
   - `state` が `OPEN` でない
   - `mergeable` が `CONFLICTING`（コンフリクトは人が解消する。どちらを採るかをAIが決めない）
   - `isDraft` が `true`（ドラフトはマージしない）
   - `baseRefName` が `master` でない
4. **`gh pr checks` の結果は判定に使わない。** Actions が動いていない・無料枠を超えたときはすべて `fail` を返すため、
   見ると必ず止まる。代わりに手順2・5でローカルの検査を回す。

## 2. CI相当のローカル検査

CI（ci.yml・pr-target.yml）の検査のうち、数秒で終わるものをローカルで実行する。**PRブランチそのものではなく、
`master` にマージした結果**を検査する（CIと同じ。他のPRが先に入ったことによる破綻を見るため）。

```powershell
$pr   = <番号>
$head = <headRefName>
$wt   = ".claude\worktrees\merge-check"

git fetch origin master $head
if (-not (Test-Path $wt)) { git worktree add $wt --detach origin/master }

Push-Location $wt
git reset --hard -q
git checkout -q --detach origin/master
git merge --no-ff --no-edit "origin/$head"
node .github/scripts/ci-local.mjs --base origin/master --head-ref $head
Pop-Location
```

- `merge-check` は**検証専用の常設ツリー**。ブランチを持たない detached なので `/worktree-end` の対象外で、
  消しても支障はない（次回に作り直される）。ビルド結果を残して2回目以降を速くするために置いたままにする。
  **このツリーでファイルを編集しない**（毎回 `git reset --hard` で捨てられる）。
- `git merge` が失敗したら `git merge --abort` して**停止**し、コンフリクトを報告する（`mergeable` が
  `MERGEABLE` でも、master が進んでいれば実際には衝突する）。
- `ci-local.mjs` が NG を出したら**停止**し、出力をそのまま報告する。検査内容は
  [ci-local.mjs](../../.github/scripts/ci-local.mjs) のコメントを正本とする。
- `merge-check` は `master` にPRをマージした状態なので、スクリプトは `master` 側にあるものが動く。
  **このスクリプト自体を master へ入れる最初のPRだけは** `merge-check` に存在しないため、その回に限り
  PRブランチ側の `node .github/scripts/ci-local.mjs` を使う（`--base origin/master` は同じ）。
- 最後の `BUILD:` 行を覚えておく。`required` なら手順6で `npm run check` を回す。`skip` なら回さない。

## 3. AIレビュー（Claude PR Review の代替）

PR作成時の自動レビュー（Actions）には頼らず、**マージ直前にここで1回だけ実行する。**

1. すでにこの head SHA でレビュー済みかを見る。

   ```powershell
   gh pr view $pr --json comments --jq '.comments[].body' | Select-String "merge-pr-review: <headRefOid>"
   ```

   見つかれば**レビュー済みなのでスキップ**して手順4へ。head が更新されていればマーカーが一致しないので、
   自動的に再レビューになる。
2. 未実施なら、`codex-pr-reviewer` サブエージェントでレビューする。エージェントには次を渡す。
   - `.agents/codex-pr-reviewer.md` を全文読み、その「対象」「判定の原則」「手順」「最優先のチェック項目」
     「PR固有のチェック項目」「出力形式」に厳密に従うこと
   - 差分にアプリケーションコードが含まれる場合は `.agents/impl-policy-reviewer.md` も全文読むこと
   - 差分は `git diff origin/master...origin/<headRefName>` を**ファイル単位**で読む。
     `--stat` で規模を見てから、`-- <パス>` で1ファイルずつ読む。Bashの出力は約3万文字で打ち切られるので、
     打ち切られたら `sed -n` で範囲を分けて読み直す。**打ち切られた出力のまま判断しない**
   - 管理表のように1行が数千文字あるファイルは、実ファイルを Read で開いて照合する
   - 読み切れなかったものがあれば、何が読めなかったかをサマリに明記する
   - **コードは修正しない。GitHubへ投稿もしない**（投稿はこのコマンドが手順3-3で行う）
3. 結果を画面に提示し、**投稿してよいかを人に確認してから**PRへ投稿する。指摘を行コメントとして残すことで、
   手順4の返信漏れチェックの対象になる（投稿しないと記録が残らず、再実行のたびに同じ指摘を出し直すことになる）。

   ```powershell
   # review.json を書いてから投稿する
   gh api repos/kashiwagi505/stick-dance/pulls/$pr/reviews --input review.json
   ```

   ```json
   {
     "commit_id": "<headRefOid>",
     "event": "COMMENT",
     "body": "### レビュー結果（AIレビュー / ローカル実行）\n\n要修正 n件・推奨 n件・要確認 n件。…\n\n<!-- merge-pr-review: <headRefOid> -->",
     "comments": [
       { "path": "src/...", "line": 123, "side": "RIGHT", "body": "**[要修正]** …" }
     ]
   }
   ```

   - `body` の末尾に `<!-- merge-pr-review: <headRefOid> -->` を必ず入れる（手順3-1の目印）。
   - 行コメントは**差分に現れる行**にしか付けられない。行を特定できない指摘は `comments` に入れず、`body` に箇条書きで書く。
   - `event` は `COMMENT` 固定。`APPROVE`・`REQUEST_CHANGES` にしない（approveは人が出す）。
4. **要修正・推奨・要確認が1件でもあれば、投稿した時点で停止する。** 「指摘に返信してから再実行する」ことを案内する。
   指摘ゼロなら、サマリだけ投稿して手順4へ進む。

## 4. レビュー指摘への返信チェック（このコマンドの本体）

1. PRの全レビュースレッドを取得する。

   ```powershell
   gh api graphql -f query='query($pr:Int!){repository(owner:"kashiwagi505",name:"stick-dance"){pullRequest(number:$pr){reviewThreads(first:100){nodes{isResolved path line comments(first:50){nodes{author{login __typename} body}}}}}}}' -F pr=<PR番号>
   ```

2. 各スレッドの1件目のコメントを「指摘」とみなし、次の基準で判定する。

   - **返信あり**: 2件目以降に人（`__typename` が `Bot` でなく、loginが `[bot]` で終わらない）のコメントが1件以上ある。
   - **返信なし**: 上記以外（コメントが1件だけ、または追記がAI・botのみ）。

   手順3で投稿したAIレビューの指摘は、投稿者が人のアカウントになるが**1件目＝指摘**なので判定は変わらない。

3. 返信なしの指摘が1件でもあれば**マージせず停止**し、次の形式で一覧を報告する。

   | # | ファイル | 行 | 指摘者 | 指摘の冒頭（50字程度） |
   |---|---|---|---|---|

   あわせて「各指摘に返信（対応する／しないならその理由）してから再実行する」ことを案内して終了する。
   **このコマンドは返信を投稿しない。** マージ可否の判定だけを行う。返信は Git運用手順⑥ の書き分けに従って別途投稿する。

4. approveの有無を確認する。

   ```powershell
   gh pr view <番号> --json latestReviews --jq '.latestReviews[] | select(.state=="APPROVED") | .author.login'
   ```

   人（bot以外）のapproveが1件もなければマージせず停止して報告する（Git運用手順: approveなしでマージ禁止）。
   手順3で投稿したAIレビューは `COMMENTED` なのでここには出ない。

## 5. `npm run check`（手順2が `BUILD: required` のときだけ）

```powershell
Push-Location ".claude\worktrees\merge-check"
npm run check
Pop-Location
```

- `BUILD: skip`（ドキュメントだけのPR）なら回さず、その旨を報告に書く。
- 失敗したら**停止**し、静的解析・テストのレポートのパスとともに報告する。
- 他のセッションが同時にビルドを回していると、ロックの取り合いで待たされることがある。数分返らないときは
  他セッションの終了を待つ（強制終了しない）。
- 検証用ツリーには `.env` も要らない（CIと同じで、`npm run check` は外部のサービスを使わない）。

## 6. マージ実行

1. チェックがすべて通ったら、マージ内容（PR番号・タイトル・指摘スレッド数と全返信済みであること・approve者・
   ローカル検査の結果）を報告してからマージする。

   ```powershell
   gh pr merge <番号> --merge
   ```

   - **Create a merge commit 固定。`--squash`・`--rebase` 禁止**（Git運用手順⑥）。
2. マージ後、`git fetch origin` を実行し、次の作業開始時に `origin/master` の取り込み（Git運用手順①）から
   再開する旨を報告する。

## 7. 報告と終了条件

- マージした場合: PRのURL、チェック結果（ローカル検査OK・`npm run check` の実行有無・AIレビューの指摘件数・
  指摘スレッド数と全返信済み・approve者名）を1〜3行で報告して終了する。
- 停止した場合: 理由（コンフリクト／ローカル検査NG／AIレビューの指摘／未返信の指摘一覧／approve不足／
  `npm run check` 失敗）と、人がやるべき次の操作を報告して終了する。

## 禁止事項

- 未返信の指摘が残った状態でのマージ。ユーザーから「このままマージして」と明示されても、まず未返信一覧を提示して確認を取ってから実行する
- コマンドの判断で指摘への**返信**を投稿すること（AIレビューの**指摘**を手順3で投稿するのは可。ただし人の確認を取ってから）
- ローカル検査（手順2・5）を飛ばしてマージすること。ブランチ保護が効かないリポジトリでは、master を壊さない砦はここだけになる
- `--squash`・`--rebase` でのマージ、`master` への直接push（Git運用手順7章）
- `gh pr checks` の結果を見てマージ可否を判断すること（Actions が動いていないと常に fail のため）

## Actions を常用する場合

Actions（有料枠・公開リポジトリ）を常用できるなら、ローカル検査は省略できる。

1. 適当なPRで CI・PR Target が緑になることを確認する。
2. 手順1-4を「CIの状態を確認する（`gh pr checks <番号>`）。失敗・実行中のチェックがあれば停止して報告する」に戻し、
   手順2・5（ローカル検査）と手順3（AIレビュー）を削る。
3. このファイル冒頭の注記と、[Git運用手順](../../ドキュメント/基準書/Git運用手順.md)⑥ のローカル検査の記述を書き換え、
   `@merge-pr`・`@claude` の案内を足す。
4. `.github/scripts/ci-local.mjs` と検証用ツリー `.claude/worktrees/merge-check` は消してよい。
5. 毎朝の採番（bug-table-sync.yml）を有効にする。それまで `ドキュメント/04_テスト/バグ/未採番/` は `/bug-sync` で処理する。
