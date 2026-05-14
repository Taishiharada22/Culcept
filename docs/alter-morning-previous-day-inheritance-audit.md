# Alter Morning 前日終点 Inheritance 設計監査 (PR B-2c 着手前 audit)

**作成日**: 2026-05-02
**対象**: PR B-2b merge 後 (HEAD: 77769029)、PR B-2c (Layer 2 前日終点 inheritance) 着手前
**目的**: 「前日の journeyEnd を本日の journeyOrigin の inference 材料にする」 ための前提条件を read-only で確認

---

## 致命的発見 (PR B-2c の scope を大きく左右)

### ❌ `morning_sessions` table は **存在しない**

`supabase/migrations/` を全量 grep した結果、過去の plan を保存する DB table は **不在**:
- `alter_morning_plan_history` 不在
- `morning_sessions` 不在
- `priorPlan` は client が body で round-trip で送るだけ (DB query 不使用)

**結論**: 前日終点 inheritance には **新規 DB migration が必須**。これは PR B-5 (DB persistence) の scope を **PR B-2c に前倒し** することを意味する。

---

## 各前提条件の確認結果

### 1. 前日 plan の取得経路

| 項目 | 現状 | PR B-2c 影響 |
|---|---|---|
| `priorPlan` の供給 | `app/api/stargazer/alter/route.ts:1874` で `rawMorningSession?.plan` (body 由来) | ⚠️ 前日 plan は body にない、DB query 必要 |
| 前日 plan の DB query 経路 | ❌ **不在** | 新規実装必要 |

### 2. `morning_sessions` の DB schema

| 項目 | 現状 | PR B-2c 影響 |
|---|---|---|
| Table 存在 | ❌ **不在** | **新規 migration 必須** |
| 必要な構造 (推奨) | `user_id` / `plan_date` / `plan` (JSONB) / `created_at` + index `(user_id, plan_date DESC)` | CEO 承認必須 |

### 3. user_id ↔ session の連続性

| 項目 | 現状 | PR B-2c 影響 |
|---|---|---|
| `MorningSession.userId` field | ✅ `lib/alter-morning/types.ts:908` 存在 | ✅ user_id で query 可能 |
| `MorningPlan.date` field | ✅ YYYY-MM-DD 形式 | ✅ plan_date で sort 可能 |
| 効率的 query | — | migration 後に成立 |

### 4. assumed/confirmed 区別

| 項目 | 現状 | PR B-2c 影響 |
|---|---|---|
| `isAssumedAnchor()` | ✅ `default_round_trip` のみ true | ✅ 前日 journeyEnd の信頼度判定に活用可能 |
| confirmed sources | `user_explicit_endpoint` / `user_override` / `comprehension_explicit` | ✅ 高信頼度として区別可 |
| **継承戦略**: assumed end (default_round_trip) を翌日 origin として使うか? | — | ⚠️ **CEO 判断必要** |

### 5. 宿泊地文脈の扱い

| 項目 | 現状 | PR B-2c 影響 |
|---|---|---|
| 「ホテルに泊まる」 vs 「自宅に帰る」 区別 | 両方とも `kind="known_label_only"` で source 区別なし | ⚠️ 翌朝 origin として継承するとき、ホテル continuance の考慮なし |
| 「ホテル」 ラベル → coords 解決 | ❌ 不在 (固有名 grounder は PR B-3) | ⚠️ 翌朝 origin = ホテル known_label_only → travel 不生成 |

### 6. 新規 user / 連続使用がない user

| 項目 | 現状 | PR B-2c 影響 |
|---|---|---|
| 初回 session (priorPlan=undefined) | `kind="unknown", reason="no_baseline"` | ✅ 既存挙動で OK |
| 1 週間ぶりログイン | 前日 plan 不在 → Layer 2 が動かない | ✅ Layer 3 (baseline_home) が fallback |
| `reason="no_previous_day"` のような専用 reason の必要性 | — | ⚠️ 設計判断 (現状の `no_baseline` で十分か) |

### 7-9. cross-day session / 連泊 / continuity edge cases

| 項目 | 現状 | PR B-2c 影響 |
|---|---|---|
| 明日プランを今日作るシナリオ | PR B-2a で samePlanDate 判定済み (T9 で固定) | ✅ 既存挙動と整合 |
| cross-day session 移行 | applyAnchorFallback の Case 4-6 で stale 拒否 | ⚠️ 前日 inheritance は別経路 (samePlanDate=false でも前日 endpoint なら継承する logic) |
| 連泊 / 多日 cascade 継承 | ❌ 不在 | ⚠️ **scope 縮小判断**: 「直前 1 日のみ」 で割り切るべき (audit agent 推奨) |

---

## CEO 確認待ち判断ポイント (重要、3 つ)

### 判断 1: PR B-2c の scope 構造

| Plan | 内容 | 規模 | 評価 |
|---|---|---|---|
| **X** | DB migration + Layer 2 inheritance を **1 PR で統合** | ~1000-1500 行 | ⚠️ scope 大、CEO/GPT 「scope 限定」 規律ギリギリ |
| Y | PR B-2c を **延期**、Roadmap 再構成 (Layer 4-5 / clarify を先に、DB persistence 後で Layer 2 を再着手) | 個別小 PR の連鎖 | ✅ 規律遵守、ただし Layer 2 が長期間欠ける |
| Z | DB なしの **「semi-persistent」 inheritance** (client localStorage に前日 plan を保持) | ~400-600 行 | ❌ frontend 連携リスク、scope 違反 |

### 判断 2: assumed end (default_round_trip) を翌日 origin として継承するか

- **継承する**: 「家に帰った」 推定でも翌朝起点 = 自宅で大抵正しい (確率高)
- **継承しない**: 推定なので信頼度低い → 翌朝 Layer 3 (baseline_home) で別途解決
- **私の推奨**: **継承する**。`isAssumedAnchor()` で識別済みなので翌日継承時に「(前日推定)」 ラベル付き表示で UI に明示できる

### 判断 3: 連泊 / 多日 cascade 継承の扱い

- **直前 1 日のみ**: シンプル、scope 限定 (audit agent 推奨)
- **多日継承**: 連泊シナリオを完全 cover、ただし矛盾検出 logic 必要
- **私の推奨**: **直前 1 日のみ**。多日 cascade は将来 PR で必要性確認後に検討

---

## 私の推奨 (鵜呑みではなく自分の判断)

**Plan X (DB migration を含む PR B-2c) を推奨**。理由:

1. **CEO 思想 (推論優先) の中核に Layer 2 がある**: 「前日終点 = 翌朝起点」 は最も信頼度の高い inference 材料の一つ。Plan Y で Layer 2 が長期欠落するのは思想実装の遅れになる
2. **Plan Z (frontend localStorage) は scope 違反リスク**: PR B-2 系は server-side state contract の確立が目的。frontend 連携は別 scope
3. **DB migration は CEO 承認下で実施可能**: CLAUDE.md の prohibited actions ではあるが、CEO 明示承認下では可
4. **scope 縮小余地**: 「直前 1 日のみ」 + 「assumed end も継承可」 で割り切ればコード量を抑えられる

**Plan X の実装内訳 (~1000 行想定、CEO 承認後)**:
- Migration: `alter_morning_plan_history` table (~50 行)
- route.ts: 前日 plan query (~100 行)
- legacyAdapter: Layer 2 inheritance logic (~80 行)
- DB persistence on save (~80 行)
- Layer 2 unit test (~200 行)
- route-level integration test (~250 行)
- TODO comments + audit (~50 行)

ただし、Plan Y (順序変更) も合理的: PR B-5 (DB) を完成させてから PR B-2c に入る方が **scope 単位がより小さく**、構造監査が楽になる。

---

## CEO 判断待ち (最終 3 点)

1. **Plan X / Y / Z のどれを採用するか**
2. **assumed end (default_round_trip) を翌日 origin に継承するか**
3. **連泊 cascade は「直前 1 日のみ」 で割り切るか**

3 点 Yes 後、PR B-2c (or 順序変更 Roadmap) の commit 構成を起案します。

---

## Roadmap 再考 (Plan Y を選択した場合の例)

```
✅ PR B-2a (merge 済): anchor continuity
✅ PR B-2b (merge 済): Layer 1 explicit detector
PR B-2c (新): Layer 4-5 (location / history、Stargazer 接続) — DB なしで実装可
PR B-2d (新): only-if-needed clarify (最後の砦) — DB なしで実装可
PR B-3: 固有名 grounding (System A 統合)
PR B-4: targetDate time-aware
PR B-5: DB persistence (`alter_morning_plan_history`) — CEO 承認必須
PR B-2e (新): Layer 2 前日終点 inheritance (DB 完成後)
```

Plan X を選択すれば旧 Roadmap 通り (B-2c が DB 含む大 PR)。CEO 判断次第。
