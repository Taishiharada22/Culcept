# RC2a-2A: MovementReality v0 closeout audit / micro-fix（GPT 監査 7 点）

- 日付: 2026-06-13 / 種別: 実装済み MovementReality v0 の**意味論検収**（新規 docs round ではない）
- 裁定: #1 意味論修正は本質的に正しい（コードは正・報告の表現が誤読を招いた）。残りは確認・固定

---

## 1. 両端場所なしの意味論修正（採用 — 報告表現の危険を訂正）

私の RC2a-2 報告「両端とも場所なし → 『同じ場所』扱いで transition を出さない」は**危険な表現**だった。コード挙動（transition を出さない）は正しいが、「同じ場所扱い」という説明が誤読を招く。正本（movementReality.ts header + test に固定）:

- 両端場所なし = **「移動判断に必要な場所情報が無い」**（移動不要でも same place confirmed でもない）
- 両端場所テキスト同一 = **「移動が必要な場所差が観測されない」**（同名別店舗等は未判別・RC4 前）
- **no movement node ≠ no movement risk** / current DayGraph が transition を発火しないだけ ≠ same place proof
- 場所欠落の signal は **event 側（ern.placeCertainty=unknown）が保持**し、RJ1 Feasibility/Risk が別経路で拾う。**mv 不在から「移動リスクなし」を導出しない**（管制塔の致命的誤読の構造的禁止）

→ movementReality.ts に「意味論の不変条件」ブロック追加・test 名訂正・absence semantics 記録テスト 2 件追加。

## 2. movement id 方針の再監査結果

- `mv:<date>:<fromAnchorId>:<toAnchorId>` は **direction-sensitive**（from→to は時刻順で確定・逆順 id は生成されない — fixture で固定）
- **sourceTransitionRef**: kernel の MovementTransition は明示 id を持たず、identity は (fromNodeId,toNodeId) ペア。`sourceRefs.transitionBasis = fromNodeId->toNodeId` がその source-transition id（自然 id）
- **currentKernelGuarantee**（header に明記）: 同一 (from,to) ペアは線形連続ペア生成で同日最大 1 回（同一 anchor は同日 graph に 1 回・dup skip 済み）。重複時は guard が throw（index fallback で握り潰さない）
- **future**: kernel が transition 明示 id / 同一ペア複数区間を導入したら、先に sourceTransitionId を足して mv id を切替える。fromNodeId/toNodeId/dayGraphSnapshotId は sourceRefs に既に保持
- 結論: 現行は単なる pair ではなく direction + transitionBasis + snapshot context を sourceRefs に持つ。**RC2a-2A での id 変更は不要**（拡張余地は確保済み）

## 3. samePlacePossible の不変条件（固定）

- text 一致だけで confirmed true にしない（そもそも text 一致 → transition なし ゆえ v0 で samePlacePossible が true になる経路は存在しない）
- exact resolved place id がある場合のみ confirmed 候補（RC4+）
- both missing は no transition（unknown/評価対象外）— same true ではない
- samePlacePossible の値に関わらず **routeKnown/etaKnown/leaveByKnown は false を保つ**（fixture で全 compiled node に対し確認）

## 4. missingInputs と absence の関係（固定）

- **node あり**: place_missing / route_missing / eta_source_missing を保持（先頭=主理由）
- **node なし**: current DayGraph に transition が無いだけ。**「判断済み」と扱わない**
- RJ1 Feasibility は event place missing を **ern.placeCertainty（event 側）から別途拾う**（mv absence からは拾わない）

## 5. FAIL 2 の事前存在証明（機械的）

| 項目 | 証拠 |
|---|---|
| test 名 | `realitySeedSource.test.ts > …seed source 静的安全`（plan_seeds 読取 query は seed-source.ts のみ）/ `realityDurationEvidenceSource.test.ts > A1-5-3b-3 静的安全`（evidence 読取は duration-evidence-source.ts のみ） |
| 失敗理由 | 期待 offender リストに `integration/consumed-seed-repository-supabase.ts` / `integration/plan-seed-status-executor.ts` が未追加（新 `.from()` query 追加に対しテストの期待値が未更新） |
| baseline | offender 2 ファイルの初出 = **A1-6-5d**（`17826f16` / `dedaaf1d`）。私の RC トラック初出 `c16a1e28`（RC1a-1c）**より前** |
| RC2a-2 起因でない根拠 | 失敗テストは `path.join(cwd, "lib/plan/reality")` を scan（realitySeedSource.test.ts:229）。RC2a-2 の作業は `lib/plan/reality**Core**` = **別ディレクトリツリー**で scan 対象外。realityCore に `.from(`/supabase query は**ゼロ**（grep 確認） |
| RC2a-2 relevant tests | movementRealityCompile.test.ts **15/15 PASS**・eventRealityNodeCompile 18 PASS・realityGraphIdentity 18 PASS（RC track 全 green） |
| tsc 55 不変 | RC2a-2/2A 追加で baseline 55 から増減なし（新規型エラーゼロ） |
| build | `next build` exit 0 |

**結論**: FAIL 2 は A1 レーンの期待リスト bookkeeping 問題で、RC トラックと無関係。隠れ蓑にしていない（owning = A1 セッション）。

## 6. Department Responsibility Matrix（Mobility 部署・RC2a-2A 形式再掲）

| 項目 | 内容 |
|---|---|
| owningDepartment | Mobility |
| consultedDepartments | Plan（予定列）・Context（場所/予定の意味）・Permission |
| blockingDepartments | Permission（移動提案・対外連絡の拒否権） |
| outputs | movementRequired / samePlacePossible / placeKnown / routeKnown / etaKnown / leaveByKnown / mobilityStatus / missingInputs（全て RealityAttribute） |
| missingInputs | 場所解決（placeId）・route・ETA 分布（全て RC4・外部 API gate） |
| safetyGate | redaction（sensitive 区間の location 非表示）・unknown 正直（place 欠落で断定しない）・**absence を判断と読まない** |
| traceRefs | （RJ 接続時）JudgmentTrace.usedInputs に mv node refs |
| このスライスで実装した部署責務 | mv ノード compile（移動の有無・場所確度・供給欠測の正直表示）。Mobility 部署の最初の実体化 |
| このスライスで実装しなかった backlog | MovementOptionComparison（route/ETA/reliability/weatherFit — RC4）/ leaveBy 二段・OriginInference（RJ2）/ 位置 trigger（B2/R6） |

## 7. 完了サマリ

- commit: 本 closeout の commit hash（報告に記載）
- touched files: `lib/plan/realityCore/movementReality.ts`（docstring 不変条件追加）・`tests/unit/movementRealityCompile.test.ts`（test 名訂正 + absence/id fixture +3）・本 closeout docs
- 両端場所なし意味論: ✅ 修正（§1）/ movement id: ✅ 再監査（変更不要・§2）/ samePlacePossible: ✅ 固定（§3）/ absence: ✅ 明文化（§4）/ FAIL 2: ✅ 機械証明（§5）/ Department Matrix: ✅ 再掲（§6）
- tsc 55 不変 / build exit 0 / movementRealityCompile 15 PASS
- UI / localStorage / API / DB / location / notification / external read 不接触
