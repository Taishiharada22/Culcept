# Comprehension-First v1.3+ Wave 3 — W3-PR-7 設計書

**対象ブランチ**: `feat/alter-morning-wave3-pr7`
**起草**: 2026-04-22
**状態**: draft（CEO 承認待ち）
**先行 PR**: #14 (W3-PR-6) — 三層判定を導入したが、対話状態を扱えず構造欠陥が残存
**目的**: alter-morning の **質問行程（clarify loop）を構造的に再設計**し、単発応答システムからマルチターン対話システムへ移行する

---

## 1. 背景 — なぜこの PR が必要か

CEO 真機テスト（2026-04-22）で、以下の 4 事象が観測された:

| # | 事象 | 発話例 |
|---|---|---|
| 1 | clarifying なのに質問が空 / items=0 | （複数ターン） |
| 2 | 質問が「仕事はどのあたり？」のように対象 event/時間帯が曖昧 | 朝/昼/夜の複数仕事がある時 |
| 3 | 回答「近場の図書館」が元の質問対象 slot に戻らず、新 event として流れる | ランチ後に図書館質問 |
| 4 | 条件不足（「朝はカフェで軽く作業したい」）でも phase=plan_presented | 時刻も場所も曖昧 |

これらは **4 つの独立した構造欠陥** が連動している:

- **欠陥 B**: slot 欠損判定が binary（null / 非null）— 曖昧充足を素通りさせる
- **欠陥 A**: マルチターン slot bind の不在 — 聞いた slot を次ターンで覚えていない
- **欠陥 C**: 質問文が event/scope を明示しない — ユーザーが「何のこと？」となる
- **欠陥 D**: LLM 障害時に前ターン plan が蒸発 — provider failure が体験を破壊

W3-PR-6（PR #14）の三層判定は欠陥 B の**入口**に届かないため無効化されていた。W3-PR-7 は構造の**根** を差し替える。

---

## 2. 設計原則

以下は W3-PR-6 から継承し、破らない:

1. **唯一の配線点**: `runMorningPipeline` が routing 側から見た契約。route.ts は呼ぶだけ
2. **純関数 / 決定論**: L1.2, L2, legacyAdapter は LLM を呼ばない
3. **plan graph 非破壊**: annotation は plan に一切書き込まない（C-2）
4. **1-turn-1-question**: 複数 ASK があっても UI に戻る質問は常に 1 件
5. **殻は使うが脳は混ぜない**: 旧 morningProtocol に戻さない。v2 pipeline 内で完結させる

W3-PR-7 で追加する原則:

6. **対話状態の第一級市民化**: `PendingClarify` を session に持ち、ターンをまたぐ
7. **3 値 sharpness**: slot の充足度は `fixed / vague / missing` の 3 値（binary 禁止）
8. **plan の継続性**: status=comprehension_failed や clarifying の時も、前ターンの plan を UI から消さない
9. **質問の slot 明示**: clarify 質問は必ず `{event, slot}` を識別できる文で出す

---

## 3. データモデル変更

### 3.1 SlotSharpness（新規）

```ts
/**
 * slot の充足度を 3 値で表す。
 *   fixed:   値が確定し、ASK 不要
 *   vague:   値はあるが曖昧（時刻=timeHint のみ / 場所=generic or chain_brand のみ）
 *            → 三層判定で PROVISIONAL or ASK を決める
 *   missing: 値が null
 *            → 三層判定で PROVISIONAL（anchor 借用）or ASK を決める
 */
export type SlotSharpness = "fixed" | "vague" | "missing";
```

### 3.2 sharpness は derived（schema 非変更）

sharpness は **slot 値から都度計算する pure function** として実装する。Event schema に
フィールドは追加しない。理由:

- **単一真実源**: raw slot 値（startTime / place_ref / activity 等）のみが正本。
  sharpness を field 化すると「更新し忘れ」バグの温床になる
- **保守容易**: 既存テスト fixture を一切書き換えずに済む
- **計算コスト**: slot 3 つの sharpness 判定は O(1) × 3。実行コスト無視可能

実装（`eventSchema.ts` に追加する純関数）:

```ts
export type SlotSharpness = "fixed" | "vague" | "missing";

export function computeWhenSharpness(when: WhenSlot): SlotSharpness;
export function computeWhereSharpness(where: WhereSlot): SlotSharpness;
export function computeWhatSharpness(what: WhatSlot): SlotSharpness;
```

下流コンシューマ（classifier / gapResolver / legacyAdapter / UI）は常にこの関数で
都度計算する。

`missing_semantic_critical: SemanticCriticalSlot[]` は **意味を変えない**（CEO 指示 2026-04-22）:
- missing と vague は別概念。`missing` という名前で vague を含めるのは不可
- `missing_semantic_critical` は **strictly sharpness==="missing"** の slot のみを保持
- vague 含む「未確定 slot」の表現は `SlotSharpness` を唯一の真実源として使う
- gapResolver は `missing_semantic_critical` ではなく **sharpness を直接参照**して三層判定を行う
- 既存コード / テストが `missing_semantic_critical` に依存している箇所は、意味が変わらないので壊れない

### 3.3 Sharpness 計算ルール

`provenanceChecker.ts / checkEvent` 内で計算:

**When**:
```
if (startTime が "HH:mm" にマッチ)         → fixed
else if (timeHint != null)                 → vague
else                                       → missing
```

**Where**:
```
if (place_ref == null)                     → missing
else if (placeType == "exact_proper_noun") → fixed
else if (placeType == "known_base")        → fixed
else if (placeType == "chain_brand"
         || placeType == "generic_place"
         || placeType == null)             → vague
```
（`chain_brand` を vague に倒すのは本 PR の肝。「スタバ」だけでは支店が確定しないため、
三層判定で anchor 借用や候補提示を通す必要がある。CEO 承認 2026-04-22。）

**chain_brand の昇格条件**（CEO 明示 2026-04-22）:
- chain_brand は **原則 vague 固定**
- area anchor 経由で recommendation 候補が生成できても **fixed には昇格させない**
  （grounder の output は三層判定上 PROVISIONAL のまま扱う）
- fixed になるのは以下の 2 経路のみ:
  1. 一意化後（grounded.status=="resolved" && candidates.length===1 で、かつ user 確認済み）
  2. user が支店を明示（例: "渋谷のスタバ"）→ placeType=exact_proper_noun へ昇格

**What**:
```
if (activity == null or activity.trim() == "") → missing
else if (activity ∈ VAGUE_ACTIVITY_SET)        → vague
     // VAGUE_ACTIVITY_SET = {"仕事", "用事", "予定", "作業", "もろもろ"}
     // (activityCanonical が該当する汎用語に寄せられた場合も含む)
else                                           → fixed
```

### 3.4 PendingClarify（新規）

```ts
export interface PendingClarify {
  /** 対象 event（resolveGaps が決めた primary_clarify.event_id） */
  event_id: string;
  /** 書き込み対象 slot */
  slot: "when" | "where" | "what" | "transport" | "endpoint";
  /** 質問種別（答え方の解釈に使う） */
  kind: ClarifyKind;
  /** 質問時の event スコープ情報（再表示・再質問用） */
  scope: {
    timeLabel: string | null;    // "朝" | "12:00" | "夜" | null
    activityLabel: string | null; // "仕事" | "ランチ" | null
    eventOrdinal: number;        // 1始まり：plan 内で何番目の event か
  };
  /** 質問文（次ターンで再表示する場合用） */
  question: string;
  /** 質問したターンの ISO timestamp（staleness 判定用、将来拡張） */
  askedAt: string;
}
```

### 3.5 MorningSession 拡張

```ts
// types.ts
interface MorningSession {
  // ... 既存フィールド
  pendingClarify?: PendingClarify | null;  // ★追加
  /**
   * v2 pipeline が出した最後の events。次ターンの state 起点として使う。
   * LLM 再 comprehension の「文字列連結」方式を廃止するための保持。
   */
  persistedEvents?: Event[];               // ★追加
}
```

永続化は hooks/useAlterChat 側で既存の morningSession シリアライズに乗せる。

---

## 4. パイプラインフロー変更

### 4.1 Turn N（現在のターン）全体像

```
┌─ route.ts ────────────────────────────────────────────────────────────┐
│ rawMorningSession                                                      │
│   ├─ persistedEvents: Event[]?                                         │
│   ├─ pendingClarify: PendingClarify?                                   │
│   └─ plan: MorningPlan?                                                │
│                                                                        │
│ ┌── branch A: pendingClarify != null ───────────────────────────────┐ │
│ │   (answer-bind mode)                                               │ │
│ │   mergedEvents = answerBinder(                                     │ │
│ │     persistedEvents, pendingClarify, newUtterance                  │ │
│ │   )                                                                │ │
│ │   runMorningPipeline({                                             │ │
│ │     utterance: newUtterance,                                       │ │
│ │     priorEvents: mergedEvents,  // skip LLM re-extract             │ │
│ │   })                                                               │ │
│ └────────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│ ┌── branch B: pendingClarify == null ───────────────────────────────┐ │
│ │   (fresh comprehension or modify)                                  │ │
│ │   runMorningPipeline({                                             │ │
│ │     utterance: newUtterance,                                       │ │
│ │     priorEvents: persistedEvents,  // merge delta if any           │ │
│ │   })                                                               │ │
│ └────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

**文字列連結方式（"過去/ 現在"）は廃止**。過去発話は session.persistedEvents で継承する。

### 4.2 answerBinder（新規、純関数）

```ts
// comprehension/answerBinder.ts
export function bindAnswerToSlot(
  events: Event[],
  pending: PendingClarify,
  answer: string,
): Event[]
```

Rule-based で `answer` を該当 slot に書き込む。

**slot 別の解釈ルール**:

| pending.slot | pending.kind | answer 解釈 |
|---|---|---|
| when | specific_time | `parseJapaneseTimeExpression(answer)` で HH:mm を抽出 → startTime |
| when | coarse_time_bucket | "朝"/"昼"/"夜" を検出 → timeHint |
| when | tentative_chain | 同上 |
| where | where_center | answer をそのまま place_ref に（正規化のみ） |
| where | where_pick_from_candidates | 同上 |
| what | activity | answer を activity に |
| transport | transport | "電車"/"徒歩"/"車" etc 抽出 |
| endpoint | endpoint | 時刻 or 時間幅を抽出 |

**曖昧な回答時**:
- rule で解釈できない（例: "そうだね〜" / "うーん"）→ events に書き込まず、同じ pendingClarify を次ターンも継続（再試行）
- 完全に別話題（"おなかすいた"）→ pendingClarify を破棄し、branch B（fresh）扱いに切り替え
  - 判定は簡易 heuristic（対象 slot のキーワードが answer に含まれるか）

### 4.3 L1.1（LLM extract）の priorEvents 受理

```ts
// comprehension/l1Pipeline.ts
export interface L1PipelineInput {
  raw: /* LLM structured output */ | null;  // priorEvents のみ使う時は null 可
  utterance: string;
  priorEvents?: Event[];  // ★追加: answer-bind 後の events をそのまま L1.2 へ流す
}
```

`priorEvents` が渡されて `raw=null` の場合、LLM 再抽出をスキップして checkEvents のみ実行。

### 4.4 L2.1 gapResolver — sharpness 連動

既存の `resolveEventGap` を以下のように拡張:

```
// 既存: missing_semantic_critical を見て分岐
// 新:   sharpness を見て分岐

for each slot in [when, where, what]:
  if slot.sharpness == "fixed":     skip
  if slot.sharpness == "missing":   既存の ASK/三層判定 ロジック
  if slot.sharpness == "vague":     ★新規：三層判定に vague 用分岐を追加
```

**vague 時の三層判定**:

**When (vague = timeHint のみ)**:
- category default が使える（activityCanonical が lunch/dinner 等）→ PROVISIONAL
- tentative chain の基準を探せる → PROVISIONAL
- なければ → ASK specific_time（hint に timeHint を含めて「朝って何時頃？」）

**Where (vague = chain_brand / generic_place / placeType=null)**:
- cross-event anchor あり → PROVISIONAL（anchor 付近で解決）
- ambiguous 候補 ≤5 件 → PROVISIONAL top-pick
- 候補多数 / 辞書 miss → ASK where_center または where_pick_from_candidates
  - chain_brand で dict miss → ASK where_pick_from_candidates（「スタバはどの店舗？」）
  - generic "カフェ" → ASK where_center（「どのあたりのカフェ？」）

**What (vague = "仕事" 等汎用語)**:
- 当面は ASK activity（「仕事って具体的には？」）
  - Wave 4+ で activity category default を引く（リモート/会議/作業）

### 4.5 legacyAdapter 改修

**decidePhase** — シンプル化:

```ts
function decidePhase(result): MorningPhase {
  if (result.status !== "ok") return "clarifying";
  if (result.gapResolution?.primary_clarify) return "clarifying";
  return "plan_presented";
}
```

（narration 空チェック削除。narration が空なら fallback narration を使う — §5）

**items=0 禁則 + provisional plan**（CEO 確定 2026-04-22）:

clarifying / comprehension_failed 時も UI にプランを表示し続けるが、
**「確定 plan」ではなく「provisional（仮の流れ）」として扱う**。

```ts
// MorningPlan に status を追加
interface MorningPlan {
  date: string;
  items: PlanItem[];
  status: "confirmed" | "provisional" | "needs_answer";  // ★追加
  // ...
}

// legacyAdapter での決定
const plan: MorningPlan = {
  date: today,
  items: buildPlanFromEvents(events),
  status:
    phase === "plan_presented" ? "confirmed" :
    pendingClarify ? "needs_answer" :
    "provisional",
  // ...
};
```

- `confirmed`: 全 slot fixed、ASK なし
- `needs_answer`: pendingClarify があり、ユーザー回答待ち
- `provisional`: ASK は無いが sharpness=vague が残存 / comprehension_failed 等

UI 側は status に応じて表示スタイルを変える（点線・薄色など）。実際の UI 反映は別 PR だが、
本 PR では session / response 形に status を載せて後続が使える状態を作る。

**message 決定**:

```ts
// phase==="clarifying" の場合
const question = result.gapResolution?.primary_clarify?.question?.trim();
if (!question) {
  // 契約違反 — primary_clarify があるのに question が空
  // → 防御的に generic fallback
  console.error("[legacyAdapter] clarify without question", ...);
  message = "もう少し詳しく教えてくれる？";
} else {
  message = question;
}
```

**pendingClarify 生成**:

```ts
if (phase === "clarifying" && result.gapResolution?.primary_clarify) {
  const pc = result.gapResolution.primary_clarify;
  session.pendingClarify = {
    event_id: pc.event_id,
    slot: pc.target_slot,
    kind: pc.kind,
    scope: buildScopeFromEvent(events, pc.event_id),
    question: pc.question,
    askedAt: new Date().toISOString(),
  };
} else {
  session.pendingClarify = null;  // clear
}
session.persistedEvents = events;
```

### 4.6 L3 narration のフォールバック

status=ok でも narration 側が LLM 失敗で空を返すことがある。現状 decidePhase で clarifying に倒していたが、これは UX 破壊。

新方針:
- narration が空 → deterministic fallback narration を使う（イベントをテンプレ連結）
- fallback narration も legacyAdapter 内で生成
- 「明示的に narration が空なら clarifying」という挙動を廃止

---

## 5. ClarifyQuestionBuilder 仕様

### 5.1 入力拡張

```ts
export function buildClarifyQuestion(req: {
  kind: ClarifyKind;
  scope?: {
    timeLabel?: string | null;
    activityLabel?: string | null;
    eventOrdinal?: number;
  };
}): string
```

### 5.2 テンプレート（主要例）

| kind | scope | 出力例 |
|---|---|---|
| where_center | {timeLabel:"朝", activityLabel:"仕事"} | `朝の仕事はどのあたり？` |
| where_center | {timeLabel:null, activityLabel:"ランチ"} | `ランチはどこでする？` |
| where_center | {timeLabel:"19:00", activityLabel:"ディナー"} | `19時のディナーはどのあたり？` |
| specific_time | {timeLabel:"朝", activityLabel:"仕事"} | `朝の仕事は何時頃？` |
| specific_time | {timeLabel:null, activityLabel:"ランチ"} | `ランチは何時頃？` |
| where_pick_from_candidates | {timeLabel:"昼", activityLabel:"ランチ", candidates:[...]} | `昼のランチのスタバ、どの店舗？` |
| activity | {timeLabel:"朝", activityLabel:"仕事"} | `朝の仕事は具体的には？` |
| coarse_time_bucket | {activityLabel:"ランチ"} | `ランチは朝・昼・夜のどれ頃？` |

**生成原則**（CEO 確定 2026-04-22）:
- **event scope prefix を必ず付ける**（時間帯に限らず、どの event を指すか明示）
- prefix 選択の優先順位:
  1. `timeLabel` あり → 「朝の仕事はどのあたり？」
  2. `timeLabel` なし + `activityLabel` あり → 「ランチはどこでする？」
  3. 同種 event が複数 → `eventOrdinal` 付与（「1つ目の仕事は…」）
- yes/no 質問は禁止（決断を促す形）
- **語尾は直球 `?` で終える**。「かな？」「ですか？」等の緩衝語は採用しない

### 5.3 scope 抽出

legacyAdapter 側で `buildScopeFromEvent(events, event_id)` を実装:

```ts
function buildScopeFromEvent(events, event_id) {
  const ev = events.find((e) => e.event_id === event_id);
  const sameTimeCount = events.filter(/* 同時間帯 */).length;
  return {
    timeLabel: ev.when.startTime ?? ev.when.timeHint ?? null,
    activityLabel: ev.what.activityCanonical ?? ev.what.activity ?? null,
    eventOrdinal: /* 計算 */,
  };
}
```

---

## 6. 失敗モード

### 6.1 status=comprehension_failed

```
priorSession.persistedEvents が ある:
  → events = persistedEvents  # 前ターンの plan を保持
  → phase = "clarifying"
  → message = "うまく聞き取れなかった、もう一度教えてくれる？"
  → plan = priorSession.plan  # UI 側のプラン表示を消さない
  → pendingClarify = priorSession.pendingClarify  # 前ターンの質問は残す

priorSession.persistedEvents が ない（初回）:
  → 現状動作（plan なし、clarifying）
```

### 6.2 pendingClarify の staleness（将来）

5 ターン以上持ち越された pendingClarify は破棄（忘却）。本 PR では実装しないが interface は askedAt で備える。

### 6.3 answerBinder が解釈不能 — 失敗分類（CEO 指示 2026-04-22）

失敗を 2 種に厳密分離する:

**semantic miss**: 返答が質問対象 slot に解釈できない
- 例: where を聞いたのに "おなかすいた" / "うーん" / "そうだね"
- 判定: rule-based binder が該当 slot 向けキーワードを検出できない
- 挙動: **2 回連続で semantic miss → pendingClarify 破棄 + fresh mode へ**
- session に `pendingClarify.semanticMissCount: number` を持たせて数える

**system miss**: provider / parse の失敗
- 例: Gemini 503 / OpenAI timeout / invalid structured shape
- 挙動: **pendingClarify 維持**。plan / events も維持。ユーザーに「うまく聞き取れなかった、もう一度教えて」
- ここでは count を増やさない（質問は同じまま再試行可能）

**混合時**:
- semantic miss 判定中に LLM fallback 呼んで timeout → system miss として扱う（pending 維持）

---

## 7. Commit 分割（5 本）

| # | 論理単位 | 主変更ファイル | テスト |
|---|---|---|---|
| 1 | **SlotSharpness 導入** | `eventSchema.ts`, `provenanceChecker.ts`, `whereClassifier.ts`, `whenClassifier.ts`, `gapResolver.ts` | sharpness 計算の網羅、vague → ASK 経路 |
| 2 | **PendingClarify + answerBinder** | `types.ts`, `answerBinder.ts` (新), `l1Pipeline.ts`, `morningPipeline.ts`, `route.ts`, `useAlterChat.ts` | bind の slot 別、曖昧 answer 時の継続 |
| 3 | **ClarifyQuestionBuilder 強化** | `clarifyQuestionBuilder.ts`, `legacyAdapter.ts` (buildScopeFromEvent) | scope 付き質問文、eventOrdinal 衝突解決 |
| 4 | **items=0 禁則 + plan 継続性** | `legacyAdapter.ts` | clarifying 時の plan 保持、空 question 時の fallback |
| 5 | **Provider failure 耐性** | `legacyAdapter.ts`, `morningPipeline.ts`, `route.ts` | comprehension_failed 時の plan 保持、pendingClarify 継承 |

**commit 間の依存**:
- 1 → 2 → 3: sharpness が無いと ClarifyRequest の scope 決定が不安定、scope が無いと question builder が動けない
- 3 → 4: question が確定してから items=0 禁則の fallback を厳格化
- 4 → 5: plan 継続性の実装が先、それを failure 経路に拡張

---

## 8. テスト計画

### 8.1 Commit 1（SlotSharpness）

- `sharpnessCompute.test.ts`: 全 slot × 全 sharpness 組合せを網羅（27 ケース）
- 既存テスト: `wave3WhereClassifier.test.ts` / `wave3WhenClassifier.test.ts` を sharpness 認識に拡張
- 新: "朝カフェ軽く作業" が **vague×vague×vague** → 三層判定で各 slot ASK が立つ統合テスト

### 8.2 Commit 2（PendingClarify + answerBinder）

- `answerBinder.test.ts`:
  - slot=where, kind=where_center, answer="近場の図書館" → where.place_ref="近場の図書館", sharpness=vague
  - slot=when, kind=specific_time, answer="9時から" → startTime="09:00", sharpness=fixed
  - slot=where, answer="おなかすいた" → bind 不能 → events 不変, pending 継続 or 破棄フラグ
- multi-turn 統合: turn1=Q(where), turn2=A → 正しい event の where に書き込まれる

### 8.3 Commit 3（QuestionBuilder）

- 全 kind × scope バリアントのテーブルテスト
- 同時間帯 2 event で eventOrdinal による区別

### 8.4 Commit 4（items=0 禁則）

- clarifying 時でも plan 項目が前ターンから維持される
- primary_clarify.question が空なら console.error + generic fallback

### 8.5 Commit 5（failure 耐性）

- comprehension_failed でも persistedEvents から plan 再構築
- pendingClarify が次ターンに渡る

### 8.6 回帰

- 既存 1108 tests PASS 維持
- wave3HardGate.test.ts は decidePhase 簡略化で要更新（primary_clarify のみで判定）

---

## 9. スコープ外

以下は W3-PR-7 では**扱わない**:

- OpenAI structured output の invalid shape 修正（別 PR）
- sticky=0/1 のログ値表示（実質動作は本 PR の persistedEvents 導入で解決）
- what の vague → PROVISIONAL（activity category default）は Wave 4
- Why (blocker) の扱い
- LLM narration の文体改善

---

## 10. マイグレーション / 後方互換

- Event schema に sharpness を追加 → 既存テスト fixture を updater で一括更新
- `missing_semantic_critical` は deprecate せず、意味を `sharpness != "fixed"` に変更
- MorningSession に pendingClarify / persistedEvents 追加 → optional なので旧 session はそのまま動く
- W3-PR-6 までの v2 session（persistedEvents なし）が来た場合、前ターン plan は **保持できない**（初回扱い）。1 ターン後から正常動作。

---

## 11. リスクと緩和

| リスク | 緩和 |
|---|---|
| answerBinder rule が頻繁に失敗 | heuristic を簡素に始め、対象 slot のキーワードが answer に含まれるかだけで判定。失敗時は LLM fallback を Wave 4 で追加 |
| sharpness 計算が LLM 出力に敏感すぎる | `placeType` / `activityCanonical` は L1.1 prompt で明示的にルールを教える（既存）。dict miss 時の vague 判定は発話尊重優先 |
| pendingClarify のシリアライズ互換 | localStorage key はバージョン prefix 付きで管理済み。新 field は optional |
| 1 PR が大きくなりすぎる | commit 5 本に厳密分割。各 commit で build/test 通過を必須条件化 |

---

## 12. 承認項目（CEO 確定 2026-04-22）

1. **sharpness ルール**: chain_brand=vague 固定。一意化 or user 明示のみで fixed 昇格 ✅
2. **answerBinder 失敗**: semantic miss / system miss 分離、semantic miss 2 連続で破棄 ✅
3. **clarify 質問**: event scope prefix 必須、語尾直球 `?` ✅
4. **plan 継続性**: provisional / needs_answer / confirmed の 3 値 status で保持 ✅
5. **scope 線引き**: failure state 保持は本 PR、provider / schema 自体は別 PR ✅

全承認取得。commit 1 に着手する。
