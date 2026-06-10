# Life Ops — A-4-c9 Feedback Write Contract / No-Production Writer Design

> 2026-06-11 / CEO・GPT 指示「write contract を設計・固定。UI 本線/production/自動 write 禁止・staging write smoke は**実行せず計画まで**」。
> **禁止**: UI/PlanClient/notification/production/外部 API/staging write smoke 実行/push/PR/merge。

---

## 1. Read-only audit（既存 M1 write 経路）

| # | 項目 | 結果 |
|---|---|---|
| 1 | write/action route | route 配線は**未**（A1-7 slice ④⑤ gate）。**writer repository は存在**: `supabase-prm-learning-event-repository.ts`（A1-7-16・server-only・**未配線**） |
| 2 | write column | `PrmLearningEventInsertRow`=handle/action/signal/desired_date/band/confidence_band/duration_min/source_kind/acted_at/captured_at/expires_at + repository が **user_id 付与** |
| 3 | 既存 action | `accept / dismiss / later`（M1 CHECK）→ signal `adoption / non_adoption / deferral`（既存 SIGNAL map） |
| 4 | await/fire | repository は **fail-open**（error→`{ok:false}`・throw しない）＝fire-and-forget 適合。route 設計（A1-7-13）も fire-and-forget・no-retry |
| 5 | RLS/auth | owner-RLS（insert policy `auth.uid()=user_id`）・repository が user_id を行に付与・service_role 不使用 |
| 6 | flag/production block | repository 自体は無垢（**呼ぶ側が gate 責務**）→ lifeops 側 gate でラップ（§5） |
| 7 | handle 規約 | plan-seed 側は opaque handle。**lifeops は c8 の `lifeops:{categoryId}[:{menu}]` namespace で構造分離**（衝突なし） |
| 8 | 既存への影響 | 別 namespace 行の追加のみ＝既存 M1 集計（dry-run 等）は handle 非依存 or 別経路。**読み側 c8 は prefix filter 済み**＝相互不干渉 |
| 9 | PII リスク | handle は enum builder からのみ生成（自由文経路なし）・他列 enum/日付 |
| 10 | duplicate/spam | DB に UNIQUE なし（M1 設計どおり app 層責務）→ **cooldown pure guard**（§4）+ fire-once 契約 |
| ★ | **blocker** | **`source_kind CHECK IN ('seed_explicit','correction')`** → lifeops 行（`source_kind='lifeops'`）は **CHECK 違反で実 write 不能**。'correction' 流用は意味の嘘で不可。→ **実 write の前提 = CHECK 拡張 migration（別 gate）** |

## 2. Handle / Row contract（read 側 c8 と完全一致）

- handle = `lifeOpsFeedbackHandle(categoryId, menu)`（c8 と同一 builder・**L-1 enum + menu enum のみ**・自由文/店舗名/URL/placeQuery 不可=経路が存在しない）。
- row: `{ handle, action, signal(map), desired_date:null, band:null, confidence_band:"high", duration_min:null, source_kind:"lifeops", acted_at(ISO・caller 注入), captured_at:null(DB now), expires_at:null(長期・done 移行時に再考) }`
  - confidence_band="high" = **明示的ユーザー操作の事実記録**（推論の certainty とは別物・M3 の high 禁止と矛盾しない）。

## 3. Action 規約（CEO 論点の確定）

| action | 意味（確定） | cadence 更新 |
|---|---|---|
| `accept` | **「候補を採用した」（intent）であり「やった/完了」ではない** | ❌ 正式には使わない |
| `dismiss` | 不要（将来 suppression 素材） | ❌ |
| `later` | 後で（保留） | ❌ |
| `done`（**将来**） | やった/完了（事実） | ✅ **唯一の正式ソース** |

- **done/completed と accept/adopt は分離する**（CEO 方針採用）。`done` は M1 action CHECK に無い → **CHECK 拡張 migration が必要**（★source_kind 拡張と**同一 migration に同梱**を提案: `action+='done'`・`signal+='completion'`・`source_kind+='lifeops'`）。
- それまでの c8 `feedbackToTentativeCadence(accept)` は **暫定 proxy（明示済み）**として維持し、**done 導入と同時に退役**（本 contract で固定）。

## 4. Duplicate / spam 防止
- pure guard `shouldWriteLifeOpsFeedback(recentWrites, intent, nowMs)`：**同一 handle×action が cooldown（既定 10 分）内 → 書かない**。
- 契約: 1 user-gesture = 1 write（fire-once・no-retry＝A1-7-13 と整合）・UNIQUE 追加は将来 migration 検討（M1 方針踏襲）。

## 5. Gate / flag
- 新 dormant flag **`LIFEOPS_FEEDBACK_WRITE`（default OFF）**を追加（read とは独立）。
- gate = `master(LIFEOPS_REALDATA_READONLY) ∧ write(LIFEOPS_FEEDBACK_WRITE) ∧ staging allowlist ∧ production deny`。
- writer（server-only）は **gate false → insert を呼ばず** `{written:false, reason:"gate_off"}`・cooldown 重複 → `"duplicate_cooldown"`・insert error → `"insert_failed"`（throw しない・user action を壊さない）。
- 既存 repository を**型ごと再利用しない理由**: `source_kind` の型 union（seed_explicit|correction）を `'lifeops'` で汚さないため、**同 pattern（fail-open・user_id 付与・insert のみ）の薄い専用 writer** を実装（table 名は既存定数を参照）。

## 6. Read 側との roundtrip
`buildLifeOpsFeedbackWriteRow(intent)` → （将来 DB）→ c8 `m1RowsToLifeOpsFeedback([row])` → **同一 observation**（handle/action/actedAt）— **test で恒久固定**（書いたものが読みで同じ意味に戻る）。

## 7. Staging write smoke — **本 slice では実行しない（計画のみ）**

**実行しない理由**: ①CEO 指示（design+fake tests 優先・勝手に実行しない）②**audit で CHECK 拡張 migration が前提と判明**（migration なしでは write が DB に拒否される＝smoke 不成立）。

**CEO GO に必要な条件（全て）**:
1. **migration gate**: `source_kind+='lifeops'`（+ 推奨: `action+='done'`/`signal+='completion'`）の CHECK 拡張を staging に apply（別 GO・revert 可能な additive CHECK 置換）。
2. staging（hjcr）・production deny・service_role fatal・GO env flag・dedicated test user（USER_A）。
3. write 対象 = **`lifeops:` handle 1 行のみ**・PII/自由文なし・既存 M1/Plan 行に不干渉。
4. **read-after-write**で c8 chain の `lifeops_prefix=1`/observations=1 を確認 → **cleanup（当該 1 行 delete）→ count 0**。
5. log は counts/boolean のみ。

## 8. 実装ファイル
pure `lifeops-feedback-write.ts`（intent/row builder/SIGNAL map/cooldown guard/gate）・server-only `lifeops-feedback-writer.ts`（gate-first・insert のみ・fail-open）・featureFlags（+1 dormant）・tests（roundtrip/gate/cooldown/fake-client query 数/source-contract）。

---

## 9. A-4-c12 1-row Write Smoke の action 整合（2026-06-11）

CEO 推奨は `action=done / signal=completion` だが、本 smoke は **`action=accept / signal=adoption / source_kind=lifeops`** で実施する。
- **理由①（contract）**: c9 writer の DTO は `accept|dismiss|later`（§3: `done` は cadence 正式ソースとして**将来 action**＝proxy 退役 slice で writer/reader 同時対応と契約済）。smoke の目的は **c9 writer の実 DB 検証**ゆえ writer の実契約で書くのが正。
- **理由②（決定的）**: c8 reader は現在 `done` を **drop する lock 済み**（c10）→ done で書くと read-after-write の `observations=1` が**構造的に達成不能**。
- **理由③**: c11 で解消した blocker は `source_kind='lifeops'` であり accept row で**確実に行使**される。`done/completion` の DDL 受理は c11 POST（constraint def）で証明済み＝insert での再証明は不要。
