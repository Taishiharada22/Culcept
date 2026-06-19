# Tier1-C Render Distinction Design（docs-only）

> 設計フェーズ（phase-by-phase）。**コード変更なし**。実装は CEO 承認後・本 phase のみ。
> DB・RLS / M2 runtime / CoAlter runtime / 外部 retrieval / Maps・Places API / URL fetch / production deny 解除 は HOLD。
> 上位文脈: link ladder（Tier1-A〜C + Preparation + B/C-E producer + D-C consumer + server action gate）が一貫結線・staging gated・default OFF。
> **本書 = manual link と generated Maps 検索 link を UI で区別し、生成検索 URL を「正確な場所/検証済/予約/推薦/公式」と誤認させない境界**。
> 原則: ①前提を疑う ②grounding ③シンプル→論理 ④外科的 ⑤ゴール逆算 ⑥人間同等の推論設計 ⑦超越的アイデア ⑧世界トップシェア。

---

## 0. grounding（②・実コード精査）
- `SafeTravelLinkHrefModel`（`safe-link-href-types.ts`）= `{ kind:"external_handoff", handoffUrl, label, external:true, authoritative:false, rendered:false }`。**`source`/`generated` を持たない**。
- `buildSafeTravelLinkHrefModel(intent)`（Tier1-B）は intent の `source`/`generated` を **carry せず捨てている**（handoffUrl/label のみ）。
- intent 側（`SafeTravelLinkIntent`）は `source`（user_provided/manual_official/manual_maps/generated_maps_search）+ `generated?` を持つ。
- `TravelExternalLinks`（D-C）は href model[] を render。disclaimer は **section 単一**「これは予約ではありません。外部サイトで確認してください。」。label は caller/generator 設定（generated は B-D-A が「地図で検索する」）。
- **exact place validation / Maps・Places API / URL 検証は存在しない**（生成検索 URL は areaText 文字列の search hand-off のみ）。
- → **★ 現 model は UI 区別に必要な source/generation metadata を欠く**（label 文字列でしか区別できない＝脆い）。

---

## 1. まず前提を疑う（①）— これが次か？
| 候補 | リスク | 価値 | 評価 |
|---|---|---|---|
| **Tier1-C render distinction（本書）** | 低（pure model 拡張 + UI copy・links は gated OFF） | 高（**honesty の要**＝生成検索 URL の overtrust 防止。production 露出前に固めるべき） | **推奨・次（設計のみ）** |
| SQL/RLS persistence | **高**（DB migration＝§1 CEO 承認） | 中 | 後 |
| M2 production merge | 中 | — | 後（CEO 既決で後） |
| CoAlter runtime | **高**（大規模面） | 中 | 後 |
| production deny release | 最大 gate | — | **最後** |

**推奨: render distinction 次・docs-only。** 根拠（①⑤⑧）: link 経路は結線済で staging 点灯可能になった。最大の残リスクは **「生成 Maps 検索 URL を正確な場所/予約/公式と誤認」**（areaText は未解決ゆえ本質的に検索 hand-off）。この区別は **production 露出（最終 deny release）の前に固めるべき honesty hardening**。pure model 拡張 + UI copy で済み・links は gated OFF ゆえ低リスク。

---

## 2. 現 link model（②）
- manual: `user_provided` / `manual_official` / `manual_maps`（intent 側 source・`generated` absent）。
- generated: `source:"generated_maps_search"`・`generated:true`。
- `TravelExternalLinks` は href model を render（が **model に source/generated なし**）。
- 現 copy は source を十分に区別しない（section 単一 disclaimer・label のみ差）。
- **exact place validation / Maps API / URL 検証なし**。

## 3. リスク（③）
- 生成 Maps 検索 link が **exact place link に見え得る**。
- 「地図で見る」が **exact place confirmed** と誤解され得る。
- 生成 link が **推薦/予約 readiness** を含意すると誤解され得る。
- manual official link と generated search link は **意味が異なる**ため区別必須。
- 表示は **overtrust を防ぐ**こと。

## 4. 表示カテゴリ（§4）
| source | 意味 |
|---|---|
| `manual_official` | 公式/外部確認（手動供給 official） |
| `manual_maps` | 手動供給の地図参照 |
| `user_provided` | ユーザー提供の外部参照 |
| `generated_maps_search` | **生成検索 hand-off・exact place でない・未検証・予約でない** |
| unknown/future | 中立 external reference |

## 5. label 戦略（§5）
- `generated_maps_search`: 「地図で検索する」「地図検索を開く」「検索結果を開きます」（**B-D-A が既に「地図で検索する」を設定**＝compliant）。
- generated で **避ける**: 「地図で見る」「この場所を見る」「ここに行く」。
- `manual_maps`: 「地図で見る」可。
- `manual_official`: 「公式サイトで確認」「外部サイトで確認」。
- `user_provided`: 「外部で確認する」。
- ★ label は caller/generator 設定（generated は B-D-A 管理で compliant）。UI は **source-derived disclaimer/badge を honesty backstop** にする（label に依存しない）。

## 6. disclaimer 戦略（§6）
- generated maps link:
  - 「検索結果です。正確な場所は外部で確認してください。」
  - 「これは予約・確定ではありません。」
- manual link:
  - 「外部サイトで確認してください。」
  - 「これは予約ではありません。」
- **availability/price/route/booking 主張なし**。
- ★ disclaimer は **source/generated から UI が導出**（生成 link は label が何であれ「検索結果です…」を示す＝honesty backstop）。section に generated が 1 つでもあれば search disclaimer を出す（混在時は strict 側）。

## 7. 視覚区別（§7）
- **ranking badge なし**・**recommended badge なし**・**verified badge なし**。
- generated search に **中立「検索」badge** を付けてよい（任意）。
- `manual_official` に **中立「公式URL」/「外部」badge** を **source が明示 manual_official の時のみ**（officialness を overclaim しない）。
- それ以外は中立「外部」。

## 8. data contract（§8・grounding 反映）
- **現 `SafeTravelLinkHrefModel` は source/generation metadata を欠く** → UI 区別不能。
- **additive display metadata を推奨**:
  - `source: SafeTravelLinkSource`（display-safe・source kind のみ）。
  - `generated: boolean`（display-safe・bool）。
  - `handoffKind` / `disclaimerKind` は **UI が source/generated から導出可ゆえ不要**（model を最小に保つ）。
- **display-safe のみ**（raw intent なし・diagnostics なし・private なし・exact-place claim なし）。source kind/bool は private でない。

## 9. preparation helper との関係（§9）
- source/generation は **intent → href model 変換を生き残る必要**。
- ★ 現 `buildSafeTravelLinkHrefModel`（Tier1-B）が source/generated を **捨てている** → **まず pure model/helper を更新**（`source: intent.source` / `generated: intent.generated === true` を carry）。
- `prepareSafeTravelLinkHrefModels` / `prepareTravelExternalLinkHrefModels` は **buildSafeTravelLinkHrefModel を呼ぶだけ**＝自動的に伝播（追加変更不要）。
- **UI は raw `SafeTravelLinkIntent` を inspect しない**・**href model のみ受領**（D-C 不変）。

## 10. 実装オプション + 推奨（§10・⑤）
| 案 | 内容 | 評価 |
|---|---|---|
| A. pure href model metadata 拡張のみ | `source`/`generated` を model + `buildSafeTravelLinkHrefModel` に追加（UI 不変） | pure・挙動不変だが単独では dead metadata |
| B. TravelExternalLinks copy 区別のみ | 既存 metadata で足りる時のみ | **不可**（現 model に source なし＝B 単独不能） |
| **C. A+B 同時** | model 拡張 + UI が source/generated で label policy/disclaimer/badge 区別 | **◎ 推奨** |
| D. source 種別が増えるまで defer | — | 却下（生成 link は既に点灯可・overtrust リスクは今ある） |

**推奨実装スライス: C（A+B 同時）。** 根拠（①③⑧）: 現 model に source がなく **B 単独は不能**・**A 単独は dead metadata**。links は **gated OFF（production deny + default-OFF flag）**ゆえ B の可視変化は staging-with-flag に限定＝低リスク。honesty（区別）を 1 スライスで cohesive に届ける。**保守的に分けるなら A 先行（pure・挙動不変）→ B（UI）も可**。
```
// スケッチ（未実装）
// A: model 拡張（additive・display-safe）
interface SafeTravelLinkHrefModel {
  kind: "external_handoff"; handoffUrl: string; label: string;
  external: true; authoritative: false; rendered: false;
  source: SafeTravelLinkSource;   // ★ 追加（display-safe・区別用）
  generated: boolean;             // ★ 追加（true=generated_maps_search）
}
// buildSafeTravelLinkHrefModel: return { …, source: intent.source, generated: intent.generated === true };

// B: TravelExternalLinks が source/generated で disclaimer/badge を導出（label は model.label）
//   - generated → 「検索」badge（任意）+ 「検索結果です。正確な場所は外部で確認してください。これは予約・確定ではありません。」
//   - manual_official → 「公式URL」badge(任意) + 「外部サイトで確認してください。これは予約ではありません。」
//   - その他 → 中立「外部」+ 「外部サイトで確認してください。これは予約ではありません。」
//   - ranking/recommended/verified badge なし・booking/availability/price なし
```
- **SQL-RLS / M2 / CoAlter / production deny は HOLD。**

## 11. 将来 test（§11・実装時）
- generated maps link は **検索 wording**（label「地図で検索する」等）・**exact-place wording を出さない**。
- manual_maps は map wording 可。
- manual_official は **source が manual_official の時のみ** official/external wording。
- generated maps は **search/verification disclaimer**（「検索結果です。正確な場所は外部で確認してください。」）。
- **「verified」なし**・**「recommended」なし**・**「booking/予約」なし**・**「availability/空き」なし**。
- model に **source/generated が carry される**（intent→model 変換を生存）。
- **raw `SafeTravelLinkIntent` が UI に来ない**・**raw diagnostics なし**・**private data なし**。
- **Maps/Places API なし**・**fetch/API/DB/Supabase なし**・**CoAlter/useCoAlter なし**・**`/talk` なし**・**booking/calendar/action なし**。
- **tsc baseline 不変（55）**・既存 travel tests green（model 拡張は additive・既存 field-by-field assertion 不破壊／UI disclaimer 変更は対象 test 更新）。

## 12. Stop
- 本書（Tier1-C Render Distinction Design）で**停止**。
- render distinction 実装は **CEO 承認まで行わない**。

---

## 出力サマリ
- **前提（①⑤⑧）**: 次は **render distinction（docs-only）**。link 経路は結線・staging 点灯可。最大残リスクは **生成 Maps 検索 URL の overtrust（exact place/予約/公式と誤認）**。areaText は未解決＝本質的に検索 hand-off ゆえ、**production 露出（最終 deny release）の前にこの区別を固める**のが honesty 上正しい。
- **★ grounding（②⑧）**: 現 `SafeTravelLinkHrefModel` は **source/generated を欠き**、`buildSafeTravelLinkHrefModel` がそれらを捨てている → UI 区別不能。よって **additive な `source`+`generated`（display-safe）を model に足し、Tier1-B helper で carry** する必要（prepare 系は自動伝播）。
- **区別（③⑥⑦）**: label は source-appropriate（generated は B-D-A が「地図で検索する」管理）、**disclaimer は source/generated から UI が導出する honesty backstop**（生成 link は label 不問で「検索結果です。正確な場所は外部で確認」）。badge は中立のみ（検索/外部/公式）・**ranking/recommended/verified なし**・booking/availability/price なし。
- **data contract（⑧）**: `source`+`generated` のみ追加（handoffKind/disclaimerKind は UI 導出ゆえ不要）。display-safe・raw intent/diagnostics/private/exact-place claim なし。UI は href model のみ受領（raw intent を見ない）。
- **推奨実装スライス**: **C（A+B 同時）— model に source/generated 追加 + buildSafeTravelLinkHrefModel carry + TravelExternalLinks の source-derived label policy/disclaimer/中立 badge**。links gated OFF ゆえ低リスク。保守的には A 先行（pure）→ B も可。**SQL-RLS / M2 / CoAlter / production deny は HOLD。**
- 本フェーズは **docs-only** — コード/型/テスト不変・tsc 55・push なし・production 非接触。
