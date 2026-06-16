# C — Tier1 Safe Links / Maps URL Minimal-scope Design（docs-only）

> 設計フェーズ（phase-by-phase）。**コード変更なし**。実装は CEO 承認後・本 phase のみ。
> 上位文脈: B（current-user participant binding）完了後。confirmed destination/date/participant の上での**外部 hand-off 境界**。
> 既存原則: 候補レーンの **`externalId` inert / href にしない**（external link は別 gate）を踏襲・拡張。
> 原則: ①前提を疑う ②grounding ③シンプル→論理 ④外科的 ⑤ゴール逆算。

---

## 0. grounding
- travel lib（`lib/shared/travel`・`lib/plan/travel`）に **URL/href/maps/fetch は皆無**（外部 link は greenfield）。
- 既存 precedent: candidate/scheduled-draft display は `place.externalId` を **inert metadata**（href にしない・fetch しない）で carry。Tier1-A はこの「inert 外部 metadata」原則を踏襲。

---

## 1. まず前提を疑う（①）
| 候補 | 評価 |
|---|---|
| **C. Tier1 safe links / Maps URL**（本書） | **推奨・次**。だが実装は **Tier1-A（inert metadata のみ）**に限定。「予約直前まで→hand off」の terminal だが外部 gate ゆえ最小から |
| D. durable state / persistence | 後（persistence gate・submit→表示 UX には不要）。E の前提だが C を阻まない |
| F. M2 soft enrichment | 後（M2 runtime gate） |
| G. CoAlter display/runtime | 後（CoAlter runtime gate） |
| E. production deny release | **最後**（最大 gate） |

**推奨: C 次・ただし Tier1-A（inert types/helper のみ・href/生成/fetch/UI なし）。** 根拠（①⑤）: confirmed destination/participant が揃った今、hand-off link は製品約束の terminal。だが外部は honesty/Tier1 gate ゆえ、**まず「ユーザー提供 URL を inert metadata として安全に保持・eligibility 判定する」pure 層**から。href 化・Maps 生成・外部遷移は後続スライス。

---

## 2. なぜ C は B の後か（§2）
- destination/date/**current-user participant** が real（auth 由来）になった。
- link は **偽 participant 状態から出してはならない**（B 前は "P1" 偽）。
- link は **proposed/unconfirmed destination から出してはならない**。
- safe link は **confirmed destination/entity intent のみ**を消費。
- **confirmed travel intent の前に外部 hand-off しない**。

---

## 3. Tier1 サブレベル（§3・混ぜない）
| level | 内容 | 安全度 |
|---|---|---|
| **Tier1-A** | user-provided URL を **inert metadata** として保持/carry（**href にしない**） | ◎ 最安全・**最初** |
| Tier1-B | user-provided URL を **href として render** | 後（外部遷移 affordance） |
| Tier1-C | confirmed destination/entity から **Maps 検索 URL を生成** | 後（生成・要承認） |
| Tier1-D | official site URL を render（手動供給 or 将来 retrieval 供給時のみ） | 後（retrieval は HOLD） |

★ **metadata 保持（A）/ href render（B）/ URL 生成（C）を 1 scope に潰さない**。各々別スライス・別判断。

---

## 4. 許可 link source（§4）
- user-provided URL（**inert hand-off metadata**）。
- 手動供給 official URL。
- 手動供給 Maps URL。
- 生成 Maps 検索 URL（**later 承認時のみ・confirmed destination/entity intent からのみ**）。
- 将来 retrieval 供給 official URL → **HOLD**。
- 将来 Maps/Places API source → **HOLD**。

## 5. 禁止挙動（§5）
URL fetch / URL reading / scraping / web search / Google Maps・Places API / OTA・affiliate・partner API / live price 主張 / live availability 主張 / cancellation policy 主張（明示供給除く）/ booking・reservation hand-off / route・weather・place API / **URL に private user state** / production deny release。

## 6. safe link eligibility（§6）
- destination-level link は **confirmed `destination_area` 必須**。
- entity-level link は **confirmed or 明示束縛 entity 必須**。
- **proposed destination → link を作らない**・**unconfirmed destination → link を作らない**。
- **`manual_entity_evidence` 単独では destination/date/participants を hard-confirm しない**（B/provider 原則踏襲）。
- prerequisite 欠如時は link を **disabled/unavailable** にできる。

## 7. Maps 検索 URL 構築ルール（§7・Tier1-C が later 承認された時のみ）
- **confirmed destination/entity label のみ**使用。
- query を **safe に encode**。
- **private red_line/preference を URL に含めない**・**budget/pace/mobility/private を含めない**。
- **hidden tracking field なし**（別承認なき限り）。
- **「正確な場所」と主張しない**（検索結果である旨）。
- **search/hand-off と label**（booking でない）。

## 8. UI copy（§8）
- **許可**: 「外部で確認する」「地図で見る」「これは予約ではありません」「外部サイトで確認してください」「検索結果を開きます」。
- **禁止**: 「予約する」「空きあり」「最安」「確定」「この場所にする」「スケジュールに追加」「今すぐ行く」。

## 9. privacy（§9）
safe link は **private red_line/preference を含めない**・**raw userId を含めない**・**M2/Stargazer data を含めない**・**private relationship/participant state を encode しない**。link text は **private rationale を露出しない**。**client-only privacy filtering 禁止**。

## 10. 現 TravelLivePanel との関係（§10）
- link affordance は **別 実装 GO 後にのみ** panel に出す。
- 現 panel は **read-only・外部 link なし**を維持。
- link UI は **booking/calendar/action と分離**。
- **CoAlter runtime なし・useCoAlter なし・`/talk` なし**。

---

## 11. 実装オプション + 推奨（§11・CEO 承認で着手）
| 案 | 内容 | 評価 |
|---|---|---|
| **A. Tier1-A pure types only**（inert safe-link metadata） | `SafeTravelLinkIntent` 型 | 推奨バンドル前提 |
| **B. Tier1-A pure helper**（inert user-provided URL を validate・href なし） | `buildSafeTravelLinkIntent`（syntactic check のみ・fetch なし・eligibility 判定・href 化しない） | ◎ 推奨 keystone |
| C. Tier1-B href render | 外部遷移 affordance | 後（別 GO） |
| D. Tier1-C generated Maps URL helper | URL 生成 | 後（別 GO・§7） |
| E. link 実装せず D durable state preflight へ | — | 代替 |

**推奨実装スライス: A + B（Tier1-A pure types + helper）。** 
- `SafeTravelLinkIntent`（inert・`rendered:false`・`fetched:false`・eligibility）+ `buildSafeTravelLinkIntent(url, { destinationConfirmed })`。
- **href にしない・Maps URL を生成しない・外部遷移しない・UI なし・fetch/API なし・production deny 解除なし**。
- eligibility は **confirmed destination/entity** に紐付け（proposed/unconfirmed → ineligible）。
> ★ premise note: Tier1-A は既存 `externalId` inert 原則の延長。最初は「ユーザー提供 URL を**触らず安全に保持し、出してよいか（eligibility）だけ判定**」する pure 層。href/生成/遷移は各々後続の別 GO。

### 設計スケッチ（未実装）
```
interface SafeTravelLinkIntent {
  source: "user_provided" | "manual_official" | "manual_maps";  // 全て手動/user 由来（生成でない）
  url: string;                 // ★ inert（href にしない・fetch しない・改変しない）
  label: string;               // 中立表示ラベル（予約語を含まない）
  eligibility: "eligible" | "ineligible_unconfirmed" | "ineligible_no_destination";
  rendered: false;             // ★ Tier1-A: href 化しない
  fetched: false;              // ★ 取得しない
}
// helper（pure・no fetch/href/生成）:
//   buildSafeTravelLinkIntent(input: { url: string; source; label; destinationConfirmed: boolean }): SafeTravelLinkIntent | null
//     - confirmed でなければ eligibility=ineligible_*・出さない判断材料のみ
//     - url は syntactic check（https:// 始まり・空白なし）のみ・fetch しない・private を含めない（user URL をそのまま inert carry）
```

---

## 12. 将来 test（§12・実装時）
- confirmed destination は **eligible safe-link intent** を作れる。
- **proposed destination → link を作れない**・**unconfirmed destination → link を作れない**。
- `manual_entity_evidence` 単独では destination/date/participants を満たさない。
- user-provided URL は **inert metadata として carry** できる。
- **inert URL は fetch されない**。
- **inert URL は href として render されない**（Tier1-B 承認まで）。
- **生成 Maps URL は不在**（Tier1-C 承認まで）。
- URL に **private red_line/preference なし**・**raw userId なし**・**M2/Stargazer data なし**。
- **booking/calendar/action authority なし**。
- **fetch/API/DB/Supabase import なし**・**Google Maps/Places API import なし**・**web search なし**。
- **CoAlter/useCoAlter なし**・**`/talk` なし**。
- **tsc baseline 不変（55）**・既存 travel tests green。

---

## 13. Stop
- 本書（C Tier1 Safe Links / Maps URL Design）で**停止**。
- C 実装は **CEO 承認まで行わない**。

---

## 出力サマリ
- **前提（①）**: C 次・ただし実装は **Tier1-A（inert metadata のみ・href/生成/fetch/UI なし）**に限定。製品 terminal だが外部 gate ゆえ最小から。
- **Tier1 を 4 レベルに分離**（A inert metadata / B href / C 生成 Maps / D official）・**潰さない**。最安全＝A。
- **eligibility**: confirmed destination/entity のみ。proposed/unconfirmed → link なし。`manual_entity_evidence` 単独 hard-confirm 不可。
- **privacy/honesty**: URL に private/userId/M2 を含めない・fetch/scrape/search/Maps-Places API/OTA/live price-availability/booking なし。copy は「外部で確認する/地図で見る/これは予約ではありません」（予約する/空きあり/最安/確定 等 禁止）。
- **推奨実装スライス**: **Tier1-A pure types（`SafeTravelLinkIntent`）+ helper（`buildSafeTravelLinkIntent`・href/生成/fetch なし・eligibility 判定）**。Tier1-B/C/D・UI・production deny は HOLD。
- 本フェーズは **docs-only** — コード/型/テスト不変・tsc 55・push なし・production 非接触。
