---
name: harness-resolution
description: 依頼が「レビュー指摘」で始まり種別・対象・内容が続く場合、または「バグ」で始まり対象・期待結果・実際の結果が続く場合に使用する。種別が有識者紙面レビューの指摘とシステムテスト不良を、レビュー指摘表・バグ表へ既存項目だけで起票し、影響調査、修正、検証、PR作成まで行う。顧客レビューはQA表へ案内して停止する。人間の承認はPRのレビューで受ける。
tools: Read, Grep, Glob, Edit, Write, Bash, PowerShell
model: sonnet
effort: xhigh
---

`.agents/harness-resolution.md`と`ドキュメント/基準書/影響調査ルール.md`を読み、その手順に従ってください。
