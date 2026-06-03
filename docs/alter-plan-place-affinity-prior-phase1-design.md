# Place Affinity — Persona-Prior Phase 1 設計書（P1-0・docs-only）

> ステータス: **設計提案（docs-only）**。実装（P1A）は CEO 承認後に着手。
> 起草: 2026-06-03 / Build Unit。CEO×GPT×Claude の合意フロー `C → P1-0設計 → P1A弱persona-prior → P2行動posterior` に基づく。
> 前提: Step4(C)「場所候補を活動SVGに集約（よく行く＋最近・title連動）」は実装済（commit `873d2ca1`）。本書はその"面"の上に載る並べ替え層を設計する。

---

## 0. 目的と非目的

**目的**: 場所候補が "Google の人気度＋距離" と "履歴の回数" だけで**固定的に**見える問題を、
**本人モデルを弱い事前分布(prior)**として使い「**この予定なら、あなたにはここが合うかも**」へ進化させる。
行動データがほぼ無い初期ユーザーでも初回から非空・非固定にする（cold-start を本人モデルで埋める）。

**非目的（P1ではやらない）**:
- 行動学習（selected/dismissed の蓄積・更新）→ **P2**。
- 状態・天気連動（体力/JMA）→ **P3**。
- DB / migration / known_places / 行動ログ永続化 → **P4**。
- Place Details / reviews NLP による場所性質取得（静か/電源/個室/混雑/雰囲気）→ **延期（Tier2）**。
- 外部 API 追加・Places query への persona 混入 → **禁止**（privacy 不変）。

**設計原則**: 本人モデルは**正解の中枢ではない**。主軸はあくまで〈予定内容・履歴・距離・候補タイプ・ユーザーの明示入力〉。
persona は**弱い補助スコア**。これは追加仕様ではなく、再利用するベイズ機械 `bayesianAxisUpdater.ts` の
`PRIOR_PRECISION = 0.5`（弱い事前分布）の既定挙動そのもの。証拠（行動・明示入力）が入れば自然に上書きされる。

---

## 1. アーキテクチャ：Persona-Prior × Behavioral-Posterior

```
事前分布(prior) = 本人モデル（Stargazer性格軸 / StyleProfile）   ← P1A で使う
尤度(likelihood) = 行動（selected/dismissed/searchedInstead/reused） ← P2 で乗る
事後分布(posterior) = prior を行動で更新した place affinity belief
```

- belief は `bayesianAxisUpdater.ts` の `AxisBelief { mu, precision, confidence, credibleInterval }` を**再利用**。
- **固定化対策は機械に内蔵**: `MAX_PRECISION = 50`（硬直化防止）＋ credibleInterval（不確実性）
  → P2 で事後分散に基づく探索（Thompson 的）を導入できる。GPT の 80/20 アドホック枠は不要。
- **P1A は prior のみ**（行動なし）。pure 関数。fail-open（prior 無→従来の並び）。

---

## 2. 使う本人モデル / 使わない本人モデル

### 使う（弱い prior として）
| ソース | 実在 | 用途 |
|---|---|---|
| Stargazer trait 軸（`lib/stargazer/traitAxes.ts`） | ✅ 47軸定義済 | routine↔novelty / solo↔social の prior 方向 |
| StyleProfileSummary（`lib/shared/styleProfile.ts`・`/api/my-style/bridge`） | ✅ | 補助（classic/trendy 等の傾向）。場所へは間接的＝最弱重み |

**place affinity に効く実在 trait 軸（推測でなく実キー）**:
- `tradition_vs_novelty`（伝統・既存 ↔ 新規性）／`novelty_threshold`（慣れた範囲が安心 ↔ 未知も平気・expansion）
  ／`change_embrace_vs_resist`（変化歓迎 ↔ 安定維持）／`cautious_vs_bold`（慎重 ↔ 大胆）
  → **routine↔novelty 軸の prior**（常連寄りか開拓寄りか）。
- `introvert_vs_extrovert`（内向 ↔ 外向）／`individual_vs_social`（個 ↔ 集団）
  → **solo↔social 軸の prior**（ranking-only・後述）。
- `classic_vs_trendy`（定番派 ↔ 流行派）→ routine↔novelty の補助。

### 使わない（P1）
- safety/relational_deep 系（`pressure_risk`, `control_tendency` 等）＝場所選びと無関係・誤用リスク。
- 認知/感情の深層軸（`attachment_style`, `rumination_tendency` 等）＝場所prior に直結せず断定リスク大。
- archetype ラベル・人格タイプ名 → **理由文に一切出さない**（§6）。

---

## 3. place affinity 軸と candidate feature 写像（取れる軸だけ）

現状 `PlaceCandidate`（`places/search`）が持つのは **`types[]` / `distanceMeters` / name / address** のみ。
履歴は `LocationUsage`（title/text/category/usedAt）。**取れる軸だけ**を使う。

| affinity 軸 | candidate feature（実在） | reason に出せるか | P1A 重み |
|---|---|---|---|
| `history_fit`（この予定で使った場所か） | 履歴一致（Step4 の `deriveTitlePlaceGroups`） | ✅ 強（事実） | 高 |
| `routine_novelty`（常連↔開拓） | 履歴内=routine / 履歴外=novelty | ✅（「いつもの」/「いつもより新しい」） | 中（persona prior が方向付け） |
| `distance_fit`（近さ） | `distanceMeters` | ✅（「移動が少なく…」） | 中 |
| `solo_social_hint`（一人↔複数向き） | `types[]` の弱推定（library/study↔bar/banquet） | ❌ **ranking-only・理由に出さない** | 低 |

**P1 では使わない feature**（嘘理由になるため）: 静か / 電源 / 長居 / 個室 / 高級感 / 混雑度 / 雰囲気。
これらは Place Details / reviews が必要＝Tier2（P3+ で fieldmask 追加を検討）。
→ **ranking 利用と reason 断定は別レイヤー**。取れない性質は ranking にも reason にも使わない。
　`solo_social_hint` のみ「弱く ranking に使うが reason には出さない」例外（types は弱信号のため）。

---

## 4. スコア式（P1A・pure・行動なし）

予定タイプキーは**新規分類を作らず** `classifyActivityIconKey(title)`（meeting/food/fitness/travel/work/generic）を再利用。

```
affinity(candidate | activityKey, persona) =
    w_hist  * history_fit(candidate, activityKey)              // 0..1 履歴一致
  + w_route * routineNoveltyMatch(candidate, priorμ)           // priorμ = persona 由来（弱）
  + w_dist  * distance_fit(candidate.distanceMeters)            // 近いほど高
  + w_solo  * solo_social_hint(candidate.types, persona)        // 低重み・ranking-only

w_hist > w_dist ≈ w_route > w_solo   （履歴と距離が主・persona は弱い補助）
```

- `routineNoveltyMatch`: persona の `priorμ`（routine↔novelty）が
  - novelty 寄り(μ>0) かつ candidate が履歴外 → 微加点
  - routine 寄り(μ<0) かつ candidate が履歴内 → 微加点
  - **μ は弱い prior**（`PRIOR_PRECISION=0.5`）。明示入力・履歴が在ればそちらが支配。
- **ユーザーの明示入力（locationText 手入力 / チップ選択）は常に最優先**（persona を上書き）。
- 出力は Step4 の既存面（活動SVG popover の よく行く/最近、② の PlaceCandidatesPanel 結果）の
  **並べ替え＋1行理由付与**のみ。新レーン「少し開拓」は P2+（novelty 信号と rating 取得後）。

---

## 5. UI 上の現れ（Step4 面の上の薄い層）

- **活動SVG popover**: 既存「よく行く／最近」の**並び順**を affinity で再ランク（チップ構造は不変）。
- **② PlaceCandidatesPanel（Google）**: 返ってきた候補の**並び順**を affinity で再ランク（取得内容は不変）。
- **1行理由**（任意・出せる時だけ）: チップ/候補に最大1つ、fact-gate（§6）。
- 「いつもの／この予定なら」の**2レーンのみ**（適応的開示）。「今のあなたなら」=P3、「少し開拓」=P2。
  空レーンは出さない（CEO 既定「薄い分析に育てない」）。

---

## 6. 理由文の安全ルール（GPT 補正②の中核）

**絶対原則**: 人格を断定しない。事実が無い節は出さない。取れない性質を語らない。

1. **断定禁止**: ❌「あなたは内向的なのでここ」→ ✅「集中する予定では、落ち着いた場所を選ぶ**傾向**かも」。
   trait 軸は人格ラベルでなく**行動傾向の仮説**として扱う。
2. **fact-gate**: 各節は裏付けデータが在る時のみ出力。
   - `history_fit>0` → 「前回の{予定}でも選んでいます」（事実: 過去利用あり）
   - novelty & 履歴外 → 「いつもより少し新しい候補です」（事実: 履歴に無い）
   - distance 小 & 次予定あり → 「移動が少なく、次に間に合いやすいです」（事実: 距離＋隣接予定）
   - persona 由来の傾向節 → **必ず hedge（かも/傾向）**＋ priorが支配的かつ credibleInterval が広すぎない時のみ。
3. **不確実性で表現を変える（§7）**。
4. **1行・原則1節**。仮説を積み重ねない。性格名・archetype 名・取れない性質（静か等）は出さない。
5. persona 由来節を出せない時は**事実節のみ**にフォールバック（無理に個人化しない）。

---

## 7. credibleInterval が広い時の表現

`AxisBelief.credibleInterval` が広い（＝確信が薄い・新規ユーザー）ほど**控えめ**に:

| 確信 | 表現例 |
|---|---|
| 広い（薄い） | persona 由来節は**出さない**。事実節（履歴/距離）のみ。 |
| 中 | 「…**かもしれません**」（強い hedge） |
| 狭い（厚い・P2 で行動が貯まった後） | 「…**傾向があります**」（断定はしない） |

P1A は基本「広い〜中」想定（prior のみ＝確信は弱い）。よって**事実節中心・persona は控えめ hedge**。

---

## 8. fail-open / privacy / log

- **fail-open 階段**:
  - persona 取得失敗（bridge null）→ history_fit + distance のみで再ランク（個人化なし・非空）。
  - 履歴も persona も無い → **従来の並び（identity passthrough）**。決して空・エラーにしない。
- **privacy（既存不変条件を継承）**:
  - 外部 Places への送信は **textQuery + coord のみ**（`places/search/route.ts` の不変）。persona は**送らない**。
  - スコアリングは client 側（persona は `/api/my-style/bridge` の既存 client 取得）。
  - `location_text` / persona を console / server log に**出さない**。analytics は粗い outcome 件数のみ（場所文字列なし）。
- **DB/migration/外部API 追加なし**。

---

## 9. P1 / P2 / P3 / P4 境界

| Phase | 内容 | データ | 永続化 |
|---|---|---|---|
| **P1A** | 弱 persona-prior 再ランク＋1行理由（事実中心） | persona(prior) + 履歴 + 距離 | なし（pure） |
| **P2** | 行動 posterior（selected/dismissed/searchedInstead/reused）で routine↔novelty belief を予定タイプ別に更新。Thompson 探索で「少し開拓」レーン解禁。Tier1 Places field（rating/price/count）追加で 定番↔開拓 feature 強化 | + 行動 | localStorage（versioned） |
| **P3** | 状態・天気（energy/JMA `shared/location`）→「今のあなたなら」。深い persona 軸 | + 状態 | localStorage |
| **P4** | DB 化（cross-device）・重い信号（評価/移動失敗等・機微） | + 重信号 | Supabase（要 migration・CEO 承認） |

**P1→P2 の唯一の境界**: P1A は belief を **prior で初期化したまま読むだけ**（更新しない）。
P2 が初めて `updateAxisBelief` で行動証拠を入れる。これにより P1A は完全 pure・テスト容易・低リスク。

---

## 10. やってはいけないこと（CEO/GPT 確定ガードレール）

- Step4 未完成のまま P1 実装（→ Step4 は `873d2ca1` で完了済）
- 人格断定の理由文 / 取れない場所性質（静か等）の推測
- DB migration / known_places table / 行動ログ永続化（P1）
- Place Details / reviews NLP / 外部 API 追加 / Places query への persona 混入
- remote apply / Supabase remote 変更
- 保存契約 / drop / range / height / 既存 data-testid の破壊

---

## 11. 実装時の検証計画（P1A 承認後）

- 純関数 `scorePlaceAffinity` / `buildPlaceReason` を**テスト先行**（fact-gate・hedge・fail-open・no-persona passthrough）。
- render-contract で「理由は出せる時だけ」「人格語が出ない」を assert。
- tsc baseline 1112・自ファイル0 維持。compose スイート GREEN。
- 実機 smoke: 並べ替えが効くか・理由が嘘でないか・persona 無しでも壊れないか。

---

## 付録: GPT 必須チェックリスト対応

1. place affinity axis → §3（history_fit/routine_novelty/distance_fit/solo_social_hint）
2. persona prior への写像 → §2（実 trait 軸）
3. candidate feature への写像 → §3（types/distance/履歴のみ・取れる軸限定）
4. score formula → §4
5. reason text の出し方 → §6
6. credibleInterval が広い時の表現 → §7
7. prior が無い時の fail-open → §8
8. 行動信号 P2 との境界 → §9
