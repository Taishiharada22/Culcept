# Day Rehearsal — 配線 mini design（どこに / どの粒度 / 仮説トーン copy / PlanClient 接続）

> 2026-06-06 / **設計のみ・実装は別 GO（配線・UI・production は CEO 判断）** / 前提: Day Rehearsal pure simulation layer main 着地（`f1e87f39`・未配線）。
> CEO「pure を固定してから『どこにどう見せるか』を慎重に設計」。設計してから配線可否を判断。

---

## 0. 目的と原則
`rehearseDay → DayRehearsal`（1日を先に試した診断）を**仮説トーンで**ユーザーに見せる。
- **断定しない**: fatigue を事実として言わない・risk を警告として言わない・生数字を出さない。
- **最適化でない**: 予定を動かさない・修正案/auto-reschedule/Repair を出さない（本配線では表示のみ）。
- **読み取り専用**: rehearseDay は pure。配線は呼んで表示するだけ。

## 1. ①どこに出すか（where）
- **第一候補 = Plan view（PlanClient）の day-level サマリ**。Day Rehearsal は**1日全体**の診断ゆえ、1日が見える Plan/timeline が自然（MapTab は per-leg なので不適）。
- 構成案:
  - **day-level outlook バナー**（1 行・最上部 or timeline ヘッダ）= viability の仮説。
  - **timeline 上の控えめマーカー** = convergence point（重なりそう）/ recovery window（一息つけそう）を該当時刻に小さく。
- ★feasibility(slack) 自体も現状 UI 未表示。本配線が feasibility の初表示も兼ねる → 表記規約（評価語禁止）を厳守。

## 2. ②どの粒度で出すか（granularity）
| 粒度 | 内容 | 推奨 |
|---|---|---|
| **day-level** | viability outlook 1 行（ゆとり/少し詰まる/未知） | ✅ まず これだけ |
| **point-level** | convergence point / recovery window をマーカー | ✅ 同時 or 次段（最も価値・低ノイズ） |
| **transition-level** | per-transition の buffer(余白N分)/friction を inline | ⏸ 後段（ノイズ懸念・feasibility 表示規約の検証要） |
- **段階導入**: day-level outlook + point マーカーから。transition inline は実機ノイズを見てから。

## 3. ③copy をどう仮説トーンにするか
**規約**: 全て仮説（〜かも / 〜そう / 〜ようです）。evidence は「なぜ?」で開示（known/unknown/inferred）。**生 score・%・医学用語・警告語なし**。
| 内部 | NG（禁止） | OK（仮説トーン案） |
|---|---|---|
| viability holds | 「今日は成立します」 | 「今日はゆとりがありそう」 |
| viability tight | 「危険」「ギリギリ」 | 「少し詰まりそうな時間帯がありそう」 |
| viability breaks | 「破綻」「リスク高」 | 「このままだと余白が薄い区間が重なりそう」 |
| viability unknown | （断定） | 「移動時間が未確定で、今は見通しづらい区間があります」 |
| strain high | 「疲れます」「疲労 73%」 | 「午後は予定が続きそうです」（構造の観測） |
| convergence | 「遅刻リスク」 | 「ここは移動と予定が重なりやすいかも」 |
| recovery | 「回復します」 | 「ここで一息つけそう」 |
| buffer insufficient | 「間に合いません」 | 「余白 −N 分」（feasibility 規約の量的中立表記） |
- **unknown を隠さない**: travel 不明区間は「未確定」と明示（捏造より誠実）。

## 4. ④PlanClient に接続するか（connection）
- **パイプライン（READ-only）**: anchors → `buildDayGraph` → `computeDayFeasibility`（要 overlay）→ `TransportSegment[]` → `buildRehearsalInput` → `rehearseDay` → `DayRehearsal` → client 表示。
- **接続点**: PlanClient（or server 側 plan compose）が既に DayGraph/timeline を組む箇所に、feasibility + transport + rehearseDay を**追加**し、結果を表示 component へ props で渡す。
- **配線 GO で要確認（データ可用性）**:
  1. PlanClient で `computeDayFeasibility` の overlay（movementSegmentOverlay）が入手可能か。
  2. `TransportSegment[]`（duration/mode）が PlanClient で入手可能か（PR-10 系の canonical segment）。
  3. InnerWeather.energyLevel を渡すか（optional・無くても degrade）。
- **不可侵**: DB/Supabase 追加なし・Google API 追加なし・予定変更なし・push なし。表示のみ。

## 5. 段階（配線 GO 後）
| slice | 内容 | 純度 |
|---|---|---|
| W-1 | データ可用性確認（overlay/transport が PlanClient で取れるか） | 調査 |
| W-2 | server/PlanClient で rehearseDay を呼ぶ配線（表示 component へ props） | wiring |
| W-3 | day-level outlook バナー（仮説トーン copy） | UI |
| W-4 | point マーカー（convergence/recovery） | UI |
| W-5 | 「なぜ?」evidence 開示（known/unknown/inferred） | UI |
| 後段 | transition inline buffer/friction（ノイズ検証後） | UI |

## 6. リスク / 哲学制約
| 論点 | 方針 |
|---|---|
| fatigue 断定 copy | 禁止。構造の観測（「予定が続きそう」）+ 仮説トーンのみ |
| risk 警告 copy | 禁止。convergence は「重なりやすいかも」。Arrival Risk 化しない |
| 生数字露出 | score/%/分の strain は出さない。buffer の「余白N分」のみ（feasibility 規約内） |
| 不安煽り | feasibility 規約踏襲（危険/ギリギリ禁止）・balanced 提示 |
| 予定変更に滑る | 表示のみ。Repair/Optimize/auto-reschedule は本配線で作らない |
| unknown 隠蔽 | 未確定は「未確定」と明示 |

## 7. CEO 判断点（配線 GO 前）
1. **出す場所**: Plan view（PlanClient）の day-level outlook + point マーカー、で良いか。
2. **初期粒度**: day-level + point から（transition inline は後段）、で良いか。
3. **copy トーン**: §3 の仮説トーン規約で良いか（生数字なし・evidence は「なぜ?」開示）。
4. **接続**: PlanClient に READ-only で rehearseDay を呼ぶ（表示のみ・予定変更なし）、で良いか。データ可用性（overlay/transport）は W-1 で確認。

## 8. 参照
- pure: `lib/plan/dayRehearsal/`（rehearseDay / buildRehearsalInput / DayRehearsal）/ closeout: `docs/second-self-map-day-rehearsal-step4-closeout.md`
- 既存: `lib/plan/feasibility/`（表記規約）/ `lib/plan/dayGraph/` / `lib/alter-morning/transport/`
- 設計: `docs/second-self-map-day-rehearsal-mini-design.md` / `docs/aneurasync-reality-control-os-phase0-design.md`
