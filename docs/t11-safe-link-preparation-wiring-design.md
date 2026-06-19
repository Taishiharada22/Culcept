# Safe Link Preparation Wiring Design（docs-only）

> 設計フェーズ（phase-by-phase）。**コード変更なし**。実装は CEO 承認後・本 phase のみ。
> DB・RLS / M2 runtime / CoAlter runtime / 外部 retrieval / Maps・Places API / 外部遷移 production release は HOLD。
> 上位文脈: Tier1-A（inert intent）→ Tier1-B（href model + helper）→ Tier1-B-C（`TravelExternalLinks` render）→ Tier1-C（生成 Maps 検索 intent）。
> **本書 = この 4 部品を「UI の手前で」束ねる準備層の境界**（生成も eligibility も UI に入れない）。
> 原則: ①前提を疑う ②grounding ③シンプル→論理 ④外科的 ⑤ゴール逆算 ⑥人間同等の推論設計 ⑦超越的アイデア ⑧世界トップシェア。

---

## 0. grounding（②・実コード精査）
- **Tier1-A** `buildSafeTravelLinkIntent` → inert `SafeTravelLinkIntent`（manual・eligibility 判定・href/生成/fetch なし）。
- **Tier1-B** `buildSafeTravelLinkHrefModel(intent)` → `eligibility==="eligible"` のみ `SafeTravelLinkHrefModel`、else `null`。**source を問わない**（manual も generated も通る）。
- **Tier1-B-C** `TravelExternalLinks({ links: SafeTravelLinkHrefModel[] })` → read-only render・cue と別 section・**未配線（呼び元が links を渡していない）**。
- **Tier1-C** `buildGeneratedMapsSearchIntent(input)` → confirmed shared-safe のみ inert `SafeTravelLinkIntent`（`source:"generated_maps_search"`・`generated:true`）、else `null`。
- **接続点**: ready 状態は `display: TravelPlanDisplayPayload { packet, projection, cues }`（`travel-plan-display-adapter-types.ts:31`）。**`links` field は無い**＝href model を ready 状態に運ぶ経路が未存在。
- **未配線の核**: 「どの intent が存在するか（server）」と「TravelExternalLinks が要求する `SafeTravelLinkHrefModel[]`」の**間に変換層が無い**。UI は helper を呼べない（B-C で禁止確定済）。

---

## 1. まず前提を疑う（①）— これが次か？
| 候補 | リスク | 価値 | 評価 |
|---|---|---|---|
| **Safe Link Preparation Wiring（pure helper）**（本書） | 低（pure・fetch なし・production 非接触） | 高（4 部品を**初めて使える形に束ねる**唯一の欠落。これが無いと UI が永遠に未配線） | **推奨・次（設計のみ）**。intents（manual + generated）→ `href model[]` の純粋合成。「準備して手渡す」経路の最後の pure ピース |
| SQL/RLS persistence | **高**（DB migration＝§1 CEO 承認・RLS security） | 中 | 後。**何を永続するか（inert intent）**が preparation で確定してから |
| M2 production merge wiring | 中 | — | 後（CEO 既決: production action へ merge しない） |
| CoAlter runtime | **高**（talk/realtime 大規模面） | 中 | 後 |
| E production deny release | 最大 gate | — | **最後**（明示） |

**推奨: Preparation Wiring 次・docs-only。** 根拠（①⑤⑧）: Tier1-A〜C で「部品」は全部揃った。しかし **部品を UI が要求する形（`href model[]`）に束ねる層が存在しない**ため、ladder はまだ「使えない」。Preparation はこの唯一の欠落を **pure・deterministic・fetch なし**で埋める。実装は **A+B（型 + pure helper・wiring/UI/production なし）**。

### ★ 設計の核（③⑥⑦）— 三層分離「存在（server）→ 変換（pure）→ 描画（dumb UI）」
- **存在判定**（どの manual intent があるか・生成すべきか＝confirmed+shared か）＝ **server 側 caller の責務**。
- **変換**（intent → href model・順序・dedupe）＝ **本 pure helper の責務**（生成も fetch も判定もしない・**Tier1-B を再利用**）。
- **描画**（href model[] を render）＝ **UI（TravelExternalLinks）の責務**（dumb・分類も生成もしない）。
→ 生成 orchestration と confirmed-info plumbing を **準備 helper に入れない**。helper は「**intents を受けて models を返す**」だけ。これが最も外科的（④）で再利用可能・テスト容易・honesty が高い。

### ★ honesty 特性（⑦）— href model は「永続しない・毎回再計算」
inert intent が **正本**。href model は **display 派生**で、**永続せず confirmed 状態から毎回 recompute**（Tier1-A の harness「recompute via injected pure function」原則と同型）。これにより「保存された古い href が confirmed 状態と矛盾する」事故が構造的に起きない。

---

## 2. 現在の link assets（②）
| asset | 種別 | 状態 |
|---|---|---|
| `SafeTravelLinkIntent`（Tier1-A 型） | pure 型 | manual + generated を表現可（`generated?` で区別） |
| `buildSafeTravelLinkIntent`（Tier1-A） | pure helper | manual intent 生成・eligibility 判定 |
| `buildSafeTravelLinkHrefModel`（Tier1-B） | pure helper | eligible intent → href model（source 非依存） |
| `TravelExternalLinks`（Tier1-B-C） | UI | `href model[]` を render・**未配線** |
| `buildGeneratedMapsSearchIntent`（Tier1-C） | pure helper | confirmed shared-safe → generated intent |
- **manual intents**: user_provided / manual_official / manual_maps（`generated` absent）。
- **generated_maps_search intents**: `generated:true`・confirmed shared-safe のみ。
- **pure**: 上記 helper/型すべて。**UI**: TravelExternalLinks のみ。**unwired**: intents → `href model[]` の変換 + ready 状態への links 運搬。

---

## 3. wiring problem（③）
- manual eligible intent は **Tier1-B で** href model 化できる。
- generated Maps 検索 intent も **同じ Tier1-B helper で** href model 化できる（source 非依存）。
- `TravelExternalLinks` は **`SafeTravelLinkHrefModel[]` のみ**受ける。
- UI は **raw `SafeTravelLinkIntent` を受けてはならない**。
- UI は **`buildSafeTravelLinkHrefModel` を呼んではならない**。
- UI は **`buildGeneratedMapsSearchIntent` を呼んではならない**。
→ **render の手前に準備層が必要**（intents を集めて href model[] に変換する pure 層）。

---

## 4. preparation layer role（④）
- **input**: 既に構築済の `SafeTravelLinkIntent[]`（manual 群 + **任意で** caller が `buildGeneratedMapsSearchIntent` で作った generated intent。eligible でなければ caller が含めない＝null を渡さない）。
  - ★ confirmed destination/entity 情報・生成可否判定・生成呼び出しは **caller（server）側**。helper は **判定済の intent しか受けない**。
- **output**: `SafeTravelLinkHrefModel[]`（eligible のみ・順序付き・dedupe 済）。
- **しないこと**: render しない / fetch しない / URL を mutate しない / Maps API を呼ばない / M2 runtime を呼ばない / CoAlter を呼ばない / engine を呼ばない / raw diagnostics を client に返さない / **生成しない** / **eligibility を再実装しない（Tier1-B 再利用）**。

## 5. layer location（§5・①比較）
| 案 | 内容 | 評価 |
|---|---|---|
| **A. pure shared helper** | `lib/shared/travel/` の pure 変換 helper | **推奨（logic の置き場）**。再利用可・テスト容易・UI/server どちらからも安全に呼べる |
| B. server-only display adapter 層 | adapter 内で変換 | 後（**A を呼ぶ呼び元**として妥当・別 GO の wiring） |
| C. TravelLiveAction ready result preparation | action 内で変換 | 後（A を呼ぶ呼び元・別 GO） |
| D. TravelLivePanel UI | UI 内変換 | **却下**（UI は helper を呼べない・分類禁止） |

**推奨: A（pure helper）。** 後で **B/C（server/display adapter）から呼ばれる**。**UI からは決して呼ばない。** これは CEO preferred と一致。

## 6. source ordering（§6）
- 表示順（**ランキングではない**）: `user_provided` → `manual_official` → `manual_maps` → `generated_maps_search`。
- **source popularity score なし**・**ランキングなし**（純粋に固定表示順）。
- 同 source 内は **入力順を保つ（stable sort）**。
- `generated_maps_search` は **検索/hand-off と明示**（label は intent 構築時に caller が付与・§8）。
- **同一 `handoffUrl` は安全に dedupe**（先勝ち＝表示順で先の source が残る）。

## 7. eligibility rules（§7）
- **eligible intent のみ** href model になる（`buildSafeTravelLinkHrefModel` が判定・null を drop）。
- invalid/ineligible は **欠落のまま**（出さない）。
- generated intent は **`buildGeneratedMapsSearchIntent` が非 null を返した時のみ**現れる（confirmed shared-safe・caller 責務）。
- proposed/unconfirmed/missing destination → **generated Maps link なし**（Tier1-C が null）。
- private/M2 由来 label → **generated Maps link なし**（Tier1-C が null）。
- **href model に private 値なし**（Tier1-B が保証）。

## 8. copy / label rules（§8）
> ★ label は **intent 構築時（caller）に付与**され、準備 helper は **書き換えない**（UI logic を入れない）。本節は **caller の付与規約**。
- manual official: 「外部サイトで確認してください」
- manual maps: 「地図で見る」
- generated maps search: 「地図で検索する」「検索結果を開きます」
- user-provided unknown: 「外部で確認する」
- disclaimer（UI 側 TravelExternalLinks が既に保持）: 「これは予約ではありません」
- **禁止**: 「予約する」「空きあり」「最安」「確定」「この場所にする」「スケジュールに追加」「今すぐ行く」「この案で決定」。

## 9. privacy（§9）
- URL に **private `red_line`/`soft_preference` なし**・**raw userId なし**・**M2/Stargazer data なし**・**participant/relationship state なし**（Tier1-A/C が保証）。
- label に **private rationale なし**。
- **client-only filtering 禁止**。
- generated maps は **shared-safe label のみ**（Tier1-C の gate）。
- manual URL は **既に eligible の時のみ** render（Tier1-B の gate）。

## 10. TravelLiveAction / TravelLivePanel との関係（§10）
- action / display adapter が **後で** preparation helper を呼べる（B/C wiring・別 GO）。
- ready 状態（`display: { packet, projection, cues }`）が **後で `links: SafeTravelLinkHrefModel[]` を持てる**（D wiring・別 GO・現状 field なし）。
- `TravelLivePanel` は **`links` を render するだけ**（生成も分類もしない・B-C 実装済）。
- **既存 live gate 変更なし**・**production deny release は HOLD**。

## 11. durable state との関係（§11）
- `SafeTravelLinkIntent` は **後で inert metadata として永続し得る**（manual URL の保存）。
- **href model は display 派生＝なるべく recompute**（永続しない）。
- generated Maps intent は **confirmed destination/entity から recompute 可**（永続不要）。
- **本 phase で DB/RLS なし**。

## 12. 実装オプション + 推奨（§12・⑤・CEO 承認で着手）
| 案 | 内容 | 評価 |
|---|---|---|
| **A. pure helper 型** | 入出力型（intents → href model[]）+ 固定 source 表示順 const | 推奨バンドル前提 |
| **B. pure helper** | `prepareSafeTravelLinkHrefModels(intents)`（順序 + Tier1-B 変換 + null drop + handoffUrl dedupe） | ◎ 推奨 keystone |
| C. server action / display adapter wiring | adapter/action から B を呼ぶ | 後（別 GO・server 配線） |
| D. `TravelLiveActionState` links field wiring | display payload に links 追加 | 後（別 GO・状態運搬） |
| E. TravelLivePanel link render activation | panel に links を渡す | 後（別 GO・UI 有効化） |

**推奨実装スライス: A + B（pure 型 + helper・wiring/UI なし）。**
```
// スケッチ（未実装）
import type { SafeTravelLinkIntent, SafeTravelLinkSource } from "./safe-link-types";
import type { SafeTravelLinkHrefModel } from "./safe-link-href-types";
import { buildSafeTravelLinkHrefModel } from "./safe-link-href";

// ★ 表示順のみ（ランキング/人気度ではない）
const SOURCE_DISPLAY_ORDER: Record<SafeTravelLinkSource, number> = {
  user_provided: 0, manual_official: 1, manual_maps: 2, generated_maps_search: 3,
};

/** 既構築 intents（manual + 任意 generated）→ display-safe href model[]（eligible・順序・dedupe）。
 *  ★ 生成しない・fetch しない・eligibility を再実装しない（Tier1-B 再利用）・deterministic（Date/random なし）。 */
function prepareSafeTravelLinkHrefModels(intents: SafeTravelLinkIntent[]): SafeTravelLinkHrefModel[] {
  if (!Array.isArray(intents)) return [];
  // 1. 固定表示順（同 source は入力順保持＝stable）
  const ordered = intents
    .map((intent, i) => ({ intent, i }))
    .sort((a, b) => (SOURCE_DISPLAY_ORDER[a.intent.source] - SOURCE_DISPLAY_ORDER[b.intent.source]) || (a.i - b.i))
    .map((x) => x.intent);
  // 2. Tier1-B で eligible のみ model 化（ineligible/invalid は null→drop）
  // 3. handoffUrl で dedupe（先勝ち）
  const seen = new Set<string>();
  const out: SafeTravelLinkHrefModel[] = [];
  for (const intent of ordered) {
    const model = buildSafeTravelLinkHrefModel(intent); // null = 出さない
    if (!model) continue;
    if (seen.has(model.handoffUrl)) continue;
    seen.add(model.handoffUrl);
    out.push(model);
  }
  return out;
}
// caller（後の C/D）: const intents = [...manualIntents, gen].filter(Boolean); prepare → ready.display.links
```
- **C（adapter/action wiring）/ D（links field）/ E（panel 有効化）/ production deny は HOLD。**

## 13. 将来 test（§13・実装時）
- manual eligible intent → href model になる。
- generated maps intent → href model になる。
- invalid/ineligible intent → 除外（model にならない）。
- proposed/unconfirmed/missing destination → generated maps link なし（Tier1-C null を渡さない経路で再現）。
- private label → generated maps link なし。
- 出力順は **安定 + source ベース**（user_provided→…→generated_maps_search）。
- 同一 `handoffUrl` は **dedupe**（先勝ち）。
- **UI helper を import しない**・**`TravelLivePanel` を import しない**・**engine/provider/M2 runtime を import しない**。
- **CoAlter/useCoAlter なし**・**`/talk` なし**・**fetch/API/DB/Supabase なし**・**Maps/Places API なし**・**web search なし**。
- **booking/calendar/action authority なし**。
- **deterministic**（同入力 → 同出力・Date/random なし）。
- **tsc baseline 不変（55）**・既存 travel tests green（Tier1-A/B/B-C/C 不変）。

---

## 14. Stop
- 本書（Safe Link Preparation Wiring Design）で**停止**。
- preparation 実装は **CEO 承認まで行わない**（C/D/E wiring・UI 有効化・production release は HOLD）。

---

## 出力サマリ
- **前提（①⑤⑧）**: 次は **Safe Link Preparation Wiring（pure helper・docs-only）** 推奨。Tier1-A〜C で部品は揃ったが、**UI が要求する `href model[]` へ束ねる変換層が無い**ため ladder はまだ使えない。これを **pure・deterministic・fetch なし**で埋める最後のピース。persistence/runtime/release（重 gate）より先。
- **三層分離（③⑥⑦）**: 存在判定（server caller: どの manual があるか・confirmed+shared で生成するか）→ 変換（**本 pure helper**: 生成も判定も fetch もせず Tier1-B 再利用）→ 描画（dumb UI）。生成 orchestration を helper に入れない＝最も外科的・再利用可能・honesty 高。
- **honesty 特性（⑦）**: inert intent が正本、href model は **永続しない display 派生で毎回 recompute**（古い href が confirmed 状態と矛盾する事故を構造的に排除）。
- **role/order/eligibility（④⑥⑦）**: input=既構築 intents（manual + 任意 generated・eligible でなければ caller が含めない）、output=`href model[]`（固定表示順=ランキングでない・同 source 入力順保持・`handoffUrl` dedupe 先勝ち）。eligible 判定は Tier1-B 再利用、generated は Tier1-C が非 null の時のみ。
- **privacy/copy**: URL に private/userId/M2 なし（Tier1-A/C 保証）、label は caller 付与で helper は書き換えない（official→「外部サイトで確認」/maps→「地図で見る」/generated→「地図で検索する」/unknown→「外部で確認する」、予約語禁止）。
- **推奨実装スライス**: **A（pure 型 + `SOURCE_DISPLAY_ORDER`）+ B（`prepareSafeTravelLinkHrefModels(intents)`・順序+Tier1-B 変換+null drop+dedupe・生成/fetch なし・deterministic）**。**C（adapter/action wiring）/ D（links field）/ E（panel 有効化）/ production deny は HOLD。**
- 本フェーズは **docs-only** — コード/型/テスト不変・tsc 55・push なし・production 非接触。
