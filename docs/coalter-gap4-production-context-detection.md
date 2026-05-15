# Gap 4 — Production-side Context Flag Detection 設計 docs

**作成日**: 2026-05-15
**ステータス**: docs-only design draft、runtime / code 変更なし
**起草 branch**: `docs/coalter-gap4-production-context-detection`
**前提**:
- PR #120 (`0d925e0c`、original plan completion audit v2) 正本化済
- PR #121 (`df00a8f3`、runtime integration priority decision) 正本化済
- PR #122 (`a9f27d44`、normal/daily/travel audit) 正本化済
- 候補 G-1 (Gap 4 設計 docs draft) として CEO directive 受領 (P0 single bottleneck)

## §0 本書の position

### §0.1 目的

PR #122 §5 で発見された **Layer 5 reach の single bottleneck** = **Gap 4** (production-side context flag detection 未実装) を実装着手前に設計確定する。本書は実装ではなく、**実装方針 5 候補比較 + 推奨案 1 確定 + gate 列挙** までを範囲とする。

CoAlter 全体完了に向けて:
- Gap 4 解消 = normal / daily / travel **全 PresenceMode** の variant 発火を可能にする
- Layout / UpperLayer 上 (PR #95 で 3 旗 ON 反映済) で **Pattern A-F-2 が実 user 環境で動的選択** される状態を実現
- movie / food / travel **全 Domain** の retrieval signal が PatternContext に集約される基盤

### §0.2 Source-of-truth Hierarchy (PR #120 §0.2 + PR #122 §0.2 継承)

| Tier | 種別 | 本書での扱い |
|---|---|---|
| 1 | main merge 済 commit / PR | 最優先、SHA + PR# + date 記録 |
| 2 | 実コード (`lib/` / `app/`) | file 存在 / type 定義 / function export / 呼び出し点 grep 実証 |
| 3 | 最新 docs | Tier 1/2 と整合する範囲で参照 |
| 4 | memory / project memory | 補助参照 |
| 5 | 古い docs | Tier 1/2 で書き換えられている前提 |

**衝突時の rule**: 古い doc が「未着手」と書いていても main 反映 commit がある場合は main を優先。

### §0.3 制約再確認 (CEO directive 2026-05-15)

- ❌ runtime 実装 / ChatClient 修正 / UpperLayerMount 修正
- ❌ flags 変更 / env 変更 / production 変更
- ❌ Step E 開始 / bug1 cleanup
- ❌ Stargazer / Human OS 等 別領域 pivot
- ❌ 本 doc の merge (CEO 判断)
- ✅ docs-only autonomous (claude 自律進行)

---

## §1 Gap 4 とは何か

### §1.1 Gap 4 の構造的定義

CoAlter Layout 系統 (Stage 4) で:

```
状態機械 (S0-S8) ──┐
                    ├──▶ selectPattern(state, mode, context) ──▶ PatternVariant (A-F-2 or null) ──▶ UI 表示
PresenceMode ──────┤
(normal/daily/travel)│
                    │
PatternContext ─────┘
(7 boolean fields)
```

**正本**: `lib/coalter/presence/patternSelector.ts:47-69` (PatternContext interface 定義) + `:84-106` (selectPattern function)

**Gap 4 の正体**:
- `PatternContext` 7 fields の **production runtime での自動 infer logic が未実装**
- production で `patternContext` default `{}` (空オブジェクト) → `matchesContextPriority` が false 返却 → `selectPattern` で variant **null** → Pattern 発火しない

**`PatternContext` 7 fields**:
| Field | 役割 | 関連 variant | 発火 state × mode |
|---|---|---|---|
| `infoMissing` | S2 で安全介入に必要情報欠落 | C 優先 (§7.12 fallback) | S2 / 全 mode |
| `uncertaintyHigh` | S5 で不確実性が介入有効性阻害 | C 優先 (裁判官化リスク回避、§11.1) | S5 / 全 mode |
| `needFraming` | S5 で関係全体の可視化先行必要 | B 候補 | S5 / 全 mode |
| `oneSidedFatigue` | S5 で片側の揺れ・疲労が主 | D 候補 | S5 / 全 mode |
| `needTranslation` | S5 で両者間翻訳が必要 | E 候補 | S5 / 全 mode |
| `relationshipSignalsClear` | Travel mode で関係シグナル明確 | D 既定優先度復活 (§4.3.6) | S5 / travel mode |
| `relationshipNoiseHigh` | S7 Daily で関係ノイズ高 | F-1 副次同伴 1 行併設 (§7.10) | S7 / daily mode |

### §1.2 「smoke PASS != production reachability PASS」

**正本**: `docs/coalter-stage24-production-reflection.md` line 281-288 + `lib/coalter/presence/smokeContextOverride.ts:1-40`

| 経路 | 動作 | production 反映 |
|---|---|---|
| **smoke harness** (Preview only) | URL query `?coalter_smoke_flag=infoMissing` 等で `PatternContext` field を**人工注入** | ❌ 不可 (Production env 未設定厳守) |
| **production** | `PatternContext` 自動 infer | ❌ **未実装** = Gap 4 |

smoke harness の **whitelist + fail-closed 構造** (許可 flag 7 個と完全一致、env exact "true" のみ accept) は **production detector の reference contract** として再利用可能 (§8.4 で詳述)。

### §1.3 Gap 4 が全領域に与える影響 (PR #122 §5 再掲)

PR #122 で確認:
- normal mode: ✅ default mount、3 旗 ON、UpperLayer mount → ⚠ **Gap 4 で variant 薄**
- daily mode: ✅ ModeSwitcher / state machine 完了 + UpperLayer 上 → ⚠ **Gap 4 で variant 薄** + domain body 不在
- travel mode: 同上 → ⚠ Gap 4 + travel domain body 不在 (より深刻)

→ **Gap 4 = 全 PresenceMode 共通の Layer 5 bottleneck**

### §1.4 Gap 4 を解消しないとどうなるか

- Pattern A-F-2 のうち**発火するのは static fallback (URRGENT_FALLBACK_MESSAGES 等のみ)**
- 上部レイヤーは mount するが「動的介入」(誤読時の clarify / 片側疲労時の D / 関係 framing が必要な B 等) が発火しない
- 実 user は「静かな上部レイヤー」を見るだけ
- normal mode 完了 / daily mode 完了 と書いても、機能の本質 (Pattern による介入) は届いていない

---

## §2 現在の状態 (一次資料)

### §2.1 production 反映済要素

| 要素 | file path / line | 状態 |
|---|---|---|
| `PatternContext` interface | `lib/coalter/presence/patternSelector.ts:47-69` | ✅ 7 fields 定義済 |
| `selectPattern` function | `lib/coalter/presence/patternSelector.ts:84-106` | ✅ Two-Stage Gating logic 完了 |
| `matchesContextPriority` | `lib/coalter/presence/patternSelector.ts:193-213` | ✅ 7 fields → variant mapping 完了 |
| `usePresenceExecutor` state | `app/components/chat/hooks/usePresenceExecutor.ts` | ✅ `patternContext: PatternContext` state 保持 |
| `setPatternContext` dispatch | 同上 | ✅ setter 公開済 |
| `UpperLayerMount` mount-once 注入 | `app/components/chat/UpperLayerMount.tsx` | ✅ smoke harness 由来の override 注入 logic 完了 |
| `ChatClient` 統合 | `app/(culcept)/talk/[threadId]/ChatClient.tsx:1520` | ✅ `<UpperLayerMount />` 直接 mount |
| 3 旗 production env | handoff §3 | ✅ `COALTER_PRESENCE_SPEECH_LLM=true` / `NEXT_PUBLIC_COALTER_PRESENCE_SPEECH_FETCH=true` / `NEXT_PUBLIC_COALTER_PRESENCE_EXECUTOR=true` |
| Legacy CoAlterCard | 同上 | ✅ `NEXT_PUBLIC_COALTER_LEGACY_CARD_AUTO_INSERT=false` (OFF) |

### §2.2 Gap 4 として未実装の要素

| 要素 | 状態 | 影響 |
|---|---|---|
| **production-side context detector** (executor watcher / heuristic / LLM 検出) | ❌ **未実装、別 phase 扱い** | `PatternContext` 7 fields が production で自動 infer されない |
| **`patternContext` の non-empty な default** | ❌ default `{}` (空オブジェクト) | `matchesContextPriority` が常に false → variant=null |
| **server-side detection logic** | ❌ 不在 | conversation signals / pair state / memory items から flag を infer する logic 一切なし |
| **API response への `patternContext` 注入** | ❌ 不在 | `/api/coalter/invoke` 等の response に context field なし、client は受領経路なし |
| **Pattern variant 発火率の observability** | ❌ telemetry なし | Gap 4 解消後の measurement baseline 不在 |

### §2.3 既存 signal infrastructure (Gap 4 detector の source 候補)

**正本**: `lib/coalter/presence/signalAdapter.ts` / `signalClassifier.ts` / `signalEchoDedupe.ts` / `reducer.ts`

既存 signal 基盤 (本 PR の調査範囲、推測なし):

| Signal | source | type | 用途 |
|---|---|---|---|
| explicit | user 明示行為 (chip tap 等) | `PresenceSignal` kind | mode 切替 / 状態遷移 |
| implicit | 暗黙 signal (滞留 / 発話) | 同上 | 緩い状態遷移 |
| critical | 緊急 signal | 同上 | UrgentLayer 発火 |
| mode_promotion | mode 昇格明示信号 | 同上 | modeReducer AUTO_ESCALATE |
| manual_restart | 手動再起動 | 同上 | reset |
| misread.confidence | clarify mode 判定 | `lib/coalter/modeRouter.ts` input | `needTranslation` 推論候補 |
| contradiction.detected | negotiate mode 判定 | 同上 | `needFraming` 推論候補 |
| stall.detected | decision mode 判定 | 同上 | `uncertaintyHigh` 推論候補 |
| ambiguity.response_mode | Ambiguity Engine | 同上 | `infoMissing` / `uncertaintyHigh` 推論候補 |
| emotion (Bug-1 Step C) | `lib/coalter/emotion/extract.ts` | Option α 採用 | 関係温度 / 感情 signal |
| Fairness Ledger | `coalter_fairness_ledger` table | DB stateful | `oneSidedFatigue` 推論候補 (bias_score 偏り) |
| Stage 1 Understand bundle | `lib/coalter/understanding/` | DB + LLM | `infoMissing` 推論候補 (情報不足判定) |

→ 既存 signals は豊富。**Gap 4 detector は新規 signal 不要、既存 signal の集約 + 7 fields への mapping logic 設計**が本質。

---

## §3 何を検出すべきか

### §3.1 7 fields × Source signal mapping table

各 PatternContext field を既存 signal から infer する候補 mapping:

| Field | 推論 source 候補 | 推論 logic 案 |
|---|---|---|
| `infoMissing` | Stage 1 Understand outcome / movieCatalog retrieval / food catalog 失敗 | candidate 0 / Stage 1 outcome="failed" / catalog 結果空 |
| `uncertaintyHigh` | stall.detected / ambiguity.response_mode / 回答時間長 | 複数 signal 合算 (stall + ambiguity + emotion 揺らぎ) |
| `needFraming` | contradiction.detected | direct mapping (negotiate mode 判定と同 source) |
| `oneSidedFatigue` | Fairness Ledger bias_score | bias_score \|x\| ≥ threshold 時 true |
| `needTranslation` | misread.confidence | misread.confidence ≥ 0.7 (clarify mode 同 threshold) |
| `relationshipSignalsClear` | Bug-1 emotion 安定 + relationshipNoise 低 | 関係温度 stable + critical signal 0 件 |
| `relationshipNoiseHigh` | critical signal + misread 累積 + emotion 不安定 | 直近 N turn の critical / misread 累積 |

### §3.2 Domain × Mode 別の発火条件 (3-Axes Orthogonal 適用)

PR #122 §1 3-Axes architecture を Gap 4 detector に適用:

| Axis | 検出器が考慮する元 |
|---|---|
| **A: Action Mode** (CoAlterMode) | misread / contradiction / stall / ambiguity を Action Mode 判定と共有 |
| **B: Presence Mode** (PresenceMode) | mode_promotion signal / 自動昇格条件 / 切替 history |
| **C: Domain** | Stage 1 Understand bundle (movie / food / 等) で domain-specific 情報不足を検出 |

**重要**: Gap 4 detector は 3 axes orthogonal に検出する。Action Mode の `needTranslation` 検出と Presence Mode の `relationshipNoiseHigh` 検出は **独立 logic** で重複可。

### §3.3 confidence-graded firing (人間超越設計 idea 2)

各 field を boolean ではなく **(value, confidence)** ペアで内部表現:

```
infoMissing: (true, 0.8)        # 高 confidence
uncertaintyHigh: (true, 0.4)    # 低 confidence
needFraming: (false, 0.9)       # 確実に false
```

threshold τ (e.g., 0.5) 以上の (value=true, confidence ≥ τ) のみ `PatternContext` field を `true` set。

**利点**:
- 弱い signal で誤発火しない
- 各 detector を独立に tune 可能
- observability で「どの signal が境界線か」を分析可能
- threshold τ を kill switch として使える (τ=1.0 で全 detector 抑止)

---

## §4 実装候補 5 案

### §4.1 Alt 1: Route-level detection (API route で server-side infer)

**概要**:
- `/api/coalter/invoke` 等の existing API route に、response 生成前に detector logic を呼ぶ
- response shape は変更なし (内部で `setPatternContext` 相当を server で行う想定 → 本質的に Alt 4 と統合)

**利点**:
- server で全 signal にアクセス可 (DB / LLM / pair state 等)
- telemetry 取りやすい
- 既存 invoke endpoint に統合

**欠点**:
- route 修正必要
- static rules になりがち (per-request stateless)
- 既存 5 層 pipeline (`runCoAlterPipeline`) との関係が unclear、層内に detector を埋め込む形に

**runtime risk**: 中 (既存 route 拡張、response shape 変更しなければ低 backward incompatible)

---

### §4.2 Alt 2: Thread metadata detection (DB stateful)

**概要**:
- detector を separate logic として server-side で実装
- thread context (`coalter_pair_states` / talk_messages 直近 N / fairness ledger / memory items) を読んで 7 fields を infer
- API response に `patternContext` を additive field として返す

**利点**:
- stateful、長期 signal (fairness ledger 累積、過去 misread 履歴) を反映可
- 各 detector を **純関数** として実装可能 (testable)
- DB schema 変更不要 (既存 table の read-only)

**欠点**:
- DB read overhead (各 invoke で 3-5 read)
- stateless context (現 turn の signal) との整合性要設計

**runtime risk**: 中 (DB read 追加、latency 数 ms 程度)

---

### §4.3 Alt 3: Client state detection (client side で infer)

**概要**:
- `usePresenceExecutor` 内に detector hook を追加
- reducer state + memory items + ui actions から infer
- `setPatternContext` を内部 dispatch

**利点**:
- realtime、UI に近い
- server round-trip 不要
- 既存 client state を活用可能

**欠点**:
- server signal (DB / LLM 結果) にアクセス困難
- 複数 device 同期問題 (片側 device で立った flag が他 device に届かない)
- pair user の signal を取れない (片側 visibility のみ)
- client state 肥大化リスク

**runtime risk**: 高 (client state 拡張、test complexity 増大)

---

### §4.4 Alt 4: Server-side context injection (response field additive)

**概要**:
- 既存 server response (`/api/coalter/invoke` 等) に `patternContext: Partial<PatternContext>` field を **additive** で追加
- client は UpperLayerMount で response を受領、`setPatternContext` 経由で executor state に反映
- detector logic は server-side 純関数として実装

**利点**:
- server で全 signal 統合
- client は受動 (UI / state 管理 simple)
- response shape 変更が **additive** (既存 client は無視可)
- smoke harness URL query 経由 override と並走可能 (smoke が override、production response が default の 2 経路)
- **rollback-friendly** (server detector OFF にすれば response に field 来ない → client は default {} 維持 → Gap 4 前状態)

**欠点**:
- response shape 拡張 (TypeScript 型変更必要)
- client wiring (UpperLayerMount に prop 経由で受領経路追加)
- detector source signal の availability は server に依存 (DB / pair state read)

**runtime risk**: 中 (additive 変更、既存 client は影響なし)

---

### §4.5 Alt 5: Hybrid (Server detector + additive response + client receive + Smoke unify)

**概要**:
- **Server detector (Alt 2 + 4 統合)**: thread metadata + per-turn signals を fuse して 7 fields infer、純関数 library として実装
- **API additive field**: invoke response に `patternContext` additive 追加
- **Client receive**: `UpperLayerMount` で response 受領、`setPatternContext` 経由 executor state 反映
- **Smoke harness 互換維持**: smoke override (Preview only URL query) は client side で **先に** 適用 (Preview debug 用)、production response field が **後に** 適用 (production 用)
- **Confidence-graded firing**: 各 flag に (value, confidence) 内部表現、threshold τ で発火
- **Observability**: telemetry で 7 fields 発火率 + variant 発火率分布を Sentry に flush
- **Feature flag**: `NEXT_PUBLIC_COALTER_PRESENCE_CONTEXT_DETECTION` で全体 kill switch (default OFF)
- **Observability-only mode**: flag を 2 段階で導入 (`OBSERVE` mode で detector 動作 + telemetry のみ、variant 発火に影響しない → `LIVE` mode で実 variant 発火)

**利点**:
- Alt 2 (DB stateful) + Alt 4 (additive injection) の利点を統合
- smoke harness と共存 (debug 性維持)
- confidence-graded で誤発火抑止
- 2 段階 rollout (observe → live) で risk 段階解放
- kill switch で即座 rollback 可

**欠点**:
- 実装範囲が広い (detector lib + API + client + telemetry + flag 4 件)
- 段階 rollout が複数 phase
- 各 phase で CEO 承認必要

**runtime risk**: 低 (各 phase OFF default + observability-first)

---

## §5 各案比較 (9 dimensions)

| Dim | Alt 1 Route | Alt 2 Thread Meta | Alt 3 Client | Alt 4 Server Inject | Alt 5 Hybrid |
|---|---|---|---|---|---|
| **runtime risk** | 中 | 中 | 高 | 中 | 低 |
| **UI 影響** | 低 (server 内) | 低 | 高 (client state) | 低 (additive) | 低 (additive + flag OFF default) |
| **production safety** | 中 (route 拡張) | 中 (DB read 追加) | 高 (state 肥大化) | 高 (additive) | **最高 (observability-first + 2 段階)** |
| **rollout しやすさ** | 中 | 中 | 低 (client deploy) | 中 | **最高 (2 段階 OBSERVE→LIVE)** |
| **test しやすさ** | 中 (route mock 要) | **高 (純関数)** | 低 (state hook 複雑) | 中 (response mock 要) | **最高 (detector lib 純関数 + 段階 e2e)** |
| **rollback しやすさ** | 中 | 中 (env で detector OFF) | 低 (client state migration 要) | 高 (response field OFF で OK) | **最高 (1 env flag で全 OFF)** |
| **signal access** | 高 | **最高 (DB stateful)** | 低 | 高 (server) | **最高 (server + client smoke 互換)** |
| **latency 影響** | 中 (route 内) | 中 (DB read +N ms) | 低 (in-memory) | 中 (server compute) | 中 (server compute、cache 可) |
| **smoke harness 互換** | 一部 | 一部 | 一部 | 全 (response が後勝ち想定) | **完全 (smoke が先勝ち、override 維持)** |

### §5.1 比較結論

- **Alt 3 (Client)**: client state 肥大化 / 複数 device 不整合で却下
- **Alt 1 (Route)**: 既存 5 層 pipeline との関係 unclear、Alt 4 と本質的に統合可能
- **Alt 2 (Thread Meta) 単独**: DB read 中心の static detector、per-turn signal を取りこぼす
- **Alt 4 (Server Inject) 単独**: detector logic の信号融合方針が未定 (Alt 2 と統合すべき)
- **Alt 5 (Hybrid)**: 全 dimension で **最良 or 同等**、observability-first / 2 段階 / smoke 完全互換

→ **Alt 5 Hybrid を推奨**。

---

## §6 推奨案: Alt 5 Hybrid 詳細設計

### §6.1 全体アーキテクチャ

```
┌────────────────────────────────────────────────────────────┐
│ Server-side                                                │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ contextDetector (純関数 library、新規)                  │ │
│ │ - input: { threadId, pairState, recentMessages,         │ │
│ │           understandingBundle, fairnessLedger, ... }   │ │
│ │ - output: { flags: Partial<PatternContext>,             │ │
│ │             confidence: Record<flag, number>,           │ │
│ │             telemetry: ContextDetectionEvent }         │ │
│ │ - τ threshold で flags 確定 (confidence ≥ τ のみ)       │ │
│ └────────────────────────────────────────────────────────┘ │
│                          │                                  │
│                          ▼                                  │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ /api/coalter/invoke route (既存、additive 拡張)         │ │
│ │ - response.data.patternContext?: Partial<PatternContext>│ │
│ │ - 既存 5 層 pipeline 不変、最終 step で detector 呼出   │ │
│ │ - flag OFF 既定 で field 省略 (既存 client 完全互換)    │ │
│ └────────────────────────────────────────────────────────┘ │
└───────────────────────────┬────────────────────────────────┘
                            │
                            ▼ HTTP response (additive)
┌────────────────────────────────────────────────────────────┐
│ Client-side                                                │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ UpperLayerMount (既存、additive 拡張)                   │ │
│ │ - response.data.patternContext を受領                  │ │
│ │ - smokeContextOverride (Preview only) が **先勝ち**     │ │
│ │ - response 由来 patternContext が **後勝ち**            │ │
│ │ - exec.dispatch.setPatternContext 経由で state 反映     │ │
│ └────────────────────────────────────────────────────────┘ │
│                          │                                  │
│                          ▼                                  │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ usePresenceExecutor (既存、不変)                        │ │
│ │ - patternContext state を保持、selectPattern に渡す     │ │
│ └────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

### §6.2 API contract (additive)

**正本**: `lib/coalter/types.ts` 既存 `CoAlterApiResponse` / `CoAlterOutput` 型

`/api/coalter/invoke` response (additive change):

```typescript
type CoAlterApiResponse<T = CoAlterOutput> = {
  ok: boolean;
  data?: T;
  error?: string;
  // 既存 field (Stage1Snapshot 等) 不変
  stage1?: Stage1Snapshot;
  // ↓ Gap 4 新規 (additive、optional)
  patternContext?: Partial<PatternContext>;
  // ↓ observability (additive、optional、別 phase で表示)
  patternContextDiagnostics?: {
    confidence: Record<keyof PatternContext, number>;
    thresholdUsed: number;
    detectorVersion: string;
  };
};
```

既存 client は新 field を無視可 (TypeScript optional)、Gap 4 detector OFF 時は field 省略で 100% backward compatible。

### §6.3 detector library 設計

新規 file: `lib/coalter/presence/contextDetector.ts` (本 PR で**作らない**、別 phase 実装着手)

```typescript
// 純関数 (本 PR は設計のみ、impl は別 PR)
export interface ContextDetectorInput {
  threadId: string;
  pairState: CoAlterPairState | null;
  recentMessages: TalkMessage[];        // 直近 N turn (e.g., 5)
  understandingBundle?: Stage1Snapshot; // Stage 1 結果
  fairnessLedger?: FairnessLedgerRow;   // bias_score
  routerInput?: ModeRouterInput;        // misread / contradiction / stall / ambiguity
  emotionSignals?: EmotionSignals;      // Bug-1 Step C 由来
}

export interface ContextDetectorOutput {
  patternContext: Partial<PatternContext>;       // threshold 通過後の boolean field
  confidence: Record<keyof PatternContext, number>; // (0-1)、observability 用
  telemetry: ContextDetectionEvent;              // Sentry / observability
}

export function detectPatternContext(
  input: ContextDetectorInput,
  threshold: number = 0.5,
): ContextDetectorOutput {
  // 7 fields each に対し純関数 infer logic
  // confidence-graded → threshold で boolean 確定
}
```

### §6.4 段階 rollout phase 分解 (CEO 承認 gate 各 phase)

| Phase | 内容 | CEO 承認 | runtime 影響 |
|---|---|---|---|
| **D1** (本 PR) | docs-only 設計確定 | 本 PR merge 判断 | 0 |
| **D2** | `contextDetector` 純関数 library + unit test (production behavior 不変) | CEO 承認 | 0 (library 単体、未呼出) |
| **D3** | invoke route で detector 呼出 + response に additive field 追加 (flag OFF 既定で field 省略) | CEO 承認 | 0 (flag OFF) |
| **D4** | `UpperLayerMount` で response 受領 + smokeContextOverride との priority logic 確定 (response 後勝ち) | CEO 承認 | 0 (flag OFF) |
| **D5** | env flag `NEXT_PUBLIC_COALTER_PRESENCE_CONTEXT_DETECTION` 追加、**OBSERVE mode** で detector + telemetry のみ動作、`setPatternContext` 呼出**しない** (variant 発火に影響 0) | CEO 承認 + Preview smoke | 0 (OBSERVE = 観測 only) |
| **D6** | telemetry 観測 (1-2 週間、Sentry / supabase 集計) で detector 精度 calibrate、threshold τ 調整 | CEO 観測 + 判断 | 0 (継続 OBSERVE) |
| **D7** | flag `LIVE` mode で `setPatternContext` 経由実 variant 発火、canary rollout (CEO 1 test pair → 数 pair → 全 user) | **CEO 戦略判断 (Step E 統合可能)** | **+ (実 variant 発火)** |

### §6.5 confidence-graded firing 実装方針 (人間超越 idea 2)

各 detector function:

```typescript
function detectInfoMissing(input: ContextDetectorInput): { value: boolean; confidence: number } {
  // 例: Stage 1 outcome / catalog 結果 / candidate count を統合
  let confidence = 0;
  if (input.understandingBundle?.outcome === "failed") confidence += 0.4;
  if (input.recentMessages.length === 0) confidence += 0.3;
  // ...
  return { value: confidence >= 0.5, confidence: Math.min(confidence, 1.0) };
}
```

**threshold τ = 0.5 default**、env 経由 override 可能 (rollout 時 τ tune)。

---

## §7 実装時 gate

### §7.1 D2 (detector lib) phase gate

| Gate | 内容 | PASS 条件 |
|---|---|---|
| Unit test | detector 各 function の純関数 test | 全 7 fields の logic test、edge case 含む |
| Threshold sensitivity | τ 変化時の output 変化 test | τ=0 / τ=0.5 / τ=1.0 で挙動確認 |
| Backward compat | 既存 invoke route 動作不変 | 既存 invoke flow test PASS、library 未呼出 |
| Type safety | TypeScript 厳格、`Partial<PatternContext>` 型整合 | tsc 0 error |
| Build | Vercel Preview build PASS | docs-only PR と同様 |

### §7.2 D3 (route 拡張) phase gate

| Gate | 内容 |
|---|---|
| Response shape additive | 既存 field 不変、optional field 追加のみ |
| Flag OFF 既定で field 省略 | env 未設定で response.data に patternContext 不在 |
| Latency 観測 | DB read 追加 latency が p95 で < +50 ms |
| 既存 client 互換 | 既存 client (Preview / Production) で response 受領 OK |

### §7.3 D5 (OBSERVE mode) phase gate

| Gate | 内容 |
|---|---|
| Preview smoke | Preview env で OBSERVE 動作確認、smoke harness 並走可 |
| Sentry telemetry | `coalter.gap4.context_detected` event 流出、7 fields confidence 分布 |
| Production behavior 不変 | OBSERVE では `setPatternContext` 呼出しない → variant 発火率 0 維持 |
| Detector 精度 baseline | 1-2 週間で各 flag の発火率 baseline 確定 (CEO 観測判断材料) |

### §7.4 D7 (LIVE mode) phase gate

| Gate | 内容 |
|---|---|
| Detector 精度 sufficient | D6 観測で各 flag false positive rate < 10% |
| Variant 発火率 observable | Sentry で Pattern A-F-2 発火率分布計測可能 |
| Rollback procedure | env flag = OFF で即座 Gap 4 前状態 (variant=null 復帰) |
| Canary plan | CEO 1 test pair → 5 pair → 50 pair → 全 user の段階 plan |
| Step E 統合 | observability infrastructure を Step E と統合 (Step E-0 詳細化 timing と整合) |

### §7.5 Step E との関係

Gap 4 解消 = Pattern variant が production user に届く = **Step E (観測 shadow → canary → 本番 flip) の母体**となる。Gap 4 と Step E の関係:

- Step E は movie domain (provider foundation a3 wiring 含む) を主軸とする観測 phase (PR #109)
- Gap 4 は Layout 全体の variant 発火を主軸とする検出 phase
- 両者は **observability infrastructure を共有**可能 (Sentry telemetry / Supabase coalter_provider_cost_log 等)
- D5 OBSERVE mode + D7 LIVE rollout を Step E の rollout pattern と同期可能 (CEO 戦略判断要項 §7 #15 + #13)

---

## §8 人間超越設計 5 要素

本書を pure 5-Alt 比較 doc にとどめず、CoAlter 全体の Gap 4 解消が「人間設計者を超越する」ための 5 要素を組込:

### §8.1 Idea 1: Multi-source signal fusion

単一 detector ではなく **既存 signal infrastructure 全体を融合**。Action Mode (modeRouter input: misread / contradiction / stall / ambiguity)、Presence Mode (signalAdapter / signalClassifier / signalEchoDedupe)、Domain (Stage 1 Understand bundle / movieCatalog / foodCatalog)、Emotion (Bug-1 Step C extract)、Fairness Ledger を fuse。

**人間超越点**: 人間設計者は単一 signal に偏りがち。Multi-source は signal 不在領域を補完し、誤発火を抑止。

### §8.2 Idea 2: Confidence-graded firing

7 fields each に (value, confidence) 内部表現、τ threshold で boolean 確定。

**人間超越点**: 「true / false」の 2-value 設計は誤発火しやすい。confidence-graded は弱 signal を切捨て、強 signal で確定、kill switch (τ=1.0) で即座抑止可。

### §8.3 Idea 3: Observability-first incremental rollout

D5 OBSERVE mode (detector + telemetry のみ、variant 発火 0) で **calibrate してから** D7 LIVE mode に進む。

**人間超越点**: 人間設計者は impl 直後に LIVE にしがち。OBSERVE first は precision/recall を実 data で calibrate してから switch、risk 段階解放。

### §8.4 Idea 4: Smoke and Production unify

`smokeContextOverride.ts` の whitelist + fail-closed 構造 (許可 flag 7 個、env exact "true" only) を production detector の **API contract reference** として再利用。

具体的には:
- Server detector output と Smoke harness override を **同 API shape** (`Partial<PatternContext>`) に揃える
- Client UpperLayerMount で **smoke 先勝ち、production response 後勝ち** の priority 確定
- Preview env で smoke + detector 並走可能 (debug 性維持)
- Production env で smoke 必ず OFF (CEO 厳守) + detector ON 切替

**人間超越点**: debug 環境と production 環境を分断せず、同 contract で運用。debug 中の発見が直接 production logic 改善に繋がる。

### §8.5 Idea 5: Rollback-friendly atomic switching

1 env flag (`NEXT_PUBLIC_COALTER_PRESENCE_CONTEXT_DETECTION`) で全 detector OFF。即座に Gap 4 前状態 (variant=null) に復帰可能。

加えて:
- `MODE` enum (`OBSERVE` / `LIVE` / `OFF`) で 3 段階切替
- detector library は OFF 時 0 ms (early return)、production performance 影響 0
- response shape は OFF 時 field 省略 → 既存 client 100% 互換

**人間超越点**: 障害時の rollback 手順を **設計時に確定** することで、運用 risk を構造的に削減。

---

## §9 まだやらない (本 PR scope 外)

### §9.1 runtime / production 操作

- ❌ `contextDetector` library 実装着手 (D2 phase、別 PR)
- ❌ `/api/coalter/invoke` route 修正 (D3 phase、別 PR)
- ❌ `UpperLayerMount` 修正 (D4 phase、別 PR)
- ❌ `flags.ts` への新規 env flag 追加 (D5 phase、別 PR)
- ❌ `usePresenceExecutor` 修正 (本書範囲外、内部 state は不変)
- ❌ `patternSelector.ts` / `PatternContext` 型 修正 (型は既存、本書は追加 detector のみ)
- ❌ `lib/coalter/presence/**` の既存 file touch

### §9.2 implementation 着手なし

- ❌ detector logic の実コード作成
- ❌ unit test 作成
- ❌ telemetry event schema 確定
- ❌ Supabase migration 追加

### §9.3 production / env / API

- ❌ env 変更 (`NEXT_PUBLIC_COALTER_PRESENCE_CONTEXT_DETECTION` 等の追加なし)
- ❌ Production env / Vercel deploy 操作
- ❌ Anthropic Console / 実 API call / API key 操作
- ❌ Supabase migration 新規追加 / 既存 migration touch

### §9.4 別領域 (CEO directive 2026-05-15)

- ❌ movieOrchestrator / movie domain 修正
- ❌ ProviderSelector / Anthropic provider 修正
- ❌ Step E (観測) 開始
- ❌ bug1 cleanup (`/Users/haradataishi/Culcept-coalter-bug1` + `feat/coalter-bug1-step-c` touch しない)
- ❌ Stargazer / Human OS 等 別領域 pivot
- ❌ 本 doc の merge (CEO 判断)
- ❌ reflect mode 着手 (Phase 3 後送り)
- ❌ travel domain greenfield 着手 (G-2、別 PR)

---

## §10 verify 結果 (8 項目全 PASS 予定)

本 commit 前自己確認 (commit 後再確認):

| # | 項目 | 結果 |
|---|---|---|
| 1 | docs-only | ✅ `docs/coalter-gap4-production-context-detection.md` 1 file 追加のみ |
| 2 | lib touch 0 | ✅ |
| 3 | src touch 0 | ✅ |
| 4 | tests touch 0 | ✅ |
| 5 | package touch 0 | ✅ |
| 6 | supabase/migrations touch 0 | ✅ |
| 7 | Alter Morning 実 path touch 0 | ✅ (本 file 内 言及は本 verify 行 meta-reference のみ) |
| 8 | secrets 値 露出 0 | ✅ (token 名 / env var 名 reference のみ、actual value なし) |

---

## §11 CEO 判断請求事項

1. **本 doc の merge 判断**
2. **Alt 5 Hybrid 推奨案の承認** (Server detector + additive response + client receive + smoke unify + confidence-graded firing + 2-stage OBSERVE→LIVE rollout)
3. **D2 (detector library 実装着手) timing 判断** — 本 doc merge 後の next phase 着手承認
4. **Step E との統合 timing 判断** — Gap 4 D5 OBSERVE と Step E observability infrastructure の同期戦略
5. **threshold τ default 値 (0.5) の妥当性確認** — 後段 D6 phase で実 data 観測後 calibrate

---

## §12 次の docs-only autonomous 候補 (本 doc merge 後)

PR #122 §8.1 で挙げた候補のうち、Gap 4 設計確定後に進める順:

| # | 候補 | 関係 |
|---|---|---|
| G-2 | Travel domain greenfield design docs | Gap 4 と独立、Domain 層、並列着手可 |
| G-3 | Daily × Domain cross-axis dispatch 設計 docs | Gap 4 解消後、Daily の retrieval 経路設計 |
| G-4 | L4-m legacy 退役 status audit docs | Layout Stage 4 完了の closeout 条件確認、軽量 |
| G-5 | Reflect mode Phase 3 pre-review docs | Phase 3 開始判断材料 |
| G-6 | Activity domain 対象範囲 mapping docs | Domain 拡張範囲確認、軽量 |
| F-2 | D-2-e3-b/c/d/e audit docs | movie path の未把握 sub-phase 解消 |
| F-5 | PR #102 scaffold + PR #110-#119 関係 audit docs | movie Path α vs Path β 判断補助 |

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
