# W3-PR-12 Production Rollout Plan

**作成日**: 2026-04-24
**base**: `main` @ `36b3db4e` (W3-PR-12 merge 後)
**前提**: PR-12 live verification 合格 (preview, 2026-04-24)

---

## 0. 位置づけ — PR-12 固有の flag は追加していない

PR-12 は既存 flag `ALTER_MORNING_DIALOG_STATE_V2` / `ALTER_MORNING_PLACES_SEARCH` の **ON 時の振る舞いを修正**するものであり、新規 flag は導入していない。従って rollout 対象は：

- **PR-12 固有**: なし
- **Wave 3 全体（DialogState v2 + Places Search）の production 有効化**: 未実施

**CEO の「段階的に」方針は、Wave 3 全体の production 有効化を指す。**

---

## 1. 現状 flag / env 実態

### Flag 定義
| Flag (env key) | 役割 | 型 | 既定 |
|---|---|---|---|
| `ALTER_MORNING_DIALOG_STATE_V2` | DialogState v2 経路の kill switch | bool (global) | `false` |
| `ALTER_MORNING_PLACES_SEARCH` | Places handoff gate (AND with above) | bool (global) | `false` |
| `ALTER_MORNING_TRANSPORT_V2` | PR-10 canonical transport (PR-12 無関係) | bool + allowlist | `false` |
| `GOOGLE_MAPS_API_KEY` | Google Places API key (AND 前提) | secret | — |

### 現 Vercel env state (2026-04-24 07:30 JST 確認)
| env | DIALOG_STATE_V2 | PLACES_SEARCH | GOOGLE_MAPS_API_KEY |
|---|---|---|---|
| Production | (未設定 → false) | (未設定 → false) | **未設定** |
| Preview | `true` (2h ago) | `true` (2h ago) | **未設定** |
| Local (.env.local) | — | `true` | **設定済み** |

### 制約
- DIALOG_STATE_V2 / PLACES_SEARCH には **allowlist 機構なし** (global on/off のみ)
- TRANSPORT_V2 のみ allowlist 実装済み (PR-10 参考)
- Places API key が無い状態で PLACES_SEARCH=true にすると `[places-handoff:provider_failure] reason=api_key_missing` を毎回叩く (機能上 NO-OP だが log 汚染)

---

## 2. Rollout Stage 設計 (CEO 承認前提)

### Stage 0 — Preview real-data verification (NEXT)
**目的**: preview で `[places-handoff:presented_from_api]` or `presented_from_cache` or `zero_from_api` を少なくとも 1 本捕捉する。現状は `api_key_missing` で gate 手前停止。

**アクション**:
1. CEO 承認: `GOOGLE_MAPS_API_KEY` を preview env に設定（外部 API key、予算枠内）
2. 設定後、`/tmp/pr12_harness.mjs` を再実行 → log 確認
3. 期待: `[places-handoff:presented_from_api]` または `zero_from_api`
4. 異常時: provider error 種別を分類 (quota / referer / schema) し diagnosis

**完了条件**: 1 件以上の `presented_*` / `zero_*` ログ捕捉。

**工数**: CEO 承認 + 10 分 (env 設定 + harness 再実行)。

**CEO 承認事項**: ✅ 外部 API key の preview 投入

---

### Stage 1 — Production canary infrastructure (2026-04-24 CEO F2 承認、実装進行中)
**目的**: DIALOG_STATE_V2 + PLACES_SEARCH に allowlist 機構を追加し、production で「狙ったユーザーだけ」ON にできる状態を作る。A1 同梱方針で観測イベント 2 本もこの PR に同梱。

**背景**:
- 現状この 2 flag は global。production で true にした瞬間、**全ユーザーが DialogState v2 経路に突入**する
- 異常時の kill switch は flag を false に戻す → 次の deploy 待ち (10-15 分)
- 先行 PR (PR-10 Scope A) と同じ canary pattern を採用することで「失敗しても限定的」にできる

**branch**: `feat/alter-morning-pr125-allowlist-canary`

**commit 構成** (現時点):
- ✅ C1 (`ff3b972a`): `flags.ts` を method 化 + allowlist 解決。`resolveDialogStateV2FlagSource` / `resolvePlacesSearchFlagSource` を公開
- ✅ C2 (`36879d76`): call site 4 箇所 (route.ts:1762/2006/2077/2256) + ensureSessionV1 signature に userId 伝播
- ✅ C3 (`a364fc28`): `handoffAnalytics.ts` 新設 + StargazerEvent に 2 event 追加 + route.ts 2 箇所で emit 配線 + unit test 21 本
- 🟡 C4 (進行中): 本 doc 更新 + decision-log 追記

**新 env keys** (production 投入は Stage 2 で):
- `ALTER_MORNING_DIALOG_STATE_V2_ALLOWLIST` (CSV of userId)
- `ALTER_MORNING_PLACES_SEARCH_ALLOWLIST` (CSV of userId)
- 既存の `ALTER_MORNING_DIALOG_STATE_V2` / `ALTER_MORNING_PLACES_SEARCH` (bool) は global fallback として保持

**3 段優先順位 (transport_v2 と同一 pattern)**: `test override > allowlist > global`

**観測イベント** (A1 同梱):
- `alter_morning_shadow_state`: `[dialog-state-v2:shadow]` 相当の構造化版
- `alter_morning_handoff_outcome`: `[places-handoff:*]` 相当の構造化版、outcome.kind 別 metadata (candidate_count / provider_reason / skip_reason / latency_ms)

**完了条件**: unit test green (+21 tests 追加済 / 1960 PASS) + preview で allowlist 動作確認。

**工数**: 実装 + テスト 完了（C1-C3）。残は C4 docs + PR raise + preview verify。

**CEO 判断事項**: ✅ F2 (2026-04-24) で Stage 1 PR 着手承認済。

---

### Stage 2 — Production canary (CEO + 内部協力者)
**目的**: production で少数ユーザーのみ Wave 3 path を有効化し、実データで KPI を取る。

**前提**:
- Stage 0 完了
- Stage 1 完了 (allowlist 機構) または CEO が global ON を受容

**アクション (Stage 1 実施版)**:
1. production env に追加:
   - `GOOGLE_MAPS_API_KEY` (secret)
   - `ALTER_MORNING_DIALOG_STATE_V2_ALLOWLIST=<CEO userId>,<internal userIds>`
   - `ALTER_MORNING_PLACES_SEARCH_ALLOWLIST=<CEO userId>,<internal userIds>`
   - (global flag は false のまま)
2. CEO + 協力者 3 名が自然会話で morning flow を踏む
3. 観測項目 (stargazer_analytics を想定):
   - `[places-handoff:*]` 分布 (presented_from_api / cache / zero / provider_failure)
   - `[dialog-state-v2:shadow]` ready=1 率
   - handoff 成功時の candidate 数 (0 / 1 / 2-5 / 6+)
   - median latency (route total)
   - 異常率 (status_not_handoff 再発)
4. 最低 3 日観測

**完了条件**:
- presented_from_api / presented_from_cache の合計 ≥ 5 件
- provider_failure ≤ 10%
- zero_from_api が発生した場合、原因が fingerprint vague (= 機能 OK) か確認
- status_not_handoff 0 件 (PR-12 効果検証)

**工数**: CEO 承認 + 10 分 (env 設定) + 3 日観測。

**CEO 承認事項**: ✅ Places API key の production 投入、✅ 内部 3 名の userId 共有

---

### Stage 3 — Production global ON
**目的**: Wave 3 path を全ユーザーに有効化。

**前提**: Stage 2 の KPI が全通過、異常 0 件、zero_from_api 原因が明確。

**アクション**:
1. production env で:
   - `ALTER_MORNING_DIALOG_STATE_V2=true`
   - `ALTER_MORNING_PLACES_SEARCH=true`
   - allowlist は残しておく (kill switch 兼 canary 継続観測用)
2. 72 時間 high-touch 監視 (log tail)
3. 観測:
   - user-level error rate
   - handoff 成功率 (全 user 分母)
   - Places API 月次予算消化率
4. 異常時の kill switch: global flag を false に戻す → 再 deploy

**完了条件**: 7 日連続 KPI 安定。

**工数**: CEO 承認 + 1 週間監視。

**CEO 承認事項**: ✅ 全ユーザー有効化

---

## 3. Minimum Path (Stage 1 skip オプション)

CEO が「canary 機構追加の工数を払わずに最速で本番 ON したい」場合の代替パス:

```
Stage 0 → Stage 2' (直接 global ON で CEO + 協力者のみ実機確認) → Stage 3'
```

- リスク: 異常時に kill switch = global flag false → 10-15 分 deploy 待ち
- 利点: 工数ゼロ
- 条件: CEO 実機で不具合ゼロを確信できること

**推奨しない理由**: Wave 3 path は新規コード量が多く (DialogState v2 + reducer + shadow + handoff + Places API 連携)、global ON で初めて露出するエッジケースがある可能性が高い。allowlist canary のコストは PR-10 実装済みパターンの踏襲で 2-4 時間、リスクに見合う。

---

## 4. 決定事項 / 判断待ち

### ✅ CEO 承認済 (2026-04-24)
- PR #28 merge (main HEAD: `36b3db4e`)
- Wave 3 production 本番 ON は段階的に進める
- **B1 → Stage 1 実施** (F2 承認 2026-04-24): allowlist canary PR `feat/alter-morning-pr125-allowlist-canary` 着手
- **B2 → preview 先行** (F1 条件付き 2026-04-24): env 名コード確認済 (`GOOGLE_MAPS_API_KEY` 正。Places/Routes API 共用)。preview 投入は PR merge 後 or 並行実施可
- **B3 → 候補ロール整理先行** (2026-04-24): 内部協力者の氏名指名はしない。Role B/C の条件整理のみ実施
- **B4 → 既存スキーマで開始** (2026-04-24): `stargazer_analytics` (user_id, event, feature, metadata jsonb) で足りる。Admin dashboard 統合は別 PR (A2)
- **A1 → Stage 1 PR に同梱** (2026-04-24): `alter_morning_handoff_outcome` + `alter_morning_shadow_state` の 2 event を PR-12.5 に同梱
- **B5 → main 非汚染 redeploy** (2026-04-24): main への empty commit 回避。`npx vercel redeploy --target preview` or `npx vercel deploy --target preview` を使用
- **C1 → 手動 SQL OK** (2026-04-24): Supabase SQL Editor で日次実行
- **D1/D2/D3 → Role 条件整理 + 軽量 NDA** (2026-04-24): Role B 内部 engineer、Role C beta tester 含める、NDA は「観測実施通知 + 外部共有禁止」の軽量版
- **E1 → 暫定 β** (2026-04-24): Stage 2 の Role B は CEO 兼務で進める。内部 engineer 確保次第差し替え可
- **E3 → 現文面 OK** (2026-04-24): 軽量 NDA 提示文案で進む。通知 channel は DM、終了通知は Stage 2 終了時

### 🟡 CEO 判断待ち
- **E2**: Role C 最終指名 — 比較表 (`hikariharada86@icloud.com` vs `zawane0903@gmail.com`、C-1/C-2/C-4 観点) を別 turn で提示 → CEO が指名

### 🔴 未着手
- comprehension 側の event-scoped where clarify が出にくい問題 (#29 として切り出し済。PR-12 本体とは独立タスク)

---

## 5. 付録: PR-12 の live verification 証拠

**Deployment**: `dpl_7V7dgmCXtcF2Si2euH6f9Uc85DV6` / `culcept-qbq4p1mqg-taishis-projects-0a8deb17.vercel.app`
**Trace**: `a406cac691b2fd01ee0b83b7a83919af`
**Timestamp**: 2026-04-24 07:12:39 JST

```
[dialog-state-v2:targetEventId] prev_focus=event_1_harness nextPending=event_2_harness
  chosen=event_2_harness eventChanged=1 reason=prev_phase_not_clarifying_plan_presented

[dialog-state-v2:shadow] status=search_handoff_blocking narrowStep=2 ready=1
  derived_kind=null phase_unchanged=plan_presented user_facing_promoted=0

[places-handoff:provider_failure] reason=api_key_missing fp=pf:v1|a=新宿|ch=マック|cat=-
```

Artifacts: `/tmp/pr12_harness.mjs` (driver), `/tmp/vercel_logs.json` (3 decisive logs)

Fingerprint `a=新宿|ch=マック` は `buildSeedCaptureFromEvent` → `classifyUtterance` → reducer eventChanged branch → draft → orchestrator の連鎖が preview で実際に踏まれた直接証拠。
