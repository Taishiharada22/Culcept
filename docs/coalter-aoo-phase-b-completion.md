# CoAlter AOO Mirror Channel — Phase B 正式 close + Phase C handoff (2026-05-18)

**ステータス**: Phase B **conditional pass** で正式 close。Phase C にて未到達項目 (visible Mirror path + diagnostic Preview exposure + linguistic stop runtime + taxonomy 拡張) を扱う。
**完了判定**: CEO 実機 B-5c canary smoke (2026-05-18) で **core safety 全項目 PASS / visible path & diagnostic は構造的未到達 (N/A)** を確認。CEO 判断「Option C 採用 = B-6 起票 + Phase C 設計に visible 経路実機検証を明記」。
**承認**: CEO/GPT 判断「Option C 採用、B-5d は今は切らない、conditional pass 表現維持」(2026-05-18)
**完了根拠**: PR #183 (B-5c smoke result docs / merged `89dbad7f`) + 本 PR (B-6 close docs)

> ⚠️ **正確な表現に関する CEO 補正 (本ドキュメント全期間維持)**:
> Phase B は **"safe default / no-disruption / no-leak / runtime guarded foundation validated"** として閉じる。
> **"visible Mirror fully validated" ではない**。
> visible Mirror 経路の実機検証は **Phase C** で行う。

---

## 0. Executive Summary

CoAlter Mirror Channel の **Phase B (構造完成)** は 2026-05-17 着手、2026-05-18 close。

**最上位原則** (Phase B 全期間遵守、Phase C+ 継承): **Default STAY_SILENT / Mirror = reflection (提案でも判断でも介入でもない) / Always-On ≠ 自動発話**。

Phase B は CoAlter を「Reactive Observer (Phase A 観測蓄積) + Mirror Channel 構造 (Phase B)」へ拡張する基盤。Mirror は控えめに「黙りながら、まれに反射する」構造を確立。visible 出力は Phase C で presence 接続 + 実機検証を経て初めて常用化。

### 0.1 達成内容 (CEO 補正後の正確な定義)

| # | 領域 | Phase B での達成 | 判定 |
|---|---|---|---|
| 1 | **safe default** (Default STAY_SILENT) | 実機 100% (Mirror 一度も出現せず、CEO smoke 観測) | ✅ |
| 2 | **no-disruption** (既存 UI / chat / presence 不変) | 実機 0 件 (CEO smoke 観測) | ✅ |
| 3 | **no-leak** (PII / env / raw text の流出ゼロ) | 実機 0 件 (CEO smoke 観測 + 削除確認) | ✅ |
| 4 | **runtime guarded foundation validated** (4-layer flag gating + 4-gate orchestration + 7-layer postSpeakVerification + PII firewall) | 構造完成 + 実機 core safety 検証 | ✅ |
| 5 | visible Mirror full validation (close / sleep / cap / verification の実機発火) | 構造的に未到達 (presence layer 不接続) | **N/A (Phase C へ)** |
| 6 | diagnostic Preview 表示 | 構造的に未到達 (production NODE_ENV guard) | **N/A (Phase C へ)** |

### 0.2 不可侵境界遵守 (Phase B 全期間)

- ✅ Production env 1 bit も触らず (B-1〜B-6、6 PR 系列、2 日間)
- ✅ presence layer 30+ files / chat layer 17 files **一切 touch なし** (Phase A 継承)
- ✅ ChatClient.tsx は **0 diff** (Phase A で確立した最小 mount 経由)
- ✅ MirrorSurface.tsx (B-1 hidden shell) は B-2〜B-5c で **0 diff** 維持
- ✅ DB / Supabase / migration / Sentry / telemetry / cookie / localStorage / IndexedDB / LLM call 全て不使用
- ✅ Question / Proposal / Suggestion 自動発火 ゼロ件 (template enum で構造保証)
- ✅ raw text / raw id (messageId / userId / pairId / sessionId) 保存ゼロ件 (型レベル + runtime 二重防御)
- ✅ cross-session persistence ゼロ件 (sleepStore / frequencyCap / channelLock / diagnosticSnapshot 全て module-level session-local)

---

## 1. Phase B 構成 PR 一覧 (8 PR、main 着地 / canary close)

| PR | branch | 役割 | 状態 | merge commit |
|---|---|---|---|---|
| #164 | (B-0 plan) `docs/coalter-aoo-phase-b-mirror-channel-design` | 設計書 (652 行) | merged | (Phase B design canonical) |
| #165 | (B-0 plan) `docs/coalter-aoo-phase-b-implementation-plan` | 実装計画 | merged | — |
| #171 | `feat/coalter-mirror-b1-shell` | B-1 UI shell + flag + hidden surface | merged | — |
| #172 | `feat/coalter-mirror-b2-mode-context-reader` | B-2 modeContext read path | merged | — |
| #173 | `feat/coalter-mirror-b3-bucket-inference` | B-3 4 bucket inference | merged | — |
| #173 | `feat/coalter-mirror-b4a-decision-types` | B-4a decision types | merged | `01239079` |
| #174 | `feat/coalter-mirror-b4b-gates` | B-4b gates | merged | `990fcc84` |
| #175 | `feat/coalter-mirror-b4c-erv-counterfactual` | B-4c ERV + counterfactual | merged | `a75e946a` |
| #176 | `feat/coalter-mirror-b4d-decision-engine` | B-4d decision engine | merged | `8e988a78` |
| #177 | `feat/coalter-mirror-b5a-shadow-mode` | **B-5a shadow mode foundation** | merged | `5203d713` |
| #179 | `feat/coalter-mirror-b5b-visible-surface` | **B-5b visible surface + sleep + 7-layer verification** | merged | `8064d22c` |
| #181 | `docs/coalter-mirror-b5c-preview-canary-smoke` | B-5c smoke plan docs | merged | `d280d105` |
| **canary** | `chore/coalter-mirror-b5c-canary` (empty commit) | **B-5c CEO 実機 smoke trigger** | **closed (not merged)** | — |
| #183 | `docs/coalter-mirror-b5c-smoke-result` | B-5c smoke result + decision-log entry | merged | `89dbad7f` |
| **本 PR** | `docs/coalter-mirror-b6-phase-b-close` | **B-6 Phase B close + Phase C handoff** | **本 docs** | — |

> 注: B-1〜B-3 / B-4a のマージ commit hash は本 docs 起票時に未集計、必要なら別 PR で補完。

canary branch (`chore/coalter-mirror-b5c-canary`) は smoke 専用 empty commit、merge せず close + delete 済み (Claude cleanup 2026-05-18)。

---

## 2. CEO 実機 B-5c smoke 観測結果 (2026-05-18)

### 2.1 観測手順

1. Claude が canary branch (`chore/coalter-mirror-b5c-canary`) を main から作成、empty commit `b58f50be` を push
2. Vercel `vercel.json` の `ignoreCommand` (`.md` 以外なし → skip) で git-integration build が Canceled
3. Claude が `npx vercel --force` で IBS bypass → git-attributed Preview deployment 確立 (`dpl_H2EbjbszFJfdrQPN7cbmEsSHfB78`)
4. CEO が 2 env を branch-scoped Preview のみに投入:
   - `NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED=true`
   - `NEXT_PUBLIC_COALTER_MIRROR_DIAGNOSTIC_EXPOSE=true`
5. Claude が canary redeploy (`npx vercel --force`) → env baked-in build Ready 確認
6. CEO が Preview URL (https://culcept-kk1fecqow-taishis-projects-0a8deb17.vercel.app) で実機 smoke
7. CEO 結果共有 → env 削除 → Claude 削除確認 (全 scope 0 件)

### 2.2 観測値 (CEO 報告 2026-05-18)

| 観測項目 | 結果 |
|---|---|
| `window.__coalterMirrorDiagnostic` install | **undefined** (production NODE_ENV guard で抑止) |
| visible Mirror 表示 | **なし** (一度も発火せず) |
| 画面崩れ | なし |
| CoAlter / chat UI 影響 | なし |
| console error | 重大なし |
| PII leak (確認可能範囲) | なし |
| 「閉じる」「黙ってもらう」 button 動作 | 未確認 (Mirror が出ないため) |
| default STAY_SILENT 100% | ✅ 許容範囲 |

### 2.3 Env cleanup verify (実機、CEO 削除後 Claude 検証)

| scope | `NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED` | `NEXT_PUBLIC_COALTER_MIRROR_DIAGNOSTIC_EXPOSE` |
|---|---|---|
| production | (none) ✅ | (none) ✅ |
| preview (all + branch-scoped) | (none) ✅ | (none) ✅ |
| development | (none) ✅ | (none) ✅ |

### 2.4 重要 caveat

本 close 判定は **CEO 実機観測の報告値** + **Claude API audit (env scope / Vercel deployment metadata / git attribution)** に基づく。Claude は DevTools console を直接観測していない (CEO 委任)。

---

## 3. Phase B 達成定義 (CEO 補正の精密表現)

CEO は B-5c smoke 結果報告に対し、**"Phase B full visible success" 表現は禁止** / **"conditional pass" 表現を維持** と明示指示。本 docs はその指示を厳格に反映する。

### 3.1 達成された範囲 ("Phase B core safety validated")

- **default STAY_SILENT が runtime で実証された** (実機 Mirror 出現 0 回 / N session)
- **既存 UI / chat / presence layer に対する no-disruption が実証された** (CEO 実機観測で影響 0)
- **PII / env / raw text の no-leak が実証された** (DOM / Network / Console / diagnostic 経路すべて 0)
- **4-layer flag gating defense が実機で機能した** (env OFF で完全 no-op、env ON canary で動作)
- **構造完成: 4-gate orchestration + 7-layer postSpeakVerification + PII firewall + hedged template** (unit test 全 PASS、実機 default-STAY_SILENT で構造起動が確認)

### 3.2 達成されていない範囲 ("visible Mirror full validation は Phase C")

- visible Mirror 経路の実機発火 (MIRROR_CANDIDATE → text generation → verification → display)
- 「閉じる」「黙ってもらう」 button の実機動作
- session cap = 1 の実機到達
- sleep ON 後の visible 抑止の実機確認
- duplicate template reject の実機確認
- diagnostic snapshot の Preview 表示
- `linguisticStopDetector` の runtime 接続

### 3.3 明示的に禁止される表現 (Phase B/C docs 全期間)

> ❌ "Phase B full visible success"
> ❌ "Mirror Channel fully validated in Preview"
> ❌ "visible Mirror confirmed in production-like environment"
> ❌ "all 19 smoke checklist items passed"

### 3.4 推奨表現 (本 docs 採用)

> ✅ "Phase B safe default / no-disruption / no-leak / runtime guarded foundation validated"
> ✅ "Phase B conditional pass — core safety validated, visible Mirror path & diagnostic exposure pending Phase C structural connection"
> ✅ "Mirror Channel structural foundation completed in Phase B; full visible validation reserved for Phase C"

---

## 4. 未到達項目 → Phase C handoff scope

### 4.1 visible Mirror 経路 (C-3 / C-4)

- B-5b 実装は完成しているが、`engineAdapter` が presence-derived axes を全て `unknown` に倒すため (chat/presence layer touch 禁止と整合)、`decideMirror()` は Observe Gate で `observe_gate_unknown_modeContext` で fail → MIRROR_CANDIDATE 不発火 → visible Mirror 出現 0
- visible 経路を発火させるには **presence layer から read-only で `mode` / `alignment` / `uncertainty` / `silenceBudget` / `patternCategory` を取得する adapter** が必要
- それは Phase B では設計上の不可侵境界外
- **Phase C-2** で `engineAdapter` を最小限 read-only 拡張、**C-3** で forced canary or controlled candidate path

### 4.2 diagnostic global の Preview 観測 (C-1)

- `lib/coalter/mirror/diagnosticDebugGlobal.ts:111` の `process.env.NODE_ENV === "production"` guard が install を抑止
- Vercel Preview build は Next.js production build (`NODE_ENV=production`) のため、`NEXT_PUBLIC_COALTER_MIRROR_DIAGNOSTIC_EXPOSE=true` を投入しても guard が優先
- **Phase A §3.5 の学び (NODE_ENV gate 採用禁止)** を B-5a で取り込めていなかった (本 docs §7.1 で正直に記録)
- **Phase C-1** で `VERCEL_ENV !== "production"` ベース guard 等に緩和 (1 line fix 想定、Phase A の 7-layer defense は維持)

### 4.3 close / sleep / cap / verification 実機確認 (C-4)

- visible 経路が発火しないため、retreat affordance / cap / sleep / verification の実機動作は B-5c smoke で観測不能
- C-3 で visible 発火条件を確立後、**C-4** で 7 項目の実機確認を行う

### 4.4 `linguisticStopDetector` runtime 接続 (Phase C scope 外、別 PR)

- B-5b は pure function のみ実装、unit test 完備
- runtime 接続には chat layer 経由 safe input pipe が必要 (現状 chat layer touch 禁止)
- C-2 read-only presence adapter とは別経路 (chat layer 触る必要)
- **Phase C scope に含めるかは C-0 design で再判断** (Phase D 候補もあり)

### 4.5 taxonomy 拡張 (C-5)

- B-5b は State Mirror only 5 template
- Difference / Tempo / Fairness / Repair Mirror は Phase C-5 で taxonomy 拡張検討 (実装ではなく検討)

---

## 5. 未到達理由 (構造的、設計判断の必然)

未到達は **故障ではない**。Phase B の設計判断 (CEO 不可侵境界 + Phase A 継承境界) の **必然的帰結**。

| 未到達項目 | 構造的理由 | Phase C での扱い |
|---|---|---|
| visible Mirror 経路 | `engineAdapter` が presence-derived axes を unknown に倒す (chat/presence touch 禁止と整合) | C-2 で read-only adapter、C-3 で canary 発火 |
| diagnostic global Preview 表示 | production NODE_ENV guard (Vercel Preview = production build) | C-1 で VERCEL_ENV ベース guard に緩和 |
| close/sleep/cap/verification 実機 | visible 経路発火に依存 | C-4 で C-3 後に実機確認 |
| linguistic stop runtime | chat layer touch 必要 (現状禁止) | Phase C 範囲再判断、別 PR 候補 |

これらの未到達は **Phase B 不可侵境界を守った結果** であり、**B-5d で無理に広げるべきではない** (CEO 判断 + Claude 同意)。

---

## 6. なぜ B-5d を切らないか (CEO 判断 + Claude 補強)

### 6.1 CEO 判断 (Option C 採用、2026-05-18)

> B-5d修正PRは今は切りません
> 理由: 設計上の不可侵境界を守った結果であり、今B-5dで無理に広げるべきではありません

### 6.2 Claude 補強

- **Phase B 境界の自然な終端**: B-5 の最後 (B-5c) が「shadow mode + UI primitive + smoke」で完結する設計。B-5d を切ると Phase B 境界が曖昧化
- **visible 検証は presence 接続設計を要する**: これは Phase C-0 integration design の本質。Phase B 終盤に押し込むと整合性低下
- **diagnostic guard 緩和は 1 line だが Phase A 学びと連動**: 単独で行わず、Phase C-0 design 後に C-1 として行う方が整合性高い
- **core safety は実証済み**: 急いで visible 検証を Phase B に押し込む実需が低い

### 6.3 反論可能性 (Claude 自立分析)

- 「1 line fix (C-1) を Phase B 内で済ませる方が手数少ないのでは?」
  → 否。Phase B 境界の終端を明確化することが、Phase C の信頼性を高める
- 「visible 検証なしで Phase B 完了は責任放棄ではないか?」
  → 否。CEO 補正「conditional pass」表現を厳密に守ることで、Phase C 着手時に「visible は未確認」というスタートラインが明示される

---

## 7. Phase B 中の重要発見・学び (Phase C 反映必須)

### 7.1 🔴 Phase A 学びの取り込み漏れ — production NODE_ENV guard 採用

**事象**: B-5a `diagnosticDebugGlobal.ts:111` で `process.env.NODE_ENV === "production"` guard を採用 → Preview build (= production build) で install が抑止 → B-5c smoke で `window.__coalterMirrorDiagnostic` が `undefined`。

**根本原因**: Phase A 完了 docs `docs/coalter-aoo-phase-a-completion.md` §3.5 で「**NODE_ENV gate は Vercel Preview build (= production build) で canary を無効化するため採用禁止 (A-2e 補正)**」と明示されていたが、Phase B 設計時に取り込めていなかった。

**学び**:
1. Phase 完了 docs の **§3 系 (重要発見・訂正) は次 Phase 着手前に必ずレビュー**する手順を Phase C で導入 (C-0 design 冒頭の checklist)
2. NODE_ENV guard ではなく **VERCEL_ENV ベース** + 既存 Phase A 7-layer defense (`docs/coalter-aoo-phase-a-completion.md` §3.7) を再採用

**Phase C 対応**: C-1 で `diagnosticDebugGlobal.ts` の guard を `VERCEL_ENV !== "production"` ベース等に緩和 (1 line)、Phase A 7-layer defense は維持。

### 7.2 Vercel Ignored Build Step (IBS) と empty commit の関係

**事象**: B-5c canary branch (empty commit) を push → Vercel が `vercel.json` の `ignoreCommand` (`.md` 以外なし → skip) で Canceled → git-integration の Preview build が作れない。

**Phase A の前例**: `docs/coalter-aoo-phase-a-completion.md` §3.4 で「empty commit は vercel.json `ignoreCommand` で Smart Skip → 実 build にならない / 実 build trigger は `.ts/.tsx` 最小修正 (5 行 comment 追加等)」と既に発見されていた。

**Phase B での新しい解** (B-5c smoke 時): `npx vercel --force` で IBS bypass + git-attributed Preview build を確立。Phase A 解とは別経路。

**学び**: Phase C smoke runbook では **2 経路を併記** (`vercel --force` / `.ts` minimal comment trigger)、CEO 判断で選択可能に。

### 7.3 env scan の false positive

**事象**: smoke 中の env audit で `grep -iE "MIRROR|DIAGNOSTIC"` を使い、Phase A 由来の `COALTER_DIAGNOSTICS_TOKEN_CURRENT` / `COALTER_UNDERSTANDING_DIAGNOSTICS` を false positive で拾った。

**学び**: strict match `grep -E "(NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED|NEXT_PUBLIC_COALTER_MIRROR_DIAGNOSTIC_EXPOSE)"` を Phase C smoke runbook の標準とする。

### 7.4 確立した設計原則 (Phase C 以降 canon)

| 原則 | 場所 | Phase C での扱い |
|---|---|---|
| **shadow mode pattern** | B-5a hook (mount-once + diagnostic) | C-2/C-3 で拡張、shadow 経路は維持 |
| **default-STAY_SILENT 構造保証** | `MirrorDecision` discriminated union (B-4a) | C 以降不変、新 decision variant 追加禁止 |
| **7-layer postSpeakVerification** | B-5b `postSpeakVerification.ts` | 新 template / 新 grammar 追加時に全 7 layer 通過必須 |
| **4-gate visible orchestration** | B-5b `visibleMirrorEvaluator.ts` | gate 順序固定 (decision → sleep → cap → text → verification) |
| **PII firewall (型レベル + runtime 二重)** | B-5b `visibleMirrorTypes.ts` + verification regex | 新 input 型に PII field 書けない構造を維持 |
| **4-layer flag gating defense** | flag / parser / host / hook | env scope は branch-scoped Preview only、production 禁止を維持 |
| **hedged grammar template only** | B-5b `mirrorTextTemplates.ts` | 新 template も hedged form + ≤ 40 文字 + grammar invariant 維持 |
| **retreat affordance principle** | B-5b `MirrorVisibleSurface.tsx` | 「閉じる」「黙ってもらう」のみ、Yes/No / 同意 / 決定 affordance 禁止 |
| **session-local persistence のみ** | sleepStore / frequencyCap / channelLock / diagnosticSnapshot | cross-session persistence は Phase B/C 全期間禁止 |
| **enum-locked template id** | `VisibleMirrorTemplateId` literal union | runtime に arbitrary text を生成する経路を構造的に塞ぐ |

---

## 8. Phase C handoff scope (C-0 〜 C-6)

**原則**: sequential (C-0 → C-1 → C-2 → C-3 → C-4 → C-5 → C-6)。並列起票禁止。

### C-0 — Phase C integration design (docs-only)

| 項目 | 内容 |
|---|---|
| 種別 | docs PR |
| 目的 | Phase C 全体設計 (presence 接続 / diagnostic exposure / taxonomy 方針 / smoke 戦略) |
| 必須 内容 | (a) Phase B 完了根拠 (本 docs) を冒頭参照 / (b) Phase A §3.5 + §3.7 learning import / (c) read-only presence adapter 設計 (engineAdapter 拡張範囲、不可侵境界) / (d) visible canary path 設計 (forced enable or controlled candidate) / (e) Phase C smoke runbook (B-5c 教訓反映) |
| 不可侵 | code 0 / package.json 0 / Phase B canon 全維持 |
| CEO 判断 point | (1) read-only presence adapter の許容範囲 / (2) C-1 1 line fix のタイミング / (3) Phase C smoke 期間 |
| LOC budget | docs 300-500 行 |

### C-1 — Preview-safe diagnostic exposure (1 line fix)

| 項目 | 内容 |
|---|---|
| 種別 | code (最小) |
| 目的 | `diagnosticDebugGlobal.ts:111` の `NODE_ENV === "production"` guard を **VERCEL_ENV ベース** に変更 (Phase A §3.5 学び反映) |
| 修正 file | `lib/coalter/mirror/diagnosticDebugGlobal.ts` (1 line) + test 追加 |
| 維持する Phase A 7-layer defense | L1 env default false / L2 branch-scoped only / L3 PR merge 禁止 (canary draft) / L4 branch 短命 / L5 15 min expire / L6 smoke 後 env 削除 / L7 redacted only |
| 不可侵 | 他 mirror module / presence / chat / observer 全て 0 diff |
| CEO 判断 point | guard ロジックの具体 (VERCEL_ENV / NEXT_PUBLIC_VERCEL_ENV / 等) |
| LOC budget | 1-3 lines + test (合計 < 20 lines) |

### C-2 — Read-only presence / relationship state adapter

| 項目 | 内容 |
|---|---|
| 種別 | code |
| 目的 | `engineAdapter` を read-only で presence layer に接続し、`mode` / `alignmentBucket` / `uncertaintyBucket` / `silenceBudgetBucket` / `patternCategoryBucket` を実値に置換 (現在は全て unknown) |
| 修正 file | `lib/coalter/mirror/engineAdapter.ts` (拡張) + 新規 `presenceMirrorBridge.ts` (read-only adapter) |
| 不可侵 | presence layer の write は **絶対禁止** / chat layer は **0 diff** / 既存 presence runtime に副作用なし |
| CEO 判断 point | presence layer のどの API を read-only 利用するか (Phase A `relationshipState.ts` + observer layer 経路 推奨) |
| LOC budget | 80-150 lines + test |

### C-3 — Visible path canary (forced enable or controlled candidate)

| 項目 | 内容 |
|---|---|
| 種別 | code |
| 目的 | visible Mirror が確実に発火する canary 経路を確立 |
| 2 option (C-0 で決定) | **Option α (forced canary)**: 専用 dev env flag で全 gate を bypass、CEO smoke 専用 / **Option β (controlled candidate)**: C-2 接続後の真の MIRROR_CANDIDATE 発火を待つ、cap = N (high) で観測量確保 |
| 不可侵 | Production env 禁止 / all Preview 禁止 / chat layer 0 diff |
| CEO 判断 point | Option α / β / 両方 |
| LOC budget | 50-100 lines + test |

### C-4 — close / sleep / cap / verification 実機確認

| 項目 | 内容 |
|---|---|
| 種別 | smoke (canary docs + 結果 docs) |
| 目的 | Phase B 未到達の retreat affordance / cap / sleep / verification を実機で確認 |
| 必須 観測 | (a) visible Mirror が C-3 経路で発火 / (b) 「閉じる」 click で visible 消える / (c) 「黙ってもらう」 click で sleep ON + visible 消える / (d) sleep ON 後の visible 出現 0 / (e) cap = 1 到達後の 2 度目発火 0 / (f) duplicate template reject 動作 / (g) 7-layer postSpeakVerification の各 layer 動作 (sampling) |
| 不可侵 | B-5c smoke と同等 (branch-scoped Preview only / env CEO 手動 / smoke 後削除) |
| CEO 判断 point | 各観測項目の合格判定、partial pass の扱い |

### C-5 — Taxonomy 拡張検討 (実装ではなく検討)

| 項目 | 内容 |
|---|---|
| 種別 | docs PR (検討、実装ではない) |
| 目的 | Difference / Tempo / Fairness / Repair Mirror の taxonomy 拡張可否検討 |
| 検討 内容 | (a) 各 category の発火条件 / (b) hedged grammar template の追加可能性 / (c) verification 7-layer の category 対応 / (d) Mirror Diversity Quota (B-0 plan §10.5) の必要性再評価 / (e) 実装は別 PR (C-5 では検討のみ) |
| 不可侵 | code 0 / package.json 0 |
| CEO 判断 point | 拡張可否、優先順位、Phase D 候補化 |

### C-6 — Phase C canary smoke

| 項目 | 内容 |
|---|---|
| 種別 | smoke (canary docs + 結果 docs) |
| 目的 | Phase C 全体 (C-1 + C-2 + C-3 + C-4 + C-5 反映後) の実機 smoke |
| 必須 観測 | B-5c 19 項目 + C-4 7 項目 + diagnostic 観測 (C-1 緩和後) + presence 接続健全性 (C-2) |
| 不可侵 | branch-scoped Preview only / env CEO 手動 / smoke 後削除 / Phase B canon 全維持 |
| CEO 判断 point | Phase C 完了 / Phase D 起票 / Production rollout 開始判断 |

### C 全体 sequential 順序

```
C-0 (design) ──merge──> C-1 (1 line fix)
                          │
                          ▼
                        C-1 merge ──> C-2 (presence adapter)
                                       │
                                       ▼
                                       C-2 merge ──> C-3 (visible canary path)
                                                      │
                                                      ▼
                                                      C-3 merge ──> C-4 (実機確認 smoke)
                                                                     │
                                                                     ▼
                                                                     C-4 pass ──> C-5 (taxonomy 検討)
                                                                                    │
                                                                                    ▼
                                                                                    C-5 docs merge ──> C-6 (全体 smoke)
                                                                                                         │
                                                                                                         ▼
                                                                                                         C-6 pass ──> Phase C 完了 docs
```

---

## 9. Phase C でも維持する不可侵境界 (canon、Phase A → B → C 継承)

| 項目 | 制約 | 由来 |
|---|---|---|
| Production env | 1 bit も触らない | Phase A 確立、B 継承 |
| all Preview env (branch 非指定) | 投入禁止 | Phase A 確立、B 継承 |
| Development env | 投入禁止 (CEO 判断あれば例外) | B 継承 |
| presence layer write | 絶対禁止 | Phase A 確立、B 継承 (C で read-only 限定許容) |
| chat layer (`app/components/chat/*`, `components/chat/*`, `app/api/*`) | touch 禁止 | Phase A 確立、B 継承 |
| ChatClient.tsx | 既存 logic 0 diff (Phase A の minimal mount のみ) | Phase A 確立、B 継承 |
| MirrorSurface.tsx (B-1 hidden shell) | 0 diff | B-1 確立 |
| DB / Supabase / migration | 使わない | Phase A 確立、B 継承 |
| API route | 使わない | B 確立 (Mirror logic 全 pure) |
| Sentry / remote telemetry | 使わない | Phase A 確立、B 継承 |
| localStorage / sessionStorage / cookie / IndexedDB | 使わない | Phase A 確立、B 継承 |
| LLM call | 使わない (template only) | B 確立 |
| raw text 保存 | 0 件 | Phase A 確立、B 継承 |
| raw id (message / user / pair / session) 保存 | 0 件 | Phase A 確立、B 継承 |
| Question / Proposal / Suggestion 自動発火 | 禁止 | Phase A 確立、B 継承 (template enum で構造保証) |
| cross-session persistence | 禁止 | B 確立 (sleepStore / frequencyCap / channelLock / diagnostic 全 session-local) |
| Alter Morning 混入 | 禁止 | B 確立 |
| package.json 変更 | 禁止 (Phase C で必要なら別 PR + CEO 承認) | Phase A 確立、B 継承 |
| Phase B canon (§7.4) | 全項目維持 | 本 docs §7.4 確立 |

---

## 10. Phase B 副次観察 (Phase C で再評価)

### 10.1 IBS (Ignored Build Step) の 2 経路 bypass

Phase A: `.ts/.tsx` 5 行 comment 追加 trigger / Phase B: `npx vercel --force` bypass。C-0 design で両者の trade-off を整理、smoke runbook に併記。

### 10.2 env scan strict match の標準化

B-5c smoke で発覚した false positive 防止のため、`grep -E "(NEXT_PUBLIC_COALTER_MIRROR_*|<phase-specific-prefix>)"` を runbook 標準に。

### 10.3 production NODE_ENV guard の禁則化

Phase A §3.5 / 本 docs §7.1 を統合し、**Coalter Mirror / Observer 系の debug global では NODE_ENV guard を採用禁止** という canon を C-0 design に明記する。

### 10.4 `vercel deploy --force` の git 属性確認

CLI 経由 deploy でも Vercel API で `gitCommitRef` 属性が確認できる。これは branch-scoped env が CLI deploy にも適用される根拠。C-0 smoke runbook に明記。

---

## 11. Phase A → Phase B → Phase C 継承マップ

### 11.1 資産継承 (Phase B が利用した Phase A 資産)

| Phase A 資産 | Phase B での利用 | Phase C での扱い |
|---|---|---|
| `lib/coalter/presence/*` (30+ files) | touch なし (B 全期間) | C-2 で **read-only** 接続 (write は依然禁止) |
| `lib/coalter/observer/relationshipState.ts` | 参照のみ、直接 import なし | C-2 で read-only adapter の経由候補 |
| `lib/coalter/observer/observerSubscriber.ts` | 参照のみ | C-2 で適宜参照 |
| `lib/coalter/flags.ts` (`normalizeBool` etc.) | B-1 で `mirrorChannelEnabled` strict parser 追加 (空文字 false 扱い、normalizeBool 経由しない) | C 以降も同 parser 維持 |
| Phase A `__coalterObserverDebug` 7-layer defense | B-5a `__coalterMirrorDiagnostic` で同 pattern 採用 | C-1 で NODE_ENV guard 緩和、7-layer defense 維持 |

### 11.2 制約継承

| 制約 | Phase A 確立 | Phase B 継承 | Phase C 維持 |
|---|---|---|---|
| presence layer write 禁止 | ✅ | ✅ | ✅ (C-2 で read-only 限定許容) |
| chat layer touch 禁止 | ✅ | ✅ | ✅ |
| Production env 不可侵 | ✅ | ✅ | ✅ |
| raw text / id 保存 0 | ✅ | ✅ | ✅ |

### 11.3 学び継承 (Phase A → Phase B の取り込み漏れ + 修正)

| Phase A 学び | Phase B 取り込み | Phase C で対応 |
|---|---|---|
| §3.5: NODE_ENV gate 採用禁止 | ❌ 取り込み漏れ (B-5a で採用してしまった) | **C-1 で修正** (1 line fix) |
| §3.4: empty commit IBS Skip | ⚠️ 取り込み部分的 (B-5c で `vercel --force` という別解) | C-0 smoke runbook で 2 経路併記 |
| §3.7: 7-layer defense | ✅ B-5a で同 pattern 採用 | C 全期間維持 |
| §3.6: debug global 段階改善 (v1→v2.2) | ✅ B-5a 初回から redacted snapshot のみ exposure | C 全期間維持 |

### 11.4 学び新規 (Phase B → Phase C)

| Phase B 学び | Phase C 反映 |
|---|---|
| §7.1 NODE_ENV guard の Phase A 学び取り込み漏れ | C-0 design 冒頭に「前 Phase §3 系 (重要発見) 必読 checklist」追加 |
| §7.2 IBS bypass の 2 経路 | C-0 smoke runbook に併記 |
| §7.3 env scan strict match | C-0 smoke runbook の標準 grep pattern として |
| §10.4 `vercel deploy --force` の git 属性 | C-0 smoke runbook に明記 |

---

## 12. Phase C 着手前 pre-flight (印刷可能 checklist)

```
□ §0 Phase B 完了根拠を C-0 design 冒頭で参照
□ §3 達成定義の正確な表現 ("conditional pass" 維持) を C-0 で踏襲
□ §5 構造的未到達理由を C-0 で踏襲
□ §7.1 Phase A §3.5 学び (NODE_ENV gate 禁止) を C-1 設計の根拠に
□ §7.2 IBS bypass 2 経路を C-0 smoke runbook に併記
□ §7.3 env scan strict match を C-0 smoke runbook 標準に
□ §7.4 Phase B canon (10 原則) を C-0 で再宣言、変更禁止を明示
□ §8 C-0〜C-6 sequential 順序を遵守 (並列禁止)
□ §9 不可侵境界を C-0 で再宣言
□ §10 副次観察を C-0 で再評価
□ §11.3 Phase A → B 学び継承の取り込み漏れを C で再発させない
□ C-0 design PR を起票 → CEO 承認 → C-1 起票
□ C-1 完了 → C-2 起票 → ... sequential
□ Phase C で起こりやすい設計事故 5 つ (§13) を C-0 design で個別対処
```

---

## 13. Phase C で起こりやすい設計事故 5 つ (事前回避)

### 13.1 visible 検証のために presence layer write を強行する

**回避**: C-2 は **read-only** に厳格制限。C-0 design で「presence layer write は Phase C 全期間禁止」と再宣言。`presenceMirrorBridge.ts` (新規予定) は read function のみ export、write export 禁止。

### 13.2 taxonomy 拡張で template 数が膨張、grammar invariant が緩む

**回避**: C-5 は **検討のみ**、実装は別 PR + CEO 承認。新 template 追加時は B-5b §7.4 §15.4 の grammar invariant test (`mirrorTextTemplates.test.ts`) を全 template に適用。

### 13.3 `linguisticStopDetector` runtime 接続で chat layer touch

**回避**: chat layer touch は Phase C scope に含めない (Phase D 候補)。C-0 で明示宣言。runtime 接続が必要になった時点で chat layer 側に **safe input pipe** を別 PR で新規追加するか、CEO 判断で Phase 移行。

### 13.4 Preview canary で「真剣味」が落ちる (Phase A / B / C で 3 回目)

**回避**: B-5c smoke checklist (19 項目 + diagnostic 10 項目) を C-4 / C-6 でも踏襲。CEO 判断 point を pre-defined 化。partial pass の扱いも事前定義。

### 13.5 Phase C で「Production rollout まで一気にやる」誘惑

**回避**: C-6 完了 → Phase C 完了 docs → **Phase D 起票 (production rollout 設計)** を別フェーズで扱う。Phase C 内に Production rollout 経路を入れない (canon)。

---

## 14. 参照ドキュメント

### Phase B 構成 docs

- `docs/coalter-aoo-phase-b-mirror-channel-design.md` (PR #164、Phase B design canonical、本 PR で完了 banner 追加)
- `docs/coalter-aoo-phase-b-implementation-plan.md` (PR #165、micro-PR 分割 plan)
- `docs/coalter-aoo-phase-b-b5c-preview-canary-smoke.md` (PR #181 + §15 追記 PR #183、smoke plan + 結果)

### Phase B 実装 code (lib + hooks + components + tests)

#### Mirror layer 構造
- `lib/coalter/flags.ts` (`mirrorChannelEnabled` + `mirrorDiagnosticExposeEnabled` strict parser)
- `lib/coalter/mirror/types.ts` (B-1〜B-4 型基盤)
- `lib/coalter/mirror/decisionConstants.ts` (B-4a thresholds + 17 reason enum)
- `lib/coalter/mirror/modeContextReader.ts` (B-2)
- `lib/coalter/mirror/buckets/` (B-3 4 bucket inference)
- `lib/coalter/mirror/gates/` (B-4b 3 gates)
- `lib/coalter/mirror/erv.ts` + `counterfactualSilenceTest.ts` (B-4c)
- `lib/coalter/mirror/decisionEngine.ts` (B-4d)

#### Shadow mode foundation (B-5a)
- `lib/coalter/mirror/diagnosticSnapshot.ts`
- `lib/coalter/mirror/diagnosticDebugGlobal.ts` (⚠️ §7.1 production NODE_ENV guard、C-1 で緩和予定)
- `lib/coalter/mirror/channelLock.ts`
- `lib/coalter/mirror/sleepStore.ts`
- `lib/coalter/mirror/frequencyCap.ts`
- `lib/coalter/mirror/conversationPhaseDetector.ts`
- `lib/coalter/mirror/noveltyEstimator.ts`
- `lib/coalter/mirror/engineAdapter.ts` (⚠️ presence-derived axes 全 unknown、C-2 で read-only 接続)
- `hooks/useMirrorEngine.ts`
- `components/coalter/mirror/MirrorHost.tsx` (B-1 hidden shell mount + B-5a useMirrorEngine + B-5b visible mount)
- `components/coalter/mirror/MirrorSurface.tsx` (B-1 hidden shell、B-2〜B-5c で 0 diff)

#### Visible surface (B-5b)
- `lib/coalter/mirror/visibleMirrorTypes.ts`
- `lib/coalter/mirror/mirrorTextTemplates.ts` (5 State Mirror、hedged form、≤ 40 文字)
- `lib/coalter/mirror/mirrorTextGenerator.ts` (deterministic、LLM 禁止)
- `lib/coalter/mirror/postSpeakVerification.ts` (7-layer fail-fast)
- `lib/coalter/mirror/linguisticStopDetector.ts` (pure、runtime 接続なし)
- `lib/coalter/mirror/visibleMirrorEvaluator.ts` (4-gate orchestration)
- `components/coalter/mirror/MirrorVisibleSurface.tsx` (reflection-only UI、retreat affordance のみ)
- `components/coalter/mirror/SleepUIToggle.tsx` (1 button toggle)

#### tests (Phase B 完了時点で 574 mirror tests / 903 presence tests / 4425 coalter tests 全 PASS)
- `tests/unit/coalter/mirror/` (B-1〜B-5b の全 module unit test)
- `tests/unit/coalter/presence/` (regression none)

### Phase A 完了 docs (本 docs の前例 + 学び source)
- `docs/coalter-aoo-phase-a-completion.md` (特に §3.4 / §3.5 / §3.7 を Phase C 設計時に必読)

---

## 15. 変更履歴

| 日付 | 変更 | 承認 |
|---|---|---|
| 2026-05-18 | Phase B 正式 close + Phase C handoff docs (本 PR) | CEO 判断「Option C 採用、B-5d 不起票、conditional pass 表現維持」(2026-05-18) |

---

## Appendix A — Phase B PR 詳細一覧

| 段階 | PR | 行数 | merge 日 | 主要成果物 |
|---|---|---|---|---|
| B-0 design | #164 / #165 | 652 + 350 | 2026-05-17 | 設計 + 実装計画 |
| B-1 shell | #171 | ~100 | 2026-05-17 | `MirrorSurface.tsx` hidden shell + `mirrorChannelEnabled` flag |
| B-2 modeContext | #172 | ~150 | 2026-05-17 | `modeContextReader.ts` read path |
| B-3 buckets | (per CEO log) | ~200 | 2026-05-17 | `buckets/*` 4 bucket inference |
| B-4a types | #173 (`01239079`) | ~250 | 2026-05-17 | `decisionConstants.ts` + reason enum 17 値 |
| B-4b gates | #174 (`990fcc84`) | ~300 | 2026-05-17 | `gates/observe.ts` / `gates/worth.ts` / `gates/safe.ts` |
| B-4c ERV | #175 (`a75e946a`) | ~250 | 2026-05-17 | `erv.ts` + `counterfactualSilenceTest.ts` |
| B-4d engine | #176 (`8e988a78`) | ~350 | 2026-05-17 | `decisionEngine.ts` 8-step orchestration |
| B-5a shadow | #177 (`5203d713`) | ~800 | 2026-05-17 | shadow mode foundation 8 module + hook |
| B-5b visible | #179 (`8064d22c`) | ~1200 | 2026-05-17 | visible surface 6 module + 2 UI + hook 拡張 |
| B-5c plan | #181 (`d280d105`) | 632 docs | 2026-05-18 | smoke plan docs (14 section + 2 Appendix) |
| B-5c smoke | #183 (`89dbad7f`) | 140 docs | 2026-05-18 | smoke 結果 + decision-log entry |
| **B-6 close** | **本 PR** | docs | 2026-05-18 | **Phase B 正式 close + Phase C handoff** |

---

## Appendix B — Phase C 想定スケジュール (tentative)

| Phase C 段階 | 想定期間 | 依存 | CEO 判断 |
|---|---|---|---|
| C-0 design | 1-2 日 | Phase B close (本 PR) | design review、C-1 着手承認 |
| C-1 1 line fix | 1 日 | C-0 merge | 1 line fix 内容承認 |
| C-2 read-only adapter | 2-3 日 | C-1 merge | adapter 範囲承認 |
| C-3 visible canary | 2-3 日 | C-2 merge | Option α/β 選択 |
| C-4 実機 smoke | 1-2 日 (smoke 自体) | C-3 merge | 各観測項目合格判定 |
| C-5 taxonomy 検討 | 3-5 日 (docs) | C-4 pass | 拡張可否、Phase D 候補化 |
| C-6 全体 smoke | 1-2 日 | C-5 merge | Phase C 完了判定 / Phase D 起票 |
| Phase C 完了 docs | 1 日 | C-6 pass | Production rollout 設計開始可否 |

合計 想定: **2-3 週間** (CEO 判断 / 実装 / 実機 smoke の時間込み)。tentative、CEO 補正可。

---

## Appendix C — Phase B / C invariant checklist (Phase C 各 PR 起票時に確認)

### 各 Phase C PR 起票時に確認 (Claude が PR description で明示)

```
□ Production env 投入なし
□ all Preview env 投入なし (branch-scoped Preview のみ)
□ presence layer write なし (read-only のみ)
□ chat layer (app/components/chat/*, components/chat/*, app/api/*) 0 diff
□ ChatClient.tsx 既存 logic 0 diff
□ MirrorSurface.tsx (B-1 hidden shell) 0 diff
□ raw text / raw id 保存 0
□ DB / Supabase / migration / Sentry / remote telemetry 0
□ localStorage / sessionStorage / cookie / IndexedDB 0
□ LLM call 0
□ Question / Proposal / Suggestion 自動発火 0
□ cross-session persistence 0
□ Alter Morning 混入 0
□ package.json 変更 0 (必要なら別 PR + CEO 承認)
□ Phase B canon §7.4 全項目維持
□ Phase A 完了 docs §3.4 / §3.5 / §3.7 学び反映
□ Phase B 完了 docs (本 docs) §7 学び反映
□ env scan strict match (NEXT_PUBLIC_COALTER_MIRROR_* / 等)
□ hidden / bidi Unicode 0
□ test (mirror + presence + 関連 coalter) full PASS
□ vitest / tsc / eslint clean
```

CEO 補正があれば本 checklist を更新、Phase C 全 PR で踏襲。
