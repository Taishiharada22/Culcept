# SR /plan month grid reflection — read-only audit + mini readiness

> 区分: **read-only audit + mini readiness（docs-only）**。実装なし・DB/保存/VLM/production/push なし。
> branch: `feat/plan-shift-month-grid-reflection`（base = productization HEAD `3e6a5cdf`・stacked）。
> 目的: 取込保存された external_anchors / plan_day_indicators が /plan の月/日/予定表示にどう反映されるか確認し、次の最小実装 scope を決める。

---

## 1. 現在の data flow（read-only 確認）

```
import save (S-save, importShiftRoster → RPC import_shift_roster)
  ├─ 勤務 → external_anchors（one_off anchor・sourceType="shift_image"）
  └─ 休み/希望休 → plan_day_indicators（sourceType="shift_image"）
        ↓
GET /api/plan/anchors  →  { sources, anchors, dayIndicators }
  （plan_day_indicators table 未適用(42P01)は reader 側で [] に degrade）
        ↓
PlanClient（mount で 1 fetch + POST/DELETE で refetch）
  state: anchors: ExternalAnchor[] + dayIndicators: PlanDayIndicator[]
  → dayIndicatorsByDate(dayIndicatorView) で iso→viewModel に
        ↓
3 tabs（共通 anchors[] + dayIndicatorByIso[] を受領）
```

## 2. 既に反映されているもの（live・flag 不要）

| 面 | 勤務（anchor） | 休み（day_indicator） | 状態 |
|---|---|---|---|
| **週 view（CalendarTab・既定）** | anchor density indicator | **休み/希望休 dot（H=rose / BD=slate / HREQ=violet・SR #216 D3）** | **反映済 live** |
| **日 view（FlowTab）** | `anchorsForDay`（recurring 展開 + exception + validity 継承） | **休み/希望休 day-level badge（SR #216 D3）** | **反映済 live** |

→ **取込した勤務/休みは、保存さえされれば 週/日 view に既に出る**（flag 不要）。`dayIndicators` は anchor と別レイヤーで正しく分離（「休みは anchor でない」設計を踏襲）。

## 3. build 済だが dormant（flag-gated）

| 面 | 内容 | gate |
|---|---|---|
| **月 view（MonthGridView）** | 6×7 full grid・各日に **勤務/休みコード chip（E/N/L/G=勤務 / H/BD/HREQ=休み）+ 背景 tint**。presentational・props 注入（anchors + DayIndicatorViewModel + chip resolver） | **`NEXT_PUBLIC_PLAN_CALENDAR_MONTH_GRID_ENABLED`（client・default OFF）**。M3-b で MonthGridView を month mode に統合済。flag OFF = week strip のみ・toggle 非表示・**UI 完全不変** |

→ **月 grid reflection は実装完了済で、flag で dormant**。flag ON で week⇄month toggle 出現 → month grid に取込シフトが俯瞰表示される。

## 4. 反映されないもの / GAP

| # | gap | 種別 |
|---|---|---|
| G1 | **月 view が dormant（flag OFF）** | enablement（flag）/ UX 判断。新規実装ではない |
| G2 | **取込 source（shift_image）の視覚的区別なし** | 取込シフトと手動 anchor/indicator が同じ見た目。「取込」バッジ等で区別するか = **小 UX 実装候補** |
| G3 | **production schema 未適用**（plan_day_indicators）| 未適用なら fetch が dayIndicators=[] に degrade → 休み反映されず。production-enablement readiness P1 の範囲 |
| G4 | 取込月の自動 surface 化（imported 月を開いたら month/summary を促す等）| 任意の体験強化・新規実装候補 |

## 5. 次に触るべき最小 scope（候補）

| 候補 | 種別 | 評価 |
|---|---|---|
| **A) 何も足さず enablement 判断**（月 view flag を出すか・本番化 readiness と統合） | flag/UX | **最小**。reflection は既に build 済なので、新規実装不要で「月 view を見せるか」の判断のみ |
| **B) shift_image source の視覚区別**（G2・取込バッジ or tint 差別化） | 小 UX 実装 | 取込/手動の混在が分かりやすくなる。最小・surgical・dormant 不要 |
| C) 取込月 auto-surface（G4） | 体験実装 | 価値はあるが scope 大・後続 |
| D) 月 view の shift 表示 polish | 小 UI | flag ON 後の見栄え調整・enablement とセット |

**推奨**: reflection は想定より**完成度が高い**（週/日 live + 月 build 済）。次の最小は **A（enablement 判断）か B（source 区別）**。
- 「まず見せる」を優先なら **A**（flag/本番化判断・新規コードほぼ不要）。
- 「取込と手動を区別して安心感」を優先なら **B**（小 surgical 実装）。

## 6. 実装判断
- **まだ実装に入らない**。reflection が既に大半 build 済と判明したため、「何を新規実装するか」は **A/B/C/D の scope を CEO が確定してから**。
- 本 audit で「データ→週/日 view は live・月 view は flag dormant・source 区別なし」が確定。次は CEO が最小 scope（推奨 A or B）を選択 → その時点で実装 readiness。

---

## 結論
- **取込シフトの /plan reflection は ~大半が既に実装済**（data + 週/日 view live・月 view は build 済で flag dormant）。
- 純粋な「未実装」は **G2（source 区別）と G4（auto-surface）**のみ。G1（月 view dormant）は enablement、G3 は production schema 適用。
- **次の最小 scope は A（enablement 判断）または B（取込 source 区別）**。実装着手は CEO の scope 確定後。
