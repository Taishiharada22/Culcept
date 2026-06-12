# R0: Reality Core Logic Inventory（read-only 監査・実装なし）

- 日付: 2026-06-13 / 監査: 契約管理セッション（CEO 指示「UI 偏重でないかの棚卸し」）
- 手法: Explore 精査（lib/plan/reality 全域）+ 本セッション実装知識（W3a-W6 当事者）による裁定。**docs の計画ではなくコードの実在**を file:path で判定
- 前提: pre-production dogfood は開始可能（CEO 再 smoke PASS）。production gate 未通過

## 0. 結論（1 段落）

**CEO の懸念は当たっている**。現在「実 UI に到達して動いている」のは day-state レーン（DayStateRecord→MomentState→VM→ALTER タブ + localStorage + Night Check 採点）と DayGraph（時間構造）で、これは Reality Graph 6 ノードのうち **UserState / MomentState / PredictionLedger の 3 つ + EventRealityNode の「時間属性だけ」**に相当する。一方、**本命の reality 属性（place certainty / leave-by / delay impact / per-event energy cost / permission）・collapse risk・3 案変換・ETA/mobility・correction memory の翌日消費は実装が存在しないか、lib/plan/reality に型 + pure fixture として孤立しており、実 UI から 1 行も import されていない**。比率感: 実 UI 到達済みロジックの大半は「状態の見立てと表示」であり、「現実を動かす判断（介入・代替案・出発逆算）」は未着手。

## 1. ロジック接続棚卸し

凡例: 経路 = pure core（lib 純関数）/ adapter / UI・derived / route。到達 = 実 UI（ALTER タブ等）から import 連鎖で実行されるか。

| # | 項目 | 実装 | 実UI到達 | 経路 | mock_ref | read-only | localStorage | 実機smoke | 止まっている場所 / 根拠 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | DayGraph | ✅ | ✅（Calendar/Flow/Alter） | pure core | — | ✅ | ✗（毎回計算） | ✅ | `lib/plan/dayGraph/buildDayGraph.ts:131` → PlanClient useMemo → 3 タブ |
| 2 | **EventRealityNode** | ⚠️ 代替のみ | △ | pure core | — | ✅ | ✗ | △ | 契約 §2.5「DayGraph EventNode が代替」。時間属性（rigidity/latencyTolerance/timeBucket）はあるが **reality 属性（place certainty/leave-by/delay impact/energy cost/permission）が無い**。類似型 `lib/plan/reality/post-event-recompute.ts:27` は test fixture 孤立 |
| 3 | **Intent / Request Frame** | ❌ | ❌ | — | — | — | — | — | v1 予約（契約 §2.5）。会話側 Intent Translation（凍結済み）は plan 不接続 |
| 4 | **Place Candidate Reality** | ❌ | ❌ | — | — | — | — | — | A4 予約。`lib/plan/reality/best-action.ts:34-56` は候補**選別**の型 + pure fixture（生成でない・route import 0） |
| 5 | **Reality Diff** | ❌ | ❌ | — | — | — | — | — | A3 予約。`lib/plan/reality/change-set.ts` 型のみ・消費 0 |
| 6 | gapNodes | ✅ | ✅ | pure core | — | ✅ | ✗ | ✅ | `lib/plan/dayGraph/gapNodes.ts` → eveningSlack/largestFreeBlock/流れレール |
| 7 | movementTransitions | ⚠️ | ✅ | pure core | — | ✅ | ✗ | ✅ | `dayGraphTypes.ts:227` **timingStatus 常に "unresolved"**（3-K）。到達は hasUnresolvedTravel→travelChainMin null（捏造禁止表示）まで。**resolved/ETA は不在** |
| 8 | DayStateRecord（=UserState） | ✅ | ✅ | pure core | — | ✅ | ✅ `plan_day_state_v0` | ✅ | `lib/plan/dayState/buildDayStateRecord.ts:221` |
| 9 | MomentState | ✅ | ✅ | pure core | — | ✅ | ✗（derive fast 設計） | ✅（Night Check 窓 fix 後） | `deriveMomentState.ts:52`。**departureDeadline は型のみ実質 null**（resolved 移動が無いため） |
| 10 | AlterBatteryViewModel | ✅ | ✅ | pure core | — | ✅ | ✗ | ✅ | `buildAlterBatteryViewModel.ts:251` |
| 11 | screenViewModel | ✅ | ✅ | UI・derived | ⚠️ 一部 | ✅ | ✗ | ✅ | `components/alter/screenViewModel.ts`。mock_reference: 睡眠 5.8h・体質スタミナ・消耗予測係数・推移カーブ動態（参考値バッジ付き・D-2 再裁定対象） |
| 12 | applyUserCorrection | ✅ | ✅（スライダー/3択） | pure core | — | — | ✅（record 内） | ✅ | `buildDayStateRecord.ts:266`。**当日反映のみ — 翌日見立てへの消費なし（B1 gate）** |
| 13 | Night Check | ✅ | ✅ | pure core | — | — | ✅ `plan_night_check_v0` | ✅（fix 後） | `gradeNightCheck.ts`。**nextDayPriorAdjustments の読み手ゼロ**（grep 確認・B1/Stage3） |
| 14 | Morning Reveal | ✅ | ✅ | pure + container | — | — | ✅ `plan_morning_reveal_v0` | △ fixture 実証・実機翌朝は未 | `buildAlterBatteryViewModel.ts:201` + AlterTab 既読管理 |
| 15 | dailyModeHint | ✅ | ✅ | route + pure | — | ✅ bounded read×2 | ✗ | △ route smoke のみ（実値の実機確認は弱い） | `/api/plan/day-state-hints` → `resolveDailyMode`（alterHomeAdapter:8324・export 化済） |
| 16 | weather | ✅ | ✅ | client 直 | — | ✅ | 既存 weather cache | △ | weatherService 流用 → outingTolerance 信号・weather_rain evidence。**day-state のみ消費 — 移動/feasibility 未統合** |
| 17 | walkLevel | ✅ | ✅ | route（morning history） | — | ✅ bounded read×1 | ✗ | △ | `dayStateHints.ts extractWalkLevel`。morning plan 利用日のみ実値 |
| 18 | interpersonalLoadHint | ⚠️ 受け口のみ | △ | pure input | — | — | — | ✗ | `dayStateTypes.ts:224`。**供給保留**（withWhom 自由文 — Stage 1.5 構造抽出待ち）= 実質常に undefined |
| 19 | estimatesFrozen | ✅ | ✅ | pure + storage | — | — | ✅（record 内・W4 正本化） | ✅ | 採点基準として機能。headline 層別も実装済み |
| 20 | localStorage | ✅ | ✅ | storage 層 | — | — | 3 キー + `__ts` | ✅（day_state 確認・night_check は fix 後保存可能） | `lib/plan/alterTab/dayStateStorage.ts` |
| 21 | input slit | ✅ 入口のみ | ✅ | route POST | — | — | ✗ | ✅ ack | source:"plan" fire-and-forget。**構造抽出なし（センサー未完・Stage 1.5）** |
| 22 | ResourceTrendChart | ✅ | ✅ | UI | ⚠️ カーブ動態 | ✅ | ✗ | ✅ | レール = 実セグメント / カーブ形状 = mock_reference |
| 23 | manualLevels（カーソル水位） | ✅ | ✅ | pure + storage | — | — | ✅（record 内） | ✅（CEO 再 smoke） | smoke-fix-2。本人入力の連続値レイヤー |
| 24 | 革新系（受容性 gate / authority / PRM 学習 / second-self） | ⚠️ 型+pure | ❌ | reality kernel 孤立 | — | ✅ | ✗ | ✗ | 下記 §3 |

## 2. UI 側と中核ロジック側の分離

### UI / display 側（実 UI 到達・健全）
| 部品 | 状態 |
|---|---|
| HumanBatteryFigure | ✅ 実装・smoke PASS（水位 0-100% 化・heart 液面化済み） |
| ResourceTrendChart | ✅（レール実データ / カーブ動態 mock_reference） |
| screenViewModel | ✅ derived 層（mock 2 点 + 係数系は参考値バッジ） |
| ForecastCards / StateBackgroundPanel | ✅（睡眠 user_reported・unknown「—」規律） |
| cockpit input panel（補正スライダー/睡眠/Night Check/入力スリット） | ✅ smoke PASS |
| RefBadge（参考値）/ MitateBadge（見立て/本人） | ✅ 出自 5 分類準拠 |
| visualFill / meterPct | ✅ 同源（VM→derived 1:1） |

### 中核ロジック側（ここに偏りがある）
| ロジック | 状態 | 根拠 |
|---|---|---|
| DayGraph 全体 → RealityState | ⚠️ **時間構造まで**。reality 属性なし | §1-1,2 |
| EventState（予定単位の現実状態） | ❌ 本命未実装 | §3-A |
| MomentState | ✅ 実装・到達（ただし departure 系は実質 null） | §1-9 |
| correction memory | ⚠️ **記録まで**。翌日消費ゼロ | §1-12,13 |
| NightCheck grading | ✅ 実装・到達・保存 | §1-13 |
| MorningReveal | ✅ 実装・到達 | §1-14 |
| feasibility | ⚠️ day-level proxy（時間 slack 由来）のみ。本物の成立予測でない | 契約 §2 明記どおり |
| collapse risk | ❌ 不在（型も無い） | grep 不在確認 |
| mobility / ETA / leave-by | ❌ 不在（transitions 常時 unresolved・ETA 源なし・leave-by 逆算なし） | `movementTransitions.ts` / `movementSegmentOverlay.ts` は表示 overlay |
| fatigue / recovery | ✅ **実装済み・到達**（energyLevel/recoveryNeed/carryOver/recoveryQuality — Explore 初報の「不在」は誤りと裁定） | `buildDayStateRecord.ts` |
| permission（介入権限） | ⚠️ 型のみ（`lib/plan/reality/authority.ts` PlanItemGovernance / `receptivity-gate.ts` DeliveryMode evaluateReceptivityGate）— **route/UI import 0** | Explore 確認 |
| 3 案提案（守る/楽にする/攻める） | ❌ 不在。computeProposals は空き日 pattern_repeat のみ（1 案・既存予定の代替生成なし）。kernel best-action は**選別**の pure fixture | `lib/plan/proposal/computeProposals.ts` |
| perspectiveEngine / ForceBalance / ActionShape | ✅ 実装だが **home 会話 route 限定** — plan 文脈から不接続 | `app/api/stargazer/alter/route.ts` のみ |
| Reality pipeline（seeds/PRM/M2/M3/review/second-self） | ⚠️ A1 レーンに型 + flag 既定 OFF + dev-preview 到達のみ。**PRM 学習ループは migration 未実行で蓄積不能** | `lib/plan/reality/integration/*` |

## 3. まだ入っていない本命ロジック（gap map）

**A. Reality Graph の未完ノード（契約 §2.4 の 6 ノード照合）**
- UserState ✅ / MomentState ✅ / PredictionLedger（NightCheck）✅
- EventRealityNode ⚠️: DayGraph EventNode に **fixedness（既存 rigidity/latencyTolerance の整理統合）/ place certainty / movement required / leave-by / delay impact / energy cost / interpersonal load / permission level** の reality 属性束が無い → **予定単位の現実が「時刻とラベル」のまま**
- RequestRealityFrame ❌（v1）/ PlaceCandidateReality ❌（A4）/ RealityDiff ❌（A3）

**B. 日全体エンジン**
- feasibility は時間 slack proxy のみ。**collapse risk（今日が崩れる確率）/ carryover risk（明日へ漏れる量）の予測エンジン不在**。材料（facts/estimates/carryOverOut/drift 選択）は揃い始めている

**C. 変換エンジン**
- **予定 → 3 案（守る/楽にする/攻める）変換が不在**。change-set 型（kernel）はあるが生成器が無い。※N-3 制約（推奨/最適 等の禁止語）と両立する「並置提示」設計が必要

**D. 統合判断**
- mobility/ETA + weather + fatigue + correction memory を 1 つの判断に合成する点が無い。weather→day-state は W3b で接続済みだが、**移動・leave-by には誰も繋いでいない**（そもそも ETA 源が無い）
- correction memory: 記録（corrections/manualLevels/nextDayPriorAdjustments）は W4 で完備。**消費（翌日 prior 反映）は B1 gate（観測 ≥14 日）design 待ち** — ここは「未実装」でなく「gate 待ち」と区別する

**E. 革新レイヤー（人間超え）**
- 受容性 gate（DeliveryMode）/ authority（介入 Lv）/ PRM 学習 / second-self は型・pure・dev-preview まで。**「未来の自分が先に試す」= 予測 → 現実検証 → モデル更新の閉ループは、Night Check 採点（検証）まで来て、更新（学習反映）で止まっている**

## 4. R1 以降の実装候補（提案・GO 待ち）

優先原理: ①全部の材料になるものから ②新規 read/外部 API gate に当たらない pure 導出を先に ③答え合わせループの「反映」は B1 観測日数と並走。

| R | 内容 | なぜ先か | gate |
|---|---|---|---|
| **R1（推奨）** | **EventRealityNode v0**: DayGraph EventNode → 予定単位 reality 属性束の pure 導出 adapter（fixedness 統合・movementRequired・**leave-by v0 = 保守的徒歩/固定リード仮定**・delayImpact（後続 strict 予定への波及分）・energyCost v0（duration×verb×対人ヒント）・permissionLevel（rigidity×origin 由来）。place certainty は属性枠だけ確保し null 正直） | §3-A が C/D 全ての材料。**新規 read ゼロ・pure のみ**で進められ、MomentState の departureDeadline が初めて非 null になる | 不要（pure 追補 + ALTER タブ内表示は flag 内） |
| **R2** | **day collapse / carryover risk v0**: R1 属性 + facts/estimates/carryOver から日全体リスクの pure 合成（表示は非断定語彙・N-3 準拠） | §3-B。R1 の直接合成。dayFeasibility proxy を本物に近づける | 不要（pure） |
| **R3** | **3 案変換 v0（守る/楽にする/攻める）**: 予定×R1 属性×R2 リスク → change-set 型（既存 kernel 型再利用）3 並置生成。**提示のみ・apply なし**（実世界 apply は絶対停止条件） | §3-C。Alter が「見立てる」から「選択肢を差し出す」へ — 製品の中核体験 | 文言は N-3 監査必須。apply は別 gate |
| **R4** | **実 ETA / mobility 供給**: 場所解決 + 経路時間（外部 API） | R1 の leave-by v0 を実測化 | **外部 API = CEO 承認（課金/キー）** |
| **B1（並走）** | correction memory 消費設計（nextDayPriorAdjustments → 翌日 prior） | dogfood 観測 ≥14 日が条件（契約 §10）— W6 計測と同時進行で日数を貯める | B1 readiness gate |
| 補助 | input slit 構造抽出（Stage 1.5: 会話→DayStateRecord 信号）/ interpersonalLoadHint の構造化供給 | センサー化の本丸だが LLM 抽出契約の設計が要る | 設計提示→GO |

**推奨順序: R1 → R2 → R3（いずれも pure・read 追加なし・flag 内）→ R4/B1/Stage1.5 は各 gate で。**

## 5. 本監査の制約

- Explore 初報のうち day-state レーンに関する 3 件（fatigue/recovery 不在・weather 未消費・nextDayPriorAdjustments 不在）は当事者知識で**誤りと裁定し本書に反映済み**
- 実装はしていない（read-only + 本 docs のみ）。R1 GO は CEO 判断
