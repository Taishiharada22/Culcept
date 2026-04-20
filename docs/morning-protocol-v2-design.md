# Morning Protocol v2 — 5W1H Plan State 再設計

## 1. 現状の構造的欠陥（なぜ壊れるのか）

### 根本原因: 「テキストの切り貼り」がアーキテクチャになっている

現在のフローは以下の通り:

```
User Text → regex parseIntent() → ParsedDayIntent(文字列配列) → mergeIntents(追記) → buildIntentConfirmMessage(全文読み上げ)
```

このフローには3つの構造的な問題がある。

**問題1: regex は文脈を理解できない**

- 「A君と仕事の打ち合わせ」→ 「A君」と「仕事の打ち合わせ」に分断される
- 「違う、ランチは違う店にします」→ 「違う」がタスク名になる
- 「明日の予定だけど」→ 「の予定だけど」がタスク名になる
- 否定文（「〜以外に〜ない」）を肯定として処理する

**問題2: merge が「追記」しかできない**

```typescript
// 現在の mergeIntents — 追記のみ
primaryTasks: [...existing.primaryTasks, ...newTasks]
fixedEvents: [...existing.fixedEvents, ...newEvents]
```

「違う、ランチは別の店で」→ 訂正ではなく追記として処理され、
「仕事 + 食事 + 違う + ランチ + 通勤」と膨れ上がる。

**問題3: confirm message が壊れた内部 state の直読**

`buildIntentConfirmMessage` は `intent.primaryTasks.map(t => t.text).join("と")` で
タスク名を「と」結合する。壊れたタスク名が入れば壊れた文が出る。

---

## 2. 設計原則

### 2.1 テキスト配列ではなく、型付きスロットで状態を持つ

```
Before: primaryTasks: [{text: "仕事"}, {text: "食事会"}, {text: "の予定だけど"}]
After:  segments: [{activity: "仕事", place: "マクドナルド", timeHint: "morning"}, ...]
```

### 2.2 LLM で意味を汲み取り、既存テーブルで正規化する

```
User Text → LLM(構造化JSON抽出) → placeTable/activityVocabulary で正規化 → PlanState
```

- LLM: 自然言語の意味理解（5W1H抽出、否定検出、訂正検出）
- 既存テーブル: 語彙正規化、カテゴリ分類、所要時間推定

### 2.3 Turn 2以降は delta（差分操作）として処理する

```
Turn 2 Text + Current PlanState → LLM(変更検出) → Delta → Apply → Updated PlanState
```

### 2.4 confirm message は差分のみ表示する

```
Turn 1: 「了解。明日は、朝はマックで仕事、昼は近くのレストランで食事、午後はA君と打ち合わせ、18時頃終了予定だね。移動手段は何にする？」
Turn 2: 「了解。ランチ先を別のお店に変更、移動は車で更新したよ。」
```

---

## 3. PlanState — 正規型の定義

```typescript
/** プランの正規状態 — Single Source of Truth */
interface PlanState {
  /** 対象日: YYYY-MM-DD */
  targetDate: string;
  /** 対象日の自然言語ラベル: "明日" | "今日" | "明後日" 等 */
  targetDateLabel: string;

  /** 時間軸に沿ったセグメント列 */
  segments: PlanSegment[];

  /** グローバル移動手段（個別指定がなければこれを使う） */
  transport?: TransportMode;
  /** 終了時刻 */
  endTime?: string;
  /** 終了アクション: "帰宅" 等 */
  endAction?: string;
  /** 出発地点 */
  startPoint?: string;

  /** プラン全体のステータス */
  status: "collecting" | "clarifying" | "confirmed";
  /** 不足フィールドのリスト */
  missingFields: string[];
}

/** 1つの活動セグメント */
interface PlanSegment {
  /** 安定したID（ターンをまたいでも変わらない） */
  id: string;
  /** 表示順序 */
  order: number;

  // ── When ──
  /** 時間帯ヒント: "morning" | "noon" | "afternoon" | "evening" */
  timeHint?: string;
  /** 開始時刻（指定された場合）: "HH:MM" */
  startTime?: string;

  // ── What ──
  /** ユーザーが言った活動名 */
  activity: string;
  /** 正規化された活動名（activityVocabulary由来） */
  activityCanonical?: string;
  /** 活動カテゴリ */
  activityCategory?: string;
  /** 推定所要時間 */
  estimatedDurationMin?: number;

  // ── Where ──
  /** ユーザーが言った場所名 */
  place?: string;
  /** 正規化された場所名（placeTable由来） */
  placeCanonical?: string;
  /** 場所カテゴリ */
  placeCategory?: string;

  // ── Who ──
  /** 同行者 */
  companions: string[];

  // ── How ──
  /** このセグメント固有の移動手段（グローバルと異なる場合） */
  transport?: TransportMode;

  /** セグメントのステータス */
  status: "confirmed" | "tentative" | "needs_clarify";
  /** 備考 */
  notes?: string;
}
```

### なぜこの構造か

1. **targetDate が first-class** — 全てのレンダラーがここを見る。ハードコード「今日」が存在しない
2. **segments[] がスロット型** — 文字列配列ではなく、各フィールドが型付き。壊れたテキストが混入しない
3. **各セグメントに安定 id** — ターンをまたいで「どのセグメントを修正するか」を追跡可能
4. **正規化と生テキストの分離** — `place`（ユーザー発話）と `placeCanonical`（placeTable由来）を分離

---

## 4. LLM 抽出パイプライン

### 4.1 Turn 1: 初回パース

```
User Text → LLM(structured JSON) → Vocabulary Normalize → PlanState
```

**LLM プロンプト（system）:**

```
あなたはスケジュール解析AIです。ユーザーの発話から1日の予定を構造化してください。

出力JSON:
{
  "targetDate": "today" | "tomorrow" | "day_after_tomorrow",
  "segments": [
    {
      "order": 数字,
      "timeHint": "morning" | "noon" | "afternoon" | "evening" | null,
      "startTime": "HH:MM" | null,
      "activity": "活動名（簡潔に）",
      "place": "場所名" | null,
      "companions": ["人名"] | []
    }
  ],
  "endTime": "HH:MM" | null,
  "endAction": "帰宅" | null,
  "transport": "car" | "train" | "bicycle" | "walk" | null
}

ルール:
- ユーザーが言及していない情報は null にする
- 「マック」「マクド」等の略称はそのまま出力する（正規化は後工程）
- 否定文（「〜ない」「〜以外に〜ない」）は予定に含めない
- 「仕事の打ち合わせ」は1つの活動として扱う
- 「食事して」は「食事」として抽出
```

**LLM プロンプト（user）:**

```
${userMessage}
```

**期待する LLM 出力:**

入力: 「明日の予定だけど、朝からマックに行って仕事の予定。お昼は近くのレストランで食事して、午後からA君と仕事の打ち合わせの予定。18時くらいをめどに終了して帰宅の予定。」

```json
{
  "targetDate": "tomorrow",
  "segments": [
    { "order": 1, "timeHint": "morning", "activity": "仕事", "place": "マック", "companions": [] },
    { "order": 2, "timeHint": "noon", "activity": "食事", "place": "近くのレストラン", "companions": [] },
    { "order": 3, "timeHint": "afternoon", "activity": "仕事の打ち合わせ", "place": null, "companions": ["A君"] }
  ],
  "endTime": "18:00",
  "endAction": "帰宅",
  "transport": null
}
```

**後処理: Vocabulary Normalize**

```typescript
function normalizeLLMOutput(raw: LLMExtractResult): PlanState {
  const segments = raw.segments.map(seg => {
    const place = seg.place ? resolvePlaceFromText(seg.place) : null;
    const activity = resolveActivity(seg.activity);
    return {
      id: generateSegmentId(),
      order: seg.order,
      timeHint: seg.timeHint,
      startTime: seg.startTime,
      activity: seg.activity,
      activityCanonical: activity?.canonical ?? seg.activity,
      activityCategory: activity?.category,
      estimatedDurationMin: activity?.defaultDurationMin ?? 60,
      place: seg.place,
      placeCanonical: place?.place.canonicalLabel ?? seg.place,
      placeCategory: place?.place.category,
      companions: seg.companions,
      status: "tentative",
    };
  });

  return {
    targetDate: resolveTargetDate(raw.targetDate), // "tomorrow" → "2026-04-16"
    targetDateLabel: raw.targetDate === "tomorrow" ? "明日" : "今日",
    segments,
    endTime: raw.endTime,
    endAction: raw.endAction,
    transport: raw.transport,
    status: "collecting",
    missingFields: detectMissingFields(segments, raw),
  };
}
```

### 4.2 Turn 2+: Delta 検出

```
User Text + Current PlanState → LLM(delta detection) → PlanDelta → Apply → Updated PlanState
```

**LLM プロンプト（system）:**

```
あなたはスケジュール編集検出AIです。
現在の予定と、ユーザーの新しい発話から、何が変わったかを検出してください。

変更の種類:
- "correction": 既存情報の修正（「違う」「じゃなくて」「変更して」「やっぱり〜」）
- "addition": 新しい予定の追加
- "deletion": 既存予定の削除（「やめる」「キャンセル」）
- "clarify_response": 質問への回答（移動手段、時間等の補足情報）

出力JSON:
{
  "turnType": "correction" | "addition" | "deletion" | "clarify_response",
  "changes": [
    {
      "type": "set" | "replace" | "remove",
      "segmentId": "対象セグメントのID" | null,
      "field": "place" | "activity" | "companions" | "startTime" | "transport" | "endTime" 等,
      "newValue": "新しい値"
    }
  ],
  "confirmSummary": "変更内容の自然な1文要約"
}
```

**LLM プロンプト（user）:**

```
現在の予定:
${JSON.stringify(planState, null, 2)}

ユーザーの発話:
${userMessage}
```

**期待する LLM 出力:**

入力: 「違う、ランチは違う店にします。移動手段は車」

```json
{
  "turnType": "correction",
  "changes": [
    { "type": "replace", "segmentId": "seg_2", "field": "place", "newValue": "別のお店" },
    { "type": "set", "segmentId": null, "field": "transport", "newValue": "car" }
  ],
  "confirmSummary": "ランチ先を別のお店に変更、移動は車で更新したよ。"
}
```

---

## 5. Confirm Message — Diff Renderer

```typescript
function buildConfirmMessage(
  state: PlanState,
  delta: PlanDelta | null,  // null = Turn 1
): string {
  // ── Turn 1: 全体要約 ──
  if (!delta) {
    const date = state.targetDateLabel; // "明日"
    const segmentDescs = state.segments.map(seg => {
      const time = seg.timeHint ? timeHintLabel(seg.timeHint) : "";
      const place = seg.placeCanonical ?? seg.place ?? "";
      const who = seg.companions.length > 0
        ? `${seg.companions.join("、")}と`
        : "";
      const where = place ? `${place}で` : "";
      return `${time}は${where}${who}${seg.activityCanonical ?? seg.activity}`;
    });

    const endPart = state.endTime ? `、${state.endTime}頃終了予定` : "";
    const missing = state.missingFields.length > 0
      ? `\n${buildClarifyQuestion(state.missingFields)}`
      : "";

    return `了解。${date}は、${segmentDescs.join("、")}${endPart}だね。${missing}`;
  }

  // ── Turn 2+: 差分のみ ──
  // LLM が生成した自然な要約を使う
  if (delta.confirmSummary) {
    return `了解。${delta.confirmSummary}`;
  }

  // フォールバック: 変更リストから自動生成
  return `了解。更新したよ。`;
}
```

**Turn 1 の出力例:**
```
了解。明日は、朝はマクドナルドで仕事、昼は近くのレストランで食事、午後はA君と仕事の打ち合わせ、18時頃終了予定だね。
移動手段は何にする？
```

**Turn 2 の出力例:**
```
了解。ランチ先を別のお店に変更、移動は車で更新したよ。
```

---

## 6. 既存資産の活用マップ

| コンポーネント | 現状 | v2 での扱い |
|---|---|---|
| `placeTable.ts` | 場所語彙テーブル | **そのまま使う** — LLM出力の場所名を正規化 |
| `activityVocabulary.ts` | 活動語彙テーブル | **そのまま使う** — LLM出力の活動名を正規化、所要時間推定 |
| `morningProtocol.ts` | 状態遷移マシン | **フェーズ管理はそのまま** — 内部の parse/merge/confirm を差し替え |
| `planningEngine.ts` | `buildDayPlan` | **そのまま使う** — PlanState → 時間割り当て |
| `sufficiencyGate.ts` | 充足判定 | **進化** — PlanState.missingFields から充足判定 |
| `intentParser.ts` | regex パーサー | **Turn 1 の regex 版をフォールバックとして保持** — LLM失敗時のみ使用 |
| `types.ts` | 型定義 | **進化** — PlanState, PlanSegment, PlanDelta を追加 |
| `planEditor.ts` | プラン編集 | **delta apply に統合** — 独立した編集パスは不要に |

---

## 7. 反証と設計判断

### Q1: LLM呼び出しの追加コストは許容できるか？

**反論:** 「LLMをパースに使うのはコストと遅延の無駄。regexで十分。」

**反証:**
- 現在の regex パーサーは 5ms で動くが**壊れた出力を生成する**。0点の出力を5msで生成しても価値がない。
- Gemini Flash の structured output は ~300-500ms。現在のフローは既にLLM呼び出し（Alter応答生成）に ~1-2s かかっている。
- 合計 ~500ms の追加で**正確な5W1H抽出**が得られるなら、トレードオフは明らか。
- **結論:** 許容する。正確性 > 速度。

### Q2: LLMが hallucinate したらどうするか？

**反論:** 「LLMがユーザーの言っていない予定を生成する可能性がある。」

**反証:**
- structured output (JSON schema) で出力形式を制約する。自由テキスト生成ではない。
- 後処理で vocabulary テーブルに存在しない活動/場所は `activityCanonical: null` にする（ユーザーの生テキストは保持）。
- confirm message でユーザーに「これで合ってる？」と確認する。誤りは Turn 2 で訂正される。
- **結論:** hallucination リスクは低く、発生しても自己修正可能。

### Q3: 既存テスト（165件）との互換性は？

**反論:** 「全テストが壊れる。」

**反証:**
- 既存テストの大半は `parseIntent()` の単体テスト。v2 では `parseIntent()` は**フォールバックとして残す**。
- 新しいLLMベースの抽出は**別関数**として実装し、morningProtocol から呼び分ける。
- PlanState → PlanItem[] の変換で既存の UI 互換性を維持。
- **結論:** 段階的移行で既存テストを壊さない。

### Q4: Delta パーサーで LLM を使う必要があるか？deterministic でできないか？

**反論:** 「Turn 2 の変更検出も regex でできるのでは。」

**反証:**
- 「違う、ランチは違う店にします」— 「違う」が訂正意図であることを理解し、「ランチ」が segment[1] を指すことを理解し、「違う店」が place の置換であることを理解する必要がある。
- これは**暗黙的な参照解決**。regex には不可能。
- さらに「やっぱり午後の打ち合わせをキャンセルして」→ 「午後の打ち合わせ」= segment[2] の削除、という参照解決も必要。
- **結論:** Delta 検出は LLM が必要。

### Q5: Turn 1 も LLM を使うべきか？regex + vocabulary で十分では？

**反論:** 「Turn 1 は構造が比較的シンプル。regex で十分。」

**反証:**
- 「朝からマックに行って仕事の予定」— これは1つのセグメント（場所=マック、活動=仕事）。
  regex は「マック」「仕事」「予定」をバラバラに抽出し、関係性を失う。
- 「お昼は近くのレストランで食事して」— 「近くのレストラン」は placeTable にない。
  regex は「レストラン」をキーワードマッチするが、「近くの」修飾を維持できない。
- 「A君と仕事の打ち合わせ」— 「A君」と「打ち合わせ」の関係を理解する必要がある。
  regex は「仕事の」が間に入ると分断する。
- **結論:** Turn 1 も LLM が必要。構造理解が要る。

### Q6: PlanState は重すぎないか？ParsedDayIntent で十分では？

**反論:** 「ParsedDayIntent を修正すれば済む。新しい型は過剰設計。」

**反証:**
- ParsedDayIntent の構造: `primaryTasks: string[]`, `fixedEvents: string[]` — **文字列配列**。
  5W1H のスロット（When/Where/Who）がタスクやイベントに紐づいていない。
- PlanState の構造: `segments: PlanSegment[]` — 各セグメントが When/What/Where/Who を**一体で持つ**。
- この違いが「仕事 + 食事 + 違う + ランチ + 通勤」のような壊れ方を構造的に防ぐ。
- **結論:** PlanState の構造変更は必要。

---

## 8. 実装フェーズ

### Phase 0: 応急止血（現在の退化を止める）
- [ ] 前回の `buildIntentConfirmMessage` 変更をリバート
- [ ] 前回の `intentParser.ts` regex 変更で退化した部分をリバート
- 目的: **これ以上壊さない**

### Phase 1: PlanState 型定義 + LLM Turn 1 抽出
- [ ] `lib/alter-morning/planState.ts` — PlanState, PlanSegment 型定義
- [ ] `lib/alter-morning/llmPlanExtractor.ts` — LLM で Turn 1 テキスト → PlanState JSON
- [ ] Vocabulary 正規化: placeTable + activityVocabulary と接続
- [ ] `planStateToPlanItems()` — PlanState → PlanItem[] 変換（既存UI互換）
- [ ] Turn 1 confirm message: PlanState ベースの全体要約

### Phase 2: Delta Parser + Turn 2+ 処理
- [ ] `lib/alter-morning/llmDeltaParser.ts` — LLM で Turn 2 テキスト + PlanState → Delta JSON
- [ ] `applyDelta(state, delta)` — deterministic な差分適用
- [ ] Turn 2 confirm message: 差分のみ表示

### Phase 3: morningProtocol 統合
- [ ] morningProtocol.ts の collecting/clarifying フェーズを PlanState ベースに切り替え
- [ ] parseIntent() をフォールバックとして温存（LLM失敗時）
- [ ] 既存テストとの互換性確認

### Phase 4: 検証 + CEO レビュー
- [ ] CEO の元シナリオで E2E テスト
- [ ] 追加シナリオ: 複数回訂正、削除、曖昧な入力
- [ ] 品質スコア評価

---

## 9. 期待する正しい挙動

### シナリオ: CEO の元入力

**Turn 1:**
```
入力: 「明日の予定だけど、朝からマックに行って仕事の予定。お昼は近くのレストランで食事して、
       午後からA君と仕事の打ち合わせの予定。18時くらいをめどに終了して帰宅の予定。」

PlanState:
  targetDate: "2026-04-16"
  targetDateLabel: "明日"
  segments:
    [0] morning   | 仕事           | マクドナルド      | -
    [1] noon      | 食事           | 近くのレストラン  | -
    [2] afternoon | 仕事の打ち合わせ | -               | A君
  endTime: "18:00"
  endAction: "帰宅"
  transport: null ← 不足
  missingFields: ["transport"]

Confirm:
  「了解。明日は、朝はマクドナルドで仕事、昼は近くのレストランで食事、
   午後はA君と打ち合わせ、18時頃終了予定だね。
   移動手段は何にする？」
```

**Turn 2:**
```
入力: 「違う、ランチは違う店にします。移動手段は車」

Delta:
  turnType: "correction"
  changes:
    - replace segment[1].place → "別のお店"
    - set transport → "car"
  confirmSummary: "ランチ先を別のお店に変更、移動は車で更新したよ。"

Updated PlanState:
  segments:
    [0] morning   | 仕事           | マクドナルド | -
    [1] noon      | 食事           | 別のお店     | -     ← 更新
    [2] afternoon | 仕事の打ち合わせ | -           | A君
  transport: "car" ← 更新
  missingFields: [] ← 解消

Confirm:
  「了解。ランチ先を別のお店に変更、移動は車で更新したよ。」
```
