# P3-4 — Surface DTO contract audit before UI/API connection（read-only・docs-only）

- **作成日**: 2026-06-24
- **branch**: `claude/task-store-migration-on-a9eedce69-20260623`（base = `a9eedce69`）
- **対象契約**: `RealityOsSurfaceV0` / `REALITY_OS_SURFACE_CONTRACT_VERSION = 0`（`lib/plan/realityPipeline/realityOsSurfaceContract.ts`）
- **範囲**: UI/API/PlanClient/DB **一切変更しない**。既存表示入口の read-only 確認と gap 分類・adapter 配置案のみ。

---

## 1. read-only 監査対象
`/plan` route / `PlanClient.tsx` / tabs（Calendar/Flow/Map/**Alter**/**CoAlter**）/ `dev-reality-pipeline`（既存 reality dev-preview）/ `PLAN_FLAGS`（featureFlags.ts）/ AlterTab viewmodel chain。

## 2. 既存 UI/API 境界の確認結果
- **/plan tabs** = Calendar / Flow / Map / **Alter** / **CoAlter**（PlanClient が束ねる）。
- **AlterTab** は `buildDayStateRecord→deriveMomentState→buildAlterBatteryViewModel→buildScreenViewModel`（**dayState battery viewmodel**）を描く。**realityCore は未消費**。
- **CoAlter `PlanIntelligenceLivePanel`** = 「プランインテリジェンス」section（Moment surface / 当日サポート）＝**protect/easy/push の自然な production 表示枠候補**。
- **`dev-reality-pipeline`**（既存）= operator dev-preview。**三重ガード**（① `REALITY_CANDIDATE_ACTIONS_DEV_HOST` ② staging ref ③ 非 production→`notFound`）+ operator auth(owner-RLS) + flag `REALITY_PIPELINE_PREVIEW`(server default OFF)。**client には要約+count(meta)のみ**渡す（raw row 不可）＝**RealityOsSurfaceV0 の redaction 思想と同一**。
- **PLAN_FLAGS** は **server-side のみ評価**（NEXT_PUBLIC なし）。`REALITY_*` env flag 群（capture/observe/surface/shadow）existing・default OFF。

→ **最初の描画先は production /plan tabs ではなく、既存 `dev-reality-pipeline`（三重ガード+flag OFF）**が正。production tab 接続は後段（別 GO）。

## 3. `RealityOsSurfaceV0` × 既存 UI shape 差分表

| surface field | 形 | UI が欲しい形 | gap 区分 |
|---|---|---|---|
| `scenarios[].scenarioKind`（protect/easy/push） | enum | 「守る/楽/攻める」ラベル | **B: adapter(presenter) 必要**（kind→日本語ラベル） |
| `feasibilityShift` / `overrunRiskShift` / `collapseRiskShift`（better/same/worse/unknown） | enum | 矢印/語（例「成立しやすい↑」） | **B: presenter 必要**（shift→表示語・非指示形） |
| `minimalProgressText`（string\|null） | text | そのまま文表示（null 非表示） | **A: そのまま渡せる** |
| `permissionBoundary`（0–5） | number | 自律度ラベル | **B: adapter**（既存 `PERMISSION_LEVEL_CAPABILITY` 0–5→日本語を流用） |
| `confidence`（0..1） | number | 「推定・確信度」バッジ | **B: presenter**（number→band 語・既存 provenance 表示思想と整合） |
| `reasonCodes`（controlled） | code[] | 説明文 | **B: presenter 必須**（reasonCode→日本語一文・最重要） |
| `evidenceCount`（number） | number | 「根拠N件」 | **A: そのまま渡せる**（ただし件数だけでは薄い→reasonCodes presenter で補完） |
| `realityDiffSummary`（added/…/collapsed） | {n} | 差分サマリ小表示 | **A: そのまま渡せる**（小数値・redacted） |
| `honestUnknown`（bool） | bool | 「まだ読めていません」相当の正直表示 | **B: adapter**（bool→honest banner・既存 dayState unknown 表示と同思想） |

## 4. そのまま渡せる項目（A）
`minimalProgressText` / `evidenceCount` / `realityDiffSummary`。redacted のままで UI に渡して安全（raw 参照を含まない）。

## 5. adapter が必要な項目（B）
`scenarioKind→ラベル` / `shift→表示語` / `permissionBoundary→自律度語`（既存 capability map 流用）/ `confidence→band 語` / **`reasonCodes→説明文`（最重要）** / `honestUnknown→正直表示`。
→ いずれも **presenter（surface DTO → 表示VM）** で吸収可。**DTO 追加は不要**（surface は redacted のままで足りる）。

## 6. DTO 追加が必要な項目（C）→ **なし（現契約で足りる）**
- `evidenceCount` だけでは説明が薄いが、**reasonCodes presenter で説明文を組めば成立**（DTO に raw evidence を足す必要はない＝redaction を壊さない）。
- ただし将来、UI が「なぜ worse か」をより詳しく出したい場合のみ、**controlled な reasonCode 語彙の拡充**（raw 露出でなく語彙追加）を検討（現時点は不要・契約 v0 維持）。

## 7. production-only 例外（今は例外台帳へ）
- 実ユーザー資産 feed（現状 fixture anchors）／live route・weather・ETA provider
- proposal の**実行**・notification 配信（surface は表示データのみ・実行しない）
- DB 永続化（surface は保存しない）
- production flag 点火（`REALITY_PIPELINE_PREVIEW` 等を本番 ON）+ deploy
→ いずれも **P5/production gate**。本 UI 接続段では触れない。

## 8. 推奨 adapter 配置
1. **presenter（新規・pure・UI 非 JSX）**: `lib/plan/realityPipeline/realityOsSurfacePresenter.ts`
   - 入力: `RealityOsSurfaceV0` / 出力: 表示VM（日本語ラベル・説明文・band 語・honest banner）。
   - `reasonCode→文` / `shift→語` / `permissionBoundary→capability 語`（既存 map 流用）/ `confidence→band` を pure に変換。raw 参照は触れない（surface に無い）。
2. **最初の描画先**: 既存 `dev-reality-pipeline`（**三重ガード + `REALITY_PIPELINE_PREVIEW` OFF**）に presenter 出力を足す（operator dev のみ・production 不変）。
3. **production 表示枠の最有力候補**: CoAlter `PlanIntelligenceLivePanel`（「プランインテリジェンス」section）に protect/easy/push を置く。**ただし別 GO**（本監査では決めるだけ・接続しない）。
4. **PlanClient / production tab は不変更**（flag default OFF・dev gate 厳守）。

## 9. UI/API 接続前 runbook（次段の順序・本書では実行しない）
1. **P3-5**: presenter（surface→表示VM）を pure 実装 + unit test（UI 非接続・docs/runbook の B 項目を吸収）。
2. **P3-6**: dev-reality-pipeline preview に presenter 出力を additive 表示（三重ガード+flag OFF・production hard-block 維持）。
3. （別 GO）production tab（CoAlter intelligence）接続 + flag 設計。
4. （P4/P5）persistence / 実資産 / live provider / flag 点火。

各段の不変条件: proposal 実行・通知・DB 保存に繋がない / flag default OFF / dev gate 維持 / surface 契約（redaction）を壊さない / honestUnknown を正直表示。

## 10. 停止
本監査（docs-only・read-only）で停止。UI/API/PlanClient/DB 不変更。次段（P3-5 presenter）は別 GO。
