# CoAlter Always-On Observer — Phase A-0 Mode State Audit

> ## 🔴 訂正通知（2026-05-16）
>
> **本 audit §0.1 / §1.1 / §1.2 等の「mode tabs UI が main に存在しない」結論は誤りです。**
>
> 別セッション report による独立検証 + 私自身の再検証により、以下が確認されました:
> - `app/components/chat/ModeSwitcher.tsx` 実在（blob `9834cf0f`、main HEAD `ea230df9` 時点で確認）
> - 内部 LABELS: `{ normal: "通常", daily: "Daily", travel: "Travel" }`
> - `lib/coalter/presence/types.ts:56` に `PresenceMode = "normal" | "daily" | "travel"` 実在
> - presence layer 全体（30+ files）が production deployed
>
> 見落とし原因（後述 §1.3）:
> - 検索 directory が `components/coalter/` のみで `app/components/chat/` と `lib/coalter/presence/` を見落とした
> - 「tab」keyword で grep したが実装は `role="radiogroup"`
>
> 訂正正本: `docs/coalter-aoo-presence-reconciliation.md` (PR #154)
>
> 本 audit を意思決定の根拠として使わないでください。reconciliation doc が**正本**です。
>
> ---

**ステータス**: A-0 完了（docs-only PR）→ **重大訂正済（2026-05-16）**
**作成日**: 2026-05-16
**前提**: 設計書 `docs/coalter-always-on-observer-design.md` (PR #151, 2026-05-16 merge)
**目的**: Phase A 実装着手前のコード現状調査。「mode」概念の実体把握と、observer hook 位置の意思決定材料整備。
**結論先出し**: **重要発見 1 件 + CEO 判断項目 5 件**。**A-1 着手前に CEO 確認が必須**。

---

## 0. Executive Summary

### 0.1 最重要発見

> 🔴 **本項の結論は誤り**。`app/components/chat/ModeSwitcher.tsx` が main に実在。詳細は冒頭訂正通知参照。

**「通常 / Daily / Travel」mode tabs UI は、現状の main 上に存在しません**（main HEAD = `a86558a4` 時点）。

CEO 提示の screenshot で示された CoAlter mode tabs（通常 | Daily | Travel）は、以下のいずれかと推定:
1. CEO の design vision（未実装）
2. 別 branch / 未 merge 状態の UI
3. 過去のプロトタイプ
4. 別機能（Rendezvous の Avatar widget 等）と混同

この事実は Phase A の着手方針を根本的に左右します。**mode UI が無い状態で「mode ON 中の observer」を設計すると、Phase A の前提が崩れる**ため、CEO 確認が必須です。

### 0.2 既存「CoAlter mode」型は LLM router 内部用

`lib/coalter/types.ts:87` の `CoAlterMode` は `decision / negotiate / clarify / reflect`。これは LLM router の**内部 mode**であり、CEO Vision の UX mode（Normal / Daily / Travel）とは**完全に別概念**。

新しい UX mode 型を導入する場合、別名で定義する必要がある（例: `CoAlterUxMode` / `CoAlterActivationMode`）。

### 0.3 message 送信 route は CoAlter を完全に知らない

`/api/talk/threads/[threadId]/messages` POST は CoAlter 関連 import / call を一切持たない。Always-On Observer の hook 候補としては、現状最も**触れていない route**でもある。

### 0.4 CEO 判断項目（A-1 着手前必須）

| # | 質問 | 必要性 |
|---|---|---|
| Q1 | UX mode tabs (Normal/Daily/Travel) は新規実装か / 既存 UI を活かすか | A-1 scope を決める |
| Q2 | mode 状態を client only / server known / DB persistent のどれにするか | hook 位置を決める |
| Q3 | Phase A は「mode ON / OFF」だけで進めるか、sub-mode 分離するか | A-1 型設計を決める |
| Q4 | observer hook は message route / coalter invoke route / engine.ts / client side のどれにするか | A-2 scope を決める |
| Q5 | mode 状態が server に届かない場合の対策（mode sync API 新規追加 OK か） | A-1 と A-2 の橋渡しを決める |

これら判断後に A-1 revised plan を確定します。

---

## 1. 調査項目別レポート

### 1.1 [調査 1] Normal / Daily / Travel button UI の実体 file

**結果**: **該当 UI 不在**

調査手法:
- `grep -rn "Normal\|Daily\|Travel" components/coalter` → 0 件（mode tab として）
- `grep -rn "Daily\b\|Travel\b" components --include="*.tsx"` → Travel は `MorningPlanCard.tsx` の `regenerateTravel` 等、別文脈のみ
- `grep -rn "'通常'\|\"通常\""` → `app/(culcept)/calendar/_components/VisualCoordinatePanel.tsx:245` (`title: "通常"`)、`app/(culcept)/sns/profile/_components/StateMirror.tsx:22` (`label: "通常"`) — どちらも CoAlter とは無関係
- `grep -rn "kumi\|データ収集中"` → presenceInterpret.ts のみ（Stargazer 用）

CoAlter components 全件:
```
components/coalter/
  CoAlterButton.tsx                  ← 唯一のボタン UI、mode tab なし
  CoAlterCandidateDetailSheet.tsx
  CoAlterCard.tsx
  CoAlterCardDispatcher.tsx
  CoAlterClarifyCard.tsx
  CoAlterConsent.tsx
  CoAlterNegotiateCard.tsx
  CoAlterPlanCalendar.tsx
  CoAlterPlanDetailSheet.tsx
  CoAlterPlanTimelineDay.tsx
  CoAlterShelfPanel.tsx
```

**結論**: CEO screenshot の Normal/Daily/Travel tabs は現コードベースに**存在しない**。

### 1.2 [調査 2] mode 状態の保存場所

**結果**: **「Normal/Daily/Travel mode」を表現する state は現状存在しない**

現状の CoAlter 関連 state:

| State | 種類 | 保存場所 | 値域 |
|---|---|---|---|
| `CoAlterPairState` | binary on/off | server (`coalter_pair_states` table) + client cache | `inactive / pending_consent / enabled / disabled` |
| `CoAlterSessionState` | session lifecycle | server (`coalter_sessions` table) + client cache | `null / active / completed / cancelled` |
| `CoAlterMode`（既存） | LLM router 内部 mode | session 内に session record として | `decision / negotiate / clarify / reflect` |

新しい UX mode は**どこにも無い**。

**hypothesis**: CEO が想定する mode は、現状の `pairState === "enabled"` を「ON 状態」として、その内部で `mode` という新規 axis を追加するイメージか?

要 CEO 確認。

### 1.3 [調査 3] CoAlter enabled / inactive と新 mode の関係

**結果**: **概念的に直交**

| 軸 | 現状 pair state | 新 mode |
|---|---|---|
| 意味 | ペアが CoAlter を使う意思決定済みか | ON 時の振る舞い種類 |
| 値 | inactive / pending_consent / enabled / disabled | (CEO Vision) off / normal / daily / travel |
| 操作 | ペアの両者承認で enabled へ | mode ON 中にユーザーがタブ切替 |
| 永続性 | DB persistent (ペア合意) | (未確定) — おそらく session-scoped または preference |

**論理組み合わせ**:
- pairState = enabled + new_mode = off → CoAlter 利用可能だが現在は休止
- pairState = enabled + new_mode = normal → Always-On Observer 起動中
- pairState = inactive + new_mode = (any) → 不正状態（pair が enabled でないと mode は意味がない）

要 CEO 確認: 上記の組み合わせ規則が正しいか?

### 1.4 [調査 4] mode は単一値か複数併存可能か

**結果**: **CEO Vision からは単一値推定**

CEO 提示 screenshot は `通常 / Daily / Travel` を **tabs** として表現 → tab UI は通常 1 つ選択（mutually exclusive）。

ただし以下の reasoning も成立:
- 通常モード = baseline、Daily / Travel = 一時的な意図 overlay → 同時併存可能?
- 例: 通常 ON + Travel 一時 ON → travel-specific 質問を加味した normal mode

**現状の設計書 §3.1 Layer 1 では `OFF / Normal / Daily / Travel` の単一値**として記述（exclusive）。

要 CEO 確認: 単一 vs 併存。

### 1.5 [調査 5] mode 切替 history

**結果**: **不在**

現状の `coalter_sessions` table（session log）は session id 単位の記録で、mode 切替 history は持たない。

mode を新規導入する場合の history 設計選択肢:
- option A: history を持たない（最新値のみ）
- option B: state change を log table に記録
- option C: session record に mode field を追加

Phase A 内で history が必要か? — 観測ロジックの観点では「現在の mode」が分かれば十分。history は Phase D 以降（後悔分析等）で必要になる可能性。

要 CEO 判断: history を Phase A から持つか、Phase D 以降に延期するか。

### 1.6 [調査 6] message 送信 route は mode を知れるか

**結果**: **現状不可、ただし変更可能**

`POST /api/talk/threads/[threadId]/messages` (route.ts:95-138) の実装:

```typescript
export async function POST(req, { params }) {
  const { threadId } = await params;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const { body: messageBody, mediaUrl } = await req.json();
  // insert message
  // update last_message_at
  return NextResponse.json({ ok: true, message });
}
```

CoAlter 関連 import / call は**一切無い**。pairState / mode を知りたければ追加 DB query が必要。

mode state を server で持つ場合:
- pairStateId → mode lookup の query 1 回追加 (latency +5-10ms)
- request body に mode を含める案も可（client 信頼前提）

### 1.7 [調査 7] observer hook 候補比較

4 候補を比較:

#### A. message 送信 route 内 hook

```typescript
// app/api/talk/threads/[threadId]/messages/route.ts POST 内
const result = await insert(...);
void runObserverTick({...}).catch(() => {});  // ← 追加
return NextResponse.json({ ok: true, message });
```

| 軸 | 評価 |
|---|---|
| Coverage | ★★★ 全 message を捕捉 |
| Latency | ★★ fire-and-forget 設計なら主経路 +1ms 程度 |
| Risk | ★★ stable route を touch する点が懸念 |
| 既存 pattern との一致 | ★★ engine.ts の `runMovieShadowUnderstanding` と同じパターン |
| 実装難易度 | ★★ moderate (mode lookup 追加が必要) |

#### B. CoAlter invoke route 内 hook

```typescript
// app/api/coalter/invoke/route.ts 内
const result = await runCoAlterPipeline(...);
void runObserverTick(...).catch(() => {});  // ← 追加
return NextResponse.json({ ok: true, data: result });
```

| 軸 | 評価 |
|---|---|
| Coverage | ★ explicit invoke 時のみ。Always-On の本旨から外れる |
| Latency | ★★★ そもそも CoAlter pipeline が走っているので追加 cost 小 |
| Risk | ★★★ 既存の `runMovieShadowUnderstanding` パターンと完全一致、low risk |
| 既存 pattern との一致 | ★★★ |
| 実装難易度 | ★★★ easy |

**Always-On Vision に不適合**。explicit invoke 時にのみ走るので observer の本旨を満たさない。

#### C. engine.ts 内追加 hook

`runMovieShadowUnderstanding` のような fire-and-forget hook を engine 内の早期段階で追加。

| 軸 | 評価 |
|---|---|
| Coverage | ★ engine が呼ばれた時のみ |
| Latency | ★★★ |
| Risk | ★★ engine 内変更は影響範囲が広い |
| 既存 pattern との一致 | ★★★ |
| 実装難易度 | ★★ |

**Always-On Vision に不適合**（B と同じ理由）。

#### D. Client-side observer

```typescript
// hooks/useCoAlter.ts or ChatClient.tsx
// 各 message 送信後に observer endpoint を呼ぶ
useEffect(() => {
  if (mode !== "off" && newMessageArrived) {
    fetch("/api/coalter/observer/tick", { ... });
  }
}, [newMessageArrived, mode]);
```

| 軸 | 評価 |
|---|---|
| Coverage | ★★ client がオンラインの時のみ |
| Latency | ★★ 追加 HTTP roundtrip |
| Risk | ★★★ message route を一切 touch しない |
| 既存 pattern との一致 | ★★ Phase 1.5.3 awaiting-answer 連鎖と類似 |
| 実装難易度 | ★★ 新規 API endpoint 必要 |

#### 比較サマリ

| 候補 | Coverage | Latency | Risk | 適合度 | 推奨 |
|---|---|---|---|---|---|
| A. message route | ★★★ | ★★ | ★★ | ★★★ | **第一候補** |
| B. invoke route | ★ | ★★★ | ★★★ | ★ | 不適合 |
| C. engine.ts | ★ | ★★★ | ★★ | ★ | 不適合 |
| D. client side | ★★ | ★★ | ★★★ | ★★ | **第二候補**（mode が client only の場合の現実解） |

### 1.8 [調査 8] それぞれの hook 候補の risk

#### A. message route の risk

- **stable route の挙動変更**: message 送信は全 talk 機能の基礎。fire-and-forget 設計 + try/catch 二重防御で安全側に倒す必要あり
- **DB query 追加**: pairState + mode lookup で latency 5-10ms。message route の現在 latency が p95 < 100ms なら許容範囲
- **mode が client only の場合に対応困難**: server 側に mode が無いと判定できない

緩和:
- env flag (`COALTER_OBSERVER_LOOP_ENABLED`) で完全 OFF 可能
- `try { void runObserverTick().catch(() => {}); } catch {}` 二重 try
- mode lookup 失敗時は observer skip（fail-open）

#### D. client side の risk

- **client offline 時の coverage 落ち**: 観測機会の取りこぼし
- **client side の悪意ある操作**: token 不要なら誰でも observer を回せる → cost 攻撃可能
- **新規 endpoint 必要**: route 増加によるテストカバレッジ拡張

緩和:
- offline 時の retry queue
- endpoint に内部 token 必須化（既存 cookie session 流用可）
- 既存 endpoint 流用案: `/api/coalter/invoke` に `mode: "observe"` parameter 追加（route 数を増やさない）

### 1.9 [調査 9] Always-On Phase A で使うべき hook の推奨

**推奨**: **A (message route)**、ただし**条件付き**

条件:
- Q1-Q5 CEO 判断で mode 状態が server に届く設計が確定すること
- 設計書 §4 Phase A の「観測カバー率 ≥ 95%」を満たすため、最高 coverage 候補を選ぶ
- existing pattern (`runMovieShadowUnderstanding`) との一致で実装リスク最小化

**条件未達時の代替**: D (client side)
- 新規 endpoint `/api/coalter/observer/tick` 追加
- 既存 useCoAlter hook 内に observer trigger 追加
- mode が client side のままで進められる

**B, C は不採用**: Always-On Vision の coverage 要件を満たさない

### 1.10 [調査 10] A-1 Relationship State Module に必要な最小型

CEO 補正 (raw pairStateId を external に出さない) を反映した最小型:

```typescript
// lib/coalter/observer/relationshipStateTypes.ts
// ─────────────────────────────────────────────
// CRITICAL: raw userId / pairId / threadId / email / URL / message text を保持・出力しない
// pairStateId は internal key only。external snapshot に出さない。
// 外部出力時は redactedRelationshipKey / opaqueStateKey / stateKeyHash 形式に変換
// ─────────────────────────────────────────────

/** Internal key — 永続化候補。external payload に出さない */
type InternalPairStateKey = string; // = pairStateId (内部利用のみ)

/** External key — diagnostics / retrieval / UI 向け不可逆 hash */
type RedactedRelationshipKey = string; // sha256(pairStateId + salt) を base64url

/** UX mode (CEO Vision) — 既存 CoAlterMode (LLM router 用) とは別物 */
export type CoAlterUxMode =
  | "off"
  | "normal"
  | "daily"
  | "travel";

/** 会話 phase (Speak Decision Engine 用、Phase A 時点では推論のみ) */
export type ConversationPhase =
  | "unknown"
  | "opening"
  | "exploring"
  | "converging"
  | "closing";

/** Relationship State の内部 snapshot (in-process 利用) */
export interface InternalRelationshipState {
  schemaVersion: 1;
  /** internal key — external に出さない */
  internalKey: InternalPairStateKey;
  /** 観測カウント */
  observationCount: number;
  /** 最終観測時刻 (ISO) */
  lastObservationAt: string | null;
  /** 現在 mode */
  modeContext: CoAlterUxMode;
  /** 推論された会話 phase */
  conversationPhase: ConversationPhase;
  /** 両者の一致度 (-1〜+1)、未確定時 null */
  alignmentSignal: number | null;
  /** 不確実性 (0〜1) */
  uncertaintyLevel: number;
  /** rupture フラグ */
  ruptureFlag: boolean;
  /** silence budget (0〜1) */
  silenceBudget: number;
}

/** External snapshot (A4 retrieval / diagnostics 向け、PII 除去後) */
export interface RedactedRelationshipStateSnapshot {
  schemaVersion: 1;
  /** redacted key — raw pairStateId は含まない */
  redactedRelationshipKey: RedactedRelationshipKey;
  observationCount: number;
  lastObservationAt: string | null;
  /** mode は bucket 化なしで出してよい (PII でない) */
  modeContext: CoAlterUxMode;
  conversationPhase: ConversationPhase;
  alignmentBucket: "negative" | "neutral" | "positive" | "unknown";
  uncertaintyBucket: "low_0_to_30" | "mid_30_to_70" | "high_70_to_100";
  ruptureFlag: boolean;
  silenceBudgetBucket: "low_0_to_30" | "mid_30_to_70" | "high_70_to_100";
}

/** State 操作 API */
export interface RelationshipStateContainer {
  /** 内部 key で取得 */
  getInternal(key: InternalPairStateKey): InternalRelationshipState | null;
  /** 内部 key で更新 */
  updateInternal(key: InternalPairStateKey, patch: Partial<InternalRelationshipState>): void;
  /** redacted snapshot を返す (A4 retrieval 想定) */
  getRedacted(key: InternalPairStateKey): RedactedRelationshipStateSnapshot | null;
  /** 全クリア (tests only) */
  clearAll(): void;
}
```

設計補強:
- `InternalRelationshipState` は in-process のみ（external 不可）
- `RedactedRelationshipStateSnapshot` は A4 retrieval 経由で出してよい（A2 buffer 規約と一致）
- bucket 化は既存 A2 buffer の bucket helper 流用可能

---

## 2. 結論セクション（CEO 指示 5 項目）

### 2.1 Phase A-2 でhook すべき場所の候補比較

| 順位 | 候補 | 採用条件 |
|---|---|---|
| 1 | A. message route | mode state が server に届く設計が確定すること |
| 2 | D. client side + 新規 endpoint | mode が client only のまま進める場合 |
| - | B. invoke route | 採用不可（Always-On Vision 不適合） |
| - | C. engine.ts | 採用不可（Always-On Vision 不適合） |

### 2.2 まだ hook 位置を確定できない場合の不足情報

| # | 不足情報 | 必要な意思決定 |
|---|---|---|
| 1 | UX mode tabs UI 実装方針 | 新規実装 / 既存 UI 改修 |
| 2 | mode state 保存層 | client / server / DB |
| 3 | mode state 永続性 | session-scoped / per-pair preference / per-user |
| 4 | mode と pairState の組み合わせ規則 | 上記 §1.3 の組み合わせ表 |
| 5 | mode 切替 history 要否 | Phase A 必要 / Phase D 以降 |

### 2.3 mode state が server に届かない場合の対策

#### 対策案 1: mode sync 軽量 API 新規追加（推奨）

新規 endpoint:
- `PUT /api/coalter/mode` (body: `{ pairStateId, mode: "off" | "normal" | "daily" | "travel" }`)
- 内部で `coalter_pair_states` table の新規 column `current_mode` を更新
- client は mode 切替時にこの endpoint を呼ぶ
- server は次以降の observer/invoke 時に最新 mode を参照可能

工数: 0.5 日。schema migration 必要（CEO 承認）。

#### 対策案 2: request body に mode を含める（client 信頼前提）

- message route の request body に `coalterMode` field を追加
- server は信頼して使う
- migration 不要

工数: 0.2 日。ただし client 信頼前提なので**観測整合性低下リスク**。

#### 対策案 3: D (client side hook) で進める

- mode state を client に閉じたまま observer も client から trigger
- 新規 endpoint `/api/coalter/observer/tick` を作成

工数: 1 日。endpoint 増加。

### 2.4 Phase A-1 の修正版 scope

**CEO 補正反映後の Phase A-1**:

```
Phase A-1 — Self-contained In-Memory Relationship State Container

目的: 関係状態を保持する self-contained in-memory state container を作成。
      runtime-unwired / no external side effects / not production source of truth /
      process-local / ephemeral

範囲:
新規ファイル:
- lib/coalter/observer/relationshipState.ts         (state container 本体)
- lib/coalter/observer/relationshipStateTypes.ts    (型定義)
- lib/coalter/observer/relationshipStateRedaction.ts (redaction helper)
- tests/unit/coalter/observer/relationshipState.test.ts
- tests/unit/coalter/observer/relationshipStateRedaction.test.ts

修正ファイル: なし

特性:
- module-level Map<InternalPairStateKey, InternalRelationshipState>
- A2 buffer と同じ self-contained in-memory 構造
- pure ではない (stateful)、runtime-unwired (どこからも呼ばれない)
- external 出力は必ず redacted snapshot 経由
- raw pairStateId は internal key only

型コメントに明記:
- raw userId / pairId / threadId / email / URL / message text を保持・出力しない
- pairStateId は internal key only、external snapshot に出さない

Lane:
- Auto-merge lane (self-contained, runtime-unwired, no route touch)

Verify:
- tsc 0 エラー
- vitest 全 PASS (unit only)
- eslint 0 警告
- diff stat: 5 新規 file のみ、既存 file 変更 0
- raw token 値 / env 変更 / API 変更 0

完了基準:
- state container 単体で機能
- redaction helper 完全カバー (PII 不在テスト網羅)
- unit test 30+ ケース
- 型エラー 0

推定工数: 1.5 日 (補正前 1 日 + redaction helper 0.5 日)
```

### 2.5 Phase A-2 に進む前の CEO 判断項目

| # | 判断項目 | 選択肢 | 判断時期 |
|---|---|---|---|
| Q1 | UX mode tabs UI を新規実装するか | (a) 新規実装する / (b) 既存 UI 改修 / (c) Phase A は mode 概念無視（pairState=enabled のみで動かす） | A-0 merge 前 |
| Q2 | mode state 保存層 | (a) client only / (b) server query 経由で取得 / (c) DB persistent column 追加 | A-0 merge 後、A-1 着手前 |
| Q3 | Phase A は sub-mode 分離するか | (a) ON/OFF のみ / (b) 4 mode 全分離 | A-1 着手前 |
| Q4 | observer hook 位置 | (a) A. message route / (b) D. client side + new endpoint / (c) その他 | A-1 完了後、A-2 着手前 |
| Q5 | mode sync API 新規追加可否 | (a) 対策案 1 採用 / (b) 対策案 2 採用 / (c) 対策案 3 採用 | A-1 完了後、A-2 着手前 |

---

## 3. 自立補強 (CEO 指示外)

### 3.1 観測コスト基準の補正

CEO 補正「Phase A default: 0 LLM calls / message」を audit 観点で再評価:

`runUnderstanding` (lib/coalter/understanding/index.ts:73) は rule-based 中心。LLM 呼び出しは shadow gate (`COALTER_UNDERSTANDING_DIAGNOSTICS` ON 時のみ) の比較用途。

**結論**: Phase A は既存 `runUnderstanding` を rule-based mode で使えば LLM call 0/message を達成可能。LLM が必要になった瞬間は設計再検討シグナル。

### 3.2 latency 基準の分離

CEO 補正反映:

| metric | 定義 | Phase A 完了基準 |
|---|---|---|
| `observer_main_scheduling_overhead_ms` | `void runObserverTick(...).catch(() => {})` の同期実行時間（Promise 生成 + return まで） | ≤ 5ms (中央値) |
| `observer_internal_processing_ms` | observer 内部の総処理時間 (fire-and-forget なので主経路は待たない) | ≤ 500ms (中央値) — internal だけは余裕を持たせる |

設計書 §4 Phase A の「観測遅延中央値 ≤ 50ms」は誤りだったので、設計書 update 候補（A-1 着手前に修正 PR か、A-1 PR 内で同時更新）。

### 3.3 文献基盤の Phase A への接続

| 文献 | 接続 |
|---|---|
| Turn-Taking (Sacks 1974) | 会話分析の基本。観測単位は「turn」、message 単位ではなく adjacency pair 単位の方が望ましい可能性。Phase A では message 単位で開始、Phase B 以降で turn 単位に refine 候補 |
| Active Inference (Friston 2010) | 行動 = 不確実性削減 + 期待効用最大化。Phase A は「observe して uncertainty を蓄積する」段階に対応 |
| Ambient Awareness (Erickson, Kellogg 2000) | listening の peripheral 性。Phase A は UI 表示なしで peripheral computing |
| Negative Capability (Bion 1970) | 不確実性を保持する能力。Phase A 段階でも「観測しただけで何もしない」を能動的選択肢として正当化 |

### 3.4 Phase A サブフェーズの再評価

A-0 audit を経て、サブフェーズ順序の見直し:

| サブフェーズ | 状態 | 修正 |
|---|---|---|
| A-0 | **完了** | (本ドキュメント) |
| A-1 | scope 確定済み | redaction helper 追加で 1.5 日に拡大 |
| A-2 | hook 位置未確定 | CEO Q1-Q5 判断後に着手 |
| A-3 | metrics 設計 | latency metric を 2 分割（main scheduling / internal processing） |
| A-4 | canary 受入評価 | 評価指標を A-3 と整合 |

### 3.5 人間超越アイデア (Phase A-0 で気付いた追加分)

#### Idea: Mode 不在の対応設計

**問題**: CEO Vision の mode UI が現状不在。これを発見せず A-1 着手していたら、Phase A 完了時に「mode が無いのに observer が動く」不整合に陥っていた。

**転換**: この audit step 自体が「設計と現実の乖離を早期発見する」観測装置として機能した。今後の重要設計には**必ず A-0 audit 相当のステップを入れる**べき。

#### Idea: 既存資産との接続点強化

Phase A は新規モジュールを最小限に抑え、**既存 A2 buffer / A4 retrieval / runUnderstanding を最大限活用**することが low-risk path。新規実装は state container のみで、observer trigger は既存パターン (`runMovieShadowUnderstanding`) を踏襲する。

#### Idea: redaction firewall の構造化

A2 buffer の `PII_FORBIDDEN_FIELD_NAMES` audit list と同様、Relationship State にも独立した forbidden field list を導入し、type-level firewall（type を import しない構造的保証）を構築すべき。Phase A-1 で確立。

---

## 4. 進行管理

### 4.1 A-0 完了基準

- [x] 10 調査項目の回答記録
- [x] 5 結論項目の出力
- [x] CEO 判断 Q1-Q5 の特定
- [x] A-1 修正版 scope の確定
- [x] docs-only PR (本ドキュメント) として提出

### 4.2 次の動き

1. **本 PR (docs-only Auto-merge lane) を merge**
2. **CEO 判断 Q1-Q5 を受領**
3. **A-1 着手判断**:
   - Q3 (sub-mode 分離) と Q1 (UX mode UI) によって A-1 の `CoAlterUxMode` 型設計が変わる
   - Q3 = ON/OFF のみなら型を `boolean` で開始可能
   - Q1 = "Phase A は mode 概念無視" なら A-1 を `pairState=enabled` だけで進められる
4. A-1 着手後、別 PR (Auto-merge lane) で実装

### 4.3 やらないこと（厳守）

- 本 PR で runtime / observer / route / API / UI / env / DB を一切変更しない
- A-1 / A-2 / A-3 / A-4 への先行着手禁止
- mode UI の新規実装（CEO 判断前）
- mode state の DB column 追加（CEO 判断前）
- Step E-1 / bug1 cleanup / Stargazer pivot 触れない

---

## 5. 参照

- 設計書: `docs/coalter-always-on-observer-design.md` (PR #151)
- 既存型: `lib/coalter/types.ts` (CoAlterMode は LLM router 内部用)
- 既存 trigger: `lib/coalter/triggerDetection.ts`
- 既存 shadow: `lib/coalter/engine.ts:runMovieShadowUnderstanding`
- A2 buffer: `lib/coalter/understanding/redactedDiagnosticsBuffer.ts`
- A4 retrieval: `app/api/coalter/diagnostics/preview/route.ts`
- message route: `app/api/talk/threads/[threadId]/messages/route.ts`
- CoAlter UI: `components/coalter/CoAlterButton.tsx` (mode tabs 不在を確認)

---

## 6. 変更履歴

| 日付 | 変更 | 承認 |
|---|---|---|
| 2026-05-16 | A-0 audit 初版 | CEO 判断待ち（Q1-Q5） |
