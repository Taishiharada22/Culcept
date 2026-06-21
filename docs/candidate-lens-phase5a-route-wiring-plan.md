# Candidate Lens P5-a — secondary query route 配線計画（計画のみ・未実装）

作成: 2026-06-21 / 状態: **計画のみ（route 実装・API追加呼び出し・secondary fetch 実行は未 GO）**
前段: P5-a pure helper `lib/plan/candidateLens/purposeQueryExpansion.ts`（commit `aaa71d70f`・dormant）
親計画: `docs/candidate-lens-phase5-purpose-aware-enrichment-plan.md` §P5-a

---

## 0. 中核制約（CEO 確定 2026-06-21）

- **secondary search は最大 1 回 / 検索実行（per /api/plan/places/search request）**。
  - ★「+1 回 / 候補」ではない。**候補ごとに secondary を回す設計は禁止**。
- secondary は **server の search route 内**で primary の後に「最大 1 回」だけ実行する。
  client（PlaceCandidatesPanel）や候補カード（②③）からは **一切 fetch しない**。
- 1 検索実行あたり外部呼び出しは **primary 1 + secondary 0〜1 = 最大 2 Text Search**。

---

## 1. 配線箇所（最小）

| 層 | 変更 | 備考 |
|---|---|---|
| `app/api/plan/places/search/route.ts` | ★ここだけ | primary 実行後、gate を満たせば secondary を 1 回・merge して返す |
| `lib/plan/candidateLens/purposeQueryExpansion.ts` | 既存 pure（変更なし） | `buildSecondaryQueries({lens, primaryQuery})` を route から呼ぶ |
| `lib/plan/placeSearchQueryBuilder.ts` | 変更なし | primary（地名+カテゴリ/予定名）は不変 |
| client（PlaceCandidatesPanel / CandidateLensPanel） | **変更なし** | 既存どおり /search を 1 回呼ぶだけ。候補ごとの fetch を足さない |

lens の導出は server で純粋に行う（`classifyPurposeLens` / 既存 `purposeLensFromSchedule` 相当）。
client は既に `title` を送っているため **新規入力・新規 client コードなし**。

---

## 2. primary / secondary の実行条件

### primary（現状どおり・不変）
- 既存フロー: auth → rate limit → `buildPlaceSearchQuery({title, locationText})` → `searchPlacesByText` 1 回。

### secondary（全条件 AND を満たした時だけ・最大 1 回）
1. **flag ON**（`isPurposeQueryExpansionEnabled()` = const flag && `NODE_ENV !== "production"`）
2. lens が purpose を持つ（`generic` でない）
3. `buildSecondaryQueries({lens, primaryQuery})` が **非空**（足せる設備語がある）
4. **primary 結果が「不十分」**（= `primary.length < SUFFICIENCY_THRESHOLD`）
5. primary が API 的に成功している（primary 自体が fail なら secondary を試みない）

→ 上記を 1 つでも欠けば **secondary をスキップ（primary のみ返す）**。

### SUFFICIENCY_THRESHOLD（primary 十分判定）
- 既定 = `MAX_RESULTS`（現行 5）。**primary が満枠（5 件）なら secondary を呼ばない**（slate が埋まっている）。
- tunable（環境定数）。下げるほど secondary 発火が減りコスト減・top-up 効果減。
- ★この v1 は **coverage top-up（primary が埋まらない時だけ補完）** に限定する。
  「dense area で generic を work-friendly に置き換える purpose 再ランク」は **v1 範囲外**
  （ranking 変更＝フィルターバブル/断定リスク → P5-d + explanation 層が前提）。

> CEO 質問「primary 結果が十分な場合は secondary を呼ばないか」への回答 =
> **はい。primary が SUFFICIENCY_THRESHOLD（既定=満枠5件）以上なら secondary を呼ばない。**

---

## 3. secondary を実行しない no-op 条件（まとめ）

- flag OFF / `NODE_ENV === "production"`
- lens = generic（secondary query なし）
- `buildSecondaryQueries` が `[]`（足せる語なし / 全語が primary に既出）
- primary が満枠（`>= SUFFICIENCY_THRESHOLD`）= 十分
- primary が空 query / ambiguous（そもそも primary を呼ばないケース）
- primary が API unavailable / throw（fail-open: primary 結果 or 空で返す）
- rate limit 超過（既存 429 経路では primary すら呼ばない＝secondary も当然なし）

---

## 4. secondary 結果の merge / dedupe

- **dedupe key = `placeId`**（Places の id）。
- **primary を先頭・順序不変**で確定（既存 ranking / P3-c 思想に整合・primary を裏で並べ替えない）。
- secondary 結果のうち **placeId が primary に未出のものだけ** を、primary の後ろへ追記。
- 追記後、**全体を `MAX_RESULTS`（5）で打ち切り**（primary が優先的に枠を占める）。
- `distanceMeters` は結果ごとに既存 haversine で算出済み（merge 後も一貫）。
- 並べ替え・スコア変更・推薦変更は **一切しない**（v1 は coverage 補完のみ）。

擬似:
```
primaryResults                       // 不変・順序保持
if (secondary gate 成立) {
  secondaryResults = searchPlacesByText(secondaryQuery)   // 1 回だけ
  seen = new Set(primaryResults.map(r => r.placeId))
  merged = [...primaryResults,
            ...secondaryResults.filter(r => !seen.has(r.placeId))]
  return merged.slice(0, MAX_RESULTS)
}
return primaryResults
```

---

## 5. Google Places Text Search 追加課金見積もり

- **追加呼び出し = secondary 1 回 / 検索実行（最大）**。SKU は primary と同じ **Text Search (New)**。
- 単価は **route 実装 GO 前に read-only 再確認**（P4-0 と同手法）。本計画では確定値を断定しない。
  - 参考: Text Search (New) は概ね $30〜$35 / 1000 requests レンジ（要確認）。Google の月 $200 無料枠あり。
- **増分の式**: `追加コスト ≈ (secondary 発火した検索回数) × 単価`。
  - secondary は「primary が満枠でない時だけ」発火 → 全検索の一部のみ。
  - 招待制少人数（≲20人）想定では、例えば月 1,000 検索・うち 30% で secondary 発火 = 300 secondary calls →
    最悪でも **数 $/月オーダー・無料枠内**。
- ★候補ごと fetch 設計なら候補数倍に膨らむが、**本設計は検索単位で最大 +1** ゆえコストは線形に小さい。
- budget guard: 既存 `enrichmentBudgetGuard.ts` と同型の **per-process カウンタ（分/日/月）** を secondary search にも適用検討（GCP quota が正本の安全網）。

---

## 6. fail-open

- secondary が throw / timeout（既存 placesApiClient の timeout 準拠）→ **primary 結果のみ返す**（request は失敗させない）。
- secondary が 0 件 → primary のみ（実質 no-op）。
- primary が fail → secondary を試みず、既存どおり空 + 友好メッセージ。
- ★secondary の失敗は **ユーザーに見えない**（静かに primary へ縮退）。

---

## 7. flag / production hard block / browse 禁止

- **flag default OFF**: `PURPOSE_QUERY_EXPANSION_ENABLED = false`（P5-a で既設・dormant）。
- **production hard block**: `isPurposeQueryExpansionEnabled()` が `NODE_ENV !== "production"` を必須。
  本番有効化は P4 同様の **二重スイッチ（const flag true かつ専用 env `..._PROD_ALLOWED=1`）** を別 GO で導入予定（本計画では未導入）。
- **browse 中 / 候補ごとの fetch 禁止**:
  - secondary は **server search route 内のみ**・**1 検索実行に最大 1 回**。
  - ①②③ の UI・候補カード・enrichment（P4 Details）経路には **secondary search を一切足さない**。
  - client に新しい fetch を追加しない（既存 /search 呼び出し回数も増やさない）。

---

## 8. tests / smoke

### unit（fake places client 注入・実 API 不叩き）
- flag OFF → secondary を呼ばない（adapter 呼び出し = primary 1 回のみ）。
- generic lens / secondary query 空 → secondary なし。
- primary 満枠（5 件）→ secondary なし（sufficiency gate）。
- primary < threshold → secondary 1 回・**adapter 総呼び出し ≤ 2**（候補ごと fetch でないことを呼び出し回数で保証）。
- merge/dedupe: placeId 重複を除外・primary 順序不変・`MAX_RESULTS` で打ち切り。
- fail-open: secondary throw → primary のみ返す（request 成功）。
- secondary が呼ばれても **primary の並び・推薦は不変**。

### smoke（dev・flag ON・実 API 最小）
- 1 検索で network を観測し、**Text Search 呼び出しが最大 2（primary+secondary）**であることを確認。
- 候補を ①②③ で操作しても **追加の search が発生しない**（候補ごと fetch ゼロ）。
- secondary 由来候補が primary の後ろに merge され、重複なし・5 件上限。
- key が response/ログに出ない（既存 P4 grep test 流用）。

---

## 9. rollback

- **flag OFF で即座に primary-only（現行挙動）へ復帰**。secondary は一切走らない。
- DB / migration / env 永続変更なし → undo 対象なし。
- production 二重スイッチ未導入のため、本番に出ることはない（NODE_ENV hard block）。

---

## 10. 実装分割（route GO 後の想定・本計画では未着手）

1. **R1**: route に secondary gate + 1 回呼び出し + merge/dedupe（fake client unit 完備・flag OFF 既定）。
2. **R2**: budget guard（secondary 用カウンタ）+ smoke（dev・呼び出し回数検証）。
3. **R3**: production 二重スイッチ（const + env）整備（本番 canary は別 GO・GCP quota 確認後）。

> 本計画は **計画のみ**。route 実装・Google Places 追加呼び出し・secondary fetch 実行・production 接続・
> env 編集・DB/Supabase・origin/main push はしていない。次は CEO の route 実装 GO（R1 から）判断待ち。
