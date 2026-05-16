# CoAlter Always-On Observer — A-2b Implementation Preflight Plan

**ステータス**: 完了（docs-only、implementation preflight plan）
**作成日**: 2026-05-16
**目的**: A-2 hook = B (presence signal bus subscribe) 採用条件下での実装着手前準備。flag 設計 / 不可侵境界 / lane 判定 / A-2b/A-2c 分割を docs で正本化。
**前提**: CEO/GPT 判断 (2026-05-16) D1-D5:
- D1: B 採用 (条件付き)
- D2: client-safe flag 設計確認後 YES
- D3: observer = passive diagnostics consumer 認める
- D4: client-side observer + A4 retrieval 分離
- D5: lastMessageId hash 化、raw 禁止
**結論先出し**: A-2b 実装可。Auto-merge lane (runtime-unwired library only)。A-2c は別 PR (Stop-before-merge)。

---

## 0. Executive Summary

### 0.1 採用 hook

**B. Presence signal bus subscribe** — `subscribePresenceSignal(listener): () => void` を利用。

Observer は passive subscriber として bus に listen、signal を redact → relationship state container に蓄積。

### 0.2 A-2b vs A-2c 分割

| Phase | 内容 | Lane |
|---|---|---|
| **A-2b** | observer subscriber library + redaction + gate parser (**runtime-unwired**) | Auto-merge allowed |
| **A-2c** | actual client wiring (subscribe call invocation) | Stop-before-merge |

A-2b 段階では subscribe 呼出は library 内 export 関数として「準備」のみ、実 wiring は A-2c で client side 配線。

### 0.3 不可侵境界（PR #154 + 本 PR で再確認）

絶対 touch しない:
- `lib/coalter/presence/` 30+ files (特に `productionSignalBus.ts`)
- `app/components/chat/` 17 files (特に `UpperLayerMount.tsx` / `ModeSwitcher.tsx` / `PresenceSignalWiring.tsx`)
- `lib/coalter/flags.ts` の既存 flag (新 flag getter 追加は OK)

### 0.4 Flag 確定

| 項目 | 確定値 |
|---|---|
| env var | `NEXT_PUBLIC_COALTER_PRESENCE_OBSERVER` |
| getter | `COALTER_FLAGS.presenceObserverEnabled` |
| default | `false` (production / development / preview すべて false) |
| Preview 採用時 ON | `NEXT_PUBLIC_COALTER_PRESENCE_OBSERVER=true` を Preview env に追加 (CEO 操作) |
| Production | 触らない (default false 維持) |
| pattern | 既存 `presenceExecutorEnabled` (NEXT_PUBLIC_COALTER_PRESENCE_EXECUTOR) と並列 |

---

## 1. 採用 hook 詳細（CEO 指示 1）

### 1.1 Subscribe API（既存）

```typescript
// lib/coalter/presence/productionSignalBus.ts:56 (read-only audit 済)
export function subscribePresenceSignal(listener: SignalListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
```

### 1.2 Observer の役割定義

- **Passive subscriber**: signal を受信、redact、内部 state 更新のみ
- **不変原則** (CEO/GPT 指示遵守):
  - signal を mutate しない (immutable contract、observer は read only)
  - signal を consume しない (fan-out 構造で他 subscriber も同じ signal を受信)
  - signal を block しない (listener throw を二重 try/catch で握りつぶす)

### 1.3 Observer flow

```
[presence layer]                          [observer layer (新規)]
                                          
PresenceSignalWiring.publishPresenceSignal(signal)
    ↓ (bus fan-out、try/catch isolation)
bus.listeners.forEach(listener)
    ↓
    ├→ usePresenceExecutor.dispatchSignal (既存)
    │     ↓
    │   PresenceState 遷移 (S0-S8)
    │
    └→ observerSubscriber.handleSignal (新規、A-2c 配線後)
          ↓
        signalRedaction.redactSignal()  ← lastMessageId を hash 化
          ↓
        relationshipState.updateRelationshipState() (A-1/A-1b deliverable)
          ↓
        process-local in-memory store
```

---

## 2. 不可侵境界（CEO 指示 2）

### 2.1 絶対 touch しない file 群

| Category | File | 理由 |
|---|---|---|
| Presence UI | `app/components/chat/ModeSwitcher.tsx` | Stage 2.4 完了、impl freeze (PR #154) |
| Presence mount | `app/components/chat/UpperLayerMount.tsx` | 本番上部レイヤー entry point、touch ゼロ原則 |
| Presence wiring | `app/components/chat/PresenceSignalWiring.tsx` | publisher、observer は publish 側に影響なし |
| Mode reducer | `lib/coalter/presence/modeReducer.ts` | 状態機械、意味不変 |
| Mode context | `lib/coalter/presence/modeContextManager.ts` | 文脈継承 logic 不変 |
| Signal bus | `lib/coalter/presence/productionSignalBus.ts` | observer は read-only subscribe のみ |
| Presence state | `lib/coalter/presence/reducer.ts` | S0-S8 state machine 不変 |
| Signal adapter | `lib/coalter/presence/signalAdapter.ts` | publisher 側、observer は無関係 |
| Shared state | `lib/coalter/presence/sharedState.ts` | server 正本、observer は read-only 参照のみ (A-2c で検討) |
| その他 presence layer 30+ files | - | 全 file touch 禁止 |
| その他 chat layer 17 files | - | UI / hooks / states / 全 file touch 禁止 |

### 2.2 OK な変更範囲

- `lib/coalter/observer/` 配下: A-2b 新規 file (subscriber + redaction + gate)
- `lib/coalter/flags.ts`: 新 getter 1 件追加 (既存 flag は 1 bit も触らない、append only)
- `lib/coalter/observer/relationshipStateRedaction.ts` (A-1/A-1b 既存): `PII_FORBIDDEN_FIELD_NAMES` に `lastMessageId` 系を追加
- `tests/unit/coalter/observer/`: 新規 test files

---

## 3. 実装予定 scope（CEO 指示 3）

### 3.1 新規ファイル（5 件）

| File | 用途 | 行数想定 |
|---|---|---|
| `lib/coalter/observer/observerSubscriber.ts` | bus subscribe + state container 更新 logic (subscribe 呼出は export 関数として準備、wiring は A-2c) | ~150 |
| `lib/coalter/observer/observerSubscriberGate.ts` | env flag gate parser | ~80 |
| `lib/coalter/observer/signalRedaction.ts` | PresenceSignal → redacted snapshot (lastMessageId hash 化) | ~120 |
| `tests/unit/coalter/observer/observerSubscriber.test.ts` | unit tests (subscribe call + state update logic) | ~250 |
| `tests/unit/coalter/observer/signalRedaction.test.ts` | redaction tests (hash 化、PII firewall) | ~200 |

### 3.2 修正ファイル（2 件、最小修正）

| File | 修正内容 |
|---|---|
| `lib/coalter/flags.ts` | `presenceObserverEnabled` getter 追加 (新規 getter、既存 flag に手を加えない) |
| `lib/coalter/observer/relationshipStateRedaction.ts` | `PII_FORBIDDEN_FIELD_NAMES` に `lastMessageId / last_message_id / messageId / message_id` 追加 |

### 3.3 既存 presence layer file は一切 touch しない

- `productionSignalBus.ts`: read-only subscribe API を呼び出すだけ
- `PresenceSignalWiring.tsx`: 既存 publisher、変更不要
- `usePresenceExecutor.ts`: 既存 subscriber、無関係

---

## 4. Flag 設計（CEO 指示 4、最重要）

### 4.1 既存 flag 体系の調査結果

**`lib/coalter/flags.ts` 構造**:
- `COALTER_FLAGS` シングルトン object with getter methods
- 各 getter は `normalizeBool(process.env.FLAG_NAME, default)` パターン
- **client で読まれる flag は `NEXT_PUBLIC_` prefix 必須**

**Webpack DefinePlugin の制約** (flags.ts:25-30 JSDoc 内記録):
> "webpack の DefinePlugin は `process.env.X` (member access) のみ build 時に値で置換する。`process.env[name]` (computed access) は置換されないため、client side では browser polyfill (process.env={}) に落ちて常に undefined を返す。したがって NEXT_PUBLIC_ flag を client で読むには、各 getter で `process.env.NEXT_PUBLIC_X` を**直接記述**する必要がある。"

→ Observer flag は client で読む必要 → **NEXT_PUBLIC_ prefix 必須**

### 4.2 既存 NEXT_PUBLIC flag 一覧

| Flag | Getter | 役割 |
|---|---|---|
| `NEXT_PUBLIC_COALTER_LEGACY_CARD_AUTO_INSERT` | `legacyCardAutoInsertEnabled` | 旧カード自動挿入 kill switch |
| `NEXT_PUBLIC_COALTER_PRESENCE_EXECUTOR` | `presenceExecutorEnabled` | Stage 4 上部レイヤー本番 mount |

### 4.3 Observer flag 確定（CEO D2 = YES 前提）

| 項目 | 確定値 | 理由 |
|---|---|---|
| **env var name** | `NEXT_PUBLIC_COALTER_PRESENCE_OBSERVER` | 既存 `NEXT_PUBLIC_COALTER_PRESENCE_EXECUTOR` と並列。`PRESENCE_*` で presence layer 関連と明示 |
| **getter name** | `presenceObserverEnabled` | 既存 `presenceExecutorEnabled` と並列、shortest + clearest |
| **default** | `false` | production safety、env から外せば即 OFF |
| **scope** | Preview only (採用時) | Production 触らない (CEO 不可侵境界) |

**getter 実装例（A-2b で実装）**:
```typescript
// lib/coalter/flags.ts に追加 (既存 flag 1 bit も触らない)
get presenceObserverEnabled(): boolean {
  return normalizeBool(
    process.env.NEXT_PUBLIC_COALTER_PRESENCE_OBSERVER,
    false,
  );
},
```

### 4.4 Client-safe 担保

- `NEXT_PUBLIC_` prefix で webpack DefinePlugin が build 時に inline 値置換
- `process.env.NEXT_PUBLIC_COALTER_PRESENCE_OBSERVER` 直接記述 (computed access 不可、既存パターン遵守)
- default false なので env unset / typo / unknown value で全て false (production safe)

### 4.5 A-2b で env は追加しない

CEO 指示:
> "ただし、まだenv追加はしないでください。"

A-2b: getter 追加のみ、env は CEO 操作で別途追加 (Preview のみ、CEO 判断後)。

---

## 5. lastMessageId Redaction（CEO 指示 5）

### 5.1 D5 確定方針

- raw `lastMessageId` を保持しない
- raw `lastMessageId` を external snapshot に出さない
- raw `lastMessageId` を console / log に出さない
- redacted key 形式: **`redactedMessageKey`** (CEO 候補 3 つから採用、A-1b の `redactedRelationshipKey` 命名パターンと一致)
- hash 方式: deterministic test 可能 (sha256 + salt + base64url、A-1b と統一)

### 5.2 Hash 実装方針（A-2b で実装）

A-1b の `computeRedactedRelationshipKey` パターンを踏襲:

```typescript
// lib/coalter/observer/signalRedaction.ts (A-2b 新規)
import { createHash } from "node:crypto";

export type RedactedMessageKey = string;

export function computeRedactedMessageKey(
  messageId: string,
  salt: string,
): RedactedMessageKey {
  if (typeof messageId !== "string" || messageId.length === 0) {
    throw new Error("computeRedactedMessageKey: messageId must be a non-empty string");
  }
  if (typeof salt !== "string" || salt.length === 0) {
    throw new Error("computeRedactedMessageKey: salt must be a non-empty string");
  }
  const hash = createHash("sha256");
  hash.update(salt, "utf8");
  hash.update(":message:", "utf8");
  hash.update(messageId, "utf8");
  return hash.digest("base64url");
}
```

特性:
- deterministic (same input + salt → same output)
- reverse 不可 (sha256 one-way)
- 異なる salt で異なる key (cross-environment correlation 防止)
- `:message:` separator で `redactedRelationshipKey` (`:` separator) と区別

### 5.3 Signal redaction logic

```typescript
// lib/coalter/observer/signalRedaction.ts (A-2b 新規)
export interface RedactedPresenceSignal {
  kind: SignalKind;        // PII でない
  strength: SignalStrength; // PII でない
  detectedAt: number;       // timestamp、PII でない
  redactedMessageKey: RedactedMessageKey | null;  // lastMessageId の hash 化、null = meta なし
  matchedPattern: string | null;  // critical の matchedPattern (enum 値、PII でない)
}

export function redactSignal(
  signal: PresenceSignal,
  salt: string,
): RedactedPresenceSignal {
  const lastMessageId = signal.meta?.lastMessageId;
  const matchedPattern = signal.meta?.matchedPattern;
  return {
    kind: signal.kind,
    strength: signal.strength,
    detectedAt: signal.detectedAt,
    redactedMessageKey:
      typeof lastMessageId === "string" && lastMessageId.length > 0
        ? computeRedactedMessageKey(lastMessageId, salt)
        : null,
    matchedPattern:
      typeof matchedPattern === "string" ? matchedPattern : null,
  };
}
```

### 5.4 PII firewall 拡張

A-1/A-1b の `PII_FORBIDDEN_FIELD_NAMES` に追加:
- `lastMessageId`
- `last_message_id`
- `messageId`
- `message_id`

これは `lib/coalter/observer/relationshipStateRedaction.ts` を修正 (A-2b 範囲)。

### 5.5 学術根拠 (Pseudonymization)

`lastMessageId` の hash 化は GDPR 概念での pseudonymization に該当:
- raw ID は保持されない
- one-way hash で reverse 不可
- salt で cross-env correlation 防止
- 同一 ID は同一 hash → signal chain 相関分析 (Phase B+) に使える

完全 anonymization ではない（理論上 brute-force で逆推測可能だが、salt 不知 + UUID 空間で実用上は infeasible）。

---

## 6. Client-side only 制約（CEO 指示 6）

### 6.1 明記事項

- Observer state は **client process-local** (browser session 内のみ)
- A4 server-side retrieval とは **別軸**
- A4 retrieval で AOO observer state を読む **前提にしない**
- AOO observer の観測確認方法は別途検討 (CEO 個別判断、A-2c 以降)

### 6.2 制約の実態

| 制約 | 影響 |
|---|---|
| Process isolation | 各 browser tab で独立した state (sharing 不可) |
| Reload loss | reload で in-memory state 消失 (persistent storage 不使用) |
| Cross-session correlation | 不可 (sessionStorage / localStorage 不使用、CEO 禁止項目) |
| Multi-user observation | 各 user の browser 内で独立観測 (server 側集約なし) |

### 6.3 観測確認方法（A-2c 以降 CEO 判断項目）

候補:
- (a) Browser DevTools 経由で in-memory state 直接 inspect (debug only)
- (b) 新規 client-side debug endpoint (CEO 個別判断)
- (c) 観測しない (Phase A は state 更新の存在確認のみ、内容確認なし)

---

## 7. A-2b 実装 lane 判定（CEO 指示 7）

### 7.1 A-2b が Auto-merge 可能な条件

- ✅ runtime-unwired library (subscribe 呼出は export 関数として準備のみ、actual subscribe call なし)
- ✅ no call-site wiring (どこからも呼ばれない)
- ✅ no env 変更 (getter 追加のみ、env 追加は CEO 別操作)
- ✅ no UI 変更
- ✅ no presence file 変更
- ✅ no route / API 追加
- ✅ no DB / migration

→ **A-2b は Auto-merge lane**

### 7.2 Stop-before-merge 条件 (A-2b で発生したら停止)

- ❌ actual subscription call-site wiring が必要になった (→ A-2c に分離)
- ❌ ChatClient / UpperLayerMount touch が必要になった
- ❌ client component 追加が必要になった
- ❌ env 実運用が必要になった
- ❌ production flag 操作が必要になった

これらは A-2b では発生しない設計（library only）。発生したら **A-2c に scope 移動**。

### 7.3 A-2c の lane

- **Stop-before-merge**
- 理由: client wiring は runtime 接続 = 既存 client (ChatClient or 新 wrapper) に変更追加 = stable layer touch

---

## 8. A-2b / A-2c 分割（CEO 指示 8）

### 8.1 A-2b: Observer Library

**含む**:
- `observerSubscriber.ts`: subscribe + state update logic (export 関数として preparation)
- `observerSubscriberGate.ts`: env flag gate
- `signalRedaction.ts`: signal → redacted snapshot 変換
- unit tests (3 ファイル)
- `flags.ts` getter 追加
- `relationshipStateRedaction.ts` の `PII_FORBIDDEN_FIELD_NAMES` 拡張

**含まない**:
- 実際の `subscribePresenceSignal(...)` 呼出
- client React hook (`useObserverSubscription` 等)
- UI component 追加
- env 実運用

**Lane**: Auto-merge allowed

**推定工数**: 2-3 日

### 8.2 A-2c: Client Wiring

**含む**:
- `useObserverSubscription` React hook (新規) — subscribe / unsubscribe lifecycle 管理
- subscribe 呼出 entry point (`UpperLayerMount` には touch しない、CEO 判断: `ChatClient` 直接 / 別 wrapper / 別 mount component)
- React strict mode の double-invoke 対応
- HMR (hot reload) 時の subscribe leak 防止
- E2E test (subscribe → publish → state update の full flow)

**含まない**:
- presence layer file touch (絶対遵守)
- env 自動追加 (CEO 操作)

**Lane**: Stop-before-merge

**推定工数**: 1-2 日

### 8.3 A-2 全体スケジュール

| 段階 | 内容 | Lane | 推定工数 |
|---|---|---|---|
| A-2a (完了) | read-only audit | docs Auto-merge | - |
| A-2b (本 PR の対象) | library + flag + redaction | Auto-merge | 2-3 日 |
| A-2c | client wiring | Stop-before-merge | 1-2 日 |
| A-2d (canary) | Preview env で observation 検証 | env + docs | 1 週 |

---

## 9. Fallback（CEO 指示 9）

A-2b/A-2c 実装段階で B が危険と判明した場合の fallback:

### 9.1 E: 新規 observer endpoint

- 新規 `/api/coalter/observer/tick` endpoint
- client から定期 / event-driven 呼出
- 既存 file touch 0

### 9.2 A: message route hook

- `POST /api/talk/threads/[threadId]/messages` の POST handler 内に hook
- coverage 最高
- ただし stable route touch リスク

### 9.3 Fallback 発動条件

- bus subscribe が production で動作不良 (observer state が更新されない / stale)
- listener throw が presence layer に影響 (try/catch isolation が壊れている)
- `lastMessageId` 以外の PII 漏洩が判明
- mode 取得が不可 (sharedState read 経路が壊れる)

これらが発生したら A-2c 着手前に CEO 判断、fallback への切替を検討。

---

## 10. 次判断項目（CEO 指示 10）

A-2b preflight 完了後、CEO に提示する判断項目:

| # | 項目 | A-2b preflight での確定 |
|---|---|---|
| **E1** | exact files | 新規 5 + 修正 2 (§3) |
| **E2** | exact flag name | env: `NEXT_PUBLIC_COALTER_PRESENCE_OBSERVER` / getter: `presenceObserverEnabled` (§4.3) |
| **E3** | Auto-merge か Stop-before-merge か | A-2b: Auto-merge / A-2c: Stop-before-merge (§7) |
| **E4** | A-2b で実装してよい範囲 | library + flag getter + redaction extension (§8.1) |
| **E5** | A-2c に回すべき範囲 | client wiring + actual subscribe call (§8.2) |

---

## 11. 自立補強（CEO 指示外、追加深掘り）

### 11.1 Observer lifecycle 設計（A-2c で詳細化）

React hook lifecycle:
- subscribe timing: `useEffect` mount で `subscribePresenceSignal(handler)` 呼出
- unsubscribe timing: `useEffect` cleanup で unsubscribe 関数を呼ぶ
- React 18 strict mode: double-invoke 対応 (mount → cleanup → mount)
- HMR (hot reload): subscribe leak 防止のため module-level ref で重複 subscribe を防ぐ
- error boundary: subscribe handler throw を二重 try/catch で握りつぶす

### 11.2 Subscriber resilience metrics（A-2b で counter のみ追加候補）

Observer subscriber が throw した回数を内部 counter に記録:
- `relationshipState` の reasonCode に `observer_handler_threw` 追加候補
- Phase B+ で resilience 観察に使う

### 11.3 Hash 衝突分析（Phase B+ 検討）

`redactedMessageKey` は sha256 / 256bit → collision probability infeasibly low for UUID inputs。
ただし truncation を Phase B+ で導入する場合は collision risk re-evaluation 必須。

### 11.4 Signal chain reconstruction（人間超越アイデア）

同一 `redactedMessageKey` を持つ複数 signal を観測すると、message 単位の signal chain (critical → implicit chain 等) が再構築可能。Phase B+ で「同 message に対する複数 signal の挙動分析」に活用候補。

### 11.5 Time-windowed signal density（人間超越アイデア）

`detectedAt` timestamp ベースで単位時間あたりの signal 数を集計 → 会話の "热气" を観測。Phase B+ で会話 phase 推論の精度向上に活用候補。

### 11.6 Mode transition correlation（人間超越アイデア）

`kind === "mode_promotion"` signal の前後の signal pattern から、ユーザーの mode 切替動機を推測。Phase B+ で観測。

### 11.7 Defensive design check list (A-2b 実装時の self-audit)

- [ ] subscribe handler 内で **必ず try/catch**
- [ ] state update 失敗時の fail-open (presence layer に影響しない)
- [ ] listener throw を console に出さない (logging は flag gated)
- [ ] subscribe を **module-level ではなく export 関数** で提供 (A-2b では実呼出なし)
- [ ] signal を mutate しない (immutable contract)
- [ ] redaction は subscribe handler の最初に実行 (raw value を内部に保持しない)

---

## 12. 不変境界（A-2b 着手前 / 着手中、厳守）

### 12.1 触らない

- ✗ `productionSignalBus.ts` 変更しない (read-only subscribe のみ)
- ✗ presence layer 30+ files 変更しない
- ✗ `app/components/chat/` 17 files 変更しない (`UpperLayerMount.tsx` 含む)
- ✗ A-2b では実 subscribe call をしない (A-2c で wiring)
- ✗ env 追加禁止 (A-2b は getter 追加のみ、env 追加は CEO 操作)
- ✗ route / API / UI / DB / migration 一切触れない
- ✗ telemetry / Sentry 追加禁止
- ✗ console emit 追加禁止 (Phase B+ で flag gated 検討)
- ✗ Phase B / Mirror channel 設計禁止
- ✗ Step E-1 / bug1 cleanup / Stargazer pivot 一切触れない

### 12.2 Stop-before-merge 発動条件 (A-2b で発生したら停止)

§7.2 と同一。発生したら A-2c に scope 移動 + CEO 判断仰ぐ。

---

## 13. 参照

- `lib/coalter/presence/productionSignalBus.ts` (78 行) — read-only audit 対象
- `lib/coalter/presence/types.ts` PresenceSignal / PresenceMode / ExecutorAvailability
- `lib/coalter/flags.ts` (332 行) — flag pattern 参照、A-2b で getter 1 件追加
- `app/components/chat/PresenceSignalWiring.tsx` — 既存 publisher (read-only audit)
- `app/components/chat/hooks/usePresenceExecutor.ts` — 既存 subscriber 1 件 (read-only audit)
- `lib/coalter/observer/relationshipState.ts` / `relationshipStateTypes.ts` / `relationshipStateRedaction.ts` (A-1/A-1b deliverable)
- `docs/coalter-aoo-presence-reconciliation.md` (PR #154) 不可侵境界正本
- `docs/coalter-aoo-a2-presence-signal-bus-audit.md` (PR #156) A-2a audit 結果

---

## 14. 変更履歴

| 日付 | 変更 | 承認 |
|---|---|---|
| 2026-05-16 | A-2b implementation preflight plan 初版 | CEO/GPT 判断 "B 採用、A-2b preflight を 1 枚挟む"（2026-05-16） |
