# Day Rehearsal Repair Candidate — What-if Preview mini design（設計のみ・実装は次 GO）

> 2026-06-07 / **設計のみ・実装しない** / 前提: Repair v0 候補 +「どうするとよさそう？」UI が main live（`98332f09`）。
> 目的: 候補を**実行する前に**「選ぶと何が軽くなりそうか / 何はまだ未確定か」を **read-only の what-if プレビュー**で見せられるか設計。★予定変更・実行・保存なし。

---

## 0. 結論（先に）
- **qualitative（定性）what-if は feasible・pure・safe**。各候補が「どの診断シグナルに効くか」を rehearsal 出力から re-state でき、residual uncertainty を併記できる。
- **quantitative（定量・「+N 分の余白」等）what-if は v0 では NO-GO**。day-level banner は **Option D 表示パス**で `slackMin`/`shortfallMin` が **null**（raw 数値なし）。定量化には raw feasibility 露出 + 候補適用の re-simulation が必要で、(a) 数値が無い (b) re-simulation は予定変更モデリングに近づく → HARD GATE「効果推定の根拠が弱い」「予定変更指示に見える」に抵触。
- **推奨**: v0 は **定性 what-if のみ・hypothesis トーン・「改善します」断定なし**。reduce_density は弱める。confirm_uncertain/use_recovery_window は「改善」と別枠で扱う。定量は raw feasibility を banner に通す別 slice 後に検討。

## 1. CEO 10 質問への回答
| # | 質問 | 回答 |
|---|---|---|
| 1 | 候補ごとに効果推定の根拠があるか | **定性のみ ある**（各候補は targetStepIndex + 診断シグナル=convergence/insufficient/not_applicable/recovery/density を持つ）。**定量は不可**（display パスに raw slack/shortfall null）。 |
| 2 | leave_earlier は buffer/shortfall にどう効くか | insufficient な移動余白を緩める方向。定性「ここの余白に余裕が出そう」。定量「+N 分」は**shortfall 値が無いため言えない**。 |
| 3 | protect_buffer は何を守るか | convergence(重なり)点の **buffer を縮めない**予防候補。「重なりが起きにくくなりそう」。新規追加でなく**維持**。 |
| 4 | confirm_uncertain は他候補と分けるべきか | **はい**。これは改善でなく **不確定の解消**（not_applicable→既知）。what-if は「確認すると見通しがはっきりしそう」（clarity）で、effect でなく **uncertainty 区分**として別扱い。 |
| 5 | use_recovery_window の扱い | **行動変更でなく既存回復窓の活用**。「ここはすでに余裕があるので活かせそう」。day 構造を変えず utilization 区分。 |
| 6 | reduce_density は v0 で弱めるべきか | **はい**。最も予定変更に見えやすい（軽くする=event 除去/移動の含意）。v0 は **what-if を出さない or 最も弱い表現**（「全体に余白を作る余地がありそう」程度・具体的 event に触れない）。 |
| 7 | copy が命令/警告/診断にならないか | hypothesis トーン（「〜が軽くなりそう」「〜はまだ未確定」）。**「改善します」断定禁止**・命令(すべき)・警告(危険)・診断なし・生スコアなし。 |
| 8 | UI: 候補の下に小さく / 別「もしやるなら？」disclosure | **案A: 各候補の下に小さな 1 行**（what-if をその候補に直結）を推奨。案B(別「もしやるなら？」disclosure)は候補と what-if が分離して関連が見えにくい。ただし情報量増を見て、v0 は **2nd-level の per-candidate `<details>`「もしやるなら？」**(default 閉)で出すのも可。CEO 判断。 |
| 9 | evidence trace の保持 | what-if descriptor が独自 trace を持つ: `addresses`(効く診断シグナル) / `residualUncertain`(残る未確定) / `category`(effect / clarity / utilization)。raw 数値は持たない。 |
| 10 | pure layer で閉じられるか | **はい（定性のみ）**。`previewRepairEffect(candidate, rehearsal) → RepairEffectPreview` の pure 関数。re-simulation せず rehearsal 出力から定性導出。定量(re-simulation)は pure だが raw feasibility 入力が要る別物。 |

## 2. root cause（定量が出せない理由）
- banner の rehearsal は `buildRehearsalInputFromDisplay`（Option D）= `slackMin`/`shortfallMin` 常に null（display 層が raw を破棄）。→ 「leave_earlier で +N 分」のような定量効果は**入力が存在しない**。
- 定量化するには WPM-2a の raw `DayFeasibilityResult` を candidate/preview レイヤーに通す（marker の recoverySteps と同様の raw 経路）+ 候補適用後の再 feasibility 計算（re-simulation）が必要。後者は「出発を早めたら」を**モデル化**する＝予定変更ロジックに接近。

## 3. 設計案（v0・定性・pure）
- `RepairEffectPreview = { category: "effect" | "clarity" | "utilization"; addresses: string[]; residualUncertain: string[]; preview: string }`
  - effect: leave_earlier(余白)・protect_buffer(重なり)・reduce_density(密度)
  - clarity: confirm_uncertain（不確定の解消）
  - utilization: use_recovery_window（既存余裕の活用）
- `previewRepairEffect(candidate, rehearsal)`（pure・read-only・raw 数値なし）:
  - leave_earlier → preview「ここの移動の余白に余裕が出そうです」/ residualUncertain（移動時間が未確定なら併記）
  - protect_buffer → 「この前後の重なりが起きにくくなりそうです」
  - confirm_uncertain → 「確認すると、ここの見通しがはっきりしそうです」（clarity・改善でない）
  - use_recovery_window → 「ここはすでに余裕があるので活かせそうです」（utilization）
  - reduce_density → v0 は出さない or 「全体に少し余白を作る余地がありそうです」（最弱・具体 event に触れない）
- copy 制約: 既存と同（hypothesis・禁止語/生スコア/命令/断定/警告なし）。

## 4. UI（実装する場合・別 GO）
- 案A: 「どうするとよさそう？」disclosure 内の各候補行の下に、小さな what-if 1 行（slate・更に淡色）。
- or 各候補に 2nd-level `<details>`「もしやるなら？」（default 閉）。
- read-only・実行 UI なし（候補と同原則）。情報量が増えすぎるなら effect カテゴリのみ表示し clarity/utilization は出さない選択も。

## 5. 制約 / HARD GATE 照合
- repair 実行 / apply ボタン / 保存 / 予定変更 / 自動リスケ / DB / Google / UI 実装 **なし**（本 doc は設計のみ）。
- ✅ 定性 what-if は根拠あり（診断シグナル）。**定量は根拠が弱い（raw 数値 null）→ v0 で出さない**。
- ✅ 候補が予定変更指示に見えない（hypothesis・実行 UI なし・「改善します」断定なし）。
- ✅ UI 配線は実装時のみ（本 doc は設計）。raw feasibility / rehearsal 出力は**定性には足りるが定量には不足**（→定量は別 slice）。

## 6. GO / NO GO 判断点（実装 GO 前・CEO）
1. v0 = **定性 what-if のみ**（定量は raw feasibility 露出後の別 slice）で良いか。
2. category 3 分（effect / clarity / utilization）で confirm_uncertain・use_recovery_window を改善と分けて良いか。
3. reduce_density の what-if は **出さない or 最弱**のどちらか。
4. UI = 案A（候補下に小行）か 2nd-level「もしやるなら？」disclosure か（or 実装自体を保留）。
5. pure `previewRepairEffect` を新設で良いか。
- ★ もし「定性では薄い・定量が要る」と判断するなら、先に **raw feasibility を banner/candidate に通す slice**（WPM-2a の raw 経路を repair に拡張）を挟むのが筋。実装は CEO 判断後。
