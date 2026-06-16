# Travel Production Track Closeout + Next Implementation Plan（docs）

> Closeout（候補レーン凍結後の production-input → live UI トラック）+ 残件 A–G の実装計画。
> 原則: ①前提を疑う ②grounding ③シンプル→論理 ④外科的 ⑤ゴール逆算。

---

## PART 1 — Closeout（production-input → live UI トラック）

### 1.1 完成チェーン（全 commit 済・staging-gated/OFF・production deny）

```
構造化 form/session events
  → bindTravelSessionIntake（surface→slot・status は surface 由来＝偽造不能・normalizeSlot gate）
  → getProductionTravelInput（5 状態・fixtureAllowed:false で dev_fixture 拒否・fixture fallback なし）
  → buildTravelPlanDisplayResult（ready のみ engine→display-safe・not-ready 中立・authoritative/raw 非返却）
  → toTravelLiveActionState（返り値型を構造で拘束＝display-safe by construction）
  → submitTravelLiveIntakeAction（"use server"・gate first・useActionState 返却・no redirect/persistence）
  → TravelLivePanel（useActionState・visible=server gate・中立 copy・engine/adapter 非 import）
  → page.tsx（isPlanTravelLiveAllowed で visible 配線・default OFF→null・PlanClient 不変）
```

### 1.2 確立した不変条件
- gate: `isPlanTravelLiveAllowed` = `travelLive ∧ planRouteLive ∧ staging ∧ !production`（**production は flag ON でも常に deny**・解除は別 CEO gate）。`PLAN_TRAVEL_LIVE` は **server-only**（NEXT_PUBLIC なし）。
- transport: **server action return（useActionState）**＝persistence/URL 漏洩なし。ready payload は `DisplayPacketForClient`+`PlanIntelligenceProjection`+`CoAlterProjectionCue[]` **のみ**（型で authoritative/raw input-output/diagnostics/provenance/executionAuthority/booking を排除）。
- client は env/flag を判定しない・status/`TravelPlanEngineInput` を送らない・engine/adapter を直接呼ばない。

### 1.3 状態
- **完成**: 「form events → 安全 binding → provider → adapter → display-safe ActionState → 中立 UI」が staging-gated で end-to-end 稼働（**production OFF・PlanClient 不変・full suite green・tsc 55**）。
- **HOLD**: production deny 解除・persistence・rich itinerary・participant 実選択・外部 link・M2/CoAlter（＝残件 A–G）。

---

## PART 2 — 残件 A–G の分類

| 残件 | 開く gate | 依存 | リスク | 今 group 可？ |
|---|---|---|---|---|
| **A. richer TravelLivePanel render / itinerary** | なし（staging-OFF UI・display-safe） | projection/cues。**真の itinerary は凍結 candidate レーン接続要** | 低 | ✅ **NOW**（richer projection render） |
| **B. participant selector / current-user binding** | auth read（Supabase 識別子取得） | action の auth context | 低〜中 | △ 次スライス（auth read・LifeOps 範型） |
| **C. Tier1 safe links / Maps URL** | **外部 link gate（Tier1）** | confirmed destination/entity（binding で取得可） | 中（外部・honesty） | 🔴 design preflight |
| **D. production durable travel state / persistence** | **persistence gate（CLAUDE.md §1）** | DB/session 設計 | 中〜高 | 🔴 design preflight |
| **E. production deny release** | **最大 CEO gate（本番露出）** | staging 観測 + 上記安全層 | 高 | 🔴 design preflight（最後） |
| **F. M2 soft enrichment provider** | **M2 runtime gate** | M2 PersonalizationPort | 中 | 🔴 design preflight |
| **G. CoAlter display/runtime** | **CoAlter runtime gate** | CoAlter | 中〜高 | 🔴 design preflight |

★ 前提訂正（①）: 「itinerary display」は engine の `PlanIntelligenceProjection` に**存在しない**（day-by-day itinerary は凍結中の candidate/scheduled-draft レーン `DisplayScheduledItinerary`）。よって A は **richer projection/cues render** を今実施し、**真の itinerary 表示は「凍結 candidate レーンを live に接続」する別作業**（A2・後述）。

---

## PART 3 — 実装計画（group + 順序）

### Group 1 — NOW（no new gate・本ターンで実装）
- **A: richer TravelLivePanel render**。display-safe `PlanIntelligenceProjection` の追加フィールド（`whyThisPlan` / `answer.text` / `viewerNote` / `whatCouldFail.note` / 確認・質問の中立要約 / readiness の中立ライン）+ cues 件数を read-only 表示。**新 gate なし・auth/persistence/外部なし・中立 copy 厳守**。

### Group 2 — 次スライス（小 gate: auth read）
- **B: current-user participant binding**。server action で auth context（`supabaseServer().auth.getUser()` = **read のみ**）から authed user を participant に束ねる（LifeOps が user_id を auth から取る範型）。UI は「あなた + 任意同行者」。**participant id を FormData の user_id から読まない**原則は維持（auth context 由来）。

### Group 3 — design preflights（各々別 CEO gate・docs-only から）
推奨順（価値×依存×リスク）:
1. **C: Tier1 safe links / Maps URL design** — 「予約直前まで→hand off」の terminal。confirmed destination は binding で出せる。外部 honesty（捏造禁止・公式/Maps URL のみ・href は Tier1 gate）。
2. **D: durable travel state / persistence preflight** — result が refresh で消える現状を超える/将来 E の前提。persistence は CLAUDE.md §1（CEO DB 承認）。
3. **F: M2 soft enrichment provider design** — soft/private enrichment のみ（**destination/date を hard-confirm しない**）。M2 runtime は HOLD。
4. **G: CoAlter display/runtime preflight** — display-only cue から。CoAlter runtime は大 gate。
5. **E: production deny release preflight — 最後**。staging 観測 + C/D（安全層）+ CEO 最終承認の後。

### A2（将来・別トラック）— 真の itinerary 表示
凍結中の candidate/scheduled-draft レーン（envelope→C3→C4→display projection）を同一 intake から live に接続し、`DisplayScheduledItinerary`（day-by-day）を panel に出す。**candidate レーン解凍 = 別 CEO 判断**（freeze 正本 `docs/t11-travel-candidate-lane-freeze-resume-gate.md`）。

---

## PART 4 — 本ターンの実施範囲

- **実装**: Group 1（A: richer render）のみ。staging-gated・OFF・display-safe・新 gate なし。
- **計画提出**: 本書（A–G の group/順序）。
- **HOLD**: B（auth read）/ C / D / E / F / G — 各々 CEO の次 GO 待ち。

---

## 出力サマリ
- production-input → live UI トラックは staging-gated で完成（OFF・production deny・PlanClient 不変・full suite green・tsc 55）。
- 残件 A–G を gate/依存/リスクで分類。**A（richer projection render）のみ今 group 実装可**（新 gate なし）。**真の itinerary は凍結 candidate レーン接続の別作業（A2）**。
- 次順序: A（now）→ B（auth・小 gate）→ C/D/F/G（design preflights）→ **E（production deny release）最後**。
- 本ターンは A を実装し、B–G は CEO の次 GO 待ち。
