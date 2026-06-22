# 評価OS Stage 1-C Closeout — Fit-Arc 配線境界の固定（docs-only）

作成: 2026-06-22 / 状態: **境界固定（docs-only・コード変更なし）**
対象: Fit-Arc(Aneura-star) readout の配線範囲と不変条件
関連: `lib/plan/postVisit/fitArcReadout.ts` / `app/(culcept)/plan/components/{FitArcReadout,PlaceFitArcReadout,PostVisitCheckCard}.tsx`

---

## 1. Fit-Arc の現在の配線先（DONE）

| # | 画面 / 箇所 | 内容 | commit |
|---|---|---|---|
| Stage 1-B | **LocationDetailSheet**（Travel 場所詳細シート） | 答え合わせ(PostVisitCheckCard)の直上に readout。保存→onRecorded→再読込で連動 | `499cd2937` |
| Stage 1-C | **Candidate Lens ②詳細**（`view==="detail"` の ChipRow 直下） | 同 placeDescriptor→opaque key で観測を読み readout 表示 | `293a64c57` |

両方とも `PlaceFitArcReadout`（connected wrapper）経由。flag OFF で `null`＝DOM 不変。

## 2. 未配線の場所（明示・触れていない）

- **Candidate Lens ①カード**（候補1枚スワイプ）— 未配線
- **Candidate Lens ③比較**（比較表・winner/highlight 主役）— **未配線（意図的・§5/§6）**
- **Travel dashboard**（Concierge Dashboard）— 未配線
- **Location Notes 一覧**（カード一覧）— 未配線

## 3. Fit-Arc の性質（invariant・明文化）

- **表示専用 readout である**。**ranking / recommendation / winner / highlight / comparison logic に一切影響しない**。
  - 観測を**読むだけ**（`loadPostVisitObservations` を placeKey で filter）。**書かない・スコアに供給しない・並べ替えない**。
  - `buildLensComparisonView`（候補順 / winner / 優位ハイライト / 推薦）には**触れない**。Stage 1-C で candidateLens 211 tests が不変で PASS = 実証済み。
- **表示対象は「この人・この目的・この状態への適合(I_{u,p})」**であり、**他者の平均品質(Q_p)・星ではない**。subtitle「あなたへの適合」で明示。

## 4. evidence 件数チップ必須（invariant・固定）

- **全 state で「観測 N 件」チップを常に描画**する。**消す prop を持たない（構造的に削れない）**。
- 理由: de Langhe の「件数を無視した単一スコアのアンカー化」を構造で防ぐ。**件数チップなしの単独スコア表示は禁止**。

## 5. 観測ゼロ / 少数 / 十分の表示ルール（固定）

| 観測（回答済み） | state | アーク | 中央 | label |
|---|---|---|---|---|
| **0 件** | insufficient | **empty**（点線・空リング） | `—` | **「まだ観測不足（推測しません）」**（値 null・断定しない） |
| **1-2 件** | tentative | **dashed**（破線・仮説色） | `≈%` | 「観測 N 件・まだ仮説です」 |
| **3 件以上** | observed | **solid**（ProgressRing 再利用） | `%` | 「あなたの観測 N 件から」 |

- 閾値: `FIT_ARC_TENTATIVE_MIN=1` / `FIT_ARC_OBSERVED_MIN=3`。未回答(null)は適合に寄与しない（件数=回答済み）。
- **観測不足なのに高精度に見せない**（empty は値を出さない・dashed は ≈ で断定でないと明示）。

## 6. ③比較に出す場合の条件（出す時はこれを満たす・現状は未配線）

③比較へ Fit-Arc を出すなら（= 将来の Stage 1-D 等）、以下を**全て**満たすこと:
1. **winner / highlight と混同させない**（適合アークが「比較の勝敗」に読まれない配置・文言）。
2. **比較表の外側の補助領域に限定**（比較表セル内に置かない）。
3. **観測不足の候補は empty 固定**（適合値で順位づけ・優劣表示しない）。
4. **evidence 件数チップ必須**（§4）。
5. **comparison logic 不変**（`buildLensComparisonView` 等 不触）。
6. **ranking 非反映**（表示専用・推薦/winner を変えない）。

## 7. ③比較へ今すぐ進まない理由

- ③比較は **winner / ✓ハイライト / 比較表が主役**の画面。そこに per-place 適合アークを並べると、**観測の薄い適合値が「比較の優劣の根拠」として読まれる**リスクが②詳細より大きい。
- de Langhe 的な「件数無視で順位化」「観測不足なのに勝敗に見える」が起きやすく、honesty firewall（観測不足で断定しない）と衝突しうる。
- → **②詳細で実 dogfood の観測が溜まり、読まれ方（誤解の有無）を確認してから**③を再判断するのが安全。今は②のみで境界を固定する。

## 8. flag / production / rollback

- **flag**: `FIT_ARC_READOUT_ENABLED = false`（dormant・default OFF）+ `isFitArcReadoutEnabled()` の `NODE_ENV !== "production"` **hard block**。
  - 関連: `POST_VISIT_CHECK_ENABLED = false`（Stage 0 の答え合わせ器官も dormant）。
- **flag OFF / production**: `PlaceFitArcReadout` / `FitArcReadout` / `PostVisitCheckCard` は全て `null`＝**配線先（LocationDetailSheet / Candidate Lens ②）の DOM 完全不変**。
- **rollback**:
  1. 表示を止める = `FIT_ARC_READOUT_ENABLED` を false のまま（既定）。1 行で OFF。
  2. 配線ごと外す = `CandidateLensPanel.tsx` / `LocationDetailSheet.tsx` の `PlaceFitArcReadout` 行（+ import）を削除（commit revert で可）。
  3. 器官ごと止める = `POST_VISIT_CHECK_ENABLED` を false（既定）。observations 記録も no-op。
  - DB/migration/env なし → undo 対象なし。production には未到達（hard block）。

## 9. 次候補

1. **Stage 2: UI polish / copy / visual consistency** — Fit-Arc の見た目・文言・他要素との余白/トーン整合を②詳細 + LocationDetailSheet で磨く（配線は増やさない・honesty 表現を崩さない）。
2. **その後に Candidate Lens ③比較を再判断**（§6 の条件を満たす設計が立つか・②の dogfood で誤読が出ないかを見てから）。

> 本書は **docs-only**（コード変更なし）。新規 UI 配線・③/①配線・ranking/winner/highlight 変更・DB/API/外部/production/env・origin/main push はしていない。
