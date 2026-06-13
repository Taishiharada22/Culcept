# T3 proposal core — 境界 note（compact・docs-only）

**作成日**: 2026-06-12 / **ステータス**: docs-only。実装は別 commit（`proposal-types.ts` / `proposal-builder.ts` / test）。

## T3 の位置づけ（前提の整理）

```
ExtractedSlot[]（T2C 正規化済み）+ participantIds
        │  buildProposals（T3B・pure・決定論）
        ▼
ProposalSetOutput { proposals(最大3案), rejected, missingQuestions, inputError }
        │  ← ここまでが T3（場所検索・LLM・solver なし）
        ▼ （HOLD: solver / 場所検索 / 経路）
T1A TravelCandidate（itinerary DAG 付き完成候補）
```

- T3 `TravelProposal` は **場所確定前の「提案骨格」**: 角度(relaxed/food/active/nature/culture) × 条件評価(paceFit/mobilityFit) × soft 一致 × hard 違反による fail-closed reject × 不確実性 × 欠損 × M5 二層 rationale。
- T1A `TravelCandidate`（itinerary DAG）とは**別概念**。T3 は itinerary を埋めない（場所検索が要るため）。後段の solver（HOLD）が採用 proposal を TravelCandidate に展開する。

## いま HOLD のもの（T3 では touch しない）

runtime LLM 抽出 / 実 place・route 検索 / solver・scoring engine / M2 personalization runtime / useCoAlter / Plan Intelligence 投影 / DB・API・route・UI 配線 / send・realtime・read receipt / staging・production・push。

## T3 が将来 Plan Intelligence に供給する道（**本 note では実装しない**）

- UI モックの「候補プラン3案」カードは `ProposalSetOutput.proposals` を投影したもの（title/summary/areaPlaceholder/budgetBand/paceFit/uncertainty）。
- 「共有コンディション」chips は `toSharedProposalView` 後の shared rationale / shared 条件のみ。
- 「個別条件は要約して共有」= per-viewer rationale（`rationale.forParticipant`）は本人向け投影でのみ展開。
- これらの**実投影（Plan Intelligence projection）は CEO 明示 GO 後**（HOLD）。T3 はその入力契約（pure 出力）を用意したのみ。

## 設計上の差別化点（pure でも担保）

- **private 制約は候補 validity に影響するが shared に漏れない**: private red_line で角度を reject できる（validity 影響）が、`toSharedProposalView` は private 違反の reject ごと隠し・forParticipant 削除・private descriptor 非出現（canary テストで固定）。
- **source-agnostic**: participantId のみ使用。participant source kind / adapter provider mode は出力に一切出さない（テスト固定）。
- **決定論・冪等**: 同一入力→同一出力。順序は「soft 一致数 → 角度固定順」。
