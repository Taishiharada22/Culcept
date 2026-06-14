# T11-E Provider Seam Closeout + Roadmap Lock（CEO 2026-06-14 決裁）

**ステータス**: closeout + ロードマップ固定のみ・実装なし（docs-only）。
**根拠監査**: `docs/t11-honest-audit-2026-06-14.md`（Claude 自立監査・grep 実地確認）。

## §1 Provider Seam closeout（実装完了の確定）
| slice | 成果 | コミット |
|---|---|---|
| E-B/C | provider types + dev fixture provider + 検証 helper（realOnly は sources 由来・assertNoFixtureSource・fail-closed） | `d9133048` |
| E-D | dev-travel-engine-projection を provider-as-gate に配線（not_ready→engine 不実行・provenance server-only） | `b428cf99` |

→ **provider seam（input を供給 or 拒否・provenance 明示・real_only/fail-closed）は seam→preview まで貫通完了**。
許可 tier = **dev_fixture のみ**。実 tier は全 HOLD。

## §2 CEO ロードマップ固定（2026-06-14・AskUserQuestion 決裁「4→1→2」）
1. **(4 済) E Provider Seam Closeout**（本書）。
2. **(1 次) server session/intake provider 設計**（docs-only から）= 実ユーザー入力 → `TravelPlanEngineInput`。
   - provenance = [session_slots / user_intake]・real_only path・prerequisite 欠如で fail-closed。
   - M2 / route・weather・place は**この tier に含めない**（後続 tier）。本番配線なし・設計先行。
3. **(2 後) real entity retrieval 設計**（docs-only から）= ⭐ホテル/旅券/場所に **state を持たせ**、user 状態に近い entity を引き寄せる retrieval/source の広義設計。
   - 土台（Unified StateEntity / Fit Model）は実装済。欠けは「state 付き実 entity の供給層」。

## §3 HOLD 継続（各々独立 GO）
本番 `/plan` / M2-B-2 / route・weather・place API / itinerary DAG・solver / CoAlter runtime / useCoAlter / `/talk` /
send・realtime / booking・calendar / 予約リンク / persistence / staging・production・push / Turbopack root fix（別タスク）。

## §4 検証
- 最新: `b428cf99`(E-D)→`d9010568`(audit)。tsc baseline **55**・full suite **21127 passed / 1 skip / 0 fail**・travel-related test **473**・本番 `/plan` 不変・tree clean・push なし。

## §5 次アクション
**(1) server session/intake provider 設計（docs-only）** に進む。実装は設計 CEO/GPT 承認後。
