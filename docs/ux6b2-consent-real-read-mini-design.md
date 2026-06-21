# UX-6b-2-prep — consent / privacy / real read caller 設計（docs-only）

- **日付**: 2026-06-21 / **担当**: Build Unit（設計）/ **承認待ち**: CEO
- **種別**: **docs-only 設計**（real read しない・DB/Supabase/staging re-link/SQL/migration なし）
- **前提**: UX-6b-1（`8e95316f2`）で snapshotReader/derive/engineOnly を **dormant** 取込済み・`travelPersonalizationRealRead`(OFF)・caller 未配線。
- **正本**: snapshotReader は `stargazer_axis_snapshots`/`stargazer_alter_growth`（既存・RLS owner-only `auth.uid()=user_id`）を user-RLS client で read。継手 = snapshot → `derive`(derivePlanParams/deriveTravelTraits) → `mapPersonalizationToM2SoftPreference` → adapter softPersonalization。

---

## 1. consent 設計（personality → travel 利用同意）

### 最小 UI / 状態
- **トグル1つ**: 「あなたの性格傾向を旅行プランに反映する」（既定 **OFF**）。場所は dev preview（`/plan/dev-travel-personalization`）→ 将来は /plan travel 文脈 or マイページ。
- 状態: `granted: boolean` + `grantedAt: ISO` + `scope: "solo"`（companions は別 consent・HOLD）。
- **明示 opt-in のみ**（既定 OFF・暗黙 ON 禁止）。撤回（OFF 化）で即 no-op。

### consent 保存先（CEO 2）
| 案 | 内容 | フェーズ |
|---|---|---|
| **(A) local-only（推奨・6b-2 開始点）** | `localStorage` versioned key `plan_travel_personalization_consent_v0`（shared style domain と同パターン）。**DB 不要**・端末内・撤回容易 | 6b-2a |
| (B) 新規テーブル | `travel_personalization_consent`(user_id, granted, granted_at, scope・**RLS owner-only**) | production（別フェーズ・要 migration GO） |
- → **local-only で始められる**（CEO 2 の答え＝Yes）。production 永続は (B)（別 migration ゲート）。

### consent OFF で完全 no-op（CEO 3）
```
realPersonalization = travelPersonalizationRealRead(flag,OFF)
                   && consentGranted(local or DB)        // OFF なら false
                   && mode === "solo"
realPersonalization === false → snapshotReader を呼ばない → softPersonalization 渡さない
                              → adapter は byte 等価（UX-6a の no-op 経路そのまま）
```
consent OFF → **snapshotReader 不実行・fixture preview のみ・DB 接続ゼロ**。

### consent ON でも solo/self 限定（CEO 4）
- `getPersonalizationSnapshot(supabase, asOf)` は**自 user のみ**（RLS owner-only で構造保証）。
- `mode: "solo"` 固定。pair 経路（pairEngineReader）は**呼ばない**（未取込・HOLD）。

## 2. privacy 設計
- **自 user の axis のみ**（RLS owner-only `auth.uid()=user_id`・cross-user 構造不可）
- **service_role 厳禁**（`supabaseServer()` = cookie auth user-RLS client のみ・`supabaseAdmin` 不使用）
- **raw axis score 非漏洩**: m2-soft-preference が descriptor 語のみ産出（raw score / budget / hard key 非産出・visibility=private）— UX-6a で test 済み
- **companions HOLD**（CEO 5）: pair の相手データ・fairness は別 privacy レイヤー・今回スコープ外

## 3. real read caller 案（CEO 6）
- **client**: `supabaseServer()`（`lib/supabase/server.ts` L30・`createServerClient`・cookie auth）= **user-RLS client**。day-state-hints route と同 pattern。**service_role を絶対渡さない**。
- **場所候補**:
  | 候補 | 評価 |
  |---|---|
  | **(i) server component（dev page real 版・推奨）** | dev preview を real 版に拡張（flag+consent gate）。最小・本番 /plan 非接触 |
  | (ii) 専用 GET route（`/api/plan/travel-personalization`） | day-state-hints と同型・bounded read・fail-open。将来 /plan 本接続時に有用 |
- **caller skeleton（6b-2a で flag OFF＝no-op）**:
```ts
const supabase = await supabaseServer();              // user-RLS（service_role 厳禁）
const { data: auth } = await supabase.auth.getUser();
if (!auth?.user || !PLAN_FLAGS.travelPersonalizationRealRead || !consentGranted)
  return /* fixture / no softPersonalization */;      // ← 6b-2a は常にここ（flag OFF）
const snap = await getPersonalizationSnapshot(supabase, asOf);  // user-RLS read（6b-2b）
const soft = mapPersonalizationToM2SoftPreference(derivePlanParams(snap), deriveTravelTraits(snap));
// adapter に soft 注入（注入時のみ enrich・absent なら byte 等価）
```

## 4. flag 設計（CEO 7, 11）
| flag | env | 役割 | default |
|---|---|---|---|
| `travelPersonalizationPreview` | PLAN_TRAVEL_PERSONALIZATION_PREVIEW | fixture preview（UX-6a） | OFF |
| `travelPersonalizationRealRead` | PLAN_TRAVEL_PERSONALIZATION_REAL_READ | real snapshot read gate（**UX-6b-1 既存**・server-only） | OFF |
| consent state | （local key / 将来 DB） | ユーザー同意 | OFF |
| **`travelPersonalizationProd`（新規・別 GO）** | PLAN_TRAVEL_PERSONALIZATION_PROD | production enable | OFF |
- **`PLAN_TRAVEL_PERSONALIZATION_REAL_READ` の意味**（CEO 7）: 「real snapshotReader を呼んでよい」という server gate。**caller がこの flag ∧ consent ∧ solo を AND して初めて read**。単独では何もしない（caller 未配線なら no-op）。
- **production enable 分離**（CEO 11）: real read を staging で検証 → 本番は `travelPersonalizationProd`（別 GO）で。staging（real read 検証）と production（公開）を別 flag に分離。

## 5. staging re-link 手順 + 二重確認（CEO 9）
```
# 現状確認（🔴 production link 中なら絶対 DB 作業しない）
cat supabase/.temp/project-ref     # → aljavfujeqcwnqryjmhl（production）なら STOP
# CEO 承認後のみ:
supabase link --project-ref hjcrvndumgiovyfdacwc   # staging へ re-link
# 二重確認:
cat supabase/.temp/project-ref     # → hjcrvndumgiovyfdacwc（staging）であることを目視
```
- 二重確認項目: ① re-link 前に production ref を確認し記録 ② re-link 後に staging ref を確認 ③ DB 操作は staging ref 確認後のみ ④ 作業後 production へ戻すか CEO 判断

## 6. staging read-only 検証 + RLS 確認手順（CEO 8, 10）
re-link（staging）後、**read-only SQL のみ**（write/migration なし）:
```sql
-- テーブル存在
select count(*) from stargazer_axis_snapshots limit 1;
select count(*) from stargazer_alter_growth limit 1;
-- RLS 有効
select relrowsecurity from pg_class where relname='stargazer_axis_snapshots';  -- t 期待
-- owner-only policy
select policyname, cmd, qual from pg_policies where tablename='stargazer_axis_snapshots';
--   → SELECT policy が USING (auth.uid() = user_id) であること
```

## 7. UX-6b-2 実装 scope 案（CEO 12）
| 段階 | 内容 | DB |
|---|---|---|
| **6b-2a（code-only・DB 不触）** | consent UI/state(local) + caller skeleton（flag+consent+solo gate・**flag OFF で常に no-op**）+ test（consent OFF→no-op / gate AND） | 不触 ✅ |
| **6b-2b（staging DB gate・CEO承認後）** | staging re-link（§5）→ RLS/テーブル read-only 確認（§6）→ flag+consent ON で real read 検証（solo・staging のみ） | staging read |
| **6b-2c（production）** | `travelPersonalizationProd` + DB consent table(B) + 本番公開（別 GO） | prod |

## 8. DB gate が必要な箇所
- **6b-2b のみ**（staging re-link + real snapshotReader 実行 + RLS 確認）。6b-2a は完全に code-only・DB 不触。
- production consent table(B) と本番公開は 6b-2c（別 migration + CEO GO）。

---

## 付録 — 参照
- UX-6b-1: `8e95316f2`（snapshotReader/derive/engineOnly dormant）
- user-RLS: `lib/supabase/server.ts` supabaseServer / caller pattern: `app/api/plan/day-state-hints/route.ts`
- RLS 正本: `supabase/migrations/20260307170000_stargazer_continuous.sql`（axis_snapshots owner-only）
- consent local パターン: `lib/shared/`（shared style domain・local-only 正本）
