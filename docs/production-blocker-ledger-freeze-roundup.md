# Production Blocker Ledger — freeze-roundup 統合（a9eedce69 base）

本台帳は `integration/freeze-roundup-on-a9eedce69-20260623` で freeze 成果を main 統合 →
production 昇格する過程で発見した **production 前に解消すべき既存債務**を記録する。
統合作業（INT-1〜）自体が持ち込んだ退化ではなく、**base（a9eedce69）時点で既に存在する**問題を分離して台帳化する。

## B-1. `travelAdapterExternalLinksAttach.test.ts` が base で failed

- **状態**: 🔴 既存 base failure（production 前に修正 or 明示的 blocker 化が必要）
- **発見**: INT-1（Logic 取り込み）の全 suite 実行時に 1 failed として検出。
- **切り分け済み**:
  - `a9eedce69` base の clean tree（Culcept-int-battery）で**同一 test を単体実行 → 同じく failed**（1 failed / 11 passed）。
  - Logic は travel adapter（`lib/shared/travel/`・`lib/coalter/travel/`）および当該 test を**非変更**（`git diff --name-only a9eedce69 HEAD` で確認）。
  - → **INT-1 由来の退化ではない**。base が持つ既存債務。
- **症状**: `r.display` の key 集合 expectation が `["cues","packet","projection"]` 固定だが、
  実際の adapter 出力に `proposalsDisplay` が追加されており、test 側 expectation が未更新。
  （adapter に proposalsDisplay を生やした変更時に、この network test の key assertion が取り残された見込み。）
- **対応方針（CEO 指示・2026-06-24）**:
  - INT-2 以降の統合作業中は**この test を勝手に修正しない**。
  - production 昇格前に、別途 owning session で「test expectation 更新」か「明示的 xfail/blocker 化」を判断する。
- **再現**: `NODE_OPTIONS=--max-old-space-size=8192 npx vitest run tests/unit/travelAdapterExternalLinksAttach.test.ts`
- **INT-5 再確認（2026-06-24）**: full suite（21992 tests）で唯一の失敗。統合HEAD `a6657e3d4` と base `a9eedce69` で**シグネチャ完全一致**（1 failed/11 passed・同一 test/行/received[cues,packet,projection,proposalsDisplay]）。統合由来の退化でないことを再証明。
- **分類**: 🔴 **production 前に判断必須**（修正 or 明示 xfail/受容）。

## B-2. Travel migration 8本が production 未 apply

- **状態**: 🟡 production 未接続（staging は applied 済み・production は完全未接続）
- **内容**: `supabase/migrations/` の 8本（`20260613120000` coalter sessions / `20260615100000` external_anchors startTime / `20260616100000` duration_confirmations / `20260621100000` travel_core / `100100` movement_memories / `100200` location_notes / `100300`・`100400` policy hardening）。
- **安全性**: 全て additive（`CREATE TABLE IF NOT EXISTS` / `ADD COLUMN`(NULL可) / policy `DROP IF EXISTS→CREATE`）。**executable な破壊操作（DROP TABLE/COLUMN/TRUNCATE）はゼロ**（INT-5 A5 で確認・DROP は冪等ガードの POLICY/CONSTRAINT/TRIGGER のみ）。依存順 = version 昇順（travel_core → movement/location_notes → harden）。
- **最高リスク file**: `20260621100200_create_location_notes`（唯一の非 owner-only 公開 select 経路。published は Phase G まで未運用＝実質 private だが RLS 単独レビュー要）。
- **対応方針**: INT-7 で staging（`hjcrvndumgiovyfdacwc`）に read-only 照合（`schema_migrations`/`information_schema`/`pg_policies`/`pg_constraint`）→ apply 順序確定。**production apply は別 CEO GO**（二重 ref 確認 + backup + link 確認の 4 ゲート）。
- **分類**: 🟡 **production deploy と同時/別 GO**（production 接続判断時に解消）。

## B-3. LifeOps 新 DueReason の placement semantics が conservative placeholder

- **状態**: 🟢 安全（dormant・production 非到達）
- **内容**: INT-4B で LifeOps `DueReason` union を拡張（+recurring/habit/relationship）。mainline 配置 `lib/plan/reality/lifeops/lifeops-placement.ts` は新3種を **conservative fallback**（urgency 300＝最低・easy lane・昇格なし）で通す placeholder。正式な優先度/lane semantics は未設計。
- **安全性**: 新3種は**縦の新 generator（flag-OFF・mainline reality pipeline 未配線）でのみ生成**＝現状 mainline placement に流入しない。既存3種(cycle/event_prep/deadline)挙動は完全不変。
- **対応方針**: 正式 placement 設計は **production 後 or 別 increment**（`docs/life-ops-new-duereason-conservative-placement.md`）。
- **分類**: 🟢 **post-production increment 可**（production blocker でない）。

## B-4. flag-only gate の dev route が production URL 露出しうる（✅ 解消済み）

- **状態**: 🟢 **fixed**（INT-6・2026-06-24・CEO Option C）
- **発見**: INT-5 S1 監査計画 + INT-6 静的解析。`/lifeops-preview` は **guard 一切なし**（nav 非登録・fixture 固定）→ env 供給済み環境では production URL 直叩きで fixture preview 露出（真の露出）。`/plan/dev-travel-personalization` は `PLAN_TRAVEL_PERSONALIZATION_PREVIEW` **flag-only gate**（既定 OFF→Disabled stub・NODE_ENV hard-block なし）。
- **修正（production hard-block・最小・host/ref 不使用）**:
  - `app/lifeops-preview/page.tsx`: `if (process.env.NODE_ENV === "production") notFound();` を component 先頭に追加（dev/local のみ描画）。
  - `app/(culcept)/plan/dev-travel-personalization/page.tsx`: 同 `notFound()` を flag gate の**前**に追加（production→notFound / dev・local→従来の flag gate=Disabled or preview）。
- **不変条件**: 既存 UI / preview 内容 / flag ロジックは変更なし（production 到達のみ遮断）。dev/local 挙動は従来通り。tsc 55 維持・plan+reality+lifeops test 退化ゼロ。
- **分類**: 🟢 **解消済み**（production 露出を塞いだ）。

---

## 既存債務サマリ（production 昇格判断時の分類）

| ID | 内容 | 分類 | production 前必須? |
|---|---|---|---|
| B-1 | travelAdapter test base failure | 🔴 | **必須**（修正 or 明示 xfail） |
| B-2 | Travel migration 8本 未 apply | 🟡 | production 接続時（別 GO） |
| B-3 | LifeOps placement placeholder | 🟢 | 不要（post-production 可） |
| B-4 | flag-only dev route 露出 | 🟢 | **解消済み**（INT-6・production hard-block 追加） |
