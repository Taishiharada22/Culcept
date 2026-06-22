# 評価OS Fit-Arc 配線境界 Closeout（Stage 1-C / 1-D / 2 反映・docs-only）

更新: 2026-06-22 / 状態: **境界固定（docs-only）**
対象: Fit-Arc(Aneura-star) readout の配線範囲と不変条件
関連: `lib/plan/postVisit/fitArcReadout.ts` / `app/(culcept)/plan/components/{FitArcReadout,PlaceFitArcReadout,PostVisitCheckCard}.tsx` / `CandidateLensPanel.tsx` / `LocationDetailSheet.tsx`

---

## 1. Fit-Arc の現在の配線先（DONE・3箇所）

| Stage | 画面 / 箇所 | 内容 | commit |
|---|---|---|---|
| 1-B | **LocationDetailSheet**（Travel 場所詳細シート） | 答え合わせ(PostVisitCheckCard)の直上に readout。保存→onRecorded→再読込で連動 | `499cd2937` |
| 1-C | **Candidate Lens ②詳細**（`view==="detail"` の ChipRow 直下） | 同 placeDescriptor→opaque key で観測を読み readout 表示 | `293a64c57` |
| 1-D | **Candidate Lens ③比較「もう一つの見方」**（recommendation の**下**・比較表の外） | メイン winner とは**分離**した補助セクション。左右候補の Fit-Arc を %付きで並べ「過去の答え合わせ・勝敗には使わない」と明示 | `1112dcd64` |
| 2 | （上記3箇所共通の polish） | ヘッダ「🧭 あなたへの適合」/ honest かつ温かい文言 / state 別トーン | `264876f7a` |

全て `PlaceFitArcReadout`（connected wrapper）経由。**flag OFF で `null`／③はセクションごと非描画＝DOM 不変**。

## 2. 未配線の場所（明示・触れていない）

- **Candidate Lens ①カード**（候補1枚スワイプ）— **未配線（意図的・§7）**
- **Travel dashboard**（Concierge Dashboard）— 未配線
- **Location Notes 一覧**（カード一覧）— 未配線

## 3. Fit-Arc の性質（invariant・再固定）

- **表示専用 readout**。**ranking / recommendation scoring / winner / highlight / comparison logic に一切影響しない**。
  - 観測を**読むだけ**（`loadPostVisitObservations` を placeKey で filter）。**書かない・スコアに供給しない・並べ替えない**。
  - `buildLensComparisonView`（候補順 / winner / 優位ハイライト / 推薦）には**触れない**。candidateLens 211 tests が不変で PASS = 実証済み。
- **表示対象は「この人・この目的・この状態への適合(I_{u,p})」**であり、**他者の平均品質(Q_p)・星ではない**。ヘッダ「あなたへの適合」で明示。

## 4. evidence 件数チップ必須（invariant・固定）

- **全 state で「観測 N 件」チップを常に描画**。**消す prop を持たない（構造的に削れない）**。
- 理由: de Langhe の「件数を無視した単一スコアのアンカー化」を構造で防ぐ。**件数チップなしの単独スコア表示は禁止**。

## 5. 観測ゼロ / 少数 / 十分の表示ルール（Stage 2 文言で固定）

| 観測（回答済み） | state | アーク | 中央 | label |
|---|---|---|---|---|
| **0 件** | insufficient | **empty**（点線・空リング） | `—` | **「答え合わせが増えると、ここに見えてきます」**（値 null・断定しない・前向き） |
| **1-2 件** | tentative | **dashed**（破線・仮説色） | `≈%` | 「あなたの観測 N 件・まだ仮説です」 |
| **3 件以上** | observed | **solid**（ProgressRing 再利用） | `%` | 「あなたの観測 N 件にもとづく傾向」 |

- 閾値 `FIT_ARC_TENTATIVE_MIN=1` / `FIT_ARC_OBSERVED_MIN=3`。未回答(null)は適合に寄与しない（件数=回答済み）。**観測不足で高精度に見せない**。

## 6. ③比較の invariant（Stage 1-D・実装済み・固定）

③に出す Fit-Arc は「もう一つの見方」セクションとして以下を**全て満たす**:
1. **「今回のおすすめ」(winner) と「もう一つの見方」(Fit-Arc) は別セクション**。
2. **Fit-Arc は winner / highlight / comparison logic に影響しない**（表示専用・`buildLensComparisonView` 不触）。
3. **比較表(lens-row)の中に入れない**（recommendation の下・table の外に配置）。
4. **件数チップ必須**。
5. **観測0件は empty**（適合値で順位づけ・優劣表示しない）。
6. **観測1-2件は「まだ仮説」**（dashed・≈%）。
7. **観測3件以上で「観測にもとづく傾向」**（solid・%）。
8. **ranking / recommendation / winner / highlight には絶対使わない**。
- セクション文言で「過去の答え合わせ・上の『おすすめ』とは別・勝敗には使いません」と明示（誤読防止）。

## 7. ①カードへはまだ出さない理由

- ①カードは**初見1枚の判断が強い**画面。そこに Fit-Arc（%）を置くと、**即「この候補のスコア＝ランキング」に見える**（②詳細/③補助より誤読リスクが高い）。
- ①は候補を捲って選ぶ段階で、winner/比較が確立する前。適合 % を前面に出すと「最初から答えが出ている」印象になり、第二の自己の「押し付けない」姿勢と衝突する。
- → ①は **dogfood で②③の読まれ方を確認するまで保留**。

## 8. flag / production / rollback

- **flag**: `FIT_ARC_READOUT_ENABLED = false`（dormant）+ `isFitArcReadoutEnabled()` の `NODE_ENV !== "production"` **hard block**。器官 `POST_VISIT_CHECK_ENABLED = false` も dormant。
- **flag OFF / production**: 全コンポーネント `null`／③セクション非描画＝**配線先（LocationDetailSheet / ②詳細 / ③比較）DOM 完全不変**。
- **rollback**:
  1. 表示を止める = flag を false のまま（既定）。
  2. 配線を外す = `CandidateLensPanel.tsx`（②の1行 + ③セクション）/ `LocationDetailSheet.tsx`（PlaceFitArcReadout 行）を削除（commit revert で可）。
  3. 器官ごと止める = `POST_VISIT_CHECK_ENABLED` を false（既定）。observations 記録も no-op。
  - DB/migration/env なし → undo 対象なし。production 未到達（hard block）。

---

## 9. 次の実装候補の整理（Phase B・設計のみ・実装しない）

判断基準で4候補を評価（実 dogfood 前提・ランキング誤読回避・flag OFF 安全・既存 logic 不変・効率）:

| 候補 | UX つながる | ランキング誤読 | flag OFF 安全 | logic 影響 | dogfood 前に意味 | 効率 | 総合 |
|---|---|---|---|---|---|---|---|
| ① ①カードに出す | 低 | **高**（初見=即ランキング・§7） | OK | なし | 低 | 低 | ✕ |
| ② Travel dashboard に出す | 中 | 中（一覧的・複数 %） | OK | なし | 低 | 中 | △ |
| ③ Location Notes 一覧に出す | 低 | **高**（%グリッド=ランキング） | OK | なし | 低 | 低 | ✕ |
| ④ 別の dormant 接続＝**観測生成を主フローへ** | **高**（loop を主導線で閉じる） | 低（答え合わせは勝敗でない） | OK | なし | **中〜高** | 中 | ◎ |

### 推奨（1つに絞る）: **④ — Fit-Arc placement の拡張は止め、「観測生成」を主フローに広げる**

**理由（ボトルネックは置き場所でなく観測の有無）**:
- 現在 answer-check(PostVisitCheckCard) は **Travel Location Notes 詳細にしか無い**。Candidate Lens で選んだ場所の post-visit 観測は**生成されない** → ②③の Fit-Arc は**永遠に empty**。
- だから次に意味があるのは「もう1箇所 Fit-Arc を置く」ことではなく、**「答え合わせが主フローで発火し観測が貯まる導線」**を作ること。これが**3箇所の Fit-Arc すべてを一度に意味あるものにする**唯一の鍵（＝最高効率）。
- ランキング誤読リスクが低い（答え合わせは勝敗でなく自己の振り返り）。flag OFF 安全。既存 logic 不変。
- **想定 surface（次 GO で scoping）**: plan/calendar で**予定が経過した anchor（場所付き）**を見た時に答え合わせを出す（lens で選んだ場所の自然な post-visit モーメント）。

**保留（やらない）**: ①/Travel dashboard/Location Notes 一覧 への Fit-Arc 拡張（ランキング誤読リスク + 観測ゼロで inert）。dogfood で②③の読まれ方を確認してから再判断。

> 本書は **docs-only**（コード変更なし）。新規 UI 配線・①/dashboard/一覧 配線・ranking/winner 変更・DB/API/外部/production/env・origin/main push はしていない。Phase B は設計整理のみで実装しない。
