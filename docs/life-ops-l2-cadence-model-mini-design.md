# Life Ops L-2 — 周期（cadence）模型 mini-design【実装 GO・pure・stop gate でない】

> 2026-06-09 / Life Ops 縦トラック（branch `claude/life-ops-vertical`）
> 参照: `docs/life-ops-boundary-and-handoff.md` §2 L-2 / §4 / Appendix A.2・A.7 / `life-ops-l1-category-model-mini-design.md`（L-1）。
> 方針: pure ゆえ stop gate でない → 実装まで進める。**L-3 Candidate Engine 実装の手前で停止**（設計監査）。

---

## 0. 一行
L-2 は「cyclic カテゴリの**標準周期**」と「lastCompletedAt から**経過段階**を計算する pure helper」を定義する。MVP=美容院(カット/カラー)・眉。
**due（締切）を断定しない**（中立な経過段階）。履歴が無ければ `unknown`（捏造しない）。個人実績学習は L-9。

## 1. 設計判断（前提を疑った結果）
- **固定間隔の罠**: 美容周期は個人差・変動大。→ L-2 は default 間隔のみ持ち、**個人学習は L-9 が default を override** する構造。
- **due を断定しない**: status = 中立な経過段階（within_typical/nearing/beyond_typical/well_beyond）。「行くべき」は L-3 が文脈統合で判断。
- **unknown を許す**: lastCompletedAt 無し／異常（未来日・不正 ISO）→ `unknown`。本流 R1-5「completed=unknown・捏造しない」を継承。
- **pure・deterministic**: `Date.now`/argless `new Date()` 不使用。`now` を引数注入。`Date.parse(iso)` のみ使用。

## 2. スコープ
**作る**: cadence spec 型 + MVP 定数（beauty_salon:cut/color・eyebrow）+ 経過計算 pure helper。
**作らない**: 個人実績からの間隔学習（L-9）/ 候補化「何が due か」(L-3) / イベント前倒し(L-4) / 天気・移動・予算統合(L-3・横) / 全カテゴリの cadence（MVP のみ・他は L-1 に語彙だけ）。

## 3. 型骨格（実装 `lib/lifeops/cadence-model.ts`）
```ts
import type { LifeOpsCategoryId } from "./category-model";

/** 美容院の menu 別 sub-cadence（L-1 申し送り）。他カテゴリは menu=null。 */
export type BeautyMenu = "cut" | "color" | "treatment";

/** 経過段階（**中立**・締切でない）。unknown=履歴なし/異常で断定しない。 */
export type CadencePhase = "unknown" | "within_typical" | "nearing" | "beyond_typical" | "well_beyond";

/** カテゴリ(×menu)の標準周期 spec（default・個人学習は L-9 が override）。 */
export interface CadenceSpec {
  readonly categoryId: LifeOpsCategoryId;
  readonly menu: BeautyMenu | null;
  readonly typicalIntervalDays: number; // 標準周期（default）
  readonly nearingRatio: number;        // この比率で nearing（例 0.8）
  readonly beyondRatio: number;         // この比率で beyond_typical（例 1.0）
}

/** 経過の観測（**事実のみ**・「やるべき」を持たない）。 */
export interface CadenceStatus {
  readonly phase: CadencePhase;
  readonly elapsedDays: number | null;     // 履歴なし→null
  readonly typicalIntervalDays: number;
  readonly ratio: number | null;           // elapsed/typical・履歴なし→null
}
```
helper（pure）:
- `cadenceKey(categoryId, menu)` → `"beauty_salon:cut"` 等。
- `getCadenceSpec(categoryId, menu?)` → spec | undefined。
- `listMvpCadences()` → MVP spec 一覧。
- `daysBetween(fromISO, toISO)` → 日数（floor・NaN→null）。
- `computeCadenceStatus(spec, lastCompletedAtISO|null, nowISO)` → CadenceStatus。

## 4. MVP cadence 定数（A.2 + 一般周期リサーチ・default）
| categoryId | menu | typicalIntervalDays | nearingRatio | beyondRatio |
|---|---|---|---|---|
| beauty_salon | cut | 42（6週） | 0.8 | 1.0 |
| beauty_salon | color | 56（8週） | 0.8 | 1.0 |
| eyebrow | null | 28（4週） | 0.8 | 1.0 |

（カラー>カット>眉。treatment/nail/脱毛等は後続で追加・L-1 に語彙はある）

## 5. phase 計算（断定しない・unknown 優先）
```
lastCompletedAt null / 不正 ISO / 未来日(elapsed<0) → unknown（捏造しない）
ratio = elapsedDays / typicalIntervalDays
ratio < nearingRatio                         → within_typical
nearingRatio ≤ ratio < beyondRatio           → nearing
beyondRatio ≤ ratio < beyondRatio+0.5        → beyond_typical
ratio ≥ beyondRatio+0.5                       → well_beyond
```
`WELL_BEYOND_MARGIN=0.5`（カット 42日: beyond=42日/well_beyond=63日）。phase は経過の観測であり指示でない。

## 6. 厳守
- pure・no-DB・no-external-API・no-UI・新規データ収集なし・横エンジン非 import・barrel 非 export。
- **due/「行くべき」を断定しない**。履歴なし→unknown。個人 interval は L-9 が後で override（本 spec は default）。
- `now`/`lastCompletedAt` は **引数注入**（Date.now/argless Date 不使用）。

## 7. テスト（`tests/unit/lifeops/lifeOpsCadenceModel.test.ts`）
- MVP=3 cadence（beauty_salon:cut/color・eyebrow）・cadenceKey 整合・getCadenceSpec 未知→undefined。
- daysBetween: 正常/同日0/不正 ISO→null。
- computeCadenceStatus: lastCompletedAt null→unknown / 未来日→unknown / 不正 ISO→unknown。
- 段階境界: 30日(<0.8→within) / 35日(0.83→nearing) / 45日(>1.0→beyond) / 70日(>1.5→well_beyond)（cut 42日基準）。
- status は事実のみ（「やるべき」フィールドが無いこと＝型で保証）。

## 8. 次（停止ゲート）
L-2 着地 → **L-3 Candidate Engine の mini-design を提出して停止**。L-3 は「何が due か→`LifeOpsCandidate[]`」生成で、横 R2/R4 接続・体験直結のため **CEO/設計監査を挟む**（自律実装しない）。
