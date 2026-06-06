# Second Self Map Wave 2 — Day Rehearsal mini design（1日を先に試す forward simulation）

> 2026-06-06 / **設計のみ（step 1-3）・実装は別 GO（step 4: pure simulation layer）** / 前提: belief stack（L1/L4/L3）main live（`846c3a2e`）。
> CEO 方針: **最適化でなく「今日のあなたの1日を先に試す」simulation**。観測 > 推論・仮説トーン・fake fatigue 禁止。

---

## 0. 目的と哲学（なぜ Day Rehearsal が次か）
belief stack で **学ぶ(L1) / 一般化(L4) / 適応(L3)** が揃った。次は、それらで **1日全体を先に走らせる**。
- 「この区間は電車っぽい」→ **「今日のあなたの1日は、このままだとどこで詰まり・疲れ・余白が要り・どう壊れにくいか」**。
- Aneurasync 哲学「**未来の自分が先に試す**」の直接実装＝第二の自己が今日を先に rehearsal して教える。
- **最適化でない**（TSP 順序最適化は plan で rejected）。**並べ替えない・指示しない**。forward に走らせて **詰まり/疲れ/余白/壊れ方を観測的に surface** する。
- マップ・予定表から抜ける核（master design Wave 2 / 課金核「毎日開く理由」）。

## 1. 既存 building blocks（再利用・Explore 確認済）
| 層 | 既存 | 用途 |
|---|---|---|
| **1日構造** | `buildDayGraph(anchors[], date, opts) → DayGraph`（`lib/plan/dayGraph/`・StartNode/EventNode/GapNode/EndNode + transitions・snapshotId で決定論キャッシュ） | rehearsal の骨格（順序済の node 列） |
| **移動** | `TransportSegment`（`lib/alter-morning/transport/types.ts`・mode + estimatedDurationMin + durationSource/confidence） | 移動時間・手段 |
| **余白(buffer)** | `computeDayFeasibility(graph, overlay) → DayFeasibilityResult`（`lib/plan/feasibility/`・per-transition slack=available−duration → sufficient/insufficient・**評価語禁止・PII-free**） | **buffer 計算は既存** |
| **mode 予測** | `loadL3bPooledBeliefMultiLevel(query) → ModeBelief` + `buildMobilityHypothesis(belief, ctx) → MobilityHypothesis`（belief stack） | leg ごとの手段・所要 |
| **日の重さ** | `inferDayMood(input) → "heavy"\|"light"\|"recovery"`（`dayGraph/dayMood.ts`・**内部のみ UI 開示禁止**） | base energy の手掛かり |
| **感情/energy** | `useInnerWeather() → { weatherType, energyLevel? }`（`stargazer/inner-weather/`） | base energy の手掛かり |
| **天候** | JMA office code / coords（`lib/shared/location.ts`） | 移動負荷の文脈（mode 変更しない＝contextNote のみ） |

**未実装（Day Rehearsal で新規）**: energy curve / fatigue / strain / recovery buffer / **forward simulation engine** / state evolution（hour-by-hour）/ 1日成立判定の統合。

## 2. 既存設計との整合（Reality Control OS / S5）
- **Reality Control OS**（`docs/aneurasync-reality-control-os-phase0-design.md`・設計済/未実装）= Daily Plan Engine(Build/Complete/**Repair**/Optimize) + Live Plan Controller。**介入(直す)層**。
- **S5「1日成立チェック」**（`plan-map-second-self-strategy.md`・Wave B）= 確定 anchor 尊重・移動込みで間に合うか・**自動並べ替えしない**。
- **Day Rehearsal の立ち位置 = 読み取り専用の「診断/simulation」層**。「どこで壊れるか」を計算するが直さない。
  - Day Rehearsal（診断: どこで詰まる/疲れる）→ Daily Plan Engine の Repair/Optimize（介入: どう直す）が**後で消費**できる土台。
  - Day Rehearsal は **S5 を内包し state(疲労/回復)次元を足したもの**。S5 = 時間成立のみ、Day Rehearsal = 時間 + 状態。

## 3. アーキテクチャ（pure simulation layer）
**1 つの pure 関数**（決定論・READ のみ・Date 不使用＝full-day forward simulation）:
```
rehearseDay(dayGraph, transportSegments, modeBeliefs, stateBase, config) → DayRehearsal
```
- 入力はすべて既存（DayGraph/Transport/belief/DayMood・InnerWeather）。書き込みなし。
- DayGraph は順序済 → node 列を **前から走らせ**、各 transition/gap で friction/buffer/strain/recovery を計算し、fatigue を前方積分。
- 出力 `DayRehearsal`:
```
{
  viability: "holds" | "tight" | "breaks",          // 1日成立
  segments: [{ transitionKey, friction, bufferMin, bufferStatus, fatigueAfter, recovery }],
  fatigueCurve: number[],                            // node ごとの累積負荷（相対・内部量）
  recoveryWindows: [{ gapKey, potential }],          // 一息つける窓
  breakPoints: [{ at, kind: "buffer"|"fatigue"|"both", why }],  // 詰まり/疲れの起点
}
```
- **snapshotId 連動でキャッシュ**（DayGraph 同様）。

## 4. 既存 belief stack の使い方（step 2）
| 何を | どう使う |
|---|---|
| **DayGraph** | rehearsal の骨格。node 順に forward 走査。GapNode = recovery 候補窓。EventNode = 負荷源。 |
| **TransportSegment** | 各 transition の move 時間・mode → **friction** と **strain** の主入力。duration が null(unknown) は中立扱い（捏造しない）。 |
| **computeDayFeasibility** | per-transition slack → **buffer をそのまま採用**（再計算しない）。insufficient = friction↑・break 候補。 |
| **ModeBelief / MobilityHypothesis** | leg の todayLikelyMode → strain 係数（徒歩 long/乗換多 など mode 別負荷）。**belief は手段を決めるが疲労を断定しない**（仮説）。 |
| **DayMood + InnerWeather.energyLevel** | **base energy E0**（heavy→余裕小 / recovery→回復要 / light→標準・energyLevel で微調整）。**内部量**（生数字を UI に出さない）。 |
| **天候(JMA)** | 移動負荷の文脈（雨→徒歩 strain わずか↑）。**mode は変えない**（contextNote 規約踏襲）。 |

## 5. 6 計算の設計（step 3）
| # | 計算 | 既存/新規 | 方法 |
|---|---|---|---|
| 1 | **1日成立 (viability)** | 統合(新) | 時間: feasibility 全 transition sufficient か。状態: fatigueCurve が E0 budget 内に収まるか。両立=holds / 時間 or 状態が際どい=tight / どちらか破綻=breaks-at-X |
| 2 | **friction** | 新(既存入力) | per-transition = move 時間(Transport) + mode 負荷(belief) + slack shortfall(feasibility insufficient で加算)。0..1 相対 |
| 3 | **buffer** | **既存** | `computeDayFeasibility` の slackMin/status をそのまま。低 buffer=tight |
| 4 | **fatigue** | 新(core) | 前方積分（§6）。strain を累積・base energy で初期化 |
| 5 | **recovery** | 新 | GapNode（move を超える余白 × 低負荷）→ fatigue を戻す窓。長さ・密度から potential |
| 6 | **risk** | 新 | break point = 低 buffer ∧ 高 fatigue ∧ 高 friction の合流点。where + why を surface |

## 6. state evolution model（新規 core・最小・正直）
**前方積分（決定論・線形・最小）**:
```
E0   = base(DayMood) [± InnerWeather.energyLevel]          // 初期 energy budget（内部量）
F[0] = 0
F[i+1] = clamp( F[i] + strain(segment_i) − recovery(gap_i), 0, ∞ )
strain(seg)   = w_move·moveMin + w_mode·modeDemand + w_density·backToBack + w_evening·lateness   (≥0)
recovery(gap) = w_rec·max(0, gapMin − moveMin) · lowDemand                                       (≥0)
state-break    = F[i] > E0 budget の最初の i
```
- **係数 w_* は固定初期値**（calibration backlog・実データ後に較正）。**捏造でなく相対指標**。
- **正直さ**: F は「測った疲労」でなく **相対的な負荷蓄積の仮説**。**生数字を出さない**（DayMood 内部のみ・feasibility 評価語禁止に倣う）。surface は質的（「午後に負荷が溜まりやすい」「ここで一息つける」）。
- duration unknown(null) は strain に算入しない（捏造禁止）。

## 7. pure 境界 / 段階
| phase | 内容 | 純度 | GO |
|---|---|---|---|
| **mini design (step1-3)** | 本書 | — | ✅ 本ターン |
| **pure simulation (step4)** | `rehearseDay` + DayRehearsal 型 + state evolution + unit test | pure・READ のみ・未配線 | **次 GO** |
| smoke | 既存 DayGraph/feasibility と統合 smoke | test | 次 GO |
| UI / production 配線 | rehearsal を画面に（仮説トーン・生数字なし） | wiring | 別 GO |
| 較正 | w_* / E0 / threshold（実データ後） | — | calibration backlog |

## 8. リスク / 哲学的制約
| 論点 | 方針 |
|---|---|
| fatigue 捏造（fake 数字） | 相対指標・仮説トーン・生数字非表示・unknown は算入しない |
| 評価語/不安煽り | feasibility 規約踏襲（「危険」「ギリギリ」禁止）。「ここは余白が薄い」程度の観測トーン |
| 最適化に滑る | 並べ替え・指示しない。forward 走査して観測を surface するだけ |
| Reality Control OS と二重 | Day Rehearsal=診断(読み取り)・Engine=介入。診断を Engine が後で消費 |
| 係数の勘調整 | 固定初期値で運用 → calibration backlog（実データ後） |
| DayMood/energy の UI 露出 | 内部量。質的 surface のみ（生 score 非表示） |

## 9. CEO 判断点（step 4 実装 GO 前）
1. **MVP スコープ**: viability + buffer(既存) + friction + 簡易 fatigue curve + breakPoints。recovery/risk は同 bundle で良いか（推奨: 6 計算を 1 bundle で pure 実装・係数固定）。
2. **state evolution の最小性**: 線形前方積分（§6）で開始し較正は後、で良いか（推奨: はい）。
3. **入力境界**: DayGraph + feasibility + Transport を必須入力、belief/DayMood/InnerWeather は optional（無くても動く degrade）で良いか（推奨: はい・段階導入）。
4. **Reality Control OS 整合**: Day Rehearsal を**読み取り専用診断層**として独立実装し、Engine 消費は後段、で良いか（推奨: はい）。

## 10. 参照
- 既存: `lib/plan/dayGraph/`（DayGraph/DayMood）/ `lib/plan/feasibility/`（slack）/ `lib/alter-morning/transport/`（TransportSegment）/ `lib/plan/mobility/`（belief stack）/ `stargazer/inner-weather/`
- 設計: `docs/aneurasync-reality-control-os-phase0-design.md` / `docs/plan-map-second-self-strategy.md`（S5）/ `docs/second-self-map-master-design.md`（Wave 2）
- 較正: `docs/second-self-map-calibration-backlog.md`
