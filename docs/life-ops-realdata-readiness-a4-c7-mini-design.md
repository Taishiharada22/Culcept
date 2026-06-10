# Life Ops — A-4-c7 Real-Data Readiness Mini-Design（5層cap dry-run 配線 + read-only source design）

> 2026-06-10 / CEO・GPT 指示「実データ前に、5層capが doc でなく fixture/preview pipeline で安全に効くことを確認。実データ接続は禁止」。
> **禁止**: 実データ読み（DB/Calendar/Supabase）/write/notification/R4 本線/PlanClient/UI 本線/production/push/PR/merge。flag は default OFF・読み取りなし。

---

## 1. 5層cap dry-run 配線（fixture/preview pipeline）

| # | cap | 配線位置 | 実装 |
|---|---|---|---|
| 1 | raw input | **compute**: collector **入力直前** `capRawLifeOpsInputs` | dry-run 配線（fixture は cap 未満=no-op・flood test で作動証明） |
| 2 | candidate pool | **compute**: collector 出力→placement **入力直前** `capLifeOpsCandidatePool` | 同上（deadline 不滅+lane floor を chain で証明） |
| 3 | tier fitting | **compose**: per-tier fitting を `TIER_FITTING_CAP=5` で打ち切り→超過は **overflow へ**（`tier_fitting_cap` 理由コード）。urgency 順処理ゆえ **deadline が cap で落ちることは構造的に無い** | optional param（既定=5）で配線 |
| 4 | representative | briefing/moment 既存 ≤3 | 不変（assert のみ） |
| 5 | overflow summary | **compose**: overflow 配列の**保持** ≤ `OVERFLOW_RETAINED_CAP=5`・**総数は `overflowTotalCount`** で保持（line は総数を言う=嘘をつかない・配列は R4 素材として上位 5 件） | additive field（optional・compose が必ず設定） |

**cap の責務（再確認）**: 候補を消すことではなく、①爆発防止 ②deadline/protect 保護 ③push 早期死の防止 ④easy/push 差の保持 ⑤overflow の秘書的要約量 ⑥pool≠presentation の分離維持。
**観測可視化**: DTO `integrationMeta` に `rawDroppedCount`/`poolDroppedCount`（数のみ）を追加。

## 2. 実データ read-only source design（**設計のみ・接続しない**）

### 原則（全 source 共通）
- **推定しない**: calendar 文面からのカテゴリ/イベント推定は**行わない**（誤検出・PII 混入の主因）。読むのは**宣言・タグ・enum・日付**のみ。
- **column-restricted**: 既存 reader 流儀（title/location/raw を select しない）。候補は辞書/enum/数値のみ＝**構造的に PII を持てない**を維持。
- **unknown は沈黙**: phase/期日 unknown は候補を出さない（既存 L-2/deadline-engine の unknown 非候補化を維持）。
- **freshness/stale**: 各 observation に observedAt。cadence は 365 日超を stale（unknown 扱い）・deadline は過ぎたら overdue（既存）・event は過去日 drop。
- **confidence**: source 由来（user_declared > feedback_derived）。断定語彙は使わない（certainty high を作らない世界観を維持）。
- **cap 適用順**: reader limit → raw input cap → collector(dedup) → pool cap → placement(∞) → compose(tier/overflow cap) → display(≤3)。

### source 別設計
| source | 読む想定 | read-only 範囲 | 備考 |
|---|---|---|---|
| **cadence**（前回完了日） | ①将来の feedback「完了」（M1 `prm_learning_events` 流儀の lifeops 行）②onboarding の手動宣言（将来 UI gate） | owner-RLS・category/menu/completedAt のみ | **anchors からの推定はしない**（column-restricted で title 不読＝カテゴリ導出不能・意図的） |
| **upcoming events** | external_anchors の **明示タグ**（event_kind を user がタグ・**schema 追加=cross-track migration gate**） | owner-RLS・date/start/end/kind タグのみ | タグ実装まで **events は注入なし→event_prep 候補は出ない（honest absence）**。title 推定は恒久禁止 |
| **deadline**（免許/パスポート/税/支払い） | 専用小テーブル `lifeops_deadlines`（user_id, category_id, deadline_date・**migration gate**）or 設定画面の手動宣言 | owner-RLS・category_id+date のみ | 期日は最も宣言ベースが自然（年単位・推定不要） |
| **feedback**（完了/後で/不要/無反応） | **既存 M1 経路を再利用**（handle=lifeops key・action=accept/dismiss/later が schema 適合）。無反応=表示 log との突合（将来） | 既存 column-restricted M1 reader 再利用 | 完了→cadence 更新の源。write は別 gate |

### flag 設計（**実装は dormant・default OFF・consumer なし**）
`LIFEOPS_REALDATA_READONLY`（master）∧ per-source `LIFEOPS_CADENCE_READONLY` / `LIFEOPS_CALENDAR_EVENT_READONLY` / `LIFEOPS_DEADLINE_READONLY` / `LIFEOPS_FEEDBACK_READONLY`。
- 全て `=== "true"`・NEXT_PUBLIC なし・**master ∧ source の AND**・staging triple-guard 同型 + production hard block を読む側 wiring（将来）で必須。
- **本番 enable 前の観測条件**: staging read-only で ≥2 週間 / S 系 100% / cap 配線が実データ量で検証済 / 候補品質 Q ≥80% OK / CEO 承認。

## 3. 変更ファイル
compose（tier cap+overflowTotalCount）/ briefing（総数 line）/ compute（raw+pool cap 配線・meta counts）/ featureFlags（dormant 5 flags）/ tests（CEO checklist locks）/ dogfood-log（record 14=cap 前後比較）。R2/R4/R5 本体不変・既存 helper 経由の外科配線のみ。
