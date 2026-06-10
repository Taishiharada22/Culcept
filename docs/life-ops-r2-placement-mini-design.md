# Life Ops × 横 R2 — Pure Placement Mini-Design（本流セッション）

> 2026-06-10 / 本流（横 R2 統合）セッション / CEO 指示 §8 の 10 論点を確定する。
> 前提: 縦 import 済（`2cfd551d`・126/126 PASS on main）。seam = `collectLifeOpsCandidates`（縦の単一出口）。
> **scope: pure placement helper まで**。UI/Morning Briefing 本線/Moment Trigger 本線/通知/外部 API/実データ源/DB/production/push/PR/merge は禁止（§9/§11 遵守）。

---

## 0. 責務分離（不変）
- **縦（Life Ops）= 何を提案するか**: `collectLifeOpsCandidates(inputs, nowISO): readonly LifeOpsCandidate[]`。
- **横（R2）= いつ・どこに置くか**: 本 helper が WorldState（空き窓・予定・移動 placeholder・now）から window と lane を確定。
- 横は **`@/lib/lifeops/candidate-collector` の 1 関数のみ consume**（L-3/L-4/deadline 個別経路を import しない）。型は **縦の `candidate-types.ts` が正本**（横で再定義しない）。横→縦の一方向依存。

## 1. 配置に使うフィールド（§8-1）
| フィールド | 用途 |
|---|---|
| `dueReason.kind` + 中身 | 優先度・lane（§2/§3）。deadline=daysUntilDeadline/overdue・event_prep=daysUntilEvent/recommendedLeadDays/cyclePhase・cycle=phase |
| `placeQuery` | null=在宅可（小窓可）/ あり=外出（大窓+移動 buffer 要・§4） |
| `category` → L-1 `group`・`typicalRiskFlags(health_sensitive)` | lane の生活防衛判定（§3）。横は L-1 辞書を **読むだけ** |
| `riskFlags` / `permissionLevelHint` | **配置では使わない**（保持して透過・§5） |
| `menu` | dedup 済みの識別のみ（配置では非使用） |

## 2. dueReason.kind ごとの配置優先度（§8-2）
**urgencyRank 昇順 = 配置順**（窓も早い順に割当）:
1. `deadline`: rank = daysUntilDeadline（**overdue は最優先**=-1000）— 逃すと実害
2. `event_prep`: rank = 100 + daysUntilEvent — イベントに間に合わせる
3. `cycle`: rank = 200 + phase 順（well_beyond < beyond_typical < nearing < その他）— 揺らせる
同 rank は collector の出力順（=source 優先 dedup 済）を保持（stable sort）。

## 3. 守る/楽/攻める lane（§8-3・**既存信号のみで判定・新規辞書を作らない**）
| 条件 | lane | 根拠 |
|---|---|---|
| `deadline` | **protect** | 期限・生活破綻防止 |
| `event_prep` ∧ daysUntilEvent ≤ 2 | **protect** | 直前=落とせない準備 |
| `event_prep` ∧ cyclePhase あり（美容前倒し） | **push** | 外見・未来価値 |
| `event_prep` その他（one-shot 準備・余裕あり） | **easy** | 軽く済む・ついで |
| `cycle` ∧ (group=daily_upkeep ∨ health_sensitive) ∧ phase=well_beyond | **protect** | 生活/健康の破綻防止（食料切れ・通院放置） |
| `cycle` ∧ (group=daily_upkeep ∨ health_sensitive) | **easy** | 補充・通院=負担軽く |
| `cycle` ∧ それ以外（美容系） | **push** | 整える・未来価値 |
health 判定は L-1 の `typicalRiskFlags ∋ health_sensitive`（**既存辞書を signal として読む**・横で病名/categoria リストを作らない）。

## 4. placeQuery あり/なし（§8-4）
- **なし（在宅可）**: 必要窓 = `HOME_TASK_MIN`（30 分）。
- **あり（外出）**: 必要窓 = `OUTING_BASE_MIN`（60 分）+ 往復移動 `2 × (mobility.typicalTravelBufferMin ?? 15)`。MAP/GPS 正本には触れない（R3 placeholder を consume するだけ）。
- **粗い見積りであることを placementReason に明示**（`coarse_duration`）。所要時間の正確化は将来の学習 slice（→ §10 fake で検証可能な範囲に留める）。

## 5. permission / riskFlags（§8-5）
- **配置（いつ・どこ）は権限と独立** → 配置を変えない。CTA/実行 gate（予約・購入・連絡）は L-7 + 横 R5 の責務。
- `PlacedLifeOpsCandidate.candidate` に **embedded のまま全保持**（riskFlags/permissionLevelHint を欠落させない）— 後続 UI/Permission/実行 gate が必ず読める。

## 6. 候補数上限（§8-6）
- `maxPlacements` 既定 **3**（dogfood Q3「過剰に埋めない」と同思想・1 日に生活提案 3 件超は圧迫）。
- 超過分は **window=null + `cap_exceeded`** で返す（捨てない→Morning Briefing が「他にも◯件」を言える）。
- 窓不足も **window=null + `no_window_fits`**（捏造して詰め込まない）。

## 7. 既存 empty-day proposal との衝突（§8-7・**本 slice では compose しない**）
- 本 helper は **raw availableWindows に対して独立配置**（empty-day blocks と同一窓を共有しうる）。
- **将来 compose 方針（design note・未実装）**: lifeops placement が**先に**窓容量を消費 →残量で `EmptyDayInput.availableWindows` を縮約して `generateEmptyDay` へ。lifeops=具体的必要・empty-day=過ごし方の器、の順。実装は別 slice（R2 内部変更を伴うため）。
- 窓の **容量管理**（残分 tracking）は本 helper 内で行い、同一窓への多重配置は残量内のみ。

## 8. R4/Moment Trigger へ渡す前に保持するもの（§8-8）
`PlacedLifeOpsCandidate` がそのまま R4 の素材: `candidate`（dueReason/placeQuery/riskFlags 全部）+ `window`（いつ）+ `planLane` + `placementReason[]`。R4 は window 接近で trigger 評価できる（本 slice は接続しない）。

## 9. Morning Briefing へ渡す前に保持するもの（§8-9）
`LifeOpsPlacementResult` = `placements[]`（lane 別に group 可能・placed→unplaced 順）+ `placedCount`/`unplacedCount`。文言化（非断定）は presenter 側（L-8a 流儀）— 本 slice は構造のみ。

## 10. fake scenario（§8-10・実データ源ゼロでテスト）
- 縦 fake inputs: `cadenceObservations`（beauty_salon 前回 60 日前 / groceries 前回 10 日前）・`upcomingEvents`（interview 3 日後）・`deadlineObservations`（tax_filing 期日 5 日後 / overdue 1 件）→ **実 collector を通す**（型再定義しない）。
- 横 fixture: `WorldState`（窓 2 つ: 朝 60 分・午後 180 分 / mobility null or 15 分 / nowMinute 注入で過去窓 skip 検証）。
- 検証: 優先度順配置・lane mapping・外出/在宅の窓要件・cap・残量管理・過去窓 skip・unplaced 理由・**candidate 無改変（embedded 同一参照）**・redaction（理由は安定コードのみ）。

## 実装物
- `lib/plan/reality/lifeops/lifeops-placement.ts`（pure）: `placeLifeOpsCandidatesForDay({ candidates, worldState, maxPlacements? }) → LifeOpsPlacementResult`・wrapper 型 `PlacedLifeOpsCandidate { candidate, window, placementReason, planLane }`（CEO 指定形・**LifeOpsCandidate を再定義しない**）。
- `tests/unit/reality/realityLifeopsPlacement.test.ts`（fake/injected のみ）。

## stop（本 slice でやらない）
UI 本線 / Home/Plan 配線 / Morning Briefing 本線 / Moment Trigger 本線 / 通知 / 外部 API / fetch / DB / 実データ源 / 予約・購入・連絡 / production / flag ON / push / PR / merge。env は存在確認と設計言及まで（接続しない）。
