# CoAlter Integration Preflight + logic branch freeze（docs-only）

> **preflight + freeze。main へ直接統合しない・whole branch merge しない。** 実際の統合は別 CEO gate。
> 基準: local main `bcf84157c`
> logic branch: `claude/coalter-logic-resume-20260621` @ `ac53e58b5`（freeze）/ backup `origin/backup/coalter-logic-resume-c5erender-ac53e58b5`
> UI/design branch: `claude/coalter-ui-overlay-redesign` @ `ab64c8497`（practical-diffie worktree）

作成: 2026-06-21 / Build Unit / 承認待ち: CEO（統合順序 + 停止条件）

## 0. logic branch freeze（統合候補）
CoAlter logic 成果を `ac53e58b5` で freeze: C2 read 実機 / C3 participant write 実機 / C5-E 非永続 preview（code/test/smoke/UI render）すべて PASS。**A 永続化 / coalter insert policy / `author_kind='coalter'` DB insert は未実装**。tsc 55・coalter 53 tests PASS。

---

## 1. logic branch の取り込み対象 path（26・main 差分）

**C5-E + brain core（保持必須）**:
- `lib/coalter/preview/brainPreviewCore.ts` / `newSessionTurnAdapter.ts`（C4 脳 pure core・adapter）
- `app/api/coalter/_lib/coalterPreviewHandler.ts`（preview handler・read→brain→preview・保存なし）
- `app/api/coalter/sessions/[sessionId]/preview/route.ts`（GET only）
- `app/(culcept)/plan/coalter-runtime/coalterPreviewClient.ts` / `useCoAlterPreview.ts`（runtime・hook）
- `app/(culcept)/plan/tabs/coalter/CoAlterPreviewBlock.tsx`（抽出 UI component）
- `app/(culcept)/plan/dev-coalter-brain-preview/page.tsx`（C4 fixture dev preview）
- `lib/plan/featureFlags.ts`（**C5-E flag 分離: `coalterBrainPreview`[server] + `coalterBrainPreviewClient`[NEXT_PUBLIC] + `planCoAlterBrainPreviewEnabled()`**）
- `app/(culcept)/plan/tabs/coalter/CoAlterTab.tsx`（**C5-E 追加・overlap・§3**）
- tests: `coalterBrainPreview.test.ts` / `coalterPreview.test.ts` / `coalterPreviewBlock.test.tsx`

**migration**:
- `supabase/migrations/20260613120000_plan_coalter_session_messages.sql`（**CoAlter 自身・C1・取り込む**）
- `supabase/migrations/20260615100000_external_anchors_start_time_provenance.sql`（**RO/xenodochial 由来・§6 取り込まない**）
- `supabase/migrations/20260616100000_duration_confirmations.sql`（**RO/xenodochial 由来・§6 取り込まない**）

**docs**: `docs/coalter-*.md`（C0/C2/C3/C5 設計・結果・本書）。

---

## 2. UI/design branch の取り込み対象 path（13・main 差分）

**UI 新規/変更（見た目）**:
- 新規: `CoAlterBackdrop.tsx` / `CoAlterPlanOverlay.tsx` / `coalterHomeFixture.ts`
- 変更: `CoAlterChatPanel.tsx` / `CoAlterHome.tsx` / `PlanIntelligencePanel.tsx`
- 変更: `CoAlterTab.tsx`（**overlay redesign・overlap・§3**）
- dev: `app/(dev)/coalter-ui-preview/page.tsx`
- tests: `coalterPlanOverlay.test.tsx` / `coalterLiveWiring.test.tsx`

**infra（dev-only・production-safe）**:
- `next.config.js`（`TURBOPACK_ROOT` env 上書き・default 不変）
- `proxy.ts`（`/coalter-ui-preview` を **NODE_ENV!=="production" の時のみ** public・production 不変）

**取り込まない**: `.claude/launch.json`（§6・commit 禁止）。

---

## 3. 衝突 path（唯一）

**`app/(culcept)/plan/tabs/coalter/CoAlterTab.tsx` のみ**（両 branch が main から変更）。
- logic 側 C5-E 追加（localized・3 箇所）:
  1. import: `useCoAlterPreview` + `CoAlterPreviewBlock`
  2. hook: `const coalterPreview = useCoAlterPreview({ enabled: PLAN_FLAGS.coalterBrainPreviewClient, sessionId: ... })`（bodySelection の後）
  3. render: `<CoAlterPreviewBlock enabled={PLAN_FLAGS.coalterBrainPreviewClient} state=... preview=... onGenerate=... />`（planCollapsed チップの後・absolute）
- UI 側 overlay redesign（CoAlterPlanOverlay/Backdrop 配線・home/talk 表示変更）。
→ **3-way 手動マージ**で **両方**を保持（C5-E を UI 差分で上書きしない・§6 厳守）。
- それ以外の 38 path（logic 25 + UI 12）は **非重複＝自動で両立**。**C5-E flag/route/handler/hook/preview component/tests は UI と一切衝突しない**＝保持は自動。

---

## 4. C5-E で保持すべき必須変更（上書き厳禁）

1. **flag 分離**: `featureFlags.ts` の `coalterBrainPreview`（server・route gate）と `coalterBrainPreviewClient`（NEXT_PUBLIC・client UI gate）の **2 軸**。`planCoAlterBrainPreviewEnabled()` helper。両 default OFF。
2. **preview 経路**: `coalterPreviewHandler.ts`（保存なし・read→brain）/ `preview/route.ts`（GET only）/ `coalterPreviewClient.ts`（GET・body 送らない）/ `useCoAlterPreview.ts`（ephemeral）。
3. **`CoAlterPreviewBlock.tsx`** + CoAlterTab の3箇所配線（§3）。
4. **brain core**: `brainPreviewCore.ts` / `newSessionTurnAdapter.ts`。
5. **migration**: `20260613120000`（CoAlter session tables）。
6. **tests**: `coalterPreview` / `coalterBrainPreview` / `coalterPreviewBlock`。
→ これらは UI branch が触らない（CoAlterTab を除く）ため、**path 単位取り込みで自動保持**。CoAlterTab だけ手動で C5-E 3箇所を残す。

---

## 5. UI/design 側で取り込んでよい変更（見た目差分のみ）

- `CoAlterBackdrop` / `CoAlterPlanOverlay` / `coalterHomeFixture`（新規 UI）
- `CoAlterChatPanel` / `CoAlterHome` / `PlanIntelligencePanel`（見た目変更）
- `app/(dev)/coalter-ui-preview/page.tsx`（dev preview）
- `next.config.js` / `proxy.ts`（dev-only・production-safe・任意）
- tests `coalterPlanOverlay` / `coalterLiveWiring`
- CoAlterTab の overlay redesign 部分（C5-E と共存・§3）

---

## 6. 取り込まない変更

- **`supabase/migrations/20260615100000` / `20260616100000`**（RO/xenodochial 由来・CoAlter のものでない）。
  logic branch は C2-a-unblock で staging 整合のため file-restore したが、**main 統合は RO/xenodochial の所掌**。
  CoAlter 統合で smuggle しない。RO 側が未統合なら **CoAlter 統合からは除外**し、別途調整（同一 commit 由来＝内容一致のはず）。
- `.claude/launch.json`（UI branch・commit 禁止）。
- `node_modules` / `.env.local`（commit 禁止・本 worktree の symlink は smoke 後削除済）。
- **logic 側 C5-E を UI 差分で上書きすること**（§4 厳禁）。

---

## 7. 推奨統合順序

**Phase A: UI/design 先 → Phase B: CoAlter logic（C5-E）後**（C5-E を最後に乗せ上書き事故を構造的に排除）:
- **Phase A（UI/design・path 単位）**: §5 の UI path を main へ。CoAlterTab は overlay redesign を反映。`.claude/launch.json` 除外。tsc 55 + coalter tests 確認。
- **Phase B（CoAlter logic・path 単位）**: §1 の logic path（**drift 2本 migration 除く**）を main へ。非 CoAlterTab は非重複で clean。**CoAlterTab は Phase A の結果に C5-E 3箇所（§3）を追記**（import/hook/block・client flag gate）。flag/route/handler/hook/preview component/migration/tests は独立 land。
- 各 Phase 後に **tsc 55 + coalter tests + 既存 plan tests** を確認。
- ★ いずれも **path 単位（whole branch merge 禁止）**・main 直 push しない（CEO 統合 worktree で実施）。

（代替: logic 先でも可。その場合 UI の CoAlterTab マージで C5-E 3箇所を必ず残す。CEO 判断。）

---

## 8. 必要な tests / tsc / smoke

- **tsc**: 各 Phase 後 `npx tsc --noEmit` = **55**（baseline）。
- **tests**: coalter 全（logic 53 + UI の coalterPlanOverlay/coalterLiveWiring）+ 既存 plan tests 退化なし。
- **smoke（任意・gate 後）**: C5-E preview route 401（auth gate）+ DB 行数不変（write なし）は logic 側で実証済。UI は coalter-ui-preview dev page で目視可（非 production）。
- **DB**: 統合は code/path のみ。**migration apply / staging / seed は別 gate**（20260613120000 の staging は C2-a で適用済・production 未適用）。

---

## 9. main 統合 GO 前の停止条件

1. **whole branch merge をしない**（path 単位のみ）。**main 直 push / origin push しない**（CEO 統合 worktree で実施）。
2. **C5-E 必須変更（§4）を 1 つも落とさない/上書きしない**（特に flag 2 軸 + CoAlterTab 3箇所）。
3. **drift 2本 migration（20260615/16）を CoAlter 統合に含めない**（RO/xenodochial 所掌・別調整）。
4. `.claude/launch.json` / `node_modules` / `.env.local` を commit しない。
5. 各 Phase 後 tsc 55 + coalter/plan tests 退化なし。
6. A 永続化 / coalter insert policy / `author_kind='coalter'` DB insert / service_role / SECURITY DEFINER は**この統合に含めない**（未実装のまま）。
7. production deploy / Supabase db push / migration apply は別 gate（統合は code のみ）。

---

## 報告（CEO 向け要点）

1. **logic 取り込み path**: §1（C5-E + brain + preview route/handler/runtime/hook/component + featureFlags + CoAlterTab + 20260613120000 migration + tests + docs）。
2. **UI/design 取り込み path**: §2（Backdrop/Overlay/Home/ChatPanel/PlanIntelligencePanel/coalterHomeFixture + dev preview + next.config/proxy + tests）。
3. **衝突 path**: **`CoAlterTab.tsx` 1 件のみ**（他 38 path 非重複）。
4. **C5-E 保持必須**: flag 2 軸 + preview route/handler/runtime/hook/component + brain core + 20260613120000 + tests（§4）。
5. **UI 取り込み可**: 見た目差分 + dev-only infra（§5）。
6. **取り込まない**: drift 2本 migration（RO/xenodochial）/ .claude/launch.json / node_modules / .env.local（§6）。
7. **推奨順序**: UI/design 先 → logic（C5-E）後（C5-E を最後に乗せ上書き排除）。path 単位・whole merge 禁止。
8. **必要 tests/tsc/smoke**: 各 Phase で tsc 55 + coalter/plan tests；migration apply は別 gate。
9. **停止条件**: §9（whole merge 禁止 / C5-E 不上書き / drift 除外 / 禁止ファイル不 commit / tsc 緑 / 永続化含めない）。
