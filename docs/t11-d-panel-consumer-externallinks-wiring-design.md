# D — Panel Consumer ExternalLinks Wiring Design（docs-only）

> 設計フェーズ（phase-by-phase）。**コード変更なし**。実装は CEO 承認後・本 phase のみ。
> DB・RLS / M2 runtime / CoAlter runtime / 外部 retrieval / Maps・Places API / URL fetch / 外部遷移 production release は HOLD。
> 上位文脈: Tier1-A〜C + Preparation + B(`extractGeneratedLinkDestination`) + B-D-A(`prepareTravelExternalLinkHrefModels`) + D-A(`externalLinks?` field) + C-E(adapter が `includeExternalLinks` option 下で attach)。
> **本書 = `TravelLivePanel` が `display.externalLinks` を読み `TravelExternalLinks` に渡す consumer 結線**（UI は生成/分類せず render のみ）。
> 原則: ①前提を疑う ②grounding ③シンプル→論理 ④外科的 ⑤ゴール逆算 ⑥人間同等の推論設計 ⑦超越的アイデア ⑧世界トップシェア。

---

## 0. grounding（②・実コード精査）
- `TravelPlanDisplayPayload.externalLinks?`（D-A）存在。adapter は `includeExternalLinks` option 下で attach（C-E）。
- **現 server action（`travel-live.ts`）は `includeExternalLinks` を渡さない** → production では `display.externalLinks` は常に undefined。
- **現 panel は `display.externalLinks` を未読**。`TravelLiveReadyView({ state, links = [] })` は **`links?` prop（B-C の placeholder）** を `<TravelExternalLinks links={links} />` に渡すが、`TravelLivePanel` は `<TravelLiveReadyView state={state} />` のみ（links 未指定→`[]`）。
- `TravelExternalLinks`（B-C）は `SafeTravelLinkHrefModel[]` を render・空→null・**cue section（`travel-live-cues`）の外**に配置済。
- B-C 配置テスト（`travelExternalLinks.test.tsx` describe "2"）は **`links` prop を明示注入**して placement を検証している。

---

## 1. まず前提を疑う（①）— これが次か？
| 候補 | リスク | 価値 | 評価 |
|---|---|---|---|
| **D panel consumer wiring（本書）** | 低（producer OFF ゆえ production 描画ゼロ・consumer 結線のみ） | 高（panel が初めて `display.externalLinks` を render 経路に繋ぐ＝consumer 完成） | **推奨・次（設計のみ→A+B 実装）** |
| server action option passing | **中〜高**（gate から `includeExternalLinks` を渡す＝staging/gated で実 link 点灯） | 高 | **D の後**（producer+consumer 両備の後・gate/production-deny 下で点灯判断） |
| Tier1-C render distinction | 低 | 中 | 後（link が実際に出た後） |
| SQL/RLS persistence | **高**（DB migration＝§1 CEO 承認） | 中 | 後 |
| production deny release | 最大 gate | — | **最後** |

**推奨: D 次・docs-only。実装は C スライス（A+B）。** 根拠（①⑤）: C-E で producer は備わった（OFF）。D は consumer を結線し「`display.externalLinks` があれば render」を完成させる。**action は option を渡さない＝production の `display.externalLinks` は常に undefined → 描画ゼロ**（D 単独で production 挙動不変）。点灯は server action option passing（別 GO・gate/production-deny 下）。

### ★ 設計の核（③④）— source of truth を state に切替（prop placeholder 卒業）
B-C の `links?` prop は **placeholder**（実 source は state）。D で **`state.display.externalLinks ?? []` を単一 source of truth** とし、`links?` prop を**廃止**。これで「producer が attach → action-state が運ぶ → panel が読む → TravelExternalLinks が描く」の経路が一直線になり、UI は生成/分類を一切持たない。
- ★ 影響: B-C 配置テスト（prop 注入）は **state 注入に更新**（同一 assertion・honest な source 変更反映）。

---

## 2. 現状（②）
- `display.externalLinks?` 存在・adapter が option 下で attach。
- action は option 未渡し → production で externalLinks 常に undefined。
- panel は externalLinks 未読。
- `TravelExternalLinks` 存在・render・空→null・cue と別配置済。

## 3. panel consumer 役割（§3）
- panel は **`display.externalLinks` のみ**読む。
- `display.externalLinks ?? []` を `TravelExternalLinks` に渡す。
- panel は **raw `SafeTravelLinkIntent` を受けない**。
- panel は **呼ばない**: `prepareSafeTravelLinkHrefModels` / `prepareTravelExternalLinkHrefModels` / `buildGeneratedMapsSearchIntent` / `buildSafeTravelLinkHrefModel`。
- panel は **URL を生成しない**・**eligibility を推論しない**。

## 4. 挙動（§4）
- `display.externalLinks` **absent → external link section なし**。
- **empty → section なし**（`TravelExternalLinks` が空→null）。
- **present → `TravelExternalLinks` で render**。
- section は **CoAlter cue section の外**のまま。
- **booking/calendar/action button なし**・**CoAlter input/send UI なし**。
- **raw URL text なし**（model label が URL の場合は upstream で回避すべき＝caller 責務）。
- **raw diagnostics なし**・**raw userId/private/M2 text なし**。

## 5. server action との関係（§5）
- **server action の option passing は HOLD**（別 GO）。
- action が `includeExternalLinks` を渡さない限り **panel 結線だけでは production 何も変わらない**（producer OFF）。
- panel 結線は **producer OFF ゆえ安全**。
- 将来 server action gate が producer を点灯し得る（gate/production-deny 下）。
- **preview flag は production link を有効化しない**。

## 6. adapter との関係（§6）
- adapter は producer option を既に所有（C-E）。
- **D で adapter 変更なし**。
- panel は **link helper を呼ばない**・**raw intent を持たない**。

## 7. privacy（§7）
- panel は **display-safe href model のみ**受ける。
- **private red_line/preference なし**・**raw userId なし**・**M2/Stargazer data なし**・**private rationale なし**・**client-only filtering なし**。
- ★ model に private が混入していたら **upstream バグ**（Tier1-A/C/B-D-A が保証）。panel は **model contract の render 以上の sanitize を試みない**（責務境界）。

## 8. copy / authority（§8）
- `TravelExternalLinks` の copy は不変: **external hand-off のみ**・**not booking**・**外部確認**。
- **禁止**: 「予約する」「空きあり」「最安」「確定」「この場所にする」「スケジュールに追加」「今すぐ行く」「この案で決定」。
- **executionAuthority なし**・**booking/calendar/action authority なし**。

## 9. 実装オプション + 推奨（§9・⑤）
| 案 | 内容 | 評価 |
|---|---|---|
| A. `TravelLiveReadyView` が `state.display.externalLinks ?? []` を `TravelExternalLinks` に渡す | consumer 結線（`links?` prop 廃止＝state 単一 source） | 本体 |
| B. render / source-contract test 追加 + B-C 配置テストを state 注入へ更新 | テスト | 本体 |
| **C. A+B を 1 小スライス** | consumer のみ・action/adapter 不変 | **◎ 推奨** |
| D. server action option passing と同時実装 | — | 却下（option passing は別リスク GO・分ける） |

**推奨実装スライス: C（A+B）。**
- **A**: `TravelLiveReadyView` を `state.display.externalLinks ?? []` 駆動に切替（`links?` prop 廃止）。`<TravelExternalLinks links={state.display.externalLinks ?? []} />`。
- **B**: テスト — (i) externalLinks 不在→section なし、(ii) state.display.externalLinks 注入→section render（cue の外）、(iii) source-contract（panel が helper/raw intent を import/呼ばない・生成なし・禁止 copy なし）。**B-C 配置テスト（prop 注入）を state 注入へ更新**（同一 assertion）。
- **server action 変更なし**・**adapter 変更なし**・**producer OFF ゆえ production 描画ゼロ**。
```
// スケッチ（未実装）
export function TravelLiveReadyView({ state }: { state: Extract<TravelLiveActionState, { status: "ready" }> }) {
  // …既存（projection / cues）…
  return (
    <div data-testid="travel-live-ready">
      {/* …answer / why / cues… */}
      {/* ★ D: 単一 source = state.display.externalLinks。helper を呼ばず render のみ */}
      <TravelExternalLinks links={state.display.externalLinks ?? []} />
      <p>これは予約・確定ではありません。</p>
    </div>
  );
}
```
- **server action option passing / Tier1-C distinction / production deny は HOLD。**

## 10. 将来 test（§10・実装時）
- `externalLinks` 不在 → external link section なし。
- `externalLinks` 提供（state 注入）→ section render（`travel-live-external-links`）。
- panel は href model を **unchanged** で `TravelExternalLinks` に渡す（href === model.handoffUrl）。
- link section は **`travel-live-cues` の外**。
- panel は preparation/generation helper を **import しない**。
- panel は raw `SafeTravelLinkIntent` を **import/受領しない**。
- panel は **URL を生成しない**・**Maps/Places API を import しない**・**fetch/API/DB/Supabase なし**・**M2 runtime なし**・**CoAlter/useCoAlter なし**・**`/talk` なし**。
- **booking/calendar/action button なし**・**禁止 copy なし**。
- **tsc baseline 不変（55）**・既存 travel tests green（producer OFF で externalLinks 不在＝従来描画）。

## 11. Stop
- 本書（Panel Consumer ExternalLinks Wiring Design）で**停止**。
- panel 結線実装は **CEO 承認まで行わない**。

---

## 出力サマリ
- **前提（①⑤⑧）**: 次は **D panel consumer wiring（docs-only）**、実装は **C スライス（A+B）**。C-E で producer は備わった（OFF）。D は consumer を結線し「`display.externalLinks` があれば render」を完成。**action は option 未渡し＝production の externalLinks は常に undefined → 描画ゼロ**（D 単独で production 不変）。点灯は server action option passing（別 GO・gate/production-deny 下）。
- **source of truth（③④）**: B-C の `links?` prop は placeholder。D で **`state.display.externalLinks ?? []` を単一 source** とし prop 廃止。経路（producer attach → action-state 運搬 → panel 読取 → TravelExternalLinks 描画）が一直線・UI は生成/分類ゼロ。B-C 配置テストは **prop 注入 → state 注入** へ更新（同一 assertion）。
- **挙動**: absent/empty → section なし、present → render。cue の外・booking/action なし・raw URL/diagnostics/private なし。
- **境界**: server action / adapter は **D で不触**（HOLD）。panel は helper/raw intent を持たず render のみ。private 混入は upstream バグ＝panel は model contract render 以上の sanitize をしない。
- **推奨実装スライス**: **C（A+B）— `TravelLiveReadyView` を `state.display.externalLinks ?? []` 駆動へ・テスト（不在/提供/placement/source-contract + B-C 配置テスト state 化）**。**server action option passing / Tier1-C distinction / production deny は HOLD。**
- 本フェーズは **docs-only** — コード/型/テスト不変・tsc 55・push なし・production 非接触。
