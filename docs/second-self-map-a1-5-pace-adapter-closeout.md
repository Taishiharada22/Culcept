# A1-5 personal pace adapter + flagged 配線 — closeout + A1-6a manual log mini-design

> 2026-06-08 / Build Unit / autonomous batch（CEO 承認 (1)）。A1-5 pure adapter + flag OFF 配線 + tests + A1-6a mini-design。

---

## A1-5 closeout（実装・main 着地予定）

### 実装した
- **A1-5 pace adapter（pure）** `lib/plan/dayRehearsal/personalPaceAdapter.ts`
  - `applyPersonalPaceToTravelMin(travelMin, pace, config)` → `{adjustedMin, applied, reason}`
  - `applyPersonalPaceToRehearsalInput(input, resolvePace, config)` → 新 RehearsalInput（travelMin のみ soft 反映）
  - `DEFAULT_PERSONAL_PACE_ADAPTER_CONFIG`：damping established 0.6 / emerging 0.35・clamp **[0.85, 1.25]**
- **flag** `DAY_REHEARSAL_PERSONAL_PACE_ENABLED = false`（dayRehearsal.ts・既存 DAY_REHEARSAL_* と同所）
- **flagged 配線** `CalendarTab.tsx`：rehearseDay 前に flag gated transform。

### ★安全境界（CEO 仕様遵守・検証済）
- **travelMin だけ調整**。`bufferStatus/slackMin/shortfallMin`（feasibility 由来の**観測**）は**一切触らない**（型定義が「推定でない」と明記）。→ travelMin は friction(=estimate) のみに効く。
- **上書きしない**：soft multiplier（damping）+ clamp[0.85,1.25]。**established shorter でも 0.85 で頭打ち**（過剰に短くしない）/ 極端 longer も 1.25 で頭打ち。
- **confidence gate**：status==="ready"（≥3観測）のみ適用。emerging は established より弱く。
- **fallback**：unknown / not_enough_signal / pace 不在 / travelMin null → **そのまま**（既存 full-path 維持・null は捏造しない）。
- **完全不変保証**：変更が無ければ **同一参照**を返す → flag OFF / データ無で rehearsal 出力が byte 一致（test で `toBe` + `toEqual` 検証）。

### ★flag OFF 配線の現状（透明性・重要）
**flag は default OFF**。さらに resolver は現状 **`() => null`**（capture 未実装ゆえ）。
→ flag ON でも `applyPersonalPaceToRehearsalInput(input, () => null)` は**同一参照**を返し、rehearsal は完全不変。
＝**今は ON にしても挙動は変わらない**（実データ経路が無い）。activation/ON smoke は **A1-6 で実データ経路が完成してから** CEO 判断。

### テスト / tsc
- 新規 **A1-5: 17 tests PASS**（core/fallback/clamp/transform/★rehearseDay 効果：friction 増・null resolver で完全一致・what-if(protect/leave_earlier) 無副作用）。
- dayRehearsal + mobility 全体 **510 PASS**（既存無影響）。tsc footprint **0**・baseline **55 維持**。

### 非実装（次）
- resolver の実装（store → ratios → lookup）。A1-6 の schema 拡張後に `() => null` を置換。
- A1-6a 手動ログ UI（下記 mini-design）。A1-6b GPS 自動（停止ゲート・据置）。

---

## A1-6a mini-design — 手動ログ UI（GPS 不要・smoke 低・実データ seed）

### 狙い
GPS の実機 smoke を待たず、**手動で実移動を記録**して store を seed → A1-4→A1-5 を起動。
「capture 機構（手動/GPS）と pace パイプラインは独立」という設計分離の安全側を先に実装。

### ★前提となる schema 拡張（A1-6 の核心判断・additive）
A1-4 が **store だけで ratio を出せる**よう、`MovementEvent` を additive に拡張する（後方互換・既存 parse 不変）:
```
MovementEvent += { mode?: RouteTransportMode; odKey?: string; estimateMin?: number | null }
```
- これで store の各 event が自己充足 → resolver = `loadMovementEventStore()` → `PaceObservation[]` 平坦化 → `buildPersonalPaceRatios` → `findPersonalPaceRatio(odKey/mode)`。
- 手動ログも GPS 捕捉も**同じ形**を埋める（pipeline は出所を問わない）。
- ★estimateMin を capture 時に保存する理由：ratio は「その時の estimate」と比べるべき（estimate は時間で変わりうる）。現在値 join の近似より正確。

### UI（最小・保守的）
- **対象**: 過去 leg（実績の器・read-only 表示の leg）。**sensitive leg には affordance を出さない**（privacy 一貫）。
- **affordance**: leg row/card に控えめな「実際の移動を記録」。
- **form**: 出発時刻 / 到着時刻（time input・schema に素直）→ actualDurationMin = 到着−出発。最小なら「所要（分）」単独も可。
- **save**: `buildMovementEventManual({departureAt, arrivalAt, mode, odKey, estimateMin})`（source="manual"・confidence="high"）→ `recordMovementEvent(dayKey, legKey, event, gate)`。
  - gate: 手動の **明示 save = 同意** ＝ optInGranted 相当（GPS opt-in は不要）。sensitive はそもそも affordance なしで二重に防ぐ。
- **可逆**: 記録の取り消し（削除）も置く。

### 安全境界
GPS・geofence・実機移動 smoke **不要**（form のみ・基本 smoke で足りる）/ raw GPS なし / DB なし / production・push・PR なし / sensitive 記録なし / 距離→時間捏造なし（user 入力値のみ）。

### 次の順序（smoke なしで価値が出る順・再掲）
1. （本バッチ完了）A1-5 adapter + flag OFF 配線
2. **A1-6a schema 拡張 + 手動ログ UI + resolver 実装**（GPS なし・基本 smoke）→ flag ON で pace が実際に効く経路が完成
3. **A1-6b GPS 自動捕捉**（実機 smoke + UX/仕様判断・CEO 承認後・現状は停止ゲート）

> ★A1-6b（live GPS sampling / 到着確認 UI）は **停止ゲート**（実機 GPS・確認タイミング・電池・UX 判断）。本バッチでも実装しない。
