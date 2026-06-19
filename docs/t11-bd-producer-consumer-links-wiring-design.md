# B-D Producer/Consumer Links Wiring Design（docs-only）

> 設計フェーズ（phase-by-phase）。**コード変更なし**。実装は CEO 承認後・本 phase のみ。
> DB・RLS / M2 runtime / CoAlter runtime / 外部 retrieval / Maps・Places API / URL fetch / 外部遷移 production release は HOLD。
> 上位文脈: Tier1-A〜C + Preparation helper + D-A（`TravelPlanDisplayPayload.externalLinks?` 型 field）まで完成。**だが producer/consumer 未配線**。
> 原則: ①前提を疑う ②grounding ③シンプル→論理 ④外科的 ⑤ゴール逆算 ⑥人間同等の推論設計 ⑦超越的アイデア ⑧世界トップシェア。

---

## 0. grounding（②・実コード精査）— ★ 設計を変える決定的発見
- `TravelPlanEngineInput.slots: ExtractedSlot[]`（`engine-types.ts:23`）。`provided.input.slots` に **destination_area の `value.areaText` + `status` + `owner` + `visibility` が在る**＝generated 源は存在。
- **だが `provided.input` は adapter 内部（`travel-plan-display-adapter.ts:42-58`）で computed され、ready 結果には載らない**（結果は display-safe `{packet, projection, cues}` のみ）。
- **display-safe projection は destination の clean なラベルを露出しない**（`plan-intelligence-projection-types.ts`: `answer.text` / `whyThisPlan` 等の**説明文のみ**・構造化 `destination`/`area`/`placeLabel` field 無し）。
- → **★ 結論: confirmed destination areaText + visibility は `provided.input.slots`（adapter 内部・server-only）にしか取れない。adapter が返った後の display result からは安全に取れない。**
- 既存: `TravelExternalLinks`（href model[] を render・空→null・cue と別・実装済）/ `prepareSafeTravelLinkHrefModels`（intents→models・pure）/ `buildGeneratedMapsSearchIntent`（confirmed shared-safe→generated intent）/ `buildSafeTravelLinkHrefModel`。
- production フォームは destination+date のみ（**manual URL 入力欄なし**）。adapter は契約で「safe links / Maps URL 生成なし」を宣言（line 14）。

---

## 1. まず前提を疑う（①）— これが次か？
| 候補 | リスク | 価値 | 評価 |
|---|---|---|---|
| **B-D producer/consumer 配線（本書）** | 中（adapter 契約更新 + render 変化 + flag 要） | 高（ladder の payoff＝link が初めて画面に出る） | **推奨・次（設計のみ）**。ただし実装は **A（pure 合成 helper）先行**で挙動不変から |
| Tier1-C render distinction（生成/手動の区別 badge） | 低 | 中 | 後（link が render された後で意味を持つ） |
| SQL/RLS persistence | **高**（DB migration＝§1 CEO 承認） | 中 | 後 |
| M2 production merge | 中 | — | 後（CEO 既決で後） |
| E production deny release | 最大 gate | — | **最後** |

**推奨: B-D 次・docs-only。実装は SPLIT で「A pure 合成 helper のみ」先行。** 根拠（①⑤）: D-A で transport の器は出来た。残るは「confirmed destination → externalLinks を作る producer」と「panel が読む consumer」。だが **producer は adapter 契約を越え、consumer は ready render を変える（href が出る）**ため、まず **挙動を変えない pure 合成 helper（A）**を置き、配線（B+E）は flag 付きで別 GO。

### ★ 設計の核①（①②）— 「後付け enrichment（C）」は grounding 上 不可能
CEO 推奨方向は「adapter の後で動く分離 enrichment が externalLinks を append」だった。だが **grounding で判明: confirmed destination label は display result に無く（projection は説明文のみ）、再 bind しない限り後付け層は label を取得できない**。よって:
- **却下: pure 後付け enrichment（display result だけ読む C）** — label を取れない。
- **却下: 再 bind する wrapper（C′）** — bind/provider を二重実行＝drift・無駄。
- **採用（A′）: 生成/preparation の「ロジック」は分離 pure helper に置き、その helper を「データを持つ唯一の場所＝adapter ready 分岐」が呼ぶ**。adapter は「データ供給 + attach」だけを担い、ロジックは持たない。adapter 契約は**明示的に（silent でなく）更新**。

### ★ 設計の核②（③④）— 挙動変化は flag で隔離
B（adapter が link を作る）+ E（panel が render）は **ready render に href を足す**＝既存 panel test（ready view に「href なし」を assert）を壊す。よって配線は **flag（default OFF・既存 travel-live gate に従属・production deny）**で隔離し、OFF 時は完全に従来挙動（test green・dark-launch）。

---

## 2. 現状（②）
- `TravelPlanDisplayPayload.externalLinks?` 存在（D-A）。**producer 未 set・consumer 未読**。
- `TravelExternalLinks` 存在・`SafeTravelLinkHrefModel[]` を受ける。
- `prepareSafeTravelLinkHrefModels` / `buildGeneratedMapsSearchIntent` / `buildSafeTravelLinkHrefModel` 存在。
- adapter ready 分岐に `provided.input`（slots 含む）。
- production フォームに manual URL 入力なし。adapter は「safe links / Maps 生成なし」を宣言。

## 3. intent 源の現実（§3・①）
- **generated 源は存在**: ready 分岐の `provided.input.slots` に confirmed destination_area / areaText。shared-safe なら server が `buildGeneratedMapsSearchIntent` を呼べる。
- **manual 源は production に無い**: URL 入力欄なし・retrieval 源なし・永続 manual intent 源なし。
- → **最初の配線は generated Maps 検索 link 1 本のみ**。manual は将来 URL/retrieval phase まで空。**manual intent を捏造しない**（honesty）。

## 4. producer 責務（§4）
- producer = **server/display 層（adapter ready 分岐 が「データ供給 + 呼び出し + attach」）**。
- producer は `buildGeneratedMapsSearchIntent` / `prepareSafeTravelLinkHrefModels` を呼んでよい（**分離 pure helper 経由**・§6）。
- **UI から呼ばない**。
- **confirmed/shared-safe な destination/entity ラベルのみ**使用（owner shared かつ visibility shared）。
- **private/M2 ラベル不可**・**proposed/unconfirmed destination 不可**。
- **raw intents を UI に出さない**・**raw diagnostics を出さない**・**fetch/read/scrape なし**・**Maps/Places API なし**。

## 5. consumer 責務（§5）
- `TravelLivePanel` は **`display.externalLinks` のみ**読む。
- `display.externalLinks ?? []` を `TravelExternalLinks` に渡す。
- panel は **import しない**: `prepareSafeTravelLinkHrefModels` / `buildGeneratedMapsSearchIntent` / `buildSafeTravelLinkHrefModel`。
- panel は **raw `SafeTravelLinkIntent` を受けない**・**eligibility を推論しない**・**URL を生成しない**。

## 6. adapter 契約変更（§6・①比較）— grounding 反映
| 案 | 内容 | 評価 |
|---|---|---|
| A. adapter が生成/preparation を**直接**所有 | ready 分岐に生成ロジックを書く | △ データは在るが adapter がロジックで肥大・契約を silent に越える |
| B. server action が所有 | action が enrich | ✗ **action は confirmed label を持たない**（display result に無い）→ 再 bind 要・不可 |
| C. 分離 enrichment helper が**後付け**で所有 | display result を読んで append | ✗ **grounding で却下**: label が result に無く再 bind なしでは不能 |
| **A′（推奨）. 分離 pure helper が「ロジック」所有 + adapter が「データ供給 + 呼び出し + attach」** | `buildTravelExternalLinks(input)` を adapter ready 分岐が `provided.input` から呼ぶ・**契約は明示更新** | **◎ 推奨**。ロジックは分離（testable・adapter 非肥大）・データ重複なし・契約 silent 拡大を回避（明示更新 + flag 隔離） |

**推奨: A′。** 生成/preparation の**ロジックは分離 pure helper `buildTravelExternalLinks`**（独立テスト可）に置き、**adapter ready 分岐がデータ（confirmed destination label/visibility）を供給して呼び、結果を `display.externalLinks` に attach**。adapter docstring の「safe links なし」は **「flag 有効時のみ confirmed shared-safe destination から generated Maps 検索 hand-off を産出し得る」へ明示更新**（silent 拡大しない）。生成は **flag default OFF**（§10）。
> ★ premise note（①）: CEO 推奨の「後付け分離 enrichment」は意図として正しい（adapter を core display builder に保つ）が、**grounding 上 label を取得できない**。本 A′ はその意図（ロジック分離・adapter 非肥大）を保ちつつ、データが在る唯一の場所から呼ぶ現実解。

## 7. generated Maps link ルール（§7）
- **confirmed/shared-safe な destination_area ラベル、または明示 confirmed entity ラベルからのみ**生成。
- output `source: generated_maps_search`・`generated: true`。
- label: 「地図で検索する」。
- confirmed/shared-safe でなければ **null**（Tier1-C が保証）。
- **exact place 主張なし**・**availability/price/route/booking 主張なし**・**private/user/M2 data なし**・**tracking param なし**・**API key なし**。

## 8. display payload ルール（§8）
- ready display は externalLinks を持ち得る。
- **not-ready / unavailable / invalid は持てない**（**構造的に `display` を運ばない**＝D-A の型保証）。
- externalLinks は **href model のみ**（raw intents / raw diagnostics / authoritative packet / engine output / private state なし）。
- field は **absent または空**でよい（flag OFF / not shared-safe → 空 or 不在）。

## 9. UI placement（§9）
- `TravelExternalLinks` は **CoAlter cue の外**に配置済。
- link は `travel-live-cues` と**別**のまま。
- **booking/calendar/action button なし**・**CoAlter input/send なし**・**raw URL text なし**・**中立 hand-off copy のみ**。

## 10. production live gate との関係（§10）
- 配線は **既存 server-only travel live gate（`isPlanTravelLiveAllowed`）の下**のまま。
- **生成 flag は default OFF**・**preview flag は production link 生成を有効化しない**・**production deny は HOLD**・**gate ルール変更なし**・**release 挙動変更なし**。
- ★ flag 検査位置: gate は action が検査。adapter は **opt-in param（例 `gate.externalLinksEnabled` 等）**で渡され、未指定→生成しない。production は常に deny。

## 11. privacy（§11）
- 生成 URL に **private `red_line`/`preference` なし**・**raw userId なし**・**M2/Stargazer data なし**・**participant/relationship state なし**。
- label に **private rationale なし**。
- **client-only filtering 禁止**。
- **raw intent list は server-side に留める**（UI には href model のみ）。

## 12. 実装オプション + 推奨（§12・⑤）
| 案 | 内容 | 評価 |
|---|---|---|
| **A. pure 合成 helper のみ** | `buildTravelExternalLinks(input)`（生成+preparation を内部合成・**未配線**） | **推奨・最初**（pure・挙動不変・独立テスト可） |
| B. adapter が A を呼ぶ | ready 分岐で flag 付き enrich | 後（契約明示更新 + flag・render 変化） |
| C. server action が A を呼ぶ | — | ✗（label 不所持・再 bind 要） |
| D. action-state が externalLinks を運ぶ | — | **D-A で自動**（display を丸ごと運ぶ・追加不要） |
| E. panel が `display.externalLinks` を渡す | `?? []` を component へ | 後（B が供給して初めて意味・既存 ready test 更新 or flag OFF 維持） |
| F. A-E 一括 | — | **却下**（契約越え + render 変化 + test 影響を一括は外科性を損なう） |

**推奨実装スライス: A のみ（pure `buildTravelExternalLinks` helper・配線なし・挙動不変）。**
```
// スケッチ（未実装・pure）
import type { Visibility } from "./core-types";
import type { SafeTravelLinkIntent } from "./safe-link-types";
import type { SafeTravelLinkHrefModel } from "./safe-link-href-types";
import { buildGeneratedMapsSearchIntent } from "./generated-maps-search";
import { prepareSafeTravelLinkHrefModels } from "./safe-link-preparation";

interface BuildTravelExternalLinksInput {
  destination?: { label: string; status: "confirmed" | "unconfirmed" | "missing"; visibility: Visibility };
  entity?: { label: string; confirmed: boolean; visibility: Visibility };
  manualIntents?: SafeTravelLinkIntent[]; // 将来 URL 収集 phase 用・現状 caller は渡さない＝[]
}
function buildTravelExternalLinks(input: BuildTravelExternalLinksInput): SafeTravelLinkHrefModel[] {
  const intents: SafeTravelLinkIntent[] = [...(input.manualIntents ?? [])];
  const d = input.destination, e = input.entity;
  // generated は destination/entity から（Tier1-C が confirmed+shared を gate・else null）
  const gen = d
    ? buildGeneratedMapsSearchIntent({ query: d.label, destinationStatus: d.status, visibility: d.visibility, label: "地図で検索する" })
    : e
      ? buildGeneratedMapsSearchIntent({ query: e.label, destinationStatus: "missing", entityConfirmed: e.confirmed, visibility: e.visibility, label: "地図で検索する" })
      : null;
  if (gen) intents.push(gen);
  return prepareSafeTravelLinkHrefModels(intents); // 順序・dedupe・marker guard・eligible のみ
}
// 後の B: adapter ready 分岐が provided.input.slots から destination を抽出し（confirmed destination_area の
//   areaText/status/visibility）、flag ON 時のみ buildTravelExternalLinks を呼び display.externalLinks に attach。
// 後の E: panel が display.externalLinks ?? [] を TravelExternalLinks へ。
```
- **B（adapter 呼び出し・flag）/ E（panel 配線）/ production deny は HOLD。** B+E 時は flag OFF 既存 test green・ON 時のみ既存 ready test 更新（href が出る）。

## 13. 将来 test（§13・実装時）
**A（pure helper）slice**:
- confirmed shared destination → generated maps externalLink 1 本。
- unconfirmed/proposed/missing → externalLinks 空。
- private destination label（visibility private）→ 空。
- manualIntents を渡せば混在（順序: manual→generated）。
- 生成/fetch/Maps API/DB import なし・deterministic・入力非破壊。
**B+E（配線）slice（flag 付き・別 GO）**:
- ready confirmed shared destination → externalLinks に 1 本（flag ON）。
- flag OFF → externalLinks 不在（既存挙動・既存 test green）。
- not-ready/unavailable/invalid → externalLinks 無し（構造保証）。
- `TravelLivePanel` が `display.externalLinks` を `TravelExternalLinks` へ渡す。
- panel は prep/generation helper を import しない・raw intent が届かない。
- link は external section に render・href === 生成 handoff URL・cue と別。
- **booking/calendar/action copy なし**・**Maps/Places API なし**・**fetch/API/DB/Supabase なし**・**CoAlter/useCoAlter なし**・**`/talk` なし**。
- **tsc baseline 不変（55）**・既存 travel tests green（A は新規 helper・挙動不変／B+E は flag OFF で不変）。

---

## 14. Stop
- 本書（B-D Producer/Consumer Links Wiring Design）で**停止**。
- 配線実装は **CEO 承認まで行わない**（A pure helper も含め GO 待ち）。

---

## 出力サマリ
- **前提（①⑤⑧）**: 次は **B-D（producer/consumer 配線・docs-only）**、実装は **SPLIT で「A pure 合成 helper のみ」先行**を推奨。D-A で器は出来たが producer/consumer 未配線。A（挙動不変の pure helper）→ B+E（flag 付き配線・別 GO）の段階。
- **★ grounding 決定打（①②）**: confirmed destination label + visibility は **`provided.input.slots`（adapter 内部・server-only）にしか無く、display result（projection は説明文のみ）からは取れない**。よって CEO 推奨の「後付け分離 enrichment（C）」は再 bind なしでは不能。**A′（ロジックは分離 pure helper・データは adapter ready 分岐が供給して呼ぶ・契約は明示更新）**を推奨。再 bind wrapper（C′）は drift/無駄ゆえ却下。
- **intent 源の現実（①）**: generated 1 本のみ実在（confirmed shared-safe destination）。manual は production 源なし＝空（捏造しない）。
- **挙動隔離（③④）**: B+E は ready render に href を足す＝既存 panel test を壊すため、**flag（default OFF・既存 gate 従属・production deny）**で隔離。OFF 時従来挙動・dark-launch。
- **honesty（⑥⑦）**: not-ready/unavailable/invalid は **構造的に externalLinks を持てない**（D-A 型保証）。href model は display 派生で recompute。raw intent は server-side に留め UI には href model のみ。
- **推奨実装スライス**: **A（pure `buildTravelExternalLinks`・生成+preparation 合成・配線なし・挙動不変・独立テスト）**。**B（adapter 呼び出し・flag・契約明示更新）/ E（panel 配線）/ C/F / production deny は HOLD。D は D-A で自動。**
- 本フェーズは **docs-only** — コード/型/テスト不変・tsc 55・push なし・production 非接触。
