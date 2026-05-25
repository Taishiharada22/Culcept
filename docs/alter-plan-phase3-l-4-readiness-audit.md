# Phase 3-L-4 Readiness Audit (= read-only、 pure formatter まで連続 GO)

**作成日**: 2026-05-22
**承認**: CEO + GPT 合議 (= L-3c 完了報告後、 「L-4 readiness audit を実施、 audit 結果次第で L-4a/L-4b pure formatter は連続 GO」 指示)
**範囲**: L-3 完全 freeze (= L-1/L-2/L-3a/L-3b/L-3c) 上に乗る L-4 全体の責務分解 + 細分化提案 + 連続 GO subphase の境界定義

> 本 audit と連続して L-4a (pure formatter) + L-4b (display contract) を実装する (= CEO 連続 GO 許可範囲)。
> UI 接続 / geocode active call / runtime telemetry sink などの危険境界の直前で **必ず停止**する。

---

## 0. Purpose

L-3 完全 freeze 後、 残る論点は「移動が確定したか / されていないか」 という観測を **どのように見せるか** の表示層。 L-4 はここを扱うが、 一括で UI 接続まで進めるのは危険なので段階分解する。

audit の目的:
1. L-4 全体の責務を明示分解
2. 最小 scope (= 安全に着手可能な最初の subphase) を特定
3. 連続 GO してよい境界と、 必ず停止する境界を明示

---

## 1. L-4 全体の責務分解

L-4 が扱う論点を **4 つの sub-responsibility** に分ける。 一括にしない。

| Sub | 責務 | リスク | 着手方針 |
|---|---|---|---|
| **L-4a** | OverlayResult → 表示用 view model (= MovementDisplayView) の **pure formatter** | 低 (= no UI, no geocode, no telemetry sink) | **連続 GO** (= 本 audit 後 即着手) |
| **L-4b** | 表示用 view model の **display contract** (= K-3c-iii 階層 2 整合、 raw PII 不存在 assertion、 NG 文言 grep) | 低 (= pure verify、 audit 拡張) | **連続 GO** (= L-4a 直後) |
| L-4c | MapTab / existing geocode result **bridge** (= coords を caller 側で集める helper) | 中 (= privacy 方針再確認 必要、 既存 geocode endpoint の re-use 監査) | **要 readiness audit + CEO 判断** |
| L-4d | UI 接続 (= CalendarTab/MapTab/FlowTab で 「移動 約 30 分」 を出す) | 中-高 (= K-3c-iii 階層 2 厳守、 amber/orange/red 禁止、 K phase の MovementTransitionView を override せず co-exist) | **要 CEO 別 review** |
| L-4e | telemetry runtime sink (= L-1 MovementResolutionTelemetry を保存する場所決定 + PII 再監査) | 高 (= 保存先 / 保持期間 / 第三者送信 / privacy policy 再確認) | **要 CEO 判断、 type-only 維持を推奨** |

### 1.1 設計の核心 (= 一括にしない理由)

- pure formatter (= L-4a/L-4b) は overlay result から view model への deterministic 変換であり、 **副作用 0 / 既存 UI 無接続 / 既存 API 無接続 / dependency 追加 0**
- bridge (= L-4c) は coords source を「既存 MapTab の geocode 結果のみ」 に限定して privacy 方針を維持できるかが論点
- UI 接続 (= L-4d) は K-3c-iii の階調 / 文言 / tier 維持を厳格に確認した上で着手
- telemetry sink (= L-4e) は保存先決定が privacy policy に直結するため別 phase

→ L-4a/L-4b を独立して着地させれば、 後続 (L-4c/L-4d/L-4e) は別 phase / 別判断で進められる。

---

## 2. 最小 scope (= 連続 GO 着手) — L-4a

### 2.1 L-4a 役割

**入力**: `OverlayResult` (= L-3c で sanitize 済の PII-free 結果)
**出力**: `MovementDisplayView` map (= 「→ 移動」 / 「移動 約 30 分」 / 「移動」 等の text + tier ID)

`MovementDisplayView` の構造:

```typescript
export interface MovementDisplayView {
  readonly transitionIndex: number;
  /** 表示文字列 (= 「→ 移動」 / 「移動 約 30 分」 / 「移動」) */
  readonly displayText: string;
  /** K-3c-iii 階層 ID — "tier_2_movement" 固定 (= caller が階調を決定する hint) */
  readonly tier: "tier_2_movement";
  /** display variant — UI レンダラがこれを見て描き分け可能 */
  readonly variant: "unresolved" | "sensitive" | "duration_only";
  /** confidence band (= "soft" / "strong"、 UI tone hint。 raw confidence は露出しない) */
  readonly confidenceBand?: "soft" | "strong";
}
```

### 2.2 variant 規則 (= 設計確定)

| variant | 発火条件 | displayText | 含意 |
|---|---|---|---|
| `unresolved` | `segment.timingStatus === "unresolved"` | **「→ 移動」** | K-3c-iii MovementTransitionView と同じ fallback、 detail 出さない |
| `sensitive` | `segment.timingStatus === "resolved"` かつ `privacyClass ∈ { sensitive_both, sensitive_adjacent, location_unknown }` | **「移動」** | 防御 (= cascade では到達しないはずだが、 caller が直接 overlay を使う場合の二重防御) |
| `duration_only` | `segment.timingStatus === "resolved"` かつ `privacyClass === "normal"` | **「移動 約 N 分」** (= N = `Math.max(1, Math.round(estimatedDurationMin))`) | L-4a の唯一の意味的拡張、 duration のみ、 mode は出さない |

**重要**: mode 表示 (= 「歩いて」「車で」 等) は L-4a では **一切しない**。 confidence high の場合でも duration only。 mode は L-4+ で別 audit 経由で検討。

### 2.3 confidenceBand の用途

- `low` confidence → `"soft"` (= UI で italic / 薄い色を適用する hint)
- `medium / high / very_high` → `"strong"` (= UI で通常表示の hint)
- 但し L-4a は **値を返すだけ**、 実 UI 適用は L-4d 以降の責務

---

## 3. L-4b — display contract

### 3.1 役割

L-4a の出力が以下を満たすことを **runtime に機械保証**:

1. `displayText` に raw locationText / title / userId / anchorId / nodeId が含まれない
2. `tier` は `"tier_2_movement"` 固定
3. `variant` は 3 値のいずれか
4. **NG 文言が含まれない** (= recommendation / warning / optimization / 質的評価)
5. K-3c-iii 階層 2 (= slate-300 / text-slate-500 / text-xs) と整合

### 3.2 NG 文言禁止 list (= grep regression guard)

| 禁止 | 理由 |
|---|---|
| 「早めに」「お急ぎ」「余裕」「急いで」 | recommendation / urgency 文言 |
| 「快適」「便利」「便利な」「最適」 | optimization 文言 |
| 「注意」「警告」「危険」「リスク」「遅刻」 | warning 文言 |
| 「歩いて」「車で」「電車で」「飛行機で」 | mode 表示 (= L-4a 範囲外) |
| 「○ km」「○ メートル」 | distance 表示 (= L-4a で内部のみ) |
| 「from」「to」 (= 英語 raw) | locationText 漏洩可能性 |

L-4b は assert 関数 + grep test で全 case を覆う。

### 3.3 機械保証関数

```typescript
export function assertMovementDisplayCompliance(view: MovementDisplayView): void;
export function assertMovementDisplayResultCompliance(result: MovementDisplayResult): void;
```

違反は `MovementDisplayContractError` (= violation key + view snapshot)。

---

## 4. coords source 方針 (= L-4 全体の論点)

### 4.1 L-4 では geocode endpoint を能動的に呼ばない

CEO 永続規約。 L-4a / L-4b は **coords を直接扱わない** (= overlay result の表示変換のみ)。
L-4c (= bridge) で初めて coords source を扱うが、 そこでも:
- 既存 MapTab の geocode 結果のみを caller が用意する pattern を維持
- 新規 geocode 呼出は L-5+ 別 audit 経由

### 4.2 coords 無しなら unresolved 維持

L-4a は overlay result の `timingStatus === "unresolved"` をそのまま「→ 移動」 として表示。 K view と同じ fallback で「予定なし誤表示」 を防ぐ。

---

## 5. UI 表示文言契約 (= 永続規約)

### 5.1 OK 文言 list (= L-4a 出力に許可されるのみ)

- 「→ 移動」 (= unresolved)
- 「移動」 (= sensitive)
- 「移動 約 N 分」 (= N は 1 以上の整数)

### 5.2 NG 文言 list (= 永続禁止)

§3.2 参照。 recommendation / warning / optimization / mode / distance / 質的評価。

### 5.3 confidence による表示の控えめさ

- L-4a の `confidenceBand` 出力で UI レンダラに hint を伝える
- UI 実装 (= L-4d) で「soft」 → italic / dashed / 薄色を適用する想定
- L-4a 自身は色 / italic 等の CSS を含まない (= pure data)

---

## 6. K-3c-iii との整合

### 6.1 階層維持

- **階層 2 (= movement) 維持**: slate-300 / text-slate-500 / text-xs / dashed
- amber / orange / red は **絶対 NG**
- 「→ 移動」 (= unresolved) と「移動 約 30 分」 (= resolved) は **同階層** (= 階調統一)

### 6.2 K の MovementTransitionView との co-existence

- K の MovementTransitionView は **無変更** (= 「→ 移動」 固定文言維持)
- L-4a の MovementDisplayView は **K view の置換ではなく、 augment**
- caller (= L-4d UI) が「K view の label を MovementDisplayView の displayText で上書きするか / 維持するか」 を選べる
- 上書きしない場合、 K の「→ 移動」 のまま (= 既存挙動完全維持)

### 6.3 duration / mode / risk を出しすぎない

- L-4a は **duration のみ** (= mode / risk 出さない)
- 「移動 約 30 分」 という最小限の意味的拡張
- 「歩いて 30 分」 / 「車で 30 分」 / 「ちょうど良い余裕」 は **L-4a 範囲外**

---

## 7. telemetry runtime sink 検討

### 7.1 L-4 では作らない

L-1 `MovementResolutionTelemetry` 型は既に定義済 (= L-1 freeze 維持)、 但し runtime sink は未実装。
L-4 では **type-only 維持** が推奨:
- 保存先決定が privacy policy に直結
- 保持期間 / PII 再監査 / 第三者送信 確認が必要
- L-4 範囲では時期尚早

### 7.2 sink を作る判断は L-4e 別 audit

L-4e (= telemetry sink) は別 readiness audit 経由。 本 L-4 readiness audit では「**L-4 範囲では作らない**」 と明示。

---

## 8. STOP 条件 (= 連続 GO 着手前 必須クリア)

| STOP 条件 | 確認 |
|---|---|
| UI 変更が大きい | L-4a/L-4b は pure data、 UI 接続 0 |
| geocode active call が必要 | L-4a/L-4b で呼ばない |
| env / API / package が必要 | 0 (= L-4a/L-4b は既存 type に依存するのみ) |
| privacy 方針確認が必要 | 既存 privacy 方針 (= L-3c assertOverlayResultCompliance) を尊重、 新規 PII 持ち出しなし |
| DayGraph / K phase を mutate する必要 | 0 (= K phase 全 file 無変更) |
| Arrival Risk Memory に入る | 0 (= 文言禁止 list で grep guard) |
| warning / recommendation / optimization 文言が出る | 0 (= L-4b で grep test 必須) |
| L-1 type 変更 | 0 (= freeze 維持) |

→ **全 8 STOP 条件未抵触**。 L-4a/L-4b 連続 GO 着手可能。

---

## 9. 連続 GO subphase 範囲 (= CEO 許可)

| Subphase | 着手 | 連続 GO 対象 |
|---|---|---|
| L-4 readiness audit (= 本 doc) | docs only | ✅ |
| L-4a pure formatter (= MovementDisplayView 生成) | 実装 + tests | ✅ |
| L-4b display contract (= assert 関数 + NG 文言 grep) | 実装 + tests | ✅ |
| L-4c MapTab / geocode bridge | **停止** | ❌ 別 audit |
| L-4d UI 接続 (= CalendarTab/MapTab/FlowTab) | **停止** | ❌ 別 audit |
| L-4e telemetry runtime sink | **停止** | ❌ 別 audit |

---

## 10. CEO 判断ポイント (= L-4b 着地後)

| Q | 内容 |
|---|---|
| Q1 | L-4a/L-4b 着地で十分か (= L-4 freeze を確立するか) |
| Q2 | 次は L-4c bridge readiness audit か、 別軸 pivot か |
| Q3 | L-4 readiness audit の連続 GO 判断は妥当だったか |

---

## 11. 関連 docs

- `docs/alter-plan-phase3-l-3-readiness-audit.md` (= L-3 overlay 採用 + 4 sub-phase 細分化)
- `docs/alter-plan-phase3-l-3-post-implementation-audit.md` (= 4 critical 実害 + L-3c 修正案)
- `docs/alter-plan-phase3-l-transport-design.md` v0.2 (= L 全体設計)
- `lib/plan/transport/movementSegmentOverlay.ts` (= L-3c OverlayResult 出力元)
- `lib/plan/dayGraph/dayGraphTimelinePresentation.ts` (= K-3c-iii MovementTransitionView 階層 2)

---

## 12. 思想の transmission (= L-4a/L-4b 設計の哲学)

1. **pure formatter は「観測の表記」 を担当する** — duration を text にする変換は思想に整合する最小拡張
2. **K の固定文言「→ 移動」 は無変更で維持** — L-4 が augment、 caller が選ぶ
3. **mode / distance / risk は L-4 範囲外** — Mobility Truth Layer 思想 (= 観測のみ、 推奨 / 最適化なし)
4. **K-3c-iii 階層 2 規格を尊重** — slate 階調、 italic / dashed、 amber/orange/red 不使用
5. **Privacy is structural** (= L-3c 継承) — MovementDisplayView は raw 値を持てない構造、 NG 文言 grep で機械保証

L-4a/L-4b は L-3c の structural privacy を **「観測の表記」** に正しく持ち越す。
