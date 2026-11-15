# 棒人間ダンシング

キーで棒人間を引っ張って踊らせると、その踊りが4小節のループに音として重なり、最大5人の分身が並ぶブラウザゲーム（PCのChrome向け）。最後に全員の踊りと曲を鑑賞し、URLで共有できる。サーバーを持たず、GitHub Pages から静的ファイルとして一般公開する。要件は [要件定義](ドキュメント/01_要件定義/README.md) を参照してください。

手応えを確かめた試作は [prototype/index.html](prototype/index.html)（1ファイル。ライブラリなし。ブラウザで直接開ける）。

> [!WARNING]
> **このリポジトリのハーネス（基準書・テスト方針・レビュー手順・ESLint 設定など）は、前作「配達で曲ができるゲーム」のものを名前だけ置き換えて持ってきた段階です。** 前作の遊び（配達・ステージ・種明かし・WAV）と技術（Phaser 4・Tone.js）が前提の記述がまだ残っています。基本設計の技術選定で、次を書き直してください。
>
> - [ ] `package.json`（依存）・`eslint.config.js`（層の境界）・`index.html`・`vite.config.ts`
> - [ ] [アプリケーション実装方針](ドキュメント/基準書/アプリケーション実装方針.md)（層の分け方・時刻・乱数・公開）
> - [ ] [テスト方針](ドキュメント/04_テスト/01_テスト方針.md)（単体テストの対象・受け入れ条件との対応・E2Eの扱い）
> - [ ] [バグ表](ドキュメント/04_テスト/02_バグ表.md) の重大度の例
> - [ ] `.agents/`（impl-policy-reviewer・doc-sync-checker・codex-pr-reviewer）と `.claude/commands/`（gen-unit-test・gen-e2e・gen-e2e-scenario・front-design・bug-verify）の、前作の層・用語を前提にした箇所
> - [ ] 基準書の画面設計・詳細設計ガイド、テンプレート（処理設計書・画面設計書・システムテスト報告書）の例
> - [ ] `.github/workflows/pages.yml` のコメント
>
> 残りを探すコマンド: `grep -rn -i "配達\|phaser\|tone\|ステージ\|種明かし" --exclude-dir=prototype --exclude-dir=node_modules .`

## 自宅Macで始める

開発は会社PC（Windows）と自宅Macの2台で行う。Macで初めて触るときは次のとおり。

```bash
git clone https://github.com/kashiwagi505/stick-dance.git ~/Documents/app/stick-dance
cd ~/Documents/app/stick-dance
git switch dev/kashiwagi
open prototype/index.html   # 試作を遊ぶ（クリックで開始。左手 WASD・右手 矢印キー・楽器 1〜5）
```

2回目からは `git pull` で会社PCの変更を取り込んでから始める。

- **Claude Code はこのフォルダで開く。** 入口は [AGENTS.md](AGENTS.md)。今どこまで進んだかと次にやることは [要件定義](ドキュメント/01_要件定義/README.md) の「未決事項」と、secondbrain vault のプロジェクトページ（`30_Projects/棒人間ダンスで曲ができるゲーム/README.md`）にある
- **hook は Mac では動かない。** `.claude/hooks/*.ps1` は Windows PowerShell 前提なので、`.claude/hooks/run.mjs` が Mac では何もせずに終わる。作業ツリーの分離やパス指定コミットの守りが効かないので、[Git運用手順](ドキュメント/基準書/Git運用手順.md) を自分で守る
- **背景・トップページの絵は Mac で作る**（Codex。判断ログ D15）。作った画像は [素材/画像の記録](ドキュメント/素材/画像の記録.md) に1行ずつ書く
- Node.js 22 以上を入れておく（技術選定の後、`npm ci` で依存を入れる）

この README の以下は、リポジトリを clone した開発者がローカル開発環境をセットアップするための手順をまとめています。

## 開発環境のセットアップ

前提: Node.js 22 以上、PCのChrome。

### 1. 環境変数（通常は不要）

サーバーも秘密値も持たないため、`.env` は無くても動きます（→ [インフラ要件](ドキュメント/01_要件定義/03_インフラ要件.md) 2章）。

`SERVER_PORT`（開発サーバーの待受ポート）は、既定値のままで通常の開発ができます。変更するのは、実装を触る作業ツリーを2つ以上同時に動かすときだけです（→ [Git運用手順](ドキュメント/基準書/Git運用手順.md)「4. 並行作業（複数セッション）」。`/worktree-start` が空きを確かめて設定します）。

### 2. 依存を取得する

```text
npm ci
npm --prefix e2e ci
npx --prefix e2e playwright install chromium
```

2行目と3行目はE2Eテストを回すときだけ必要です。

### 3. テストと静的解析を実行する

```text
npm run check
```

プルリクエスト作成時も同じコマンドが実行されます（Actions が使える場合）。マージ前には `/merge-pr` がローカルで同じ検査を回します。

### 4. E2Eテストを実行する

```text
npm run e2e
```

### 5. アプリケーションを起動する

```text
npm run dev
```

Chromeで `http://localhost:5000/`（`SERVER_PORT` を変えた場合はその番号）を開きます。音はブラウザの制限により、画面でキーかクリックを押してから鳴り始めます。

### 6. 公開する

```text
npm run build
```

でビルドできます。公開は GitHub Actions でビルドして GitHub Pages へ出します（→ [技術選定の設計方針](ドキュメント/02_基本設計/設計方針/技術選定の設計方針.md) 3.5）。

## 設計書

要件、設計、開発基準などは [ドキュメント構成](ドキュメント/ドキュメント構成.md) を参照してください。

ブランチ運用、日々の作業手順は [Git 運用手順](ドキュメント/基準書/Git運用手順.md) を参照してください。

Claude Code のスラッシュコマンド（`/wbs-new`、`/create-pr` など）、自動で動くサブエージェント、外部スキルの一覧と使い方は [コマンド・スキル利用ガイド](ドキュメント/基準書/コマンド・スキル利用ガイド.md) を参照してください。

## 管理者向けセットアップ

メンバーは通常この節の作業を行いません。案件の開始時に1回だけ、管理者が次を行ってください。

> [!NOTE]
> プライベートリポジトリではプラン制約によりブランチ保護（Ruleset / branch protection rule）が強制されないことがあります。その場合 `master` への直接push禁止は [Git 運用手順](ドキュメント/基準書/Git運用手順.md) の運用ルールとフック（`safe-commit-guard`・`worktree-guard`）で担保します。

### 1. 各メンバーの個人統合ブランチを作る

各メンバーが clone したあと、`master` の最新から `dev/自分の名前`（英小文字）を作って push します（[Git運用手順](ドキュメント/基準書/Git運用手順.md)「ブランチ名のルール」）。あわせて `git config --global rerere.enabled true` を設定してもらいます。

### 2. Claude GitHub App をインストールする（Actions を使う場合）

[Claude GitHub App](https://github.com/apps/claude) をリポジトリにインストールします。PR作成時の自動レビュー（[claude-pr-review.yml](.github/workflows/claude-pr-review.yml)）と `@claude` メンション対応（[claude.yml](.github/workflows/claude.yml)）が使用します。

### 3. 認証トークンを登録する（Actions を使う場合）

ローカルの Claude Code で次を実行し、ブラウザで承認すると、ターミナルにトークンが表示されます。

```text
claude setup-token
```

表示されたトークンをリポジトリの Settings → Secrets and variables → Actions に `CLAUDE_CODE_OAUTH_TOKEN` という名前で登録します。未登録の場合、これらのワークフローは何もせずスキップされます。

> [!IMPORTANT]
> - トークンは**発行時にしか表示されません**。その場でコピーして登録してください。
> - **有効期限は1年**です。切れるとレビューが動かなくなるため、`claude setup-token` で再発行して Secret を差し替えます。
> - **発行した人のサブスクリプションを消費します。** 誰のアカウントで発行するかを決めてください。
> - トークンをリポジトリに直接書かないでください。必ず GitHub Secrets 経由で渡します。
