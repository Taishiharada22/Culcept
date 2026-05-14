# Alter Morning Layer 4-5 (Location / History) 設計監査 (PR B-2d 着手前 audit)

**作成日**: 2026-05-02
**対象**: PR B-2c merge 後 (HEAD: 80287f5f)、PR B-2d (Layer 4-5: location / history) 着手前
**目的**: location / history / permission UX が絡む大型 PR を防ぐため、現状を read-only で監査し scope 縮小判断を CEO に提示

---

## 致命的発見 (PR B-2d の scope を大きく左右)

### ❌ 位置情報 consent フローが存在しない

- Alter Morning には UI で「位置情報利用許可」 を user に求める仕組みなし
- `profiles` に `location_consent_granted` 等の column 不在
- CoAlter 側には `coalter_pair_states.state` で consent 管理あり (別系統)
- frontend `useAlterChat` は `navigator.geolocation` を直接呼び、拒否時は黙ってnull (= ユーザに「位置情報を使う」 と通知していない)

### ⚠️ Permission state の区別は型レベル定義のみ

- PR B-1 で `AnchorUnknownReason = "denied" | "unrequested" | "no_baseline" | "no_endpoint_signal"` を定義
- ❌ caller (route) から explicit に渡される経路なし
- ❌ frontend で `navigator.permissions.query` 使用例なし
- 現状 backend は `currentLat/Lng` が null かどうかで間接判別のみ

### ⚠️ Layer 5 (location history) は概念のみ

- DB に `location_history` 系 table 不在
- `lib/stargazer/` に location 観測 logic 不在
- `EarthTraceSection.tsx` で `navigator.geolocation.watchPosition` の連続観測あり、ただし **Alter Morning pipeline には未連携**

---

## 各前提条件の状態 (10 項目)

### Group A: current location infrastructure

| # | 項目 | 現状 | PR B-2d 影響 |
|---|---|---|---|
| 1 | browser geolocation 取得経路 | `useAlterChat.ts:262-283` で mount 時単発取得、5s timeout、permission UI 不在 | ⚠️ permission UI 追加要否を CEO 判断 |
| 2 | permission state 区別 | 型定義のみ、caller から渡せず、frontend 取得経路もなし | ⚠️ frontend 連携が必要 |
| 3 | current_location が legacyAdapter で活用 | `resolveHomeAnchor` Priority 1、PR B-2c の Layer 3-4 として動作中 | ✅ 既に動作 (強化のみ要検討) |
| 4 | 「常時 vs 予定駆動」 | 常時取得 (`watchPosition`) は EarthTrace のみ、Alter Morning には未連携 | ⚠️ CEO 戦略判断 (常時 / 予定駆動 / 単発) |

### Group B: location history

| # | 項目 | 現状 | PR B-2d 影響 |
|---|---|---|---|
| 5 | location history DB schema | ❌ **不在** (`user_location_history` 等の table なし) | DB migration 必須 = 大型 |
| 6 | Stargazer 観測戦略接続 | 概念設計のみ (`docs/stargazer-human-os-design.md`)、`lib/stargazer/` 実装なし | Stargazer 戦略との同期判断必要 |
| 7 | 前夜〜朝の滞在履歴取得 | ❌ 不在、単発 / 連続観測の方針も未定 | DB schema + retention + 単発/連続の戦略判断 |

### Group C: privacy / consent / time-aware

| # | 項目 | 現状 | PR B-2d 影響 |
|---|---|---|---|
| 8 | privacy / consent 運用 | CLAUDE.md に位置情報規律の明記なし、`profiles` に consent column なし、Alter Morning に consent UI なし | 別 PR (`PR B-2d-0`) でも検討 |
| 9 | targetDate semantic 連動 | `STALE_SOURCES_ON_DATE_MISMATCH` で current が stale 扱い、深い time-aware は PR B-4 予定 | scope は PR B-4 と分担 |
| 10 | scope 縮小判断 | 1 PR に詰めると DB migration + frontend + backend で大型 | **分割必須** |

---

## 構造課題 (PR B-2d-α と PR B-2d-β に分割すべき)

### Layer 4 (current_location 活用強化)

**実装可能要素 (Layer 5 / consent と独立して動作可)**:
- frontend で `navigator.permissions.query` 経由で permission state 取得
- backend route で `permissionState: "denied" | "unrequested" | "granted"` を body から受ける
- `AnchorUnknownReason` を caller から explicit に渡せる経路追加
- 既存 `currentLocation` Priority 1 logic は維持 (= PR B-2c で既に動作)

**実装規模**: ~400-500 行、PR #50/#52/#53/#54/#55/#57 と同等の限定 scope

### Layer 5 (location history)

**実装に必要な要素**:
- DB migration (`alter_morning_location_history` table、CHECK / RLS / retention)
- 観測戦略 (常時 `watchPosition` vs 予定駆動 vs 単発タスク)
- consent flow (`profiles.location_consent_granted` column + UI)
- Stargazer 観測層との接続 (層別アーキテクチャの統合判断)
- 前夜〜朝の滞在履歴 inference logic

**実装規模**: ~1500-2500 行 (DB + frontend + backend + privacy 全部入り)

→ **Layer 5 を 1 PR で実装するのは CEO 警告 (大型 PR 化) に反する**。

---

## CEO 推奨判断ポイント (4 つ、最終)

### 判断 1: PR B-2d の scope 構造

| Option | 内容 | 規模 | 推奨度 |
|---|---|---|---|
| **A** | PR B-2d = **Layer 4 強化のみ** (permission state 区別 + AnchorUnknownReason 経路)、Layer 5 は別 PR | ~400 行 | ✅ **私の推奨** |
| B | PR B-2d-0 (consent UI + DB) → PR B-2d (Layer 4) → PR B-2d-2 (Layer 5) の 3 段階 | 各小、PR 連鎖長い | ⚠️ scope 細分化過剰 |
| C | 1 PR で Layer 4-5 全部実装 | ~2000+ 行 | ❌ **却下** (CEO 警告反する) |

### 判断 2: Consent flow の優先度

| Option | 内容 |
|---|---|
| (a) | **PR B-2d 本体で扱わない** — 既存 `navigator.geolocation` 拒否で十分、UI 簡素化、別 PR で UX 強化 |
| (b) | PR B-2d-0 として **先行実装** (DB column + UI、CEO 承認必要) |
| (c) | Layer 5 と一緒に扱う (= Layer 5 PR が consent も含む) |

私の推奨: **(a)** — Alter Morning は既に `navigator.geolocation` で permission を取っている (拒否時は null fallback)。UX 強化は別 PR で扱う。

### 判断 3: Layer 5 (location history) の優先度

| Option | 内容 |
|---|---|
| (i) | PR B-2e の **直前** (最後 layer の clarify を実装する直前) |
| (ii) | **後回し** (Stargazer 戦略統合まで延期) |
| (iii) | PR B-3 / PR B-4 の後 |

私の推奨: **(ii)** — Stargazer Human OS の location 観測戦略が概念のみなので、戦略確定後に実装する方が綺麗。当面は Layer 4 までで十分推論精度が出るはず。

### 判断 4: PR B-2d の commit 構成

PR B-2d (Layer 4 強化のみ、~400 行想定):

| # | 内容 | 行数 (見積) |
|---|---|---|
| 1 | frontend `useAlterChat` で `navigator.permissions.query` 経由 permission state 取得 + body 注入 | ~80 |
| 2 | backend route で `permissionState` 受け取り + `LegacyAdapterInput.permissionState?` に注入 | ~50 |
| 3 | `legacyAdapter` で `permissionState` を `AnchorUnknownReason` の決定に使う (`"denied"` / `"unrequested"` を区別) | ~50 |
| 4 | unit test (`AnchorUnknownReason` の決定 logic) | ~80 |
| 5 | route-level integration test (denied / unrequested / granted の各シナリオで anchor が正しく区別される) | ~120 |
| 6 | TODO comment + regression 確認 | ~20 |

合計 ~400 行、PR #50-#57 と同等の限定 scope。

---

## Roadmap 更新 (本 audit 反映)

```
✅ PR B-2a/B-2b/B-2c (merge 済): anchor continuity + Layer 1 + Layer 2 inheritance
✅ PR B-5a (merge 済): persistence foundation
✅ Inference hierarchy audit doc (PR B-2c 前)
✅ Location/history audit doc (本 doc、PR B-2d 前)
🟡 PR B-2d (本 audit 後): Layer 4 強化 (permission state 区別、Layer 5 は別 PR)
PR B-2e: only-if-needed clarify (最後の砦) + user_override の STRONG 追加
PR B-3: 固有名 grounding + derivedFrom + selection 統合
PR B-4: targetDate time-aware
PR B-2f (新): Layer 5 location history (Stargazer 戦略確定後、別 PR)
PR B-2g (新): consent UX 強化 (DB + UI、別 PR)
```

---

## 私の推奨 (鵜呑みではなく自分の判断)

**Option A (PR B-2d = Layer 4 強化のみ)** + **判断 2 (a) (consent UI は別 PR)** + **判断 3 (ii) (Layer 5 は後回し)** を推奨:

理由:
1. CEO 警告「大型 PR 化を防ぐ」 と整合 (~400 行で限定 scope)
2. Layer 4 強化だけでも「denied / unrequested / granted」 の区別が UI で表現可能になる (PR B-1 の AnchorUnknownReason が活きる)
3. Layer 5 を急ぐ必要なし (Stargazer 戦略がまだ概念のみ、急いで実装しても無駄になる可能性)
4. consent UI は Alter Morning 単体で扱うべきか、Aneurasync 全体で統一すべきかの戦略判断が必要 (PR B-2d で先走らない)

PR B-2d-α (= 本 PR で実装、Layer 4 強化のみ) → **PR B-2e (clarify)** → **PR B-2f (Layer 5、Stargazer 戦略確定後)** の順で進める。

---

## CEO 確認待ち (4 判断、最終)

1. **PR B-2d scope = Option A** (Layer 4 強化のみ、Layer 5 別 PR) で進めて良いか — Yes / No
2. **Consent UI は PR B-2d 本体で扱わない** ((a)、別 PR で扱う) — Yes / No
3. **Layer 5 (location history) は (ii)** (Stargazer 戦略統合後に別 PR) で良いか — Yes / No
4. **PR B-2d commit 構成 (6 commits / ~400 行)** で進めて良いか — Yes / No

3+ Yes なら PR B-2d 設計詳細起案 → 実装着手します。
