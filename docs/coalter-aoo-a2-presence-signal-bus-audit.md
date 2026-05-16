# CoAlter Always-On Observer — A-2a Presence Signal Bus Read-Only Audit

**ステータス**: 完了（docs-only、read-only audit）
**作成日**: 2026-05-16
**目的**: A-2 hook 候補 B (presence signal bus subscribe) の採用可否を確定するための read-only audit。実装着手前の preflight。
**前提**: PR #154 Presence Reconciliation で確定した不可侵境界遵守。CEO/GPT 判断 (2026-05-16) "read-only audit のみ許可、変更禁止" 遵守。
**結論先出し**: **B 採用可（条件付き）**。ただし 2 件の追加 audit findings あり (CEO 判断項目化)。

---

## 0. Executive Summary

### 0.1 B 採用可否 — 結論

**B (presence signal bus subscribe) は技術的に採用可**。条件:

| 条件 | 充足 | 備考 |
|---|---|---|
| subscribe API が既にある、または追加が極小で安全 | ✅ 完全に既存 (`subscribePresenceSignal`) |
| signal payload が redacted 済み | ⚠️ 部分的 — meta に `lastMessageId` が含まれる |
| observer が passive にlisten できる | ✅ subscribe API は passive consumer 想定 |
| existing presence behavior を変えない | ✅ try/catch isolation で副作用なし |
| ModeSwitcher / UpperLayerMount / modeReducer / modeContextManager を触らない | ✅ bus subscribe のみで完結 |
| production behavior 変更を flag で完全 OFF にできる | ✅ observer 側 env flag で可 |

### 0.2 重要 audit findings（CEO 判断項目）

| Finding | 詳細 | CEO 判断項目 |
|---|---|---|
| **F1: PresenceSignal.meta に `lastMessageId` が含まれる** | 既存 publisher 経路 (`PresenceSignalWiring.tsx`) で publish 時 meta に `lastMessageId` が載っている。これは message identifier (PII 候補)。observer 側で redact 必須 | C2 (R1 補正) |
| **F2: bus は client-side only (現状)** | 既存 publisher / subscriber 全て `app/components/chat/` 配下 = client 側。observer も client 側でしか subscribe できない。A4 retrieval (server) との接続が壊れる | C2 (R2 補正) |
| **F3: "subscribers は UI renderer のみ" 原則の解釈** | bus の JSDoc に "presence.state.* 購読者は UI renderer のみ (executor 逆方向結合禁止)" とある。observer は UI renderer ではない | C2 (R3 補正) |

### 0.3 採用 path

CEO 判断後の path:
- B 採用 + F1-F3 解決方針確定 → A-2b Implementation Preflight Plan を起票
- B 不採用 → fallback E (新規 endpoint) / A (message route hook) の再評価

---

## 1. productionSignalBus.ts 完全解剖（CEO 指示 1-3）

### 1.1 ファイル概要

- 配置: `lib/coalter/presence/productionSignalBus.ts`
- 行数: 78 行
- ステータス: Stage 4 L4-b 本番化済 (commit `1b437689` 時点)
- 不変境界: PR #154 不可侵境界対象 (本 audit では touch しない)

### 1.2 API surface (read-only audit 結果)

| Function | Signature | 用途 |
|---|---|---|
| `publishPresenceSignal(signal)` | `(signal: PresenceSignal) => void` | Bus に publish、subscribers に同期 fan-out |
| `subscribePresenceSignal(listener)` | `(listener: SignalListener) => () => void` | Subscribe、unsubscribe 関数を返す |
| `getRecentSignals()` | `() => ReadonlyArray<PresenceSignal>` | 最近 100 件の read-only snapshot (debug 用) |
| `__resetSignalBus()` | `() => void` | Test reset (production 禁止) |

### 1.3 実装パターン分析

```typescript
// 抜粋 (productionSignalBus.ts 24-30)
type SignalListener = (signal: PresenceSignal) => void;
const listeners: Set<SignalListener> = new Set();
const recentSignals: PresenceSignal[] = [];
const RECENT_SIGNAL_LIMIT = 100;
```

**実装パターン**: Singleton in-memory observable (Pub/Sub pattern)、Set ベースの listener registry。

**特性**:
- 1 process / 1 bus instance (module-level singleton)
- `recentSignals` は 100 件 cache (FIFO drop oldest)
- listener throw は他 listener に伝播しない (fail-open、try/catch)
- subscribers 0 でも publish は safe (no-op)

### 1.4 既存 subscribers (CEO 指示 3 / 11)

| Callsite | File | 用途 |
|---|---|---|
| `subscribePresenceSignal(dispatchSignal)` | `app/components/chat/hooks/usePresenceExecutor.ts:264` | UI renderer (presence executor) の signal 受信 |

**既存 subscriber は 1 件のみ**。observer 追加で 2 件目になる。listener throw isolation により competition なし。

### 1.5 既存 publishers (CEO 指示 8 / 補強)

| Callsite | File | 用途 |
|---|---|---|
| `publishPresenceSignal(adaptCritical({...}))` | `app/components/chat/PresenceSignalWiring.tsx:151` | Critical signal (urgent layer trigger) publish |
| `publishPresenceSignal(signal)` | `app/components/chat/PresenceSignalWiring.tsx:171` | Implicit signal (state 遷移用) publish |

**既存 publisher は 2 callsites (同一ファイル内)**。両方とも client side (PresenceSignalWiring.tsx は React component)。

---

## 2. PresenceSignal payload 詳細（CEO 指示 4, 5）

### 2.1 Type 定義 (`lib/coalter/presence/types.ts:187-194`)

```typescript
export interface PresenceSignal {
  kind: SignalKind;          // explicit / implicit / critical / mode_promotion / manual_restart
  strength: SignalStrength;  // strong / soft / none
  detectedAt: number;        // ISO 8601 or epoch ms
  meta?: Readonly<Record<string, unknown>>;  // 緩い型、実装側で詳細化
}
```

### 2.2 既存 publisher の meta 実例 (read-only)

**Critical signal (`PresenceSignalWiring.tsx:151-156`):**
```typescript
publishPresenceSignal(
  adaptCritical({
    trigger: critical.trigger,
    detectedAt: Date.now(),
    meta: { lastMessageId: last.id, matchedPattern: critical.matchedPattern },
  }),
);
```

**Implicit signal (`PresenceSignalWiring.tsx:165-171`):**
```typescript
const signal = adaptImplicit({
  softScore: score,
  detectedAt: Date.now(),
  meta: { lastMessageId: last.id },
});
publishPresenceSignal(signal);
```

### 2.3 🔴 重要発見 F1: meta に `lastMessageId` 含有

両 publisher で `meta: { lastMessageId: last.id, ... }` を publish。

これは:
- message identifier (PII 候補)
- `last.id` は `talk_messages` table の PK (UUID 想定)
- raw value は PII firewall 違反

**Observer 採用時の影響**:
- 既存 publisher を変更しないため、observer は raw `lastMessageId` を受信する
- observer 側で **redact 必須** (hash 化 or 削除)
- A4 retrieval に出す場合は absolutely no raw `lastMessageId`

**緩和策（観察 of observer architecture）**:
- A-1/A-1b deliverable の `PII_FORBIDDEN_FIELD_NAMES` audit list を拡張: `lastMessageId`, `last_message_id`, `messageId`, `message_id` 追加 → これは A-2 着手時に対応
- observer の subscribe handler 内で signal.meta を strip / redact してから state container に渡す

### 2.4 Mode 情報の取得（CEO 指示 6）

PresenceSignal 自体には mode 情報は含まれない。

ただし:
- `kind = "mode_promotion"` signal は mode 切替のシグナル（変更後の mode は meta に含む可能性）
- mode 状態は別途 `sharedState.mode` から取得 (server 正本、両 client broadcast)

**Observer 側の mode 取得方針** (3 案):

| 案 | 詳細 | 実装 |
|---|---|---|
| α | signal.kind を見て mode_promotion を検出、その他は別 source から mode 取得 | mode は別途 read |
| β | bus subscribe と並行に sharedState を read-only 参照 | observer は mode を read-only 取得 |
| γ | observer は mode を持たない、signal のみを蓄積 | mode 不要設計（観測 dimension が一つ減る）|

**推奨**: β (subscribe + 別途 sharedState read)。client side で `getSharedState()` 相当を read-only 呼出。

### 2.5 ExecutorAvailability / PresenceMode 整合（CEO 指示 7）

- PresenceSignal は ExecutorAvailability / PresenceMode を直接持たない
- observer は `subscribePresenceSignal` で signal を受信しつつ、別途 `sharedState.availability` / `sharedState.mode` を read で取得
- A-1b で observer state container は既に `ExecutorAvailability` / `PresenceMode` 型を import 済 → 受け取り側は整合済

---

## 3. Signal 発火タイミング（CEO 指示 8, 9）

### 3.1 発火条件 (`PresenceSignalWiring.tsx` 解析)

PresenceSignalWiring component の useEffect 内で:
- messages 配列の変化を検知
- `last = messages[messages.length - 1]` で最新 message を取得
- Critical: `criticalKeywordDetector` で critical 判定 → critical signal publish
- Critical 不検出: implicit signal publish (state 遷移用)

**発火頻度**: 各 message arrival で `2 signal` (critical detect or implicit) — ただし critical 発火時は implicit skip (duplicate prevention)。

### 3.2 server side / client side （CEO 指示 9）

**両方とも client side のみ**:
- `PresenceSignalWiring.tsx` は `"use client"` component
- `productionSignalBus.ts` は module-level singleton (Node.js / browser 両方で動くが、現状 publisher/subscriber 全て client)
- 既存 subscriber (`usePresenceExecutor`) も client 側 hook

### 3.3 🔴 重要発見 F2: client-side only 制約

bus は理論上 server / client 両方で動くが、**現状の実 publish/subscribe 経路は client only**。

**Observer 採用時の重大な影響**:
- observer も client 側で subscribe する必要
- observer state container も client-local になる
- **A4 retrieval (server-side API) からは observer state が見えない**

**対応案** (3 案):

| 案 | 内容 | 実装複雑度 | 整合性 |
|---|---|---|---|
| 案 1 | observer state を client → server に同期する新規 endpoint | ★ 新規 API 必要 | client/server 両方修正、複雑 |
| 案 2 | A4 retrieval を client から呼ぶ (semantics 変更) | ★★ 既存 A4 を変更 | 違和感、PII redaction の意味薄れる |
| 案 3 | observer 自体を server に持つ (server side bus が必要) | ★ presence layer 拡張必要 | 不可侵境界違反 |
| 案 4 | Phase A は client-only observation、A4 retrieval は別目的（CEO 観測専用） | ★★★ 設計上 sane | A1/A2 の retrieval 役割を再定義 |

**推奨**: 案 4。Phase A の目的は「observation 蓄積」であり、A4 retrieval は元々 debug 用途。Phase A 段階では client-only でも valid。A4 retrieval は「presence layer に流入する signal の事後検証」として server 側で独立に運用 (今後 phase B+ で server-side observer を別途設計)。

---

## 4. Observer Passive Subscriber 設計（CEO 指示 10, 11）

### 4.1 Passive subscriber 可能性 (CEO 指示 10)

bus API は passive subscribe 完全対応:
- `subscribePresenceSignal(listener)` 呼出のみ、publisher への影響ゼロ
- listener throw は他 listener / publisher に伝播しない (try/catch isolation)
- subscribers 0 でも publish は safe → 後発 subscriber も lifecycle 自由

**Passive subscriber として完璧**。

### 4.2 副作用ゼロ保証 (CEO 指示 11)

Observer subscriber は以下を遵守する:
- signal を **mutate しない** (`PresenceSignal` は immutable contract、observer は read only)
- signal を **consume しない** (他 subscriber も同じ signal を受信する fan-out 構造、競合なし)
- signal を **block しない** (bus は同期 fan-out だが try/catch isolation あり、observer の重い処理は内部で fire-and-forget 設計)
- listener throw を**二重 try/catch** で握りつぶす (bus 側 + observer 側両方)

### 4.3 既存 presence behavior 維持

| 保証項目 | 実現方法 |
|---|---|
| 既存 subscriber (`usePresenceExecutor`) の動作不変 | bus は fan-out、listener 独立 |
| publisher (`PresenceSignalWiring`) の動作不変 | subscriber 追加は publisher に影響しない |
| signal 受信順序の同一性 | bus の Set iteration 順は登録順、observer 追加で既存 subscriber の受信順は不変 |
| signal payload の不変 | observer は read only、mutate 禁止 |
| flag OFF 時の動作完全不変 | observer subscribe を env flag (`COALTER_OBSERVER_PRESENCE_SUBSCRIBE_ENABLED` 等) でgate |

---

## 5. 不可侵境界遵守（CEO 指示 12）

### 5.1 touch 禁止 file 群（PR #154 で確定済）

以下を一切 touch しない:
- `lib/coalter/presence/` 配下 30+ files
- `app/components/chat/` 配下 17 files + 内部 hooks/ + states/
- `lib/coalter/flags.ts` の `presenceExecutorEnabled` flag

### 5.2 B 採用時の touch 範囲

新規追加（既存 file touch 0）:
- `lib/coalter/observer/observerSubscriber.ts` (新規) — bus subscribe + state container 更新
- `lib/coalter/observer/observerSubscriberGate.ts` (新規) — env flag gate
- `lib/coalter/flags.ts` の env getter 追加 (新規 env var) — **これは flags.ts touch**、不可侵か検討

**判断点**: `lib/coalter/flags.ts` は presence layer の `presenceExecutorEnabled` を含むが、それ以外の flag (`understandingShadowMovie` 等) も含む共有ファイル。「presence layer の意味を変えない」原則を遵守する限り getter 追加は安全と判断。

ただし CEO 確認必須。

---

## 6. Process Isolation（CEO 指示 13）

### 6.1 Bus instance の独立性

`productionSignalBus.ts` は module-level singleton。**1 process / 1 instance**。

| Context | Instance 分布 |
|---|---|
| Browser (client) | 1 user session = 1 browser tab = 1 instance |
| Node.js (server) | 1 process = 1 instance (Vercel serverless function 毎) |

**現状の bus 利用**:
- publish: client 側 (`PresenceSignalWiring`)
- subscribe: client 側 (`usePresenceExecutor`)
- → **同一 browser session 内で完結** (process isolation の影響なし)

### 6.2 Observer state container との関係

observer state container (A-1/A-1b deliverable) も module-level singleton (in-memory Map):
- client subscribe で動かす場合: client session 内で state 完結、A4 retrieval (server) からは見えない → §3.3 案 4 採用
- server subscribe で動かす場合: 現状 publish が client のみなので signal 流入なし → 無意味

### 6.3 結論

B 採用時の運用前提:
- observer subscribe は client side
- observer state も client side（process-local + ephemeral）
- 各 browser session 内で完結
- A4 retrieval (server) と切り離す or 別目的化（§3.3 案 4）

---

## 7. Rollback 方法（CEO 指示 14）

### 7.1 段階的 rollback

| Layer | Rollback 操作 | 影響 |
|---|---|---|
| 軽度 | observer 内 env flag OFF | observer subscribe しない、既存動作完全不変 |
| 中度 | observer subscriber file 削除 | runtime 接続切断、code は残る |
| 重度 | A-1/A-1b deliverable revert (PR #153, #155) | observer layer 全消去、presence layer 不変 |

### 7.2 完全 rollback の容易性

- 最重要: env flag OFF で即時無効化
- bus subscribe 関数の return value (unsubscribe 関数) を保持し、cleanup phase で unsubscribe
- React hook の lifecycle に合わせる場合: `useEffect` cleanup 内で unsubscribe

→ Rollback は容易。

---

## 8. B 不採用時の fallback (CEO 指示 15)

B 採用条件未達の場合、fallback 比較:

### 8.1 Fallback E: 新規 observer endpoint

```typescript
// 新規 /api/coalter/observer/tick (server side)
// + client side trigger (useEffect で定期 / event-driven 呼出)
```

| 軸 | 評価 |
|---|---|
| Mode 取得 | ★★★ client が知る、request body 経由 |
| Coverage | ★★ client online 時のみ |
| PII firewall | ★★★ route 内実装 |
| 既存 file touch | ★★★ 0 |
| 実装複雑度 | ★★ 新規 route + client wiring |

**特徴**: 既存 file 触らない最も保守的 path。ただし client + server 両方 wiring。

### 8.2 Fallback A: message route hook

```typescript
// app/api/talk/threads/[threadId]/messages/route.ts POST 内
// fire-and-forget observer 呼出
```

| 軸 | 評価 |
|---|---|
| Mode 取得 | ★ server で DB query 必要 |
| Coverage | ★★★ 全 message |
| PII firewall | ★★ message body を扱う route |
| 既存 file touch | ★★ stable route touch |
| 実装複雑度 | ★★ moderate |

**特徴**: coverage 最高、ただし talk 機能の基礎 route を touch。

### 8.3 B 不採用時の推奨

優先順位:
1. **E (新規 endpoint)** — 既存 file 触らない、最も保守的
2. A (message route hook) — coverage 必須なら

---

## 9. B 採用条件 / 不採用条件の最終検証

### 9.1 B 採用条件（CEO/GPT 指定）

| 条件 | 検証結果 | 詳細 |
|---|---|---|
| subscribe API が既にある、または追加が極小で安全 | ✅ **完璧に既存** | `subscribePresenceSignal` 既存、bus 追加修正不要 |
| signal payload が redacted 済み | ⚠️ **部分的** | `lastMessageId` を含む、observer 側で redact 必須 (F1) |
| observer が passive にlisten できる | ✅ 完全対応 | bus API は passive consumer 想定 |
| existing presence behavior を変えない | ✅ 保証 | try/catch isolation、fan-out 構造 |
| ModeSwitcher / UpperLayerMount / modeReducer / modeContextManager を触らない | ✅ 不要 | bus subscribe のみで完結 |
| production behavior 変更を flag で完全 OFF にできる | ✅ 可能 | observer 側 env flag |

### 9.2 B 不採用条件（CEO/GPT 指定）

| 条件 | 検証結果 |
|---|---|
| subscribe API がない | ❌ 既存 |
| bus に subscribe を追加するには presence layer 中核を大きく変更する必要 | ❌ 追加不要 |
| signal に raw text / PII が含まれる | ⚠️ raw text は無い、PII は `lastMessageId` のみ (redact で対応可) |
| observer が既存 signal flow に副作用を与える | ❌ isolation あり |
| UI / mode reducer / UpperLayerMount touch が必要 | ❌ 不要 |

### 9.3 最終結論

**B 採用可（条件付き）**。条件:

1. observer subscribe handler 内で `lastMessageId` を必ず redact (raw 保存禁止)
2. observer state container を client-side で持つ (server側 A4 retrieval との接続は §3.3 案 4 で別目的化)
3. `lib/coalter/flags.ts` への env getter 追加を許可（CEO 判断項目）
4. "subscribers は UI renderer のみ" 原則の解釈拡張を許可（CEO 判断項目）

---

## 10. CEO 判断項目（A-2b 着手前必須）

| # | 質問 | 選択肢 |
|---|---|---|
| **D1** | B 採用可否 | (a) 採用 (条件付き) / (b) 不採用 → E に fallback / (c) 不採用 → A に fallback / (d) 採用判断保留 |
| **D2** | `lib/coalter/flags.ts` への env getter 追加許可 | (a) YES (flag 追加のみ、既存 flag に手を加えない) / (b) NO (別ファイルで flag 管理) |
| **D3** | "subscribers は UI renderer のみ" 原則の解釈拡張 | (a) YES (observer = "passive diagnostics consumer" として UI renderer のカテゴリ拡張) / (b) NO (新カテゴリ定義の docs PR を起票) |
| **D4** | client-side only observer + server-side A4 retrieval 分離 (§3.3 案 4) | (a) YES (Phase A は client-only observation、A4 retrieval は別目的化) / (b) NO (server-side observer を別途設計、Phase A 延長) |
| **D5** | `lastMessageId` redact 方針 | (a) 完全削除 (snapshot に含めない) / (b) hash 化 (`redactedMessageId` として保持、相関分析に使う) / (c) その他 |

---

## 11. 推奨 path（私の自立推論）

**最小複雑度 path**:

```
D1 = (a) B 採用 (条件付き)
D2 = (a) YES (flag 追加のみ)
D3 = (a) YES (observer = passive diagnostics consumer として原則の解釈拡張)
D4 = (a) YES (Phase A は client-only、A4 retrieval は別目的化)
D5 = (b) hash 化 (redactedMessageId として保持、Phase B+ で signal 相関分析に使える)
```

### 推奨理由

- B は architecturally 最自然、既存 bus pattern に乗る
- F1-F3 は observer 側の設計対応で解決可能
- presence layer 不可侵境界遵守
- runtime risk 最小
- rollback 容易

---

## 12. B 採用時の A-2b 実装方針（preflight 概要のみ、本 PR では着手しない）

CEO D1-D5 判断後の A-2b 実装計画（別 PR で詳細化）:

### 12.1 新規ファイル候補

| File | 用途 |
|---|---|
| `lib/coalter/observer/observerSubscriber.ts` | bus subscribe + state container 更新 |
| `lib/coalter/observer/observerSubscriberGate.ts` | env flag gate |
| `lib/coalter/observer/signalRedaction.ts` | PresenceSignal → redacted snapshot 変換 (`lastMessageId` hash 化等) |
| `tests/unit/coalter/observer/observerSubscriber.test.ts` | unit tests |
| `tests/unit/coalter/observer/observerSubscriberGate.test.ts` | unit tests |
| `tests/unit/coalter/observer/signalRedaction.test.ts` | redaction tests |

### 12.2 修正ファイル候補

| File | 修正内容 |
|---|---|
| `lib/coalter/flags.ts` | `observerPresenceSubscribeEnabled` env getter 追加 (CEO D2 = YES 前提) |
| `lib/coalter/observer/relationshipStateRedaction.ts` | `PII_FORBIDDEN_FIELD_NAMES` に `lastMessageId` 系を追加 |

### 12.3 client side wiring（A-2c 別 PR 候補）

A-2b で lib のみ完成後、A-2c で client side wiring:
- React hook (`useObserverSubscription`) を作成
- `UpperLayerMount` には touch せず、別の wrapper component or `ChatClient` に直接 hook 追加（要 CEO 判断）

---

## 13. 不変境界（厳守、本 PR + A-2b 着手前）

- ✗ `productionSignalBus.ts` 変更しない
- ✗ presence layer 30+ file 変更しない
- ✗ `app/components/chat/` 17 file 変更しない
- ✗ A-2 実装着手禁止
- ✗ env 追加禁止 (CEO D2 判断後に A-2b で実装)
- ✗ route / API / UI / DB / migration 一切触れない
- ✗ Phase B / Mirror channel 設計禁止
- ✗ Step E-1 / bug1 cleanup / Stargazer pivot 一切触れない

---

## 14. 参照

- `lib/coalter/presence/productionSignalBus.ts` (78 行、blob `f1648fa6`) — 本 audit 対象
- `lib/coalter/presence/types.ts` (PresenceSignal 型定義)
- `app/components/chat/PresenceSignalWiring.tsx` (既存 publisher、`lastMessageId` 含有確認)
- `app/components/chat/hooks/usePresenceExecutor.ts` (既存 subscriber 1 件)
- `docs/coalter-aoo-presence-reconciliation.md` (PR #154、不可侵境界正本)
- `lib/coalter/observer/relationshipState.ts` / `relationshipStateTypes.ts` (A-1/A-1b deliverable)

---

## 15. 変更履歴

| 日付 | 変更 | 承認 |
|---|---|---|
| 2026-05-16 | A-2a read-only audit 初版（B 採用可結論 + F1-F3 findings + D1-D5 CEO 判断項目） | CEO/GPT 判断 "read-only audit のみ許可"（2026-05-16） |
