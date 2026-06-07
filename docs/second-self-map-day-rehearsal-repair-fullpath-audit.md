# Day Rehearsal Repair Candidate — full-path audit + mini design（read-only・実装なし）

> 2026-06-07 / **read-only 監査・実装しない** / 前提: Repair v1 + dedup main live（`db70d018`）。現状 rehearsal は CalendarTab → `rehearseDay(buildRehearsalInputFromDisplay(...))` = **Option D（status-only）**。

---

## 0. 結論（先に）
- **★protect_buffer の Option D 不到達は「許容」**でよい（バグでなく dormant・coverage は他 4 kind + outlook で充足・engine/型は full path 用に準備済）。ただし **dormant である事実の明記が条件**（v1 header に記載済）。
- **raw feasibility / full path は「今は解放しない」**を推奨。理由: 解放は rehearsal 出力（outlook / friction / convergence / recovery）を **全面的に変える挙動変更**で、**消費者（定量 what-if）が無い今は churn のみ**。
- **full path は「定量 what-if の前提」**。解放するならその slice で bundle するのが整合的。
- **full path は新規外部呼び出し不要で feasible**（transport は hook 内で既に計算済・discard 中／raw feasibility は CalendarTab に既存）。必要なのは additive surface + adapter + flag + 再検証。
- 本 audit は **read-only**（コード経路追跡のみ・UI/挙動変更なし）。判断は CEO。

## 1. audit：2 経路とデータ可用性
### 1-1. 現状（Option D = `buildRehearsalInputFromDisplay`）
display feasibility（status のみ）から構築。**travelMin=null・mode=unknown・slackMin/shortfallMin=null** で degrade（honest）。結果（v1 audit と同じ）:
- bufferMin **常に null**・friction **一律 moderate**（frictionScore=0.5 固定・`friction_high` 不発火）・recovery **一律 low → recoveryWindows 空**（use_recovery_window は CalendarTab の raw 由来 `recoverySteps` で別途到達）。

### 1-2. full path（`buildRehearsalInput`）に必要な入力と現状の所在
| 入力 | 必要元 | CalendarTab での現状 |
|---|---|---|
| dayGraph | DayGraph | ✅ あり（`dayGraphByDate`） |
| 真の slack/shortfall | `DayFeasibilityResult.feasibilityByTransitionKey` | ✅ **raw 相当が既にある**（`calendarFeasibilityRawByTransitionIndex: Map<number, FeasibilitySlackView>`・recoverySteps に使用）。key を `transition_${i}` に揃える adapter のみ要 |
| 移動 travelMin/mode | `TransportSegment[]` | ⚠ **hook 内で計算済だが discard**。`_useCalendarTabFeasibilityDisplay` は `resolveMovementSegmentOverlay` で `OverlayResult.segmentsByTransitionKey`（resolved=`estimatedDurationMin`/`modeCandidate`/`source`/`confidence`）を作るが、戻り値は display+raw map のみ。→ **additive に surface すれば良い**（新規計算・外部 API 不要・PII sanitize 済） |

→ **full path は既存データで実現可能**。「データが無い」のではなく「surface していない」。

### 1-3. ★protect_buffer 到達条件の証明（なぜ Option D で不到達か）
- protect_buffer 発火 = `convergencePoint(i)` ∧ **非 insufficient**（insufficient は leave_earlier 分岐）。
- convergencePoint = `conv.level==="high"` = **factors≥2**。factors ∈ {buffer_short(=insufficient 必須), strain_high, friction_high}。
- **Option D**: friction 一律 moderate → friction_high 不発火。非 insufficient step で取れる factor は strain_high のみ（1 個）→ conv moderate → convergencePoint でない → **protect_buffer 不到達**。
- **raw のみ（transport なし）でも不到達**: shortfall 由来の friction boost は `insufficient` 時のみ（`transitionFriction`）。非 insufficient step では friction=moderate のまま → friction_high 不発火 → 依然 1 factor。
- **transport あり（full path）で到達**: 実 travelMin が大きいと travelStrain↑ → frictionScore↑ → **非 insufficient step でも friction_high** → strain_high + friction_high の 2 factors → convergencePoint(非 insufficient) → **protect_buffer 到達**。
- ∴ **protect_buffer の解放 = transport を含む full path が必須**（raw feasibility だけでは不十分）。

## 2. CEO 5 問への回答
| # | 問い | 回答 |
|---|---|---|
| 1 | protect_buffer 不到達のままで良いか | **良い（許容）**。バグでなく dormant。他 4 kind + outlook で coverage 充足。engine/型/テスト（R2/R4）は full path 用に準備済。条件 = **dormant の明記**（済）。 |
| 2 | raw feasibility / full path を解放すべきか | **今は否**。解放は rehearsal 出力全面変更（outlook/friction/convergence/recovery）= 挙動 churn。消費者（定量 what-if）が無い今は user 利益ゼロ。**定量 slice で bundle**。 |
| 3 | full path 化で何が増えるか | bufferMin（分）/ friction が実移動で変化（一律 moderate→可変）/ recoveryWindows を engine が算出（別 patch `recoveryStepsFromFeasibilityRaw` を将来統合可）/ **protect_buffer 到達** / convergence・outlook が実移動圧で精緻化。**コスト**= banner/marker/candidate が全面変化 → 再検証 + 再 smoke・hook の transport surface・transport 解決の perf。 |
| 4 | 定量 what-if の前提になるか | **なる**。「N 分早めると余白 +N 分」型は raw slack/shortfall（bufferMin）+ re-simulation が必須 = full path が供給。既存 closeout でも明記済。 |
| 5 | UI/挙動変更なしで audit 可能か | **可能（本書がそれ）**。経路追跡のみで read-only。判断（解放可否）が CEO マター。実装せず mini design で停止。 |

## 3. full-path 化の approach（GO 時のみ・今は実装しない）
段階（挙動変更を孤立させ再検証を可能にする）:
1. **hook additive surface**: `_useCalendarTabFeasibilityDisplay` の戻りに overlay 由来の travel（transitionIndex→{travelMin,mode,travelKnown}）を **additive 追加**（既存 display/raw caller 不変・PII sanitize 済データを再利用）。
2. **adapter**: raw feasibility（key 揃え）+ travel から `RehearsalInput` を作る `buildRehearsalInputFull`（新規 or `buildRehearsalInput` を CalendarTab 用に薄く wrap）。
3. **flag 切替**: rehearsal を Option D → full path に **flag 裏**で切替（default OFF）。canary で banner/marker/candidate の差分を観測。
4. **再検証 + 再 smoke**: outlook/convergence/friction/recovery/candidate（protect_buffer 含む）の挙動を unit + 実機で再確認。recovery patch の二重化解消も検討。
5. **定量 what-if** を full path の上に構築（別 slice）。
- いずれも read-only 原則は維持（予定変更・repair 実行なし）。

## 4. 推奨 + CEO 判断点
**推奨**: 現状維持（Option D）。protect_buffer は dormant のまま明記して許容。full path は **定量 what-if slice で bundle**して解放（単独解放は churn のみ）。

CEO 判断点:
1. protect_buffer を **dormant 許容**（推奨）か / 今 full path で解放するか。
2. full path 解放を **定量 what-if と bundle**（推奨）か / 先行させるか。
3. 先行させる場合、**flag 裏 + canary**（§3）で段階導入して良いか。
4. recovery の二重経路（engine recoveryWindows vs raw `recoveryStepsFromFeasibilityRaw`）を full path 化時に **統合**するか / 現状維持か。
