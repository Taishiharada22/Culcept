# CoAlter Daily × Domain Cross-Axis Dispatch 設計 docs

**作成日**: 2026-05-15
**ステータス**: docs-only design draft、runtime / code 変更なし
**起草 branch**: `docs/coalter-daily-domain-dispatch-design`
**前提**:
- PR #120 (`0d925e0c`、original plan completion audit v2) main 反映済
- PR #121 (`df00a8f3`、runtime integration priority decision) main 反映済
- PR #122 (`a9f27d44`、normal/daily/travel audit、**3-Axes Orthogonal 確立**) main 反映済
- PR #123 (`78cf93b6`、Gap 4 production context detection design) main 反映済
- PR #124 (`fa8f301b`、Travel domain greenfield design、**1-2 泊国内 MVP**) main 反映済
- 候補 G-3 (Daily × Domain cross-axis dispatch design) として CEO directive 受領 (2026-05-15)

## §0 本書の position

### §0.1 目的

CoAlter 全体完了に向けて、**Daily mode が機能的意味を持つ状態**を実現する設計を確定する。本書は実装ではなく、**Daily × Domain cross-axis dispatch 全体 architecture 確定 + 推奨案 1 確定 + phase 分解**までを範囲とする。

PR #122 §1.4 で発見:
- **Daily / Travel mode は UI chip 切替 + escalation/return logic のみ**で、各 mode が **どの Domain に紐づくか** は明示的に未定義
- `modeRouter.ts` (Action Mode 判定) は CoAlterMode = decision/negotiate/clarify のみ判定し、PresenceMode は判定対象外
- `coalterDispatch.ts` で Action Mode × Domain の組合せが触れるが、**Presence Mode × Domain の組合せ logic は未**
- → Daily mode に入っても「Daily の food (今夜何食べる?)」なのか「Daily の movie (今夜何見る?)」の routing 不在

本書は **Presence Mode × Domain の cross-axis dispatch layer を初めて設計**する。

### §0.2 Source-of-truth Hierarchy (PR #120-#124 §0.2 継承)

| Tier | 種別 | 本書での扱い |
|---|---|---|
| 1 | **main merge 済 commit / PR** | **最上位正本**、SHA + PR# + date 記録 |
| 2 | 実コード (`lib/` / `app/`) | file 存在 / type 定義 / function export を grep 実証 |
| 3 | 最新 docs | Tier 1/2 と整合する範囲で参照 |
| 4 | memory / project memory | 補助参照 |
| 5 | 古い docs / 古い handoff | Tier 1/2 で書き換えられている前提 |

**衝突時の rule**: 古い doc が「未着手」と書いていても main 反映 commit がある場合は main を優先。

### §0.3 制約再確認 (CEO directive 2026-05-15)

- ❌ runtime 実装 / lib / src / tests / package / migration 変更
- ❌ ChatClient / UpperLayerMount / flags / ProviderSelector / movieOrchestrator / foodOrchestrator 修正
- ❌ env 変更 / Production env 変更 / Vercel deploy 操作
- ❌ Anthropic Console / Google Places / 楽天 / じゃらん 等 API key 取得 / 接続
- ❌ Supabase migration 新規追加 / 既存 migration touch
- ❌ Step E 開始 / bug1 cleanup / Stargazer pivot
- ❌ 本 doc の merge (CEO 判断)
- ✅ docs-only autonomous (claude 自律進行)

---

## §1 問題定義: Daily mode の機能薄問題

### §1.1 現状実態 (一次資料、PR #122 §1.4 / §2.2 継承)

| 要素 | 状態 | file path |
|---|---|---|
| `PresenceMode` 識別子 | ✅ 存在 (`"normal" \| "daily" \| "travel"`) | `lib/coalter/presence/types.ts:56` |
| ModeSwitcher UI chip | ✅ 本番 (Stage 4 L4-f) | `app/components/chat/ModeSwitcher.tsx` |
| modeReducer 遷移 logic | ✅ Stage 2 完了 (manual + auto escalation) | `lib/coalter/presence/modeReducer.ts` |
| modeContextManager | ✅ Stage 2 完了 | `lib/coalter/presence/modeContextManager.ts` |
| modeEscalationDetector | ✅ Stage 2 完了 | `lib/coalter/presence/modeEscalationDetector.ts` |
| modeReturnLogic | ✅ Stage 2 完了 | `lib/coalter/presence/modeReturnLogic.ts` |
| AutoEscalationBanner / ModeReturnPrompt | ✅ production code 完了 | `app/components/chat/` |
| **Daily mode × Domain dispatch logic** | ❌ **完全不在** | (本 PR で設計) |
| **PresenceMode-aware coalterDispatch** | ❌ **完全不在** | `coalterDispatch.ts` は CoAlterMode のみ判定 |

### §1.2 問題の本質

**「Daily mode で食事の話が来たら何が起きるか?」**を実装層で書ける logic がない:

```
[user] "今夜何食べる?"
  ↓
[mode router] Action Mode: decision (Phase 2)
  ↓
[coalterDispatch] theme: food / mode: decision → buildDecisionCard for food
  ↓
[?] foodOrchestrator が呼ばれる
  ↓
[?] でも Daily mode context (今夜 / 緊急性 / 短時間制約) を foodOrchestrator は知らない
```

→ **「Daily の食事」と「通常の食事」を区別できない**。Daily session で過去に決めた選択や疲労、cognitive load を考慮した routing も不在。

### §1.3 Daily mode は単なる UI 状態で終わるリスク

PR #122 §2.2.3:
> Daily mode = 「UI 上の認識装置 + state machine 完了、内容は空」
> ユーザーが chip tap で Daily に切替可能 ✅
> でも Daily mode 中に「今夜何食べる?」と聞いても、Daily-specific orchestration が走らない (movie/food/travel domain の通常 dispatch が走る)

→ Daily の付加価値 (時間制約 / 連続選択 fairness / cognitive load 制御) が **全く実装されていない**。

### §1.4 CoAlter 全体完了との関係

PR #122 §6 集計で、Daily mode が抱える未完了:
- ⚪ Daily domain body 不在
- ⚪ Daily × Domain cross-axis dispatch logic 不在
- ⚪ Gap 4 production context detection (PR #123 で設計済、impl 待ち)

→ G-3 (本 PR) で Daily × Domain dispatch 設計完了 + impl 完了で **2 件解消**、Daily mode が機能的意味を持つ状態へ。

---

## §2 3-Axes Orthogonal 整理 (PR #122 §1 継承 + 細密化)

### §2.1 3 軸の定義 (一次資料)

| Axis | type | 値 | 正本 file |
|---|---|---|---|
| **A: Action Mode** | `CoAlterMode` | `decision \| negotiate \| clarify` (+ future `reflect`) | `lib/coalter/types.ts:89-92` |
| **B: Presence Mode** | `PresenceMode` | `normal \| daily \| travel` | `lib/coalter/presence/types.ts:56` |
| **C: Domain (Theme)** | `ConversationTheme` | `movie \| food \| travel \| schedule \| gift \| activity \| general` | `lib/coalter/types.ts:248` |

### §2.2 3 軸の orthogonality (CEO 判断材料)

- **Action Mode**: 「どう応答するか」 (response 形式)
- **Presence Mode**: 「どの時間軸 / 文脈で扱うか」 (presence context)
- **Domain (Theme)**: 「何の話題か」 (subject area)

これら 3 軸は **互いに独立** = 任意の組合せが意味を持つ:
- (decision, daily, food) = "今夜何食べる" を決定する
- (negotiate, normal, movie) = 映画の選好衝突を第三案で解決
- (clarify, daily, travel) = "週末どこ行く?"の意図確認
- (decision, travel, food) = 旅行中の食事を決める

→ **3-Axes 全 63 組合せ** (3 × 3 × 7)、ただし実用組合せは限定的 (§3 で matrix 化)。

### §2.3 既存実装のカバレッジ (実コード grep ベース)

| Layer | 実装状況 |
|---|---|
| Action Mode 軸 (`modeRouter.ts`) | ✅ 3 mode 完了 + 凍結 (Phase 2 v0.3) |
| Domain 軸 (per-theme orchestrator) | ✅ movie (PR #102 + #110-#119) / food (Phase B 1-4) / travel (PR #124 設計済) / activity・schedule・gift・general (未実装) |
| Action × Domain (coalterDispatch) | ✅ 部分 (decision × movie 中心、theme=movie 以外は fallback) |
| Presence Mode 軸 (modeReducer 等) | ✅ 3 mode UI / state machine 完了 |
| **Presence Mode × Domain (本 PR)** | ❌ **完全不在、本 PR で設計** |
| Action × Presence (mode×mode) | ⚠ 暗黙統合 (両者直交、明示 dispatch なし) |

---

## §3 Daily × Domain Matrix (細密化)

### §3.1 Domain × PresenceMode 適合性 (実用組合せ)

| Domain | normal | **daily (本 PR 焦点)** | travel | 備考 |
|---|---|---|---|---|
| movie | ✅ "今度映画" Phase 1 完了 | ✅ "今夜映画" 適合 | ⚠ 旅行中の映画は薄い | Daily で 2 番手の use case |
| food | ✅ "今度ご飯" Phase B 完了 | ✅ **核心 use case** "今夜何食べる" | ⚠ travel domain に統合可 | **Daily 最頻度** |
| travel | ✅ "次の旅行" PR #124 MVP | ⚠ "週末ちょっと" 軽量旅行 | ✅ "旅行計画" MVP | Daily は限定的 |
| schedule | ✅ "予定調整" | ⚠ "今夜空いてる?" | ⚠ "旅行いつ?" | Daily で頻度中 |
| gift | ✅ "プレゼント" | ⚠ "今日何渡す?" 稀 | × | Daily で頻度低 |
| activity | ✅ "暇つぶし" | ✅ **核心 use case** "今日何しよう" | ⚠ 観光 (travel 統合) | **Daily 最頻度** |
| general | ✅ default | ⚠ default | ⚠ default | fallback |

→ Daily mode で最頻度 domain = **food + activity**。movie/schedule は 2 番手。travel/gift は稀。

### §3.2 Daily mode 内の time-slot × domain selection (Idea 2)

Daily は時間軸が直近、時間 slot で domain affinity が変化:

| Time slot | 第 1 domain | 第 2 domain | 第 3 domain |
|---|---|---|---|
| 朝 (~10 時) | food (朝食) | activity (出かける) | schedule |
| 昼 (10-15 時) | food (昼食) | activity (外出) | movie |
| 夕 (15-19 時) | food (夕食) | activity (買物) | movie (夜) |
| 夜 (19-23 時) | food (晩酌) | movie (夜映画) | activity (テレビ) |
| 深夜 (23 時~) | (sleep) | (避ける) | (避ける) |

→ **time-slot based domain affinity score** を Daily planner が利用。

### §3.3 Daily session の連続性 (Multi-domain dispatch、人間超越 Idea 12)

Daily session = 1 user 動作中に **複数 domain を chain** することがある:

| Pattern | domain chain |
|---|---|
| "夕食 → 映画" | food → movie |
| "散歩 → カフェ" | activity → food |
| "買物 → 食事 → 帰宅" | activity → food → activity |
| "映画 → 食事 → カフェ" | movie → food → activity |

→ Daily plan = **graph** (1 つの活動だけでなく、活動 chain)。movie/food/travel の独立 candidate ではなく、**composite plan** が Daily の本質。

---

## §4 Dispatch Alternatives 比較

### §4.1 4 候補概要

#### Alt A: Daily が直接 Domain orchestrator を呼ぶ (tight coupling)

```
[user input] → DailyMode → switch (inferred theme) {
  case "food":   foodOrchestrator(input, dailyContext)
  case "movie":  movieOrchestrator(input, dailyContext)
  case "travel": travelOrchestrator(input, dailyContext)
}
```

#### Alt B: Daily planner → Domain request → Domain router (loose coupling)

```
[user input] → DailyMode → DailyPlanner.plan(input)
  → { domain: "food", dailyContext, constraints, fairness } as DailyDomainRequest
  → DomainRouter.dispatch(request)
  → foodOrchestrator(request)
```

#### Alt C: Domain 側が Daily context を読んで応答調整 (push-based)

```
[user input] → coalterDispatch (existing) → foodOrchestrator(input)
  → foodOrchestrator が context.presenceMode === "daily" を読む
  → daily-specific behavior (time-slot / fairness / cognitive load)
```

#### Alt D: Hybrid (B + C、CEO 推奨仮説)

```
[user input] → DailyMode → DailyPlanner.plan(input)
  → DailyDomainRequest { domain, dailyContext, constraints }
  → DomainRouter.dispatch(request)
  → foodOrchestrator(request) ← daily context を request 内で受領
```

### §4.2 9 dimensions 比較

| Dim | Alt A Tight | Alt B Planner-Router | Alt C Push-based | **Alt D Hybrid** |
|---|---|---|---|---|
| **runtime risk** | 中 (Daily が Domain 知識持つ) | 中 (router 新規追加) | 低 (既存 dispatch 拡張) | 低 (phase 分割で吸収) |
| **test しやすさ** | 低 (DailyMode test に全 domain mock 必要) | **高 (planner / router / orchestrator 独立 test)** | 中 (Domain test に Daily context mock) | **最高 (各 layer 独立 test 可)** |
| **UI 影響** | 中 (Daily UI が Domain 結果直接 render) | 低 (UI は plan を render) | 低 (UI 変更なし) | 低 (Hybrid、UI は plan を render) |
| **future extensibility** | 低 (新 Domain 追加に Daily 修正必要) | **高 (DomainRouter 拡張のみ)** | 中 (各 Domain 個別拡張) | **最高 (router + push 両方拡張)** |
| **movie/food/travel 適用性** | 中 (各 Domain に Daily-aware logic 必要) | **高 (request shape 統一)** | 中 (各 Domain 個別実装) | **最高 (request + context 統合)** |
| **rollback しやすさ** | 中 (Daily 修正 revert 大) | **高 (router 単体 OFF)** | 中 (各 Domain で個別 OFF) | **最高 (mode enum 共通)** |
| **既存 coalterDispatch との整合** | × (並走 logic、混線リスク) | ⚠ (router 別 layer 追加) | **○ (既存に context 追加)** | ⚠ (router + context 両方) |
| **Daily plan as graph (Idea 9)** | × (Daily が graph 認識) | ✅ (planner が graph 出力) | × (各 Domain は単一 candidate) | ✅ (planner が graph) |
| **Memory continuity (Idea 10)** | △ (Daily が history 知識) | ✅ (planner が history 集約) | △ (各 Domain で個別 history) | ✅ (planner が history) |

### §4.3 Alt D Hybrid 推奨の根拠

1. **Separation of concerns**: Daily planner (graph 構築 / domain infer) ≠ Domain router (dispatch) ≠ Domain orchestrator (candidate 生成) の 3 層分離
2. **既存 coalterDispatch との非破壊統合**: Alt C 部分 (Domain context awareness) を残しつつ、Alt B 部分 (Planner-Router) を追加 = 既存 path を壊さず追加 layer 化
3. **Daily plan as graph 実現**: Alt B / D で planner が graph 出力可能、Alt A / C では困難
4. **Memory continuity 実現**: Alt B / D で planner が history 集約可能
5. **Provider Foundation / Gap 4 / Travel domain 設計と整合**: 各層で純関数 / additive / mode enum の同思想統合 (人間超越 Idea 4 unify)
6. **future-proof**: 新 Domain (例: reflect, future activity 拡張) 追加で router 拡張のみ、Daily 修正不要

→ **Alt D Hybrid を推奨**。

---

## §5 推奨案: Alt D Hybrid 詳細設計

### §5.1 全体 architecture

```
┌──────────────────────────────────────────────────────────────────┐
│ User input (talk message)                                        │
└────────────────────────┬─────────────────────────────────────────┘
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│ ChatClient → UpperLayerMount (既存)                              │
└────────────────────────┬─────────────────────────────────────────┘
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│ /api/coalter/invoke (既存、additive 拡張可能)                    │
│   - presenceMode: PresenceMode を pair state から取得            │
│   - if presenceMode === "daily" → DailyPlanner 経路              │
│   - if presenceMode === "travel" → TravelOrchestrator 経路       │
│   - else (normal) → coalterDispatch 既存 path                    │
└────────────────────────┬─────────────────────────────────────────┘
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│ DailyPlanner (新規、本 PR で設計、impl は DD3 phase)              │
│   - input: ConversationContext + PairState + History             │
│   - 1. domain infer: time-slot + theme detection + signal fusion │
│   - 2. context build: dailyContext (time / fairness / load)      │
│   - 3. constraint collect: daily-wide (budget / curfew / energy) │
│   - 4. plan compose: single-domain or multi-domain graph         │
│   - output: DailyDomainRequest[] (1 or N、graph chain 表現)      │
└────────────────────────┬─────────────────────────────────────────┘
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│ DomainRouter (新規、本 PR で設計、impl は DD2 phase)              │
│   - input: DailyDomainRequest                                    │
│   - dispatch by request.domain to appropriate orchestrator       │
│   - 純関数 (DI 経由 orchestrator)                                │
│   - output: DomainResponse (candidates + diagnostics)            │
└────────────────────────┬─────────────────────────────────────────┘
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│ Domain orchestrator (movie/food/travel/activity、既存 or 新規)   │
│   - request.context.presenceMode を読んで behavior 調整 (Alt C)  │
│   - movieOrchestrator (PR #102 + #110-#119)                      │
│   - foodOrchestrator (Phase B 1-4)                               │
│   - travelOrchestrator (PR #124 設計、impl 未)                   │
│   - activityOrchestrator (未実装、future)                        │
└────────────────────────┬─────────────────────────────────────────┘
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│ Response aggregation (新規、graph chain なら 複数 response 合成) │
│   - 単一 domain → そのまま return                                │
│   - graph chain → 連続 candidate を合成 (例: 夕食 + 映画)        │
└──────────────────────────────────────────────────────────────────┘
```

### §5.2 `DailyDomainRequest` 型 (DD1 phase 着手 target)

```typescript
// 本 PR では設計のみ、実装は DD1 phase
export interface DailyDomainRequest {
  // 主要 routing key
  domain: ConversationTheme; // "movie" | "food" | "travel" | "activity" | ...
  
  // Daily-specific context
  dailyContext: {
    timeSlot: "morning" | "noon" | "afternoon" | "evening" | "night" | "deepnight";
    targetDate: Date; // 今日 / 明日 / 今夜
    isWeekend: boolean;
    pairAvailability: "both" | "one_only" | "unknown"; // 二人 available か
  };
  
  // Constraints (Daily から carry-over)
  constraints: {
    budgetCeiling?: { lo: number; hi: number; confidence: number }; // Travel Idea 7 と同思想
    timeWindow?: { start: Date; end: Date }; // curfew / 拘束時間
    energyBudget?: 1 | 2 | 3 | 4 | 5; // pace 概念 (Travel Idea 16)
    redLines?: string[]; // 絶対不可 (例: "アルコール避ける")
  };
  
  // Multi-domain chain (graph 構造)
  chainPosition?: { index: number; total: number; prevDomain?: ConversationTheme };
  
  // Fairness ledger 反映 (cross-domain fairness、Idea 4)
  fairnessHints: {
    recentBias: number; // -1 (A 寄り) to +1 (B 寄り)
    cooldownDomains: ConversationTheme[]; // 連続選択 saturation 回避
  };
  
  // Domain infer の rationale (Conflict Pre-detection、Idea 7)
  inferRationale: {
    confidence: number; // 0-1
    signals: string[]; // どの signal で domain を infer したか
    alternates: ConversationTheme[]; // 二位以下の候補
  };
}
```

### §5.3 `DomainRouter` 純関数 design (DD2 phase 着手 target)

```typescript
// 本 PR では設計のみ、実装は DD2 phase
export type DomainOrchestrator<T = unknown> = (request: DailyDomainRequest) => Promise<T>;

export interface DomainRouterDeps {
  movieOrch: DomainOrchestrator<MovieResponse>;
  foodOrch: DomainOrchestrator<FoodResponse>;
  travelOrch: DomainOrchestrator<TravelResponse>;
  activityOrch?: DomainOrchestrator<ActivityResponse>; // optional、未実装の場合 fallback
  scheduleOrch?: DomainOrchestrator<ScheduleResponse>;
  giftOrch?: DomainOrchestrator<GiftResponse>;
}

export async function dispatchDomain(
  request: DailyDomainRequest,
  deps: DomainRouterDeps,
): Promise<DomainResponse> {
  switch (request.domain) {
    case "movie": return deps.movieOrch(request);
    case "food": return deps.foodOrch(request);
    case "travel": return deps.travelOrch(request);
    case "activity":
      if (deps.activityOrch) return deps.activityOrch(request);
      return fallbackResponse(request, "activity_orchestrator_unimplemented");
    // ... 他 domain 同様
    default:
      return fallbackResponse(request, "unknown_domain");
  }
}
```

純関数 + DI = test しやすい。各 orchestrator は本 PR 設計範囲外 (既存 or 別 PR で実装)。

### §5.4 Daily 起動 path (既存 coalterDispatch と非破壊統合)

```
既存 (Action Mode のみ判定):
  invoke → coalterDispatch → modeRouter(decision/negotiate/clarify) → buildXxxCard

新規 (本 PR 設計、impl 後):
  invoke → if (presenceMode === "daily") {
    → DailyPlanner → DomainRouter → domain orchestrator
    → response を coalterDispatch に flow して action mode dispatch
  } else {
    → coalterDispatch (既存 path)
  }
```

**非破壊原則**: presenceMode === "normal" の path は **既存 coalterDispatch を 1 bit も touch しない**。Daily mode 専用 path として **平行 layer 追加**。

---

## §6 人間超越設計 17 アイデア (CEO 必須 10 + claude 追加 7)

### §6.1 CEO 指定 10 アイデア

#### Idea 1: Context-aware dispatch

DomainRouter / 各 orchestrator は `request.context.presenceMode` を受領、Daily-specific behavior に切替可能 (Alt C 思想を Hybrid に統合)。

#### Idea 2: Time-slot based domain selection

`dailyContext.timeSlot` (morning/noon/afternoon/evening/night/deepnight) を Daily planner が infer に利用。§3.2 matrix を参照。

#### Idea 3: Constraint carry-over

`constraints` (budget / timeWindow / energyBudget / redLines) を Daily 全体で保持、各 Domain request に carry-over。例: "今夜 21 時帰宅" → food curfew 19 時 → movie 21 時前終了。

#### Idea 4: Cross-domain fairness

`fairnessHints.recentBias` を `coalter_fairness_ledger` から集約、Daily 内連続選択でも fairness 維持。例: 夕食 A 寄り → 映画 B 寄りで balance。

#### Idea 5: User fatigue / cognitive load control

`energyBudget` で 1 session の Domain chain 長さ制限 (3 以上は cognitive load 高)。連続同 Domain (例: 食事 4 連発) を suppress。

#### Idea 6: Progressive narrowing

Daily planner 内で **多段階 narrowing**: domain infer (5 候補) → context filter (2 候補) → constraint apply (1 候補) → user 確認。Idea 9 を Daily planner に組込。

#### Idea 7: Conflict-aware domain routing

二人の preference 衝突時 (例: A=映画 / B=食事) を **検出**し、Action Mode を `negotiate` に escalate 提案。Daily planner で conflict detection logic を内蔵。

#### Idea 8: Explanation of why this domain is being suggested

各 Domain 推奨に `inferRationale` (confidence + signals + alternates) を attach、user が「なぜ?」と聞けば回答可能。

#### Idea 9: Daily plan as a graph, not a list

Daily plan = 単一 activity だけでなく、**graph** (例: 夕食 → 映画 → 帰宅)。`DailyDomainRequest[]` を chain 表現、`chainPosition` で順序管理。

#### Idea 10: Memory continuity

過去の Daily session の選択 / 拒否 / 疲労 / 好みを次回に反映。`pastSessions: DailyPlanHistory[]` を planner input、bias_score / fatigue / preference を集約。

### §6.2 claude 追加 7 アイデア (人間超越強化)

#### Idea 11: Domain affinity score

時間帯 × pair preference × 過去 history から各 Domain に **affinity score (0-1)** 付与、planner が top-N 選出。

**実装方針**: `computeDomainAffinity(domain, timeSlot, pairProfile, recentHistory): number` 純関数。

#### Idea 12: Multi-domain dispatch (graph composition)

1 Daily session で **複数 Domain を意図的に chain**:

```
"夕食 + 映画" → DailyDomainRequest[
  { domain: "food", chainPosition: { index: 0, total: 2 } },
  { domain: "movie", chainPosition: { index: 1, total: 2, prevDomain: "food" } },
]
```

Domain composition pattern library を planner が持つ:
- "dinner + entertainment" pattern
- "shopping + meal" pattern
- "morning + lunch + afternoon" full-day pattern

#### Idea 13: Domain transition cost

Domain 間切替の **認知コスト評価**:
- food → movie: 低 (時系列自然)
- food → travel: 高 (時間軸跳躍、cognitive load)
- activity → activity: 中 (異種 activity の連続)

`transitionCost(prevDomain, nextDomain): number` を planner が利用、過大なら chain 分割提案。

#### Idea 14: Pair preference convergence

二人の **Domain preference 収束度** を測定:
- 完全一致 (convergence ≥ 0.8): single candidate で OK
- 中程度 (0.5-0.8): 2-3 candidate 比較
- 低 (< 0.5): Action Mode を `negotiate` に escalate

**実装方針**: pair profile から `convergence(userA, userB, domain): number`。

#### Idea 15: Active vs passive domain

- **Active**: user 明示 ("食事に行きたい") → Action Mode `decision`
- **Passive**: user 暗示 ("今日疲れた...") → Alter 提案 (Daily planner が "活動 / 休養 / 食事" の affinity を計算し提案)

Active/passive 区別を Daily planner が分類、passive なら **提案モード** (低 commitment、user の意向確認)。

#### Idea 16: Domain saturation

連続同 Domain 選択で **疲労 (saturation)** を検知、次は別 Domain を推奨:
- 3 日連続「食事決め」→ 4 日目は「軽い活動」推奨
- 同 Domain saturation を `recentHistory` から自動計算

#### Idea 17: Daily plan composition library

graph 構造の **共通 pattern library** を planner が持つ:
- `dinnerEvening`: food (19) → movie (21) → return (23)
- `weekendDaytrip`: activity (10) → food (12) → activity (14) → return (17)
- `morningRoutine`: food (8) → schedule (9) → activity (10)

planner が user input → pattern matching → graph 候補生成。

---

## §7 Domain 別扱い (個別設計)

### §7.1 Movie domain (PR #102 + PR #110-#119 との関係)

| 項目 | 状態 | Daily dispatch での扱い |
|---|---|---|
| movie three-stage scaffold | ✅ PR #102 dddfd664 | DailyDomainRequest を movieOrchestrator が受領 |
| Provider Foundation | ✅ PR #110-#119 | Daily mode で provider 選択を context-aware に |
| a3 wiring (runtime 接続) | ❌ 未着手 | Daily mode の movie path は a3 wiring 完了後 |
| flag (`movieCuratorLiveEnabled` / `threeStageEnabled`) | OFF 既定 | Daily 内 movie 起動も同 flag に従う |

**Daily mode で movie が呼ばれる例**: "今夜映画見たい" → Daily planner → DailyDomainRequest(domain=movie, timeSlot=evening, energyBudget=2) → movieOrchestrator with Daily context → 21 時前終了作品を優先 candidate

### §7.2 Food domain (Phase B Commit 1-4 との関係)

| 項目 | 状態 | Daily dispatch での扱い |
|---|---|---|
| foodOrchestrator / foodCatalog / foodRanker / foodTierExpander / foodTierRunner / bookingResolver | ✅ Phase B Commit 1-4 | 既存 orchestrator を DailyDomainRequest 互換に拡張 |
| 三段式枠位置づけ | ❌ 未 (Phase 3B Layer 2-D 凍結) | Daily mode では Phase B 既存 logic 利用 |
| `foodLensWired` flag | OFF 既定 | Daily 内 food 起動も同 flag に従う |

**Daily mode で food が呼ばれる例 (核心 use case)**: "今夜何食べる" → Daily planner → DailyDomainRequest(domain=food, timeSlot=evening, budgetCeiling={5000,10000}) → foodOrchestrator with Daily context → 19 時開店店舗を優先 candidate

### §7.3 Travel domain (PR #124 1-2 泊国内 MVP との関係)

| 項目 | 状態 | Daily dispatch での扱い |
|---|---|---|
| Travel domain design | ✅ PR #124 (本 PR の 1 つ前) | DailyDomainRequest を travelOrchestrator が受領 (impl 未) |
| T1-T7 impl | ❌ 未着手 | Daily 内 travel は travel impl 完了後 |

**Daily mode で travel が呼ばれる例 (限定的)**: "週末ちょっと行こう" → Daily planner → DailyDomainRequest(domain=travel, timeSlot=weekend, numNights=1) → travelOrchestrator with Daily context → 軽量 1 泊案を優先 candidate

**注意**: Daily の travel は **1 日帰り or 1 泊 軽量** に限定。本格的 1-2 泊国内旅行は travel mode (PresenceMode) に escalate。

### §7.4 Activity domain (未実装、future / mapping required)

| 項目 | 状態 | 必要作業 |
|---|---|---|
| activityOrchestrator | ❌ 完全不在 | future (G-6 で対象範囲 mapping、別 PR で impl) |
| U3 abolition key | ✅ `COALTER_U3_ABOLITION_ACTIVITY` 存在のみ | impl 待ち |

**Daily mode の核心 use case の 1 つだが impl 不在**:
- "今日何しよう" → DailyDomainRequest(domain=activity) → **activityOrchestrator 不在で fallback**

→ **G-6 (Activity domain 対象範囲 mapping) と本 PR が連動**。Daily dispatch impl 着手前に G-6 で activity 範囲を確定すべき。

### §7.5 Relationship / mediation domain (normal mode と混線回避)

| 項目 | 扱い |
|---|---|
| Action Mode | `negotiate` / `clarify` で関係 mediation を処理 (既存) |
| Domain (theme) | `general` or 専用 theme なし |
| Daily mode での扱い | **基本は normal mode の Action Mode に任せる、Daily 専用 logic 不要** |

→ Daily dispatch は relationship / mediation を **直接扱わない**、Action Mode (negotiate / clarify) との連携で処理。混線回避。

### §7.6 Schedule / Gift domain (頻度低、future)

| Domain | Daily 適合度 | 着手 timing |
|---|---|---|
| schedule | 中 ("今夜空いてる?") | future、軽量 orchestrator で対応可 |
| gift | 低 ("今日何渡す?" 稀) | future、低優先度 |

→ MVP 範囲外、future scope。

---

## §8 Gap 4 (PR #123) との関係

### §8.1 役割分担 (orthogonal)

| 軸 | Gap 4 (PR #123) | Daily Dispatch (本 PR) |
|---|---|---|
| 対象 layer | Layer 5 (Layout / UpperLayer) の variant 発火 | Layer 4 (Domain orchestrator) の routing |
| 検出対象 | `PatternContext` 7 fields | `DailyDomainRequest` (domain + context + constraints) |
| 出力 | Pattern A-F-2 variant | Domain response (candidates) |
| 関係 | **orthogonal**、両者並行進行可 | |

### §8.2 Gap 4 signal を Daily Dispatch が利用可能

Gap 4 detector (D5 `observe` phase 以降) が出力する `PatternContext` の 7 fields の一部を Daily planner が input として利用可能:

| Gap 4 field | Daily planner での利用 |
|---|---|
| `infoMissing` | Daily 内 retrieval 不足検知 → Domain narrowing 段で alternate domain 提案 |
| `uncertaintyHigh` | Daily plan confidence 低い → user 確認 prompt 強化 |
| `needFraming` | Pair preference 衝突 → Action Mode `negotiate` escalate (Idea 7) |
| `oneSidedFatigue` | Cross-domain fairness (Idea 4) の重み調整 |
| `needTranslation` | misread → Action Mode `clarify` escalate |
| `relationshipNoiseHigh` | Daily session の cognitive load 制御 (Idea 5) |

→ **Gap 4 と Daily Dispatch は signal source / sink の関係**で統合可能。両者完成時の synergy が大きい。

### §8.3 Gap 4 がなくても本 PR 設計は進められる範囲

Gap 4 impl が完了していなくても、Daily Dispatch の以下は **独立に設計 / impl 進行可能**:

- DailyDomainRequest 型定義 (DD1)
- DomainRouter 純関数 (DD2)
- Daily planner (DD3) の構造 (Gap 4 field 受領 hook は将来追加)
- Domain orchestrator integration (DD4)
- UI presentation (DD5)
- Observation / smoke (DD6)

→ **Gap 4 完成待ちで本 PR 進行を blocking しない**。

### §8.4 Gap 4 完成後に接続すべき箇所

Daily Dispatch DD4 phase 以降に Gap 4 signal を input として受領する hook を追加 (additive):

- DailyPlanner の input に `patternContext?: Partial<PatternContext>` を追加 (optional)
- planner 内で Gap 4 signal を Daily plan 生成に反映 (§8.2 mapping)
- 既存 DD4 path は patternContext 不在でも動作 (backward compat)

→ **Gap 4 完成後の wiring は additive、Daily Dispatch impl を壊さない**。

### §8.5 smoke PASS と production reachability の違い (PR #123 §1.2 継承)

| 経路 | Daily Dispatch でも同思想 |
|---|---|
| smoke harness | Preview env で URL query から DailyDomainRequest を人工注入 (debug 用) |
| production | DailyPlanner が実際に request を生成 |
| **production reachability PASS** | smoke PASS とは別、Daily が実 user 環境で機能する状態 |

Gap 4 と同 mode enum 設計 (§9.4) で production rollout 統一。

---

## §9 実装 Phase (DD0-DD6)

### §9.1 Phase 一覧

| Phase | 内容 | files likely touched | tests | CEO 承認 | risk | rollback |
|---|---|---|---|---|---|---|
| **DD0** (本 PR) | docs-only design | `docs/` 1 file | N/A | merge 判断 | 0 | 本 PR revert |
| **DD1** | `DailyDomainRequest` type (pure types) | `lib/coalter/daily/types.ts` (新規) | unit test on type | 承認 | 低 (types 単体、import 元なし) | file 削除 |
| **DD2** | `DomainRouter` 純関数 + dispatch logic | `lib/coalter/daily/domainRouter.ts` (新規) | unit test on router | 承認 | 低 (純関数、DI 経由) | file 削除 |
| **DD3** | `DailyPlanner` → request adapter | `lib/coalter/daily/planner.ts` (新規) | unit test on planner + integration | 承認 | 中 (Domain infer logic) | flag OFF |
| **DD4** | Domain orchestrator integration | 既存 orchestrator に request 受領 path 追加 (additive) | integration test | 承認 | 中 (orchestrator touch、既存 path 互換) | flag OFF |
| **DD5** | UI presentation (Daily mode 内 UpperLayer) | `app/components/chat/states/UpperLayerShell.tsx` 拡張 | UI test | 承認 + Product Unit | 中 (UI 追加) | UI 別 route |
| **DD6** | Production observation (Step E 統合、mode enum) | telemetry + feature flag | observability test | **CEO 戦略判断** | 大 (実 user reach) | mode enum (Gap 4 と同設計) |

### §9.2 各 Phase の詳細

#### DD1 (DailyDomainRequest types)

新規 file 1 個、既存 file touch 0:
- `DailyDomainRequest` interface (§5.2 参照)
- `DomainResponse` / `DailyPlan` (graph 構造)
- `DailyContext` / `DailyConstraints` / `FairnessHints`
- TypeScript strict、import 元なしの状態で landing

#### DD2 (DomainRouter pure function)

新規 file 1 個:
- `dispatchDomain(request, deps)` 純関数 (§5.3 参照)
- DI 経由 orchestrator 受領、未実装 domain は fallback response
- unit test で 7 domain (movie/food/travel/activity/schedule/gift/general) の routing 確認

#### DD3 (DailyPlanner → request adapter)

新規 file 1 個 (+ heavy logic):
- `dailyPlanner.plan(input): DailyDomainRequest[]`
- Domain infer (time-slot + theme + signal fusion)
- Multi-domain chain detection (graph composition、Idea 12)
- Fairness hints 集約 (Idea 4)
- Conflict pre-detection (Idea 7)
- Memory continuity (Idea 10)
- Active vs passive 分類 (Idea 15)

#### DD4 (Domain orchestrator integration)

既存 orchestrator 拡張:
- `foodOrchestrator(request: DailyDomainRequest | LegacyInput)` で discriminated union 受領 (additive)
- `movieOrchestrator` 同様
- `travelOrchestrator` は PR #124 impl 後に同手法
- 既存 LegacyInput path は **1 bit も touch しない** (backward compat)

#### DD5 (UI presentation)

Daily mode 内 UpperLayer に Daily plan graph 表示:
- 単一 domain candidate → 既存 CoAlterCard 表示
- multi-domain chain → 新規 `DailyPlanGraphView` (例: "夕食 → 映画 → 帰宅" graph)
- Product Unit 連携必須

#### DD6 (Production observation + mode enum)

Gap 4 / Travel と同 mode enum 設計:

```
COALTER_DAILY_DISPATCH_MODE = "off" | "observe" | "live"
```

- `off`: 完全停止 (既定)
- `observe`: planner + router 走るが UI 露出なし、telemetry のみ
- `live`: canary / allowlist 下で UI 露出許可

Step E rollout pattern と直接 mapping (shadow ≈ `observe` / canary ≈ `live` + allowlist / flip ≈ `live` + 全 user)。

---

## §10 まだやらない (本 PR scope 外)

### §10.1 runtime / production 操作

- ❌ Daily Dispatch 実装着手 (DD1-DD6、各別 PR)
- ❌ `lib/coalter/daily/` ディレクトリ作成
- ❌ `lib/coalter/types.ts` への `DailyDomainRequest` 追加
- ❌ `coalterDispatch.ts` 修正 (Daily path 追加は DD4 別 PR)
- ❌ Domain orchestrator (movie/food/travel/activity) の修正
- ❌ Daily UI 新規実装 (`DailyPlanGraphView` 等、DD5 phase 別 PR)
- ❌ `flags.ts` 新規 env mode enum 追加 (`COALTER_DAILY_DISPATCH_MODE`、DD6 phase 別 PR)

### §10.2 既存 file touch (本 PR 厳守)

- ❌ `lib/coalter/**` 全 file touch
- ❌ `lib/coalter/movie/**` / `lib/coalter/foodOrchestrator.ts` 等 全 touch
- ❌ `lib/coalter/presence/**` 全 touch (Gap 4 と直交)
- ❌ ChatClient / UpperLayerMount / ModeSwitcher / 既存 components touch
- ❌ `lib/coalter/flags.ts` 既存 flag touch
- ❌ `lib/coalter/types.ts` 既存 type touch

### §10.3 production / env / API

- ❌ env 変更 (`COALTER_DAILY_DISPATCH_MODE` 等の追加なし、本 PR は設計提案のみ)
- ❌ Production env / Vercel deploy 操作
- ❌ Anthropic Console / Google Places / 楽天 / じゃらん 等 API key 取得
- ❌ Supabase migration / API key / 実 API call

### §10.4 別領域 (CEO directive 2026-05-15)

- ❌ Step E 開始 / bug1 cleanup / Stargazer pivot
- ❌ movieOrchestrator / foodOrchestrator / ProviderSelector / flags / movie 修正
- ❌ Travel domain T1-T7 着手 (PR #124 別 phase)
- ❌ Gap 4 detector D2-D7 着手 (PR #123 別 phase)
- ❌ reflect mode 着手 (Phase 3 後送り)
- ❌ Activity domain 範囲確定 (G-6 別 PR)
- ❌ 本 doc の merge (CEO 判断)

---

## §11 推奨結論

### §11.1 最終推奨案

CEO directive + deep reasoning + Source-of-truth 一次資料整合性で結論:

| 軸 | 推奨 | 根拠 |
|---|---|---|
| **Dispatch alternative** | **Alt D Hybrid** (Daily planner → Domain request → Domain router → Domain orchestrator (Daily context 受領))  | 9 dimensions 全 dimension で最良 or 同等、separation of concerns + extensibility 最高 |
| **layer 構成** | Daily planner / DomainRouter / Domain orchestrator の **3 層分離** | testability / extensibility / rollback friendliness 最高 |
| **既存 coalterDispatch との統合** | 非破壊統合 (presenceMode 分岐) | normal mode path 1 bit も touch しない |
| **Multi-domain chain** | `DailyDomainRequest[]` で chain 表現 (Idea 9 + 12) | Daily plan as graph 実現 |
| **Cross-domain fairness** | `fairnessHints` 反映 (Idea 4 + 16) | 連続選択でも公平性維持 |
| **Memory continuity** | `pastSessions` planner input (Idea 10) | 過去の選択を次回に反映 |
| **Conflict-aware routing** | Conflict 検出時 Action Mode `negotiate` escalate (Idea 7) | 二人 preference 衝突を自動処理 |
| **rollout 戦略** | Gap 4 / Travel と同 mode enum 3-stage (`off`/`observe`/`live`) | PR #123 / PR #124 設計と統合、Step E rollout pattern 接続 |

### §11.2 人間超越設計 17 アイデア 全組込

CEO 必須 10 + claude 追加 7 = 全 17 アイデアを Alt D Hybrid 設計に組込:

- **Routing**: Context-aware dispatch (1) / Time-slot based (2) / Domain affinity score (11)
- **Constraint**: Constraint carry-over (3) / Domain transition cost (13)
- **Fairness**: Cross-domain fairness (4) / Domain saturation (16)
- **Cognitive load**: User fatigue (5) / Multi-domain dispatch (12) / Daily plan composition (17)
- **Plan structure**: Plan as graph (9) / Multi-domain (12) / Composition library (17)
- **User experience**: Progressive narrowing (6) / Explanation (8) / Active vs passive (15)
- **Conflict**: Conflict-aware routing (7) / Pair preference convergence (14)
- **History**: Memory continuity (10) / Domain saturation (16)

→ 既存 dispatch logic (`coalterDispatch.ts`、Action Mode のみ) には **存在しない 17 機能**。Daily mode が **「日常の決断ハブ」**として CoAlter の核心 use case を実現。

### §11.3 期待される CoAlter 全体寄与

PR #122 §6 集計 (CoAlter 全体未完了 14 件) のうち本 PR + Daily Dispatch impl 完了で解消されるもの:

| 未完了領域 | 状態変化 |
|---|---|
| Daily mode × Domain cross-axis dispatch logic | ❌ → ✅ (DD1-DD6 完了で完了) |
| Daily mode domain body 機能化 | ⚪ → ⚠ 部分 (Daily Dispatch impl で機能化、各 Domain impl 完成度に依存) |
| PresenceMode daily UI/state 機能薄 | ⚪ → ✅ (機能発火可能) |

→ CoAlter 全体未完了 **14 件 → 12 件** (Travel 完了で 11 件 → Daily 完了で 9 件 → Gap 4 D7 完了で **7 件**)。

---

## §12 verify 結果 + CEO 判断請求

### §12.1 verify 結果 (8 項目)

本 commit 前自己確認 (commit 後再確認):

| # | 項目 | 結果 |
|---|---|---|
| 1 | docs-only | ✅ `docs/coalter-daily-domain-dispatch-design.md` 1 file 追加のみ |
| 2 | lib touch 0 | ✅ |
| 3 | src touch 0 | ✅ |
| 4 | tests touch 0 | ✅ |
| 5 | package touch 0 | ✅ |
| 6 | supabase/migrations touch 0 | ✅ |
| 7 | Alter Morning 実 path touch 0 | ✅ (本 file 内 言及は本 verify 行 meta-reference のみ) |
| 8 | secrets 値 露出 0 | ✅ (env var 名 reference のみ、actual value なし) |

### §12.2 CEO 判断請求事項 (6 項)

1. **本 doc の merge 判断**
2. **Alt D Hybrid 推奨案の承認** — Daily planner / DomainRouter / Domain orchestrator の 3 層分離 + Domain orchestrator が Daily context 受領 + 非破壊統合
3. **3-Axes Orthogonal 全 63 組合せのうち MVP 範囲確定** — Daily × Domain matrix で最頻度 = food + activity (核心)、movie/schedule (2 番手)、travel/gift (稀)
4. **Activity domain 着手 timing 判断** — DD3 (Daily planner) phase で activity が頻出、activityOrchestrator impl が必要、G-6 (Activity 範囲 mapping) との連動 timing
5. **DD1 (DailyDomainRequest type) 着手 timing 判断** — 本 doc merge 後の next phase 着手承認
6. **Step E / Gap 4 / Travel / Daily 四者の rollout 統合戦略** — 全 domain で同 mode enum 設計を共有する方針承認 (3-stage `off`/`observe`/`live`)

### §12.3 次の docs-only autonomous 候補 (本 doc merge 後)

PR #122 §8.1 で挙げた候補のうち、本 Daily Dispatch 設計確定後に進める順:

| # | 候補 | Daily Dispatch との関係 |
|---|---|---|
| G-6 | Activity domain 対象範囲 mapping docs | **Daily Dispatch で activity 頻出、impl 前に範囲確定推奨** |
| G-4 | L4-m legacy 退役 status audit docs | 独立、軽量並列可 |
| G-5 | Reflect mode Phase 3 pre-review docs | 独立、Phase 3 開始判断材料 |
| F-2 | D-2-e3-b/c/d/e audit docs | movie path 補完、独立 |
| F-5 | PR #102 scaffold + PR #110-#119 関係 audit docs | movie Path α vs β 判断、独立 |

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
