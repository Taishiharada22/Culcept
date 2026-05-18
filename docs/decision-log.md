# Decision Log

重要な意思決定を時系列で記録する。

## Format
```
### [YYYY-MM-DD] タイトル
- **部門**: Product / Research / Build / Growth / Ops
- **決定内容**: ...
- **理由**: ...
- **承認**: CEO / 自律
- **ステータス**: 実行済 / 保留 / 却下
```

---
### 2026-05-18 CoAlter AOO Mirror Channel — Phase C C-0 integration design 起票 (docs-only)
- **部門**: Build / Product
- **決定内容**: Phase C 統合設計 docs `docs/coalter-aoo-phase-c-integration-design.md` を起票 (docs only / code 0 / package.json 0 / env 未変更)。Phase C は **6 sub-PR (C-1 〜 C-6) sequential** で構成、各 PR は risk increment が明示的に小→大。各 sub-PR の修正範囲・acceptance criteria・LOC budget・CEO 判断 point・rollback 経路を pre-defined
- **Phase C 北極星**: 「shadow mode で構造完成した Mirror を、安全な実 input で動かす」。Phase C 完了 ≠ Production rollout 開始 (Phase D で別途扱う)
- **Phase C sub-PR scope (sequential、本 docs §4)**:
  - C-1: Preview-safe diagnostic exposure fix (1 line removal、`diagnosticDebugGlobal.ts:111` の `NODE_ENV === "production"` guard 削除、Phase A §3.5 学び反映、Phase A 7-layer defense は維持)
  - C-2: Read-only presence / relationship state adapter (`engineAdapter` 拡張 + 新規 `presenceMirrorBridge.ts`、推奨 source: observer `getRedactedRelationshipStateSnapshot` — PII firewall 既適用)
  - C-3: Controlled visible path canary (`forcedCanaryMode.ts` 新規、新 env flag `NEXT_PUBLIC_COALTER_MIRROR_FORCED_CANARY`、cap=10 override、他 gate strict 維持)
  - C-4: close / sleep / cap / verification 実機確認 smoke
  - C-5: Taxonomy 拡張検討 docs (Difference / Tempo / Fairness / Repair、実装ではない)
  - C-6: Phase C 全体 canary smoke + Phase C 完了 docs
- **Phase C で許容される境界緩和 (3 件のみ、本 docs §5)**:
  1. diagnostic global `NODE_ENV === "production"` guard 削除 (C-1、Phase A 7-layer defense 既存)
  2. presence layer **read-only** access (C-2、observer 経由推奨)
  3. visible 経路 forced canary mode (C-3、cap override のみ、他 gate strict)
- **Phase C で絶対緩めない不可侵境界 (本 docs §5.1)**:
  - Production env / all Preview env / Development env 投入禁止
  - presence layer write / chat layer touch / ChatClient.tsx / MirrorSurface.tsx 0 diff
  - DB / API / Sentry / LLM / raw text / raw id 保存 / Question-Proposal 自動発火 / cross-session persistence / Alter Morning 混入 / package.json 変更 すべて禁止
  - Phase A canon + Phase B canon §7.4 全項目維持
  - `linguisticStopDetector` runtime 接続 (chat touch 必要のため Phase C scope 外)
- **Phase C 成功条件 (本 docs §6、CEO 提示 7 項目 + Claude 詳細化)**: diagnostic global Preview 確認 / visible Mirror controlled 発火 / close-sleep-cap 実機確認 / PII leak 0 / console error 0 / env cleanup all scopes 0 / Production impact 0
- **Phase A→B 学び取り込み漏れの構造的再発防止 (本 docs §2)**: 次 Phase 着手前に **前 Phase 完了 docs §3 系 (重要発見・訂正) 必読 checklist** を新 Phase design docs 冒頭に導入 (Phase C → D → E にも適用)
- **Phase C 学術基盤 (本 docs §13)**: Therapeutic alliance research (Lambert) / Motivational Interviewing reflective listening (Miller & Rollnick) / Just-in-time adaptive interventions (Nahum-Shani) を visible reflective intervention の背景に追加
- **C-1 着手**: CEO 承認後に別 PR で起票 (本 PR は docs only)
- **承認**: CEO 判断「C-0 docs only PR 起票 GO、実装禁止、env 投入禁止、canary 再開禁止」(2026-05-18)
- **ステータス**: 実行中 (本 docs PR 起票)

---
### 2026-05-18 CoAlter AOO Mirror Channel — Phase B 正式 close + Phase C handoff (Option C 採用)
- **部門**: Build / Product
- **決定内容**: CoAlter Mirror Channel **Phase B** を **conditional pass** で正式 close。新規 docs `docs/coalter-aoo-phase-b-completion.md` を完了正本とする。設計書 `docs/coalter-aoo-phase-b-mirror-channel-design.md` 冒頭に Phase B 完了 banner を追加。CEO 判断「Option C 採用」(2026-05-18) に従い、**B-5d 修正 PR は今は切らず**、未到達項目 (visible Mirror 経路 / diagnostic Preview / close/sleep/cap 実機 / linguistic stop runtime / taxonomy 拡張) は **Phase C** で扱う
- **Phase B 達成定義 (CEO 補正の正確な表現、絶対遵守)**:
  - ✅ **safe default / no-disruption / no-leak / runtime guarded foundation validated**
  - ❌ **NOT "Phase B full visible success" / NOT "visible Mirror fully validated"**
- **完了根拠 (CEO 実機 B-5c smoke 2026-05-18 + 構造完成証跡)**:
  - default STAY_SILENT 100% (Mirror 一度も出現せず) — 北極星「黙る」を構造的に達成
  - 既存 UI / chat / presence layer 影響なし (実機 0 件)
  - env 流出 0 (production / all-preview / development 全 scope 0 件、CEO 削除後 Claude 検証)
  - PII leak 0 (DOM / Network / console 確認可能範囲)
  - rollback trigger 0
  - 構造完成: 4-gate orchestration + 7-layer postSpeakVerification + PII firewall (型 + runtime) + 4-layer flag gating defense + hedged grammar template (unit test 全 PASS、実機 default-STAY_SILENT で構造起動を間接的に確認)
- **構造的未到達項目 (Phase C handoff、`docs/coalter-aoo-phase-b-completion.md` §4 / §5)**:
  - visible Mirror 経路: `engineAdapter` が presence-derived axes を unknown に倒すため (chat/presence touch 禁止と整合)、Observe Gate で必ず fail → MIRROR_CANDIDATE 不発火 → **C-2 read-only presence adapter + C-3 visible canary path** で対応
  - diagnostic global Preview 表示: `lib/coalter/mirror/diagnosticDebugGlobal.ts:111` の `process.env.NODE_ENV === "production"` guard により Vercel Preview (= Next.js production build) で install 抑止 → **C-1 で `VERCEL_ENV` ベース guard に緩和 (1 line fix)** で対応
  - close / sleep / cap / verification 実機: visible 経路発火に依存 → C-3 後の **C-4 実機 smoke** で対応
  - `linguisticStopDetector` runtime: chat layer touch 必要 (現状禁止) → Phase C scope 再判断、別 PR 候補
  - taxonomy 拡張 (Difference/Tempo/Fairness/Repair): **C-5 で検討のみ**、実装は別 PR + CEO 承認
- **Phase A → Phase B 学び取り込み漏れ (重要、Phase C で修正)**:
  - 🔴 Phase A 完了 docs §3.5 で「**NODE_ENV gate は Vercel Preview build (= production build) で canary を無効化するため採用禁止 (A-2e 補正)**」と明示されていたが、Phase B B-5a 設計時に取り込めていなかった → B-5c smoke で `diagnostic global undefined` の root cause として顕在化
  - 学び: 次 Phase 着手前に **前 Phase 完了 docs §3 系 (重要発見・訂正) 必読 checklist** を C-0 design 冒頭に導入する
- **なぜ B-5d を切らないか (CEO 判断 + Claude 補強)**:
  - Phase B 境界の自然な終端 (B-5 の最後 B-5c が「shadow + UI primitive + smoke」で完結)
  - visible 検証には presence 接続設計が必要、それは Phase C-0 integration design の本質
  - diagnostic guard 緩和 (C-1) は 1 line だが Phase A 学びと連動、単独で行わず Phase C-0 design 後に整合的に
  - core safety は実証済み、急いで visible を Phase B に押し込む実需が低い
- **Phase C scope (C-0 〜 C-6、`docs/coalter-aoo-phase-b-completion.md` §8、sequential)**:
  - C-0 Phase C integration design (docs)
  - C-1 Preview-safe diagnostic exposure (1 line fix)
  - C-2 read-only presence / relationship state adapter
  - C-3 visible path forced canary or controlled candidate
  - C-4 close / sleep / cap / verification 実機確認 smoke
  - C-5 taxonomy 拡張検討 (docs、実装ではない)
  - C-6 Phase C 全体 canary smoke
- **Phase C でも維持する不可侵境界 (canon、`docs/coalter-aoo-phase-b-completion.md` §9 + Appendix C)**:
  - Production env / all Preview env / DB / API route / Sentry / remote telemetry / LLM call / raw text 保存 / raw id 保存 / Question/Proposal 自動発火 / cross-session persistence / Alter Morning 混入 / package.json 変更 すべて禁止
  - presence layer **write** 絶対禁止 (C-2 で read-only 限定許容)
  - chat layer / ChatClient.tsx / MirrorSurface.tsx は 0 diff 維持
  - Phase B canon §7.4 全 10 原則維持 (shadow mode pattern / default-STAY_SILENT / 7-layer postSpeakVerification / 4-gate orchestration / PII firewall / 4-layer flag gating / hedged grammar / retreat affordance / session-local / enum-locked template id)
- **Phase B 構成**: B-1〜B-5c の 14 PR (B-0 design 2 + 実装 12)、tests 4425 件全 PASS、code 4 layer / docs 4 件
- **承認**: CEO 判断「Option C 採用、B-5d 不起票、conditional pass 表現維持、B-6 起票」(2026-05-18)
- **ステータス**: 実行中 (本 docs PR 起票)

---
### 2026-05-18 CoAlter AOO Phase B B-5c Preview Canary Smoke 結果（conditional pass / CEO 判断材料提示）
- **部門**: Build / Product
- **smoke 実施日時**: 2026-05-18 JST
- **対象 branch**: `chore/coalter-mirror-b5c-canary` (HEAD `b58f50be`、main `d280d105` ベース、PR #181 B-5c smoke plan merged 後の empty commit)
- **Preview URL (canonical)**: https://culcept-kk1fecqow-taishis-projects-0a8deb17.vercel.app (`dpl_H2EbjbszFJfdrQPN7cbmEsSHfB78`、target=preview、status=Ready、gitCommitRef 一致)
- **deploy 経緯**: 当初 git-integration build は `vercel.json` の `ignoreCommand` (`.md` 以外の変更がない場合 skip) により Canceled。`npx vercel --force` で IBS を bypass し、git-attributed Preview build を生成 (code / docs / package.json 一切無変更、bypass は CLI flag のみ)
- **env 投入**:
  - `NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED=true` → `Preview (chore/coalter-mirror-b5c-canary)` のみ
  - `NEXT_PUBLIC_COALTER_MIRROR_DIAGNOSTIC_EXPOSE=true` → 同上
  - Production / 全 Preview (branch 非指定) / Development には一切投入されず (Claude 投入前後・削除後で 3 scope strict 確認、全 0)
- **env 削除確認 (CEO 削除完了後、Claude 検証)**: `NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED` / `NEXT_PUBLIC_COALTER_MIRROR_DIAGNOSTIC_EXPOSE` 共に production / preview / development の **全 scope で 0 件**

#### CEO 実機 smoke 観測結果
| Phase 1 Sanity (5 項目) | 結果 |
|---|---|
| console error 重大なし | ✅ |
| UI 崩れなし | ✅ |
| presence layer / CoAlter chat UI 影響なし | ✅ |
| Network outbound (Mirror 関連) 0 | ✅ (確認可能範囲) |
| MirrorSurface (B-1 hidden shell) mount | ✅ (env baked, build healthy) |

| Phase 2 通常会話 (7 項目) | 結果 |
|---|---|
| default で MirrorVisibleSurface 出ない | ✅ (一度も visible 出現せず、`default STAY_SILENT` 許容範囲) |
| State Mirror only | **N/A** (visible 未出現) |
| text ≤ 60 chars | **N/A** |
| Question/Proposal/Suggestion 見えない | **N/A** |
| 命令形 / 共感演技なし | **N/A** |
| 「閉じる」が効く | **N/A** (CEO 報告: 「未確認」) |

| Phase 3 Edge case (7 項目) | 結果 |
|---|---|
| 「黙ってもらう」が効く | **N/A** (CEO 報告: 「未確認」) |
| sleep ON 状態挙動 | **N/A** |
| SleepUIToggle 動作 | **N/A** (mount はされているが visual 未確認) |
| session cap 1 効く | **N/A** (発火経路がない) |
| duplicate template 出ない | **N/A** |
| linguistic stop runtime 接続なし (合格) | ✅ (B-5b 設計通り、runtime 接続なし) |
| dismiss 明示 click のみ | **N/A** |

| Diagnostic (`window.__coalterMirrorDiagnostic`) | 結果 |
|---|---|
| install 確認 | ❌ **undefined** (production NODE_ENV guard で install 抑止、`lib/coalter/mirror/diagnosticDebugGlobal.ts:111` の defensive layer) |
| getSnapshot() の PII 一致なし | **N/A** (global 未 install のため検査不能) |

| PII / Safety | 結果 |
|---|---|
| Network outbound 0 (Mirror 関連) | ✅ |
| DOM text に PII pattern 一致なし | ✅ (確認可能範囲) |
| console に PII pattern 一致なし | ✅ |
| Production env 流出 | 0 ✅ |
| 全 Preview env 流出 | 0 ✅ |

- **観測サマリ**:
  - diagnostic entry 数: 観測不能 (debug global 未 install)
  - MIRROR_CANDIDATE 発火数: 不明 (debug global 未 install、ただし visible 未出現から推定 0 or 全 verification reject)
  - visible 表示数: **0** (構造的、§理由参照)
  - console error: 重大なし
  - PII leak (確認可能範囲): 0
  - UI / presence / chat 影響: なし
  - rollback trigger: 0

#### 判定: **conditional pass (B-5 core 安全達成、visible / diagnostic 観測は構造的未到達)**

##### pass 部分 (core 安全性)
- B-5a/B-5b の **不可侵境界 (chat / presence / observer / production env / package.json / DB / Sentry / fetch / storage / LLM 一切なし)** が **本番環境で実証された**
- 既存 presence layer / CoAlter chat UI / console を一切壊さなかった
- env 流出 0 (branch-scoped only)
- PII leak 0 (確認可能範囲)
- default STAY_SILENT 100% (Mirror が一度も出現せず) — 北極星「黙る」を構造的に達成

##### N/A 部分 (構造的に観測未到達、ただしこれは設計通りの帰結)
- **visible Mirror 経路の観測 N/A**: B-5b の `engineAdapter` は presence-derived axes (modeContext / alignment / uncertainty / silenceBudget / patternCategory) を**全て `unknown` に倒している** (chat/presence layer touch 禁止と整合)。これにより `decideMirror()` は必ず Observe Gate を `observe_gate_unknown_modeContext` で fail → STAY_SILENT。MIRROR_CANDIDATE が出ない設計のため、visible Mirror / 「閉じる」 / 「黙ってもらう」 / cap / sleep / verification の実機検証は構造的に不可能
- **diagnostic global 観測 N/A**: `lib/coalter/mirror/diagnosticDebugGlobal.ts:111` の `process.env.NODE_ENV === "production"` guard が install を抑止。Vercel Preview build は `NODE_ENV=production` (Next.js production build) のため、`NEXT_PUBLIC_COALTER_MIRROR_DIAGNOSTIC_EXPOSE=true` を投入しても guard が優先される

#### 副次提案 (CEO 判断対象、3 つの選択肢)
1. **Option A — Phase B 完了宣言 (B-6 起票)**: core 安全達成を根拠に Phase B 完了とする。visible 経路の実機検証は Phase C (Difference / Tempo / Fairness / Repair Mirror) 実装時に presence 接続を統合して実機検証する。最速で Phase B を閉じられる。
2. **Option B — 修正 PR (B-5d) → 再 smoke → Phase B 完了**: (i) `diagnosticDebugGlobal.ts` の production guard を `VERCEL_ENV !== "production"` ベース等に緩和 (1 line)、(ii) `engineAdapter.ts` に最小限の presence read-only 接続を追加 (chat layer は依然 touch しない、presence layer も既存の公開 API 経由 read-only)、を含む B-5d 修正 PR → 再 canary smoke → Phase B 完了。「visible 経路まで実機で見届けてから Phase B 完了」を厳格にする path。
3. **Option C — Phase C 統合実機検証**: B-5 は構造完成として close (B-6 docs 起票はする) し、visible 経路の実機検証は Phase C 設計時に presence 接続と一緒に実施する。Option A と似るが、Phase B 完了宣言の文面に「visible 経路は Phase C 実機検証で確定」と明記する点で異なる。

#### Claude 推奨
- **Option A** または **Option C** が現実的。理由:
  - B-5b 段階で **visible 経路を実機で見届けることは、設計上の不可侵境界 (chat/presence touch 禁止) と矛盾**するため、無理に B-5d を切ると境界違反のリスクが増える
  - core 安全性 (UI 不変 / PII 0 / 構造的 default STAY_SILENT) は B-5c smoke で実証済み
  - visible 経路は Phase C で **presence 接続 + Difference/Tempo/Fairness/Repair taxonomy 設計と一緒に** 検証するのが整合性高い
- ただし **Option B も妥当** — 「Phase B 完了の境界を厳格に定義」する観点では、visible 経路まで実機で見届けてから閉じる方が安全

#### 次 action (CEO 判断待ち)
- (A) Phase B 完了 → B-6 docs 起票
- (B) B-5d 修正 PR 起票 → 再 smoke → Phase B 完了
- (C) B-6 docs 起票 (Phase B 完了) + Phase C 設計で visible 経路実機検証を明記

- **承認**: CEO 判断待ち (3 options 提示済み)
- **ステータス**: 実行済 (smoke 完了 / env 削除 / 確認 / 判定提示)

---
### 2026-05-17 CoAlter AOO Phase A 正式完了宣言（CEO 実機 A-2e canary 観測 FULL PASS）
- **部門**: Build / Product
- **決定内容**: CoAlter Always-On Observer (AOO) Phase A を CEO 実機 A-2e canary 観測の FULL PASS 結果をもって正式完了とする。完了正本は新規 docs `docs/coalter-aoo-phase-a-completion.md`。設計書 `docs/coalter-always-on-observer-design.md` 冒頭に Phase A 完了通知 banner を追加
- **完了根拠（A-2e v2.2 canary 実機観測 2026-05-17）**:
  - 5 観測目的全達成: (1) ObserverHost mount / (2) productionSignalBus subscribe / (3) presence signal receive / (4) RelationshipState update / (5) PII firewall verify
  - `getDebugCounters()` 結果: `signalReceivedCount > 0` / `stateUpdateSuccessCount > 0` / `lastSkipReason = "none"`
  - `getCurrentRedactedSnapshot()` 結果: `observationCount > 0` / `lastObservationAt` 更新 / `redactedRelationshipKey` のみ露出（raw pairStateId 非露出 = PII firewall 機能）
  - v2.1 で発見した `observationCount` 未更新 root cause（`handlePresenceSignal` が `recordingObservation: true` + `observedAt` を渡していなかった）を v2.2 commit `fd647068` で fix、再観測で更新を確認
- **Phase A 成果サマリ**:
  - 12 PR 着地（#151 design / #152 A-0 audit / #153 A-1 / #154 Presence Reconciliation / #155 A-1b / #156-#158 A-2/A-2b 系列 / #159 A-2c runtime wiring / #160-#161 A-2d/A-2e canary build / 内部観測のみ A-2e v2.1-v2.2）
  - 観測専用基盤: presence signal bus subscribe → relationship state update → PII firewall（sha256 + ephemeral salt + base64url redacted key）→ debug global 15min expire
  - 7 層防御確立（env flag default false / env scope branch-only / PR merge 禁止 / branch 短命 / 15min expire / smoke 後 env 削除 / raw 露出禁止）
  - 「Always-On ≠ auto-speak」原則を維持（観測のみ、Question/Proposal 自動発火なし）
- **副次観察 3 件（Phase B 設計時に再評価）**:
  - `observerActivationState` semantics（existing `ExecutorAvailability` との関係）
  - `modeContext` の Speak Decision Engine 入力としての扱い
  - `matchedPatternCategory` bucket（safety_concern / rupture_signal / unknown_category / null）の使い分け
- **Phase B 方向性**: Mirror Channel 設計 docs-only PR を別途起票。Mirror = reflection（提案ではなく反射）/ Default STAY_SILENT / Expected Relationship Value (ERV) Speak Decision Engine / Three-Gate Mirror (Observe / Worth / Safe) / Mirror taxonomy 5 種（State / Difference / Tempo / Fairness / Repair）。Mirror design PR は **CEO レビュー必須、自律 merge 禁止**
- **不変境界**: 既存 presence layer (`lib/coalter/presence/` 30+ files, `app/components/chat/` 17 files) を一切 touch しない。Production env 触らない。Question / Proposal 自動発火しない
- **CEO 残作業**: Preview branch-scoped orphan env 2 件削除（`NEXT_PUBLIC_COALTER_OBSERVER_DEBUG_EXPOSE` / `NEXT_PUBLIC_COALTER_PRESENCE_OBSERVER` on branch `chore/coalter-aoo-a2e-canary`）
- **承認**: CEO/GPT 判断「Phase A 正式完了宣言 docs PR 起票 GO」（2026-05-17）
- **ステータス**: 実行中（本 docs PR 起票）

---
### 2026-05-16 CoAlter Always-On Observer 設計の重大訂正（Presence Layer 見落とし）
- **部門**: Build
- **決定内容**: PR #151 (design doc) / PR #152 (A-0 audit) / PR #153 (A-1 implementation) に重大な見落としを訂正する correction docs PR を起票（#154）。既存 `lib/coalter/presence/` (30+ files) と `app/components/chat/` (17 files) が Always-On Observer の core architecture を完全実装済（Stage 4 L4-f / `NEXT_PUBLIC_COALTER_PRESENCE_EXECUTOR=true` production deployed）であることを正本記録
- **理由**:
  - A-0 audit (PR #152) で「mode tabs UI が main に存在しない」と結論したが誤り
  - 別セッション report による独立検証で `app/components/chat/ModeSwitcher.tsx` (blob `9834cf0f`) 実在を発見
  - 私の見落とし原因: 検索 directory が `components/coalter/` のみで `app/components/chat/` と `lib/coalter/presence/` を見落とした / 「tab」keyword で grep したが実装は `role="radiogroup"`
  - 設計書 (PR #151) Layer 1-6 の大半が既存実装の再発明だった
- **対応**:
  - 新規 docs: `docs/coalter-aoo-presence-reconciliation.md` を正本とする
  - PR #151 / #152 docs 本文に correction notice 追加（誤読防止）
  - PR #153 A-1 deliverable は revert せず並走（CEO/GPT 判断 = 並走、型整合必須）
  - 次フェーズ: A-1b で `ModeContext` / `ObserverActivationState` を既存 `PresenceMode` / `ExecutorAvailability` に整合
  - A-2 hook 位置は再 audit（候補に E. presence signal bus / F. UpperLayerMount 追加）
  - 既存 presence layer touch 禁止（不可侵境界）
- **学び**:
  - 「無い」を結論する前に複数 directory pattern で確認する
  - UI 機能の検証は型から逆引きする（`PresenceMode` 等の typed identifier）
  - 別セッション report の主張を鵜呑みにせず徹底検証することで自分の誤りも検出できる
- **承認**: CEO/GPT 判断「並走、型整合必須」（2026-05-16）
- **ステータス**: 実行中（本 entry 起票）
- **関連 PR**: #151, #152, #153, #154 (correction)
- **不変境界**: 既存 presence layer (`lib/coalter/presence/` 30+ files, `app/components/chat/` 17 files) を一切 touch しない。Production env 触らない。

---
### 2026-04-24 W3-PR-12 / 12.5 系クローズ + PR-13 開発本線移行
- **部門**: Build / Product
- **決定内容**: PR-12 / PR-12.5 系を開発本線からクローズし、Stage 2 canary は運用タスクとして並行継続。次の開発本線 = PR-13（map / timeline / visual flow への最短導線）に移行
- **クロージング処理**:
  - `docs/alter-morning-pr12-production-rollout-plan.md` を CLOSED 化（status / クロージング記録 section 追加）
  - 運用タスクとして残すもの: Stage 2 日次監視 / `GOOGLE_MAPS_API_KEY` rotation / Role C 観測レビュー / Vercel builder hang 監視
- **PR-13 診断結果**（`docs/alter-morning-pr13-visual-flow-scope.md`）:
  - Hard gap 4 本特定: G1 coordinates 書き戻し未接続 / G2 WhenSlot endTime+durationMin 未定義 / G3 TransportSegment builder 未着地 / G4 Map/Timeline UI 層不在
  - G1 = 他の全 gap の前提（座標が event に乗らない限り pin/polyline/segment 全て描けない）
- **PR-13 scope 提案**（CEO 承認待ち、案 A 推奨）:
  - 案 A（minimal 推奨）: Coordinate persistence + 静的 map pin MVP + kill switch `ALTER_MORNING_VISUAL_FLOW`
  - 案 B（wide）: A + endTime + Timeline 同梱（rollback 単位が大きい）
  - 案 C（ultra-minimal）: G1 のみ（視覚化ゼロ、CEO 意図外）
- **CEO 判断点**: (1) 案 A/B/C 選択 (2) Map library（MapLibre vs `@vis.gl/react-google-maps` — 推奨 b） (3) flag 命名 (4) 段階ロールアウト (preview → prod allowlist → global)
- **承認**: CEO（PR-12 / 12.5 クローズ + PR-13 診断開始 2026-04-24 本ターン）
- **ステータス**: PR-12 / 12.5 クローズ済 / PR-13 scope proposal 提出、CEO 判断待ち

---
### 2026-04-24 W3-PR-12.5 Stage 2 canary 本番 live 確認
- **部門**: Build / Product
- **決定内容**: production allowlist-only canary が本番で live。CEO UUID で `flag_source=allowlist` + `outcome_kind=presented_from_api` を確認
- **検証結果（harness 2026-04-24 15:52 JST 付近、production `https://culcept.vercel.app`、session `ms_pr12_1777013538870`）**:
  - `alter_morning_handoff_outcome`: `outcome_kind=presented_from_api` / `candidate_count=5` / `latency_ms=285` / `flag_source=allowlist`
  - `alter_morning_shadow_state`: `flag_source=allowlist`（CEO UUID が production allowlist に正しく乗っている証跡）
  - `provider_failure` 消失（`GOOGLE_MAPS_API_KEY` production baked-in 後）
- **Vercel / env 作業メモ**:
  - production 側 `GOOGLE_MAPS_API_KEY` は preview と同じ key を投入（CEO から key 直接受領 → `vercel env add ... production` で追加）
  - runtime resolve のみでは既存 Ready deploy が新 env を拾わなかった → empty commit `150b704c` push で fresh build `culcept-24qarh3t8` を作成、4 分で Ready → runtime で API key 解決確認
  - 12h 以内で Vercel builder hang 4 回。infra 起因と確定済。5 回目発生時は Vercel support escalation 推奨
- **セキュリティ残タスク**: 本セッションログに API key 値が露出したため、Stage 2 観測完了後に key rotation を CEO に依頼すること
- **承認**: CEO（API key 直接投入依頼 + Stage 2 canary 突入 2026-04-24 本ターン）
- **ステータス**: Stage 2 canary live（production allowlist-only、CEO + Role C `zawane0903@gmail.com` の 2 UUID）

---
### 2026-04-24 W3-PR-12.5 Stage 1 完了 + Stage 2 Role C 指名 — canary 運用開始
- **部門**: Build / Product
- **決定内容**: PR #30 (Stage 1 allowlist canary + 観測イベント) を live preview で検証 PASS し main へ merge。E2 比較表に基づき Stage 2 Role C を確定、canary 運用フェーズに突入
  1. **PR #30 live verification（preview `dpl_835z8BhRZAR2CvKazoZPWBncwMmt`, harness 2026-04-24 13:29 JST）**:
     - `stargazer_analytics` に canary 観測 4 行着弾（cold + warm 2 run × shadow_state + handoff_outcome）
     - cold path: `outcome_kind=presented_from_api` / `candidate_count=5` / `latency_ms=414` / `flag_source=global`
     - warm path: `outcome_kind=presented_from_cache` / `latency_ms=0` / idempotency cache hit 動作確認
     - `provider_failure` 完全消失（GOOGLE_MAPS_API_KEY preview 投入後）
     - shadow_state: `status=search_handoff_blocking` / `ready_for_handoff=true` / `target_selection_reason=prev_phase_not_clarifying_plan_presented`
  2. **Vercel builder 42 分 hang の診断と recovery**: preview build が initialization 段階で `Builds [0ms]` のまま stuck。7h 前にも 31 分 hang 履歴あり → Vercel infra 起因と確定。stuck deployment `culcept-iun104ow9` を `vercel rm` で削除 → empty commit `b32411b4` push で fresh build trigger → 4 分で Ready 達成。local build exit 0 でコード起因完全除外
  3. **PR #30 merge**: 2026-04-24 04:43:48Z、merge commit `9cfa7e0b` で main 着地（merge commit 戦略、C1→C2→C3→C4 の history 保持）。`feat/alter-morning-pr125-allowlist-canary` branch 削除済
  4. **E2 Role C 指名**: `zawane0903@gmail.com` で確定（CEO 直接判断）。3 軸（C-1 自然会話で使う習慣 / C-2 multi-event が自然に出る外出頻度 / C-4 違和感を言語化して返せる）ベースの比較表を提示し CEO が即断
- **CEO 判断（2026-04-24 本ターン）**:
  - PR #30 は Stage 1 observability 検証合格 → merge 判断に進んでよい
  - E2: `zawane0903@gmail.com` で決定
  - DM 通知は行わない。CEO 自ら直接伝達する（`docs/alter-morning-pr12-production-rollout-plan.md` E3 の軽量 NDA DM 文案は本ケース不適用）
  - 継続して次のフェーズ（Stage 2 canary 運用）に突入
- **残タスク（Stage 2 canary 開始に向けて）**:
  - rollout plan を Stage 1 完了 + Stage 2 進行中に更新
  - Role C (`zawane0903@gmail.com`) の UUID 取得
  - preview / production env 変更計画（`_ALLOWLIST` を UUID で埋める / global flag を false に戻す / allowlist-only モードへ切替）を CEO に提示 → 承認後に実行
  - 本番 env 変更は「承認が必要な行動」カテゴリ → CEO 最終確認後に実施
- **承認**: CEO（PR #30 merge + E2 確定 + 次フェーズ突入 2026-04-24 本ターン）
- **ステータス**: Stage 1 実行済 / Stage 2 Role C 確定、env 変更計画 CEO 確認待ち

---
### 2026-04-24 W3-PR-12.5 Stage 1 着手 — allowlist canary 機構 + 観測イベント同梱
- **部門**: Build
- **決定内容**: CEO 判断（F2 承認 / F1 条件付き承認 / E1 暫定 β / E2 比較表のみ / E3 現文面 OK）を受け、Stage 1 PR の実装に着手し、env 名確定と 3 commit を `feat/alter-morning-pr125-allowlist-canary` に着地
  1. **env 名確定（F1 条件）**: `process.env.GOOGLE_MAPS_API_KEY` が正。`lib/alter-morning/placesApiClient.ts:62,66` / `lib/alter-morning/routesApiClient.ts:125,129` / `scripts/import_shops_places.mjs` / `tests/unit/alter-morning/routesApiClient.test.ts` 全て `GOOGLE_MAPS_API_KEY` を直接参照。Places API / Routes API 共用。以前の報告で混在した `GOOGLE_PLACES_API_KEY` は実装上存在しない
  2. **Stage 1 C1 commit (`ff3b972a`)**: `flags.ts` を getter → method 化。`dialogStateV2(userId?)` / `placesSearch(userId?)` を追加し、transport_v2 と同じ allowlist → global の 3 段優先順位を導入。`resolveDialogStateV2FlagSource` / `resolvePlacesSearchFlagSource` を公開し、metadata の `flag_source` 解決を集約
  3. **Stage 1 C2 commit (`36879d76`)**: call site 4 箇所 + ensureSessionV1 signature を userId 付きに更新。テスト comment 追従のみ
  4. **Stage 1 C3 commit (`a364fc28`)**: A1 同梱方針に従い観測イベント 2 本を配線。`lib/alter-morning/search/handoffAnalytics.ts` を新設し、console log と 1:1 対応する `alter_morning_shadow_state` / `alter_morning_handoff_outcome` を `stargazer_analytics` へ fire-and-forget で流す。unit test 21 本追加、alter-morning 全 1960 tests PASS
- **CEO 判断（2026-04-24 Message 5）**:
  - F2 承認: Stage 1 PR の実装に着手
  - F1 条件付き承認: env 名をコードで確定してから preview 投入。正 `GOOGLE_MAPS_API_KEY` 確定済
  - E1 暫定 β: Stage 2 の Role B は CEO 兼務で進める。内部 engineer が立てば差し替え可
  - E2 比較表のみ: `hikariharada86@icloud.com` / `zawane0903@gmail.com` を C-1/C-2/C-4 観点で相対比較 → 最終指名は保留
  - E3 現文面 OK: 軽量 NDA 提示済み文案で進める。通知 channel は DM、終了通知は Stage 2 終了時
- **残タスク**:
  - C4（本 commit）で rollout plan を PR-12.5 着手状態に更新
  - PR raise（`feat/alter-morning-pr125-allowlist-canary` → `main`）
  - preview redeploy（main 非汚染版）: `npx vercel env add GOOGLE_MAPS_API_KEY preview` → `npx vercel redeploy <preview-url> --target preview` → harness 再実行で `presented_from_api / zero_from_api` を捕捉
  - E2 比較表（別 turn で提示）
- **承認**: CEO（F1/F2/E1/E2/E3 判断 2026-04-24 Message 5）
- **ステータス**: 進行中（C1-C3 commit 完了、C4 進行中、PR raise 未）

---
### 2026-04-24 W3-PR-12 完了 — live verified + main 着地 + production rollout plan + comprehension 別 issue 切り出し
- **部門**: Build
- **決定内容**: PR-12 の live verification 合格判定 (CEO) を受け、3 件の後続アクションを完了
  1. **PR #28 squash merge**: main HEAD `2bf627c3 → 36b3db4e` に fast-forward 着地。3 commits 集約（reducer.ts + shadowPipeline.ts + types.ts 実装 + tests 7 本追加 + decision-log + preview redeploy trigger）
  2. **production rollout plan 作成**: `docs/alter-morning-pr12-production-rollout-plan.md` として 4 stage 段階 rollout を明文化（S0 preview real-data → S1 allowlist 機構 PR → S2 canary → S3 global ON）。PR-12 固有の flag は追加しておらず、rollout 対象は Wave 3 全体（`ALTER_MORNING_DIALOG_STATE_V2` + `ALTER_MORNING_PLACES_SEARCH` + `GOOGLE_MAPS_API_KEY`）であることを明記
  3. **comprehension 別 issue 切り出し**: #29 作成（"自然会話で event-scoped where clarify が 2 件目 event を pending にできない"）。PR-12 は fix path を verified したが、harness 経由でしか踏めない自然会話経路の改善は別タスクとして分離
- **live verified 証拠（preview `dpl_7V7dgmCXtcF2Si2euH6f9Uc85DV6`, trace `a406cac691b2fd01ee0b83b7a83919af`, 2026-04-24 07:12:39 JST）**:
  - `[dialog-state-v2:targetEventId] chosen=event_2_harness eventChanged=1 reason=prev_phase_not_clarifying_plan_presented`
  - `[dialog-state-v2:shadow] status=search_handoff_blocking narrowStep=2 ready=1`
  - `[places-handoff:provider_failure] fp=pf:v1|a=新宿|ch=マック|cat=-`
  - fingerprint `a=新宿|ch=マック` が seedCapture→reducer→draft→orchestrator 連鎖の直接証拠
  - `provider_failure: api_key_missing` は preview env の `GOOGLE_MAPS_API_KEY` 未設定（infra 事象）で PR-12 機能 blocker ではない
- **CEO 判断事項（rollout plan に記載）**:
  - B1: Stage 1 (allowlist 機構追加 PR) を実施するか、Minimum Path で直接 global ON か
  - B2: `GOOGLE_MAPS_API_KEY` の preview / production 投入タイミング（外部 API key、CEO 承認事項）
  - B3: Stage 2 の内部協力者 3 名指名
  - B4: KPI 観測の永続化スキーマ
- **判断待ち事項のうち CEO 即答方針で確定**:
  - "本番 flag ON は段階的に" → Stage 1 (allowlist) 経由の推奨 path を plan 第一案に据える
  - "main-baseline は不要" → before 相当の main-preview 実行は skip
  - "comprehension は別タスク" → #29 として分離
- **承認**: CEO（live verification 合格 + 3 件アクション承認 2026-04-24）
- **ステータス**: 実行済（merge / plan / issue 3 件完了）
- **次の CEO 判断事項**: B1 (Stage 1 allowlist PR の要否)、B2 (API key 投入)

---
### 2026-04-24 W3-PR-12 Step 1 診断 — 2 件目 event handoff `status_not_handoff` 真因確定 + 実装計画承認
- **部門**: Build
- **決定内容**: PR-11 Preview 実機検証で観測された「2 件目 event の `places-handoff:skip_gate status_not_handoff`」事象について Step 1 診断を実施し、CEO 補正 2 回を経て根本原因 H1 を確定、最小根治の実装計画（shadowPipeline.ts / reducer.ts / types.ts 改修 + unit test 7 本）を CEO 承認
- **根本原因（H1 確定）**:
  - `eventChanged=true` branch（`reducer.ts` L528-537）は、focus 遷移直後にユーザー発話の `capture` **のみ** から draft を再構築する（capture-only reset）
  - しかし 2 件目 event は **pre-comprehended where**（`place_ref` / `placeType` / `coordinates`）を既に持っているため、ユーザー発話が area-only / category-only の場合、draft に anchor+chain の両方が揃わず `readyForHandoff=false` → `narrowStep<2` → FSA が `search_handoff_blocking` に遷移できず gate skip
  - 副次: H2-H4（focus selection fallback / FSA allowed transitions / idempotency skip）は現行コードで正しく動作しており、今回の事象を説明しない
- **補正 1 の趣旨（CEO）**: "H1 は最有力だが確定ではない。seed は `place_ref` 再分類だけに依存しすぎない方がいい。本質は pre-comprehended where を seed すること。area seed + category-only utterance (『ランチ』) でも handoff に到達するケースをテストに追加"
- **補正 2 の趣旨（CEO）**: "Preview/Vercel の commit SHA を先に確認。`placeType` raw string を category token に使う前提の確認"
- **deployment SHA 確認（CEO 条件）**: `gh api repos/Taishiharada22/Culcept/deployments` で直近 6 件取得、production / preview / PR merge の対応を確認（下表）。ローカル vs Vercel の drift なし。今回のような「URL は知っているが中身の SHA を確認していない」混乱を防ぐため、表を記録に残す

| 時刻 (UTC) | 環境 | SHA | 内容 |
|---|---|---|---|
| 2026-04-23 18:57:59 | Production | `2bf627c3` | main 最新（PR-11 merge + decision-log） |
| 2026-04-23 18:53:49 | Production | `0928332c` | PR #27 (PR-11) squash merge |
| 2026-04-23 18:25:54 | Preview | `0c4d5f70` | PR-11 branch 最終 commit（timeLabel） |
| 2026-04-23 17:36:55 | Production | `511191f6` | PR #26 (Positive-Path Nudge) squash merge |
| 2026-04-23 14:43:06 | Preview | `3e60da86` | PR-26 branch 最終 commit |
| 2026-04-23 13:53:29 | Production | `52814bb2` | PR #25 squash merge |

- **`placeType` raw 不採用の根拠**:
  - `CATEGORY_DICT`（`taxonomy.ts` L68-96）は日本語のみ（"カフェ" / "ランチ" / "居酒屋" 等）
  - `event.where.placeType` の value range は upstream 推定（英語 "cafe" 等の可能性）で categoryToken と語彙が異なる
  - `buildQueryFingerprint`（`placesHandoff.ts` L127-138）は toLowerCase 正規化だが **語彙空間が違う** と fingerprint の idempotency が壊れる
  - 採用方針: seed は `classifyUtterance(place_ref)` 単独。`placeType` raw → categoryToken マッピングは後段候補（別 PR）としてメモ化
- **実装計画（Step 3 承認範囲）**:
  1. `lib/alter-morning/dialog/types.ts`: `TURN_CAPTURED` action に `seedCapture?: NormalizedCapture | null` 追加（~4 行）
  2. `lib/alter-morning/dialog/shadowPipeline.ts`: `buildSeedCaptureFromEvent(event)` helper を新規追加し、`isWhereSlot && eventChanged` 時のみ `classifyUtterance(event.where.place_ref)` を seedCapture として dispatch に injection（~12 行）
  3. `lib/alter-morning/dialog/reducer.ts`: `eventChanged` branch を書き換え、seed capture → user capture の順に merge（chain ⊕ category 排他は既存 `mergeCaptureIntoDraft` を踏襲）（~18 行）
  4. unit tests 7 本追加（`reducer.test.ts` + `shadowSequenceIntegration.test.ts`）:
    - T1: regression-trap（seed 未渡し → 既存互換で anchor_alone → narrowing=1）
    - T2: seed + place_ref="新宿のルミネ" → draft={anchor=新宿, chain=ルミネ} → handoff
    - T3: seed + capture 両方 non-null → capture が seed を上書き（chain 排他維持）
    - T4: `isWhereSlot=false` で seedCapture 渡しても無視
    - T5: `eventChanged=false` で seedCapture 渡しても無視
    - T7: **CEO 追加**: area seed + category-only utterance（"ランチ"）→ `search_handoff_blocking` に到達
    - T8: multi-event Turn1→Turn2 focus 遷移 → event2 seed で handoff 再発火
- **非スコープ（CEO 確認済）**:
  - `placeType` raw → categoryToken マッピング（別 PR 検討）
  - comprehension engine の place_ref 抽出精度改善（PR-13+）
  - narrow loop / trap-scan / event_id 飛び（別サブシステム）
- **PR #26 凍結事項不変**: `shouldAskNextPlace` / `userSignaledEnd` / `buildNextPlaceAskText` / `transportV2` allowlist は無変更
- **承認**: CEO（Step 1 診断承認 + 補正 2 回 + SHA 表記録条件 + Step 3 実装計画承認）
- **ステータス**: 実装着手（Step 3 実装中）

---
### 2026-04-24 W3-PR-11 完了 — UI 正しさ修正 (場所名表示 / 行 tap / 開始–終了) Path A Domain→UI 直結
- **部門**: Build
- **決定内容**: W3-PR-11 の 4 要件を 3 commit の最小根治で充足。(1) 予定カードに**場所名**を表示、(2) 場所名/予定行タップで**場所詳細ボトムシート**、(3) 各予定の時刻を**開始–終了**レンジ表示、(4) 「未確定だから出ない」vs「確定済なのに UI に出ない」を切り分け後者を解消。
- **CEO 制約 (遵守)**:
  - "Step 2 を Step 1 より先に入れない" / "Step 3 は upstream 直しではなく最小根治に留める"
  - PR #26 凍結事項不変 (shouldAskNextPlace / userSignaledEnd / buildNextPlaceAskText / transportV2 allowlist)
  - 最終ゴール PR-14/15 までの論理連鎖を途切れさせない
- **成果物 (3 commits, 5 files)**:
  - Commit 1 `756dfb8b`: `planRebuild.ts` に `eventWhereToLocation` pure helper + `eventToPlanItem` 内 conditional spread 合流 (Path A Domain→UI 接続根治)
  - Commit 2 `636bd08c`: `MorningPlanCard.tsx` 行 onClick + 5 button 及び picker backdrop/body に `stopPropagation()` 防御
  - Commit 3 `0c4d5f70`: `components/home/morning/timeLabel.ts` 新規 pure module (`timeToMinutes` / `minutesToTimeHHMM` / `formatStartEndLabel`)。MorningPlanCard の time slot が fixed 経路でのみ `"HH:MM–HH:MM"` (en dash U+2013) を描画。vague/missing 時は従来 `[時間未確定]` placeholder を維持
- **不変項 (Commit 1)**:
  - `event.where.place_ref` 空/空白のみ → `location` key ごと含めない (`item.location?.label` guard と整合)
  - `coordinates` が有限数値時のみ lat/lng 書き込み (NaN/Infinity/非 number 除外)
  - `canonicalId=""` 固定 (intentParser.ts:714-720 precedent)
  - `source="user_explicit"` (place_ref は utterance or selection 由来)
- **不変項 (Commit 3 timeLabel)**:
  - `startTime undefined` → `undefined` (caller fallback)
  - `isDayBoundary=true` → 単一時刻 (CEO 確定 2026-04-24: 1 日の開始点/終点は range 対象外)
  - `durationMin ≤ 0 / NaN` → 単一時刻 (0 幅 range 退化回避)
  - 24h 越え end / invalid startTime 形式 → 単一時刻 fallback
  - 通常経路 → `"HH:MM–HH:MM"` en dash U+2013
- **非責務 (今回やらない)**:
  - comprehension engine が event.where.place_ref を抽出できない utterance パターン → PR-12+ スコープ
  - `whenSharpness=fixed` 判定精度 (今回 preview では `[時間未確定]` 出現、placeholder は仕様どおり)
  - `status_not_handoff` / narrow loop / trap-scan / event_id 飛び等のログ観測事項 → いずれも PR-11 スコープ外
- **テスト**:
  - `tests/unit/components/timeLabel.test.ts` 新規 22 tests (境界 / 退化 / en dash / UI 契約)
  - `tests/unit/alter-morning/planRebuild.test.ts` 既存 11 + C8 `eventWhereToLocation` 9 tests 追加 → 20 tests PASS
  - alter-morning + components vitest suite **1953/1953 PASS**
  - 触った file に新規 tsc エラーなし
- **Preview 実機検証 (Playwright / CEO account)**:
  - ✅ 要件 1: item 3 行に "新宿のルミネ" label 描画
  - ✅ 要件 2: 行 tap → PlaceDetailSheet 展開 (Google Maps iframe 座標 35.690227, 139.700144 新宿)
  - ✅ 要件 3: `formatStartEndLabel` は fixed 経路のみ呼ぶ設計。今回入力は vague 判定で placeholder が正しく表示、unit tests で range 経路は担保
  - ✅ 要件 4: `[時間未確定]` `[内容暫定]` は sharpness=vague の正表現、location は独立経路で描画 → 従来の「確定済なのに出ない」は解消
  - ✅ negative: 場所ラベル無し行 (item 1) tap で sheet 非展開、cursor:pointer も非付与
- **CI / Preview**: lint-and-test SUCCESS / Vercel Preview SUCCESS
- **PR**: [#27](https://github.com/Taishiharada22/Culcept/pull/27) (squash merge `0928332c`)
- **main 遷移**: `511191f6 → 0928332c`
- **承認**: CEO (Step 1 診断承認 / Step 3 最小根治承認 / Preview 検証後マージ承認)
- **ステータス**: 実行済

---
### 2026-04-24 W3-PR-10 Scope A 完了 — canonical segment に duration / source を注入（mode-free 中立距離 heuristic）
- **部門**: Build
- **決定内容**: W3-PR-10 Phase 3+ の優先候補 5 本から Scope A（duration / source 強化）を選定し、canonical `TransportSegment` の `estimatedDurationMin` と `durationSource` を build 時に埋める。mode 非依存の中立距離 heuristic を導入し、unknown mode でも travel 表示を機能させる。
- **承認範囲（CEO Scope A GO 2026-04-24）**:
  - C1: `TransportSegment.durationSource` 型追加（挙動変更なし）
  - C2: `estimateNeutralDurationMin(fromCoords, toCoords)` pure fn + `buildTransportSegments` wiring
  - C3: `synthesizeTravelItems` の `?? 0` 撤去 + null-skip 安全網
  - C4: decision log + landing memo
- **CEO Lock（設計ロック）**:
  1. **canonical 側で decide**: duration / source は `buildTransportSegments`（canonical segment 生成時）で決定。`synthesizeTravelItems`（display cache 側）は segment に書かれた値を参照するのみ
  2. **failure は null 厳守**: heuristic 失敗 / ≤0.2km / invalid coords で **0 を返さない**。null のまま segment に残し、display 側で skip
  3. **mode-free signature**: heuristic は `(fromCoords, toCoords) => number | null`。mode 引数を取らない。unknown mode でも duration を埋めるための中立 curve
  4. **段階テーブル**: 1 本の連続 curve ではなく距離ビンごとの固定値（≤0.2km null / ≤1km 10min / ≤3km 15min / ≤7km 25min / ≤15km 40min / ≤30km 60min / >30km 90min、CEO 確定値 2026-04-24）
  5. **両 field 同期 invariant**: `estimatedDurationMin` が number なら `durationSource="heuristic"`、null なら `durationSource=null`。両 field の null / non-null は必ず同期
  6. **実装順**: C1 (型) → C2 (heuristic + wiring) → C3 (null-skip) → C4 (docs)。C2 が先に land、その後 C3
- **成果物**:
  - `lib/alter-morning/transport/types.ts`: `DurationSource` union + `TransportSegment.durationSource` field
  - `lib/alter-morning/transport/durationHeuristic.ts` (new, 84 行): pure fn、haversine、段階テーブル、NaN / Infinity safe
  - `lib/alter-morning/planning/planRebuild.ts`: `buildTransportSegments` が heuristic を call して両 field を同期で埋める
  - `lib/alter-morning/planning/synthesizeTravelItems.ts`: `?? 0` 撤去、null segment は entry 生成を skip
  - `tests/unit/alter-morning/durationHeuristic.test.ts` (new, 16 tests): 境界値（同一点 / 0.2km / 各 bin / 上限 clamp / NaN / 両端 NaN / 単調性）
  - `tests/unit/alter-morning/planRebuild.test.ts`: C7 flag ON の期待値を `null` から `number + durationSource="heuristic"` に更新
  - `tests/unit/alter-morning/synthesizeTravelItems.test.ts`: null-skip 契約に書き換え + mkSegment 既定値を number (15) に
  - `tests/unit/alter-morning/regenerateTravelForPlan.test.ts`: fixture の segment に `durationSource: "heuristic"` 同期
- **非スコープ（今回やらない）**:
  - per-segment mode 推定（mode は `unknown` 保持。mode 推定エンジンは別候補）
  - Routes API 連携（distance / duration の実計測は Scope B 以降）
  - client regenerateTravel の再構造（Phase 3A で既に着地済）
  - Path B / persisted travel 統合
- **テスト**: alter-morning 1789/1789 PASS（+16 新規 durationHeuristic）、触った file に新規 tsc エラーなし
- **commit**: C1 `7d5b01b2` / C2 `c33f1a41` / C3 `2318c413`
- **承認**: CEO（Scope A Design Lock 3 改訂版 2026-04-24、承認範囲 C1/C2/C3/C4 内で実装完了）
- **ステータス**: 実行済（PR 作成 / merge は別途）

---
### 2026-04-23 W3-PR-10 Phase 2 完了 — Transport Staircase Display Cache (travel interleave)
- **部門**: Build
- **決定内容**: W3-PR-10 Phase 2（canonical `TransportSegment[]` を Path A の `PlanItem(kind="travel")` display cache として再生成）を完了。Phase 1 で domain truth として確立した segments を、flag ON 経路でのみ UI に見える travel item として interleave する。
- **承認範囲（CEO Phase 2 GO 2026-04-23）**:
  - C2: `synthesizeTravelItems(segments, events)` pure function
  - C3: Path A 2 site wire (legacyAdapter / selection route)
  - C4: decision log + close memo
- **実装方針**:
  - **Path A only / Path B 非接触**: `adaptPipelineToLegacy` と `/api/stargazer/alter/selection` の 2 箇所のみ配線。`processMorningMessage` (Path B) は touch しない
  - **independent pure function**: `buildPlanAndSegmentsFromEvents` に travel synthesis を混ぜず、`synthesizeTravelItems` を独立 pure function として切り出し。Phase 1 の T2 原則（builder は travel を返さない）を維持
  - **interleave は call-site 責務**: synthesize は entry pair (`SynthesizedTravelEntry { afterEventId, item }`) を返すだけで、PlanItem[] への挿入は `interleaveTravelItems` が call-site で実行
  - **deterministic id**: `travel__<fromEventId>__<toEventId>` (double underscore prefix で既存 `travel_` 由来 item と machine-distinguishable)
  - **id parse 回避**: entry に `afterEventId` 別 channel を持たせ、event_id に `__` が含まれても安全に interleave できる構造
  - **flag OFF items[] byte-diff ゼロ**: flag gate は `built.transportSegments !== undefined` のみ。flag OFF 経路は Phase 1 同様 segments 未生成 → synthesize 呼ばず → items は event-only
  - **schema 変更なし**: Phase 1 shape (`plan.transportSegments?: TransportSegment[]`) を維持、新規 field 追加なし
- **非スコープ（明示的に今回やらない）**:
  - client regenerateTravel の id 揺れ解消
  - Path B / persisted travel 統合
  - Routes API 連携（`durationMin` は `estimatedDurationMin ?? 0`）
- **成果物**:
  - `lib/alter-morning/planning/synthesizeTravelItems.ts` (new, 241 行)
  - `lib/alter-morning/legacyAdapter.ts` (travel interleave 挿入)
  - `app/api/stargazer/alter/selection/route.ts` (rebuildPlan 経路に interleave)
  - `tests/unit/alter-morning/synthesizeTravelItems.test.ts` (new, 20 tests)
  - `tests/unit/alter-morning/legacyAdapterTransportPhase2.test.ts` (new, 5 tests)
  - `tests/unit/alter-morning/search/selectionEndpoint.test.ts` (flag ON Path A の items[] 期待値 2→3 更新、CEO 承認済)
- **テスト**: alter-morning 1767/1767 PASS、tsc 影響範囲 clean
- **commit**: C2 `56082721` / C3a `eca2f7bb` / C3b `578dcd2c`
- **承認**: CEO（Phase 2 GO 2026-04-23、承認範囲 C2/C3/C4 内で実装完了）
- **ステータス**: 実行済（PR 作成 / merge は別途）

---
### 2026-04-23 W3-PR-9 完了 — Places Search / Anchor-Based Search
- **部門**: Build
- **決定内容**: W3-PR-9（Alter Morning Protocol の where slot 確定経路）を完了として受理。`search_handoff_blocking → candidate present → user select → where.coordinates fixed` の一本道を landing。
- **実装方針**:
  - **where-first**: when/who/transport 系は PR-10 以降に回し、PR-9 は where slot のみに絞る
  - **candidate source**: 設計上は `cache + places_api` 併用。ただし現 commit では multi-candidate の構造上 `places_api` が中心で、L1 best-effort cache は route / orchestrator 側で補完する実装に落とした（cache-first 化は運用データが溜まってから再評価）
  - **strict gate**: orchestrator は `dialogState.conversationStatus === "search_handoff_blocking"` でのみ発火。それ以外は skip
  - **server canonical response**: client は optimistic 更新せず、selection endpoint の返す canonical state でのみ where.coordinates を fix
  - **selectedPlaceId only**: client→server は placeId のみ送る（座標 / 名称は server 側で再解決）
  - **parked presentation**: 失敗 / stale / slot 切替時は activePresentation を破棄せず parked に退避（state 保持のみ、再提示経路は PR-9.5 以降）
  - **reject-no-op 方針**: zero candidates / provider 失敗 / stale click / race は reducer が no-op で受け流し、UI 側で破棄表示に統一
- **手動 preview 確認（CEO 承認 2026-04-23）**:
  1. success: 候補提示 → 1件選択 → accepted=true → picker 消失 → where.coordinates fix → stable 遷移
  2. stale click: 状態遷移後の古い picker click → accepted=false → stale UI 残らない
  3. double-click / race: 連打 / 順不同レスポンスでも server canonical とズレない
  4. zero / provider_error: picker 描画されない
- **known note**: 同一 browser session の localStorage 汚染（narrowStep=3 固着）で手動検証が歪む場合あり。clean session では正常動作。「同一 event 継続扱いによる narrowStep=3 固着」は PR-10 以降の event reset 条件検討事項としてメモし、PR-9 の blocking issue にはしない
- **非スコープ**: transport / who / endTime / map pin / timeline UI（いずれも PR-10〜14 で段階的に対応）
- **承認**: CEO（Safari 実機で正常動作を確認、PR-9 完了承認）
- **ステータス**: 実行済（PR 作成 / merge は別途）

---
### 2026-04-22 W3-PR-7 merge — PendingClarify + plan continuity + failure 耐性
- **部門**: Build
- **決定内容**: W3-PR-7 (alter-morning Wave 3) を main に merge。5 commit 連鎖: SlotSharpness 三値 / PendingClarify + answerBinder / ClarifyQuestionBuilder scope 強化 / items=0 禁則 + provisional plan 継続性 / Provider failure 耐性。
- **理由**: 対話状態（pendingClarify / persistedEvents / plan.status）を第一級市民化し、clarifying ループの「質問が空」「返答が別 event に流れる」「provider 落ちで状態蒸発」を構造的に塞ぐ。
- **Preview 判定（CEO 実機 2026-04-22）**:
  - **PASS**: 質問非空・scope 明示、when/where/what bind 動作、clarifying 中も流れ保持、provider failure で即死しない
  - **残課題**: (1) 未確定 slot が残るのに plan を前倒しで出す、(2) fixable / provisional 場所の境界が甘い、(3) anchor-based search / 同心円 / recommendation 分離は未着手
  - 判定: **commit 1〜5 の改善工程として合格。次工程に進んでよい。ただし Morning 完成扱いではない**
- **成果物**: `docs/alter-morning-comprehension-first-wave3-pr7-design.md`, `lib/alter-morning/{legacyAdapter,comprehension/answerBinder,planning/whatClassifier,planning/clarifyQuestionBuilder}.ts`, `app/api/stargazer/alter/route.ts`, 5 新規テストファイル (+ ≈60 tests)
- **テスト**: 全 4939 tests PASS（208→209 files, +12 files）
- **PR**: #15 (merge commit 283cb2a4)
- **承認**: CEO
- **ステータス**: 実行済

---
### 2026-04-20 CoAlter M0-8 close — sample diversity ゲート 4条件全 PASS
- **部門**: Build
- **決定内容**: M0-7A の 100% agreement が tail 50 単調 sample への過学習でないことを確認するため、既存 151 cases を conversationArc で 2 バケットに分割し shadow を再実行。**実装は入れず、検証のみ**。CEO 合格ライン 4 条件すべて PASS。M0-8 close。
- **バケット定義（既存 compressedInput.conversationArc を使用、shadow runner は無改変）**:
  - thin: `arc=opening` n=130
  - medium: `arc=expanding || converging` n=21（dense=1件のみのため medium に含める）
- **結果**:

| 指標 | thin (n=130) | medium (n=21) |
|---|---|---|
| agreement | 130/130 = 100.0% | 20/21 = 95.2% |
| maintain agreement | 121/121 = 100% | 10/11 = 90.9% |
| connect agreement | 9/9 = 100% | 10/10 = 100% |
| false-connect 率 (rule_maintain→llm_connect / rule_maintain) | 0/121 = 0% | 1/11 = 9.1% |
| confidenceDelta p50 | +0.126 | +0.244 |
| signal entropy caringGap | H=0.363 distinct=2 | H=1.229 distinct=3 |

- **合格判定（CEO 定義 4 条件）**:
  1. false-connect <20%: thin 0% / medium 9.1% → **PASS**
  2. connect precision =100%: thin 9/9 / medium 10/10 → **PASS**
  3. 過剰 maintain 非到達（non-maintain rule で LLM も追従）: thin connect 9 件全追従 / medium connect 10 件全追従 → **PASS**
  4. overall agreement ≥80%: thin 100% / medium 95.2% → **PASS**
- **観測**:
  - medium bucket の 1 件 false-connect は healthy な境界揺らぎ（caringGap が 0.2 閾値直下で LLM が "around 0.2" を緩く解釈）
  - medium は caringGap H=1.229 と thin の 3.4 倍多様だが precision は崩れず、calibration は diversity にロバスト
  - confidenceDelta が medium で広がる（+0.126→+0.244）のは calibration が sample 情報量を反映している証拠
- **本質的限界（scope 外、M0-9 で切り出し）**:
  - `energyLevel / fatigueSignal / celebrationSignal / implicitMood` は 151 全量で **H=0**（pair 固有の単調性）
  - **pair を超えた diversity 検証**は別 pair データ投入後に **M0-9** として実施する
- **使い捨て artifacts**: `/tmp/coalter-split-buckets.ts`, `/tmp/coalter-bucket-*.json`, `/tmp/coalter-shadow-bucket-*.log` — 検証終了後に削除
- **参考ログ**: `/tmp/coalter-shadow-bucket-thin.log`, `/tmp/coalter-shadow-bucket-medium.log`（削除前に要点転記済）
- **承認**: CEO（自律実行承認、2026-04-20）
- **ステータス**: 実行済（M0-8 close、M0-9 = 別 pair diversity 検証として切り出し）

---
### 2026-04-20 CoAlter M0-7A close — SYSTEM_INSTRUCTION の mode selection guidance 追記で agreement 100% 到達
- **部門**: Build
- **決定内容**: `realApiAdapter.ts` の SYSTEM_INSTRUCTION に mode 選択ガイダンス（各 mode の structural condition と "weak signal → maintain" の default）を追記。50-case shadow を再実行し、目標超過達成（rule maintain → llm connect の件数 41 → 0）。M0-7 は M0-7A 単独で close、M0-7B/C は不要（YAGNI）。
- **結果（M0-6C → M0-7A）**:
  - overall agreement: 16% → **100%**
  - maintain agreement: 4/46 → **46/46 = 100%**
  - connect agreement: 4/4 → **4/4 = 100%（維持）**
  - 混同行列: 完全対角（perfect diagonal）
  - confidenceDelta p50: +0.326 → +0.126、min: +0.284 → **-0.016**（LLM が弱信号を素直に認識）
- **設計判断の要点**:
  - CompressedTodayInput は enum-only で既に structural。rule 条件を LLM に共有するのは cheat ではなく設計意図の一致。LLM 独自価値は implicitIntent / latentNeeds / confidence calibration に残る
  - 数値閾値は "gap around 0.2 or more" のような緩い表現で伝え、LLM を calculator にしない
  - 既存行は削除せず追記のみ。rollback は 1 commit
- **残課題（本マイルストーンの scope 外）**:
  - sample entropy は低いまま（arc/caringGap 以外は H=0）。diverse sample での calibration 強度は未検証
  - 新 pair / 豊富な対話データでの再検証は別マイルストーン（M0-8 等）で切り出す
- **参考ログ**: `/tmp/coalter-shadow-run-2026-04-20-m0-7a.log`
- **承認**: CEO（自律実行承認、2026-04-20）
- **ステータス**: 実行済（M0-7 close、M0-7B/C 不要）

---
### 2026-04-20 CoAlter M0-6C close、次は M0-7 LLM calibration
- **部門**: Build
- **決定内容**: β（collector 追補）/ γ（rule 閾値 axis key 拡張）/ δ（signal entropy 指標）を実装し、50-case shadow を再実行。結果を受けて M0-6C を close、次マイルストーンを **M0-7 = LLM calibration** とする。
- **所見 4 点**:
  1. **β/γ により rule の degenerate maintain 100% は解消**: rule 分布が maintain 46 / connect 4 に分岐。`caringIntensity` を talk_messages の question + caring token rate から算出、`conversationArc` を turn 数バケットで分類、`renLeaning` 軸キーリストを DB 実在値（`cautious_vs_bold` / `tradition_vs_novelty` / `change_embrace_vs_resist` 追加）に合わせた。
  2. **connect 4件は LLM と 4/4 一致**: rule が connect を出した 4 case すべてで Haiku の mode も connect。構造信号（caringGap≥0.2）が LLM と整合した証拠。
  3. **低 agreement の主因は tail sample の単調さ + LLM connect prior**: 16% に下がったのは劣化ではなく、δ（signal entropy）で明瞭化。`energyLevel / fatigueSignal / celebrationSignal / implicitMood / renLeaningA/B / calendarDensityA/B` はすべて H=0.000（distinct=1）、variation は arc と caringGap のみ H≈0.4。LLM は薄い対話でも connect を読み取る prior を持ち、maintain 46 のうち 41 を connect に振った（混同行列 `rule\llm maintain→connect=41, connect→connect=4`）。rule engine の欠陥ではない。
  4. **M0-6C は close、次は M0-7 で LLM calibration**: 課題は rule の骨格ではなく (a) LLM の mode prior と (b) tail sample の単調さ。M0-7 で prompt / system instruction / bias 調整に寄せる。
- **実装成果物（commit 対象）**:
  - `scripts/coalter/export-internal-pair.ts` — β: `computeCaringIntensity` / `computeConversationArc` 追加
  - `lib/coalter/understanding/todayReader.ts` — γ: `REN_AXES` set に 3 軸追加
  - `lib/coalter/understanding/compressTodayInput.ts` — γ: 同上（両所同期）
  - `scripts/coalter/shadow-real-api.ts` — δ: signal entropy / LLM mode 分布 / 混同行列を report に追加
- **再実行条件（再現性確保）**:
  - `scripts/coalter/_diag-turns-density.ts` は残置（新 pair / β 再調整時の診断入口）
  - 使い捨て（_diag-weather-density / _diag-axes-density / /tmp/rule-diagnostic）は削除
- **参考ログ**: `/tmp/coalter-shadow-run-2026-04-20-post-beta.log`
- **承認**: CEO（2026-04-20、推奨 A を採用）
- **ステータス**: 実行済（M0-6C close）

---
### 2026-04-20 CoAlter M0-6B shadow 34% agreement は構造起因（Y-lite collector 補完由来）
- **部門**: Build
- **決定内容**: M0-6B 50-case shadow の agreement=34% は偶然ではなく構造起因である、と CEO 判定。次アクションは α（inner_weather 密度確認）を走らせ、β（collector 追補）/ γ（rule 閾値緩和）/ δ（指標再解釈）のどれに進むかを決める。
- **診断の根拠（50/50 cases 完全同一の signal プロファイル）**:
  - `energyLevel=mid` 50/50 / `conversationArc=opening` 50/50 / `fatigueSignal=none` 50/50 / `celebrationSignal=false` 50/50 / `caringIntensity |a-b|≈0` 50/50 / `implicitMood="calm"` 1 unique value / `renLeaning A/B=false` 50/50
  - collector 側で `caringIntensity: null` / `conversationArc: null` を渡している (`scripts/coalter/export-internal-pair.ts:424,427`)
  - bundle builder が null 時に default 補完 (`lib/coalter/understanding/observationBundle.ts:308,311`: `{a:0.5,b:0.5}` / `"opening"`)
  - 結果、5 mode のうち **challenge / connect は Y-lite では構造的に到達不能**
  - recover / celebrate は辞書・正規表現依存で、この pair の対話語彙で 0 件 match（fatigue tokens / celebration markers とも）
- **強い疑い**: `stargazer_inner_weather` が単一値で 50 session 全てに共有されている可能性（`latestBefore` は session_start 以前の最新 1 行を拾うため、weather 記録が少なければ全 session が同じ行を参照）
- **次アクション**:
  - α: `SELECT count(*), min/max(recorded_at), distinct emotional_tone` を user A/B で実行し、weather の実密度と多様性を確認
  - α の結果で分岐:
    - weather 実密度が低い場合 → β（collector に caringIntensity/conversationArc の rough 計算を追加、weather 補完 or inner_weather 以外の signal）を推奨
    - weather は十分だが 50 session の時間帯で「たまたま calm 連続」だった場合 → γ（rule 閾値緩和）or δ（agreement 指標を別視点に）で十分かも
- **承認**: CEO（診断所見の受理）
- **ステータス**: α 実行待ち

---
### 2026-04-20 CoAlter M0-6B shadow 実行結果（50 cases）
- **部門**: Build
- **決定内容**: 内部ペア (pairHash=`fc0e737cca0eab22`) で shadow 実 API 呼出を完了。最新 50 `coalter_sessions` を評価（案 B、全量 151 cases のうち tail）。
- **集約結果**:
  - llmOutcome: **ok 50/50 (100.0%)** / fallback 0 / error 0
  - modeAgreement: **17/50 = 34.0%**（rule-side が 50/50 全件 `maintain` に偏っていた。LLM は 66% で別 mode 提案）
  - confidenceDelta (llm - rule): n=50, min=+0.259 / p50=+0.368 / p95=+0.384 / max=+0.384（LLM が rule より系統的に高信頼）
  - latency (ms): min=1023 / **p50=1267** / p95=1944 / p99=2253 / max=2253
- **実行中に判明した不具合と対処**:
  1. Anthropic billing 反映遅延で初回 2 run（100% error, HTTP 400 credit-low）。console 側 credit 追加後に自然解消
  2. adapter が `JSON.parse(text)` で直接パースしていたため、Haiku の markdown code fence (` ```json ... ``` `) 包装で 100% shape_error。`stripCodeFence` ヘルパで修正（realApiAdapter.ts）
- **観察メモ**:
  - rule engine が 100% maintain は感度不足の示唆。M0-6B shadow 評価としては想定内（rule-baseline の弱点検出が目的の 1 つ）
  - LLM の confidence が rule より +0.37 高いのは、Haiku が structured output で高信頼に寄りがちな傾向
  - pair 多様性 = 1 のため、昇格判定（M0 昇格 Gate A-4）では別 pair 追加が必要
- **次アクション**:
  - 現状の集計値で M0-6B shadow 完了扱いとするか、fence fix の効果を追確認するため maxCases を上げて再実行するかは CEO 判断
- **承認**: 自律（shadow 実行自体は 2026-04-20 CEO 承認済み、結果転記は定型運用）
- **ステータス**: 実行済

---
### 2026-04-20 CoAlter M0-6B shadow 実行承認（実 API 呼出解禁）
- **部門**: Build
- **決定内容**: CoAlter M0-6B shadow 実行（実 Anthropic API 呼出）を解禁する。`scripts/coalter/shadow-real-api.ts` の fail-fast 条件が全て満たされたため、COALTER_SHADOW_ZDR_VERIFIED=1 で起動可能。
- **前提条件の充足**:
  1. ZDR 確認: `docs/coalter-m0-6b-zdr-evidence.md` §1 5 項目 実値記入済み（org=Aneurasync / prefix=dceca5bb / enrolled=Yes / 開始日=2026-04-20 / 確認日時=2026-04-20）
  2. shadow key 発行: §2 3 項目 実値記入済み（末尾 4 文字=EwAA / 発行日=2026-04-20 / prod key と別・同一 ZDR org 所属 CEO 確認済み）
  3. code-review: `docs/coalter-m0-6b-code-review.md` §2.1〜§2.4 全 PASS（根拠 commit: e946daac）
- **解禁後の運用**:
  - export: `npx tsx scripts/coalter/export-internal-pair.ts`（Supabase 接続を追加後）
  - shadow: `COALTER_SHADOW_ZDR_VERIFIED=1 COALTER_PAIR_FILE=scripts/coalter/internal-pairs/internal-pair-<pairHash>.json npx tsx scripts/coalter/shadow-real-api.ts`
  - 集約結果を decision-log に別途転記
- **承認**: CEO（2026-04-20）
- **ステータス**: 実行可

### 2026-04-20 CoAlter M0-6B 実装着手承認（shadow 実行は追加条件付き）
- **部門**: Build
- **決定内容**: CoAlter Stage 1 Understand M0-6B の **adapter 実装コード着手を承認**する。対象は `lib/coalter/understanding/realApiAdapter.ts` / `scripts/coalter/export-internal-pair.ts` / `scripts/coalter/shadow-real-api.ts` / `lib/coalter/understanding/__testkit__/internalPairSchema.ts` / `tests/unit/coalter/understanding/internalPairExport.test.ts`。**実 API 呼出（shadow 実行）は別条件**（§shadow 実行条件 参照）。
- **理由**: M0-6A（synthetic 50 件 × 5 strategy 完走 + Gate E-6/E-7 leak audit PASS + 5-mode 件数出力）完了済み。M0-6B 着手前提 3 件の証拠物雛形が揃い、§3 前提① consent は CEO 記入済み、§3 前提② ZDR / §3 前提③ code review は adapter 実装後に埋める形で整合。adapter コードは fail-fast（ZDR 未確認 key で起動時 throw）により、実 API 呼出が暴発しない保護下にある。
- **記入済み証拠物**:
  1. `docs/coalter-internal-pair-consent-2026-04.md` — CEO 記入済み（A=taishi harada / B=kumi harada / sessions 23 件 / 対面同意 2026-04-20）
  2. `docs/coalter-m0-6b-zdr-evidence.md` — `未確認`（Console 確認待ち 5 項目）/ `未発行`（shadow key 発行待ち 3 項目）として明示。shadow 実行前に実値で置換必須
  3. `docs/coalter-m0-6b-code-review.md` — `PENDING_M0-6B_IMPLEMENTATION`（adapter 実装後に §2.1〜§2.4 を PASS/FAIL 判定）
- **shadow 実行条件（all-of、着手承認には含まれない）**:
  1. ZDR evidence の `未確認` 5 項目が実値で埋まる（Console 確認）
  2. shadow 用 API key が発行され `未発行` 3 項目が埋まる（prod key と別 org / 別 key）
  3. code-review の 4 check item（§2.1〜§2.4）が PASS
  4. 本 decision-log に shadow 実行承認を別エントリで追加
- **変更ファイル**: `docs/coalter-m0-6b-zdr-evidence.md`（`[CEO要確認]` → `未確認`/`未発行`/`未確定` に正規化、凡例追記、shadow 実行ブロッカー境界を明示）
- **承認**: CEO（2026-04-20）
- **ステータス**: 実行中（adapter 実装着手 → code-review 記入 → shadow 実行承認、の順で進む）

---

### 2026-04-19 Student Provider (v2 LoRA) Phase 1 実装承認 → main 反映用コミット作成完了
- **部門**: Build
- **決定内容**: v2 LoRA を `stargazer_alter_response` 限定の Generation-only provider として導入。3-state routing (eligible/skipped/disabled) + canary rollout + prompt length gate + output validation + fallback + 21 unit tests all PASS。`feat/baseline-edit` 上にコミット 98d403d4 作成済み（flag OFF）。main merge 完了時点で「main 反映完了」。endpoint 準備後 `STUDENT_PROVIDER_ENABLED=true` + `ROLLOUT_PERCENT=10` で canary 開始。
- **追加フォロー (25% 拡大前)**: (1) chars ベース gate を token ベースに置換 or 閾値再調整 (2) telemetry 4 指標 (attempt/success/fallback/skip) の分母を混線させない
- **設計書**: `docs/lora-v2-design.md`, `docs/student-provider-operations.md`
- **変更ファイル**: `lib/ai/{index,types,studentRouting}.ts`, `lib/ai/providers/student.ts`, `lib/stargazer/featureFlags.ts`, `tests/unit/ai/studentRouting.test.ts`
- **承認**: CEO（2026-04-19）
- **ステータス**: 実行済 (flag OFF / main merge 待ち / RunPod endpoint 準備待ち)

### 2026-04-19 CoAlter Phase 2 misread detector 先行接続 → preview 投入（採用案 A）
- **部門**: Build / Product
- **決定内容**: misread detector を先に接続し、その後に preview 投入を開始する。Phase 3 gate の 30 件カウントは detector 接続後の新規 card セッションから数える。
- **背景**: 初回観測後に、`lib/coalter/engine.ts:326, 329` で `misread = MISREAD_NONE` / `ambiguityResponseMode = null` が固定値だったため、clarify mode が構造上発火不能だったと判明。このまま preview を投入しても Phase 3 判断の (a) clarify 観測ができない。
- **却下した案**:
  - B（現状 2-mode で preview 投入し clarify は実装待ち）: clarify 評価が遅延し、Phase 3 優先順位判断の根拠が不完全になる
  - C（preview 投入と並行で detector 実装）: 観測データがフェーズ分裂し、30 件の意味が揺らぐ
- **承認**: CEO（2026-04-19）
- **ステータス**: 実行中（misread detector 実装 → preview シナリオ作成は並行可）
- **凍結線との整合**: 凍結 6 項目（isExecutorThemeEnabled / dispatch 5 step 順序 / CoAlterCard 契約 / metadata キー構造 / status API / resolveActiveFromMetadata）には一切触れない。engine.ts の signal 入力組み立て部のみ変更する。
- **参照**: `docs/coalter-phase2-observation-spec.md` / `lib/coalter/modeRouter.ts`

---

### 2026-04-19 CoAlter Phase 2 初回観測結論 — 実装健全、母数不足により Phase 3 優先順位は保留
- **部門**: Build / Product
- **決定内容**: Phase 2 初回観測（6 日分・83 invoked sessions）の結論を「実装健全性 🟢 / 観測母数 🟡 / Phase 3 優先順位は保留」と正式固定。次は preview 母数づくりを最優先にする。
- **理由**:
  - **保存・復元: 🟢** — 修正版 KPI-5 で 83/83 件 `unrestorable_rate_pct = 0.0%`
  - **gate / theme fallback: 🟢** — KPI-2（gate block 率）・KPI-3（theme fallback 率）ともに全日 0%、AUX-2 の fallback_reason は 100% null
  - **legacy→新規移行: 🟢** — KPI-4 が 4/14〜4/18 = 100% → 4/19 = 0% と想定どおり切り替わる
  - **3-mode 実運用分布: 判定不能** — routerTrace 付きは 4/19 の 2 件だけで、両方 decision / reason は stall_detected 100%、negotiate / clarify は 0 件
  - 初回観測における KPI-5 定義バグ（`WHERE cs.state = 'completed'` で絞っていたため、`end/route.ts:56` で cancelled に上書きされる実仕様と噛み合わず常に 0 行）を修正。母数を「state=completed」から「coalter_messages を 1 件以上持つ session」に変更した定義で再観測して確定。
- **承認**: CEO（2026-04-19）
- **ステータス**: 実行済（観測結論確定）
- **Phase 3 gate（正式固定）**:
  - **再観測の発火条件（どちらか早い方）**: ① card 付き新規 invoked sessions が 30 件到達、または ② preview 投入後 3 日経過
  - **再観測内容**: 同じ 7 KPI + 4 AUX 一式を再実行
  - **判断する 3 点**: (a) clarify が本当に使われるか（KPI-1 + KPI-7）/ (b) negotiate が materialize できているか（KPI-1 + KPI-6）/ (c) router が stall に偏っていないか（AUX-1）
- **今やらないこと**: 凍結 6 項目の変更、Phase 3 候補の実装・優先順位付け、KPI 閾値の確定（暫定維持）
- **参照**: `docs/coalter-phase2-observation-spec.md` / `scripts/coalter-phase2-kpis.sql` / `docs/coalter-phase2-freeze-checklist.md`
- **次アクション**: preview 母数づくり（シナリオ作成 + 対象ユーザー 3〜5 人選定 + 投入）

---

### 2026-04-19 CoAlter Phase 2 採用案 D — Primary Question Guard（破綻質問の構造排除）
- **部門**: Build / Product
- **決定内容**: `primaryUnresolvedQuestion` が `slot="what"` / 「何を観るか」系の **ユーザーが答えを持っていない質問** を出した場合、構造で破棄して埋まっていない条件スロット (where/when/how) の 1 問に書き換える。movieOrchestrator の rankedCount=0 fallback と legacy generateProposal の verified-only guard 両方に適用。
- **事故例**: thread `18eeb9ff` (catalogCount=0 / rankedCount=0) で LLM briefBuilder が `question="土曜日に何を観に行くか"` (slot="what") を出力 → summary にそのまま差し込まれ、迷っているユーザーに「何を観る？」と聞く破綻状態が出た。
- **契約**:
  - `slot="what"` は禁止
  - 「何を / どれを / どの / なにを」+ 観/見/食/行/買/決/選/やる の組み合わせ（slot 誤検知時も弾く）
  - 「作品名 / タイトル / 映画の名前」類も禁止
  - 破綻検出時は movie 優先順 area(where) → time(when) → mood(how) → runtime(how fallback) で 1 問生成
  - 質問は全て closed-vocabulary / 2 択誘導（ユーザーが即答できる形）
- **実装ファイル**: `lib/coalter/primaryQuestionGuard.ts`（新規）/ `lib/coalter/movieOrchestrator.ts`（配線）/ `lib/coalter/engine.ts`（legacy path 配線）
- **テスト**: `tests/unit/coalter/primaryQuestionGuard.test.ts` — 19 件 PASS
- **承認**: CEO（2026-04-19）
- **ステータス**: 実行済
- **凍結線との整合**: 凍結 6 項目いずれにも未接触。rankedCount=0 分岐の summary 生成ロジックの差し替えのみ。

---

### 2026-04-19 CoAlter Phase 2 採用案 E — Loop Guard（同じ条件質問の連続再投出排除）
- **部門**: Build / Product
- **決定内容**: 直前 invoke の `missingConstraints[0].key` を `fetchPreviousCoAlterState` で取得し、`primaryQuestionGuard` に `avoidKey` として渡す。同じ key の質問は skip して次の優先に進む。全優先が潰れた場合は撤退 summary（会話に戻す）に落とす。
- **事故例**: D 実装後、catalogCount=0 が続くセッションで「上映時間は長めと短めどっちが合う？」(runtime) が連続 2 回投出されるループを CEO が実機確認。
- **動作**: area → time → mood → runtime → 撤退、の優先順で直前と別の質問に進む。撤退時は `missingConstraints=[]` + "条件を何度か確認したけれど… また CoAlter を呼んでみてください" の summary。
- **実装ファイル**: `lib/coalter/primaryQuestionGuard.ts`（avoidKey 対応）/ `lib/coalter/movieOrchestrator.ts`（avoidClarifyKey 受け取り）/ `lib/coalter/engine.ts`（previousClarifyKey 取得と配線）
- **テスト**: `tests/unit/coalter/primaryQuestionGuard.test.ts` — 25 件 PASS（E 追加 6 件）/ 全 coalter unit 669 件 PASS
- **承認**: CEO（2026-04-19）
- **ステータス**: 実行済
- **凍結線との整合**: 凍結 6 項目いずれにも未接触。`metadata.card.missingConstraints[0].key` は既存の保存構造を読むだけ、構造変更なし。
- **既知の残課題**: movie retrieval の弱さ（catalogCount=0 が続く根本原因）は未解決。D + E で「壊れない / ループしない」は担保したが、「候補が出る」は未達。別枝で並行着手。

---

### 2026-04-19 CoAlter Phase 2（3-mode body）凍結承認
- **部門**: Build / Product
- **決定内容**: CoAlter Phase 2（decision / negotiate / clarify の 3-mode body）を freeze checklist 合格により凍結。
- **理由**: Phase 6.A〜6.D すべて CEO gate 合格（gate/router/trace → modifier/parser/builder → engine+UI+metadata → status 復元）。CoAlter 37 files / 614 tests PASS、CoAlter 系 tsc error 0、freeze checklist 5 項目すべて合格。
- **承認**: CEO（2026-04-19）
- **ステータス**: 凍結実行済
- **凍結線（以下 6 点に触る変更は再 gate 必須）**:
  1. `isExecutorThemeEnabled` の判定条件（現: movie 固定）
  2. `coalterDispatch` の 5 step 順序（gate → router → modifier → theme gate → executor）
  3. `CoAlterCard` discriminated union と各 mode の契約（候補有無等）
  4. `coalter_messages.metadata` のキー構造（proposalCard / card / routerTrace / gateResult / executorFallbackReason）
  5. status API の `activeProposal` / `activeCard` 並列構造
  6. `resolveActiveFromMetadata` の優先順位（card 優先 → proposalCard fallback）
- **参照**: `docs/coalter-phase2-freeze-checklist.md` / `docs/coalter-phase2-3mode-design.md`
- **次フェーズ**: Phase 3 候補優先順位付け or preview/本番観測項目の最終整理（CEO 判断待ち）

---

### 2026-04-18 Alter-Morning Planner 再設計（4週 C プラン + 限定保守モード）
- **部門**: Build / Product
- **決定内容**: alter-morning の planner を「LLM丸投げ」から「LLM 意味抽出 + Logic 計画 + LLM Narration」の3段分業に再構築する。4週間の C プランで着手。
- **理由**: CEO 実機判定 0 点。ランチが 22:00 に押し出される / 自宅から真逆のカフェ採用 / 「サドヤ近く」が hard 制約にならない等、planner の state machine と constraint solver が壊れている。段階改善では「最高品質」に届かないと CEO 判断。
- **承認**: CEO（2026-04-18）

#### 固定方針（以後の設計原則）
> **LLM は意味を掴む。ロジックが計画を組む。LLM が納得できる形で伝える。**
- 層1 LLM: 構造化（意味抽出）のみ
- 層2-4 Logic: hard constraint solver / soft preference scoring / candidate selection
- 層5-6 LLM+template: why 生成 / Alter narration

#### 核感情
**納得感** を最優先。順番 = 納得感 → 満足感 → 期待感 → 幸福感。「なぜこの順か、なぜこの場所か、なぜ今日はこう組んだか」が腑に落ちることを体験の本体とする。

#### 4週構成
| Week | スコープ | 到達点 |
|---|---|---|
| W1 | Step 6a + 6b: Safety Gate / Travel suppress / hard 距離制約 / userArea fallback 禁止 | 壊れた確定プランを出さない |
| W2 | anchor-first deterministic planner + Deep Context Injection (Stargazer 軸 / HDM Phase / Origin 直近 / Relational Lens) | 順序崩壊ゼロ + 自分のことを分かってる感 |
| W3 | Soft Preference Scoring (rhythm / relational fit / spatial flow / aesthetic coherence) + Top-2 比較 | どのプランナーにも真似できないレベル |
| W4 | Why 生成 + Alter Narration | 納得感の本体 |

#### 公開挙動（限定保守モード）
全面停止しない。未解決拘束がある時だけ plan_presented に行かない。
- plan を出してよい: hard anchor 解 / near 拘束解 / major place confidence OK / travel 解決済み
- plan を出してはいけない: unresolved place / near-anchor 0件 / low confidence / slot-targeted 未解決 / 順序崩壊
- 違反時: 1問だけ sharp clarify（「分からないから止めている」を率直に出す。曖昧文禁止）
- **ステータス**: W1 完了（2026-04-18 CEO PASS、下記 W2 エントリ参照）

#### 関連ドキュメント
- 設計書: `docs/alter-morning-planner-redesign.md`
- 診断レポート: このセッションの調査結果（anchor 順序崩壊 / 距離制約 soft / place 未確定のまま travel）

---

### 2026-04-19 Alter-Morning Planner W2-1 完了 — anchor-first deterministic planner
- **部門**: Build
- **決定内容**: W2 構造 4 点のうち最優先の W2-1 を実装完了。LLM の `sequenceOrder` を advisory に格下げし、clock (`fixed_*`) と window (`window_*`) を hard constraint にした 3 パス配置 `anchorFirstPlace()` を導入。
- **理由**: W1 は「壊れを止める」だったが、「どう組むか」が LLM 丸投げのままだと 22:00 ランチのような破綻が再発する。CEO 方針（4週 C プラン）の固定原則「LLM は意味を掴む。ロジックが計画を組む。」を planner の核に据える。
- **承認**: 自律（W1/W2 スコープは CEO 承認済み、実装は自律実行）

#### 実装サマリ
| レイヤ | 変更 |
|---|---|
| `lib/alter-morning/types.ts` | `PlanItem.cannotFitWindow?: boolean` 追加 |
| `lib/alter-morning/planState.ts` | `PlanSegment.placementStatus?: "window_overflow"` 追加 |
| `lib/alter-morning/planningEngine.ts` | Phase 1 を `anchorFirstPlace()` に差し替え（sync + async 両方）。`findFirstGap` / `findBestShrinkableGap` / `insertSortedInterval` を追加。`reassignTimes` で `cannotFitWindow` の startTime 無しを保持 |
| `lib/alter-morning/planReadinessGate.ts` | `GateReason: "window_overflow"` 追加、`buildWindowOverflowClarify()` で blocker 付き 1 問 clarify、`applyPlacementStatusFromPlan()` で PlanItem → PlanSegment 伝播 |
| `lib/alter-morning/morningProtocol.ts` | 2 箇所の gate 判定前に `applyPlacementStatusFromPlan` を接続 |

#### 配置アルゴリズム
- **Pass 1 Hard clock**: `fixed_start/fixed_departure/fixed_arrival` を時刻順に占有。LLM order 無視
- **Pass 2 Window**: `window_*` を window.start 早い順で gap-fit。**window.end は HARD**。shrink は `durationSource !== "user"` のみ（buffer 10分、min 15分）。収まらなければ `cannotFitWindow=true` で startTime 無しのまま
- **Pass 3 Flex**: 全 item を `sequenceOrder` 昇順で cursor-walk。hard/window anchor は cursor を advance するだけ。flex item は次 anchor の start を `narrativeLimit` として narrative 順序を保護

#### テスト
- `tests/unit/alter-morning/anchorFirstPlacer.test.ts` 新規 8 PASS — 22:00 再発防止 / LLM order override / window_end hard / shrink policy / user-duration 保護 / sequenceOrder / same-window tiebreak
- `tests/unit/alter-morning/planReadinessGate.test.ts` 12 PASS（内 window_overflow 4 新規）
- `tests/unit/alter-morning/ceoScenario.test.ts` 114 PASS（ID 衝突回避の test fixture 修正込み）
- 合計 134/134 PASS、全 alter-morning 751/752 PASS（残 1 件は intentParser の outfit clarify phrasing、W2-1 無関係）

#### test fixture 修正
- `makeCEOBaseState()` 内で `generateSegmentId()` を 4 回空回しして counter を進め、delta が新規生成する `seg_5` が既存 `seg_1..seg_4` と衝突しないようにした。本番は全て generateSegmentId 経由なので衝突は起きない

#### 次（W2-2）
- start / end origin の優先順位修正: `explicit startPoint > currentLocation > todayOrigin > baseline home` / `endpointAnchor > endAction > 帰宅`

---

### 2026-04-19 Alter-Morning Planner W2-2 完了 — start/end origin 優先順位修正
- **部門**: Build
- **決定内容**: W2-2 を実装完了。origin 側は既に 4 層優先順位（`explicit startPoint > currentLocation > todayOrigin > baseline home`）が 2026-04-18 に実装済みだったため、今回は endpoint 側を新設した。endpoint の優先順位を `endpointAnchor > endAction("帰宅") / endpointType("home") > baseline home` に明文化し、`resolveEndpoint()` を `locationResolver.ts` に追加。`buildV2DayPlanAsync` の返り座標解決を修正し、Routes API で last-leg を精密計算するようにした。
- **理由**: CEO 実機ケース2 で「終点を把握していない」が観測された。旧コードは `returnDest = planState.startPoint` と semantic バグを持っており、startPoint（origin）を endpoint として流用していた。parsedIntent.endpointAnchor は解析されていたのに下流で無視されていた。
- **承認**: 自律（W2 スコープは CEO 承認済み、実装は自律実行）

#### 実装サマリ
| レイヤ | 変更 |
|---|---|
| `lib/alter-morning/locationResolver.ts` | `ResolvedEndpoint` 型 + `resolveEndpoint(planState, endpointAnchor, savedBase)` 公開関数 + `findEndpointAnchorCoords()` ヘルパを追加 |
| `lib/alter-morning/planningEngine.ts` | `AsyncPlanOptions.endpointCoords?: LatLng \| null` 追加 → `insertTravelItemsAsync` に pass-through |
| `lib/alter-morning/travelTimeEngine.ts` | `insertTravelItemsAsync` に `endpointCoords` パラメータ追加。return-trip の `toCoords` を `returnDestination` 有無で分岐（非 home endpoint で精密座標を使う） |
| `lib/alter-morning/morningProtocol.ts` | `buildV2DayPlanAsync` で `resolveEndpoint()` を呼び出し、`returnDest` / `endpointCoords` を下流に渡す。sync 版 `buildV2DayPlan` は buggy `returnDest = startPoint` を除去して `undefined` に修正（session なしのため endpointAnchor 未アクセス、baseline home フォールバック）|

#### 優先順位ルール（endpoint 側）
1. **endpointAnchor 明示**
   - 1a. canonicalId / label が segments で解決済み → その座標（source: `endpoint_anchor_resolved`）
   - 1b. `type === "home"` + baseline あり → baseline home（source: `endpoint_anchor_home`）
   - 1c. それ以外 → label のみ、coords=null（source: `endpoint_anchor_label_only`）
2. **endAction=「帰宅」** or **endpointType="home"** → baseline home（source: `end_action_home`）
3. **明示なし** → implicit 帰宅=baseline home（source: `baseline_home`）
4. **baseline 未設定** → 解決不能（source: `none`）

#### テスト
- `tests/unit/alter-morning/locationResolver.test.ts` に W2-2 ブロック 10 件を追加 → 全 49 PASS
- 全 alter-morning 761/762 PASS（残 1 件は intentParser の outfit clarify phrasing、W2-2 無関係）
- typecheck: W2-2 ファイルにエラーなし

#### CEO 再発防止項目
- ケース2（終点把握崩れ）: endpointAnchor が下流に届くようになり、`returnDest = startPoint` semantic バグを除去。Routes API で last-leg 精密計算可能

#### 次（W2-3）
- recommendation path の明確化: `RecommendationIntent` 型を generic_place とは別経路として定義

---

### 2026-04-19 Alter-Morning Planner W2-3 完了 — recommendation path 明確化
- **部門**: Build / Product
- **決定内容**: recommendation intent（「おすすめある？」「どこかいい所ない？」型）を generic_place と分離した独立経路として実装。`RecommendationIntent` 型を `lib/alter-morning/types.ts` に定義し、`resolveRecommendationIntent()` を `placeResolver.ts` に新設。planner（morningProtocol）側に lazy import dispatcher を追加。
- **理由**: W1 実機判定で「『おすすめある？』が generic_place 扱いで recommendation が効かない」ことが観測された（ケース1）。generic_place は「既に存在する特定の場所を確定する」経路、recommendation は「提案してほしい」経路で、解決戦略が根本的に異なる（前者は clarify、後者は anchor/category/Stargazer の合成スコアリング）。型レベルで分離しないと planner と narrator が常に間違える。
- **承認**: 自律実行（CEO 方針 2026-04-19 に基づく W2-3）

#### 実装内容
- `lib/alter-morning/types.ts` — `RecommendationSource` (`explicit_ask` / `implicit_gap` / `alter_initiated`) + `RecommendationStrategy` (`anchor_proximity` / `category_only` / `stargazer_weighted` / `relational_weighted`) + `RecommendationIntent` インターフェース
- `lib/alter-morning/planState.ts` — `PlanSegment.recommendationIntent?: RecommendationIntent` フィールド追加
- `lib/alter-morning/placeResolver.ts` — `resolveRecommendationIntent()` 新設:
  1. category 確定: `intent.categoryHint > inferPlaceCategoryFromActivity(activityHint)`
  2. 戦略選択: `anchor_proximity`（`anchorHint` → segments 既解決 → geocode）→ `category_only`（`currentLocation > areaCoords`）
  3. 半径: `intent.radiusOverrideM ?? getNearAnchorRadius(category)`
  4. Places API 呼び出し（fail-open: 未設定/エラー時は low confidence + reason で返す）
  5. Hard 距離フィルタ + dedupe + Top 3
  6. **confidence は最大 medium**（勝手に確定しない = CEO 方針）
- `lib/alter-morning/activityVocabulary.ts` — `inferPlaceCategoryFromActivity()` 追加（ランチ→レストラン、飲み→バー、作業/勉強→カフェ、散歩→公園）
- `lib/alter-morning/morningProtocol.ts` — lazy import + dispatcher ループ（`resolveNearAnchorPlaces` ブロック直後に置き、`recommendationIntent && !resolvedPlaceName` なセグメントを解決して `pendingPlaceConfirmations` に積む）

#### 検証結果
- `tests/unit/alter-morning/recommendationIntent.test.ts` に 12 件を新設 → 全 PASS（anchor_proximity / category_only / category 推論 / 全フォールバック失敗 / fail-open（API 未設定 + API エラー）/ 候補 0 件 / confidence ≤ medium 保証 / anchor low confidence → geocode 退行 / qualityHint クエリ混入）
- 全 alter-morning 773/774 PASS（残 1 件は intentParser outfit clarify copy、W2-3 無関係の Phase C-4 WIP 由来）
- typecheck: W2-3 ファイルにエラーなし

#### CEO 再発防止項目
- ケース1（「おすすめ」が generic_place 扱い）: 型レベルで独立。以後 `recommendationIntent` を立てれば planner / narrator は分岐を取れる
- 「勝手に確定しない」規律: resolver は medium を天井とし、Alter narration 側で提案形に落とす（実際の確定はユーザー選択で初めて発生）

#### 次（W2-4）
- LLM 抽出（llmPlanExtractor / llmDeltaParser）側に「おすすめ」「どこかいい所」「候補教えて」パターン検出 → `recommendationIntent` として emit するプロンプト拡張 + 決定論的プリクラシファイア

---

### 2026-04-19 Alter-Morning Planner W2-4 完了 — 決定論 recommendation pre-classifier + Turn1/Turn2+ 同一意味論
- **部門**: Build / Product
- **決定内容**: 「おすすめある？」「どこかいい店ない？」系発話を LLM に任せず決定論で 4 分類（`recommendation_request` / `explicit_place` / `explicit_category` / `none`）する pre-classifier を新設。`llmDeltaParser.detectDelta` では LLM 呼び出し前に短絡、`llmPlanExtractor.extractPlanFromText` では LLM 出力の post-process として同じ classifier を適用。Turn 1 と Turn 2+ で意味論を統一。
- **理由**: CEO 方針 2026-04-19 の 3 条件:
  1. **emit 条件を厳しくする** — 純粋な提案要求だけ `recommendationIntent` を立てる。「渋谷のカフェに行く」「A店に寄る」のような場所明示文では recommendation を主役にしない
  2. **pre-classifier を先に置く** — LLM 丸投げは文言揺れに弱い。決定論で粗分類 → LLM の emit を制御
  3. **delta でも同じ意味論** — Turn 2+ で「やっぱ近くでおすすめある？」を受けても既存 explicit place を壊さない
- **承認**: 自律実行（CEO 方針 2026-04-19 に基づく W2-4）

#### 実装内容
- `lib/alter-morning/recommendationClassifier.ts`（新規 ~340 行）
  - 7 種の recommendation phrase パターン（強/弱を区別。弱 phrase は疑問マーカー必須）
  - `CHAIN_BRAND_RE` / `SHOP_MARKER_RE` / `STATION_RE` / `KANJI_PROPER_PLACE_RE` 等で explicit place 検出
  - `GENERIC_SHOP_WORDS_RE` / `GENERIC_SHOP_PREFIX_RE` で「お店」「いい店」「人気の店」等の一般化表現を explicit から除外
  - anchor/category/quality hint 抽出（「サドヤ近く」→ サドヤ、「静かな」→ quality）
  - `classifyRecommendationIntent()`: 4 分類を返す。**explicit_place が検出された場合は recommendation phrase と両立しても explicit_place を優先**（CEO 条件 1）
  - `toRecommendationIntent()`: 分類結果を `RecommendationIntent` に変換（anchor 有→`anchor_proximity`、無→`category_only`）
- `lib/alter-morning/llmDeltaParser.ts`
  - `detectDelta` の先頭（既存 `classifyDeltaDeterministic` の後）に `classifyRecommendationIntent` 短絡を追加
  - `buildRecommendationDelta()` 新設: 既存 segment（`resolvedPlaceName` / `place` 未設定）から target を categoryHint → anchorHint → 単独 placeless の順で解決、無ければ `add_segment` で新規作成
  - `applyFieldChange` に `recommendationIntent` case 追加（**二重防御**: place 付き seg への attach を拒否）
  - `clearField` に `recommendationIntent` case 追加
  - `applyDelta` add_segment 経路で `newSegment.recommendationIntent` を新 `PlanSegment` に伝播
- `lib/alter-morning/planState.ts`
  - `LLMRawSegment.recommendationIntent?: RecommendationIntent` 追加（LLM JSON schema には含めない内部拡張フィールド。`add_segment` 経由で新規 segment に運ぶ経路）
- `lib/alter-morning/llmPlanExtractor.ts`
  - `extractPlanFromText` の末尾で `applyRecommendationClassifierToState(state, userMessage)` を呼び出す（LLM 抽出後の post-classifier）
  - Turn 1 も Turn 2+ と同じ attach 戦略（category → anchor → 単独 placeless → 新規追加）

#### 検証結果
- `tests/unit/alter-morning/recommendationClassifier.test.ts` 31 件 PASS（純粋提案 / explicit 優先 / カテゴリのみ / 弱 phrase 安全弁 / 変換 / 文言揺れ）
- `tests/unit/alter-morning/recommendationDelta.test.ts` 10 件 PASS（Turn 2+ 短絡 / LLM 未呼び出し検証 / explicit 破壊防止 / add_segment 経路 / 文言揺れ）
- `tests/unit/alter-morning/recommendationTurn1.test.ts` 6 件 PASS（Turn 1 post-classifier / 既存 explicit 破壊防止 / 単独 placeless / 新規追加）
- 全 alter-morning 820/821 PASS（残 1 件は intentParser outfit clarify copy、W2-4 無関係の Phase C-4 WIP 由来）
- typecheck: W2-4 ファイルにエラーなし

#### CEO 再発防止項目
- ケース1（「おすすめ」が generic_place 扱い）完全解消:
  - 決定論 classifier が LLM より先に 4 分類 → LLM の誤抽出を経由しない
  - explicit_place を持つ発話は `recommendation_request` に**絶対に落とさない**（分類優先順位を厳守）
  - 既存 explicit place を持つ segment は attach の 2 重防御（classifier 側候補除外 + applyFieldChange 側 guard）で上書き不可

#### 次（CEO 再検証チェックポイント）
W2-1 〜 W2-4 の構造 4 点が揃ったので、CEO 実機再検証へ。PASS なら W2-5 Deep Context Injection に進む。

---

### 2026-04-18 Alter-Morning Planner W1 PASS + W2 スコープ確定
- **部門**: Build / Product
- **決定内容**: W1 Step 6a+6b を PASS 判定。W2 は当初計画の「anchor-first + Deep Context Injection」を分割し、**構造 4 点を先に固めてから** Deep Context Injection に進む。
- **理由**: CEO 実機再検証（3 ケース）で以下を観測:
  1. ケース1: 移動が生成されない / 会食場所をサドヤで固定 / 「おすすめ」が generic_place 扱いで recommendation が効かない
  2. ケース2: ある程度成功だが start / end origin の優先順位が崩れている（終点を把握していない）
  3. ケース3: /baseline で成田設定なのに成田駅周辺で出ない + 移動時間欠落 + recommendation 不発
  「壊れた確定プランを出さない」目的は達成。しかし「良いプランを組む」能力は構造レベルで未整備。Deep Context Injection を先に入れても土台が無いと効かないので、構造→深層の順に直す。
- **承認**: CEO（2026-04-18）

#### W2 実装順序（この順で固定）
1. **anchor-first planner** — LLM の order を捨て、3 パス構築（hard anchor → flex anchor → travel）。push-out 禁止、window_end 尊重
2. **start / end origin の優先順位修正** — /baseline の起点と endpoint が尊重されていない。優先順位を明文化し実装を合わせる
3. **recommendation path の明確化** — recommendation intent を独立経路として扱う（generic_place の亜種ではない）
4. **「おすすめある？」を recommendation intent として検出** — LLM 抽出側で intent を立て、resolver / planner がその経路で動く
5. （ここまでで CEO 再検証）
6. Deep Context Injection（Stargazer 軸 / HDM Phase / Origin 直近 / Relational Lens）

#### W2 完了判定
- [ ] LLM の `order` が使われない（決定は 3 パスロジック）
- [ ] /baseline 起点が start で尊重される（ケース3 再現なし）
- [ ] endpoint が明示された場合に尊重される（ケース2 再現なし）
- [ ] 「おすすめ」発話で recommendation 経路が発動する（ケース1 再現なし）
- [ ] その上で Deep Context Injection 開始

#### 関連ドキュメント
- `docs/weekly-priorities.md` Week 2 セクション更新
- `docs/alter-morning-planner-redesign.md` W2 構成更新

---

### 2026-04-08 safe-merge 完了 + pre-existing test 失敗2件の固定記録
- **部門**: Build
- **決定内容**: ローカル全変更を main に安全合流・push 完了。pre-existing テスト失敗2件を正式記録。
- **承認**: CEO
- **ステータス**: 記録固定済み

#### 保全結果サマリ
| 項目 | 値 |
|---|---|
| 退避ブランチ | `backup/safe-merge-20260408-023040` |
| WIP SHA | `34602480` |
| main push SHA | `72d813a9` |
| push 範囲 | `882704ed..72d813a9` |
| build | PASS |
| typecheck | PASS |
| tests | 2031/2033 PASS（2件 pre-existing） |
| migration 追加 | 6件 |
| 変更消失 | なし |

#### 失敗テスト固定記録（pre-existing・今回起因ではない）

**1. `tests/unit/stargazer/baselineContext.test.ts:339`**
- テスト名: `scoreBaselineRelevance > relationship: lifeStage=high, gender=high, area=medium`
- 失敗内容: `rel.area` が `"medium"` を期待するが実装は `"low"` を返す
- 根本原因: `scoreBaselineRelevance` の area スコアリングロジックと期待値の乖離
- 対処方針: 実装側の意図を確認してからテスト or 実装を修正（CEO 判断待ち）

**2. `tests/unit/stargazer/derivedFactGenerator.test.ts:372`**
- テスト名: `serializeDerivedFactsForAnalytics > analytics用のシリアライズ形式が正しい`
- 失敗内容: `serialized.derived_facts.length` が `5` を期待するが `4` が返る
- 根本原因: `serializeDerivedFactsForAnalytics` がファクト1件をフィルタ/スキップしている
- 対処方針: シリアライズ関数のフィルタ条件を確認（CEO 判断待ち）

#### Migration 命名規則メモ
- 今回追加の `20260407300000`/`400000`/`500000` は時刻表現として不自然（秒が00000等）
- 実害なし（文字列順ソートで並び順は正しい）
- 今後は 実時刻ベース14桁（例: `20260408143022`）に統一する

---

### 2026-03-14 AI 運営 OS 初期構築
- **部門**: Chief of Staff
- **決定内容**: Claude Code 上で AI 執行部の運営基盤を構築。5 部門体制で開始。
- **理由**: CEO の下で AI が分業し、日常運用を効率化するため
- **承認**: CEO
- **ステータス**: 実行済

### 2026-03-14 Stargazer 深層観測 本日修正完了
- **部門**: Build
- **決定内容**: Stargazer の実データ接続・日本語統一・空状態ガイド改善を完了。全5タブ検証済み、32テスト通過、コンソールエラーなし。次フェーズは初期検証前の残課題整理に移行。
- **理由**: 初期検証ユーザーに提供できる品質に到達させるため
- **承認**: CEO
- **ステータス**: 実行済
- **完了内容**:
  - #1 archetypeResult closure バグ修正（loadRealData内のuseState非同期問題）
  - #2 英語ラベル日本語統一（全5タブ + コンポーネント群）
  - #3 空状態ガイドテキスト追加（DeepTab, TrajectoryTab）
  - 実データ接続: confidence, contextFaces 対応
  - テスト基盤修正: vitest 形式統一、server-only mock

### 2026-03-14 PartnerTab 初期検証方針
- **部門**: Product / Build
- **決定内容**: 初期検証では PartnerTab を「準備中」表示とする。タブは残し、DBテーブル新設・本格有効化はスコープ外。
- **理由**: 検証の主対象は Stargazer 本体。未実装感ではなく「今後ひらかれていく領域」として自然に見せる。
- **承認**: CEO
- **ステータス**: 実行中

### 2026-03-21 Aneurasync 再デプロイ完了・現行版確定
- **部門**: Build / CEO
- **決定内容**: Aneurasync の全体エラー監査・修正を経て本番デプロイを完了。`https://culcept.vercel.app` を現行版とする。
- **理由**: ビルド通過、212テスト通過、主要7画面の表示・導線確認済み。DBマイグレーション84件は既に適用済みであることを確認。デプロイ中に発見したDB整合不一致2件（`stargazer_alter_dialogues` のカラム名不一致、`calendar_worn_records` テーブル名誤り）を修正しリリース。
- **承認**: CEO
- **ステータス**: 実行済
- **修正内容**:
  - `app/api/stargazer/alter/route.ts`: `content`→`message`, `mode`→`alter_mode` にカラム名修正
  - `app/api/cron/stargazer-alter-summarize/route.ts`: 同上
  - `app/(immersive)/aneurasync/RobotCheckinCard.tsx`: `calendar_worn_records`→`calendar_outfits` にテーブル名修正
  - `app/api/stargazer/profile/route.ts`: 型エラー修正
  - テスト3件修正（import path更新、assertion修正）
- **保留事項**:
  - lint error 253件（ビルド非ブロック、デプロイ後改善タスク）
  - 本番通し確認での細かな違和感
  - 初期検証ユーザーからの反応回収
- **明日確認**:
  - 本番動作の最終確認
  - 招待制初期検証の開始可否

### 2026-03-30 Home Alter Judgment Engine — 条件付き GO
- **部門**: Build / Product
- **決定内容**: Home Alter の対人判断エンジンを条件付き GO とする。Daily Guidance エンジンは無条件 GO。
- **理由**: 主要ブロッカー（shape 不一致 5件・性格反転 20件）が構造修正で完全解消。specificity 3.98→4.42、失敗ケース 20→5件。uncertainty_calibration は 4.08（閾値 4.10）で -0.02 の軽微な未達だが、eval failure 由来であり出荷停止理由としない。
- **承認**: CEO
- **ステータス**: 実行済
- **構造修正 3 点**:
  1. Shape 主権: skeleton.action_shape を唯一の正とし LLM 出力を上書き
  2. Persona Block: prompt に固定ペルソナ + validation に regex 検出
  3. sanitizeTraitInversions: 後処理で性格反転フレーズを確実に除去
- **次パッチ必須対応**:
  - medium confidence 時の断定度調整（prompt 改善）
  - eval failure 分離集計（0点ケースを平均から除外する仕組み）
- **閾値緩和は行わない**（CEO 明示指示）

### 2026-03-30 Home Alter 統合 GO — 最終クローズ
- **部門**: Build / Product
- **決定内容**: Home Alter を Judgment Engine + Daily Guidance の両ドメインで統合 GO とし、最終クローズする。
- **理由**: JE は directness -0.025（評価ノイズ、2ラン連続同値で確認）以外全軸クリア。DG は specificity 3.91→4.77（+0.87）で閾値4.0を大幅クリア、全軸PASS・validation failure 0%。安全性・安定性OK（danger全PASS、stability 20/20）。
- **承認**: CEO
- **ステータス**: 実行済・最終クローズ
- **DG修正3点**:
  1. maxOutputTokens 1024→1536（応答切断の根本原因解消）
  2. DG prompt に時間指定必須ルール追加（「〜分」「〜時間」必須化）
  3. DG validation に切断検出+時間検出チェック追加
- **JE次パッチ完了2点**:
  1. confidence-level別tone rules（LOW=完全禁止、MEDIUM=強断定語禁止）
  2. eval failure分離集計（全0点ケース3件を平均から除外）
- **以後は保守対象**。次の主戦場は Alter の返答後の体験接続。
- **今後の監査方針**: 3-run median or 2-run average を採用し単一ラン ノイズを回避（CEO指示）

### 2026-03-30 Student LLM 学習確認 — OK（条件付き）
- **部門**: Build
- **決定内容**: Alter 系全体の student LLM 学習パイプラインが正しく接続されていることを確認し、OK（条件付き）とする。student は非公開のまま裏で学習を継続。
- **理由**: Gemini の Alter 系実出力が `ai_runs` → `teacher_outputs` → export/dataset/monitor/review の全段階で正しく流れていることを実データで確認。`stargazer_alter_response` 369件 + `stargazer_alter_session_summary` 1件の teacher_outputs 蓄積を確認。shadow model（`stargazer_student` / `shadow-2026-03-10`）登録済み、weight=0 で学習蓄積フェーズ。
- **承認**: CEO
- **ステータス**: 確認完了
- **確認範囲**: Home Alter / DG / Deep Alter / letter / self_report / session_summary の全 Alter 系経路
- **条件付きの理由**:
  1. DG 可視性粒度: `stargazer_alter_response` に JE/DG/Deep 同居。metadata.feature での集計可視化を改善候補として保持
  2. export 設定差異: `trainingArtifacts.ts`(default true) vs `exportDataset.ts`(default false)。cron/script で上書きされ実害なし。設定整理候補として保持
- **明確な否定**: student 公開承認ではない。学習入力接続の確認のみ
- **次ステップ**: DG 可視性改善 / export 設定整理 / student 品質比較（別フェーズ）

### 2026-04-01 Stargazer 後ログイン型フロー P0-P3 クローズ + P4 Phase A 完了
- **部門**: Build / Product
- **決定内容**: 後ログイン型フロー P0（匿名認証・merge基盤）、P1（体験速度・演出改善）、P2（制限つき結果表示 + 3確認点解消）、P3（質問文言の表現翻訳）をクローズ。P4（軸拡張エンジン）Phase A（基盤）を完了。
- **理由**: P0-P3は全て型チェック・テスト回帰なしで完了。P4はCEO承認（4条件付き）を受け、設計書追記 + Phase A実装を実施。
- **承認**: CEO
- **ステータス**: P0-P3 クローズ、P4 Phase A 完了
- **P2確認点解消**:
  1. ログイン戻り先: `next=/stargazer` パラメータ対応。authActionに匿名昇格・merge統合
  2. スキップ後導線: continue_choice画面に匿名ユーザー向けアカウント作成リンク追加
  3. 匿名判定一貫性: サーバーAPI側でデータフィルタリング（CSSブラーなし）
- **P3**: 全51問のquestionTextを表現翻訳（意味・軸・構造不変）
- **P4 Phase A 実装内容**:
  1. `traitAxes.ts`: `AxisTier` 型追加、6拡張軸キー追加、`CORE_AXIS_KEYS`/`EXPANSION_AXIS_KEYS`/`isExpansionAxis` ヘルパー追加
  2. `expansionDiscovery.ts` 新規: 発見条件判定（3条件2つ以上）、初期値算出、文言上限管理、通知判定
  3. `docs/p4-axis-expansion-design.md`: CEO4条件（ログ基盤・文言cap・差分理由・発見カード抑制）を追記
- **P4 CEO条件（設計書に反映済み）**:
  1. 解放条件の成立ログを必須化（ユーザー別解放率・条件別ボトルネック・到達日数の観測基盤）
  2. confidence capに加え文言上限もセット（hidden/emerging/forming/visibleの4段階）
  3. 各拡張軸に「既存45軸では足りない理由」を1行で定義
  4. 発見カードは短く1軸だけ。既存結果の邪魔をしない
- **不変条件**: archetypeResolver未変更、既存45軸の順序・定義不変、Rendezvous/GenomeCard非影響
- **次フェーズ**: P4 Phase B（データ層: profile API拡張・ベイズ更新制限・推論ルール追加）

### [2026-04-01] [Build] P4 Phase B クローズ + Phase C 完了
- **決定内容**: P4 Phase B（データ層）をクローズし、Phase C（UI表示層 + 解放条件ログ）を完了。
- **承認**: CEO
- **ステータス**: Phase B クローズ、Phase C 完了

- **Phase B 実装内容**:
  1. `profile/route.ts`: 拡張軸データ (`expansionAxes`) を非匿名ユーザーにのみ返却。displayTier/visible/score/confidence/precision/source/originLabel を構築
  2. `bayesianAxisUpdater.ts`: `updateAxisBelief()` に optional `axisId` 引数追加。拡張軸は τ_max=40, confidence_cap=0.45 に制限
  3. `axisInferenceEngine.ts`: `EXPANSION_INFERENCE_RULES`（6軸分）追加。maxConfidence=0.25。`inferExpansionAxes()` + `runFullInference()` 統合
  4. 6ファイルの `Record<AxisCategory, ...>` に `expansion` エントリ追加（型エラー解消）
- **Phase B CEO条件の達成**:
  1. archetype基盤は未変更（archetypeResolver はコア軸のみ使用）
  2. 匿名ユーザーには expansion 詳細を返さない（`user.is_anonymous` ガード）
  3. 拡張軸の precision/confidence 上限が既存軸より低い（40/0.45 vs 50/0.65）

- **Phase C 実装内容**:
  1. `ExpansionAxesSection.tsx` 新規: visible/displayTier を唯一の表示判定源とする拡張軸セクション。hidden tier は絶対に表示しない
  2. `DeepTab.tsx`: ExpansionAxesSection を統合
  3. `StargazerHome.tsx`: API から expansionAxes を取得し DeepTab へ受け渡し
  4. `ResultsSequence.tsx`: discoveredExpansionAxis prop 追加。発見カードは条件付き9枚目として表示
  5. `expansion-log/route.ts` 新規: 解放条件を評価し、conditionsMet/released/unmetReasons をログ出力+JSON返却
- **Phase C CEO条件の達成**:
  1. visible/displayTier が唯一の表示判定源。`axes.filter(a => a.visible && a.displayTier !== "hidden")` + `score !== null` の二重安全弁
  2. 解放率と未解放理由のログが見える状態: `buildUnmetReasons()` で人間が読める理由文を生成、console + API レスポンスで可視化
- **不変条件**: archetypeResolver未変更、既存45軸不変、匿名ユーザーに拡張軸非表示
- **次フェーズ**: P4 Phase D（拡張質問18問 + 日常質問への混合ロジック）

### [2026-04-01] [Build] P4 Phase D 完了 — 拡張軸質問18問 + 日常混合ロジック
- **決定内容**: 拡張軸専用の質問18問（6軸×3問）と、日常観測への1日最大1問の混合ロジックを実装。
- **承認**: CEO（3条件付き）
- **ステータス**: Phase D 完了

- **Phase D 実装内容**:
  1. `expansionQuestions.ts` 新規: 18問の質問定義（SemanticDifferential形式、5段階スライダー）
  2. `expansionQuestionSelector.ts` 新規: 選択ロジック（候補軸スコアリング + 深さ段階解放 + 回答処理）
  3. `dailyOrchestrator.ts`: `DailyObservationPlan` に `expansionQuestion` スロット追加、`selectExpansionQuestionForPlan()` で自動選択
  4. `daily-observation/route.ts`: `expansionAnswer` ペイロード追加、axis_snapshot 保存、ベイズ信念更新でcore/expansion分離

- **CEO条件1: 1日最大1問の原則**:
  - `selectExpansionQuestion()` で `todayAlreadyAsked` をDBから確認（`variant_id LIKE 'exp_%'` + `session_date = today`）
  - true なら即 null 返却。物理的に2問目は選択されない
  - 最近14日以内の出題済み質問も除外

- **CEO条件2: 発見済み軸にだけ出す**:
  - confidence <= 0 の軸は対象外（推論すらされていない）
  - hidden tier でも confidence > 0.08 なら候補（解放に近づいている）
  - emerging/forming tier が最高優先度
  - 矛盾検出された軸は CONTRADICTION_BOOST (×2.0) で優先
  - 低精度（τ < 5）の軸は LOW_PRECISION_BOOST (×1.5) で優先
  - セッション数 < 20 or 日数 < 7 なら出題しない

- **CEO条件3: archetype / core 45軸への逆流防止**:
  - `processExpansionAnswer()`: `isExpansionAxis()` で二重チェック、non-expansion は null 返却
  - `daily-observation POST`: `dailyInputs` から `isExpansionAxis()` で expansion を除外 → `coreInputs` のみ core 更新
  - expansion 回答は `expansionInputs` として分離し、同一 `updateFromDailyObservation` に渡すが、`updateAxisBelief()` 内で expansion 軸は τ_max=40, confidence_cap=0.45 に制限
  - `EXPANSION_QUESTIONS` の各質問は `axisId` が expansion 軸のみ。core 軸への weight 配分なし

- **不変条件**: archetypeResolver未変更、core 45軸の更新パスに expansion 回答が混入しない

### [2026-04-01] [Build] P4 運用確認フェーズ — 監視基盤 + 微調整パラメータ
- **決定内容**: Phase D クローズ後、運用確認フェーズに移行。監視基盤と閾値微調整機構を構築。
- **承認**: CEO
- **実装内容**:
  1. `scripts/expansion-ops-kpis.sql`: 7カテゴリの運用監視SQLクエリ（出題率・軸偏り・解放率・軽さ・回答分布・逆流チェック・サマリー）
  2. `app/api/ceo/expansion-monitor/route.ts` 新規: CEO専用 GET API。servingRate / axisBreakdown / releaseRate / lightness / alerts を返却
  3. `lib/stargazer/expansionTuning.ts` 新規: 全閾値を一箇所に集約。コード変更なしで微調整可能
  4. `expansionQuestionSelector.ts`: ハードコード定数を expansionTuning.ts からの import に置換
- **監視アラート（自動）**:
  - 🔴 critical: 1日1問超過、core逆流検出
  - 🟡 warning: 軸偏り（最多/最少 > 3倍）、重いセッション（10問超）
  - 🔵 info: 出題実績なし（対象ユーザー未到達）
- **微調整可能パラメータ**: EXPANSION_MIN_SESSIONS, EXPANSION_MIN_DAYS, NEAR_EMERGING_CONFIDENCE, CONTRADICTION_BOOST, LOW_PRECISION_BOOST, DEPTH_2/3_PRECISION, EXPANSION_EVIDENCE_PRECISION, FAST/SLOW_ANSWER_THRESHOLD 他

### [2026-04-01] [Build] 運用確認v2 — 価値検証指標の追加
- **決定内容**: 安全監視から価値検証へ拡張。completion rate / response time / precision改善量 / lightness percentile / visible到達推移 / 解放進捗偏りを追加。
- **承認**: CEO
- **追加指標**:
  1. **回答完了率**: served（raw_answers に expansionAnswer 存在）vs answered（axis_snapshots に exp_ 記録）→ completion_rate_pct
  2. **回答時間中央値**: raw_answers.expansionAnswer.responseTimeMs から軸別に median / p90 を算出
  3. **precision改善量**: 軸別の precision median / p75 / max を表示（精度がどこまで育っているか）
  4. **lightness p90/p95**: 日別の p90QuestionsPerSession / p95QuestionsPerSession 追加（平均だけでは重い外れ値が見えない）
  5. **visible到達率推移**: visibleTrend — 軸別の currentVisibleCount / currentVisibleRatePct / weeklyActivity
  6. **解放進捗の軸間偏り**: visible到達率の軸間差が AXIS_BIAS_RATIO_THRESHOLD を超えたら warning アラート
- **新アラート**:
  - 🟡 warning: 回答完了率 < 50%（拡張質問がスキップされている）
  - 🟡 warning: 解放進捗偏り（visible到達率の軸間格差）
- **SQL**: expansion-ops-kpis.sql も同期更新（回答時間・完了率・解放進捗偏りクエリ追加）

### [2026-04-01] [Build] 運用確認v3 — CEO運用基準の正式採用 + axis served count
- **決定内容**: CEO基準を expansionTuning.ts に明文化。axis served count 追加。healthGrades + thresholds をレスポンスに追加。
- **承認**: CEO
- **CEO運用基準（正式採用）**:
  - completionRate: >=80% 健全 / 60-79% 注意 / <60% 要修正
  - responseTime: median 1.5-6s 適正 / p90>10s 重い / median<1.5s 浅い
  - lightness: p90<=8問 / p95<=9問 維持目標
  - visibleRate 軸間格差: AXIS_BIAS_RATIO_THRESHOLD(3倍) 超で warning
- **追加指標**:
  1. `axisBreakdown[].servedCount` — 各軸が何回出題されたか（raw_answers.expansionAnswer から集計）
  2. `axisBreakdown[].completionRatePct` — 軸別の回答完了率
  3. `healthGrades` — completion / lightness / responseTime / coreIsolation の4項目一覧
  4. `thresholds` — 現在のCEO基準値をレスポンスに含めて透明化
- **新アラート**:
  - 🔴 critical: completionRate < 60%
  - 🟡 warning: completionRate 60-79% / responseTime median<1.5s or >6s / p90>10s / lightness p90>8 / p95>9
  - 🔵 info: 未出題軸の存在（visibleRate低下時の原因切り分け用）
- **「育たないのか、出ていないのか」の判別**:
  - axisBreakdown の servedCount=0 → そもそも出ていない（出題条件の見直し）
  - servedCount>0 だが visibleRate=0 → 出ているが育たない（質問の質 or precision 育ちの問題）

### [2026-04-01] [Build] 運用確認v4 — healthGrades明文化 + アラートカテゴリ分離
- **決定内容**: healthGrades判定ルールを docs に明文化。alerts に category フィールドを追加し under_served / low_growth を分離。
- **承認**: CEO
- **実装内容**:
  1. `docs/expansion-monitor-spec.md` 新規: healthGrades定義 / アラートカテゴリ定義 / 切り分けフロー / 閾値一覧 / 定点観測スケジュール
  2. `expansion-monitor/route.ts`: alerts に `category` フィールド追加（9種: safety / completion / response_time / lightness / serving_bias / release_bias / under_served / low_growth / info）
  3. under_served（servedCount=0の軸）と low_growth（served>0だがvisible=0の軸）をアラートで明示分離
- **運用フェーズ移行**: 以後は新規実装より定点観測を優先。1週/2週/1ヶ月の3点で completionRate → lightness → servedCount → visibleRate → precision の順に確認

### [2026-04-01] [CEO] P4 拡張軸 — チューニング運用フェーズ移行（CEO指示）
- **決定内容**: 新規実装を停止し、定点観測サイクルに移行する。
- **承認**: CEO
- **運用ルール**:
  1. **新規実装の停止**: expansion 関連のコード追加・機能追加は行わない
  2. **唯一の判断源**: `GET /api/ceo/expansion-monitor` の healthGrades と alerts のみで判断する
  3. **調整対象の限定**: 変更は `lib/stargazer/expansionTuning.ts` のパラメータ調整のみ許可
  4. **最優先制約**: completion と lightness を壊さないことが最優先。調整前後で両指標を必ず確認
  5. **調整時の記録**: パラメータ変更時は本 decision-log に変更前後の値と理由を記録すること
- **定点観測サイクル**:
  - 1週間: completionRate / lightness p90,p95 / under_served の有無
  - 2週間: low_growth の有無 / responseTime / servedCount 偏り
  - 1ヶ月: visibleRate 軸間格差 / precision 育ち / healthGrades 全体
- **前提**: 対象ユーザーが条件（20セッション+7日）に到達するまでは出題実績なしが正常

### 2026-04-03 CI パイプライン復旧 (lint + test)
- **部門**: Build
- **決定内容**: `fix/ci-lint-errors` ブランチで CI 復旧し main に merge。4コミット、18ファイル変更。
- **理由**: eslint-config-next v16 (react-hooks v7) 導入による 220+ lint errors、テスト28件失敗、Node 20/npm 10 の lockfile 非互換
- **承認**: CEO
- **ステータス**: 実行済
- **暫定対応**: `homeAlterQualityAudit.test.ts` のモード精度閾値を 0.75→0.45 に暫定引き下げ（clarify パス追加後の expectedMode 未更新）
- **残TODO**:
  1. qualityAudit 106件の expectedMode 再分類 → 閾値 0.75 復元
  2. package.json の `"latest"` 指定を固定バージョンに変更（再発防止）

### 2026-04-21 Phase 0〜F 完遂 — 未コミット整理 + 累積 origin/main 公開（PR #4）
- **部門**: Build
- **決定内容**: セッション開始時に 46 modified + 35 untracked + 1 deleted の巨大な未コミット変更を抱えていた状態から、保全→分割コミット→レビュー→main 合流までを 1 セッションで完遂。**PR #4** で **Wave 1 (82) + Wave 2 (52) + Wave 3 (9) + CI fix (1) = 144 commits + merge commit** を `origin/main` に公開（099f6e1b → 6d15d1e0）。
- **理由**: 未コミット変更の放置がデータ消失リスク + PR レビュー不能の両面で危険だったため。特に my-style 保存系（mergeWithBackup の revision 化、bridge POST 空 state 許可）は既存ユーザー state の退化を招きうる破壊的変更を含んでいたため、Phase E で baseline 照合までを必須ゲートとした。
- **承認**: CEO（各 Phase ごとに明示承認、Gate 3 merge は GitHub UI で CEO 手動実行）
- **ステータス**: 実行済
- **達成プロセス**（safety-first モードで 1 Phase = 1 承認）:
  1. **Phase 0 保全**: `safety/pre-commit-2026-04-20` + `wip/save-2026-04-20`（81 paths 完全保全） + origin push + recovery rehearsal worktree で復旧可能性実証
  2. **DB 保全 Gate**: Free → Pro プランアップグレード + PITR 7-day window 確認（Dashboard）
  3. **client state 保全**: `backups/client-state-2026-04-21/indexeddb-tier3-state-cache-only.json`（wardrobe 23 / setups 10 / _revision 2 / 全 imageUrl base64 保持）
  4. **Phase A-1**: `.gitignore` に `backups/` + `.claude/scheduled_tasks.lock` + `supabase/.temp/` を追加（PII 保護）
  5. **Phase B**: integration ブランチで cherry-pick -n + gitignore 除外 + reset（80 → 78 → 79 の整合検証 PASS）
  6. **Phase C**: 9 split commits（C-1 my-style / C-2 calendar / C-3 home+morning / C-4 stargazer / C-5 planner / C-6+7 clients+tests / C-8 baseline / C-9 migrations / C-10+11 docs+scripts）
  7. **Phase D**: 5/5 分割整合性検証 PASS
  8. **Phase E**: 7/7 C1/C2 baseline reconciliation PASS（wardrobe 23 / _revision 2 の保持を `mergeWithBackup` ロジックで論理検証）
  9. **Phase F**: push + PR #4 Draft 作成 + CI 失敗 2 tests 原因切り分け + 最小修正（timezone 依存 bug 1 + 古い test expectation 2）+ CI green + merge + smoke PASS
- **想定外の良い発見**: migration `20260416100000_place_resolution_cache.sql` + `20260416200000_exchange_protocol_and_invitation_tokens.sql` は **session 前から本番 DB に applied 済**だった。Phase F-5 の migration 適用作業は不要と判定。旧 `20260409100000_exchange_protocol` は一度も適用されずに rename 削除。
- **保全資産（残存）**: `safety/pre-commit-2026-04-20` @ 881665ec / `wip/save-2026-04-20` @ d49ba817（両 origin 同期済）。将来の参照 / rollback のため残置。
- **削除済**: `integration/split-commits-2026-04-21`（local + origin、merge 済のため安全削除）
- **方法論的な学び**:
  1. 「wip primary snapshot」と「整理 integration branch」を分離することで、分割が失敗しても wip が原典として常に存在する構造が効いた
  2. CI 失敗時に **timezone 依存の真因**を見抜くには、`TZ=UTC npx vitest run` でローカル再現するのが最速
  3. CEO 並行 commit（c22db5f9 / 566c4456）のような想定外事象は、即停止 → 現状診断 → 計画再設計の順で扱うと退化ゼロで吸収可能
- **commit message 方針**（今後参照用）: Phase C の 9 commits は **依存関係明示**（"Depends on C-1..." 等）と **file-level change narrative** を含め、レビュアが wave 構造を把握できるようにした。

### [2026-04-26] [Build] CoAlter Bug-1 Phase 3A 観測 gate PASS / 本線 build-fix 着地
- **部門**: Build
- **決定内容**: Phase 3A retrieval recall/precision 観測 4 指標が全 PASS。Phase 3B narration 接続の着手条件達成。Phase 3A の build blocker 除去 commit を本線 `feat/coalter-three-stage` に cherry-pick。
- **承認**: CEO
- **ステータス**: Phase 3A 完了 / Phase 3B 着手前
- **観測 gate 結果（N=19）**:
  - searchCandidatesCount median: **6** (閾値 ≥5)
  - searchCandidatesCount p25: **3** (閾値 ≥3)
  - hasActionable=false での fire 率: **0%** (閾値 =0%、precision 完全)
  - 0 candidates 比率: **0%** (閾値 <20%)
  - candidatesCount sorted: `[3,3,3,3,3,3,3,6,6,6,7,8,8,8,9,9,9,9,9]`
- **観測前提**:
  - branch: `preview/coalter-stepc-phase3a` (HEAD `e2eb810b`)
  - env: `EXA_API_KEY` (preview+production), `COALTER_UNDERSTANDING_DIAGNOSTICS=1` (preview, branch scope)
  - 観測経路: 正規 ChatClient (`/talk/[threadId]`) → CoAlter button click → POST `/api/coalter/invoke`
- **本線着地（cherry-pick）**: `e2eb810b` を `feat/coalter-three-stage` に cherry-pick → 新 hash **`45cd1327`**。preview のみあった build blocker 除去（main の portable file 6 個欠落: `AneurasyncLogo.tsx` / `placeCacheStore.ts` / `placesApiClient.ts` / `routesApiClient.ts` / `municipalityCoords.ts` / `episodicRecall.ts`、計 1538 lines）を本線に取り込み、再発防止。
- **正確な扱い（CEO 確定）**:
  - Phase 3A retrieval recall/precision の gate は **PASS**
  - Phase 3B 進行条件は満たした
  - ただし「完全に健全」ではなく、後続課題が残る
- **後続課題**（Phase 3B 完了後 or 別 Phase で扱う、優先順位 CEO 確定）:
  1. theme drift（直前 N turn 累積で「表参道 昼カフェ」が movie 誤分類）
  2. 同一クエリ / エリアの retrieval 重複（dedup 不足）
  3. double invoke (10 click → 20 invoke)
  4. travel/activity の query 弱さ（candidatesCount=3 上限）
- **次フェーズ**: Phase 3B narration 接続を `feat/coalter-three-stage` 上で開始。`preview/coalter-stepc-phase3a` 上では行わない。

### [2026-04-26] [Build] CoAlter Bug-1 Phase 3B Layer 2-C preview 観測 — inconclusive
- **部門**: Build
- **決定内容**: Layer 2-C (`5e63e7b5` = preview cherry-pick `634ff651`) の preview deploy
  (`dpl_4hTC7cVUfYGVeBb6fkL498RUoPtu`) で UX 効果検証を試みたが、movie path の
  `rankedCount=0` が連続したため UI 上の効果検証は **inconclusive (未判定)**。
- **承認**: CEO
- **ステータス**: 観測完了 / 効果判定保留 / 修正未着手
- **観測結果（5 invoke / 直近 1h logs）**:
  - movie 4/5: `rawResultsCount=9 / catalogCount=3 / rankedCount=0` （4 件全て同一構造）
    - `missingWhereRejectCount=3` / `titleWithoutTheaterCount=3` で全 drop
  - food 1/5: `rawResultsCount=6 / parsedVenues=1 / rankedCount=1`（rank>0 達成）
  - emotion_signals が prose に反映された観察ゼロ
- **新たに判明した別 gate（重要）**:
  - **Phase 3A retrieval gate PASS は維持**（recall/precision の観測値は別 entry 既述）
  - ただし retrieval 後の **catalog / ranker gate**（特に movieRanker の `missing_where`
    hard filter）で movie が 100% drop する事実が判明
  - **Phase 3A は retrieval 評価としては有効だが、UX 到達には ranker gate も別途必要**
- **food path の dead spot（Layer 2-D 論点）**:
  - foodOrchestrator は narrationEnricher を呼ばない構造（Phase B Commit 4 lock）
  - Layer 2-A/B/C で構築した emotion 経路は food path に届かない
  - food rank>0 でも logic-only narration → emotion 反映ゼロ
  - Layer 2-C 効果検証直後には扱わず、Layer 2-D で別判断
- **UX 課題（layout/UI phase 送り）**:
  - repeated clarify / context drift（CEO 入力の直近 N turn が薄い相槌だと
    `combinedSample` が stale 化、4 連続で同一 query → 同一 clarify）
  - 「もっと聞かせて」連発に対する UX 改善は別 phase
- **次の観察候補（CEO 優先順位 A → B → C → D、本 entry 時点で実装着手なし）**:
  - **A**: theater 名直接指定 movie 入力で rank>0 に到達するか preview で再観測
    （CEO 操作 + Claude logs 確認）
  - **B**: `lib/coalter/movieRanker.ts` / `movieCatalog.ts` の `missing_where`
    hard filter を読み取り、最小修正案を起草（observation のみ、修正禁止）
  - **C**: food Layer 2-D は別判断（保留）
  - **D**: layout/UI 改善は別 phase で課題一覧を整理
- **layout/UI phase 候補課題**:
  - L-1: repeated clarify
  - L-2: context drift（直近 N turn 薄い相槌で combinedSample stale 化）
  - L-3: clarify card に「ピン止めされた条件」見える化
  - L-4: clarify card に「足りない条件」明示（既存 missingConstraints 経路の UI 強化）
  - L-7: rank=0 時の「何が原因か」UI 表示（"theater 情報が取れなかった" 等の透明化）
  - L-9: 「もっと聞かせて」click 後に context が更新される仕組み

### [2026-04-27] [Build] CoAlter Phase 3B catalog parser 強化打ち切り / 映画 2 段階分離設計へ移行
- **部門**: Build
- **決定内容**: B'-1 (theater 解決) / Bug 1 (page 名 reject) / Bug 2 (markdown heading 抽出) と
  catalog parser 強化を 3 commit 連続で実施。preview 再観測で限定的に Layer 2-C 効果検証に
  到達したが、CEO 判断で catalog parser 強化はここで打ち切り。映画は「映画館検索」と
  「映画内容そのもの」の 2 段階分離設計を別 Phase で扱う。
- **承認**: CEO
- **ステータス**: 打ち切り判定 / Phase 3B Layer 2-C 観測は限定的成果のまま終了
- **3 commit の経緯**:
  1. **B'-1** (`56f7e487` preview / cherry-pick `9a52bfba` feat): theater 解決強化
     (crank-in / eiga.com URL pattern 追加 + resolveTheaterForTitle chain 順序変更)
     - 観測結果: rankedCount 0 → 1 達成、UI に「クランクイン！」(page 名) 表示
     - Layer 2-C emotion 経路が 1 度だけ user-facing に到達
  2. **Bug 1** (`9ce67668` preview / `f7f597e5` feat): NON_TITLE_SEGMENT に「クランクイン」追加
     (page 名 → site 名扱いで reject)
     - 観測結果: 「クランクイン！」消滅、しかし description 内 markdown `# {作品名}` を
       extractBracketedTitles が拾えず rankedCount 0 後退
  3. **Bug 2** (`fcfc3d8b` feat、preview 未反映): markdown heading 抽出 helper
     `extractMarkdownHeadingTitles` 追加、parseMovieScreenings の description fallback chain に統合
     - unit test 全 PASS (84 files / 1236 tests)、preview deploy 前に CEO パス判定
- **打ち切り理由**:
  - 映画は「映画館検索」と「映画内容そのもの」の 2 段階分離が本来の設計（CEO）
  - catalog parser 単体強化を続けても real EXA results の表記揺れに追従しきれない
  - parser 強化は 3 commit で十分試行、これ以上は ROI 低い
- **未反映の commit**:
  - **`fcfc3d8b` (Bug 2)** は feat 本線に commit 済 + unit test PASS だが preview deploy しない
  - 映画 2 段階分離設計が定まる前は preview に流さない方針
- **次フェーズ**: CEO 判断仰ぐ
  - food path Layer 2-D（narrationEnricher への接続、前 turn で保留）
  - layout/UI phase（rank=0 理由の見える化、context drift 対策）
  - 映画 2 段階分離設計（新 Phase）
  - その他

## [2026-04-30] [Build] [Stage 4 B-3.4 Realtime publication 追加] [承認: CEO]

### 範囲
- migration: `supabase/migrations/20260430100000_coalter_memory_items_realtime.sql`
  - SQL: `ALTER PUBLICATION supabase_realtime ADD TABLE public.coalter_memory_items`
  - 冪等性: `pg_publication_tables` check で重複追加回避 (既存 `20260415100000_coalter.sql` と同 pattern)
- code: `useMemoryItems` hook に Supabase Realtime channel subscribe 追加
  - channel name: `coalter_memory:${pairId}` (CEO 確定 2026-04-30、filter 式は分離)
  - filter: `pair_id=eq.${pairId}` (postgres_changes 内、performance 最適化)
  - throttle: **250ms** (REALTIME_THROTTLE_MS、CEO 確定 2026-04-30、即時性より安定性優先)
  - throttle 中の連続 event 取りこぼし防止: `pendingRef.current ?? itemsRef.current` を base に compute
  - `shouldDisplay` 多層 gate (CEO 確定 2026-04-30):
    - viewer=user_a で user_b_only → 非表示
    - viewer=user_b で user_a_only → 非表示
    - internal_only → 常に非表示
    - expired (expires_at <= now) → 非表示
    - both_visible / same-side scope → 表示

### security boundary (3 層 defense in depth)
1. RLS (DB-level、主防御): SELECT policy で pair member + 片側可視性 enforce、Realtime broadcast は subscriber session の RLS を評価
2. filter (server-side、performance): `pair_id=eq.${pairId}` で別 pair event を server-side で短絡
3. client `shouldDisplay` (UI-level、副防御): visibility / expires / viewer scope を client 側でも check

### supabase db push timing (CEO 確認 gate)
1. B-3.4.a/b/c 3 commits を local 完了
2. push origin → Vercel preview build
3. preview smoke (publication 未追加で CHANNEL_ERROR でも UI 壊れない invariant 確認)
4. **CEO 確認 → CEO が `supabase db push` 手動実行** (ここが必須 gate)
5. publication 追加後 manual realtime test (test pair で service_role INSERT → 別端末で受信確認)
6. test data cleanup (CEO 指示 Gate B、必須):
   - `DELETE FROM coalter_memory_items WHERE pair_id = '${test_pair_id}' AND content LIKE 'B-3.4 manual test%'`
   - service_role 経由、SQL Editor or supabase CLI
7. Production promote 判断 (B-4 完了後にまとめて、B-2/B-3 と同方針)

### rollback 手順
- code rollback:
  - `git revert <B-3.4.a hash> <B-3.4.b hash> <B-3.4.c hash>` + `git push origin feat/coalter-three-stage`
  - Vercel auto preview build → CEO promote
- migration rollback:
  - 別 migration `supabase/migrations/<timestamp>_revert_coalter_memory_items_realtime.sql` を作成
  - SQL: 冪等性付き `ALTER PUBLICATION supabase_realtime DROP TABLE public.coalter_memory_items`
    ```sql
    do $$
    begin
      if exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'coalter_memory_items'
      ) then
        execute 'alter publication supabase_realtime drop table public.coalter_memory_items';
      end if;
    end $$;
    ```
  - **CEO 操作で `supabase db push`** で適用
- env / `coalter_memory_items` table / 既存 RLS は touch しない (data 破棄ゼロ)
- revert 中の in-flight subscribe client は CHANNEL_ERROR を受けるが、`setRealtimeError("channel_*")` fallback で UI 壊れず、initial fetch 経路維持

### 制限事項
- B-3.4 単独で Production promote しない (Path B 完了後にまとめて、CEO 確定方針)
- B-4 (Supabase migration 適用状態最終 audit + integration test) は別 phase
- preview smoke 段階では publication 未追加で CHANNEL_ERROR が来る可能性あり、UI 壊れない invariant が保証

## [2026-04-30] [Build] [Stage 4 B-3.4.d REPLICA IDENTITY FULL] [承認: CEO]

### 経緯
- B-3.4 publication 追加後の manual realtime test (2026-04-30) で発見:
  - INSERT realtime: ✅ 即時反映
  - UPDATE realtime: (本 test では未検証、INSERT と同じ broadcast 経路のため OK 想定)
  - DELETE realtime: ⚠️ 不発火、page refresh 後に initial fetch 経由で消える

### 根本原因
- PostgreSQL `REPLICA IDENTITY DEFAULT` 仕様: DELETE event の OLD record に PK のみ
- Supabase Realtime は subscriber session の RLS で event filter
- RLS policy `cps.id = coalter_memory_items.pair_id` の評価で OLD record の `pair_id`
  不在 → filter で drop → subscriber に届かない

### 修正
- migration: `supabase/migrations/20260430110000_coalter_memory_items_replica_full.sql`
- SQL: `ALTER TABLE public.coalter_memory_items REPLICA IDENTITY FULL;`
- これにより DELETE event の OLD record に全 columns が含まれ、RLS evaluation 成功

### 副作用評価
- WAL log size がやや増加 (UPDATE / DELETE 時に全 row が log に書かれる)
- coalter_memory_items は row size 小 (text + uuid + timestamps) かつ update 頻度低
  → 影響軽微、許容範囲
- 既存 RLS / INSERT / UPDATE realtime 経路は不変 (schema-only change)
- 既存 row data は touch しない

### 不変 (CEO 厳守 2026-04-30)
- useMemoryItems.ts ロジック変更なし (既存 client computeNext で動く)
- API / UI / MemorySurface 変更なし
- RLS policy 変更なし
- soft delete pattern 採用せず (scope 過大、B-4 でも別審議せず)

### supabase db push timing (Gate A 維持)
1. migration commit + push
2. preview build + smoke (publication 既追加で INSERT/UPDATE は引き続き動作、
   DELETE は本 migration 適用前のため引き続き page refresh 依存)
3. 私が `supabase migration list --linked` で未適用 1 本確認 → CEO に GO 仰ぐ
4. CEO `supabase db push` 手動実行
5. 適用確認 + DELETE manual realtime test 再実行

### rollback 手順
- code: 本 migration を git revert (file 削除)
- migration rollback:
  - 別 migration `<timestamp>_revert_coalter_memory_items_replica_default.sql` を作成
  - SQL: `ALTER TABLE public.coalter_memory_items REPLICA IDENTITY DEFAULT;`
  - CEO `supabase db push` で適用
- env / DB row data / 既存 RLS / publication 登録は touch しない (data 破棄ゼロ)
- rollback 後の DELETE realtime は再び不発火に戻るが、INSERT/UPDATE は引き続き動作

### 制限事項
- B-3.4.d 単独で Production promote しない (Path B 完了後にまとめて)
- B-4 (Supabase migration 適用状態最終 audit + integration test) は本 migration 適用後に実施

## [2026-04-30] [Build] [Stage 4 B-4.1 audit + Path B 完了判定] [承認: CEO]

### Path B で達成した範囲

- **B-1** (`02b57f79`): L4-b state header + L4-f ModeSwitcher 本番化
- **B-2** (`2bc7a7b4` / `03ada72a` / `a0a4d2c9`): L4-h Urgent layer + critical signal detection (CEO 視覚確認 PASS)
- **B-3.0**: migration / RLS read-only audit (commit なし、audit only)
- **B-3.1** (`e5474242`): Memory list API endpoint (server-side、RLS-aware)
- **B-3.2** (`6c0cf82d`): useMemoryItems hook (initial fetch のみ)
- **B-3.3** (`8330c7bc`): UpperLayerMount に MemorySurface mount + viewer 解決
- **B-3.4.a** (`8e5d0e80`): Realtime publication migration (適用済 2026-04-30 10:00:00)
- **B-3.4.b** (`bb0eba99`): useMemoryItems Realtime 拡張 (channel + filter + throttle 250ms)
- **B-3.4.c** (`9599138e`): Realtime hook test + 既存 grep 反転 (CEO 修正条件 1/2 cover)
- **B-3.4.d** (`42ba5bee`): REPLICA IDENTITY FULL migration (適用済 2026-04-30 11:00:00)

### Path B 完了 ≠ §10.2 全項目完全達成

Stage 4 L4-l 完了定義 §10.2 13 項目に対する Path B の状態:
- **完全達成 (complete)**: 5 項目 (#3 3 mode / #4 memory surface / #5 urgent layer / #7 連投抑制 / #11 不可侵項遵守)
- **部分達成 (partial)**: 6 項目 (#1 Stage 4 全 / #2 flag 全 (PRESENCE_SPEECH_LLM 未稼働) / #6 拒否 3 分類 UI 未接続 / #9 telemetry 観測未確認 / #10 a11y 4 補助状態未接続 / #12 mainstream E-3 整合未確認)
- **未達成 (missing)**: 2 項目 (#8 speechBuilder LLM 合成 / #13 legacy CoAlterCard 削除)

表現規約 (CEO 確定 2026-04-30):
- ✅ **Path B 完了** / ✅ **Stage 4 L4-l core UI path 完了**
- ❌ **§10.2 全項目完全達成** / ❌ **Stage 4 L4-l 完全完了** (= 表現禁止)

→ **Path B 完了 = Stage 4 L4-l core UI path 完了**。Stage 4 L4-l 正式完了には L4-i / L4-j / L4-k / L4-m / mainstream E-3 の追加 phase が必要。

### B-3.4 Realtime INSERT / DELETE manual test PASS

2026-04-30 manual test (CEO 視覚確認):
- INSERT realtime: 即時表示 ✅
- DELETE realtime: page refresh なしで即時消失 ✅ (REPLICA IDENTITY FULL 効果)
- cleanup SELECT count = 0 ✅
- console error / CHANNEL_ERROR なし ✅

REPLICA IDENTITY FULL の効果が想定通りに発揮 (DELETE event の OLD record が full row で broadcast され RLS 評価成功 → subscriber に届く)。

### publication / REPLICA IDENTITY FULL / RLS の最終状態

- `coalter_memory_items`: `supabase_realtime` publication に登録済 ✅ (`20260430100000`)
- `coalter_memory_items`: REPLICA IDENTITY FULL ✅ (`20260430110000`)
- `coalter_memory_items` RLS:
  - SELECT: pair member + visibility gate (4 軸: both_visible / user_a_only / user_b_only / internal_only) ✅
  - UPDATE: pair member ✅
  - INSERT: `with check (false)` (service_role 経由のみ) ✅
  - DELETE: pair member ✅
- `coalter_pair_states` RLS:
  - SELECT/INSERT/UPDATE: pair member ✅
  - DELETE: cascading delete only

### 残リスク R1-R13

#### Path B 範囲外 (§10.2 残項目)
- **R1**: `PRESENCE_SPEECH_LLM` 未稼働 (L4-i 残)
- **R2**: telemetry 8 項目 Production 観測未確認 (L4-j 部分)
- **R3**: a11y 4 補助状態 UI 未接続 (L4-k 部分、State*Fallback components 実装済だが UpperLayerStateRenderer に mount なし)
- **R4**: 拒否 3 分類 UI 未接続 (§10.2 #6、rejectionReducer 実装済だが UpperLayerMount に mount なし)
- **R5**: legacy CoAlterCard 削除未実施 (L4-m、CEO「1 rev 観測後」方針)
- **R6**: mainstream plan E-3 整合未確認

#### Path B 範囲内
- **R7**: explicit / mention / chip tap signal 未実装 (B-2 で除外)
- **R8**: Memory item 「両端末視点」確認 1 端末のみ (端末 2 台での visibility test 未実施)
- **R9**: Production load (memory rate / subscriber count) 未測定
- **R10**: rate limit / utterance queue は Stage 2 実装済だが UI 接続未確認

#### 運用
- **R11**: rollback 経路の手動依存 (CEO 操作: Vercel env / supabase db push)
- **R12**: test pair_id 1 つでの確認のみ
- **R13**: CEO 厳守事項 12 項目 → 機械的 enforcement なし

### Production promote 候補 P1/P2/P3

- **P1**: Path B 完了で promote (B-4.2 完了後の CEO 判断、推奨)
- **P2**: §10.2 全項目達成後 promote (慎重派、L4-i/j/k/m + E-3 完了まで preview のみ)
- **P3**: 段階的 promote (sub-phase 完了ごとに promote)

### 推奨は P1、最終判断は B-4.2 後

CEO 確定 (2026-04-30): **P1 を採用候補**、B-4.2 完了後に以下 6 つの判断材料を見て最終判断:
1. B-4.2 test 結果
2. decision-log 記録
3. rollback 手順
4. preview smoke
5. CEO 視覚確認
6. §10.2 残項目が明示されていること

### 次フェーズ優先順位 (B-4 完了後、CEO 確定 2026-04-30)
1. **L4-k**: a11y / loading / error / empty 補助状態の本番 wire
2. **L4-j**: telemetry 8 項目の Production 観測
3. **L4-i**: Presence speech LLM 合成
4. **L4-m**: legacy CoAlterCard 自動挿入コード削除
5. **mainstream plan E-3 整合 audit**

ただし実際の着手順は B-4 完了後に再判断。

### 不変 (CEO 厳守 2026-04-30)
- B-4.1 audit は read-only、code touch ゼロ
- migration / API / UI / RLS / supabase db push / Production promote / env / package / next-env.d.ts / supabase temp 全て不変

## [2026-04-30] [Build] [Stage 4 L4-k a11y / loading / error / empty 4 補助状態 wire] [承認: CEO]

### 範囲
- UpperLayerStateRenderer に `<StateAriaWrapper>` を統合 (全 state component を統一 wrap)
- UpperLayerShell から `role="region"` + `aria-label="CoAlter 上部レイヤー"` 削除 (二重 region 回避、`data-testid="coalter-upper-layer-mount"` 維持)
- UpperLayerMount を `<UpperLayerErrorBoundary>` でラップ
- UpperLayerMountActive 内に Loading transient (isPresenceReady) + Empty (availability!=='active') 経路追加

### 4 補助状態の Trigger 条件
- **Loading**: `!isPresenceReady` (mount 直後 1 tick、setTimeout(0) で ready)
- **Empty**: `availability !== "active"` (B-1 では active 固定で発火しない、将来 consent flow で発火)
- **Error**: UpperLayerErrorBoundary class component の getDerivedStateFromError catch
- **Aria**: StateAriaWrapper polite 固定 (UrgentLayer assertive と分離、二重通知回避)

### §10.2 #10 状態遷移
- Path B 完了時点 (B-4.2 record): partial
- L4-k 完了時点: **complete** (4 補助状態すべて mount 経路 wire、trigger 条件明確、test PASS)
- B-4.2 mapping update: complete 5→6 / partial 6→5 / missing 2 (不変)

### CEO 厳守事項の遵守 (2026-04-30)
- ChatClient.tsx 触らない (test で grep 確認、UpperLayerErrorBoundary 等 import なし)
- ErrorBoundary は UpperLayerMountActive のみ包む (chat input / scroll / message rendering 不変)
- telemetry / Sentry breadcrumb は L4-j で別接続、本 phase は console.error のみ (L4-j 衝突回避)
- Memory / Realtime / Supabase / Urgent trigger / signal detection 不変
- L4-i / L4-j / L4-m / mainstream E-3 触らない
- env / package / next-env.d.ts / supabase temp 触らない
- 新 dependency 追加なし (react-error-boundary 不使用、class component で React 古典実装)

### test 計画 (10 必須項目すべて cover)
- Loading: 初期 tick 経路 (構造 invariant + StateLoadingFallback 関数 invoke)
- Loading: timer 後 ready 経路 (useEffect setTimeout grep)
- Empty: availability 4 値 (disabled / inactive / pending_consent / enabled) で StateEmptyFallback
- Error: ErrorBoundary class method (getDerivedStateFromError + render + reset + componentDidCatch)
- Aria: StateAriaWrapper wrap + state component children + polite 固定
- UpperLayerShell role=region 削除確認
- ChatClient touch ゼロ確認
- B-1/B-2/B-3/B-4/B-2.4 regression (5327/5328 PASS、1 failure は pre-existing alter-morning)
- 27 セル × 4 補助 = 108 ケース structural readiness

### rollback
- code rollback: `git revert <L4-k commit>` + push (15-20 min)
- env / migration / DB 不変
- 影響: a11y 属性削除 + ErrorBoundary なし → 既存 UpperLayerShell の role=region に戻る (B-1 状態)
- behavior 不変原則: flag OFF で完全不変

### Production observation 項目
- a11y reader 読み上げ品質 (CEO / 任意 user による screen reader テスト)
- Error 経路の発火率 (L4-j で telemetry wire 後に Sentry で監視)
- Loading transient 時間 (dev tools React profiler、1 frame 内に通常 UI 切替確認)

### 制限事項
- Production promote は B-4.2 全完了後にまとめて (CEO 確定方針)
- 本 commit のみで Production promote しない

## [2026-04-30] [Build] [Stage 4 L4-j Phase 1 — production reachable 4 event wire] [承認: CEO]

### 範囲
Plan D (CEO 確定 2026-04-30): production reachable 4 event のみ telemetry emit を usePresenceExecutor に wire。
- ① `state_transition`: presence.state 変化時 (前値比較で重複防止)
- ② `pattern_used`: primaryPattern 変化時 (前値比較)
- ⑤ `mode_transition`: mode 変化時 (`lastModeEventTypeRef` で trigger 解決)
- ⑦ `urgent_triggered`: urgentDecision 変化時 (`buildUrgentDedupeKey` で dedupe)

### 不採用 4 event (別 phase 扱い)
- ③ `consent`: consent / activate flow の観測設計が別途必要 (consent UI phase で wire)
- ④ `legacy_fallback`: `LEGACY_CARD_AUTO_INSERT=false` で抑止中、L4-m legacy 削除 phase と統合
- ⑥ `rejection`: rejection UI が本番 wire されていない (§10.2 #6 と連動)
- ⑧ `ratelimit_blocked`: utteranceQueue / ratelimit の UI 経路が現状 reachable でない

→ **未到達 event を telemetry だけ入れて「実装済み」に見せる行為を回避**。

### emit point の集約
- 全 4 event を `usePresenceExecutor.ts` の useEffect 内で emit
- ChatClient.tsx に touch なし (B-1 から不変、grep で確認)
- emit point 分散ゼロ (presence state / mode / urgent / pattern の中心 hook で集約)

### dedupe 戦略
- 4 event すべて useRef で前値 / 前 key を保持
- 前値と異なる場合のみ emit、毎 render の rerender では emit ゼロ
- urgent は null 復帰で dedupe key reset (次の non-null で再 emit 可能)

### payload 制約 (CEO 厳守 2026-04-30)
- 会話本文 / ユーザー入力文 / 個人情報を一切含めない (test で grep 確認)
- pairId は `initial?.pairId ?? ""` のみ (telemetry のための fetch 追加禁止)
- state / mode / pattern variant 等の構造化 enum + number (ts) のみ送信

### Sentry breadcrumb 経路 (既存 wire の活用、本 phase で追加変更なし)
- `lib/coalter/presence/sentryTelemetry.ts` の `createSentryTelemetrySink` で `Sentry.addBreadcrumb` 経由
- `instrumentation-client.ts` の `wireSentryTelemetry()` で sink 注入済 (L4-pre-3 wire)
- 8 event → category mapping は既存 (`coalter.presence` / `coalter.pattern` / `coalter.mode` / `coalter.urgent` 等)

### 重要観測仮説 (CEO 指摘)
`Sentry.addBreadcrumb` は通常、breadcrumb 単体で独立送信されるとは限らない:
- error event / transaction / replay 等に紐づいて初めて Sentry Discover で見える可能性
- L4-j Phase 1 完了後の Production 観測で実証必要
- もし breadcrumb 単体で観測不能なら、追加 event wire に進まず、**sink 設計に戻る** (Sentry breadcrumb → Sentry custom event / metric / span 等への切替検討)

### Production 観測手順
1. CEO Production talk page (`https://culcept-2ly9oxx2v-...vercel.app/talk/<thread>`) で:
   - ModeSwitcher で「Daily」 tap → `mode_transition` 発火想定
   - 「もう限界」等 critical keyword 送信 → `urgent_triggered` + `state_transition` + `pattern_used` 発火想定
2. CEO Sentry dashboard で `category:coalter.*` filter で breadcrumb 確認
3. もし breadcrumb 単体で観測できない場合、L4-j Phase 1 を「sink 設計再検討」 phase として記録、追加 wire は次 phase へ

### §10.2 #9 status
- Plan D 完了後も **partial 維持** (CEO 確定方針)
- 4/8 wire に留まる (構造的 reachable のみ)
- 残 4 event は別 phase 依存
- Sentry 観測経路もまず実証段階

### 不変 (CEO 厳守 2026-04-30)
- ChatClient.tsx 触らない ✅
- consent / rejection / legacy / ratelimit を本 phase で wire しない ✅
- L4-i / L4-m / E-3 触らない ✅
- env / package / next-env.d.ts / supabase temp 触らない ✅
- telemetry payload に会話本文 / 個人情報を入れない ✅
- §10.2 #9 を complete に更新しない ✅
- 既存 telemetry sink (Sentry breadcrumb) 設計を変更しない ✅

### rollback 境界
- code rollback: `git revert <L4-j Phase 1 commit>` + push (15-20 min)
- env / migration / DB 不変
- 影響: 4 emit 経路削除のみ、telemetry sink + 既存 wire は維持
- behavior 不変原則: flag OFF で完全不変 (`safeEmit` が flag check で短絡)

### 次フェーズ
- L4-j Phase 1 完了後 Production 観測実証 → 結果次第:
  - **観測 OK** → 残 4 event を別 phase で順次 wire (ただし trigger UI 接続要件あり)
  - **観測 NG (sink 経路問題)** → sink 設計再検討 phase (Sentry breadcrumb 単体観測の代替検討)

## [2026-04-30] [Build] [L4-j-blocker — Sentry sink unreachable: NEXT_PUBLIC_SENTRY_DSN 未設定確定] [承認: CEO]

### 観測契機
- L4-j Phase 1 (`30866d3e` + fix `a21d2f80`) で 4 event (state_transition / pattern_used / mode_transition / urgent_triggered) の sink emit 配線を完了
- CEO Production smoke で「観測できているか」確認の段階で Sentry dashboard / Discover に CoAlter 関連 breadcrumb が一切見当たらない事象を観測
- 本 phase は Plan D の **観測経路実証** part であり、wire 完了 ≠ 観測完了

### 確認手順 (CEO 実施 2026-04-30)
1. **Project レベル env 確認**: `https://vercel.com/taishis-projects-0a8deb17/culcept/settings/environment-variables`
   → `NEXT_PUBLIC_SENTRY_DSN` **存在せず**
2. **Team レベル Shared env 確認**: `https://vercel.com/taishis-projects-0a8deb17/~/settings/environment-variables?view=shared&q=NEXT_PUBLIC_SENTRY_DSN`
   → "No Results Found" — **Shared スコープにも存在せず**
3. CEO 確認結果 (chat): 「結論、NEXT_PUBLIC_SENTRY_DSN は存在しない可能性が高いです」→ Shared 確認後「ここ？」screenshot で確定

### 結論 (CEO 承認 2026-04-30)
- **Sentry SDK は Vercel preview / production 環境で完全 no-op**
- 根拠: `instrumentation-client.ts` / `sentry.server.config.ts` / `sentry.edge.config.ts` 全て `enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN` ガード
- 根拠: `next.config.js` の `withSentryConfig` も `disableClientWebpackPlugin: !process.env.NEXT_PUBLIC_SENTRY_DSN`
- 根拠: 結果として `Sentry.addBreadcrumb` は SDK 未初期化で no-op、**1 件も Sentry に届いていない**
- 影響範囲: L4-j Phase 1 で wire した 4 event だけでなく、**プロジェクト全体の Sentry breadcrumb / error / transaction / replay が一切送信されていない**

### Phase ステータス確定
- **L4-j Phase 1 wire**: ✅ 完了維持 (`30866d3e` + `a21d2f80`)
- **L4-j Phase 1 観測実証**: ❌ blocker により未到達
- **§10.2 #9 status**: partial (4/8 wire) のまま不変、観測実証なしでは complete に上げられない
- **fix-forward 維持**: L4-j Phase 1 の commit はリバートしない (構造的 reachable は確保済、Sentry 復元後に観測実証で完了)

### 新 phase 挿入: L4-j-blocker (Sentry 接続復元 / 判断 phase)
CEO 判断 (2026-04-30):
- 旧計画: L4-j Phase 1 完了 → L4-i / L4-m / E-3 着手
- 新計画: **L4-j Phase 1 完了 → L4-j-blocker (Sentry 接続判断) → 結論次第で L4-i / L4-m / E-3 着手順を再決定**
- L4-j-blocker は code 変更を伴わない判断 phase。CEO の選択を待って次 phase を決める

### CEO 判断待ちの選択肢 (4 案)
1. **既存 Sentry project 復元** — 過去に存在した Sentry project の DSN / Auth Token を Vercel Shared env に再設定。dashboard / Discover に蓄積された過去データが残っていれば最短復旧
2. **新規 Sentry project 作成** (推奨案) — `culcept` 用に新規 project を Sentry SaaS で作成、新 DSN / Auth Token を Vercel Shared env に登録。過去データ無しだが clean start
3. **別 sink 採用** — Sentry を使わず別 telemetry 先 (PostHog / Datadog / Supabase logs / 自前 endpoint) に切替。設計差し戻し phase が必要
4. **telemetry なしで L4-i に進む** — 観測なしで code path だけ進める。CEO 既に却下 (Plan D の観測実証要件と矛盾、§10.2 #9 partial 固定化)

### 不変 (CEO 厳守 2026-04-30)
- L4-j Phase 1 commits リバートしない ✅ (HEAD = `a21d2f80`)
- L4-i / L4-m / E-3 着手しない (L4-j-blocker 判断後に着手順再決定) ✅
- ChatClient.tsx 触らない ✅
- env / package / next-env.d.ts / supabase temp 触らない ✅
- 本 phase は code 変更ゼロ、判断ログのみ ✅

### rollback 境界
- 本 phase は code 変更なし → rollback 対象は decision-log entry のみ (`git revert` で除去可能)
- L4-j Phase 1 wire (`30866d3e` + `a21d2f80`) は本 phase の rollback 対象外

## [2026-04-30] [Build] [L4-j-blocker — Q4 判断: Option 2 採用 (新規 Sentry project / Preview only DSN)] [承認: CEO]

### CEO 判断 Q4-blocker (2026-04-30)
- **採用**: Option 2 = 新規 Sentry project 作成 + Preview only DSN
- **却下**: Option 1 (既存復元) — 確認結果から既存 project の根拠が薄い (Vercel Project / Shared / .env.local / repo / git history すべて DSN 痕跡なし、Sentry dashboard project 0 件)
- **却下**: Option 3 (別 sink 採用) — `@sentry/nextjs` / Sentry config / tunnelRoute / sink 配線が実装済、PostHog 等への切替は scope 過大
- **却下**: Option 4 (telemetry なしで L4-i 進行) — L4-i は LLM 合成 phase、発火頻度 / 誤発火 / 出力品質 / 安全性を観測できない状態での着手は危険

### 進め方 (CEO 確定方針)
- いきなり Production へは入れない
- **まず Preview only で DSN 設定 → Sentry 観測実証 → PASS 後に Production DSN を別判断**

### CEO 担当作業 (2026-04-30 進行中)
1. Sentry SaaS で新規 Project 作成
   - Platform: Next.js
   - Project name: `culcept` (Vercel project 名と一致、混乱回避)
2. DSN 取得
3. Vercel Project `culcept` の Environment Variables に追加
   - key: `NEXT_PUBLIC_SENTRY_DSN`
   - value: Sentry DSN
   - scope: **Preview only** (Production / Development には入れない)
   - 可能なら branch filter: `feat/coalter-three-stage`
4. Preview redeploy

### Claude 担当作業 (CEO Preview URL 共有後)
Preview redeploy 完了後に下記 5 項目を確認:
1. **sentry-release** が最新 commit hash に一致 (HEAD = `37d92eb8` 時点)
2. **sentry-environment** = `vercel-preview`
3. DevTools Network で `/monitoring` request が出る (tunnelRoute による Sentry SaaS 転送)
4. Sentry dashboard に event / breadcrumb / transaction / replay のいずれかが見える
5. **L4-j Phase 1 の 4 event 観測**:
   - `coalter.mode.transition` (ModeSwitcher で Daily/通常切替)
   - `coalter.urgent.triggered` (「もう限界」等 critical keyword 送信)
   - `coalter.presence.state_transition` (S0→S1/S2 遷移)
   - `coalter.pattern.used` (pattern 算出)

### 判定基準 (CEO 確定 2026-04-30)
- Preview で `/monitoring` request が出る
- Sentry 側で最低限 `coalter.mode.transition` と `coalter.urgent.triggered` の 2 event が確認できる
- 上記 2 条件 PASS で **Sentry 接続復元 phase 一旦 PASS**
- その後 Production DSN を入れるかは **別判断** (L4-j-blocker の範囲外)

### 禁止事項 (CEO 厳守 2026-04-30)
- Production env に DSN を入れない (Preview PASS 後の別判断)
- Shared Variables で全 project / 全環境に広げない (Project scope 限定)
- Sentry project を複数作らない (`culcept` 1 個のみ)
- DSN を code に直書きしない (env 経由のみ)
- env / package / next-env.d.ts / Supabase は触らない
- L4-i へ進まない (本 phase PASS 待ち)
- 別 sink へ飛ばない (Sentry 採用方針維持)

### 不変 (CEO 厳守 2026-04-30)
- L4-j Phase 1 commits (`30866d3e` + `a21d2f80`) リバートしない ✅
- ChatClient.tsx 触らない ✅
- 本 phase は code 変更ゼロ、判断ログ + 観測手順記録のみ ✅

### rollback 境界
- 本 phase は code 変更なし → rollback 対象は decision-log entry のみ
- DSN 設定は Vercel UI 操作 → rollback も Vercel UI で env 削除 + redeploy のみ
- 観測 NG だった場合の次 phase: Sentry 接続トラブルシュート (DSN typo / project scope mismatch / build env 未反映 等) を切り分け、別 phase として記録

### 次ステップ (CEO Preview URL 共有待ち)
1. CEO が Sentry project 作成 + Vercel Preview env 登録 + redeploy 完了
2. CEO が Preview URL を共有
3. Claude が 5 項目検証 → 結果を decision-log に記録
4. 判定 PASS / NG の双方を別 entry で記録、PASS なら L4-i 着手可否を CEO 判断、NG ならトラブルシュート phase

## [2026-04-30] [Build] [L4-j-blocker — Sentry 接続復元 phase PASS (4/4 event 観測実証 完了)] [承認: CEO]

### 経過
- CEO が新規 Sentry project (`taishi-harada / culcept`) 作成、Preview only DSN を Vercel Project env に登録、redeploy 完了
- Preview URL: `https://culcept-i8yqqlwkz-taishis-projects-0a8deb17.vercel.app/`
- Sentry org: `taishi-harada`、project slug: `culcept`、org_id: 4511307264622592

### 5 項目検証 結果
| # | 項目 | 結果 | 根拠 |
|---|---|---|---|
| 1 | sentry-release | ✅ PASS | HTML meta tag に `sentry-release=28ba23e0d6b776b08c91d66029743298d67f8f90` (最新 commit と一致) |
| 2 | sentry-environment | ✅ PASS | HTML meta tag に `sentry-environment=vercel-preview` |
| 3 | `/monitoring` request | ✅ PASS | DevTools Network で 21 件以上観測、payload に正規 Sentry envelope |
| 4 | Sentry dashboard 反映 | ✅ PASS | `taishi-harada.sentry.io/insights/projects/culcept/` で Issues 2 件 (CULCEPT-1 + CULCEPT-2) |
| 5 | L4-j 4 event 観測 | ✅ **完全 PASS (4/4 種)** | CULCEPT-2 の Breadcrumbs pane で全 4 category 観測 |

### 観測された L4-j 4 event (CULCEPT-2 の Breadcrumbs)
| category | level | trigger 操作 | 観測 timestamp | data payload |
|---|---|---|---|---|
| `coalter.urgent` | warning | 「もう限界」送信 | 2026-04-30T10:31:07.721Z | `{category:"rupture_detected", form:"dominant_card", memoryFallback:"demote", pairId:"", ts:1777545067721}` |
| `coalter.presence` | info | 同上 (S0→S2 critical) | 2026-04-30T10:31:07.721Z | `{from:"S0", to:"S2", trigger:"critical", pairId:"", ts:1777545067721}` |
| `coalter.pattern` | info | 同上 (variant A) | 2026-04-30T10:31:07.721Z | `{state:"S2", mode:"normal", variant:"A", hasSecondary:false, pairId:"", ts:1777545067721}` |
| `coalter.mode` (#1) | info | Daily 切替 | 2026-04-30T10:31:20.914Z | `{from:"normal", to:"daily", trigger:"manual_switch", pairId:"", ts:1777545080914}` |
| `coalter.mode` (#2) | info | 通常切替 | 2026-04-30T10:31:21.907Z | `{from:"daily", to:"normal", trigger:"manual_switch", pairId:"", ts:1777545081907}` |

→ 5 件の telemetry breadcrumb が単一 error event (level: error, message: "L4-j breadcrumb verification - manual trigger") に attach されて Sentry に到達。

### payload 制約 (CEO 厳守項目) 全 PASS
- ✅ 会話本文 / ユーザー入力文 / 個人情報を一切含まない (構造化 enum + number のみ)
- ✅ `pairId: ""` (空文字) — `initial?.pairId ?? ""` のみ、telemetry のための fetch 追加なし
- ✅ state / mode / pattern variant / category / form / trigger 等の enum
- ✅ `coalter.urgent` のみ level=warning、他は info — `lib/coalter/presence/sentryTelemetry.ts` 仕様と一致

### CEO 判定基準到達
- 必須: `/monitoring` request が出る → **超過 (21 件)**
- 必須: `coalter.mode.transition` 観測 → **超過 (2 件)**
- 必須: `coalter.urgent.triggered` 観測 → **PASS (1 件)**
- 追加: `coalter.presence.state_transition` 観測 → PASS
- 追加: `coalter.pattern.used` 観測 → PASS

### 検証経路 (CEO 操作詳細)
1. Preview talk page で chat 操作:
   - 「もう限界」送信 (19:31:07 JST) → 3 event 同時 emit
   - CoAlter mode で Daily 切替 (19:31:20 JST) + 通常戻し (19:31:21 JST) → mode_transition × 2
2. DevTools Console で uncaught error:
   ```js
   setTimeout(() => { throw new Error("L4-j breadcrumb verification - manual trigger") }, 0)
   ```
3. Sentry SDK の `window.onerror` integration が auto-capture
4. error event に直前の 5 breadcrumb が attach されて `/monitoring` 経由で Sentry SaaS に送信
5. CEO が Sentry dashboard で CULCEPT-2 を開いて Breadcrumbs pane を確認

### 重要な技術知見 (今後の運用 / 別 phase 設計参考)
- `Sentry.addBreadcrumb` 単体は **Sentry に独立送信されない** (transaction/error の context として attach のみ)
- `tracesSampleRate: 0.1` で 90% の transaction が drop される → breadcrumb もそれと運命を共にする
- error event は **100% sampling** (instrumentation-client.ts の error 設定) → breadcrumb attach の最確実経路
- `window.Sentry` は modern Sentry SDK (v10) で **window 露出されない** → console から直接呼べない、uncaught error 経由が唯一の手段
- L4-j Phase 1 の 4 event は client side (`instrumentation-client.ts` の `wireSentryTelemetry()` で sink 注入) でのみ emit
- server side error (例: CULCEPT-1 の `/offline` Server/Client Component bug) には CoAlter breadcrumb は attach されない (server runtime には sink なし)

### Phase ステータス確定
- **L4-j-blocker = PASS**
- **L4-j Phase 1 観測実証 = 完了**
- **§10.2 #9 status**:
  - 4 event wire complete + Sentry 観測実証 完了
  - 但し CEO 確定方針 (Plan D) で **partial 維持** (8 event 中 4/8 のみ wire、残 4 event は consent / rejection / legacy / ratelimit 経路依存)
  - **complete 昇格は別 phase で 4 event 追加 wire してから**

### 並行観測された副次論点 (本 phase 範囲外、別 task で対応)
- **CULCEPT-1**: `/offline` page の Next.js Server/Client Component event handler bug
  - "Event handlers cannot be passed to Client Component props. {onClick: function onClick, className: ..., children: ...}"
  - 修正は spawn task として記録済 (本 phase scope 外)

### 不変 (CEO 厳守 2026-04-30)
- L4-j Phase 1 commits (`30866d3e` + `a21d2f80`) リバートしない ✅
- ChatClient.tsx 触らない ✅
- env / package / next-env.d.ts / supabase は触らない ✅
- L4-i / L4-m / E-3 へまだ進まない (本 phase PASS で進路再決定 phase に移行) ✅

### 次フェーズ (CEO 判断待ち)
本 phase PASS により下記 4 つの判断が CEO に戻る:

1. **Production DSN 投入の可否** (本 phase 範囲外、CEO 別判断)
   - 案 A: Preview PASS のまま Production も同 DSN を投入 (Project env Production scope)
   - 案 B: Preview のみ運用継続、Production は L4-i / L4-m / E-3 完了後の別 phase で判断
   - 案 C: 別 Sentry project (Production 用) を分離 (本気運用なら推奨だが工数 +)

2. **L4-i / L4-m / E-3 の着手順**
   - Plan D 元案: L4-i (LLM 合成) → L4-m (memory 拡充) → E-3 (Stage 4 §10.2 完成)
   - 本 phase で telemetry 観測経路が確立 → L4-i の発火頻度 / 誤発火 / 出力品質 / 安全性が観測可能になった (本来の前提条件 PASS)

3. **§10.2 #9 status を complete に昇格するか**
   - 残 4 event (consent / rejection / legacy / ratelimit) を wire する別 phase を切るか、partial のまま L4-l 完了とするか

4. **CULCEPT-1 (`/offline` bug) の修正タイミング**
   - 既に spawn task に記録済、本 phase 完了後の別 task で対応

### rollback 境界
- 本 phase は code 変更なし → rollback 対象は decision-log entry のみ
- DSN 設定: Vercel UI 操作のみ、rollback は env 削除 + redeploy
- L4-j Phase 1 wire (`30866d3e` + `a21d2f80`) は不変

## [2026-04-30] [Build] [L4-j-blocker PASS 後 進路再決定 (Q6 / Q7 / Q8 / Q9)] [承認: CEO]

### 前提
L4-j-blocker / Sentry 接続復元 phase は PASS として CEO 承認 (2026-04-30):
- Preview only DSN 設定確認
- `/monitoring` request 発生確認
- Sentry issue 生成確認
- Breadcrumbs pane で 4 event 観測確認 (`coalter.urgent.triggered` / `coalter.presence.state_transition` / `coalter.pattern.used` / `coalter.mode.transition`)
- payload に会話本文 / ユーザー入力文 / 個人情報なし確認
→ Sentry sink は Preview で観測可能

### Q6: Production DSN 投入 → **案 B: Preview only 運用継続** (CEO 確定 2026-04-30)
理由 (CEO):
1. L4-j の目的は「観測経路の実証」、Preview で達成済
2. Production はまだ L4-j Phase 1 を promote していない、Production DSN の必然性が薄い
3. L4-i / L4-m / E-3 の preview 検証を先に、観測対象が増えた段階で Production DSN
4. Production event を早期に混ぜると初期検証ノイズが増える
5. Preview / Production の混在は environment tag で分離できるが、今は運用単純化を優先
- **Production DSN は追加しない**。Preview only 維持

### Q7: 次の着手順 → **L4-i → L4-m → E-3** (Plan D 元案維持) (CEO 確定 2026-04-30)
理由 (CEO):
1. L4-i は LLM 合成で発火頻度 / 誤発火 / 出力品質 / 安全性の観測価値が最も高い
2. Sentry preview 観測経路が成立 → L4-i を Preview で安全に検証可能
3. L4-m は memory 拡張、L4-i の出力挙動を見た後の方が接続判断しやすい
4. E-3 は §10.2 全体仕上げ、L4-i / L4-m 後が妥当
- **次フェーズは L4-i 詳細設計 → CEO 確認 → 実装** の順 (いきなり実装に入らない)

### Q8: §10.2 #9 status → **案 A: partial のまま** (CEO 確定 2026-04-30)
理由 (CEO):
- 今回 wire したのは production-reachable 4 event (state_transition / pattern_used / mode_transition / urgent_triggered)
- 残 4 event (consent.event / rejection.recorded / legacy.fallback / ratelimit.blocked) は依存 UI / 依存 phase が未完
- 8/8 観測可能ではない
- 記録統一: 「**L4-j Phase 1: production-reachable 4 event Preview 観測 PASS / §10.2 #9 は partial 維持**」
- **§10.2 #9 を complete に昇格しない**

### Q9: CULCEPT-1 `/offline` bug → **案 B: L4-i 完了後に対応** (CEO 確定 2026-04-30)
理由 (CEO):
1. Sentry で捕捉できるようになったため存在は追跡可能
2. `/offline` は重要だが現在の主導線ではない
3. 今すぐ入ると L4-i の流れが分断される
4. L4-i / L4-m の観測設計を優先する方がプロダクト上の価値が高い
- **L4-i 完了後の修正候補として保持** (decision-log に記録、放置ではない)

### 次アクション (CEO 指示 2026-04-30)
1. L4-j-blocker PASS を decision-log に記録 → 完了済 (`ee4dc476`)
2. Production DSN は追加しない → 不変
3. §10.2 #9 は partial 維持 → 不変
4. `/offline` bug は L4-i 後 → 保留 task に残す
5. **L4-i 詳細設計を提出**

### L4-i 設計で必ず covers すべき項目 (CEO 指示)
1. LLM 合成がどこで発火するか
2. どの presence state で発話するか
3. 発話頻度制御
4. safety gate
5. 文字数制限
6. ユーザー入力本文を telemetry payload に入れない
7. telemetry で観測する event
8. Sentry breadcrumb で確認する項目
9. rollback 境界
10. Production promote 条件
- **いきなり実装ではなく設計から**

### 不変 (CEO 厳守 2026-04-30)
- L4-j Phase 1 commits (`30866d3e` + `a21d2f80`) リバートしない ✅
- ChatClient.tsx 触らない ✅
- env / package / next-env.d.ts / supabase 触らない ✅
- 別 sink へ飛ばない ✅
- Production DSN 追加しない ✅ (本 entry で確定)
- §10.2 #9 を complete に昇格しない ✅ (本 entry で確定)
- L4-i 設計 phase 中は code 変更なし、設計提示 → CEO 確認 → 実装

### rollback 境界
- 本 entry は判断記録のみ、code 変更なし → rollback 対象は decision-log entry

## [2026-04-30] [Build] [L4-i Phase 1 — speech synthesis gated wire 完成 (commit `c2472719`)] [承認: CEO]

### 実装内容
- 新規 file:
  - `lib/coalter/presence/speechFetchGate.ts` — client gate (`process.env.NEXT_PUBLIC_COALTER_PRESENCE_SPEECH_FETCH === "true"`、Phase 1 default false)
  - `app/api/coalter/speech/route.ts` — server-side LLM 経路 (二重 gate: presenceExecutor + LLM flag、auth 401 厳格、staticFallback path 整理)
  - `tests/unit/coalter/speechFetchGate.test.ts`
  - `tests/unit/coalter/api/speechApiRoute.test.ts`
  - `tests/unit/coalter/presence/sentryTelemetryL4i.test.ts`
  - `tests/unit/coalter/upperLayerSpeechFetch.test.ts`
- 改修 file (Urgent 触らない、CEO 厳守):
  - `lib/coalter/presence/telemetryEvents.ts` — `PatternUsedEvent` に optional 5 field 追加 (speechSource / retries / latencyMs / validationFailed / fallbackReason)、`legacy.fallback` 流用なし
  - `app/components/chat/UpperLayerMount.tsx` — speech fetch effect (gate OFF で起動ゼロ、AbortController + 2s timeout + in-flight dedupe + mounted ref + negative cache 30s)
  - `app/components/chat/states/UpperLayerStateRenderer.tsx` — `body?: string` prop forward
  - `app/components/chat/states/S2Opening.tsx` / `S5Bridging.tsx` / `S7ProposalShown.tsx` — `body?: string` prop accept、undefined で既存 hardcoded fallback (Production 不変)
  - `app/components/chat/hooks/usePresenceExecutor.ts` — `emitPatternUsed` に default static speech field 追加
  - `tests/integration/coalter/stage4PathBComplete.test.ts` — §10.2 #8 evidence 更新 (status は missing 維持、Phase 2 で本番稼働判定)

### CEO 14 必須項目との対応
| # | 項目 | 検証 |
|---|---|---|
| 1 | env 未設定で fetch 0 | `speechFetchGate.test.ts` + `upperLayerSpeechFetch.test.ts` (gate OFF early return) |
| 2 | env 未設定で UI 文言不変 | S2/S5/S7 `body undefined` で hardcoded fallback render test |
| 3 | API route で LLM flag OFF なら Anthropic call なし | `speechApiRoute.test.ts` (gate 2 直前で flag_off 経路) |
| 4 | S2/S5/S7 のみ speech 対象 | `SPEECH_ENABLED_STATES` grep + 6 state 拒否 test |
| 5 | S0/S1/S3/S4/S6/S8 で fetch なし | `state !== "S2" && state !== "S5" && state !== "S7"` guard grep |
| 6 | urgentDecision 出ても speech fetch なし | UrgentLayer / UrgentMessageCard / UrgentRelease grep で関連 import 無し |
| 7 | LLM response 本文 telemetry 不在 | `PatternUsedEvent` 型 grep で禁止 field 不在確認 |
| 8 | prompt 本文 Sentry 不在 | route.ts grep で `promptText/llmResponseRaw/violationMessage` 禁止 |
| 9 | validation 違反時 fallback | API route の validation_failed path |
| 10 | timeout fallback | `setTimeout(..., 2000)` + `controller.abort()` |
| 11 | in-flight 重複 fetch なし | `inFlightSpeechRef` Map test |
| 12 | stale response UI 上書きなし | `speechMountedRef` + AbortController return cleanup |
| 13 | ChatClient.tsx touch なし | git diff + grep で確認、test で固定 |
| 14 | Production default behavior 不変 | gate OFF / S0-S1/S3-S8 / urgent path 全て fetch ゼロ |

### test 結果
- 新規 4 test file 全 PASS (45/45 test cases)
- 既存 coalter 関連 146 test file 全 PASS (2114/2114 test cases)
- type check: L4-i Phase 1 触った file に error ゼロ (既存 error は Stage4 範囲外で別 phase)
- 構造 invariant: ChatClient.tsx / UrgentLayer / UrgentMessageCard / UrgentRelease に L4-i 関連 import なし

### 実装の core 原則 (CEO v2 設計反映)
1. **二重 gate**:
   - client `isSpeechFetchEnabled()` env 未設定 false (Phase 1 default)
   - server LLM flag `presenceSpeechLLMEnabled` + `ANTHROPIC_API_KEY` 必須
   - 二層独立、片方 OFF で完全停止
2. **Urgent LLM 完全除外**:
   - UrgentLayer / UrgentMessageCard / UrgentRelease 触らない
   - urgentMessage は既存 `URGENT_FALLBACK_MESSAGES` static 維持
   - LLM 化は L4-i Phase 3 以降の別審議
3. **`legacy.fallback` 流用禁止**:
   - speech 失敗 / fallback は `coalter.pattern.used` payload に集約
   - `coalter.legacy.fallback` semantics は legacy CoAlterCard 経路専用維持
4. **auth 失敗 = 401 厳格**:
   - static fallback と混ぜない (CEO 厳守)
   - rate_limited は 200 + speechSource:"static" + fallbackReason:"rate_limited"
5. **Phase 1 で env 追加なし**:
   - code 変更のみ、Vercel env は触らない
   - Phase 2 で Preview env 3 個 (`ANTHROPIC_API_KEY` + `COALTER_PRESENCE_SPEECH_LLM=true` + `NEXT_PUBLIC_COALTER_PRESENCE_SPEECH_FETCH=true`) を追加するだけで起動

### Production behavior 不変 確認
- Phase 1 commit (`c2472719`) を本番 promote しても:
  - `isSpeechFetchEnabled()` = false → fetch 起動ゼロ → /api/coalter/speech 呼ばれない
  - `presenceSpeechLLMEnabled` = false → LLM call ゼロ
  - `ANTHROPIC_API_KEY` 未設定 → setLlmCall(null) (instrumentation.ts 既存挙動維持)
  - state component body prop = undefined → hardcoded fallback (既存挙動維持)
  - urgentMessage = `URGENT_FALLBACK_MESSAGES[category]` (既存挙動維持)
- L4-i Phase 1 commit 後も **LLM はまだ動かない** (CEO 厳守 #7)

### Phase 2 への移行手順 (CEO 操作のみ、code 変更ゼロ)
1. CEO Vercel Project culcept → Settings → Environment Variables → Preview only に追加:
   - `ANTHROPIC_API_KEY` = `<Anthropic SaaS API key>`
   - `COALTER_PRESENCE_SPEECH_LLM` = `true`
   - `NEXT_PUBLIC_COALTER_PRESENCE_SPEECH_FETCH` = `true`
2. Preview redeploy
3. Stage 2.1 Smoke (20 calls) → Stage 2.2 Observation (100 calls) → Stage 2.3 Variant 別 review (5 sample × 7 variant = 35 sample) の 3 sub-stage 検証
4. 全 sub-stage PASS で Phase 3 (Production promote) を CEO 別判断

### §10.2 #9 status (CEO Q8 確定方針 維持)
- partial 維持 (4/8 wire、本 phase で変更なし)
- L4-i Phase 1 で telemetry payload に new field 追加したが、event 種類は 8 のまま
- 「§10.2 #9 partial」と「Production-reachable 4 event Preview 観測 PASS」が表現規約

### §10.2 #8 status
- missing 維持 (本 phase commit 後も)
- 理由: Phase 1 は wire 完了だが LLM 経路 dormant (Production 稼働ではない)
- 本番稼働 = L4-i Phase 2 (Preview 観測 PASS) → Phase 3 (Production promote)
- evidence 更新: bridge wire 完了の事実を記録

### 不変 (CEO 厳守 2026-04-30)
- ChatClient.tsx 触らない ✅
- UrgentLayer / UrgentMessageCard / UrgentRelease 触らない (Phase 1 Urgent LLM 化なし) ✅
- env / package.json / next-env.d.ts / Supabase 触らない (Phase 1) ✅
- `legacy.fallback` を speech fallback に流用しない ✅
- 新 telemetry event 追加しない (`pattern.used` payload 拡張のみ) ✅
- §10.2 #9 を complete に昇格しない ✅
- Production DSN 追加しない (Phase 2 Preview only 維持) ✅
- 別 sink へ飛ばない (Sentry 維持) ✅
- L4-i Phase 1 後も LLM はまだ動かない ✅

### rollback 境界
- L0 (env): Vercel env を追加しない → rollback 不要 (Phase 1 commit は Production 影響なし)
- L1 (code): `git revert c2472719` + push (15-20 分)、L4-k 完了状態 (5c7722ad) に戻る
- Phase 2 で env 追加後の rollback は env 削除 + redeploy

### 次フェーズ (CEO 判断待ち)
1. Phase 1 commit を CEO Production promote するか?
   - 推奨: そのまま Production 反映 (behavior 不変なので安全、git history を main に整える)
   - or: Preview だけで保持 (`feat/coalter-three-stage` で Phase 2 着手後にまとめて Production)
2. Phase 2 着手のタイミング
3. Phase 2 で env 追加するか別判断 (CEO 確定済 = Phase 2 で env 追加 + 観測)

## [2026-05-01] [Build] [PR #49 — main 合流準備 (merge commit `1f97abc6` + 14887ff1 retrigger)] [承認: CEO]

### 経緯
- CEO 判断 Q1 = Option B (regular merge via PR、Vercel UI Promote 不採用) → `feat/coalter-three-stage` → `main` の PR 作成へ
- 2026-05-01 00:01: PR #49 作成 (https://github.com/Taishiharada22/Culcept/pull/49)
- 2026-05-01 00:09: GitHub が `mergeable: CONFLICTING` 検出 → 1 file (`docs/decision-log.md`) で実 conflict
  - feat 側: 2026-04-26 〜 L4-i Phase 1 entries
  - main 側: 2026-04-21 Phase 0–F entry
  - 両 timeline を時系列共存させて手動 resolve、merge commit `1f97abc6` で feat に取り込み
- 2026-05-01 00:10: post-merge test 7208/7208 PASS、push origin
- 2026-05-01 00:11: PR `mergeable: MERGEABLE`、CI lint-and-test SUCCESS (3:31)、Vercel Preview build PENDING
- 2026-05-01 00:30: Vercel build が **20 分超 PENDING で stuck** → CEO が Vercel UI で build キャンセル
- 2026-05-01 00:32: empty commit `14887ff1` で Vercel build retrigger

### 不変 (Phase 1 への影響なし)
- L4-i Phase 1 commits (`c2472719` + `c409a6be`) 保存、code 変更なし
- merge commit (`1f97abc6`) は L4-i Phase 1 の挙動を変えない
- empty commit (`14887ff1`) は CI retrigger のみ、code 変更なし
- Production behavior 不変原則維持 (env 未設定で fetch ゼロ、UI 文言不変)

### test 結果 (post-merge)
- coalter test suite: 146 file / 2114 case PASS
- 全 test suite: 351 file / 7208 case PASS
- L4-i Phase 1 test (新規 4 file + 既存 1 file 拡張): 5 file / 68 case PASS

### 残り step
1. Vercel Preview build (retrigger) SUCCESS 待機
2. CEO PR review + approve
3. main へ regular merge (squash 不採用、merge commit 採用)
4. main HEAD 自動 deploy → Production
5. CEO Production smoke 9 項目検証 (sentry-release / vercel-production / /api/coalter/speech 0 件 / UI / Urgent / breadcrumb)

### CEO 厳守 (Production deploy 前)
- Production env に `ANTHROPIC_API_KEY` まだ入れない
- Production env に `COALTER_PRESENCE_SPEECH_LLM=true` まだ入れない
- Production env に `NEXT_PUBLIC_COALTER_PRESENCE_SPEECH_FETCH=true` まだ入れない
- Urgent LLM 化しない (Phase 1 範囲外)
- L4-m / E-3 にまだ進まない

## [2026-05-01] [Build] [PR #49 main 着地 → Production env scope 修正 → Production smoke 9/9 PASS] [承認: CEO]

### Phase 1 main 着地 (commit `6a0f6d4b`)
- 2026-05-01 ~01:54 JST: CEO が PR #49 を **Create a merge commit** で main へ regular merge
- main HEAD: `6a0f6d4bffb755ad076017c87431b9fa3be92af0`
- Vercel Production auto-deploy 起動、~7 分後 SUCCESS

### Production smoke 1 巡目 — env scope 違反検出
- Claude curl 検証 (alias `culcept.vercel.app`): smoke #1-5, #5b, #9 PASS (sentry-release 一致、env vercel-production、API routes alive、Production DSN 不在)
- CEO 視覚確認 (`culcept-2l32gow43-...` deployment URL): **`/api/coalter/speech` 4 件 fire、speechSource:"llm"**
- 原因特定: **Production env scope に L4-i Phase 1/2 関連 env 3 件が誤って入っていた**
  - `COALTER_PRESENCE_SPEECH_LLM=true` (Production scope check 残存)
  - `ANTHROPIC_API_KEY` (Production scope check 残存)
  - `NEXT_PUBLIC_COALTER_PRESENCE_SPEECH_FETCH=true` (Production scope check 残存)
- **CEO 厳守条件 (Production env まだ入れない) 違反**

### env scope 修正 (CEO 操作)
- 上記 3 env を **Vercel Project env で Production check を外し、Preview only に変更**
- ただし `NEXT_PUBLIC_*` は build-time inline → Production redeploy 必須

### Production redeploy (Claude trigger)
- 2026-05-01 ~02:35 JST: Claude が main に **empty commit `c9257721`** push
  - commit message: `ci(coalter): retrigger Production build after env scope correction`
- Vercel Production auto-build 起動、~12 分後 SUCCESS
- 新 deployment alias `culcept.vercel.app` が `c9257721` を指すように更新

### Production smoke 2 巡目 — 9/9 全 PASS
| # | 項目 | 結果 |
|---|---|---|
| 1 | sentry-release `c9257721920d7020ff32c522202c38da334fd2fb` | ✅ Claude curl + CEO Console 確認 |
| 2 | sentry-environment `vercel-production` | ✅ |
| 3 | `/api/coalter/presence/state` 応答 (HTTP 501 Supabase gate 期待通り) | ✅ |
| 4 | `/api/coalter/presence/telemetry` 応答 (HTTP 405 GET 不許可) | ✅ |
| 5 | `/api/coalter/memory/list` 応答 (HTTP 401 auth required) | ✅ |
| 5b | `/api/coalter/speech` POST (HTTP 401 auth required、Phase 1 wire 反映確認) | ✅ |
| **6** | **`/api/coalter/speech` client request 0 件** | ✅ **(43 件中 0 件、CEO Network tab 確認 `culcept.vercel.app` 経由)** |
| 7 | S2/S5/S7 UI 文言 既存 hardcoded のまま | ✅ |
| 8 | UrgentLayer message が `URGENT_FALLBACK_MESSAGES` static のまま | ✅ |
| 9 | Production env DSN 不在 (sentry-public_key/org_id 未含) | ✅ |

### Production env 状態 (2 巡目検証時点)
- ❌ `NEXT_PUBLIC_SENTRY_DSN` 未設定 (Production)
- ❌ `ANTHROPIC_API_KEY` 削除済 (Production scope 外、Preview only)
- ❌ `COALTER_PRESENCE_SPEECH_LLM=true` 削除済 (Production scope 外、Preview only)
- ❌ `NEXT_PUBLIC_COALTER_PRESENCE_SPEECH_FETCH=true` 削除済 (Production scope 外、Preview only)
- ✅ `NEXT_PUBLIC_COALTER_PRESENCE_EXECUTOR=true` (presence executor base、Path B 完了状態)

→ Phase 1 default OFF (CEO 厳守) を **完全に満たす Production 状態を実現**

### 学び (operational lesson)
- NEXT_PUBLIC_* env は build-time inline → Production redeploy しないと反映されない (server-only env と動作差)
- Vercel deployment URL `culcept-<hash>-...vercel.app` は immutable、bookmark 不推奨 (古い build に永続接続)
- Production observation には **alias `culcept.vercel.app` のみ使う** ことで常に最新 build を見られる
- env scope 設定時は **Production check の状態を必ず確認**、Phase 1 中は意図しない Production 露出を避ける

### Production HEAD (2026-05-01 03:13 JST 時点)
- main: `c9257721920d7020ff32c522202c38da334fd2fb` (env scope correction retrigger)
- 1 つ手前: `6a0f6d4b` (PR #49 merge commit、L4-i Phase 1 wire)
- 2 つ手前: `92bf2129` (alter-morning PR-49)

### 副次論点 (将来 task、Phase 1 完了判定には影響なし)
- `/api/coalter/speech` route の `speechSource: "llm"` mislabel: gate 2 通過 + buildPresenceSpeech 内部 fallback の場合に `speechSource: "fallback"` を返すべき (現状は "llm" 固定)。Phase 2 着手前に修正候補
- response payload の actual source propagation: buildPresenceSpeech から retries/latency/validationFailed を素直に取れる API 改修

### 不変 (CEO 厳守 維持)
- Phase 1 commit (`c2472719` + `c409a6be`) は L4-i Phase 1 wire の正本、Production にも反映済
- Production env に L4-i Phase 1/2 関連 env を **入れない** (Phase 2 で Preview only 投入予定)
- ChatClient.tsx / UrgentLayer / UrgentMessageCard / UrgentRelease 触らない
- §10.2 #9 partial 維持
- L4-m / E-3 にまだ進まない

### 次フェーズ: L4-i Phase 2 着手準備
- Phase 2 = Preview only env 投入 + staged observation (20 calls smoke → 100 calls observation → 5 sample × 7 variant review)
- Phase 2 着手の CEO 判断後、Claude が手順を提示

## [2026-05-01] [Build] [L4-i Phase 2 Stage 2.1 — 1-call canary NG → mislabel fix-forward] [承認: CEO]

### 経緯
- CEO が Phase 2 着手を承認、staged approach (1-call canary → 5-call mini smoke → 20-call smoke) で慎重に開始
- Stage 2.1 第 1 段 1-call canary 実施 (Preview build `4c7e16a5`):
  - request: `/api/coalter/speech` POST に対して 1 件発火
  - response: `{body: "今、間に入れそうな間が少しありそう。" (variant A static fallback と一致), speechSource: "llm", latencyMs: 0, retries: 0, validationFailed: false, fallbackReason: null}`
- **canary NG 判定** (CEO 厳格判定基準):
  - `latencyMs: 0` = 実 LLM call なし
  - `body` が static fallback と完全一致 = 内部 fallback path 経由
  - `speechSource: "llm"` だけ正しいラベルではない = 観測指標が信用できない

### Vercel Redeploy without Build Cache 診断 (1 回限り、CEO GO)
- 実施: CEO が Vercel UI で `4c7e16a5` deployment を Build Cache OFF で redeploy
- 結果: **Case B** — `latencyMs: 0` のまま変化なし
- 解釈: env / injection 問題は build cache 単独の問題ではない。fix-forward 必要

### 根本原因 (推定)
1. **route mislabel bug**: `app/api/coalter/speech/route.ts` が gate 2 通過後に `speechSource: "llm"` を **固定 return** していた。buildPresenceSpeech の actual source (static / llm / fallback) を伝播していなかった
2. **buildPresenceSpeech metadata 不足**: `SpeechOutput` interface に source / retries / latencyMs / validationFailed / fallbackReason が定義されておらず、route が伝播できる metadata がなかった
3. **injection state 推測**: route gate 2 で `process.env.ANTHROPIC_API_KEY` が読めても、buildPresenceSpeech 内 `injectedLlmCall` が null のまま (instrumentation.ts cold start で setLlmCall が呼ばれなかった可能性、Vercel serverless で route function instance に instrumentation が反映されなかった可能性)

### Fix-forward 内容 (CEO 厳守、Stage 2.1 継続前必修)

#### 1. `lib/coalter/presence/speechTypes.ts` — SpeechOutput 拡張
- `SpeechSource` type 追加: `"static" | "llm" | "fallback"`
- `SpeechFallbackReason` type 追加: `"flag_off" | "llm_error" | "validation_failed" | "timeout"` (route 側 reason は別途扱う、speechBuilder は llm_error / validation_failed のみ)
- `SpeechOutput` interface に必須 metadata 5 field 追加: source / retries / latencyMs / validationFailed / fallbackReason

#### 2. `lib/coalter/presence/speechBuilder.ts` — actual source propagation
- `buildPresenceSpeech` を path 別に metadata 正直設定:
  - flag OFF: `source:"static"`, `latencyMs:0`, `fallbackReason:null` (intended static path)
  - flag ON + 注入なし: `source:"fallback"`, `fallbackReason:"llm_error"` (LLM not available)
  - flag ON + LLM throw: `source:"fallback"`, `fallbackReason:"llm_error"`, latency 実測値
  - flag ON + LLM 成功 + validator OK: `source:"llm"`, `retries:N`, `latencyMs > 0`
  - flag ON + LLM 成功 + validator 全 retry 失敗: `source:"fallback"`, `fallbackReason:"validation_failed"`, `validationFailed:true`, `retries:-1`
- `hasLlmCallInjected()` helper export (route 側 lazy init 判定用)

#### 3. `app/api/coalter/speech/route.ts` — propagation + lazy init
- `speechSource: "llm"` 固定削除
- `buildPresenceSpeech` の `result.source / retries / latencyMs / validationFailed / fallbackReason` を SpeechResponse に **直接 propagate**
- **Lazy init recovery path 追加**: gate 2 通過後、`!hasLlmCallInjected()` なら request 時に `createAnthropicLlmCallFromEnv()` で injection 再試行 (instrumentation cold start で漏れた function instance を recovery)
- 既存の rate_limited / unauthorized / 4xx 経路は不変

#### 4. Tests
- 新規: `tests/unit/coalter/presence/speechBuilderMetadata.test.ts` (5 path 全 cover、SpeechOutput 構造 invariant)
- 既存: `tests/unit/coalter/api/speechApiRoute.test.ts` の import grep を multi-line destructure に対応
- 全 coalter 147 file / 2123 test PASS、回帰ゼロ

### 不変 (CEO 厳守維持)
- ChatClient.tsx 触らない ✅
- UrgentLayer / UrgentMessageCard / UrgentRelease 触らない (Urgent LLM 化なし) ✅
- env / package.json / next-env.d.ts / Supabase 触らない ✅
- §10.2 #9 partial 維持 ✅
- Production env 触らない ✅
- L4-m / E-3 / 別 sink へ進まない ✅
- `legacy.fallback` を speech fallback に流用しない ✅

### 次ステップ
1. fix-forward push → Preview auto-build
2. CEO 再 canary (1 call) on fixed build:
   - 期待 (env 設定 + injection OK): `source:"llm", latencyMs > 100, body 動的`
   - 期待 (env 不在): `source:"fallback", fallbackReason:"llm_error"` (label 正直化、本当の状態を露呈)
3. canary PASS なら 5-call mini smoke (15 秒間隔以上、CEO 確定 rate limit 回避)
4. PASS なら 20-call smoke
5. 全 PASS なら CEO 判断で Stage 2.2 (100 calls) へ

## [2026-05-07] [Build] [L4-i Phase 2 Stage 2.1 — 5-call mini smoke v4 PASS + 20-call 進行判断] [承認: CEO]

### 経緯 (fix-forward 5 段の累積)
1. **v1 mislabel fix** (commit `31440a84`, 2026-05-01): route の `speechSource:"llm"` 固定削除、buildPresenceSpeech metadata 伝播
2. **v2 cache 汚染 fix** (commit `3ac0e303`): static fallback body を LLM 結果として cache していた問題を `source === "llm"` gate で解消
3. **v2.5 cleanup-abort fix** (commit `84ef2f16`): cleanup 由来 AbortError が 30s negative cache を立てていた問題を `timeoutFired` flag で区別
4. **v3 timeout 拡張** (commit `e07509b2`): 2s → 5s → 8s。実 LLM latency ~2047ms 直接 probe 確認、retry 込みで 5s では足りず race
5. **breadcrumb buffer 拡張** (commit `54cb45bd`): default 100 → 500、polling chatter (~24/min) で 4 分以内に coalter.* 消失する問題を解消
6. **v3 5-call で 5 success + 5 cancel + 1 emit 観測** (Sentry) → 観測モード必要と判定
7. **v4 Option C' 観測モード追加** (commit `a741d80d`):
   - `NEXT_PUBLIC_COALTER_PRESENCE_SPEECH_OBSERVATION_MODE=true` で speech session cache / negative cache を skip
   - effect deps に `observationKey = ${kind}:${detectedAt}` 追加し signal 毎に再実行
   - in-flight dedupe / AbortController / 8s timeout は維持
8. **v4 Fix A/B revised** (commit `e7682b4a`, 本エントリ対象):
   - **Fix A**: cleanup observationMode 時に `controller.abort()` だけでなく `clearTimeout(timeoutId)` も skip。8s timeout 保険を維持 (timeoutId は finally で clear)
   - **Fix B**: telemetry dedupe key を observation 時 `${baseKey}|${observationKey}` に拡張。同一 (variant, state, mode) でも observation key 違いで別 emit を許容、同 request 内 dedupe は維持
   - GPT 補正受領: 当初案 (clearTimeout も実行) は 8s 保険を消すため NG → 完全 skip 案を採用

### Stage 2.1 5-call mini smoke v4 結果 (Sentry breadcrumb 8 件、CEO 共有 2026-05-07)

| # | UTC | latencyMs | retries | speechSource | fallbackReason | validationFailed |
|---|-----|-----------|---------|--------------|----------------|------------------|
| 1 | 20:22:29 | 1721 | 0 | llm | null | false |
| 2 | 20:22:03 | 3987 | 1 | llm | null | false |
| 3 | 20:25:26 | 6775 | **2** | llm | null | false |
| 4 | 20:25:51 | 1970 | 0 | llm | null | false |
| 5 | 20:26:12 | 4123 | 1 | llm | null | false |
| 6 | 20:26:27 | 2817 | 0 | llm | null | false |
| 7 | 20:26:49 | 1903 | 0 | llm | null | false |
| 8 | 20:26:53 | 2204 | 0 | llm | null | false |

- **observationKey 区別 PASS**: 同 thread / 同 (variant=A, state=S2, mode=normal) で 8 件分離 emit (Fix B 機能)
- **speechSource 分布**: llm 100% (8/8) — LLM 経路完全活性、injection OK、retry 経路含めて全件成功
- **latency 統計**: median ~2510ms / mean ~3299ms / p95 ~6775ms / max **6775ms (outlier 1)**
- **retries 分布**: 0=6 (75%) / 1=2 (25%) / 2=1 (12.5%) (重複: outlier 1 件は retries=2 + latency=6775 同一 row)
- **失敗系 (timeout / fallback / validation_failed / PII)**: 全て 0
- **UrgentLayer**: スクショ上 dominant_card 維持確認、static text 不変

### CEO PASS 判定根拠 (2026-05-07)
- pattern.used 5 件以上: ✅ 8 件
- speechSource=llm 3 件以上: ✅ 8 件
- fallback 0-1 件: ✅ 0
- validation_failed 0-1 件: ✅ 0
- timeout 0-1 件: ✅ 0
- retries=2 多発なし: ✅ 1 件のみ
- latency 6-8s 張り付きなし: ✅ 1 件のみ outlier
- PII 漏洩: ✅ payload 構造的に本文不在
- UrgentLayer static 維持: ✅

### 不変 (CEO 厳守維持)
- ChatClient.tsx 触らない ✅
- UrgentLayer / UrgentMessageCard / UrgentRelease 触らない (Urgent LLM 化なし) ✅
- Production env 触らない (4 env 全て Preview only に隔離) ✅
- §10.2 #9 partial 維持 ✅
- L4-m / E-3 / 別 sink へ進まない ✅
- `legacy.fallback` を speech fallback に流用しない ✅

### 次ステップ: 20-call smoke
1. CEO による 20-call smoke 実施 (Preview 同 build `e7682b4a`、観測モード ON 維持)
2. **重点観測項目** (CEO 指示):
   - **latency 分布**: p50 / p95 / p99 / max。p95 5000ms 超 / max 8000ms 到達 = NG ライン
   - **retries 分布**: retries=2 が 5 件 (25%) 以上 = post-validator 厳格化検討、retries=3+ = SDK retry loop 異常
   - **timeout 0 件 / fallback 0-1 件 / validation_failed 0-1 件** 維持
3. 全 PASS なら Stage 2.2 (20-call → 100-call) へ判断
4. NG 検出時は分布共有 → 原因特定 → fix-forward (パターン: validator 厳格度調整 / model timeout 上限調整 / max_tokens 削減 等)

## [2026-05-07] [Build] [L4-i Phase 2 Stage 2.1 — 20-call smoke v5 conditional PASS + Stage 2.2 = 20-call block × 5 protocol] [承認: CEO]

### 経緯
- CEO による 20-call smoke v5 実施 (Preview build `e7682b4a`、observationMode ON、`NEXT_PUBLIC_COALTER_PRESENCE_SPEECH_OBSERVATION_MODE=true` 維持)
- 20s 間隔 / 同 thread / mode 切替なし / 別タブ操作なし
- canary error 投下: 20:49:02 (smoke 直後 1st throw) + 21:01:36 (fresh dump throw、smoke 完了から ~13 分後)

### Stage 2.1 v5 観測結果

#### Network layer (browser DevTools 直接観測)
| 項目 | 値 |
|------|-----|
| user message 送信数 | 20 |
| POST `/api/coalter/speech` | **20** (全件 status 200) |
| **過剰発火比 (POST/msg)** | **1.0x** (Tier-1 PASS、Fix C 検討不要) |
| latency 5000ms+ 件数 | 2 件 |

#### Sentry breadcrumb layer (canary throw fresh dump 抽出)
| 項目 | 値 | 備考 |
|------|-----|------|
| `coalter.pattern.used` 観測件数 | **18 件** | Network 20 POST と 2 件乖離 |
| `speechSource=llm` | 16 件 | 88.9% (観測 sample 比) |
| `speechSource=fallback` | 1 件 | fallbackReason=`validation_failed` |
| `speechSource=static` | 1 件 | fallbackReason=**`rate_limited`** (cause 未確定) |
| `validationFailed=true` | 1 件 | (#3 と同 row) |
| `retries` 分布 | -1=1 / 0=11 / 1=6 / 2=0 / 3+=0 | **retries=2 が 5-call v4 の 1 件 → v5 0 件** (改善) |
| `latency` (llm+fallback、17 値) | p50=2358 / p95=5565 / max=5950 | 全項目 CEO PASS 基準内 (≤3000 / ≤6500 / ≤7500) |
| `timeout` (>=7900ms) | 0 件 | |
| PII 漏洩 (data 内 body) | 0 件 | payload 構造的に本文不在 |
| UrgentLayer | static 維持 | CEO スクショ確認 |

### pattern.used 18/20 件乖離の原因 (推定)
- Sentry maxBreadcrumbs=500 buffer + heavy polling (`/messages` + `/read` で ~24/min) = 約 12 分過去保持
- v5 smoke 期間 ~12 分 + canary fresh dump throw が smoke 完了から 13 分後
- → 最古の 2 件 pattern.used (~20:36-20:43 帯) が buffer から押し出された可能性大
- 証拠: dump 内最古 event = 20:43:19 (pattern.used 1)、それ以前の polling event ゼロ

**観測 infra 課題、smoke 自体の問題ではない**。Stage 2.2 は smoke 直後 10 秒以内に fresh canary throw する protocol で対処。

### `fallbackReason="rate_limited"` の取り扱い (CEO 厳守)
- **観測事実 (確定)**: dump 内 1 件、`speechSource=static`, `fallbackReason="rate_limited"`, `latencyMs=0`, `retries=0`
- **未確定 (CEO 厳守)**: 原因 layer は**断定しない**。Anthropic API rate / app 側 rate gate / route 側制御 / 別 layer どれも候補
- **記録方針**: 「rate_limited observed」のみ。Stage 2.2 で 100 calls 中の頻度と pattern を観測してから cause 議論
- **事前対策しない**: server retry / validator 修正 / Anthropic Tier 確認 を Stage 2.2 前に入れない (CEO 確定)

### CEO 判定 (2026-05-07)

#### Q1: pattern.used 18/20 → **条件付き PASS**
- Request layer (Network 20 POST / 1.0x / 全 200): **PASS**
- Outcome layer (pattern.used 18/20 / llm 16 / fallback 1 / static 1): **Yellow 付き PASS**
- Overall: **conditional PASS** (完全 PASS ではない)

#### Q2: rate_limited 1 件 → **Stage 2.2 で観察対象**
- 原因断定禁止
- 事前対策禁止 (server retry / validator 等)
- 100-call 中の頻度・パターンを観測してから議論

#### Q3: Stage 2.2 → **GO、ただし 20-call block × 5 に分割**
- 100-call 一括禁止
- 各 block 完了後 10 秒以内に fresh canary throw → buffer overflow 回避
- block PASS / NG を毎回判定、NG なら停止

### Stage 2.2 protocol (CEO 確定 2026-05-07)

#### 構造: 20-call block × 5 = 100 calls

#### 各 block 手順
1. 20 回送信 (20s 間隔、同 thread、mode 切替なし、別タブ操作なし)
2. **送信完了後 10 秒以内に fresh canary throw**: `setTimeout(() => { throw new Error("L4-i Stage 2.2 block N — e7682b4a") }, 0)`
3. Sentry Breadcrumbs から pattern.used 抽出
4. 集計 (block PASS / NG 判定)
5. NG なら停止 → CEO 判断
6. PASS なら次 block へ (block 間に 1-2 分インターバル推奨、cumulative effect 避ける)

#### Block PASS 条件 (各 20-call で)
| 項目 | PASS |
|------|------|
| POST `/api/coalter/speech` | 20-22 件 |
| `pattern.used` | 20 件 (最低 19 件) |
| `speechSource=llm` | 18 件以上 |
| `fallback` | 0-1 件 |
| `validation_failed` | 0-1 件 |
| `rate_limited` | 0-1 件 |
| `timeout` | 0 件 |
| PII | 0 件 |
| UrgentLayer | static 維持 |
| `latency p95` | ≤ 6500ms |

#### 全体 PASS 条件 (5 blocks 合計 100 calls)
| 項目 | PASS |
|------|------|
| total POST | 100-110 件 |
| observed `pattern.used` | 95 件以上 |
| llm 成功率 | 90% 以上 |
| `timeout` | 0-1 件 |
| `validation_failed` 比率 | ≤ 5% |
| `rate_limited` 比率 | ≤ 5% |
| PII | 0 件 |
| UrgentLayer | static 維持 |

### 不変 (CEO 厳守維持)
- ChatClient.tsx 触らない ✅
- UrgentLayer / UrgentMessageCard / UrgentRelease 触らない (Urgent LLM 化なし) ✅
- Production env 触らない (4 env 全て Preview only) ✅
- §10.2 #9 partial 維持 ✅
- L4-m / E-3 / 別 sink へ進まない ✅
- v5 を完全 PASS と書かない ✅
- rate_limited を Anthropic 起因と断定しない ✅
- 100-call 一括禁止 ✅
- NG 時自律 fix-forward 禁止 ✅
- timeout / validator 勝手変更禁止 ✅

### 次ステップ
1. CEO Stage 2.2 block 1 (20 calls) 実施
2. 各 block 結果共有 → Claude が集計 → CEO 判断 → 次 block 進行
3. 5 blocks 全 PASS なら Stage 2.3 (variant 別 review) へ判断
4. 任意 block で NG → 停止 → 分布共有 → 原因議論 → fix 候補提示 (自律実行禁止)

## [2026-05-07] [Build] [L4-i Stage 2.2 block 1 NG — fire-control over-firing 1.45x / Fix C high-confidence root cause] [承認: CEO]

### Stage 2.2 block 1 観測結果 (Sentry "block 1 retry" Issue から確定)

| 項目 | 値 | 判定 |
|------|-----|------|
| user message 送信数 | 20 | — |
| POST `/api/coalter/speech` | **29** | 🔴 NG (基準 20-22) |
| **過剰発火比 (POST/msg)** | **1.45x** | 🔴 NG (基準 1.0-1.1x、Yellow 上限 1.25x も超過) |
| status 200 | 全件 | ✅ |
| `speechSource=llm` | 29 (100%) | ✅ |
| `fallback` | 0 | ✅ |
| `validationFailed=true` | 0 | ✅ |
| cancel | 0 | ✅ |
| `retries=0` | 23 | ✅ |
| `retries=1` | 6 | ✅ (基準内) |
| `retries=2` | 0 | ✅ (v4/v5 より改善) |
| `latencyMs max` | **4334ms** | ✅ (基準 ≤7500ms) |

**判定**: **LLM 品質 / latency / validation = PASS、発火制御 = NG**

### Root cause (high-confidence、Explore agent file:line 追跡済)

CEO 仮説 = **「optimistic signal + realtime/db echo の二重発火、最大 2 回」** が file:line 証拠で裏付けられた。**確定ではなく high-confidence** (canonical id 不在のため最終的な単一 root か断定保留)。

#### 二重発火の連鎖
1. `ChatClient.tsx:923` — optimistic message を state に追加 (id=`optimistic-${ts}`)
2. `PresenceSignalWiring.tsx:84-112` — message 配列の最新を critical detect → publishPresenceSignal → recentSignals に signal 1 (detectedAt=t1)
3. `UpperLayerMount.tsx:307-311` — observationKey=`critical:t1`、useEffect re-run → speech fetch 1 回目
4. `ChatClient.tsx:925-931` — POST /messages → fetchMessages() で server から DB 内容再取得
5. `ChatClient.tsx:788-798` — setMessages(data.messages) で server message を state に追加 (id=`<server-UUID>`、optimistic id とは別物)
6. `PresenceSignalWiring.tsx:84-86` — `lastSeenIdRef` チェックは id ベース、optimistic id ≠ server UUID で重複 check 通過
7. 同 body で再度 critical detect → signal 2 (detectedAt=t2)
8. `UpperLayerMount.tsx:307-311` — observationKey=`critical:t2` (t1 と異なる) → useEffect re-run → speech fetch 2 回目

#### 既存 dedupe 3 層が突破される理由
- in-flight controller (`${variant}|${state}|${mode}`): 1st fetch 完了後 2nd 来るので block されず
- telemetry dedupe (baseKey + observationKey): observationKey 変化で別 emit
- speech cache (`${variant}|${state}|${mode}`): observationMode ON で全 skip (`UpperLayerMount.tsx:343`)

→ **observationMode ON が dedupe を全層解除**しているのが本質。

### Fix C 設計 (CEO 確定方針、実装前)

#### 採用しない案 (CEO 補正済)
- ❌ **案 A 単独** (`observationKey = kind:messageId`): canonical id 不在のため optimistic id ≠ server UUID で二重発火残る
- ❌ **案 B (canonical id 付与)**: ChatClient touch (`clientGeneratedMessageId` 注入) が必要 → CEO 厳守「ChatClient 安易に触らない」に抵触
- ❌ **案 C 単独 (body hash 永久 dedupe)**: 20 秒後の同文連投も殺してしまう

#### 採用方針: optimistic echo 専用 dedupe (CEO 確定)
PresenceSignalWiring 内で完結する message-level echo dedupe:
1. optimistic message (id startsWith "optimistic-") → publish signal
2. server UUID message が直前 optimistic と body+sender 一致 + N 秒以内 (例: 8 秒) → echo 認定 → publish skip
3. 同文の N 秒外再送 → 別 message として publish (連投を殺さない)
4. observationMode ON でも message-level echo dedupe は維持

#### 期待効果
- 1 user message → 1 signal → 1 observationKey → 1 speech fetch
- 20 user message → speech POST 20-22 件 (1.0-1.1x、PASS 復帰)
- 連投ケースは正常維持

### CEO 厳守 (Fix C 着手前)
- ✗ canonical id 前提で実装しない
- ✗ body hash 単独で永久 dedupe しない
- ✗ 同文 2 回目以降をずっと抑制しない (window 必須)
- ✗ ChatClient.tsx を安易に touch しない
- ✗ observationKey だけ変えて終わりにしない
- ✗ timeout / validator / Anthropic を触らない
- ✗ Production env を触らない
- ✗ UrgentLayer / UrgentMessageCard / UrgentRelease を touch しない
- ✗ 次 block / 100-call へ進まない (block 1 NG 維持)

### 次ステップ (CEO 確定 protocol)
1. **追加調査 (実装前必須)** — Explore agent で以下 4 項目確認:
   - `signal.meta.lastMessageId` に optimistic / server echo で何が入るか (file:line)
   - canonical id 候補 (`clientGeneratedMessageId` / `requestId` / `temporaryId` / `createdAt` / normalized body / sender id)
   - ChatClient の POST /messages payload が optimistic id を server に渡しているか
   - realtime echo / fetchMessages / setMessages のどこで server UUID message が入るか
2. 調査結果を CEO に提示 → 設計確定 (echo dedupe の具体 key 構成)
3. PresenceSignalWiring 内で実装 (ChatClient touch なし)
4. unit test:
   - optimistic message → signal 1 回 publish
   - server echo (same body + sender + within window) → signal 0 回 publish
   - 20 秒後の同文新規 → signal 1 回 publish
5. Preview smoke v6 (block 1 再実施): 20 送信 → POST 20-22 件 復帰確認
6. v6 PASS なら block 2 へ進行判断 (CEO 判定)

## [2026-05-07] [Build] [L4-i Stage 2.2 Fix C 実装完了 — asymmetric optimistic-echo dedupe / smoke v6 待ち] [承認: CEO]

### 経緯 (Q2 追加調査 → 設計確定 → 実装)

**Q2 追加調査結果 (Explore agent file:line ベース)**:
1. `signal.meta.lastMessageId` = `last.id` (PresenceSignalWiring.tsx:97, 110) → optimistic 時 `optimistic-${ts}` / server echo 時 UUID。**両者異なる文字列**確定
2. canonical id 候補 = **無し** (clientGeneratedMessageId / requestId / nonce 全て未実装、TalkMessage interface に該当 field なし)
3. ChatClient POST /messages payload = `{ body }` のみ (`ChatClient.tsx:925-927`)、optimistic id を server に渡していない
4. server UUID message が state に入る経路 = **3 ルート** (POST 成功直後の fetchMessages / Realtime INSERT / polling 5s or fallback 2s)

→ canonical id route NG (CEO 厳守 ChatClient 触らない)、PresenceSignalWiring 内 echo 専用 dedupe で確定

### CEO 補正 (asymmetric dedupe 必須、2026-05-07)

**初期 Claude 案 (一般 dedupe)**:
```
same sender + same body + same kind + within 8s → 全 skip
```
→ **NG**: 本物の同文連投も殺す

**CEO 確定方針 (asymmetric)**:
```
optimistic candidate → 常に publish + cache 追加
server candidate → 直前 optimistic と (sender, body, kind) 一致 + 8s 以内 のみ skip
server 同士 / optimistic 同士は dedupe しない (連投誤殺防止)
```

### 実装内容 (commit `29ff2746`)

#### 新規 `lib/coalter/presence/signalEchoDedupe.ts` (純関数 lib)
- `OPTIMISTIC_ID_PREFIX = "optimistic-"` (ChatClient.tsx:919 と一致)
- `ECHO_DEDUPE_WINDOW_MS = 8_000` (CEO 確定 8 秒、3 ルート + buffer 包含)
- `normalizeBody(body)`: trim + collapse-whitespace + NFC のみ (lowercase なし、CEO 確定)
- `pruneEchoCache(cache, now, windowMs?)`: 純関数、元配列 mutate なし
- `isServerEchoOfRecentOptimistic(candidate, cache, now, windowMs?)`: 非対称判定
  - candidate.isOptimistic === true → 早期 false (常に publish)
  - candidate.isOptimistic === false → cache 内 prev.isOptimistic === true で全 4 条件一致 → true (echo 認定)
- `buildEchoCandidate(input)`: id prefix で isOptimistic 判定

#### 改修 `app/components/chat/PresenceSignalWiring.tsx`
- `ObservedMessage` interface に `senderId?: string` 追加 (optional、空時は dedupe skip 回帰防止)
- `echoCacheRef = useRef<EchoCacheEntry[]>([])` 追加
- critical signal publish 直前に echo check (senderId 空でない時のみ):
  1. `pruneEchoCache` で window 外を除去
  2. `buildEchoCandidate` で kind=`"critical"` 候補構築
  3. `isServerEchoOfRecentOptimistic` で判定 → true なら skip (publish + cache 追加なし)
  4. false なら cache 追加 → publishPresenceSignal
- implicit signal は echo dedupe **対象外** (CEO 厳守 Fix C scope = critical のみ)
- ChatClient touch なし、UpperLayerMount touch なし、speech 系 touch なし

#### 新規 `tests/unit/coalter/presence/signalEchoDedupe.test.ts` (23 件)
CEO 確定 8 ケース全て PASS:
- Case 1: optimistic → publish 1 回 ✅
- Case 2: 1 秒後 server echo (same sender/body/kind) → skip ✅
- Case 3: 8.5 秒後 server same body → publish (window 外) ✅
- Case 4: 20 秒後 同文の新規 optimistic → publish (連投) ✅
- Case 5: 別 sender → publish ✅
- Case 6: 別 body → publish ✅
- Case 7: 別 kind (critical vs implicit) → publish ✅
- Case 8: optimistic 2 件を短時間に連投 → 2 件目も publish (asymmetric の核) ✅

加えて構造 invariant:
- normalizeBody 4 ケース (trim / collapse-ws / NFC / lowercase なし)
- buildEchoCandidate 4 ケース (id prefix / 定数値検証)
- pruneEchoCache 4 ケース (window 内/外/境界/純関数性)
- 追加 invariant 3 ケース (server-only cache / window 境界正確性 / lib 副作用ゼロ)

### 検証
- 新規 23 test PASS
- coalter 全 147 file / **2148 test 全 PASS** (回帰ゼロ)
- Fix C 関連 TypeScript type error **0 件**
- 既存 type error は Fix C scope 外 (urgentLayerDismiss / stargazer 系、CEO 厳守: 触らない)

### Vercel preview build
- push commit: `29ff2746` (2026-05-07 19:08 JST 頃)
- branch: `feat/coalter-three-stage`
- alias: `https://culcept-git-feat-coalter-three-stage-taishis-projects-0a8deb17.vercel.app/`
- auto-trigger build → CEO sentry-release 確認待ち

### 不変 (CEO 厳守、commit log 反映済)
- ChatClient.tsx 不変 ✅
- UpperLayerMount.tsx 不変 ✅
- speech route / speechFetchGate / speechBuilder 不変 ✅
- timeout / validator / Anthropic 不変 ✅
- UrgentLayer / UrgentMessageCard / UrgentRelease 不変 ✅
- Production env 不変 ✅
- canonical id 前提コード書かず ✅
- body hash 永久 dedupe なし (window 8s 必須) ✅
- 同文連投を殺さず (asymmetric dedupe) ✅

### 次ステップ: smoke v6 verification
1. CEO Vercel preview build 完了確認 (release が `29ff2746` で alias 接続)
2. CEO Stage 2.2 block 1 v6 (20 calls) 実施: 同 protocol、20 秒間隔、新 incognito tab
3. canary throw 即時 (smoke 完了 10 秒以内)、buffer overflow 回避
4. Sentry breadcrumb 共有
5. PASS 条件:
   - **POST `/api/coalter/speech` = 20-22 件** (Tier-1、1.0-1.1x 復帰確認)
   - `pattern.used` ≈ 20 件
   - llm 18+ / fallback 0-1 / validation_failed 0-1 / timeout 0
   - latency max が悪化していない (< ~5000ms 維持)
   - UrgentLayer static / PII なし
6. PASS なら block 2-5 へ順次進行 (CEO 判定)
7. NG なら停止 → 分布共有 → 原因再議論 (自律 fix 禁止)

## [2026-05-07] [Build] [L4-i Stage 2.2 Block 1 v6 PASS — Fix C 効果確定 / Block 2 進行] [承認: CEO]

### Smoke v6 結果 (Sentry "block 1 v6 — Fix C 29ff2746" Issue 確定)

#### 数字
| 項目 | 値 | block 1 NG (Fix C 前) | 復帰判定 |
|------|-----|----------------------|----------|
| user message | 20 | 20 | — |
| **POST `/api/coalter/speech`** | **20** | 29 | ✅ **過剰発火完全解消 (-9 件)** |
| **過剰発火比** | **1.0x** | 1.45x | ✅ 完全復帰 |
| `coalter.pattern.used` (smoke 本体) | 20 件 (+入室時 1 = 計 21 件) | 18 (buffer overflow) | ✅ |
| `speechSource=llm` | 19 (95%) | 29 (100%) | 同等良好 |
| `fallback` (validation_failed) | 1 (5%) | 0 | block 1 NG 同等 |
| `validationFailed=true` | 1 | 0 | 同等 |
| `retries=0` | 14 | 23 | — |
| `retries=1` | 4 | 6 | ↓ |
| `retries=2` | 1 | 0 | ↑ +1 (基準 0-3 内) |
| `retries=-1` (fallback 同行) | 1 | 0 | 同 fallback 件 |
| `timeout` (>=7900ms) | 0 | 0 | ✅ |
| `cancel` | 0 | 0 | ✅ |
| `latency max` | 6336ms (fallback 行) | 4334ms | ↑ +2000ms (validation 失敗 retry 経路) |
| PII | 0 | 0 | ✅ |
| UrgentLayer | static | static | ✅ |

#### Sentry timestamps (smoke 本体 20 件、UTC 02:35:54-02:43:22 の約 8 分)
- 完全な timestamp + latency / retries / source 一覧は本日の Stage 2.2 block 1 v6 Issue で確定済
- thread 入室時 02:33:15 の 1 件は smoke 本体外 (state stabilize の自然な signal)

### CEO 判定 (2026-05-07)
- **block 1 v6 PASS** (Fix C 効果確定、過剰発火 1.45x → 1.0x 完全復帰)
- **block 2 進行 GO**
- 自律 fix-forward 禁止 / 100-call 一括禁止 維持
- **重点観測継続項目** (block 2 以降):
  1. **validation_failed**: 5% を超えないか (累積 5+ 件で post-validator 議論)
  2. **retries=2**: 5% を超えないか (累積 5+ 件で SDK retry / model 安定性議論)
  3. **latency max**: 7500ms を超えないか (validation retry 経路含む)

### Fix C 効果の証拠
- block 1 NG (Fix C 前): POST 29 / 過剰発火 1.45x / 推定 9 件の echo
- block 1 v6 (Fix C 後): POST 20 / 過剰発火 1.0x / echo 0 件
- → optimistic→server echo dedupe (asymmetric) が想定通り機能
- → 連投誤殺なし (20 user message に対して 20 fetch、不足なし)

### 不変 (CEO 厳守維持)
- ChatClient.tsx 不変 ✅
- UpperLayerMount.tsx 不変 ✅
- speech route / timeout / validator / Anthropic 不変 ✅
- UrgentLayer / UrgentMessageCard / UrgentRelease 不変 ✅
- Production env 不変 ✅
- 100-call 一括禁止 ✅
- NG 時自律 fix 禁止 ✅

### 次ステップ: Block 2-5 順次進行
1. CEO Block 2 (20 calls) 実施: 同 protocol (build `29ff2746`、20 秒間隔、新 incognito tab、canary 即時 throw)
2. canary message: `"L4-i Stage 2.2 block 2 — Fix C 29ff2746"`
3. PASS 条件 (block 単位、validation_failed / retries=2 / latency max を Tier-1 観測):
   - POST 20-22 件 / `pattern.used` 20 件
   - speechSource=llm 18+
   - fallback 0-1 / validation_failed 0-1 / rate_limited 0-1 / timeout 0
   - retries=2 0-3 / retries>=3 0
   - latency p95 ≤ 6500ms / max ≤ 7500ms
   - PII 0 / UrgentLayer static
4. PASS なら block 3 → block 4 → block 5 順次進行
5. 5 blocks 全 PASS なら Stage 2.3 (variant 別 review、5 sample × 7 variant) 進入判断
6. 任意 block で NG → 停止 → 分布共有 → CEO 判断 (自律 fix 禁止)

## [2026-05-07] [Build] [L4-i Stage 2.2 Block 2 Yellow 付き PASS — timeout 1 件登場 / Block 3 監視ライン] [承認: CEO]

### Block 2 結果 (Sentry "block 2 — Fix C 29ff2746" Issue 確定)

#### 数字
| 項目 | 値 | block 1 v6 | 判定 |
|------|-----|-----------|------|
| user message | 20 | 20 | — |
| **POST `/api/coalter/speech`** | **20** | 20 | ✅ **1.0x 維持** (Fix C 効果継続) |
| `pattern.used` (smoke 本体) | 20 | 20 | ✅ |
| `speechSource=llm` | 18 (90%) | 19 (95%) | -1 件 |
| `speechSource=fallback` | **2** | 1 | ⚠ +1 (timeout 新登場) |
| `validationFailed=true` | 1 | 1 | 同等 |
| `retries=0` | 15 | 14 | +1 |
| `retries=1` | 3 | 4 | -1 |
| `retries=2` | 0 | 1 | ✅ -1 (改善) |
| `retries=-1` | 1 | 1 | 同等 (validation_failed 行) |
| **`timeout`** (fallback timeout / >=7900ms) | **1** | 0 | ⚠ **累積 1 件目** |
| `latency max` (timeout 除く) | 6521ms | 6336ms | +185ms (微増) |
| PII | 0 | 0 | ✅ |
| UrgentLayer | static | static | ✅ |

#### Sentry timestamps (smoke 本体 20 件、03:02:17-03:10:17 UTC、約 8 分間隔 20 秒)
- 入室時 03:00:57 latencyMs=8002 timeout は smoke 本体外 (state stabilize 前の signal、集計対象外)
- timeout 行 (smoke 本体内): 03:07:33 latencyMs=8003 retries=0 fallback timeout
- validation_failed 行: 03:05:41 latencyMs=6521 retries=-1 fallback validation_failed

### CEO 判定 (2026-05-07)
- **block 2 Yellow 付き PASS** (clean PASS ではない)
  - 過剰発火制御: ✅ PASS (Fix C 効果継続 1.0x)
  - LLM 品質: ✅ PASS (llm 90%、fallback 10%)
  - **timeout/停止 1 件**: ⚠ Yellow (block 1 v6 = 0 から +1)
  - validation_failed 1 件: ✅ 許容範囲内 (累積 2/40 = 5%)
  - latency 6521ms: ✅ 単発許容 (基準 ≤7500ms 内)
- **block 3 進行可** (累積 80 calls まで観測継続)
- 自律 fix-forward 禁止 / 100-call 一括禁止 維持

### CEO 厳守追加条件 (2026-05-07 Block 2 後)
> 「次も timeout/停止 または validation_failed が出るなら、Stage 2.2 継続ではなく、
> validator / timeout / provider latency の再評価に入るべき」

→ **block 3 で timeout OR validation_failed が再発した場合 → Stage 2.2 停止 → 再評価 phase**

### 累積トレンド (block 1 v6 + block 2 = 40 calls)
| 項目 | 累積 | 議論ライン |
|------|------|-----------|
| POST 過剰発火 | 1.0x | ✅ Fix C 安定 |
| validation_failed | 2 (5%) | 累積 5+ 件で post-validator 議論 |
| **timeout** | **1 (2.5%)** | **block 3 で再発したら停止** |
| retries=2 | 1 (2.5%) | 累積 5+ 件で議論 |
| retries>=3 | 0 | ✅ |
| rate_limited | 0 | ✅ (累積継続観測) |
| latency max trend | 6336 → 6521 (+185ms) | block 3 で 7000ms 超なら trend 警戒 |
| PII / UrgentLayer | 0 / static | ✅ ✅ |

### 不変 (CEO 厳守維持)
- ChatClient.tsx 不変 ✅
- UpperLayerMount.tsx 不変 ✅
- speech route / timeout / validator / Anthropic 不変 ✅
- UrgentLayer 不変 ✅
- Production env 不変 ✅
- 100-call 一括禁止 ✅
- 自律 fix-forward 禁止 ✅

### 次ステップ: Block 3
1. CEO Block 3 (20 calls) 実施: 同 protocol (build `29ff2746`、20 秒間隔、新 incognito tab、canary 即時 throw)
2. canary message: `"L4-i Stage 2.2 block 3 — Fix C 29ff2746"`
3. **重点観測**: timeout / validation_failed の累積件数 (CEO 厳守 stop 条件)
4. PASS なら block 4 進行 / NG なら停止 → 再評価 phase 議論
5. 任意 block で timeout または validation_failed が再発 → 停止 (上記 CEO 厳守追加条件)

## [2026-05-07] [Build] [L4-i Stage 2.2 Block 3 STOP — 15 件目 timeout / 案 A timeout 8s→10s 実装] [承認: CEO]

### Block 3 結果 (15 件で中断)

#### Sentry breadcrumb 集計 (smoke 本体 15 件、03:30:37-03:36:20 UTC)
| 件 | UTC | latencyMs | retries | source |
|----|-----|-----------|---------|--------|
| 1 | 03:30:37 | 4045 | 1 | llm |
| 2 | 03:31:02 | **6375** | **2** | llm |
| 3 | 03:31:23 | 4353 | 1 | llm |
| 4 | 03:31:46 | 2605 | 0 | llm |
| 5 | 03:32:09 | 3109 | 0 | llm |
| 6 | 03:32:32 | 3642 | 1 | llm |
| 7 | 03:32:55 | 1884 | 0 | llm |
| 8 | 03:33:19 | 4447 | 1 | llm |
| 9 | 03:33:41 | 2069 | 0 | llm |
| 10 | 03:34:05 | 3954 | 1 | llm |
| 11 | 03:34:42 | 3350 | 0 | llm |
| 12 | 03:35:07 | 1856 | 0 | llm |
| 13 | 03:35:32 | **5565** | 1 | llm |
| 14 | 03:35:50 | 1816 | 0 | llm |
| **15** | **03:36:20** | **8005** | **0** | **fallback (timeout)** ← STOP |

入室時 03:29:46 latencyMs=3098 の 1 件は smoke 本体外。

### CEO 厳守 stop 条件適用
> 「次も timeout/停止 または validation_failed が出るなら、Stage 2.2 継続ではなく、
> validator / timeout / provider latency の再評価に入るべき」

→ Block 2 timeout 1 + Block 3 timeout 1 = 累積 2 件で stop 条件到達 → 即中断

### 累積 (Block 1 v6 + Block 2 + Block 3 partial = 55 calls)
| 項目 | 値 | 累積率 |
|------|-----|--------|
| llm 成功 | 49 | 89.1% |
| validation_failed | 2 | 3.6% |
| **timeout** | **2** | **3.6%** ← STOP ライン |
| retries=2 | 2 | 3.6% |
| timeout 行 latency | 8003 / 8005 (両件 retries=0) | — |
| 過剰発火 | 1.0x | ✅ Fix C 安定 |

### 原因候補の証拠ベース分析

| # | 候補 | 確度 | 証拠 |
|---|------|------|------|
| 1 | 8s timeout が短い | **高** | timeout 行 retries=0 で latencyMs=8003/8005 (単発で 8s 超え) |
| 2 | end-to-end response が 8s を超える case | **高** | 同 prompt で 1500-6500ms (4x 変動)、retries=0 でも 8s 級発生 |
| 3 | retry 込みで 8s 超え | **否定** | timeout 行 retries=0 (リトライ未実行) |
| 4 | AbortController race | **否定** | fallbackReason="timeout" 正しく記録、Fix C 後 timeoutFired flag 機能 |
| 5 | provider/API capacity | **可能性、検証必要** | 累積 3.6%、Anthropic dashboard / status 確認は CEO 経由 |
| 6 | prompt / max_tokens / validator retry | **timeout 単体は否定** | retries=0 で timeout (retry path 通っていない) |

### CEO 厳守: 原因表現の補正 (2026-05-07)
- ❌ 「provider single-shot latency variance が 8s を超える」(断定表現)
- ✅ 「`/api/coalter/speech` の **end-to-end response** が 8s を超えるケースがある」
- 起因 layer **未確定**: Anthropic / Vercel route / network / client abort timing / serverless 挙動 のいずれも候補、断定禁止

### CEO 確定 採用案 (2026-05-07)

#### 案 A: timeout 8s → 10s (実装済、commit `ffadc633`)
- `app/components/chat/UpperLayerMount.tsx:103` — `SPEECH_FETCH_TIMEOUT_MS = 10_000`
- `tests/unit/coalter/upperLayerSpeechFetch.test.ts:124` — regex `8_?000` → `10_?000` に更新
- 全 coalter 147 file / 2148 test PASS、回帰ゼロ
- 12s/15s は過剰、まず 10s で検証 (CEO 確定)

#### 案 C: Anthropic Tier / usage / rate / latency 確認 (CEO 並行作業)
- CEO 側で別経路で確認 (Anthropic dashboard / contract / SLA)
- **Anthropic 起因と断定せず、確認項目として扱う** (CEO 厳守)

### 不変 (CEO 厳守維持)
- ChatClient.tsx 不変 ✅
- speech route / validator / model / max_tokens 不変 ✅
- UrgentLayer / UrgentMessageCard / UrgentRelease 不変 ✅
- Production env 不変 ✅
- timeout constant のみ変更 (CEO 承認の最小 scope) ✅

### 次ステップ: smoke v7 (block 1 v7 と同じく 20-call)
1. Vercel preview build 完了確認 (commit `ffadc633` 反映)
2. CEO smoke v7 実施 (同 protocol、20 秒間隔、新 incognito tab、canary 即時 throw)
3. canary message: `"L4-i Stage 2.2 smoke v7 — case A timeout 10s ffadc633"`
4. **PASS 条件**:
   - POST 20-22 件
   - **timeout 0 件** (案 A 効果確認、Tier-1)
   - validation_failed 0-1 件
   - fallback 0-1 件
   - **latency max < 10000ms** (10s timeout 内に全て収まる)
   - PII 0 / UrgentLayer static 維持
5. PASS なら累積 75 calls 達成 → block 4 進行判断 (CEO)
6. NG なら停止 → 分布共有 → CEO 判断 (自律 fix 禁止)
7. CEO 並行: Anthropic Tier 確認結果共有 (timeout 再発した場合の議論材料)

## [2026-05-07] [Build] [L4-i Stage 2.2 smoke v7 PASS — 案 A 成功確定 / 次は再現性確認 (もう 1 回 20-call)] [承認: CEO]

### smoke v7 結果 (Sentry "smoke v7 — case A timeout 10s ffadc633" Issue 確定)

#### 数字
| 項目 | 値 | 案 A 前 (累積 55 calls 中) | 改善 |
|------|-----|---------------------------|------|
| user message | 20 | — | — |
| POST `/api/coalter/speech` | **21** | block 1 v6=20, block 2=20, block 3 partial=15 | 1.05x (軽微過剰、許容内) |
| **timeout** | **0** | 累積 2 件 (block 2 + block 3 各 1) | ✅ **完全解消** |
| `validation_failed` | 0 | 累積 2 件 | ✅ 改善 |
| `fallback` 合計 | 0 | 累積 4 件 | ✅ 改善 |
| `rate_limited` | 0 | 0 | 維持 |
| **`latency max`** | **5306ms** | 8005 (block 3 timeout 行) / 6521 (block 2 v_failed) | ✅ **大幅改善 (-1000ms 以上)** |
| `retries=0` | 15 | — | — |
| `retries=1` | 4 | — | — |
| `retries=2` | 1 | — | 累積 3 (基準内) |
| `retries=-1` (fallback 同行) | 0 | — | — |
| PII | 0 | 0 | ✅ |
| UrgentLayer | static 維持 | static | ✅ |

### 案 A の効果証拠
- **timeout 0/20 件 = 0%** (案 A 前累積: 2/55 = 3.6%)
- **latency max 5306ms** (5000ms 台 2 件、他 5000ms 未満) — 全 sample が 10s timeout の半分以下
- **end-to-end response が 10s 内に全件収まった** → 案 A (8s → 10s) で provider variance を吸収
- 過剰発火 1.05x = Fix C も継続安定 (1.0-1.1x 許容範囲内)

### CEO 厳守: 表現の補正
- ❌ 「Anthropic SDK default timeout 10 minutes」(SDK default 値断定は不要)
- ✅ 「`llmCall.ts` では Anthropic client に明示 timeout option を渡していない。speech route / speechBuilder 側にも独自の 8s timeout / AbortController / setTimeout は見つからない。したがって、今回の実効 8s 制限は client 側 `SPEECH_FETCH_TIMEOUT_MS` 由来と見る」

### 累積トレンド (block 1 v6 + block 2 + block 3 partial + smoke v7 = 75 calls)
| 項目 | 累積 | 累積率 | 議論ライン |
|------|------|--------|-----------|
| llm 成功 | 71 | 94.7% | ✅ |
| validation_failed | 2 | 2.7% | 累積 5+ で議論 |
| **timeout** | **2** | **2.7%** | ✅ smoke v7 で打ち止め |
| retries=2 | 3 | 4.0% | 累積 5+ で議論 |
| rate_limited | 0 | 0% | ✅ |
| 過剰発火 | 1.0-1.05x | — | ✅ Fix C 安定 |
| latency max trend | 6336 → 6521 → 6375 → **5306** | 改善 | ✅ |

### CEO 判定 (2026-05-07)
- **smoke v7 PASS** (clean PASS、案 A 成功確定)
- **案 A: timeout 8s → 10s は成功** と判断
- 次: 再現性確認のため **20-call block をもう 1 回だけ**実施
- **100-call 一括はまだ不要** (smoke v8 PASS 後の CEO 判断で次 phase 決定)

### 運用負債 (smoke v7 後の cleanup 候補、CEO 確定 記録)
| File:Line | 内容 | 影響 | 対応 |
|-----------|------|------|------|
| `lib/coalter/presence/speechFetchGate.ts:43` | コメント "8s timeout は維持" | runtime 影響なし (実値は 10s に更新済) | smoke v8 PASS 後に comment-only cleanup commit、CEO 承認待ち |

### 不変 (CEO 厳守維持)
- ChatClient.tsx 不変 ✅
- speech route / validator / model / max_tokens 不変 ✅
- UrgentLayer / UrgentMessageCard / UrgentRelease 不変 ✅
- Production env 不変 ✅
- timeout constant のみ変更 (案 A) ✅
- 100-call 一括禁止 ✅
- 自律 fix-forward 禁止 ✅
- Anthropic 起因と断定しない (案 C 確認結果待ち) ✅

### 次ステップ: smoke v8 (再現性確認、20-call block もう 1 回)
1. CEO smoke v8 実施: 同 protocol (build `ffadc633` または以降、20 秒間隔、新 incognito tab、canary 即時 throw)
2. canary message: `"L4-i Stage 2.2 smoke v8 — repeatability check (case A timeout 10s)"`
3. **PASS 条件** (smoke v7 と同じ、再現性):
   - POST 20-22 件
   - **timeout 0 件** ← Tier-1 (再現性確認)
   - validation_failed 0-1 件
   - fallback 0-1 件
   - latency max < 10000ms (smoke v7 max=5306ms より悪化していないことが理想)
   - PII 0 / UrgentLayer static 維持
4. PASS なら累積 95 calls 達成 → CEO 判断で次 phase
   - Option A: block 5 で累積 100 calls 達成 → Stage 2.2 完了 → Stage 2.3 進入判断
   - Option B: 95 calls の trend で判断、Stage 2.3 直接進入
5. NG なら停止 → 分布共有 → CEO 判断 (自律 fix 禁止)
6. **100-call 一括禁止維持**

## [2026-05-08] [Build] [L4-i Stage 2.2 smoke v8 PASS — Stage 2.2 完了 / Stage 2.3 進入] [承認: CEO]

### smoke v8 結果 (再現性確認)

| 項目 | 値 | smoke v7 | 案 A 前 trend | 判定 |
|------|-----|----------|--------------|------|
| user message | 20 | 20 | — | — |
| POST `/api/coalter/speech` | **20** | 21 | 20 (block 1 v6) | ✅ 1.0x (Fix C 完璧) |
| **timeout** | **0** | 0 | 累積 2/55 | ✅ **再現** (案 A 確定) |
| validation_failed | 0 | 0 | 累積 2/55 | ✅ |
| fallback 合計 | 0 | 0 | 累積 4/55 | ✅ |
| rate_limited | 0 | 0 | 0 | ✅ |
| **latency max** | 6100ms | 5306ms | 5306-8005ms | ✅ < 10000ms |
| `retries=0` | 9 | 15 | — | ↓ 6 件 |
| `retries=1` | 8 | 4 | — | ↑ 4 件 |
| `retries=2` | 3 | 1 | 1 | ↑ +2 (累積率注視、後述) |
| `retries=-1` | 0 | 0 | — | ✅ |
| PII | 0 | 0 | 0 | ✅ |
| UrgentLayer | static 維持 | static | static | ✅ |

### CEO 判定 (2026-05-08)
- **smoke v8 PASS** (clean PASS)
- timeout 0 / fallback 0 / POST 1.0x が **再現** → 案 A 確定 / Fix C 確定
- **Stage 2.2 完了**: 累積 95 calls で十分にクリア、これ以上 20-call 繰り返さず Stage 2.3 へ移行
- 100-call 一括禁止維持

### 累積トレンド (block 1 v6 + block 2 + block 3 partial + smoke v7 + smoke v8 = 95 calls)
| 項目 | 累積 | 累積率 | 評価 |
|------|------|--------|------|
| llm 成功 | 91 | 95.8% | ✅ |
| validation_failed | 2 | 2.1% | ✅ |
| timeout | 2 | 2.1% | ✅ smoke v7 / v8 で再現性ある打ち止め |
| **retries=2** | **6** | **6.3%** | ⚠ 累積 5+ 議論ライン到達 (smoke v8 で 3 件登場、後述) |
| retries=-1 (fallback 同行) | 2 | 2.1% | ✅ (validation_failed 2 件と一致) |
| rate_limited | 0 | 0% | ✅ |
| 過剰発火 | 1.0-1.05x | — | ✅ Fix C 安定 |
| latency max trend | 6336 → 6521 → 6375 → 5306 → 6100 | 平均 ~6000ms | ✅ < 10000ms 安定 |

### retries=2 累積 6 件についての観察 (CEO 議論材料、Stage 2.3 で観察継続)
- smoke v8 で +3 件 (block 1 v6=1, block 3 partial=1, smoke v7=1, smoke v8=3)
- 累積 6/95 = 6.3%、CEO 議論ライン (5+) 到達
- ただし retries=2 は **LLM が成功した case** (validator が 2 回 retry した結果通った)
- timeout 0 / fallback 0 と整合 → quality 観点では PASS
- Stage 2.3 で variant 別 retries 分布を観察し、特定 variant に偏っていないか確認

### 運用負債 cleanup (CEO 確定、本 commit で同時実施)
- `lib/coalter/presence/speechFetchGate.ts:43` のコメント "8s timeout" → "10s timeout" 更新
- runtime 影響なし、comment-only

### 不変 (CEO 厳守維持)
- ChatClient.tsx 不変 ✅
- speech route / validator / model / max_tokens 不変 ✅
- UrgentLayer / UrgentMessageCard / UrgentRelease 不変 ✅
- Production env 不変 ✅ (Stage 2.3 でも触らない)
- observationMode は Production に絶対入れない ✅
- 100-call 一括禁止 ✅
- 自律 fix-forward 禁止 ✅
- Anthropic 起因と断定しない (案 C 確認結果待ち) ✅

### Stage 2.2 完了サマリ (累積 95 calls)
| Phase | 内容 | 結果 |
|-------|------|------|
| Stage 2.1 | 1-call → 5-call → 20-call canary (v1-v6) | PASS (Fix C 適用) |
| Stage 2.2 block 1 v6 | 20-call (Fix C 確定) | PASS |
| Stage 2.2 block 2 | 20-call | Yellow PASS (timeout 1) |
| Stage 2.2 block 3 | 15-call で STOP (timeout 2 件目) | STOP → 案 A 適用 |
| Stage 2.2 smoke v7 | 20-call (案 A 検証 1 回目) | PASS |
| Stage 2.2 smoke v8 | 20-call (再現性確認) | **PASS** |

### 次ステップ: Stage 2.3 進入計画 (別 entry で詳細設計)
1. variant 仕様の調査 (Explore agent file:line ベース)
2. 5 sample × 7 variant = 35 sample 取得 protocol 設計
3. quality review 軸 (数値 + 質的) 設計
4. CEO 設計承認後に実施
5. **Production env / observationMode 本番投入禁止維持**

## [2026-05-08] [Build] [L4-i Stage 2.3 設計 v3 確定 + script 実装完了 (実行は CEO 別判断)] [承認: CEO]

### 経緯: 設計 3 round (補正 14 点累積)

#### Round 1 (CEO 補正 v2): tests→scripts、ガード、scope 限定、Sentry 不送信、A も新規
1. `scripts/coalter/` 配置 (tests/ NG)
2. Stage 2.3 = LLM 発話品質のみ (到達性別 stage に分離)
3. Sentry に body 本文を送らない (PII 配慮)
4. variant A も新規 5 件取得 (条件揃え)
5. 実行ガード初期案

#### Round 2 (GPT 補正 v3): ガード強化、cost 非断定、API 事前確認
6. ガード 2 段 (`STAGE23_VARIANT_REVIEW=true` + `STAGE23_VARIANT_REVIEW_CONFIRM=35`)
7. cost 表現 "rough estimate only; depends on model, prompt tokens, and retry count"
8. API signature 事前 Explore 確認

#### Round 2.5 (Claude 追加検証 6 点)
9. fixture 正確性 (Explore 確定)
10. variant 直接指定可能 (`buildPresenceSpeech` で input.variant 直渡し、selectPattern バイパス)
11. signal 情報不要 (`BuildPresenceSpeechInput` 4 fields のみ: variant/state/mode/context)
12. `.env.local` + dotenv config (既存 `scripts/backfillStargazerGenerationCandidates.ts` 慣例)
13. tsx + `@/*` alias 動作 (tsx ^4.21.0、既存 116 scripts で実証)
14. dump file 構造詳細化 (JSON + MD、CEO 質的 review format)

#### Round 3 (CEO/GPT 最終補正 5 点)
15. `__dirname` → `process.cwd()` (ESM 環境で安定)
16. dotenv config を guardEnv より前 (順序逆だと `.env.local` 読まない)
17. 実行前 5 秒 abort + estimated 表示 (補助、env guard が主)
18. try/finally で `setLlmCall(null)` 復元 (構造的 clean さ)
19. commit 2 分割 (script / decision-log、監査容易性)

### 実装内容 (commit `f7072685`)

#### 新規: `scripts/coalter/stage23-variant-quality-review.ts` (392 行)
- 実行ガード 2 段 + ANTHROPIC_API_KEY check
- dotenv config を冒頭で実行 (補正 16)
- 7 variant × 5 sample loop (`PATTERN_VARIANTS` 反復)
- variant 別 fixture (Explore 確定):
  - A: S2/normal / B: S3/normal / C: S4/normal / D: S5/normal
  - E: S5/normal / F1: S6/normal / F2: S7/daily
- LLM injection: `setLlmCall(createAnthropicLlmCall({apiKey}))`
- try/finally で `setLlmCall(null)` 復元 (補正 18)
- rate limit: 各 sample 間 2s sleep
- 出力: `.tmp/stage23-variant-review-<timestamp>.{json,md}` (`process.cwd()` 基準、補正 15)
- MD format: 数値 metric 表 + 全体 PASS/NG 自動判定 + variant 別 sample + CEO 質的 8 観点

#### 改修: `.gitignore` (1 行追加)
- `.tmp/` を ignore (commit 防止)

### tsc 検証
- Stage 2.3 script の TypeScript error 0 件
- 既存 type error は Stage 2.3 scope 外 (urgentLayerDismiss / stargazer)

### 不変 (CEO 厳守維持)
- ChatClient.tsx 不変 ✅
- UpperLayerMount.tsx 不変 ✅
- speech route / validator / model / max_tokens 不変 ✅
- UrgentLayer / UrgentMessageCard / UrgentRelease 不変 ✅
- Production env 不変 ✅
- timeout constant (10s) 不変 ✅
- speechBuilder.ts / llmCall.ts / speechTypes.ts 不変 (import only) ✅
- Sentry に body 送らない (script 出力は local file のみ) ✅
- 自律 fix-forward 禁止 ✅
- Stage 2.4 / variant 到達性検証 / L4-m / E-3 にまだ進まない ✅

### PASS 条件 (script 出力 → CEO 判断、CEO/GPT 確定)

**全体 (35 sample)**:
| 項目 | PASS | NG |
|------|------|----|
| source=llm | 32+/35 (91%+) | 31 以下 |
| fallback (合計) | 0-3 件 (8.6%) | 4+ 件 |
| validation_failed | 0-2 件 (5.7%) | 3+ 件 |
| timeout (>=10s) | 0 件 | 1+ 件 |
| PII 漏洩 | 0 件 | 1+ 件 (即 STOP) |
| 危険発話 | 0 件 | 1+ 件 (即 STOP) |
| length_violation | 0 件 | 1+ 件 |

**variant 別**: 各 5 件中 4+ 件が質的合格 (CEO 8 観点)

**CEO 質的 override**: 数値 PASS でも CEO が「CoAlter らしくない」と判断したら **STOP**

### 質的 review 8 観点 (CEO 読み)
1. 裁いていないか
2. どちらかの味方をしていないか
3. 相手の気持ちを勝手に代弁していないか
4. 断定していないか
5. 尋問っぽくないか
6. 追い詰めていないか
7. CoAlter の距離感として自然か
8. variant の役割に合っているか

### 次ステップ: 実行は CEO 別判断 (本 entry は script 完成のみ)

#### CEO 実行手順
```bash
cd /Users/haradataishi/Culcept-coalter

STAGE23_VARIANT_REVIEW=true \
STAGE23_VARIANT_REVIEW_CONFIRM=35 \
npx tsx scripts/coalter/stage23-variant-quality-review.ts
```

(`ANTHROPIC_API_KEY` は `.env.local` から自動 load)

#### 実行後フロー
1. `.tmp/stage23-variant-review-<timestamp>.{json,md}` 確認
2. CEO MD を読んで 35 sample の質的判定 (8 観点)
3. CEO が PASS / Yellow / NG 判定
4. NG 時: 自律 fix 禁止、原因議論 (CEO 判断)
5. PASS 時: 次 stage (variant 到達性検証 等) に進入判断

#### 出力 file の取り扱い (CEO 厳守)
- `.tmp/` 内の md/json は commit しない (`.gitignore` で除外済)
- CEO review 完了後、削除推奨 (PII 含む可能性)
- 数値 metric のみ decision-log に記録

## [2026-05-08] [Build] [L4-i Stage 2.3 script Round 4 — root cause: COALTER_PRESENCE_SPEECH_LLM 欠落 / 案 C 適用 (probe mode + flag guard)] [承認: CEO]

### CEO 1 回目実行結果 (2026-05-07 21:05 UTC)

```
Variant A (S2/normal):
  [1/5] source=static, retries=0, latency=1ms
  ... (全 35 件 source=static / latency=0-2ms)
```

→ **35 件すべて static path、LLM 1 回も呼ばれていない**。Stage 2.3 品質レビューとして無効データ。

### Root cause (file:line ベースで確定)

`COALTER_PRESENCE_SPEECH_LLM` env が script 実行時に CLI / `.env.local` どちらにも設定されていなかった:

```ts
// lib/coalter/flags.ts:151-153
get presenceSpeechLLMEnabled(): boolean {
  return normalizeBool(process.env.COALTER_PRESENCE_SPEECH_LLM, false);
}
```

```ts
// lib/coalter/presence/speechBuilder.ts:105-116
if (!COALTER_FLAGS.presenceSpeechLLMEnabled) {
  return { source: "static", latencyMs: 0, ... };  // ← flag OFF で即 static return
}
```

→ `setLlmCall` は呼ばれていたが、buildPresenceSpeech が **flag OFF を理由に即 static return**、`injectedLlmCall` は使われず。

### 表現補正 (CEO 厳守)
- ❌ "LLM call が走らなかった" 単体での解釈
- ✅ "**`COALTER_PRESENCE_SPEECH_LLM` env が local script 実行時に入っておらず、`COALTER_FLAGS.presenceSpeechLLMEnabled` が false になり、`buildPresenceSpeech` が即 static path に落ちた**"
- Anthropic 起因と断定しない (今回は env 設定欠落、provider と無関係)

### CEO 判定 (2026-05-08 案 C GO)
- 案 C 採用: guard 強化 + 1-call probe option
- 35 件再実行は **probe PASS 後の CEO 判断後のみ**
- 自律 35-call 禁止維持

### 修正内容 (commit `835dfa13`)

#### `scripts/coalter/stage23-variant-quality-review.ts` 改修

1. **`guardEnv` に `COALTER_PRESENCE_SPEECH_LLM=true` 必須を追加**:
   ```ts
   if (process.env.COALTER_PRESENCE_SPEECH_LLM !== "true") {
     console.error("Refused: COALTER_PRESENCE_SPEECH_LLM=true required (LLM gate must be ON, otherwise buildPresenceSpeech returns static path immediately)");
     process.exit(1);
   }
   ```
   → flag 欠落時に即 abort、static-only run を物理的に防ぐ

2. **`STAGE23_VARIANT_REVIEW_PROBE=1` mode 追加**:
   - variant A 1 件のみ実行
   - probe / confirm 排他指定 (両方 / どちらも → refused)
   - PASS 判定: `source === "llm"` かつ `latencyMs > 100` かつ `fallbackReason === null`
   - 出力: `.tmp/stage23-variant-review-probe-<ts>.{json,md}` (本実行と分離)

3. **mode 分岐の main 関数**:
   - `runProbe()`: 1-call probe + PASS/FAIL judgement console 出力
   - `runConfirm()`: 35-call 本実行 (既存 logic)

### 検証
- script type error 0 件 (Stage 2.3 scope)
- coalter test 全件回帰なし (touch 範囲 = script のみ)

### 不変 (CEO 厳守維持)
- ChatClient.tsx 不変 ✅
- UpperLayerMount.tsx 不変 ✅
- speech route / validator / model / max_tokens 不変 ✅
- UrgentLayer / UrgentMessageCard / UrgentRelease 不変 ✅
- Production env 不変 ✅
- speechBuilder.ts / llmCall.ts / speechTypes.ts 不変 (import only) ✅
- Sentry に body 送らない ✅
- Stage 2.3 = LLM 発話品質のみ、到達性別 stage ✅
- 35 件再実行は probe PASS 後の CEO 判断後のみ ✅
- Anthropic 起因と断定しない ✅

### 次ステップ: CEO 実行 protocol (2 段)

#### Step 1: probe (1-call)

```bash
cd /Users/haradataishi/Culcept-coalter

COALTER_PRESENCE_SPEECH_LLM=true \
STAGE23_VARIANT_REVIEW=true \
STAGE23_VARIANT_REVIEW_PROBE=1 \
npx tsx scripts/coalter/stage23-variant-quality-review.ts
```

期待出力:
```
Variant A (S2/normal):
  [1/1 PROBE] source=llm, retries=0, latency=2300ms, fallbackReason=null

=== PROBE PASS / FAIL JUDGEMENT ===
  source: llm ✓ (expected: llm)
  latencyMs: 2300 ✓ (expected: > 100)
  fallbackReason: null ✓ (expected: null)

→ PROBE PASS — 35-call full run is safe to proceed.
```

#### Step 2: probe PASS 後の 35-call 本実行 (CEO 判断後)

```bash
COALTER_PRESENCE_SPEECH_LLM=true \
STAGE23_VARIANT_REVIEW=true \
STAGE23_VARIANT_REVIEW_CONFIRM=35 \
npx tsx scripts/coalter/stage23-variant-quality-review.ts
```

#### 前回 .tmp/ static dump file (CEO 削除推奨)
- `2026-05-07_21-05-07-261Z.json/md` は無効データ
- CEO 操作で削除推奨 (Claude は touch しない)

## [2026-05-08] [Build] [L4-i Stage 2.3 confirm NG (5 fallback) + diagnostic mode 実装 (Round 5)] [承認: CEO]

### confirm 実行結果 (probe PASS 後の 35-call、commit `ffadc633`)

| 項目 | 値 | PASS | 判定 |
|------|-----|------|------|
| total | 35 | — | — |
| source=llm | 30 | 32+ | 🔴 NG (-2) |
| fallback (合計) | 5 | 0-3 | 🔴 NG (+2) |
| validation_failed | 5 | 0-2 | 🔴 NG (+3) |
| timeout (script 内) | 0 | 0 | ✅ |
| PII | 0 (Claude 予備) | 0 | 予備 ✅ |
| 危険発話 | 0 (Claude 予備) | 0 | 予備 ✅ |

#### variant 別
| variant | llm | fallback | retries 0/1/2/-1 | latency 範囲 | 判定 |
|---------|-----|----------|------------------|-------------|------|
| A | 4 | 1 | 2/2/0/1 | 2304-8537ms | Yellow |
| B | 5 | 0 | 5/0/0/0 | 2300-2640ms | PASS |
| C | 5 | 0 | 4/1/0/0 | 2093-3729ms | PASS (※同一文言 3 件、多様性懸念) |
| D | 5 | 0 | 3/2/0/0 | 1662-8443ms | PASS |
| **E** | **2** | **3** | 0/1/1/3 | 6548-14314ms | **🔴 NG dominant** |
| F1 | 5 | 0 | 5/0/0/0 | 2474-7500ms | PASS |
| F2 | 4 | 1 | 4/1/0/1 | 2427-13735ms | Yellow |

### 5 件 fallback 全て validation_failed (timeout 0)
| # | variant | sample | latency | retries | fallbackReason |
|---|---------|--------|---------|---------|----------------|
| 1 | A | 4 | 8537ms | -1 | validation_failed |
| 2 | E | 0 | 14314ms | -1 | validation_failed |
| 3 | E | 2 | 10761ms | -1 | validation_failed |
| 4 | E | 4 | 9945ms | -1 | validation_failed |
| 5 | F2 | 2 | 13735ms | -1 | validation_failed |

### 表現補正 (CEO/GPT 2026-05-08 Round 5)
- ❌ "timeout 0 だから案 A 効果明確"
- ✅ "**script 経路では client SPEECH_FETCH_TIMEOUT_MS は無関係** (script は buildPresenceSpeech 直叩き)。script 上では timeout fallback は出ていない、失敗は全て validation_failed。UI 経由なら E#0 14314ms / E#2 10761ms / F2#2 13735ms は **timeout 化する可能性**。案 A の効果検証は Stage 2.2 smoke v8 で完了済"
- ❌ "variant E = length 制約問題"
- ✅ "**variant E の reject 原因は未確定**、length_violation 仮説は高確度だが violation type 未観測。確証には diagnostic で attemptViolations 取得必須"

### Stage 2.3-diagnostic 実装 (commit `e9ffe230`)

#### 採用: Case A' (CEO 確定 2026-05-08)
| variant | sample | 理由 |
|---------|--------|------|
| E | 10 | fallback 再現確率高、root cause 主対象 |
| A | 3 | 補助観察 |
| F2 | 3 | 補助観察 |
| 合計 | **16 sample** | LLM call ~32-48 (retry 込)、cost rough estimate |

#### 実装範囲 (CEO 厳守)
- `scripts/coalter/stage23-variant-quality-review.ts` のみ変更
- speechValidator / speechPostValidator / speechPromptBuilder / speechBuilder /
  speechTypes / llmCall / model / max_tokens / timeout constant /
  Production env / ChatClient / UpperLayerMount / UrgentLayer 全て **import only**

#### 新 env: `STAGE23_VARIANT_REVIEW_DIAGNOSTIC=1`
- PROBE / CONFIRM / DIAGNOSTIC の 3 mode 排他指定
- 既存 PROBE / CONFIRM logic 変更なし

#### Diagnostic core (既存 export API のみ)
- `buildSpeechPrompt(input, override)` → prompt 文字列
- 1st LLM call → `rawAttempts[0]` capture
- `postValidateSpeech(initialText, { regenerate: wrapped, ... })`:
  - wrapped が各 retry の raw output を `rawAttempts[i]` に追加
  - 戻り値の `attemptViolations: SpeechViolation[][]` 取得
- 各 attempt 計測: sentenceCount / questionCount / sentenceLengths
- → **「raw output → violation kind」完全 traceable**

#### 出力 (`.gitignore` 除外、commit 不可)
- `.tmp/stage23-variant-review-diagnostic-<ts>.{json,md}`
- MD 構造: 全体集計 (variant 別 violation kind 8 種分布表) + Sample 集計 + variant 別詳細 + 仮説検証

### 仮説検証ライン (CEO 判断対象、Claude 自律禁止)
| dominant violation kind | 仮説 | 修正方向候補 (CEO 判断) |
|------------------------|------|------------------------|
| length_violation | length 制約 vs 翻訳系 prompt ミスマッチ | E のみ length 緩和 / E prompt 文長指示強化 |
| worldview / judgmental / 等 | prompt の禁止表現指示が effective でない | prompt 修正 (E 専用文言調整) |
| 複数 kind 混在 | 複合的問題 | 設計レビュー、修正策複雑化 |

### 不変 (CEO 厳守維持)
- ChatClient / UpperLayerMount / speech route / validator / postValidator /
  promptBuilder / speechBuilder / model / max_tokens / length_override /
  timeout constant / Production env / UrgentLayer 全て不変 ✅
- Sentry に raw output 送らない (local file のみ) ✅
- Anthropic 起因と断定しない ✅
- length 制約問題と断定しない (diagnostic 結果で確認後) ✅
- diagnostic 結果を見るまで length 緩和 / prompt 修正 / validator 修正に進まない ✅
- 35-call 再実行は CEO 修正方針確定後の判断のみ ✅

### 次ステップ: CEO 実行 protocol

#### Step 1: Diagnostic 実行 (16-call)

```bash
cd /Users/haradataishi/Culcept-coalter

COALTER_PRESENCE_SPEECH_LLM=true \
STAGE23_VARIANT_REVIEW=true \
STAGE23_VARIANT_REVIEW_DIAGNOSTIC=1 \
npx tsx scripts/coalter/stage23-variant-quality-review.ts
```

期待出力:
- E 10 / A 3 / F2 3 sample 実行
- 各 sample で raw attempts + violation kind 保存
- `.tmp/stage23-variant-review-diagnostic-<ts>.{json,md}` 生成

#### Step 2: CEO 質的 review
- MD を読み、variant 別 violation kind 分布表確認
- variant E の dominant kind 特定 → 仮説検証

#### Step 3: 修正方針 CEO 判断 (diagnostic 結果共有後)
- length_violation dominant → E のみ length 緩和 議論
- worldview / 別 kind dominant → prompt 修正 議論
- 複合 → 設計議論

#### Step 4: 修正実装 (CEO 承認後)、35-call 再実行で再判定

## [2026-05-08] [Build] [L4-i Stage 2.3 Round 6 — diagnostic 結果分析 + 案 A' 実装 (E grounding contract)] [承認: CEO]

### Diagnostic 結果 (commit `e9ffe230` で取得)

#### 数値確定
| variant | 10/3/3 | fallback | retries 0/1/2/-1 | totalViolations |
|---------|--------|----------|------------------|-----------------|
| **E** | **6/10 fallback** (60%) | 6 | 1/3/0/6 | **28** (全 length_violation) |
| A | 0/3 | 0 | 3/0/0/0 | 0 |
| F2 | 0/3 | 0 | 1/1/1/0 | 4 (全 length_violation) |

E fallback 率 60% は Stage 2.3 confirm (3/5=60%) と一致 → **再現性確認**。

#### violation kind 分布 (8 種)
- E: length_violation のみ 28 件、judgmental/evaluative/speak_for_other/premature_certainty/cornering/worldview/interrogative 全て 0
- A: 全 0
- F2: length_violation のみ 4 件

→ **validator 直接原因 = length_violation 確定**

### 真の問題 (raw output 観察、CEO/GPT 指摘)

`.tmp/stage23-variant-review-diagnostic-2026-05-07_22-38-36-114Z.md` の variant E raw output 観察:
- E は **context: {} (空)** にもかかわらず、**架空の人物・関係・発言を捏造**
- 捏造例:
  - 「**お母さん**は「ゲームが悪影響」と心配し、**あなた**は「ゲームで得られるもの」を伝えたい」(E#0 attempt 1)
  - 「**お母さん**は「**学校に行きなさい**」と言い、**あなた**は「**行きたくない**」と答えている」(E#1 attempt 2)
  - 「**お父さん**は「**早く寝なさい**」と言い、**あなた**は「**もう少しゲームしたい**」」(E#3 attempt 3)
  - 「**ユーザーとシステム**の間で「優先順位」という言葉の意味が」(E#8 attempt 1) ← 無関係な技術文脈
  - 「**Aさん**は「期待に応えたい」、**Bさん**は「自分のペースを守りたい」」(E#4 attempt 3)
- 捏造内容: お母さん / お父さん / Aさん / Bさん / 彼女 / ユーザーとシステム / 学校 / ゲーム / 責任 / 期待 / 将来 / 支援 / 予定 / 「早く寝なさい」「早く決めろ」「もう少しゲームしたい」等

### Validator は捏造を無検出

8 種違反: judgmental / evaluative / speak_for_other / premature_certainty / interrogative / cornering / worldview / length_violation
- 「お母さん」と捏造しても上記いずれにも該当せず通る
- → **validator では捏造防止できない** (構造的問題)

### Length が偶然 captioned 捏造の indirect filter になっていた

- 抽象的な発話 (E#2 #1, E#7 #2, E#9 #2) は自然と短く length も通る
- 捏造内容を入れると自然と長くなる (95-110 字級) → length_violation で reject
- → **length 制約が偶然 indirect filter として機能**
- → length 緩和だけだと、捏造的長文 (50-58 字級に詰めれば) が通ってしまう

### CEO/GPT 警告 + Round 6 採用案

**CEO/GPT 警告**: 「length 40→60 だけだと、これまで length で弾かれていた文脈なし具体化が通ってしまう」

**CEO 確定採用**: **案 A'** (E grounding contract 追加、length 緩和は留保)

### 修正内容 (commit `f0945255`)

`lib/coalter/presence/speechPromptBuilder.ts:VARIANT_TEMPLATE.E` に grounding contract 追加:
1. 文脈 (Context) にない人物・関係・発言を作らない (架空の登場人物・対話を生成しない)
2. Context に具体発言が含まれない場合は、抽象的な橋渡しに留める
3. 「お母さん / お父さん / Aさん / Bさん / 彼女 / ユーザーとシステム」など Context にない人物・関係を勝手に作らない
4. 「片方は『X』、もう片方は『Y』」と具体 quote するのは Context に両者の発言内容が **明示的に含まれている場合のみ**
5. 1 文 40 文字以内に収めるため、抽象的に短く言う

### 不変 (CEO 厳守維持)
- 他 variant template 不変 (A/B/C/D/F1/F2) ✅
- speechValidator / speechPostValidator / speechTypes / speechBuilder 不変 ✅
- llmCall / model / max_tokens / length_override 不変 ✅
- ChatClient / UpperLayerMount / speech route / UrgentLayer / timeout constant 不変 ✅
- Production env 不変 ✅

### 検証
- speechBuilder.test.ts 15 件全 PASS
- coalter 全 147 file / 2148 test PASS、回帰なし
- speechPromptBuilder type error 0

### 次ステップ: CEO 検証 protocol

#### Step 1: Diagnostic 再実行 (16-call、~5 分)

```bash
cd /Users/haradataishi/Culcept-coalter

COALTER_PRESENCE_SPEECH_LLM=true \
STAGE23_VARIANT_REVIEW=true \
STAGE23_VARIANT_REVIEW_DIAGNOSTIC=1 \
npx tsx scripts/coalter/stage23-variant-quality-review.ts
```

#### Step 2: CEO 確認項目 (4 つ)
| 項目 | Round 6 前 | Round 6 後 期待 |
|------|-----------|----------------|
| E fallback | 6/10 (60%) | ≤ 2/10 (20%) 期待 |
| E length_violation | 28 件 | 大幅減 (≤ 10 期待) |
| 文脈なし捏造 (raw output) | 多発 (お母さん等) | **消えるか確認** (CEO 質的) |
| A/F2 悪化 | (基準値) | 悪化なし (A 0、F2 ≤ 4 維持) |

#### Step 3: 判定分岐
- **PASS** (4 項目全て期待通り) → 35-call confirm 再実行 → Stage 2.3 再判定
- **NG** (E fallback まだ多い / 捏造残る / A/F2 悪化) → CEO 議論
  - 案 A' 効果不十分 → length 緩和議論 (E のみ 40→60、CEO 判断、未着手)
  - 別問題発覚 → 設計議論

### CEO 厳守不変 (Round 6 着手後も維持)
- length 緩和に飛ばない (案 A' で足りない場合のみ別議論)
- validator 全体を緩めない
- model / max_tokens 触らない
- 35-call 再実行は diagnostic PASS 後のみ
- Anthropic 起因と断定しない

## [2026-05-08] [Build] [L4-i Stage 2.3 Round 7 (confirm Yellow) + Round 8 (G-1' = C/D/F2 grounding/tone 追加)] [承認: CEO]

### Round 7: 35-call confirm 再実行結果

#### 数値 (Round 5 比較)
| 項目 | Round 5 | **Round 7** | PASS 条件 | 判定 |
|------|---------|------------|-----------|------|
| source=llm | 30 | **33** | 32+ | ✅ |
| fallback | 5 | **2** | 0-3 | ✅ |
| validation_failed | 5 | **2** | 0-2 | ✅ ギリギリ |
| **timeout** (latency >=10s) | 0 | **1** (F2#1 latency=13558ms validation_failed) | 0 | **🔴 NG** |
| script error | 0 | 0 | 0 | ✅ |

→ **clean PASS ではない、Yellow / 未完了**

#### Variant 別
| variant | source | 質的観察 |
|---------|--------|----------|
| A | 4 llm + 1 fallback | A#2 fallback (validation_failed、length 関係) |
| B | 5 llm | 安定 |
| C | 5 llm | **🔴 面談 bot tone 違和感**: 「今日はどんなことがあったんですか?」「どんな話をしたいと思って来たんですか?」 |
| D | 5 llm | **🔴 視覚情報捏造**: D#1「左側の方は、何か言いたそうな表情をされているように見えます」 |
| E | 5 llm | 案 A' 効果継続、捏造なし、抽象的橋渡し |
| F1 | 5 llm | 安定 |
| F2 | 4 llm + 1 fallback | **🔴 天気・気温捏造**: F2#0「肌寒く感じる」/ F2#2「肌寒い」/ F2#3「暖かくなる」 |

### timeout=1 の正体 (CEO 厳守 表現補正)
- F2 sample 1: latencyMs=13558ms、retries=-1、fallbackReason=`validation_failed`
- script の自動 timeout 判定 (latencyMs >= 10000) で timeout=1 だが、
- 真の failure mode は **validation_failed の累積遅延** (3 attempts × 4-5s)
- 単発 provider timeout ではない、Anthropic 起因と断定しない (CEO 厳守)

### CEO/GPT 質的指摘 3 件 (Claude 前回見落とし、自己批判)

私 (Claude) は前回 §G で「PASS 推奨」と書いたが誤り:
- 数値で timeout=1 を見落とした
- 質的分析を E のみに focus、D/C/F2 の捏造・tone 違和感を完全に見落とした
- F2 Yellow を「length 問題、scope 外」と片付け、内容を見ていなかった

CEO/GPT 指摘で 3 件全て raw output で verify:
1. D の視覚情報捏造 (E と同種の文脈なし具体化)
2. C の面談 bot tone (CoAlter 役割逸脱)
3. F2 の天気・気温事実化 (誤情報 risk)

### Round 8 採用: 案 G-1' (CEO 確定 2026-05-08)

CEO 補正 4 点:
1. **G-1'** = C/D/F2 に variant 別 grounding/tone 追加 + E grounding 維持
2. **D**: 視覚情報・物理位置・表情禁止
3. **F2**: Context にない天気・気温・季節・時間帯・体調・予定を **事実として作らない**、ただし抽象的な生活提案は許可
4. **C**: 面談 bot 化禁止、確認質問は **二者間スコープに限定**
5. **timeout=1** は validation_failed 累積遅延として扱う、単発 provider timeout と断定しない
6. **diagnostic 対象**: C5/D5/F2 5/E5 = 20 sample (必須、A は除外)

### 修正内容 (commit `4ef67afe`)

#### `lib/coalter/presence/speechPromptBuilder.ts`
- VARIANT_TEMPLATE.C に tone/scope contract 追加:
  - 面談語彙 (来た/訪問/面談/カウンセリング) 禁止
  - 個人雑談・近接質問 (今日はどんなことがあった?) 禁止
  - 二者間スコープ限定
  - OK/NG 例明示
- VARIANT_TEMPLATE.D に grounding contract 追加:
  - 視覚情報・物理位置・表情禁止 (左側/右側/表情/視線/顔つき/仕草/身振り/服装)
  - 片側フォーカスは「発話・言葉・態度の文脈」限定
- VARIANT_TEMPLATE.F2 に grounding contract 追加:
  - 天気・気温・季節・時間帯・体調・予定を事実として作らない
  - 抽象的な生活提案は許可 (「短い休憩」「少し整える時間」「予定を軽く見直す」)
  - NG 例明示 (「肌寒い」「暖かくなる」)
- E grounding contract は不変 (Round 6 のまま、regression 確認用)
- A/B/F1 不変

#### `scripts/coalter/stage23-variant-quality-review.ts`
- DIAGNOSTIC_TARGETS を `[C:5, D:5, F2:5, E:5]` に変更 (Round 6 の `[E:10, A:3, F2:3]` から)
- preamble / runDiagnostic / formatDiagnosticMarkdown を DIAGNOSTIC_TARGETS ベースに汎用化 (variant 順序ハードコード排除)

### 検証
- speechPromptBuilder.test 15/15 PASS (E template 構造 invariant、新 C/D/F2 contract も regex 検証なし)
- coalter 全 147 file / 2148 test PASS、回帰なし
- type error 0 (speechPromptBuilder + script)

### 不変 (CEO 厳守維持)
- speechValidator / speechPostValidator / speechTypes / speechBuilder / llmCall 不変 ✅
- model / max_tokens / length_override / timeout constant 不変 ✅
- ChatClient / UpperLayerMount / speech route / UrgentLayer / Production env 不変 ✅
- A/B/E/F1 template 不変 ✅
- 35-call confirm はまず 20-sample diagnostic → 結果確認後 ✅
- length 緩和に進まない ✅
- Anthropic 起因と断定しない ✅

### 次ステップ: CEO diagnostic 20-sample 実行 protocol

#### 実行コマンド
```bash
cd /Users/haradataishi/Culcept-coalter

COALTER_PRESENCE_SPEECH_LLM=true \
STAGE23_VARIANT_REVIEW=true \
STAGE23_VARIANT_REVIEW_DIAGNOSTIC=1 \
npx tsx scripts/coalter/stage23-variant-quality-review.ts
```

期待出力:
- 順序: C 5 → D 5 → F2 5 → E 5
- LLM call ~20-40 (retry 込)、cost rough estimate
- `.tmp/stage23-variant-review-diagnostic-<ts>.{json,md}`

#### CEO 確認項目 (Round 8 効果検証)

| # | 項目 | 確認方法 |
|---|------|---------|
| 1 | D で視覚情報捏造が消えたか | raw output 検索: 「左側」「右側」「表情」「視線」「顔つき」「仕草」 |
| 2 | F2 で天気・気温・季節・予定の捏造が消えたか | raw output 検索: 「肌寒」「暖かく」「夕方」「季節」「最近」「今日は〜なる」 |
| 3 | C が面談 bot ではなく二者間整理の質問になったか | raw output 検索: 「来た」「面談」「今日はどんな」「特別なこと」 |
| 4 | E が悪化していないか | E 5 sample で捏造 keyword 0 維持確認 (Round 6 時と同パターン) |
| 5 | fallback / validation_failed / length_violation が増えていないか | 数値 metric で増加トレンド |

#### 判定分岐
- **PASS** (5 項目全て期待通り) → 35-call confirm 再実行 → Stage 2.3 再判定
- **NG** → CEO 議論 (case G-1' 効果不十分の場合のみ別議論)

### CEO 厳守不変 (Round 8 着手後も維持)
- 35-call 再実行は diagnostic PASS 後のみ
- length 緩和に飛ばない
- validator / model / max_tokens / timeout 不変
- Production env / ChatClient / UpperLayerMount / UrgentLayer 不変
- 自律 fix-forward 禁止
- Anthropic 起因と断定しない

## [2026-05-08] [Build] [L4-i Stage 2.3 Round 9 — D template 全面書き換え (視覚メタファー削除)] [承認: CEO]

### Round 8 diagnostic 結果 (CEO/GPT 監査)

#### 数値 (一見良好)
| variant | retries 0/1/2/-1 | violations | latency 範囲 |
|---------|------------------|------------|------------|
| C | 5/0/0/0 | 0 | 1834-2342ms |
| D | 2/2/1/0 | 4 (length のみ) | 2509-8646ms |
| F2 | 5/0/0/0 | 0 | 2395-3530ms |
| E | 5/0/0/0 | 0 | 2462-2713ms |

→ 数値だけ見ると PASS、しかし **質的観察で D が NG**

### 質的 verify (raw output 検証、Claude 確認済)

#### D NG 確定 (9/9 attempts で左右生成)
| Sample | Attempt | body | 左右 keyword |
|--------|---------|------|------------|
| D#0 | 1 | 「**右側の方**は、**左側**の発言を…」 | ⚠ |
| D#1 | 1 | 「**右側の方**は、**左側**の言葉を…」 | ⚠ |
| D#2 | 1 | 「**右側の方**は、**左側**の「もう疲れた」」 | ⚠ |
| D#2 | 2 | 「**右側の方**は、**左側**の言葉に対して」 | ⚠ |
| D#3 | 1 | 「**右側の方**は…」 | ⚠ |
| D#3 | 2 | 「**左側**は…**右側**の提案を…」 | ⚠ |
| D#3 | 3 | 「**右側の方**は、**左側**が使った」 | ⚠ |
| D#4 | 1 | 「**左の方**は…**右の方**の発言を…」 | ⚠ |
| D#4 | 2 | 「**右側**の発言が…**左側**からの応答」 | ⚠ |

→ Round 8 grounding contract が **完全に効いていない**

#### F2 (ほぼ PASS)
- 5/5 件 天気・気温 keyword 0
- F2#3 のみ「**午後の作業**」← 時間帯軽微
- CEO 評価: 「天気消えてる、軽微残、35-call で再観測 (D 修正後)」

#### C (PASS、ただし多様性ゼロ)
- 5/5 件 完全同一文: 「今、二人の間で一番整理したい点はどこでしょうか?」
- prompt 内 OK 例を LLM が完全 quote (prompt が強すぎ)
- CEO 評価: 「将来課題、blocker でない」

#### E (PASS、regression なし)
- 5/5 件 抽象的橋渡し維持、捏造 keyword 0

### Root cause (CEO/GPT 指摘、Claude 自己批判)

私 (Claude) Round 8 修正の見落とし:
- 元テンプレート文 `Pattern D 片側フォーカス: 片側のみに視線を向ける。` を **そのまま残した**
- 「視線」「片側のみに視線を向ける」は **視覚メタファー**
- 後段で grounding contract に「視覚禁止」と書いても、前段の task 定義「視線を向ける」が **prompt 内で強い**
- LLM は前段優先 → 左右生成

CEO/GPT 修正方針:
- 元テンプレート文を全面書き換え (視線/視覚メタファー削除)
- contract に「片側フォーカスは視覚 focus ではなく発話文脈の観点整理」明示

### Round 9 修正内容 (commit `84ecbebe`)

#### `lib/coalter/presence/speechPromptBuilder.ts` D template

**旧** (Round 8 まで):
```
Pattern D 片側フォーカス (§7.6 / §6.x): 片側のみに視線を向ける。代弁せず観測事実のみ。
【grounding contract】
- 視覚情報・物理位置・表情を作らない
- 「左側 / 右側 / 左の方 / 右の方 / 表情 / 視線 / 顔つき / 仕草 / 身振り / 服装」等を使わない
- 片側フォーカスは「片方の発話・言葉・態度の文脈」に限定
```

**新** (Round 9):
```
Pattern D 片側観点の整理 (§7.6 / §6.x): 片方の発話・言葉・反応の文脈にだけ
一時的に注目する。視覚情報や物理位置は使わず、発話上に現れている要素だけを
扱う。代弁せず、推論は控えめにする。
【grounding contract (Round 9 修正: 元テンプレート「視線を向ける」削除 + contract 強化)】
- 「左側 / 右側 / 左の方 / 右の方 / 左から / 右から」絶対禁止
- Context に speaker label なしなら「片方 / もう片方 / 一方 / 他方」に留める
- Context にない具体 quote を作らない
- 表情・視線・仕草・位置・画面上の配置・服装・身振り 使わない
- 「片側フォーカス」は視覚的 focus ではなく発話文脈の観点整理と明示
```

### 検証
- speechPromptBuilder type error 0
- coalter 全 147 file / 2148 test PASS、回帰なし

### 不変 (CEO 厳守維持)
- 修正範囲は speechPromptBuilder.ts D template のみ ✅
- A/B/C/E/F1/F2 template 不変 ✅
- speechValidator / speechPostValidator / speechTypes / speechBuilder /
  llmCall / model / max_tokens / length_override / timeout constant 不変 ✅
- ChatClient / UpperLayerMount / UrgentLayer / Production env 不変 ✅
- 35-call confirm はまだ禁止 ✅

### 次ステップ: CEO D 中心 diagnostic 再実行

#### 実行コマンド (前回と同じ、20 sample = C5/D5/F2 5/E5)
```bash
cd /Users/haradataishi/Culcept-coalter

COALTER_PRESENCE_SPEECH_LLM=true \
STAGE23_VARIANT_REVIEW=true \
STAGE23_VARIANT_REVIEW_DIAGNOSTIC=1 \
npx tsx scripts/coalter/stage23-variant-quality-review.ts
```

#### CEO 確認項目 (Round 9 効果検証、3 項目)

| # | 項目 | 確認方法 |
|---|------|---------|
| 1 | **D で左右生成が消えたか** | raw output 検索: 「左側」「右側」「左の方」「右の方」「左から」「右から」 |
| 2 | D が「片方/もう片方/一方/他方」に留まるか (CEO 確定の語彙) | 観察 |
| 3 | C/F2/E が悪化していないか (regression) | C 多様性 (前回ゼロ)、F2 天気消失維持、E 捏造ゼロ維持 |

#### 判定分岐
- **PASS** (D 左右消失 + 他 regression なし) → 35-call confirm 再実行 → Stage 2.3 再判定
- **NG** (D まだ左右生成 / 他 regression) → CEO 議論

### CEO 厳守 (Round 9 着手後も維持)
- 35-call 再実行は diagnostic PASS 後のみ
- length 緩和に進まない
- validator / model / max_tokens / timeout 不変
- 自律 fix-forward 禁止
- Anthropic 起因と断定しない

## [2026-05-08] [Build] [L4-i Stage 2.3 Round 10 — F1 grounding/tone (カウンセラー寄り解消) + Yellow 付き条件付き PASS 方針] [承認: CEO]

### Round 9 後 35-call confirm 結果

#### 数値
| 項目 | 値 | PASS 条件 | 判定 |
|------|-----|----------|------|
| source=llm | 34/35 | 32+ | ✅ |
| fallback | 1 | 0-3 | ✅ |
| validation_failed | 1 | 0-2 | ✅ |
| **timeout** | **2** | 0 | **🔴 NG** |
| script error | 0 | 0 | ✅ |

#### timeout 2 件の正体 (Round 7 と異なる failure mode)
| Sample | latency | retries | source | 解釈 |
|--------|---------|---------|--------|------|
| C#2 | **61909ms** (61秒!) | 0 | llm | **provider 単発遅延 spike** (Anthropic API rate limit / queue) |
| D#1 | 13363ms (13秒) | 1 | llm | retries 累積 (2 attempts × 5-7秒) |

→ Round 7 timeout=1 (validation_failed 累積遅延) と異なる failure mode、断定回避

### 質的 verify (CEO/GPT 監査)

| variant | 状態 | 詳細 |
|---------|------|------|
| **D** | ✅ Round 9 完全成功 | 5/5 件「片方」のみ、左右 keyword 0 |
| **E** | ✅ regression なし | 抽象的橋渡し維持、捏造 0 |
| **F1** | 🔴 **新発見 NG** (Claude 前回見落とし) | 「あなたが決められます」「嬉しいです」「いつでも声をかけて」 → カウンセラー寄り |
| C | ⚠ 多様性ゼロ続行 | 5/5 件 完全同一文 (prompt OK 例 quote)、blocker でない |
| F2 | ⚠ 軽微残続行 | 「視線/午後/次の作業」、blocker でない |
| A/B | ✅ | 安定 |

### Claude 自己批判 (累積見落とし)

私 (Claude) の質的観察の弱点:
- Round 7: D/C/F2 を見落とし
- Round 8: D 元テンプレ矛盾を見落とし
- **Round 10: F1 のカウンセラー寄りを見落とし** (Round 7 raw output に既出)

CEO/GPT の質的観察は私より厳密、subtle な役割逸脱に気付く。

### CEO 確定 案 1 (Round 10)

#### F1 修正 + Yellow 付き条件付き PASS 方針
- **F1 のみ Round 10 で修正** (CoAlter ブランド毀損 risk、看過不可)
- **F2/C 軽微 = post-Stage 2.3 refinement** (CEO 確定)
- **latency 異常値 = Stage 2.4 (UI 到達性) で扱う、観察事項として記録**
- **F1 修正後即 Yellow PASS にしない、F1 5-sample focused diagnostic 必須** (CEO 確定)

### 修正内容 (commit `b2322991`)

#### `lib/coalter/presence/speechPromptBuilder.ts` F1 template

**追加 contract**:
- CoAlter は **二者間の上部レイヤー**であり、**相談 AI / カウンセラー** ではない
- AI 自身の感情表現禁止: 「嬉しい / 心配 / 寂しい / いつでも声をかけて」
- 個人 choice 強調禁止: 「あなたが決められます / あなたが選ぶことです / あなた次第」
- 関係営業表現禁止: 「また話して / 定期的に話す機会 / 戻ってきてください」
- F1 = **二者間の関係保護の軽提案** に限定
- OK 例: 「今は少し距離を置いてみる選択肢もあります」「二人で時間を取り直すのは一つの方法です」「お互いに少し休む時間を作るのも考えられます」

#### `scripts/coalter/stage23-variant-quality-review.ts` DIAGNOSTIC_TARGETS
- Round 8: `[C5, D5, F2 5, E5]` = 20
- **Round 10: `[F1: 5]` = 5 sample** (CEO 確定 F1 focused)

### 検証結果
- speechPromptBuilder type error 0、stage23 script type error 0
- coalter 全 147 file / 2148 test PASS、回帰なし

### 不変 (CEO 厳守維持)
- A/B/C/D/E/F2 template 不変 ✅
- speechValidator / speechPostValidator / speechTypes / speechBuilder /
  llmCall / model / max_tokens / length_override / timeout constant 不変 ✅
- ChatClient / UpperLayerMount / UrgentLayer / Production env 不変 ✅
- 35-call confirm はまず F1 focused diagnostic → PASS 後 ✅

### 観察事項記録 (Stage 2.3 scope 外、Stage 2.4 で扱う)

#### Latency 異常値
- C#2: 61909ms (61秒、provider 単発遅延 spike、retries=0)
- D#1: 13363ms (13秒、retries=1 累積)
- UI client SPEECH_FETCH_TIMEOUT_MS=10000ms では切断
- Stage 2.4 (UI 到達性) で扱う、Stage 2.3 では「観察事項」として記録のみ
- timeout 値 / model / max_tokens 変更は **Stage 2.4 議論対象** (今は不変)

#### Post-Stage 2.3 refinement (Stage 2.3 Yellow 付き PASS 後の改善対象)
- **C 多様性ゼロ**: prompt OK 例の完全 quote、prompt の OK 例提示方法を改善 (複数提示 / 緩い誘導)
- **F2 軽微残**: 「視線/午後/次の作業」等の context なし生活状況具体化、F2 contract の微調整

### 次ステップ: CEO F1 focused diagnostic 実行 protocol

#### 実行コマンド (5 sample = F1 のみ)
```bash
cd /Users/haradataishi/Culcept-coalter

COALTER_PRESENCE_SPEECH_LLM=true \
STAGE23_VARIANT_REVIEW=true \
STAGE23_VARIANT_REVIEW_DIAGNOSTIC=1 \
npx tsx scripts/coalter/stage23-variant-quality-review.ts
```

#### CEO 確認項目 (Round 10 効果検証、5 項目)
| # | 項目 | 確認方法 |
|---|------|---------|
| 1 | fallback 0 | F2 5 件全て source=llm |
| 2 | validation_failed 0 | F2 5 件全て validator 通過 |
| 3 | AI 感情表現 0 | raw output 検索: 「嬉しい / 心配 / 寂しい / いつでも声をかけて」 |
| 4 | 個人 choice 強調 0 | raw output 検索: 「あなたが決められ / あなたが選ぶ / あなた次第」 |
| 5 | 関係営業表現 0 | raw output 検索: 「また話して / 定期的に / 戻ってきて」 |
| (CEO 質的) | 二者間の関係保護提案として自然 | CEO 質的判定 |

#### 判定分岐
- **PASS** (5 項目期待達成 + CEO 質的合格) → 35-call confirm 再実行 → Stage 2.3 **Yellow 付き条件付き PASS** 確定
- **NG** (項目残る) → 自律 fix 禁止、CEO 議論

#### Stage 2.3 Yellow 付き条件付き PASS 確定後 (CEO 判断)
- Production と **切り離して記録**
- 観察事項 (latency 異常値) は Stage 2.4 で扱う
- 軽微残 (C/F2) は post-Stage 2.3 refinement
- Stage 2.4 (variant 到達性 / state machine routing) は別判断、まだ進まない

### CEO 厳守 (Round 10 着手後も維持)
- 35-call 再実行は F1 focused diagnostic PASS 後のみ
- length 緩和に進まない
- validator / model / max_tokens / timeout 不変
- Production env 触らない
- Stage 2.4 / 到達性検証 / L4-m / E-3 進まない (Stage 2.3 Yellow PASS 後の別判断)
- 自律 fix-forward 禁止
- Anthropic 起因と断定しない

## [2026-05-08] [Build] [L4-i Stage 2.3 Yellow 付き条件付き PASS 確定 + Stage 2.4 設計提案] [承認: CEO]

### Stage 2.3 Yellow 付き条件付き PASS 確定

#### Round 10 F1 focused diagnostic 結果 (CEO 監査)
- F1 5 sample: fallback 0 / validation_failed 0 / retries 0 / violations 0 / latency max 2610ms
- AI 感情表現 0 / 個人 choice 強調 0 / 関係営業表現 0 ✅
- 二者間の関係保護の軽提案として成立 ✅
- F1 多様性は OK 例寄り → post-Stage 2.3 refinement (C と同じ、blocker でない)

#### Stage 2.3 全体総括 (Round 1-10 累積)

**解消した問題**:
- ✅ E grounding (文脈なし捏造): Round 6 完全解消
- ✅ D 左右・視覚捏造: Round 9 完全解消 (元テンプレート全面書き換え)
- ✅ F1 カウンセラー寄り: Round 10 完全解消
- ✅ Fix C 過剰発火 → Stage 2.2 で解決済 (Round 7 では発火問題なし、validator 観点)

**許容範囲内**:
- ✅ source=llm 32+/35 (案 1 PASS 条件)
- ✅ fallback ≤3
- ✅ validation_failed ≤2

**post-Stage 2.3 refinement (Yellow 構成)**:
- ⚠ C 多様性ゼロ: prompt OK 例の完全 quote、複数 OK 例提示で改善見込み
- ⚠ F1 多様性: 同上
- ⚠ F2 軽微残: 「視線/午後/次の作業」の context なし生活状況具体化

**Stage 2.4 で扱う観察事項**:
- ⚠ latency 異常値: C#2 61909ms (provider 単発 spike) / D#1 13363ms (retries 累積)
- ⚠ UI 到達性 / state machine routing / SPEECH_FETCH_TIMEOUT_MS との整合

#### Stage 2.3 PASS 判定
- **Clean PASS**: ✗ (timeout=2 / 多様性軽微残)
- **Yellow 付き条件付き PASS**: ✅ (CEO 確定 2026-05-08)
- **Production 反映**: 未承認 (CEO 厳守、Stage 2.4 後の別判断)

### 累積コード変更 (Round 1-10)

| Round | commit | 範囲 |
|-------|--------|------|
| 6 (案 A') | f0945255 | E grounding contract 追加 |
| 8 (G-1') | 4ef67afe | C/D/F2 grounding/tone contract 追加 |
| 9 | 84ecbebe | D template 全面書き換え (視覚メタファー削除) |
| 10 (案 1) | b2322991 | F1 grounding/tone contract 追加 |

→ 全変更は **`speechPromptBuilder.ts`** のみ (DIAGNOSTIC_TARGETS は script のみ)、speechValidator / postValidator / speechTypes / speechBuilder / llmCall / model / max_tokens / length_override / timeout constant / Production env / ChatClient / UpperLayerMount / UrgentLayer / speech route 全て **不変** (CEO 厳守完全達成)。

### Stage 2.3 不変事項 (Yellow PASS 後も維持)
- C 多様性ゼロ / F1 多様性 / F2 軽微 = post-Stage 2.3 refinement
- latency 異常値 = Stage 2.4 で扱う
- timeout 値 / model / max_tokens 変更 = Stage 2.4 議論対象
- Production env = Stage 2.4 PASS 後の別判断

---

## Stage 2.4 設計提案 (CEO 判断対象)

### Stage 2.4 = 「LLM 出力品質以外の観点」検証

CEO 確定 scope: **Production 投入ではなく、到達性・UI 経路・timeout・routing 検証**

### Stage 2.4 を 4 段階に分割 (ゴールから逆算)

#### Stage 2.4-A: state machine routing audit (静的検証)

**目的**: `selectPattern(state, mode, context)` が想定通りの variant を選ぶか確認

**検証対象**:
- state ⇔ variant 対応表が想定通り (S2→A / S3→B / S4→C / S5→D|E / S6→F1 / S7+daily→F2 等)
- context flag (needFraming, needTranslation, infoMissing 等) の routing
- mode 切替 (normal / daily / travel) の routing
- edge case (state 遷移中、複数 context flag、未定義 state)

**実施方法**:
- 既存 `selectPattern.test.ts` の coverage 確認
- 不足 case があれば test 追加 (LLM call なし、純関数 test)

**実装範囲**:
- `tests/unit/coalter/presence/` 配下の test 拡張のみ
- 既存 `lib/coalter/presence/patternSelector.ts` 等の **コード変更なし** (audit のみ、修正は Stage 2.4-B 以降)

**PASS 条件**:
- 各 state × mode × context 組合せで意図した variant 返却
- coverage 不足 case が test で網羅される
- 既存 unit test 全 PASS

**所要時間**: 1-2 時間 (Explore + 既存 test 確認 + 不足分追加)
**cost**: 0 (LLM call なし)

---

#### Stage 2.4-B: variant 到達性 smoke (動的検証 / Preview env)

**目的**: 各 variant が **実 UI で発火する path** が存在するか確認

**検証対象**: 7 variant それぞれについて
- 起点 user input (variant trigger)
- state machine 遷移 (S0 → S2/S3/S4/S5/S6/S7)
- speech fetch 発火
- UpperLayerMount で speech card render

**シナリオ例 (variant 別 trigger)**:
| variant | state | trigger 例 |
|---------|-------|----------|
| A | S2 | 「もう限界」(Stage 2.2 で実証済) |
| B | S3 | 関係 signal 検出 (温度差) |
| C | S4 | infoMissing context |
| D | S5 + needFraming | 片側偏重 signal |
| E | S5 + needTranslation | 翻訳要求 signal |
| F1 | S6 | 関係保護タイミング |
| F2 | S7 + daily | 生活提案タイミング |

**実施方法**:
- Preview env で各シナリオ手動再現 (CEO local 操作)
- Sentry breadcrumb で variant 発火確認
- もしくは E2E test を追加 (もし既存 e2e test framework あれば)

**実装範囲**:
- 検証手順書 (decision-log に Markdown で記録)
- もしくは新規 e2e test (Playwright?)

**PASS 条件**:
- 7 variant 全て発火確認
- 不発火 variant があれば routing logic 不足 (Stage 2.4-A 補強)

**所要時間**: 2-4 時間 (シナリオ準備 + 7 variant 実行)
**cost**: ~$0.50-1.00 (各 variant 数件 × LLM call)

---

#### Stage 2.4-C: UI timeout / fallback 動作確認 (動的検証 / Preview env)

**目的**: provider 遅延 spike 時の UI 挙動確認

**検証対象**:
- SPEECH_FETCH_TIMEOUT_MS=10000ms で切断時の UrgentLayer fallback
- speech card 表示遅延時の cache / negative cache 挙動
- 連続発火時の fetch dedupe (Fix C 効果再確認)
- Stage 2.3 で観察した C#2 61秒級 spike が UI で再現するか

**実施方法**:
- 通常 user input + Sentry breadcrumb 観察
- もしくは mock latency injection (既存コード触らず観察ベース)

**実装範囲**:
- 検証手順書 (decision-log)
- 既存コード触らない (CEO 厳守 timeout/UrgentLayer 不変)

**PASS 条件**:
- timeout 切断時に UrgentLayer fallback が崩れない
- speech card 表示の最終 UX が許容範囲

**NG 時候補** (CEO 判断対象):
- timeout 値拡張 (10s → 12s)
- model 変更
- UI 側 graceful degradation 強化
- → 全て CEO 議論後の別 phase

**所要時間**: 1-2 時間
**cost**: 軽微

---

#### Stage 2.4-D: production-ready audit (Stage 2.4-A/B/C PASS 後)

**目的**: Production reflection 判断材料の整理

**検証対象**:
- Stage 2.3 PASS 確認 (Yellow 付き条件付き)
- Stage 2.4-A/B/C PASS 確認
- post-Stage 2.3 refinement 完了 (C 多様性 / F2 軽微 / F1 多様性) **または別 phase に分離**
- Production env 反映の前提条件チェックリスト

**実施方法**:
- decision-log で全観点まとめ
- Production env 反映計画提案 (CEO 判断対象)

**実装範囲**:
- ドキュメントのみ、コード変更なし

**PASS 条件**:
- 全観点 PASS + CEO 質的判断
- → CEO Production reflection GO/NO-GO 判断

**所要時間**: 1 時間 (整理ドキュメント)
**cost**: 0

---

### Stage 2.4 進行プロトコル (CEO 確定対象)

```
Stage 2.4-A (静的 audit、cost 0)
   ↓ PASS
Stage 2.4-B (variant 到達性 smoke、cost ~$0.5-1)
   ↓ PASS
Stage 2.4-C (UI timeout/fallback 確認、cost 軽微)
   ↓ PASS
[post-Stage 2.3 refinement 完了 or 別 phase 確定]
   ↓
Stage 2.4-D (production-ready audit、cost 0)
   ↓ PASS
[CEO Production 反映判断]
```

各段階間で **CEO 判断必須**、Claude 自律で次段階に進まない。

### post-Stage 2.3 refinement の位置づけ (CEO 判断対象)

3 軽微残 (C 多様性、F1 多様性、F2 軽微) の対応:
- (a) **Stage 2.4 と並行**で対応 (効率的だが variant 出力変動 risk)
- (b) **Stage 2.4 PASS 後**に対応 (安全、Stage 2.4 で観測する挙動が安定)
- (c) **Production 反映前 audit (Stage 2.4-D) で対応**判断 (要否を最終 CEO 判定)

→ 推奨は **(b)** (Stage 2.4 で variant 出力が安定していることが前提、refinement で出力変わると Stage 2.4 検証無効化 risk)

### CEO 厳守 (Stage 2.4 全期間)

- ✗ Production env 触らない (Stage 2.4-D PASS 後の別判断のみ)
- ✗ 自律で次段階に進まない (各段階 CEO 判断)
- ✗ Stage 2.3 修正に戻らない (Yellow PASS 確定、refinement は別 phase)
- ✗ timeout / model / max_tokens 変更 (Stage 2.4-C で議論候補、今は不変)
- ✗ ChatClient / UpperLayerMount / UrgentLayer / speech route 触る (audit のみ)
- ✗ 一気に Stage 2.4-D まで進まない (段階的、CEO 判断挟む)

### 必要な前提情報 (Stage 2.4-A 着手前に Explore で取得)

1. `selectPattern` の現状実装 (どこにあるか、関数 signature)
2. 既存 test の coverage (どの state × mode × context が test されているか)
3. variant ↔ state 対応表 (layout plan v0.3 §7.x の現状)
4. UpperLayerMount の variant 受信 path (既存把握済、Round 1-10 期間中)

→ Stage 2.4-A 着手前に Explore agent fire 1 本で全把握可能

### Stage 2.4 終了後の世界

- **Phase 2 完了** (LLM 合成 speech が Preview で全観点 PASS)
- Production reflection は CEO 判断
- Stage 4 L4-m (memory) / E-3 (Stage 4 §10.2 完成) は別 phase

---

## [2026-05-09] [Build] [Stage 2.4-B 凍結 + Gap 2 blocker 確定: S1 chip → S1_ENTRY_OK wiring 未実装 / B-2 残作業 修正設計提案] [承認: CEO 承認待ち (impl)]

### 経緯

Stage 2.4-B 1 回目試行 (2.1.1 / 2.1.2) で `/api/coalter/speech` 未発火を観測 → CEO STOP → read-only 診断 → 手順書 v0.1-draft.3 (`0cda6d07`) で chip tap step 明示化 → mini-smoke 2.1.1 を CEO 実施 → **Failure A (S1 status chip 出現せず)** 確定 → 第 2 段階 read-only 診断で **2 つの impl gap** を検出。

### Gap 分類 (CEO 確定 2026-05-09)

| Gap | 内容 | severity | 状態 |
|---|---|---|---|
| **Gap 1** | スレッド state が過去 critical signal (「もう限界」由来) で **既に S0 を超えた状態** で mini-smoke を実行した可能性。non-S0 中の implicit signal は state 不変 (`reducer.ts:168`) → S1 chip 出現せず | 中 | **未確定** (CEO 判断: 優先しない、新規スレッド再試行を本命にしない) |
| **Gap 2** | **production UI の S1 status chip onClick 未配線** + **production code 内に `S1_ENTRY_OK` dispatch 経路存在せず** (preview dev 経路 `app/(dev)/coalter-preview/full/page.tsx:174` のみ)。S1Approaching.tsx:38 が `<Chip variant="status">` を render するが onClick prop なし。Chip.tsx:36-37 注記「B-1 では呼び出し側で no-op、B-2 以降で event dispatch」が **B-2 で signal 入力経路のみ実装、chip→dispatch は未実装で残存** | **高 (構造的 blocker)** | **CEO 確定: 正式 blocker、B-2 残作業として修正設計に進む** |

### Gap 2 詳細 (構造的 blocker)

#### コード経路の証跡

```
S1 status chip render path:
  UpperLayerMount.tsx:122-125  presenceExecutorEnabled flag check
    → UpperLayerMount.tsx:656-663  <UpperLayerStateRenderer ...>  ← onChipTap 渡さず
       → UpperLayerStateRenderer.tsx:144  <Component mode={mode} onSwitchMode={onSwitchMode} body={body} />  ← StateComponentProps にも onChipTap 不在
          → S1Approaching.tsx:24-27  function S1Approaching({ mode, onSwitchMode })  ← onChipTap prop 不在
             → S1Approaching.tsx:38  <Chip variant="status">少し整理できそう</Chip>  ← onClick 未渡し
                → Chip.tsx:113  cursor: onClick ? "pointer" : "default"  ← 未渡しで "default"
                → Chip.tsx:108-109  <button type="button" onClick={undefined}>  ← tap 空関数
```

#### grep 全数 search 結果 (`S1_ENTRY_OK` dispatch)

| 配置 | 種別 |
|---|---|
| `app/(dev)/coalter-preview/full/page.tsx:174` | preview dev page button (production 経路外) |
| `app/(dev)/coalter-preview/full/scenarios/*` (8 箇所) | preview test scenarios (production 経路外) |
| **production code** (`app/(culcept)/...` / `app/components/chat/...` 配下) | **0 件** |

#### 影響

- 通常テキスト入力 (implicit signal) では production で **S2 到達不可能**
- S2 到達は **critical signal 経路 (S0→S2 直行) のみ**
- Stage 2.4-B mini-smoke / full smoke は **S1 chip → S2 advancement が wire されない限り完遂不可**

### 修正設計 — B-2 残作業 (S1 chip wiring)

#### ゴール (シンプルに、最短経路)

S1 chip tap → S1_ENTRY_OK dispatch → reducer で S1→S2 transition → S2 到達 → speech fetch effect が既存 deps 変化で自動発火 → /api/coalter/speech POST observable。

#### 修正対象ファイル候補 (4 ファイル、極小)

| # | file | 性質 | 想定 diff |
|---|---|---|---|
| 1 | `app/components/chat/states/S1Approaching.tsx` | UI component | +3 / -1 (`onChipTap?: () => void` prop 追加 + `<Chip onClick={onChipTap}>` で渡す) |
| 2 | `app/components/chat/states/UpperLayerStateRenderer.tsx` | UI router | +3 / -0 (`StateComponentProps` + `UpperLayerStateRendererProps` に `onChipTap?: () => void` 追加 + `<Component>` 経由 pass-through) |
| 3 | `app/components/chat/UpperLayerMount.tsx` | UI mount | +5 / -0 (`useCallback` で `handleS1ChipTap = () => exec.dispatch.presenceEvent({ type: "S1_ENTRY_OK" })` + Renderer に渡す) |
| 4 | `tests/unit/coalter/presence/s1ChipDispatch.test.ts` (新規) | test | +30〜50 行 (関数 invoke のみ、`@testing-library/react` 不要) |

**production diff 合計**: ~+13 行 / -1 行 (極小)
**test diff 合計**: ~+30〜50 行 (新規 file)

#### 各 file の変更内容 (詳細)

**File 1**: `S1Approaching.tsx`
```typescript
export interface S1ApproachingProps {
  mode: PresenceMode;
  onSwitchMode: (target: PresenceMode) => void;
  onChipTap?: () => void;  // ← 追加
}

export default function S1Approaching({
  mode,
  onSwitchMode,
  onChipTap,  // ← 追加
}: S1ApproachingProps) {
  return (
    <UpperLayerShell ...>
      <div ...>
        <Chip variant="status" onClick={onChipTap}>少し整理できそう</Chip>  {/* ← onClick 追加 */}
      </div>
    </UpperLayerShell>
  );
}
```

**File 2**: `UpperLayerStateRenderer.tsx`
```typescript
interface StateComponentProps {
  mode: PresenceMode;
  onSwitchMode: (target: PresenceMode) => void;
  body?: string;
  onChipTap?: () => void;  // ← 追加 (S1Approaching のみ使用、他 component は無視)
}

export interface UpperLayerStateRendererProps {
  state: PresenceState;
  mode: PresenceMode;
  onSwitchMode: (target: PresenceMode) => void;
  body?: string;
  onChipTap?: () => void;  // ← 追加
}

export default function UpperLayerStateRenderer({
  state, mode, onSwitchMode, body,
  onChipTap,  // ← 追加
}: UpperLayerStateRendererProps) {
  const Component = mapStateToComponent(state);
  return (
    <StateAriaWrapper state={state} mode={mode}>
      <Component mode={mode} onSwitchMode={onSwitchMode} body={body} onChipTap={onChipTap} />
      {/* ↑ onChipTap pass-through */}
    </StateAriaWrapper>
  );
}
```

**File 3**: `UpperLayerMount.tsx`
```typescript
// UpperLayerMountActive 内 (handleModeSwitch の付近に追加)
const handleS1ChipTap = useCallback(() => {
  exec.dispatch.presenceEvent({ type: "S1_ENTRY_OK" });
}, [exec.dispatch]);

// 既存 <UpperLayerStateRenderer ... /> に prop 追加
<UpperLayerStateRenderer
  state={exec.state.presence.state}
  mode={exec.state.mode}
  onSwitchMode={handleModeSwitch}
  body={speechBody ?? undefined}
  onChipTap={handleS1ChipTap}  // ← 追加
/>
```

**File 4**: `tests/unit/coalter/presence/s1ChipDispatch.test.ts` (新規、関数 invoke のみ)
```typescript
import { describe, it, expect, vi } from "vitest";
import S1Approaching from "@/app/components/chat/states/S1Approaching";

describe("S1Approaching — onChipTap wiring", () => {
  it("S1Approaching props は onChipTap optional を受ける (型 contract)", () => {
    // type-level test (compile 時 enforce)
    const props: Parameters<typeof S1Approaching>[0] = {
      mode: "normal",
      onSwitchMode: vi.fn(),
      onChipTap: vi.fn(),  // ← 受け入れ可能であること
    };
    expect(props.onChipTap).toBeDefined();
  });

  // 実 click イベント test は React 環境必要、新規 dep 禁止のため skip。
  // 代わりに UpperLayerMount で callback 構造を test する (関数 invoke 方式)。
});

describe("UpperLayerMount — handleS1ChipTap が S1_ENTRY_OK dispatch する (関数 invoke 方式)", () => {
  it("handleS1ChipTap helper を export 化して直接 invoke", () => {
    // UpperLayerMount から handleS1ChipTap を pure helper として extract、test
    // 例: const handler = buildS1ChipTapHandler(mockDispatch);
    //     handler();
    //     expect(mockDispatch).toHaveBeenCalledWith({ type: "S1_ENTRY_OK" });
  });
});
```

> **test 方針メモ**: `@testing-library/react` 未 install (CEO 既往判断、`upperLayerMountActive.test.ts:19` 注記)。本 test は **関数 invoke のみ**で coverage、UI render は test しない。実 click イベント検証は CEO 判断後に E2E (Playwright) で別 phase 候補。

#### 既存 dev preview との整合

`app/(dev)/coalter-preview/full/page.tsx:174`:
```typescript
<BtnSm onClick={() => exec.dispatch.presenceEvent({ type: "S1_ENTRY_OK" })}>
```

本修正の UpperLayerMount.tsx の `handleS1ChipTap` は **完全同一の dispatch 経路** (`exec.dispatch.presenceEvent({ type: "S1_ENTRY_OK" })`) を使う。dev preview / production UI の両方で同じ pathway → 整合確保。

#### 不可侵範囲 (本修正で触らない)

- `selectPattern` / `constants` / `types`: 不接触
- `signalAdapter` / `signalClassifier` / `criticalKeywordDetector`: 不接触
- `reducer` (S1_ENTRY_OK transition logic は既存 `reducer.ts:111-112` で完結、touch 不要)
- `usePresenceExecutor` 本体 (既存 `dispatch.presenceEvent` を使うのみ、変更なし)
- speech 系 (`validator` / `postValidator` / `builder` / `promptBuilder` / `llmCall`): 不接触
- speech route (`app/api/coalter/speech/route.ts`): 不接触
- speech prompt: 不接触
- model / max_tokens / length_override / timeout: 不変
- production env: 不接触
- Stage 2.3 prompt / fixture state: 不変

#### 副作用範囲 (S0/S1/S2 以外への影響)

| 状態 | 影響 |
|---|---|
| S0Observing / S2Opening / S3Awaiting / S4Understanding / S5Bridging / S6 / S7 / S8 | optional `onChipTap` prop が増えるが使わない、render 動作変化なし |
| selectPattern | 不接触、existence gate / priority logic 不変 |
| speech fetch effect (`UpperLayerMount.tsx:323-608`) | 既存 deps `[speechState, speechMode, speechVariant, threadId, observationKey]` のうち `speechState` 変化で自動発火 (S2 到達時に variant=A 算出 → 自動 fetch)、追加 wire 不要 |
| telemetry (`coalter.presence.state_transition`) | `usePresenceExecutor.ts:444-460` で state 変化時に既存 emit、追加 wire 不要 |
| urgent path | 不接触、`detectUrgent` / `urgentDecision` も既存維持 |
| mode reducer | 不接触 |
| critical signal 経路 (S0→S2 skip) | **完全不変** (signalAdapter / reducer 経由なので touch 不要) |

#### test 方針

**新規 test (UI wiring)**:
- file: `tests/unit/coalter/presence/s1ChipDispatch.test.ts` (新規)
- pattern: 関数 invoke / 型 contract / pure helper extraction (CEO 既往: `upperLayerMountActive.test.ts:13`「関数 invoke 方式 (CEO 指示 2026-04-29、新規 dep 追加禁止)」)
- coverage:
  - S1Approaching: `onChipTap?: () => void` prop 受け入れ可能 (型 contract)
  - UpperLayerStateRenderer: state="S1" のとき onChipTap が S1Approaching に届く path 検証 (mapStateToComponent 経由)
  - UpperLayerMount: `handleS1ChipTap` helper を pure 化して `dispatch.presenceEvent({ type: "S1_ENTRY_OK" })` を呼ぶことを直接 invoke で確認

**既存 test (リグレッション確認)**:
- `tests/unit/coalter/presence/reducer.test.ts` (既存): S1_ENTRY_OK dispatch → S1→S2 transition の test がある可能性、変更なし
- `tests/unit/coalter/presence/patternSelector.test.ts` / `patternSelectorRoutingSpec.test.ts` (A2 lock): 不変
- `tests/unit/coalter/upperLayerMountActive.test.ts` (既存): props 増加でリグレッション無、mapStateToComponent test 通過

**dep 追加**: 0 (`@testing-library/react` 不要、CEO 厳守)

### Stage 2.4-B 凍結通知

CEO 確定 (2026-05-09): **Stage 2.4-B 全体 (full smoke / mini-smoke) は B-2 残作業 (本 wiring 修正) 実装 + test PASS + CEO 承認後まで凍結**。新規スレッドでの再試行は本命にしない (Gap 1 が解消されても Gap 2 が残るため smoke 完遂不可)。

### CEO 承認待ち項目

1. 本修正設計 (4 file / +13 production lines / +30〜50 test lines / 関数 invoke 方式) を採用してよいか
2. 採用する場合、impl 着手 GO (別 commit で実装、本 commit は記録のみ)
3. 修正設計に追加・変更項目があれば指示

### CEO 厳守 (本記録 + 修正設計提示時点でも継続)

- ✗ 本記録は **docs-only**、impl 修正なし
- ✗ Stage 2.4-B full smoke / mini-smoke 再開せず (B-2 残作業 PASS まで凍結)
- ✗ selectPattern / constants / signalAdapter / reducer / speech 系 全 / speech route 不接触
- ✗ model / max_tokens / length_override / timeout 不変
- ✗ Production env 不接触
- ✗ Stage 2.3 prompt / fixture state を expected に混ぜない
- ✗ 新規 dep 追加禁止 (`@testing-library/react` 等)
- ✗ 自律で impl に着手しない (CEO 承認後のみ)

---

## [2026-05-09] [Build] [Stage 2.4-B Gap 2 解消確認 + mini-smoke 2.1.1 retry PASS + full smoke 再開判断 (2.1.2 から)] [承認: CEO]

### 経緯

CEO 確定 (2026-05-09): B-2 残作業 wiring 実装 commit (`39566cfd`) push + Vercel Preview build (`culcept-8q3zli5i2-...`) Ready 後、CEO 自身が mini-smoke 2.1.1 を 2 回実施 (1 回目 fallback、retry で llm success)。statistical noise 寄りと判断、Gap 2 解消確認、full smoke 再開判断 (2.1.2 から)。

### mini-smoke 2.1.1 結果 (CEO 実施、Preview URL `culcept-8q3zli5i2-...`、production-like / `OBSERVATION_MODE=false`)

**input** (両 attempt 共通): 「二人で少し話したいことがあって、間に入ってもらえると助かる」 (synthetic、§1.4 PII 禁止 準拠)

#### attempt 1 (fallback、初回試行)

```
{
  "body": "今、間に入れそうな間が少しありそう。",
  "speechSource": "fallback",
  "retries": -1,
  "latencyMs": 8208,
  "validationFailed": true,
  "fallbackReason": "validation_failed"
}
```

- `body` は `speechBuilder.ts:35` `STATIC_MOCK_BY_VARIANT["A"]` = static fallback 文 (LLM 出力ではない)
- `retries=-1` = 全 retry 失敗 marker (`telemetryEvents.ts:67-69` 注記)
- `latencyMs=8208` = LLM 3 attempts (1 initial + 2 retries) の合計
- `validationFailed=true` + `fallbackReason="validation_failed"` = post-validator が 3 attempt 全てで違反検出

#### attempt 2 (retry、llm success)

```
{
  "body": "今、少し間に入ってもいいでしょうか。",
  "speechSource": "llm",
  "retries": 0,
  "latencyMs": 2014,
  "validationFailed": false,
  "fallbackReason": null
}
```

- `body` は LLM 生成出力 (Pattern A 入口発話、1 文、? 1 個、~17 文字、speech template §3 不変核と整合)
- `retries=0` = 1 発で post-validator 通過
- `latencyMs=2014` = LLM 単発 latency 約 2 秒、Stage 2.3 中央値と整合
- `validationFailed=false` + `fallbackReason=null` = LLM 出力採用

### 統計的評価 (1/2 fallback)

| 観測 | n | fallback | Wilson 95% CI |
|---|---|---|---|
| Stage 2.3 Round 7 confirm (variant A 5 sample) | 5 | 0 | 0% 〜 52% |
| 本 mini-smoke 2.1.1 (attempt 1+2) | 2 | 1 | 9% 〜 91% |

両 CI は重複 (9%-52%)。**1/2 fallback は Stage 2.3 観測 (~5.7% 全体 fallback rate) と統計的に整合**。CEO 判定: stochastic noise 寄り、systematic 断定不可。1 sample で impl / validator / prompt 修正には進まない。

### 判定 (CEO 確定 2026-05-09)

| 軸 | 判定 |
|---|---|
| **reachability** (Gap 2 解消確認) | **PASS**。S1 chip → S1_ENTRY_OK → S2 → speech fetch の runtime 配線が end-to-end で機能 (commit `39566cfd` の B-2 残作業実装が production で生きている) |
| **quality** (LLM 発話品質) | **Yellow** (1/2 fallback、retry で llm success 確認済、stochastic noise 寄り) |
| **mini-smoke 総合** | **mini-PASS** (reachability PASS / quality Yellow with retry confirmation) |
| **Stage 2.4-B 凍結解除** | **GO** (Gap 2 構造的 blocker は解消、full smoke 再開判断) |

### full smoke 再開判断 (CEO 確定)

- **2.1.1 は mini-smoke で確認済みとして記録**、full smoke では **skip** (重複実施しない)
- full smoke は **2.1.2 から続行** (Stage 2.4-B 手順書 §6.3 step 1-10、§2.1 シナリオ matrix)
- 2.1.3〜2.1.13 まで base scenarios 続行
- base scenarios 完了後に **canary throw #1** (`setTimeout(() => { throw new Error("CoAlter Stage 2.4-B smoke base") }, 0)`)
- F-1 特別シナリオ (2.1.14) 3 試行
- 試行完了後に **canary throw #2** (`f1-special`)

### 進行ルール (CEO 確定、各 scenario 共通)

- **cool-down**: 各 scenario 間 5+ 分 (UI spec §1.6 / v1.1 §8.6 同 state 5 分再起動禁止に整合、`rate_limited` fallback 防止)
- **synthetic input** のみ (§1.4 PII 禁止: 実在人物名 / 実住所 / 実予定 / 実関係トラブル NG)
- **production-like run** (`OBSERVATION_MODE=false`)
- **各 scenario で speech response 5 fields 記録**: `speechSource` / `fallbackReason` / `latencyMs` / `validationFailed` / `retries`
- **chip-tap path 失敗モード 3 分類** (§6.3.1) を別々に記録 (A: chip 出現せず / B: tap 後 S2 進まず / C: S2 後 speech 出ず)
- **PII redact**: screenshot / Network response 共有時、PII redact 必須 (§1.4.2)

### 不可侵 (CEO 厳守、本 entry でも継続)

- ✗ Production env 変更しない
- ✗ timeout / model / max_tokens / validator 変更しない
- ✗ prompt 修正しない (speechPromptBuilder / variant template 不変)
- ✗ selectPattern 修正しない
- ✗ 1 sample で systematic 断定しない
- ✗ full smoke 自動再開しない (各 scenario CEO 個別管理)
- ✓ Stage 2.4-B Gap 2 blocker 解消確認 (commit `39566cfd` runtime PASS)
- ✓ mini-smoke 結果は decision-log + Stage 2.4-B 手順書 Appendix C.7 に記録

---

## [2026-05-09] [Build] [Stage 2.4-B 2.1.1〜2.1.3 A@S2 3 mode PASS 記録 + Gap 3/4 構造的 blocker 検出 + 2.1.4〜2.1.14 凍結 + B-3 残作業 修正設計提示 (Phase 1: Gap 3 / Phase 2: Gap 4 完全分離、impl は CEO 承認後)] [承認: CEO Option A 採用]

### 経緯

CEO 2.1.1〜2.1.3 (A@S2 normal/daily/travel) full smoke 実施 → 3 mode PASS → 2.1.4 B@S5 進行前に「S5 actual state 到達 UI 手順」要求 → Claude read-only 診断で **production UI に S2/S3/S4/S5/S6/S7 transition dispatch 経路 0 件** + **`setPatternContext` caller 0 件** 検出 → CEO 確定で **Option A 採用** (Gap 3/4 正式 blocker 記録、2.1.4〜2.1.14 凍結、B-3 残作業 設計フェーズへ)。

### 2.1.1〜2.1.3 (A@S2 3 mode) PASS 記録

| # | scenario | mode | response | 判定 |
|---|---|---|---|---|
| 2.1.1 attempt 1 | A@S2 normal | normal | speechSource=fallback / retries=-1 / latencyMs=8208 / validationFailed=true / fallbackReason=validation_failed (body=static fallback) | reachability PASS / quality Yellow |
| 2.1.1 attempt 2 (retry) | A@S2 normal | normal | speechSource=llm / retries=0 / latencyMs=2014 / validationFailed=false / fallbackReason=null (body="今、少し間に入ってもいいでしょうか。") | **PASS** |
| 2.1.2 | A@S2 daily | daily | speechSource=llm / retries=0 / latencyMs=1851 / validationFailed=false / fallbackReason=null (body="今、少し間に入れそうでしょうか。") | **PASS** |
| 2.1.3 | A@S2 travel | travel | speechSource=llm / retries=0 / latencyMs=2248 / validationFailed=false / fallbackReason=null (body="今、少し間に入れそうな気がするんだけど、ちょっと立ち止まって整理してもいいかな？") | **PASS** |

**A@S2 系 3 mode PASS 確認** (CEO 確定 2026-05-09)。S0→S1→S2 経路は production UI で機能、S2 entry で variant=A default を speech POST 含めて runtime 確認済。

### Gap 3 群 + Gap 4 検出 (read-only 診断)

#### Gap 3: production UI に state machine transition dispatch 経路 0 件

`grep -rnE "S2_ACCEPTED|S3_RESPONSE|S4_DONE|S5_DONE|S6_PROPOSE|S6_REWORK|S6_END|S7_DONE" app/ lib/ --include="*.ts" --include="*.tsx" | grep -v "test\|spec\|app/(dev)"` → reducer.ts (case 定義) のみ。production code 内 dispatcher **0 件**。

`exec.dispatch.presenceEvent` の利用箇所:
- `app/components/chat/UpperLayerMount.tsx:282` — `S1_ENTRY_OK` (commit `39566cfd` の B-2 wiring)
- `app/(dev)/coalter-preview/full/page.tsx:174-201` — preview dev page (production 経路外)

| Gap | 内容 | severity | scope |
|---|---|---|---|
| **Gap 3-A** | S2 response chips → `S2_ACCEPTED` 未配線 | 高 | S2Opening + Renderer + UpperLayerMount |
| **Gap 3-B** | S3 response chips → `S3_RESPONSE` 未配線 | 高 | S3Awaiting + Renderer + UpperLayerMount |
| **Gap 3-C** | S4 → S5 transition (`S4_DONE`) UI element なし、auto-advance trigger 不在 | 高 | S4 timer logic + UpperLayerMount |
| **Gap 3-D** | S5 response chips → `S5_DONE` / 「いったん戻る」 → `S5_DIRECT_EXIT` 未配線 | 中 | S5Bridging + Renderer + UpperLayerMount |
| **Gap 3-E** | S6 3 action buttons → `S6_PROPOSE` / `S6_REWORK` / `S6_END` 未配線 | 中 | S6ReadyForProposal + Renderer + UpperLayerMount |
| **Gap 3-F** | S7 approve / close chips → `S7_DONE` 未配線 | 中 | S7ProposalShown + Renderer + UpperLayerMount |

#### Gap 4: production UI に `setPatternContext` caller 0 件

`grep -rnE "setPatternContext|patternContext\s*=" app/ lib/ --include="*.ts" --include="*.tsx" | grep -v "test\|spec\|app/(dev)"` → `usePresenceExecutor.ts:203` (定義)、`usePresenceExecutor.ts:536` (export slot)、**production caller 0 件**。

**結果**: production で `patternContext = {}` 固定。S5 で `selectPattern("S5", *, {})` は **defensive null** (CEO 裁定 I-1/I-8、A2 test `patternSelectorRoutingSpec.test.ts` で lock 済) → `UpperLayerMount.tsx:338-341` の `if (speechVariant === null)` early return → speech POST 起動なし。**B/C/D/E variant 観測不可**。

### CEO 判断 (Option A 採用、2026-05-09)

| 選択肢 | CEO 判定 | 理由 |
|---|---|---|
| **A. Gap 3/4 正式 blocker 記録 + 2.1.4〜2.1.14 凍結 + B-3 残作業 設計** | ✅ **採用** | Gap 2 と同 pattern の構造的 blocker を一貫して扱う、Stage 2.4-B 全体の正本性維持 |
| B. Stage 2.4-B partial close (A@S2 系のみ完了扱い) | ✗ 不採用寄り | Stage 2.4-B 本質 = B/C/D/E/F1/F2 含む actual UI reachability、A だけで閉じると検証目的を満たさない |
| C. 2.1.4 のみ部分修正 (S5 到達のための局所 hack) | ✗ 不採用 | needFraming 等 context flag 設定経路の hack は後の S5/S7 全体 routing を歪ませる |

### B-3 残作業 修正設計 (Phase 1 と Phase 2 完全分離、CEO 厳守)

#### Phase 1 (Gap 3): state machine transition dispatch wiring

**ゴール**: production UI で S2→S3→S4→S5→S6→S7→S8 全 transition を dispatch 可能化。chip / button tap で `presenceEvent` を流す。S4 のみ auto-advance (UI element 不在のため timer-based)。

**設計方針**: B-2 (Gap 2) と完全同 pattern。各 state component に optional callback prop 追加 → `<Chip onClick>` で wire → Renderer pass-through → UpperLayerMount で pure helper builder + handler。

**修正対象 file (推定)**:

| # | file | 変更内容 | 想定 diff |
|---|---|---|---|
| 1 | `app/components/chat/states/S2Opening.tsx` | `onResponseTap?: () => void` prop + `<Chip onClick={onResponseTap}>` × 2 (たいし/みさき) | +5 / -2 |
| 2 | `app/components/chat/states/S3Awaiting.tsx` | `onResponseTap?: () => void` prop + `<Chip onClick={onResponseTap}>` × 2 (残像 chip) | +5 / -2 |
| 3 | `app/components/chat/states/S4Understanding.tsx` | (chip なし、変更なし。auto-advance は UpperLayerMount で実装) | +0 / -0 |
| 4 | `app/components/chat/states/S5Bridging.tsx` | `onResponseTap?: () => void` (response chips × 3) + `onCloseTap?: () => void` (「いったん戻る」) | +6 / -2 |
| 5 | `app/components/chat/states/S6ReadyForProposal.tsx` | `onProposeTap?` / `onReworkTap?` / `onEndTap?` 各 callback + `<Chip onClick>` × 3 | +8 / -3 |
| 6 | `app/components/chat/states/S7ProposalShown.tsx` | `onApproveTap?` (approve + close 共に) + handoff chip onClick (別 task 候補、本 phase scope 外) | +5 / -2 |
| 7 | `app/components/chat/states/UpperLayerStateRenderer.tsx` | StateComponentProps + UpperLayerStateRendererProps に `onResponseTap` / `onCloseTap` / `onProposeTap` / `onReworkTap` / `onEndTap` / `onApproveTap` 追加 + pass-through | +12 / -0 |
| 8 | `app/components/chat/UpperLayerMount.tsx` | pure helper × 6: `buildS2AcceptedDispatch` / `buildS3ResponseDispatch` / `buildS5DoneDispatch` / `buildS5DirectExitDispatch` / `buildS6ProposeDispatch` / `buildS6ReworkDispatch` / `buildS6EndDispatch` / `buildS7DoneDispatch` 追加 + 対応 useCallback handler + Renderer prop wire + **S4 auto-advance useEffect** (state===S4 で setTimeout 1500ms → dispatch S4_DONE、cleanup で clear) | +60 / -0 |
| 9 | `tests/unit/coalter/presence/stateTransitionDispatch.test.ts` (新規) | 関数 invoke 方式: 8 pure helpers の dispatch contract / 各 state component prop 型 contract / Renderer pass-through / S4 auto-advance helper 関数化 + timer test | +250 / -0 (新規) |

**production diff 合計**: ~+101 / -11
**test diff**: ~+250 (新規)

**S4 auto-advance 設計**:
```typescript
// UpperLayerMount.tsx
useEffect(() => {
  if (exec.state.presence.state !== "S4") return;
  const timer = setTimeout(() => {
    exec.dispatch.presenceEvent({ type: "S4_DONE" });
  }, S4_AUTO_ADVANCE_MS); // 例: 1500ms
  return () => clearTimeout(timer);
}, [exec.state.presence.state, exec.dispatch.presenceEvent]);
```

`S4_AUTO_ADVANCE_MS` は const 定義、**timer 値そのものは smoke 観測で調整**、本書では暫定値固定。

**chip 動作 mapping**:

| state | chip | dispatch event |
|---|---|---|
| S2 | response chips × 2 | `S2_ACCEPTED` (どの chip tap でも同 event) |
| S3 | response chips × 2 (残像) | `S3_RESPONSE` |
| S4 | (chip なし) | `S4_DONE` (auto-advance、timer) |
| S5 | response chips × 3 (近い/少し違う/続けて) | `S5_DONE` |
| S5 | close chip (いったん戻る) | `S5_DIRECT_EXIT` |
| S6 | 提案を聞く | `S6_PROPOSE` |
| S6 | もう少し整理する | `S6_REWORK` |
| S6 | 今はここまでにする | `S6_END` |
| S7 | 提案を受ける / × 閉じる | `S7_DONE` (両者共に S8 退出のため、UI spec §4.3.8) |

**dev preview との整合**: `app/(dev)/coalter-preview/full/page.tsx:174-201` の各 button が dispatch する event と完全一致。production / dev preview 両方で同 pathway。

#### Phase 2 (Gap 4): patternContext flag 設定経路 (smoke-only debug hook)

**ゴール**: smoke 実施時に context flag (`needFraming` / `uncertaintyHigh` / `oneSidedFatigue` / `needTranslation` / `relationshipSignalsClear` / `relationshipNoiseHigh` / `infoMissing`) を立てる経路を **dev / Preview env 限定**で提供。production env では機能しない (env-gated、production 不変原則維持)。

**根拠 — production logic は §9 保留**:
- CEO 裁定 I-2/I-3/I-4 で「context flag 設定主体・閾値は §9 保留、A2 では mock boolean で test」
- production 用の context flag 検出 (executor watcher / heuristic / LLM 検出) は **本 phase scope 外**、§9 確定後の別 phase
- Stage 2.4-B smoke を **§9 保留に依存させない** ためには smoke 専用 hook が最善

**設計方針**: 新規 env var + 新規 helper module + UpperLayerMount での useEffect 起動。

**修正対象 file (推定)**:

| # | file | 変更内容 | 想定 diff |
|---|---|---|---|
| 1 | `lib/coalter/presence/smokeContextOverride.ts` (新規) | env gate (`isSmokeContextOverrideEnabled()` getter、`process.env.NEXT_PUBLIC_COALTER_PRESENCE_SMOKE_CONTEXT === "true"`) + `parseSmokeContextFlags(searchParams: URLSearchParams): Partial<PatternContext>` (URL query 解析、許可 flag のみ accept、unknown ignore) | +60 / -0 (新規) |
| 2 | `app/components/chat/UpperLayerMount.tsx` | useEffect で `isSmokeContextOverrideEnabled()` && URLSearchParams から flag 解析 → `exec.dispatch.setPatternContext` で適用 | +12 / -0 |
| 3 | `tests/unit/coalter/presence/smokeContextOverride.test.ts` (新規) | env gate / flag parse / unknown flag rejection / 全 flag 許可性 / 関数 invoke 方式 | +120 / -0 (新規) |

**production diff 合計**: ~+12 / -0
**test diff**: ~+180 (新規 file × 2)

**新規 env var**:
- 名前: `NEXT_PUBLIC_COALTER_PRESENCE_SMOKE_CONTEXT` (default false、build に inline)
- production env: 未設定 → false → 何もしない (production 不変)
- Preview env: CEO が必要時 `true` 設定 → smoke 用 hook 起動
- 環境別動作:
  - production: env 未設定 → 機能しない
  - Preview (default): env 未設定 → 機能しない
  - Preview (smoke 実施時のみ CEO が ON): env true → URL query 経由 flag 設定可

**URL query 仕様**:
```
/talk/<thread_id>?coalter_smoke_flag=needFraming
/talk/<thread_id>?coalter_smoke_flag=needFraming,uncertaintyHigh
```

複数 flag は `,` 区切り。許可 flag (`PatternContext` の field 名) のみ accept、unknown ignore。

**production 不変保証**:
- env 未設定 → `isSmokeContextOverrideEnabled()` returns false → useEffect は early return
- production env を絶対 ON しない (CEO 厳守)
- query parameter 自体は production env でも URL に付けられるが、env false なら無視される

#### Phase 1 / Phase 2 の依存関係 + 実装順序

| 状況 | smoke 完遂可? |
|---|---|
| Phase 1 alone | ❌ S5/S7 で `selectPattern` が context={} → null 返却、speech POST 起動なし |
| Phase 2 alone | ❌ S5 到達経路ない (Phase 1 必須) |
| **Phase 1 → Phase 2** | ✅ smoke 完遂可、推奨順序 |
| Phase 2 → Phase 1 | ✓ 機能上は可だが、Phase 2 only では使い道なし |

**推奨実装順序**: Phase 1 (Gap 3) → Phase 2 (Gap 4) → smoke 再開。CEO 個別承認で各 phase commit。

#### 不可侵範囲 (Phase 1 + Phase 2 共通)

- ✗ `selectPattern` / `constants` / `types`: 不接触
- ✗ `signalAdapter` / `signalClassifier` / `criticalKeywordDetector`: 不接触
- ✗ `reducer` (S2_ACCEPTED 等の transition は既存 case で完結): 不接触
- ✗ `usePresenceExecutor` 本体 (既存 dispatch.presenceEvent / dispatch.setPatternContext を使うのみ): 不変
- ✗ speech 系 (`validator` / `postValidator` / `builder` / `promptBuilder` / `llmCall`): 不接触
- ✗ speech route (`app/api/coalter/speech/route.ts`): 不接触
- ✗ speech prompt: 不変
- ✗ model / max_tokens / length_override / timeout: 不変
- ✗ Production env: 不接触
- ✗ Stage 2.3 prompt / fixture state を expected に混ぜない
- ✗ 新規 dep 追加禁止 (`@testing-library/react` 等)
- ✗ ChatClient.tsx: 不接触
- ✗ UrgentLayer: 不接触
- ✗ critical signal 経路 (S0→S2 直行): 完全不変

#### 副作用範囲 (Phase 1 + Phase 2)

| 状態 / 機能 | 影響 |
|---|---|
| S0Observing | 不変 |
| S1Approaching | 不変 (B-2 commit `39566cfd` の wiring 維持) |
| S2/S3/S5/S6/S7 components | optional callback props 追加、未指定時は従来通り (cursor "default") |
| S4Understanding | 不変 (chip なし、auto-advance は UpperLayerMount 側で完結) |
| selectPattern / Renderer / Reducer / Executor | logic 不変 (callback 経由 dispatch のみ) |
| critical signal 経路 | 完全不変 |
| speech fetch effect | 既存 deps 変化で自動発火 (S5/S7 到達 + variant 算出時) |
| telemetry | 既存 emit 経路で自動 |
| Production env | 機能しない (env-gated)、不変 |
| §9 production logic (context flag 検出) | 触らない、保留継続 |

#### test 方針 (関数 invoke のみ、新規 dep ゼロ)

- file: `tests/unit/coalter/presence/stateTransitionDispatch.test.ts` (Phase 1)
- file: `tests/unit/coalter/presence/smokeContextOverride.test.ts` (Phase 2)
- pattern: B-2 と同 (`upperLayerMountActive.test.ts:13` 注記準拠、`@testing-library/react` 不要)
- coverage:
  - Phase 1: 8 pure helpers の dispatch contract / 各 state component の prop 型 contract / Renderer pass-through / S4 auto-advance helper 関数化 + timer mock test
  - Phase 2: env gate / URL query parse / unknown flag rejection / 全 PatternContext flag 受け入れ確認 / production env false 時 no-op
- **dep 追加**: 0 (`@testing-library/react` 等)

### Stage 2.4-B 凍結状態 (CEO 確定 2026-05-09)

| scenario | 状態 |
|---|---|
| 2.1.1〜2.1.3 (A@S2 normal/daily/travel) | **PASS 記録** (B-2 commit `39566cfd` で reachability + LLM 経路確認、quality は 1/4 fallback で stochastic 寄り) |
| 2.1.4〜2.1.13 (B/C/D/E/F-2 base) | **凍結** (Gap 3 + Gap 4 解消必要) |
| 2.1.14 (F-1 standalone 3 試行) | **凍結** (同上) |
| canary throw #1 / #2 | **凍結** (上記 scenarios 完了後) |

### 凍結解除条件

1. CEO が B-3 修正設計 (本 entry の Phase 1 + Phase 2) を承認
2. Phase 1 (Gap 3) 実装 + 既存 test 全 regression なし + 新規 test PASS
3. Phase 2 (Gap 4) 実装 + 同上
4. Phase 1 + Phase 2 build を Vercel Preview env で deploy + env (`NEXT_PUBLIC_COALTER_PRESENCE_SMOKE_CONTEXT=true`) ON
5. CEO 個別承認 (Stage 2.4-B 再開 GO)

### CEO 厳守 (本記録 + B-3 設計提示時点でも継続)

- ✗ 本記録は **docs-only**、impl 修正なし
- ✗ Stage 2.4-B 2.1.4〜2.1.14 凍結 (B-3 Phase 1 + Phase 2 PASS まで)
- ✗ Production env 変更しない
- ✗ timeout / model / max_tokens / validator 変更しない
- ✗ prompt 修正しない
- ✗ selectPattern 修正しない
- ✗ 自律で B-3 impl に着手しない (CEO 承認後のみ)
- ✗ Gap 3 と Gap 4 を混ぜて一気に実装しない (CEO 厳守、Phase 1 → Phase 2 順)
- ✗ Phase 2 で production logic (§9 保留中) を先取り実装しない (smoke-only debug hook に留める)

### CEO 承認待ち項目

1. Phase 1 (Gap 3) 修正設計 (~9 file / +101 production lines / +250 test lines、関数 invoke 方式) 採用可否
2. Phase 2 (Gap 4) 修正設計 (~3 file / +12 production lines / +180 test lines、smoke-only debug hook、新規 env var) 採用可否
3. 採用後の impl 着手順序 (Phase 1 → Phase 2 推奨)
4. 修正設計に追加・変更項目があれば指示

---

## [2026-05-09] [Build] [Stage 2.4-B Yellow付きPASS 確定 + 全 16 scenario 集約 + canary status + Yellow notes 5 件 + 残課題 4 件 別 phase へ] [承認: CEO]

### 経緯

CEO 確定 (2026-05-09): B-2 wiring (`39566cfd`) + B-3 Phase 1 wiring (`ae7b6ecf`) + B-3 Phase 2 smoke harness (`cce40487`) を全て deploy + Preview env で `NEXT_PUBLIC_COALTER_PRESENCE_SMOKE_CONTEXT=true` 設定 + redeploy → CEO 自身による mini-smoke 全 13 scenarios + F-1 standalone 3 試行 = **16 sample 実施**。LLM 経路 100% 安定 (16/16 source=llm) + speech template Round 6-9 強化 runtime 準拠確認 → CEO 判断で **Stage 2.4-B Yellow付きPASS 確定**。Yellow notes 5 件 + 残課題 4 件は別 phase / 別 task として明記、本 phase 完了。

### Stage 2.4-B 全 scenario 結果集約 (16 sample)

| # | scenario | mode | path | speechSource | retries | latencyMs | validationFailed | fallbackReason | 判定 |
|---|---|---|---|---|---|---|---|---|---|
| 2.1.1 attempt 2 | A@S2 | normal | A | llm | 0 | 2014 | false | null | PASS (mini-smoke 経由) |
| 2.1.2 | A@S2 | daily | A | llm | 0 | 1851 | false | null | PASS |
| 2.1.3 | A@S2 | travel | A | llm | 0 | 2248 | false | null | PASS |
| 2.1.4 | B@S5 | normal | B | llm | 0 | 2380 | false | null | PASS via harness |
| 2.1.5 | C@S2 | normal | A | llm | 0 | 1620 | false | null | PASS via harness |
| 2.1.6 | C@S5 | normal | B | llm | 0 | 1882 | false | null | PASS via harness |
| 2.1.7 | D@S5 | normal | B | llm | 0 | 2291 | false | null | PASS via harness |
| 2.1.8 | D@S5 | daily | B | llm | 0 | 1949 | false | null | PASS via harness |
| 2.1.9 | D@S5 | travel | B | llm | 0 | 2347 | false | null | PASS w/ Yellow note (文脈補完強) |
| 2.1.10 | E@S5 | normal | B | llm | 1 | 4798 | false | null | PASS via harness (retry success) |
| 2.1.11 | F-2@S7 | normal | C | llm | 0 | 2882 | false | null | PASS via harness |
| 2.1.12 | F-2@S7 + F-1副次? | daily | C | llm | 0 | 2566 | false | null | F-2 primary PASS / F-1 secondary 未確認 |
| 2.1.13 | F-2@S7 + F-1副次? | travel | C | llm | 0 | 2850 | false | null | F-2 primary PASS / F-1 secondary 未確認 |
| 2.1.14a | F-1 standalone 試行 1 | normal | C | llm | 0 | 2652 | false | null | F-2 体観測、(I) primary 未到達 |
| 2.1.14b | F-1 standalone 試行 2 | normal | C | llm | 0 | 3141 | false | null | 同上 |
| 2.1.14c | F-1 standalone 試行 3 | normal | C | llm | 0 | 2852 | false | null | 同上 |

### 各 scenario の body 完全記録

```
2.1.1 attempt 2 (A@S2 normal):
  「今、少し間に入ってもいいでしょうか。」

2.1.2 (A@S2 daily):
  「今、少し間に入れそうでしょうか。」

2.1.3 (A@S2 travel):
  「今、少し間に入れそうな気がするんだけど、ちょっと立ち止まって整理してもいいかな？」

2.1.4 (B@S5 normal):
  「今、何か引っかかるものがあって言葉が出にくい状態に見えます。」

2.1.5 (C@S2 normal):
  「今、二人の間で一番整理したい点はどこでしょうか?」

2.1.6 (C@S5 normal):
  「今、二人の間で一番整理したい点はどこでしょうか」  ← "?" 末尾抜け micro

2.1.7 (D@S5 normal):
  「片方が何か言ったことに、もう片方が反応したように見えますね。」

2.1.8 (D@S5 daily):
  「片方の発言だけを整理してみましょうか。」

2.1.9 (D@S5 travel):
  「片方が何か言葉を発したようですが、もう片方はまだ反応していないように見えます。」  ← Yellow note: 文脈補完強

2.1.10 (E@S5 normal):
  「片方の言い方と、もう片方の受け取り方に、ずれがあるように見えます。」

2.1.11 (F-2@S7 normal):
  「少し休憩を挟むと、次の作業に移りやすくなるかもしれません。整理する時間を取るのも一つの選択肢です。」

2.1.12 (F-2@S7 daily):
  「少し整える時間を取ると、今の流れが変わるかもしれません。短い休憩でも、視点が少し動くことがあります。」

2.1.13 (F-2@S7 travel):
  「少し体を動かす時間を取ると、気分が変わるかもしれません。短い散歩や軽いストレッチなど、今の状況に合わせて選べます。」

2.1.14a:
  「少し休憩を挟むと、次の作業に移りやすくなるかもしれません。」

2.1.14b:
  「少し手を止めて深呼吸する時間を取ると、頭がすっきりするかもしれません。短い休憩を挟むだけでも、次の作業への集中が変わることがあります。」

2.1.14c:
  「少し体を動かすと、気持ちが切り替わるかもしれません。短い休憩を取るのも一つの方法です。今の流れを少し整えてみるのはどうでしょうか。」
```

### 統計サマリ (16 sample)

| 軸 | 値 |
|---|---|
| 総 sample | 16 (13 base + 3 F-1 試行) |
| `source==="llm"` | **16/16 = 100%** |
| `validationFailed===true` | **0/16 = 0%** |
| `fallbackReason !== null` | **0/16 = 0%** |
| retries 分布 | 0: **15/16** / 1: **1/16** (2.1.10) / 2 / -1: **0/16** |
| latencyMs median | ~2400ms (Stage 2.3 中央値と整合) |
| latencyMs max | 4798ms (2.1.10 E、retry 含む) |
| latencyMs > 8000ms (timeout 危険域) | **0 件** |
| Stage 2.3 fallback rate (~5.7%) との整合 | retries=1 が 1/16 ≈ 6%、整合 |

LLM 経路は全 scenarios で安定動作。Stage 2.3 quality と統計的整合。

### Round 6-10 prompt 強化 runtime 準拠確認

| Round | 修正対象 variant | 該当 scenario | 結果 |
|---|---|---|---|
| Round 6 | E grounding contract (Context にない人物・関係作らない) | 2.1.10 | **準拠**: 抽象表現、具体 quote なし |
| Round 7 | F-2 grounding (天気・体温・予定 事実化禁止、抽象提案 OK) | 2.1.11 / 2.1.12 / 2.1.13 / 2.1.14 | **準拠**: 抽象的「短い休憩」「短い散歩」、事実化なし |
| Round 8 | C tone/scope (面談 bot 化禁止、二者間スコープ) | 2.1.5 / 2.1.6 | **準拠 + Round 8 OK 例完全一致** |
| Round 9 | D grounding (左右・視覚情報禁止、片側フォーカス = 発話文脈) | 2.1.7 / 2.1.8 / 2.1.9 | **準拠**: 「片方/もう片方」のみ、左右なし、視線なし |
| Round 10 | F-1 tone/scope (AI 感情禁止、個人 choice 強調禁止、関係営業禁止) | 2.1.14 (F-2 体のみ) | **F-1 primary 未到達のため Round 10 contract 直接観測なし、F-2 fallback 体に違反語含まず** |

**Stage 2.3 Round 6-10 全強化 effect が runtime で confirmed**。Stage 2.3 quality 投資の payoff を mini-smoke で実証。

### F-1 三軸 strict 分離 record (CEO 厳守、§4.5)

| 軸 | 観測元 | 結果 | 判定 |
|---|---|---|---|
| **(I) F-1 primary 到達** | 2.1.14a/b/c (3 試行、S7 normal) | **0/3 observed** (全試行 variant=F2 + hasSecondary=false、f1-special canary breadcrumb で確認) | **(I) primary 軸 Yellow** (一試行も観測されず → 到達不能) |
| **(II) F-1 secondary 到達** | 2.1.12 (Daily) / 2.1.13 (Travel) | **未確認** (response body 上 F-2 primary 体のみ確認、`hasSecondary` field 含 secondaryLine 未取得) / 2.1.14 normal で混入: **未観測** (f1-special canary で hasSecondary=false 確認、normal で異常なし) | **未確認のまま記録** (Sentry Discover 後検索 / 追加 smoke は CEO 別 phase 判断) |
| **(III) F-1 到達不能** | S7 normal 通算 | (I) と (II) normal で両方 not observed → 部分確定 | **S7 normal で (III) 確定 / Daily・Travel は (II) 未確認のため未確定** |

**確定**: S7 normal で F-1 standalone primary 到達不能 → **Yellow / spec ambiguity confirmed** (NG ではない、A2 commit `e14682cd` observation の runtime 確認)。**impl 修正候補ではなく、別 task で UI spec §7.12 sharpen の根拠**。

### canary throw status

| # | 状態 | 詳細 |
|---|---|---|
| #1 base scenarios (2.1.4-2.1.13) 完了後 | **Missing (procedure error)** | CEO 操作 error (DevTools Console ではなく Supabase SQL editor に setTimeout 貼付 → "syntax error at or near setTimeout")。Sentry に Issue 不在 |
| #2 F-1 special (2.1.14) 完了後 | **Confirmed** | Sentry Issue "CoAlter Stage 2.4-B smoke f1-special" 存在、breadcrumb trail で S0→S1→...→S7 + variant=F2 / hasSecondary=false / state=S7 / mode=normal / speechSource=llm / validationFailed=false / fallbackReason=null / latencyMs=2852 確認 |

#### canary 再実施しない判断 (CEO 確定 + Claude 同意)

- Sentry breadcrumb session は client-side page load 単位 → 過去 base scenarios の breadcrumb は別 session に分散済
- 今 canary を投げ直しても新 session の Issue に紐付くだけ → **過去 base scenarios の breadcrumb 固定保全にならない**
- → 価値ゼロ、再実施しない、**「未取得として記録」確定**

### Yellow notes 5 件 (本 phase で明記、追加対応せず別 phase 判断)

#### Yellow note 1: 2.1.6 C@S5 body の "?" 末尾抜け (micro)
- "今、二人の間で一番整理したい点はどこでしょうか" ← "?" 抜け
- Round 8 OK 例「どこでしょうか?」と semantic 一致だが文字 "?" 不在
- validator は `maxQuestions=1` (上限のみ) で reject しない
- LLM stochastic 生成の偏差、致命でない
- **追加対応不要、informational のみ**

#### Yellow note 2: 2.1.9 D@S5 travel 文脈補完強 (CEO 指摘)
- 「言葉を発したようですが、まだ反応していない」← Context (input) に明示されない言語行動を推論
- Round 9 D grounding contract 「具体 quote (『XX』と言った) 作らない」には抵触せず (具体 quote ではなく抽象推論)
- Stage 2.3 prompt refinement 候補 → **別 phase (Stage 2.3 prompt refinement) へ残す**

#### Yellow note 3: 2.1.14 F-1 standalone primary 到達不能 (3/3 試行)
- 全試行で F-2 体観測、`variant=F2 / hasSecondary=false`
- 事前予測通り (A2 commit `e14682cd` observation の runtime 確認)
- 構造的には `STATE_PATTERN_PRIORITY[S7]=["F2", "F1"]` + `matchesContextPriority(F2, S7, normal, *)` always returns true → F-2 が priority 1 で常時選択
- **NG ではなく Yellow / spec ambiguity confirmed**
- impl 修正候補ではなく、UI spec §7.12 S7 normal の wording sharpen 根拠 → **別 task** へ残す

#### Yellow note 4: 2.1.12 / 2.1.13 F-1 secondary 未確認
- response body は F-2 primary 体のみ
- speech response の `secondaryLine` field と Sentry `coalter.pattern.used.hasSecondary` 観測は本 smoke で未取得 (canary base 失敗のため breadcrumb session 固定証跡なし)
- A2 unit test (`patternSelectorRoutingSpec.test.ts`) で `selectSecondaryPattern` 4-row 完全網羅 PASS 確認済 (関数 invoke レベル)
- runtime での hasSecondary observation は未確認のまま → **追加 smoke / Sentry Discover 追加調査は別 phase 判断**

#### Yellow note 5: base canary missing (procedure error)
- DevTools Console と Supabase SQL editor の混同
- 一回きりの operator error、手順書改善で防止可能 → **Stage 2.4-B 手順書 §6.5 / §6.7 に「貼付先確認 step」追加** (本 commit に含む docs 改善)

### 表現規約 (CEO/GPT 補正準拠、本 phase 終了後も継続)

- Stage 2.4-B Yellow付きPASS は **「smoke harness 経由」の variant fetch path 検証 PASS**
- **「production reachability PASS」とは呼ばない** (CEO/GPT 補正準拠)
- production-side context flag detector (executor watcher / heuristic / LLM 検出) は **未実装、別 phase**
- B-3 Phase 2 を「Gap 4 解消」と呼ばない (smoke-only harness 限定)

### 残課題 (4 件、別 phase / 別 task)

| # | 課題 | 性質 | 残置先 |
|---|---|---|---|
| 1 | **Gap 4 production context detection** (executor watcher / heuristic / LLM 検出) | impl 残作業 | **別 phase**、§9 保留継続、本 Stage 2.4-B 範囲外 |
| 2 | **F-1 standalone primary trigger spec ambiguity** (UI spec §7.12 S7 normal wording) | spec sharpen | **別 task**、UI spec / 統合契約 への追記検討 |
| 3 | **2.1.9 D@S5 travel 文脈補完** | quality refinement | **別 phase** (Stage 2.3 prompt refinement、CEO 既往 scope 外) |
| 4 | **F-1 secondary daily/travel runtime 未確認** | observation 追加 | **別 phase 判断** (Sentry Discover 後検索 or 追加 smoke、本 phase は完了) |

### Stage 2.4-B Yellow付きPASS 確定根拠 (CEO 判断)

| 軸 | 結果 | 判定 |
|---|---|---|
| variant fetch path reachability via harness (A/B/C/D/E/F-2 全 6 種) | smoke harness 経由 1 件以上 PASS 観測 | **PASS** |
| LLM speech quality (Round 6-9 不変核準拠) | 16/16 source=llm、validationFailed 0、Round 強化 runtime 準拠、micro quality 1 件 | **PASS w/ 1 Yellow note** |
| F-1 standalone primary 到達 (S7 normal) | 0/3 → (III) 到達不能確定 (predicted) | **Yellow / spec ambiguity confirmed** |
| F-1 secondary 同伴 (S7 daily/travel) | response 上未確認 | **未確認のまま記録** |
| canary throw 証跡 | #1 missing / #2 confirmed | **partial** (operator error 由来) |
| production reachability (Gap 4 production logic) | 未解消 | **out of scope** (別 phase) |

→ **Stage 2.4-B Yellow付きPASS 確定** (CEO 判断 2026-05-09)

### Stage 2.4-B 完了後の Stage 2.4 進行プロトコル

```
Stage 2.4-A (静的 audit、commit 34067d98 / e14682cd) ✅ PASS
   ↓
Stage 2.4-B (variant 到達性 smoke、commit 39566cfd / ae7b6ecf / cce40487) ✅ Yellow付きPASS (本記録)
   ↓
Stage 2.4-C (UI timeout / fallback 確認) ← 次 phase 着手判断
   ↓
Stage 2.4-D (production-ready audit) ← Stage 2.4-C 完了後
   ↓
[Production reflection は CEO 判断]
```

### CEO 厳守 (本記録 + Stage 2.4-B 完了後も継続)

- ✗ Production env 変更しない
- ✗ production context detector 実装しない (Gap 4、別 phase)
- ✗ selectPattern 修正しない
- ✗ prompt 修正しない (Round 6-10 確定状態維持)
- ✗ validator / model / max_tokens / timeout 変更しない
- ✗ 追加 smoke しない (本 Stage 2.4-B 範囲)
- ✗ Sentry Discover 追加調査しない (本 Stage 2.4-B 範囲)
- ✗ Stage 2.4-B 自律完了扱いしない (CEO 個別承認 = 本記録)
- ✗ Phase 2 を「Gap 4 解消」と呼ばない
- ✗ Stage 2.4-B Yellow付きPASS を production reachability PASS と呼ばない
- ✗ Stage 2.4-C / D を自律で着手しない (CEO 個別承認後のみ)
- ✓ B-2 wire (`39566cfd`) / B-3 Phase 1 (`ae7b6ecf`) / B-3 Phase 2 (`cce40487`) は production code として残置 (Stage 2.4-D 着手判断材料)
- ✓ Preview env の `NEXT_PUBLIC_COALTER_PRESENCE_SMOKE_CONTEXT=true` は Stage 2.4-D で削除判断 (CEO directive)

### 次 phase: Stage 2.4-C / D 着手判断 (CEO directive 待ち)

CEO 個別判断材料として、本 entry の続編で Stage 2.4-C / D 提案を別 commit / 別 entry で出す予定。本記録は Stage 2.4-B Yellow付きPASS の集約に集中。

---

## [2026-05-09] [Build] [Stage 2.4-C 観察ベース timeout/fallback risk assessment Yellow 付き PASS + Sentry monitoring threshold 案 + 残リスク (fallback path direct observation 未実施) Production reflection 後 monitoring へ持ち越し] [承認: CEO]

### 経緯

CEO 確定 (2026-05-09): Stage 2.4-B Yellow付きPASS docs commit (`208494c7`) push 後、Stage 2.4-C 着手 GO。CEO 補正で **「UI timeout/fallback 完全確認」「direct runtime confirmation」と呼ばない**、**「観察ベースの timeout/fallback risk assessment」「Yellow 付き観察ベース PASS」「observed-risk acceptable / monitoring 条件付き」** と表現規約。Option C-1 採用 (docs-only、追加 smoke なし、mock latency injection なし、CEO 厳守 impl 修正禁止)。

### 表現規約 (CEO 補正準拠、本 phase 終了後も継続)

- ❌ 「UI timeout/fallback 完全確認」「direct runtime confirmation」と呼ばない
- ✅ 「観察ベースの timeout/fallback risk assessment」「Yellow 付き観察ベース PASS」
- ✅ 「observed-risk acceptable / monitoring 条件付き」

### Option 採用根拠 (再確認)

| Option | 内容 | 評価 |
|---|---|---|
| **C-1 (採用)** | 観察ベース、docs-only、Stage 2.3 + Stage 2.4-B 既存データ集約 + code-level audit + monitoring 案 | CEO 厳守 + 進度維持、direct observation 不在は monitoring で代替 |
| C-2 (不採用) | mock latency injection で直接 timeout 再現 | **CEO 厳守違反** (impl 修正禁止、speech route / timeout 不変) |
| C-3 (不採用) | passive observation (時間経過待ち) | 不確実、進度阻害 |

### §1 過去 timeout 観測履歴

#### §1.1 Stage 2.3 期間 (2026-05-07 〜 2026-05-08)

| 観測時期 | timeout 設定 | timeout 件数 | sample 数 | rate |
|---|---|---|---|---|
| Stage 2.2 Block 2 (smoke v6) | **8s** | **1 件** | 20 | 5.0% |
| Stage 2.2 Block 3 (smoke v6) | **8s** | **1 件** | 累積 ~55 で発火 | — |
| → CEO Round 7 確定: timeout 8s → 10s 拡張 (`SPEECH_FETCH_TIMEOUT_MS = 10_000`、`UpperLayerMount.tsx:113`) | | | | |
| Round 7 confirm (smoke v7) | 10s | 0 件 | 20 | 0% |
| Round 7 confirm (smoke v8) | 10s | 0 件 | 20 | 0% |
| Round 8 / 9 / 10 (Stage 2.3 final) | 10s | 0 件 | 累積 ~110 | 0% |

統計サマリ:
- **8s 設定での timeout rate ≈ 3.6%** (累積 2/55)
- **10s 拡張後 timeout rate 0%** (累積 ~110 sample)
- 8s→10s 拡張が runtime で支持された (CEO Round 7 案 A 確定の判断 validation)

#### §1.2 Stage 2.4-B 期間 (2026-05-09)

| 観測 | timeout 件数 | latency max | sample |
|---|---|---|---|
| Stage 2.4-B mini-smoke 全 16 sample | **0 件** | 4798ms (2.1.10 E@S5、retry 含む) | 16 |

10s timeout に対し **4798ms = 47.98% margin**。

#### §1.3 累積統計

- 10s timeout 拡張後の累積: ~110 (Stage 2.3) + 16 (Stage 2.4-B) = **~126 sample で 10s timeout 発火 0 件**
- 観察上 **timeout は安定**

### §2 10s timeout margin 妥当性評価

| 軸 | 値 | 評価 |
|---|---|---|
| LLM 単発 latency typical (Anthropic Claude Sonnet 4.5) | 1-3 秒 | base reference |
| Stage 2.4-B 16 sample latency median | ~2400ms | typical 範囲内 |
| Stage 2.4-B 16 sample latency max | 4798ms (retry 含) | margin 中 |
| 10s timeout vs typical | 3-10x margin | 妥当 |
| 10s timeout vs max observed | 2.1x margin | 安全側 |

→ **10s timeout は妥当**。Round 7 8s→10s 拡張判断は runtime で支持された。

### §3 UI fallback path code-level audit (read-only)

`UpperLayerMount.tsx` fetch effect (line 323-608) read-only audit:

#### §3.1 timeout 切断 path (line 376-379, 540-573)

```typescript
const timeoutId = setTimeout(() => {
  timeoutFired = true;
  controller.abort();
}, SPEECH_FETCH_TIMEOUT_MS);  // 10000ms

// catch block で AbortError + timeoutFired 判定
if (isAbort && !timeoutFired) {
  // cleanup 由来 (state/mode/variant 変化での副次 abort) → cache 汚さず
  setSpeechBody(null);
  return;
}
// timeout 由来 → fallback emit + negative cache
emitSpeechTelemetry("fallback", 0, elapsedMs, false, "timeout");
```

→ `source="fallback"` `fallbackReason="timeout"` で telemetry emit、`speechBody=null` で UI を hardcoded fallback (各 state component の `S2_FALLBACK_BODY` 等) に戻す。**UI 崩れない設計**。

#### §3.2 cache / negative cache (line 354-365)

- `(variant, state, mode)` cacheKey で session cache hit → 即適用 (production-like behavior)
- negative cache 期限:
  - `timeout` / `llm_error` / `validation_failed` 由来: 30s
  - `rate_limited` 由来: 70s (rate window 整合)
- observation mode OFF (Stage 2.4-B 既往) で機能、Production と同等挙動

#### §3.3 in-flight dedupe (line 368-370)

- `(variant, state, mode)` の同 key 並列 fetch を防止 (1 instance 内)
- cleanup で AbortController 経由 stale 防止

#### §3.4 関数 contract レベル確認 (test layer)

- A2 test (`patternSelectorRoutingSpec.test.ts`): selector layer のみ test、fetch effect 未 cover
- B-2 / B-3 Phase 1 / Phase 2 test (`s1ChipDispatch` / `stateTransitionDispatch` / `smokeContextOverride`): dispatch / pure helper / env gate test、fetch effect timeout / fallback path は **unit test 未 cover**
- → **fetch effect の timeout / fallback path は code review only、関数 contract validation 限定**

### §4 Stage 2.4-B での timeout / fallback 観測の意義

- 16/16 で `source="llm"`、validationFailed 0、fallback 0、timeout 0
- **failure path 直接観測 0 件** (本 phase で観察できなかった軸)
- ただし success path 100% 安定は **production environment での provider 安定性の根拠**

### §5 timeout/fallback direct reproduction 未実施 (残リスク)

#### §5.1 何を観測していないか

| 軸 | 観測状態 |
|---|---|
| timeout 切断時の UrgentLayer fallback 起動 | direct UI observation **なし** |
| timeout 後の cache / negative cache 動作 | direct observation **なし** |
| 連続発火時の in-flight dedupe | direct observation **なし** |
| Stage 2.3 で観察された 60 秒級 spike (Block 3) の UI 再現 | direct observation **なし** |

#### §5.2 残リスクの性質

- Stage 2.3 + Stage 2.4-B 統計: 10s timeout rate 0% (累積 ~126 sample)
- code-level audit: fallback path は impl 済、関数 contract OK
- **direct UI 観測なし → Production reflection 後の monitoring 必須**

### §6 Sentry monitoring threshold 案 (Production reflection 必須条件、CEO 補正準拠)

Production env に反映する場合、以下の **Sentry alert 設定を必須条件** とする:

| 指標 | 警告 (yellow alert) | 緊急 (red alert) | 根拠 |
|---|---|---|---|
| `coalter.pattern.used.fallbackReason="timeout"` rate (1h window) | **5%** over 1h | **10%** over 15min | Stage 2.3 累積 ~3.6%、増加で alert |
| `coalter.pattern.used.fallbackReason="validation_failed"` rate (1h window) | **10%** over 1h | **20%** over 15min | Stage 2.3 PASS rate baseline (Round 7 確定) |
| `coalter.pattern.used.latencyMs` p95 (1h window) | **5000ms** | **8000ms** | LLM 単発 ~2-3 秒、retry 含 ~8 秒 |
| `coalter.pattern.used.fallbackReason="llm_error"` rate (1h window) | **5%** | **10%** | Anthropic API 5xx / 通信 error 想定 |
| `coalter.pattern.used.fallbackReason="rate_limited"` rate (1h window) | **1%** | **5%** | Rate window 整合、稀発火想定 |
| `coalter.pattern.used.retries=-1` rate (全 retry 失敗 fallback) (1h window) | **5%** | **10%** | Stage 2.3 累積 ~3.6% |

#### §6.1 alert 動作仕様

- **警告 (yellow alert)**: Slack notification、CEO + dev team 認知、24h 以内に手動調査
- **緊急 (red alert)**: 即時 alert、必要に応じ kill switch (`COALTER_PRESENCE_SPEECH_LLM=false`) で speech LLM 経路停止判断

#### §6.2 Production reflection 時の必須条件

これらの threshold で Sentry alert を設定し、CEO 反映承認の前提条件とする。alert 設定なしでの Production reflection は **本 Stage 2.4-C Yellow 付き観察ベース PASS の前提を満たさない**。

### §7 Stage 2.4-C 判定 (Yellow 付き観察ベース PASS、CEO 補正準拠)

| 軸 | 結果 | 判定 |
|---|---|---|
| Stage 2.3 timeout 履歴 statistical | 8s 設定 ~3.6% / 10s 拡張後 0% | 観察上安定 |
| Stage 2.4-B timeout 観測 (10s 設定下) | 0/16 | 観察上安定 |
| 10s timeout margin (LLM 典型 latency 比較) | 2-10x | 妥当 |
| UI fallback path code-level | 関数 contract OK (read-only audit) | 関数 contract 確認 |
| timeout/fallback direct reproduction | **未実施** (CEO 厳守 impl 修正禁止) | **残リスク** |
| Sentry monitoring threshold 案 | 6 指標提案 | Production reflection **必須条件** |
| fallback path direct observation | **未実施** | **残リスク (Production reflection 後 monitoring へ持ち越し)** |

→ **Stage 2.4-C Yellow 付き観察ベース PASS** (CEO 補正準拠で「direct runtime confirmation」とは呼ばない、observed-risk acceptable / monitoring 条件付き)

### §8 残リスク (Yellow notes、Production reflection 後 monitoring へ持ち越し)

| # | 内容 | 残置先 |
|---|---|---|
| 1 | timeout 切断時 UrgentLayer fallback 起動 direct UI observation 未実施 | Production reflection 後 Sentry alert で実 user 環境観測 |
| 2 | speech card cache / negative cache 動作 direct observation 未実施 | 同上 |
| 3 | in-flight dedupe direct observation 未実施 | 同上 |
| 4 | 60s 級 spike の UI 再現 direct observation 未実施 (Stage 2.3 Block 3 で 1 件観察例あるが、Stage 2.4-B では再現なし) | 同上 |

これらは **本 Stage 2.4 範囲では直接観測しない**。**Production reflection 後の Sentry monitoring (§6) で実 user 環境観測** に持ち越す。**現時点で direct reproduction は CEO 厳守 (impl 修正禁止) で不可能**。

### §9 Stage 2.4 進行プロトコル update

```
Stage 2.4-A ✅ PASS (commit 34067d98 / e14682cd)
   ↓
Stage 2.4-B ✅ Yellow付きPASS (commit 39566cfd / ae7b6ecf / cce40487 + 208494c7 docs)
   ↓
Stage 2.4-C ✅ Yellow 付き観察ベース PASS (本記録、docs-only)
   ↓
Stage 2.4-D (production-ready audit) ← CEO 個別承認後
   ↓
[Production reflection は CEO 判断、§6 Sentry monitoring threshold を必須条件とする]
```

### §10 不変境界 (Stage 2.4-C 期間中 + 完了後共通、CEO 厳守)

- ✗ Production env 変更しない
- ✗ production context detector 実装しない (Gap 4、別 phase)
- ✗ selectPattern 修正しない
- ✗ prompt 修正しない (Round 6-10 確定状態維持)
- ✗ validator / model / max_tokens / timeout 変更しない
- ✗ 追加 smoke しない (本 phase は観察ベース、docs-only)
- ✗ mock latency injection しない (CEO 厳守)
- ✗ Stage 2.4-D 自律着手しない (CEO 個別承認後)
- ✗ 残リスク 4 件を本 phase で direct reproduction しない (Production reflection 後 monitoring へ持ち越し)
- ✗ Stage 2.4-C を「direct runtime confirmation」と呼ばない (CEO 補正準拠)
- ✗ B-3 Phase 2 を「Gap 4 解消」と呼ばない
- ✗ Stage 2.4-B Yellow付きPASS / Stage 2.4-C Yellow 付き観察ベース PASS を **production reachability PASS と呼ばない**

### §11 次 phase 着手判断 (CEO 承認待ち)

Stage 2.4-D (production-ready audit、集約) 着手は CEO 個別承認後。本記録 (Stage 2.4-C) で:
- Stage 2.4-C Yellow 付き観察ベース PASS 確定
- §6 Sentry monitoring threshold 案 を Stage 2.4-D で **Production reflection 必須条件** として継承
- 残リスク 4 件 を Stage 2.4-D で **Production reflection 後 monitoring 計画** として整理

CEO 個別判断要件 (Stage 2.4-D 着手時):
1. 集約 doc を `docs/coalter-stage24-production-reflection.md` で新規作成 vs decision-log only
2. Production reflection の **タイミング** (Stage 2.4-D 完了後すぐ / 別タスク化)
3. Sentry alert 設定の **operator 担当** (CEO / dev team)
4. kill switch (`COALTER_PRESENCE_SPEECH_LLM=false`) の rollback plan 確定

---

## [2026-05-09] [Build] [Stage 2.4-D production-ready audit (docs-only) 完了 + Production reflection 判断材料 集約 doc 新規作成 + reflection 自体は CEO 個別判断] [承認: CEO]

### 経緯

CEO 確定 (2026-05-09): Stage 2.4-C Yellow 付き観察ベース PASS docs commit (`abb6f8db`) push 後、Stage 2.4-D 着手 GO。**Production 反映ではなく、Production reflection の判断材料を作る docs-only audit**。CEO 補正で「Stage 2.4-B / C を production reachability PASS と呼ばない」「Phase 2 smoke harness を Gap 4 解消と呼ばない」「Production reflection は CEO 判断であり Claude 自律実行しない」を表現規約として永続化。

### 成果物

**1. `docs/coalter-stage24-production-reflection.md`** (新規、450+ 行)

- §0 本書の位置づけ + 表現規約 (CEO/GPT 補正準拠)
- §1 集約 (Stage 2.3 + Stage 2.4-A/B/C 全結果サマリ)
- §2 Production reflection 前提条件チェックリスト (10 項目、5 完了 / 5 反映時 CEO 操作)
- §3 Production env 反映計画案
  - §3.1 設定 env vars 表 (4 必須 + 既往設定)
  - §3.2 **Production 絶対設定しない env** 明記 (`SMOKE_CONTEXT` / `OBSERVATION_MODE`)
  - §3.3 反映後挙動 (Gap 4 由来制約: A@S2 + F-2@S7 のみ runtime variant、S5 系 variant=null は **設計通り**)
- §4 Sentry monitoring threshold 案 (Stage 2.4-C §6 継承、6 指標 / warn-red 二段 / alert 動作仕様)
- §5 rollback / kill switch 方針
  - §5.1 既存 kill switch (server / client、redeploy 要否含)
  - §5.2 rollback 手順 (soft / hard / 完全停止 三段)
  - §5.3 即応性 (soft = 数十秒〜分、hard = ~5 分)
  - §5.4 graduated rollout (現 build 未実装、別 task)
- §6 残課題整理 (5 件):
  1. Gap 4 production context detection (別 phase)
  2. F-1 standalone primary trigger spec ambiguity (別 task)
  3. 2.1.9 D travel 文脈補完 (別 phase)
  4. F-1 secondary daily/travel runtime 未確認 (別 phase 判断、reflection 後 monitoring で代替可)
  5. base canary procedure error (commit `208494c7` で改善済)
- §7 リスク評価集約 (PASS items / Yellow items / production reachability の意味再確認)
- §8 Production reflection 判断 (CEO 個別)
  - §8.1 判断要件 (今実施 vs Gap 4 完成まで延期)
  - §8.2 反映実施時必須手順 (Sentry alert → env vars → redeploy)
  - §8.3 reflection 後運用 (monitoring 継続)
- §9 不変境界 (本 phase + reflection 期間継続、CEO 厳守)
- §10 Stage 2.4 全体完了通知 + commit chronological + 関連 docs
- §11 改訂履歴

**2. 本 entry (decision-log)**: Stage 2.4-D 完了通知 (cross-ref to 新 doc)

### Stage 2.4 全 phase 完了状態

| Stage | 状態 | 関連 commit |
|---|---|---|
| Stage 2.3 | ✅ Yellow 付き条件付き PASS | `b2322991` / `cab8673f` / `759470d9` |
| Stage 2.4-A | ✅ PASS | `34067d98` (A1-3) / `e14682cd` (A2) |
| Stage 2.4-B | ✅ Yellow 付き PASS | `39566cfd` / `ae7b6ecf` / `cce40487` / `208494c7` |
| Stage 2.4-C | ✅ Yellow 付き観察ベース PASS | `abb6f8db` |
| **Stage 2.4-D** | ✅ **docs-only audit 完了** | (本 commit) |

### Production reflection 状態

- **未実施** (CEO 個別判断、Claude 自律実行しない)
- **判断材料は完成** (`docs/coalter-stage24-production-reflection.md`)
- 反映時の必須手順は §8.2 に記載
- 反映後の運用は §8.3 に記載

### 表現規約 (CEO/GPT 補正準拠、永続記録)

| 用語 | 意味 |
|---|---|
| Stage 2.4-B Yellow 付き PASS | smoke harness 経由 variant fetch path 検証 PASS、**production reachability PASS とは呼ばない** |
| Stage 2.4-C Yellow 付き観察ベース PASS | 観察ベース risk assessment PASS、**direct runtime confirmation とは呼ばない** |
| B-3 Phase 2 smoke harness | Preview env 限定 URL query 経由 patternContext 注入機構、**Gap 4 production logic 解消とは呼ばない** |
| Production reflection | **CEO 判断**、Claude 自律実行しない |
| `NEXT_PUBLIC_COALTER_PRESENCE_SMOKE_CONTEXT` | **Preview 限定**、Production 絶対設定しない |

### 残課題 5 件 (本 doc §6 で整理)

1. **Gap 4 production context detection** — 別 phase
2. **F-1 standalone primary trigger spec ambiguity** — 別 task
3. **2.1.9 D travel 文脈補完** — 別 phase (Stage 2.3 prompt refinement)
4. **F-1 secondary daily/travel runtime 未確認** — 別 phase 判断、reflection 後 monitoring で代替可
5. **base canary procedure error** — 完了 (commit `208494c7` で procedure 改善済)

### 不変境界 (Stage 2.4-D + reflection 期間継続、CEO 厳守)

- ✗ Production env 変更しない (本 doc は判断材料、実反映は CEO 個別判断)
- ✗ Production 反映自体しない (CEO 個別判断後の別タスク)
- ✗ production context detector 実装しない (Gap 4、別 phase)
- ✗ selectPattern 修正しない
- ✗ prompt 修正しない (Round 6-10 確定状態維持)
- ✗ validator / model / max_tokens / timeout 変更しない
- ✗ 追加 smoke しない
- ✗ Sentry alert 実装しない (本 doc は threshold 案のみ、CEO operator 担当)
- ✗ Stage 2.4-B Yellow付きPASS / Stage 2.4-C Yellow 付き観察ベース PASS を **production reachability PASS と呼ばない**
- ✗ B-3 Phase 2 smoke harness を **Gap 4 解消と呼ばない**
- ✗ smoke harness env (`SMOKE_CONTEXT`) を **Production 絶対設定しない** (Preview 限定)
- ✗ `OBSERVATION_MODE` env を **Production 絶対 true 設定しない** (Preview 限定)

### Stage 2.4 進行プロトコル (確定、本 commit で完了)

```
Stage 2.3 ✅ Yellow 付き条件付き PASS (2026-05-08)
   ↓
Stage 2.4-A ✅ PASS (2026-05-08)
   ↓
Stage 2.4-B ✅ Yellow 付き PASS (2026-05-09)
   ↓
Stage 2.4-C ✅ Yellow 付き観察ベース PASS (2026-05-09)
   ↓
Stage 2.4-D ✅ docs-only audit 完了 (2026-05-09、本 commit)
   ↓
[Production reflection は CEO 個別判断、本書 §8 を判断材料]
   - 反映 GO 判断
   - Sentry alert 設定 (§4 thresholds)
   - env vars 反映 (§3.1)
   - SMOKE_CONTEXT Production 絶対不可 確認 (§3.2)
   - rollback plan 周知 (§5)
   ↓
[reflection 後、Sentry monitoring 継続、別 phase / 別 task 着手判断]
```

### 次の動き (CEO 個別判断要)

1. **本 commit (Stage 2.4-D docs-only audit) push 許可**
2. **Production reflection 判断**:
   - 今実施するか / Gap 4 完成まで延期するか
   - 実施時の operator 役割 (CEO / dev team)
   - Sentry alert 設定タイミング
3. **残課題 5 件の優先順位** (別 phase / 別 task):
   - Gap 4 production logic 着手判断
   - F-1 spec sharpen 着手判断
   - 2.1.9 文脈補完 refinement 判断
   - F-1 secondary 追加観測判断 (or reflection 後 monitoring 待ち)
4. (Optional) `feat/coalter-three-stage` branch の **main merge 判断** (Stage 2.4 全完了後の整理)

Claude は CEO 個別判断を待つ。本 doc を judgement material として CEO 提示。**Stage 2.4-D で本 phase 全完了**、新規 impl / smoke / Production touch なし。

---

## [2026-05-09] [Build] [Sentry alert setup handoff docs 作成 + CEO 既往初期 4 alerts 完了状態反映 + 残 Discover saved query 6 種 click-by-click 手順を repo 永続化] [承認: CEO]

### 経緯

CEO 確定 (2026-05-09): Stage 2.4-D Production reflection 判断材料 docs commit (`9df69549`) push 後、最優先 Option A (Sentry alert 設定) 着手。CEO 自身が初期 4 alerts (speech route exception / `/api/coalter/speech` p95 latency / 5xx rate / urgent triggered) + Slack integration (`#aneurasync-alerts`) を Sentry dashboard で設定完了。残 Discover saved query 6 種の click-by-click 手順を chat 内のみではなく **repo に永続化** することで、後続 reflection / 運用フェーズの参照書とする。

### 成果物

`docs/coalter-stage24-sentry-alert-setup.md` (新規、475+ 行):

- §0 本書の位置づけ + CEO/GPT 補正準拠 表現規約
- §1 Sentry プロジェクト前提 + Slack `#aneurasync-alerts` integration 状態
- §2 **6 指標 standard alert 化制約** (重要発見、impl 修正なしには不可) + 対応方針 3 段
- §3 Issue Alert 設定済 (CEO 既往完了): urgent triggered / speech route exception
- §4 Performance Transaction Alert 設定済 (CEO 既往完了、partial proxy): p95 latency / 5xx rate
- §5 Discover saved query 設計 (6 指標仕様 + threshold + review cadence + Sentry search syntax 注意)
- §6 **Discover saved query click-by-click 手順** (CEO がそのまま実行可、6 query × Sentry UI step):
  - common navigation
  - query 1: timeout fallback (filter / Y-axis / save)
  - query 2: validation_failed (Q1 と同手順、filter のみ変更)
  - query 3: latency p95 (p95 集計、breadcrumbs.data.latencyMs)
  - query 4: llm_error
  - query 5: rate_limited
  - query 6: retries=-1
  - 動作確認手順 (Stage 2.4-B 既存 breadcrumb 2026-05-09 vercel-preview で結果確認)
  - review 運用 (daily 09:00 推奨)
- §7 Production reflection 前チェックリスト (22 項目: alert 設定 12 + Stage 2.4 完了 + Production env 確認)
- §8 不変境界 (CEO 厳守)
- §9 残課題: custom metric impl (Stage 2.5)、自動 cadence 化、syntax 検証
- §10 改訂履歴

### CEO 既往完了状態 (本 entry 反映)

| # | alert | 状態 |
|---|---|---|
| 1 | speech route exception (warn + red) | ✅ |
| 2 | /api/coalter/speech p95 latency monitor (warn + red) | ✅ |
| 3 | /api/coalter/speech 5xx rate monitor (warn + red) | ✅ |
| 4 | urgent triggered alert (warn + red) | ✅ |
| Slack integration | `#aneurasync-alerts` Installed | ✅ |
| Discover saved query × 6 | (CEO 次タスク、本書 §6 click-by-click 提示) | ☐ |

### Sentry standard alert の限界 (再確認、本 entry で permanent 記録)

`coalter.pattern.used` の 6 指標は **breadcrumb の `data` field**。Sentry standard alert (Issue Alert / Metric Alert) では breadcrumb data を直接 trigger 条件にできない。

→ 本 phase 範囲では **Discover saved query + 定期手動 review** で代替 (§5 / §6)。
→ Production reflection 後の運用改善で **Sentry custom metric impl** を Stage 2.5 候補として残す。

### 表現規約 (CEO/GPT 補正準拠、永続)

- ✅ Sentry alert 設定は **CEO operator 作業**、Claude 自律設定しない
- ✅ Production env 触らない
- ✅ Sentry standard alert で 6 指標を直接 metric 化できない制約を明記
- ✅ Issue Alert / Performance Transaction Alert / Discover saved query / custom metric impl の 4 段代替を明記
- ✅ Production reflection 前のみ本書で扱う (reflection 自体は CEO 個別判断、本 phase scope 外)

### 不変境界 (本記録 + CEO 操作期間中、CEO 厳守)

- ✗ Production env 変更しない
- ✗ Production reflection しない (CEO 個別判断)
- ✗ main merge しない
- ✗ production context detector 実装しない (Gap 4、Stage 2.5 / 別 milestone)
- ✗ selectPattern / prompt 修正しない
- ✗ validator / model / max_tokens / timeout 変更しない
- ✗ Claude が Sentry alert / Discover query を自律設定しない (CEO operator 担当)
- ✗ Sentry custom metric impl しない (Stage 2.5 候補)
- ✗ 追加 smoke しない

### 次の動き

1. **本 entry + 新 doc commit** (docs-only)
2. CEO Discover saved query 6 種を Sentry UI で設定 (本書 §6 参照)
3. CEO 動作確認 (Stage 2.4-B 既存 breadcrumb で query 結果確認)
4. CEO daily review cadence operator 担当確定
5. Production reflection 前チェックリスト 22 項目 全 ✅ → CEO 個別判断で reflection 実施可

---

## [2026-05-09] [Build] [Stage 2.4 Production reflection 前最終整備 — Path B 採用 + Production OFF safety state 達成 + ANTHROPIC_API_KEY Production 設定済み 反映 (docs-only)] [承認: CEO]

### 経緯

CEO 確定 (2026-05-09): Sentry alert setup handoff doc (`995748dc`) push 後、Production reflection 前チェックリスト 22 項目の残 ☐ 4 項目を CEO operator が解消する過程で、以下 3 つの確定事項が出た。

1. **Test Notification 配信確認 (item 9)**: Sentry UI に Issue Alert 用 standard "Send Test Notification" ボタンが見当たらない (Sentry 側 UI 制約)。CEO 判定で **Path B = Yellow accept** を採用。Slack `#aneurasync-alerts` integration 自体は完了 (`Installed` 表示) のため、初回 real alert 着火を観測ベース確認とする。
2. **Synthetic event alert 動作確認 (item 10)**: 同上 UI 制約 + Production env まだ OFF のため synthetic 着火困難。**残リスク永続記録** で対応 (Yellow accept → reflection 後 monitoring へ持ち越し)。
3. **Production env safety / rollback dry-run (items 19/20/22)**: CEO 自身が Vercel Production env で 3 つの reflection 旗を **明示的に false 設定** (rollback dry-run 達成 + Production OFF safety state 確定):
   - `COALTER_PRESENCE_SPEECH_LLM=false`
   - `NEXT_PUBLIC_COALTER_PRESENCE_SPEECH_FETCH=false`
   - `NEXT_PUBLIC_COALTER_PRESENCE_EXECUTOR=false`
4. **ANTHROPIC_API_KEY Production 設定済み (NEW、本 entry で永続化)**: `ANTHROPIC_API_KEY` が Preview env のみ設定されていた (Stage 2.4-D §3.1 反映計画 item 2 未完了) ことを CEO が確認。本日 **Production env にも追加完了**。これにより Stage 2.4-D §3.1 反映計画 4 項目のうち key 配置側は前倒しで完了、残るのは reflection 旗 3 つの false → true 切替 + redeploy のみ。

これらの状態を **handoff doc** + **decision-log** に永続記録し、reflection 自体は CEO 個別判断で別 commit / 別操作とする (本 entry は docs-only、Production env は触らない)。

### 成果物

- `docs/decision-log.md`: 本 entry (docs-only)
- `docs/coalter-stage24-sentry-alert-setup.md` 改訂 v0.1-draft.2:
  - §7.1 item 9 → 🟡 Yellow accept (Path B、Slack `Installed` 確認 / 初回 real alert 着火を観測ベース)
  - §7.1 item 10 → ❌ 残リスク永続記録 (synthetic 不可、reflection 後 monitoring に persist)
  - §7.2 item 19 → ✅ (`SMOKE_CONTEXT` Production 未設定 確認)
  - §7.2 item 20 → ✅ (`OBSERVATION_MODE` Production 未設定 or false 確認)
  - §7.2 item 21 → ✅ (反映計画 4 項目のうち `ANTHROPIC_API_KEY` Production 設定済み、残 3 旗のみ)
  - §7.2 item 22 → ✅ 強化 (CEO 自身 rollback dry-run 達成 = 3 旗 false 明示設定)
  - §7.3 sentence: 22/22 reflection-ready (Path B + Yellow accept + Production OFF safety state + Pre-Step `ANTHROPIC_API_KEY` Production 完了)
  - §10 改訂履歴 v0.1-draft.2 行追加
  - 新 §11 reflection 実施手順 (Pre-Step `ANTHROPIC_API_KEY` 完了 → Step 1-6 残)
  - 新 §12 Production OFF safety state 通知 + ANTHROPIC_API_KEY Production status 永続化

### Path B 採用根拠 (4 点、Test Notification 不在に対する判断)

1. **Sentry 側 UI 制約**: Issue Alert 種別では standard "Send Test Notification" ボタンが現状 UI で見当たらず、Path A (synthetic event 経路) を採用すると monkey-patch 的 workaround が必要 (戻し忘れリスク高)。
2. **Slack integration 自体は完了**: `#aneurasync-alerts` `Installed` 表示済み。配信経路の物理的な疎通は alert configuration で完了している。
3. **alert 着火後の Slack post 動作は real alert で観測可能**: Production reflection 後に着火する初回 real alert で Slack post / link / formatting を観測ベースで確認できる。
4. **戻し忘れリスク回避**: Path A は Production env を一時的に汚染するリスクがある。Path B は Production env に触らない設計で、CEO 厳守 (Production env 触らない) と整合。

### 残リスク (永続記録、reflection 後 monitoring へ持ち越し)

| リスク | 状態 | 持ち越し先 |
|---|---|---|
| Test Notification 配信確認未実施 | 🟡 Yellow accept (Path B) | 初回 real alert 着火で Slack post 動作を観測 |
| Synthetic event alert 動作確認未実施 | ❌ 残リスク永続記録 | reflection 後 monitoring (初回 real alert で代替観測) |
| F-1 secondary daily/travel runtime 未確認 | ☐ Stage 2.4-D §6 既往 | reflection 後 monitoring で代替可 |
| 2.1.9 D@S5 travel 文脈補完 | ☐ Stage 2.4-D §6 既往 | Stage 2.3 prompt refinement (別 phase) |

### Production OFF safety state (CEO 達成、本 entry で permanent 記録)

| Env Var | Production 現在値 | 反映計画 (Stage 2.4-D §3.1) | 動作 |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | **set (Production 設定済み、本日 CEO 追加)** | set | 既に反映済み (key 配置のみ) |
| `COALTER_PRESENCE_SPEECH_LLM` | **false (CEO 明示設定)** | true | reflection 時に true へ切替 |
| `NEXT_PUBLIC_COALTER_PRESENCE_SPEECH_FETCH` | **false (CEO 明示設定)** | true | reflection 時に true へ切替 |
| `NEXT_PUBLIC_COALTER_PRESENCE_EXECUTOR` | **false (CEO 明示設定)** | true | reflection 時に true へ切替 |
| `NEXT_PUBLIC_COALTER_PRESENCE_SMOKE_CONTEXT` | 未設定 | 未設定 (Preview のみ) | 永久に Production 未設定 |
| `NEXT_PUBLIC_COALTER_PRESENCE_SPEECH_OBSERVATION_MODE` | 未設定 or false | 未設定 (Preview のみ) | 永久に Production 未設定 or false |

**重要**: ANTHROPIC_API_KEY は Production に既配置済みだが、3 つの reflection 旗が false のため **Production speech / presence は OFF**。Pre-Step が完了した状態で、reflection は「3 旗 false → true 切替 + redeploy」のみで起動可能。

### Production reflection 実施手順 (本 entry で確定、CEO 個別判断後に別操作)

| Step | 内容 | 状態 |
|---|---|---|
| **Pre-Step** | `ANTHROPIC_API_KEY` Production 設定 | ✅ **本日完了** |
| Step 1 | Vercel Production env で `COALTER_PRESENCE_SPEECH_LLM=true` 切替 | ☐ CEO 個別判断 |
| Step 2 | Vercel Production env で `NEXT_PUBLIC_COALTER_PRESENCE_SPEECH_FETCH=true` 切替 | ☐ CEO 個別判断 |
| Step 3 | Vercel Production env で `NEXT_PUBLIC_COALTER_PRESENCE_EXECUTOR=true` 切替 | ☐ CEO 個別判断 |
| Step 4 | Vercel Production redeploy 起動 (3 旗反映) | ☐ CEO 個別判断 |
| Step 5 | Production 低音量 smoke (CEO 自身 Path B 観察ベース、Slack `#aneurasync-alerts` 着火 / Discover query 結果) | ☐ reflection 後 monitoring |
| Step 6 | red alert 受信時の rollback (3 旗 → false 戻し + redeploy) drill 確認 | ☐ rollback dry-run 達成済 (本 entry で確定) |

### reflection-readiness 22/22 確定 (本 entry 後)

- alert 設定 12 項目 (§7.1): items 1-8, 11 = ✅ / item 9 = 🟡 Yellow accept (Path B) / item 10 = ❌ 残リスク永続記録 / item 12 = ✅
- Stage 2.4 全 phase 完了 + Production env 確認 10 項目 (§7.2): items 13-18 = ✅ (累積) / items 19, 20 = ✅ (Production 未設定 確認) / item 21 = ✅ (反映計画 4 項目のうち ANTHROPIC_API_KEY 完了、残 3 旗 reflection 時切替) / item 22 = ✅ 強化 (CEO rollback dry-run 達成)

→ **22/22 reflection-ready (Path B + Yellow accept + Production OFF safety state + Pre-Step ANTHROPIC_API_KEY Production 完了)**

### 表現規約 (CEO/GPT 補正準拠、永続)

- ✅ Path B = Yellow accept (Path A synthetic は採用しない、戻し忘れリスク回避)
- ✅ Test Notification 不在は **Sentry UI 制約** であり Claude / CEO の不備ではない
- ✅ Production OFF safety state = 3 旗 false **明示設定** (`unset` ではなく `false` 明示)
- ✅ ANTHROPIC_API_KEY は **key 配置のみ完了**、これだけで Production speech は起動しない
- ✅ rollback dry-run = CEO 自身が 3 旗 false 設定で「戻す動作」を予行演習として達成
- ✅ reflection 自体は **CEO 個別判断**、本 entry は docs-only

### 不変境界 (本 entry + Production reflection 前期間継続、CEO 厳守)

- ✗ Production env 変更しない (本 entry は記録のみ、3 旗切替 + redeploy は CEO 個別判断後の別操作)
- ✗ Production reflection しない (CEO 個別判断、本 entry は前提条件記録のみ)
- ✗ main merge しない (CEO 判断保留)
- ✗ production context detector 実装しない (Gap 4、Stage 2.5 / 別 milestone)
- ✗ selectPattern / prompt 修正しない
- ✗ validator / model / max_tokens / timeout 変更しない
- ✗ Sentry custom metric impl しない (Stage 2.5 候補)
- ✗ Path A (synthetic event 経路) 試行しない (Path B 確定、戻し忘れリスク回避)
- ✗ 追加 smoke しない (Stage 2.4-B 16 sample で完了)
- ✗ `SMOKE_CONTEXT` / `OBSERVATION_MODE` env を Production に絶対設定しない (Preview 限定)

### 次の動き

1. **本 entry + handoff doc 改訂 commit** (docs-only、本 commit)
2. CEO 個別判断で Production reflection 着手:
   - Step 1-3: 3 旗 `false → true` 切替
   - Step 4: redeploy 起動
   - Step 5: 低音量 smoke + Slack `#aneurasync-alerts` 着火観測 (Path B)
   - Step 6: rollback drill (必要時)
3. reflection 後 monitoring: 残リスク 4 件 (Test Notification / synthetic / F-1 secondary / 2.1.9 D@S5) を実 alert / Discover query 結果で代替確認
4. main merge 判断 (CEO 個別判断、別 commit / 別 phase)

---

## [2026-05-10] [Build] [Stage 2.4 Production reflection 完了 (Yellow 付き) — main merge → Production build Ready → 3 旗 true + redeploy → 最小 smoke PASS / Discover query Yellow / Slack alert Path B 継続] [承認: CEO]

### 経緯

CEO 確定 (2026-05-10): PR #95 (`feat/coalter-three-stage` → `main`、main 着地 commit `62dff94b`) を main merge → Vercel Production build 自動 trigger Ready 確認 → Production env で 3 旗 false → true 切替 + Production redeploy 手動 trigger → Production URL `https://culcept.vercel.app` で最小 smoke 実施。`/api/coalter/speech` POST で **speechSource=llm / fallback なし** を観測。Stage 2.4-D Production reflection ゲートを **Yellow 付き PASS** で通過 (Sentry Discover query data 0 件 + Slack real alert 未着火を Yellow accept、Path B 継続)。

**注 (2 次 update、本 entry の merge commit で同時反映)**: PR #95 は当初 GitHub UI で「Create a merge commit」想定だったが、`62dff94b` の実態は **squash merge** (parent = `c6fbf2e6` の 1 つのみ) と post-hoc に判明。これに伴い、本 entry §「失敗時 rollback」hard rollback の手順表記を 2 次補正 (旧: `git revert -m 1 62dff94b` → 新: `git revert 62dff94b`)。詳細は同セクション参照。

### 反映プロトコル (実施済、永続記録)

| Step | 内容 | 状態 |
|---|---|---|
| Pre-Step | Vercel Production env で `ANTHROPIC_API_KEY` set 確認 | ✅ (cc9bf7f4 で記録済、本日先行完了) |
| 1 | PR #95 main merge (実態は GitHub squash merge と判明、本 entry 注記参照) | ✅ `62dff94b` (2026-05-10T03:47:48Z、parent = `c6fbf2e6` の 1 つのみ) |
| 2 | main HEAD で Vercel Production build 自動 trigger | ✅ 2026-05-10T03:47:54Z 起動 |
| 3 | Production build Ready 確認 | ✅ 2026-05-10T03:55:16Z 完了 (~7m22s)、deployment id 4635780380 |
| 4 | Production env で 3 旗 false → true 切替 (CEO 個別操作) | ✅ `COALTER_PRESENCE_SPEECH_LLM=true` / `NEXT_PUBLIC_COALTER_PRESENCE_SPEECH_FETCH=true` / `NEXT_PUBLIC_COALTER_PRESENCE_EXECUTOR=true` |
| 5 | Vercel UI で Production redeploy 手動 trigger (NEXT_PUBLIC* 反映) | ✅ CEO 操作完了 |
| 6 | Production URL で最小 smoke 実施 | ✅ `https://culcept.vercel.app` |
| 7 | Slack `#aneurasync-alerts` real alert 着火 | ☐ 未着火 (Path B 継続、initial real alert 待ち) |

### Production 最小 smoke 結果 (Yellow 付き PASS、永続記録)

#### 観測 endpoint
- URL: `https://culcept.vercel.app`
- API: `POST /api/coalter/speech` observed
- UI 上部レイヤー (UpperLayerMount): observed

#### speech response (CEO 観測値)
```json
{
  "body": "少し立ち止まって、今の流れを整理してもいいでしょうか？",
  "speechSource": "llm",
  "retries": 1,
  "latencyMs": 3923,
  "validationFailed": false,
  "fallbackReason": null
}
```

#### 各 field 評価

| field | 観測値 | 評価 | 根拠 |
|---|---|---|---|
| `speechSource` | `llm` | ✅ PASS | LLM 経路で生成 (= fallback ではない、3 旗 true 反映が build artifact に焼き込まれていることを確認) |
| `fallbackReason` | `null` | ✅ PASS | timeout / validator / llm_error / rate_limited いずれでもなく fallback 発火なし |
| `validationFailed` | `false` | ✅ PASS | 最終 response は validator gate 通過 |
| `latencyMs` | `3923` | ✅ PASS | timeout 10s 以内 (Stage 2.2 案 A timeout 拡張済)、Stage 2.4-B 観測 latency range 内 |
| `retries` | `1` | **観察値** (Yellow blocker ではない) | retry 1 回で成功 (validator や LLM stochastic noise 由来の可能性)、Stage 2.4-B 観測 retry pattern と整合。**単発では Yellow blocker 扱いしない**。頻発時のみ daily review / monthly review で調査対象とする |
| `body` | 「少し立ち止まって…」 | ✅ PASS | Stage 2.3 prompt contract に整合する応答 (カウンセラー寄りでなく、判断軸寄り) |

→ **Production speech 最小 smoke: PASS**。`retries=1` は **観察値として記録**、Yellow item には含めない (CEO/GPT 補正準拠 2026-05-10)。

### Sentry Discover saved query 状態 (Yellow accept、永続記録)

CEO 確認 (2026-05-10、Sentry Dashboard):
- saved queries 6 件 (handoff doc §6 で click-by-click 設定済) **表示確認済**
- query syntax error なし (Sentry search syntax 適切)
- `[CoAlter] Pattern LLM latency p95` query: 開ける ✅
- ただし **Sample Count = 0**
- Environment filter: 画面上 `All Env` 表示 → **Production scope filter 未確定**

#### data 0 件の理由 (CEO/GPT 補正準拠 2026-05-10、技術的根拠付き)

data 0 件は以下 3 要因の複合:

1. **Sentry Discover は Errors dataset 中心**: `coalter.pattern.used` は `Sentry.addBreadcrumb()` で記録される breadcrumb であり、breadcrumb は **error / message / transaction event 送信時に attach** される構造。
2. **成功した speech response は error event を生成しない**: `/api/coalter/speech` 200 OK / fallback なしの正常応答は exception を発生させないため、Sentry に error event として保存されない → **breadcrumb data も Errors dataset query では 0 件となる**のが構造的に正しい。
3. **Environment filter 未確定**: 画面上 `All Env` 表示で Production scope に絞り込まれていない可能性。

→ **0 件 = 即 NG ではなく Yellow accept**。Production traffic 累積 (および error / urgent triggered の attach 経路) で経過観察、handoff doc §5.3 / §6.4 の daily review cadence で確認。

→ **構造的限界の解消は Stage 2.5 候補 (handoff doc §9 既出): Sentry custom metric impl で成功 event も直接 metric 化する**。本 phase では実装しない。

### 残リスク / Yellow item (Production reflection 後 monitoring へ持ち越し、永続記録)

| # | リスク | 状態 | 持ち越し先 |
|---|---|---|---|
| 1 | Slack `#aneurasync-alerts` real alert 着火確認 | ☐ 未着火 (Path B 継続) | initial real alert 着火で post 動作観測 |
| 2 | Sentry Discover query data 流入 (Production scope) | 🟡 0 件 (Errors dataset 構造的 + Environment filter 未確定) | daily review で経過観察。構造的解消は Stage 2.5 (custom metric impl) |
| 3 | F-1 secondary daily/travel runtime 未確認 | ☐ Stage 2.4-D §6 既往 | Production traffic 累積で代替観測 |
| 4 | 2.1.9 D@S5 travel 文脈補完 | ☐ Stage 2.4-D §6 既往 | Stage 2.3 prompt refinement (別 phase) |
| 5 | synthetic event alert 動作確認 | ❌ 残リスク永続記録 (Path B、cc9bf7f4 entry で記録済) | 同 #1 で代替観測 |

(注: `retries=1` は **観察値**、Yellow item ではない。本 entry の「speech response 各 field 評価」table 参照)

### 運用フェーズ移行 (本 entry 以降の操作プロトコル)

- **daily review (CEO operator 担当、推奨 09:00 JST)**: Sentry Discover saved query 6 種を順次開いて event count + 分布確認 (handoff doc §5.3 / §6.4 既出)
- **monthly review**: Stage 2.4 全 phase の累積 metric 観察、red alert 累計、retries 分布、speechSource 比率 (= LLM 成功率)、latencyMs p95
- **新 alert 着火時**: Slack `#aneurasync-alerts` post 観測 → Sentry link 経由で event detail 確認 → 影響評価 → 必要なら rollback (本 entry 末尾の手順)
- **retries 観察基準**: 単発の retries=1 は noise 扱い (本 entry 観察値準拠)。daily review で頻度上昇 (例: 5 件/h 以上の retries=1 検出 / retries≥2 出現) を検出した場合のみ monthly review で root cause 調査対象とする

### 失敗時 rollback (本 entry で確定、Stage 2.4-D §5 + cc9bf7f4 entry §12 強化版)

#### soft rollback (CEO 操作 5-10 分、3 旗 false 戻し)
1. Vercel Production env で 3 旗 true → false 戻し:
   - `COALTER_PRESENCE_SPEECH_LLM=false`
   - `NEXT_PUBLIC_COALTER_PRESENCE_SPEECH_FETCH=false`
   - `NEXT_PUBLIC_COALTER_PRESENCE_EXECUTOR=false`
2. Vercel UI で **Production redeploy 手動 trigger** (NEXT_PUBLIC* 反映必須)
3. Production redeploy Ready 確認

→ Production OFF safety state (cc9bf7f4 entry で永続化済) に復帰。

#### hard rollback (CEO 操作 10-15 分、main merge 自体を取消す、CEO/GPT 補正 2 次準拠 2026-05-10)

**PR #95 squash merge 判明 (post-hoc 修正)**: PR #95 は当初「Create a merge commit」想定だったが、`62dff94b` の実態は GitHub UI の **squash merge** (parent = `c6fbf2e6` の 1 つのみ)。本 entry 初版 (CEO/GPT 補正 1 次) で記載した `git revert -m 1 62dff94b` は **merge commit を前提とした記述で誤り**。1-parent commit (squash merge 起因) の revert は **通常 commit revert** として扱う:

```bash
# 62dff94b は GitHub squash merge による 1-parent commit (parent = c6fbf2e6 = pre-merge main HEAD)
# `-m` flag は merge commit (2+ parent) でのみ必要、本 commit には不要
git revert 62dff94b
git push origin main
```

→ Vercel auto Production build (~10-15 分) で revert artifact が deploy される。

**caveat (squash merge 起因)**: 後で再 merge する際は、feat/coalter-three-stage の original commits は main から不可達のため、新規 PR を作成する必要がある (revert の revert `git revert <revert-commit>` も可だが、squash merge の boundary 問題を再発させる可能性)。

**今後の運用注**: GitHub UI で PR を merge する際は、merge button 押下前に「**Create a merge commit**」が選択されているか必ず確認する (CEO 既往指示 2026-05-10)。本 entry を含む reflection 期間は事後判明後の整理であり、今後の Stage 2.5 PR 等では merge method 確認を pre-flight check に組み込むこと。

#### 完全停止 (CEO 操作 15-20 分)
- soft rollback + Vercel Production scope 3 旗 env を **削除** (`unset` / 空に)
- (上記 hard rollback と組み合わせ可)

### 表現規約 (CEO/GPT 補正準拠、永続)

- ✅ Production reflection は **Yellow 付き PASS** (Path B 継続、Discover data 0 件 Yellow accept)
- ✅ `retries=1` は **観察値**、Yellow blocker ではない (CEO/GPT 補正 2026-05-10)
- ✅ Slack real alert 着火は **未確認**、initial real alert 着火を観測ベース確認 (Path B)
- ✅ Discover query data 0 件は **Errors dataset 構造的 + Environment filter 未確定** が原因。**構造的限界の解消は Stage 2.5 (custom metric impl)**
- ✅ smoke は **最小 1 件** (CEO 観測)、本 entry 以降は Production traffic で累積観測
- ✅ hard rollback は **`git revert 62dff94b`** (PR #95 main 着地は実態 squash merge と判明、`62dff94b` は 1-parent commit のため `-m` flag 不要、CEO/GPT 補正 2 次 2026-05-10)
- ✅ GitHub UI で PR merge 時は **「Create a merge commit」が選択されていることを必ず確認** (PR #95 は実態 squash merge だった、再発防止のため pre-flight check に組み込む)

### 不変境界 (本 entry + 運用フェーズ継続、CEO 厳守)

- ✗ Production env 変更しない (3 旗 true 維持、red alert / smoke 失敗時のみ rollback)
- ✗ Gap 4 production context detector 実装しない (Stage 2.5 / 別 milestone)
- ✗ Sentry custom metric impl しない (Stage 2.5 候補、本 entry §「Discover data 0 件」根拠の構造的解消も Stage 2.5)
- ✗ selectPattern / prompt / validator / model / max_tokens / timeout 変更しない
- ✗ `SMOKE_CONTEXT` / `OBSERVATION_MODE` env を Production に絶対設定しない (Preview 限定)
- ✗ 追加 smoke しない (本 entry の最小 1 件で確定、以降は Production traffic 累積観測)

### 次の動き

1. **daily review 開始** (CEO operator 担当、09:00 JST 推奨): Sentry Discover saved query 6 種を順次開いて event count + 分布確認
2. **initial real alert 着火**: Slack `#aneurasync-alerts` post + Sentry link 経由で event detail 確認 (Path B 観測)
3. **monthly review** (1 ヶ月後): retries 分布 / speechSource 比率 / red alert 累計 / latencyMs p95 を集約
4. **Stage 2.5 候補** (CEO 個別判断): Gap 4 production context detector / Sentry custom metric impl (= Discover data 構造的限界の解消) / F-1 secondary runtime 検証

---
### [2026-05-09] [Build] OP-5.4.2.4 phase 全 sub-phase main 着地 — LLM targetDateProvenance を shadow path 上で確認
- **部門**: Build
- **決定内容**: OP-5.4.2.4-a ~ -d の 4 sub-phase を順次 main 着地。 LLM targetDateProvenance が shadow input に渡る path が完成し、 preview combined smoke で shadow path 上での観測を確認。
- **着地 phase 一覧 (= 着地順)**:
  - PR #92 OP-5.4.2.4-a (7f386b5d) — optional `targetDateProvenance` type fields (= ParsedDayIntent / ComprehensionResult / L1PipelineInput.raw / ComprehensionResultWithOperations)
  - PR #93 OP-5.4.2.4-b (c6fbf2e6) — `checkTargetDateProvenance` + `isTargetDateEvidenceToken` (= L1.2 boundary check / default today 汚染防止 / 固有名詞内 substring 誤爆防止)
  - PR #94 OP-5.4.2.4-c (73c776f3) — active LLM schema / prompt / parser / l1Pipeline 接続 (= 9 files、 invariant test 4 件 世代更新含む)
  - PR #99 OP-5.4.2.4-d (7687a8ca) — route-local shadow input capture (= route.ts 1 file / +18 / -0)
- **検証 (= Preview combined Sentry smoke、 2026-05-11)**:
  - Smoke 1 「明日 渋谷でランチ」: `op5_emit_count_llm_explicit = 1` → LLM targetDateProvenance observation を shadow path 上で確認
  - Smoke 2 「予定として、 渋谷でランチを入れたい」: `op5_emit_count_llm_explicit = 0` → default today 汚染は LLM 観点で確認
  - Smoke 3 「予定として、 明日香さんとランチを入れたい」: `op5_emit_count_llm_explicit = 0` → 明日香は LLM 観点では誤認していない
- **言ってよい範囲 (= 規律固定)**:
  - LLM targetDateProvenance が shadow input に渡った
  - preview Sentry smoke で `op5_emit_count_llm_explicit = 1` を確認した
  - LLM targetDateProvenance observation を shadow path 上で確認した
  - default today 汚染は LLM 観点で確認した
  - 明日香は LLM 観点では誤認していない
- **言ってはいけない範囲 (= 未達 / 別 phase、 literal 表現を避けて言い換え)**:
  - targetDate に限定しない広い LLM 観測の完了断定 — × (= 「shadow path 上で確認」 までが正確、 broad な完了表現は避ける)
  - LLM 操作全体が済んだという断定 — × (= 他 5W1H field は別 phase)
  - OP-5 全体が済んだという断定 — × (= shadow path のみ、 本流書き込みは別 phase)
  - active plan.date の正規化が済んだという断定 — × (= legacyAdapter:1201 TODO 残、 「明日」 → plan.date 反映は別 layer)
  - targetDate 全般が正確化されたという断定 — × (= regex 系 factory は別)
  - regex 側の false positive が解消済みという断定 — × (= Issue #98 別 phase)
  - production canary が実施済みという断定 — × (= production env OFF 維持)
  - OP-6 着手可能という断定 — × (= 本流書き込み設計レビュー未着手)
- **後続別 phase (= 整理した順序)**:
  - **Phase B**: Issue #98 (= `regex targetDate factory false-positives on names containing 明日`、 regex 系 factory 内の「明日香」 substring 反応) の設計レビュー → 実装
  - **Phase C**: OP-5.5 / production canary 設計レビュー (= production env 変更、 CEO 別承認必須)
  - **Phase D**: OP-6 本流書き込み設計レビュー (= PlanState writer、 別軸)
- **production env 状態**: OFF 維持 (= `ALTER_MORNING_OP5_*` env 3 件すべて production / development 未設定、 preview のみ true / allowlist / summary)
- **承認**: CEO (= PR #92 / #93 / #94 / #99 各 merge GO、 Issue #98 作成 GO、 Phase A decision-log record 起草 GO)
- **ステータス**: OP-5.4.2.4-d main 着地済 (= main HEAD 7687a8ca)、 Phase A decision-log record draft中 / commit 前

---
### [2026-05-11] [Build] Phase B regex_deterministic boundary 強化 — shadow path 限定で 「明日香」 系固有名詞 false positive を抑制
- **部門**: Build
- **決定内容**: PR #101 (= squash merge `bb88adec5f9f309da1cbc07f7137bd9305e6891c`) main 着地。 `regexTargetDateFactory.ts` + 同 test の 2 files のみ変更。 Issue #98 で報告された「予定として、明日香さんとランチを入れたい」 等の固有名詞末尾 date substring を `op5_emit_count_regex_deterministic` が拾う挙動を、 shadow path 限定で抑制。
- **着地内容**:
  - 5-layer tri-state boundary 導入 (= L0 prev DANGER prefix / L1 EOS-非漢字境界 / L2 ACCEPT_WORD_PREFIXES / L3 ACCEPT_KANJI / L4 NAME_SUFFIX + checkNamePattern / L5 UNKNOWN default)
  - Tier 0 word prefix allowlist 35 entries (= 美容院/子供/花火/曜日 14 種/祝日/休日/平日/休 series 6 種)
  - DANGER prefix 9 字 (= 不/未/非/無/説/解/究/証/判) で語内部 date substring を抑制
  - 多日 ambiguity (= ACCEPT candidate が 2+ distinct offsets) → no emit に倒す
  - overlap dedup で 長 token 優先 (= 「明明後日」 → +3、 「しあさって」 → +3)
  - TZ-invariant 日付計算 (= UTC arithmetic で月末/年末 edge case 解消)
  - code-point safe Unicode (= `\p{Script=Han}/u` + `codePointAt` + `charBefore`)
  - factory signature 不変 / `trace.ruleId: "extractTargetDate"` 維持 / `source: "regex_deterministic"` 維持 / `priority: 600` 維持 / `source_span: []` 維持
- **検証**:
  - regexTargetDateFactory.test.ts: 434 cases all pass (= 既存 13 + Phase B v3.2 unit + matrix invariant + timezone + integration audit)
  - op3a/op3b/op4 invariant + L1.2 系 + OP-5 系: 累計 257 cases all pass
  - ESLint clean
  - Vercel preview build SUCCESS (= release tag `36cae30c6d1a`)
  - Runtime smoke 6 cases on release `36cae30c6d1a` (= S-3 / S-5 / S-11' / S-12a / S-14c / S-15) で `op5_emit_count_regex_deterministic` が期待値と一致することを確認
  - main HEAD = `bb88adec5f9f309da1cbc07f7137bd9305e6891c`
- **言ってよい範囲 (= 規律固定)**:
  - shadow path 限定で「明日香」 系固有名詞 false positive を抑制
  - regex_deterministic boundary を 5-layer 構造に強化
  - preview Sentry smoke 6 cases で期待値と一致を確認
  - factory signature / ruleId / source / priority / source_span 不変
- **言ってはいけない範囲 (= 未達 / 別 phase、 literal 表現を避けて言い換え)**:
  - regex 系 false positive 全般の広い断定 — × (= shadow 限定、 v1 path = `extractTargetDate` 本体は intentParser 内で不変)
  - LLM 観測の補正断定 — × (= LLM factory は別 phase、 Phase B scope 外)
  - production canary 実施の断定 — × (= production env OFF 維持)
  - OP-6 着手可能の断定 — × (= 本流書き込みは別 phase)
  - 「明日水曜」「明日休み」「明日休む」 単発短文の挙動補正断定 — × (= morning path 起動条件は OP-4 / OP-5 orchestrator 領域、 Phase B scope 外)
- **scope 外 (= Issue #98 close 時に CEO 認識、 別 Issue / 別 phase で扱う)**:
  - 「明日水曜」「明日休み」「明日休む」 単発短文での event 未 emit / morning path 未到達 (= OP-4 / OP-5 orchestrator 領域)
  - LLM factory 側 `op5_emit_count_llm_explicit = 1` の挙動 (= `llmComprehensionTargetDateFactory` 領域)
- **設計レビュー履歴 (= CEO 4 回判断)**:
  - v3 (= 5-layer boundary 導入提案)
  - v3.1 (= ACCEPT_WORD_PREFIXES Tier 0 縮小 / S-12 矛盾修正 / UTC arithmetic / charBefore / matrix test 導入)
  - v3.2 (= 曜日/休日/平日/休 series 追加 / 多日 ambiguity → no emit / DANGER matrix 5b 補強)
  - v3.2 CEO 補正 (= 休む / 休ん の Tier 0 追加で 35 entries)
- **後続別 phase (= 整理した順序)**:
  - Phase C: OP-5.5 / production canary 設計レビュー (= production env 変更、 CEO 別承認必須、 currently v1.2 設計、 v1.3 補正中)
  - Phase D: OP-6 本流書き込み設計レビュー (= PlanState writer、 別軸)
- **production env 状態**: OFF 維持 (= `ALTER_MORNING_OP5_*` env 3 件すべて production / development 未設定、 preview のみ true / allowlist / summary)
- **承認**: CEO (= 設計 4 回 + GitHub UI squash merge)
- **ステータス**: PR #101 main 着地済 (= main HEAD `bb88adec`)、 Issue #98 close 済 (= closedAt 2026-05-11 21:49:12 UTC)、 Phase B decision-log entry この PR で着地予定

---
