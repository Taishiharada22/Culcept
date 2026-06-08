# R2 Empty-day — 既存資産監査 + 境界（R2-0・read-only）

> 2026-06-09 / Build Unit / CEO 指示「R2-0 Empty-day Existing Asset Audit + Boundary。既存資産棚卸し・正本型確認・Plan 本体セッションとの境界再確認・どの pure を使えるか/触ってはいけないか明確化・docs・commit」。
> 前提: `docs/reality-secretary-os-unbuilt-roadmap.md`（R2）/ R1 完了（`8e26ed40`）。**read-only**（コード不接触）。
> 二重実装事故（別セッションが横エンジン R1 を重複）の教訓 → **既存資産を consume するだけで再実装しない**を厳守。

---

## 0. 結論（前提の検証結果）
- **生成的 day-builder は存在しない** → **R2 empty-day は真に新規**（重複でない）。`emptyDayObservation.ts` は entry UI 判定のみ・`computeProposals` は item 単位の反復提案で「空白の日を組む」ものではない。
- **day-level 3 案（守る/楽/攻める）も存在しない** → R2 が新規に作る。item 単位の `ProposalDirection` のみ存在（概念フレームは consume 可）。
- gap/dayGraph/weather/energy/authority/viability は**正本型が揃っている** → R2 は**型を consume**して合成する（中身は作らない）。
- Day Rehearsal（評価）と mobility（移動）は**マップセッション正本＝不可侵**。R2 はその**出力型を read-only placeholder として受けるだけ**。

## 1. 資産インベントリ（監査確定）

| # | 資産 | 存在 | 正本型 / ファイル | 所有 | R2 の扱い |
|---|---|---|---|---|---|
| 1 | 生成的 day-build | ❌ | — | — | **R2 が新規作成** |
| 2 | 3 案（守る/楽/攻める） | ⚠️ item のみ | `ProposalDirection`（continue_pattern/recover_pattern/intentional_break_observed）`lib/plan/proposal/proposalDirection.ts` | 共有 | フレーム consume・**day-level は R2 新規** |
| 3 | Day Rehearsal（評価） | ✅ | `RehearsalInput` / `DayRehearsal` / `ViabilityEstimate`(holds/tight/breaks/unknown) `lib/plan/dayRehearsal/dayRehearsalTypes.ts` | **MAP 🚫** | **型 consume のみ・logic 不接触** |
| 4 | gap 分類 | ✅ | `GapMeaning`(dangerous_tight/travel_buffer/meal/recovery/waiting/work/free_time) / `classifyGap()` `lib/plan/reality/gap-meaning.ts` | 共有 | consume |
| 5 | Day Graph | ✅ | `DayGraph` / `DayGraphNode` / `BuildDayGraphInput/Result` `lib/plan/dayGraph/dayGraphTypes.ts` | 共有 | consume（構造・hard constraint 把握） |
| 6 | energy/fatigue | ✅ | `InnerWeather.energyLevel`(-1..1) / `baseEnergyLevel`(0..1 正規化) `lib/stargazer/innerWeather.ts` | Stargazer/共有 | **placeholder 入力** |
| 7 | weather | ✅ | `WeatherKind`(rain/snow/storm/heat/cold/normal) / `ContextSnapshot` `lib/plan/context/contextModifier.ts` | 共有 | **placeholder 入力** |
| 8 | mobility | ✅ | `MobilityObservation` / `RouteTransportMode` `lib/plan/mobility/mobilityObservationStore.ts` | **MAP 🚫** | **placeholder のみ・不接触**（解決済 travel を Day Rehearsal 経由で受ける想定） |
| 9 | user intent / daily guidance | ❌(/plan) | （stargazer に Daily Guidance Engine あるが /plan 未統合） | — | **placeholder**（v0 は 3 案選択に implicit） |
| 10 | permission/authority | ✅ | `PlanItemGovernance`(origin/authority/flexibility/protectionReasons) `lib/plan/reality/authority.ts` | 共有 | consume（recovery_core/user_declared 保護） |
| — | R1 記憶 | ✅ | `MemorySynthesis.usableContexts` `lib/plan/reality/learning/memory-synthesis.ts` | **このセッション** | **personal overlay / hint（重み付けのみ）** |

## 2. 境界（R2 の所有 / consume / 不可侵）
- ✅ **R2 が所有（新規・pure）**: 空白日の **day-assembly**・**day-level 3 案（守る/楽/攻める）**・**reason building**・readiness。
- 🔌 **R2 が consume（共有型・中身を作らない）**: `ProposalDirection`（フレーム）・`GapMeaning`/`classifyGap`・`DayGraph` 型・`ContextSnapshot`/`WeatherKind`・`PlanItemGovernance`/`ProtectionReason`・`ViabilityEstimate`（signal）・R1 `usableContexts`。
- 🚫 **R2 が触らない（MAP セッション正本）**: `dayRehearsal.*` internals・`mobilityObservation*`/`personalPace*`。**出力型を read-only で受けるだけ**。
- 🚫 **R2 が作らない（stop gate・別所有）**: PlanCandidate 正本型・Life Ops 正本 schema・Plan 本線 write。

## 3. 合成アーキテクチャ（CEO 方針の構造化・hard constraints 最優先・memory は hint）
```
hard constraints（最優先・絶対）          ← DayGraph / PlanItemGovernance(recovery_core/user_declared)
  → available windows（空き枠）            ← gap(classifyGap) / DayGraph
    → 3 案の骨格生成（守る/楽/攻める）       ← R2 新規（feasible な範囲でのみ）
      → memory overlay で重み付け・順序      ← R1 usableContexts（**命令でなく hint・重み付けのみ**）
        → 合成（energy/weather/mobility/intent/permission と）  ← placeholder 入力
          → reason building（非断定）        ← R2 新規
```
**不可侵原則**: memory は hard constraints を**上書きしない**。feasible な選択肢の**重み付け/順序付け**にのみ使う。`usableContexts` だけ使い、insufficient/emerging/suppressed は使わない。certainty high 禁止・trait/fixed/liked-disliked 断定禁止。

## 4. R2-1 入力契約プレビュー（次 slice・placeholder 設計）
`EmptyDayInput { date; availableWindows[]; hardConstraints[]; energy(placeholder 0..1|null); weather(WeatherKind placeholder|null); mobility(placeholder|null); memoryUsableContexts(R1); userIntent(placeholder|null); permissionLevel; excludedContexts[] }`。**output はまだ Plan 本線に接続しない**。

## 5. stop gate（R2 で必ず停止）
PlanClient 本線接続 / actual plan write / route・API 化 / DB write / notification・native / production・Vercel・deploy・remote・PR / REALITY_ALTER_BRIDGE_LIVE enable / Life Ops 正本 schema / PlanCandidate 正本型 / user-facing 公開 / 旅行・複数人。
→ R2-1〜R2-4 は **pure helper / fixture / tests / docs / dev-only preview 設計まで**。これらに当たったら停止・報告。
