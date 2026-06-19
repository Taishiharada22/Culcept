# Tier1-B — Safe Link Href Render Design（docs-only）

> 設計フェーズ（phase-by-phase）。**コード変更なし**。実装は CEO 承認後・本 phase のみ。Maps 生成（Tier1-C）/UI render は HOLD。
> 上位文脈: Tier1-A（inert `SafeTravelLinkIntent`）の上。eligible な inert 参照を **user-visible external href** にする境界。
> 既存: Tier1-A `SafeTravelLinkIntent`（externalReference.value・inert/actionable:false/rendered:false/fetched:false・eligibility）。
> 原則: ①前提を疑う ②grounding ③シンプル→論理 ④外科的 ⑤ゴール逆算。

---

## 1. まず前提を疑う（①）
| 候補 | 評価 |
|---|---|
| **Tier1-B href render**（本書） | **推奨・次（設計のみ）**。製品 terminal（予約直前まで→外部 hand-off）。だが **already-supplied manual inert 参照を render するだけ**（生成/fetch/search なし）で Tier1-C より安全 |
| Tier1-C Maps URL generation | 後（URL 生成 gate・別 GO） |
| SQL/RLS persistence | 後（§1） |
| M2 production merge wiring | 後（CEO: production action へ merge しない） |
| E production deny release | **最後** |

**推奨: Tier1-B 次・docs-only。** 根拠（①⑤）: Tier1-A で inert 参照と eligibility は揃った。Tier1-B は「**eligible な inert 参照を display-safe な href model に変える**」境界。**URL を生成も fetch もせず**（manual 供給済の URL を render するだけ）、製品の hand-off 出口に最短で近づく。推奨実装は **A+B（model + helper・UI なし）**。

### ★ 設計の核（①③）— 「href model」と「href UI render」を分離
Tier1-B を **(A+B) display-safe href model + helper** と **(C) UI render** に分離。本 phase の実装推奨は **A+B のみ**（pure・UI なし）。`<a href>` を実際に描く C は別 GO。これで「eligible → href にしてよいか」の純粋判定を、外部遷移 UI を開かずに固められる。

---

## 2. 現在の safe-link 状態（§2）
- Tier1-A `SafeTravelLinkIntent`: `inert:true`・`actionable:false`・`rendered:false`・`fetched:false`・`externalReference.value`・**no href**・**no generated URL**・**no UI**・**no external navigation**。
- **Tier1-A が保証**: inert metadata 保持 + eligibility 判定のみ（href 化・遷移・生成なし）。
- **Tier1-B が新たに開くもの**: eligible inert 参照 → **user-visible external href（の model）**。

---

## 3. Tier1-B problem（§3）
- Tier1-A は inert metadata only。
- Tier1-B は **user-visible external navigation** を作る。
- href は copy 次第で **trust/action を含意**し得る。
- href は **booking/availability/price/route/confirmation/recommendation を含意してはならない**。
- href は **private user state を含めてはならない**。
- href は **unconfirmed destination/entity intent から作ってはならない**。

---

## 4. href eligibility（§4）
- **`eligibility === "eligible"` の `SafeTravelLinkIntent` のみ**。
- manual 供給/user-provided/manual official/manual maps 参照のみ。
- `invalid_url` → href にしない。
- `ineligible_unconfirmed` → href にしない。
- `ineligible_no_destination` → href にしない。
- **proposed/unconfirmed destination → href にしない**。
- `manual_entity_evidence` 単独では destination/date/participants を hard-confirm しない。
- **private preference / M2-derived soft state から href を作らない**。

## 5. 許可 href source（§5）
- 以前 inert metadata として carry した **user-provided URL**。
- 手動供給 official URL。
- 手動供給 Maps URL。
- **Tier1-B で生成 Maps URL なし**。
- retrieval 供給 official URL は別承認まで HOLD。
- web-searched URL なし。
- OTA/affiliate/partner URL は別承認まで HOLD。

## 6. 禁止 href source（§6）
生成 Maps 検索 URL / Google Maps・Places API 結果 / scraped URL / web search 結果 / OTA・affiliate・partner 結果 / place 名から推論した URL / destination text から推論した URL / private red_line・preference を含む URL / raw userId を含む URL / M2・Stargazer data を含む URL / raw diagnostics 由来 URL。

## 7. href safety ルール（§7）
- **external hand-off としてのみ** render（C 実装時）。
- target=_blank を使うなら **safe external-link 属性**（`rel="noopener noreferrer"`）。
- **URL を mutate しない**・**tracking param を付けない**・**private preference を encode しない**。
- manual 供給 URL が曖昧でも **exact place と主張しない**。
- **availability/price/cancellation を主張しない**。
- **render 時に fetch/verify しない**・**prefetch しない**・**link preview fetch を作らない**。

## 8. copy ルール（§8）
- **許可**: 「外部で確認する」「地図で見る」「これは予約ではありません」「外部サイトで確認してください」「手動で確認してください」。
- **禁止**: 「予約する」「空きあり」「最安」「確定」「この場所にする」「スケジュールに追加」「今すぐ行く」「この案で決定」。

## 9. privacy（§9）
href は **private red_line/preference を含めない**・**raw userId を含めない**・**M2/Stargazer data を含めない**・**participant/relationship state を encode しない**。href label は **private rationale を露出しない**。**client-only filtering 禁止**。shared view は **shared-safe data からのみ**生成。

## 10. TravelLivePanel との関係（§10）
- link 表示は **CoAlter cue section と分離**（cue ガイダンス内に link affordance を出さない）。
- **booking/calendar/action button なし**・**send/realtime/read receipt なし**・**useCoAlter なし**・**`/talk` なし**。
- 現 read-only travel panel は neutral のまま。
- href UI が後で実装されるなら **visibly external かつ non-authoritative**。

## 11. Tier1-C との関係（§11）
- Tier1-C 生成 Maps URL は **HOLD**。
- **Tier1-B は URL を生成しない**。
- Tier1-B は **already supplied manual inert 参照を render するだけ**。
- Maps 検索 URL 生成は **別設計 + CEO GO**。

## 12. durable state との関係（§12）
- persist された `SafeTravelLinkIntent` は **Tier1-B render まで inert のまま**。
- href render は **display-safe eligible intent のみ** read。
- **raw provider diagnostics / authoritative packet / engine output / private state なし**。
- **本 phase で DB 実装なし**。

---

## 13. 実装オプション + 推奨（§13・CEO 承認で着手）
| 案 | 内容 | 評価 |
|---|---|---|
| **A. pure display-safe href model 型** | `SafeTravelLinkHrefModel`（external:true・authoritative:false・no booking/price/private） | 推奨バンドル前提 |
| **B. pure helper（eligible inert → display-safe href model）** | `buildSafeTravelLinkHrefModel(intent)`（eligible のみ・URL 改変/生成/fetch なし・else null） | ◎ 推奨 keystone |
| C. TravelLivePanel href render（live gate 下） | `<a href target=_blank rel=noopener>` | **後（別 GO・外部遷移 UI）** |
| D. dev preview href render | dev | 後 |
| E. href HOLD・Tier1-C へ | — | 代替 |

**推奨実装スライス: A + B（pure model + helper・UI render なし）。**
```
// スケッチ（未実装）
interface SafeTravelLinkHrefModel {
  kind: "external_handoff";
  handoffUrl: string;       // eligible inert URL（unchanged・no tracking/private）
  label: string;            // 中立 copy（予約語なし）
  external: true;           // visibly external
  authoritative: false;     // 非権威・予約/確定でない
  // ★ UI(C) は href={handoffUrl} + target=_blank + rel="noopener noreferrer" を付与（本 model は data のみ）
  // 非所持: booking/availability/price/confirmation/generatedUrl/private/userId/M2
}
// helper（pure・no 生成/fetch/改変）:
//   buildSafeTravelLinkHrefModel(intent: SafeTravelLinkIntent): SafeTravelLinkHrefModel | null
//     - intent.eligibility === "eligible" のみ → model（handoffUrl = intent.externalReference.value・unchanged）
//     - invalid_url / ineligible_* → null（href にしない）
//     - URL を生成/fetch/改変/tracking 付与しない・private を encode しない
```
- **UI render（C）/ Maps 生成（Tier1-C）/ 外部遷移 / production deny は HOLD**。

## 14. 将来 test（§14・実装時）
- eligible inert user-provided link → **display-safe href model** にできる。
- `invalid_url` → href にできない（null）。
- unconfirmed destination → href にできない。
- missing destination → href にできない。
- proposed destination → href にできない。
- href model に **private red_line/preference なし**・**raw userId なし**・**M2/Stargazer data なし**。
- **生成 Maps URL なし**。
- fetch/API/DB/Supabase import なし・Google Maps/Places API import なし・web search なし・**URL prefetch なし**。
- **booking/calendar/action authority なし**。
- **CoAlter/useCoAlter なし**・**`/talk` なし**。
- **禁止 copy なし**。
- **tsc baseline 不変（55）**・既存 travel tests green。

---

## 15. Stop
- 本書（Tier1-B Safe Link Href Render Design）で**停止**。
- Tier1-B 実装は **CEO 承認まで行わない**（UI render/Maps 生成/外部遷移は HOLD）。

---

## 出力サマリ
- **前提（①③）**: Tier1-B を **A+B（display-safe href model + helper）** と **C（UI render）** に分離。本 phase 推奨は A+B のみ（pure・UI なし・**URL 生成も fetch もしない**・manual 供給済 URL のみ）。
- **eligibility**: `eligibility==="eligible"` の inert 参照のみ href model 化。invalid_url/ineligible_*/proposed/unconfirmed → null。private/M2 由来から href を作らない。
- **safety/privacy**: URL を改変/生成/fetch/prefetch せず・tracking/private/userId/M2 を含めず・availability/price/cancellation/booking を主張せず。copy は「外部で確認する/地図で見る/これは予約ではありません」（予約する/空きあり/最安/確定 等 禁止）。
- **推奨実装スライス**: **A（`SafeTravelLinkHrefModel`）+ B（`buildSafeTravelLinkHrefModel`・eligible のみ・no 生成/fetch/改変）**。**C（panel href UI）/ D（dev href）/ Tier1-C（Maps 生成）/ 外部遷移 / production deny は HOLD**。
- 本フェーズは **docs-only** — コード/型/テスト不変・tsc 55・push なし・production 非接触。
