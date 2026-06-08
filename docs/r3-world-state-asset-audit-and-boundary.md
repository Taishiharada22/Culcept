# R3 World State — 既存資産監査 + 境界（R3-0・read-only）

> 2026-06-09 / Build Unit / CEO 指示「R3-0 Asset Audit + Boundary。既存 ContextSnapshot/InnerWeather/DayGraph/weather/mobility/authority を再実装せず consume/type-only/pure seam に留め、R2 へ渡す入力を組むだけ」。
> 前提: `docs/r2-empty-day-asset-audit-and-boundary.md` / R2 完了（`ffed3348`）。**read-only**。

---

## 0. 結論（前提の検証）
- **WorldState aggregator は不在**（grep 0 件）→ **R3 は新規**（重複でない）。
- **ContextSnapshot（`buildDayContextSnapshot`）が既存の context 集約**（energy/weather/density を `Sourced<T>` で保持）→ WorldState は**これを consume**（weather/energy を再計算しない）。
- **DayGraph GapNode が free window の源**だが内部構造（sensitiveProximity 等）に密結合しない → **caller が gap→availableWindows を導出して WorldState に渡す**（R3 は受けるだけ）。
- **WorldState は R2 と R4 双方が消費する「今の現実」の単一表現**（横エンジン基盤）として設計する。

## 1. 資産（監査確定・consume 方針）
| 資産 | 正本 / ファイル | R3 の扱い |
|---|---|---|
| context 集約 | `ContextSnapshot`(weather/density/energy: `Sourced<T>`) / `buildDayContextSnapshot` `lib/plan/context/contextModifier.ts`・`contextBridge.ts` | **type-only consume**（WorldState が保持・energy/weather を取り出す） |
| weather | `WeatherKind` `contextModifier.ts` | consume（ContextSnapshot 経由） |
| energy | `InnerWeather.energyLevel`(-1..1) / ContextSnapshot.energy(`Sourced<number>`) | **placeholder**（derive で 0..1 に clamp） |
| 予定構造 | `DayGraph`/`GapNode`(implicit gap) `lib/plan/dayGraph/dayGraphTypes.ts` | **caller が gap→availableWindows 導出**・R3 は受ける（内部密結合しない） |
| hard constraint | `HardConstraint`(R2-1 `empty-day-input.ts`) | **reuse**（todaySchedule の item 型に流用） |
| mobility | `MobilityObservation` `lib/plan/mobility/` | **MAP 不可侵・placeholder のみ** |
| authority | `PlanItemGovernance`/`ProtectionReason` `lib/plan/reality/authority.ts` | consume（保護理由・permission） |
| memory | `MemorySynthesis`(R1) `memory-synthesis.ts` | **このセッション**・usableContexts(hint)+suppressed(excluded)を derive で注入 |

## 2. 境界（R3 の所有 / consume / 不可侵）
- ✅ **R3 が所有（新規・pure）**: `WorldState` 入力契約・`deriveEmptyDayInput(worldState, memorySynthesis)`・coherence/readiness。
- 🔌 **R3 が consume（type-only/値・中身を作らない）**: ContextSnapshot/WeatherKind・DayGraph gap（caller 経由）・HardConstraint(R2)・PlanItemGovernance・R1 MemorySynthesis。
- 🚫 **R3 が触らない**: ContextSnapshot/InnerWeather/DayGraph/mobility の **再実装**・MAP 正本・Plan 本体。
- 🚫 **R3 が作らない（stop gate）**: PlanCandidate 正本型・LifeOpsCandidate 正本型・Plan 本線接続・route/DB/UI。

## 3. 設計（R3 が組むもの）
```
WorldState {
  date; nowMinute(分・null=不明・pure: caller が渡す);
  todaySchedule: HardConstraint[]（R2 reuse・固定予定→hardConstraints）;
  availableWindows: AvailableWindow[]（caller が DayGraph gap から導出）;
  context: ContextSnapshot | null（★consume・energy/weather/density）;
  mobility: MobilityPlaceholder | null;
  permissionLevel: EmptyDayPermissionLevel;
}
deriveEmptyDayInput(worldState, memorySynthesis): EmptyDayInput
  // energy = clamp(context?.energy?.value, 0,1) / weather = context?.weather?.value /
  // hardConstraints = todaySchedule / availableWindows pass-through /
  // memoryUsableContexts = memorySynthesis.usableContexts /
  // excludedContexts = memorySynthesis.contexts.filter(suppressed).map(context)  ← suppressed を明示除外
  // userIntent = null（placeholder・将来 daily guidance）
```
**不可侵原則**: WorldState は既存正本を**保持/参照**するだけで再計算しない。derive は R2 入力を**組むだけ**（Plan 本線非接続）。

## 4. scope（R3-1〜R3-4・pure/dev）
- R3-1 WorldState 入力契約（pure 型 + 正規化）
- R3-2 deriveEmptyDayInput（R3→R2 seam・suppressed→excluded 注入）
- R3-3 coherence/readiness（欠損/stale を捏造せず flag・field 別 readiness）
- R3-4 fixture smoke（schedule/energy/weather 有無・全 null・R2 への end-to-end）

## 5. stop gate（R3 で必ず停止）
PlanClient 接続 / route・API / DB write / notification・native / production・Vercel・deploy・remote・PR / execution / REALITY_ALTER_BRIDGE_LIVE enable / Life Ops 正本 schema / PlanCandidate 正本型 / user-facing 公開 / 旅行・複数人。
