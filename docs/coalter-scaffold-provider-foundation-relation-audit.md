# CoAlter Scaffold × Provider Foundation 関係 Audit

**作成日**: 2026-05-15
**ステータス**: docs-only audit、runtime / code 変更なし
**起草 branch**: `docs/coalter-implementation-unblock-audit-batch` (Batch-A の 1/3)

## §0 本書の position

### §0.1 目的

PR #102 (structural scaffold) と PR #110-#119 (provider foundation) の関係を整理し、**Path α (scaffold flags ON)** と **Path β (provider foundation a3 wiring)** が:
- 競合する 2 経路なのか
- 並走可能な layered architecture なのか
- どちらが本流か

を **実コード一次資料** から確定する。PR #121 (decision doc) で「Path α vs Path β」と framing したが、本 audit で両者の本質的関係を再確定する。

### §0.2 Source-of-truth Hierarchy

main merge 済 commit / PR > 実コード > 最新 docs > memory > 古い docs。

### §0.3 制約

- ❌ runtime 実装 / lib / src / tests / package / migration 変更
- ❌ env / production 変更 / Step E 開始 / bug1 cleanup / Stargazer pivot
- ✅ docs-only audit

---

## §1 PR #102 (Structural Scaffold) 完了 scope

**正本**: PR #102 (`dddfd664`、2026-05-11 merged) の 10 commits 一次資料

| Commit SHA | 内容 | files 主要追加 |
|---|---|---|
| `f32c9209` | D-1-a Query Derivation | `lib/coalter/movie/queryDerivation.ts` |
| `f9208c55` | D-1-b Candidate Pool | `lib/coalter/movie/candidatePool.ts` |
| `feece2ba` | D-1-c Curator (664 lines) | `lib/coalter/movie/curator.ts` |
| `ab8fd8af` | D-1-d UI 連携 + `movieCuratorLiveEnabled` flag | (flag 追加 + UI wiring) |
| `d103a612` | D-2-a theaterResolver | `lib/coalter/movie/theaterResolver.ts` |
| `2d06a503` | D-2-b adjacency | `lib/coalter/movie/adjacencyTable.ts` |
| `dd393e93` | D-2-c tier2_fail narration | `lib/coalter/movie/tierFailNarration.ts` |
| `089295ff` | D-2-d Stage 3 Prefetch | `lib/coalter/movie/stage3Prefetch.ts` |
| `318f009f` | D-2-e1 scaffold + `COALTER_THREE_STAGE` flag intro | `lib/coalter/movie/threeStagePipeline.ts` (新規) |
| `6e1ec5f4` | D-2-e2 `COALTER_THREE_STAGE` grand kill switch wiring | (orchestratorAdapter additive) |

### §1.1 PR #102 が完了したもの

- ✅ Stage 1 Understand (M0) — 別 PR (PR #97 handoff) で完了
- ✅ Stage 2 Curate (D-1-a〜D-1-d): queryDerivation / candidatePool / curator / UI 連携
- ✅ Stage 3 Resolve (D-2-a〜D-2-d): theaterResolver / adjacency / tier2_fail / Prefetch
- ✅ Three-stage pipeline (D-2-e1〜D-2-e2): threeStagePipeline + adapter + grand kill switch flag
- ✅ Flags: `movieCuratorLiveEnabled` (D-1-d) + `threeStageEnabled` (D-2-e2) **両方 default OFF**

### §1.2 PR #102 が完了していないもの

- ❌ **provider 接続**: scaffold は **provider interface に依存しない** (実コード grep で確認、`threeStagePipeline.ts` は provider 直接 import なし)
- ❌ **真の retrieval source**: scaffold curator は **既存 webConnector / LLM client** に依存、新規 provider 経路なし

→ PR #102 scaffold は **構造完了 + flags OFF**。flags ON にすると scaffold pipeline が起動するが、**retrieval は既存 webConnector** (legacy 経路) を使う。

---

## §2 PR #110-#119 (Provider Foundation) 完了 scope

**正本**: PR #110-#119 (`6dc32899` → `bc758e96`、2026-05-12〜2026-05-15) の commit history + `lib/coalter/movie/providers/` 配下

| PR | 内容 | 完了要素 |
|---|---|---|
| #110 (a0) | provider-agnostic pure foundation | `MovieRetrievalProvider` interface、`ProviderRetrievalInput/Output` type |
| #111 (a1 design) | real connection design review (docs-only) | — |
| #112 (a1a) | Anthropic provider mock-only scaffold | `anthropicProvider.ts` 新規、mock-only |
| #113 (a1b) | extractTheaters 構造化抽出 (P1 JSON + P2 regex) | candidate parsing logic |
| #114 (a1d) | Anthropic cost estimate | `costEstimateCents` field |
| #115 (a1e) | Source Candidate semantic separation | `SourceCandidate` 型導入 (Citation と分離) |
| #116 (a1f) | cache token observability + cost accuracy | `tokenCacheCreate` / `tokenCacheRead` fields |
| #117 (a1g) | inference_geo observability | `inferenceGeo` field + geoMultipliers hook |
| #118 (a1h) | pricing snapshot multi-model (Opus/Sonnet/Haiku) | pricing model expansion |
| #119 (a1i) | WebSearch error observability | `webSearchErrorCount` / `webSearchLastErrorCode` |

### §2.1 Provider Foundation が完了したもの

- ✅ `MovieRetrievalProvider` interface (`lib/coalter/movie/providers/types.ts:50`)
- ✅ Anthropic provider scaffold (`anthropicProvider.ts`、**mock-only**)
- ✅ `ProviderRawDiagnostics` 9 fields (token / cost / cache / inference_geo / WebSearch error)
- ✅ `Citation` / `SourceCandidate` 型分離
- ✅ `safeProviderCall` / `costGuard` / `citationNormalizer` / `providerSelector` utilities

### §2.2 Provider Foundation が完了していないもの (D-2-e3-a 凍結要素)

- ❌ **a1-impl-1c**: BudgetUsageProvider Supabase 接続
- ❌ **a1-impl-2**: OpenAI scaffold
- ❌ **a1-impl-3**: EXA scaffold
- ❌ **a2**: env flag (`COALTER_PROVIDER` 等の選択 flag)
- ❌ **a3**: `movieOrchestrator` wiring (scaffold と provider 接続)
- ❌ **a4**: citation UI design

→ Provider Foundation は **interface + mock-only impl 完了**、real API 接続なし、scaffold との wiring なし。

---

## §3 R6 theaters=[] fallback との関係

**正本**: `lib/coalter/movie/areaExpansion.ts:25` + `:105` (一次資料)

R6 fallback = Tier 2 失敗時の挙動:
- `state: "tier2_fail"`, tier=2, **theaters=[]**, foundAtArea=null

これは **scaffold (PR #102) で完了済の Stage 3 Resolve 経路**:
- scaffold Stage 3 (theaterResolver + areaExpansion + tierFailNarration) で theater 取得失敗時の fallback narration を担保
- provider 接続有無に関わらず、scaffold は R6 fallback を持つ

→ R6 fallback は scaffold layer の責務、provider foundation layer とは **独立**。

---

## §4 Scaffold と Provider Foundation の Layered Architecture

### §4.1 実コード grep ベースの確認

```
[user input]
  ↓
[Stage 1 Understand: lens 生成、別 phase で完了]
  ↓
[Stage 2 Curate: queryDerivation → candidatePool → curator]
  ↓ (candidatePool が retrieval を呼ぶ — ここが provider 接続点)
[Stage 3 Resolve: theaterResolver → areaExpansion → tierFailNarration]
  ↓
[narration output]
```

**Provider 接続点**: candidatePool が retrieval を呼ぶ箇所 (scaffold layer 内、provider foundation を import しない設計)。

実コード `threeStagePipeline.ts` は **provider を直接 import しない** (grep で 0 hits)。代わりに **DI 経由 `CuratorLLMClient` + `TheaterResolverDeps`** で抽象化済。

### §4.2 結論: Layered, not Competing

| Layer | 担当 | 完了 PR | flags |
|---|---|---|---|
| **Layer A: Pipeline Structure** | three-stage pipeline + S0-S8 logic | PR #102 (scaffold) | `movieCuratorLiveEnabled` + `threeStageEnabled` |
| **Layer B: Retrieval Source Abstraction** | provider interface + observability | PR #110-#119 (foundation) | (mock-only、flag なし) |
| **Layer C: Real Wiring (未実装)** | scaffold と provider を接続 | **a3 wiring (未着手)** | (env flag 設計中) |

→ Path α と Path β は **competing 2 routes ではなく、Layered architecture の 2 layer**。a3 wiring (Layer C) で両者統合。

---

## §5 PR #121 で framed された Path α vs Path β の再定義

PR #121 §3 (candidate A-E comparison) では:
- **候補 A**: PR #102 scaffold flags ON 経路
- **候補 B**: PR #110-#119 provider foundation a3 wiring 経路

これは **構造的誤解** を含む。本 audit で再定義:

| 経路 | 真の意味 | 実用可能性 |
|---|---|---|
| **Path α (flags ON のみ)** | scaffold pipeline 起動 + 既存 webConnector retrieval (legacy) | ⚠ 可能だが limited (legacy retrieval continues) |
| **Path β (a3 wiring + flags ON)** | scaffold pipeline 起動 + provider foundation 経由新 retrieval | ⚠ 真の future-proof、ただし a1-impl-1c / a2 / a3 凍結解除必要 |
| **Path γ (新規発見)**: flags ON without a3 + a4 citation UI | scaffold pipeline 起動 + 旧 retrieval + UI 改修 | ⚠ 短期 ROI、retrieval 変えずに UI 拡張 |

→ Path α は **「scaffold 観測開始」** の意味、Path β は **「provider 経由 real retrieval 接続」** の意味。**両者は competing ではなく、Path β は Path α を内包**する。

### §5.1 推奨順序

1. **Step A (低 risk)**: Path α 部分実行 = scaffold flags ON で `movieCuratorLiveEnabled` だけ ON、`threeStageEnabled` は OFF 維持 → Stage 2 Curate 観測のみ、Stage 3 は legacy 経路
2. **Step B (中 risk)**: `threeStageEnabled` ON → 三段式 pipeline 完全起動、retrieval は既存
3. **Step C (中 risk)**: a1-impl-1c / a2 / a3 凍結解除 → provider 接続 (Path β 完成)
4. **Step D (中 risk)**: a4 citation UI 接続 (Path γ 完成)
5. **Step E**: 観測 shadow → canary → 本番 flip (mode enum rollout、PR #123/#124/#125 と統合)

→ **Path α と Path β は順次着手**、競合ではない。Step A→B→C→D→E の **5 段階 rollout** が本流。

---

## §6 movieOrchestrator / flags / ProviderSelector との関係

| file | 状態 | 着手 phase |
|---|---|---|
| `lib/coalter/movieOrchestrator.ts` | 既存、PR #102 scaffold が adapter 経由で呼ぶ | **a3 wiring で touch (未着手)** |
| `lib/coalter/flags.ts` | `movieCuratorLiveEnabled` / `threeStageEnabled` 既存 (default OFF) | **a2 で env flag 追加 (未着手)** |
| `lib/coalter/movie/providers/providerSelector.ts` | 既存、`ProviderId = "anthropic" \| "openai" \| "exa"` | **a3 wiring 時に env flag → ProviderSelector 接続** |

→ a2 + a3 が phase で 1 unit、両者完了で Path β 起動。

---

## §7 推奨着手順序 (CEO 戦略判断材料)

### §7.1 短期 (低 risk、即着手可能)

- **Step A**: `movieCuratorLiveEnabled` のみ ON (Stage 2 観測)
- 影響: shadow 並走 (CEO X1+Y1+P1 設計)、本流影響ゼロ
- rollback: env 変数 OFF

### §7.2 中期 (CEO 判断後、中 risk)

- **Step B**: `threeStageEnabled` ON → 三段式 pipeline 完全起動
- **Step C**: a1-impl-1c (BudgetUsageProvider Supabase) + a2 (env flag) + a3 (movieOrchestrator wiring)
- **Step D**: a4 citation UI (Product Unit 連携)

### §7.3 長期 (Step E)

- **Step E**: 観測 shadow → canary → 本番 flip (mode enum rollout 統合)

---

## §8 まだやらない (本 audit scope 外)

- ❌ Path α / β / γ 実行 (CEO 戦略判断後の別 PR)
- ❌ movieOrchestrator / flags / ProviderSelector touch
- ❌ env 変更 / Production env 変更
- ❌ a1-impl-1c / a2 / a3 / a4 着手
- ❌ Step E 開始 / bug1 cleanup / Stargazer pivot

---

## §9 CEO 判断請求 (本 audit 結論)

1. **Path α vs Path β の再定義承認** — competing 2 routes ではなく Layered architecture、Path β は Path α を内包
2. **5 段階 rollout (Step A→B→C→D→E) 推奨順序承認** — 短期 Step A (低 risk shadow 観測) → 中期 Step B-D → 長期 Step E
3. **Step A 着手 timing 判断** — `movieCuratorLiveEnabled` ON shadow 観測の env 変更承認 (env flag 1 個変更、code 変更なし)
4. **a3 wiring 凍結解除 timing 判断** — Step C で a1-impl-1c / a2 / a3 を一括解除するか、段階解除するか
