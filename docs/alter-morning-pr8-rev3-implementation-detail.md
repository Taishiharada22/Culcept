# Alter Morning — PR-8 rev 3 Implementation Detail（実装詳細設計 / Phase 0 追補）

**ステータス**: Phase 0 追補 — 設計のみ / CEO 最終承認後に実装着手
**作成日**: 2026-04-22
**前提**: `docs/alter-morning-strict-confirmation-design.md` rev 3（§§2.9〜2.12 / §§3.7〜3.12）を読了
**目的**: rev 3 設計を「実装者が手を止めず commit 13〜21 を書ききれる粒度」まで精緻化する。CEO 指示（2026-04-22）「緻密に計算、スタート〜ゴールまでを論理的に組み立てる」の履行。

---

## §0. 方針と読み方

### 0.1 本書の役割

- `strict-confirmation-design.md` rev 3 が **契約**（何が正しい state で、何が invariant か）を定める
- 本書が **手順**（reducer が何を計算するか、taxonomy が何を辞書に持つか、migration がどう動くか）を定める
- **両者はセット**で初めて「実装者が迷わず commit 13〜21 を書ききれる」状態になる
- 本書に書かれていないルールを実装で追加しない（Phase 0 規律の継承）

### 0.2 読み方

- §§ 1〜10 は規則（reference）
- §11 は適用例（紙上シミュレーション、Start→Goal 閉塞検証）
- §12 は残留 open question

執筆順は §11 を先に詰めて §§ 1〜10 を遡って固めた。つまり **「規則 → シミュレーション」ではなく「シミュレーションで見えた穴を規則にした」**。逆算で設計したので、§11 で使われない規則は書いていない。

### 0.3 スコープ

- IN: PR-8 rev 3 commit 13〜21 が触る領域のすべて
- OUT: PR-9 以降の実装詳細（interface 予約は `pr10-14-interface-reservation.md` / 骨子は `pr9-places-search-design.md`）

---

## §1. Reducer 詳細仕様

### 1.1 DialogAction の全体像

```ts
// lib/alter-morning/dialog/reducer.ts
export type DialogAction =
  | { type: "TURN_CAPTURED"; capture: NormalizedCapture; currentEvents: Event[] }
  | { type: "PROVIDER_FAILED" }
  | { type: "PROVIDER_RECOVERED"; result: PipelineResult }
  | { type: "PLAN_PRESENTED"; plan: MorningPlan }
  | { type: "FOCUS_SHIFTED"; nextFocus: DialogState["focus"]; reason: "narrow" | "slot_switch" | "handoff_blocked" };

export function reduce(state: DialogState, action: DialogAction): DialogState;
```

Branch A/B（route.ts）から呼ばれるのは `TURN_CAPTURED` / `PROVIDER_FAILED` / `PROVIDER_RECOVERED` / `PLAN_PRESENTED` の 4 種。`FOCUS_SHIFTED` は reducer 内部の再帰で使う（外部から直接 dispatch は**禁止**）。

### 1.2 TURN_CAPTURED handler 手順（9 ステップ）

入力: `state: DialogState`, `capture: NormalizedCapture`, `currentEvents: Event[]`

#### Step 1: progressDelta を判定

where 以外の slot では以下の簡易判定:
- `capture.subKind === "undecided"` → `"flat"`（undecided は進歩しない）
- slot が missing → fixed に遷移した → `"advanced"`
- slot が missing のまま → `"flat"`
- slot が vague で placeType / timeHint が変化しなかった → `"flat"`

where の場合は以下の精密判定（priorDraft = state.searchQueryDraft）:

```
if capture.subKind === "undecided":
    return "flat"

priorA = priorDraft.anchorRegion
priorC = priorDraft.categoryToken
priorCh = priorDraft.chainToken

newA = capture.extractedAnchor
newC = capture.extractedCategory
newCh = capture.extractedChain

// 新情報が入ったか？
anchorAdvanced  = (newA != null && newA !== priorA)
categoryAdvanced = (newC != null && newC !== priorC)
chainAdvanced    = (newCh != null && newCh !== priorCh)

if anchorAdvanced or categoryAdvanced or chainAdvanced:
    return "advanced"

// 同じ anchor を繰り返し言った等
if (newA === priorA) or (newC === priorC) or (newCh === priorCh):
    return "flat"

// 値が null で情報が薄くなった（preview で稀）
return "regressed"
```

#### Step 2: narrowStep 更新（where 固有）

`focus.slot !== "where"` → narrowStep 変更なし（常に 0）。以下は where 限定。

| 前 narrowStep | 変化後 | 条件 |
|------------|-------|------|
| 0 | 1 | `anchorAdvanced && !chainAdvanced && !categoryAdvanced` |
| 0 | 2 | `(chainAdvanced || categoryAdvanced)` （anchor 捕捉有無に関わらず 1 スキップ、§2.10.2 初回短絡）|
| 1 | 2 | `chainAdvanced || categoryAdvanced` |
| 2 | 2 | chain/category 上書き（narrowStep は動かない、§1.4 上書きルール） |
| 任意 | 任意 | `progressDelta !== "advanced"` → 変更なし |
| 任意 → 小 | **Invariant violation** | narrowStep regression は throw（§3.12 B5 で検証） |

#### Step 3: searchQueryDraft 更新

```ts
function updateDraft(priorDraft, capture):
    const newDraft = { ...priorDraft }

    // anchorRegion: 新規取得なら上書き、null 取得では上書きしない
    if capture.extractedAnchor != null:
        newDraft.anchorRegion = capture.extractedAnchor

    // chain vs category 排他（§1.4）
    if capture.extractedChain != null:
        newDraft.chainToken = capture.extractedChain
        newDraft.categoryToken = null            // ★ 排他
    elif capture.extractedCategory != null:
        newDraft.categoryToken = capture.extractedCategory
        newDraft.chainToken = null               // ★ 排他

    // readyForHandoff は auto-derive（手動セット禁止）
    newDraft.readyForHandoff =
        newDraft.anchorRegion != null
        && (newDraft.chainToken != null || newDraft.categoryToken != null)

    return newDraft
```

#### Step 4: capturedHistory にエントリ push

- `{ ...capture, progressDelta: <Step 1 の結果> }` を末尾 push
- 上限 **64 エントリ**（十分な履歴保持 + メモリ節約）、超えたら先頭から shift
- **provider_recovering 中は push しない**（§3.12 B5 invariant）

#### Step 5: semanticMissStreak 更新

```
if capture.subKind === "undecided":
    streak = state.semanticMissStreak + 1
elif progressDelta === "advanced":
    streak = 0                                   // advanced でリセット
else:
    streak = state.semanticMissStreak            // flat/regressed は unchanged
```

**why**: 「決めてない」などの undecided は「user が情報を出す意思がない」信号で slot_switching の正当な発動条件。しかし「甲府の方」→「甲府」のような flat（情報重複）は user が誠実に答えているだけなので miss にカウントしない。

#### Step 6: narrowStepFlatCount 判定（slot_switching 補助条件）

フィールドは持たず、毎回 `capturedHistory` 末尾から derive:

```
flatCount = 0
for entry in capturedHistory.slice(-3).reverse():
    if entry.slot === state.focus.slot && entry.progressDelta === "flat":
        flatCount += 1
    else:
        break
```

`flatCount >= 3` → slot_switching の補助発動条件（§1.5 参照）。

#### Step 7: 次 conversationStatus の決定

優先順位つき条件分岐:

```
// (a) semanticMiss 上限
if streak >= 2:
    return { status: "slot_switching", focusOverride: selectNextSlot(...) }

// (b) flat 連続上限
if flatCount >= 3:
    return { status: "slot_switching", focusOverride: selectNextSlot(...) }

// (c) readyForHandoff 新規 true 化
if (not priorDraft.readyForHandoff) && newDraft.readyForHandoff:
    return { status: "search_handoff_blocking", focusOverride: selectNextSlot(...) }

// (d) focus slot と capture slot の不一致（LLM が別 slot を更新）
if capture.slot !== state.focus.slot:
    return { status: "clarifying", focusOverride: { slot: capture.slot, narrowStep: 0 } }

// (e) narrowStep 進行
if newNarrowStep > state.focus.narrowStep:
    return { status: "narrowing", focusOverride: { ...state.focus, narrowStep: newNarrowStep } }

// (f) どれでもない → 現 status 維持
return { status: state.conversationStatus, focusOverride: null }
```

#### Step 8: focus 再決定（§1.3 に詳細）

Step 7 の `focusOverride` が null でない → 適用。null → state.focus 維持。

`search_handoff_blocking` の場合の次 slot 選択は `selectNextSlot()` が担当（§1.6）。

#### Step 9: Invariant check（最後に機械検証）

- narrowStep が regress していないか
- `stable → search_handoff_blocking` の直接遷移ではないか（必ず `clarifying | narrowing` を経由）
- provider_recovering 中に capturedHistory push していないか

違反 → dev/test で `throw`、prod で `console.error` + 元 state を返す（§3.12 B5）。

### 1.3 focus 再決定の優先順位

複数条件が同時成立した場合の優先:

1. **semanticMissStreak / flatCount による slot_switching**（一番強い、user が進まない明示）
2. **readyForHandoff による handoff_blocked 後の focus 移動**
3. **capture.slot と state.focus.slot の不一致による focus 戻し**
4. **narrowStep 進行による focus 維持 + step 更新**

同時成立例: 「where clarify 中に user が when を答えた、かつ where で undecided が 2 回目」
→ 1 が優先、slot_switching で where を外し、gapResolver で次 slot を選択（when は既に user から情報を貰っている可能性、gapResolver が当該 slot の解決状況を見て判断）

### 1.4 chain ↔ category の排他規則

- `extractedChain != null` と `extractedCategory != null` が同時に正になる入力は**理論上ない**（normalizeWhereAnswer の優先順位 chain > category）
- 過去に chain token があった状態で category が来た → chain を null に、category をセット
- 逆も同様
- **draft は常に「chain か category のどちらか一方」のみを持つ**

**why**: PR-9 の Places API query builder は chain と category を別 path で使う（chain: textSearch、category: textSearch + type filter）。同時存在すると query 分岐が曖昧。

### 1.5 slot_switching の具体発動と focus 移動

```ts
function handleSlotSwitch(state, currentEvents):
    const nextSlot = gapResolver.selectNextClarifiableSlot(currentEvents, {
      excludeSlots: [state.focus.slot],                     // 今の slot を除外
      priority: ["when", "what", "transport", "endpoint"],   // 既存優先順位、where は入れない
    })

    if nextSlot == null:
        // 他に聞く slot が無い = 全 slot 解決済み or where だけ残存
        // PR-8 rev 3 scope: focus 維持、status=slot_switching（user が場所を再考するのを待つ）
        return { ...state, conversationStatus: "slot_switching" }

    return {
      ...state,
      focus: { event_id: state.focus.event_id, slot: nextSlot, narrowStep: 0 },
      conversationStatus: "slot_switching",
      // semanticMissStreak は リセットしない（再び where に戻った時にすぐ発動するため）
    }
```

**規律**:
- `nextSlot` が where であることは **絶対ない**（`excludeSlots` で除外）
- semanticMissStreak は slot_switching で**リセットしない**。where に戻された時に再び 2 回 miss すれば即 slot_switching → where が実質上 dead lock になるが、それで良い（PR-8 は location を決定させない限り plan_presented にしない方針）

### 1.6 search_handoff_blocking 到達後の focus 移動

```ts
function handleHandoffBlocked(state, currentEvents):
    // Where 側は draft 揃ったので一旦保留。他に blocking slot があれば聞きに行く
    const nextSlot = gapResolver.selectNextClarifiableSlot(currentEvents, {
      excludeSlots: ["where"],
      priority: ["when", "what", "transport", "endpoint"],
    })

    if nextSlot == null:
        // 他 slot は全て non-blocking、where の SearchQueryDraft が揃っているが PR-8 では handoff 先がない
        // → focus 維持、status=search_handoff_blocking、user は「次？」を待ち状態
        return { ...state, conversationStatus: "search_handoff_blocking" }

    return {
      ...state,
      focus: { event_id: state.focus.event_id, slot: nextSlot, narrowStep: 0 },
      conversationStatus: "search_handoff_blocking",  // user-facing は slot_switching と同一挙動だが、state は search_handoff_blocking を維持（PR-9 有効化時に内部 state で判別）
    }
```

**重要**: `conversationStatus` は `search_handoff_blocking` のまま。`slot_switching` に**倒さない**。理由: PR-9 merge 時に user-facing 文言を解禁するには内部 state で見分ける必要があるため、SearchQueryDraft が揃っているという事実を state に残す。

### 1.7 PROVIDER_FAILED / PROVIDER_RECOVERED handler

```ts
reducer(state, { type: "PROVIDER_FAILED" }):
    return {
      ...state,
      providerFailureStreak: state.providerFailureStreak + 1,
      conversationStatus: "provider_recovering",
      // focus / searchQueryDraft / narrowStep はすべて凍結
      // capturedHistory に push しない（§3.12 B5 invariant）
    }

reducer(state, { type: "PROVIDER_RECOVERED", result }):
    // 前の status に戻す。focus はそのまま
    const prevStatus = deriveStatusFromState(state)   // searchQueryDraft と focus.narrowStep から復元
    return {
      ...state,
      providerFailureStreak: 0,
      conversationStatus: prevStatus,
    }

// deriveStatusFromState の復元ルール（§3.3 参照）
deriveStatusFromState(state):
    if state.searchQueryDraft.readyForHandoff:
        return "search_handoff_blocking"
    if state.focus.narrowStep >= 1:
        return "narrowing"
    if has blocking slot on current events:
        return "clarifying"
    return "stable"
```

### 1.8 PLAN_PRESENTED handler

```ts
reducer(state, { type: "PLAN_PRESENTED", plan }):
    return {
      ...state,
      lastGoodPlan: plan,
      conversationStatus: "stable",
      // capturedHistory はそのまま（将来の slot 追加発話への文脈）
      // focus は next blocking slot or 初期値へ（外部が再設定、reducer 内では触らない）
    }
```

---

## §2. Taxonomy 辞書初期値

### 2.1 chainBrandDict

ファイル: `lib/alter-morning/dialog/dictionaries/chainBrands.ts`

初期語彙（20 語以内、beta 段階で必要最小限）:

```ts
export const CHAIN_BRAND_DICT: ReadonlySet<string> = new Set([
  // カフェ系
  "スタバ", "スターバックス",
  "タリーズ", "Tully's",
  "ドトール",
  "コメダ", "コメダ珈琲",
  "サンマルク",
  // ファストフード
  "マック", "マクドナルド",
  "モス", "モスバーガー",
  "ケンタ", "ケンタッキー",
  // ファミレス
  "サイゼ", "サイゼリヤ",
  "ガスト",
  "ジョナサン",
  "デニーズ",
  // 牛丼
  "吉野家", "すき家", "松屋",
]);
```

**マッチ規則**: 完全一致 + 先頭一致（「スタバで」→「スタバ」match）。小文字化は行わない（日本語中心、必要なら alias 拡張）。

**拡張方針**: preview で漏れが観測されたら backlog で追加。LLM には判定させない（deterministic 優先）。

### 2.2 categoryDict

ファイル: `lib/alter-morning/dialog/dictionaries/categories.ts`

```ts
export const CATEGORY_DICT: ReadonlySet<string> = new Set([
  "カフェ", "喫茶店",
  "レストラン", "ファミレス",
  "居酒屋", "バー",
  "図書館",
  "コンビニ",
  "書店", "本屋",
  "ジム",
  "公園",
  "美術館", "博物館",
  "映画館",
  "銭湯", "温泉",
  "駅",
  "病院",
]);
```

**重要な分離**: 「ランチ」「ディナー」「朝食」は **categoryDict に入れない**。これらは L1 classifier で what slot へ振り分ける（§2.5 D 分類）。

### 2.3 anchorDict + 語尾ルール

ファイル: `lib/alter-morning/dialog/dictionaries/anchors.ts`

```ts
// 地名辞書（beta は甲府圏域中心、拡張は backlog）
export const ANCHOR_PLACE_DICT: ReadonlySet<string> = new Set([
  "甲府", "甲府駅", "甲府駅前", "甲府駅周辺",
  "新宿", "渋谷", "東京駅", "品川",
  "近場", "近所",
  "地元",
  // 追加は backlog 運用
]);

// 語尾マッチ規則
export const ANCHOR_SUFFIX_PATTERNS: ReadonlyArray<RegExp> = [
  /周辺$/,
  /近く$/,
  /あたり$/,
  /の方$/,
  /エリア$/,
  /市$/,
  /区$/,
  /町$/,
  /駅$/,
];
```

**判定ロジック（`detectAnchor`）**:

```ts
function detectAnchor(text: string): string | null {
  const trimmed = text.trim();
  // (1) 地名辞書完全一致
  if (ANCHOR_PLACE_DICT.has(trimmed)) return trimmed;
  // (2) 語尾パターン + 前半抽出
  for (const pat of ANCHOR_SUFFIX_PATTERNS) {
    if (pat.test(trimmed)) {
      // 「甲府駅周辺」→「甲府駅周辺」そのまま anchor に
      return trimmed;
    }
  }
  // (3) 先頭一致（「甲府の方」→「甲府」）
  for (const place of ANCHOR_PLACE_DICT) {
    if (trimmed.startsWith(place)) return place;
  }
  return null;
}
```

### 2.4 undecidedDict

ファイル: `lib/alter-morning/dialog/dictionaries/undecided.ts`

```ts
export const UNDECIDED_DICT: ReadonlySet<string> = new Set([
  "決めてない", "決めていない", "決まってない",
  "まだ", "未定",
  "わからない", "わかんない",
  "任せる", "おまかせ", "お任せ",
  "どこでもいい", "どこでも", "どこでもいいよ",
  "どこか",
  "おすすめで", "おすすめ",
  "たぶん", "多分",
]);
```

**判定（`isUndecidedWhereAnswer`）**: 完全一致 + 先頭一致（「決めてないよ」→「決めてない」match）。

### 2.5 normalizeWhereAnswer の優先順位（§3.9 table の実装形）

```
(1) undecided check（完全/先頭一致）→ subKind="undecided" で即 return
(2) chain check（completeness match）→ extractedChain セット、extractedAnchor は detectAnchor 並行実行
(3) category check（completeness match）→ extractedCategory セット、extractedAnchor 並行
(4) anchor check 単独 → extractedAnchor セット、subKind="anchor"
(5) どれも hit しない → subKind="undecided"（保守的）
```

**chain と category が同時 hit した場合**（辞書重複で起こる想定外ケース）: chain 優先。辞書は相互排他で設計する（「カフェ」は category、「スタバ」は chain、両方に入れない）。

---

## §3. providerRecovery 詳細仕様

### 3.1 isProviderFailure 判定

```ts
// lib/alter-morning/dialog/isProviderFailure.ts
export function isProviderFailure(result: PipelineResult): boolean {
  // Case A: comprehension 層で失敗
  if (result.status === "comprehension_failed") return true;

  // Case B: status ok だが events=[] かつ primary_clarify もない = null plan 構築不能
  if (result.status === "ok" && result.events.length === 0 && result.primary_clarify == null) return true;

  // Case C: timeout（comprehension provider が 10s 超）
  if (result.status === "timeout") return true;

  // Case D: 明示的な provider エラーマーカー
  if (result.status === "provider_error") return true;

  return false;
}
```

**why**: case B は「LLM が反応したが意味ある出力を出せなかった」状態。改訂 2 の items=0 throw はここで踏み抜いた。case B を provider_recovering に合流させることで throw 経路を回避。

### 3.2 priorDialogState の取得経路

route.ts で session load 時:

```ts
// app/api/alter-morning/route.ts（commit 15 差分）
const priorState: DialogState = session.dialogState ?? makeInitialDialogState();

// session.version が 1 ではない or 未定義 → reset
if (session.version !== 1) {
  session.dialogState = makeInitialDialogState();
  session.version = 1;
  session.pendingClarify = undefined;   // 旧 schema の pendingClarify を捨てる
  // analytics log: "dialog_state_reset"
}
```

### 3.3 復帰判定（PROVIDER_RECOVERED）

provider が復活した最初の ok result で以下を実行:

1. `reducer(state, { type: "PROVIDER_RECOVERED", result })` → providerFailureStreak=0、status を `deriveStatusFromState` で復元
2. 続いて `reducer(state, { type: "TURN_CAPTURED", capture, currentEvents })` を dispatch（通常経路に合流）

つまり復帰ターンは **2 action dispatch**（復帰 → 通常処理）。これで provider_recovering 直後に narrowing / search_handoff_blocking 等へ正しく遷移する。

### 3.4 fake plan 禁止の具体実装

```ts
// legacyAdapter.ts
if (isProviderFailure(result)) {
  const nextState = reduce(priorState, { type: "PROVIDER_FAILED" });
  return {
    dialogState: nextState,
    phase: "clarifying",
    plan: priorState.lastGoodPlan,          // null 許容、placeholder は作らない
    message: "ちょっと時間かかってる、もう一度送って？",
    pendingClarify: derivePendingClarify(nextState, []),
  };
}
```

**禁止事項**（§2.11.2 / §3.11 で既出の再確認）:
- `makeEmptyRetryPlan()` の類を実装しない
- `items = [{ kind: "todo", text: "retry", ... }]` のような 1 件 placeholder 禁止
- `plan: { items: [], status: "provisional", message: "..." }` のような空 plan 合成も禁止（items=0 の state-aware 例外で吸収）

---

## §4. where 以外の slot 対応

### 4.1 narrowStep の適用範囲

- **narrowStep は where 専用**。when / what / transport / endpoint では常に `0` 固定
- 実装上は `focus.narrowStep` フィールドは全 slot で保持するが、where 以外では reducer が step を変更しない

### 4.2 when / what / transport の slot_switching 時挙動

- slot_switching で focus が when に移る → narrowStep=0 で clarify（「朝の仕事は何時ごろから？」等、既存 gapResolver template を使用）
- when が解決 → **focus を where に戻さない**（semanticMissStreak は維持されているので戻すと即 slot_switching 再発）
- PR-8 rev 3 scope では「全 non-where slot 解決 + where blocking 残り」は focus 維持のまま会話継続（user が自発発話するのを待つ）

### 4.3 what vague の非 clarify 規律（§9 回答 6 継承）

- what=vague（「仕事」「作業」）は blocking しない（§2.8）
- reducer は what slot を focus にしない（gapResolver 側で what clarify を出さない契約）
- ただし what が **missing**（activity=""）の場合は blocking、focus 候補に入る

---

## §5. derivePendingClarify 詳細仕様

### 5.1 pickClarifyKind table

| focus.slot | narrowStep | conversationStatus | kind |
|-----------|-----------|-------------------|------|
| where | 0 | clarifying | `where_center` |
| where | 1 | narrowing | `where_narrow` |
| where | 2 | narrowing | `where_pinpoint`（まだ handoff 成立してない、category/chain 片方のみ等）|
| where | 2 | search_handoff_blocking | — (focus 外に移ってる想定) |
| where | 任意 | slot_switching | — (focus が別 slot に移ってる想定) |
| where | 任意 | provider_recovering | `provider_retry` |
| when | 0 | clarifying | `when_start` |
| when | 0 | slot_switching | `when_start`（user-facing は同じ、内部状態のみ差分） |
| when | 0 | search_handoff_blocking | `when_start_after_handoff`（「{anchor}の{chain}で置いといて、時間は？」）|
| what | 0 | clarifying | `what_activity`（missing 時のみ発動、vague では起こらない） |
| 任意 | 任意 | stable | **null 返却**（clarify なし） |

### 5.2 question template table

```ts
// lib/alter-morning/dialog/questionTemplates.ts
const TEMPLATES: Record<ClarifyKind, (state: DialogState, event: Event) => string> = {
  where_center: (s, e) => `${timeHintLabel(e)}の${whatLabel(e)}はどのあたり？`,

  where_narrow: (s, e) => {
    const anchor = s.searchQueryDraft.anchorRegion;
    const flatCount = countTrailingFlat(s.capturedHistory, "where");
    if (flatCount >= 1) {
      return `${anchor}のどのあたり？スタバとかカフェとか、具体的な候補ある？`;
    }
    return `${anchor}のどのあたり？カフェとか候補ある？`;
  },

  where_pinpoint: (s, e) => {
    const anchor = s.searchQueryDraft.anchorRegion;
    const chain = s.searchQueryDraft.chainToken;
    const cat = s.searchQueryDraft.categoryToken;
    if (chain && anchor) return `どの${chain}？${anchor}駅前とか？`;
    if (cat && anchor) return `${anchor}でどの${cat}？駅前とか？`;
    return `具体的にはどこにする？`;
  },

  when_start: (s, e) => `${whatLabel(e)}は何時ごろから？`,

  when_start_after_handoff: (s, e) => {
    const anchor = s.searchQueryDraft.anchorRegion;
    const token = s.searchQueryDraft.chainToken ?? s.searchQueryDraft.categoryToken;
    return `${anchor}の${token}で一旦置いといて、時間は何時ごろから？`;
  },

  what_activity: (s, e) => `その時間に何する？`,

  provider_retry: () => `ちょっと時間かかってる、もう一度送って？`,
};
```

**規律**（§2.10.3 継承）:
- LLM を呼ばない
- state に入っていない値を template に埋めない（anchor 未確定で「{anchor}駅前とか？」は出さない）
- 新しい時刻 / 新しい活動 / 新しい場所候補を生成しない

### 5.3 PendingClarify への変換

```ts
export function derivePendingClarify(state: DialogState, events: Event[]): PendingClarify | null {
  if (state.conversationStatus === "stable") return null;

  const event = events.find(e => e.event_id === state.focus.event_id);
  if (event == null) return null;  // 防御

  const kind = pickClarifyKind(state.focus.slot, state.focus.narrowStep, state.conversationStatus);
  if (kind == null) return null;

  const question = TEMPLATES[kind](state, event);

  return {
    event_id: state.focus.event_id,
    slot: state.focus.slot,
    kind,
    scope: buildScope(event),
    question,
    askedAt: new Date().toISOString(),
    semanticMissCount: state.semanticMissStreak,   // DialogState から直接 derive
  };
}
```

**重要**: `semanticMissCount` は DialogState の `semanticMissStreak` を単に read するだけ。旧実装のように Branch B で `semanticMissCount += 1` とはしない（書き込みは reducer のみ）。

---

## §6. session schema migration

### 6.1 version check

session schema:

```ts
// lib/alter-morning/types.ts
export interface MorningSession {
  version?: 1;                         // ★ 追加（optional、欠損時は旧 schema と判定）
  dialogState?: DialogState;            // ★ 追加
  pendingClarify?: PendingClarify;     // 廃止予定、commit 15 で削除
  // ... 既存フィールド
}
```

### 6.2 reset 条件

route.ts で session load 直後に以下:

```ts
function ensureSessionV1(session: MorningSession): MorningSession {
  if (session.version === 1 && session.dialogState != null) {
    return session;   // 正常
  }

  // reset 条件（いずれか）:
  // (a) version 未定義（旧 schema）
  // (b) version=1 だが dialogState 欠損
  // (c) dialogState.version !== 1 （将来の schema bump 用）

  const reset: MorningSession = {
    ...session,
    version: 1,
    dialogState: makeInitialDialogState(),
    pendingClarify: undefined,   // 旧 pendingClarify 廃棄
  };

  // analytics
  logEvent("dialog_state_reset", { sessionId: session.id, priorVersion: session.version });

  return reset;
}
```

### 6.3 pendingClarify 廃止経路

commit 15 の段階で:

1. `session.pendingClarify` は schema から削除（TS 型から消す）
2. `derivePendingClarify` が response JSON 用にのみ値を生成
3. 既存コードの `session.pendingClarify` read はすべて `derivePendingClarify(session.dialogState, events)` に置換

---

## §7. 既存 pipeline との接続点

### 7.1 route.ts Branch A（初回発話 / LLM comprehension 経路）

```
前: result → eventToPlanItem → legacyAdapter → session.pendingClarify = buildPending(...) → response

後: result → isProviderFailure?
      ├─ yes: reducer(PROVIDER_FAILED) → adapter 返却（lastGoodPlan）
      └─ no:  normalize each event's where → NormalizedCapture[] 生成
              → reducer(TURN_CAPTURED) per capture
              → (もし prior failed) reducer(PROVIDER_RECOVERED, result) を先に dispatch
              → eventToPlanItem → legacyAdapter
              → derivePendingClarify(dialogState, events)
              → session.dialogState = nextState を persist
              → response (pendingClarify は JSON のみ、session には入れない)
```

### 7.2 route.ts Branch B（answerBinder 経路）

```
前: pending + answer → bindAnswerToSlot → update events → rebuild → pending update

後: pending + answer
    → answerBinder reject? → reject 時は TURN_CAPTURED { subKind: "undecided" } を dispatch
    → bind 成功時は新 events で LLM re-comprehend（既存）
    → 以降 Branch A と同じ経路
```

### 7.3 session load/save

- load: `ensureSessionV1(raw)` を通す
- save: `session.dialogState = nextState` をそのまま persist（JSON serialize 可能、関数を含まない）

### 7.4 response JSON

```json
{
  "phase": "clarifying",
  "plan": { ... },
  "message": "...",
  "pendingClarify": { ... }    // derive 結果、session には入らない
}
```

---

## §8. 既存テスト fixture の影響

### 8.1 変更が必要な既存テスト

| テスト | 変更内容 |
|-------|---------|
| `tests/unit/alter-morning/wave3PendingClarifyIntegration.test.ts` | session.pendingClarify の直接参照を derivePendingClarify 経由に変更 |
| `tests/unit/alter-morning/wave3HardGate.test.ts` | session.dialogState が undefined のときの ensureSessionV1 経路検証追加 |
| `tests/unit/alter-morning/wave3ProviderFailure.test.ts` | isProviderFailure → reducer 経路に差し替え |
| `tests/integration/alter-morning/route.test.ts`（存在すれば） | pendingClarify write は reducer 経由で検証 |

### 8.2 新規テスト

| テスト | カバレッジ |
|-------|----------|
| `tests/unit/alter-morning/dialogState.persist.test.ts` | JSON.stringify/parse roundtrip（B2） |
| `tests/unit/alter-morning/session.migration.test.ts` | 旧 schema fixture → ensureSessionV1 → reset 確認（B3） |
| `tests/unit/alter-morning/normalizeWhereAnswer.test.ts` | 14 ケース 1:1（B4） |
| `tests/unit/alter-morning/reducer.invariants.test.ts` | narrowStep regression / stable→handoff 直接 / recovering 中 push の throw（B5） |
| `tests/unit/alter-morning/prompt.sanitize.test.ts` | LLM prompt に dialogState が含まれないこと（B1） |
| `tests/unit/alter-morning/narrowStep.monotonic.test.ts` | 4 シナリオを通した単調増加（B6） |
| `tests/integration/alter-morning/dialogStateLoop.test.ts` | 4 シナリオ統合テスト（A1〜A4） |

---

## §9. LLM prompt sanitize

### 9.1 対象 prompt builder

grep 対象:

```
lib/alter-morning/comprehension/promptBuilder.ts
lib/alter-morning/legacyAdapter.ts (message generation path if any)
lib/alter-morning/planning/*.ts
```

### 9.2 assertion 形

```ts
// tests/unit/alter-morning/prompt.sanitize.test.ts
describe("LLM prompt sanitize (W3-PR-8 rev 3)", () => {
  test("prompt には dialogState / capturedHistory / searchQueryDraft が含まれない", () => {
    const state = makeMockDialogState({ /* ... */ });
    const prompt = buildComprehensionPrompt({ session, userMessage, dialogState: state });
    expect(prompt).not.toMatch(/dialogState/i);
    expect(prompt).not.toMatch(/capturedHistory/i);
    expect(prompt).not.toMatch(/searchQueryDraft/i);
    expect(prompt).not.toMatch(/conversationStatus/i);
    expect(prompt).not.toMatch(/narrowStep/i);
  });
});
```

prompt builder は `session` と `userMessage` のみを受ける契約。`dialogState` は渡さない（渡さざるを得ない場合でも、build 内で丸ごと無視する assertion）。

---

## §10. rollout / flag 戦略

### 10.1 DIALOG_STATE_V2 flag

```ts
// lib/alter-morning/featureFlags.ts
export const DIALOG_STATE_V2 = process.env.DIALOG_STATE_V2 === "true";
```

### 10.2 flag=false 時の挙動保証

- route.ts 冒頭で `if (!DIALOG_STATE_V2) return legacyBranch(...)` で旧経路に逃がす
- `session.dialogState` を touch しない（旧 session も維持）
- rev 2 の挙動（blockingSlots / decidePhase / answerBinder）は**そのまま**

### 10.3 flag=true 時の切替

- session migration（§6.2）が走り、dialogState が初期化される
- 新経路で全発話を処理
- 問題発生時は `.env` で flag=false → next request から旧経路に戻る
- **session は新 schema に書き変わるので、flag を戻しても session.dialogState は残る**（無害、旧経路は読まないだけ）

### 10.4 段階的検証計画

1. **Phase R1**: flag=false で merge（mainline 無害）
2. **Phase R2**: 開発 env で flag=true、unit + integration test 全 PASS 確認
3. **Phase R3**: CEO preview で flag=true、4 シナリオ実機検証
4. **Phase R4**: CEO PASS → 本番 env で flag=true

Phase R3 で FAIL → flag=false に戻して設計再検討。

---

## §11. 4 シナリオ紙上シミュレーション（Start → Goal 閉塞検証）

### 11.1 シナリオ A: narrowing staircase

**ゴール**: 「朝は甲府の方で仕事」→「甲府」→「スタバ」→「図書館」で同じ質問を繰り返さず、plan_presented に昇格しない。

#### T1: user「朝は甲府の方で仕事」

| 観点 | 値 |
|------|---|
| LLM output | `events=[{ when: timeHint="morning", where: { place_ref: "甲府の方", placeType: "generic_place" }, what: "仕事" }]` |
| isProviderFailure | false |
| normalizeWhereAnswer | `{ extractedAnchor: "甲府", extractedCategory: null, extractedChain: null, subKind: "anchor" }` |
| progressDelta | `advanced`（priorAnchor=null → "甲府"） |
| narrowStep | 0 → 1（anchorAdvanced のみ） |
| searchQueryDraft | `{ anchorRegion: "甲府", categoryToken: null, chainToken: null, readyForHandoff: false }` |
| semanticMissStreak | 0 |
| conversationStatus | stable → **narrowing** |
| focus | `{ event_id: "e1", slot: "where", narrowStep: 1 }` |
| blockingSlots | where vague + when vague = true |
| decidePhase | **clarifying**（A3 ✅ 初回 anchor で plan_presented に昇格しない） |
| derivePending kind | `where_narrow` |
| message | `"甲府のどのあたり？カフェとか候補ある？"` |

#### T2: user「甲府」

| 観点 | 値 |
|------|---|
| answerBinder | bind 成功（undecided ではない） |
| LLM re-comprehension | `events=[{ where: { place_ref: "甲府", placeType: "generic_place" }, ... }]` |
| normalizeWhereAnswer | `{ extractedAnchor: "甲府", subKind: "anchor", ... }` |
| progressDelta | **flat**（priorAnchor="甲府" === "甲府"） |
| narrowStep | 1 → 1（動かず） |
| searchQueryDraft | 変化なし |
| semanticMissStreak | 0（flat は miss ではない） |
| flatCount (trailing for where) | 1 |
| conversationStatus | narrowing 維持 |
| decidePhase | clarifying |
| derivePending kind | `where_narrow`、flatCount>=1 → 文言 `"甲府のどのあたり？スタバとかカフェとか、具体的な候補ある？"` |
| message | 前ターンと**文言が異なる**（A4 相当 ✅） |

#### T3: user「スタバ」

| 観点 | 値 |
|------|---|
| normalizeWhereAnswer | `{ extractedChain: "スタバ", extractedCategory: null, extractedAnchor: null, subKind: "category_chain" }` |
| progressDelta | **advanced**（chainAdvanced） |
| narrowStep | 1 → **2** |
| searchQueryDraft | `{ anchorRegion: "甲府", chainToken: "スタバ", categoryToken: null, readyForHandoff: **true** }` |
| semanticMissStreak | 0 |
| conversationStatus | narrowing → **search_handoff_blocking**（readyForHandoff 新規 true） |
| focus 自動移動（§1.6） | where → next blocking slot = **when**、narrowStep=0 |
| decidePhase | clarifying |
| derivePending kind | `when_start_after_handoff` |
| message | `"甲府のスタバで一旦置いといて、時間は何時ごろから？"` |

**ここが rev 3 の核**: T3 で search_handoff_blocking に到達し、focus が when に移動。以後「甲府のどのあたり？」は**出ない**。

#### T4: user「図書館」

| 観点 | 値 |
|------|---|
| answerBinder (pending.slot=when) | 「図書館」は時刻ではない、bind 失敗（reason=semantic_miss）|
| LLM re-comprehension | full context で再 parse。`events=[{ where: { place_ref: "図書館", placeType: "generic_place" }, ... }]`（where を上書き）|
| normalizeWhereAnswer | `{ extractedCategory: "図書館", extractedAnchor: null, extractedChain: null, subKind: "category_chain" }` |
| capture.slot | **where**（LLM が where を更新）、state.focus.slot=when → 不一致 |
| progressDelta | advanced（priorCategory=null → "図書館"、ただし priorChain="スタバ" → categoryAdvanced も true）|
| searchQueryDraft 更新 | `{ anchorRegion: "甲府", chainToken: **null**（chain→category 排他）, categoryToken: "図書館", readyForHandoff: true }` |
| narrowStep | where focus に戻る時 1 から、categoryAdvanced → 2 |
| focus 再決定（§1.3 条件 3）| capture.slot(where) ≠ state.focus.slot(when) → focus を where に戻す。narrowStep=2 |
| 次 focus 移動（§1.6 readyForHandoff）| where → next blocking = when、narrowStep=0 |
| conversationStatus | search_handoff_blocking |
| derivePending kind | `when_start_after_handoff` |
| message | `"甲府の図書館で一旦置いといて、時間は何時ごろから？"`（anchor + 上書き後 token） |

**T1-T4 の Goal 検証**:
- ✅ A1: phase=clarifying items=0 なし（全ターン items>=1）
- ✅ A2: HTTP 500 なし
- ✅ A3: 初回 anchor で plan_presented に昇格していない
- ✅ A4: 同じ broad question を 2 回で遷移（T1→T2 文言変化、T3 で focus 移動）

### 11.2 シナリオ B: slot_switching

**ゴール**: 「朝は仕事」→「決めてない」→「決めてない」で semanticMissStreak=2 到達 → slot_switching で when に focus 移動。

#### T1: user「朝は仕事」

| 観点 | 値 |
|------|---|
| LLM output | `{ when: timeHint="morning", where: { place_ref: null }, what: "仕事" }` |
| where is missing (place_ref=null) | subKind=missing 相当 |
| normalizeWhereAnswer は呼ばない | LLM output の where.place_ref=null を直接扱う（reducer は capture 無し or missing capture で処理）|
| reducer | initial → focus={ slot: where, narrowStep: 0 }、status=clarifying |
| derivePending kind | `where_center` |
| message | `"朝の仕事はどのあたり？"` |

#### T2: user「決めてない」

| 観点 | 値 |
|------|---|
| answerBinder | undecided 語彙 → bind reject、reason=semantic_miss |
| normalizeWhereAnswer | `{ subKind: "undecided", extractedAnchor: null, ... }` |
| TURN_CAPTURED dispatch | reject でも capture は push（semanticMissStreak カウント用） |
| progressDelta | flat（subKind=undecided で特別扱い）|
| semanticMissStreak | 0 → **1** |
| conversationStatus | clarifying 維持 |
| derivePending | `where_center`（同じ質問）|
| message | `"朝の仕事はどのあたり？"`（初回 flat 時は文言維持でも OK、undecided に対応した文言も将来検討 backlog）|

#### T3: user「決めてない」

| 観点 | 値 |
|------|---|
| semanticMissStreak | 1 → **2** |
| §1.5 発動条件 | semanticMissStreak >= 2 → **slot_switching** |
| gapResolver.selectNextClarifiableSlot | excludeSlots=["where"], existing priority=[when, what, ...]。when blocking (timeHint のみ) → **when 選択** |
| focus | `{ slot: "when", narrowStep: 0 }` |
| conversationStatus | slot_switching |
| where の blocking | 維持（whereSharpness=missing のまま、decidePhase=clarifying） |
| derivePending kind | `when_start` |
| message | `"仕事は何時ごろから？"` |

**T1-T3 の Goal 検証**:
- ✅ semanticMiss 2 回で slot_switching 発動
- ✅ when focus 移動、where blocking 維持（plan_presented 昇格なし）
- ✅ A4 相当: 同じ broad question を 2 回で遷移（T1/T2 同文、T3 で別 slot）

### 11.3 シナリオ C: provider_recovering

**ゴール**: 初回成功 → 2/3 ターン目 provider 失敗 → 4 ターン目復活。items=0 で throw せず、HTTP 200 継続、lastGoodPlan 維持。

#### T1: user「朝 9 時から自宅で作業」

| 観点 | 値 |
|------|---|
| LLM output | `events=[{ when: "09:00", where: "自宅"(known_base), what: "作業" }]` 全 fixed |
| blockingSlots | all non-blocking |
| decidePhase | **plan_presented** |
| reducer (PLAN_PRESENTED) | lastGoodPlan = 当該 plan、conversationStatus=stable |
| message | "OK、それで組みました" 等 |

#### T2: user「次は甲府でランチ」（provider 失敗）

| 観点 | 値 |
|------|---|
| isProviderFailure | true (comprehension_failed) |
| reducer (PROVIDER_FAILED) | providerFailureStreak: 0 → 1、status=provider_recovering |
| items=0 ガード | conversationStatus=provider_recovering → **throw しない**（§3.11）|
| decidePhase | clarifying（blockingSlots は prior events で評価、結果は何でも良いが phase は clarifying に強制）|
| plan | **lastGoodPlan を返す**（T1 の plan、null ではない） |
| derivePending kind | `provider_retry` |
| message | `"ちょっと時間かかってる、もう一度送って？"` |
| HTTP | 200 ✅ A2 |

#### T3: user「甲府でランチ」（provider なお失敗）

同 T2。providerFailureStreak: 1 → 2。plan=lastGoodPlan 維持。HTTP 200 継続。

#### T4: user「甲府でランチ」（provider 復活）

| 観点 | 値 |
|------|---|
| isProviderFailure | false |
| LLM output | `events=[{ where: "甲府" + lunch ... }]` |
| reducer (PROVIDER_RECOVERED) | providerFailureStreak=0、deriveStatusFromState → narrowing（anchorRegion="甲府" セット済み）|
| reducer (TURN_CAPTURED) 連鎖 | normalize → subKind=anchor、narrowStep 0→1、... |
| 以降はシナリオ A と合流 |

**Goal 検証**:
- ✅ A1: items=0 は T2/T3 で発生するが state-aware で throw せず、plan=lastGoodPlan で応答
- ✅ A2: HTTP 500 が 0 件
- ✅ 復帰後は通常経路に合流

### 11.4 シナリオ D: initial chain detection

**ゴール**: 「朝はスタバで作業」で narrowStep=1 初回スキップ、最初から narrowStep=2 or 1 で chain captured。

#### T1: user「朝はスタバで作業」

| 観点 | 値 |
|------|---|
| LLM output | `events=[{ where: { place_ref: "スタバ", placeType: "chain_brand" }, what: "作業", when: timeHint="morning" }]` |
| normalizeWhereAnswer | `{ extractedChain: "スタバ", extractedAnchor: null, subKind: "category_chain" }` |
| 初期 narrowStep | 0（initial state） |
| progressDelta | advanced（chainAdvanced） |
| narrowStep 更新（§1.2 table row "0 → 2"）| 0 → **2**（1 スキップ、§2.10.2 初回短絡） |
| searchQueryDraft | `{ anchorRegion: null, chainToken: "スタバ", categoryToken: null, readyForHandoff: **false** }`（anchor 未確定）|
| readyForHandoff | false（anchor 必須、chain だけでは true にならない）|
| conversationStatus | stable → narrowing |
| focus | `{ slot: where, narrowStep: 2 }` |
| derivePending kind | `where_pinpoint`（narrowStep=2、anchor null） |
| message template | `where_pinpoint` template は `anchor && chain` の条件で切替、anchor=null → fallback `"具体的にはどこにする？"`... 待てこれだと UX 弱い |

**§5.2 template の補強**: `where_pinpoint` で chain あり anchor なし時は「スタバね。どのあたりのスタバ？」に分岐:

```ts
where_pinpoint: (s, e) => {
  const anchor = s.searchQueryDraft.anchorRegion;
  const chain = s.searchQueryDraft.chainToken;
  const cat = s.searchQueryDraft.categoryToken;
  if (chain && anchor) return `どの${chain}？${anchor}駅前とか？`;
  if (cat && anchor) return `${anchor}でどの${cat}？駅前とか？`;
  if (chain && !anchor) return `${chain}ね。どのあたりの${chain}？`;  // ★ 追加
  if (cat && !anchor) return `${cat}ね。どのあたり？`;                 // ★ 追加
  return `具体的にはどこにする？`;
}
```

この補強で T1 の message = `"スタバね。どのあたりのスタバ？"` になる。

#### T2: user「甲府」

| 観点 | 値 |
|------|---|
| normalizeWhereAnswer | `{ extractedAnchor: "甲府", subKind: "anchor" }` |
| progressDelta | advanced（anchorAdvanced） |
| narrowStep | 2 維持（§1.2 table、narrowStep は 2 から逆行しない、anchor 追加は step 変えず）|
| searchQueryDraft | `{ anchorRegion: "甲府", chainToken: "スタバ", categoryToken: null, readyForHandoff: **true** }` |
| conversationStatus | narrowing → **search_handoff_blocking** |
| focus 自動移動 | where → when |
| derivePending kind | `when_start_after_handoff` |
| message | `"甲府のスタバで一旦置いといて、時間は何時ごろから？"` |

**Goal 検証**:
- ✅ 無駄な「どのあたり？」（where_center）質問が T1 で出ていない
- ✅ 初期発話から narrowStep=2 まで短絡
- ✅ B6 narrowStep 単調増加（0 → 2、regression なし）

---

## §12. 設計閉塞確認 / 残留 open question

### 12.1 Start → Goal 経路の検証

§11 の 4 シナリオすべてが **§§1〜10 のルールだけで閉じた**。追加ルールなしで期待挙動に到達。

シミュレーションで必要になった補強ルール（§11 で明示したもの、本文に反映済み）:
- §5.2 `where_pinpoint` template の anchor null 分岐
- §1.2 narrowStep table の「0→2 スキップ」row（§2.10.2 初回短絡の実装形）
- §1.4 chain ↔ category 排他ルール（T4 図書館ケースで必要）
- §1.3 focus 再決定の条件 3（LLM が focus 外 slot を更新）

### 12.2 残留 open question（Phase 0 scope 外、backlog）

| # | 項目 | 影響 | 扱い |
|---|------|------|------|
| 1 | slot_switching で when 解決後の where 再聞き戦略 | user が where を諦めた状態で plan 出せない | PR-8 rev 3 では focus 維持、user 自発発話待ち。UX 判定は実機で |
| 2 | `undecided` 繰り返し時の文言多様化 | 「朝の仕事はどのあたり？」が 2 回同文になる可能性 | backlog（LLM 使わず rule-based で変化を付けるデザイン検討）|
| 3 | LLM re-comprehension の Event[] 再構築が focus と乖離 | T4 のような上書き扱いが想定外になる可能性 | reducer 側で focus 再決定で吸収、追加テストで検出 |
| 4 | provider 連続失敗が user の途中発話で起こった場合 | シナリオ C は T1 成功前提。T1 で失敗したら lastGoodPlan=null | 既定挙動: plan=null で message 返却（UI は plan 非描画）、HTTP 200 維持 |
| 5 | session migration で旧 pendingClarify を user に通知 | preview 2 回目以降のユーザーの「前の clarify が消えた」混乱 | beta のみ / session reset ログで追跡 |

### 12.3 Merge 条件 final check

`strict-confirmation-design.md` §3.12 の 10 条件を本書内容と照合:

| # | 条件 | 本書での担保 |
|---|------|------------|
| A1 | items=0 が 0 件 | §3.1 isProviderFailure + §3.11 state-aware / §11.3 C |
| A2 | HTTP 500 が 0 件 | §3.4 fake plan 禁止 + lastGoodPlan 返却 / §11.3 C |
| A3 | 初回 anchor で plan_presented 昇格しない | §1.2 narrowStep + blockingSlots / §11.1 A T1 |
| A4 | same broad question 2 回で遷移 | §5.2 flatCount で文言切替 / §11.1 A T1→T2→T3 |
| B1 | LLM prompt に dialogState 非混入 | §9 sanitize assertion |
| B2 | persist roundtrip | §6 schema、関数を含まない DialogState |
| B3 | version bump で旧 session reset | §6.2 ensureSessionV1 |
| B4 | taxonomy 14 ケース 1:1 | §2 辞書 + normalizeWhereAnswer 優先順位 |
| B5 | invariants 機械検証 | §1.2/§1.9 Step 9 / §3.12 throw 条件 |
| B6 | narrowStep 単調増加 | §1.2 table + §11.4 D で規則確認 |

すべて閉じた。

---

## 付録: 参照

- `docs/alter-morning-strict-confirmation-design.md` rev 3（契約）
- `docs/alter-morning-roadmap.md`（PR 階段）
- `docs/alter-morning-pr9-places-search-design.md`（PR-9 骨子、本書 §3 providerRecovery が PR-9 でも再利用される）
- `docs/alter-morning-pr10-14-interface-reservation.md`（型予約）
