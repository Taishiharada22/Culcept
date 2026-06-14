# Travel Mode 正直監査（Claude 自立監査・2026-06-14）

**目的**: CEO「話していたロジックは全て実装終わったのか？嘘なく」への、実コード grep に基づく自立監査。
**方法**: 記憶でなく `lib/shared/travel/` 実ファイル・app import・外部接続・test 数・平日 Plan OS を grep 実地確認。

---

## 結論（嘘なし・一言）

- **このセッションで GO 単位で送った作業（T11-C7 〜 E-D）は、各々 実装・検証・commit 済み**＝報告は真実。
- **しかし「実ユーザーの旅行 Plan を予約直前まで作る完成形」はまだ**。出来たのは **純ロジック + dev preview + provider seam（fixture のみ）**。
- ∴ GPT の評価は正確。**「脳の深い部分は出来た／現実世界と繋ぐ部分はまだ」**。

---

## A. Travel 純ロジック — 実在確認（grep）

- `lib/shared/travel/` = **34 ファイル / 7,659 行**・travel unit test **423** + plan preview test **50** = **473**。
- **本番 app/component からの travel import = 0**（dev preview 3 本のみ import）。
- **実 fetch / HTTP / 外部 URL / supabase / process.env / Date.now / Math.random = 0 件**（一致はドメイン語彙・Map 呼び出し・コメント否定文の false positive）。
- **solver / itinerary DAG の実装ファイル = 0**（`TravelCandidate` 型のみ存在・実装なし）。

| 領域 | 状態 | 根拠 |
|---|---|---|
| core types / slot 契約 / normalizer | ✅ 実装 | core-types/slot-types/slot-normalizer |
| proposal / comparison / fairness | ✅ 実装 | proposal-builder/comparator |
| decision / readiness / contingency | ✅ 実装 | decision/readiness/contingency-core |
| packet / T9 facade | ✅ 実装 | packet-core / engine.ts |
| after-action learning | ✅ 実装 | after-action-core |
| **Travel Fit Model（fit + registry + rollup + interaction + route + cancelWeather）** | ✅ 実装 | fit-core/fit-constructs(-core) |
| display packet tier / PI projection / CoAlter cue | ✅ 実装 | engine-consume / plan-intelligence-projection / coalter-projection-consume |
| dev preview 3 種（projection / cue / engine-generated） | ✅ 実装 | dev-travel-projection / dev-coalter-projection-cues / dev-travel-engine-projection |
| input provider seam（dev fixture provider + real_only/fail-closed） | ✅ 実装 | travel-input-provider(-types) |

→ **ここまでは全部本物・test green・tsc 55・full suite 0 fail**。ただし **pure logic + dev preview + fixture** の範囲。

---

## B. Travel — 終わっていないもの（HOLD / 未実装）

| 領域 | 状態 | 意味 |
|---|---|---|
| 本番 `/plan` への Travel 表示 | ❌ HOLD | 実ユーザーに見えない |
| **実ユーザーの `TravelPlanEngineInput` 生成** | ❌ 未実装 | provider は **dev_fixture のみ**・session/intake provider は未着手 |
| M2 / Stargazer personalization 接続 | ❌ HOLD | M2-B-2 特権 runtime HOLD |
| route / weather / place 実 API | ❌ HOLD | 実データ源 0 |
| ホテル・飲食・観光の実検索 + **state 化** | ❌ 未実装 | ⭐後述 |
| Booking / Expedia / 楽天 / じゃらん / Google Maps 実リンク | ❌ 未実装 | 予約直前リンク 0 |
| itinerary DAG / solver | ❌ 未実装 | 型のみ |
| CoAlter runtime / useCoAlter / `/talk` / send / realtime | ❌ HOLD | |
| booking / calendar write / production apply / push | ❌ まだ | |

---

## C. 平日 Plan OS 監査（CEO 依頼）

**GPT 評価より少し進んでいる**。grep で実在確認:
- ✅ `/plan` route + PlanClient（表示骨格）
- ✅ candidate-generator.ts（候補生成の実体は **存在**）
- ✅ reflection-preview-compute / consumed-seed-morning-reflection / consumed-seed-merge（**accept→plan 化の実体 存在**）
- ✅ lifeops cadence source（**周期推論の実体 存在**）
- ✅ correctionMemoryFrame（correction memory の実体 存在）

**ただし**:
- `/plan` は `PLAN_FLAGS.planRouteLive` で **本番 default OFF**。
- Life Ops 本線は `isLifeOpsMainlineAllowed`（**staging-first / production-deny / real_only**）で gate。
- ∴ **「機械は概ね組まれているが、本番 live ではない・Stargazer 本接続は弱い・staging 検証段階」**。**「概ね固まっている」は機械の意味では概ね真・「完成（本番 live）」は未**。

---

## D. ⭐ CEO の「ホテル・旅券等に状態を持たせて引き寄せる」について

★ **この土台はすでに実装済み**。T11-A2 で **Unified StateEntity** を採用 — user（FitUserState）と entity（TravelObjectState）が **同一 TraitVector 空間を共有**し、Fit Model（fit-core）が「ユーザー状態に近い entity を高く評価」する仕組み（roleFit/traitFit/burdenFit/...）が動いている。
→ つまり「単に安いから」でなく「**この人の状態に合うホテル/旅程**」を選ぶ**評価エンジンは出来ている**。
**欠けているのは2つだけ**: (1) **実 entity（state 付きの実ホテル/旅券/場所）を入れる retrieval/source**、(2) **実 user state（M2/Stargazer/intake）から input を作る provider**。両方とも上記 B の HOLD 項目。
→ CEO の「完璧で広義な設計」= この retrieval + provider 群の設計。foundation は既にある。

---

## E. 次にやるべきこと（GPT と一致・CEO 判断要）

1. **T11-E Provider Seam Closeout + Next Gate Decision**（docs-only）で次 gate を決める。
2. その先の分岐（CEO 判断）:
   - **server session/intake provider design**（実ユーザー入力の最小設計）へ進む、or
   - **Travel を一旦凍結し Stargazer / 平日 Plan 本流へ戻る**、or
   - real entity retrieval（ホテル/場所の state 化 + 検索）設計、or
   - Bundle 2 ranking / Turbopack root（別タスク）。

**率直な推奨**: Travel の「脳」は十分深い。次の価値は **実ユーザー入力（session/intake provider）か real entity retrieval** にあり、どちらも大きい設計。Travel を走らせ続けるか、CEO 最優先（Stargazer）に戻すかは **CEO 判断**。本監査では実装を進めず、次 gate 決定を仰ぐ。
