# Alter Morning — Strict Confirmation 設計書（PR-8 初稿）

**ステータス**: 改訂 2（CEO preview FAIL 反映 / dialog-control 修復）
**前提**: W3-PR-7 merge 済み（PR #15, commit 283cb2a4）。質問ループ基盤は完成、ただし未確定 slot が UI 上「確定風」に描画されている。
**対象**: PR-8（Strict Confirmation）。PR-9（Anchor-Based Search）着手前に固めるレイヤ。
**作成日**: 2026-04-22
**改訂 1（2026-04-22）**: CEO 指摘 3 点反映
  1. `whereSharpness=vague` を anchor / category_chain / undecided の 3 sub-kind に分離
  2. `confirmationState` は adapter で normalize、UI 側で `??` fallback 禁止
  3. `What vague` は「内容暫定」で暫定性を強く見せる表示に寄せる
**改訂 2（2026-04-22 CEO preview FAIL 反映）**: dialog-control 契約修復
  1. **anchor も blocking**（PR-9 search 未実装のため、anchor 単独で plan 昇格不可）
  2. **phase 昇格正本を `hasBlockingUnresolvedSlots` に移譲**（`primary_clarify == null` を正本にしない）
  3. **answerBinder 最小版**: undecided 語彙拒否 + 単一 event invariant + bind 後 sharpness 再評価（観測のみ）
  4. **items=0 二層化**: dev/test throw / prod safe degrade（偽 plan 合成禁止）
  5. **What vague は non-blocking**（CEO §9 回答 6 との整合）

---

## 0. 問題定義（why this PR）

W3-PR-7 CEO preview（2026-04-21）で観測された構造欠陥:

1. `pendingClarify` が立って質問ループ中でも、`MorningPlanCard` は provisional plan の全 item を **fixed 風** に描画する。
2. `item.text` は「HH:mm 場所 活動」の平文連結で、どの slot が未確定かが UI から復元できない。
3. `eventToPlanItem` が `where.place_ref` を無検査で文字列に流すため、「決めてない」「まだ」のような vague 応答すら場所として描画されうる。
4. `kind: "fixed" | "todo" | "travel"` は時間有無で分類されるのみ。場所/活動の未確定は UI に届かない。

**核**: 「plan は provisional なのに、UI では確定済みに見える」。

### 本 PR の単一原則

> **検索を足すことより先に、未確定を未確定のまま扱う。**

PR-8 は UI 層に「未確定の表現力」を通し、PR-9（Anchor-Based Search）が出す候補が「確定した場所」と混同されないための土台を作る。

---

## 1. スコープ / 非スコープ

### IN
- PlanItem 型に `confirmationState` と slot sharpness 3 本を追加
- `legacyAdapter.eventToPlanItem` で sharpness を貫通させる
- `MorningPlanCard` の表示ロジックを slot 分離に改修（暫定ラベル付与 / vague 場所非描画）
- PR-9 で使う **deterministic search gate** の仕様定義のみ（実装なし）

### OUT
- anchor-based search の実装（PR-9）
- Places API の候補取得、距離フィルタ（PR-9）
- LLM を使った場所推定、recommendation（W2-5 以降）
- `confirmed` plan の確定フロー変更（PR-7 の判定をそのまま流用）

---

## 2. 設計原則（CEO 2026-04-22 方針）

### 2.1 PR-8 / PR-9 順序

**PR-8 を先に出す**。PR-9 は依存を PR-8 に取る。理由:

- PR-9 を先に作ると、検索で出てきた候補が「確定した場所」として UI に混入する。
- PR-8 で「暫定/確定」の境界を先に引けば、PR-9 の候補は最初から暫定枠に入る。

### 2.2 PlanItem 設計方針

- `kind: "fixed" | "todo" | "travel"` は **そのまま残す**（UI rendering の分岐は既存のまま活かす）
- 新規フィールドを **追加** する:
  - `confirmationState: "confirmed" | "provisional" | "needs_answer"`
  - `whenSharpness: "fixed" | "vague" | "missing"`
  - `whereSharpness: "fixed" | "vague" | "missing"`
  - `whatSharpness:  "fixed" | "vague" | "missing"`
- sharpness は `eventSchema.ts` の既存 `compute{When,Where,What}Sharpness` から計算した結果を **adapter で閉じ込めず item に貫通させる**。
- Event schema には **永続フィールドを追加しない**（pure function として既存の設計方針を尊重）。

**なぜ「kind は残す」のか**:
- `kind="travel"` の軽量表示、`kind="todo"` の並べ替え等、既存 UI ロジックが依存している。
- confirmationState は「item が全体として確定しているか」の直交概念で、kind と重ねると分類が暴発する。

### 2.3 UI 表示原則

- **primary 文言は「暫定」**。`provisional` / `needs_answer` item には「暫定」チップを付ける。
- slot 単位の未確定ラベル: 「場所未確定」「時間未確定」「内容暫定」をテキスト内に埋めない。slot 表示枠を分けて、未確定時はラベルのみ出す。
- **`?` は文字列禁止、アイコンのみ**。`needs_answer` item に限定して使う（CEO 指示）。
- **`whereSharpness=vague` を一律に潰さない**。vague は以下の 3 sub-kind に分け、UI 表現を変える（§2.6 参照）:
  - `anchor` 型: 「甲府駅周辺」「近場」「〇〇市」— **文言を残す**
  - `category_chain` 型: 「スタバ」「カフェ」「図書館」— **文言は残すが暫定チップを併記**
  - `undecided` 型: 「決めてない」「まだ」「たぶん」— **文言を描画せず `[場所未確定]` ラベル**

### 2.4 fixed 判定原則（CEO 確認済み）

| slot | fixed に昇格する条件 |
|------|---------------------|
| When  | `startTime` が `HH:mm` マッチ（明示刻み） |
| Where | `placeType` が `exact_proper_noun` または `known_base`（発話内で一意同定可能） |
| What  | `activity` が `VAGUE_ACTIVITY_SET` に含まれず、具体的（「コーディング作業」○ / 「仕事」✗） |

既存 `eventSchema.ts` §SlotSharpness に準拠。PR-8 で新規判定を追加しない。

### 2.5 場所 3 分類（CEO 方針）

PR-9 が依存する分類を **PR-8 の型定義段階で** 書き込む:

| 分類 | 定義 | 例 | PR-8 sharpness | where vague sub-kind | PR-8 plan 昇格 | PR-9 検索 |
|------|-----|----|---------------|---------------------|---------------|----------|
| **A**: fixed OK | 発話内で一意同定できる固有名詞 / known_base | 「サドヤ」「自宅」「オフィス（= known_base）」 | fixed | — | **昇格可** | 不要 |
| **B**: anchor 使用可 | エリア指定 / 曖昧指定だが範囲を絞れる | 「甲府駅周辺」「〇〇市」「近場」「baseline」 | vague | **anchor** | **blocking（PR-8 単独では昇格しない）** | anchor hint として使う（候補は出さない、範囲として使う） |
| **C**: anchor 必須で検索対象 | カテゴリ or チェーン、周辺検索しないと特定不能 | 「マック」「スタバ」「カフェ」「図書館」「オフィス（固有名なし）」 | vague | **category_chain** | **blocking** | **PR-9 search gate の対象** |
| **D**: 場所ではない | 活動カテゴリ / 食事区分 | 「ランチ」「ディナー」「打ち合わせ」 | place_ref に入っていたら分類エラー → What へ | — | — | — |
| **undecided**: 未決意表明 | 文字列として場所の実体なし | 「決めてない」「まだ」「たぶん」「どこでもいい」 | vague | **undecided** | **blocking（clarify 必須）** | 非対象（まず clarify） |

**CEO 改訂 2 追記**: 当初案では B（anchor）を「位置情報として十分」と扱い plan 昇格を許す設計だったが、preview で「甲府駅周辺 / ランチ」が `confirmed` 風に描画される事故を確認。PR-9 の anchor search が未実装の段階で anchor を確定とみなすと「範囲を点と誤認する」嘘が出る。**PR-8 では B も blocking** とする。B が plan に昇格できるのは PR-9 で anchor search → 候補選択が入った後。

D は L1 comprehension / whereClassifier 側で既に分離されている想定。PR-8 で確認し、漏れがあれば classifier の保守項として backlog 化する。

**undecided 検出**（PR-8 で adapter 側に軽量 classifier を置く）:
- 完全一致 / 先頭一致で deterministic 判定（undecided 語彙集合）
- 語彙: `決めてない` / `まだ` / `未定` / `どこでもいい` / `どこでも` / `わからない` / `たぶん` / `どこか`（単独時のみ）
- LLM は呼ばない。初期は保守的に（誤爆より漏れを許容）、漏れは backlog で追加

### 2.6 where vague sub-kind（PR-8 で型に入れる）

`whereSharpness="vague"` だけでは UI 上で「文言を消すべきか残すべきか」を判断できない。vague を 3 sub-kind に分ける:

```ts
export type WhereVagueSubKind = "anchor" | "category_chain" | "undecided";

export interface WhereSharpnessDetail {
  sharpness: SlotSharpness;           // fixed / vague / missing
  vagueSubKind?: WhereVagueSubKind;   // vague の時のみ付与
}
```

- **anchor**: 文言そのものが位置情報を持つ。UI では文言を残す（「甲府駅周辺」と表示）
- **category_chain**: 文言はカテゴリ / チェーン。UI では文言を残しつつ暫定チップを併記
- **undecided**: 文言に場所の実体なし。UI では文言を消して `[場所未確定]` ラベル

判定は adapter 側の `classifyWhereVague(where: WhereSlot): WhereVagueSubKind` で行う:
1. `placeType === "generic_place"` かつ 語尾が `周辺` / `近く` / `エリア` / `市` / `区` → **anchor**
2. `placeType === "chain_brand"` → **category_chain**
3. `placeType === "generic_place"` で単語が category（カフェ / レストラン / 図書館 等）→ **category_chain**
4. 文字列が undecided 語彙集合に一致 → **undecided**
5. それ以外（LLM が拾ったが意味不明） → **undecided** として保守的に倒す

### 2.7 検索発火ゲート（deterministic only）

PR-9 の search は **LLM 判断で発火しない**。PR-8 で書き込むゲート仕様:

```
shouldFireAnchorSearch(item, session) =
  item.whereSharpness === "vague"
  && item.whereVagueSubKind === "category_chain"    // C 分類のみ
  && anchorHint(item, session) != null
  && !alreadyResolved(item)
```

- `anchor` sub-kind は検索対象ではない（それ自体が位置情報 = B 分類）
- `undecided` sub-kind は検索前に clarify が必要
- `anchorHint`: その item の近傍に fixed 場所がある / session に baseline がある / 直前 item の場所が fixed
- LLM / session 状態に依存する「気持ち」での発火は禁止

### 2.8 blocking 定義 + phase 昇格の正本（CEO 改訂 2 / 2026-04-22）

**問題**: 改訂 1 までの設計は「`primary_clarify == null` なら plan 昇格」という暗黙契約で動いていた。preview FAIL の原因はここ。adapter が clarify を立て忘れた瞬間、未確定 slot を含む item が `confirmed` として出力される。phase 昇格の判断を「clarify の有無」ではなく **「未解決 slot の有無」** に据え直す。

#### 2.8.1 blocking の定義（slot × sharpness × sub-kind）

| slot | fixed | vague | missing |
|------|-------|-------|---------|
| **When** | non-blocking | **blocking** | **blocking** |
| **Where** | non-blocking | **blocking**（sub-kind 全て: anchor / category_chain / undecided） | **blocking** |
| **What** | non-blocking | non-blocking（PR-8 scope、§9 回答 6 に準拠） | **blocking** |

- **When vague は blocking**: `timeHint` のみで `startTime` が HH:mm にならない状態（「朝」「昼」）は点に落ちていないため plan 昇格不可。
- **Where vague は sub-kind に関わらず blocking**: PR-8 では anchor / category_chain / undecided すべて plan 昇格対象外（§2.5 改訂 2 注と整合）。
- **What vague は non-blocking**: 「仕事」「作業」等は plan 昇格を妨げない（表示強化のみで対応、§9 回答 6）。What の clarify 追加議論は PR-7 の gapResolver 優先度見直し後に回す。
- **What missing は blocking**: activity が空文字列 / null は plan として成立しない。

event 単位の `blockingForEvent(event)`、plan 単位の `hasBlockingUnresolvedSlots(events)` を `lib/alter-morning/planning/blockingSlots.ts` に置く（commit 8 で実装済み）。

#### 2.8.2 phase 昇格の正本契約

`legacyAdapter.decidePhase()` の新契約（commit 9 で実装済み）:

```ts
function decidePhase(
  result: PipelineResult,
  effectiveEvents: Event[],
): "clarifying" | "plan_presented" {
  // 1. status 異常は無条件 clarifying
  if (result.status !== "ok") return "clarifying";

  // 2. ★ 正本: 未解決 blocking slot があれば必ず clarifying
  if (hasBlockingUnresolvedSlots(effectiveEvents)) return "clarifying";

  // 3. 二次防御: primary_clarify が立っていれば clarifying
  //    （正本ではない。1 と 2 を通過したのに clarify が立つケースは異常信号）
  if (result.primary_clarify != null) return "clarifying";

  // 4. それ以外 → plan_presented
  return "plan_presented";
}
```

**なぜ `primary_clarify == null` を正本にしないか**:
- clarify を立てる責任を L2/L3/gapResolver に分散させると「誰かが立てるはず」の責任境界崩壊が起きる
- 改訂 1 の preview FAIL は、gapResolver が clarify を立て忘れた状態で L3 が plan_presented に昇格させた事故
- slot の未解決有無は Event から決定的に計算できる（`compute*Sharpness`）。clarify の有無より信頼できる
- `primary_clarify != null` は二次防御としてだけ残す（slot は全て fixed だが clarify が立っている、という矛盾状態を catch するため）

#### 2.8.3 `items=0` の扱い（二層化）

改訂 1 では言及なし。dialog-control 契約で defensive fallback を禁止する代わりに、開発時の事故検知を強化する:

| 環境 | items=0 に遭遇した時の挙動 |
|------|--------------------------|
| `NODE_ENV === "development"` | `throw new Error("items=0 contract violation")` |
| `NODE_ENV === "test"` | `throw`（同上、CI で検知） |
| prod | `console.error` + phase=clarifying への safe degrade（**偽 plan 合成は禁止**） |

- prod で throw すると UX が死ぬ。safe degrade で会話を継続させるが、**placeholder plan 合成（空の item を 1 個作る等）は禁止**。「今の発話からは plan を組み立てられませんでした」という clarify に倒す。
- dev / test で throw することで adapter / comprehension pipeline の契約違反を早期に発見する。

---

## 3. 型変更方針

### 3.1 PlanItem の拡張（`lib/alter-morning/types.ts`）

```ts
export type ConfirmationState = "confirmed" | "provisional" | "needs_answer";
export type WhereVagueSubKind = "anchor" | "category_chain" | "undecided";

export interface PlanItem {
  // ── 既存フィールド（変更なし）──
  id: string;
  kind: PlanItemKind;
  text: string;
  what: string | null;
  startTime?: string;
  durationMin: number;
  fixedStart: boolean;
  // ... 以下略

  // ── 追加（PR-8）──
  /**
   * item 全体の確定度（plan.status と独立して item 単位でも保持）。
   *   - confirmed:    全 slot sharpness="fixed"、pendingClarify 対象外
   *   - needs_answer: pendingClarify.event_id === this.id
   *   - provisional:  それ以外で何らかの slot が vague 以下
   *
   * 型上は optional だが、adapter を通過した item には **必ず値が入る**（§3.4 参照）。
   */
  confirmationState?: ConfirmationState;

  /** 各 slot の sharpness（eventSchema.compute*Sharpness の計算結果をそのまま貫通） */
  whenSharpness?: SlotSharpness;
  whereSharpness?: SlotSharpness;
  whatSharpness?: SlotSharpness;

  /** whereSharpness="vague" 時のみ付与。anchor / category_chain / undecided */
  whereVagueSubKind?: WhereVagueSubKind;
}
```

**なぜ optional か**: 旧セッション / test fixture が大量に存在するための型互換。
**UI 側の運用**: adapter 通過後は required 相当。UI では `??` fallback を**禁止**し、`item.confirmationState!` のように non-null assertion か、**normalize 済み型** を噛ませる（§3.4）。

### 3.2 Event schema は変更しない

`SlotSharpness` 型と `compute*Sharpness` 関数はすでに存在。adapter でこれを呼んで PlanItem に写すだけ。schema 側は pure function の設計をそのまま維持する（既存方針の尊重）。

### 3.4 adapter 境界での normalize（CEO 指摘 2）

**UI 側の `??` fallback 禁止** を貫くため、adapter 出力には normalize 済み型を噛ませる:

```ts
// lib/alter-morning/normalizedPlanItem.ts (new, PR-8)

/**
 * PlanItem を UI 側で strict に扱うための狭められた型。
 * すべての PR-8 追加フィールドが required。adapter 通過後の PlanItem を
 * 一度ここを通してから UI に渡す。UI は NormalizedPlanItem のみを参照する。
 */
export interface NormalizedPlanItem extends PlanItem {
  confirmationState: ConfirmationState;
  whenSharpness: SlotSharpness;
  whereSharpness: SlotSharpness;
  whatSharpness: SlotSharpness;
  whereVagueSubKind: WhereVagueSubKind | null; // vague 時のみ値、それ以外 null
}

export function normalizePlanItem(item: PlanItem): NormalizedPlanItem {
  return {
    ...item,
    confirmationState: item.confirmationState ?? "provisional",
    whenSharpness: item.whenSharpness ?? "missing",
    whereSharpness: item.whereSharpness ?? "missing",
    whatSharpness: item.whatSharpness ?? "missing",
    whereVagueSubKind:
      item.whereSharpness === "vague"
        ? (item.whereVagueSubKind ?? "undecided")  // vague なのに sub-kind 無し → 最も保守的に undecided
        : null,
  };
}
```

**運用規則**:
- `adaptPipelineToLegacy` の戻り値直前で全 item を `normalizePlanItem` 通す
- `MorningPlanCard` は `NormalizedPlanItem[]` を受ける
- UI コード内で `confirmationState ?? "confirmed"` のような defensive fallback は禁止
- 旧 session 由来の item（sharpness 未セット）が来た場合は normalize で `missing` 扱い → UI 側で provisional として安全側に倒れる

### 3.5 MorningPlan.status との関係

`plan.status`（confirmed / needs_answer / provisional）は plan 全体の確定度。`item.confirmationState` は item 単位。**両方保持**する:

- UI は「plan 全体の暫定感」（ヘッダ帯 / スタンプ）と「どの item / slot が未確定か」（行単位の表現）を別々に描く。
- 計算規則（adapter で実装）:
  - 全 item `confirmationState="confirmed"` かつ `plan.status="confirmed"` → plan header は確定表示
  - 1 つでも `needs_answer` → plan header は質問中
  - else → provisional

### 3.6 answerBinder における captured vs resolved（CEO 改訂 2 / 2026-04-22）

#### 3.6.1 問題

改訂 1 までの `bindAnswerToSlot` は「ユーザー回答 = slot 解決」と扱っていた。preview FAIL で「朝の仕事はどのあたり？」→「決めてない」が bind 成功 → `place_ref="決めてない"` として plan 昇格する事故を確認。**回答が入力されたこと（captured）と、slot が点に落ちたこと（resolved）は別概念**。

#### 3.6.2 PR-8 最小版（commit 10 で実装済み）

完全な型分離（`CapturedAnswer` と `ResolvedSlotValue` を分ける）は影響範囲が大きいため、PR-8 では **最小版** で止める:

1. **undecided 語彙拒否** (`isUndecidedWhereAnswer`):
   - Where slot への回答が「決めてない / まだ / 未定 / わからない / どこでもいい / 任せる / おすすめで / たぶん」等の undecided 語彙に一致 → `bound: false`, `reason: "semantic_miss"`
   - 完全一致 + 先頭一致（「どこでもいいよ」「任せるよ」等）で判定
   - LLM は呼ばない（deterministic）

2. **単一 event invariant**:
   - `bindAnswerToSlot` の返り値で「変更された event の index が 0 個または 2 個以上」の場合は invariant 違反として dev/test で throw、prod で `console.error`
   - pendingClarify が指す event_id の 1 件だけが更新される契約を機械的に保証

3. **bind 後 sharpness 再評価（観測のみ）**:
   - bind 成功後に `computeWhereSharpness` を呼び直し、まだ `vague` のままなら「captured ≠ resolved」として `console.warn` + analytics ログ
   - PR-8 ではログのみ。PR-9 で anchor search と連動させる時にこの信号を正式に使う

#### 3.6.3 次 PR で検討する完全版

以下は PR-8 scope 外。次 PR 以降の議題として予約:

- `CapturedAnswer<S>` / `ResolvedSlotValue<S>` の型レベル分離
- `placeResolver` の 2 段階化: captured → classify → (resolved | still_provisional)
- `confirmationState` と連動した bind 結果の区別（bind で confirmed に昇格できる条件 vs provisional のまま捕捉される条件）
- 「3 回 semantic_miss で別 slot に逃げる」対話制御（`semanticMissCount` は既に PendingClarify に載っているので PR-8 で観測基盤だけ入れた）

---

## 4. 既存参照箇所の影響範囲

### 4.1 grep 結果に基づく既知参照（PR-8 で触るレイヤ）

| ファイル | 変更内容 |
|---------|---------|
| `lib/alter-morning/types.ts` | `ConfirmationState` 型定義 / `PlanItem` 拡張 |
| `lib/alter-morning/legacyAdapter.ts` | `eventToPlanItem` で sharpness 貫通 + `confirmationState` 計算 + `decidePhase` 新契約（改訂 2） |
| `lib/alter-morning/planning/blockingSlots.ts` | **新規（改訂 2）**: `blockingForEvent` / `hasBlockingUnresolvedSlots`（phase 昇格正本） |
| `lib/alter-morning/planning/whereClassifier.ts` | vague 時の provisional fallback を凍結（PR-9 search まで昇格禁止） |
| `lib/alter-morning/comprehension/answerBinder.ts` | **改訂 2**: undecided 拒否 + 単一 event invariant + bind 後 sharpness 再評価 |
| `components/home/morning/MorningPlanCard.tsx` | slot 分離描画 / 「暫定」チップ / vague place 非描画 |
| `tests/unit/alter-morning/*.test.ts` | adapter の新 output shape に追従 + `blockingSlots.test.ts` / `answerBinderUndecided.test.ts` 追加 |

### 4.2 触らないレイヤ（明示的な非対象）

| ファイル / 層 | 理由 |
|-------------|------|
| `eventSchema.ts` | pure function の設計を維持。sharpness は計算関数で閉じる |
| `gapResolver.ts` | clarify 判定ロジックは PR-7 で決定済み |
| `planningEngine.ts` / `buildDayPlan` | plan 構造化は scope 外。item level の sharpness と confirmationState のみ足す |
| `morningProtocol.ts` (旧 processMorningMessage) | 旧経路。V2 pipeline が優先され、段階的に廃止予定 |

### 4.3 Regression 観点

- `kind="travel"` 行は sharpness の影響を受けない（travel は確定済みとして扱う、durationMin とラベルだけ）。
- `item.proposal === true`（gap-fill proposal）の行は `provisional` 相当だが、既存「提案」タグが立っているのでそれを再利用し confirmationState は付与しない。
- `eventType` / `withWhom` / その他メタデータの扱いは変えない。

---

## 5. UI 表示例（3 状態）

### 5.1 confirmed

```
┌────────────────────────────────┐
│ ☐  08:00  スタバ甲府店  コーヒー │
└────────────────────────────────┘
```

- 実線枠、通常色
- slot すべて fixed

### 5.2 provisional

where vague sub-kind ごとに 3 パターン:

**(a) anchor sub-kind（文言残す）**
```
┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
│  暫定                            │
│ ☐  12:00  甲府駅周辺  ランチ     │
└─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
```

**(b) category_chain sub-kind（文言残す + 暫定チップ）**
```
┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
│  暫定                            │
│ ☐  08:00  スタバ [店舗暫定] コーヒー │
└─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
```

**(c) undecided sub-kind（文言消す）**
```
┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
│  暫定                            │
│ ☐  12:00  [場所未確定]  ランチ   │
└─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
```

**(d) What vague（文言残す + 内容暫定チップ）** — CEO 指摘 3
```
┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
│  暫定                            │
│ ☐  09:00  自宅  仕事 [内容暫定]  │
└─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
```

共通:
- 点線枠、薄色
- 「暫定」チップ（左上）

### 5.3 needs_answer

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ (?)  確認中                     ┃   ← 濃い点線 + 薄い背景色
┃ ☐  朝の仕事    [時間未確定]     ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
Alter: 朝の仕事は何時ごろから？
```

- **濃い点線 + 薄い背景色**（CEO 確定）
- 「(?) 確認中」チップ — `?` はアイコンのみ、needs_answer 時のみ
- 該当 slot に「未確定」ラベル
- 会話側 clarifyQuestion と視覚的に同期（item id → question を紐付け）

### 5.4 3 状態の判定表

| 条件 | plan.status | item.confirmationState |
|-----|------------|----------------------|
| phase=plan_presented 全 item fixed | confirmed | confirmed |
| phase=clarifying pending が指す item | needs_answer | needs_answer |
| phase=clarifying その他 item | needs_answer | provisional |
| comprehension_failed で priorPlan 継承 | provisional | provisional |

---

## 6. fixed / vague / missing の貫通方法

### 6.1 データフロー

```
Event (comprehension/eventSchema.ts)
  └─ when: WhenSlot → computeWhenSharpness()  → SlotSharpness
  └─ where: WhereSlot → computeWhereSharpness() → SlotSharpness
  └─ what: WhatSlot → computeWhatSharpness() → SlotSharpness
      ↓
legacyAdapter.eventToPlanItem()
  └─ 3 本の sharpness を計算
  └─ item.whenSharpness / whereSharpness / whatSharpness にセット
  └─ item.confirmationState を 3 本から導出
      ↓
MorningPlan.items[]
      ↓
MorningPlanCard
  └─ sharpness に応じて slot を描画 or ラベル化
  └─ confirmationState に応じて枠線 / チップを描画
```

### 6.2 adapter 側の実装骨子（参考）

```ts
function eventToPlanItem(event: ComprehensionEvent, orderHint: number): PlanItem {
  const whenSharpness = computeWhenSharpness(event.when);
  const whereSharpness = computeWhereSharpness(event.where);
  const whatSharpness = computeWhatSharpness(event.what);

  const allFixed =
    whenSharpness === "fixed" &&
    whereSharpness === "fixed" &&
    whatSharpness === "fixed";

  // text は残すが、UI は text を第一ソースにしない（slot を個別描画）
  const text = buildFallbackText(event);

  return {
    id: event.event_id,
    kind: isHHmm(event.when.startTime) ? "fixed" : "todo",
    text,
    what: event.what.activity || event.what.activityCanonical || "予定",
    startTime: event.when.startTime ?? undefined,
    durationMin: DEFAULT_DURATION_MIN,
    fixedStart: isHHmm(event.when.startTime),
    orderHint,
    sourceTurnIndex: 0,
    completed: false,
    // ── PR-8 追加 ──
    whenSharpness,
    whereSharpness,
    whatSharpness,
    confirmationState: allFixed ? "confirmed" : "provisional",
    // needs_answer は adapter の上位で pendingClarify と付き合わせて上書き
  };
}
```

**needs_answer の上書き**: `adaptPipelineToLegacy` で `pendingClarify?.event_id === item.id` を満たす item に `confirmationState = "needs_answer"` を書き戻す。

### 6.3 UI 側の表示選択規則

| slot | sharpness=fixed | sharpness=vague | sharpness=missing |
|------|----------------|----------------|------------------|
| when | `startTime` 表示 | `[時間未確定]` ラベル | `[時間未確定]` ラベル |
| where | `place_ref` 表示 | **sub-kind で 3 分岐**（下表） | `[場所未確定]` ラベル |
| what | `activity` 表示 | `activity` + **「内容暫定」チップ**（CEO 指摘 3） | `[内容暫定]` ラベル |

**where vague sub-kind 分岐**:

| sub-kind | 文言表示 | チップ | 例 |
|---------|---------|-------|----|
| `anchor` | そのまま | なし（anchor 自体が情報なので暫定感を足さない） | 「甲府駅周辺」 |
| `category_chain` | そのまま | **「店舗暫定」チップ** | 「スタバ」「カフェ」 |
| `undecided` | **描画しない** | `[場所未確定]` ラベルのみ | 「決めてない」「まだ」 |

**What の表示強化（CEO 指摘 3）**:
- `whatSharpness="vague"` 時、activity 文字は残すが **必ず「内容暫定」チップを併置**
- チップは UI 上で目立つ位置（activity の直後、同じ行内）
- 「内容未確定」ではなく **「内容暫定」**。暫定 = 今はこれだが動きうる、未確定 = 何も決まっていない、という強度差を使い分ける

---

## 7. PR-9 への接続点

### 7.1 search gate deterministic 定義

PR-9 が実装すべき唯一の発火条件:

```ts
// lib/alter-morning/search/anchorSearchGate.ts (PR-9)
export function shouldFireAnchorSearch(
  item: PlanItem,
  session: MorningSession,
  placeClass: "A" | "B" | "C" | "D" | null,
): boolean {
  if (item.whereSharpness !== "vague") return false;
  if (placeClass !== "C") return false;
  if (alreadyResolved(item)) return false;
  const hint = resolveAnchorHint(item, session);
  return hint != null;
}
```

- LLM は呼ばない
- `session.phase` が clarifying でも発火可（anchor hint があれば）
- 発火結果は **proposedPlaceCandidates**（既存フィールド）に積むだけ。`confirmationState` を `confirmed` に上げることは禁止

### 7.2 候補の UI 表現

PR-9 の候補は **PR-8 の provisional 表示の上に重ねる**:

```
┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
│ 暫定                           │
│ ☐  12:00  [場所未確定]  ランチ │
│   ↳ 近くの候補:                 │
│      ・カフェ○○（徒歩3分）     │
│      ・△△亭（徒歩5分）         │
└─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
```

ユーザーが候補を選んだときのみ `whereSharpness="fixed"` / `confirmationState="confirmed"` に昇格（PR-9 の commit 内で実装）。

### 7.3 PR-9 gate の単一責務

「検索するか」の判断は **PR-9 の 1 箇所** だけ（`shouldFireAnchorSearch`）。`morningProtocol.ts` / `planningEngine.ts` / `placeResolver.ts` が独自に「もしかしてここで検索？」という判断を持たない。**判断の分散 = 過去の崩れの主因** なので、PR-9 で必ず集約する（PR-8 段階で設計として予約しておく）。

---

## 8. 震源分析（PR-8 が塞ぐ穴）

PR-7 の preview で観測された UX 破壊の一次ソース:

| 層 | 現状 | PR-8 後 |
|----|-----|--------|
| Schema | `SlotSharpness` 計算は存在、参照されない | adapter が必ず呼ぶ |
| Adapter (`eventToPlanItem`) | `place_ref` を無検査で text 連結 | sharpness ベースで vague なら text に入れない |
| PlanItem | slot 未確定を表す場がない | 3 本の sharpness + confirmationState |
| UI | `item.text` を正とみなし、そのまま描画 | slot 個別描画、vague は固定ラベル |
| 情報損失 | Schema → UI の 3 層で各 1 回ずつ落ちる | adapter で束ね、UI に全量届ける |

**震源は `legacyAdapter.eventToPlanItem`**。ここで sharpness を参照しなかったことが 3 層連鎖の起点。PR-8 はこの 1 関数を正しく書き直すことが核。

---

## 9. CEO 確認結果（2026-04-22 回答反映）

| # | 項目 | CEO 回答 |
|---|------|---------|
| 1 | UI 文言 | 「暫定」「場所未確定」「時間未確定」「**内容暫定**」「確認中」で確定。`内容未確定` ではなく `内容暫定` |
| 2 | `?` の扱い | 文字列禁止、**アイコンのみ**。`needs_answer` 時のみ表示 |
| 3 | `needs_answer` 強調度 | **濃い点線 + 薄い背景色**（二重枠ではない） |
| 4 | `confirmationState?` optional | PR-8 では optional 維持。**PR-9 後に required 化** |
| 5 | test fixture | **影響範囲は更新**、blanket defensive optional はしない |
| 6 | What vague 対応 | PR-8 では **表示強化のみ**、clarify 追加はしない |

追加方針:
- UI 側は `NormalizedPlanItem` を通して strict に扱う（§3.4）。`??` fallback 禁止
- `whereSharpness=vague` は sub-kind 3 分岐（anchor / category_chain / undecided）

---

## 10. PR-8 ブレイクダウン（実装計画）

commit 分割案:

**改訂 1（初稿）フェーズ — commit 1〜7（merged 前に main に landing）**:

1. **型追加**: `types.ts` に `ConfirmationState` / `WhereVagueSubKind` / 3 本の sharpness フィールドを optional で追加
2. **where vague classifier**: `classifyWhereVague(where: WhereSlot): WhereVagueSubKind` を adapter 近傍に実装（undecided 語彙集合含む）
3. **adapter 配線**: `eventToPlanItem` で sharpness + sub-kind 計算、`adaptPipelineToLegacy` で needs_answer 上書き
4. **UI 分離描画**: `MorningPlanCard` を slot 分離 + sub-kind 分岐 + What 内容暫定チップ構造に改修
5. **PR-9 gate 型予約**: `lib/alter-morning/search/anchorSearchGate.ts` を **interface + 未実装 throw stub** として置く
6. **テスト（初稿）**: Strict Confirmation の snapshot / adapter / classifier
7. **docs 初稿**: 本設計書初版を commit

**改訂 2（CEO preview FAIL 反映）フェーズ — commit 8〜12（本 branch に追加）**:

8. **blocking 正本**: `lib/alter-morning/planning/blockingSlots.ts` 追加 + `whereClassifier.ts` の vague provisional fallback 凍結
9. **phase 昇格契約書き直し**: `legacyAdapter.decidePhase` を `hasBlockingUnresolvedSlots` 正本に差し替え + `items=0` の dev/test throw / prod safe degrade
10. **answerBinder 最小版**: undecided 語彙拒否 + 単一 event invariant + bind 後 sharpness 再評価（観測ログ）
11. **dialog-control テスト**: `blockingSlots.test.ts`（12 cases）/ `answerBinderUndecided.test.ts`（6 cases）
12. **設計書 改訂 2 反映**: §2.5 anchor blocking 注記 / §2.8 blocking 定義 + phase 昇格契約 / §3.6 captured vs resolved 最小版 / §4.1 参照表追記 / §10 本節更新

関連 fixture 更新方針（CEO 指摘 5）:
- blanket で `confirmationState?` を defensive optional にしない
- `tests/unit/alter-morning/wave3HardGate.test.ts`, `wave3ProviderFailure.test.ts` 等の **新 contract に直接関連する fixture** は明示的に更新
- それ以外の fixture は normalizer 経由で旧描画互換に倒れる（明示更新しない）

---

## 11. 最後に固定する意図（CEO 方針の原文反映）

> 「検索を足すことより先に、未確定を未確定のまま扱う。」

- PR-8 は **UI の嘘をなくす PR**。新機能ではない。
- PR-9 で候補を出した瞬間、ユーザーは「これで決まった」と錯覚する。その錯覚を **先に塞ぐ** のが PR-8。
- 「決めてない」を場所として描画しない。「スタバ」を支店確定風に描画しない。「仕事」を活動として固定しない。**確定していないものを確定していないように描く**。

---

## 付録 A: 参照ファイル

- `lib/alter-morning/comprehension/eventSchema.ts` §SlotSharpness / compute*Sharpness
- `lib/alter-morning/types.ts` §PlanItem / MorningPlan / MorningPlanStatus
- `lib/alter-morning/legacyAdapter.ts` §eventToPlanItem / adaptPipelineToLegacy
- `components/home/morning/MorningPlanCard.tsx` §ItemRow
- `docs/alter-morning-comprehension-first-wave3-pr7-design.md` §3 SlotSharpness / §4.5 message 決定
- `docs/weekly-priorities.md` §W3-PR-7 merge 後 backlog（1. 前倒し提示の抑制 / 2. fixable-provisional 境界 / 3. anchor search 分離）

## 付録 B: 未決事項

- What sharpness を vague のまま UI に出すか、What clarify を追加するかは PR-8 の scope で一旦「表示のみ」に留める。clarify 追加は PR-7 の gapResolver 優先度（When > What > How）を再議論してから。
- `confirmationState` を Server Action / DB 永続化する必要性は今のところない（session JSON に入るだけ）。将来 cross-session で「昨日は暫定のまま終わった plan」を拾うなら別 PR。
- **（改訂 2 追加）** captured vs resolved の完全な型分離（`CapturedAnswer<S>` / `ResolvedSlotValue<S>`）は次 PR で検討。PR-8 は最小版（undecided 拒否 + 単一 event invariant + bind 後 sharpness 再評価ログ）で止める。
- **（改訂 2 追加）** `semanticMissCount` は PendingClarify に載っているが「3 回 miss で別 slot に逃げる」対話制御は未実装。PR-9 or PR-10 で着手。
