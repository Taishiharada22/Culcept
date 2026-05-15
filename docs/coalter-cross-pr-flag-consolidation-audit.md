# CoAlter Cross-PR Flag Consolidation Audit

**作成日**: 2026-05-15
**ステータス**: docs-only audit、runtime / code 変更なし
**起草 branch**: `docs/coalter-pre-impl-readiness-batch` (Batch-B の 1/3)

## §0 本書の position

### §0.1 目的

PR #123-#127 で **個別に提案された 5 mode enum** (Gap 4 / Travel / Daily / Activity / Step E) を **横断整理し、実装前に統一方針 (audit material)** を整理する。実装着手前に **off / observe / live の意味統一 + parser 思想統合 + telemetry tag 標準化** を確定することで、impl 段階での事故を構造的に防ぐ。

**audit completion ≠ decision completion ≠ implementation completion** (CEO 2026-05-15 補正、PR #127 §0 継承):
- 本 audit は **claude 整理結果**であり、CEO 採用判断ではない
- 採用 / 不採用 / 修正 の最終判断は **CEO 承認待ち**
- 「推奨」「望ましい」等の表現は **claude 側の判断材料提示**

**重要 — merge の意味 (CEO 2026-05-15 補正)**:
- 本 PR の merge は、本 audit material を **正本化し、main に保存**することを意味する。
- merge ≠ claude 推奨案 (Alt B+C ハイブリッド等) を CEO が採用した、ではない。
- 各 audit の推奨案は、**別途 CEO 採用判断が必要**。

### §0.2 Source-of-truth Hierarchy

- **Tier 1**: PR #123 (`78cf93b6`) §6.4 / PR #124 (`fa8f301b`) §11.1 / PR #125 (`3de29349`) §6 / PR #126 (`27b6102d`) §10.1 / PR #127 (`31f0c7f4`) Audit 1 §5
- **Tier 1**: `docs/coalter-implementation-plan-mainstream.md` §4 (Step E 段階)
- **Tier 2**: 既存 `lib/coalter/flags.ts` + `lib/coalter/presence/smokeContextOverride.ts` (whitelist parser 既存パターン)
- **Tier 2**: 既存 `lib/coalter/presence/types.ts` (PresenceMode 既存 enum 設計)

### §0.3 制約

- ❌ runtime 実装 / lib / src / tests / package / migration 変更
- ❌ env / production 変更 / Step E 開始 / bug1 cleanup / Stargazer pivot
- ❌ Master Design 本体更新
- ✅ docs-only audit material 整理 (decision-ready 状態)

---

## §1 5 PR で提案された mode enum 一覧

### §1.1 全 5 mode enum (claude 整理結果)

| # | env key | 提案 PR | 担当 layer | 状態 |
|---|---|---|---|---|
| 1 | `COALTER_GAP4_CONTEXT_DETECTION_MODE` | PR #123 §6.4 | Layer 5 (Layout / UpperLayer) variant 発火 | 設計のみ |
| 2 | `COALTER_TRAVEL_DOMAIN_MODE` | PR #124 §11.1 | Domain (travel) | 設計のみ |
| 3 | `COALTER_DAILY_DISPATCH_MODE` | PR #125 §6 | Presence Mode × Domain dispatch | 設計のみ |
| 4 | `COALTER_ACTIVITY_DOMAIN_MODE` | PR #126 §10.1 | Domain (activity) | 設計のみ |
| 5 | (Step E rollout mode) | mainstream plan §4 + PR #127 Audit 1 §5 | Domain (movie、shadow → canary → flip) | 部分実装 (`COALTER_THREE_STAGE` 等が既存) |

### §1.2 各 enum の値定義 (claude 整理結果)

**5 enum 全て共通**:

| 値 | 意味 | runtime 影響 |
|---|---|---|
| `off` | 完全停止 (default) | 0 (detector 走らない、response field 省略) |
| `observe` | detection + telemetry のみ、UI 露出 / variant 発火なし | 0 (state 不変、observability のみ) |
| `live` | canary / allowlist 下で UI 露出 / variant 発火許可 | + (実 user reach) |

→ **5 enum で共通設計**、ただし **個別 env で運用**。

---

## §2 共通設計思想 (claude 整理結果)

### §2.1 enum exact match parser (whitelist + fail-closed)

**既存 reference**: `lib/coalter/presence/smokeContextOverride.ts` の `isSmokeContextOverrideEnabled` (`exact "true" only accept`、`"1"` / `"yes"` / `"TRUE"` 大文字 等 truthy は全て false)

**5 enum への適用**:

```
parseMode(raw: string | undefined): "off" | "observe" | "live" {
  if (raw === "off") return "off";
  if (raw === "observe") return "observe";
  if (raw === "live") return "live";
  return "off"; // fail-closed (unknown / typo / accidental truthy 全て off)
}
```

**重要な構造的防御**:
- `"LIVE"` (大文字) → `off` (production accidental `live` 防止)
- `"1"` / `"true"` / `"yes"` → `off` (boolean 互換性なし、enum 厳密)
- `""` (空文字) → `off`
- 未設定 → `off`
- typo (`"livee"`, `"obeerve"` 等) → `off`

→ smoke harness 思想を 5 enum で **完全統合**、CEO 認知負荷 5→1 (1 parser で全 enum 対応)。

### §2.2 mode tag telemetry (claude 整理結果)

各 telemetry event に **現 mode tag を attach** することで:
- Sentry dashboard で mode 分布可視化
- observability event 別 mode 統計
- canary / flip 直後の挙動変化検出

```
sentry.tag({
  coalter_domain: "gap4" | "travel" | "daily" | "activity" | "movie",
  coalter_mode: "off" | "observe" | "live",
});
```

**統一 schema**:
- `coalter_domain` = どの domain の event か (5 enum 識別)
- `coalter_mode` = 現 mode 値 (3 値)

→ 5 PR で個別に提案された telemetry を **同 schema で統一**、dashboard / runbook 共通化可。

---

## §3 個別 env vs 共通型の比較 (claude 整理結果)

### §3.1 設計 alternative 3 案

| Alt | 設計 | pros | cons |
|---|---|---|---|
| **A: 個別 env、parser 重複** | 5 別 env、各 parser 個別実装 | domain 別 tune が独立 | parser logic 5 個重複、保守負荷高、整合性管理 CEO 認知負荷 |
| **B: 個別 env、共通 parser** | 5 別 env、共通 `parseDomainMode(raw)` 関数 | parser 1 個、env 別 tune | env 名は domain-specific だが logic は統合 |
| **C: 共通型 + 共通 parser** | `CoalterDomainMode` 共通 enum 型、各 domain で同型を使う | 型レベルで unify、TypeScript 厳密 | env は依然 domain 別、共通型 import 関係増 |

### §3.2 claude 推奨 (audit 整理結果、CEO 承認待ち)

**推奨: Alt B + Alt C のハイブリッド**:

```typescript
// lib/coalter/types.ts (共通型、AD1 phase 着手 target)
export type CoalterDomainMode = "off" | "observe" | "live";

export function parseDomainMode(raw: string | undefined): CoalterDomainMode {
  if (raw === "off") return "off";
  if (raw === "observe") return "observe";
  if (raw === "live") return "live";
  return "off"; // fail-closed
}
```

```typescript
// lib/coalter/flags.ts に追加 (各 phase 別 PR で着手)
export const COALTER_FLAGS = {
  // ...
  get gap4ContextDetectionMode(): CoalterDomainMode {
    return parseDomainMode(process.env.COALTER_GAP4_CONTEXT_DETECTION_MODE);
  },
  get travelDomainMode(): CoalterDomainMode {
    return parseDomainMode(process.env.COALTER_TRAVEL_DOMAIN_MODE);
  },
  get dailyDispatchMode(): CoalterDomainMode {
    return parseDomainMode(process.env.COALTER_DAILY_DISPATCH_MODE);
  },
  get activityDomainMode(): CoalterDomainMode {
    return parseDomainMode(process.env.COALTER_ACTIVITY_DOMAIN_MODE);
  },
  // Step E 用は domain-specific (movie はすでに COALTER_THREE_STAGE 等が分散)
};
```

**推奨理由**:
- 型レベル unify = TypeScript で誤代入を構造的に防止
- parser 1 個 = parser logic 統合
- env 別 = domain 別 tune (per-domain rollout 可能)
- 既存 `COALTER_THREE_STAGE` movie 系 flag は **Step E 段階別** で別設計、共通化対象外 (mainstream plan §5 既存)

### §3.3 trade-off 提示 (CEO 採用判断材料)

| 観点 | Alt B + C ハイブリッド (推奨) | 個別 env のみ (Alt A) | 完全統合 1 env (例: `COALTER_DOMAIN_MODES="gap4=live,travel=observe,..."`) |
|---|---|---|---|
| Per-domain rollout | ✅ 可 | ✅ 可 | ⚠ 1 env で複合管理、parser 複雑 |
| Parser 統合 | ✅ 1 関数 | ❌ 5 重複 | ✅ 1 関数 (ただし内部複雑) |
| TypeScript 型安全 | ✅ 共通型 | ⚠ 各 domain で type 重複 | ⚠ value parse 必要 |
| accidental cross-domain flip | △ env 別なので 1 つずつ操作 | ✅ env 別 | ❌ 1 env で全 domain 影響リスク |
| CEO 認知負荷 | 中 (5 env、共通型) | 大 (5 env、5 parser) | 大 (1 env、複合 syntax) |
| 既存 smoke harness 思想統合 | ✅ exact match parser 再利用 | ⚠ 個別に書き直し | ⚠ 個別実装 |

→ **Alt B + C ハイブリッド推奨**。CEO 採用判断時に **完全統合 1 env** に揃える選択肢も残す。

---

## §4 rollout orchestration (claude 整理結果)

### §4.1 5 enum の順次 flip vs 同時 flip

CEO 判断材料:

| 戦略 | 内容 | リスク | 価値 |
|---|---|---|---|
| **順次 flip** (推奨) | 1 enum ずつ `observe` → `live`、各段階で観測 | 低 (per-domain rollback 可) | observability 段階確保 |
| 同時 flip | 5 enum 一括 `live` | 高 (cross-domain 干渉 unclear) | 短期 ROI |

### §4.2 順次 flip 推奨順序 (claude 整理結果、CEO 承認待ち)

```
Phase 1 (基盤): Gap 4 observe → live (Layer 5 reach 解消)
Phase 2 (domain): Movie Step E shadow → canary → flip (既存 Path α/β rollout)
Phase 3 (greenfield): Travel observe → live (新 domain)
Phase 4 (核心): Daily Dispatch observe → live (cross-axis dispatch)
Phase 5 (補助): Activity observe → live (Daily 内 activity)
```

**理由**:
- Gap 4 (Layer 5) は全 Domain の reach 基盤、最優先
- Movie は scaffold + provider foundation 完了済、Step E 開始 ready
- Travel は greenfield、impl 完了後に rollout
- Daily Dispatch は Activity 完了が前提
- Activity は MVP scope 限定、最後

### §4.3 一括 flip 禁止 / canary / allowlist 方針

**claude 整理結果 (CEO 承認待ち)**:

| 項目 | 方針 |
|---|---|
| **一括 flip 禁止** | 5 enum 同時 `live` 設定は **CEO 厳禁**、accidentally 防止のため env value exact match parser で構造化 |
| **canary 段階** | `live` mode + allowlist (CEO 1 test pair → 5 pair → 50 pair → 全 user) |
| **allowlist 実装** | pair-scoped env or feature gate (Step E E-2 で確立済パターン継承) |
| **rollback path** | `live` → `observe` (即座 variant 発火停止、telemetry 継続) → `off` (完全停止) |

---

## §5 各 PR との詳細整合性確認 (claude grep 結果)

### §5.1 PR #123 (Gap 4) との整合

`docs/coalter-gap4-production-context-detection.md` §6.4 で確定:
- `COALTER_GAP4_CONTEXT_DETECTION_MODE = "off" | "observe" | "live"`
- exact match parser、fail-closed default `off`
- 各 telemetry event に現 mode tag attach
- D5 OBSERVE phase + D6 calibration + D7 LIVE rollout

→ 本 audit の Alt B + C ハイブリッド推奨と **完全整合**。

### §5.2 PR #124 (Travel) との整合

`docs/coalter-travel-domain-greenfield-design.md` §11.1 で確定:
- `COALTER_TRAVEL_DOMAIN_MODE` (PR #123 同思想)
- T7 phase で production observation、Gap 4 / Daily Dispatch / Activity と同 mode enum 統合

→ 本 audit と整合。

### §5.3 PR #125 (Daily Dispatch) との整合

`docs/coalter-daily-domain-dispatch-design.md` §6 で確定:
- `COALTER_DAILY_DISPATCH_MODE` (同思想)
- DD6 phase で production observation

→ 本 audit と整合。

### §5.4 PR #126 (Activity) との整合

`docs/coalter-activity-domain-mapping.md` §10.1 で確定:
- `COALTER_ACTIVITY_DOMAIN_MODE` (同思想)
- AD6 phase

→ 本 audit と整合。

### §5.5 Step E (mainstream plan §4) との関係

mainstream plan §4 既存:
- E-1 shadow (`COALTER_UNDERSTANDING_SHADOW_MOVIE=true`)
- E-2 canary (`COALTER_THREE_STAGE=true` for limited pairs)
- E-3 本番 flip

→ Step E は **movie 専用の段階 rollout**、本 audit の 5 enum 統合とは **目的が異なる**:
- 5 enum 統合 = 全 domain で共通 mode 設計
- Step E = movie domain の段階 rollout 既存設計

**統合提案**: Step E E-1/E-2/E-3 を `COALTER_GAP4_CONTEXT_DETECTION_MODE` 同思想で **rewrite** 可能。ただし既存 `COALTER_THREE_STAGE` / `COALTER_UNDERSTANDING_SHADOW_MOVIE` を破壊しない (backward compat 必須)。

→ **Step E movie 既存 flag は維持、新 5 enum と並走**。長期で統合を検討 (B-3 audit で詳述)。

---

## §6 推奨 1 案 (claude 整理結果)

### §6.1 統一方針 (CEO 採用判断材料)

| 項目 | 推奨 (claude 整理結果) |
|---|---|
| **enum 値** | `"off" \| "observe" \| "live"` 共通 |
| **enum 型** | `CoalterDomainMode` 共通型 (lib/coalter/types.ts) |
| **parser** | `parseDomainMode(raw)` 共通関数、exact match whitelist + fail-closed `off` |
| **env 名** | domain-specific (`COALTER_<DOMAIN>_<PURPOSE>_MODE`) |
| **telemetry tag** | `coalter_domain` + `coalter_mode` 統一 schema |
| **rollout 順序** | Gap 4 → Movie Step E → Travel → Daily Dispatch → Activity (順次 `observe` → `live`) |
| **一括 flip 禁止** | enum 値 exact match parser で構造的防御 |
| **canary 段階** | `live` mode + allowlist (1 → 5 → 50 → 全 user) |
| **rollback path** | 3-stage (`live` → `observe` → `off`) |
| **既存 Step E flag** | 維持、新 5 enum と並走、長期統合検討 |

### §6.2 後続 phase 提案

| Phase | 内容 | CEO 承認 |
|---|---|---|
| **Phase 0 (本 PR)** | docs-only audit、推奨方針整理 | merge 判断 |
| Phase 1 | `CoalterDomainMode` 共通型 + `parseDomainMode` 関数を `lib/coalter/types.ts` に追加 (pure types + pure parser、runtime 影響 0) | 承認 |
| Phase 2 | 各 domain 個別 flag を `flags.ts` に追加 (default `off`、env 不在で完全停止) | 承認 |
| Phase 3 | 各 domain で telemetry tag attach 実装 | 承認 |
| Phase 4 | 順次 rollout (Gap 4 から開始、各 phase で CEO 判断) | **CEO 戦略判断** |

---

## §7 まだやらない (本 audit scope 外)

- ❌ `CoalterDomainMode` 型 / `parseDomainMode` 関数 実装 (Phase 1 別 PR)
- ❌ 各 mode enum env 追加 (Phase 2 別 PR)
- ❌ telemetry tag attach 実装 (Phase 3 別 PR)
- ❌ 順次 rollout (Phase 4、CEO 戦略判断後)
- ❌ Step E rewrite (既存 movie flag 並走維持)
- ❌ env / Production env / Vercel deploy 操作
- ❌ Anthropic Console / API key / 実 API call
- ❌ Supabase migration
- ❌ Step E 開始 / bug1 cleanup / Stargazer pivot
- ❌ Master Design 本体更新

---

## §8 CEO 判断請求 (本 audit 結論)

1. **Alt B + C ハイブリッド推奨の採用判断** — `CoalterDomainMode` 共通型 + `parseDomainMode` 共通 parser + domain-specific env 名
2. **順次 flip 戦略の採用判断** — Gap 4 → Movie Step E → Travel → Daily Dispatch → Activity の rollout 順序
3. **既存 Step E flag (movie 専用) の扱い** — 維持並走 (推奨) vs 長期統合 vs 即時 rewrite
4. **telemetry tag 統一 schema 採用判断** — `coalter_domain` + `coalter_mode` 統一
5. **canary allowlist 実装 timing** — pair-scoped env 既存パターン継承
