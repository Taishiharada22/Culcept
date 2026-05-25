# Phase 3-L-0 Readiness Audit

**作成日**: 2026-05-22
**status**: 監査 docs only、 3-L 実装着手なし、 dependency / env / API key 追加なし
**承認**: CEO (= 2026-05-22 GPT 補正受け、 L-0 audit GO)

**前提**:
- K phase 全完了 (= 12 frozen branches)
- 3-L design v0.2 docs 着地 (= `57504078`)
- 3-L design v0.2 は方向性 OK、 実装 GO **未確定**

---

## 0. Executive Summary (= 衝撃の発見)

**結論**: 3-L MVP は **Google Routes API なしで完全実装可能**。

理由:
1. 既存 `alter-morning/transport/durationHeuristic.ts` (= CEO 2026-04-24 確定) を **そのまま reuse 可能**
2. 既存 Phase 2-C geocode endpoint で coords を取得済 (= privacy-aware、 rate-limited、 cache あり)
3. 新規 dependency / env / migration **すべて不要**
4. CEO STOP 条件 7 項目 → **API-less なら 1 項目のみ** (= 実装 GO 明示承認)

戦略的優位:
- **cost = $0** (= API 呼ばない)
- **privacy policy 更新 = 不要** (= 第三者送信なし)
- **法務確認 = 不要** (= terms 関係なし)
- **法務 / Cloud / env / dependency setup ゼロ**
- **Lean validation**: heuristic で価値検証 → 不足なら Stage 5+ で API 追加

これは Aneurasync 思想 **「観察 > 推論」** と完全整合。 「完璧な精度」 より「事実の観察」 を優先。

---

## 1. 既存資産 inventory (= 監査結果)

### 1.1 Distance heuristic (= alter-morning/transport/durationHeuristic.ts)

**所在**: `lib/alter-morning/transport/durationHeuristic.ts` (83 行、 CEO 2026-04-24 確定)

**機能**:
- `estimateNeutralDurationMin(fromCoords, toCoords): number | null`
- `Coords = { lat: number; lng: number }` 型 export
- Haversine 距離計算 (= 内部)
- 段階テーブル (= 0.2km < 距離 → duration min):
  - ≤ 0.2km: null (= 同一地点扱い、 fake duration 禁止)
  - ≤ 1km: 10 min
  - ≤ 3km: 15 min
  - ≤ 7km: 25 min
  - ≤ 15km: 40 min
  - ≤ 30km: 60 min
  - > 30km: 90 min

**設計契約** (= 既存):
- mode-free (= 中立、 mode 推定は別 layer)
- NaN / invalid coords → null (= failure-safe)
- pure function、 副作用ゼロ

**3-L MVP での扱い**: **そのまま reuse**。 新規実装不要。

### 1.2 Transport types (= alter-morning/transport/types.ts)

**所在**: `lib/alter-morning/transport/types.ts`

**既存型**:
- `TransportMode` (= "walk" | "car" | "public_transit" | "bicycle" | "taxi" | "unknown")
- `DurationSource` (= "heuristic" | "routes_api" | "explicit_user" | "user_override")
- `TransportSegment` (= alter-morning 用、 plan 用に別途設計予定)

**3-L MVP での扱い**:
- `TransportMode` は **再利用**可能 (= 既存型を import)
- `DurationSource` も **再利用**可能 (= 既存値と整合)
- `TransportSegment` は alter-morning 専用、 plan 用は `MovementSegment` として別途定義 (= K-1c の MovementTransition 拡張)

### 1.3 Geocode endpoint (= Phase 2-C v3)

**所在**: `app/api/plan/anchors/geocode/route.ts` (POST batch resolve)

**機能 + privacy 保証**:
1. userId は **auth.getUser() から取得** (= request body から取らない)
2. privacy-safe payload: Google Places に送るのは `textQuery` (= locationText) **のみ**
3. **sensitive anchor 外部送信禁止**: `sensitiveCategory` 設定済 → Places API 呼ばない、 unresolved 返す
4. ownership check: auth user の anchor のみ
5. input strict validation
6. **rate limit**: per-user 100 calls / hour
7. dedupe: 同 locationText を 1 call で
8. fail-open: API error → null 返す (client semantic fallback)
9. audit log: anchorId + outcome + duration のみ (= locationText / response body は log なし)

**3-L MVP での扱い**: **そのまま reuse**。 coords は既存 endpoint 経由で取得済を活用。 新規 geocode endpoint 不要。

### 1.4 Cache + Rate limit infrastructure

**所在**:
- `lib/plan/geocodeRateLimit.ts` (= per-user 100/hour、 in-memory)
- `lib/plan/...` の `getCachedResolution / setCachedResolution` (= 既存 cache 経路)

**3-L MVP での扱い**:
- geocode cache は既存利用 (= coords 再取得不要)
- transport cache は新規 (= memory-only、 5 分 TTL、 §6 詳細)

### 1.5 anchorOverlap detection

**所在**: `lib/plan/anchorOverlap.ts` (`detectTimedAnchorOverlaps`)

**3-L MVP での扱い**: 不変 (= 3-L とは独立、 K-1 で利用済)

### 1.6 sensitive redaction infrastructure

**所在**:
- `lib/plan/dayGraph/dayGraphRedactionContract.ts` (= K-1 確立)
- `lib/plan/dayGraph/eventNodes.ts` (= sensitive → undefined location)
- `lib/plan/dayGraph/movementTransitions.ts` (= sensitiveProximity flag)

**3-L MVP での扱い**:
- `sensitiveProximity === true` の transition は API 呼ばない (= geocode endpoint と同 pattern)
- 既存 RedactionContract + Negative Capability 思想を transport 層でも継続

### 1.7 既存 anchor の coords 保持状態

**所在**: `lib/plan/external-anchor.ts`

**重要 finding**: anchor 自体は **coords を直接保持しない**。
- locationText (= raw text) のみ
- coords は geocode 経由で間接取得 (= Phase 2-C cache 利用)

→ 3-L MVP で coords が必要なら geocode 経由。 新 schema 不要。

---

## 2. API なし 3-L MVP の実現可能性

### 2.1 必要 data flow

```
anchor (= locationText)
   ↓ Phase 2-C geocode (= 既存)
coords (= { lat, lng })
   ↓ estimateNeutralDurationMin (= 既存)
durationMin (= heuristic 段階値)
   ↓ + mode 推定 (= 新規 helper、 distance-based)
MovementSegmentResolved
```

### 2.2 新規実装すべき範囲 (= Pure layer)

| 項目 | 規模 | 種別 |
|---|---|---|
| `MovementSegment` discriminated union (= K-1c MovementTransition 拡張) | 50 行 | type |
| `MovementResolutionStatus / TransportProvider / TransportModeCandidate` 等 | 100 行 | type |
| `MovementPrivacyClass` 4 段階 | 30 行 | type |
| `HeuristicDistanceProvider` (= durationHeuristic ラッパ) | 80 行 | pure helper |
| `ManualUserProvider` (= localStorage override 読込) | 60 行 | pure helper |
| `UnresolvedProvider` (= 全 fallback 失敗時) | 30 行 | pure helper |
| `TransportResolutionProvider` interface (= adapter) | 40 行 | type |
| `mode inference helper` (= distance + time-of-day) | 100 行 | pure |
| `resolveMovement` orchestration (= 5 段階 cascade) | 150 行 | pure orchestration |
| `MovementResolutionTelemetry` (= PII なし) | 50 行 | logging |
| `DayGraph integration` (= MovementTransition → MovementSegment) | 100 行 | adapter |
| `UI 拡張` (= K-3c-iii 階層 2 維持、 duration 表示) | 80 行 | component |
| tests (= 各 helper + integration) | 800-1200 行 | test |

**合計**: ~2,500 行 (= test 含む)、 production code ~1,000 行。 既存資産 reuse で **新規 dependency 0、 env 0、 migration 0、 API key 0**。

### 2.3 達成可能な品質

| 項目 | API なし pure | Google Routes API |
|---|---|---|
| 0.2km 以下: travel skip | ✅ | ✅ |
| 1km 徒歩: 10 min | ✅ (heuristic) | 8-12 min (= 実測) |
| 5km 都市: 25 min | ✅ (heuristic 段階) | 20-35 min (= mode 依存実測) |
| 30km 遠距離: 60 min | ✅ (heuristic) | 40-90 min (= mode + traffic) |
| **誤差 範囲** | ±30-50% (= 段階テーブル粗さ) | ±10-20% (= API 精度) |
| **「30 分の移動」 抽象表現整合** | ✅ 「移動 約 30 分」 | ✅ 同 |
| **「正確に 27 分」 表記** | ❌ (= heuristic 粗さ) | ✅ |
| **cost** | $0 | ~$50/月 想定 |
| **privacy 第三者送信** | 0 | あり |
| **法務確認必要** | ❌ | ✅ |

**Aneurasync 思想視点**: 「約 30 分」 「移動」 等の中立表現で十分。 精密 vs 観察、 後者を選ぶ。

### 2.4 結論

**API なし 3-L MVP は技術的・思想的に完全に成立する**。

Google Routes API 追加は将来 enhancement (= Stage 5+) として CEO 別承認後の選択肢。

---

## 3. STOP 条件 — API-less なら劇的減

### 3.1 従来 v0.2 STOP 条件 (= 7 項目)

| # | 条件 | API あり時 | **API なし時** |
|---|---|---|---|
| 1 | Routes API 有効化 | ❌ 必要 | **不要 ✅** |
| 2 | env / API key 追加 | ❌ 必要 (= 制約緩和) | **不要 ✅** |
| 3 | Monthly cost cap 承認 | ❌ 必要 ($50/月) | **不要 ($0) ✅** |
| 4 | Service Specific Terms 確認 | ❌ 必要 (= 法務) | **不要 ✅** |
| 5 | Privacy policy 更新 | ❌ 必要 (= 法務) | **不要 ✅** |
| 6 | dev sample data 採用 | △ 設計可能 | **N/A ✅** |
| 7 | 実装 GO 明示承認 | ❌ 必要 | ❌ 必要 (= 唯一) |

### 3.2 API-less STOP 条件 (= 1 項目のみ)

| # | 条件 | 状態 |
|---|---|---|
| 1 | **実装 GO 明示承認** (= L-1-pure 着手の CEO 判断) | CEO 判断待ち |

これだけ。 法務 / Cloud / env / dependency / cost setup **すべて不要**。

---

## 4. Commit plan (= API なし 3-L pure、 5-7 commits)

### 4.1 推奨 commit 階段 (= API-less full implementation)

| Commit | 範囲 | 規模 |
|---|---|---|
| **L-1-pure** | Type 拡張: MovementSegment / TransportProvider / TransportModeCandidate / MovementConfidence / MovementPrivacyClass + IntegrityContract 拡張 + tests | ~400 行 |
| **L-2-pure** | HeuristicDistanceProvider (= 既存 durationHeuristic ラッパ) + UnresolvedProvider + ManualUserProvider + tests | ~350 行 |
| **L-3-pure** | mode inference helper (= distance + time-of-day pure) + tests | ~300 行 |
| **L-4-pure** | resolveMovement orchestration (= 5 段階 cascade) + privacy guard + telemetry + tests | ~400 行 |
| **L-5-pure** | DayGraph integration (= MovementTransition → MovementSegment 昇格) + tests | ~300 行 |
| **L-6-pure** | UI 拡張 (= DayGraphTimeline で resolved 表示、 階層 2 維持) + tests | ~250 行 |
| **L-7-pure** | closeout audit + freeze | docs only |

### 4.2 Google Routes API 追加は Stage 5+ (= 別 phase 預け)

API 追加時の commit (= 将来 CEO 別承認後):
- L-8-api-prep: API readiness audit v2 (= 法務 + Cloud setup + Service Terms)
- L-9-api: GoogleRoutesProvider 追加 (= adapter pattern により plug-in)
- L-10-api: cache + rate limit + circuit breaker
- L-11-api: closeout + freeze

**Adapter pattern により、 pure layer は不変、 API は plug-in 追加のみ**。

---

## 5. 既存資産 dependency 図 (= pure 実装範囲確認)

```
3-L pure MVP
├── 既存 reuse (= 新規 0):
│   ├── alter-morning/transport/durationHeuristic.ts (= 段階 distance heuristic)
│   ├── alter-morning/transport/types.ts (= TransportMode / DurationSource)
│   ├── lib/plan/dayGraph/* (= K phase 全資産)
│   ├── app/api/plan/anchors/geocode/route.ts (= Phase 2-C、 coords)
│   ├── lib/plan/geocodeRateLimit.ts (= rate limit infra)
│   └── lib/plan/dayGraph/dayGraphRedactionContract.ts (= sensitive)
│
└── 新規実装 (= pure / no API):
    ├── lib/plan/transport/types.ts (= MovementSegment 等)
    ├── lib/plan/transport/heuristicDistanceProvider.ts
    ├── lib/plan/transport/manualUserProvider.ts
    ├── lib/plan/transport/unresolvedProvider.ts
    ├── lib/plan/transport/modeInference.ts
    ├── lib/plan/transport/resolveMovement.ts (= orchestration)
    ├── lib/plan/transport/movementTelemetry.ts (= safe)
    ├── lib/plan/dayGraph/dayGraphMovementResolver.ts (= integration)
    └── tests/* (= 各 unit + integration)
```

**新規 file**: 8 production + 8 test = 16 files / ~2,500 行
**migration / env / package / dependency 変更**: **0**

---

## 6. Cache policy for L-pure

### 6.1 Memory-only confirmed

GPT 補正 1 採用、 v0.2 §5 と同方針:
- session-scoped Map<string, MovementSegmentResolved>
- TTL 5 分
- max 200 entries (= LRU eviction)
- sensitive proximity → cache せず
- API なしのため Google Service Specific Terms 制約は **適用外**

### 6.2 User Override 永続化

manual_user source のみ localStorage:
- key: `aneurasync.plan.movementOverride.v1`
- format: `{ tripSignature: { mode, durationMin, savedAt } }`
- Google data ではない (= user 自身の override)、 規約問題なし

### 6.3 Geocode cache は Phase 2-C 既存利用

geocode は既に cache 済 → 3-L で coords 取得時に自動利用。 新規 cache 不要。

---

## 7. Privacy 監査 (= API なし時の劇的優位)

### 7.1 第三者送信ゼロ

| 観点 | API あり | **API なし** |
|---|---|---|
| 座標を第三者に送る | ✅ (= 匿名化しても送る) | ❌ **送らない** |
| Privacy policy 更新 | ✅ 必要 | ❌ **不要** |
| 法務確認 | ✅ 必要 | ❌ **不要** |
| anchor.title 漏洩リスク | (= 設計で防御) | **物理的にゼロ** |
| sensitive proximity 跨ぎ | API skip (= 信頼に依存) | **物理的に送らない (= API 自体ない)** |

→ Aneurasync 「Privacy first」 (= Invariant 4) と **完全合致**。

### 7.2 Telemetry も改善

API なしなら telemetry の PII 漏洩リスクも低減:
- coords / locationText 一切 telemetry に含めない (= 内部処理のみ)
- provider = "heuristic_distance" or "manual_user" or "unresolved" のみ
- latency_ms (= JS 内処理時間、 0-1ms 程度)

---

## 8. UI 表示 (= K-3c-iii 階層 2 維持)

API なし 3-L での UI 表現は v0.2 §10 同方針:

| privacyClass | 表示 |
|---|---|
| `normal` | 「移動 約 30 分」 (= heuristic 段階値、 confidence: low/medium で mode 表示しない) |
| `sensitive_adjacent` | 「移動 約 30 分」 (= mode なし) |
| `sensitive_both` | 「移動」 (= duration なし) |
| `location_unknown` | 「移動」 (= K-3 と同じ) |

**重要**: 「徒歩 30 分」 等の mode 表示は heuristic confidence では **default 出さない** (= GPT 補正 4 整合)。 API なし MVP では mode 強調しない。

---

## 9. 3-M Arrival Risk Memory との境界 (= API なしでも明確)

- 3-L = duration を **heuristic で観察**
- 3-M = duration + 過去観測差分で **risk 評価**

API なし 3-L の duration は heuristic (= 粗精度)、 3-M は同 user の **過去観測差分** で精度向上可能。 これは AI/ML ではなく単純統計、 API 不要。

→ 3-M も大半 API なしで実装可能 (= 別 phase 確認)

---

## 10. 3-L API-less MVP 実装 GO の判断 frame

CEO が判断すべき (= 1 項目のみ):

**Q: 3-L API-less pure layer 実装着手 (= L-1-pure 〜 L-7-pure) を承認するか?**

| 承認 | 効果 |
|---|---|
| **YES** | API なし 3-L MVP に着手、 ~2-3 週間で完成想定、 cost $0、 privacy 問題なし |
| **NO (= まだ保留)** | 別軸優先 (= K-3+ refinement / 初期ユーザー獲得 / Deploy 準備) |
| **PARTIAL** | L-1-pure / L-2-pure のみ先行 (= type + heuristic) → smoke 後判断 |

私の推奨: **YES、 但し commit by commit で CEO 判断挟む**。

---

## 11. 自立推論補強 (= L-pure を世界水準にする 5 革新)

### 11.1 「Distance heuristic + Time-of-day bucket」 combined inference

mode 推定で distance だけでなく time-of-day も考慮:
- 早朝 / 深夜 → 公共交通弱い、 driving / walking 優位
- ラッシュ → 公共交通優位 (= 但し traffic は API なしで判定不能、 confidence low)
- 通常時 → 距離 base
- → mode candidate に context-aware bias

### 11.2 「User Override Learning」 (= 機械学習 NOT、 単純記憶)

user が 「自宅→会社 35 分」 を override したら、 次回も 35 分 default 表示。 LLM 不使用、 単純 localStorage lookup。 これは Aneurasync 「自分の生の記憶」 思想と整合。

### 11.3 「Confidence-aware UI fade」

confidence: low → 表示更に薄く (= K-3c-iii 階層 2 より更に subtle)
confidence: medium → 通常 (= K-3c-iii 階層 2)
confidence: high → 通常 (= 同上)
confidence: very_high → 通常 (= 強調はしない、 Memory Chip 思想)

### 11.4 「Heuristic version banner」 (= dev only)

dev mode で「Heuristic v1 (= 距離段階)」 等を表示、 user に「精度は heuristic」 が分かる。 但し prod では非表示 (= 「観察」 体験のみ)。

### 11.5 「Travel Diary」 (= 将来 phase)

heuristic で算出した duration を「実際は何分だった?」 と user が後から記録できる仕組み (= 3-M 入力 + L-pure 改善)。 これは Aneurasync 「自己観察」 思想の極致。 別 phase で検討。

---

## 12. 結論 + CEO 判断ポイント

### 12.1 L-0 audit 結論

| 項目 | 結論 |
|---|---|
| 3-L MVP は API なしで完全実装可能か | ✅ **YES** (= 既存資産 + 新規 pure helper 数本) |
| 既存資産で何 % cover できるか | ~30% (= durationHeuristic + types + geocode + redaction infra) |
| 新規実装 範囲 | ~2,500 行 (= test 含む) |
| STOP 条件 (= API なし) | 1 項目 (= 実装 GO 明示承認) |
| Cost | $0 |
| Privacy 第三者送信 | 0 |
| 新規 dependency / env / migration | 0 |
| Aneurasync 思想整合 | ✅ 完全 (= 「観察 > 推論」、 「Privacy first」 完璧) |

### 12.2 CEO 判断ポイント

1. **L-1-pure 〜 L-7-pure 実装 GO** (= API なし MVP)
   - YES → 即着手可能、 1 commit ごと CEO 判断挟む
   - NO → 別軸優先
   - PARTIAL → L-1-pure / L-2-pure (= type + heuristic) のみ先行
2. **Google Routes API 追加は別 phase 預け**
   - L-pure 完成後の CEO 判断 (= 価値検証ベース)
   - 不要なら永続的に API なし運用
3. **次フェーズ優先順位**:
   - (a) L-pure 実装 (= 推奨)
   - (b) K-3+ refinement (= 視覚 enhance)
   - (c) 初期テストユーザー獲得 (= 真の data 累積)
   - (d) Deploy 準備

---

## 13. 永続禁止 (= L-0 audit 範囲)

- ❌ 3-L 実装着手 (= 本 L-0 docs only)
- ❌ Transport API 接続
- ❌ env / API key 追加
- ❌ DB migration
- ❌ package / dependency 変更
- ❌ warning UI / recommendation / optimization 文言
- ❌ Arrival Risk Memory
- ❌ fetch / push / gh
- ❌ reset / restore / stash / branch delete
- ❌ frozen branches への commit
- ❌ LLM 呼出
- ❌ DB 直接 insert/update/delete

---

## 14. 関連 docs

- `docs/alter-plan-phase3-l-transport-design.md` (= 3-L design v0.2、 API ありを想定した設計)
- `docs/alter-plan-phase3-k-closeout-audit.md` (= K phase 完了監査)
- `docs/alter-plan-phase3-k-deferred-smoke-ledger.md`
- `docs/alter-plan-phase3-k-pr-runbook.md`
- `lib/alter-morning/transport/durationHeuristic.ts` (= 既存 distance heuristic 本体)
- `lib/alter-morning/transport/types.ts` (= 既存 TransportMode / DurationSource)
- `app/api/plan/anchors/geocode/route.ts` (= Phase 2-C geocode + privacy infra)
- `decision-log.md`

---

## 15. Version 履歴

| version | 日付 | 内容 | 承認 |
|---|---|---|---|
| **v0.1** | **2026-05-22** | **L-0 readiness audit 初版、 API なし MVP 可能性確定** | **CEO 確認待ち** |
| (将来) v0.2 | TBD | CEO 判断後の補正 | TBD |
