# Phase 3-M Readiness Audit (= Day Feasibility Truth Layer、 M-1 連続 GO 判定)

**作成日**: 2026-05-23
**承認**: CEO + GPT 合議 (= 2026-05-23 Phase 3-L 一旦完了判断後、 「Deploy 撤回、 Phase 3-M readiness audit に進む、 audit 結果が low-risk なら M-1 連続実装 OK」 指示)
**範囲**: Phase 3-M の **責務定義** + L との境界 + Arrival Risk との分離 + 表記規約 + M-1 最小 scope 判定 + STOP 条件

> 本 audit は **docs only**。 M-1 (= pure types + helper + contract + tests) が low-risk 確認できれば連続実装に進む。
> 危険境界 (= UI / DB / Arrival Risk / 文言違反) で停止。

---

## 0. ゴールから逆算 (= 上位思想の確認)

| Layer | 責務 | 状態 |
|---|---|---|
| K = 時間構造の観測 (= computed projection) | DayGraph、 anchor 表記 | 完了 |
| L = 移動の観測 (= Mobility Truth Layer) | overlay、 「移動 約 N 分」 | 完了 (= L-4d-b2 まで) |
| **M = 余白 / 不足の観測 (= Feasibility Truth Layer)** | **本 audit 対象** | 着手前 |
| N = 複数日 pattern 観測 (= Pattern Truth Layer) | 別 phase | 未着手 |

**最終ゴール**: Aneurasync 「自分って、 そういう人間だったのか」 体験
- 観測 layer の積み重ねで、 ユーザーが自己の傾向に気付く
- 推奨 / 警告 / 評価 は永続禁止 (= ユーザー自身が判断する thread)

---

## 1. Phase 3-M の正確な責務 — Day Feasibility Truth Layer

### 1.1 M の core 責務

**Day Feasibility = 各 transition の前後 anchor 間「余白 / 不足」 の観測**

具体例:
- 「10:00-11:00 ショッピング」 と「12:50-13:50 ロイヤルホスト」 の間に、 移動 90 分が必要
- 余白 = 12:50 - 11:00 = 110 分
- 不足 = 110 - 90 = +20 分 (= 余裕)
- 又は移動が 120 分なら 110 - 120 = -10 分 (= 不足)

M は **観測のみ**:
- ✅ 「余白 50 分」 「不足 40 分」 (= 量的中立表記)
- ❌ 「ギリギリ」 「危険」 「快適」 「お急ぎ」 (= 質的評価)
- ❌ 「遅刻リスク」 「警告」 「推奨」 (= 評価 / 推奨)

### 1.2 Arrival Risk との **明示分離** (= 永続禁止と整合)

| 項目 | Day Feasibility (= M) | Arrival Risk (= 永続禁止) |
|---|---|---|
| 出力 | 「余白 N 分」 「不足 N 分」 | 「遅刻リスク 70%」 「危険度 High」 |
| 性質 | 量的中立表記 | 評価 / 確率 / 警告 |
| 思想 | 観測のみ (= 整合) | 推奨 / 警告 (= 永続禁止) |
| ユーザー判断 | 自分で観測結果を解釈 | システムが判断を提示 |

**M は Arrival Risk ではない**。 「余白の表記」 と「リスクの評価」 は本質的に異なる concept。

### 1.3 Counterfactual との分離

| 項目 | Day Feasibility (= M) | Counterfactual (= 別 system) |
|---|---|---|
| 観測対象 | 現在の 1 日構造 | 「もし違う選択をしたら」 |
| 出力 | 既存 anchor / 移動の余白 | 反事実シナリオの差分 |
| 思想 | 観測 (= 整合) | 推奨に近づく (= 思想的距離あり) |

**M は Counterfactual ではない**。 反事実シナリオ生成は M 範囲外。

### 1.4 Pattern Observation との分離 (= 単日 / 複数日)

| Phase | 観測 scope |
|---|---|
| **M** | **単一日**の余白 / 不足 |
| **N** | **複数日**の pattern (= 「いつも移動が長い火曜日」 等) |

M は **単日継承** (= K / L と同じ単日 scope)。 複数日集計は N 以降。

---

## 2. L との境界

### 2.1 L = Mobility Truth、 M = Feasibility Truth

| 項目 | L (= Mobility Truth) | M (= Feasibility Truth) |
|---|---|---|
| 観測対象 | 「移動が確定したか / 確定していないか」 | 「移動と予定の余白 / 不足」 |
| 入力 | DayGraph + coords | DayGraph + L overlay result |
| 出力 | 「移動 約 N 分」 / 「→ 移動」 / 「移動」 | 「余白 N 分」 / 「不足 N 分」 / 「該当なし」 |
| 計算 | provider cascade + overlay | 前後 anchor time - 移動 duration |
| layer | overlay (= K の影) | overlay の上の更なる観測層 |

### 2.2 M は L の output を input にする

```
K phase: buildDayGraph → DayGraph (= 時間構造)
        ↓
L phase: resolveMovementSegmentOverlay → OverlayResult (= 移動観測)
        ↓
M phase: computeDayFeasibility → DayFeasibilityResult (= 余白観測)
```

これは **K → L → M の自然な責務継承**。 M は L の不変条件を尊重し、 既存 file を改変しない。

### 2.3 既存 L type の活用

L-1 で `MovementSegmentResolved.slackAnalysis?` field が既に予約済:
```typescript
readonly slackAnalysis?: {
  readonly availableMin: number;
  readonly durationMin: number;
  readonly utilization: number;
};
```

但し L-3c で OverlaySegmentView に sanitize した時点で `slackAnalysis` は **OverlaySegmentView から削除**された (= L-3c sanitize の対象)。 つまり M-1 は overlay output から slack を再計算する必要がある (= overlay の MovementSegmentResolved 内部 field は OverlaySegmentView では露出していない)。

→ M-1 は **既存 L overlay output + DayGraph anchor times** から余白を計算する pure helper を実装する。 L type 改変なし。

---

## 3. 表記規約 (= 永続)

### 3.1 OK 文言 (= M output に許容)

- 「余白 N 分」 (= sufficient case)
- 「不足 N 分」 (= insufficient case)
- 「該当なし」 (= not_applicable case)

### 3.2 NG 文言 (= 永続禁止、 L-4b NG list 継承 + M 拡張)

- 「ギリギリ」 「余裕あり」 「余裕なし」 (= 質的評価)
- 「快適」 「便利」 「最適」 (= L-4b optimization 文言)
- 「注意」 「警告」 「危険」 「リスク」 (= L-4b warning 文言)
- 「遅刻」 「遅延」 「焦って」 (= 推奨 / 警告に近接)
- 「お急ぎ」 「早めに」 「余裕」 「急いで」 (= L-4b urgency 文言)
- 「歩いて」 「車で」 等の mode 表示 (= L-4 範囲外)
- 「○ km」 等の distance 表示 (= L-4 範囲外)

### 3.3 中立表記の徹底

- ✅ 数値 (= 「N 分」)
- ✅ 中立カテゴリ (= 「該当なし」)
- ❌ 形容詞 (= 「ギリギリ」 「快適」)
- ❌ 感情表現 (= 「不安」 「安心」)
- ❌ 動詞命令形 (= 「急いで」 「待って」)

---

## 4. M-1 の最小 scope (= L-1 と対称、 連続 GO 判定)

### 4.1 M-1 着地物 (= 4 files + tests)

| File | 内容 |
|---|---|
| `lib/plan/feasibility/feasibilityTypes.ts` | pure type contract (= SlackStatus / FeasibilitySlackView / DayFeasibilityResult) |
| `lib/plan/feasibility/feasibilityIntegrityContract.ts` | 6 invariants + assert function |
| `lib/plan/feasibility/dayFeasibilityComputation.ts` | pure helper (= computeDayFeasibility) |
| `tests/unit/plan/feasibilityTypesAndContract.test.ts` | types + contract test |
| `tests/unit/plan/dayFeasibilityComputation.test.ts` | helper test (= K fixtures + L overlay 統合) |

### 4.2 type 設計案

```typescript
/**
 * Slack status — observation only。 3 状態。
 */
export type SlackStatus =
  | "sufficient"       // 余白あり (= availableMin >= durationMin)
  | "insufficient"     // 不足あり (= availableMin < durationMin)
  | "not_applicable";  // 計算不能 (= unresolved transition / 前後 time 不明)

/**
 * 単一 transition の slack observation (= PII-free)。
 */
export interface FeasibilitySlackView {
  readonly transitionIndex: number;
  readonly status: SlackStatus;
  /** 余白 (分)、 sufficient case のみ */
  readonly slackMin?: number;
  /** 不足 (分)、 insufficient case のみ */
  readonly shortfallMin?: number;
}

/**
 * 1 日全体の feasibility result。
 */
export interface DayFeasibilityResult {
  readonly feasibilityByTransitionKey: ReadonlyMap<string, FeasibilitySlackView>;
  readonly counts: {
    readonly sufficient: number;
    readonly insufficient: number;
    readonly notApplicable: number;
  };
}
```

### 4.3 helper 設計案

```typescript
/**
 * DayGraph + OverlayResult から DayFeasibilityResult を計算する pure helper。
 *
 * Step (= per transition):
 *   1. overlay segment が unresolved → status "not_applicable"
 *   2. resolved な場合:
 *      a. transition の fromNodeId / toNodeId に対応する EventNode を graph から取得
 *      b. 前 EventNode の endTime と 次 EventNode の startTime を分換算
 *      c. availableMin = next startMin - prev endMin
 *      d. durationMin = overlay segment の estimatedDurationMin (= MovementSegmentResolved 内部 field から取得)
 *      e. slack = availableMin - durationMin
 *      f. status / slackMin / shortfallMin を計算
 *
 * 副作用なし、 input mutation なし、 deterministic。
 *
 * 注: overlay の OverlaySegmentView は estimatedDurationMin を含む (= L-4a で確認済)。
 *      但し L-3c sanitize で fromNodeId / toNodeId は OverlaySegmentView に出ない。
 *      → helper は別 path で transition の anchor を取得する必要あり。
 *      解決策: caller が parallel に DayGraph.transitions を渡す前提。
 */
export function computeDayFeasibility(
  graph: DayGraph,
  overlayResult: OverlayResult,
): DayFeasibilityResult;
```

### 4.4 contract assertion 6 invariants

1. `sufficientHasSlackMin`: status sufficient → slackMin >= 0
2. `insufficientHasShortfallMin`: status insufficient → shortfallMin >= 0
3. `notApplicableHasNoFields`: status not_applicable → slackMin / shortfallMin 不在
4. `transitionIndexIsFinite`: transitionIndex は finite non-negative integer
5. `countsSumEqualsSize`: counts 和 === feasibilityByTransitionKey.size
6. `noPiiInFeasibilityResult`: result に anchor id / locationText 等 PII field 不在

NG 文言 grep guard:
- displayText 等の文言 field は M-1 に存在しない (= 数値のみ output)
- UI 接続時 (= M-2 以降) に NG grep を追加

---

## 5. STOP 条件 (= 連続 GO 着手前 必須クリア)

| STOP 条件 | M-1 範囲 |
|---|---|
| UI 変更が必要 | ❌ 不要 (= pure data) |
| Arrival Risk Memory が必要 | ❌ 不要 (= Feasibility ≠ Arrival Risk) |
| DB / env / package / dependency が必要 | ❌ 不要 |
| warning / recommendation / optimization 文言が必要 | ❌ 不要 (= 数値のみ output) |
| localStorage が必要 | ❌ 不要 |
| Routes API / 新 geocode が必要 | ❌ 不要 (= 既存 L overlay output を input) |
| K phase types / buildDayGraph 改変が必要 | ❌ 不要 (= 読み取りのみ) |
| L-1 type 改変が必要 | ❌ 不要 (= 読み取りのみ) |

→ **全 8 STOP 条件未抵触**。 M-1 連続実装 GO 判定成立。

---

## 6. UI 方針 — M-1 は UI なし

- **M-1**: pure data layer のみ (= MapTab / Calendar / Flow に表示しない)
- **M-2 以降** (= 別 readiness audit): UI 接続検討
- いきなり「不足 N 分」 を UI に出さない (= ユーザーに圧を与える可能性、 慎重に設計)

UI 接続時の方針 (= M-2 readiness audit で詳述):
- K-3c-iii 階層を侵さない
- 「不足 N 分」 を amber / red で表示しない (= 警告色禁止)
- slate 系で中立表示
- 「文言」 ではなく **数値のみ**で表現

---

## 7. Privacy / Safety

### 7.1 ユーザーへの圧を避ける表記

- 「ギリギリです」 「遅刻します」 → 禁止
- 「余裕あり」 「リラックスできます」 → 禁止
- 「余白 50 分」 → ✅ 中立
- 「不足 10 分」 → ✅ 中立 (= 但し UI 表示は慎重に)

### 7.2 Sensitive 予定の前後

- L-3c で sensitive transition は overlay で必ず unresolved
- M-1 はこれを `not_applicable` として処理
- 「sensitive 予定の前後で何分余白があるか」 等の出力は **しない** (= privacy-first)

### 7.3 Telemetry / Memory / localStorage

- M-1 では一切使わない (= 永続禁止 + CEO 後回し方針)
- type 定義 / passthrough も M-1 では不要 (= M-2+ で検討)

---

## 8. 革新的アイデア (= 自律推論で導出、 人間超越設計)

### 8.1 革新 1: 「観測層 3 段構造」 思想の確立

K / L / M で **「Day Observation Truth Stack」** を形成:
```
K = 時間構造観測   (= 「時刻 X に予定 Y」)
L = 移動観測       (= 「予定 Y → 予定 Z に移動 約 N 分」)
M = 余白観測       (= 「予定 Y と Z の間に余白 N 分」)
```

各層は「観測のみ」、 推奨 / 警告は永続禁止。 ユーザーは積み重ねた観測を見て自分で判断 → Aneurasync 中心問いへの接続。

### 8.2 革新 2: 「対称性 = 開発の予測可能性」

L-1 と M-1 を同 pattern で実装することで:
- 新 dev / 別 session の学習コスト低
- 将来の N / O の拡張も同 pattern
- 「pure types + helper + contract + tests」 が **「観測層」 の標準 template** になる

### 8.3 革新 3: 「negative / positive 両側を中立表記」

- 余白 (= positive、 「+ N 分」)
- 不足 (= negative、 「- N 分」)
- 該当なし (= unresolved)

**「不足」 と表記しても警告ではない**。 これは「観測のみ」 を厳密に守る方法:
- 「不足 40 分」 は事実の表記であり、 解釈はユーザーに委ねる
- システムは「だから急げ」 「危険だ」 と言わない

### 8.4 革新 4: 「単独 transition でも 1 日全体でも観測可能」

M-1: **transition-level のみ**
- 1 transition (= 移動 1 つ) の余白 / 不足

M-2+ で検討可能:
- day-level (= 1 日の合計余白 / 合計不足)
- 但し集計に近づくため思想的検討必要

### 8.5 革新 5: 「M helper は overlay output だけでは足りない」 発見

L-3c sanitize で OverlaySegmentView から `estimatedDurationMin` / `transitionIndex` は残ったが、 `fromNodeId` / `toNodeId` は削除された。

→ M-1 helper は **DayGraph.transitions** から fromNodeId / toNodeId を読み、 graph.nodes から EventNode の時刻を取得する path が必要。 これは privacy structural を維持しつつ可能 (= caller は overlay と graph を両方持っている)。

これは「**L-3c sanitize 維持 + M-1 計算成立**」 の両立を意味する革新的な設計判断。

### 8.6 革新 6: 「Feasibility は L overlay の resolved 上にのみ意味がある」

unresolved transition は feasibility 計算不能:
- 移動 duration 不明 (= L overlay が unresolved)
- 前後 anchor 時刻不明 (= K phase で endTime / startTime 不在)

→ M-1 は **「not_applicable」 状態を first-class** として扱う (= L-1 unresolved と整合)。

### 8.7 革新 7: 「Feasibility は per-transition Negative Capability の延長」

K phase Negative Capability:
- 「移動」 を勝手に解釈しない (= 「→ 移動」 固定)

L phase Negative Capability:
- 「移動の確信度」 を勝手に格付けしない (= confidenceBand 二値、 mode 推定 0)

**M phase Negative Capability** (= 本 audit で提唱):
- 「余白の質」 を勝手に評価しない (= 「ギリギリ」 等の評価語禁止)
- 「不足」 を「警告」 に変換しない
- ユーザーが余白を見て自分で判断する thread を尊重

---

## 9. M / N 以降の分離 (= 永続規約)

| Phase | 責務 | 思想整合性 |
|---|---|---|
| **M** | **単日の余白 / 不足観測** (= Feasibility Truth Layer) | ✅ 観測のみ |
| N 候補 1 | 複数日 pattern 観測 (= Pattern Truth Layer) | ✅ 観測のみ (= 設計次第) |
| N 候補 2 | telemetry sink (= L-4e) | 設計次第 (= privacy 直結) |
| 永続禁止 | Arrival Risk Memory | ❌ 評価 / 警告 |
| 永続禁止 | Counterfactual generation | 推奨に近づく |
| 永続禁止 | mode 推定 / Routes API | 既存禁止境界 |

---

## 10. 実装可能 low-risk 範囲 (= M-1 連続 GO 判定)

| 項目 | 着手 |
|---|---|
| pure types (= feasibilityTypes.ts) | ✅ |
| pure helper (= dayFeasibilityComputation.ts) | ✅ |
| contract assertion (= feasibilityIntegrityContract.ts) | ✅ |
| tests (= types + contract + helper + integration) | ✅ |
| ❌ UI 変更 | NO |
| ❌ DB / env / package / dependency 変更 | NO |
| ❌ localStorage / runtime telemetry sink | NO |
| ❌ Arrival Risk Memory | NO |
| ❌ K phase / L-1 types 改変 | NO (= 読み取りのみ) |
| ❌ warning / recommendation / optimization 文言 | NO |
| ❌ mode 推定 / Routes API | NO |

→ **M-1 連続実装 GO 判定 成立**。

---

## 11. CEO 判断ポイント (= 本 audit 着地後)

| Q | 内容 | 自律推奨 |
|---|---|---|
| Q1 | M の責務を「Day Feasibility Truth Layer」 と定義する | **YES** |
| Q2 | Arrival Risk と Day Feasibility の明示分離を永続規約化 | **YES** |
| Q3 | M-1 (= pure types + helper + contract + tests) の連続実装 | **YES** (= low-risk 判定) |
| Q4 | M UI 接続は M-2 以降 (= 別 readiness audit) | **YES** |
| Q5 | M-1 内の low-risk 作業は連続実装で進めてよい | **YES** |

---

## 12. 永続禁止 (= 本 audit 以降に維持)

❌ M で Arrival Risk Memory / Arrival Risk 評価
❌ M で warning / recommendation / optimization / urgency 文言
❌ M で 「ギリギリ」 「快適」 等の質的評価語
❌ M で UI 表示 (= M-2 以降は別 audit)
❌ M で DB / env / package / dependency 変更
❌ M で localStorage / runtime telemetry sink
❌ M で Counterfactual / mode 推定 / Routes API
❌ K / L 既存 types 改変
❌ frozen branches への commit (= 36 branches)
❌ fetch / push / gh
❌ reset / restore / stash / branch delete

---

## 13. 関連 docs

- `docs/alter-plan-phase3-l-completion-judgment-plan.md` (= Phase 3-L 一旦完了判断、 M は次 phase)
- `docs/alter-plan-phase3-l-closeout-overview.md` (= L 全体 1 doc 整理)
- `docs/alter-plan-phase3-l-transport-design.md` v0.2 (= L 全体設計)
- `docs/decision-log.md`

---

## 14. 思想 transmission (= M readiness audit から学ぶ)

1. **観測層 3 段構造** — K / L / M で「観測のみ」 を積み重ね
2. **対称性 = 開発の予測可能性** — L-1 と M-1 を同 pattern で実装
3. **Arrival Risk と Feasibility の明示分離** — 永続禁止と整合
4. **「不足」 も中立表記** — warning ではない、 観測の表記
5. **M phase Negative Capability** — 余白の質を評価しない、 ユーザーに委ねる

---

## 15. 着地状態 + freeze 確定

本 commit 着地と同時に `docs/plan-phase3-m-readiness-audit` を **frozen 扱い** (= 37 frozen branches 計、 以後 commit 禁止)。

次は M-1 実装 branch を別途切り、 audit 結論 (= low-risk 連続 GO) に従って実装着手。

---

## 16. 結語 — Phase 3-M の意義

Phase 3-M = **Day Feasibility Truth Layer** = K + L の観測層の上に「予定間の余白 / 不足」 を観測する自然な拡張。

- Aneurasync 思想に整合 (= 観測のみ)
- L との境界明確 (= 単日 transition の余白)
- Arrival Risk から明示分離 (= 永続禁止枠を侵さない)
- L-1 と対称な実装 pattern (= 開発予測可能)

**M-1 連続実装 GO 判定 成立**。 次は実装 branch + types/helper/contract/tests を実装。
