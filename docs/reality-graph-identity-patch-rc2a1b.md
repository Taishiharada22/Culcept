# RC2a-1b: Identity Patch（GPT 監査 12 点の裁定と修正）

- 日付: 2026-06-13 / 裁定サマリ: **採用 11 / 範囲確認 1（§12）**。うち §1 は**私の契約文書の論理バグを全面承認**して修正
- 優先順位: 本書 → RG0.6b → RG0.6a → RG0.6
- 実装範囲: docs patch + canonicalSerialize の fail-fast 化 + PredictionEntry 型修正 + fixture（許可リスト内）

---

## 1. SSC changeId の論理バグ修正（全面採用 — 自己訂正）

**RG0.6b §10-2 の「A→B / B→A / A→B は (prev,next) が異なる連鎖として区別される」は誤り**。1 回目と 3 回目は同一の (prev=A, next=B) であり同 id に衝突する。検証漏れのまま文書化した契約バグとして記録する。

修正後の正本:
```
changeId  = ssc:<subjectiveDate>:<targetNodeId>:<changeKind>:<sourceActionId>
sourceActionId = act:<subjectiveDate>:<ordinal>
  …UI gesture 時点で per-day 永続 monotonic counter から採番し、entry と**同時保存**
  （event log の ordinal が正本 — 再 derive で変わらない。乱数禁止は維持）
dedupeKey = <targetNodeId>:<changeKind>:<prevValueHash>:<nextValueHash>:<sourceActionId>
  …valueHash は dedupe **補助**であり identity の唯一根拠にしない
```

- 二重 submit（同一 gesture の replay/retry）は**同一 sourceActionId を運ぶ**ため自然に dedupe される
- ユーザーが一度戻して同じ値へ再操作するのは**別 gesture = 別 sourceActionId = 別 event**として正当に保持（「完全同一遷移の同分内反復は併合が正しい」という RG0.6b の断定を撤回 — 往復回数は迷い/decisionDebt の signal であり消してはならない）

## 2. FNV64 の使用境界（採用）

- **可**: snapshot memoization・揮発 cache key・redactedRefId
- **不可（hash 単独での同一性決定）**: PredictionLedger / SSC / learning / 永続 idempotency
- 永続 identity は **full payload を保存**する: PredictionEntryV0 は inputRevisionSet 全体 + derivationVersions 全体（manifest の複製）を本体に保持（id 内 hash は短縮 key にすぎない）
- 照合規律: hash 一致 → 必要に応じ canonical payload 比較で確証。**collision 時に別入力を同一予測として扱わない**

## 3. canonical serialization 仕様の確定（採用 — fail-fast 化）

| 項目 | 仕様 |
|---|---|
| object key | sort（昇順）・`undefined` 値の key は**除去**（欠落 ≡ absent。**absent ≠ null** — null は保持） |
| array | **順序保持・sort しない**（corrections[] の並びは意味を持つ）。要素 `undefined` は null 化 |
| number | finite double のみ。**NaN / ±Infinity は throw**（silent null 化の禁止 — 検証で "null" 崩壊を確認済み）。-0 は 0 に正規化（JSON 規約） |
| BigInt / Date / function / symbol | **throw**（Date は ISO string に変換してから渡す — オブジェクトのまま渡すと "{}" に崩壊するため禁止） |
| string | byte-wise 比較・**Unicode 正規化はしない**（上流が一貫したエンコードを供給する責務） |
| unknown vs 0 | RealityAttribute unknown は value:null であり 0 と常に区別される（既契約の確認） |

実装: `canonicalSerialize` に上記 throw guard を追加（壊れた入力で「静かに同じ revision」になるより fail-fast）。

## 4. DerivationVersionSet の bump 漏れ対策（採用）

- manifest は 1 ファイル集約済み（graphIdentity.ts）
- **規約追加**: RC2a-2 以降の各 derive 関数は自分の version const を export し、fixture が manifest との一致を assert する（例: `MOVEMENT_REALITY_COMPILE_VERSION === REALITY_DERIVATION_VERSIONS.movementRealityCompile`）。derive ファイルを変更したのに version 不変の場合の source guard（内容 hash 比較等の自動検出）は将来課題として docs 予約 — まず「export + 一致 fixture」の機械検証を各 slice の完了条件に含める

## 5. IANA timezone の過大実装回避（採用）

- **v0 実装は Asia/Tokyo のみ**（`makeRealityInstantJst` が唯一の factory）。他 timezone は型上の予約であり **unsupported — 黙って計算しない**（汎用 IANA 計算の中途半端な実装を禁止）
- Travel mode で timezone provider を正式導入するまで、新 factory の追加は別 GO
- browser local timezone の暗黙使用は永久禁止（再掲）

## 6. graphViewerKey は pseudonymous（採用 — 匿名と過信しない）

- graphViewerKey は **pseudonymous id であり匿名化ではない**。salt は client 到達コード内の固定値（`VIEWER_KEY_SALT`）= 推測可能であり、linkability は残る
- debug/log/cache に出す場合も**個人関連情報として扱う**（privacy boundary として過信しない。server-side secret salt の導入は将来課題）
- **権限判断には使わない**: per-viewer redaction / RLS の authority は常に auth user id（server 検証）。graphViewerKey は表示・cache の散文 key のみ

## 7. PredictionEntry の predictor 構造化（採用）

`predictedBy: "system"` を廃止し:
```ts
predictor: {
  kind: "heuristic" | "model" | "user_confirmed" | "mixed",
  version: string,             // 例: "dayState@v0"
  modelId: string | null,      // LLM/model 使用時のみ
  calibrationSource: string | null,  // B1 補正が効いている場合の出所
}
derivationVersions: DerivationVersionSet  // manifest 全体の複製（§2 — hash でなく full payload）
```

## 8. selfReportObservation の身分定義（採用）

T_freeze 後の補正は「今の実感の観測」でもある。三分する:
- **grading actual には使わない**（actual は NightCheck dayFelt のみ — 不変）
- **selfReportObservation として保持できる**（intervention evidence の下位分類: `kind: "self_report" | "other"`）— calibration（B1）には使える
- **UI には即時反映**（既実装: estimates 現在値の更新 — この身分整理で挙動は変わらない）

## 9. EnvironmentReality の field-level freshness（採用 — RG0.6b §8 の明確化）

- **各 field の RealityAttribute が自分の source/confidence/evidence/freshness を持つ**（weather=API/cache・daylight=solar 導出で常に fresh・severeWeather=alert 源）
- node-level freshness は **summary にすぎない**（API 系 field の fetch metadata の要約。daylight と結合しない）

## 10. redactedRefId の安定性契約（採用 — scope を裁定）

- `redactedRefId = rrx:<fnv64(viewerKey + dayScopeSalt + rawRef)>` — **scope = (viewer, subjectiveDate)**
  - 同一日の re-derive / graph 再構築をまたいで安定（UI diff・当日 ledger 参照が壊れない）
  - **日を跨ぐと変わる**（長期の相関追跡を構造的に防ぐ）
- raw id へ不可逆 / **authority 判断に使わない** / 比較が安全なのは同一 (viewer, day) scope 内のみ
- 孤立禁止: blinding は参照を**削除 or blinded stub への置換**で行い、dangling ref（解決先のない sourceRefs/evidenceRefs）を残さない

## 11. learning の正負分離（採用）

| 区分 | verdict | 制約 |
|---|---|---|
| positive learning | trust_more / calibrate upward / adjust_direction(信頼方向) | evidenceQuality ≥ medium ∧ sampleSize ≥ 3 を初期閾値（B1 設計で確定） |
| negative learning | suppress / narrow_context / lower confidence / adjust_direction(抑制方向) | 同上。**抑制は提案 ranking まで** — 記録・観測は止めない |
| safety override（最上位） | — | **permission boundary を learning で弱めない**（hard/予約/他人/work/payment）。user override が常に勝つ。recency decay 必須 |

adjust_direction は方向によって正負どちらにも分類される（kernel memory-correction の語彙を分割しない — 分類は消費側）。

## 12. 本 patch の実装範囲（許可リスト内）

- docs: 本書 + RG0.6b §10 への訂正注記
- code: `canonicalSerialize` fail-fast 化（§3）/ `graphIdentity.ts` の FNV 境界・pseudonymity コメント反映 / `predictionLedgerTypes.ts` の predictor 構造化 + derivationVersions + interventions.kind（§7-8）
- tests: canonical 仕様 fixture（throw・absent≠null・配列順保持）
- **やらない**: MovementReality compile / commitmentSignal / decisionDebt / deriveMomentSnapshot / assembler / UI / localStorage（SSC 自体の実装も含め未着手のまま — changeId 契約は docs 先行）

— RC2a-1b 完了で停止。
