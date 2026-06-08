# Place Affinity P4 combiner（pure 実装）+ P5 UI配線 mini-design

> 2026-06-09 / Build Unit / P4=pure combiner（未配線・着地）／ P5=UI配線 mini-design（★UI 実装は CEO 判断まで停止）。

---

## P4 — general × personal combiner（実装・pure・未配線）

### 責務分離
| 層 | 役割 | 出力 |
|---|---|---|
| **P1A（一般則）** | distance/type/freq/history で候補 score | generalScore（baseScore） |
| **P2（revealed preference）** | よく行く場所か | strength（occasional/frequent/habitual） |
| **P3（条件付き）** | 今日の条件に合う場所か | skewsToCondition + strength |
| **P4（combiner）** | 上記を結合し穏やかに順位調整 + 観測 reason | CombinedPlace[] |

### 設計（A2 context modifier の規律を場所に適用）
- `combinedScore = generalScore + clamp(nudge, 0, maxNudge)`。★**nudge ≥ 0**（未訪問を **罰しない** → filter bubble を作らず探索を潰さない）。
- **clamp（maxNudge=0.25）**: baseScore 上限 ~2.15 に対し 1 割強。明確な general 勝者（gap>maxNudge）を personal が覆せない。接近した候補のみ入替。
- **sufficient gate**: P2/P3 が "ready" のときだけ反映・薄ければ general-only（fallback）。
- **conflict**: bounded ゆえ general 優先。reason は **P3（今日の条件）> P2（よく行く）** で最も具体的な 1 つ。
- **nudge 配分**（固定・較正 backlog）: habitual +0.15 / frequent +0.08 / 今日の条件 skew +0.10。occasional は反映/note しない。
- **reason builder**: P2/P3 の既存 builder に委譲（copy 単一源）・**人格診断にしない**・偽の確率を表示しない（score は内部順位用）。
- **privacy**: P2/P3（既に sensitive 除外・座標なし）を placeKey で照合のみ。**新規データなし**・pure・出力に座標/住所なし。

### 実装
`lib/plan/compose/placeAffinityCombiner.ts`: `combinePlaceAffinity(inputs, {p2, p3?}, config)` → `CombinedPlace[]`（rank/personalNudge/personalNote/personalApplied）+ `combinedPersonalReasonLine(note)`。★UI/候補生成に **未配線**。tests / tsc footprint 0。

---

## P5 — UI配線 mini-design（★設計のみ・UI 実装は CEO 判断まで停止）

### 場所候補にどう出すか
- 現状: `placeCandidateRanking`(P1A-2a) が Google 候補を活動タイプで軽く reorder（deploy 済）。候補は compose の場所選択 UI に出る。
- P4 combiner を繋ぐなら: 候補に placeKey（正規化 locationText）を付け、P2/P3（observation から build）を渡して結合。

### ★並び替えに効かせるか、理由だけにするか（最重要・段階）
| 案 | 内容 | リスク |
|---|---|---|
| **案A（推奨・第一歩）reason-only** | 順位は変えず、候補に「よく行く場所」「雨の日に行きやすい」を**控えめな観測 reason** で添えるだけ | 低（候補挙動が変わらない＝stop gate「scorerへの実配線で候補挙動が変わる」を踏まない） |
| 案B ranking + reason | combiner で順位も調整 | ★候補挙動が変わる＝stop gate。案A で体感を確かめてから別途 CEO 判断 |

→ ★**P5 UI は案A（reason-only・順位不変）から**。順位反映（案B）は候補挙動が変わるため別の CEO 判断。

### 控えめな表現
- A2 の contextReason と同様: slate 中立・read-only・1 行・仮説トーン（「〜のようです」）・人格語/数字/座標なし。
- necessity gate: personalNote があり sufficient のときだけ（沈黙原則）。occasional/skew なし/not_enough は出さない。
- 文言は既存 builder（`placeAffinityReasonLine`/`placeConditionReasonLine`/`combinedPersonalReasonLine`）そのまま。

### user-facing smoke 観点（UI 実装時）
1. よく行く場所に「よく行く場所のようです」が控えめに出るか。
2. 雨の日に、雨に skew した場所に「雨の日に行くことが多い」が出るか。
3. 普段/未訪問/薄いデータの候補に**何も出ない**（沈黙）か。
4. 候補の**順位が変わらない**（案A）か。既存 Google 候補表示が壊れていないか。
5. 人格診断/断定に見えないか。

### ★stop gate（UI 実装は CEO 判断まで停止）
- 実 UI 表示 / Plan 候補への本配線 / 順位反映（案B） = すべて user-facing UI stop gate。
- placeKey 照合のため候補側に正規化 locationText を持たせる配線も「候補挙動に近い」→ CEO 判断。

→ ★P5 は **mini-design で停止**。UI 実装（案A reason-only から）は CEO 承認で。

---

## 次
P4 pure combiner 着地（未配線）→ P5 UI配線は案A（reason-only）設計を提示し CEO 判断待ち（UI 実装停止）。
