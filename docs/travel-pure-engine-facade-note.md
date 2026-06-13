# T9 Travel pure engine facade — 境界 note（compact・docs-only）

**作成日**: 2026-06-12 / **ステータス**: docs-only。実装は別 commit（`engine-types.ts` / `engine.ts` / test）。

## T9 とは
`runTravelPlanEngine(input) → TravelPlanEngineOutput` は、Travel pure engine T3〜T8 を**安全に束ねる単一の pure facade**。

```
TravelPlanEngineInput { 正規化済み slots, participantIds, fairnessHistory?, policy?, scenarios?, viewerId? }
        │  runTravelPlanEngine（pure・決定論・各層の logic を複製しない）
        ▼  authoritative chain（authoritative 出力のみ下流へ）:
  buildProposals → compareProposals → decide → assessReadiness → planContingencies → buildPlanDecisionPacket
        │  ← 射影は **最終境界でのみ**（authoritative 入力から導出）:
        ▼  buildSharedPacketView / buildViewerPacketView
TravelPlanEngineOutput { authoritative, shared, viewer, diagnostics, inputError }
```

## 保証する境界
- **authoritative path は authoritative 上流出力のみ**を使う。shared/viewer 射影を authoritative downstream の入力に**決して使わない**。射影は最終境界でのみ構築。
- 各層の **fail-closed** 意味論を保持（participant 不正 / 矛盾 red-line → end-to-end で `blocked` + `executionAuthority=false` が伝播）。
- **権限境界**（T6.1/T7.1/T8 継承）: `authoritative` packet のみ実行権限の正本。`shared`/`viewer` は display 専用で `executionAuthority` 構造的に false・private 非搭載。
- opaque scoring・外部データ・runtime・DB・API・UI・LLM **なし**。

## 将来 integration の唯一の入口候補
- UI / CoAlter / Plan Intelligence は将来 **`runTravelPlanEngine` の packet 出力を consume** すべき。中間層（`buildProposals` 等）を個別に直接呼ばない（順序ミス・authority gate バイパス・射影の誤用を防ぐ）。
- 実 schedule/reserve/book の可否は `output.authoritative.executionAuthority`（= packet の権限正本）で判定する。`shared`/`viewer` を実行権限に使わない。
- **本 note では integration を実装しない**（runtime/DB/API/UI 接続なし）。正規化（T2C）は本 facade の上流の前段。

## 完成状態（pure engine）
T1 core types/helpers → T2 slot contract/normalizer → T3 proposal → T4 comparison/fairness → T5 decision/consensus → T6 readiness/permission → T7 contingency/recovery → T8 PlanDecisionPacket → **T9 facade**。すべて pure・未配線・private 非漏洩・authority 境界つきで `lib/shared/travel/` に揃った。
