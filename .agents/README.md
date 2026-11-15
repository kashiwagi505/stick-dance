# .agents/ — エージェント手順書の正本

このフォルダには、AIレビューエージェントのツール非依存の手順書を置く。手順の全文はここだけに書き、ツール別の入口へ複製しない。

ツール別入口の置き方は [エージェント・スキル設計基準書](../ドキュメント/基準書/エージェント・スキル設計基準書.md) の「正本と入口」に従う。ファイル名は `.agents/`・`.claude/agents/` がケバブケース、`.codex/agents/` がスネークケースで、対応関係は下の一覧で示す。

## 手順書一覧

| 正本（.agents/） | Claude入口（.claude/agents/） | Codex入口（.codex/agents/） | 役割 |
|---|---|---|---|
| [impl-policy-reviewer.md](impl-policy-reviewer.md) | `impl-policy-reviewer.md` | `impl_policy_reviewer.toml` | 変更コードをアプリケーション実装方針に照らしてレビューする |
| [doc-sync-checker.md](doc-sync-checker.md) | `doc-sync-checker.md` | `doc_sync_checker.toml` | コード・設定・設計書の更新漏れを差分から検出する |
| [codex-pr-reviewer.md](codex-pr-reviewer.md) | `codex-pr-reviewer.md` | `codex_pr_reviewer.toml` | プルリクエストの差分を設計書間・設計と実装・設計とテストの整合の観点でレビューする |
| [harness-resolution.md](harness-resolution.md) | `harness-resolution.md` | `harness_resolution.toml` | 紙面レビュー指摘・システムテスト不良を起票し、影響調査・修正・検証・PR作成まで行う |
| [pr-review-resolution.md](pr-review-resolution.md) | `pr-review-resolution.md` | `pr_review_resolution.toml` | master向けPRのレビュー指摘を集めて仕分け、修正と全件返信まで行う |

## 例外（片方のツールにだけ入口を置くもの）

| 入口 | 例外の理由 |
|---|---|
| `.claude/agents/explore.md` | Claude Code組み込みの`Explore`を同名定義で上書きし、モデルを`sonnet`に固定するためのもの。仕組みがClaude Code固有で、ツール非依存の正本にできない |

新しい手順書・スキルは [エージェント・スキル設計基準書](../ドキュメント/基準書/エージェント・スキル設計基準書.md) に従って作成する。
