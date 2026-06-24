# LifeOps 新 DueReason の conservative placement（production 前 placeholder）

## 背景
LifeOps vertical branch（`claude/life-ops-vertical`）統合（INT-4B）で `DueReason` union が拡張された：

- 既存3種: `cycle` / `event_prep` / `deadline`
- **新3種**: `recurring` / `habit` / `relationship`（縦の新機能＝recurring 時間構造 / habit 成長 / relationship 候補）

mainline A4-C 配置エンジン `lib/plan/reality/lifeops/lifeops-placement.ts` は
「deadline / event_prep 以外 = cycle」という**旧前提**で `.phase` にアクセスしていたため、
新3種が union に入ったことで型エラー（`Property 'phase' does not exist on ...`）が発生した。

## 採用方針（CEO 判断 2026-06-24・Option C）
- LifeOps の `DueReason` 拡張は**採用**（union を潰さない・candidate-types を巻き戻さない・新機能を削らない）。
- placement の旧前提を**廃止**し、`d.kind === "cycle"` を**明示 narrow** する。
- 新3種（recurring/habit/relationship）は **production 前の conservative placeholder** として扱う。
  **正式な優先度・lane semantics は production 後または別 increment で設計する。**

## conservative fallback の内容（`lifeops-placement.ts` のみ・1ファイル）
| 関数 | 既存3種（不変） | 新3種（conservative fallback） |
|---|---|---|
| `lifeOpsUrgencyRank` | deadline `-1000`/daysUntil・event_prep `100+`・cycle `200+(0..4)` | `NEW_KIND_CONSERVATIVE_URGENCY = 300`（cycle 最下位 204 より大＝**最も非緊急**） |
| `lifeOpsLaneOf` | deadline `protect`・event_prep `protect/push/easy`・cycle `protect/easy/push` | `"easy"`（**protect/push に昇格しない**） |
| `laneReason` | deadline/event_prep/cycle の既存 reason code | `"lifeops_conservative_fallback"` |

## 不変条件（厳守）
- **既存3種（cycle/deadline/event_prep）の挙動は完全に不変**（narrow を明示化しただけ・分岐結果は同一）。
- 新3種を **deadline 扱いしない / protect・push に昇格しない / hard urgency を付けない**（最低・非緊急・easy）。
- 型をごまかさない：`as any` なし・不自然な cast なし・union を潰さない・3 narrow 後の残余型は厳密に `Recurring|Habit|Relationship`。
- 修正は `lifeops-placement.ts` 1ファイルのみ（+ test）。A4-C 本体・UI・DB・env は非変更。

## 現状の安全性
- 新3種の候補は**縦の新 generator（flag-OFF・mainline reality pipeline 未配線）でのみ生成**されるため、
  現時点で mainline placement に新3種が**実際に流入することはない**（fallback は防御的保険）。
- 正式設計時に本 doc を起点に、recurring/habit/relationship の優先度・lane を本格設計する。
