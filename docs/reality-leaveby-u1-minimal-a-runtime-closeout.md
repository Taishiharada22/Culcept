# U1-minimal-A — Runtime / DB / Build Closeout（local 検証記録）

- 日付: 2026-06-15 / 位置づけ: U1-minimal 実装（`87b2f07b`）を正式受領可能にするための **local runtime / DB / build gate** を閉じる。CEO U1-minimal-A GO。
- 規律: **local のみ**。remote / staging / production には**一切触れていない**（apply/reset/connect なし）。コード変更なし（既存実装 + migration の検証のみ）。

---

## 0. local DB preflight 結果

| 項目 | 結果 |
|---|---|
| `supabase` CLI | 2.75.0 あり |
| Docker daemon | **停止中**（`supabase status` 不可・local Supabase stack なし） |
| local postgres container | なし |
| `.env.local` の Supabase | **remote のみ**（`*.supabase.co`）→ CEO 禁止につき**触れない** |
| Homebrew PostgreSQL | **16.11 あり**（initdb/postgres/pg_ctl/psql） |

→ local Supabase stack が無いため、**ephemeral な throwaway Postgres**（initdb→temp dir→socket-only・C locale）を立て、最小 harness（auth.uid stub + 基底 external_anchors/external_anchor_sources）+ migration を適用して SQL smoke を実施。**実データ・remote・Supabase project には一切接続せず**、検証後 ephemeral を破棄。

---

## 1. migration apply（ephemeral local のみ）

- 4 nullable 列 ADD（`ALTER ... ADD COLUMN IF NOT EXISTS`）✓
- 3 CHECK 制約 ADD（DO block 冪等）✓
- `create_external_anchor_bundle` CREATE OR REPLACE ✓
- `GRANT/REVOKE ... authenticated`（role 作成後）✓
- **再適用 idempotent**（NOTICE skipping・エラーなし）✓
- ※ remote / staging / production apply は **未実行**（CEO 承認事項）。

## 2. SQL smoke 結果（全 PASS）

| # | smoke | 結果 |
|---|---|---|
| A | 4 列存在（information_schema） | ✓ start_time_source/is_all_day_placeholder/timezone_of_record/start_time_provenance_recorded_at |
| B | 3 CHECK 制約存在（pg_constraint） | ✓ enum / allday / imported_exact_tz |
| C1 | NULL start_time_source INSERT | ✓ SUCCEED（legacy/fail-closed） |
| C2 | user_explicit + 非 allday INSERT | ✓ SUCCEED |
| C3 | enum garbage | ✓ FAIL（`..._start_time_source_chk`） |
| C4 | imported_exact + allday + tzid NULL | ✓ FAIL（tzid chk が先に発火・reject 成立） |
| C4b | imported_exact + allday + tzid あり | ✓ FAIL（`..._start_time_allday_chk` 単独で発火 = allday 制約が独立に効く） |
| C5 | imported_exact + tzid NULL | ✓ FAIL（`..._imported_exact_tz_chk`） |
| D1 | RPC imported_exact timed+tzid | ✓ start_time_source=imported_exact / timezone_of_record=Asia/Tokyo を格納 |
| D2 | RPC recorded_at（exact） | ✓ NOT NULL（作成時は confirmed_at と同値だが**別列**・意味は §下記） |
| D3 | RPC unknown | ✓ recorded_at NULL（confirmed_at は常に set ⇒ 列として分離が成立） |
| D4 | RPC all-day | ✓ assumed_default + is_all_day_placeholder=true（CHECK 違反なし） |
| E | legacy NULL 行 read | ✓ NULL を返す（app 層 `coerceStartTimeSource` で unknown 化） |

**recorded_at と confirmed_at の分離**: 作成時刻が同じため**値は一致**するが、**別列**であり、`unknown` では recorded_at=NULL / confirmed_at=set と**挙動が分岐**（D2/D3）。これが CEO の要求した「confirmed_at とは別」の実証。

## 3. TS-side（既存 unit + tsc + lint）

- **anchorStartTimeProvenance 18/18 PASS**（manual typed/prefill/template→unknown/ICS all-day/timed tzid/floating/両経路一致/recorded_at/NULL→unknown/CHECK 意味/SANITIZED/thread）。
- full unit suite **20934 passed + baseline unrelated FAIL 2**。
- **tsc total 55**（baseline・my files 0）。
- **eslint（touched files）0 errors**（1 warning は `e403f504` 由来の既存 unused eslint-disable・本 slice 起因でない）。

## 4. build 結果 + BX0 要否判断

- `npm run build` → **`FATAL ERROR: JavaScript heap out of memory`**（"Creating an optimized production build" フェーズ・8GB RAM 物理限界）。**型/コードエラーではない**（tsc 55・lint 0 error）。
- これは **全 app webpack の whole-build OOM** で、**本 slice 固有でなく全 build 共通**の環境制約。
- **BX0 判断: 必要（要）**。product route / form / write path を触る slice を **build-verified で正式受領**するには、build メモリ remediation（BX0）が要る。候補（各々別 slice・CEO 承認）: (a) `next.config` の webpack memory 調整 / (b) 高 RAM 環境で build / (c) NODE_OPTIONS + swap / (d) turbopack build。
- **`next.config` は本 slice で変更しない**（CEO ルール）。config 変更が要るなら BX0 として別 slice で停止。

---

## 5. 結論

- **runtime / DB gate は閉じた**（migration apply 冪等・4 列・3 CHECK 実効・RPC 両経路整合・legacy NULL→unknown・recorded_at 分離、全て ephemeral local で実証）。
- **build gate は開いたまま**（whole-app webpack OOM・環境制約）→ **BX0 が前提**（CEO 判断）。
- remote / production には一切触れていない。production gate 未通過。
