# RO P4 — Persistence Readiness（DB apply 前・readiness のみ）

**前提（CEO 2026-06-23）**: 本作業は **production に行かない**。DB apply / Supabase remote / SQL 実行 / migration 昇格 / real user assets / deploy は **一切しない**。
実装は **local-only / pure / fixture / docs** に限定。実 INSERT を「準備（contract / dry-run / projection / RLS gap）」まで揃えるのが目的。

関連: `docs/reality-os-canonical-task-db-open-decisions.md`（13 裁定・2026-06-21）/ P5 = `docs/reality-os-p5-asset-adapter-readiness.md`（asset adapter）。

---

## 1. read-only 調査結果（このセッションで確認した persistence 候補の現状）

| 候補 | kernel/型 の状態 | DB の状態（read-only） | 分類 |
|---|---|---|---|
| **canonical_tasks** | `CanonicalTaskV0`（kernel 正本・実在） | migration **0件**（grep ヒットなし）・`database.types` 不在・sql.draft は本 branch 不在 | **保存すべき**（P4 で mapper 実装） |
| **prediction ledger** | `PredictionLedger` 型のみ（runtime あり P2-1・**型のみ・schema 未設計**） | schema なし | 保存候補（schema 未設計＝例外台帳） |
| **correction / user feedback** | `correctionGradient`（pure・signal）/ 既存 `prm_learning_events` 系 | 既存 feedback table は別ドメイン | 既存系に委譲 or 別 GO |
| **night check** | `gradeNightCheck`（既存・本セッション不触） | 既存 dayState 系に従う | 既存に委譲（本 P4 不触） |
| **dayState / MomentState** | `deriveMomentState`/`MomentSnapshot`（pure・導出物） | — | **保存しない**（導出物・再計算可能） |
| **reality pipeline surface snapshot** | `RealityOsSurfaceV0`（redacted display 前段） | — | **保存しない**（揮発・redacted VM は永続化対象外） |
| **plan events / anchors** | `ExternalAnchor`（calendar 由来） | 既存 calendar/plan_anchors 系 | 既存系に委譲（canonical task の上流・本 P4 不触） |

→ 本 P4 が新規 contract を作る対象は **canonical_tasks のみ**。他は (a) 既存系へ委譲 / (b) 導出物ゆえ非保存 / (c) schema 未設計ゆえ例外台帳。

---

## 2. 実装したか / docs-only か / 保留したか

- **canonical_tasks persistence projection + dry-run validator = 実装**（pure・DB 不触）
- 他候補 = **docs（分類）+ 例外台帳**（schema 未設計 or 既存委譲 or 非保存）

---

## 3. 実装ファイル / docs

| 種別 | path |
|---|---|
| 実装（pure mapper + dry-run） | `lib/plan/realityPipeline/canonicalTaskRow.ts` |
| test | `tests/unit/canonicalTaskRow.test.ts` |
| docs（本書） | `docs/reality-os-p4-persistence-readiness.md` |

---

## 4. persistence contract の入力 / 出力

- **入力**: `CanonicalTaskV0`（kernel 正本）+ `{ userId, sourceKind, archivedAt? }`
- **出力（projection）**: `CanonicalTaskRowV0` = INSERT 行の形（snake_case・naive `due_time`・recurrence jsonb・`_source_parent_id` 一時列・`archived_at`）。
  - **DB 生成値（id / created_at / updated_at / 解決後 parent_id）は含めない**＝捏造しない（生成は DB 側）。
- **dry-run**: `canonicalTaskRowDryRunViolations(row): string[]`（空=適合）。検出: `user_id_missing`（RLS owner key）/ `source_kind_invalid`（CHECK）/ `source_task_id_missing`（UNIQUE 構成）/ `text_empty` / `completed_without_completed_at` / `completed_at_without_completed` / `carry_count_negative` / `due_time_format` / `due_date_format` / `carried_from_format` / `self_parent`。

---

## 5. 保存候補 / 非保存候補 / production-only

| 区分 | 項目 |
|---|---|
| **保存する** | canonical_tasks（text/completed/completed_at/carried_from/carry_count/due_date/due_time/recurrence定義/motivation/completion_feel/tags/parent_id/added_at/archived_at）。motivation/completion_feel は**深層観測素材**として保存（surface 露出は presenter で既に遮断＝保存と露出は別層） |
| **保存しない** | MomentSnapshot/dayState 等の**導出物**（再計算可能）・`RealityOsSurfaceV0`（揮発 redacted VM）・raw evidence / graph / ledgerRefs（redaction 対象） |
| **production-only（例外台帳 §6）** | 実 migration 昇格・実 INSERT batch・RLS 実適用・staging dry-run 11 step・prediction ledger schema 設計 |

---

## 6. RLS / schema / migration gap（read-only・例外台帳）

| gap | 現状 | 解消（production-only・CEO GO + 別 session） |
|---|---|---|
| migration 不在 | `supabase/migrations` に canonical_tasks **0件**・sql.draft も本 branch 不在 | sql.draft 起こし → `<ts>_canonical_tasks.sql` 昇格（open-decisions §10-(1)・CEO GO 後） |
| `database.types` 不在 | canonical_tasks 型なし | migration 後に型再生成 |
| RLS 未適用 | owner-only 4 policy（`auth.uid()=user_id`）未適用 | staging で CREATE+RLS+trigger（§10-(2)）→ RLS smoke 3 ケース（§11: 自分 read 可 / 他者 reject / production-url reject） |
| dedup / dangling 未実証 | UNIQUE(user_id,source_kind,source_task_id) / parentId two-pass 未実証 | staging dry-run（§10 step 5-7） |
| service_role 不使用 | owner batch 前提（§6） | migration runner も owner 文脈・service_role/SECURITY DEFINER 不使用を厳守 |

**dry-run helper（本 P4 実装）が埋めた gap**: 行が staging に到達する**前**の self-check（CHECK / owner key / completed 整合 / 形式 / self-parent）を pure に実証 → staging dry-run §10 の前段を local で先取り。

---

## 7. live-only / production-only 例外（例外台帳 addendum）

- 実 migration 昇格・apply・INSERT・RLS 適用・staging dry-run（§10 全 11 step）・rollback rehearsal（§12）・production apply gate（§13）= **すべて production-only・CEO GO + 別 session**。
- prediction ledger / correction の DB schema = **未設計**（型のみ）→ 設計自体が別 GO。
- 本 P4 はこれらに**一切触れない**。flip-to-production の前提集合に追記するのみ。

---

## 8. dry-run / fixture で検証した範囲

- fixture `CanonicalTaskV0` → `toCanonicalTaskRow` → `canonicalTaskRowDryRunViolations` の往復を pure に検証。
- 検証ギャップ（= production-only）: **実 DB の UNIQUE/CHECK/RLS の実挙動**（local では契約 self-check のみ・実 constraint は staging でしか実証不可）。

---

## 9. tests結果

`tests/unit/canonicalTaskRow.test.ts` — **7 PASS**（projection / 適合 / completed整合 / RLS owner key + CHECK / two-pass + self-parent / soft archive / 形式）。

## 10. tsc baseline

**55 維持**（P4 起因 error 0）。

## 11. 非接続確認

DB apply / Supabase remote / SQL 実行 / migration 昇格 / API route / fetch / LLM / real user assets / production 接続 / persistence write — **すべてなし**。pure projection + dry-run + docs のみ。

## 12. 次（P6 ◎-readiness freeze）

P4 で「保存すべき行の形 + 適合 self-check」が揃った。flip-to-production の前提集合は有限に締まった:
**① flag 点火（PLAN_FLAGS）② asset live provider（P5 stub→実装）③ migration 昇格 + apply ④ staging dry-run 11 step ⑤ deploy** — 全 CEO GO。
P6 でこの 5 項目を 1 枚の例外台帳に集約し「これだけ flip すれば ◎」を freeze する準備が整った。
