# CoAlter Always-On Observer — Presence Layer Reconciliation

**ステータス**: 訂正正本（docs-only PR）
**作成日**: 2026-05-16
**前提変更**: 本ドキュメントは PR #151（design doc）/ PR #152（A-0 audit）/ PR #153（A-1 implementation）に含まれる**重大な見落とし**を訂正する。
**承認**: CEO/GPT 判断「並走、ただし型整合必須」（2026-05-16）

---

## 0. Executive Summary

### 0.1 訂正の核心

**PR #151 / #152 / #153 は、既存 Stage 4 で実装済の Presence Layer を完全に見落として進められた。**

具体的には、Always-On Observer の core architecture は既に `lib/coalter/presence/` と `app/components/chat/` で実装され、production deploy 済 (`NEXT_PUBLIC_COALTER_PRESENCE_EXECUTOR=true`)。

私（Claude）が「これから設計する」と書いた 6 Layer は、ほぼ全て既存実装に該当する:

| 私の PR #151 の名称 | 既存実装 (origin/main `ea230df9` 時点) | 役割 |
|---|---|---|
| Layer 1: Mode Layer | `lib/coalter/presence/types.ts` PresenceMode + `app/components/chat/ModeSwitcher.tsx` | 通常/Daily/Travel mode 切替 |
| Layer 2: Observer Loop | `lib/coalter/presence/signalAdapter.ts` | implicit signal 検出 (温度差/膠着/片側沈黙/共同課題) |
| Layer 3: Relationship State | `lib/coalter/presence/sharedState.ts` | 9 件の shared state、server 正本、両 client broadcast |
| Layer 4: Speak Decision Engine | `lib/coalter/presence/reducer.ts` (S0-S8 state machine) | 介入価値閾値判定、cooldown |
| Layer 5: Generation Layer | `app/components/chat/UpperLayerMount.tsx` + UrgentLayer + MemorySurface | 上部レイヤー mount |
| Layer 6: UI | `ModeSwitcher.tsx` + 17 components in `app/components/chat/` | radiogroup（通常/Daily/Travel）+ presence UI |

### 0.2 訂正後の正本

- Always-On Observer は**新規 mode UI を前提にしない**
- 既存 Presence Layer を前提にする
- CoAlter Normal / Daily / Travel は既存 `PresenceMode` と整合させる
- Phase A は既存 presence layer を**壊さない**（responsibility separation）

### 0.3 影響範囲

| Artifact | 影響 | 対応 |
|---|---|---|
| PR #151 (design doc) | Layer 1-6 設計の大半が既存実装の再発明 | 本 PR で正誤対照表 + correction section 追加 |
| PR #152 (A-0 audit) | 「mode UI is absent」結論は誤り | 本 PR で訂正 section 追加 |
| PR #153 (A-1 implementation) | runtime-unwired なので revert 不要、ただし型整合は必須 | 本 docs で A-1b 方針提示、別 PR で実装 |
| A-2 hook 計画 | message route hook 案は presence signal bus 経路を考慮していない | 本 docs で再評価、別 PR で改めて audit |
| 不変境界 | presence layer 既存 file 触らない原則を明示 | 本 docs で明文化 |

---

## 1. A-0 audit の致命的見落とし

### 1.1 誤った結論

PR #152 (`docs/coalter-aoo-phase-a0-mode-state-audit.md`) §0.1 は次のように結論した:

> 「通常 / Daily / Travel」mode tabs UI は、現状の main 上に存在しません（main HEAD = `a86558a4` 時点）。

これは**誤り**。同じ main HEAD 時点で `app/components/chat/ModeSwitcher.tsx` (blob `9834cf0f`) が存在し、内部に「通常 / Daily / Travel」LABELS を持つ完全実装済 component が存在した。

### 1.2 訂正後の事実

- `app/components/chat/ModeSwitcher.tsx` 実在 (67 行、`9834cf0f`)
  - `LABELS = { normal: "通常", daily: "Daily", travel: "Travel" }`
  - `role="radiogroup"`、`data-testid="coalter-mode-switcher"`
  - JSDoc: "Stage 4 L4-f — ModeSwitcher (本番化、preview L1-g 移植)"
- `lib/coalter/presence/types.ts` (line 56): `export type PresenceMode = "normal" | "daily" | "travel"`
- `lib/coalter/presence/` に 30+ files (modeReducer / modeContextManager / modeEscalationDetector / modeReturnLogic / sentryTelemetry / reducer / signalAdapter / sharedState / signalClassifier / patternSelector / productionSignalBus / 他)
- `app/components/chat/` に 17 files (UpperLayerMount / ModeSwitcher / AutoEscalationBanner / ModeReturnPrompt / UrgentLayer / MemorySurface / 他)
- PR #49 (2026-04-30) で main 着地、`NEXT_PUBLIC_COALTER_PRESENCE_EXECUTOR=true` で production deployed
- Sentry breadcrumb 経路 `coalter.mode.transition` 設計済（Plan D L4-j Phase 1 wire 済）

### 1.3 見落としの原因

| 失敗 | 詳細 |
|---|---|
| **検索 directory が狭すぎた** | `components/coalter/` のみ grep。実際の mode UI は `app/components/chat/` と `lib/coalter/presence/`（**完全別 directory**） |
| **キーワード戦略が不適切** | 「tab」で検索したが実装は `role="radiogroup"`（HTML tabs 要素ではない） |
| **「ModeSwitcher」component 名を知らなかった** | mode UI = "tabs" と思い込み、`ModeSwitcher` で逆引きしなかった |
| **`PresenceMode` 型から逆引きしなかった** | `lib/coalter/presence/types.ts:56` という canonical 型定義に到達できず |
| **「presence layer」という別系統の存在に気付かなかった** | CoAlter UI = `components/coalter/*` と決め打ちし、presence/upper layer を見落とし |

### 1.4 学び（再発防止）

- 「無い」を結論する前に**複数 directory pattern で確認**する
- UI 機能の検証は型から逆引きする（`PresenceMode`, `ModeContext` 等の typed identifier 検索）
- 「tabs」のような HTML semantics 用語ではなく、機能的キーワード（"normal", "daily", "travel"）で grep する
- 別セッション report の主張を**鵜呑みにせず徹底検証**することで、自分の誤りも検出できる（今回の事例）

---

## 2. 既存 Presence Layer の構造（正本記録）

### 2.1 Core Types (`lib/coalter/presence/types.ts`)

| Type | 値 | 役割 |
|---|---|---|
| `PresenceState` | S0–S8 (9 段階) | Core state machine。S0=見守り / S1=介入気配 / S2=入口発話 / S3=返答待ち / S4=理解更新中 / S5=橋渡し中 / S6=提案可能 / S7=提案表示 / S8=クールダウン |
| `PresenceMode` | normal / daily / travel | 3 モード。通常が本体、Daily/Travel は明示昇格 |
| `PatternVariant` | A / B / C / D / E / F1 / F2 | 7 種発話パターン |
| `PatternFamily` | A / B / C / D / E / F | 6 種 family (F1+F2 → F に collapse) |
| `ExecutorAvailability` | disabled / inactive / pending_consent / enabled / active | Lifecycle |
| `SignalKind` | explicit / implicit / critical / mode_promotion / manual_restart | Signal 5 分類 |
| `SignalStrength` | strong / soft / none | Signal 強度 3 段階 |
| `PresenceSignal` | `{ kind, strength, detectedAt, meta }` | Signal payload |

### 2.2 Logic Layer (`lib/coalter/presence/*.ts`、30+ files 主要のみ)

| File | 責務 |
|---|---|
| `reducer.ts` | S0-S8 PresenceReducer (signal 5 分類 → state 遷移) |
| `transitions.ts` | 遷移許可 matrix |
| `signalAdapter.ts` | executor 事実 → presence signal 変換 (Adapter Pattern) |
| `signalClassifier.ts` | strength 分類 (strong/soft/none) |
| `modeReducer.ts` | mode 状態機械 (Daily ↔ Travel 直接遷移禁止) |
| `modeContextManager.ts` | mode 遷移時の文脈継承 (memoryStore in/out) |
| `modeEscalationDetector.ts` | 自動 mode escalation 検出 |
| `modeReturnLogic.ts` | normal 復帰 logic |
| `sharedState.ts` | 9 件の shared state interface (server 正本) |
| `productionSignalBus.ts` | event bus |
| `sentryTelemetry.ts` | `coalter.mode.transition` breadcrumb |
| `patternSelector.ts` | pattern variant 選択 |
| `cooldownResolver.ts` | S8 cooldown 判定 |
| `availability.ts` | ExecutorAvailability lifecycle |
| `memoryStore.ts` / `memoryTypes.ts` / `memoryConstraints.ts` / `memoryLabelHierarchy.ts` / `memoryVisualType.ts` | Memory Surface (上部レイヤー記憶機構) |
| `criticalKeywordDetector.ts` | 緊急検出 |
| `contextDetector.ts` / `contextDetectionMode.ts` | コンテキスト検出 |
| `rateLimitGuard.ts` | rate limit |
| `optimisticReconcile.ts` | optimistic UI 調停 |
| `clientObservationReceive.ts` | client observation receive |
| `llmCall.ts` | LLM 呼び出し境界 |
| `rejectionReducer.ts` | rejection state |
| `reentryConditions.ts` | reentry 条件 |
| `observationEvent.ts` | observation event |
| `calibrationAnalyzer.ts` | calibration analyzer (Gap 4 系) |

### 2.3 UI Layer (`app/components/chat/*.tsx`、17 files)

| File | 役割 |
|---|---|
| `UpperLayerMount.tsx` | Presence executor flag 有効時の上部レイヤー mount (49 lines+) |
| `ModeSwitcher.tsx` | 通常/Daily/Travel radiogroup chips (67 lines) |
| `AutoEscalationBanner.tsx` | mode auto-escalation 通知 banner |
| `ModeReturnPrompt.tsx` | normal 復帰 prompt |
| `UrgentLayer.tsx` | 緊急介入視覚層 |
| `UrgentMessageCard.tsx` | 緊急 message card |
| `UrgentRelease.tsx` | 緊急 release |
| `MemorySurface.tsx` | 上部レイヤー記憶 surface |
| `MemoryItemCard.tsx` | memory item card |
| `MemoryAccessRail.tsx` | memory access rail |
| `RetreatRail.tsx` | retreat rail |
| `VisibilityControls.tsx` | visibility controls |
| `RejectionFlows.tsx` | rejection flows |
| `CoAlterConsentFlow.tsx` / `CoAlterDisabledUi.tsx` / `CoAlterReactivationFlow.tsx` | consent/disabled/reactivation flows |
| `HandoffButton.tsx` | handoff button |
| `PresenceSignalWiring.tsx` | presence signal wiring |
| `hooks/usePresenceExecutor.ts` (内部 dir) | presence executor hook (mount logic) |
| `states/*` (内部 dir) | UpperLayerStateRenderer / ErrorBoundary / Loading / Empty Fallbacks |

### 2.4 既存実装の特性

- `flag OFF` (`COALTER_FLAGS.presenceExecutorEnabled` = false) で既存 ChatClient 完全不変
- `flag ON` で `usePresenceExecutor` mount → `UpperLayerStateRenderer` render → ModeSwitcher / UrgentLayer / MemorySurface mount
- `ChatClient.tsx` は touch ゼロ（props 影響なし、`useParams` で threadId 取得）
- production deployed: `NEXT_PUBLIC_COALTER_PRESENCE_EXECUTOR=true`
- Sentry breadcrumb: `category="coalter.mode" / message="coalter.mode.transition"`

---

## 3. 設計重複の評価

### 3.1 私の PR #151 design doc との対応関係

| 私の PR #151 の concept | 既存実装での同等物 | 重複度 |
|---|---|---|
| Mode Layer (off / normal / daily / travel) | `PresenceMode` + `ExecutorAvailability` + `ModeSwitcher` + `modeReducer` | 100% |
| Observer Loop (debounced message-level analysis) | `signalAdapter` (implicit signal 検出: 温度差/膠着/片側沈黙/共同課題) | 90% |
| Relationship State (alignment / rupture / phase / silence_budget) | `sharedState` + `PresenceState` (S0-S8) | 70%（一部独自） |
| Speak Decision Engine (STAY_SILENT default, Negative Capability) | `reducer.ts` の S0 常駐 + 介入価値閾値 + cooldownResolver | 100% |
| Generation Layer (Mirror / Question / Proposal channels) | UpperLayerMount + UrgentLayer + MemorySurface + PatternVariant A-F2 | 80% |
| UI Layer (button + mode tabs) | ModeSwitcher + 17 components | 100% |

### 3.2 私の PR #153 A-1 deliverable の固有価値分析

`lib/coalter/observer/relationshipState*.ts` の機能を既存 presence layer と比較:

| 機能 | 私の A-1 | 既存 presence layer | 固有価値 |
|---|---|---|---|
| State 保持 (key → value) | `module-level Map<string, InternalRelationshipState>` | `sharedState` (server 正本、両 client broadcast) | ❌ (既存が優位) |
| Mode 管理 | `ModeContext = "unknown"\|"off"\|"on"` | `PresenceMode` + `modeReducer` + `ExecutorAvailability` | ❌ (型重複) |
| 観測カウント | `observationCount` | signal の単純 count なら可能 | ⚠️ (重複だが in-process では便利) |
| 観測時刻 | `lastObservationAt` | sharedState の serverTimestamp + observation event | ⚠️ (重複) |
| Alignment | `alignmentBucket` | signal の implicit score 経由 | ⚠️ (既存に bucket 化なし) |
| Rupture | `ruptureFlag` | `criticalKeywordDetector` + signal kind="critical" | ⚠️ (既存に flag 抽象化なし) |
| Phase 推論 | `conversationPhase` (opening/exploring/converging/closing) | 既存に該当抽象化なし | ✅ (新規) |
| Silence Budget | `silenceBudgetBucket` | cooldownResolver で類似だが bucket 化なし | ✅ (一部新規) |
| **時系列蓄積** | `reasonCodes` append (FIFO drop) | observationEvent 等あるが lib 内 in-memory cache はなし | ✅ (新規) |
| **PII firewall** | `redactedRelationshipKey` (sha256) + `PII_FORBIDDEN_FIELD_NAMES` | sentryTelemetry breadcrumb は redact なし | ✅ (新規) |
| **A4 retrieval 連携** | `getRedactedRelationshipStateSnapshot` で external snapshot | 既存に retrieval API なし | ✅ (新規) |
| Process-local in-memory cache | あり | sharedState は server 経由 | ✅ (新規) |

**結論**: A-1 deliverable には**部分的な固有価値**がある。ただし大半は既存 presence layer で代替可能。**revert 不要だが、責務を厳密に再定義する必要あり**。

### 3.3 並走設計の責務分離（CEO/GPT 判断遵守）

CEO/GPT 判断「並走、ただし型整合必須」に従い、明確な責務分離:

| Layer | 責務 | 状態 | 接続 |
|---|---|---|---|
| **Presence Layer** (既存) | runtime state machine (S0-S8) / mode 切替 / UI 制御 / escalation / cooldown / production source of truth | Production deployed | 触らない（不変境界） |
| **Observer Layer** (PR #153) | observation 時系列蓄積 / PII firewall snapshot / A4 retrieval 用 cache | runtime-unwired | A-1b で型整合、A-2 で hook 検討 |

---

## 4. A-1 の扱い（CEO/GPT 判断遵守）

### 4.1 PR #153 deliverable の処遇

- **即 revert 不要**（CEO/GPT 判断）
- runtime-unwired なので production に副作用ゼロ
- 並走 layer として責務を再定義（§3.3）

### 4.2 A-1b: 型整合（PresenceMode alignment）

A-1b では observer 側の独自型を既存 presence layer 型に整合させる。**実装は別 PR**。本 docs では方針提示のみ。

#### 整合方針

| 現状 (PR #153) | A-1b 整合後 |
|---|---|
| `ModeContext = "unknown" \| "off" \| "on"` | `PresenceMode \| null` （null = unknown）または `ExecutorAvailability` を内包 |
| 独立 type alias | `lib/coalter/presence/types.ts` から `PresenceMode`, `ExecutorAvailability`, `PresenceSignal` を import |
| `observerActivationState = "unknown"\|"active"\|"inactive"\|"suspended"` | `ExecutorAvailability` (= disabled/inactive/pending_consent/enabled/active) に変更 |
| `ConversationPhase = "unknown"\|"opening"\|"exploring"\|"converging"\|"closing"` | **維持**（既存 `PresenceState` S0-S8 とは別抽象化、layer 別の概念として valid） |
| `AlignmentBucket` / `UncertaintyBucket` / `SilenceBudgetBucket` | **維持**（既存に bucket 化なし、PII firewall の核） |
| `RedactedRelationshipKey` / `PII_FORBIDDEN_FIELD_NAMES` | **維持**（A4 retrieval の核、固有価値） |

#### A-1b scope（実装は別 PR）

- 修正対象: `lib/coalter/observer/relationshipStateTypes.ts` のみ
- 追加 import: `lib/coalter/presence/types.ts` から `PresenceMode`, `ExecutorAvailability`, `PresenceSignal`
- 削除候補: `ModeContext` 独自型（`PresenceMode | null` に置換）
- 削除候補: `ObserverActivationState` 独自型（`ExecutorAvailability` に置換）
- 修正必要: `relationshipState.ts` の initial state, `relationshipStateRedaction.ts` の RedactedRelationshipStateSnapshot, テスト群
- 推定工数: 1 日

### 4.3 A-1b 着手判断

本 PR merge 後、A-1b plan を別 PR で詳細化し CEO 判断を仰ぐ。

---

## 5. A-2 再設計方針（hook 位置の再評価）

### 5.1 既存 presence layer 前提での候補比較

PR #152 / A-0 audit の 4 候補（A. message route / B. invoke route / C. engine.ts / D. client side hook）に加え、既存 presence layer 経路を含む候補:

| 候補 | 経路 | mode 取得 | observer coverage | PII firewall | runtime risk | UI 影響 | server/client 責務 | rollback |
|---|---|---|---|---|---|---|---|---|
| **A.** message route | message POST 後に observer fire | DB query 必要（または request body） | ★★★ 全 message | A-1 内で完結 | ★★ stable route touch | ゼロ | server | env flag |
| **B.** invoke route | invoke POST 時のみ | session record 経由 | ★ explicit invoke のみ | A-1 内で完結 | ★★★ low | ゼロ | server | env flag |
| **C.** engine.ts | engine 呼出時のみ | session 経由 | ★ engine 呼出時のみ | A-1 内で完結 | ★★ engine touch | ゼロ | server | env flag |
| **D.** client side hook | message 送信後に client から observer endpoint | client local | ★★ online 時のみ | A-1 内で完結 | ★★★ 既存 route 非接触 | ゼロ | client | flag + UI gate |
| **E.** presence signal bus subscribe | `productionSignalBus` event を observer が listen | signal 経由で取得可 | ★★★ 全 signal 捕捉 | A-1 内で完結 | ★★ bus subscribe 追加 | ゼロ | server | env flag |
| **F.** UpperLayerMount integration | `UpperLayerMount` の hooks 内で observer fire | `usePresenceExecutor` の internal state 流用 | ★★★ presence active 時の全イベント | A-1 内で完結 | ★★ chat layer touch | ゼロ（observation は UI 非接続） | client (mount 内) | flag + UI gate |
| **G.** sentryTelemetry parallel | `coalter.mode.transition` breadcrumb と並列に observer 記録 | signal/breadcrumb 経由 | ★★ mode transition のみ | A-1 内で完結 | ★★★ telemetry layer touch | ゼロ | server/client 混在 | flag |

### 5.2 候補の評価（推奨順）

| 順位 | 候補 | 推奨理由 |
|---|---|---|
| 1 | **E. presence signal bus** | 既存 bus 経路に subscribe するだけ、mode 取得は signal 経由で確実、coverage 最高、責務分離明確 |
| 2 | **F. UpperLayerMount integration** | 既存 client hook 内で完結、presence active 時の全イベント取得可、ただし client 側に observer wiring が出る |
| 3 | A. message route | mode が server known なら最適、ただし既存 signal bus と重複の懸念 |
| 4 | D. client side hook | offline 時 coverage 落ち、新規 endpoint 必要 |
| 5 | G. sentryTelemetry parallel | telemetry layer 触る、mode transition のみで coverage 不十分 |
| - | B / C | Always-On Vision 不適合 |

### 5.3 A-2 着手前の CEO 判断項目（更新版）

| # | 質問 | 選択肢 |
|---|---|---|
| R1 (改) | observer の hook 経路 | (a) E. presence signal bus / (b) F. UpperLayerMount / (c) A. message route / (d) A-2 完全凍結（既存 presence layer で十分という判断） |
| R2 (改) | observer の存在意義 | (a) A4 retrieval 用の debug snapshot 蓄積（最小用途） / (b) 既存 presence layer の補完層（時系列蓄積） / (c) 別目的 (CEO 提示) |
| R3 (改) | A-1b 着手のタイミング | (a) 本 PR merge 後すぐ / (b) A-2 hook 位置確定後 / (c) その他 |

### 5.4 A-2 着手は本 PR + A-1b 完了後

**A-2 hook 設計は A-1b 完了後に CEO 判断**を仰ぐ。本 docs では設計方針提示のみ、実装着手しない。

---

## 6. 不変境界（CEO 厳守、更新版）

### 6.1 既存 Presence Layer 不可侵

以下を一切 touch しない:
- `lib/coalter/presence/` 配下の 30+ files
- `app/components/chat/` 配下の 17 files + 内部 hooks/ + states/
- `app/(dev)/coalter-preview/upper-layer/` 配下の preview 実装
- `lib/coalter/flags.ts` の `presenceExecutorEnabled` flag
- `NEXT_PUBLIC_COALTER_PRESENCE_EXECUTOR` env

### 6.2 Observer Layer 並走原則

- 既存 presence layer の値を**読む**は OK（型 import）
- 既存 presence layer の値を**書く**は禁止
- 既存 presence layer の event bus を **subscribe** は OK（A-2 で検討）
- 既存 presence layer の event bus を **publish** は禁止

### 6.3 PR/環境/データ取扱

- Production env 変更しない
- DB / Supabase / migration 一切なし
- Sentry / telemetry 送信なし
- raw text / PII の external 出力なし
- pairStateId を external snapshot に出さない（redacted key 経由）
- LLM call なし（rule-based のみ）

---

## 7. 次の動き

### 7.1 本 PR (docs-only)

1. 本 docs 起票 → `docs/coalter-aoo-presence-reconciliation.md` (新規)
2. PR #151 design doc を更新 → 冒頭に correction notice + §0.4 訂正セクション追加
3. PR #152 A-0 audit を更新 → 冒頭に correction notice + §0.5 訂正セクション追加
4. `docs/decision-log.md` に entry 追加
5. docs-only Auto-merge lane で進める

### 7.2 本 PR merge 後

**A-1b PresenceMode alignment plan を提示して停止**。CEO 判断を仰ぐ。
A-1b 実装には入らない（本 PR と同じ Stop-before-merge 制約）。

### 7.3 A-1b 完了後

A-2 hook 位置の再 audit PR を起票。実装は CEO 判断後に別 PR。

---

## 8. 参照

- `docs/coalter-always-on-observer-design.md` (PR #151) — 本 PR で correction notice 追加
- `docs/coalter-aoo-phase-a0-mode-state-audit.md` (PR #152) — 本 PR で correction notice 追加
- `lib/coalter/presence/types.ts` — PresenceMode / PresenceState / SignalKind 等の canonical 型
- `lib/coalter/presence/sharedState.ts` — 9 件の shared state interface
- `lib/coalter/presence/reducer.ts` — S0-S8 PresenceReducer
- `lib/coalter/presence/signalAdapter.ts` — signal Adapter Pattern
- `app/components/chat/ModeSwitcher.tsx` — 「通常/Daily/Travel」radiogroup
- `app/components/chat/UpperLayerMount.tsx` — 本番 mount entry point
- 別セッション report (2026-05-16) — 本訂正の発端

---

## 9. 変更履歴

| 日付 | 変更 | 承認 |
|---|---|---|
| 2026-05-16 | 訂正正本 初版（PR #151/#152/#153 への correction、A-1b/A-2 方針改訂） | CEO/GPT 判断「並走、型整合必須」 |
