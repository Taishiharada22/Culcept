# Life Ops A-6 — Relationship Candidate Generator mini-design【touchpoint + gift optional・pure】

> 2026-06-09 / Life Ops 縦トラック（branch `claude/life-ops-vertical`）
> 参照: relationship-model / gift-intelligence（A-6 contract）/ recurrence-model / cadence-model / collector。
> **CEO 指示**: contract を候補生成に接続。touchpoint candidate が主・gift は optional metadata（過剰に出さない）。

---

## 1. 設計の骨子
- **touchpoint candidate が成立の主体**（gift がなくても成立）。gift は **giftRelevant ∧ desire signal あり ∧ 全 low-confidence でない**ときだけ `GiftRecommendation` 最大 3 件を dueReason の optional metadata に添付。
- 入力 `RelationshipObservation`（CEO DTO 準拠・**実名/email/電話/raw message/free text なし**・opaque personRef のみ）。
- L-1 に `relationship_care`（group=relationship・cyclic=false・hint **L2**=suggest・risk []・placeQuery null）を 1 つ追加（touchpoint 詳細は dueReason 側＝カテゴリ爆発を防ぐ）。

## 2. time structure（既存 engine 流用 + post-event 小拡張）
| touchpoint | 構造 | 条件 |
|---|---|---|
| birthday / anniversary / seasonal_gift | **annual recurring**（dateISO の月日→`computeRecurringStatus`） | within_lead（lead 7 日） |
| long_time_no_contact | **cadence**（daysSinceLastContact） | 関係別閾値超え（family45/partner21/close_friend60/friend90/colleague120/mentor90/acquaintance180） |
| visit_family | cadence | ≥60 日 |
| thank_you_followup / return_gift / borrowed_item_return / introduction_thanks / hosted_meal_thanks / support_thanks | **followup deadline**（followupDueISO） | 期限まで ≤3 日 or **overdue** |
| pre_event_encouragement | before event（dateISO） | 0〜2 日前 |
| post_event_result_check | **post-event（新規 pure helper）** | 終了後 1〜5 日 |
| post_meeting_followup | post-event | 終了後 0〜3 日 |
| casual_checkin / shared_plan_followup | 本 slice 対象外（skip） | — |
post-event helper＝`daysBetween(eventISO, now)` が [min,max] 内（calendar title 推定・実データ接続なし・日付は注入）。

## 3. 候補化しない（fail-closed）
invalid personRef / 未知 touchpoint / `evaluateSuppression` 不許可（do_not_suggest・relationship_distance=全 / mourning・sensitive=祝い系 / frequency_cap=contact 群）/ 時間条件未達。gift は全 rec low-confidence なら**添付しない**（touchpoint candidate は残る）。

## 4. dueReason / dedup / collector
`RelationshipDueReason { kind:"relationship", touchpointId, relationKind, personRef(opaque), daysUntil, daysSince, overdue, giftRecommendations? }`。
collector: `relationshipObservations` を追加し **末尾に合流**（deadline/recurring/protect 系を押しのけない・低圧）。dedup key を relationship のみ `category:touchpointId:personRef` に拡張（人物×接点ごとに独立候補・他 kind は従来 `(category,menu)` 不変）。

## 5. permission / presenter
- permission 正本＝`assessRelationshipPermission()`（max=suggest・確認必須・auto_send/auto_notify/external_message/purchase/reservation/draft_body_generation blocked）。candidate hint は L2（汎用層と整合）。
- presenter: title=touchpoint label（「誕生日」「お礼」…）。reasonText は低圧・redacted・断定なし（「◯日後に大切な日があります。ひとこと考えておくと安心です」「最近少し間が空いています。軽く近況を思い出しておくと自然です」「お礼を一言だけ整えておくと、気持ちよく区切れます」）。**NG**（今すぐ/送信/寂しがって/関係が悪く/必ず喜ぶ）はテストで遮断。gift 添付時のみ timingHint「相手の最近の関心に沿った贈り物の候補を用意できます」。urgency=normal 固定（末尾・低圧）。

## 6. 実装 / テスト
`lib/lifeops/relationship-candidates.ts`（新）+ category-model/candidate-types/collector/presenter の外科的拡張 + CEO 18 項目テスト。
