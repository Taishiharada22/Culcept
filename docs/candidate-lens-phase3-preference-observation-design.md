# Candidate Lens Phase 3 — Preference 観測・保存 設計（docs-only / 実装は段階 GO）

> 2026-06-16 / Build Unit / CEO 指示。ユーザーが候補を選んだ瞬間を観測し、「このユーザーが何を基準に場所を選ぶか」を学習して
> 比較レンズの**行順をユーザー別に変える**（= Aneurasync 独自の記憶）。Phase 1/2 を壊さず、観測のみ・local-only・捏造なし。

## 0. 思想（Phase 1〜2 と一貫）
- Phase 1 で `userPlacePreference.ts`（`UserPlacePreference` 型 + `applyPreferenceToAxes`）を **interface だけ**用意済み。Phase 3 は
  そこへ**実データを供給する観測層**を作る。
- **観測のみ・捏造しない**: 推定で水増ししない。選択という確かな行動だけを根拠にする。
- **local-only・段階 GO**: 記録は localStorage（versioned）。DB / 外部 API / 一斉処理なし。実保存・resolver 配線は CEO の段階 GO。

## 1. 何を記録するか（CEO の 6 観点 → PreferenceObservation）
| CEO の観点 | フィールド | 導出（honest・pure） |
|---|---|---|
| どの目的レンズだったか | `lens: PurposeLens` | `purposeLensFromSchedule(title)` の結果 |
| どの候補を選んだか | `selectedPlaceKey: string` | `normalizeLocationText(canonicalText)`（既存 util・raw 名は保存せず key 化） |
| どの比較軸が効いたか | `decisiveAxes: AttributeKey[]` | §3 の導出。compare からは「選択側が勝った軸」、browse/detail からは候補の最強 honest シグナル |
| 駅近を選んだのか | `signals.proximityWeighted: boolean` | `walk_estimate` が比較で勝ち or 距離が相対的に近い |
| 余白重視だったのか | `signals.marginWeighted: boolean` | `schedule_fit`/`margin_impact` が効いた（gap 配線時のみ true になりうる） |
| 過去に選んだ場所を再選したのか | `signals.reselectedKnown: boolean` | `affinityBadge != null`（= Place Affinity に観測履歴がある）＋ 過去 observation に同 key |
| （補助）どの画面から選んだか | `choiceContext: "browse"\|"detail"\|"compare"` | onSelect 呼出し元 |
| （補助）対立候補があったか | `comparedAgainstKey?: string` | compare 時の相手候補 key |

```ts
interface PreferenceObservation {
  readonly lens: PurposeLens;
  readonly selectedPlaceKey: string;          // normalize 済（PII/raw 名でない）
  readonly decisiveAxes: readonly AttributeKey[];
  readonly choiceContext: "browse" | "detail" | "compare";
  readonly comparedAgainstKey?: string | null;
  readonly signals: { proximityWeighted: boolean; marginWeighted: boolean; reselectedKnown: boolean };
  readonly at: number;                         // epoch ms（呼び側が stamp・pure 層は受け取るだけ）
}
```

## 2. どこで発火するか（既存 onSelect に薄く相乗り）
- `CandidateLensPanel` の確定経路（① card / ② detail / ③ compare の `onSelect(candidate)`）で、選択直前の文脈
  （lens・current view・compareIndex・comp.mainRows・各 view の attrs）から `PreferenceObservation` を**組み立てて**
  `recordPreferenceObservation(obs)` に渡す（fire-and-forget・本人 UI を遅延させない）。
- flag OFF/production では従来どおり何もしない（観測層も flag gate 下）。

## 3. decisiveAxes / signals の導出（pure・新規 `candidateLensPreferenceObs.ts`）
```ts
buildPreferenceObservation(input: {
  lens; selectedView; otherView?; comparison?;   // ③ なら comparison/otherView あり
  choiceContext; at;
}): PreferenceObservation
```
- **compare 経路**: `comparison.mainRows` のうち `selected` 側 cell が `isBest` の `row.key` を `decisiveAxes` に。
  recommendation があれば `recommendation` の basis も合流（重複排除）。
- **browse/detail 経路**（対立候補なし）: 候補が持つ honest シグナルの中で「選好を最も示すもの」を 1〜2 個:
  `walk_estimate` 値あり → `walk_estimate`、`affinityBadge` あり → `affinity_reason`、gap で `schedule_fit`/`margin_impact` 値あり → それ。
- `signals.proximityWeighted = decisiveAxes.includes("walk_estimate")`。
- `signals.marginWeighted = decisiveAxes.some(k => k==="schedule_fit"||k==="margin_impact")`。
- `signals.reselectedKnown = selectedView.affinityBadge != null`。
- **捏造しない**: 値の無い軸は decisive にしない（compare の dimmed 未確認行は対象外）。

## 4. 集計 → UserPlacePreference（pure・sufficient-gate）
- `accumulatePreference(observations): UserPlacePreference`
  - 各 `AttributeKey` に decay 付きスコア（新しい観測ほど重い・`at` で半減）。lens 別にも集計。
  - **sufficient-gate**: 総観測 < `MIN_OBS`（例 5）の lens は preference を出さない（中立=既定軸順）。少数の偏りで断定しない。
  - 出力は Phase 1 の `UserPlacePreference`（`prioritizedAttributes` 全体 + `perLens` 別）。`applyPreferenceToAxes` がこれを消費し
    `LENS_AXES` を前方へ並べ替え → **③ の比較表の行順がユーザー別に変わる**（Aneurasync 独自の記憶）。

## 5. ストレージ（local-only・versioned・段階 GO）
- `candidateLensPreferenceStore.ts`: localStorage key `aneurasync.candidateLens.pref.v1`（versioned）。
  - `record`: 観測を append（直近 N=200 件で ring・古いものを落とす）。`load`: observations を返す。`derivePreference`: §4。
  - **raw place 名・住所・座標は保存しない**（normalize 済 key のみ）。PII なし。DB/network/外部 API なし。
- A1-8 の Place Affinity safety journal と同じく **shadow 観測から開始可能**（記録だけして resolver には供給しない段階を踏める）。

## 6. 段階 GO（実装の刻み）
1. **P3-a（pure 基盤・本書の GO で着手可）**: `candidateLensPreferenceObs.ts`（`buildPreferenceObservation`/`accumulatePreference`）+ test。**store なし・配線なし**。
2. **P3-b（観測記録 / shadow）**: `candidateLensPreferenceStore.ts`（localStorage record のみ）+ onSelect で fire-and-forget 記録。**resolver へは未供給**（shadow）。別 GO。
3. **P3-c（resolver 供給）**: `PlaceCandidatesPanel` が `derivePreference()` を `CandidateLensPanel` の `preference` prop に渡し、③ の `buildLensComparisonView(..., preference)` で行順反映。別 GO。

## 7. honesty / privacy（不変）
観測のみ（推定で水増ししない）・local-only・PII/raw 名を保存しない・sufficient-gate で少数断定を避ける・flag OFF/production では一切動かない・捏造ゼロ。

## ★stop gate
本書は設計。**実装は CEO の GO 後**。最小着手は P3-a（pure 観測ロジック + test・store/配線なし）。
