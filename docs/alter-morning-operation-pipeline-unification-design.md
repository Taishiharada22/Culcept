# Alter Morning Operation Pipeline Unification — Design Doc

**作成**: 2026-05-04 (= PR #75 merge 翌日 monitoring + PR-50 路線継承)
**位置づけ**: OP-1 (= 監査 + design doc)。 コード変更ゼロ。 OP-2 以降の前提整備。
**範囲**: alter morning protocol の **LLM operation 主軸 pipeline を完成形にする**。

---

## 0. 背景 — PR-50 50 点評価の真因と本 PR の達成目標

### CEO 評価 (= PR-50 前後)

> 「5W1H 方式をパイプを繋いで、 50 点と評価した。 まだ 5W1H が完璧にできてなかったのと、 起点と終点がなかった。 だから移動を伝えても移動が予定〜予定にしか出なかった。 俺が求めてたのはあくまでも 1 日を通したプラン。」

### 50 点の構成

- **+50 点**: LLM が events を 5W1H で構造化し、 operation で state 遷移するパイプは繋がった (= PR-50)
- **−50 点**:
  - 5W1H が完璧でない (= LLM が出した event が when/where/what で漏れる、 仮設定で埋まる)
  - **起点 (journeyOrigin) と終点 (journeyEnd) が LLM 出力に無い**
  - そのため「明日 8 時東京駅から渋谷へ」 と発話しても、 LLM は「東京駅 event + 渋谷 event」 の **予定 → 予定** に分解する
  - CEO が求める「1 日を通したプラン」 = **起点 → 移動 → 予定 → 移動 → 予定 → … → 終点** の通貫構造に到達しない

### PR #75 で部分修正したこと / しなかったこと

| 修正済 | 未修正 |
|---|---|
| 「X から Y へ」 を regex で travelEdge として捉える (= 移動 edge) | LLM 出力 schema に journeyOrigin / journeyEnd / segments が無い |
| 誤生成された event_1/event_2 を reconciler で削除 | LLM が起終点を自然言語から確実に抽出する責務を負っていない |
| `plan.travelEdges` を UI で render | 起終点が unknown のままで「予定〜予定」 のみ表示される条件は変わっていない |

→ PR #75 は regex post-process で対症療法。 **LLM 主軸の構造課題 (= 起終点欠如) は未解決**。

### 本 PR (OP 系) の達成目標 — CEO 質問への直接回答

> 「既存資産を活かしつつ、 確実に起点と終点を自然言語から取れるようになるの?」

**YES。 取れる。** 構造:

1. **LLM が主軸**。 LLM の structured output schema に **`journeyOrigin` / `journeyEnd` / `segments[]` を必須 field として追加** する (= OP-2 schema 拡張の中核)
2. LLM が自然言語から起点 / 終点 / 移動 segments を直接抽出する責務を持つ
3. LLM が抽出したものは Operation として dispatcher に流れ、 PlanState の `journeyOrigin` / `journeyEnd` / `travelEdges[]` を確定する
4. 既存資産 (= regex / location / history / UI) は **LLM が漏らした時の fallback** として retain。 LLM が抽出した時は補助は発火しない
5. 結果: 「明日 8 時東京駅から渋谷へ」 → LLM が `journeyOrigin=東京駅 / segments=[{from:東京駅, to:渋谷, time:08:00}] / journeyEnd=未指定 (= location service が registered_home で補完)` を出力 → 起点 → 移動 → 終点 の通貫プラン完成

### 5W1H + 起終点 + 移動 = 1 日通貫プランの骨格 (= 完成形定義)

| 要素 | 担当 | 取得手段 |
|---|---|---|
| When (= 各 event の時刻) | LLM events[].when | 5W1H (PR-50 で完成形) |
| Where (= 各 event の場所) | LLM events[].where | 5W1H |
| What (= 各 event の活動) | LLM events[].what | 5W1H |
| Who (= 同行者) | LLM events[].who | 5W1H |
| Why / How (= 含意) | LLM narration | 5W1H |
| **起点 (= 1 日の始まり)** | **LLM journeyOrigin** | **OP-2 で schema 追加** |
| **終点 (= 1 日の終わり)** | **LLM journeyEnd** | **OP-2 で schema 追加** |
| **移動 (= 各 segment)** | **LLM segments[]** | **OP-2 で schema 追加** |

→ PR-50 では緑色部分しかなかった。 OP 系で青色 3 要素を追加 → 1 日通貫プランの骨格完成。

---

## 1. 設計思想 — LLM 主軸 + 補完 hierarchy

### 主軸 = LLM operation

PR-50 の思想を **そのまま** 全領域に展開:

> 予定内容の理解 = **LLM**
> state 遷移の安全性 = code

LLM が utterance から **5W1H + 起終点 + 移動** を構造化して operation として出力する。 code は operation を validate + dispatch して PlanState に反映する。

### 補完 = 既存資産の fallback hierarchy

LLM が漏らした時のみ補完 source が operation を出す。 補完は **LLM の代替ではなく LLM の救済**。

| Source | 役割 | LLM が出した場合 |
|---|---|---|
| LLM (主軸) | 5W1H + 起終点 + segments 抽出 | 採用 |
| regex (補完 1) | LLM 漏れ時の deterministic 抽出 (= 「X から Y へ」 構文等) | LLM が同 edge を出していたら **発火しない** |
| location service (補完 2) | LLM が起終点を出さなかった時の registered_home / currentLat-Lng default | LLM が起点を出していたら **発火しない** |
| history (補完 3) | 前日 plan / prior plan からの継続性保証 | LLM が起点を出していたら **発火しない** |
| UI action (例外的上位) | user clarify answer / candidate picker tap = **user 確定行為** | LLM 出力を **上書きする** |
| caller request (例外的上位) | route.ts が「明日のプラン」 等を明示要求 | caller 指定を **採用** |

### 既存資産は廃棄ゼロ

- `fromToTravelEdgeReconciler.ts` (#75) → LLM segments 漏れ時の add_travel_edge factory として retain
- `originAnchorExtractor.ts` (#75) → LLM journeyOrigin 漏れ時の set_journey_origin factory として retain
- `extractTargetDate` (intentParser) → LLM targetDate 漏れ時の set_target_date factory として retain
- `resolveHomeAnchor` → LLM journeyEnd 漏れ時の set_journey_end factory (registered_home default) として retain
- `fetchPreviousDayPlan` → LLM journeyOrigin 漏れ時の set_journey_origin factory (前日 plan.journeyEnd 継承) として retain
- `bindOriginAnswer` (B-2e') → UI clarify answer の resolve_place_candidate factory として retain
- 5 段 chain (`originClarifyAnswer ?? explicitOrigin ?? strongPriorOrigin ?? previousDayOriginCandidate ?? homeAnchor`) → priority 値で同等の振る舞いを再現、 module は factory として retain

→ **既存資産は wrapping して Operation factory に変換するだけ**。 中身の logic / regex / 抽出規則は touch しない。

---

## 2. LLM schema 拡張 — 起終点を自然言語から確実に取る

### 2.1 現行 schema (= PR-50 時点)

`comprehension/structuredSchema.ts` の `L1_COMPREHENSION_SCHEMA`:

```ts
{
  targetDate: string,
  events: Event[],
  operations: PlanOperation[],  // append / modify / answer / noop
  startPoint: { place_ref, provenance } | null,  // ← 単発 event の出発地、 1 日の起点ではない
  departureTime: { value, provenance } | null,
  goOut: boolean | null,
}
```

→ 1 日の **起点 / 終点 / 移動** を表現する field が無い。 これが 50 点の構造原因。

### 2.2 拡張後 schema (= OP-2 で追加、 既存 field は retain)

```ts
{
  targetDate: string,
  events: Event[],

  // === 既存 ===
  operations: PlanOperation[],  // append / modify / answer / noop に 5 種追加 (§ 3)

  startPoint: { place_ref, provenance } | null,  // 既存、 backward compat
  departureTime: { value, provenance } | null,
  goOut: boolean | null,

  // === OP-2 で新規必須 ===
  journeyOrigin: {
    label: string | null,        // "東京駅" / "自宅" / "ホテル" 等、 自然言語ラベル
    classification: string | null, // public_poi / generic / private_anchor 等
    confidence: "high" | "medium" | "low",
    provenance: Provenance,
  } | null,

  journeyEnd: {
    label: string | null,
    classification: string | null,
    confidence: "high" | "medium" | "low",
    provenance: Provenance,
  } | null,

  segments: Array<{
    segmentOrigin: { label, classification },
    segmentDestination: { label, classification },
    segmentDepartureTime: string | null,  // "HH:MM"
    segmentArrivalTime: string | null,
    transport: string | null,
    matchedSpan: string,  // 元 utterance の span
  }>,
}
```

### 2.3 LLM prompt 改修方針 (= OP-2 と同 PR で micro 改修)

prompt に以下を追記:

> 1 日を通したプランを構造化せよ:
> - **起点 (journeyOrigin)** = 1 日の始まりの場所 (= 朝の出発地 / 寝起きた場所)
> - **終点 (journeyEnd)** = 1 日の終わりの場所 (= 夜の到着地 / 帰着地)
> - **segments[]** = 移動の edge (= 「X から Y へ」「X 発で Y へ」 等の自然言語表現を全部抽出)
> - **events[]** = 各場所での予定 (= 5W1H)
>
> 起点 / 終点が utterance に明示されていない場合は null。 推論で埋めない (= code 側 補完が動く)。

→ LLM の責務 = **明示されたものだけを抽出**。 推論は code 側 (= location service / history) の責務。 これで LLM precision を高く維持。

### 2.4 既存 regex / extractor との並走

OP-3 で既存 module を Operation factory に変換する時、 LLM 出力の **発火条件**:

```
LLM journeyOrigin != null  → set_journey_origin (source=llm_explicit, priority=700) を出す
LLM journeyOrigin == null  → 既存 originAnchorExtractor が発火、 regex 由来 set_journey_origin を出す
```

LLM が出していれば regex は **同 operation を出さない** (= dispatcher で priority 比較すらせず、 factory レベルで早期 return)。 これで補完が LLM 主軸を邪魔しない。

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
  payload: TravelEdge;  // segmentOrigin / segmentDestination / segmentDepartureTime
}

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
    slot: "origin" | "end" | "where";
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
  trace?: { matchedSpan?: string; sourceTurnIndex?: number; ruleId?: string };
}

type OperationSource =
  | "llm_explicit"        // LLM 出力 (主軸、 高 confidence)
  | "llm_inferred"        // LLM 推論 (主軸、 中 confidence)
  | "regex_deterministic" // 補完 1: regex
  | "code_history"        // 補完 2: 履歴
  | "code_location"       // 補完 3: location service
  | "ui_action"           // 例外的上位: UI 操作
  | "caller_request"      // 例外的上位: caller 明示要求
```

---

## 4. Priority Table — LLM 主軸 + fallback hierarchy

### 4.1 設計原則

- **LLM が出したら LLM 採用** (= 主軸)
- LLM が出さなかった時に補完 source が priority 順で発火
- 例外: UI action (= user 確定) と caller request (= 明示要求) は LLM を上書きできる

### 4.2 set_journey_origin

| Source | Priority | 役割 |
|---|---|---|
| `ui_action` (= origin clarify answer / candidate picker tap) | 1000 | user 確定 → LLM 上書き OK |
| `code_history` (= prior plan の user_override 継承) | 900 | 前 turn の user 選択を保つ |
| `caller_request` | 850 | route.ts 明示 (= 通常使わない) |
| **`llm_explicit`** | **700 (= 主軸)** | **LLM 自然言語抽出** |
| `regex_deterministic` (= origin anchor / start point) | 500 | LLM 漏れ時のみ発火 |
| `code_history` (= previous day plan) | 400 | LLM + regex 漏れ時 |
| `code_location` (= currentLat-Lng / registered_home) | 100 | 全部漏れ時の last resort |

→ LLM が出した時は priority 700 で確定。 regex / history / location は **発火しない**(= factory レベルで早期 return)。

### 4.3 set_journey_end

| Source | Priority |
|---|---|
| `ui_action` | 1000 |
| `code_history` (= prior plan 継承) | 900 |
| **`llm_explicit`** | **700 (= 主軸)** |
| `regex_deterministic` | 500 |
| `code_location` (= homeAnchor round-trip default) | 100 |

### 4.4 add_travel_edge

| Source | Priority |
|---|---|
| **`llm_explicit`** (= LLM segments) | **700 (= 主軸)** |
| `regex_deterministic` (= fromToTravel) | 500 |

LLM が segments を出した場合は LLM 採用、 regex は発火しない (= 同じ edge を 2 回追加しない)。 LLM が出さなかった時のみ regex 発火。

注: PR #75 では regex を主役にしていたが、 OP-2 以降は **LLM 主軸**。 regex は LLM 漏れ救済に格下げ。

### 4.5 set_target_date

| Source | Priority |
|---|---|
| `caller_request` (= input.today 明示) | 1000 |
| **`llm_explicit`** (= comprehension.targetDate) | **700 (= 主軸)** |
| `regex_deterministic` (= extractTargetDate) | 500 |
| (fallback) `todayYmd()` | 100 |

### 4.6 resolve_place_candidate

UI 専用 operation。 priority 固定 1000 (= conflict 想定なし、 user 確定行為)。

### 4.7 reduce アルゴリズム

```ts
function reducePerField<F>(ops: OperationEnvelope[], field: F): OperationEnvelope | null {
  // 1. field を書き換える operation のみ filter
  // 2. priority 降順 sort
  // 3. priority 同値なら confidence 降順
  // 4. それでも tie なら source 優先 (UI > caller > LLM > regex > history > location)
  // 5. 最高優先 1 つ採用、 残りは trace に rejected として記録
  // 6. 配列 field (= add_travel_edge) は重複 edge を merge (= label 一致なら 1 つに)
}
```

---

## 5. Field ごとの Single Writer 原則

| PlanState field | 書ける operation type | 主軸 source |
|---|---|---|
| `plan.date` | `set_target_date` のみ | LLM (caller request 例外) |
| `plan.events[]` (= append) | `append` のみ | LLM |
| `plan.events[i]` (= modify) | `modify` / `answer` のみ | LLM / UI |
| `plan.travelEdges[]` | `add_travel_edge` のみ | **LLM (segments[])** |
| `plan.journeyOrigin` | `set_journey_origin` / `resolve_place_candidate (slot=origin)` のみ | **LLM (journeyOrigin)** + UI 上書き |
| `plan.journeyEnd` | `set_journey_end` / `resolve_place_candidate (slot=end)` のみ | **LLM (journeyEnd)** + UI 上書き |
| `dialogState.pendingClarify` | (operation 外、 reconcileGapState のみ) | code (AI 生成) |
| `dialogState.focus` | (operation 外、 reconcileDialogState のみ) | code |
| `morningSession.persistedEvents` | (= effectiveEvents の persistence、 dispatch 結果のみ) | dispatcher |

**規律**: 上記以外の経路で field を書く新規実装は禁止 (= OP-7 後)。

---

## 6. Dual-Write 比較方針 (= OP-5)

### 6.1 目的

新 operation pipeline (= LLM 主軸 + 補完 hierarchy) と既存 legacy pipeline を **同じ入力で並走**させ、 出力 plan / pendingClarify / dialogState の **diff = 0** を確認する。

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
- `plan.travelEdges[]`
- `plan.journeyOrigin`
- `plan.journeyEnd`
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
| **OP-2** | LLM schema 拡張 (journeyOrigin / journeyEnd / segments[] 必須 field 追加) + Operation 型 5 種追加 + envelope 追加 + LLM prompt micro 改修 | 受け皿のみ追加、 dispatcher / legacyAdapter は touch しない |
| **OP-3** | 既存 source を Operation factory に wrapping。 LLM 出力時は補完 factory が早期 return する条件分岐を実装 | 既存 module 中身は touch せず、 wrapping function のみ追加 |
| **OP-4** | Dispatcher priority reducer 追加 (= 5 段 chain を priority table で再現) | 本番経路にはまだ wire しない |
| **OP-5** | dual-write / shadow diff assertion (= flag 下で並走、 telemetry 出力) | 出力は legacy 優先 |
| **OP-6** | operation pipeline を flag 下で本流化 | CEO 立会 canary、 30 turn 連続安定 |
| **OP-7** | legacy path 削除 (= post-process / parallel chain / side channel 撤去) | OP-6 で diff 0 確認後のみ |

### 各 PR 検証

| PR | 検証 |
|---|---|
| OP-1 | CEO read 承認 |
| OP-2 | 既存 test PASS + 新 schema field の type-level 検証 |
| OP-3 | 各 factory unit test (= 既存 source の出力が Operation envelope に wrap されるか) |
| OP-4 | dispatcher reducer unit test (= priority + tie-break) |
| OP-5 | dual-write 30 分 + diff telemetry 0 件 + 「明日 8 時東京駅から渋谷へ」 で起終点が plan.journeyOrigin / plan.journeyEnd に正しく入るか確認 |
| OP-6 | canary 30 turn + CEO 立会 |
| OP-7 | legacy 削除後 fullsuite + 1 セッション実機 verify |

### 禁止事項 (= OP 系全期間)

- LLM prompt の **operation 5 種を一気に出力させる大改修** (= OP-2 で schema 拡張 + micro prompt 修正のみ、 大改修は別 PR)
- targetDate / timezone の正規化拡張 (= JST 固定、 別 PR)
- candidate picker UI 変更 (= server side のみ、 別 PR)
- Phase 1 昇格 / global ON / flag 削除 / journey_end 本展開 / saved_places (= B 群、 OP 完走後)

---

## 8. B 群より先に OP 系をやる理由

### B 群 (= CEO 「今はやらない」 と明示した事項)

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
- timezone 正規化 → input.today wire 漏れと同じ wire 課題が timezone でも発生
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
- [x] LLM 主軸 + 補完 hierarchy 設計 (§ 1)
- [x] LLM schema 拡張で起終点を自然言語から取れる仕組み (§ 2)
- [x] Operation 型 5 種追加 + envelope (§ 3)
- [x] priority table — LLM 主軸 (§ 4)
- [x] field ごとの single writer (§ 5)
- [x] dual-write 比較方針 (§ 6)
- [x] 修正版 PR 順序 — dual-write 先、 削除後 (§ 7)
- [x] B 群より先に OP 系をやる理由 (§ 8)
- [x] C 群と並行可能な範囲 (§ 9)

→ 本書 commit + PR 作成 + CEO read 承認 = OP-1 完了。 OP-2 着手は CEO 明示承認後。

---

## 11. CEO 判断仰ぐ項目

1. 本 design doc の **承認 or 修正指示**
2. **「LLM が起終点 / segments を schema 経由で確実に取る」 構造で合意できるか**
3. OP-2 着手の **GO 判定**
4. priority 値 (§ 4) の **CEO レビュー** (= LLM 主軸 + 補完の hierarchy 妥当性)
5. dual-write 観測閾値 (= 100 turn / 30 turn) の **承認 or 修正**
6. C 群 (= W3-PR-12 等) の **凍結範囲最終確認**

---

**規律**: コード変更ゼロ。 OP-2 着手は CEO 明示承認後のみ。 既存資産は廃棄ゼロ。 LLM 主軸を維持。
