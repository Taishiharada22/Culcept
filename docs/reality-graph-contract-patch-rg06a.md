# RG0.6-addendum: Reality Graph Contract Patch（docs-only・実装なし）

- 日付: 2026-06-13 / 作成: 契約管理セッション（GPT 監査 15 点の裁定 — 鵜呑みにせず独立検証済み）
- 裁定サマリ: **採用 14 / 部分採用 1（§9 — 現行 kernel で衝突が構造的に不可能なことを証明し、将来ガードのみ採用）**
- 優先順位: 本書 → RG0.6 → addendum → R0.5（矛盾時は本書が優先）
- 停止位置: 本書の確認まで。**RC2a GO はまだ無い**（分割は §15）

---

## 1. Snapshot identity の矛盾修正（採用 — 契約バグだった）

RG0.6 §1 の graphId は分単位で変わる中身（momentSnapshot）に同一 id を与え得た。**3 層に分離**:

```
graphBaseId      = rgb:<subjectiveDate>:<viewerId>:<dayGraphSnapshotId>:<recordRevision>
                   …構造 id（予定・台帳・viewer が変わった時だけ変わる）
snapshotId       = rgs:<graphBaseId>:<minuteOfSubjectiveDay>
                   …RealityGraphSnapshot の id（分が進めば別 id — 同 id 同内容を保証）
momentSnapshotId = ms:<subjectiveDate>:<viewerId>:<minuteOfSubjectiveDay>:<graphBaseIdHash>
```

不変条件: **id が同じ ⇒ 内容が同じ**（決定的 derive のため成立）。時間依存の内容を持つ構造体に時間を含まない id を与えることを Graph 全体で禁止。

## 2. recordRevision の精密定義（採用 — 既存に無い概念だった）

DayStateRecordV0 に revision field は**存在しない**。canonical hash として定義:

- **hash 対象（persisted-mutable な本人由来部分のみ）**: `estimatesFrozen.at` / `frozenKind` / `frozen.values` / `userInputs.corrections[]`（at,field,direction を順序保持）/ `userInputs.manualLevels`（key ソート）/ `moodCode` / `sleepQuality` / `nightCheck.{answeredAt,dayFelt,planVerdict}`
- **hash 非対象**: facts（dayGraphSnapshotId が既に同一性を担う）/ estimates 現在値（上記から決定的に再導出される）/ evidence / **builtAt・現在時刻（混入禁止 — GPT 指摘どおり）**
- アルゴリズム: canonical 直列化（key ソート・undefined 除去）→ **FNV-1a 32bit**（pure・依存ゼロ・決定的。crypto 不要 — 同一性識別が目的で改ざん耐性は不要）
- 性質: 補正・manualLevels・睡眠/mood・NightCheck 回答で**変わる**。同日リロード・再 derive では**変わらない**

## 3. PredictionLedger の不変性（採用 — 既実装の規律を契約に昇格）

- `predictedValue` / `predictedAt` は **immutable**。predictedAt 以後の userCorrection は予測を変更しない
- userCorrection は **actual / intervention / state change 側の evidence**（予測の編集ではない）
- 採点（gradeNightCheck）は **frozen prediction に対してのみ**行う — 既実装: applyUserCorrection は estimatesFrozen 不変・W4 で stored frozen が正本・`isHeadlineEligible` が user_confirmed を採点母集団から除外（後出し補正で「当たったことにする」自己一貫性ループは Stage 0 から二重に封じられている — 本契約はその昇格）
- record.estimates が後から変わっても estimatesFrozen / PredictionEntry は不変

## 4. EnvironmentReality ノード追加（採用 — Graph から環境が抜けていた）

```ts
EnvironmentRealityV0（placeholder・全 field RealityAttribute）= {
  environmentRealityId: string,        // env:<calendarDate>:<scope>（scope v0 = "day"）
  weatherCondition: RealityAttribute<WeatherCondition>,   // 既存 union 再利用
  rainPossible / temperature / daylight / severeWeather: RealityAttribute<…>,  // 供給まで unknown
  freshness: "api" | "cache" | "stale_cache" | "manual" | "fallback",
       // 既存 WeatherFetchResult.source をそのまま採用（weatherService.ts:127-130 — 新語彙を作らない）
  missingInputs: string[],
  impactTargets: ["outingTolerance", "MovementReality", "CollapseRisk", "PlaceCandidateReality"],
}
```

W3b の weather（DayState 入力）は本ノードの**先行部分実装**と再解釈（補助値への退化を防ぐ）。実装は RC2b 以降。

## 5. ShiftContext / WorkContext の evidence 契約（採用）

facts.shift（実装済み）の Graph 上の扱いを固定:
- energy / recovery / todayMode の **evidence**（実装済み: shift_night → energyLevel low・evidence "shift_night"）
- commitmentSignal.workShiftContext に影響（RG0.6 §7）/ work・shift 予定の intervention eligibility に影響（要確認側）
- **医療・診断的状態として扱わない**（表示も「夜勤明け」等の事実記述まで — 体調の断定禁止）
- source（manual / shift_image）+ freshness（取り込み日）必須

## 6. SSC dedupeKey の衝突修正（採用 — 同一分内 2 補正で衝突した）

changeId と dedupeKey の責務を分離:
```
changeId  = ssc:<subjectiveDate>:<targetNodeId>:<changeKind>:<minuteOfSubjectiveDay>:<seq>
            …seq = 同 (target,kind,minute) 内の単調増加ローカル連番（乱数禁止）→ 一意性保証
dedupeKey = <targetNodeId>:<changeKind>:<valueHash>:<minuteOfSubjectiveDay>
            …同一分・同一値の二重 submit のみを duplicate と判定（事故）
            異なる値の連続補正は valueHash が異なるため正当に複数保持（操作）
頻度系 kind（estimate_frozen / night_check_answered）= dedupeKey から minute を除き subjectiveDate 粒度
```

## 7. timezone の将来互換（採用 — Travel Mode は CEO 決裁済みトラック）

RealityInstant.timezone を **literal "Asia/Tokyo" から IANA string に変更**し、意味論を固定:
- v0 default = "Asia/Tokyo"（製品正本）
- 将来: activePlanTimezone / userTimezone / travelContextTimezone を**明示入力で**差し替え可能
- **browser local timezone の暗黙取得は永久禁止**（W6 TZ 分裂バグの教訓 — timezone は常に明示 field）
- JST 固定は v0 の既定値であって永久正本ではない

## 8. samePlacePossible の確度制約（採用）

- free text（locationText）一致 → **inferred・confidence ≤ 0.4**（「自宅」「駅」等の文字列一致は弱証拠）
- placeId 一致（場所解決後・RC4+）→ confirmed 候補
- 片方でも不明 → unknown
- **文字列一致だけで「移動不要」と断定しない** — 整合確認: RC1 の ern.movementRequired は transition 不在を false でなく unknown としており（compileEventRealityNodes — 「不要」の断定を既に回避）、本契約と一貫

## 9. MovementReality id の衝突検証（**部分採用 — 反証つき**）

検証結果（movementTransitions.ts:70-90 精読）: transitions は**一意な event node 列の連続ペア (i, i+1) の線形走査**で生成され、同一 anchorId は同日 graph に 1 回しか現れない（dup skip 済み）。したがって **同一日内で同じ (fromAnchorId, toAnchorId) 順序対は構造的に最大 1 回** — 現行 kernel での id 衝突は不可能（gap を挟んでも from/to は隣接 event のまま・recurring は date が id に入る）。
採用する将来ガード: 「kernel が同一ペアに複数 transition を持つ構造（複数区間ルート・代替経路等）を導入する場合、**upstream に transition id を追加してから** mv id をそれに切り替える。それまでペア基準を維持。**index fallback は永久禁止**」。

## 10. commitmentSignal × permission の直交性（採用）

| commitment | permission | 挙動 |
|---|---|---|
| high | blocked | **提案不可**（permission が常に優先）。ただし collapse risk 上は重く扱う（リスク計算に permission は影響しない） |
| high | allowed | 提案可・「守る」側の重みとして使用 |
| low | user explicitly fixed | 勝手に動かさない（rigidity/explicit priority が commitment 低でも保護） |
| unknown | unknown | 提案は保守側（blocked 扱い）・リスク上は missingInputs に明示 |

原則: **commitment = 崩れたときの痛み（リスクの重み）/ permission = 触ってよいか（行動の可否）**。一方から他方を導出しない。

## 11. RequestRealityFrame placeholder への provenance 適用（採用 — 自分の §10 規律との不整合だった）

RG0.6 §8 の裸 field を修正:
```ts
RequestRealityFrameRef（placeholder v0.1）= {
  frameId, expiry: { date, reason: "intent_staleness" | "date_passed" | "superseded" },
  desiredAction:   RealityAttribute<string>,    // source = 発話/A1 抽出・evidenceRefs = seed 参照
  dateHint:        RealityAttribute<string>,
  areaHint:        RealityAttribute<string>,
  placeBrandHint:  RealityAttribute<string>,
  locationAmbiguity: RealityAttribute<"low"|"medium"|"high">,
  requiredConditions / unresolvedQuestions: { value: string, evidenceRefs: string[] }[],
  permissionBoundary: RealityAttribute<PermissionLevel>,  // source = 既定規則 or 本人指定
}
```

## 12. viewerId の扱い（採用）

- viewerId = **auth user id（UUID）由来のみ**。display 名・推論 self・TalkBridge の cosmetic self を viewer authority にしない（既存 TalkBridge 規律と同一）
- local dogfood: 認証ユーザーの UUID。pure fixture では定数 `"viewer-self"`（実 UUID を fixture に書かない）
- snapshot は非永続だが、debug 出力・log に viewerId を生で出さない（出すなら hash）
- per-viewer projection は **evidence visibility の redaction を必ず通す**（DayGraphView + sensitive redaction を正本に。他 viewer の存在を推測させる evidence を漏らさない — Rendezvous 絶対原則）

## 13. Environment edges 追加（採用 — RG0.6 §2 表へ追補）

| # | edge | derived fields | invalidation | recompute scope | persistence |
|---|---|---|---|---|---|
| E15 | EnvironmentReality → UserState（outingTolerance 信号） | weather_rain evidence 等（実装済み経路の昇格） | weather fetch / freshness 劣化 | record 再 build | なし |
| E16 | EnvironmentReality → MovementReality | 雨天時の移動摩擦補正（RC4+） | 同上 | 影響 mv のみ | なし |
| E17 | EnvironmentReality → PlaceCandidateReality | weatherExposure / 屋内外適性（RC5） | 同上 | 当該候補のみ | なし |
| E18 | EnvironmentReality → CollapseRisk factors | severe weather factor（RC2b+） | 同上 | risk のみ | なし |

## 14. CorrectionMemory の反映先の具体化（採用 — E13 詳細表）

| 反映先 | 内容 | 消費 gate |
|---|---|---|
| energy prior | nextDayPriorAdjustments(energyLevel) → 翌日 build の事前分布シフト | B1 |
| recoveryNeed prior | 同（recoveryNeed） | B1 |
| todayMode prior | dailyMode の recentModes（resolveDailyMode の連続抑制引数 — 既存受け口あり・未供給） | B1 |
| event energyCost calibration | 「この種の予定の後は消耗が大きかった」→ ern.energyCost の per-verb/per-context 補正 | B1+（event 単位採点 = PredictionLedger horizon "event" 後） |
| decisionDebt calibration | 放置されがちな debt 成分の重み学習 | B1+ |
| receptivity calibration | 受け取られた/無視された介入時間帯 → receptivity（B2/R6 の配信学習と束ね） | B2/R6 |
| suggestion suppression / trust_more | kernel memory-correction の verdict（trust_more/suppress/adjust_direction/narrow_context）をそのまま採用 — **独自実装しない** | B1 |

## 15. RC2a の分割（採用 — 報告単位を固定）

| slice | 内容 | 備考 |
|---|---|---|
| RC2a-1 | RealityInstant + Snapshot identity（§1/§2/§7 の型・id・revision hash）+ fixtures | 契約の土台 — 最初 |
| RC2a-2 | MovementReality v0 compile（§8/§9 制約込み） | |
| RC2a-3 | commitmentSignal additive（§10 直交性込み） | |
| RC2a-4 | decisionDebt components v0 | |
| RC2a-5 | deriveMomentSnapshot | RC2a-1〜4 を合成 |
| RC2a-6 | RealityGraphSnapshot assembler | 最後（全部の編成） |
| RC2a-7 | invariant fixtures 総仕上げ（provenance walker 全ノード適用） | |

実行は連続でよいが、**commit と報告はこの単位**。途中で肥大化したら停止（CEO 指示どおり）。

— RG0.6-addendum 完了で停止。RC2a-1 GO は本書確認後。
