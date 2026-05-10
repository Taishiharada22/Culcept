# Alter Morning Operation Pipeline Unification — Design Doc

**作成**: 2026-05-04 (= PR #75 系 preview verify 後 monitoring + PR-50 路線継承)
**位置づけ**: OP-1 (= 監査 + design doc)。 コード変更ゼロ。 OP-2 以降の前提整備。
**範囲**: alter morning protocol の **LLM operation 主軸 pipeline を完成形にする**。
**改訂**: 2026-05-04 v2 — CEO+GPT 指摘 (journeyOrigin / segmentOrigin 分離、 source の独自信頼性) を反映 + PR #75 状態の事実誤認訂正 (= PR #75 は merge 済ではなく OPEN、 preview verify 結果に基づく監査)。

---

## 0. 背景 — PR-50 50 点評価の真因と本 PR の達成目標

### CEO 評価 (= PR-50 前後)

> 「5W1H 方式をパイプを繋いで、 50 点と評価した。 まだ 5W1H が完璧にできてなかったのと、 起点と終点がなかった。 だから移動を伝えても移動が予定〜予定にしか出なかった。 俺が求めてたのはあくまでも 1 日を通したプラン。」

### 50 点の構成

- **+50 点**: LLM が events を 5W1H で構造化し、 operation で state 遷移するパイプは繋がった (= PR-50)
- **−50 点**:
  - 5W1H が完璧でない (= LLM の event 出力が when/where/what で漏れる、 仮設定で埋まる)
  - **起点 (journeyOrigin) と終点 (journeyEnd) を扱う構造が無い** (= LLM operation の対象外)
  - そのため「明日 8 時東京駅から渋谷へ」 と発話しても、 LLM は「東京駅 event + 渋谷 event」 の **予定 → 予定** に分解する
  - CEO が求める「1 日を通したプラン」 = **起点 → 移動 → 予定 → 移動 → 予定 → … → 終点** の通貫構造に到達しない

### PR #75 で部分修正したこと / しなかったこと

| 修正済 | 未修正 |
|---|---|
| 「X から Y へ」 を regex で travelEdge として捉える (= 移動 edge) | LLM 出力 schema に day-level journeyOrigin / journeyEnd / segments が無い |
| 誤生成された event_1/event_2 を reconciler で削除 | LLM が起終点を自然言語から扱う責務を負っていない |
| `plan.travelEdges` を UI で render | 起終点が unknown のままで「予定〜予定」 のみ表示される条件は変わっていない |

→ PR #75 は regex post-process で対症療法。 **LLM operation 本流の構造課題 (= 起終点欠如) は未解決**。

### PR #75 で確定した不変条件 (= 本 doc も厳守)

> **`segmentOrigin` を `journeyOrigin` に即昇格しない**
> (= 「X から Y へ」 だけでは X を 1 日の起点とは判断しない)

これは PR #75 で CEO が訂正した規律。 本 doc の全章で厳守する。

### 本 PR (OP 系) の達成目標 — CEO 質問への直接回答

> 「既存資産を活かしつつ、 確実に起点と終点を自然言語から取れるようになるの?」

**YES。 取れる。** ただし以下の規律で:

1. LLM の structured output schema に **`journeyOrigin` / `journeyEnd` / `segments[]` を field として追加**。 ただし:
   - `journeyOrigin` (= **1 日の起点**) と `segmentOrigin` (= **移動区間の起点**) は **完全分離**
   - `journeyEnd` (= **1 日の終点**) と `segmentDestination` (= **移動区間の終点**) も完全分離
   - **`unknown` を正式値**として許可。 LLM に推測で埋めさせない
   - **明示的 day-level signal** (= 「自宅から始まる」「今日は渋谷スタート」「終点は自宅」 等) がある時だけ LLM が `journeyOrigin` / `journeyEnd` を確定値で出す
   - 「X から Y へ」 だけの発話では LLM は `segments[0]` を埋め、 `journeyOrigin` は unknown のまま出す
2. LLM が出した operation candidate と、 既存資産 (= regex / location / history / UI) が出す operation candidate を、 dispatcher が **priority / confidence / provenance** で採否する
3. **既存資産は LLM の下僕ではない**。 各 source は独自の信頼性 / 役割を持つ operation source として retain
4. 結果: 「明日 8 時東京駅から渋谷へ」 の正しい変換 (§ 2.4):
   ```
   set_target_date     { date: tomorrow, provenance: utterance }
   add_travel_edge     {
     segmentOrigin: 東京駅, segmentDestination: 渋谷,
     segmentDepartureTime: 08:00, provenance: utterance
   }
   journeyOrigin       = unknown   (← 「東京駅を 1 日の起点にする」 とは言っていない)
   journeyEnd          = unknown   (← registered_home は確定値ではなく fallback candidate)
   ```
   → **regex 由来 set_target_date / add_travel_edge は出る**。 **LLM 由来 set_journey_origin / set_journey_end は出ない (= unknown 出力)**。 day-level anchor は別系統 (= explicit signal / location service / history) が candidate を出し、 dispatcher が採否する。

### 5W1H + 起終点 + 移動 = 1 日通貫プランの骨格 (= 完成形定義)

| 要素 | 担当 | 取得手段 |
|---|---|---|
| When (= 各 event の時刻) | LLM events[].when | 5W1H (PR-50 で完成形) |
| Where (= 各 event の場所) | LLM events[].where | 5W1H |
| What (= 各 event の活動) | LLM events[].what | 5W1H |
| Who (= 同行者) | LLM events[].who | 5W1H |
| Why / How (= 含意) | LLM narration | 5W1H |
| **起点 (= 1 日の始まり)** | **LLM `journeyOrigin` (= explicit day-level signal 時のみ) + 既存 anchor source の candidate** | OP-2 で schema 追加 + 既存 chain を operation factory 化 |
| **終点 (= 1 日の終わり)** | **LLM `journeyEnd` (= explicit signal 時のみ) + 既存 anchor source の candidate** | 同上 |
| **移動 (= 各 segment)** | **LLM `segments[]` + regex deterministic** | OP-2 で schema 追加 |

→ PR-50 では 5W1H しかなかった。 OP 系で 起点 / 移動 / 終点 を独立した layer として導入。 **segment-level と day-level を分離**。 1 日通貫プランの骨格完成。

---

## 1. 設計思想 — LLM 主軸 + source 別役割

### 主軸 = LLM operation

PR-50 の思想を **そのまま** 全領域に展開:

> 予定内容の理解 = **LLM**
> state 遷移の安全性 = code

LLM が utterance から **5W1H + 移動 segments + (明示的 signal がある時のみ) 起終点** を構造化して operation candidate として出力する。 code が validate / dispatch / 採否して PlanState に反映する。

### 「LLM 主軸」 の意味の厳密定義

「LLM 主軸」 は **LLM が全部決める** という意味では **ない**。 厳密には:

- LLM = **自然言語理解の主軸** (= utterance → 構造化された operation candidate)
- LLM 以外の source も **独自の信頼性で operation candidate を出す**
- 最終決定は **dispatcher** (= priority / confidence / provenance で reduce)

→ LLM が出したからといって自動採用しない。 LLM が出さなかったからといって fallback とは限らない。 各 source の特性に応じた信頼性で dispatcher が判断する。

### Source 別役割 — 各 source の独自信頼性

各 source は独自の強みを持つ。 「LLM 漏れ時の fallback」 ではなく、 **役割分担**。

| Source | 強み | LLM との関係 |
|---|---|---|
| **LLM** | 自然言語理解、 文脈推論、 5W1H 抽出、 explicit signal 検出 | 主軸 (= utterance 解釈の出発点) |
| **regex (deterministic)** | 限定構文では高 precision (= 「X から Y へ」「明日 8 時」 等)。 ただし誤検出 0 とは断言しない | LLM 出力との一致確認 / 補強に使える / LLM が出さなかった時は独自に candidate を出す / 競合時は dispatcher trace に conflict として残す |
| **location service** | LLM が知らない情報源 (= currentLat-Lng / registered_home / 精度 / 取得時刻) | LLM の代替ではなく **異なる情報源**。 LLM 出力との突合で confidence 補強 |
| **history (= prior plan / previous day plan)** | turn 跨ぎの継続性、 user 過去選択の保持 | 文脈が継続する時は LLM より信頼度高い (= 「明日のプラン」 と続けて発話する場合の起点継承) |
| **UI action** (= candidate picker tap / clarify answer) | user 確定行為 = 最高信頼 | LLM 出力を上書きできる (= ユーザーが picker で選び直したら LLM 出力は無視) |
| **caller request** (= UI/route が **明示的に targetDate を指定**した場合) | システム的に確定した値 | LLM より上位。 ただし `actualToday` / `currentDate` (= 基準日) は source ではない。 後述 § 4.5 注記参照 |

→ 「fallback」 という消極的概念ではなく、 **各 source の特性に応じた priority + confidence + provenance** で dispatcher が採否する。

### 既存資産は廃棄ゼロ

- `fromToTravelEdgeReconciler.ts` (#75) → `add_travel_edge` factory として retain
- `originAnchorExtractor.ts` (#75) → `set_journey_origin` factory として retain (= **day-level signal 限定**、 「X から Y へ」 catch しない)
- `extractTargetDate` (intentParser) → `set_target_date` factory として retain
- `resolveHomeAnchor` → `set_journey_end` candidate factory (= registered_home は **fallback candidate** として出すのみ、 dispatcher が採否)
- `fetchPreviousDayPlan` → `set_journey_origin` candidate factory (= previous day plan.journeyEnd 継承)
- `bindOriginAnswer` (B-2e') → `resolve_place_candidate` factory として retain
- 5 段 chain (`originClarifyAnswer ?? explicitOrigin ?? strongPriorOrigin ?? previousDayOriginCandidate ?? homeAnchor`) → priority + confidence + provenance で同等の振る舞いを再現、 module は factory として retain

→ **既存資産は wrapping して Operation factory に変換するだけ**。 中身の logic / regex / 抽出規則は touch しない。 各 factory は出力に source / priority / confidence / provenance を付与する。

---

## 2. LLM schema 拡張 — day-level と segment-level の分離

### 2.1 現行 schema (= PR-50 時点)

`comprehension/structuredSchema.ts` の `L1_COMPREHENSION_SCHEMA`:

```ts
{
  targetDate: string,
  events: Event[],
  operations: PlanOperation[],  // append / modify / answer / noop
  startPoint: { place_ref, provenance } | null,  // ← segment-level の出発地、 day-level ではない
  departureTime: { value, provenance } | null,
  goOut: boolean | null,
}
```

→ **day-level の起終点 / 移動 segments を表現する field が無い**。 これが 50 点の構造原因。

### 2.2 拡張後 schema (= OP-2 では未接続 V2 schema として追加、 active schema は不変)

**OP-2 範囲の修正方針 (= CEO 2026-05-05 D 案)**:
- active `L1_COMPREHENSION_SCHEMA` / `L1_RESPONSE_FORMAT` は **完全不変** (= runtime 影響ゼロ)
- 別途 **未接続 V2 schema (`L1_COMPREHENSION_V2_SCHEMA` / `L1_RESPONSE_FORMAT_V2`)** を新規 file `lib/alter-morning/comprehension/operationCandidateSchema.ts` に定義
- V2 schema は OP-2 では LLM 呼び出しから **参照されない** (= dispatcher / legacyAdapter / route.ts に接続なし)
- OpenAI strict mode 制約により、 V2 schema では `journeyOrigin / journeyEnd` を `type: ["object", "null"]` で nullable + `required` に含める。 `segments` は array で空 `[]` を許容
- LLM が「該当なし」 を `null` / `[]` で返し、 normalizer (`comprehensionNormalizer.ts`) で internal default に変換

**OP-2 で touch しない**:
- `lib/alter-morning/comprehension/structuredSchema.ts` (= active 定義)
- `lib/alter-morning/comprehension/llmComprehensionProvider.ts` (= prompt 不変)
- `lib/alter-morning/comprehension/planOperation.ts` (= 既存 4 種 union 不変)

下記 schema 例は **V2 schema** の構造を示すもの。 active には反映しない。

```ts
{
  targetDate: string,
  events: Event[],

  // === 既存 retain ===
  operations: PlanOperation[],  // append / modify / answer / noop に 5 種追加 (§ 3)
  startPoint: { place_ref, provenance } | null,  // backward compat
  departureTime: { value, provenance } | null,
  goOut: boolean | null,

  // === OP-2 新規 ===

  /**
   * day-level の起点。
   * 明示的 signal (= 「自宅から始まる」「今日は渋谷スタート」 等) がある時のみ
   * LLM が確定値で出す。
   * 「X から Y へ」 のような segment-level 表現では出さない (= unknown のまま)。
   */
  journeyOrigin: {
    kind: "explicit_day_origin" | "unknown",
    label: string | null,        // explicit_day_origin 時のみ非 null
    classification: string | null,
    confidence: "high" | "medium" | "low",
    provenance: Provenance,
  },

  /**
   * day-level の終点。 同上。
   * 明示的 signal (= 「家に帰る」「終点は自宅」 等) がある時のみ確定値。
   */
  journeyEnd: {
    kind: "explicit_day_end" | "unknown",
    label: string | null,
    classification: string | null,
    confidence: "high" | "medium" | "low",
    provenance: Provenance,
  },

  /**
   * segment-level の移動 edges。
   * 「X から Y へ」「X 発で Y へ」 等の自然言語表現を全部抽出。
   * day-level の journeyOrigin / journeyEnd とは **完全独立**。
   */
  segments: Array<{
    segmentOrigin: { label: string, classification: string },
    segmentDestination: { label: string, classification: string },
    segmentDepartureTime: string | null,  // "HH:MM"
    segmentArrivalTime: string | null,
    transport: string | null,
    matchedSpan: string,  // 元 utterance の span
  }>,
}
```

### 2.3 LLM prompt 改修方針 (= OP-2 と同 PR で micro 改修)

prompt に以下を **明示的に記述**:

> 1 日を通したプランを構造化せよ。 以下の **3 つの layer を完全に分離**せよ:
>
> **events[]** (= 各場所での予定、 5W1H)
>
> **segments[]** (= 移動の edge):
> - 「X から Y へ」「X を出て Y へ」「X 発で Y へ」 等の **移動表現** を抽出する
> - segmentOrigin = 移動区間の起点。 1 日の起点ではない
> - segmentDestination = 移動区間の終点。 1 日の終点ではない
>
> **journeyOrigin** (= **1 日の始まりの場所**):
> - 「自宅から始まる」「今日は渋谷スタート」「ホテルから出発」 等の **明示的 day-level signal** がある時のみ確定値
> - 「東京駅から渋谷へ」 のような segment 表現では `kind: "unknown"` を出す
> - 推論で埋めない (= code 側補完が動く)
>
> **journeyEnd** (= **1 日の終わりの場所**):
> - 「家に帰る」「終点は自宅」「ホテル泊」 等の **明示的 signal** がある時のみ確定値
> - 推論で埋めない
>
> 重要規律: `segmentOrigin == journeyOrigin` ではない。 両者は独立した layer。

→ LLM の責務 = **明示的に出ているものだけを構造化**。 推論は code 側 (= location service / history) の責務。 LLM precision を高く維持。

### 2.4 規範例 — 「明日 8 時東京駅から渋谷へ」

```
入力: 明日8時東京駅から渋谷へ

LLM 出力 (正しい):
{
  targetDate: "tomorrow",
  events: [],  // event-level の予定は明示されていない
  operations: [],
  startPoint: null,
  departureTime: null,
  goOut: null,
  journeyOrigin: { kind: "unknown", label: null, ... },        // ← 明示 signal なし
  journeyEnd: { kind: "unknown", label: null, ... },           // ← 明示 signal なし
  segments: [{
    segmentOrigin: { label: "東京駅", classification: "public_poi_proper_noun" },
    segmentDestination: { label: "渋谷", classification: "public_poi_proper_noun" },
    segmentDepartureTime: "08:00",
    segmentArrivalTime: null,
    transport: null,
    matchedSpan: "東京駅から渋谷へ",
  }],
}

→ Operation envelope に変換:

[
  { type: "set_target_date", payload: { date: "tomorrow" },
    source: "llm_explicit", priority: 700, confidence: "high", provenance: utterance },

  { type: "add_travel_edge", payload: {
      segmentOrigin: { label: "東京駅", classification: "public_poi_proper_noun" },
      segmentDestination: { label: "渋谷", classification: "public_poi_proper_noun" },
      segmentDepartureTime: "08:00",
    },
    source: "llm_explicit", priority: 700, confidence: "high", provenance: utterance },

  // set_journey_origin は出さない (LLM journeyOrigin.kind = "unknown")
  // set_journey_end は出さない (LLM journeyEnd.kind = "unknown")
]

dispatcher が他 source の candidate も合わせて採否:
- regex fromToTravel から add_travel_edge candidate (= LLM と同 edge、 dispatcher で重複排除)
- location service から set_journey_origin candidate (= currentLat-Lng or registered_home、 priority 100)
- history から set_journey_origin candidate (= 前日 plan.journeyEnd 継承、 priority 400)

最終 PlanState:
- plan.date = tomorrow
- plan.travelEdges = [{ 東京駅 → 渋谷, 08:00 }]
- plan.journeyOrigin = location service or history 由来 (= LLM unknown のため補完が採用される)
- plan.journeyEnd = location service 由来 (= LLM unknown)
```

→ **`journeyOrigin = 東京駅` に絶対しない**。 segment-level と day-level を完全分離。

### 2.5 規範例 — 「明日は自宅から始めて、 8 時東京駅から渋谷へ」

```
入力: 明日は自宅から始めて、8時東京駅から渋谷へ

LLM 出力:
{
  targetDate: "tomorrow",
  journeyOrigin: {
    kind: "explicit_day_origin",
    label: "自宅",                               // ← 「自宅から始めて」 = 明示 signal
    classification: "private_anchor",
    confidence: "high",
    provenance: utterance,
  },
  journeyEnd: { kind: "unknown", ... },
  segments: [{ segmentOrigin: 東京駅, segmentDestination: 渋谷, segmentDepartureTime: 08:00 }],
}

→ Operation:
[
  set_target_date(tomorrow),
  set_journey_origin(label: "自宅", source: llm_explicit, priority: 700, confidence: high),
  add_travel_edge(東京駅 → 渋谷, 08:00),
]

dispatcher: LLM journey origin priority 700 は他 source (location 100 / history 400) より高い → LLM 採用。
```

→ **明示的 day-origin signal がある時だけ LLM が `set_journey_origin` を出す**。 構文的差異が operation 出力差異に正しく反映される。

---

## 3. Operation 型 (= contract)

### 3.1 既存 (PR-50、 retain)

```ts
type AppendOperation  = { type: "append";  eventDraft: EventDraft }
type ModifyOperation  = { type: "modify";  targetRef: string; patch: EventPatch }
type AnswerOperation  = { type: "answer";  slot: PendingSlot; value: string }
type NoopOperation    = { type: "noop";    reason?: string }
```

### 3.2 OP-2 新規 5 種

```ts
type SetTargetDateOperation = {
  type: "set_target_date";
  payload: { date: string };  // "YYYY-MM-DD" or "today" / "tomorrow" / "day_after_tomorrow"
}

type AddTravelEdgeOperation = {
  type: "add_travel_edge";
  payload: {
    segmentOrigin: { label: string, classification: string },
    segmentDestination: { label: string, classification: string },
    segmentDepartureTime?: string,  // "HH:MM"
    segmentArrivalTime?: string,
    transport?: string,
    matchedSpan?: string,
  };
}

/**
 * day-level の起点を確定。
 * 出す条件: explicit day-origin signal がある (LLM) / UI action / history 継承 / location fallback
 * 出さない条件: 「X から Y へ」 のみの segment 表現 (= LLM journeyOrigin.kind === "unknown")
 */
type SetJourneyOriginOperation = {
  type: "set_journey_origin";
  payload: JourneyAnchorState;  // known_exact | known_label_only | unknown
}

type SetJourneyEndOperation = {
  type: "set_journey_end";
  payload: JourneyAnchorState;
}

type ResolvePlaceCandidateOperation = {
  type: "resolve_place_candidate";
  payload: {
    slot: "origin" | "end" | "where";  // ← origin/end は day-level 専用
    label: string;
    coords?: { lat: number; lng: number };
    placeId?: string;
  };
}
```

### 3.3 共通 envelope (= OP-2 で全 operation に付与)

```ts
type OperationEnvelope<T extends PlanOperation> = T & {
  source: OperationSource;
  priority: number;
  confidence: "high" | "medium" | "low";
  provenance: Provenance;  // utterance / inferred / fallback / user_override / system
  trace?: { matchedSpan?: string; sourceTurnIndex?: number; ruleId?: string };
}

type OperationSource =
  | "llm_explicit"        // LLM 出力 (高 confidence、 utterance 由来明示)
  | "llm_inferred"        // LLM 推論 (中 confidence、 utterance から推論)
  | "regex_deterministic" // regex 抽出 (狭い構文 precision 高)
  | "code_history"        // 履歴 (= prior plan / previous day plan)
  | "code_location"       // location service (= currentLat-Lng / registered_home)
  | "ui_action"           // user UI 操作 (= candidate tap / clarify answer)
  | "caller_request"      // caller (= route.ts) からの明示要求
  | "system_default"      // 上位 source 全 unknown 時の最終 fallback (= dispatcher が pipeline 内で生成)
```

---

## 4. Priority Table — Source 別役割に基づく

### 4.1 設計原則

- Priority = source の **役割と信頼性に応じた値**
- 「LLM が出したら最優先」 ではなく、 「source 特性 + provenance + confidence」 の総合判断
- LLM は utterance 由来 explicit で 700。 UI action は user 確定で 1000。 location service は推論 last resort で 100。

### 4.2 set_journey_origin の priority

| Source | Priority | 役割 |
|---|---|---|
| `ui_action` (= origin clarify answer / candidate picker tap) | 1000 | user 確定行為、 LLM 出力上書き OK |
| `code_history` (= prior plan の user_override 継承、 samePlanDate) | 900 | 前 turn の user 選択継続性保証 |
| `caller_request` | 850 | route.ts 明示 (= 通常使わない) |
| `llm_explicit` (= LLM journeyOrigin.kind === "explicit_day_origin") | 700 | utterance 内の明示 day-origin signal |
| `regex_deterministic` (= origin anchor / start point) | 500 | day-origin signal を deterministic に検出 |
| `code_history` (= previous day plan.journeyEnd 継承) | 400 | 文脈継続 (= 別 turn の文脈) |
| `code_location` (= currentLat-Lng / registered_home) | 100 | 推論 last resort |

→ LLM が `kind: "unknown"` で出した場合は **`set_journey_origin` operation を出さない**。 LLM が「黙る」 ことで他 source が独自 priority で採否される。

### 4.3 set_journey_end の priority

| Source | Priority |
|---|---|
| `ui_action` | 1000 |
| `code_history` (= prior plan 継承) | 900 |
| `llm_explicit` (= LLM journeyEnd.kind === "explicit_day_end") | 700 |
| `regex_deterministic` | 500 |
| `code_location` (= homeAnchor round-trip default、 **fallback candidate のみ**) | 100 |

→ `code_location` の registered_home は **confirmed ではなく fallback candidate**。 priority 100 で他に何もない時の最終手段。

### 4.4 add_travel_edge の priority

| Source | Priority |
|---|---|
| `llm_explicit` (= LLM segments[]) | 700 |
| `regex_deterministic` (= fromToTravel) | 600 |

両者が同じ edge を出した場合は **dispatcher で重複排除** (= label 一致なら 1 つに merge)。 異なる edge を出した場合は両方追加 (= 配列 field のため)。

注: 「LLM と regex のどちらが正しいか」 は context 依存。 両方が同 edge を出すなら高 confidence の証拠。 不一致なら trace で要確認 (= telemetry で観測対象)。

### 4.5 set_target_date の priority

| Source | Priority |
|---|---|
| `caller_request` (= UI/route が **明示的に targetDate を指定** した場合のみ) | 1000 |
| `llm_explicit` (= comprehension.targetDate、 utterance 由来) | 700 |
| `regex_deterministic` (= extractTargetDate、 「明日」「今日」 等の deterministic match) | 600 |
| `system_default` (= 上記 3 source が **全て unknown** の時のみ生成、 `payload.date` は actualToday から解決) | 100 |

**重要規律 — `actualToday` / `currentDate` は operation source ではない、 ただし `plan.date` は必ず operation pipeline 内で書く**:

- `actualToday` / `currentDate` (= 旧称 `input.today`) は **date resolution context** (= 「明日」 → "YYYY-MM-DD" に解決するための基準日)
- `actualToday` / `currentDate` 自体を operation source として扱わない (= priority 表に出さない)
- ただし、 `caller_request` / `llm_explicit` / `regex_deterministic` が **全て unknown** の場合は、 dispatcher が **`system_default` source の `set_target_date` operation を生成** して pipeline 内に入れる。 `payload.date` は actualToday / currentDate から解決
- これにより **`plan.date` は必ず `set_target_date` operation 経由で書かれる** (= single writer 原則完全遵守)
- **`plan.date` を operation pipeline の外で直接書く経路は禁止** (= caller も含む)
- naming も `input.today` → `actualToday` / `currentDate` に統一し、 「今日の基準日」 と「targetDate」 の混同を防ぐ
- PR-50 50 点評価の真因の 1 つ: LLM が `targetDate = "tomorrow"` を出したのに `legacyAdapter:798` で `input.today ?? todayYmd()` (= 基準日) を `plan.date` として採用した wire 漏れ。 OP 系で **`plan.date` を pipeline 外で書く経路を OP-7 で完全撤去** することでこの種類のバグを構造的に防ぐ
- OP 系では date resolution context と target date source を絶対に混ぜない

### 4.6 resolve_place_candidate の priority

UI 専用 operation。 priority 固定 1000 (= conflict 想定なし、 user 確定行為)。

### 4.7 reduce アルゴリズム

```ts
function reducePerField<F>(ops: OperationEnvelope[], field: F): OperationEnvelope | null {
  // 1. field を書き換える operation のみ filter
  // 2. priority 降順 sort
  // 3. priority 同値なら confidence 降順 (high > medium > low)
  // 4. それでも tie なら provenance 優先 (utterance > user_override > inferred > system > fallback)
  // 5. それでも tie なら source 優先 (UI > caller > LLM > regex > history > location)
  // 6. 最高優先 1 つ採用、 残りは trace に rejected として記録
  // 7. 配列 field (= add_travel_edge) は重複 edge を merge (= label 一致なら 1 つに)
}
```

---

## 5. Field ごとの Single Writer 原則

| PlanState field | 書ける operation type | 主な source |
|---|---|---|
| `plan.date` | `set_target_date` のみ (= 全 source unknown 時も dispatcher が `system_default` operation を生成、 pipeline 外書き込みは禁止) | LLM / regex / caller / system_default |
| `plan.events[]` (= append) | `append` のみ | LLM |
| `plan.events[i]` (= modify) | `modify` / `answer` のみ | LLM / UI |
| `plan.travelEdges[]` (= **segment-level**) | `add_travel_edge` のみ | LLM segments / regex |
| `plan.journeyOrigin` (= **day-level**) | `set_journey_origin` / `resolve_place_candidate (slot=origin)` のみ | LLM (explicit signal) / UI / regex / history / location |
| `plan.journeyEnd` (= **day-level**) | `set_journey_end` / `resolve_place_candidate (slot=end)` のみ | LLM (explicit signal) / UI / regex / history / location |
| `dialogState.pendingClarify` | (operation 外、 reconcileGapState のみ) | code (AI 生成) |
| `dialogState.focus` | (operation 外、 reconcileDialogState のみ) | code |
| `morningSession.persistedEvents` | (= effectiveEvents の persistence、 dispatch 結果のみ) | dispatcher |

**重要規律 (= PR #75 継承)**:

- `plan.journeyOrigin` は **day-level**。 `segmentOrigin` (= `plan.travelEdges[i].segmentOrigin`) と **絶対に混ぜない**
- `set_journey_origin` operation は **explicit day-level signal がある時のみ** 出す (= 「X から Y へ」 だけでは出さない)
- `add_travel_edge` の `segmentOrigin` は移動区間の起点であり、 1 日の起点ではない

→ 上記以外の経路で field を書く新規実装は禁止 (= OP-7 後)。 違反は code review で reject。

---

## 6. Dual-Write 比較方針 (= OP-5)

### 6.1 目的

新 operation pipeline (= LLM operation 主軸 + source 別 candidate + dispatcher) と既存 legacy pipeline を **同じ入力で並走**させ、 出力 plan / pendingClarify / dialogState の **diff = 0** を確認する。

### 6.2 仕組み

```ts
if (process.env.ALTER_MORNING_OP_DUAL_WRITE === "true") {
  const legacyResult = runLegacyPipeline(input);
  const operationResult = runOperationPipeline(input);

  const diff = comparePlanResults(legacyResult, operationResult);
  if (diff.length > 0) {
    emitTelemetry("alter_morning_op_dual_write_diff", {
      sessionId,
      utterance_hash,  // PII 排除
      diff,            // field 名 + legacy/op 双方の値 hash
    });
  }
  return legacyResult;  // 出力は legacy 優先
}
```

### 6.3 比較対象 field

- `plan.date`
- `plan.items[].id / when / where / what / kind`
- `plan.travelEdges[]` (= segment-level)
- `plan.journeyOrigin` (= day-level)
- `plan.journeyEnd` (= day-level)
- `pendingClarify.event_id / slot / question`
- `phase`
- `planStatus`
- `effectiveEvents` (= length + 各 event_id)

PII 規律: label / userId / coords は hash で比較。

### 6.4 観測閾値

- **dual-write 開始**: OP-5 merge 直後、 flag ON で 1 セッション (= 30 分以内) CEO 立会観測
- **継続観測**: telemetry で diff 0 を **100 turn 連続**観測まで dual-write 維持
- **operation 主切替 (OP-6)**: 100 turn 安定後、 `ALTER_MORNING_OP_PRIMARY=true` で operation 主、 legacy fallback
- **legacy 削除 (OP-7)**: OP-6 で 30 turn 連続安定 + CEO 最終承認後

---

## 7. 修正版 PR 順序

| PR | 内容 | 規律 |
|---|---|---|
| **OP-1** | 監査 + design doc (= 本書) | コード変更ゼロ |
| **OP-2** | Operation Candidate 型 5 種追加 (= 既存 PlanOperation と別 union) + envelope 追加 + 未接続 V2 schema (`L1_COMPREHENSION_V2_SCHEMA`) を新規 file に追加 + comprehensionNormalizer 追加。 **LLM prompt 変更 + active schema 変更は OP-2 では行わず、 OP-3 以降の別判断・専用 flag 下で扱う** (= OP-2 では runtime 影響ゼロ) | 受け皿のみ追加、 dispatcher / legacyAdapter / route.ts / `llmComprehensionProvider.ts` / active `L1_COMPREHENSION_SCHEMA` / 既存 `OPERATION_SCHEMA` / 既存 `PlanOperation` union は touch しない |
| **OP-3** | 既存 source を Operation factory に wrapping。 各 factory が source / priority / confidence / provenance を envelope に付与 | 既存 module 中身は touch せず、 wrapping function のみ追加 |
| **OP-4** | Dispatcher priority reducer 追加 (= 5 段 chain を priority + confidence + provenance テーブルで再現) | 本番経路にはまだ wire しない |
| **OP-5** | dual-write / shadow diff assertion (= flag 下で並走、 telemetry 出力) | 出力は legacy 優先 |
| **OP-6** | operation pipeline を flag 下で本流化 | CEO 立会 canary、 30 turn 連続安定 |
| **OP-7** | legacy path 削除 (= post-process / parallel chain / side channel 撤去) | OP-6 で diff 0 確認後のみ |

### 各 PR 検証

| PR | 検証 |
|---|---|
| OP-1 | CEO read 承認 |
| OP-2 | 既存 test PASS + 新 schema field の type-level 検証 + § 2.4/2.5 規範例の LLM 出力 unit test |
| OP-3 | 各 factory unit test (= 既存 source の出力が Operation envelope に正しく wrap されるか + day/segment 分離維持) |
| OP-4 | dispatcher reducer unit test (= priority + confidence + provenance tie-break) |
| OP-5 | dual-write 30 分 + diff telemetry 0 件 + 「明日 8 時東京駅から渋谷へ」 で `journeyOrigin = unknown / segments[0] = 東京駅→渋谷` が正しく出るか確認 |
| OP-6 | canary 30 turn + CEO 立会 |
| OP-7 | legacy 削除後 fullsuite + 1 セッション実機 verify |

### 禁止事項 (= OP 系全期間)

- LLM prompt の **operation 5 種を一気に出力させる大改修** (= OP-2 で schema 拡張 + day/segment 分離 micro prompt 修正のみ)
- targetDate / timezone の正規化拡張 (= JST 固定、 別 PR)
- candidate picker UI 変更 (= server side のみ、 別 PR)
- Phase 1 昇格 / global ON / flag 削除 / journey_end 本展開 / saved_places (= B 群、 OP 完走後)
- **`journeyOrigin == segmentOrigin` 視点の混入** (= PR #75 規律違反)

---

## 8. B 群より先に OP 系をやる理由

### B 群

1. Phase 1 昇格
2. Global ON 化
3. Flag 削除
4. journey_end 本展開
5. saved_places 統合
6. targetDate / timezone 正規化拡張
7. B-3c-2 candidate picker 正規対応
8. LLM prompt 大改修

### 構造論

B 群の **全項目が PlanState を書き換える**。 現状の混線 pipeline (= 6 経路並走) のまま B 群に進むと:

- journey_end 展開 → journeyOrigin と同じ chain が end 側にも生成 → 補完が 2 倍に
- saved_places 統合 → 候補群が side channel で flow → side channel 肥大化
- timezone 正規化 → 基準日 (`actualToday` / `currentDate`) と targetDate の混同による wire 漏れ (= PR-50 50 点評価真因) と同じ課題が timezone でも発生
- candidate picker 正規対応 → bindOriginAnswer 系の side channel が永続化
- LLM prompt 大改修 → operation を出すよう prompt 修正しても、 受け皿 (= operation type) が無いと LLM 出力が無視される

→ **B 群を先にやると、 OP 系で削除予定の負債が永続化する**。 OP で土台を整えてから B 群に進めば、 各項目は operation 1 種追加 + factory 1 つ追加で完結する。

### 効率論

- OP 系: 7 PR、 各 PR scope 限定で 1〜3 日
- B 群: 8 項目 (= 各 1〜2 PR、 合計 10〜16 PR)
- 順序 OP→B: OP で skeleton 完成 → B 群は operation 1 種追加で済む
- 順序 B→OP: B 群で chain / side channel が肥大化 → OP で「全部撤去 + 統合」 を一気にやる必要 → リスク大

---

## 9. C 群との並行可能範囲

### C 群

1. W3-PR-12 = 2 件目 handoff の `status_not_handoff` 条件整理
2. W3-PR-10 Phase 3 論点 5 件
3. W3-PR-10 Scope A 残論点 6 件 (canary 運用 / 精度観測 / mode 推定 / Routes API / Path B 統合 / UI override)
4. W3-PR-10 Positive-Path Nudge Item ③ (= segment_count>0 初観測待ち)

### 並行 OK

- docs (= `docs/` 配下、 OP 系 doc と命名衝突しない範囲)
- audit (= 監査ドキュメント追加)
- tests (= 既存 test を読むだけ、 OP 系と重複しない module の新規 test 追加)
- 上記以外の OP 系 scope 外ファイル

### 並行 NG (= OP 系完走まで凍結)

- `lib/alter-morning/legacyAdapter.ts`
- `app/api/stargazer/alter/route.ts`
- `lib/alter-morning/types.ts` (= MorningPlan / PlanState / PendingClarify / TravelEdge / JourneyAnchorState)
- `lib/alter-morning/comprehension/planOperation.ts`
- `lib/alter-morning/comprehension/structuredSchema.ts`
- `lib/alter-morning/comprehension/llmComprehensionProvider.ts`
- `lib/alter-morning/planning/operationDispatcher.ts`
- `lib/alter-morning/comprehension/fromToTravelEdgeReconciler.ts`
- `lib/alter-morning/journey/originAnchorExtractor.ts`
- `lib/alter-morning/intentParser.ts`
- `lib/alter-morning/placeResolver.ts`
- `lib/alter-morning/search/placesHandoff.ts`
- `lib/alter-morning/morningPipeline.ts`

### W3-PR-12 / W3-PR-10 系の判定

- W3-PR-12 → `placesHandoff.ts` 触る → **凍結**
- W3-PR-10 Phase 3 論点 → 中身次第、 個別確認後に判定
- W3-PR-10 Scope A 残論点 → 同上
- W3-PR-10 Positive-Path Nudge Item ③ → 観測待ちのみ、 並行 OK

---

## 10. 完了条件 (= OP-1)

- [x] PR-50 50 点評価の真因明示 (§ 0)
- [x] LLM 主軸 + source 別役割設計 (§ 1)
- [x] LLM schema 拡張で day-level / segment-level 分離 (§ 2、 unknown 正式値)
- [x] Operation 型 5 種追加 + envelope (§ 3)
- [x] priority table — source 別役割 (§ 4)
- [x] field ごとの single writer + day/segment 分離 (§ 5)
- [x] dual-write 比較方針 (§ 6)
- [x] 修正版 PR 順序 — dual-write 先、 削除後 (§ 7)
- [x] B 群より先に OP 系をやる理由 (§ 8)
- [x] C 群と並行可能な範囲 (§ 9)

→ 本書 commit + PR 更新 + CEO read 承認 = OP-1 完了。 OP-2 着手は CEO 明示承認後。

---

## 11. CEO 判断仰ぐ項目

1. 本 design doc の **承認 or 修正指示**
2. 「LLM 主軸 + source 別役割」 の合意 (= LLM が全部決めるではなく、 各 source が独自 priority で candidate を出し dispatcher が採否)
3. **`journeyOrigin` と `segmentOrigin` 完全分離**の合意 (§ 2.2 / § 2.4 / § 5)
4. **`unknown` を正式値とする**設計の合意 (= LLM に推測で埋めさせない)
5. priority 値 (§ 4) の レビュー
6. dual-write 観測閾値 (= 100 turn / 30 turn) の承認 or 修正
7. C 群凍結範囲の最終確認
8. OP-2 着手の GO 判定

---

**規律**: コード変更ゼロ。 OP-2 着手は CEO 明示承認後のみ。 既存資産は廃棄ゼロ。 LLM 主軸 (= 自然言語理解の主軸) を維持。 day-level と segment-level を絶対混ぜない。
