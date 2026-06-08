# R1–R5 Pure Orchestration Pipeline（横エンジンの「1日の脳」通し検証）

> 2026-06-09 / Build Unit / CEO 指示「R1〜R5 を実介入なしで1本の pure pipeline に接続し破綻なく流れるか検証」。
> pure・**no-apply**・Plan 本線非接続・redacted。`lib/plan/reality/orchestration/reality-pipeline.ts`。

## 流れ（1 本の pure pipeline）
```
入力: memoryItems + WorldState + permissionLevel + nowMs (+userIntent/requestedAction)
 ↓ R1 synthesizeMemory          記憶を統合(usableContexts / suppressed 分離)
 ↓ R3 assessWorldState + deriveEmptyDayInput   現実 readiness + R2 入力(suppressed→excluded)
 ↓ R2 generateEmptyDay + buildAllReasoning     空白の日 3 案 + 非断定 reasoning
 ↓ R4 evaluateTriggers + content + gateTriggers  起動判定 + silence-by-default(cap 1)
 ↓ R5 proposalToChangeSetDraft + evaluatePermission  ChangeSet draft 候補 + 許可判定
出力: redacted envelope（apply 手前で停止）
```

## 出力契約（`RealityPipelineEnvelope`・redacted）
```ts
{
  date; worldReadiness: "ready"|"partial"|"insufficient";
  recommended: { tier; activeMinutes; restMinutes; strain } | null;   // 要約のみ
  reasoning:   { fits{time,energy,weather,mobility}; confidence≤tentative; readiness } | null;
  surfacedTrigger: { kind; headline } | null; silencedTriggerCount;     // silence-by-default
  permission: { verdict: allowed|confirm_required|blocked|insufficient_context; risk; reason(redacted) };
  changeSetDraft: { id; opCount } | null;                               // 要約のみ・apply しない
  stopReasons: string[];                                               // 欠損 signal/停止理由(非断定・捏造しない)
}
```

## 安全（CEO 必須条件・全 fixture で検証）
ChangeSet は draft のみ・**apply しない**・allowed でも実行しない・**高リスクは confirm/blocked（どの level でも auto-allowed にならない）**・insufficient context は捏造せず止める・suppressed memory は使わない・confidence high 禁止・trait/fixed 禁止・**return redacted（raw/seedRef/PII/personality を出さない）**・silence-by-default。

## fixture 結果（10 PASS）
memory有/無・suppressed・low energy(詰めすぎない)・weather caution・tight windows(overpacking なし)・high risk(全 level で auto-allowed なし)・insufficient context(窓なし→停止・draft なし)・ChangeSet 要約のみ・redaction。

## まだ本線接続してはいけないもの
envelope の Plan 本体 write/表示・ChangeSet apply・PlanClient・route/API/DB・通知配送・native・production・REALITY_ALTER_BRIDGE_LIVE enable（全て R5-4 以降の CEO stop gate）。
