# Life Ops L-9 — 結果→周期更新（cadence 学習）mini-design【pure 実装可・実データ源はゲート】

> 2026-06-09 / Life Ops 縦トラック（branch `claude/life-ops-vertical`）
> 参照: boundary §2 L-9 / Appendix A.7・A.12 / cadence-model(L-2 申し送り「個人学習は L-9 が override」)。
> **CEO 指示**: Life Ops 接続完了後の残りタスク。pure 実装が安全なら実装まで。実データ源・横接続前は停止。横非 import 継続。

---

## 0. 一行
**完了履歴**（注入）から**個人の実績間隔を学習**して L-2 の default 周期を override し、**最新完了日**を更新する pure 層。「観測→提案→許可→実行→**学習**」ループ（A.7）を閉じる。

## 1. 設計判断（捏造しない・頑健）
- **median で頑健**: gap（連続完了間の日数）の median を個人間隔とする（外れ値＝一度だけ早く行った等に強い）。
- **サンプル不足は学習しない**: gap < `MIN_LEARN_SAMPLES`(=2・完了3回未満) → `learnedIntervalDays=null`＝**default 維持**（L-2 unknown 精神＝捏造しない）。
- **pure・注入**: 完了履歴は注入（**実データ源＝CEO ゲート**は別 slice）。横エンジン非 import。`daysBetween`(L-2) 再利用・now 不要（履歴のみ）。

## 2. 型 / API（実装 `lib/lifeops/cadence-learning.ts`）
```ts
export interface CompletionEvent {
  readonly categoryId: string;
  readonly menu?: BeautyMenu | null;
  readonly completedAtISO: string;
}
export interface CadenceLearning {
  readonly lastCompletedAtISO: string | null;   // 最新完了日 → 次の CadenceObservation.lastCompletedAtISO
  readonly learnedIntervalDays: number | null;  // 実績間隔(median)・サンプル不足は null
  readonly sampleCount: number;                  // gap 数（学習に使った間隔の数）
}
export const MIN_LEARN_SAMPLES = 2; // gap≥2（完了3回以上）で学習
export function learnCadence(history: readonly CompletionEvent[]): CadenceLearning;
export function personalizeCadenceSpec(base: CadenceSpec, learning: CadenceLearning): CadenceSpec;
```

## 3. ロジック（pure）
```
learnCadence(history):
  valid = history で completedAtISO が parse 可 → 昇順 sort（不正は除外）
  if valid 空 → { lastCompletedAtISO:null, learnedIntervalDays:null, sampleCount:0 }
  lastCompletedAtISO = 最新（末尾）
  gaps = 連続完了の daysBetween（>0 のみ・同日0は除外）
  learnedIntervalDays = gaps.length ≥ MIN_LEARN_SAMPLES ? round(median(gaps)) : null
  sampleCount = gaps.length

personalizeCadenceSpec(base, learning):
  learnedIntervalDays が正の数 → { ...base, typicalIntervalDays: learnedIntervalDays }
  else → base（default 維持）
```
→ ループ: 完了履歴 → learnCadence → personalizeCadenceSpec(L-2 base) → computeCadenceStatus が**個人間隔**で経過判定 → 次回候補の精度向上。lastCompletedAtISO は次の observation に渡る。

## 4. 厳守 / 非スコープ
- pure・deterministic・**横エンジン非 import**・no-DB・no-UI・no-外部・**実データ源は注入**（収集は CEO ゲート）・barrel 非 export。
- **非スコープ**: 完了イベントの**実収集**（実データ源・CEO ゲート）・candidate 生成への自動配線（L-3 が personalized spec を使う統合は実データ後）・recency 重み付け（MVP は全 gap median）・横接続/UI。

## 5. テスト（`tests/unit/lifeops/lifeOpsCadenceLearning.test.ts`）
- learnCadence: 完了3回(gap2)→learnedInterval=median・lastCompletedAt=最新 / 完了2回(gap1)→null(default維持) / 空→全null / 不正ISO除外 / 外れ値に median 頑健。
- personalizeCadenceSpec: learnedInterval あり→typicalIntervalDays 上書き / null→base のまま。
- **ループ統合**: 完了履歴(間隔≈30日)→learn→personalize(cut base42→30)→computeCadenceStatus が個人間隔で phase 判定（default と異なる）。
- pure（同入力同出力）。

## 6. 停止
L-9 pure 着地後、**完了イベントの実収集（実データ源）/ L-3 への personalized spec 自動配線 / 横接続** に入る前は停止（CEO ゲート/実データ後）。
