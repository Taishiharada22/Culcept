# B-3b' Orchestrator Audit (= Wiring Phase Audit)

**Status**: ✅ Final (CEO/GPT 2026-05-03 確定、本 forward-fix PR で 12 章を判定反映済み)
**Date**: 2026-05-03 (initial draft) / 2026-05-03 (CEO/GPT 4 論点反映 final 化)
**Author**: Build Unit (Claude)
**Scope**: B-3b' — placesHandoffOrchestrator 拡張 + userOverrideOriginLabel wiring の audit。**実装変更ゼロ**。
**Forward-fix note**: PR #66 で本 doc を draft のまま merge してしまったため、本 PR で
12 章「論点」 → 「最終方針」 に書き換え + Q3 (flag 命名) を CEO 補正で修正。

**Predecessor**: B-3a (PR #64 audit doc) → B-3b foundation (PR #65 = classifier + types + reducer routing) → 本 doc

---

## Goal (B-3b' 全体)

B-3b で置いた infrastructure を **production flow に接続**し、`userOverrideOriginLabel` から
`journey_origin` candidate presentation を起動できるようにする。

```
userOverrideOriginLabel = "東京駅"
  ↓ classifyLabel → public_poi_proper_noun
  ↓ shouldGroundLabel = true
placesHandoffOrchestrator (= B-3b' で拡張)
  ↓ Places API call
activePresentation = { target: { kind: "journey_origin" }, candidates }
  ↓ PlaceCandidatePicker UI 表示 (= staging のみ、flag 制御)
  ↓ user click → ⚠️ B-3c 未実装 → blocked / not_implemented
```

**重要**: B-3b' では **selection 後の known_exact 昇格は実装しない** (= B-3c の責務)。
半壊 UX を作らないため、production global では candidate UI を **完全 skip** (feature flag OFF)。

---

## 1. 既存 placesHandoffOrchestrator の event_where 専用結合点

### 1.1 主要 file

| Module | 責務 |
|--------|------|
| `lib/alter-morning/search/placesHandoffOrchestrator.ts` (268 行) | gate / cache / API call / dispatch action 生成 |
| `lib/alter-morning/search/placesHandoff.ts` (312 行) | Places API client + fingerprint |
| `lib/alter-morning/search/placesHandoffCache.ts` | L1 cache (best-effort) |
| `app/api/stargazer/alter/route.ts` (line 549, 2700) | orchestrator caller |

### 1.2 event_where 結合点 (網羅)

#### A. gate logic (`orchestratePlacesHandoff` line 106-129)

```ts
// 全て event.where slot 専用前提
if (dialogState.conversationStatus !== "search_handoff_blocking") return skip;  // ①
if (!dialogState.focus) return skip;                                              // ②
if (dialogState.focus.slot !== "where") return skip;                              // ③
if (!dialogState.searchQueryDraft.readyForHandoff) return skip;                   // ④
```

**結合点**:
- ① `conversationStatus = search_handoff_blocking` (= where slot narrowing 専用 status)
- ② focus 必須 (= 特定 event を focus している)
- ③ `focus.slot === "where"` (= where slot 限定)
- ④ `searchQueryDraft.readyForHandoff` (= where slot 用の anchor + chain/category)

#### B. targetEventId 取得 (line 131)

```ts
const targetEventId = dialogState.focus.event_id;  // event 固有
```

#### C. activePresentation 作成 (= reducer dispatch、line 172-178)

```ts
nextDispatch: {
  type: "SEARCH_CANDIDATES_PRESENTED",
  targetEventId,        // event_where 専用前提
  queryFingerprint,
  candidates,
  // target field は PR #65 で optional 追加済 (未使用)
}
```

#### D. searchQueryDraft 依存 (line 197-200)

```ts
result = await handoffFn({
  draft: dialogState.searchQueryDraft,  // where slot 用 anchor/chain/category
  anchorCoords,
});
```

`SearchQueryDraft` は `{ anchorRegion, categoryToken, chainToken, readyForHandoff }`。
where slot の narrowStep paradigm 専用設計。

#### E. zero candidates path (`SEARCH_ZERO_CANDIDATES` action)

- `lastFailedSearch` に anchorRegion / chain / category を記録
- `conversationStatus = search_handoff_blocking → clarifying`
- where 用の rollback (= narrowStep 2→1)
- **journey_origin/end には不適合な遷移**

#### F. analytics / trace (`handoffAnalytics.ts`)

- `HandoffOrchestrationOutcome` に kind field
- `start-end ms` で計測
- Analytics payload に event_id を含む (現状)

### 1.3 caller (route.ts line 2700)

`route.ts` で `orchestratePlacesHandoff(input, deps)` を呼ぶ条件:
- `morningSession.dialogState.conversationStatus === "search_handoff_blocking"`
- ALTER_MORNING_FLAGS で gate
- `searchQueryDraft.readyForHandoff` 必須

---

## 2. journey_origin への拡張案

### 2.1 起動 trigger

**入口**: `userOverrideOriginLabel` 設定時 (= origin clarify 回答 後、PR #62/#63 経路)

```ts
// B-3b' で legacyAdapter or route.ts に追加する logic (概念)
if (input.userOverrideOriginLabel != null) {
  const classification = classifyLabel(input.userOverrideOriginLabel);
  if (shouldGroundLabel(classification)) {
    // public_poi_proper_noun のみ起動
    // orchestrator を journey_origin target で呼ぶ
  }
  // generic_category / private_semantic / ambiguous は何もしない
}
```

### 2.2 classification 別 trigger 規律 (CEO/GPT 確定)

| Classification | trigger | 理由 |
|----------------|---------|------|
| `public_poi_proper_noun` | ✅ 同 turn 起動 | Places API で確実に解決可能 |
| `generic_category` | ❌ 起動しない | anchor/chain 待ち、known_label_only 維持 |
| `private_semantic` | ❌ 起動しない | Places API NG (= 公開検索意味なし) |
| `ambiguous_or_demonstrative` | ❌ 起動しない | 文脈依存、解決不可能 |

**重要規律**: 「ホテル」 だけで即「どのホテル？」 と聞くのは禁止。

### 2.3 orchestrator 拡張案

#### Option A: 新関数追加 `orchestrateJourneyAnchorHandoff` (推奨)

別関数を追加し、event_where 経路と完全分離:

```ts
// lib/alter-morning/search/placesHandoffOrchestrator.ts
export async function orchestrateJourneyAnchorHandoff(input: {
  userId: string;
  dialogState: DialogState;
  turnIndex: number;
  target: { kind: "journey_origin" } | { kind: "journey_end" };
  anchorLabel: string;             // = userOverrideOriginLabel (= "東京駅")
  anchorCoords?: GeoCoordinates;
}): Promise<OrchestrationResult> {
  // gate (= event_where とは異なる):
  //   - feature flag ON (= journeyOriginGrounding)
  //   - classifyLabel(anchorLabel) === "public_poi_proper_noun"
  //   - dialogState は search_handoff_blocking 不要 (= journey 専用 path)
  //
  // Places API call:
  //   - SearchQueryDraft 不要、anchorLabel を直接 query に投入
  //   - 別の handoff function (= executeJourneyAnchorHandoff) で wrap
  //
  // dispatch:
  //   nextDispatch = SEARCH_CANDIDATES_PRESENTED
  //     target = { kind: "journey_origin" } | { kind: "journey_end" }
  //     targetEventId = sentinel (= "__plan_origin__")
  //     ...
}
```

**利点**:
- 既存 event_where 経路を完全 preserve (= regression リスク最小)
- journey 用 gate は単純 (= where slot narrowStep paradigm 不要)
- test 容易 (= 別 entry)

#### Option B: 既存 `orchestratePlacesHandoff` を分岐拡張

```ts
export async function orchestratePlacesHandoff(input: {
  userId: string;
  dialogState: DialogState;
  turnIndex: number;
  target?: PresentationTarget;       // ← 追加
  anchorLabel?: string;              // ← journey 用
  anchorCoords?: GeoCoordinates;
}) {
  if (input.target?.kind === "journey_origin" || input.target?.kind === "journey_end") {
    // journey 経路
  } else {
    // 既存 event_where 経路 (現状そのまま)
  }
}
```

**欠点**:
- 既存関数が肥大化
- 分岐網羅 test が複雑
- regression リスク高

### 2.4 私の推奨: **Option A**

理由:
- **scope discipline**: 既存 event_where 経路に手を入れない
- **test 容易**: 新 entry 関数の独立 test
- **失敗時の影響範囲が局所化**: orchestrate 失敗で event_where 経路に波及しない

---

## 3. PresentationTarget の使い方

### 3.1 fake event 禁止 (= B-3a / B-3b 規律)

NG パターン:
```ts
// ❌ 禁止: fake event を作って origin を event.where に偽装
const fakeOriginEvent: Event = {
  event_id: "__plan_origin__",
  where: { place_ref: "ホテル", ... },
};
```

正しい構造:
```ts
// ✅ 正: target を discriminated union で区別
const target: PresentationTarget = { kind: "journey_origin" };
nextDispatch = {
  type: "SEARCH_CANDIDATES_PRESENTED",
  targetEventId: PLAN_ORIGIN_SENTINEL_EVENT_ID,  // sentinel (= 既存 invariant 維持)
  target,                                          // ← B-3b で追加済
  queryFingerprint,
  candidates,
};
```

### 3.2 backward compat (= PR #65 で確立)

- 既存 event_where caller は `target` 未指定で旧挙動 preserve
- `getPresentationTarget(ctx)` helper が target なしでも `event_where` と推定

### 3.3 reducer の routing (PR #65 実装済)

`SEARCH_CANDIDATE_SELECTED` の stale check:
- 両方 target あり: kind 一致 + event_where なら eventId 一致を check
- 両方 undefined: legacy 経路として targetEventId のみで判定
- 片方だけ: mismatch reject (defensive、新旧 mix 防止)

---

## 4. selection gap safety (= GPT 核 規律)

### 4.1 問題: candidate UI 出すとユーザーがクリックする

candidate を表示すれば、ユーザーは自然に click する。
しかし B-3c (= selection 後の `known_exact` 昇格) が未実装なら、click しても何も起きない。
→ **半壊 UX**。

### 4.2 GPT/CEO 確定方針: feature flag OFF で merge + selection も blocked

**必須条件 (CEO 2026-05-03 補正)**:
- B-3b' では production global で candidate UI を **絶対出さない**
- staging で flag ON の時も、selection click を **明示的 reject** (= not_implemented)
- 「候補選んだように見えて journeyOrigin 不変」 という状態は禁止

### 4.3 実装方針 (= 半壊 UX 防止 logic)

#### 4.3.1 production: feature flag OFF
- `ALTER_MORNING_FLAGS.journeyOriginGrounding(userId)` で gate
- false なら orchestrator も呼ばない (= candidate UI 出ない、現状通り)

#### 4.3.2 staging: flag ON、ただし selection は blocked
**Option α**: UI で disabled (= `PlaceCandidatePicker` の click を完全無効化)
- props `disabledReason: "B-3c 未実装"` を追加
- click しても onSelect が呼ばれない
- visual feedback (= grayed out + tooltip)

**Option β**: Reducer で reject
- `SEARCH_CANDIDATE_SELECTED` action で `target.kind === "journey_origin" && !ALTER_MORNING_FLAGS.journeyAnchorPromotion(userId)` の時 reject
- 新 reject reason: `"not_implemented_journey_anchor_promotion"`
- selection route が 200 with accepted=false で返す

**私の推奨**: **Option α (UI で disabled)**
- 理由: ユーザーに click すらさせない方が UX 整合
- selection route まで届かない → server log にも余計なエラーが出ない

ただし α + β 両方 (= depth-defense) でも安全。

### 4.4 「半壊 UX」 の構造的不可能性 (= 設計レベル保証)

```
flag OFF (= production) → orchestrator 呼ばない → candidate UI 出ない → click 不可
flag ON (= staging) → candidate UI 出る → ただし click は α/β で blocked
```

両 path で「候補選んだ → journeyOrigin 不変」 状態は **構造的に発生しない**。

---

## 5. feature flag OFF merge 方針

### 5.1 flag 命名

既存 ALTER_MORNING_FLAGS pattern (= `dialogStateV2(userId)`, `placesSearch(userId)` 等) と整合:

```ts
// lib/alter-morning/dialog/flags.ts (B-3b' で追加)
export const ALTER_MORNING_FLAGS = {
  // ... 既存 flags
  /**
   * CEO/GPT 2026-05-03 PR B-3b' で導入。
   * journey_origin / journey_end target の placesHandoff を起動するかの flag。
   *
   * production: 必ず false (= candidate UI 出ない)
   * staging: env CSV / userId allowlist で true
   *
   * B-3c 完成時に削除予定 (= unconditional に有効化、= flag remove 専用 PR)。
   */
  journeyOriginGrounding: (userId?: string): boolean => {
    return envBool(
      "ALTER_MORNING_JOURNEY_ORIGIN_GROUNDING_ENABLED",
      false, // default: false (= production OFF)
    );
  },
};
```

### 5.2 環境変数

- `ALTER_MORNING_JOURNEY_ORIGIN_GROUNDING_ENABLED=true` (= staging のみ手動設定)
- production の Vercel env では設定しない (= default false)

### 5.3 merge 条件

- B-3b' merge 時、flag は **default false** (= production 影響ゼロ)
- staging で flag ON にして実機検証
- 検証 OK なら B-3c 着手
- B-3c 完成時、flag を **削除** (= unconditional に有効化、= 別 PR で flag clean-up)

### 5.4 既存 flag pattern の再利用

`ALTER_MORNING_FLAGS.placesSearch(userId)` の AND gate pattern:
> 本 flag が true でも `dialogStateV2(userId)` が false なら無効

`journeyOriginGrounding` も AND gate で守る:
- `dialogStateV2(userId)` true 必須
- `placesSearch(userId)` true 必須
- **AND** `journeyOriginGrounding(userId)` true

3 重 gate で「production に絶対出ない」 を担保。

---

## 6. flag ON staging でも selection 成功扱いにしない方針 (= CEO 補正)

### 6.1 半壊 UX を staging でも作らない

CEO 2026-05-03 補正:
> 「候補を選んだように見えるが journeyOrigin は known_label_only のまま」 という状態は避けてください。

### 6.2 実装層別の gate 設計

#### Layer 1: UI 表示 gate (= candidate を出すか)
- `ALTER_MORNING_FLAGS.journeyOriginGrounding(userId)` true 必須
- false → candidate UI ゼロ (= 既存挙動)

#### Layer 2: UI selection gate (= click を allow するか)
- candidate UI が出ていても、`target.kind === "journey_origin"` なら click 無効化
- `PlaceCandidatePicker` props に `disabledTargetKinds` 追加 (= 「これ以上選べない target 一覧」)
- staging で flag ON でも、Layer 2 で disabled の時は click 不可
- visual: グレーアウト + 「選択は B-3c で対応予定」 tooltip

#### Layer 3: selection route gate (= server reject)
- `target.kind === "journey_origin"` の selection request が来たら reject
- new reject reason: `not_implemented_journey_anchor_promotion`
- 200 with accepted=false (= 既存 reject pattern)

### 6.3 3 層 gate の意味

- Layer 1 (UI 表示): production 影響ゼロ
- Layer 2 (UI click): staging で UX 整合性確保
- Layer 3 (server): defensive (= UI bypass 攻撃 / 競合 race を server で reject)

### 6.4 B-3c でやること

- flag remove (= journeyOriginGrounding 削除)
- Layer 2 の disabledTargetKinds から journey_origin 削除
- Layer 3 の reject 削除 + `applyPlaceSelectionByTarget` で実際に journeyOrigin 更新

---

## 7. B-3b' 成功条件 (= journey_origin のみ、CEO 2026-05-03 確定)

```
✅ event_where 既存 flow 不変 (= 全 W3-PR-9 test PASS)
✅ journey_origin target で candidate presentation を作れる (staging)
✅ journey_end は本 PR scope 外 (= 別 PR、journeyEndGrounding 別 flag)
✅ feature flag OFF では production に表示されない
✅ flag ON staging でも selection click は blocked / not_implemented
✅ private_semantic は Places API に流れない (= classifier で reject)
✅ generic_category も Places API に流れない (= shouldGroundLabel false)
✅ ambiguous_or_demonstrative も流れない
✅ zero candidates では known_label_only を維持する
✅ selection 後の known_exact 昇格は B-3c に分離
✅ 「候補選んだ → journeyOrigin 不変」 状態が構造的に起きない (3 層 gate = Layer 1+2+3)
```

---

## 8. B-3b'-2 実装 PR scope

### 8.1 含まれるもの (= journey_origin のみ)

1. **新 flag 追加**: `journeyOriginGrounding(userId)` (= AND gate で 3 重防御、journey_origin 専用)
2. **`orchestrateJourneyAnchorHandoff` (新関数)** 追加:
   - gate: flag ON + classifyLabel public POI 確認
   - Places API call (= 既存 executePlacesHandoff の extension or 新関数)
   - dispatch: SEARCH_CANDIDATES_PRESENTED with target=journey_origin
   - target=journey_end は infrastructure として動く可能性があっても **gate で reject** (= journeyOriginGrounding は origin 専用)
3. **legacyAdapter / route.ts 統合**:
   - `userOverrideOriginLabel` 検出時に新 orchestrator を呼ぶ
   - flag OFF なら何もしない (= 完全 skip)
4. **PlaceCandidatePicker** 拡張:
   - `disabledTargetKinds: ReadonlyArray<PresentationTarget["kind"]>` props 追加
   - target.kind が含まれる場合は click 無効化
5. **selection route gate** (Layer 3):
   - `target.kind === "journey_origin"` で reject (`not_implemented_journey_anchor_promotion`)
6. **integration tests**:
   - flag OFF: orchestrator 呼ばれない
   - flag ON + public POI: presentation 作られる (journey_origin only)
   - flag ON + private_semantic: orchestrator 呼ばれない (classifier で skip)
   - flag ON + click: UI level で blocked (Layer 2)
   - flag ON + bypass: server level で reject (Layer 3)
7. **regression test**: 既存 event_where 経路完全 preserve

### 8.2 含まれないもの (= B-3c 以降 + journey_end は別 PR)

- ❌ **journey_end の grounding** (= 別 PR、`journeyEndGrounding` 別 flag)
- ❌ `applyPlaceSelectionByTarget` (= journeyOrigin/End を known_exact に昇格、B-3c)
- ❌ travel segment 生成 (B-3c)
- ❌ flag 削除 (B-3c の最終 commit で実施)
- ❌ derivedFrom field (= B-3d)
- ❌ AnchorSource type-level 分離 (= B-3d)
- ❌ sentinel 廃止 (= B-3d)

---

## 9. flag 命名と削除タイミング (CEO 2026-05-03 確定)

### 9.1 命名 — **origin 専用** (CEO 補正)

`ALTER_MORNING_FLAGS.journeyOriginGrounding(userId)`
- 既存 pattern (`dialogStateV2`, `placesSearch`, `transportV2`, `visualFlow`) と整合
- **`journey_origin` のみを制御する** (= `journey_end` は管理対象外)
- `journey_end` 対応時は `journeyEndGrounding` 別 flag を追加 or 安定後に統合検討

### 9.2 環境変数

`ALTER_MORNING_JOURNEY_ORIGIN_GROUNDING=true|false`
- 既存 pattern と命名整合
- default false (= production OFF)
- `_ENABLED` suffix を削除 (= 既存 flag 命名と一致、CEO 補正)

### 9.3 削除タイミング

**B-3c 最終 commit で削除**:
- `applyPlaceSelectionByTarget` 実装完了
- selection 経路で `journeyOrigin` known_exact 昇格動作確認
- travel segment 生成確認
- 全 staging 検証 PASS
- → flag を unconditional 化、`journeyOriginGrounding` 関数自体を削除

### 9.4 削除 commit の責務

- ALTER_MORNING_FLAGS から `journeyOriginGrounding` 削除
- 全 caller の `if (ALTER_MORNING_FLAGS.journeyOriginGrounding(userId))` 条件を unconditional に
- env var 削除指示 (= Vercel env からの削除は CEO 手動)
- 関連 test 更新

### 9.5 journey_end の扱い (= 別 PR 予定)

CEO 2026-05-03 確定:
- B-3b' / B-3c では journey_origin **のみ** 対応
- `journey_end` の grounding は **後続 PR** で対応:
  - 同じ infrastructure (orchestrateJourneyAnchorHandoff) を流用可
  - ただし `journeyEndGrounding` 別 flag で gate
  - or origin が production stable になってから統合検討
- 本 doc 内の「journey_end」 言及はあくまで **infrastructure として準備済み** という意味

---

## 10. staging 検証 plan

### 10.1 検証フェーズ

**Phase 1: B-3b' merge 後 (= candidate presentation 確認)**
- staging Vercel で `ALTER_MORNING_JOURNEY_ORIGIN_GROUNDING_ENABLED=true` 設定
- "東京駅から" 等の public POI label を入力
- candidate UI が表示されることを確認
- click すると **disabled**、または selection route が reject することを確認

**Phase 2: B-3b' merge 後 (= 規律保証確認)**
- "ホテル" (= generic_category) → candidate 出ない
- "自宅" (= private_semantic) → candidate 出ない、Places API も呼ばれない
- "あそこ" (= ambiguous) → candidate 出ない
- production global では一切出ない (= flag OFF default)

**Phase 3: B-3c 実装後 (= 完全動作確認)**
- click → known_exact 昇格 → travel segment 生成
- 全 staging 動作確認 OK → flag 削除 PR 着手

### 10.2 production rollout plan

1. B-3b' merge → production 出ない (= flag default OFF)
2. B-3c merge → flag 削除 → production 有効
3. canary monitoring (= production で実際に candidate 表示されたとき)
4. 問題があれば B-3c-rollback PR で flag を再復活

---

## 11. 必須テスト案

### 11.1 既存 flow 不変 (regression)

- ✅ `event.where` Places flow 完全 preserve (= 全 W3-PR-9 test PASS)
- ✅ orchestrator の event_where 経路は touch しない (= Option A 採用)

### 11.2 新 flow (B-3b' 後)

- `orchestrateJourneyAnchorHandoff` が public POI で candidate を返す
- private_semantic / generic / ambiguous で skip
- flag OFF で何も起動しない
- flag ON で正しく presentation を作る

### 11.3 半壊 UX 防止 (CEO/GPT 規律保証)

- flag OFF: candidate UI 表示されない (Layer 1 gate test)
- flag ON: candidate UI 表示されるが click 無効化 (Layer 2 gate test)
- flag ON + bypass click: server で reject (Layer 3 gate test)
- 「候補選んだ → journeyOrigin 不変」 状態は **絶対作れない** (= 3 層構造保証)

### 11.4 backward compat

- 既存 W3-PR-9 selection: 不変
- target 未指定 SELECTED action: legacy 経路で動く

---

## 12. 最終方針 (CEO/GPT 2026-05-03 確定)

### 12.1 orchestrator 拡張 — **Option A 採用**

CEO/GPT 確定方針:
> 新関数 `orchestrateJourneyAnchorHandoff` を追加。
> 既存 `orchestratePlacesHandoff` に `journey_origin` を雑に分岐追加しない。

理由:
- 既存 `orchestratePlacesHandoff` は `event_where` 前提が強く、雑に拡張すると
  既存 W3-PR-9 flow を壊すリスクが高い
- 新関数として完全分離することで test 容易、regression リスク最小

### 12.2 selection gate — **Layer 2 + Layer 3 両方必須**

CEO/GPT 確定方針:
> Layer 2 (UI disabled) + Layer 3 (server reject) **両方必須**。

理由:
- UI のみでは直接 POST を防げない (= 攻撃 / race condition)
- server のみでは「選べるように見える」 半壊 UX
- depth-defense として両方実装

### 12.3 flag 命名 — **origin 専用 flag で開始** (CEO 補正)

**注意: 私の元案 (= 単一 flag で origin/end 両方管理) は CEO により修正された。**

CEO/GPT 確定方針:
> origin 専用 flag で始める。
> `env: ALTER_MORNING_JOURNEY_ORIGIN_GROUNDING`
> `code: journeyOriginGrounding`
>
> この flag は **journey_origin のみ** を制御する。
> `journey_end` まで同じ flag で管理しない。
> end 対応時は `journeyEndGrounding` 別 flag を追加するか、
> 両方安定後に統合を検討。

理由:
- origin / end は機能規模が異なる (= origin の方が複雑)
- 同 flag で管理すると「origin 安定後 → end staging で問題発生」 時に rollback できない
- 段階的 rollout は「個別 flag → 統合検討」 の方が安全

### 12.4 staging 検証で半壊 UX を許容するか — **絶対 NG**

CEO 2026-05-03 確定:
> staging で flag ON でも、selection 後の `known_exact` 昇格が未実装なら
> 候補クリックを成功扱いにしない。
>
> B-3b' は candidate presentation の検証まで。
> selection click は B-3c 未実装として **blocked / not_implemented** 扱い。
>
> 「候補を選んだように見えるが journeyOrigin は known_label_only のまま」
> という状態は絶対作らない。

実装方針: 3 層 gate (= §6 で定義済) で構造的不可能性を保証。

---

## 13. Out of scope (B-3b' 全体でも対応しない)

- ❌ `applyPlaceSelectionByTarget` (= B-3c)
- ❌ travel segment 生成 (= B-3c)
- ❌ flag 削除 (= B-3c の最終 commit)
- ❌ `derivedFrom` (= B-3d)
- ❌ `AnchorSource` type-level 分離 (= B-3d)
- ❌ sentinel 廃止 (= B-3d)
- ❌ saved_places table (= 将来別 PR)

---

## Approval status (CEO/GPT 2026-05-03 確定)

✅ **B-3b' audit doc は CEO/GPT 確定方針を反映済み (= final)**

**Forward-fix history**:
- PR #66 で本 doc を draft のまま admin merge してしまった (= ミス)
- 本 forward-fix PR で 12 章 4 論点を CEO/GPT 判断反映 + final 化
- 並行: PR #67 (infra: vercel.json ignoreCommand) は別 scope で進行中

**CEO 確定 4 判断 (= 12 章 反映済)**:
- Q1: orchestrator 拡張 → **Option A 採用** (新関数 `orchestrateJourneyAnchorHandoff`)
- Q2: selection gate → **Layer 2 + Layer 3 両方必須**
- Q3: flag 命名 → **origin 専用 flag** (= `journeyOriginGrounding`、`journey_end` は別 flag)
- Q4: staging 半壊 UX → **絶対 NG** (= 3 層 gate で構造的不可能性)

**次のステップ**:
1. 本 forward-fix PR を merge → audit doc final 化
2. B-3b'-2 実装に着手 (= journey_origin のみ、journey_end は別 PR)

---

## 関連 file (= 本 doc 起草時に調査)

- `lib/alter-morning/search/placesHandoffOrchestrator.ts` (268 行)
- `lib/alter-morning/search/placesHandoff.ts` (312 行)
- `lib/alter-morning/dialog/flags.ts` (= ALTER_MORNING_FLAGS pattern)
- `lib/alter-morning/dialog/types.ts` (= PresentationTarget、PR #65 実装済)
- `lib/alter-morning/dialog/reducer.ts` (= SEARCH_*_PRESENTED/SELECTED handler、PR #65 拡張済)
- `app/api/stargazer/alter/route.ts` (= orchestrator caller line 2700)
- `components/alter-morning/PlaceCandidatePicker.tsx` (= UI 流用予定)
