# R4 Nervous System / Moment Trigger — 資産監査 + 境界（R4-0・read-only）

> 2026-06-09 / Build Unit / CEO 承認「R4 内容生成 pure まで自律。位置ベース trigger は deferred（live GPS なし・捏造発火しない）。実通知/native/push/production は stop gate」。
> 前提: R3 完了（`897b25d2`）。**read-only**。

---

## 0. 結論（前提の検証）
- **trigger/scheduler/reminder engine は不在**（grep 0 件）→ **R4 は新規**。
- **push infra は存在するが Stargazer/Origin/Rendezvous 用**（`lib/notifications/sendPush.ts`・`lib/push/sendPushNotification.ts`・`lib/stargazer/notifications.ts`・`lib/origin/dailyOrbit/notifications.ts`）→ **R4 は触らない**（配送＝stop gate）。
- **native 位置・背景監視は不在**（matched は on-device pure mobility 観測のみ）→ **位置ベース trigger は deferred で正当**。
- **WorldState（R3）に now/todaySchedule/availableWindows/energy/weather** があり、**時刻・予定・状態ベースの trigger を pure に評価可能**。

## 1. R4 が発火できる trigger（WorldState signal のみ・pure）
| kind | 発火条件（WorldState から） | content |
|---|---|---|
| **preflight** | 次の予定が接近（nowMinute → next commitment start が lead 窓内）・leaveBy=start−(travelBuffer+prepBuffer) に近い | 「次の予定まで N 分・そろそろ準備/出発」 |
| **empty_day** | now が朝帯 ∧ todaySchedule 空 ∧ availableWindows あり | R2 の recommended 案を流用「今日はこう組めます」 |
| **gap_opportunity** | available window が間もなく開始(≤約15分) ∧ サイズ十分(≥45分) | 「N 分の空き・軽い選択肢」 |
| **wind_down** | now が夜帯 ∧ 今日予定あり（strain 代理） | 「明日に向けて整える」 |

**leaveBy は placeholder buffer で粗く**（`mobility.typicalTravelBufferMin ?? 既定`＋prep）。**MAP routing を再実装しない・捏造しない**（粗さを readiness で flag）。

## 2. deferred（**現段階で実装しない**・live GPS/native 必須）
- **departure**（出発した/まだ出発地）・**linger**（滞在しすぎ）・**off_route**（違う方向）。
- 理由: live 位置・background location・region monitoring・MAP 連携が必須＝**stop gate**。WorldState に live 位置がない以上、**捏造した位置で発火させない**。型に deferred kind を残すが評価しない。

## 3. 境界（所有 / consume / 不可侵）
- ✅ **R4 所有（新規 pure）**: TriggerKind taxonomy・TriggerContext 入力・condition evaluator（時刻/予定/状態系）・content builder（非断定）・gating（silence-by-default）。
- 🔌 **consume**: WorldState(R3)・EmptyDayProposalSet(R2・empty_day content)・(将来)R1 memory。
- 🚫 **不可侵**: push infra（sendPush/notifications）・MAP mobility（movementEventDetector/live leave-by）・native。
- 🚫 **作らない（stop gate）**: 実通知配送・native/background location/GPS/region monitoring・push 接続・route/API・DB・production・**位置ベース trigger 実装**・PlanCandidate/LifeOpsCandidate 正本型・Plan 本線接続・REALITY_ALTER_BRIDGE_LIVE enable。

## 4. 設計原則（構想 + Pulse 知見）
- **silence-by-default**: 既定は沈黙。fireScore 閾値以上のみ surface。**同時 surface 数を cap**（fatigue 回避）。
- **常時準備された判断状態**: 評価は pure・配送は別層（gated）。
- **おすすめ前面**: 各 trigger は 1 推奨アクション＋理由を先頭に。
- **WorldState signal のみで判断**: nowMinute 不明なら時刻系は発火しない（捏造しない）。

## 5. scope（R4-1〜R4-5・pure/dev）
- R4-1 TriggerKind taxonomy + TriggerContext 入力契約
- R4-2 condition evaluator（時刻/予定/状態系・位置系は deferred）
- R4-3 trigger → message content builder（非断定・おすすめ前面）
- R4-4 gating / priority / silence-by-default
- R4-5 fixture smoke

## 6. stop gate（R4 で必ず停止）
実通知配送 / native・background location・GPS・region monitoring / push 接続 / route・API / DB write / production・Vercel・deploy・remote・PR / user-facing 公開 / **位置ベース trigger 実装** / REALITY_ALTER_BRIDGE_LIVE enable / Plan 本線接続。
