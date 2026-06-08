# Place Affinity P5.3 shadow ranking 検証（pure・未適用）+ P6 ranking-反映 mini-design

> 2026-06-09 / Build Unit / P5.3=shadow 検証 engine（適用しない・pure・着地）／ P6=ranking 実反映 mini-design（★実装は stop gate）。

---

## P5.3 — shadow ranking 検証（実装・pure・未適用）
A1 の「activate 前に shadow で検証」playbook を place ranking に適用。P4 combiner が候補をどう並べ替える **であろうか** を **適用せず** 算出し、一般則順との差分を計測する。

- `placeAffinityShadowRanking.ts`: `buildShadowRanking(inputs, {p2, p3?}, config)` → `{generalOrder, combinedOrder, orderChanged, changedPositionCount, maxRankShift, personalAppliedCount}`。
- ★**適用しない**: 分析のみ。候補の実順序を変えない。combiner は P4（bounded nudge≥0・clamp maxNudge=0.25）。
- 検証点: `maxRankShift` が clamp で**小さく**保たれること（personal が暴れて大きく並べ替えない＝over-personalization防止の数値的確認）。
- pure / 新規データなし / belief 非汚染 / 座標・住所・raw 値なし。5 tests・tsc footprint 0。

## ★安全境界
- ranking を **実際に変えない**（戻り値は検証情報のみ）。UI なし・DB なし・external なし・flag 不要（pure・未配線）。

---

## P6 — ranking 実反映 mini-design（★実装は stop gate・CEO 判断）

### 目的
shadow で検証した P4 combiner の並べ替えを、場所候補の **実順序** に反映する（personal が familiar/condition-fit を穏やかに上位へ）。

### 段階設計（安全順）
1. **P6-0 shadow 観測**（dev-only・任意）: PlaceCandidatesPanel で `buildShadowRanking` を flag ON 時のみ console.debug（A1-8 pattern・UI なし・順序不変）。実データで「どれだけ並べ替わるか」を観測。
2. **P6-1 ranking 実反映**（★stop gate）: 候補の実順序を combinedOrder に。**候補挙動が変わる** → user-facing UI stop gate。専用 flag（default OFF・dev-only）+ branch + 実機 smoke + CEO 判断。

### 反映時の安全装置（P4 から継承）
- bounded nudge≥0（未訪問を罰しない＝探索を潰さない）・clamp（明確 general 勝者を覆さない）・sufficient gate（薄いデータは general-only）。
- shadow（P5.3）で maxRankShift が小さいことを **事前検証**してから反映。
- reason（P5.x）と整合（上位に来た理由を「よく行く/この時間帯に選ばれやすい」で説明）。

### ★stop gate（実装はここから先）
- **ranking 実反映＝候補挙動が変わる**＝user-facing UI stop gate（CEO 判断・branch+smoke）。
- DB / production / external / 予約 / 通知 / Reality apply / raw GPS 等保存 も stop gate。

→ P6 は **mini-design で停止**。shadow 観測(P6-0)は dev-only console なら safe だが、ranking 実反映(P6-1)は CEO 判断。

---

## 次（自律候補）
P6-0 shadow 観測（dev console・順序不変・safe）の実装、または reason-only 層の hardening。ranking 実反映は CEO 判断まで停止。
