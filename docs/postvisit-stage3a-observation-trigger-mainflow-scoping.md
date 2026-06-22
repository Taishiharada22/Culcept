# 評価OS Stage 3-A — Post-visit observation trigger を主フローへ接続する scoping + pure plan

作成: 2026-06-22 / 状態: **scoping + pure plan（実装はまだ・接続点調査と設計を優先）**
背景: Fit-Arc は LocationDetailSheet / Candidate Lens ②③ に出せるが、**観測は Travel Location Notes 詳細でしか生成されない** → ②③の Fit-Arc は empty のまま。次の本筋は「アークの置き場所」でなく「**答え合わせが自然に発火する導線**」。

---

## 0. 前提を疑う（結論）

- 「もう1箇所 Fit-Arc を置く」は無意味（観測が無ければ全部 empty）。**ボトルネックは観測生成**。
- 観測生成に必要なのは「場所コンテキストが明確な、邪魔にならない post-visit モーメント」。
- 調査の結果、**それは既に主フローに存在する**（過去 anchor は場所と時刻を持ち、過去判定も既存、lens 選択は anchor に書き込まれる）。新インフラ（push/background/DB）は不要。

## 1. 調査した接続点（file:line・grounded）

### A. 予定（anchor）データモデル — 場所も時刻も由来も持つ
- 型 `ExternalAnchor`（one_off | recurring）: `lib/plan/external-anchor.ts:33-112`
  - **場所**: `locationText`（canonical `displayName · address`）/ `locationCategory`（home/office/school/cafe/outdoor/public/transit/unknown）
  - **時刻**: `startTime` / `endTime` / `date`(one_off) / `validFrom`,`validUntil`(recurring)
  - **privacy/由来**: `sensitiveCategory`(medical/legal/exam/other) / `rigidity`(hard|soft) / `anchorKind` / `companions`
- 読み出し: `fetchAnchors()` → `GET /api/plan/anchors`（`lib/plan/anchor-fetch.ts:75`）。**既に取得済みの anchors を読むだけ**。
- **過去判定は既存**: `isFreshAnchor(anchor, now, freshDays)`（`lib/plan/livedGeographyFallback.ts:97-120`）= date/validFrom が過去かつ freshDays 内。→ 「経過済み×直近」を流用可能。

### B. Candidate Lens 選択 → anchor への書き込み経路（確認済み）
- ②「ここにする」/③「○○ をこの予定の場所にする」→ `onSelect(candidate)` → `PlaceCandidatesPanel.handleSelect` → `formatCanonicalLocationText(name,address)` → `onChange("locationText", canonical)` → **anchor の `locationText` に保存**（`AnchorFormFields`）。
- ∴ **lens で選んだ場所は anchor.locationText になる** → 過去 anchor から答え合わせを出せば lens 選択場所も自動で拾える。

### C. placeKey 一致（★最重要の外科的詳細）
- lens の Fit-Arc キー: `opaquePlaceKey(`${name} ${address ?? ""}`)`（空白結合・`CandidateLensPanel.tsx:294`、②③の `PlaceFitArcReadout` も同形）。
- anchor の `locationText`: `displayName · address`（中黒・`lib/shared/canonicalLocationText.ts`）。
- **解法**: `parseCanonicalLocationText(locationText)` → `{displayName, address}` → `${displayName} ${address ?? ""}` で再構成 → `opaquePlaceKey` が **lens キーと完全一致**（lens が `formatCanonicalLocationText` で書くため round-trip 保証）。
  - これにより「過去 anchor で答え合わせ → ②③ の Fit-Arc が同 placeKey で readout」が成立。

### D. 注入点（UI surface）
- `CalendarTab` 選択日の anchor row（`<li>`・`app/(culcept)/plan/tabs/CalendarTab.tsx` ~990-1033・title+location を描画）。ここに gated な PostVisitCheckCard を inline 追加できる。

### E. shouldElicit が要求する derived context（`postVisitElicitation.ts:29-44`）
全て anchor から導出可能:
| ctx | anchor 由来 |
|---|---|
| placeDescriptor | `parseCanonicalLocationText(locationText)` 再構成（§C） |
| isSensitive（suppress） | `sensitiveCategory != null`（★privacy・直接利用可） |
| isHomeOrWork | `locationCategory ∈ {home, office, school}` |
| isHabitual | `locationCategory === "transit"` または `anchorKind === "recurring"`（日常） |
| isImportantPlan | `rigidity === "hard"` |
| isDiscoveryDomain | v1=false（将来 source/category から） |
| isFirstVisit | v1=false |
| dwellSignal | null（GPS/滞在を持たない＝正確分は使わない） |
| lastSkippedAt / lastSimilarElicitAt | store（`lastSkipAt()` / `lastElicitAtForPlace(placeKey)`） |
| now | 呼び出し時刻 |

## 2. post-visit prompt の候補タイミング（評価）

| タイミング | 必要インフラ | 場所コンテキスト | 邪魔 | 評価 |
|---|---|---|---|---|
| 予定後（リアルタイム） | background 検出（無い） | 明確 | 中 | ✗ infra 不足 |
| 当日夜（定時） | push/通知（無い） | 中 | 中 | ✗ infra 不足 |
| 次回アプリ起動時 | なし | 不明確 | **高** | ✗ 唐突 |
| Travel day detail 再訪 | なし | 明確 | 低 | △ travel に限定（狭い） |
| **Calendar 過去予定閲覧時** | **なし** | **明確（row に locationText）** | **低（見た時だけ）** | **◎ 最適** |

- Calendar は「今日の calendar を開くと、その日の経過済み anchor が見える」ので **today の早い予定でも自然に発火**（過去日を遡らなくても見える）。push/background 不要。

## 3. 最小実装候補（1つに絞る）

> **CalendarTab の選択日 anchor row に、「経過済み × 場所付き × 非suppress」の anchor だけ、控えめな PostVisitCheckCard を inline 表示する。**

- context は新 pure helper `buildElicitContextFromAnchor(anchor, now, storeSignals)` で構築（§1-E のマッピング）。
- placeDescriptor は §C の再構成で lens キーと一致。
- 一般の過去 anchor が trigger に乗るよう、**新 trigger `past_plan`（最低優先度）を追加**。suppress（sensitive/home_work/habitual/recurring/after_skip/recent_same）が安全網として効くので「全部に聞く」にはならない（実質: 一回限り・非日常・非機微の場所付き予定のみ）。
- 保存後は同画面の Fit-Arc（将来 calendar にも置けるが本 stage では置かない）/②③ の readout に同 placeKey で反映。

### なぜこれが最適か
1. **観測生成のボトルネックを直接解く** = ②③+LocationDetailSheet の Fit-Arc すべてを一度に意味あるものにする（最高効率）。
2. **lens 選択場所を自動で回収**（lens→locationText→過去 anchor→答え合わせ→同 placeKey で Fit-Arc）。ループが主導線で閉じる。
3. **新インフラ不要**（既取得の anchors を読むだけ・push/background/DB なし）。
4. **邪魔になりにくい**（見た時だけ・suppress + cooldown）。Stage 0-C の dogfood 指標（suppress 率/回答率）で過不足を測れる。
5. **ランキング誤読なし**（答え合わせは勝敗でなく振り返り）。

## 4. 保存する / しないデータ（再確認・Stage 0 と同一）

| 保存する（local shadow・whitelist 8項目） | 保存しない |
|---|---|
| placeKey(opaque・canonical を parse→再構成→hash) / lens / trigger(`past_plan`) / response / reasonChips / dwellSignal(null) / at | **生 locationText / 住所原文 / GPS / 正確な滞在時間 / notes 原文 / companions** |
- `sensitiveCategory` は **suppress 判定にのみ使用**（保存しない）。medical/legal/exam 予定は永久に聞かない。

## 5. 既存ロジックへの影響（なし）

- anchor repository / `/api/plan/anchors` / Calendar 描画ロジック / lens comparison / ranking は **不触**（追加は gated inline render + 新 pure helper + trigger enum の additive 拡張のみ）。
- flag OFF / production hard block で **CalendarTab DOM 完全不変**。

## 6. 次に実装 GO できる範囲（Stage 3-B 候補・最小・localStorage shadow / flag OFF / production hard block 限定）

1. **pure**: `past_plan` trigger 追加（`PostVisitTrigger` enum + `QUESTION_BY_TRIGGER` + `firstTrigger` 1行・最低優先度）+ `ElicitContext.isPastPlan`。
2. **pure**: `isPastAnchorWithPlace(anchor, now)` + `buildElicitContextFromAnchor(anchor, now, {lastSkippedAt, lastSimilarElicitAt})`（§1-E マッピング・canonical 再構成）。
3. **UI（最小）**: `CalendarTab` の anchor `<li>` に、過去×場所×非suppress の時だけ gated `PostVisitCheckCard` を inline 表示（既存 prop に derived flags を渡す）。flag OFF で非描画。
4. **tests**: 過去判定 / context 導出（suppress マッピング・canonical 再構成でキー一致）/ `past_plan` trigger / flag OFF no-op。
- DB/API/migration/外部/production/env/origin-main push なし。Calendar/anchor/lens ロジック不変。

> 本書は **docs-only**（コード変更なし）。実装は次 GO で §6 の範囲に限定して着手する。
