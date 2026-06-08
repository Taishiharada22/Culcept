# PRM Learning Event Insert Path Design（A1-7-13・**docs-only・実装しない**）

設計: `docs/prm-persistence-schema-design.md`（A1-7-5）/ `docs/prm-migration-readiness-plan.md`（A1-7-10）/ §10.11 M1 migration / §10.13（要約）
状態: **設計のみ**。**コード / migration 追加 / DB apply / local reset / Supabase apply / DB write / route / Home / PlanClient 接続 / persistence wrapper 実装 / production / env / remote / PR / M2 / M3 は一切しない**。

> 本書は「dry-run event（A1-7-0）↔ M1 `prm_learning_events`（A1-7-11）を繋ぐ insert path」を**いつ・どの層・どの guard で**書くかの設計。実装は最小 slice に分割し、route/DB は CEO 承認 gate まで停止。

---

## 1. insert される元イベント
- 起点: candidate action **accept / dismiss / later**（user 操作）。
- → `decideCandidateAction`（A1-6-0）= `CandidateActionOutcome`（status 遷移 + plan 反映意図・既存）。
- → `toDryRunLearningEvent(ctx, action, actedAtISO?)`（A1-7-0）= **`DryRunLearningEvent`**（非断定・文脈付き・redacted）。
- **insert する実体 = `DryRunLearningEvent`**。**dry-run（dev-report）と live persistence が同一 helper・同一 event 形**＝乖離なし（dry-run 検証が live を検証する）。
- M1 の列にあるのは action / signal / handle / context（date·band·confidence·duration·source）/ acted_at のみ。event の hypotheses/certainty は **保存しない**（派生・M1 に列なし）。

## 2. insert の候補タイミング（比較）
| 候補 | 内容 | 評価 |
|---|---|---|
| **(a) action route 直後** | candidate-action route（A1-6-6）が status 更新成功**後**に fire | ✅ **最小安全**: action + 候補 context（seed lookup 済）+ 時刻が揃う・1 action=1 fire |
| (b) reflection 時 | morning serve（serve-time）で reflect 時に fire | ❌ **read path に write**（serve は read-only）・毎 serve fire で per-action でない |
| (c) background/sweep | cron が plan_seeds status から逆生成 | ❌ plan_seeds は**現在 status のみ**（later/timing を再構成不能・event を完全復元できない） |

→ **(a) action route 直後** が最小安全。

## 3. 推奨設計（段階的・user action を壊さない）
- **まず route には fire を配線しない**（第一段階: mapper + repository[fake] のみ作り検証。route は触らない）。
- event は **dry-run helper（`toDryRunLearningEvent`）で作る**（既存・A1-7-0）。
- **将来 flag ON 時だけ** repository に insert（flag off=insert 0・既存挙動完全不変）。
- **failure 扱い**:
  - **insert は fire-and-forget / fail-open**: insert 失敗が **user の accept/dismiss/later を壊さない**（action route の主責務=status 更新は必ず成功・event insert は best-effort・失敗は飲み込み + count/status log のみ）。**retry しない**（duplicate 防止）。
  - **privacy は構造的 fail-closed**: mapper が raw/seedRef を**生成不能**（列が存在しない）ゆえ leak 経路がない（runtime guard 不要）。

## 4. repository / adapter 設計
- **pure mapper**: `DryRunLearningEvent → LearningEventInsertRow`（M1 列のみ・pure・no-DB）。raw/seedRef を持てない型。
- **repository interface**: `LearningEventRepository { insert(rows): Promise<{ inserted: number; ok: boolean }> }`（注入・testable・raw を返さない）。
- **fake repository**: in-memory（test 用）。mapper + fire-and-forget の配線を実 DB なしで検証。
- **Supabase implementation**: 後続 slice（user-RLS client で `prm_learning_events` に insert・server-only・本設計では作らない）。

## 5. RLS / user_id / handle / raw 非保存
- insert は **user-RLS client（auth user・anon JWT）**。`user_id = auth.uid()`（M1 の INSERT policy が強制）・**service_role 不使用**。
- `handle` は opaque（一方向 hash・seedRef でない）。
- **raw / seedRef / 発話本文は insert row 型に存在しない**（mapper が構造的に落とす・M1 列にもない）。

## 6. idempotency / duplicate 防止
- M1 は append-only（id PK 以外 unique なし）。同一 action の重複 insert を防ぐ:
  - **fire-once + no-retry**（fire-and-forget ゆえ retry-duplicate なし）。1 action route 呼び出し=1 fire。
  - `handle + action + acted_at` が action を一意識別。再 action（dismiss→accept）は acted_at 異なり**別 event（正しい）**。
  - **将来オプション**: M1 に `UNIQUE(user_id, handle, action, acted_at)` + `ON CONFLICT DO NOTHING`（exact 再 fire を冪等化）。現 M1 にはなし＝**M1 migration 追記が要る**（別 GO・本設計では追加しない）。

## 7. flag 設計
- 新 flag（例 `realityLearningEventWrite` / env `REALITY_LEARNING_EVENT_WRITE`・**server-side・default off**）。
- **local/staging only**（ON は local/staging のみ）。**production は OFF + 既存 production hard block**。
- flag off → insert 0・既存挙動完全不変（`if (!flag) return` で同一参照）。

## 8. observability
- **raw / seedRef を出さない**。log/metric は **count / status のみ**（"inserted N" / "insert failed"・event 詳細を出さない）。
- 既存 reality observability（admin dashboard・analytics）と同方針（redacted）。

## 9. rollback / disable 方針
- **disable**: flag off → insert 即停止（diff 0・既存不変）。
- **rollback**: flag off +（必要なら）M1 revert（DROP TABLE）→ data 消去。table は flag-gated ゆえ drop で flag-off 挙動に戻るだけ。
- **完全可逆**: insert は additive・既存 path 不依存・flag で即無効化。

## 10. 実装に進む場合の最小 slice（順序）
| # | slice | 範囲 | 自律可否 |
|---|---|---|---|
| 1 | **mapper**（pure: event→insert row）+ unit test | pure・no-DB | ✅ 自律 |
| 2 | **repository interface + fake repository + fake tests** | pure・no-DB | ✅ 自律 |
| 3 | **Supabase repository**（real insert・server-only・未配線） | persistence wrapper | 🛑 CEO 承認（persistence 実装） |
| 4 | **route connection**（action route で flag-gated fire-and-forget） | route 実装 | 🛑 CEO 承認（route + Home 近接） |
| 5 | **DB apply**（M1 migration を remote へ） | DB apply | 🛑 CEO 承認（remote apply・local smoke 後） |

- **順序根拠**: 1→2 で write path を**実 DB なしで構築+検証**→3 で real impl（未配線）→4 で配線（flag off で不変）→5 で apply。**write が動く前に全 logic を fake で検証**＝最小 risk。
- slice 1-2 は autonomous（pure）。3-5 は gate（persistence/route/DB）。

## 11. しない（A1-7-13 の境界）
コード / migration 追加 / DB apply / local reset / Supabase apply / DB write / route / Home / PlanClient 接続 / persistence wrapper 実装 / production / env / remote / PR / M2 / M3。
