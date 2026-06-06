# Day Rehearsal — What-if Preview v0 closeout（pure layer・read-only・定性・未配線）

> 2026-06-07 / **pure layer 実装・branch commit 完了。UI 配線前で停止**（CEO/GPT GO） / 前提: Repair 候補 +「どうするとよさそう？」UI が main live（`98332f09`）。

---

## 0. 状態
- code branch `claude/dr-repair-preview`（HEAD `2122b486`）。**main 着地・UI 配線は次の判断**（CEO「UI 配線前で停止・main 着地は次の判断に回す」）。
- 予定変更 / repair 実行 / optimize / auto-reschedule / 保存 / DB / Google / MapTab / UI 配線 / raw feasibility 改修 / re-simulation **一切なし**。

## 1. 実装（定性・pure・read-only）
- `lib/plan/dayRehearsal/dayRepairPreview.ts`:
  - `previewRepairEffect(candidate) → RepairEffectPreview` / `previewRepairEffects(candidates) → RepairEffectPreview[]`
  - `RepairEffectPreview = { kind, category, headline, body, confidence, uncertainty, evidence, appliesTo }`
- category 3 系統:
  | kind | category | confidence | body |
  |---|---|---|---|
  | leave_earlier | effect | medium | 「この前後の余白を少し守りやすくなるかもしれません。」 |
  | protect_buffer | effect | medium | 「この前後の余白を残せると、予定が重なりにくそうです。」 |
  | confirm_uncertain | **clarity** | high | 「未確定の部分を確認できると、見通しが立てやすくなりそうです。」 |
  | use_recovery_window | **utilization** | high | 「ここを一息つく時間として使えると、次の予定に入りやすそうです。」 |
  | reduce_density | effect（弱） | **low** | 「立て込む区間を少し軽くできると、余白を守りやすいかもしれません。」 |
- confidence は **level のみ（数値化しない）**: effect=仮説的→medium・reduce_density=low（v0 弱め）・clarity/utilization=観測由来→high。
- uncertainty: 定量を出さないため「度合い未確定」を effect に併記・confirm_uncertain は「確認するまで未確定」・reduce_density は「どの予定をどうするかは決めつけません」。
- evidence は candidate 由来を保持・appliesTo=targetStepIndex（**UI には未出力**・保持のみ）。

## 2. 設計判断（CEO 回答の反映）
- **定性のみ**（定量「何分改善」は出さない）。raw feasibility（Option D で null）/ re-simulation が要るものは別 slice。
- **confirm_uncertain=clarity（改善でなく不確定の解消）・use_recovery_window=utilization（行動変更でなく既存余裕の活用）** を effect と別カテゴリに。
- **reduce_density は弱く**（low・予定削除/変更を促す文言禁止・「決めつけません」）。
- 「改善します」「解決します」断定禁止。★rehearsal param は v0 定性では不要のため **candidate-only**（CEO「または同等の関数」で許容・定量 re-simulation 時に rehearsal/raw feasibility を足す）。

## 3. production 挙動変更の有無
- **なし**。新 pure ファイル・consumer=test のみ・UI 未配線。

## 4. 検証
- unit **11**（全 kind / category 3 分 / confidence level / clarity・utilization 区別 / reduce_density 弱・予定変更語なし / uncertainty / 禁止語・断定・生数値なし / deterministic / map / 空）。
- dayRehearsal dir **79** + plan suite **5009 PASS**（exit 0）。
- **tsc footprint 0**（baseline 55 不変・dayRepairPreview 起因 0）・additive（既存ファイル不接触）。

## 5. HARD GATE 照合
- preview が予定変更指示に見えない（hypothesis・実行 UI なし・断定なし・reduce_density で具体変更を促さない）。
- 定量改善を出していない（定性のみ・生数値なし）。raw feasibility / re-simulation を使っていない。
- rehearsal/candidate shape は想定どおり（candidate={kind,suggestion,targetStepIndex,evidence}）。
- confidence は level（数値化なし）で成立。UI 配線なし。

## 6. 次（UI 配線前で停止・CEO 判断）
- main 着地（pure・production inert）。
- UI 配線（「どうするとよさそう？」候補下に preview・or 2nd-level「もしやるなら？」disclosure・read-only）は別 slice（UI placement は repair-v0-whatif-mini-design §4 参照）。
- 定量 what-if（raw feasibility 露出 + re-simulation）は更に別 slice。
- いずれも **CEO GO 待ち**。
