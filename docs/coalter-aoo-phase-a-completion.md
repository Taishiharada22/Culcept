# CoAlter Always-On Observer — Phase A 正式完了 (2026-05-17)

**ステータス**: 正式完了
**完了判定**: CEO 実機 A-2e 観測 (2026-05-17) で 5 観測目的全達成
**承認**: CEO/GPT 判断「A-2e canary FULL PASS」(2026-05-17)
**完了 commit**: A-2e canary 観測は PR #162 (canary draft、merge せず close)。Phase A の runtime 実装本体は PR #159 (A-2c) で main 着地済

---

## 0. Executive Summary

CoAlter Always-On Observer の **Phase A (観測のみ)** は 2026-05-16 着手、2026-05-17 完了。

**最上位原則** (Phase A 全期間遵守、Phase B+ も継承): **Always-On ≠ 自動発話**。

Phase A は CoAlter を「Reactive 型 (呼ばれたら答える)」→「Active 型 (mode ON 中は常時静かに観察)」へ転換する基盤。発話は一切自動化せず、観測蓄積層のみ構築。

### 0.1 達成内容（CEO 提示 5 観測目的、全達成）

| # | 目的 | 観測 | 判定 |
|---|---|---|---|
| 1 | ObserverHost **mount** される | `registry size: 1` (CoAlter enabled pair の thread page) | ✅ |
| 2 | presence signal を **購読** する | `signalReceivedCount > 0` | ✅ |
| 3 | signal を **受ける** | handler 到達 (counter 累計増加) | ✅ |
| 4 | relationship state を **更新** する | `observationCount: 0→3, stateVersion: 1→3, reasonCodes append` | ✅ |
| 5 | raw text / PII / lastMessageId raw / matchedPattern raw を **出さない** | `redactedRelationshipKey + bucket values のみ、raw 値 0 件` | ✅ |

### 0.2 不変境界遵守（Phase A 全期間）

- ✅ Production env 1 bit も触らず（11 PR、2 日間）
- ✅ presence layer 30+ files / chat layer 17 files 一切 touch なし
- ✅ ChatClient touch は import + JSX mount 最小 5 行のみ（A-2c）
- ✅ DB / Supabase / migration / Sentry / telemetry / cookie / localStorage 全て不使用
- ✅ Phase B Mirror / auto-speak / Question / Proposal 自動発火 一切実装せず

---

## 1. Phase A 構成 PR 一覧 (12 PR、main 着地 / canary close)

| PR | branch | 役割 | 状態 | merge commit |
|---|---|---|---|---|
| #151 | `docs/coalter-always-on-observer-design` | 設計書 (587 行) | merged | `a86558a4` |
| #152 | `docs/coalter-aoo-phase-a0-mode-state-audit` | A-0 mode audit | merged (correction notice 適用済) | `1ea096ee` |
| #153 | `feat/coalter-aoo-relationship-state-a1` | A-1 state container | merged | `ea230df9` |
| **#154** | `docs/coalter-aoo-presence-correction` | **🔴 Presence Layer 訂正正本** | merged | `1b437689` |
| #155 | `feat/coalter-aoo-relationship-state-a1b-presence-alignment` | A-1b 型整合 | merged | `341c34ef` |
| #156 | `docs/coalter-aoo-a2-presence-signal-bus-audit` | A-2a bus audit | merged | `22b059db` |
| #157 | `docs/coalter-aoo-a2b-implementation-preflight` | A-2b preflight | merged | `6fe1d43b` |
| #158 | `feat/coalter-aoo-observer-subscriber-a2b` | A-2b library | merged | `01fabf97` |
| #159 | `feat/coalter-aoo-observer-client-wiring-a2c` | A-2c wiring + crypto fix | merged | `c2d7cfd5` |
| #160 | `chore/coalter-aoo-canary-trigger` | A-2d canary trigger | **closed (not merged)** | — |
| #161 | `docs/coalter-aoo-a2e-state-observation-preflight` | A-2e preflight | merged | `8746c2a5` |
| **#162** | `chore/coalter-aoo-a2e-canary` | **A-2e canary 観測 (本完了の根拠)** | **closed (not merged)** | — |

PR #160 / #162 は canary draft、merge せず close。Phase A の runtime code は PR #153/#155/#158/#159 で main 着地済。

---

## 2. CEO 実機 A-2e 観測結果 (2026-05-17)

### 2.1 観測手順

1. CEO Vercel UI で 2 env を Preview branch scoped (`chore/coalter-aoo-a2e-canary`) で追加:
   - `NEXT_PUBLIC_COALTER_PRESENCE_OBSERVER=true`
   - `NEXT_PUBLIC_COALTER_OBSERVER_DEBUG_EXPOSE=true`
2. Vercel CLI redeploy で env を build artifact に inline
3. Preview URL `https://culcept-ebedv29qj-taishis-projects-0a8deb17.vercel.app` を開く
4. CoAlter enabled pair の thread page に移動
5. Browser DevTools Console で diagnostic snippet 実行
6. message 数件送信 → snippet 再実行
7. 結果共有 → cleanup

### 2.2 観測値

**1 回目 (page load 直後)**:
```
registry size: 1
snapshots count: 1
counters:
  signalReceivedCount: 1
  stateUpdateSuccessCount: 1
  observationCount: 1
  stateVersion: 1
  lastObservationAt: "2026-05-17T01:04:14.852Z"
  lastReasonCode: "observation_recorded"
  lastSkipReason: "none"
```

**2 回目 (message 数件送信後)**:
```
counters:
  signalReceivedCount: 3
  stateUpdateSuccessCount: 3
  observationCount: 3
  stateVersion: 3
  lastObservationAt: "2026-05-17T01:04:46.954Z"
  reasonCodes: ["state_initialized", "observation_recorded", "observation_recorded", "observation_recorded"]
```

### 2.3 PII Firewall verify (実機)

| 項目 | 観測 |
|---|---|
| `redactedRelationshipKey` | `"5W5MEVR0KesK6S1qP5rAtp3fBXuHrQsEXS7Ej3aM0PI"` (43 chars base64url、SHA-256 派生) |
| raw pairStateId | snapshot に**出ない** |
| raw lastMessageId | snapshot に**出ない** |
| raw matchedPattern | snapshot に**出ない** |
| forbidden field names | 0 件 |
| Console error | 0 件 |
| UI 変化 | なし |
| presence layer 動作 | 不変 |

### 2.4 重要 caveat

本完了判定は **CEO 実機観測の報告値**に基づく。Claude は実機 Console を直接観測していない。

---

## 3. Phase A 進行中の重要発見・訂正（後続フェーズへの教訓）

### 3.1 🔴 Presence Layer 発見と設計訂正 (PR #154)

**A-0 audit (PR #152) の致命的見落とし**:
- 「mode tabs UI が main に存在しない」と結論 — **誤り**
- 別セッション report からの指摘で発覚
- 実体検証: `app/components/chat/ModeSwitcher.tsx` (blob `9834cf0f`)、`lib/coalter/presence/types.ts:56` `PresenceMode = "normal" | "daily" | "travel"`、presence layer 30+ files、chat layer 17 files が**完全実装済、Production deployed**

**設計再評価**:
- 私の PR #151 の Layer 1-6 設計の大半が既存実装の再発明だった
- PR #154 で Reconciliation 正本 (`docs/coalter-aoo-presence-reconciliation.md`) 起票
- observer layer = 観測蓄積 / presence layer = runtime 制御 として**並走、相互不可侵**に再定義
- PR #151 / #152 docs に correction notice 適用

**学び**:
- 検索範囲を最初から広げる（`components/coalter/` だけでなく `app/components/chat/` + `lib/coalter/presence/`）
- 型から逆引きする（`PresenceMode` typed identifier 検索）
- 「無い」を結論する前に複数 directory pattern で確認

### 3.2 既存挙動の発見

#### `normalizeBool("") → true` (A-2b 副次発見)

`lib/coalter/flags.ts:32-38` の `normalizeBool` は空文字 env を `true` 扱い。運用注意:
- ON: `true`
- OFF: env 削除 or `"false"` 明示
- ❌ 空文字 env 禁止

### 3.3 webpack `node:crypto` client bundle 制約 (A-2c 発見)

A-1/A-1b/A-2b は `node:crypto` を runtime-unwired で使用 → A-2c で初めて client bundle 経由となり `UnhandledSchemeError`。

修正 (A-2c PR #159 内):
- `js-sha256` 依存追加 (sync, browser+node 両対応)
- `globalThis.crypto.getRandomValues` 使用 (Web 標準)
- `Math.random` fallback 禁止 (fail-closed)

### 3.4 Vercel build 一時 hang / OOM パターン

- A-2c / A-2d / A-2e 全フェーズで Vercel build が 27-46 min hang する事例発生
- 復旧方法確立: Vercel CLI `redeploy <deployment-url>` で新 build trigger
- empty commit は vercel.json `ignoreCommand` で Smart Skip → 実 build にならない
- 実 build trigger は `.ts/.tsx` 最小修正 (5 行 comment 追加等)

### 3.5 React lifecycle / NEXT_PUBLIC 制約

- React 18 Strict Mode double-invoke → `subscriptionRegistry` Map で重複 subscribe 防止
- HMR 対応 → `_runObserverSubscriptionEffect` pure 抽出版で test 可能
- NEXT_PUBLIC env は build-time inline (webpack DefinePlugin) → env 設定後 redeploy 必須
- NODE_ENV gate は Vercel Preview build (= production build) で canary を無効化するため**採用禁止** (A-2e 補正)

### 3.6 Debug global 設計の段階改善

A-2e canary の debug global は段階的に改善:
- v1: `getRedactedStateForPair(pairStateId)` — CEO に raw pairStateId 入力を要求 → 危険
- v2 (A-2e 採用): `getCurrentRedactedSnapshot()` / `getAllRedactedSnapshots()` — 自動 active scan、raw 入力不要
- v2.1: redacted debug counter 追加 (handler 到達 / skip reason の切り分け)
- v2.2: `observationCount` 増加 root cause fix (`recordingObservation: true` + `observedAt` 渡し漏れ)

### 3.7 7 層防御 (NODE_ENV gate 削除の代替、A-2e canary)

debug global expose を Production に流出させない 7 層:

| L | 防御 |
|---|---|
| L1 | env flag default false |
| L2 | env scope = branch scoped Preview only (CEO 操作) |
| L3 | PR merge **絶対禁止** (draft only) |
| L4 | branch 短命 (smoke 完了後破棄) |
| L5 | 15 min 時限 expire (install 後 auto invalidate) |
| L6 | smoke 後 env 削除 (CEO 操作) |
| L7 | raw 露出禁止 (redacted snapshot only) |

---

## 4. 副次観察 — Phase B 設計論点に送る（Phase A スコープ外、未達ではない）

A-2e canary 観測で発見された **Phase A の純粋な「観測蓄積」目的を超える論点**。Phase B 以降で扱う:

### 4.1 `observerActivationState: "inactive"` のまま subscribe しても更新されない

- 原因: `useObserverSubscription` で subscribe 時に `observerActivationState: "active"` への update がない
- 影響: 観測の正確性のみ (実害なし)
- Phase B 設計論点: subscribe lifecycle に合わせて active/inactive 切替

### 4.2 `modeContext: null` — mode (normal/daily/travel) が反映されていない

- 原因: `mode_promotion` signal だけでは mode 値そのものが取れない (CEO/GPT 補正 A-2a 確認済の制約)
- mode は別途 `sharedState` から read する必要
- Phase B 設計論点: presence layer の `sharedState.mode` を observer に注入する経路

### 4.3 bucket 値 `"unknown"` のまま — alignmentBucket / uncertaintyBucket / silenceBudgetBucket 推論未実装

- 原因: A-2c までは「観測蓄積」のみ、bucket 推論は Phase B+ の Speak Decision Engine と統合
- Phase B 設計論点: signal pattern から bucket 推論する Decision Engine 設計

これら 3 件は **A-2e canary の判定に影響しない** (5 観測目的は全て達成)。Phase A 完了の条件は CEO 提示 5 項目で確認済。

---

## 5. Phase B 着手前の不変境界 (継承)

Phase A で確立した不変境界を Phase B+ でも継承:

| 項目 | 制約 |
|---|---|
| presence layer | `lib/coalter/presence/` 30+ files **絶対 touch なし** |
| chat layer | `app/components/chat/` 17 files **絶対 touch なし** (UpperLayerMount / ModeSwitcher / 等) |
| ChatClient | 既存 logic は 1 bit も変更なし、AOO 追加は **import + JSX mount の最小差分のみ** |
| Production env | **絶対 touch なし** (Phase A 全期間 1 bit も変更なし) |
| DB / Supabase / migration | 使わない |
| Sentry / telemetry | 使わない |
| localStorage / sessionStorage / cookie | 使わない |
| Always-On ≠ 自動発話 | Phase B でも遵守 (Mirror channel は控えめ、Default STAY_SILENT、Negative Capability First-Class) |

---

## 6. Phase B 設計の方向性（次フェーズ docs PR で正本化）

Phase B Mirror Channel design は別 docs PR で扱う。本ドキュメントは Phase A 完了宣言のみ。

要点（Phase B design PR で詳細化）:
- Mirror は **提案でも判断でも介入でもない**、関係状態の短い反射
- Default **STAY_SILENT**
- Expected Relationship Value (ERV) で Speak/Ask/StaySilent 比較
- Three-Gate Mirror (Observe / Worth / Safe)
- Mirror taxonomy 5 種 (State / Difference / Tempo / Fairness / Repair)
- Safety: 不確実なら黙る、片方に寄らない、raw PII 保存禁止
- UI: presence layer 不可侵、控えめ表示、chat 本文埋めず、user sleep control
- 副次観察 3 件 (4.1-4.3) を Phase B 設計論点として統合

---

## 7. 参照ドキュメント

### Phase A 構成 docs
- `docs/coalter-always-on-observer-design.md` (PR #151, correction notice 適用済)
- `docs/coalter-aoo-phase-a0-mode-state-audit.md` (PR #152, correction notice 適用済)
- `docs/coalter-aoo-presence-reconciliation.md` (PR #154, **訂正正本**)
- `docs/coalter-aoo-a2-presence-signal-bus-audit.md` (PR #156)
- `docs/coalter-aoo-a2b-implementation-preflight.md` (PR #157)
- `docs/coalter-aoo-a2e-state-observation-preflight.md` (PR #161)

### Phase A 実装 code (lib + hooks + components + tests)
- `lib/coalter/observer/relationshipState.ts` (PR #153/#155)
- `lib/coalter/observer/relationshipStateTypes.ts` (PR #153/#155)
- `lib/coalter/observer/relationshipStateRedaction.ts` (PR #153, A-2c crypto fix)
- `lib/coalter/observer/signalRedaction.ts` (PR #158, A-2c crypto fix)
- `lib/coalter/observer/observerSubscriber.ts` (PR #158, A-2c crypto fix)
- `lib/coalter/observer/observerSubscriberGate.ts` (PR #158)
- `lib/coalter/flags.ts` (PR #158: `presenceObserverEnabled` getter 追加)
- `hooks/useObserverSubscription.ts` (PR #159: React hook + Strict Mode/HMR guard)
- `components/coalter/observer/ObserverHost.tsx` (PR #159: null-render wrapper)
- `app/(culcept)/talk/[threadId]/ChatClient.tsx` (PR #159: 5 行追加のみ、既存 logic 不変)
- 220+ unit tests (Phase A 完了時点で 234/234 PASS、A-2e canary の追加 counter tests 含む)

---

## 8. 変更履歴

| 日付 | 変更 | 承認 |
|---|---|---|
| 2026-05-17 | Phase A 正式完了宣言 (CEO 実機 A-2e 観測 FULL PASS 受領) | CEO/GPT 判断「A-2e canary FULL PASS、cleanup → Phase A 完了 docs → Phase B Mirror design」(2026-05-17) |
