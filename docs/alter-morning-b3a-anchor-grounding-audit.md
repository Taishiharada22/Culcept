# B-3a Anchor Grounding Audit

**Status**: Draft for CEO/GPT review (実装はまだ承認されていない)
**Date**: 2026-05-03
**Author**: Build Unit (Claude)
**Scope**: B-3a — audit + grounding contract のみ。実装変更なし。

---

## Goal (B-3 全体)

`label-only` な `journeyOrigin` / `journeyEnd` を、候補検索とユーザー選択によって **`known_exact + coordinates`** に昇格させ、travel segment を生成できるようにする。

```
label-only anchor (例: "ホテル", "渋谷", "サドヤ")
  ↓
候補表示 (Places API 経由)
  ↓
ユーザー選択
  ↓
known_exact + coordinates
  ↓
travel segment 生成
```

ただし、**private semantic label (= "自宅", "会社", "友達の家") を Places API に雑に流さない**。これは "現実の本人の自宅" ではなく "公開施設の『自宅』 という名前" を取得してしまうため意味的に破綻する。

---

## 1. 既存 event.where Places flow の構造

### 1.1 全体 flow (W3-PR-9 で構築)

```
User: "9時に渋谷でランチ"
  ↓ comprehension/extraction
Event: { where.place_ref: "渋谷", placeType: "exact_proper_noun" }
  ↓ groundPlaces (= Places API で search)
GroundedPlace: { 候補多数 → narrowStep paradigm 起動 }
  ↓ DialogState.searchQueryDraft 構築 (anchor/chain/category)
narrowStep 0 → 1 → 2 (= readyForHandoff=true)
  ↓ conversationStatus = "search_handoff_blocking"
placesHandoffOrchestrator (= gate check + Places API call)
  ↓ activePresentation = { targetEventId, queryFingerprint, candidates }
  ↓ conversationStatus = "search_candidates_presented"
PlaceCandidatePicker UI が candidates 表示
  ↓ User clicks
selectPlaceCandidate(placeId) → POST /api/stargazer/alter/selection
  ↓ dialogReducer({ type: "SEARCH_CANDIDATE_SELECTED", ... })
  ↓ accepted (= reducer がチェック OK)
applyPlaceSelection({ events, targetEventId, candidate })
  ↓ event.where update (placeType="exact_proper_noun", coordinates)
buildPlanAndSegmentsFromEvents → travel segment 生成
```

### 1.2 主要 module/file

| Module | 責務 |
|--------|------|
| `lib/alter-morning/dialog/types.ts` | `DialogState`, `PresentationContext`, `ConversationStatus`, `SearchQueryDraft` |
| `lib/alter-morning/dialog/reducer.ts` | `dialogReducer` (`SEARCH_CANDIDATE_SELECTED`, `SEARCH_HANDOFF_TRIGGERED` 等) |
| `lib/alter-morning/search/placesHandoff.ts` | `executePlacesHandoff` (= Places API call) |
| `lib/alter-morning/search/placesHandoffOrchestrator.ts` | gate check + dispatch |
| `lib/alter-morning/search/applyPlaceSelection.ts` | event 更新 pure helper |
| `lib/alter-morning/search/normalizedPlace.ts` | `NormalizedPlaceCandidate` 型 |
| `app/api/stargazer/alter/selection/route.ts` | selection POST endpoint |
| `components/alter-morning/PlaceCandidatePicker.tsx` | candidate UI (presentation only) |
| `hooks/useAlterChat.ts` (`selectPlaceCandidate`) | client → endpoint 通信 |

### 1.3 主要 state transitions (DialogState v2)

```
stable → narrowing (where slot で anchor/chain 入力開始)
narrowing → narrowing (narrowStep 0→1→2)
narrowing → search_handoff_blocking (readyForHandoff=true)
search_handoff_blocking → search_candidates_presented (Places API 成功)
search_handoff_blocking → clarifying (zero_candidates)
search_candidates_presented → stable (selection 成功)
search_candidates_presented → clarifying (cancel / どれでもない)
```

---

## 2. event_id 前提になっている箇所

GPT 指摘の「fake event を作る誘惑」 を構造的に防ぐため、現状の event_id 前提箇所を全て列挙:

### 2.1 型定義
- `PresentationContext.targetEventId: string` (`dialog/types.ts:245`) — **必須 field**
- `LastFailedSearch` — event 直接参照ではないが anchor/category context

### 2.2 reducer
- `SEARCH_CANDIDATE_SELECTED` action: `targetEventId: string`
- `SEARCH_HANDOFF_TRIGGERED` action: 同様
- `prevActive.targetEventId !== payload.targetEventId` で stale check

### 2.3 selection route (`app/api/stargazer/alter/selection/route.ts`)
- `SelectionRequestBody.targetEventId: string` (必須)
- `validateBody` で `targetEventId` の存在チェック
- `prevActive.targetEventId !== targetEventId` で preflight reject
- `applyPlaceSelection({ events, targetEventId, candidate })` 呼び出し

### 2.4 client (hook)
- `selectPlaceCandidate(placeId)`: `requestTargetEventId = active.targetEventId`
- fetch body: `{ targetEventId, queryFingerprint, selectedPlaceId, ... }`

### 2.5 helper
- `applyPlaceSelection({ events, targetEventId, candidate })` — events 配列から event_id で findIndex
- `events[idx]` を update

### 2.6 analytics / trace
- `eventToShapeSnapshot(event)` — event 単位の trace
- `emitTurnTrace` の `dispatchSummary.modify_applied` 等は event 関連 metric

### 2.7 tests
- 既存 W3-PR-9 関連 test は全て event_id を fixture に持つ
- selection route test も `targetEventId` を含む body で test

### 2.8 既存 PR #62/#63 の sentinel (= minimal hack)
- `PLAN_ORIGIN_SENTINEL_EVENT_ID = "__plan_origin__"` (`gapResolver.ts`)
- `pendingClarify.event_id = sentinel` で「event ではない origin clarify」 を表現
- これは clarify/answerBinder の event_id 前提を破壊しないための **暫定対応**
- B-3 で `targetKind` 導入時、sentinel を **廃止** すべきか、**維持** して併存させるかを判断する必要あり

---

## 3. plan-level anchor target model の設計案

### 3.1 提案: `PresentationTarget` discriminated union

```ts
// lib/alter-morning/dialog/types.ts (B-3a で型予約のみ、実装は B-3b/c)
export type PresentationTarget =
  | { kind: "event_where"; eventId: string }
  | { kind: "journey_origin" }
  | { kind: "journey_end" };

export interface PresentationContext {
  /**
   * 候補提示の target。
   * - "event_where": 既存 (W3-PR-9) — event の where slot 解決
   * - "journey_origin": B-3 で追加 — plan-level origin の grounding
   * - "journey_end":    B-3 で追加 — plan-level end の grounding
   */
  target: PresentationTarget;
  queryFingerprint: string;
  candidates: ReadonlyArray<NormalizedPlaceCandidate>;
  presentedAtTurn: number;
}
```

### 3.2 fake event 禁止の構造的保証

NG パターン (= 後で必ず壊れる):
```ts
// ❌ 禁止: fake event を作って origin を event.where に偽装
const fakeOriginEvent: Event = {
  event_id: "__plan_origin__",
  where: { place_ref: "ホテル", ... },
  // when/what は dummy で埋める
};
```

これだと:
- analytics に fake event が混入
- plan rebuild が dummy event を真の event として扱う
- bind path / LLM comprehension で誤 dispatch
- 既存 invariants (event の when/what 必須) 破壊

正しい構造 (= type-level 区別):
```ts
// ✅ 正: target を discriminated union で区別
const target: PresentationTarget = { kind: "journey_origin" };
applyPlaceSelectionByTarget({ target, candidate, plan, events });
// target.kind === "journey_origin" → plan.journeyOrigin を更新、events 不変
// target.kind === "event_where" → events[idx].where を更新、plan 不変
```

### 3.3 `PLAN_ORIGIN_SENTINEL_EVENT_ID` の扱い

判断材料:
- 現状 (PR #62/#63): clarify/answerBinder/pendingClarify が event_id 前提なので、sentinel で minimal hack
- B-3 後: `targetKind` で plan-level anchor を構造的に区別できるようになる
- sentinel は **廃止候補**

判断:
- **B-3a (本 doc)**: 廃止可否を判定するだけ (= 実装変更なし)
- **B-3b/c**: targetKind を導入したら、sentinel を**廃止** して `target: { kind: "journey_origin" }` に置き換える
- ただし backward compat: 旧 session の `pendingClarify.event_id = "__plan_origin__"` を読み取る経路で互換性維持

詳細は B-3b/c で migration 設計。

---

## 4. label classification

GPT 指示の核: **「Places API に流していい label / 流してはいけない label」 を先に分類**。

### 4.1 4 分類

```ts
export type LabelClassification =
  | "public_poi_proper_noun"      // Places API で解決可能
  | "generic_category"            // anchor 必須、narrowStep paradigm
  | "private_semantic"            // Places API NG、saved places or label_only
  | "ambiguous_or_demonstrative"; // 文脈依存、再質問 or label_only
```

### 4.2 分類とハンドリング方針

| Classification | 例 | Places API | ハンドリング |
|----------------|----|-----------|------------|
| `public_poi_proper_noun` | 「東京駅」「サドヤ」「スタバ渋谷店」 | ✅ OK | 既存 W3-PR-9 flow で grounding |
| `generic_category` | 「ホテル」「カフェ」「コンビニ」 | ⚠️ anchor 必須 | narrowStep paradigm 流用 (= ユーザーに anchor を聞く) |
| `private_semantic` | 「自宅」「会社」「友達の家」 | ❌ **禁止** | (a) saved places (= `userHomeLat/Lng` 等) で解決 / (b) `known_label_only` 維持 |
| `ambiguous_or_demonstrative` | 「あそこ」「その辺」「いつもの」 | ❌ 流さない | clarify 再質問 or `known_label_only` 維持 |

### 4.3 判定ロジック案 (実装は B-3b)

```ts
// lib/alter-morning/search/labelClassification.ts (B-3b で導入予定、本 audit では型予約のみ)
export function classifyLabel(label: string): LabelClassification {
  const trimmed = label.trim();

  // private_semantic 判定 (CEO 指示で最重要、Places API NG)
  if (/^(自宅|うち|家|実家)$/.test(trimmed)) return "private_semantic";
  if (/(会社|職場|オフィス|学校|大学|事務所)$/.test(trimmed)) return "private_semantic";
  if (/(友達|彼|彼女|親|父|母|兄|姉)の(家|うち|ところ)/.test(trimmed)) return "private_semantic";

  // ambiguous 判定
  if (/^(あそこ|そこ|ここ|あの場所|その辺|あの辺|いつもの|どこか)/.test(trimmed)) {
    return "ambiguous_or_demonstrative";
  }

  // generic_category 判定 (= 検索可能だが anchor 必須)
  const GENERIC_CATEGORIES = [
    "ホテル", "カフェ", "コンビニ", "レストラン", "居酒屋", "公園", "ジム",
    "美容院", "病院", "クリニック", "スーパー", "ドラッグストア",
  ];
  if (GENERIC_CATEGORIES.includes(trimmed)) return "generic_category";

  // それ以外は public POI と推定 (= Places API で検証)
  return "public_poi_proper_noun";
}
```

### 4.4 private_semantic への対応

`私_semantic` は Places API 流さない。代わりに:

| Label | 解決方法 (B-3 後) |
|-------|------------------|
| 「自宅」 | `userHomeLat/Lng` (= profiles.baseline_home_lat/lng) で resolve |
| 「会社」 | 現状 user data なし → `known_label_only` 維持、travel 不生成 |
| 「友達の家」 | 同上、`known_label_only` 維持 |
| 「実家」 | 現状 user data なし → 同上 |

将来 (= 別 PR):
- `saved_places` table を追加 (= ユーザーが自分で「会社」 = "新宿..." と登録)
- B-3 では含めない

### 4.5 generic_category への対応

「ホテル」 単独だと Places API で「ホテル near me」 になり、無限の候補。
正しい flow:
1. `userOverrideOriginLabel = "ホテル"` で `journeyOrigin = known_label_only`
2. legacyAdapter / NarrowStep paradigm で **anchor を user に聞く** (= 「どこのホテル？」)
3. anchor (= 地域 or chain name) が揃ったら Places API
4. 既存 W3-PR-9 flow と統合

詳細は B-3b/c で設計。

---

## 5. known_label_only → known_exact への昇格条件

### 5.1 必要条件 (全て満たす必要)

1. **ユーザー選択があること** — `PlaceCandidatePicker` で placeId を選んだ
2. **coordinates があること** — `NormalizedPlaceCandidate.coordinates` が non-null
3. **target が journey_origin / journey_end** — `PresentationContext.target.kind`
4. **source / targetKind が trace できること** — debug log で「どの経路で grounding したか」

### 5.2 昇格 logic

```ts
// 概念的な疑似コード (= B-3c で実装)
function promoteAnchorToExact(input: {
  prev: JourneyAnchorState;  // kind: "known_label_only"
  candidate: NormalizedPlaceCandidate;
  target: PresentationTarget;
}): JourneyAnchorState {
  if (prev.kind !== "known_label_only") {
    // 既に known_exact なら何もしない
    return prev;
  }
  if (!candidate.coordinates) {
    // coords なし → 昇格不可、known_label_only 維持
    return prev;
  }
  return {
    kind: "known_exact",
    label: candidate.displayName,  // user 選択の正本
    lat: candidate.coordinates.lat,
    lng: candidate.coordinates.lng,
    source: prev.source,  // "user_override" 等を引き継ぐ (B-3d で derivedFrom 追加)
  };
}
```

### 5.3 B-3a で予約する設計

- `JourneyAnchorState.kind === "known_label_only"` の意味:
  - **B-2e' まで**: clarify 回答で label のみ得たが、coords 未解決
  - **B-3 後**: candidate 提示中 or grounding 失敗で known_label_only 維持
- 昇格は **B-3c** で実装 (= 本 audit では設計のみ)

---

## 6. candidate 0 件 / cancel path

### 6.1 0 件 (= zero_candidates)

既存 (event_where): `executePlacesHandoff` が 0 件返したら `lastFailedSearch` に記録、`conversationStatus = clarifying` に戻す。

journey_origin/end の場合 (= B-3 で実装する挙動):
- `journeyOrigin` を `known_label_only` のまま維持 (= label 保持)
- `lastFailedSearch` に target context を記録
- UI 表示: 「『ホテル』 では位置を特定できなかった」 のような hint
- travel segment **不生成** (= 既存 invariant、coords なしでは travel 出さない)
- 再質問 (origin clarify) 経路に戻すか判断:
  - **私の推奨**: 自動再質問しない (= ユーザーが label_only で plan を進めるか、自分で言い直すか選ぶ)
  - 過剰な質問アプリ化を防ぐ規律 (= B-2e の最後の砦規律と整合)

### 6.2 「どれでもない」 (= cancel)

既存 (event_where): reducer が `clarifying` に戻す、user 再入力を促す。

journey_origin/end の場合:
- `activePresentation` clear、`conversationStatus = clarifying` (event_where と対称)
- `journeyOrigin` を `known_label_only` 維持
- 再 clarify (= 「出発地を別の言葉で教えて？」) を出すかは debatable:
  - **私の推奨**: B-3 では再 clarify は出さず、ユーザー自由入力を待つ (= 過剰質問防止)
  - 失敗 path は B-3c で慎重に design

### 6.3 まとめ

| 状況 | 結果 |
|------|------|
| 候補 0 件 | `known_label_only` 維持、lastFailedSearch 記録、travel 不生成 |
| user cancel | `known_label_only` 維持、`clarifying` に戻す、自由入力待ち |
| user select | `known_exact + coordinates` に昇格、travel 生成 |

---

## 7. userOverrideOriginLabel との関係

### 7.1 PR #62/#63 で確立した経路

```
User: "出発地はどこ？"
  ↓
Alter: 「出発地はどこにする？」 (origin clarify)
  ↓
User: "ホテルから"
  ↓
bindOriginAnswer("ホテルから") → "ホテル"
  ↓
adaptPipelineToLegacy({ userOverrideOriginLabel: "ホテル" })
  ↓
journeyOrigin = { kind: "known_label_only", label: "ホテル", source: "user_override" }
```

### 7.2 B-3 で grounding を試すタイミング

3 オプション:

**Option A: 同 turn で grounding (= 即座に candidate 提示)**
- ユーザーが「ホテル」 と答えたら、すぐ「どのホテル？」 候補リスト表示
- pros: 1 turn で完結、UX 連続的
- cons: 同 turn で 2 questions (= 「出発地は？」 → 「ホテル」 → 「どのホテル？」)

**Option B: 次 turn で grounding (= journeyOrigin に label_only を一旦 plug、次 turn で確認)**
- ユーザーが「ホテル」 と答えたら、その turn は label_only で plan を進める
- 次 turn 以降、ユーザーが anchor (= 渋谷の) や chain (= ANA インターコンチネンタル) を追加で言ったら grounding 試行
- pros: 過剰な question 連発を防ぐ (= B-2e 規律と整合)
- cons: travel segment が遅れて生成、UX 待ち時間

**Option C: 失敗時 known_label_only 維持**
- A or B のどちらでも、Places API 失敗時は label_only 維持
- 再質問しない (= 質問アプリ化防止)

### 7.3 私の推奨

- **Option B (= 次 turn で grounding)** が CEO/GPT の「最後の砦」 「質問アプリ化させない」 規律と最も整合する
- 同 turn で「ホテル」 → 即「どのホテル？」 は質問の連発感がある
- **classification 別の使い分け**:
  - `public_poi_proper_noun`: Option A 可能 (= label が具体的なら即 grounding)
  - `generic_category`: Option B (= ユーザーが自然に anchor を追加するのを待つ)
  - `private_semantic`: grounding 試みず、label_only 維持
  - `ambiguous`: grounding 試みず、label_only 維持

### 7.4 B-3a で予約する設計

- B-3a (本 doc): 方針確定のみ
- B-3b: classification 実装 + Option A/B の 切り分け logic
- B-3c: known_exact 昇格 + travel 生成
- B-3d: derivedFrom (= 「ホテル → ANA インターコンチネンタル」 の選択経路を trace)

---

## 8. travel segment 生成までの成功条件

### 8.1 必要条件

travel segment が生成されるためには:

1. `journeyOrigin.kind === "known_exact"` AND `lat/lng` あり
2. `journeyEnd.kind === "known_exact"` (or `default_round_trip`) AND `lat/lng` あり
3. `dayConditions.mainTransport` が解決済み
4. `buildPlanAndSegmentsFromEvents` で travel segment 生成
5. 既存 invariants:
   - `transportV2` flag ON
   - `events` の連続性が確保されている

### 8.2 label_only の場合の挙動 (現状 = 既存 invariant)

- `journeyOrigin.kind === "known_label_only"` (= label のみ、coords なし)
- `buildPlanAndSegmentsFromEvents` は coords を要求するため travel **不生成**
- plan は event items のみ、travel item なし
- UI 表示: 「位置情報が必要」 hint or 沈黙

これは正しい挙動 (= "推測座標で travel を作らない" 規律)。

### 8.3 grounding 後の遷移

```
known_label_only ("ホテル", coords なし)
  ↓ B-3b: candidate 提示
  ↓ B-3c: user select → known_exact + coordinates
known_exact ("ANA インターコンチネンタル", lat/lng)
  ↓ buildPlanAndSegmentsFromEvents
travel segment 生成
```

### 8.4 B-3 全体の成功条件

```
✅ existing event.where regression PASS (= 既存 W3-PR-9 flow 不変)
✅ journey_origin target で候補提示 → selection → known_exact 昇格
✅ journey_end target で同上
✅ travel segment が grounding 後に生成される
✅ private_semantic / ambiguous は Places API に流れない
✅ candidate 0 件 / cancel で known_label_only 維持
✅ fake event を作らない
```

---

## 9. B-3 の分割案

GPT 指示の分割案を採用 (一本 PR は却下):

### 9.1 B-3a: audit + grounding contract (本 doc)
- **本 doc 起草** (= 実装変更なし)
- CEO/GPT review → 修正反映
- 実装承認後、最小 helper (= classifyLabel pure function) のみ追加可

### 9.2 B-3b: candidate presentation
- `PresentationTarget` discriminated union 導入
- `dialogReducer` の `SEARCH_CANDIDATE_SELECTED` 拡張
- `placesHandoffOrchestrator` で journey_origin/end target に対応
- 既存 `PlaceCandidatePicker` 流用 (= UI は変更なし、上層で target 切り替え)
- `userOverrideOriginLabel` から grounding を起動するきっかけを設計

### 9.3 B-3c: selection 後の known_exact 昇格
- `applyPlaceSelectionByTarget` (or new helper) を追加
- selection route で target.kind 別の dispatch
- `journeyOrigin` / `journeyEnd` 更新経路
- `events` 経路は既存 `applyPlaceSelection` 維持
- travel segment 生成確認

### 9.4 B-3d: derivedFrom / AnchorSource type-level 分離
- `JourneyAnchorState` に `derivedFrom?: { rawAnswer; targetKind; selectedAt }` 追加
- `AnchorSource` を `OriginSource | EndSource` discriminated union に分離
- `PLAN_ORIGIN_SENTINEL_EVENT_ID` 廃止 (= targetKind で代替)
- 既存型との backward compat 確認

### 9.5 各 PR のサイズ目安

| PR | 推定行数 | 影響範囲 |
|----|---------|---------|
| B-3a | 0 (本 doc のみ) → +200 (classifyLabel) | docs + 1 helper |
| B-3b | +600-900 | dialog/types, reducer, placesHandoff*, hook |
| B-3c | +400-600 | selection route, applyPlaceSelectionByTarget, legacyAdapter |
| B-3d | +300-500 | journey/anchorState type 分離 + sentinel 廃止 |

合計 ~1500-2000 行を 4 PR に分割 (= 1 PR 700 行未満を維持)。

---

## 10. 必須テスト案

### 10.1 既存 flow 不変 (regression)

- ✅ `event.where` Places flow が壊れない (= 全 W3-PR-9 test PASS)
- ✅ `applyPlaceSelection` で event 更新は不変
- ✅ DialogState reducer の event_where 経路は不変

### 10.2 新 flow (B-3 後)

- `journey_origin` target で候補表示できる
- `journey_end` target で候補表示できる
- selection 後に **正しい anchor だけ** 更新される (= journeyOrigin だけ、events は不変)
- selection 後に travel segment が生成される
- selection 後に `journeyOrigin.kind === "known_exact"` + coordinates あり

### 10.3 CEO 指示の規律保証

- **fake event を作らない**: test fixture が真の events のみであることを assert
- **private_semantic を雑に Places 検索しない**:
  - "自宅" / "会社" / "友達の家" を input に与えて Places API mock が呼ばれないことを確認
  - or `classifyLabel` で `private_semantic` 判定が一致する
- **ambiguous を雑に検索しない**: 同上

### 10.4 失敗 path

- candidate 0 件 → `known_label_only` 維持
- user cancel → `clarifying` に戻る、`known_label_only` 維持
- candidates の coordinates なし → 昇格しない (= known_label_only 維持)

### 10.5 backward compat

- `userOverrideOriginLabel` 不指定 (= 通常 turn) は既存 flow と完全一致
- `PLAN_ORIGIN_SENTINEL_EVENT_ID` を含む旧 session が破壊されない (B-3b 後)

---

## 11. CEO/GPT に確認したい論点

### 11.1 grounding を起動するきっかけ
- Option A (同 turn) / Option B (次 turn) / Option C (= classification 別) のどれを採用するか
- 私の推奨: **classification 別 (= public POI なら同 turn、generic なら次 turn、private_semantic は grounding しない)**

### 11.2 PLAN_ORIGIN_SENTINEL_EVENT_ID の廃止タイミング
- B-3b で targetKind 導入時に廃止? B-3d で type-level 分離時に廃止?
- backward compat (= 旧 session 読み取り) はどこまで配慮?
- 私の推奨: **B-3d で廃止、B-3b/c は併存 (= sentinel と targetKind 両方サポート)**

### 11.3 saved places (= "会社" 等の private_semantic の解決) の扱い
- B-3 内で対応? 別 PR で対応?
- 現状 `userHomeLat/Lng` のみ (= "自宅" だけ解決可能)
- 私の推奨: **B-3 では "自宅" のみ saved places として扱い、「会社」 「友達」 は将来 PR (= saved_places table 追加が必要)**

### 11.4 失敗 path の再質問
- 0 件時 / cancel 時に origin clarify を再 ask する?
- 私の推奨: **再 ask しない (= 質問アプリ化防止、B-2e 最後の砦規律と整合)**

### 11.5 同 turn で「ホテル」 → 即「どのホテル？」 の UX
- 質問の連発感を許容するか、次 turn に分けるか
- 私の推奨: **public POI proper noun (= 既に具体的) なら同 turn 可、generic_category (= 「ホテル」) は次 turn**

---

## 12. Out of scope (B-3 全体でも対応しない)

- ❌ saved places table の新規追加 (= "会社" 等 private_semantic の本格対応) → 別 PR、Stargazer 統合後
- ❌ user timezone / travel timezone / semantic date 解釈 → **B-4** (targetDate time-aware)
- ❌ multilingual label support (= 「Hotel」 「ホテル」 混在) → 将来
- ❌ 候補の AI ranking (= ユーザー嗜好で順序最適化) → 将来
- ❌ Place Search 以外の grounding (= map click、住所手入力) → 将来

---

## 13. 着地後の状態 (= B-3 全完了時点)

```
User: "明日12時に新宿でランチ、ホテルから出発"
  ↓ comprehension
Event: { where: "新宿" / coords resolved }
journeyOrigin candidate: "ホテル" (label_only)
  ↓ classify "ホテル" → generic_category
  ↓ user 自然発話で次 turn 補強: "渋谷の ANA インターコンチネンタル"
  ↓ Places handoff: target = journey_origin, anchor = "渋谷", chain = "ANA インターコンチネンタル"
  ↓ activePresentation = { target: { kind: "journey_origin" }, candidates: [...] }
  ↓ user select
journeyOrigin = known_exact: ANA インターコンチネンタル / lat/lng
  ↓ rebuild
travel segment: ANA インターコンチネンタル → 新宿 (= car/train) 生成
```

---

## Approval needed

CEO/GPT は以下を判断してください:
1. 本 audit doc が必要 10 項目を網羅しているか
2. 設計案 (`PresentationTarget`, `LabelClassification`) が妥当か
3. 11 章の私の推奨に同意するか / 別方針か
4. B-3a で `classifyLabel` pure helper まで実装するか / それも次 PR (B-3b) か
5. その他 missing point があるか

承認後、B-3a の最小実装 (= helper のみ) または B-3b 設計に進みます。
