# P3-7 — Production UI connection preflight audit（read-only・docs-only）

- **作成日**: 2026-06-24
- **branch**: `claude/task-store-migration-on-a9eedce69-20260623`（base = `a9eedce69`）
- **前提厳守**: **production には行かない。** production 接続前にできる監査・設計固定のみ。UI / PlanClient / API / DB **一切変更しない**。
- **対象**: P3-6 で dev 表示できた `RealityOsSurfaceDisplayV0`（presenter 出力）を、将来 production UI へ出す前の差分・flag・adapter 監査。

---

## 1. read-only 監査対象
CoAlter `PlanIntelligenceLivePanel` / `CoAlterTab` / AlterTab / `/plan` tabs / `PlanClient` の flag-prop 流れ / `PLAN_FLAGS` / dev・prod gate。

## 2. production UI 候補の確認結果
- **CoAlter `PlanIntelligenceLivePanel`** = 既存「プランインテリジェンス」section（FitBadge / recommended / itinerary VM を描画）。**recommendation/intelligence 枠＝protect/easy/push の自然な置き場**。
- **`CoAlterTab`** = **fixture data のみ / fetch・DB・route・server action なし / flag OFF 既定**。C6-A「proposal engine live」も flag ON 時のみ。→ **既に flag-gated・dormant-by-default のタブ＝Reality OS surface の理想的 dormant home**。
- **AlterTab** = `buildDayStateRecord→…→buildScreenViewModel`（**人体バッテリー state**）。protect/easy/push は「judgment/提案」であって battery state ではない → **Alter には出さない**。
- **PlanClient** = server が `PLAN_FLAGS`(server-only) を読み prop で client tab に渡す（`client 直読み不可`）。AlterTab/CoAlterTab は **flag opt-in・default OFF**。→ **production dormant の既存パターンが使える**（server flag → prop → flag ON 時のみ描画）。
- **PLAN_FLAGS** = server-side のみ（NEXT_PUBLIC なし）・env 駆動・default OFF。dev preview は `realityPipelinePreview`（三重ガード+operator auth 付）。

## 3. dev display VM × production UI shape 差分表

| display VM 項目 | 形 | production UI | risk 区分 |
|---|---|---|---|
| `scenarios[].kindLabel`（守る/楽/攻める） | 文字列 | 3 枠/3カード | **C: UI 新表示部品**（RealityOsScenarioCard）。VM はそのまま |
| `feasibilityLabel`/`overrunLabel`/`collapseLabel` | 記述語 | 行表示 | **A: そのまま出せる**（presenter 済） |
| `minimalProgressText`（null可） | text | 1行 | **A: そのまま** |
| `permissionLabel`（capability語） | text | バッジ | **A: そのまま** |
| `confidenceBand`（低/中/高） | enum | バッジ | **A: そのまま** |
| `evidenceText`（件数のみ） | text | 小表示 | **A: そのまま**（raw 非露出） |
| `reasonText[]`（controlled→日本語） | text[] | 理由行 | **A: そのまま** |
| `diffSummaryText`（null可） | text | 小表示 | **A: そのまま** |
| `honestUnknownLabel`（null可） | text | banner | **A: そのまま**（正直表示） |
| `isUnknown`（per scenario） | bool | 不明表示制御 | **A: そのまま** |

→ **adapter 追加は不要**（presenter が adapter。display VM は UI-ready + redacted）。残るのは **UI 表示部品（C）と flag 配線**のみ。

## 4. 推奨表示先
**CoAlter `PlanIntelligenceLivePanel`（intelligence/recommendation 枠）。** Alter（battery state）には出さない。CoAlterTab が既に fixture-only・flag OFF 既定＝dormant home として最小リスク。

## 5. 必要 adapter
**追加 adapter なし。** `presentRealityOsSurface`（P3-5）が surface→表示VM の adapter。production 接続時に必要なのは **(a) display VM を描く JSX 部品（C・別 GO）**と **(b) server→prop の flag 配線**だけ。

## 6. flag 設計案（production dormant・default OFF）
| flag | 役割 | 評価 | 既定 |
|---|---|---|---|
| `realityPipelinePreview`（既存） | dev preview（三重ガード+operator auth） | server-only | OFF |
| **`realityOsSurfaceProd`（新規案）** | production CoAlter 表示の dormant gate | **server-only（NEXT_PUBLIC なし）** | **OFF** |
- 配線（将来）: `plan/page.tsx`(server) が `PLAN_FLAGS.realityOsSurfaceProd` を読む → **ON 時のみ** display VM を prop で CoAlterTab に渡す → OFF は **prop 不渡し＝非描画**（AlterTab/compose の既存 dormant パターンと同型）。
- **production env で ON にする行為＝点火＝CEO 明示 GO 案件**（例外台帳）。本 audit では flag を作らない・ON にしない。

## 7. production-only 例外（例外台帳・今は保留）
- 実ユーザー資産 feed（現状 fixture anchors → real anchors/calendar）
- live route/weather/ETA/location provider
- proposal の**実行**・notification 配信（surface は表示のみ）
- DB 永続化（surface 保存なし）
- **production env で `realityOsSurfaceProd` 点火 + deploy**（Operating Rules §1）
→ いずれも P4/P5/production gate。本段では触れない。

## 8. production UI 接続 runbook（順序・本書では実行しない）
1. **P3-8**: `RealityOsScenarioCard`（display VM を描く pure presentational 部品・dev preview で先に検証）。
2. **P3-9**: `realityOsSurfaceProd` flag（server-only・default OFF）追加 + `plan/page.tsx`→CoAlterTab prop 配線（**flag OFF で完全 dormant・production 挙動不変**）。
3. （別 GO）staging で flag ON 検証（production ではない）。
4. （P4/P5）persistence / 実資産 / live provider / production 点火（CEO GO）。
- 各段不変条件: redaction 維持 / proposal 実行・通知・DB に繋がない / flag default OFF / honestUnknown 正直表示。

## 9. 例外台帳 追補案（P2-4 例外台帳へ追記）
- 「**`realityOsSurfaceProd` production 点火**」を seam として追加: {flag=`REALITY_OS_SURFACE_PROD`, 既定OFF, 点火=CEO GO+deploy}。
- 「**CoAlter 実 session/relation への接続**」は CoAlter 既存スコープの別件（Reality OS surface とは独立）。

## 10. 停止
本 preflight（read-only・docs-only）で停止。UI/PlanClient/API/DB 不変更。次段（P3-8 表示部品 / P3-9 flag 配線）は別 GO。**production 接続・flag 点火・DB は CEO 明示 GO 案件**。
