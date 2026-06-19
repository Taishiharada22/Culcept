# TravelPlanDisplayPayload Links Wiring Design（D・docs-only）

> 設計フェーズ（phase-by-phase）。**コード変更なし**。実装は CEO 承認後・本 phase のみ。
> DB・RLS / M2 runtime / CoAlter runtime / 外部 retrieval / Maps・Places API / 外部遷移 production release は HOLD。
> 上位文脈: Tier1-A〜C + Preparation helper（`prepareSafeTravelLinkHrefModels`）まで完成。**だが UI への transport field が無い**。
> 原則: ①前提を疑う ②grounding ③シンプル→論理 ④外科的 ⑤ゴール逆算 ⑥人間同等の推論設計 ⑦超越的アイデア ⑧世界トップシェア。

---

## 0. grounding（②・実コード精査）
- `TravelPlanDisplayPayload`（`travel-plan-display-adapter-types.ts:31`）= **`{ packet, projection, cues }`**。**`links` field 無し**。
- `TravelPlanDisplayResult` = `ready{display} | not_ready_missing{ask} | not_ready_unconfirmed{ask} | unavailable | invalid`。**`display` を持つのは ready のみ**（構造的事実）。
- `toTravelLiveActionState`（`travel-live-action-state.ts:59`）: ready は `{ status:"ready", display: result.display }` を**丸ごと**運ぶ。
- `TravelLiveReadyView`（`TravelLivePanel.tsx`）: 既に `links?: SafeTravelLinkHrefModel[]`（default `[]`）を受け、`<TravelExternalLinks links={links} />` を cue の外に配置済。**未配線**（呼び元が渡していない）。
- `prepareSafeTravelLinkHrefModels`（`safe-link-preparation.ts`）: intents → href model[]（pure・順序・dedupe・marker guard）。**どこからも呼ばれていない**。
- **★ producer の現実（ready 分岐 `travel-plan-display-adapter.ts:58-63`）**:
  - `provided.input`（server-only `TravelPlanEngineInput`）に **confirmed destination_area の areaText（+ owner/visibility）が在る**＝ready の根拠。→ **generated Maps 検索 intent の供給源は存在する**。
  - **manual URL 供給源は production に無い**: フォームは destination+date のみ（URL 入力欄なし）。さらに adapter は契約で「**外部 retrieval / safe links / Maps URL なし**」を宣言（line 14）。

---

## 1. まず前提を疑う（①）— これが次か？
| 候補 | リスク | 価値 | 評価 |
|---|---|---|---|
| **D 型 field 追加（本書 A）** | **極小**（optional・default 不在・runtime 不変・dark-launch 可） | 高（prep→UI を繋ぐ transport の起点） | **推奨・次（設計のみ→A 実装）** |
| D producer/consumer 配線（B-D） | 中（adapter が「safe links 不触」契約を越える・intent 源の決定要） | 高 | **A の後・別 GO**（§5 で intent 源を pin） |
| Tier1-C render distinction（生成/手動の区別表示） | 低 | 中 | 後（links が実際に運ばれ render された後で意味を持つ） |
| SQL/RLS persistence | **高**（DB migration＝§1 CEO 承認） | 中 | 後 |
| M2 production merge | 中 | — | 後（CEO 既決で後） |
| E production deny release | 最大 gate | — | **最後** |

**推奨: D 次・ただし実装は SPLIT で「A 型 field のみ」を先に。** 根拠（①⑤⑧）: prep helper は在るが **transport field が無い**ため UI は永遠に未配線。`externalLinks?` を **optional・default 不在**で足せば **runtime ゼロ変更**で transport の器が用意でき、producer/consumer 配線（B-D）を後から安全に載せられる（F2/G/B-C と同じ「型先行・挙動後」パターン）。**B-D は intent 源（generated のみ可・manual 無し）を pin してから別 GO**。

### ★ 設計の核①（①③）— 「型先行・dark-launch」
`externalLinks?` を **optional** にすると、A 単独着地で **adapter も panel も挙動不変**（producer が set しない＝absent＝UI は今まで通り何も描かない）。transport の器だけ先に確定し、B-D を段階配線。最小リスク。

### ★ 設計の核②（⑥⑦）— links は **構造的に ready 限定**
`display` を持つ result は **ready のみ**。`externalLinks?` は `TravelPlanDisplayPayload` に載るので、**not-ready/unavailable/invalid には型として存在し得ない**。→「未確定状態に link が漏れる」事故が**構造で**排除される（§11）。これは flag や runtime check に頼らない honesty 保証。

### ★ 設計の核③（①）— intent 源の現実を直視
generated 源は ready 分岐に在る（confirmed areaText）。**manual 源は production に無い**（URL 入力欄なし・adapter は safe links 不触）。よって B-D を配線する時、当面の links は **generated 1 本**（confirmed shared-safe destination から）であり、manual URL は **別の入力収集 phase が出来るまで空**。これを設計に明記し、誇張しない（honesty）。

---

## 2. 現在の display payload（②）
- `TravelPlanDisplayPayload { packet, projection, cues }`。**links 無し**。
- ready state が display payload を運ぶ。
- `TravelLivePanel` は **links が渡されれば** render できる（`TravelLiveReadyView` に `links?` 口は実装済）。
- `TravelExternalLinks` は **default 空/未配線**（空→null render）。
- `prepareSafeTravelLinkHrefModels` は**存在するが未配線**。

## 3. wiring problem（③）
- server/display adapter は links を **prep できる**（prep helper 在り）。
- UI は `SafeTravelLinkHrefModel[]` を **render できる**（component 在り）。
- だが **typed transport field が無い**。
- raw intent を **分類のため UI に送ってはならない**。
- UI は prep helper / generated maps helper を **呼んではならない**。
- → **承認後にのみ** `display.externalLinks`（等）を足す。

## 4. 候補 payload field（§4・①比較）
| 名 | 評価 |
|---|---|
| `links?: SafeTravelLinkHrefModel[]` | payload の既存命名（packet/projection/cues＝単名詞）に揃うが**汎用すぎ**（内部 nav と紛れる懸念） |
| **`externalLinks?: SafeTravelLinkHrefModel[]`** | **推奨**。**外部 hand-off であることを名で明示**・component 名 `TravelExternalLinks` と一致・honesty 高 |

**推奨: `externalLinks?: SafeTravelLinkHrefModel[]`**（consumer は `display.externalLinks ?? []`）。`links?` も可だが、本トラックの honesty-first 方針上「external」を名に残す方を推す。
- **field は display-safe のみ**（`SafeTravelLinkHrefModel[]`）。
- **持たない**: raw `SafeTravelLinkIntent` / raw diagnostics / `AuthoritativePacketForServer` / engine output / private data。
- **optional**（default 不在＝A 単独で挙動不変）。

## 5. producer 責務（§5）
- producer = **後の server/display adapter または server action 層**（B-D・別 GO）。
- producer は `prepareSafeTravelLinkHrefModels` を呼んでよい。
- producer は **manual/generated intents の assemble に責任**を持つ。
  - ★ **現実（grounding）**: 当面 assemble 可能なのは **generated 1 本**（ready 分岐 `provided.input` の confirmed shared-safe destination areaText から `buildGeneratedMapsSearchIntent`）。**manual URL は production 源が無く空**。
- producer は **private/generated-invalid intent を含めない**。
- producer は **fetch/read/scrape しない**・**Maps/Places API を呼ばない**・**raw intent list を UI に出さない**・**raw provider diagnostics を含めない**。
- ★ 注（①④）: adapter は現在「safe links 不触」を契約。B で adapter 内 generation を行うと**契約を越える**ため、(i) adapter 内に flag 付きで足す か (ii) adapter の外（server action / 専用 enrichment step）で `display` に後付けする か、を **B-D GO 時に決める**（本 A では決めない）。

## 6. consumer 責務（§6）
- `TravelLivePanel` は **`display.externalLinks` のみ**消費。
- `display.externalLinks ?? []` を `TravelExternalLinks` に渡す（D・別 GO）。
- panel は **呼ばない**: `prepareSafeTravelLinkHrefModels` / `buildSafeTravelLinkHrefModel` / `buildGeneratedMapsSearchIntent`。
- panel は **raw intent を受けない**・**eligibility を推論しない**・**URL を生成しない**。

## 7. 将来 wiring の intent 源（§7）
- 既供給の **manual inert intents**（**現状 production に無し**・将来 URL 収集 phase）。
- server caller が既に作った **generated maps 検索 intent**（**ready の confirmed destination から作成可・当面の唯一の実在源**）。
- **不可**: raw chat text / raw LLM / M2・private label / diagnostics 由来 URL / unconfirmed destination / proposed destination。

## 8. privacy（§8）
- `display.externalLinks` は **shared-safe**。
- **無し**: private `red_line`/`preference` / raw userId / M2・Stargazer data / participant・relationship state / label 内 private rationale。
- **client-only privacy filtering 禁止**。
- provenance metadata を含む **raw intent は server-side に留める**（UI には href model のみ）。

## 9. copy / authority（§9）
- label は中立のまま（caller 付与・prep は書き換えない）。
- **booking/calendar/action copy なし**・**executionAuthority なし**・**availability/price/confirmation なし**。
- display links は **external hand-off のみ**。
- disclaimer は `TravelExternalLinks` が既に保持: 「これは予約ではありません」「外部サイトで確認してください」。

## 10. 現 TravelExternalLinks との関係（§10）
- component は **実装済**・`SafeTravelLinkHrefModel[]` を受ける・**空配列→null**。
- link section は **CoAlter cue と別**のまま。
- **field を正しく渡せば component 変更は不要**。
- 既存テストは green のまま（A は型のみ・挙動不変）。

## 11. action-state との関係（§11）
- `TravelLiveActionState.ready.display` が **後で externalLinks を含み得る**。
- **not-ready は links を含まない**（**構造的に `display` が無い**＝型で不能・追加承認不要に安全）。
- **unavailable / invalid も links を含まない**（同上）。
- action-state に **raw diagnostics なし**・返却型は **display-safe のまま**。

## 12. durable state との関係（§12）
- href model は **display 派生＝原則 recompute**（永続しない）。
- inert intent は **persistence が開けば後で保存し得る**。
- **本 phase で href model を保存しない**・**DB/RLS なし**。

## 13. 実装オプション + 推奨（§13・⑤）
| 案 | 内容 | 評価 |
|---|---|---|
| **A. 型のみ field 追加** | `TravelPlanDisplayPayload` に `externalLinks?: SafeTravelLinkHrefModel[]` | **推奨・最初**（optional・runtime 不変・dark-launch） |
| B. display adapter が prep で links を作る | adapter/enrichment で `prepareSafeTravelLinkHrefModels` | 後（adapter「safe links 不触」契約・intent 源決定が要） |
| C. action-state ready が links を運ぶ | `toTravelLiveActionState` が display を丸ごと運ぶ＝**A だけで自動的に運ばれる** | A に内包（追加コード不要） |
| D. panel が links を TravelExternalLinks に渡す | `display.externalLinks ?? []` | 後（1 行だが挙動 wiring・B が links を供給して初めて意味） |
| E. A-D を一括 | — | **却下**（intent 源未 pin・adapter 契約越え・一括は外科性を損なう） |

**推奨実装スライス: A のみ（型 field 追加）。**
```
// スケッチ（未実装・型のみ）
export interface TravelPlanDisplayPayload {
  packet: DisplayPacketForClient;
  projection: PlanIntelligenceProjection;
  cues: CoAlterProjectionCue[];
  /** ★ optional・display-safe・external hand-off のみ（raw intent/診断/権威を持たない）。
   *   producer（B-D・別 GO）が prepareSafeTravelLinkHrefModels で set するまで absent＝UI 不変。 */
  externalLinks?: SafeTravelLinkHrefModel[];
}
```
- C は **A に内包**（`toTravelLiveActionState` が `result.display` を丸ごと運ぶため、field を足せば ready state に自動的に乗る）。
- **B（producer）/ D（consumer 配線）/ E / production deny は HOLD**。intent 源（generated のみ・manual 無し）を pin して別 GO。

> ★ premise note（①）: 「A+B+C+D が surgical なら一括」も検討したが、**grounding で intent 源が未 pin（manual 源が production に無い）かつ adapter が safe links 不触契約**と判明。一括は契約越え + 過剰スコープ。**A（型）先行が最も外科的**（④）。

## 14. 将来 test（§14・実装時）
- ready display payload は **externalLinks を含み得る**（型）。
- **not-ready state は links を含まない**（構造的に display 無し）。
- `TravelLivePanel` は `display.externalLinks` を `TravelExternalLinks` に渡す（D 実装時）。
- panel は prep helper / generated maps helper を **import しない**。
- panel は **raw intent を受けない**・**raw `SafeTravelLinkIntent` が UI に届かない**・**raw diagnostics が UI に届かない**。
- links は external section に render・**`display.externalLinks` 不在時は何も render しない**。
- **booking/calendar/action button なし**・**useCoAlter なし**・**`/talk` なし**。
- **fetch/API/DB/Supabase なし**・**Maps/Places API なし**。
- **tsc baseline 不変（55）**・既存 travel tests green（A は型のみ＝adapter/panel 挙動不変）。

---

## 15. Stop
- 本書（TravelPlanDisplayPayload Links Wiring Design）で**停止**。
- links wiring 実装は **CEO 承認まで行わない**（A 型 field も含め GO 待ち）。

---

## 出力サマリ
- **前提（①⑤⑧）**: 次は **D（links wiring・docs-only）**、実装は **SPLIT で「A 型 field のみ」先行**を推奨。prep helper は在るが transport field が無く UI は永遠に未配線。`externalLinks?` を **optional・default 不在**で足せば **runtime ゼロ変更**で器が用意でき、B-D を段階配線できる。
- **intent 源の現実（①）**: grounding で **generated 源は ready 分岐に在る（confirmed areaText）が、manual 源は production に無い（URL 入力欄なし・adapter は safe links 不触契約）**と判明。よって B-D の当面の links は **generated 1 本**で、manual は別 phase まで空。一括（E）は契約越え + 過剰スコープゆえ却下。
- **構造 honesty（⑥⑦）**: `display` を持つのは ready のみ＝`externalLinks?` は **not-ready/unavailable/invalid に型として存在し得ない**。「未確定状態に link 漏れ」を flag でなく**構造で**排除。C（action-state 運搬）は A に内包（display を丸ごと運ぶため追加コード不要）。
- **field（④）**: **`externalLinks?: SafeTravelLinkHrefModel[]`** 推奨（external 明示・component 名と一致・display-safe・optional）。raw intent/診断/権威/private を持たない。
- **producer/consumer**: producer（server・B-D）は prep helper を呼び intent を assemble（当面 generated のみ）、private/invalid を含めず fetch/API なし。consumer（panel）は `display.externalLinks ?? []` を渡すだけ・helper を呼ばず・eligibility を推論しない。
- **推奨実装スライス**: **A（`TravelPlanDisplayPayload.externalLinks?` 型 field・optional・runtime 不変）**。**B（producer prep）/ D（panel 配線）/ E / production deny は HOLD（intent 源 pin 後 別 GO）。C は A に内包。**
- 本フェーズは **docs-only** — コード/型/テスト不変・tsc 55・push なし・production 非接触。
