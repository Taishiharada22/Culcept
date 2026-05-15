# CoAlter Normal / Daily / Travel 完了状況 Audit (movie 以外領域)

**作成日**: 2026-05-15
**ステータス**: docs-only audit、runtime 変更なし、code 変更なし
**起草 branch**: `docs/coalter-normal-daily-travel-audit`
**前提**:
- PR #120 (`0d925e0c`、original plan completion audit v2) 正本化済
- PR #121 (`df00a8f3`、runtime integration priority decision) 正本化済
- 候補 E (normal/daily/travel side audit deep dive) として CEO directive 受領

## §0 本書の position と Source-of-truth Hierarchy

### §0.1 本書の目的

PR #120 audit v2 が「movie 中心 (Step D-1〜D-3)」に偏重した反省を踏まえ、**movie 以外の CoAlter 領域**:

1. **Action Mode** — decision / negotiate / clarify / reflect (Phase 2 3-mode body + reflect Phase 3)
2. **Presence Mode** — normal / daily / travel (Stage 4 Layout 系統)
3. **Domain** — food / travel / activity / presence(emotion) (movie 以外)
4. **mediation / 仲介 / 調停** — CoAlter Master Design §2 原則 1 (調停者ではない、翻訳者)
5. **pair / relationship / presence / emotion** — Stage 4 Layout L4-a〜L4-l 系統
6. **plan layout / daily planning / travel planning / candidate presentation**
7. **UI 状態 / production readiness**

を **main merge 済 commit / 実コード / 最新 docs** を一次資料として棚卸しする。

CoAlter **全体 product-level 完了** に必要な未完了項目を明確化し、CEO 戦略判断材料を増やす。

### §0.2 Source-of-truth Hierarchy (PR #120 §0.2 継承)

| Tier | 種別 | 優先度 | 本書での扱い |
|---|---|---|---|
| 1 | main merge 済 commit / PR | **最優先** | `git log origin/main` で実反映 commit を確認、SHA + PR# + date を記録 |
| 2 | 実コード (現状の `lib/` / `app/` ファイル) | 高 | ファイル存在 / type 定義 / function export / 呼び出し点を grep で実証 |
| 3 | 最新 docs (handoff / design doc) | 中 | Tier 1/2 と整合する範囲で参照、矛盾時は Tier 1/2 を採用 |
| 4 | memory / project memory | 低 | 補助参照 |
| 5 | 古い docs / 初期 design doc | 最低 | 既に Tier 1/2 で書き換えられている可能性を前提に扱う |

**衝突時の rule**: 古い doc が「未着手」と書いていても、main 反映 commit がある場合は **main を優先**。本 audit は PR #120 で発生した「Step D-1 未着手」誤判定 (PR #102 dddfd664 で実は 10 commit merged 済) を再発させない。

### §0.3 Stargazer pivot 禁止の再確認

PR #120 §4 + PR #121 §0 で構造化済の CEO directive:
- ❌ Stargazer / Human OS 等 別領域 pivot は **CoAlter 全体完了まで保留**
- ✅ CoAlter を完成させる、別タスクに頭を向けない (CEO directive 2026-05-15)

---

## §1 CoAlter 3-Axes Orthogonal Architecture (movie 偏重補正の核)

PR #120 / #121 で混在しがちだった概念を、本 audit で **3 直交軸** に分離する。これが movie 偏重補正の核設計。

### §1.1 Axis A: Action Mode (CoAlterMode)

**正本**: `lib/coalter/types.ts:89-92` + `lib/coalter/modeRouter.ts` (Phase 2 v0.3) + `docs/coalter-master-design.md` §3 + `docs/coalter-phase2-3mode-design.md`

```typescript
export type CoAlterMode =
  | "decision"   // Phase 1: 共同意思決定支援
  | "negotiate"  // Phase 2: 好みが矛盾時の第三案生成
  | "clarify";   // Phase 2: すれ違い検出→論点可視化
```

| Mode | 役割 | 状態 |
|---|---|---|
| **decision** | 共同意思決定支援 (映画 / 食事 / 旅行 / プレゼント 等) | ✅ Phase 1 完了 |
| **negotiate** | 好み矛盾時の第三案生成 (Harvard PON Dual Concern Model) | ✅ Phase 2 完了 + 凍結 |
| **clarify** | すれ違い検出 → 論点可視化 (誤読 confidence ≥ 0.7) | ✅ Phase 2 完了 + 凍結 |
| **reflect** | 「最近どうだっけ」振り返り、過去会話パターン要約 | ❌ **Phase 3 後送り、完全未実装** |

**reflect が未実装の根拠**:
- `lib/coalter/types.ts` の `CoAlterMode` enum に `"reflect"` なし
- `lib/coalter/modeRouter.ts` の判定フローに reflect 分岐なし (decision / negotiate / clarify の 3 mode のみ)
- `grep -rilE "reflectMode|reflectBuilder|reflect_mode|reflectiveMode"` で `lib/` `app/` 全 0 hits
- `docs/coalter-master-design.md` line 449「reflect: 過去の会話パターン要約」、line 574「Phase 3: reflect + Rendezvous 展開」、line 599 modeRouter L3 で `decision/negotiate/clarify/reflect` と書かれているが、line 26 (`coalter-phase2-3mode-design.md`)「`reflect` は **Phase 3 に明確に後送り** (4 モード目は今回触らない)」と凍結

### §1.2 Axis B: Presence Mode (PresenceMode)

**正本**: `lib/coalter/presence/types.ts:56-61` + `lib/coalter/presence/modeReducer.ts` + `docs/coalter-implementation-plan-layout.md` v0.3

```typescript
export type PresenceMode = "normal" | "daily" | "travel";
```

| Mode | 役割 | UI 状態 | domain body |
|---|---|---|---|
| **normal** | 通常モード、本体性 (Core UX v1.1 §2.3 不可侵) | ✅ default mount、production reach 済 (3 旗 ON) | N/A (本体) |
| **daily** | 日常モード (Daily planning context) | ✅ ModeSwitcher chip + S0-S8 mock + AutoEscalationBanner + ModeReturnPrompt 全 production code 完了 | ❌ **domain body 不在** |
| **travel** | 旅行モード (Travel planning context) | ✅ 同上 | ❌ **domain body 不在** |

**Daily ↔ Travel 直接遷移は禁止** (`modeReducer.ts` line 56-60、必ず normal 経由)。
**自動昇格 = 明示 signal (mode_promotion) のみ** (§11.5、暗黙信号で daily/travel 起動禁止)。

### §1.3 Axis C: Domain (Theme)

**正本**: `lib/coalter/flags.ts:271-275` (U3 abolition keys) + `docs/coalter-master-design.md` §1 (5 対象領域)

```typescript
export type U3AbolishableTheme = "food" | "movie" | "travel" | "activity";
```

| Domain | 担当 file | 状態 |
|---|---|---|
| **movie** | `lib/coalter/movie/` 配下 12 file (PR #102 D-1〜D-2-e2 scaffold + PR #110-#119 provider foundation) | ⚠ Stage 1/2 scaffold + provider foundation 完了、a3 wiring + Stage 3 Resolve 本体 + UI 未 |
| **food** | `lib/coalter/foodOrchestrator.ts` / `foodCatalog.ts` / `foodRanker.ts` / `foodTierExpander.ts` / `foodTierRunner.ts` / `foodLensInputBuilder.ts` / `foodQueryBuilder.ts` / `bookingResolver.ts` (flat 配置) | ⚠ Phase B Commit 1-4 完了、三段式枠位置づけ + Phase 3B Layer 2-D narration 凍結中 |
| **travel** | **`lib/coalter/` に travel-specific orchestration 不在** | ❌ **domain body 完全不在** (U3 abolition key だけ存在) |
| **activity** | 同上、不在 | ❌ U3 abolition key だけ存在、本体未着手 |
| **presence (emotion)** | `lib/coalter/presence/**` + Step C Bug-1 (CEO 2026-05-11 Option α) | ✅ 完了 + production deploy |

### §1.4 3 軸の交差 — Daily/Travel mode は domain を呼ばない

**重要発見**: Daily / Travel mode は **UI chip 切替 + escalation/return logic** のみで、各 mode が **どの Domain に紐づくか** は明示的に未定義。

- `modeRouter.ts` (Action Mode 判定) は CoAlterMode = decision/negotiate/clarify のみ判定し、PresenceMode は判定対象外
- `modeReducer.ts` (Presence Mode 判定) は PresenceMode = normal/daily/travel のみ判定し、Domain は判定対象外
- `coalterDispatch.ts` (dispatch) で Action Mode × Domain の組合せが触れるが、Presence Mode × Domain の組合せ logic は未

**意味**: Daily mode に入っても、それが「Daily の food (今夜何食べる?)」なのか「Daily の movie (今夜何見る?)」なのか「Daily の travel (今日どこ行く?)」なのかが、現状 implementation には存在しない。**Daily/Travel は presentation layer (UI) のみ、retrieval/curation layer (domain body) は未統合**。

---

## §2 PresenceMode 深掘り

### §2.1 normal mode (通常モード本体)

**正本**: `docs/coalter-core-ux-layered-presence.md` v1.1 §2.3 (通常モード本体性、Core UX v1.1 不可侵)

| 項目 | 状態 | 根拠 |
|---|---|---|
| Type 定義 | ✅ `lib/coalter/presence/types.ts:56-61` | `"normal" \| "daily" \| "travel"` |
| Default mount | ✅ `app/components/chat/UpperLayerMount.tsx` (production) | `presenceExecutorEnabled` flag (production ON) で mount |
| ChatClient 統合 | ✅ `app/(culcept)/talk/[threadId]/ChatClient.tsx:1520` | `<UpperLayerMount />` directly mounted |
| 3 production env 旗 ON | ✅ handoff §3 「3 旗 production env」 | `COALTER_PRESENCE_SPEECH_LLM=true` / `NEXT_PUBLIC_COALTER_PRESENCE_SPEECH_FETCH=true` / `NEXT_PUBLIC_COALTER_PRESENCE_EXECUTOR=true` |
| Legacy CoAlterCard OFF | ✅ handoff §3 | `NEXT_PUBLIC_COALTER_LEGACY_CARD_AUTO_INSERT=false` |
| Pattern variant 発火 | ⚠ **Gap 4 未解消** | `docs/coalter-stage24-production-reflection.md` line 170「実 user 環境では context flag が立たないため S5/S7 で variant=null は **設計通り**」 |

**結論**: normal mode = **production user reach 済**だが、**Gap 4 (production-side context flag detection) 未実装**により Pattern variant 発火が薄い。Layer mount のみ実体、機能は thin。

### §2.2 daily mode

**正本**: `docs/coalter-implementation-plan-layout.md` v0.3 §1.1 Stage 2 + §1.1 Stage 4 L4-f (ModeSwitcher 本番化)

#### §2.2.1 完了済要素

| 要素 | file | 状態 |
|---|---|---|
| Type 識別子 | `lib/coalter/presence/types.ts:56` | ✅ |
| ModeSwitcher chip | `app/components/chat/ModeSwitcher.tsx` (Stage 4 L4-f 本番化) | ✅ "Daily" label production code |
| modeReducer 遷移 logic | `lib/coalter/presence/modeReducer.ts` (Stage 2 L2-h) | ✅ MANUAL_SWITCH / AUTO_ESCALATE / PLAN_COMPLETE / MANUAL_RETURN の 4 event 純関数完了 |
| modeContextManager | `lib/coalter/presence/modeContextManager.ts` (Stage 2 L2-i) | ✅ |
| modeEscalationDetector | `lib/coalter/presence/modeEscalationDetector.ts` (Stage 2 L2-h) | ✅ |
| modeReturnLogic | `lib/coalter/presence/modeReturnLogic.ts` (Stage 2 L2-h) | ✅ |
| AutoEscalationBanner | `app/components/chat/AutoEscalationBanner.tsx` | ✅ daily / travel 昇格対象 production UI |
| ModeReturnPrompt | `app/components/chat/ModeReturnPrompt.tsx` | ✅ daily / travel 復帰 prompt production UI |
| S0-S8 Daily mock | `app/(dev)/coalter-preview/upper-layer/components/modes/daily/` (S0-S8) | ✅ Stage 1 preview 完了 |
| Daily mock scenario | `app/(dev)/coalter-preview/full/scenarios/dailyMode.ts` | ✅ |

#### §2.2.2 不在要素

| 要素 | 状態 | 影響 |
|---|---|---|
| **Daily domain body** (今夜何食べる / 今日何する 等) | ❌ **不在** | Daily mode UI 起動しても retrieval/curation 経路なし |
| **Daily × movie / food / travel の cross-axis 統合 logic** | ❌ **不在** | Daily mode は他 Domain (movie/food/travel) を呼ばない |
| **Daily-specific candidate generation** | ❌ **不在** | candidate は別経路 (legacy CoAlterCard or 一般 dispatch) |
| **Daily Production reach** | ⚠ Gap 4 未実装で薄い | ModeSwitcher visible / Pattern variant 発火薄 |

#### §2.2.3 Daily mode の真の状態

**Daily mode = 「UI 上の認識装置 + state machine 完了、内容は空」**:
- ユーザーが chip tap で Daily に切替可能 ✅
- escalation で Daily に自動昇格可能 (条件発火時) ✅
- Daily 状態の S0-S8 表示は Preview に存在、Production の Pattern variant は薄い
- Daily mode 中に「今夜何食べる?」と聞いても、Daily-specific orchestration が走らない (movie/food/travel domain の通常 dispatch が走る)

### §2.3 travel mode

#### §2.3.1 完了済要素

Daily と同じ Stage 4 L4-f / L2-h 系列で UI / 状態機械が production 完了:

| 要素 | file | 状態 |
|---|---|---|
| Type 識別子 | `lib/coalter/presence/types.ts:56` | ✅ |
| ModeSwitcher "Travel" chip | `app/components/chat/ModeSwitcher.tsx` | ✅ |
| AutoEscalationBanner / ModeReturnPrompt | 同上 | ✅ Daily と同じ logic |
| S0-S8 Travel mock | `app/(dev)/coalter-preview/upper-layer/components/modes/travel/` (S0-S8) | ✅ |
| Travel mock scenario | `app/(dev)/coalter-preview/full/scenarios/travelMode.ts` | ✅ |
| Travel U3 abolition key | `lib/coalter/flags.ts:274` `COALTER_U3_ABOLITION_TRAVEL` | ✅ env key 定義 |

#### §2.3.2 不在要素 (Daily より深刻)

| 要素 | 状態 | 影響 |
|---|---|---|
| **Travel domain body** | ❌ **完全不在** | `lib/coalter/` に travel-specific orchestrator / catalog / ranker / retrieval logic 一切なし |
| **Travel retrieval provider** | ❌ **完全不在** | movie provider のような Anthropic / OpenAI / EXA 対応の travel-specific provider 設計が docs 段階にもない |
| **Travel candidate model** | ❌ **完全不在** | 場所 / 旅程 / 時間軸 / 予算 / 同行者 制約を扱う travel 専用 candidate type なし |
| **Travel × Daily 統合** | ❌ **不在** | Travel mode と Daily mode の overlap (旅先での日常選択) 未定義 |

#### §2.3.3 Travel mode の真の状態

**Travel mode = 「UI 上の chip + state machine のみ、retrieval 経路皆無」**:
- chip tap で Travel に切替可能 ✅
- escalation で Travel に自動昇格可能 ✅
- でも **Travel に入ると何が起きるべきか** が実装に存在しない
- Daily より深刻 (food/movie のような既存ドメインの transferable function がない、travel は独自 retrieval 必要)

### §2.4 Layout (Stage 4) 完了状況

**正本**: `docs/coalter-handoff-2026-05-11-stepd.md` §1.1 + `docs/coalter-l4l-execution-runbook.md` + main commit log

| Stage / Phase | 状態 | 根拠 |
|---|---|---|
| Stage 0.5 | ✅ 完了 | docs 整理 |
| Stage 1 (preview 静的試作) | ✅ 完了 | `app/(dev)/coalter-preview/upper-layer/` 配下に S0-S8 + Daily/Travel mock 完了 |
| Stage 2 (executor 骨格) | ✅ 完了 | `lib/coalter/presence/**` 全 production-grade implementation |
| Stage 2.3 Yellow 付き条件付き PASS | ✅ 2026-05-08 (CEO 確定) | `docs/coalter-stage24-production-reflection.md` §1.1 |
| Stage 2.4-A PASS | ✅ 2026-05-08 (CEO 確定) | 同 §1.2 |
| Stage 2.4-B Yellow 付き PASS | ✅ 2026-05-09 | 同 §1.3、smoke harness 経路 PASS、production reachability PASS とは別 |
| Stage 2.4-C Yellow 付き観察ベース PASS | ✅ 2026-05-09 | 同 §1.4 |
| Stage 3 (Pattern / 共有メモリ surface 等) | ✅ 完了 | `lib/coalter/presence/patternSelector.ts` 等 |
| Stage 4 L4-a〜L4-k (本番マウント 11 commits) | ✅ 完了 + production deploy | `ec34180a → 2d88593d` (L4-l runbook §1.2) |
| **Stage 4 L4-l (本番 flip + deploy)** | ✅ **完了** | PR #95 `62dff94b` 2026-05-10、3 旗 ON 反映、handoff §1.1 |
| **Stage 4 L4-m (legacy 完全退役)** | ⚠ **未確認** | L4-l runbook §10「L4-l + L4-m 両方完了」が closeout 条件、L4-m の状態は本 audit で別 verify 必要 |

**重要訂正**: PR #120 audit v2 が「L4-l flip = CEO ops 待ち」と書いた箇所は、PR #95 (2026-05-10) で 3 旗 ON 反映済 = **L4-l 完了**。L4-m (legacy 完全退役) の状態は確認要。

### §2.5 Layout 系統の Production 反映の本質的欠落: Gap 4

**正本**: `docs/coalter-stage24-production-reflection.md` line 33 + line 170 + line 286

| 項目 | 状態 |
|---|---|
| Production-side context flag detection (executor watcher / heuristic / LLM 検出) | ❌ **未実装 = Gap 4、別 phase** |
| 実 user 環境で variant=null | ⚠ **設計通り** (Gap 4 完成まで) |
| smoke harness PASS != production reachability PASS | ⚠ CEO/GPT 厳守、永続 |

**意味**: Layout 完了 + 3 旗 ON でも、Pattern variant が実 user 環境で発火しないため、**Layer は mount するが Pattern は薄い**。Stage 2.4-B/C の Yellow 付き PASS が示す通り、smoke harness 経由 (Preview) でしか variant fetch が動かない。

**Gap 4 解消なしでは**:
- Layer 完了でも「ちょっとした言葉のやりとり」「pattern based 介入」「共有メモリ surface 動的更新」は production user に届かない
- 静的 fallback (URGENT_FALLBACK_MESSAGES 等) のみ実発火

---

## §3 Action Mode 深掘り

### §3.1 decision / negotiate / clarify (Phase 2 v0.3 完了 + 凍結)

**正本**: `lib/coalter/modeRouter.ts` (Phase 2 v0.3 2026-04-19) + `lib/coalter/negotiateBuilder.ts` + `lib/coalter/clarifyBuilder.ts` + `docs/coalter-phase2-3mode-design.md` v0.3

| Mode | builder file | 凍結状態 |
|---|---|---|
| decision | `lib/coalter/modeRouter.ts` default branch + dispatch | ✅ Phase 2 完了 (CEO 6.D 合格 2026-04-19) + 凍結 |
| negotiate | `lib/coalter/negotiateBuilder.ts` | ✅ Phase 2 完了 + 凍結 |
| clarify | `lib/coalter/clarifyBuilder.ts` | ✅ Phase 2 完了 + 凍結 |

**modeRouter 判定フロー** (`modeRouter.ts` line 14-22):

```
1. previousNegotiateNoProposal === true → decision (negotiate_no_proposal_retry_decision)
2. previousMode === "clarify" && previousClarifyTurns >= 1 && misread >= 0.7 → decision (clarify_self_suppression)
3. misread.confidence >= 0.7 → clarify
4. contradiction.detected === true → negotiate
5. stall.detected === true → decision
6. ambiguity.response_mode === "conclude" → decision
   ambiguity.response_mode === "branch" → decision
7. ambiguity.response_mode === "clarify" → decision (1 問委譲)
8. default → decision
```

**Phase 2 凍結契約** (`docs/coalter-implementation-plan-layout.md` §0.4):
- modeRouter / negotiateBuilder / clarifyBuilder + ↓ 関連 5 項目: layout 実装中 1 bit も touch 禁止
- Layout 系統 (本 §2) と Action Mode (本 §3) は完全直交

### §3.2 reflect (Phase 3 後送り、完全未実装)

**正本**: `docs/coalter-phase2-3mode-design.md` line 26「`reflect` は **Phase 3 に明確に後送り** (4 モード目は今回触らない)」+ `docs/coalter-master-design.md` line 574「Phase 3: reflect + Rendezvous 展開」

| 項目 | 状態 |
|---|---|
| Type 定義 | ❌ `lib/coalter/types.ts` の `CoAlterMode` enum に reflect なし |
| Lib 実体 | ❌ `lib/coalter/` に reflectBuilder / reflectiveMode 等 一切なし |
| Phase 3 開始 timing | ❌ 未定 (CEO 戦略判断要項 §6.3 #14) |

**reflect mode が果たすはずの役割** (master design line 449, 574-578):
- 「最近どうだっけ」振り返り
- 過去の会話パターン要約 → 共有気づき
- 二人の会話パターン長期観察
- Phase 3 で Rendezvous と並行展開予定

**未実装の影響**:
- 4 mode 目 (reflect) なしでは CoAlter Master Design §1 の「2 人の関係を前に進めるための共同補助 OS 全般」のうち「**共同の振り返り**」だけが欠落
- 「振り返り」UX が CoAlter として届かない (片側 Alter / Stargazer 側にはあるかもしれないが、CoAlter 自体には存在しない)

---

## §4 Domain × PresenceMode × ActionMode 3-Axes Intersection Map

### §4.1 全 27 組合せ 重要度マップ (実用組合せのみ)

| Domain | Action | Presence | 想定 UX | 実装状態 |
|---|---|---|---|---|
| movie | decision | normal | 「映画見に行かない?」共同決定 | ⚠ scaffold + provider foundation 完、a3 wiring 未 |
| movie | negotiate | normal | 映画選好矛盾の第三案 | ✅ Phase 2 + ⚠ movie scaffold 経由 |
| movie | clarify | normal | 映画候補すれ違い整理 | ✅ Phase 2 + ⚠ movie scaffold 経由 |
| food | decision | normal | 「何食べる?」共同決定 | ⚠ Phase B 完、三段式枠未 |
| food | negotiate | normal | 食事選好矛盾の第三案 | ✅ Phase 2 + ⚠ Phase B 経由 |
| food | clarify | normal | 食事候補すれ違い整理 | ✅ Phase 2 + ⚠ Phase B 経由 |
| travel | decision | normal | 「どこ行く?」共同決定 | ❌ **travel domain body 完全不在** |
| travel | negotiate | normal | 旅行選好矛盾の第三案 | ❌ **travel domain body 完全不在** |
| travel | clarify | normal | 旅行候補すれ違い整理 | ❌ **travel domain body 完全不在** |
| activity | * | normal | 「何しよう?」共同決定 | ❌ **activity domain body 完全不在** |
| presence (emotion) | clarify | normal | 感情誤読時の論点可視化 | ✅ Bug-1 Step C 完了 (CEO Option α) |
| movie / food | decision | daily | 「今夜何見る/食べる」 | ❌ **Daily mode × domain cross-axis 不在** |
| travel | decision | daily | 「旅先で何する」 | ❌ travel domain 不在 + cross-axis 不在 |
| movie / food / travel | * | travel | 旅行中の各種選択 | ❌ travel mode × domain cross-axis 不在 |
| any | reflect | any | 振り返り (Phase 3) | ❌ **reflect mode 全領域 Phase 3 後送り** |

### §4.2 攻略順依存 graph (人間超越設計 Idea 3)

```
                ┌──────────────────────────────────────────┐
                │ Phase 2 Action Mode 完了 (凍結中)        │
                │ decision / negotiate / clarify           │
                └──────────────────┬───────────────────────┘
                                   │
              ┌────────────────────┴───────────────────────┐
              │                                            │
              ▼                                            ▼
   ┌──────────────────────┐                  ┌─────────────────────────┐
   │ Layout 系統 (Stage 4)│                  │ Domain 三段式            │
   │ - normal/daily/travel│                  │ - movie (PR #102/110-119)│
   │ - UpperLayer mount   │                  │ - food (Phase B)         │
   │ - 3 旗 ON 反映済     │                  │ - travel (本体不在)      │
   │ - Gap 4 未解消        │                  │ - activity (本体不在)    │
   └──────────┬───────────┘                  └─────────────┬───────────┘
              │                                            │
              └───────────┬────────────────────────────────┘
                          │
                          ▼ (CROSS-AXIS INTEGRATION 未実装)
              ┌──────────────────────────────────────────┐
              │ Daily/Travel × Domain cross-axis dispatch│
              │ ❌ 完全未実装                              │
              └──────────────────────────────────────────┘
                          │
                          ▼ (Phase 3 後送り)
              ┌──────────────────────────────────────────┐
              │ reflect mode (4 mode 目)                 │
              │ ❌ 完全未実装                              │
              └──────────────────────────────────────────┘
                          │
                          ▼ (Phase 3 同時)
              ┌──────────────────────────────────────────┐
              │ Rendezvous 統合展開                       │
              │ ❌ 未着手                                  │
              └──────────────────────────────────────────┘
```

**重要な依存関係発見**:
1. **Layout × Domain** = 独立、両方並列実装可
2. **Daily/Travel cross-axis** = Layout + Domain (movie/food/travel 各 1) が完了しないと意味をなさない
3. **reflect mode** = Phase 2 3-mode 完了が前提 ✅、現状着手可能だが Phase 3 後送り CEO 判断
4. **Gap 4 (production context detection)** = Layout のすべての領域 (normal/daily/travel) の reach 薄を統合的に解消する**最も影響範囲が広い single bottleneck**

---

## §5 Production-User Reach 6-Layer Surface Map (人間超越設計 Idea 2)

「Production deploy 済」≠「user に届く」を分離する 6-layer 評価:

| Layer | 内容 | 評価方法 |
|---|---|---|
| 0 | **Design intent docs** | docs に書かれている計画 |
| 1 | **Implementation code** | lib/ / app/ にコードが存在 |
| 2 | **Route / endpoint exposure** | app/api / app/(culcept) で route 露出済 |
| 3 | **Flag ON state** | flag が ON (default or env override) |
| 4 | **UI access** | 実 user の chat 画面に UI 要素が表示 |
| 5 | **Production user reach (functional)** | 機能が **動作している** 状態で実 user に届く |

### §5.1 各領域の 6-Layer 評価

| 領域 | L0 Design | L1 Impl | L2 Route | L3 Flag | L4 UI | L5 Reach |
|---|---|---|---|---|---|---|
| normal mode | ✅ Core UX v1.1 §2.3 | ✅ presence/types.ts | ✅ (culcept)/talk/[threadId] | ✅ 3 旗 ON | ✅ UpperLayerMount L1520 | ⚠ Gap 4 未解消で薄い |
| daily mode (UI) | ✅ UI spec §6.2-6.5 | ✅ modeReducer 等 | ✅ ModeSwitcher chip | ✅ 同上 | ✅ chip visible | ⚠ Gap 4 + domain body 不在 |
| travel mode (UI) | ✅ 同上 | ✅ 同上 | ✅ 同上 | ✅ 同上 | ✅ 同上 | ⚠ Gap 4 + domain body 不在 (Daily より深刻) |
| daily domain body | ⚠ master design 一部 | ❌ 不在 | ❌ N/A | ❌ N/A | ❌ N/A | ❌ |
| travel domain body | ⚠ master design 一部 | ❌ 完全不在 | ❌ N/A | ❌ N/A | ❌ N/A | ❌ |
| reflect mode | ⚠ Phase 3 design | ❌ 完全不在 | ❌ N/A | ❌ N/A | ❌ N/A | ❌ |
| activity domain | ⚠ 一部 mention | ❌ 不在 (U3 key のみ) | ❌ N/A | ❌ N/A | ❌ N/A | ❌ |
| decision/negotiate/clarify | ✅ Phase 2 v0.3 | ✅ modeRouter 等 | ✅ /api/coalter/invoke | ✅ flag 不要 default ON | ✅ 既存 CoAlter UI | ✅ legacy 経由稼働 |
| movie domain (provider) | ✅ PR #109 review | ✅ PR #110-#119 + PR #102 | ✅ /api/coalter/invoke | ❌ flag OFF (default) | ❌ a3 wiring 未 | ❌ runtime 未接続 |
| food domain (Phase B) | ✅ Phase B 4 commit | ✅ foodOrchestrator 等 | ✅ /api/coalter/invoke 経由 | ✅ legacy 経路 | ✅ 既存 UI | ✅ legacy 経由稼働 |
| presence (emotion / Bug-1) | ✅ Step C 設計 | ✅ Bug-1 Option α | ✅ /api/coalter/invoke | ✅ Step C 適用済 | ✅ 既存 UI | ✅ 稼働中 |

### §5.2 Gap 4 = Layer 5 を阻害する single bottleneck

Layer 5 (functional reach) の薄さを解消するのは、Domain 完成より **Gap 4 解消が先**になる可能性:

**Gap 4 production context flag detection** が解消されると:
- normal mode の variant 発火 (Pattern A-F-2 が S5/S7 で動的選択)
- daily/travel mode 切替時の context 自動検出
- 全 Domain の retrieval signal を Layer 経由で notify
- legacy CoAlterCard と新 UpperLayer の正しい切替

**未解消の現状**:
- variant=null = Pattern は static fallback のみ
- daily/travel = chip 切替は機能、自動昇格 condition firing が薄い
- 全 Domain の retrieval が Layer 経由で観測されない

---

## §6 6-State Incomplete 定義 + 全領域の position (人間超越設計 Idea 4)

「未完了」を 6 状態に分離し、各領域を position する:

### §6.1 6 State 定義

| State | 定義 | symbol |
|---|---|---|
| **未着手** | 計画されていたが impl 着手なし | ⚪ |
| **着手未達** | 着手したが完了基準未達 | 🟡 |
| **完了未公開** | 完了したが production 未到達 (flag OFF / route 未露出) | 🟠 |
| **完了未接続** | 完了したが他領域との接続未 (cross-axis wiring 未) | 🟣 |
| **frozen** | 意図的に止まっている (CEO 判断による解除待ち) | 🔵 |
| **計画外** | そもそも計画されていなかった (scope 外) | ⚫ |
| **完了** | 完了 + production reach 済 | ✅ |

### §6.2 全領域 position

| 領域 | State | 理由 |
|---|---|---|
| Action Mode decision/negotiate/clarify | ✅ 完了 | Phase 2 v0.3 + 凍結、legacy 経由 production 稼働 |
| Action Mode reflect | ⚪ 未着手 | Phase 3 後送り、CEO 判断 |
| PresenceMode normal | ✅ 完了 | 3 旗 ON、UpperLayer mount、Gap 4 は別軸 |
| PresenceMode daily UI/state | ✅ 完了 | UI chip + state machine + AutoEscalationBanner 全 production |
| PresenceMode daily domain body | ⚪ 未着手 | daily-specific orchestration logic 不在 |
| PresenceMode travel UI/state | ✅ 完了 | 同上 |
| PresenceMode travel domain body | ⚪ 未着手 | travel-specific retrieval / orchestration 完全不在 |
| Domain movie | 🟠 完了未公開 | scaffold + provider foundation 完、a3 wiring 未 (flag OFF) |
| Domain food | 🟣 完了未接続 | Phase B 完、三段式枠位置づけ未 |
| Domain travel | ⚪ 未着手 | lib に impl 一切なし |
| Domain activity | ⚪ 未着手 | U3 key のみ |
| Domain presence (emotion / Bug-1) | ✅ 完了 | Step C Option α、CEO 2026-05-11 |
| Layout Stage 1-4 (L4-l まで) | ✅ 完了 | PR #95 deploy 済、3 旗 ON |
| Layout Gap 4 (production context detection) | ⚪ 未着手 | 別 phase、Stage 2.5 / 別 milestone 候補 |
| Layout L4-m (legacy 完全退役) | 🟡 着手未達 (or 不明) | L4-l runbook §10 で「両方完了」が closeout 条件、L4-m 状態確認要 |
| Step E (観測 shadow → canary → 本番 flip) | ⚪ 未着手 | CEO 戦略判断要項 §6.3 #4 / #13 |
| Phase 3B Layer 2-D food path narration | 🔵 frozen | CEO 判断による解除待ち |
| Anti-Hallucination Guard / citation reject | 🔵 frozen | CEO 判断による解除待ち |
| bug1 cleanup | 🔵 frozen | CEO 整理判断 |
| Rendezvous 統合展開 | ⚪ 未着手 | Phase 3 同時 (master design line 574) |

### §6.3 集計

| State | 件数 | 含まれる領域 |
|---|---|---|
| ✅ 完了 | 5 | Action Mode 3, PresenceMode normal, daily UI, travel UI, Domain presence/emotion, Layout 1-4 (L4-l まで) |
| 🟠 完了未公開 | 1 | Domain movie |
| 🟣 完了未接続 | 1 | Domain food |
| 🟡 着手未達 | 1 | Layout L4-m |
| ⚪ 未着手 | 8 | reflect mode, daily domain body, travel domain body, Domain travel, Domain activity, Gap 4, Step E, Rendezvous 統合 |
| 🔵 frozen | 3 | Phase 3B Layer 2-D, Anti-Hallucination, bug1 cleanup |
| ⚫ 計画外 | 0 | 特になし |

**CoAlter 全体未完了の正体**: ⚪ 未着手 8 件 + 🟠 / 🟣 / 🟡 各 1 件 + 🔵 3 件 = **計 14 件残**。

---

## §7 PR #120 §6.3 14 項目の再採点 (人間超越設計 Idea 5)

PR #120 audit v2 §6.3 で挙げた CEO 戦略判断要項 14 項を、本 audit 結果で再評価:

| # | 要項 | 採点 |
|---|---|---|
| 1 | Step D-1 (Stage 2 Curate movie) 着手 vs Step D-2 残 (provider foundation 経路 a1-impl-1c → a2 → a3) | 🔴 **本質、不変** (movie 完了 path Path α vs Path β、PR #121 §5 で再確認) |
| 2 | mainstream §3.2-3.3 original D-2/D-3 plan vs PR #109 provider foundation 経路の整合性 | 🟡 **部分再採点**: 本 audit で「Path α と Path β は competing routes、両者は並走中、CEO 戦略選定要」と再確認 |
| 3 | Anthropic Console Web Search enable + ANTHROPIC_API_KEY 配置タイミング | 🔴 不変 |
| 4 | Supabase migration `coalter_provider_cost_log` 適用タイミング | 🔴 不変 |
| 5 | OpenAI npm dep 追加判断 | 🔴 不変 |
| 6 | EXA ToS PDF verify 完了 + Path A/B 判断 | 🔴 不変 |
| 7 | `flags.ts` / `movieOrchestrator` additive 拡張許可タイミング | 🔴 不変 (a3 wiring) |
| 8 | a4 citation UI design Product Unit 連携タイミング | 🔴 不変 |
| 9 | D-2-e3-b / c / d / e 詳細 (本 audit で未把握) の説明 | 🟡 PR #120 audit でも未把握、引き続き候補 F-2 で audit 可能 |
| 10 | food 三段式 本体実装着手タイミング | 🔴 不変 + 本 audit で「Phase B Commit 1-4 既存、三段式枠位置づけ直しのみ」明確化 |
| 11 | Phase 3B Layer 2-D food path narration の凍結解除条件 | 🔵 frozen、CEO 判断 |
| 12 | Anti-Hallucination Guard 凍結条件の明確化 | 🔵 frozen、CEO 判断 |
| 13 | Step E-0 着手 timing | 🔴 不変 |
| 14 | reflect mode (Phase 3) 着手 timing | 🔴 **本 audit で再確認**: reflect = lib に一切なし、Phase 3 後送り、CEO 戦略判断要 |

### §7.1 本 audit で追加判明した CEO 戦略判断要項

PR #120 §6.3 になかった、本 audit で新規発覚:

| # | 新要項 | CEO 判断必要度 |
|---|---|---|
| 15 | **Gap 4 (production context flag detection) 着手 timing** | 🔴 **最重要**、Layer 5 reach 全体を阻害している single bottleneck |
| 16 | **Daily mode × Domain cross-axis dispatch 設計 timing** | 🔴 Daily mode の機能化前提 |
| 17 | **Travel mode × Travel domain body 着手 timing** | 🔴 travel = lib に完全不在、独自 retrieval 必要、新規開発 phase |
| 18 | **Activity domain 着手 timing** | 🟡 U3 key だけ存在、対象範囲・優先度 CEO 判断 |
| 19 | **L4-m (legacy CoAlterCard 完全退役) timing** | 🟡 L4-l runbook §10 で closeout 条件、L4-m 状態確認 + 退役判断 |
| 20 | **Rendezvous との Phase 3 同時展開 timing** | 🔴 master design line 574-576、CEO 戦略判断 |

### §7.2 結論: CEO 戦略判断要項は **14 → 20 項目** に拡張

PR #120 §6.3 14 項目 + 本 audit 新規 6 項目 = **20 項目**。優先順:

| Priority | 要項 | 影響範囲 |
|---|---|---|
| **P0** (最重要、single bottleneck) | #15 Gap 4 | Layer 5 全領域 reach |
| **P1** (movie 完了 path) | #1 Path α vs Path β | movie 単独完了 |
| **P1** (food 完了 path) | #10 food 三段式 | food 単独完了 |
| **P2** (新規 domain) | #17 travel domain body | travel 単独完了 |
| **P2** (Phase 3 開始) | #14 reflect mode + #20 Rendezvous 統合 | Phase 3 全体 |
| **P3** (cross-axis) | #16 Daily × Domain | Daily mode 機能化 |
| **P3** (legacy 退役) | #19 L4-m | Layout 完全退役 |
| **P3** (補助 domain) | #18 activity | 対象範囲拡大 |
| **P4** (production 観測) | #4 / #13 Step E / Supabase migration | observability 完成 |

---

## §8 次に進む順番 (本 audit 結論)

### §8.1 Claude 自律進行可能 (docs-only、CEO 承認不要、即着手可)

| # | 候補 | 性質 | 完了寄与 | 工数感 | 優先順位 |
|---|---|---|---|---|---|
| G-1 | **Gap 4 production context flag detection 設計 docs draft** (executor watcher / heuristic / LLM 検出 design alternatives) | docs-only | 大 (P0 #15 解消設計) | 中 | **★最有力** |
| G-2 | Travel domain greenfield design docs (travel-specific retrieval / candidate model / provider 設計) | docs-only | 大 (P2 #17 解消設計) | 中〜大 | G-1 の次 |
| G-3 | Daily × Domain cross-axis dispatch 設計 docs (Daily mode 中の domain wiring 設計) | docs-only | 中 (P3 #16 解消設計) | 中 | G-2 の次 |
| G-4 | L4-m legacy 退役 status audit docs (L4-l runbook §10 closeout 条件確認) | docs-only | 小〜中 (P3 #19) | 小 | docs-only autonomous 並列 |
| G-5 | Reflect mode Phase 3 着手前 design pre-review docs (master design line 574 を解像度上げて再現実装可能形式に) | docs-only | 中 (P2 #14) | 中 | P3 並列 |
| G-6 | Activity domain 対象範囲 mapping docs (U3 key 以外の何が必要か網羅) | docs-only | 小 (P3 #18) | 小 | docs-only autonomous 並列 |
| F-2 (PR #121 §8.1) | D-2-e3-b / c / d / e audit docs (未把握 sub-phase 正体特定) | docs-only | 中 (P1 #9 解消) | 中 | docs-only autonomous |
| F-5 (PR #121 §8.1) | PR #102 scaffold + PR #110-#119 provider foundation 関係 audit docs | docs-only | 中 (P1 #2 解消) | 中 | docs-only autonomous |

### §8.2 CEO 判断必要 (実装 / runtime / production / merge)

| # | 候補 | 必要承認 | 影響範囲 |
|---|---|---|---|
| H-1 | Gap 4 production context detection 実装着手 (G-1 design 完了後) | env / runtime / production deploy | 大 (Layer 5 全体) |
| H-2 | Travel domain greenfield 実装着手 (G-2 design 完了後) | env / Supabase / runtime / 新規 provider 群 | 大 (新 domain) |
| H-3 | Daily × Domain cross-axis 実装着手 (G-3 design 完了後) | runtime / dispatch logic | 中 |
| A (PR #121) | PR #102 scaffold flags ON (Path α、movie 短期 ROI) | env / Production / flags | 大 |
| B (PR #121) | PR #110-#119 provider foundation a3 wiring (Path β、movie future-proof) | env / Supabase / API key / runtime | 大 |
| C (PR #121) | food 三段式本体実装 (Phase 3B Layer 2-D 凍結解除条件込み) | CEO 戦略承認 + 凍結解除 | 大 |
| D (PR #121) | a4 citation UI design docs | Product Unit 連携 | 中 (docs 段では autonomous 可) |
| Step E | Step E 観測開始 (shadow → canary → 本番 flip) | Production / Anthropic Console / API key | 大 |
| reflect-Phase 3 | reflect mode 着手 + Rendezvous 統合 | CEO 戦略承認、Phase 3 開始判断 | 大 |
| bug1 cleanup | bug1 worktree / branch 整理 | CEO 整理判断 | 小 |

### §8.3 推奨 next step (claude 視点、CEO 判断尊重)

1. **即着手 (claude 自律、docs-only)**: **候補 G-1** (Gap 4 production context flag detection 設計 docs draft)
   - 理由: P0 single bottleneck #15、Layer 5 reach 全体を阻害している、normal/daily/travel 全領域に影響
   - 工数: 中、1 PR 完結可
   - 形式: design alternatives doc (executor watcher / heuristic / LLM 検出 の 3 path 比較)
   - constraint 完全準拠: runtime 0 / API 0 / env 0 / migration 0 / movieOrchestrator 0 / flags 0 / ProviderSelector 0 / Production 0 / Step E 0 / bug1 0 / Stargazer 0

2. **G-1 完了後 (claude 自律継続可)**: G-2 (travel domain greenfield design) または G-4 (L4-m audit) または G-5 (reflect Phase 3 pre-review)
   - G-2 推奨: 新 domain 設計、travel mode を機能化する前提条件
   - G-4 推奨: 軽量 audit、CEO 判断材料即時提供
   - G-5 推奨: Phase 3 開始判断 を CEO がしやすくする

3. **CEO 戦略判断時期**: G-1 + G-2 + G-4 + G-5 完了後、CEO が:
   - 候補 A/B (movie path 選択) vs G-1 H-1 (Gap 4 解消) vs Phase 3 開始 (reflect / Rendezvous) の **どの方向に資源投下するか** を判断
   - 本 audit と PR #120 + PR #121 の合計 3 つの正本で判断材料が揃う

---

## §9 まだやらない (本 PR scope 外)

- ❌ **runtime 実装**: lib / src / test / package / migration 変更
- ❌ **実 API 接続**: `ANTHROPIC_API_KEY` 参照 / `process.env` 参照 / 実 API call
- ❌ **env 変更**: production env / Vercel env / `.env*` ファイル touch
- ❌ **Supabase migration**: 新規 migration 追加 / 既存 migration touch
- ❌ **movieOrchestrator 修正** / **flags 修正** / **ProviderSelector 修正**
- ❌ **Production env 変更** / **Vercel deploy 操作**
- ❌ **Step E 開始**
- ❌ **bug1 cleanup** (`/Users/haradataishi/Culcept-coalter-bug1` + `feat/coalter-bug1-step-c` touch しない)
- ❌ **Stargazer / Human OS 等 別領域 pivot** (CEO directive 2026-05-15)
- ❌ **本 audit doc の merge** (CEO 判断)
- ❌ **runtime/UI Daily mode / Travel mode の domain body 着手** (本 audit は docs-only)

---

## §10 verify 結果 (8 項目)

本 commit 前自己確認:

| # | 項目 | 結果 |
|---|---|---|
| 1 | docs-only | ✅ `docs/coalter-normal-daily-travel-audit.md` 1 file 追加のみ |
| 2 | lib touch 0 | ✅ |
| 3 | src touch 0 | ✅ |
| 4 | tests touch 0 | ✅ |
| 5 | package touch 0 | ✅ (package.json / package-lock.json touch なし) |
| 6 | supabase/migrations touch 0 | ✅ |
| 7 | Alter Morning 実 path touch 0 | ✅ (本 file 内 言及は本 verify 行 meta-reference のみ、actual touch 0、本 audit は CoAlter 領域のみ) |
| 8 | secrets 値 露出 0 | ✅ (token 名 reference のみ、actual value なし) |

---

## §11 CEO 判断請求事項

1. **本 audit doc の merge 判断**
2. **次に進む候補 G-1〜G-6 / F-2 / F-5 から claude 自律 docs-only 着手項目を選定** (推奨 G-1)
3. **CEO 戦略判断要項 20 項目から優先 P0-P2 項目選定**
4. **Stargazer 等への pivot は CoAlter 全体完了まで保留** (本 audit でも再確認、PR #120 + PR #121 + 本書で 3 重構造化)

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
