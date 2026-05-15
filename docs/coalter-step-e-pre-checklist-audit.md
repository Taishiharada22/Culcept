# CoAlter Step E Pre-Checklist Audit

**作成日**: 2026-05-15
**ステータス**: docs-only audit、runtime / code 変更なし
**起草 branch**: `docs/coalter-pre-impl-readiness-batch` (Batch-B の 2/3)

## §0 本書の position

### §0.1 目的

CoAlter **Step E (Production observation)** 開始前の pre-checklist を整理し、shadow / observe / canary / production flip の条件を **audit material** として明確化する。各 mode enum (Gap 4 / Travel / Daily / Activity) と Step E (movie 既存) の rollout 統合戦略を decision-ready 状態にする。

**audit completion ≠ decision completion ≠ implementation completion** (CEO 2026-05-15 補正、PR #127 §0 継承):
- 本 audit は **claude 整理結果**、CEO 採用判断ではない
- Step E 開始 timing そのものを決定するものではない

### §0.2 Source-of-truth Hierarchy

- **Tier 1**: `docs/coalter-implementation-plan-mainstream.md` §4 (E-1/E-2/E-3 既存定義) + §5 (kill switch 地図)
- **Tier 1**: PR #103 (`coalter-d2e3-external-deps-design-review.md`) §10 (Step E 開始 11 条件)
- **Tier 1**: PR #127 Audit 1 §7 (5 段階 rollout、Step E 統合 timing)
- **Tier 1**: B-2 audit (本 Batch-B 1/3、Cross-PR Flag Consolidation)
- **Tier 2**: PR #123-#126 各 rollout sections

### §0.3 制約

- ❌ runtime 実装 / lib / src / tests / package / migration 変更
- ❌ env / production 変更 / Step E 開始 / bug1 cleanup / Stargazer pivot
- ❌ Master Design 本体更新
- ✅ docs-only audit material 整理

---

## §1 Step E の役割と段階 (claude 整理結果)

### §1.1 Step E 既存定義 (mainstream plan §4)

**正本**: `docs/coalter-implementation-plan-mainstream.md` §4 (D-1 完了で E-1 並走可、D-3 完了で E-2 canary 可、E-2 合格で E-3 本番 flip 審議)

| Phase | 内容 | env flag (movie 専用既存) | 観測対象 | gate |
|---|---|---|---|---|
| **E-1** | B-6 shadow 観測 | `COALTER_UNDERSTANDING_SHADOW_MOVIE=true` | U1-U5 (M0 gate) | U1 ≥ 95% / U2 ≥ 90% / U3 ≥ 0.6 / U4 ≤ 5s / U5 ≥ 95% |
| **E-2** | live integration canary | `COALTER_THREE_STAGE=true` for limited pairs | H1-H5 品質 gate | H1 ≥ 55% / H2 ≥ 75% / H3 ≥ 60% / H4 ≤ 10% / H5 手動 PASS |
| **E-3** | 本番 flip 審議 | `COALTER_THREE_STAGE=true` for 全 user | CEO 審議材料 | CEO 承認 |

### §1.2 Step E 開始 11 条件 (PR #103 §10、provider 関連追加)

`docs/coalter-d2e3-external-deps-design-review.md` §10:

| # | 条件 | 状態 |
|---|---|---|
| 1-8 | 旧 doc §10 維持 | 各 sub-phase 完了状態に依存 |
| 9 | provider compliance verify 完了 (Primary + Secondary) | ❌ a 完了後 |
| 10 | 出典 URL 表示 UI 実装完了 | ❌ a4 phase |
| 11 | provider 月次 cost 監視 dashboard 完成 | ❌ Step E-0-1 |

合計 11 条件、**全充足で Step E 開始可** (movie 既存設計)。

### §1.3 Step E は movie domain 専用既存設計 (重要)

**重要事実 (claude grep 確認)**:
- 上記 11 条件 + E-1/E-2/E-3 は **movie domain 専用** (`COALTER_UNDERSTANDING_SHADOW_MOVIE` / `COALTER_THREE_STAGE` 等で実装)
- Gap 4 / Travel / Daily Dispatch / Activity の rollout は **mainstream plan §4 で扱われていない**
- PR #123-#126 で各 mode enum (`off`/`observe`/`live`) 提案、Step E pattern と類似

→ 本 audit は **Step E 既存 movie pattern を全 domain に generalize** する設計を提示。

---

## §2 段階案 (Step E-0 / E-1 / E-2 / E-3) の generalization

### §2.1 generalized Step E phase (claude 整理結果、5 domain 共通)

| Phase | movie 既存 | 5 domain への generalize |
|---|---|---|
| **Step E-0** | Production reflection 前準備 (PR #103 §10 条件 11、provider 月次 cost dashboard) | **5 domain 共通**: observability infrastructure (telemetry / Sentry / cost log) 整備 |
| **Step E-1** | B-6 shadow (`COALTER_UNDERSTANDING_SHADOW_MOVIE`、Preview 限定) | **5 domain 共通**: 各 mode enum を `observe` に切替、Preview / production telemetry 並走、UI 非表示 |
| **Step E-2** | live canary (`COALTER_THREE_STAGE=true` for limited pairs) | **5 domain 共通**: 各 mode enum を `live` + allowlist (CEO 1 test pair → 5 → 50) |
| **Step E-3** | 本番 flip (CEO 審議必須) | **5 domain 共通**: `live` mode + 全 user、CEO 戦略判断 |

→ **Step E pattern を 5 enum 全 domain で再利用**、observability infra を共有することで運用 simple 化 (CEO 認知負荷 5 domain 別 → 1 共通 pattern)。

### §2.2 各 mode enum と Step E phase の mapping

B-2 audit §4.2 順次 flip 推奨順序と整合:

| domain | Step E-0 | Step E-1 (observe) | Step E-2 (live + allowlist) | Step E-3 (live + 全 user) |
|---|---|---|---|---|
| Gap 4 (Layer 5) | observability infra 整備 | `COALTER_GAP4_CONTEXT_DETECTION_MODE=observe` | `live` + allowlist | `live` + 全 user |
| Movie (既存) | provider compliance + UI + cost dashboard | `COALTER_UNDERSTANDING_SHADOW_MOVIE=true` | `COALTER_THREE_STAGE=true` for limited pairs | `COALTER_THREE_STAGE=true` for 全 user |
| Travel | T7 phase 着手前 | `COALTER_TRAVEL_DOMAIN_MODE=observe` | `live` + allowlist | `live` + 全 user |
| Daily Dispatch | DD6 phase 着手前 | `COALTER_DAILY_DISPATCH_MODE=observe` | `live` + allowlist | `live` + 全 user |
| Activity | AD6 phase 着手前 | `COALTER_ACTIVITY_DOMAIN_MODE=observe` | `live` + allowlist | `live` + 全 user |

→ 5 domain 全て **同 4 phase pattern** で rollout。

---

## §3 Gap 4 (PR #123) observe mode との関係

### §3.1 Gap 4 observe = Step E-1 shadow と同思想

- PR #123 §6.5 D5 phase: `observe` mode で detector + telemetry のみ、variant 発火 0
- Step E-1 shadow: 実 user 環境で実行するが本流挙動に影響 0、telemetry 収集

→ **同思想、用語のみ異なる**。本 audit で **Step E-1 = observe mode** と統一表記推奨。

### §3.2 Gap 4 D6 calibration phase = Step E observation period

- PR #123 §6.5 D6 phase: 1-2 週間 telemetry 観測、threshold τ calibrate
- Step E observation: U1-U5 / H1-H5 gate 測定

→ **同思想、observability infra 共有可**。

### §3.3 Gap 4 D7 LIVE = Step E-2/E-3

- PR #123 §6.5 D7 phase: `live` mode で実 variant 発火、canary rollout
- Step E-2/E-3: canary → 本番 flip

→ **同思想**、`live` mode の allowlist 段階で Step E-2 / 全 user で Step E-3。

---

## §4 telemetry / Sentry / logging 方針 (claude 整理結果)

### §4.1 統一 telemetry schema (B-2 audit §2.2 継承)

各 event に共通 tag attach:

```
sentry.tag({
  coalter_domain: "gap4" | "movie" | "travel" | "daily" | "activity",
  coalter_mode: "off" | "observe" | "live",
  coalter_step_e_phase: "e-0" | "e-1" | "e-2" | "e-3",
});
```

→ 5 domain 全て同 schema、dashboard で `coalter_step_e_phase` filter で全 domain の rollout 進捗一覧可。

### §4.2 既存 telemetry infrastructure (claude 確認)

| infra | 状態 |
|---|---|
| Sentry telemetry | ✅ 既存、`lib/coalter/presence/telemetry.ts` 等 |
| Supabase `coalter_provider_cost_log` table | 設計のみ (PR #122 §6.3 #4)、impl 未 |
| `[CoAlter] understanding.diagnostics` log | ✅ 既存 (movie M0 gate 用) |
| `[CoAlter] movie.stage3.diagnostics` log | ✅ 既存 (movie E-2 用) |
| 5 mode enum mode tag attach | ❌ 未実装 (B-2 audit Phase 3) |

→ 既存 infra **大部分活用可能**、追加実装は mode tag attach のみ。

---

## §5 raw prompt / PII / user data を出さない方針 (claude 整理結果)

### §5.1 既存 redaction 実績 (PR #108)

**正本**: PR #108 `feat(sentry): OP-5.5 prereq-4 server-side strict redaction (Option D + scope op5_only)` (2026-05-12 merged)

→ server-side strict redaction が既存実装済、telemetry / Sentry に PII / raw prompt を出さない infrastructure 確立。

### §5.2 Step E 観測での適用方針 (claude 整理結果、CEO 承認待ち)

| 観測対象 | 出力 | 隠す対象 |
|---|---|---|
| ✅ mode 値 (off / observe / live) | tag attach | — |
| ✅ event count / 発火率 / latency | metric | — |
| ✅ confidence score (Gap 4 7 fields) | metric | — |
| ❌ user message raw text | 出さない | PII 含可能 |
| ❌ pair-specific identifier | hash / anonymize | pair_id raw 露出回避 |
| ❌ provider API response raw | 出さない | citation URL のみ allowed |
| ❌ candidate raw rationale text | 集計のみ、raw text 出さない | user pair preferences 含可能 |

→ telemetry は **数値 + tag のみ**、raw text は redaction 強制。既存 PR #108 infrastructure を **5 domain 全て**に適用。

---

## §6 canary 条件 (claude 整理結果)

### §6.1 canary 段階 (5 domain 共通推奨)

| 段階 | 対象 user | mode 値 | 期間 | 移行条件 |
|---|---|---|---|---|
| **canary-0** (内部) | CEO + claude (1 test pair) | `live` + pair-scoped allowlist | 1-3 day | 致命的 bug 0 |
| **canary-1** (狭) | 5 pair (CEO 招待) | `live` + allowlist | 1 week | gate 達成、明示 negative feedback 0 |
| **canary-2** (中) | 50 pair | `live` + allowlist | 2 week | gate 達成 + observability stable |
| **flip** (全) | 全 user | `live` | — | CEO 戦略判断、Step E-3 (movie 既存パターン) |

### §6.2 allowlist 実装方針 (claude 整理結果、CEO 承認待ち)

**既存パターン**: Step E-2 `COALTER_THREE_STAGE=true` for limited pairs (mainstream plan §4.2)

**generalization 案**:
- **Option A**: pair-scoped env (各 pair の DB record に flag、environment variable で対象 pair set)
- **Option B**: feature gate (e.g., LaunchDarkly 等の external service、現状未導入)
- **Option C**: CEO 直接設定 (`COALTER_ALLOWLIST_PAIR_IDS="pair1,pair2,..."` env、parse 強化)

**推奨**: Option C (既存 env infra 内で完結、外部 service 不要、CEO ops 簡潔)。

### §6.3 各 domain の canary 順序

B-2 audit §4.2 推奨順序と整合:

```
Phase 1: Gap 4 canary-0/1/2 → flip
Phase 2: Movie Step E E-1/E-2/E-3 (既存)
Phase 3: Travel canary-0/1/2 → flip
Phase 4: Daily Dispatch canary-0/1/2 → flip
Phase 5: Activity canary-0/1/2 → flip
```

→ **順次 canary**、相互ブロックなし、各 phase 独立 rollback 可。

---

## §7 rollback 条件 (claude 整理結果)

### §7.1 3-stage rollback (5 domain 共通)

B-2 audit §6.1 継承:

| 状況 | rollback action | 効果 |
|---|---|---|
| `live` で致命的 bug 検出 | env mode 値変更: `live` → `observe` | 即座 variant 発火停止、telemetry 継続 (原因分析可) |
| `observe` でも問題 (detector 自体 bug) | env mode 値変更: `observe` → `off` | 完全停止、影響範囲 0 |
| 全段階で | env 値変更のみ、code 変更不要 | redeploy / hot-reload で即反映 |

### §7.2 rollback trigger 条件 (claude 整理結果、CEO 承認待ち)

| trigger | criteria | action |
|---|---|---|
| 致命的 user-facing bug | 1 件以上検出 | 即座 `live` → `observe` |
| 性能劣化 | latency p95 > +50ms vs baseline | `live` → `observe`、原因分析 |
| ペア negative feedback | 5 件以上累積 / canary-1 (5 pair) で 30% 以上 | `live` → `observe`、design 再検討 |
| Sentry error rate | base rate × 2 以上 | `live` → `observe` |
| canary 期間 gate 未達 | 期間内 gate 不達 | 次段階 hold、observation 期間延長 or redesign |

---

## §8 production flip 条件 (claude 整理結果)

### §8.1 Step E-3 (本番 flip) 条件 (5 domain 共通)

mainstream plan §4.3 + claude generalization:

| 条件 | 内容 |
|---|---|
| 1 | canary-2 (50 pair / 2 week) gate 達成 |
| 2 | observability stable (Sentry / cost log / telemetry green) |
| 3 | rollback procedure 確認済 (env hot-reload で即停止可)|
| 4 | CEO 戦略判断 + decision-log 記録 |
| 5 | (movie 専用) 旧実装 (webConnector parseMovieScreenings 等) の削除時期案 |
| 6 | 人手 QA レポート (CoAlter 存在論 §0.5 整合) |

### §8.2 CEO 審議材料 (mainstream plan §4.3 継承 + claude 拡張)

| # | 材料 |
|---|---|
| 1 | E-1 (observe) 実測結果 (各 gate metric) |
| 2 | E-2 (canary) 実測結果 + 構造 gate コードレビュー |
| 3 | rollback procedure 確認結果 |
| 4 | narration 一貫性人手 QA (CoAlter 存在論整合) |
| 5 | per-domain canary 期間 + observation period |
| 6 | (推奨) 他 domain の進捗 (5 domain 全体俯瞰) |

---

## §9 CEO 判断必要な項目 (claude 整理結果)

### §9.1 戦略判断要項

| # | 項目 | 判断時期 |
|---|---|---|
| 1 | Step E pattern を 5 domain に generalize する方針承認 | 本 audit merge 時 |
| 2 | 順次 rollout 順序 (B-2 §4.2 推奨) 承認 | 本 audit merge 時 |
| 3 | canary 段階 (0/1/2/flip) と allowlist 実装 (Option C 推奨) 承認 | Phase 0 (本 audit) 後 |
| 4 | rollback trigger 条件 5 件承認 | impl Phase 開始時 |
| 5 | observability infra 共有戦略承認 | Step E-0 開始時 |
| 6 | 各 domain の canary 期間判断 | 各 domain rollout 時 |
| 7 | 本番 flip CEO 審議 (per-domain) | 各 domain canary-2 完了時 |

### §9.2 実装前に満たすべき gate

| Gate | 内容 | 状態 |
|---|---|---|
| G1: Cross-PR Flag Consolidation audit merged | B-2 audit (本 Batch-B 1/3) | ⚠ 本 PR で並走、merge 後完了 |
| G2: Step E pre-checklist audit merged | 本 audit (B-3) | ⚠ 本 PR で並走、merge 後完了 |
| G3: `CoalterDomainMode` 共通型 + parser 実装 | B-2 §6.2 Phase 1 | ❌ 別 PR |
| G4: 各 mode enum env 追加 | B-2 §6.2 Phase 2 | ❌ 別 PR (per-domain) |
| G5: telemetry mode tag attach 実装 | B-2 §6.2 Phase 3 | ❌ 別 PR (per-domain) |
| G6: observability infra (Sentry / cost log / Supabase) 整備 | Step E-0 | ⚠ 部分既存、cost log 未 |
| G7: per-domain impl 完了 (Gap 4 D7 / Travel T7 / Daily DD6 / Activity AD6) | 各 phase 別 PR | ❌ 全 domain 未着手 (Movie 部分完) |
| G8: rollback procedure 整備 | impl Phase 開始時 | ❌ 未整備 |

→ **G3-G8 が prereq**、5 domain rollout 開始までの道のり明示。

---

## §10 推奨順序 1 案 (claude 整理結果、CEO 承認待ち)

### §10.1 短期 (低 risk、docs-only autonomous)

1. **本 Batch-B (B-2/B-3/B-4) merge** — Cross-PR flag + Step E pre-checklist + Master Design v1.2 必要性 audit material 整理完了

### §10.2 中期 (CEO 承認後、impl Phase)

2. **Phase 1**: `CoalterDomainMode` 共通型 + `parseDomainMode` 関数 (B-2 §6.2、pure types + parser、runtime 0)
3. **Phase 2**: 各 mode enum env 追加 (B-2 §6.2、default `off`)
4. **Phase 3**: telemetry mode tag attach (B-2 §6.2、observability 拡張)
5. **Step E-0**: observability infrastructure 整備 (cost log Supabase migration、provider compliance verify)

### §10.3 長期 (CEO 戦略判断、per-domain rollout)

6. **Gap 4 D2-D7 + Step E-1/E-2/E-3** (Layer 5 reach 解消、最優先)
7. **Movie Step E (既存 mainstream plan §4 path)** (Path α/β 5 段階 rollout、PR #127 Audit 1)
8. **Travel T1-T7 + Step E-1/E-2/E-3** (新 domain)
9. **Daily Dispatch DD1-DD6 + Step E-1/E-2/E-3** (cross-axis dispatch)
10. **Activity AD1-AD6 + Step E-1/E-2/E-3** (Daily 核心 use case)

---

## §11 まだやらない (本 audit scope 外)

- ❌ Step E 開始 (任意 phase、CEO 戦略判断後の別 PR)
- ❌ Step E-0 observability infrastructure impl
- ❌ canary allowlist 実装
- ❌ rollback procedure impl
- ❌ 5 mode enum env 追加 (B-2 §6.2 Phase 2)
- ❌ telemetry mode tag attach (B-2 §6.2 Phase 3)
- ❌ Supabase migration (cost log 等)
- ❌ env / Production env / Vercel deploy 操作
- ❌ Anthropic Console / API key / 実 API call
- ❌ bug1 cleanup / Stargazer pivot
- ❌ Master Design 本体更新
- ❌ 本 doc の merge (CEO 判断)

---

## §12 CEO 判断請求 (本 audit 結論)

1. **Step E pattern の 5 domain generalization 採用判断** — movie 専用 E-1/E-2/E-3 を全 domain に適用
2. **段階案 (Step E-0 / E-1 / E-2 / E-3) 承認** — claude 整理 4 phase
3. **canary 段階 (0/1/2/flip) + allowlist Option C (env-based) 採用判断**
4. **rollback trigger 条件 5 件承認** — 致命的 bug / 性能劣化 / negative feedback / Sentry error rate / canary gate 未達
5. **observability infra 共有戦略採用判断** — Sentry / Supabase cost log / 既存 telemetry log の 5 domain 共有
6. **G1-G8 prereq gate 確認** — 各 domain rollout 開始までの道のり承認
7. **長期推奨順序 (§10.3) 採用判断** — Gap 4 → Movie → Travel → Daily Dispatch → Activity の 5 phase 順次
