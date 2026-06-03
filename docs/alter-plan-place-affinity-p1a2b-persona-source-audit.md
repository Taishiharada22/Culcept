# P1A-2b — Persona 取得源 mini audit（read-only / docs-only）

> ステータス: **監査のみ（docs-only）**。persona 接続の実装は未着手・未承認。
> 起草: 2026-06-03 / Build Unit。合意フロー `C→P1-0→P1A-1→P1A-2a→[P1A-2b 監査]→P1A-3?`。
> 目的: P1A-3（弱 persona prior 接続）に進む前に、取得源・故障面・人格断定回避・責務分離を根拠付きで精査。

---

## 0. 結論（先に）

- **使うべき本人モデルは Stargazer `axis_scores`**（traitAxes キーの -1..1）。**StyleProfile ではない**（服中心・場所に効かない）。
- 取得経路は**既に存在**（新規エンドポイント不要）。`alterHomeAdapter.ts` に消費前例あり。
- **ただし P1A-3 は「defer（保留）」を推奨**。理由: ①P1A-2a で「固定感」の主因は既に解消、persona は最弱の最後の5% ②cross-feature 依存（Stargazer データ可用性・fetch/cache/fail-open）の追加コストが見合わない ③今月の北極星は Stargazer 深層観測＋コア完成で、ここではない ④P2 の行動 posterior は persona prior より強い信号で、これが入れば prior の限界価値はさらに下がる。
- 設計は**即着手可能な状態で凍結**（取得源確定・写像定義済）。必要時に低コストで解凍できる。

---

## 1. 使用可能な本人モデル（根拠つき）

| モデル | 実体・経路 | 場所への適性 |
|---|---|---|
| **Stargazer `axis_scores`** | `stargazer_resolved_types.axis_scores`（jsonb, `Record<TraitAxisKey, number>` -1..1）。書込: `createEmptyAxisScores()`（traitAxes キー）＋ `mergeAxisScores`（`stargazer/profile/route.ts` L200-204） | **◎ 直接効く**。`tradition_vs_novelty`/`novelty_threshold`/`change_embrace_vs_resist`/`cautious_vs_bold`→routine↔novelty、`introvert_vs_extrovert`/`individual_vs_social`→solo↔social |
| Stargazer `dimensions` | `stargazer_personality_profile.dimensions` | ○ axis_scores の素。profile route がマージ |

**取得経路（3つ・いずれも既存）**:
1. **`/api/stargazer/profile`**（canonical）: 複数ソースをマージ＋belief 伝播（`route.ts` L200-255）。最も正確・やや重い。
2. **`/api/my-style/bridge`** crossFeature.stargazerTypes.axisScores（`bridge/route.ts` L81,161-165）: raw resolved を返す。**既配線**だが §3 のリスクあり。
3. テーブル直読み `stargazer_resolved_types.axis_scores`（最小・focused）。

**前例**: `lib/stargazer/alterHomeAdapter.ts` が既に axisScores を判断エンジンで消費（Plan-side 消費の確立パターン）。

---

## 2. 使用しない本人モデル（StyleProfile = 服中心）

`StyleProfileSummary`（`lib/shared/styleProfile.ts`）/ `types.ts` の中身は **全て服飾・印象・色**:
- `StyleLaneCode`（スタイル系統）、`desiredImpressions`/`attractedWorldviews`（見た目印象・惹かれる世界観・`types.ts` L138,144）、`dominantColors`、`pcSeason`、`bodyType`、silhouette/material/detail/pattern（`bridge` L138-143）。
- **場所選びの軸（routine/novelty・solo/social・静/賑）に写像できる項目は無い**。GPT の懸念は**正しい**。
- **判定: place prior に StyleProfile は使わない**（使うとしても最弱の補助止まりだが、誤写像リスクが利得を上回るため P1A-3 でも非採用を推奨）。

---

## 3. `/api/my-style/bridge` 依存リスク（Plan compose に入れてよいか）

`bridge/route.ts` GET の実体:
- **8 並列 Supabase クエリ**の nodejs エンドポイント（L42-84）＝軽くない。
- **コア4テーブル（styleSummary/pref/taste/vector）は error で throw→500**（L86-89）。
- cross-feature（personalColor/body/**stargazer/stargazerTypes**）は **error→null の fail-soft**（L91-95）。
- 診断 console.log/warn 多数（L108-111）。

**リスク**: Plan compose が bridge を**毎回 await**すると、①8クエリ分の遅延 ②コア4テーブル不調で 500→compose 巻き込み。
**判定**: **Plan compose を bridge に依存させない**。persona を使うなら ①focused 読み（経路3 or `/api/stargazer/profile`）②**一度だけ fetch＋cache**③**error/timeout は即 fail-open（persona=null）**。bridge の cross-feature 自体は fail-soft なので、persona 部分が null になっても安全。

---

## 4. Stargazer 取得経路（再掲・確定）

- キー形式: **traitAxes キー**（`createEmptyAxisScores()` が `Record<TraitAxisKey, number>` を生成）。値 -1..1。
- 経路は §1 の3つ。P1A-3 で使うなら **focused 読み（resolved_types.axis_scores 直 or /api/stargazer/profile）＋ client cache ＋ fail-open** が安全。bridge 全体依存は避ける（§3）。

---

## 5. traitAxes → 人格断定リスクと回避（構造で担保）

- trait 軸は Stargazer 内で**全て仮説扱い**（HDM 思想）。値は連続スコア。
- place prior への写像は **ranking の弱い方向付けのみ**（P1A-1 `PRIOR_PRECISION=0.5` / `|personaTerm|≤ε`）＝**順位を支配しない**。
- **理由文には一切出さない**（§7）。「内向的だから」等の断定は構造的に不可能。
- 判定: **人格断定リスクは構造で回避済**（弱 prior＋reason 非注入）。

---

## 6. fail-open 方針（persona 無で完全動作）

- `rerankPlaceAffinity`（P1A-1）: `personaPrior` optional、null→personaTerm=0（履歴/距離/タイプのみ）。テスト固定済。
- `rerankGoogleCandidatesByActivity`（P1A-2a）: そもそも persona 非関与。
- bridge/stargazer 取得失敗 → persona=null として扱い、上記の非persona挙動に落ちる。
- 判定: **persona が無くても全機能が成立**（P1A-2a は persona 無しで既に出荷済）。

---

## 7. reason 安全方針（接続後も persona を出さない構造）

- `buildFactReason(item, ctx)`（P1A-1）は **persona を引数に取らない**＝persona 由来理由は生成不可能。
- `placeCandidateRanking`（P1A-2a）は persona を全く持たない。
- persona 接続（P1A-3）は **score にだけ effect**し、reason 生成関数には到達しない。
- 判定: **接続後も reason は fact-only を維持**（構造的保証・回帰させない）。

---

## 8. P1A-1 full scorer ／ P1A-2a gentle reorder の責務分離（CEO 記録指示）

> ※「P1A-2a で P1A-1 を配線した」ではない。両者は別物。

| | `rerankPlaceAffinity`（P1A-1） | `rerankGoogleCandidatesByActivity`（P1A-2a） |
|---|---|---|
| 役割 | **将来の full affinity scorer の土台** | **Google Places 用の gentle reorder（安全版）** |
| 入力 | 自前候補（履歴/距離/タイプ/頻度＋弱persona） | Google の関連度順済み候補 |
| 並べ替え | ゼロから合成スコアで並べる | Google 順を土台に type 整合を**最大1ポジション**浮かせるだけ |
| persona | optional（弱 tie-breaker） | 非関与 |
| 現状 | **UI 未接続**（土台として保持） | ComposeFormPanel の Google パネルに opt-in 配線済 |

**いつ full scorer を使うか**: 履歴・距離・タイプ・(弱)persona を**統合した自前候補集合**を一から並べる面（例: 将来の統合「この予定なら」リスト）。Google の既存関連度を尊重すべき場面では使わない（P1A-2a の gentle reorder を使う）。

---

## 9. 最小接続点（**if implemented**・DESIGN のみ・未実装）

- persona が入るのは **full scorer `rerankPlaceAffinity` のみ**。`placeCandidateRanking` には**入れない**（persona-free を維持）。
- 接続点: 将来の統合候補面（P1A-3）で `loadPlacePersonaPrior()` を **一度 fetch＋cache＋fail-open**。
- 写像（DESIGN）: `axis_scores`（traitAxes）→ `PlaceAffinityPrior`
  - `routineNovelty = wmean(tradition_vs_novelty, novelty_threshold, change_embrace_vs_resist, cautious_vs_bold)`（+ = 開拓志向）
  - `soloSocial = wmean(introvert_vs_extrovert, individual_vs_social)`（+ = social）
  - clamp[-1,1]。欠損軸は 0。**弱重み固定**（最終 |personaTerm|≤ε は P1A-1 が担保）。
- 取得源: **Stargazer axis_scores（focused 読み）**。StyleProfile・bridge 全体依存は不採用。

---

## 10. 判定: P1A-3 へ進むか / defer か

**defer（保留）を推奨。**

- **理由（goal-driven）**: ①P1A-2a で「固定感」の主因（Google 汎用順）は既に gentle 解消 ②persona prior は最弱の最後の5%で、cross-feature 依存（Stargazer 可用性・cache・fail-open）の追加コストに見合わない ③今月の北極星は **Stargazer 深層観測＋コア完成＋初期ユーザー＋デプロイ**で、ここは中核でない ④**P2 の行動 posterior は persona prior より強い信号**＝P2 が入れば prior の限界価値はさらに低下。
- **凍結状態**: 取得源確定（Stargazer axis_scores）・写像定義済（§9）・fail-open/ reason 安全の構造担保済。必要時に低コストで解凍可能。
- **解凍トリガ候補**: ①初期ユーザーの行動ログが貯まり P2 着手時（prior+posterior を同時設計）②Stargazer 深層観測が成熟し axis_scores の信頼度が上がった時。

---

## 付録: 完了報告 8項目対応

1. audit docs commit hash → 本コミット（報告に記載）
2. 使用可能な本人モデル → §1（Stargazer axis_scores・3経路・前例 alterHomeAdapter）
3. 使用しない本人モデル → §2（StyleProfile = 服中心）
4. StyleProfile を使う場合の危険性 → §2（場所への誤写像・利得 < リスク）
5. Stargazer traitAxes の取得経路 → §1,§4（profile route / bridge crossFeature / table 直）
6. fail-open 方針 → §6（persona=null で全機能成立）
7. reason 文安全方針 → §7（buildFactReason が persona 非受領・構造保証）
8. P1A-3 へ進むべきか / defer → **§10: defer 推奨**（設計は凍結・即解凍可）
