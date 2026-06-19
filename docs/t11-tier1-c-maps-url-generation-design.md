# Tier1-C — Maps URL Generation Design（docs-only）

> 設計フェーズ（phase-by-phase）。**コード変更なし**。実装は CEO 承認後・本 phase のみ。
> DB・RLS / M2 runtime / CoAlter runtime / 外部遷移 production release は HOLD。
> 上位文脈: Tier1-A（inert `SafeTravelLinkIntent`）→ Tier1-B A+B（`SafeTravelLinkHrefModel`+helper）→ Tier1-B-C（`TravelExternalLinks` render）の上。**confirmed destination/entity から Maps 検索 URL を「生成」する**初めての境界。
> 既存: 全 link は今まで **manual/user 供給 URL のみ**（生成ゼロ）。本書で初めて「URL を作る」を開く。
> 原則: ①前提を疑う ②grounding ③シンプル→論理 ④外科的 ⑤ゴール逆算 ⑥人間同等の推論設計 ⑦超越的アイデア ⑧世界トップシェア。

---

## 0. grounding（②・実コード精査）
- `SafeTravelLinkSource = "user_provided" | "manual_official" | "manual_maps"` … **全て手動・生成ゼロ**（`lib/shared/travel/safe-link-types.ts:16`）。
- `SafeTravelLinkIntent`: `externalReference.value`（**field 名 `url` を避け inert を明示**）/ `inert:true` / `actionable:false` / `rendered:false` / `fetched:false` / `eligibility`。**`generatedUrl` を構造的に持たない**。
- `buildSafeTravelLinkIntent`（Tier1-A）: syntactic check のみ（`^https?://\S+$`・空白不可）・**fetch/生成しない**。`destinationStatus: confirmed|unconfirmed|missing` + `entityConfirmed?` で eligibility 判定。**ineligible でも user 供給 URL を inert carry**（URL は既に存在するため）。
- `buildSafeTravelLinkHrefModel`（Tier1-B）: `eligibility==="eligible"` のみ → href model。source を**問わない**（generated でも通る）。
- **★ honesty の核（grounding 由来）**: `DestinationAreaValue = { areaText: string; placeRefId? }`（`slot-types.ts:152`）。**`areaText` はユーザー自由文字列**。`placeRefId`（地名解決）は**外部解決後のみ付与され、本パイプラインに解決層は無い（HOLD）**。
  → **confirmed destination_area ＝「場所が解決済み」ではない。areaText は未検証ラベル。** よって Tier1-C が作れるのは **検索 hand-off だけ**で、**決して「これがその場所」ではない**。
- slot の `owner`(shared|participant) / `visibility`(shared|private)。form_input の destination_area は default shared だが、**private owner/visibility の値は URL に入れてはならない**（§12）。
- **travel lib に Maps/Places API・fetch・URL 生成は皆無**（Tier1-C が生成を導入する唯一の場所）。

---

## 1. まず前提を疑う（①）— これが次か？
| 候補 | リスク | 価値 | 評価 |
|---|---|---|---|
| **Tier1-C Maps URL 生成**（本書） | 低（pure・外部データ無し・deterministic・session 内完結） | 高（A→B→B-C の link ladder の**最後の能力欠落**を埋める） | **推奨・次（設計のみ）**。「URL を持っていない confirmed 行き先」に対し、ユーザー自身が地図で確認できる検索 hand-off を渡す。製品約束「予約直前まで→hand off」の純粋な完成 |
| SQL/RLS persistence | **高**（DB migration＝CLAUDE.md §1 CEO 承認・RLS security） | 中（reload 越え。だが本トラックは意図的に stateless＝useActionState transport） | 後。表示/hand-off 経路が feature-complete になってから。core loop には不要 |
| M2 production merge wiring | 中 | — | 後（CEO 既決: production action へ merge しない） |
| CoAlter runtime | **高**（talk/realtime の大規模新 runtime 面） | 中 | 後。G で read-only cue 表示は runtime 無しで達成済み |
| E production deny release | 最大 gate | — | **最後**（明示） |

**推奨: Tier1-C 次・docs-only。** 根拠（①⑤⑧）: A→B→B-C で「**供給済 URL を安全に保持→href 化→render**」は完成した。残る能力欠落は唯一「**URL を供給していない confirmed 行き先**に対する hand-off」。Tier1-C はこれを **外部 API も fetch も使わず deterministic な文字列構築のみ**で埋める。重い gated 作業（persistence/runtime/release）の前に倒すべき、**最後の pure・低リスクスライス**。推奨実装は **A+B（生成 intent 型 + helper・UI 変更なし）**。

### ★ 設計の核①（③⑥⑦）— 「生成＝検索 hand-off」であって「場所の主張」ではない
`areaText` は未解決の自由文。だから Tier1-C の生成物は本質的に **「正確な場所は分からない。あなた自身が地図で検索して確かめてください」** という hand-off である。
**これは弱点ではなく AGENCY の核**（⑦）: アプリが「ここがその場所」と権威的に断定するのではなく、**ユーザー自身の検証へ手渡す**。製品哲学（自分の選択・自分で理解・予約直前まで準備して手渡す）と完全整合。生成 URL は **権威の主張ではなく、ユーザーの検証行為への hand-off**。

### ★ 設計の核②（③④）— 「生成」と「href 化」を最後まで分離
Tier1-C は **inert な `SafeTravelLinkIntent`（生成印 `generated:true`・source `generated_maps_search`）を作るだけ**。href 化は既存 Tier1-B helper、render は既存 Tier1-B-C。**新しい render 経路を作らない**。生成 URL も「eligible と判定され UI が描く」まで inert。

---

## 2. 現在の link 状態（②grounding）
- **Tier1-A**: inert `SafeTravelLinkIntent`（manual URL を **触らず保持**・href/生成/fetch なし・eligibility 判定のみ）。
- **Tier1-B A+B**: `SafeTravelLinkHrefModel`（`handoffUrl`=`externalReference.value` unchanged・`external:true`/`authoritative:false`/`rendered:false`）+ `buildSafeTravelLinkHrefModel`（eligible のみ→model・else null・**URL 生成/fetch なし**）。
- **Tier1-B-C**: `TravelExternalLinks`（href model[] を read-only render・cue と別 section・**生成/fetch なし**・未配線）。
- **manual URL only**: 上記すべて **URL はユーザー/手動供給**。アプリは URL を**一度も作っていない**。
- **no-generation のまま**: Maps 検索 URL 生成・地名解決・place pin・route・座標 — 全て不在。
- **Tier1-C が新たに開くもの**: **confirmed destination/entity ラベルから Maps 検索 URL を「構築」**（外部 API 無し・deterministic string build）。これがアプリが URL を作る初めての・唯一の場所。

---

## 3. Tier1-C problem（③）
- **Maps 検索 URL の生成 ≠ 供給済 URL の render**。前者はアプリが文字列を作る（新カテゴリ）。
- copy 次第で **「これがその場所」と含意**し得る（`areaText` は未解決ゆえ honesty 違反になる）。
- 生成 URL は **検索 hand-off** として扱う（exact place ではない）。
- 生成 URL は **route / availability / price / booking / recommendation を含意してはならない**。
- 生成 URL は **private user state を含めてはならない**。
- 生成 URL は **proposed/unconfirmed destination から作ってはならない**（未確定を「検索できる場所」と見せない）。

---

## 4. 許可 generation source（§4・④）
- **confirmed `destination_area` の `areaText`**（status=confirmed＝explicit surface 由来・**shared-safe**＝owner shared かつ visibility shared）。
- **明示束縛された confirmed entity ラベル**（helper input が明示供給・`entityConfirmed===true`）。
- **shared-safe な area/entity ラベルのみ**。
- **明示供給された public 住所**（input が明示した場合のみ）。
- **不可**: proposed/unconfirmed destination / private preference / M2・Stargazer data / raw userId / participant・relationship state。

## 5. 禁止 generation source（§5）
proposed destination / unconfirmed destination / `manual_entity_evidence` 単独（confirmed destination/entity 束縛なし）/ private `red_line`・`soft_preference` / private rationale / M2 soft preference / raw diagnostics / raw provider input / raw `TravelPlanEngineOutput` / raw `FitResult` / **自由文から推論した place 名（confirmation なし）** — すべて禁止。
> ★ honesty（⑥）: 「会話で行き先っぽい語が出た」だけでは生成しない。**explicit surface で confirmed になった `areaText`、または明示束縛 entity ラベルのみ**。推論された地名を「検索できる確定地」と見せない。

## 6. generated URL semantics（§6）
- 出力は **Maps 検索 URL のみ**（place pin / directions / coordinates ではない）。
- label は **検索 / hand-off** を示す（「地図で検索する」「検索結果を開きます」）。
- exact entity が**明示 confirmed の時を除き** exact place を主張しない。
- **正しさを主張しない**・**availability を主張しない**・**route/distance/duration を主張しない**・**price を主張しない**・**booking なし**。
- **auto-open なし**・**ユーザークリックのみ**。

## 7. URL construction rules（§7・④）
- **deterministic な pure helper のみ**（実装時）。`Date.now`/`Math.random` 不使用。
- **base URL は固定・レビュー済の単一定数**（`MAPS_SEARCH_BASE`・swap 可能・CEO レビュー対象）。
- query は **confirmed shared-safe ラベル/住所のみ**から構築（destination_area の areaText、または明示 entity ラベル）。
- **標準 URL encode**（`encodeURIComponent`）で query をエスケープ。
- **tracking param なし**・**private param なし**・**userId なし**・**M2/Stargazer field なし**・**budget/pace/mobility field なし**。
- **route/weather/place の live enrichment なし**。
- **API key なし**・**Google Maps / Places API 呼び出しなし**（生成は文字列構築のみ・SDK/fetch 不使用）。
> ★ 注（②）: 検索 hand-off endpoint の `api=1` 等の scheme version param は **API key ではない**（keyless・公開 URL scheme）。定数は単一 source-of-truth として CEO レビュー。**「アプリが URL を作る」唯一の場所がこの 1 定数 + encode**であり、監査面を最小化する（④）。

## 8. output contract（§8）
**生成物 = inert な `SafeTravelLinkIntent`**（href model を直接作らない＝既存 ladder を再利用）。明示マーク:
- `source: "generated_maps_search"`（**新 union member・additive**）。
- `generated: true`（**新 optional marker・additive**。manual は absent/false＝**生成と手動を構造的に区別**）。
- `externalReference.value` = 構築した検索 URL（**inert・`value` field のまま**・href にしない・別 `generatedUrl` field を作らない）。
- `eligibility: "eligible"`（**confirmed 時のみ生成するため**。unconfirmed/missing → 後述のとおり **null＝生成しない**）。
- `inert:true` / `actionable:false` / `rendered:false` / `fetched:false`（＝not booking・非権威）。
- **持たない**: availability / price / route / booking / calendar / action / diagnostics（client へ出さない）。
> ★ href model 側（Tier1-B が後で作る `SafeTravelLinkHrefModel`）が `external:true` / `authoritative:false` を担う。intent では **source + generated + inert + actionable:false** が「external・非権威・not booking」を表す。
> ★ **ineligible は生成しない（null）**: Tier1-A は供給済 URL を ineligible でも carry したが、Tier1-C は **URL を捏造しない**。unconfirmed/missing → `null`（生成ゼロ）。これが Tier1-A との honesty 上の差。

## 9. Tier1-B との関係（§9・④）
- Tier1-C は **生成 inert intent** を産出（href model は産出しない）。
- 実際の UI render は **model が display-safe になった後、既存 Tier1-B-C のみ**を再利用（`生成 intent → buildSafeTravelLinkHrefModel → TravelExternalLinks`）。
- **Tier1-C は `TravelExternalLinks` の挙動を変えない**。
- 生成 URL は **別 source kind（generated_maps_search）**のまま。
- **manual URL の render は一切影響を受けない**（additive・既存 source/builder 不変）。
- ★ ただし honesty 上、UI で「検索（generated）」と「手動 URL」を区別表示したい場合は **別スライス（Tier1-C-render）**。本 A+B では UI 不変。

## 10. production live gate との関係（§10）
- UI 接続される場合も **既存 server-only travel live gate（`isPlanTravelLiveAllowed`）の下**のまま。
- **preview flag は production Maps 生成を有効化しない**（dev preview 文脈のみ）。
- **production deny release は HOLD**・**設計段階で gate ルール変更なし**。

## 11. copy ルール（§11）
**許可**: 「地図で検索する」「地図で見る」「外部で確認する」「検索結果を開きます」「これは予約ではありません」。
**禁止**: 「ここに行く」「この場所にする」「予約する」「空きあり」「最安」「確定」「スケジュールに追加」「今すぐ行く」「この案で決定」。

## 12. privacy（§12）
生成 URL は **private `red_line`/`soft_preference` を含めない**・**raw userId を含めない**・**M2/Stargazer data を含めない**・**participant/relationship state を encode しない**。生成 label は **private rationale を露出しない**。**client-only privacy filtering 禁止**。**shared-safe ラベルのみ**（owner shared かつ visibility shared）。

## 13. 実装オプション + 推奨（§13・⑤・CEO 承認で着手）
| 案 | 内容 | 評価 |
|---|---|---|
| **A. 生成 Maps 検索 intent 型（additive）** | `SafeTravelLinkSource` に `generated_maps_search` 追加 + `SafeTravelLinkIntent.generated?: boolean` 追加 | 推奨バンドル前提・**additive（既存不変）** |
| **B. 生成 helper（pure）** | `buildGeneratedMapsSearchIntent(input)` → 固定 base + `encodeURIComponent(label)`・confirmed のみ・else null・private 非 encode | ◎ 推奨 keystone |
| C. 生成 href model helper | 直接 href model 化 | 後（B→既存 Tier1-B で十分・ladder 二重化を避ける） |
| D. UI render（既存 TravelExternalLinks 経由） | dev/gate 下 render | 後（別 GO・生成印の区別表示含む） |
| E. Tier1-C HOLD・SQL/RLS へ | — | 代替（だが link ladder 未完で persistence は順序逆） |

**推奨実装スライス: A + B（生成 intent 型 + helper・UI render 変更なし）。**
```
// スケッチ（未実装）
// A: additive 型（既存 manual builder は generated を set しない＝absent）
type SafeTravelLinkSource = "user_provided" | "manual_official" | "manual_maps" | "generated_maps_search";
interface SafeTravelLinkIntent { /* …既存… */ generated?: boolean; } // ★ true=Tier1-C 生成・manual は absent

// B: pure 生成 helper（外部 API/fetch なし・文字列構築のみ・confirmed のみ・else null）
const MAPS_SEARCH_BASE = "<CEO レビュー済の固定 search endpoint>"; // 単一 source-of-truth・keyless
function buildGeneratedMapsSearchIntent(input: {
  query: string;                                    // confirmed shared-safe ラベル（areaText / 明示 entity）
  destinationStatus: "confirmed" | "unconfirmed" | "missing";
  entityConfirmed?: boolean;
  label: string;                                    // 中立 copy（「地図で検索する」・予約語なし＝caller 責務）
}): SafeTravelLinkIntent | null {
  const q = (input?.query ?? "").trim();
  if (q.length === 0) return null;                  // 空ラベル → 生成しない
  if (!(input.destinationStatus === "confirmed" || input.entityConfirmed === true)) return null; // ★ 未確定 → 生成しない
  const value = MAPS_SEARCH_BASE + encodeURIComponent(q); // ★ label のみ encode・private/userId/M2/budget 等は触れない
  return {
    source: "generated_maps_search", generated: true,
    externalReference: { kind: "url", value, inert: true },
    label: input.label, eligibility: "eligible",
    inert: true, actionable: false, rendered: false, fetched: false,
  };
}
// 生成 intent → （別 GO で）buildSafeTravelLinkHrefModel → TravelExternalLinks（既存 ladder 再利用）
```
- **C（href model 直結）/ D（UI render・生成印区別表示）/ 外部 API / production deny は HOLD。**

## 14. 将来 test（§14・実装時）
- confirmed destination ラベル → 生成 Maps 検索 intent を作れる（`source:"generated_maps_search"`・`generated:true`・`eligibility:"eligible"`）。
- confirmed entity ラベル（明示束縛）→ 生成できる。
- **proposed destination → 生成できない（null）**・**unconfirmed → null**・**missing → null**・**空ラベル → null**。
- value === `MAPS_SEARCH_BASE + encodeURIComponent(label)`（**ラベルのみ encode**）。
- **private `red_line`/`soft_preference` を encode しない**・**raw userId を encode しない**・**M2/Stargazer を encode しない**・**budget/pace/mobility を encode しない**。
- **tracking param なし**・生成 URL は **generated/search/non-authoritative とマーク**。
- **Google Maps / Places API import なし**・**fetch/API/DB/Supabase import なし**・**web search なし**・**URL reading/scraping なし**。
- **booking/calendar/action authority なし**。
- 禁止 copy なし（helper 自身に予約語を持たない）。
- **既存 manual builder/href model/`TravelExternalLinks` 不変**（additive）。
- **tsc baseline 不変（55）**・既存 travel tests green。

---

## 15. Stop
- 本書（Tier1-C Maps URL Generation Design）で**停止**。
- Tier1-C 実装は **CEO 承認まで行わない**（生成 helper・型拡張・UI render・外部 API・production release は HOLD）。

---

## 出力サマリ
- **前提（①⑤⑧）**: 次は **Tier1-C（Maps URL 生成・docs-only）** 推奨。A→B→B-C で「供給済 URL の保持→href→render」は完成し、残る能力欠落は唯一「URL を持たない confirmed 行き先への hand-off」。**外部 API も fetch も使わず deterministic 文字列構築のみ**で埋める最後の pure・低リスクスライス。persistence/runtime/release（重 gate）より先に倒す。
- **honesty 核（③⑥⑦）**: `areaText` は未解決自由文ゆえ、生成物は **「検索 hand-off」**であって「場所の主張」ではない。これは弱点でなく **AGENCY の核**（アプリが断定せずユーザーの検証へ手渡す）。未確定（proposed/unconfirmed/missing）→ **URL を捏造せず null**（Tier1-A との差）。
- **source/output（④⑧）**: 生成 inert `SafeTravelLinkIntent`（`source:"generated_maps_search"`・`generated:true`・`value`=検索 URL・`eligibility:"eligible"`・inert/actionable:false）。`generated` marker で **生成と手動を構造的に区別**。href model は産出せず **既存 Tier1-B→B-C ladder を再利用**（`TravelExternalLinks` 不変）。
- **construction/privacy（④⑫）**: 固定・CEO レビュー済の単一 `MAPS_SEARCH_BASE` + `encodeURIComponent(label)`。**confirmed shared-safe ラベルのみ encode**・tracking/private/userId/M2/budget/pace/mobility/route/weather/API key/Maps・Places API なし。copy は「地図で検索する/検索結果を開きます/これは予約ではありません」（ここに行く/この場所にする/予約する 等 禁止）。
- **gate**: 既存 server-only travel live gate の下・preview flag は production 生成を有効化しない・production deny release は HOLD・gate ルール不変。
- **推奨実装スライス**: **A（`generated_maps_search` source + `generated?` marker・additive）+ B（`buildGeneratedMapsSearchIntent`・pure・confirmed のみ・else null・外部 API/fetch なし）**。**C（href model 直結）/ D（UI render・生成印区別）/ 外部 API / production deny は HOLD。**
- 本フェーズは **docs-only** — コード/型/テスト不変・tsc 55・push なし・production 非接触。
