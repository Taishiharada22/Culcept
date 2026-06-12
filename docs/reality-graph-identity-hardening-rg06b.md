# RG0.6b: Identity / Revision / Ledger Hardening（RC2a-1 = docs + types only）

- 日付: 2026-06-13 / 作成: 契約管理セッション（GPT 監査 16 点の独立裁定）
- 裁定サマリ: 採用 13 / **設計置換して採用 2**（§1 hash 強度・§10 seq 生成源）/ 範囲確認 1（§16）
- 優先順位: 本書 → RG0.6a → RG0.6 → addendum（矛盾時は本書優先）
- 実装範囲（RC2a-1）: 本書 + identity 型 + pure な決定的 id helper + その fixture のみ。runtime compile なし

---

## 1. hash 強度と「id 同一 ⇒ 内容同一」の再裁定（置換採用）

GPT 指摘は正しい — 32bit hash で絶対命題は張れない。ただし SHA-256 は WebCrypto が async のため pure 同期 derive 層と相性が悪く、暗号強度はそもそも不要（改ざん耐性でなく同一性識別が目的）。裁定:

1. **hash を FNV-1a 64bit に昇格**（BigInt・pure・同期・依存ゼロ。衝突確率は 32bit の 2^32 分の 1）
2. **不変条件を格下げ**: 「id 同一 ⇒ 内容同一」は撤回。正しくは —
   - id は **決定的 cache key**であり証明ではない。`id 同一 ⇒ 同一 semantic inputs（圧倒的高確率）`
   - 内容同一性の証明は **canonical 直列化の比較**で行う（id 比較で代用しない）
   - 衝突の影響面の限定: snapshot は非永続（derive-only）のため、衝突の実害は cache/memo の stale と SSC dedupe の誤併合に限られる。dedupe 側は §6 の value-chain が二重防御
3. revision 文字列に **自己記述 prefix** を義務付け: `rev1:fnv1a64:<hex16>`（`revisionSchemaVersion`=rev1 / `hashAlgorithm`=fnv1a64 を id 自体が運ぶ — 将来のアルゴリズム移行で新旧が区別可能）

## 2. builtAt と内容同一性の矛盾解消（採用）

snapshot を **identity content** と **runtime metadata** に分離:
- `meta: { computedAt: RealityInstant }` — **content-equality と id の対象外**であることを型レベルで明示（field 名も builtAt → computedAt に変更）
- identity 側の時刻は **minuteOfSubjectiveDay のみ**（snapshotIdentityInstant = minute precision）
- 規約: 「同じ snapshotId の 2 つの snapshot は、meta.* を除いて canonical 等価でなければならない」— nowInstant（秒/ms）を identity content に含めることを禁止

## 3. inputRevisionSet — recordRevision に全部を詰めない（採用）

graphBaseId は**複数入力 revision の合成**として再定義:

```ts
InputRevisionSet = {
  dayGraphRevision: string,      // = DayGraph.snapshotId（anchors 由来の構造）
  recordRevision: string,        // = 本人台帳（RG0.6a §2 の hash 対象のまま — 役割を縮小して維持）
  environmentRevision: string,   // = weather payload + freshness の hash（未取得は "env0:none"）
  hintsRevision: string,         // = day-state-hints 応答（dailyModeHint/confidence/walkLevel）の hash
  shiftRevision: string,         // = 当日 dayIndicator + shift source id 集合の hash（DayGraph 外の供給）
  derivationRevision: string,    // = §4 DerivationVersionSet の hash
  schemaVersion: number,         // = Graph schema（RealityGraphSnapshot.schemaVersion）
}
graphBaseId = rgb:<subjectiveDate>:<graphViewerKey>:<fnv1a64(canonical(InputRevisionSet))>
```

## 4. DerivationVersionSet — derive ロジックの版を identity に含める（採用）

```ts
REALITY_DERIVATION_VERSIONS（code 内 const manifest・モジュール変更時に該当 entry を bump）= {
  graphSchema: 0,
  eventRealityCompile: 0,     // RC1 実装済み分
  momentSnapshot: 0,          // RC2a-5 で稼働
  movementRealityCompile: 0,  // RC2a-2
  decisionDebt: 0,            // RC2a-4
  commitmentSignal: 0,        // RC2a-3
  predictionGrading: 0,       // gradeNightCheck 系（"gradeEnergyLevel@v0" 参照と一貫）
  graphAssembler: 0,          // RC2a-6
}
```

規律: **derive 出力に影響する変更は対応 version の bump を必須**とする（review checklist 化）。bump 漏れは「同じ id で違う Graph」を生む契約違反。

## 5. PredictionEntry の identity 強化（採用）

RG0.6 §9 に追加:
`frozenSnapshotId` / `graphBaseId` / `inputRevisionSet`（凍結時点の複製）/ `predictionSchemaVersion` / `gradingFunctionVersion` / `predictedBy`（"system" | 将来 model id）/ `targetField` / `targetNodeKind`（"day" | "event" | "movement"）/ `targetNodeId`。
predictionId 改訂: `pred:<subjectiveDate>:<targetNodeId>:<field>:<horizon>:<inputRevisionHash>` — 同日同 field の別条件再凍結・将来の event horizon でも一意。

## 6. correction × prediction の時間順序規則（採用）

T_freeze = estimatesFrozen.at として:
1. **T_freeze 前の入力**（前セッション復元・初回 build 前の睡眠/mood 等）→ predictedValue の**入力**になる（凍結に焼き込まれる）
2. **T_freeze 後の correction** → predictedValue を変更しない（既実装: applyUserCorrection は凍結不変）
3. T_freeze 後の correction の身分 = **intervention evidence / actual 側 evidence / calibration candidate** の 3 役。採点時は **actual として扱わない**（actual は NightCheck dayFelt のみ）— **separate intervention** として PredictionEntry に併記し、B1 の calibration が消費
4. 採点母集団からの除外: **凍結値の source が user_confirmed の field は headline match 率から除外**（isHeadlineEligible 実装済み — 自己一貫性測定の防止）。凍結後 correction があっても採点自体は行う（凍結 vs actual の比較は依然有効 — correction は文脈として記録）

## 7. EnvironmentReality の scope 拡張（採用・placeholder）

`temporalScope`（day | timeWindow | route | placeCandidate | eventLocation）+ `spatialScope` / `sourceLocation` / `fetchedAt` / `validUntil` / `freshness` / `source` / `confidence` / `missingInputs`。
v0 実装は day scope のみだが、**型は scope を最初から持つ**（RC4 で route scope、RC5 で placeCandidate scope に値が入る — 形の変更ではなく値の供給）。

## 8. daylight の source 分離（採用）

| field | source 種別 | freshness |
|---|---|---|
| weatherCondition / temperature / rainPossible | API / cache（WeatherFetchResult.source） | fetch 時刻依存 |
| **daylight** | **solar/time/location の決定的導出**（API 不要・日付+緯度経度から計算可能） | 計算時に常に fresh |
| severeWeather | API / alert source（v0 unknown） | alert 依存 |

規律: **source が異なる field を 1 つの freshness に潰さない** — 各 field の RealityAttribute が自分の source/evidence を持つ（env レベル freshness は API 系 field の fetch metadata に限定）。

## 9. shiftContext の event 側接続（採用 — 大半は既実装の明文化）

- shift 勤務それ自体が **EventRealityNode になる**（shift import anchor → ern・origin=imported — RC1 実装済み）
- 夜勤明け → recoveryNeed/energyLevel evidence（実装済み: shift_night）/ 翌出勤 → commitmentSignal.workShiftContext + eligibility 要確認側（RG0.6 §7 / RC1 実装済み）
- work 予定の canSuggestMove/Shorten/Skip は要確認側に倒す（RC1 実装済み: mayInvolveOthers）
- shift source の freshness（取り込み日）+ confidence を evidence に持つ / **事実記述のみ・健康診断的断定禁止**（RG0.6a §5 再掲）

## 10. SSC seq の生成源（**置換採用** — 「ローカル連番」は未定義で甘かった）

> **⚠️ 訂正（RC2a-1b §1 が本節を上書き）**: 本節 2 項の「A→B / B→A / A→B は (prev,next) が異なる連鎖として
> 区別される」は**論理バグ**（1 回目と 3 回目は同一 (prev,next) で衝突する）。正本は
> `changeId = ssc:<subjectiveDate>:<targetNodeId>:<changeKind>:<sourceActionId>`（sourceActionId =
> per-day 永続 monotonic counter を gesture 時点で採番・同時保存）。valueHash は dedupe 補助に降格。
> 「完全同一遷移の同分内反復は併合が正しい」の断定も撤回（往復は decisionDebt の signal）。

GPT の選択肢を再構成し、**永続 event log を seq の正本**とする:
1. **event log の並びが順序の正本**: UserCorrection[] は record 内に**順序保存済み**（既実装）。SSC の順序は「保存された log の並び」であり、再 derive で順序が変わることはない（識別禁止なのは**表示順の配列 index**であって、永続 log の系列位置は正当なデータ）
2. **changeId は value-chain で一意化**: `ssc:<subjectiveDate>:<targetNodeId>:<changeKind>:<minuteOfSubjectiveDay>:<prevValueHash>:<nextValueHash>` — 同一分内の A→B / B→A / A→B は (prev,next) が異なる連鎖として区別される。完全同一遷移の同分内反復のみ同 id = **冪等（二重 submit と区別不能であり、併合が正しい）**
3. `sourceActionId`: SSC 永続化実装時に **UI 操作時点で per-day counter を採番し entry と同時に保存**（保存しない counter の再現性問題を構造的に回避）。reload/offline は保存済み log がそのまま正本
4. 乱数 id は引き続き禁止

## 11. RequestFrame の conditions/questions も RealityAttribute 化（採用）

`requiredConditions: RealityAttribute<string>[]` / `unresolvedQuestions: RealityAttribute<string>[]` — 各要素が source/confidence/status/displayPolicy を持つ（「なぜその質問が未解決なのか」を evidenceRefs で追跡）。RG0.6a §11 の `{value, evidenceRefs}` 形を上書き。

## 12. viewerId を id に生で入れない（採用）

- `internalViewerId` = auth user id（UUID・内部のみ）
- **`graphViewerKey` = fnv1a64(internalViewerId + scope salt) の擬名 key** — graph id・log・cache key にはこれのみ使用
- debug/log に raw viewerId を出さない / fixture は定数 `"viewer-self"`（本番構造と分離・実 UUID を fixture に書かない）

## 13. per-viewer redaction の適用範囲拡張（採用）

projection の 3 段規律:
1. **node-level filtering**（viewer に見えないノードは存在ごと落とす — 参照可能性自体を消す）
2. **field-level redaction**（displayLabel・location 等の値の generic 化 — 既存 sensitive redaction）
3. **reference-level blinding**（evidenceRefs / sourceRefs / targetNodeId / participant refs / place refs が不可視ノードや他者を指す場合、参照ごと除去 or blind id 化 — 「参照の安全性」まで含む）

他 viewer の存在を**推測させる** evidence（件数差・時間帯の穴のパターン等のサイドチャネル）も漏らさない方針を明記（Rendezvous 絶対原則の継承）。

## 14. CorrectionMemory の learning safety gate（採用）

LSAT の Safety Floor（INV-3「学習が catastrophic を危険側に下げない」）を学習全体に一般化:
- hard / reservation / otherPeople / work / payment の保護を **learning で弱めない**
- suppression は permission を緩めない / trust_more は confirmation requirement を消さない
- correction memory は **許可済み行動空間内の ranking のみ**変えられる（authority boundary を越えない）
- learningCandidate に `evidenceQuality` / `sampleSize` / `recency` を必須付与（少数事例の過学習防止）
- 「前に動かしたから次は勝手に動かす」への昇格は**学習ではなく permission level の本人変更のみ**が可能

## 15. mv id 反証の限定条件（採用）

RG0.6a §9 に追記: `currentKernelGuarantee`（線形チェーン・連続ペア生成 = movementTransitions.ts:70-90 に依存した保証であること）/ `futureTransitionIdentityRequired`（kernel が同一ペア複数 transition を導入する場合、**先に** upstream transition id を追加し mv id を切替え）/ guard test（同一ペア重複 transition の検出で FAIL する fixture — **RC2a-2 の fixture として実装**。本 slice は types only のため docs 予約）。

## 16. RC2a-1 の実装範囲（本 slice で実施）

- 本書（RG0.6b docs patch）
- `lib/plan/realityCore/realityInstant.ts` — RealityInstant 型 + JST 境界生成（**TZ 換算ロジックの単一正本化** — fixture で screenViewModel.jstNowMinutes / adapter.toJstWallClock との等価性を固定し再分裂を防ぐ。既存実装の置換は別 slice）
- `lib/plan/realityCore/graphIdentity.ts` — fnv1a64 / canonical 直列化 / recordRevision / InputRevisionSet / DerivationVersionSet / graphBaseId / snapshotId / momentSnapshotId / graphViewerKey（全て pure・決定的）
- `lib/plan/realityCore/predictionLedgerTypes.ts` — PredictionEntryV0 型（§5。**型のみ・runtime なし**）
- fixtures: 決定性 / 各 revision 成分への感度 / builtAt 非感度 / viewer 擬名化（raw UUID 非含有）/ JST 等価性 / 既知ベクタ
- **やらない**: MovementReality compile / commitmentSignal / decisionDebt / deriveMomentSnapshot / assembler / UI / localStorage / API / 新規 read / push・PR・deploy

— RG0.6b + RC2a-1 完了で停止。RC2a-2 GO は別途。
