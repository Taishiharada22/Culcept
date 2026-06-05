# Second Self Map — v0-F mini design（belief update：precision 重み付き集計）

> 2026-06-05 / code branch `claude/second-self-map-v0` ・ doc branch `claude/nifty-turing-128e67`
> **本書は design のみ。v0-F 実装は CEO GO 待ち。**
> 前提: **v0-E 完了**（`hypothesisFeedbackStore` に confirmation / explicitCorrection を記録・selectedModeStore 不変）。
> 上位: `docs/second-self-map-master-design.md`（vision）/ `docs/second-self-map-implementation-plan.md`（順序・status）。

---

## 1. 目的（一言）
belief を「全選択を均等 1 でカウント」（v0-F-lite）から「選択の **precision** で重み付けして集計」へ。
= 仮説を**訂正した**選択（explicitCorrection）を、ただの選択より強く学習する。**preference-not-policy / observed>inferred** の実装接地。

## 2. 何を足すか
v0-F-lite の `buildModeBelief`（均等重み）に、**hypothesisFeedback を JOIN して precision 重みを掛ける**層を足すだけ。
出力型は同じ `ModeBelief`（legKey / counts / total / topMode / topShare）。ただし counts は **加重（float）**。
→ 下流（necessityGate / explanationCopy / mobilityGuidance / MapTab）は **一切変更不要**（同じ型を受け取る）。

## 3. 2 store の JOIN モデル（★selection-driven + match check）
- **iterate**: `selectedModeStore`（現在選択の正本）を legKey で走査。各 (day, leg) → mode。
- **annotate**: `hypothesisFeedback[day][leg]` を引いて precision class を決める：
  - feedback あり ∧ `feedback.chosenMode === 選択 mode` → feedback.kind（confirmation / explicitCorrection）の重み
  - feedback あり ∧ `chosenMode ≠ 選択 mode`（= 後で**選び直した**）→ **baseline**（stale feedback は最終 mode に適用しない）
  - feedback なし → **selected（baseline）**
- 各選択を **1 回だけ** 加重カウント（= 二重計上しない。selectedModeStore が mode の正本、feedback は注釈のみ）。

> ★re-selection 整合（重要）: v0-E は 2 回目選択時 `surfacedMode=null`（既に選択済→仮説非表示）で feedback を上書きしない。
> よって `feedback.chosenMode` は「最初の仮説への応答」を保持する。最終 mode と食い違う場合は baseline に落とす（correction 重みの **mis-attribution 回避**）。
> ★orphan は自然に無害化: feedback だけで selection が無い entry は iterate 対象外（selection-driven）。両 store は同じ caps(60日/100leg) で同調 evict。

## 4. precision 重み（3 値・研究接地）
| class | 重み | 根拠 |
|---|---|---|
| **selected**（仮説なしの自由選択） | **1.0** | 暗示汚染ゼロのクリーン基準 |
| **confirmation**（仮説と同じ mode） | **1.0** | filter-bubble 警戒。暗示誘導かもしれない → **増幅しない**（自由選択と同等に留める） |
| **explicitCorrection**（仮説と違う mode） | **2.0** | 反暗示＝最も純粋な選好の証拠。ユーザーが系を**教えている** → 強める |

- confirmation を 1.0 に留める設計が **filter-bubble の上限**：confirmation が複利で belief を膨らませない。belief を動かすのは genuine correction のみ。
- correction=2.0 の意味: 1 回の意図的 override ≈ 2 回の受動選択。単一 correction が belief を**支配しない**中庸値（5.0 等は過剰）。
- 将来 tuning knob（**v0-F 外**）: filter-bubble が観測されたら confirmation を 0.7 へ discount 可。confirmation:correction 比は feedback store から観測可能。

## 5. 出力（weighted ModeBelief）+ strength 較正の注意
- `counts[mode] = Σ 重み` / `total = Σ 全重み` / `topShare = topWeight / total`。
- ★`deriveHabitualStrength`（total≥5 strong / ≥3 moderate / ≥1 weak）は従来**整数個数**前提。weighted total は単位が変わる（correction 1 回 = 2.0）。
  - 効果: correction は少回数で moderate 到達（2 回同 mode = 4.0 ≥ 3 → moderate）。これは precision weighting が**意図通り効いている**。
  - v0-F は閾値 5/3/1 を**据え置き**（weighted 単位で運用）。再較正は将来 tuning（v0-F 外）。
  - `split guard`（topShare<0.6 は moderate 不可）が contested belief を引き続き沈黙させる → 対立 belief の早期 surface を防ぐ。

## 6. 実装 shape（参考・実装は GO 後）
- pure: `buildWeightedModeBelief(selectedStore, feedbackStore, legKey) → ModeBelief`（`beliefReadAdapter.ts` に追加 or 拡張）。
- loader: `loadWeightedModeBelief(legKey)`（`parseStore` + `parseFeedbackStore` の両読み・fail-open）。
- MapTab: `loadModeBelief(openLeg.legKey)` → `loadWeightedModeBelief(openLeg.legKey)` の **1 行差し替え**（mobilityCardData 内）。
- tests: 加重カウント / correction boost / confirmation no-boost / re-selection mismatch→baseline / fail-open（feedback 破損でも selected 集計は動く）。

## 7. scope 境界
**v0-F is**: 既存 2 store を READ して belief を加重集計する pure 層 + loader + MapTab 1 行差し替え。
**v0-F is NOT**（= やらない）:
- 第 3 の永続 store（belief は on-the-fly 計算のまま・新規 store なし）
- selective forgetting / time decay（L3）
- cold-start partial-pooling（L4）
- OD / 時間帯 / 曜日 一般化（L1 / S2-B）
- weather / context modifier（L5）
- `selectedModeStore` / `hypothesisFeedbackStore` の改変（両者 **READ のみ・不変**）
- 距離→mode 推定 / fake duration / 人格診断 / DB・Supabase / Google API / push・PR（全て既定の禁則のまま）

## 8. リスクと対処
| リスク | 対処 |
|---|---|
| re-selection で `feedback.chosenMode` と最終 mode が食い違い、correction 重みを誤付与 | match check（§3）で baseline に落とす |
| weighted total で strength 較正がズレる | 閾値据え置き＋split guard 維持（§5）。再較正は将来 |
| confirmation の filter-bubble 増幅 | confirmation=1.0（増幅しない）。discount(0.7) は将来 knob |
| feedback store 破損 / 不在 | fail-open（§6 test）。selected 集計（v0-F-lite 相当）に縮退 |
| 加重 float の桁 / NaN | 重みは定数 {1.0, 2.0}・`total>0` のときのみ topShare 計算（既存 guard 踏襲） |

## 9. CEO 判断ポイント（実装 GO 前）
1. precision 重み **{selected 1.0 / confirmation 1.0 / explicitCorrection 2.0}** で良いか（特に correction=2.0 の強さ）。
2. strength 閾値（5/3/1）**据え置き**で良いか（weighted 単位での運用を許容するか）。
3. confirmation を **1.0 のまま**にするか、最初から **0.7 discount** で攻めるか。

---

## 参照
- 上位設計: `docs/second-self-map-master-design.md`
- 実装順序・status: `docs/second-self-map-implementation-plan.md`
- v0-E 実装（前提）: code `claude/second-self-map-v0` HEAD `e6d5a6a5`（配線）/ `72e42678`（pure）
