# Day Rehearsal — per-marker「なぜ?」/ detail disclosure（audit + mini design）

> 2026-06-07 / **audit + 設計のみ・実装は次 GO** / 前提: day-level banner「なぜ?」が main live（`c221ac2d`）+ 詰まり/一息 marker live（`59e97dc4`）。
> CEO 方針: per-marker は read-only・初回は disclosure を増やしすぎない・marker 横直出しでなく安全な形（tap / small disclosure / shared area）・既存 layout 非破壊・day-level「なぜ?」と重複しすぎない・生スコア/係数禁止・断定/警告/診断禁止・観測ベース自然日本語。**根拠が弱い/情報量過多なら停止して報告**。

---

## 0. 目的
詰まり marker /一息 marker それぞれで「なぜここが詰まりやすい/一息つけそうなのか」を**この区間に固有の根拠**で軽く確認できるようにする。day-level「なぜ?」は1日全体の集約。per-marker は**この spot 固有**の specificity を足す（重複でなく深掘り）。

---

## 1. ★audit findings（read-only・コード検証済）

### 1-a. per-marker evidence は現状どこまで取得できるか
| marker | evidence source | 取得可能性 | 内容 |
|---|---|---|---|
| **詰まり（convergence）** | `rehearsal.steps[i].convergence.factors`（`ConvergenceEstimate`） | ✅ **取得可・per-marker で varied** | marker は level=high=**≥2 factors** が条件。factors ⊆ {`buffer_short`(feasibility insufficient=観測), `strain_high`(予定密度/連続=推定), `friction_high`(移動と予定差=推定)}。display path では実質 {buffer_short, strain_high}（friction は shortfall=null で不発）。 |
| **一息（recovery）** | `recoveryStepsFromFeasibilityRaw`（raw feasibility・WPM-2b） | △ **取得可だが uniform** | 全 recovery marker で同一条件（status sufficient ∧ 真の slack=gap−travel ≥60min）。slack 値は raw=出せない。理由は実質1つ「移動を引いても余白が残る」。 |

- 現状 marker は `convergenceSteps: Set<number>` / `recoverySteps: Set<number>` のみ DayGraphTimeline に渡る（per-marker evidence 未配線）。convergence factors を渡すには CalendarTab で `Map<number, ConvergenceFactor[]>` を `dayRehearsal.steps` から構築（additive・データは既存）。

### 1-b. 詰まり vs 一息 で根拠は十分に違うか（CEO 質問）
- **違う。かつ非対称**: 詰まり=「何が重なったか」を**複数 factor で区間ごとに変化**（移動余白少なめ / 予定立て込み / 両方）。一息=「余白が確保されている」の**単一・全 marker 共通**。
- → **per-marker「なぜ?」の価値は convergence に強く偏る**。recovery の per-marker は day-level「一息つけそうな区間」とほぼ同義（specificity が出ない）。

### 1-c. layout 上、安全な表示位置はあるか
- ✅ **ある**。TransitionItem（移動行）は既に **tap→expand** 機構を持つ（`expandedTransitionIndices` 共有 state + `onToggleFeasibilityDisclosure` を親 CalendarTab が管理 → expanded 時のみ `FeasibilityDisclosureLine` を conditional render）。**default closed・1 tap で 1 区間のみ展開・smoke 済で live**。
- coupling: convergence marker は buffer_short を必ず含む（≥2 factor 条件 + friction 不発）→ bufferStatus insufficient → feasibilityView 存在 → **tappable**。recovery も slack 変種で feasibilityView 存在。→ 既存 disclosure に **piggyback 可能**（新 tap target/新 state 不要）。

### 1-d. リスク評価
| リスク | 評価 |
|---|---|
| 情報量過多（marker × disclosure 乱立） | **回避可**。disclosure 化（default closed）＋既存機構 piggyback なら always-on 行が増えない。 |
| day-level「なぜ?」と重複 | 低〜中。day-level=集約「重なりやすさ」/ per-marker=この区間の factor「移動の余白が少なめ＋予定が立て込み」。**粒度が違えば非重複**。copy で差別化必須。 |
| 既存 FeasibilityDisclosureLine（余白/不足）と重複 | **中**。piggyback すると同じ展開域に「不足」と convergence buffer_short が並ぶ。copy で buffer_short を前面に出さず strain/friction を主にして dedup。 |
| recovery の根拠が薄い | **中**。uniform ＝ per-marker の価値低。convergence 先行 / recovery は defer or 最小 が妥当。 |

**audit 結論**: convergence は根拠が強く区間ごとに異なる → per-marker「なぜ?」に**値する**。recovery は uniform → 価値低く defer 推奨。安全な表示位置（既存 disclosure piggyback・default closed）が存在 → **停止せず mini design 可能**。

---

## 2. placement 候補と推奨
| 案 | 形 | 評価 |
|---|---|---|
| **A. 既存 transition disclosure に piggyback（推奨）** | 移動行 tap→展開域に feasibility(既存) + convergence「なぜ?」1行を追加 | ✅ **推奨**。新 tap target/新 state ゼロ・marker 行は不変（smoke 済維持）・default closed で volume bounded・「この移動の詳細を見る」と一貫。dedup を copy で管理。 |
| B. marker 行自体を disclosure 化 | 詰まり/一息 marker 行を tappable に→小 sub 行で factor 開示 | ○ 意味的に「なぜ?」が marker に直結。ただし transition tap の直下に第2 tap target=隣接で混乱 + marker 行（smoke 済）の改変 + 新 state。 |
| C. shared detail area（timeline 下に1箇所） | marker tap→下部共有エリアに表示 | △ 最も重い（新 component/state/focus 管理）・初回には過剰。 |

- **推奨 = A（piggyback）**。初回は「**convergence のみ**」に絞る（recovery は uniform で defer）。recovery を出す場合も同展開域に「移動を引いても余白が残ります」1行のみ。

## 3. copy 写像（factor → 観測ベース自然日本語・dedup 考慮）
| factor | 種別 | 日本語（案） |
|---|---|---|
| `buffer_short` | 観測 | 「移動の余白が少なめ」 |
| `strain_high` | 推定 | 「予定が立て込んでいそう」（★strain≠疲労。密度/連続の意） |
| `friction_high` | 推定 | 「移動と次の予定の差が小さめ」 |
| recovery（uniform） | 観測+推定 | 「移動を引いても余白が残りそう」 |
- 合成例（convergence・buffer_short+strain_high）: 「ここは移動の余白が少なめで、予定も立て込んでいそうです。」
- ★既存 feasibility 行が「不足」を出す区間では buffer_short を繰り返さず strain/friction を主に（dedup）。出ない factor は書かない。**最大1〜2行**。

## 4. 情報量 / トーン制御
- **default closed**・1 区間 1 disclosure・convergence は最大1〜2行・recovery は1行。data dump 化しない。
- 観測フレーム「ここは〜そうです」（仮説トーン）。**禁止**: 生スコア/分数/係数/level 名・「危険」「警告」「失敗」「疲れます」「壊れます」「診断」「予測」「予想」「推奨」「最適化」・amber/orange/red・成功色。
- day-level「なぜ?」と語を完全一致させない（集約 vs 区間で言い回しを変える）。

## 5. 実装スケッチ（次 GO 時・additive）
- `lib/plan/dayRehearsal/`: pure `explainConvergenceMarker(factors) → string[]`（factor→自然日本語・unit test）。recovery を出すなら `RECOVERY_MARKER_WHY` 定数1本。
- `CalendarTab`: `dayRehearsal.steps` から `convergenceFactorsByIndex: Map<number, ConvergenceFactor[]>` を useMemo（additive）→ DayGraphTimeline に渡す。
- `DayGraphTimeline`: 案A=transition expanded ブロック（既存 286-291 付近）に、当該 index が convergence/recovery marker のとき「なぜ?」行を conditional 追加（FeasibilityDisclosureLine と同階調 slate text-xs italic）。marker 行（ConvergenceMarkerLine/RecoveryMarkerLine）と markerSet props は不変。
- 新 store/API/DB なし・evidence は既存 rehearsal から導出。

## 6. 制約 / HARD GATE
- read-only・予定変更/repair/optimize/auto-reschedule なし。**marker 行 / day-level banner「なぜ?」/ feasibility disclosure / timeline layout 非破壊**。MapTab/DB/Google/push/PR/Vercel 不接触。
- 実装中に **layout 崩れ / 情報量過多 / 断定的 / day-level と重複過多** になれば**実装せず停止して報告**。
- dayGraphTimelineComponent.test.ts は file を grep（予測/予想/推奨/最適化/警告 禁止）→ コメントでも使わない。

## 7. CEO 判断点（実装 GO 前）
1. placement = **案A（既存 transition disclosure に piggyback）**で良いか（案B marker-disclosure / 案C shared area との比較）。
2. 初回スコープ = **convergence のみ**で良いか（recovery は uniform で defer / それとも1行だけ出す）。
3. copy = §3 の factor→自然日本語・観測トーン・dedup（feasibility と重複回避）で良いか。
4. `explainConvergenceMarker` を pure 新設 + `convergenceFactorsByIndex` を CalendarTab で構築（additive）で良いか。

## 8. 参照
- code: `app/(culcept)/plan/components/DayGraphTimeline.tsx`（marker render 286-308 / disclosure 機構 255-291 / FeasibilityDisclosureLine 604-626 / Convergence・RecoveryMarkerLine 628-668）/ `lib/plan/dayRehearsal/dayRehearsal.ts`（`convergence()` 137 / `recoveryStepsFromFeasibilityRaw`）/ `dayRehearsalTypes.ts`（`ConvergenceEstimate` 84 / `ConvergenceFactor`）
- 前提: `…-evidence-ui-closeout.md`（day-level「なぜ?」）/ `…-wpm2-closeout.md`（marker）
