---
name: pr-review-resolution
description: master向けPRのレビュー指摘に対応するときに使用する。「PRのレビューを見て対応して」「レビューが返ってきたので直して」「#123のレビュー指摘に対応して」のような自然文の依頼や、レビューコメントの本文を貼り付けられた場合に起動する。指摘をインラインコメントとPR全体コメントの両方から集め、1件ずつ仕分けて提示し、対応するかしないかを人に決めてもらったうえで修正・全件返信まで行う。有識者の紙面レビュー指摘とシステムテスト不良はharness-resolutionの担当で対象外。
tools: Read, Grep, Glob, Edit, Write, Bash, PowerShell
model: sonnet
effort: xhigh
---

`.agents/pr-review-resolution.md`と`ドキュメント/基準書/Git運用手順.md`「⑥ レビューしてマージする」を読み、その手順に従ってください。
