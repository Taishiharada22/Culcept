# Candidate Lens Phase 3-c — Resolver 供給 計画（docs-only / 実装は GO 後）

> 2026-06-16 / Build Unit / CEO 段階 GO 待ち。P3-b の shadow record を読み、**③ 比較表の行順だけ**をユーザー別に並べ替える
> （= Aneurasync 独自の記憶）。ranking・推薦・①②・他層には一切影響させない。

## ★0. 前提を疑った結果（最重要・設計の核）
`buildLensComparisonView(lens, left, right, preference)` に preference を渡すと、`buildLensComparison` が
**勝った軸を「軸順位（上位ほど重い: axes.length−index）」で加重して推薦側を決める**ため、preference で軸を前に出すと
**✨おすすめ（recommendation）が裏で変わる＝隠れた ranking 影響**になる。CEO の「行順だけ・ranking 影響なし」と矛盾する。

→ P3-c は **「表示行順」と「推薦判定」を分離**する。**推薦・優位ハイライトは常に canonical 軸順（preference なし）で計算**し、
**preference は表示する mainRows の並び替えだけ**に使う。これにより「あなたに合わせて並べ替えるが、最善の判定は誰でも同じ＝
ごまかさない」を担保（人を filter bubble に閉じ込めない・信頼を壊さない＝世界トップ品質の差別化点）。

---

## 1. preference の読込元
- **読込元**: P3-b の localStorage shadow record（`loadPreferenceObservations()`）→ `accumulatePreference(obs, { now })` → `UserPlacePreference`。
- **client-only**: localStorage 読込ゆえ client。SSR では preference 不在＝canonical（fail-open）。
- **production hard block**: 維持。供給 flag も `&& NODE_ENV !== "production"`。
- **flag は P3-b と分ける**: 新規 `PLACE_CANDIDATE_LENS_PREF_APPLY_ENABLED`（**default OFF**）+ `isCandidateLensPrefApplyEnabled()`。
  → 3 flag 独立: UI 表示 / **P3-b 記録(obs)** / **P3-c 供給(apply)**。記録 ON・供給 OFF が可能（shadow のまま回せる）。
- **読込位置**: `PlaceCandidatesPanel` が `useMemo` で 1 度だけ derive し、`CandidateLensPanel` に新 optional prop `preference` を渡す。
  CandidateLensPanel は **③ の行順表示にのみ** 使う（②①は受け取らない or 無視）。flag OFF/production/不在 → `undefined`＝canonical。

## 2. sufficient-gate（薄い観測で反映しない保証）
- `accumulatePreference` の既存 gate（`minObservations`）に加え、P3-c で**二段ゲート**:
  - **lens 別を主**: 当該 lens の観測が `MIN_LENS`(=5) 件以上 → `perLens[lens]` を採用。未満 → その lens は canonical。
  - **全体 fallback は厳しめ**: 全体 `MIN_GLOBAL`(=8) 件以上の時のみ `prioritizedAttributes` を fallback 採用。
  - **per-axis 最低支持(min-support)**: ある軸を前に出すには、その軸が当該 lens の **decisiveAxes に `MIN_AXIS_SUPPORT`(=3) 回以上**
    出ていること（単発の選択で並びを動かさない）。`accumulatePreference` に「軸別 raw count」を併産し、count < MIN_AXIS_SUPPORT の軸は
    並び替え対象から除外する（スコアが高くても支持が薄ければ動かさない）。
- **1〜2 件では反映しない**: 上記 gate により保証（lens<5 / axis support<3 で除外）。
- **reselectedKnown / proximity / margin の最低サンプル**: これらは boolean signal であり**行順には直接使わない**（行順は decisiveAxes 由来）。
  ただし将来の解釈用に、各 signal が true の観測が当該 lens で `MIN_SIGNAL`(=3) 件以上集まるまでは「傾向あり」と扱わない（記録は P3-b の生データ・解釈は gate 後）。P3-c では signal は行順に未使用（明示）。

## 3. decay
- 既存 `accumulatePreference` の decay（**半減期既定 30 日・新しい観測ほど重い＝直近重視**）を使用。`now` は呼び側が stamp。
- **ring 200 件との関係**: P3-b で直近 200 件に丸め済 → decay 入力は最大 200 件。30 日半減期では実質**直近数ヶ月が支配**。
- **decay で 0 に近づいた観測**: スコアが `EPS`(=0.05) 未満の軸は「実質失効」として並び替え対象から除外（古いだけの軸を前に出さない）。
  min-support(§2) と AND（件数も score も足りる軸だけ昇格）。

## 4. 行順への反映範囲
- **③ 比較表の `mainRows` の並び順だけ**。具体的には: canonical の `LENS_AXES[lens]` に `applyPreferenceToAxes(axes, lens, preference)` を
  適用して得た軸順で mainRows を並べ替えて表示する。
- **①②の表示・ranking には影響させない**: ① card のチップ順・② 詳細・候補の pager 順・rankedDisplayList は**一切触らない**。
- **decisiveAxes の重み反映**: accumulatePreference が decay 加重スコア降順で軸を返す → applyPreferenceToAxes が**既定軸にある軸のみ前方へ**寄せる
  （既定軸に無い軸は増やさない＝目的整合を保つ・行の追加/削除はしない）。
- **★推薦/優位ハイライトは canonical**: §0 のとおり recommendation と各行の isBest は **preference なし**で計算し不変。並び替えは表示のみ。

## 5. ranking 影響有無
- **P3-c では候補 ranking に一切影響させない**（明記）。候補の出現順・pager・current・rankedDisplayList・✨おすすめ側は不変。
- 比較表の**行順だけ**が変わる（情報の見せ方であって、優劣判定ではない）。
- preference を**候補ランキング**へ波及させる案は **別フェーズ(P4+)に分離**（探索的・別 GO）。P3-c のスコープ外。

## 6. Place Affinity との優先順位
- 競合の整理: **Place Affinity = 候補ランキングの nudge**（`placeAffinityCombiner`・候補の並び）。**P3-c = 比較表の行順**。**層が違うので衝突しない**
  （P3-c は候補順を触らない）。
- `affinity_reason` は比較表の 1 軸。preference が affinity_reason を前に出す/出さないは**行順の話**で、Place Affinity の候補ランキングとは独立。
- **preference が薄い時は existing lens axes を維持**: `applyPreferenceToAxes` は空 preference で axes をそのまま返す（中立）。gate 未達 lens も canonical。
- 優先順位の原則: **観測の確からしさ**（Place Affinity の affinity_reason＝観測履歴）を preference が**上書きしない**。preference は行順のみ・値や判定は変えない。

## 7. UI 表示
- **P3-c では「あなたの傾向から」等のラベルを表示しない**（silent reorder）。理由: shadow 由来の並び替えに断定ラベルを付けると
  過剰な「観測されている」感・privacy 懸念を招く。まず**黙って役立つ**順に並べるに留める。
- 将来表示する場合は: **過剰な断定を避ける hedged 文言**（例「最近の選び方に合わせて並べています」・dismissible・断定や数値を出さない）で、
  **別 GO・別コピーレビュー**。P3-c スコープ外。

## 8. tests / smoke
- **flag OFF（apply flag）で完全不変**: record があっても比較表は canonical 行順。
- **production で不変**: hard block。
- **insufficient data で不変**: lens<5 / axis support<3 → canonical。
- **sufficient data で比較表の行順だけ変わる**: 例 walk が支持十分 → walk が先頭へ。それ以外（① card・②・候補順・✨おすすめ側）は不変。
- **ranking が変わらない**: pager/current/rankedDisplayList/✨おすすめ side が record 有無で不変であることを assert。
- **resolver 以外に副作用がない**: ①② DOM・候補順・推薦 side のスナップショットが record 有無で同一。
- **推薦不変（§0 の核）**: preference を入れても recommendation.side が canonical と一致することを unit で固定。
- smoke: localStorage に N 件の walk-favoring obs を seed → ③ を開く → 行順だけ walk 先頭・✨おすすめ side 同一・① 不変 を実スクショ＋DOM 確認 → revert。

## 9. rollback
- **flag OFF で即時停止**: `PLACE_CANDIDATE_LENS_PREF_APPLY_ENABLED=false`（or production 自動 hard block）→ 比較表 canonical に即復帰。
- **localStorage clear で元に戻る**: preference 空 → canonical。`clearPreferenceObservations()`（P3-b 同梱）を流用。
- **P3-b 記録は残して P3-c 供給だけ止める**: apply flag と obs flag は独立 → apply OFF・obs ON で「記録は続くが反映だけ止まる」。
- **コード revert は局所**: P3-c = (a) apply flag + isXEnabled、(b) PlaceCandidatesPanel で derive+prop 渡し、(c) `buildLensComparisonView` の
  **推薦/行順 分離**（推薦は canonical・行順だけ preference）。(c) のみ既存 pure 関数の小改修。revert は 3 点。

---

## ★実装の刻み（GO 後）
1. **(c) 推薦/行順 分離**（pure・最重要）: `buildLensComparisonView` を「recommendation/isBest は canonical 計算 / mainRows 表示順だけ preference 反映」に分離 + test（推薦不変・行順変化）。**ここが本体**。
2. **gate/min-support/decay**: `accumulatePreference` に軸別 raw count を併産 + per-axis support / EPS の gate（pure・test）。
3. **(a)(b) flag + 配線**: apply flag + PlaceCandidatesPanel derive + CandidateLensPanel ③ にのみ prop 供給。
4. smoke（flag OFF/production/insufficient/sufficient/ranking不変/副作用なし）。

## ★stop gate
本書は計画。**実装は CEO の GO 後**。GO 時に §0 の「推薦/行順 分離」方針・§2 の gate しきい値（lens5/global8/axis support3）・§7 の「UI 表示しない」の可否を確認する。
