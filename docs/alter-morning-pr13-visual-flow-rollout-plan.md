# Alter Morning Visual Flow — Production Rollout Plan (W3-PR-13)

**Status**: Stage 2 完了（M4 merge 時点）  
**Last updated**: 2026-04-25  
**Owner**: CEO（最終実行判断）+ Build Unit（コード変更 / 観測）

## 1. 目的 / スコープ

Morning Plan に **pin-only の簡易地図** を追加する。`MorningPlanCard` 下部に小さな map を描画し、当日のイベントが「どこで」起きるかを空間的に把握できるようにする。

**含まない（本 PR-13 では対象外）**:
- polyline / directions / 線描画（将来検討、I-2/I-3 で明示除外）
- pin 上の click interaction（pin info / edit / 他機能への遷移）
- AdvancedMarker（Map ID 必要、legacy Marker で十分）
- 依存ライブラリ追加（PR #31 で `@vis.gl/react-google-maps` による Vercel build 45:22 timeout を経験済。dead-code + 依存ゼロが本線）

## 2. Stage Gate 定義

| Stage | 内容 | 完了 PR / 手順 | Gate criteria |
|-------|------|----------------|---------------|
| **Stage 1** | Flag infra（env + allowlist parser） | PR #31 c1 (`323e1319`) | flag OFF default + allowlist 空で TS/test green |
| **Stage 2** | Dead-code landing（MorningMapView + wiring + analytics + docs） | PR #34 (M1) / #35 (M2) / #36 (M3) / **#(M4 本 PR)** | ①flag OFF / ②browser key 未投入 / ③allowlist 空 の 3 状態で **実発火ゼロ** |
| **Stage 3** | Preview canary（browser key 発行 + Preview env ON + CEO 手動検証） | M5（CEO 手動実行） | Preview で `/` 開き MorningMapView 実描画確認 + `script_loaded=succeeded` 観測 |
| **Stage 4** | Production canary（allowlist に CEO + 1 テスター UUID） | M6（CEO 手動実行） | 3 日間観測で下記 §4 advancement criteria 達成 |
| **Stage 5** | Global ON | M7（CEO 手動実行） | Stage 4 で criteria 達成 + rollback 不要と CEO 判断 |

## 3. Stage 3 手順（Preview canary）

**担当**: CEO（環境変更は CEO 固有権限）

### 3.1 Browser API key 発行

1. Google Cloud Console → APIs & Services → Credentials → Create Credentials → API key
2. Application restrictions: **HTTP referrers**
   - Preview: `*.vercel.app/*`
   - Production: `https://<prod-domain>/*`
3. API restrictions: **Maps JavaScript API のみ**
4. Quotas: Maps JavaScript API > Map loads per day を初期 **1,000 に制限**（canary 想定流量の 10 倍程度）
5. Preview 用と Production 用で **別キー** を発行（障害時の切り分け、restriction が異なる）

### 3.2 Vercel env 投入

- Vercel Project Settings → Environment Variables
- Preview only に以下を投入（Production には未投入のまま）:
  - `NEXT_PUBLIC_ALTER_MORNING_MAPS_BROWSER_KEY` = (Preview key)
  - `ALTER_MORNING_VISUAL_FLOW` = `false`（まだ global ON しない）
  - `ALTER_MORNING_VISUAL_FLOW_ALLOWLIST` = `<CEO UUID>`（Preview でも allowlist で動作確認）

### 3.3 検証手順

Preview URL で `/` にログインし:
1. MorningPlanCard の下に map が描画される
2. pin が 2 個以上表示される
3. `stargazer_analytics` で以下を確認:
   - `visual_flow_flag_evaluated` (flag_source=`allowlist`)
   - `visual_flow_script_loaded` (status=`succeeded`, duration_ms < 3000)
   - `visual_flow_map_mounted` (pin_count ≥ 2, fit_bounds_mode=`bounds` または `single_fallback`)
4. Network タブで `maps.googleapis.com/maps/api/js` が 200 で返る

### 3.4 Stage 3 → Stage 4 advance 条件

- 上記 3.3 の 4 項目すべて PASS
- `visual_flow_gate_rejected` の発生率 ≤ 10%（= 大半のユーザーで map が実描画される）
- Preview build 時間が PR-13 導入前と比較して +60 秒以内

## 4. Stage 4 手順（Production canary）

**担当**: CEO（env 変更）+ Build Unit（観測）

### 4.1 env 投入

- Vercel Project Settings → Environment Variables (Production)
  - `NEXT_PUBLIC_ALTER_MORNING_MAPS_BROWSER_KEY` = (Production key)
  - `ALTER_MORNING_VISUAL_FLOW` = `false`（global OFF 維持）
  - `ALTER_MORNING_VISUAL_FLOW_ALLOWLIST` = `<CEO UUID>,<1 テスター UUID>`
- **Redeploy 必須**（env 変更は deploy 時にしか反映されない）

### 4.2 観測期間

**3 日間**。以下 metrics を `stargazer_analytics` で追跡:

| metric | 計算式 | 目標 |
|--------|--------|------|
| flag_evaluated 件数 | `event='visual_flow_flag_evaluated' AND flag_source='allowlist'` | ≥10（canary 対象ユーザーの利用頻度確認） |
| script_loaded 成功率 | `succeeded / (succeeded + failed)` | ≥ 95% |
| map_mounted / flag_evaluated ratio | `map_mounted count / flag_evaluated count` | ≥ 70%（gate_rejected が多い場合は原因調査） |
| gate_rejected 分布 | `reason` ごとの件数 | `no_browser_key` = 0 / `insufficient_pins` ≤ 30% |
| Vercel build 時間 | dashboard | PR-13 導入前 ±60 秒以内 |

### 4.3 Stage 4 → Stage 5 advance 条件

上記 4.2 の 5 項目すべて達成 + CEO 判断で「rollback 不要」。

### 4.4 Rollback triggers（即時）

以下のいずれかで **即時 rollback**（Vercel env で `ALTER_MORNING_VISUAL_FLOW_ALLOWLIST` を空文字に変更 → redeploy、10-15 分サイクル）:

- `script_loaded.failed` が 24h で 10 件以上
- `map_mounted` が 24h で 0 件（= 何か根本的に壊れた）
- `visual_flow_*` 関連の runtime error が Sentry に 5 件以上
- UI 崩れ・layout shift に関するユーザー報告

## 5. Stage 5 手順（Global ON）

**担当**: CEO

- Vercel Production env
  - `ALTER_MORNING_VISUAL_FLOW` = `true`
  - `ALTER_MORNING_VISUAL_FLOW_ALLOWLIST` = `(空のまま or 削除)`
- Redeploy
- 観測: §4.2 の 5 metric を引き続き追跡、特に **script_loaded 成功率** と **Maps JS API quota 残高** を毎日チェック

## 6. 観測 event 仕様（M4 で実装）

すべて `feature="alter_morning_visual_flow"` で `stargazer_analytics` に insert される。

### 6.1 `visual_flow_flag_evaluated`（server）

- **場所**: `app/(culcept)/page.tsx`
- **発火条件**: `resolveVisualFlowFlagSource(user.id)` が `"allowlist"` or `"global"` の時のみ（= flag ON のユーザーのみ）
- **metadata**: `{ flag_source: "allowlist" | "global" }`

### 6.2 `visual_flow_gate_rejected`（client）

- **場所**: `components/home/morning/MorningMapView.tsx`
- **発火条件**: MorningMapView が `visualFlowEnabled=true` で render された後、`browserKey` 未設定 or `pins.length < 2` で早期 null return する時
- **metadata**:
  - `{ reason: "no_browser_key" }` — browser key 未投入で render を諦めた
  - `{ reason: "insufficient_pins", pin_count: number }` — 有効座標を持つ event が 2 未満

### 6.3 `visual_flow_script_loaded`（client）

- **場所**: `components/home/morning/MorningMapView.tsx`
- **発火条件**: Google Maps JS API script の `onload` / `onerror`
- **metadata**:
  - `{ status: "succeeded", duration_ms: number }`
  - `{ status: "failed" }`

### 6.4 `visual_flow_map_mounted`（client）

- **場所**: `components/home/morning/MorningMapView.tsx`
- **発火条件**: `fitBounds` / `setCenter` + markers 作成が完了した直後
- **metadata**: `{ pin_count: number, fit_bounds_mode: "bounds" | "single_fallback" }`

## 7. dead-code landing の 4 層 gate（M3+M4 merge 後）

M4 merge 時点でも、以下 4 層のどれかで gate されれば map は絶対に描画されず、analytics event も発火しない。

| 層 | 条件 | 現状 |
|----|------|------|
| L1 | `ALTER_MORNING_FLAGS.visualFlow(user.id) === false` → page.tsx で `visualFlowEnabled=false` → MorningMapView の dynamic import 自体が fire しない | ✅ flag OFF default |
| L2 | `events.length < 2` → MorningPlanCard が MorningMapView を render しない | — (events 依存) |
| L3 | `NEXT_PUBLIC_ALTER_MORNING_MAPS_BROWSER_KEY` 未投入 → MorningMapView が null 返却 | ✅ key 未投入 |
| L4 | `pins.length < 2` (座標欠損) → MorningMapView が null 返却 | — (data 依存) |

M4 merge 時点で L1 + L3 が gate するため、**`visual_flow_flag_evaluated` / `_gate_rejected` / `_script_loaded` / `_map_mounted` の 4 event すべて発火ゼロ**。`stargazer_analytics` テーブルに visual_flow 関連 row が 0 件であることが Stage 2 完了の定義。

## 8. 関連 PR / commit

- PR #31 Stage 1 c1 — flag infra (`323e1319`)
- PR #34 M1 — pure helpers + tests (`8d0ce253`)
- PR #35 M2 — MorningMapView body (`6419c68c`)
- PR #36 M3 — wiring (`342136a5`)
- PR **#(M4)** — analytics + `.env.example` + 本 doc（本 PR）

## 9. 参照

- flags.ts: `lib/alter-morning/dialog/flags.ts` §PR-13 (L211-223, L393-400)
- 先例 rollout plan: `docs/alter-morning-pr12-production-rollout-plan.md`（PR-12.5 canary の Stage 定義を踏襲）
- MEMORY.md: `W3-PR-13` entries
