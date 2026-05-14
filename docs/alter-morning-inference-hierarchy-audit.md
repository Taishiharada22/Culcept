# Alter Morning Inference Hierarchy 設計監査 (PR B-2b 着手前 audit)

**作成日**: 2026-05-02
**対象**: PR B-2a merge 後、PR B-2b (origin/end inference layer 1 実装) 着手前
**目的**: CEO/GPT 思想 (推論優先、聞くのは最後) を実装する前に、各 layer の現状と前提条件を read-only で確認

---

## CEO/GPT 6 段階推論 Hierarchy (確定済み思想)

### Origin (起点)

```
1. user explicit:        「自宅から」「ホテルから」「友達の家から」
2. previous day endpoint: 前日の最後の確定終点・宿泊地
3. baseline home:        登録住所 / baseline_home
4. current location:     位置情報 ON で対象日と整合する場合
5. location history:     前夜〜朝の滞在履歴
6. unknown → clarify (最後の砦)
```

### End (終点)

```
1. user explicit:        「ホテルに泊まる」「友達の家に行く」「実家に帰る」
2. last event semantic:  宿泊施設 / 夜の予定 / 帰宅文脈
3. usual pattern:        普段は自宅、出張中はホテル
4. baseline home
5. location history
6. unknown → clarify
```

---

## 各 Layer の現状実装と PR B-2b 実装可能性

### Layer 1: User Explicit Text

| 項目 | 現状 | PR B-2b 実装可能性 |
|---|---|---|
| `extractExplicitStartPoints` (origin) | ✅ 実装済 (`rulePreParse.ts:177`)、6 ラベル (自宅/実家/ホテル/会社/オフィス/家) と 2 動詞パターン (〜から/〜を出る) | ✅ deterministic 接続のみ (新規実装最小) |
| `extractExplicitEndpoint` (end) | ❌ **不在** (PR B-3 予定だった) | ⚠️ 新規実装必要、PR B-2b で同時にやるか分けるか CEO 判断 |
| 検出結果の流出経路 | ❌ LLM prompt hint のみ (`formatHintsForPrompt()` 経由)、deterministic に anchor field へ届いていない | ✅ legacyAdapter で deterministic 接続を追加 |

**Layer 1 の PR B-2b scope 判断**:
- **必須**: origin 側の `extractExplicitStartPoints` を deterministic に `journeyOrigin` に bind
- **選択**: end 側の `extractExplicitEndpoint` を新規実装するか、PR B-3 に分離するか

### Layer 2: Previous Day Endpoint

| 項目 | 現状 | PR B-2b 実装可能性 |
|---|---|---|
| `morning_sessions` テーブル | DB schema 不明確 (調査範囲外、別途 migration 確認必要) | ⚠️ 前日 plan の DB query 経路なし |
| `priorPlan` の供給経路 | client が body の `morningSession.plan` で送る (DB query 不使用) | ⚠️ 前日 (= different date) の plan を取るには **DB query 追加が必要** |
| `samePlanDate` 判定の活用 | PR B-2a で `priorPlan.date === today` で同 plan 判定 | ⚠️ 前日 plan は `samePlanDate=false` で fallback 対象外 (現状) |

**Layer 2 の PR B-2b scope 判断**:
- DB query 追加が必要 → **PR B-2b の scope を膨張させる**
- → **Layer 2 は PR B-2c に分離** すべき (CEO/GPT 規律: scope 限定)

### Layer 3: Baseline Home

| 項目 | 現状 | PR B-2b 実装可能性 |
|---|---|---|
| `profiles.baseline_home_lat/lng/label` | ✅ 実装済 (migration `20260418120000_baseline_home_columns.sql`) | ✅ 既に PR B-1/2a で利用中 |
| `userHomeLat/Lng/Label` の供給経路 | ✅ chat route → body → legacyAdapter で round-trip | ✅ 既存経路、追加実装不要 |

**Layer 3 の PR B-2b scope 判断**: 既存実装を維持。layer 1 が hit しなかった場合の fallback として PR B-1/2a で既に動いている。追加実装不要。

### Layer 4: Current Location

| 項目 | 現状 | PR B-2b 実装可能性 |
|---|---|---|
| `currentLat/Lng` の供給経路 | ✅ chat route → body → legacyAdapter | ✅ 既存経路 |
| permission state ("denied" / "unrequested" 区別) | ❌ caller (route) から explicit に渡せる経路なし、resolver 内部判定 | ⚠️ frontend permission UI 連携が必要 (別 PR) |
| time-aware semantic (今日/明日) | ❌ PR B-2a で stale 判定のみ、targetDate 比較は PR B-4 予定 | (PR B-4 scope) |

**Layer 4 の PR B-2b scope 判断**: 既存実装を維持。permission state 区別は別 PR、time-aware semantic は PR B-4。

### Layer 5: Location History

| 項目 | 現状 | PR B-2b 実装可能性 |
|---|---|---|
| location history テーブル | ❌ **不在** (`supabase/migrations/` に該当 schema なし) | ❌ DB migration + 観測実装が必要 |
| Stargazer 観測コード | ❌ 概念のみ (legacyAdapter:969 の TODO comment) | ❌ Stargazer Human OS 観測実装後 |
| 前夜〜朝の滞在履歴 | ❌ 不在 | ❌ 遥か先 |

**Layer 5 の PR B-2b scope 判断**: **PR B-2d 以降**。Stargazer Human OS の location 観測戦略と一緒に実装。

### Layer 6: Clarify (最後の砦)

| 項目 | 現状 | PR B-2b 実装可能性 |
|---|---|---|
| `PendingSlot` に "origin" 追加 | ❌ 不在 | (PR B-2e で実装予定) |
| `answerBinder` の origin/endpoint ブランチ | ❌ 不在 | (PR B-2e) |
| `DialogState.focus.slot` 拡張 | ❌ 不在 | (PR B-2e) |

**Layer 6 の PR B-2b scope 判断**: **PR B-2e (最後の砦)**。本 PR scope 外。

---

## 構造課題 (PR B-1 audit からの引き継ぎ)

### Dual Source of Truth (System A vs System B)

| 観点 | System A (`locationResolver.ts`) | System B (`transportContext.ts`) |
|---|---|---|
| 関数 | `resolveOrigin()` / `resolveEndpoint()` | `resolveHomeAnchor()` / `resolveJourneyEndAnchor()` |
| Layer 数 | 5 層 (layer1_city/prefecture, layer2_inferred/explicit, current_location, today_origin) | 3 source (current / registered_home / null) |
| 利用箇所 | `legacyAdapter.ts:45-49` import (active) | `legacyAdapter.ts` events>0 path で利用 (PR B-1/2a で進化) |
| 進化方向 | 既存座標解決チェーン (Routes API 用) | journey anchor (UI render + travel segment) |

**統合判断 (CEO 確認必要)**:
- System A は active で legacy ではない (legacyAdapter で直接 import されている)
- System B は PR B-1/2a で discriminated union 化、`applyAnchorFallback` を持つ
- **PR B-2b の選択肢**:
  - **(a) System B を拡張**: PR B-1/2a の流れを継続、`AnchorSource` enum に layer 識別を追加
  - **(b) System A を base に**: System A の 5 層を inference layer として活用、System B は travel segment 用に縮小
  - **(c) 統合**: System A の logic を System B に取り込む (大手術)

私の推奨: **(a) System B を拡張**。理由:
- PR B-1/2a で既に進化中、規律として継続性がある
- System A (Routes API 用) と System B (UI render 用) は責務が異なる
- (c) 統合は scope 大きすぎ、別 PR で扱う

---

## 新規 user / 連続使用がない user

| ケース | 現状 | PR B-2b の対応 |
|---|---|---|
| 初回 session (priorPlan=undefined) | ✅ legacyAdapter で priorPlan branch スキップ、provisional plan 不生成 | layer 1-3 のみで動作、layer 2 は no-op |
| 連続使用がない user (例: 1 週間ぶり) | ⚠️ priorPlan は client 持ちなので「ない」 状態 | layer 1-3 のみで動作 (layer 2 経路不存在) |

新規 / 連続使用がない user では、**layer 2 (前日終点) はスキップ** され、layer 1 → 3 → 4 の順で動く。これは現状で問題なく成立する。

---

## PR B-2b 推奨 scope (CEO 確認待ち)

### Option A: Layer 1 のみ (origin + end 同時) — 推奨

```
PR B-2b: Layer 1 deterministic 接続
  - extractExplicitStartPoints → journeyOrigin の deterministic 経路追加 (origin layer 1)
  - extractExplicitEndpoint 新規実装 → journeyEnd の deterministic 経路追加 (end layer 1)
  - source="user_declared" / "comprehension_explicit" を実コードで埋める
  - 既存 LLM hint 経路は維持 (deterministic 経路を追加するだけ)
```

**規模見積**: ~500 行 (PR B-2a と同等)
- `extractExplicitEndpoint` 新規 (~100 行 + tests ~150 行)
- legacyAdapter 統合 (~50 行)
- integration test (~150 行)
- migration helper (~50 行)

### Option B: Origin layer 1 のみ (end は分離)

```
PR B-2b: Origin layer 1
  - extractExplicitStartPoints → journeyOrigin の deterministic 接続のみ
PR B-2c: End layer 1
  - extractExplicitEndpoint 新規実装
```

**規模**: PR B-2b ~250 行、PR B-2c ~250 行

### Option C: Layer 1 + Layer 2 統合 (大きい)

```
PR B-2b: Layer 1 + Layer 2
  - Origin/End layer 1 deterministic 接続
  - Previous day endpoint inheritance (DB query 追加必要)
```

**規模**: ~800 行 (scope 膨張、CEO/GPT 規律違反)

---

## CEO 確認待ち判断ポイント (4 つ)

1. **PR B-2b scope**: Option A (Layer 1 origin + end 統合)、Option B (origin のみ)、Option C (Layer 1+2 統合) のどれを採用するか
2. **System A/B 統合方針**: (a) System B 拡張 (推奨)、(b) System A base、(c) 完全統合 のどれにするか
3. **`extractExplicitEndpoint` 新規実装**: PR B-2b で同時にやるか、PR B-2c (もしくは PR B-3) に分けるか
4. **Layer 5 (location history) の優先度**: PR B-2d 以降で良いか、それとも Stargazer 観測戦略と独立に進めるか

---

## 次の Roadmap (CEO 思想反映)

```
PR B-2a (merge 済): anchor continuity (turn 跨ぎで失わない)
[本 audit doc, no PR]: inference hierarchy 設計監査
PR B-2b (本 doc 後): Layer 1 deterministic 接続 (CEO 判断で Option A/B 選択)
PR B-2c: Layer 2 (前日終点 inheritance、DB query 追加)
PR B-2d: Layer 4-5 (location / history、Stargazer 観測接続)
PR B-2e: only-if-needed clarify (最後の砦、PendingSlot 拡張)
PR B-3: source 細分化 (derivedFrom) + selection route 統合
PR B-4: targetDate semantic time-aware
PR B-5: DB persistence
```

CEO 思想: **「unknown → 即聞く」 ではなく「推論優先、聞くのは最後」**

---

## 重要な発見 (CEO 提示時に注目すべき点)

1. **`extractExplicitEndpoint` は完全に不在** — origin 側だけ `extractExplicitStartPoints` がある非対称
2. **前日 plan の DB query は実装されていない** — client 持ちなので、layer 2 実装には DB query 追加が必要
3. **System A (locationResolver.ts) は legacy ではなく active** — PR B-2b 設計では System A を尊重する必要
4. **Location history は遥か先** — Stargazer Human OS 観測戦略との接続が前提
5. **permission state ("denied" / "unrequested") の区別は frontend 連携が必要** — 現状は resolver 内部判定のみ
