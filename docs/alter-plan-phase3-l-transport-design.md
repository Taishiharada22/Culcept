# Phase 3-L Transport Layer 1 Design v0.2

**作成日**: 2026-05-22
**status**: 設計レビュー only、 実装着手なし、 dependency / env / API key 追加なし
**version**: v0.2 (= GPT 7 補正 + Claude 自立 12 革新統合)

**前提**:
- K-1〜K-3c-iii 全凍結 (= 12 frozen branches)
- `MovementTransition` は `timingStatus: "unresolved"` で予約済 (= K-1c)
- `EventNode.durationSource` + `boundaryClipped` で provenance 思想確立済 (= K-1f-α)

---

## 0. Mobility Truth Layer 思想 (= 世界トップ超越の革新)

### 0.1 既存の業界常識

| App | 思想 | UX |
|---|---|---|
| Google Maps | 最短経路 + 効率 | 「○分早く着く」 「速い」 |
| Apple Maps | 同上 | 同上 |
| Citymapper | 最適 ルート | 「お得」 「速い」 「安全」 |
| NAVITIME | 同上 | 「早朝割」 「乗換案内」 |

すべて **「最適化」** を売る。 「速い / 安い / 早く着く」。

### 0.2 Aneurasync 3-L の革新: **Mobility Truth Layer**

```
3-L = 「観察する」 のみ、 「最適化しない」
```

| 業界 | Aneurasync 3-L |
|---|---|
| 「最短ルート」 を推奨 | 移動の **事実** を観察 |
| 「速く着く」 で訴求 | 「30 分の移動」 を **中立的**に表現 |
| 失敗時 retry / error 警告 | 失敗時 **静かに unresolved 維持** |
| user に optimization 提案 | user に **observation** のみ提供 |

### 0.3 Layered design (= K で確立、 3-L が Layer 1)

```
Layer 0 (= K-1):  予定と空白の構造
Layer 1 (= 3-L):  移動の存在と所要時間 (= Truth Layer)
Layer 2 (= 3-M):  間に合うか (= Risk Layer)
Layer 3 (= 3-N):  Counter-Factual (= 別の 1 日の選択肢)
```

**3-L は「最適化しない」**:
- 「早く出ましょう」 → NG (= 3-M 領域でも禁止)
- 「この経路がおすすめ」 → NG (= 永続 ban)
- 「最短経路」 → NG
- 「遅刻しそう」 → NG (= 3-M でも禁止)

**出してよいのはこれだけ**:
- 「移動 約 30 分」 (= normal)
- 「移動 約 30 分 (徒歩)」 (= mode confidence high のみ、 任意)
- 「移動」 (= unresolved or sensitive proximity)
- 「未確定の移動」 (= timingStatus: "unresolved" の明示)

---

## 1. GPT 7 補正 + Claude 12 革新 統合

### 1.1 補正 (= GPT)

| # | 補正 | 反映 |
|---|---|---|
| 1 | localStorage cache 30 日 危険 | §5 Cache Policy: memory only for MVP、 永続なし |
| 2 | Google Routes API 既存 key 即 OK は甘い | §6 Routes API: 有効化 / env / field mask / cost cap 必須設計 |
| 3 | 電車/バス/飛行機 断定しない | §7 Mode handling: MVP は walking/driving/transit、 飛行機は heuristic or unresolved |
| 4 | 徒歩 default は危険 | §8 modeCandidate + confidence、 UI 初期は「移動 約 30 分」 |
| 5 | API failure 内部観測必須 | §9 Safe Telemetry (= PII なし schema) |
| 6 | sensitive proximity UI 最小化 | §10 Sensitive Proximity Blackout (= 3 段階) |
| 7 | Provider-independent type | §4 Type Contract (= adapter pattern) |

### 1.2 Claude 12 革新 (= 自立補強)

| # | 革新 | 効果 |
|---|---|---|
| A | Mobility Truth Layer 思想 (= §0) | 世界トップアプリ超越 |
| B | Provenance + Confidence + Privacy 3 軸 (= §4) | 後続 3-M/N の信頼性確保 |
| C | Provider Health + Circuit Breaker (= §6.3) | API 障害時の reckless retry 防止 |
| D | Adapter Pattern (= §4.5) | Google / OSRM / NAVITIME / Manual 切替容易 |
| E | TimeBudget hint (= §4.4) | 3-M bridge 容易化 |
| F | 「移動の dignity」 視覚 (= §11) | K-3c-iii 階層 2 維持、 思想統一 |
| G | Privacy-Aware Cache Key (= §5.3) | sensitive cache 漏洩 ゼロ |
| H | 「自然な失敗」 表現 (= §0.2) | 哲学的革新 |
| I | Safe Telemetry Schema (= §9) | Privacy by Design |
| J | User Override 永続化 (= §5.4) | Google data 制約と分離 |
| K | Multi-day Cache Sharing (= §5.5) | API call 大幅削減 |
| L | Graceful Degradation Cascade (= §12) | 5 段階 fallback、 unresolved 必達 |

---

## 2. Scope

### 2.1 IN scope (= 3-L MVP)

| 項目 | 内容 |
|---|---|
| MovementSegment type (= MovementTransition 拡張) | `timingStatus: "resolved" \| "unresolved"` |
| Walking / Driving / Transit duration | API or heuristic で算出 |
| Provider-independent adapter | Google / Heuristic / Manual / Unresolved |
| Privacy class (= 4 種) | normal / sensitive_adjacent / sensitive_both / location_unknown |
| Memory cache only | session scoped、 5 分 TTL |
| Safe Telemetry | provider / status / latency / cache_hit のみ |
| Graceful fallback | API fail → heuristic → unresolved |
| UI subtle update | K-3c-iii 階層 2 維持、 duration + mode (optional) |
| Sensitive proximity blackout | UI 表示最小化 |
| 3-M / 3-N data contract | MovementSegment shape 確定 |

### 2.2 OUT of scope (= K-3+ / 3-M / 3-N / 別 phase)

| 項目 | 預け先 |
|---|---|
| 飛行機 detailed routing | 別 phase (= heuristic / unresolved で MVP) |
| 日本特化 transit (NAVITIME 等) | 別 phase (= MVP は Google Routes API のみ) |
| Real-time traffic | 別 phase |
| Turn-by-turn directions | 別 phase (= 3-L は duration のみ) |
| Schedule (= 「次の電車」) | 別 phase |
| User-customized buffer | 3-M (= buffer は Risk 領域) |
| Arrival Risk 推論 | 3-M |
| 「遅刻しそう」 warning | 3-M でも禁止 (= 永続 ban) |
| Counter-factual alternative routing | 3-N |
| 「早く出ましょう」 等 recommendation | 永続禁止 (= optimization 文言禁止) |
| persistent route cache | 規約確認まで保留 |
| Google data の localStorage 保存 | 規約上保留 |

---

## 3. ゴール逆算

```
ユーザーが「1 日の現実性」 を観察できる
  ↓
移動を含めた DayGraph が時間軸上で物理的に成立しているか分かる
  ↓
MovementTransition (= 「→ 移動」 のみ) を MovementSegment (= duration 付き) に昇格
  ↓
3-L MVP deliverable:
  - MovementSegment type 確立
  - Provider adapter pattern
  - Privacy + Confidence + Source 3 軸
  - Cache memory-only
  - UI subtle update (= 階層 2 維持)
  - Safe telemetry
  - 3-M/N contract
```

---

## 4. Type Contract (= Provider-Independent)

### 4.1 Movement Resolution Status

```typescript
export type MovementResolutionStatus =
  | "unresolved"   // 解決できなかった (= K-1c 既存と整合)
  | "resolved";    // duration 確定
```

### 4.2 Transport Provider (= Adapter abstraction)

```typescript
/**
 * Provider ID。 Google 固有名ではなく抽象。
 * 将来 OSRM / NAVITIME / Mapbox 等を追加可能。
 */
export type TransportProvider =
  | "google_routes"         // Google Routes API
  | "heuristic_distance"    // 距離 heuristic (= API なし、 既存 alter-morning 経路 reuse)
  | "manual_user"           // user explicit override
  | "none";                  // unresolved (= 全 fallback 失敗時)
```

### 4.3 Transport Mode Candidate

```typescript
/**
 * Mode candidate (= 「徒歩」 と断定せず、 候補として保持)。
 *
 * GPT 補正 4: 「徒歩 default」 は危険、 confidence を持つ。
 */
export type TransportMode =
  | "walking"
  | "driving"
  | "transit"      // 電車 / バス
  | "flight"       // 100km+ 県境跨ぎ heuristic
  | "unknown";     // 不明

export interface TransportModeCandidate {
  readonly mode: TransportMode;
  readonly confidence: MovementConfidence;
}
```

### 4.4 Movement Confidence (= 4 段階 with reason)

```typescript
export interface MovementConfidence {
  readonly level: "low" | "medium" | "high" | "very_high";
  readonly reason:
    | "heuristic_distance_only"   // low (= 距離だけで mode 推定)
    | "heuristic_default"          // low
    | "routes_api_response"        // high
    | "routes_api_with_traffic"    // high (= real-time、 3-L MVP 範囲外)
    | "user_explicit"               // high (= user 明示)
    | "cross_provider_match";       // very_high (= 複数 provider 一致、 将来)
}
```

### 4.5 Movement Privacy Class (= 4 段階、 Claude 拡張)

```typescript
export type MovementPrivacyClass =
  | "normal"               // 前後どちらも sensitive ではない
  | "sensitive_adjacent"   // 片方 sensitive
  | "sensitive_both"       // 両方 sensitive (= 完全 blackout)
  | "location_unknown";    // location 不明 (= unresolved 別軸)
```

**UI 表示規約** (= §10 詳細):
- `normal`: 「移動 約 30 分」 + mode (= confidence high のみ)
- `sensitive_adjacent`: 「移動 約 30 分」 (= mode 削除)
- `sensitive_both`: 「移動」 のみ (= duration も削除、 完全 blackout)
- `location_unknown`: 「移動」 のみ (= K-3c-iii と同じ unresolved 表示)

### 4.6 Top-level MovementSegment

```typescript
/**
 * K-1c MovementTransition を継承拡張 (= 後方互換)。
 * timingStatus 別に shape を絞る discriminated union。
 */
export interface MovementSegmentUnresolved extends MovementTransition {
  readonly timingStatus: "unresolved";
  // 以下、 解決失敗の context 情報 (= telemetry 用)
  readonly unresolvedReason: MovementUnresolvedReason;
}

export interface MovementSegmentResolved extends MovementTransition {
  readonly timingStatus: "resolved";
  readonly estimatedDurationMin: number;
  readonly modeCandidate: TransportModeCandidate;
  readonly source: TransportProvider;
  readonly confidence: MovementConfidence;
  readonly privacyClass: MovementPrivacyClass;
  /** 距離 (m)、 公開 UI で出さない (= 内部のみ、 3-M/N 用) */
  readonly distanceM?: number;
  /**
   * Time budget hint (= 前後 anchor 間の余白 vs duration)。
   * 3-M Arrival Risk 計算の base。 3-L は計算するだけ、 「余裕ない」 等の判断はしない。
   */
  readonly slackAnalysis?: {
    readonly availableMin: number;
    readonly durationMin: number;
    readonly utilization: number;
  };
}

export type MovementSegment =
  | MovementSegmentUnresolved
  | MovementSegmentResolved;

export type MovementUnresolvedReason =
  | "location_unknown"          // anchor の location なし
  | "sensitive_proximity"        // sensitive 跨ぎ (= API 呼ばず)
  | "api_timeout"
  | "api_error"
  | "rate_limit"
  | "cost_cap_exceeded"
  | "heuristic_failed"
  | "no_provider_available";
```

### 4.7 Provider Adapter Interface

```typescript
/**
 * Provider-independent interface (= Claude 革新 D)。
 * 各 provider は本 interface を実装。
 */
export interface TransportResolutionProvider {
  readonly id: TransportProvider;
  readonly health: ProviderHealth;
  resolveDuration(input: MovementResolutionInput): Promise<MovementResolutionResult>;
}

export interface MovementResolutionInput {
  /** Anonymized coordinates (= ~100m 精度、 sensitive_adjacent なら ~1km) */
  readonly fromCoords?: { lat: number; lng: number };
  readonly toCoords?: { lat: number; lng: number };
  readonly preferredMode?: TransportMode;
  /** privacy class が sensitive_both なら provider 呼ばない決定は caller 責任 */
}

export type MovementResolutionResult =
  | { ok: true; segment: MovementSegmentResolved }
  | { ok: false; reason: MovementUnresolvedReason };

export type ProviderHealth = "healthy" | "degraded" | "down" | "unknown";
```

---

## 5. Cache Policy (= GPT 補正 1 + Claude 革新 G/J/K)

### 5.1 Memory cache only (= MVP)

```typescript
// In-memory cache (= session-scoped、 tab close で消える)
const transportCache = new Map<string, MovementSegmentResolved>();
```

- TTL: **5 分** (= 同 session 内の重複呼出避け、 長期 cache は規約確認後)
- 容量制限: max 200 entries (= memory leak 防止)
- LRU eviction (= 古い entry から削除)
- Session 終了 (= tab close) で全消滅

### 5.2 localStorage cache: 保留

- Google 由来 route data の localStorage 永続化は **規約確認まで禁止**
- GPT 補正 1 採用
- 3-L MVP では memory only

### 5.3 Privacy-Aware Cache Key (= Claude 革新 G)

```typescript
function buildCacheKey(input: MovementResolutionInput): string | null {
  // sensitive_adjacent / sensitive_both → cache しない
  if (privacyClassRequiresNoCache(input)) return null;
  // 正常時のみ cache key 生成
  const from = anonymizeCoords(input.fromCoords);
  const to = anonymizeCoords(input.toCoords);
  // user 識別子は含めない (= 同 device 内 session のみ有効)
  return `${from.lat},${from.lng}-${to.lat},${to.lng}-${input.preferredMode ?? "auto"}`;
}
```

### 5.4 User Override 永続化 (= Claude 革新 J)

`source === "manual_user"` のみ localStorage 永続化 OK:
- これは Google data ではない、 user 自身の override
- 規約問題なし
- key: `aneurasync.plan.movementOverride.v1`
- format: `{ tripSignature: { mode, durationMin, savedAt } }`

### 5.5 Multi-day Cache Sharing (= Claude 革新 K)

「自宅 → 会社」 等の同 origin/destination は **multi day で memory cache 共有**:
- cache key に date を含めない
- 同 session 内なら 1 回の API call で複数日分 hit
- 想定 hit 率: 70-80% (= 通勤 / 通学が repeating pattern)

---

## 6. Google Routes API Usage (= GPT 補正 2 + Claude 革新 C)

### 6.1 必須事前確認 (= CEO 承認 + 法務 必須)

| 項目 | 状態 |
|---|---|
| Google Cloud project Routes API 有効化 | ❌ 未確認 |
| Server-side env key 設計 (= API key 管理) | ❌ 未確認 |
| Field mask 最小化 (= cost 抑制) | ⚠️ 設計済、 実装前 |
| Monthly cost cap (= ~$50 想定) | ❌ CEO 承認待ち |
| Request count budget (= per-user / per-day) | ⚠️ 設計済 |
| Failure 時 unresolved fallback | ✅ 設計済 |
| Service Specific Terms 確認 (= cache 制約) | ❌ 法務確認待ち |

### 6.2 Field Mask 最小化 (= cost 抑制)

Routes API は field mask で必要 field のみ取得可能。 課金は使用 field に応じる。

```typescript
// 3-L MVP field mask: duration のみ
const FIELD_MASK = "routes.duration,routes.distanceMeters";
```

**取得しない** (= cost 抑制 + privacy):
- `routes.polyline` (= 経路詳細)
- `routes.legs.steps` (= turn-by-turn)
- `routes.warnings`
- `routes.advisories`
- `routes.optimizedIntermediateWaypointIndex`

### 6.3 Circuit Breaker (= Claude 革新 C)

```typescript
const CIRCUIT_BREAKER = {
  failureThreshold: 5,        // 連続 5 回失敗
  cooldownMs: 5 * 60 * 1000,  // 5 分 cooldown
  state: "closed" | "open" | "half_open",
};
```

- closed: 通常運用
- open: cooldown 中、 API 呼ばない (= cost & rate limit 保護)
- half_open: cooldown 後の 1 回試行

### 6.4 Cost & Rate Limit

| 制限 | 値 |
|---|---|
| Per-user monthly | max 1000 calls |
| Per-user daily | max 50 calls |
| Per-second | max 5 calls (= Routes API limit 整合) |
| Cache hit rate target | ≥ 70% |

超過時: cache fallback → miss → heuristic → unresolved (= cascade、 §12)

---

## 7. Transit / Flight Handling (= GPT 補正 3)

### 7.1 MVP scope

| Mode | 扱い |
|---|---|
| Walking | API or heuristic |
| Driving | API or heuristic |
| Transit (= 電車/バス) | API のみ (= heuristic では正確不能) |
| Flight | **heuristic or unresolved** (= MVP では別 API なし) |

### 7.2 Transit (= 電車/バス)

- Google Routes API transit mode を使用
- 但し 中間 waypoint 非対応など制約あり (= GPT 指摘)
- 日本の鉄道精度は実装後に検証
- 不足が判明したら NAVITIME / 駅すぱあと等の別 provider を将来 adapter として追加

### 7.3 Flight

- 直線距離 ≥ 100km AND 県境跨ぎ → flight heuristic 候補
- duration heuristic: distance/700kmh + 90 min buffer (= 空港チェックイン等)
- API call しない (= cost 削減 + 精度不要、 fact-based heuristic で十分)
- confidence: `low` (= 大幅誤差あり得る)
- UI: 「移動 約 3 時間 (飛行機)」 等の中立表現

### 7.4 Unknown mode

- distance 判定で確信持てない場合 → `mode: "unknown"`
- duration: heuristic + low confidence
- UI: 「移動 約 30 分」 (= mode 表示しない)

---

## 8. Mode Candidate + Confidence (= GPT 補正 4)

### 8.1 距離 heuristic

```typescript
function modeCandidateFromDistance(distanceKm: number): TransportModeCandidate {
  if (distanceKm < 1) {
    return { mode: "walking", confidence: { level: "medium", reason: "heuristic_distance_only" } };
  }
  if (distanceKm < 3) {
    return { mode: "walking", confidence: { level: "low", reason: "heuristic_distance_only" } };
  }
  if (distanceKm < 30) {
    // 都市内: 公共交通 or 車、 距離だけでは確信不能
    return { mode: "unknown", confidence: { level: "low", reason: "heuristic_distance_only" } };
  }
  if (distanceKm < 100) {
    return { mode: "driving", confidence: { level: "low", reason: "heuristic_distance_only" } };
  }
  // ≥ 100km
  return { mode: "flight", confidence: { level: "low", reason: "heuristic_distance_only" } };
}
```

### 8.2 「徒歩 default」 は採らない

GPT 補正 4 採用: 「徒歩 default」 → `modeCandidate` で confidence 付き表現。

初期 UI:
```
move >> 「移動 約 20 分」          # mode 出さない (= confidence 不足)
       「移動 約 20 分 (徒歩)」    # API resolved + confidence high のみ
```

confidence medium 以下 → mode 表示しない。 confidence high 以上のみ mode 表示。

---

## 9. Safe Telemetry (= GPT 補正 5)

### 9.1 Schema

```typescript
export interface MovementResolutionTelemetry {
  // ✅ safe (= PII なし)
  readonly provider: TransportProvider;
  readonly status: MovementResolutionStatus;
  readonly unresolvedReason?: MovementUnresolvedReason;
  readonly latencyMs?: number;
  readonly cacheHit?: boolean;
  readonly modeCandidate?: TransportMode;
  readonly confidence?: MovementConfidence["level"];
  readonly privacyClass: MovementPrivacyClass;
  readonly fieldMaskApplied?: string; // 監査用

  // ❌ NEVER include
  // - rawFromCoords / rawToCoords (= 精密座標)
  // - anchor.id / userId / anchor.title
  // - locationText raw
  // - API response body
  // - tripSignature が user-identifiable な形
}
```

### 9.2 出力先

- dev: `console.debug` (= dev mode のみ)
- production: Sentry / analytics 等の **集約のみ** (= 個別 trip log 永続化なし)
- ユーザーに見せない (= internal observation)

---

## 10. Sensitive Proximity Blackout (= GPT 補正 6 + Claude 革新)

### 10.1 4 段階 UI 表示規約

| privacyClass | UI 表示 | mode 表示 | duration 表示 | API call |
|---|---|---|---|---|
| `normal` | 「移動 約 30 分」 | confidence high のみ | ✅ | ✅ |
| `sensitive_adjacent` | 「移動 約 30 分」 | ❌ | ✅ | ✅ (= 一方 sensitive のみ、 anonymize 強化) |
| `sensitive_both` | 「移動」 | ❌ | ❌ | ❌ (= unresolved 維持) |
| `location_unknown` | 「移動」 | ❌ | ❌ | ❌ |

### 10.2 Cache 戦略

| privacyClass | Cache |
|---|---|
| `normal` | ✅ memory cache |
| `sensitive_adjacent` | ❌ cache しない |
| `sensitive_both` | ❌ そもそも API call しない |
| `location_unknown` | ❌ |

### 10.3 Telemetry

| privacyClass | Telemetry record |
|---|---|
| `normal` | 通常 record |
| `sensitive_adjacent` | record + privacyClass 明示、 coords は ~1km 精度 |
| `sensitive_both` | record (= status のみ、 coords なし) |
| `location_unknown` | record (= status のみ) |

---

## 11. UI Wording Rules (= 「Do not optimize me」 Contract)

### 11.1 OK ✅

- 「移動 約 30 分」
- 「移動 約 30 分 (徒歩)」 (= confidence high のみ)
- 「移動」
- 「未確定の移動」

### 11.2 NG ❌ (= 永続 ban)

| 種別 | 禁止例 | 理由 |
|---|---|---|
| Optimization | 「早く出ましょう」 「速く着く」 「最短」 「最適」 「効率的」 | 「最適化しない」 思想 |
| Recommendation | 「この経路がおすすめ」 「推奨」 「ベスト」 | recommendation 禁止 |
| Warning | 「遅刻しそう」 「間に合わない」 | warning 禁止 (= 3-M でも禁止) |
| Anxiety | 「急いで」 「危険」 | 不安喚起禁止 |
| AI-Subject | 「Alter が〜」 「AI が判断」 | No-AI-Subject (= Invariant) |

### 11.3 K-3c-iii 視覚階層維持

- MovementSegment 表示は K-3c-iii で確立した **階層 2 (= dashed slate-300)** を維持
- 「事実」 として観察、 強調なし
- duration は subtle text、 派手な animation なし
- icon は default 非表示 (= 後 phase で detail 展開時のみ)

---

## 12. Graceful Degradation Cascade (= Claude 革新 L)

```
1. Check manual_user override → hit ? resolved : next
2. Check memory cache       → hit ? resolved : next
3. Check provider health    → degraded ? skip : next
4. Try routes_api           → success ? resolved + cache + telemetry : next
5. Try heuristic_distance   → success ? resolved + telemetry (low confidence) : next
6. Fall back to unresolved  → MovementTransition 維持 + telemetry
```

各 step で:
- 成功 → 即 return resolved
- 失敗 → next step (= log + telemetry)
- 全部失敗 → unresolved (= K-3 と同じ「→ 移動」 表示)

**いかなる場合も user は「失敗」 を見ない**。 UI は connected (= 移動 約 X 分) ↔ unresolved (= 移動) を緩やかに表示するのみ。

---

## 13. DayGraph 接続点

### 13.1 既存型との互換性

K-1c の `MovementTransition` は base、 3-L で discriminated union 拡張:

```typescript
// K-1c (= 既存)
interface MovementTransition {
  fromNodeId: string;
  toNodeId: string;
  timingStatus: "unresolved";  // ← 「unresolved」 のみだった
  ...
}

// 3-L (= 拡張、 後方互換)
type MovementSegment =
  | MovementTransition & { timingStatus: "unresolved", unresolvedReason: ... }
  | MovementTransition & { timingStatus: "resolved", estimatedDurationMin, modeCandidate, ... };
```

K UI は `timingStatus` 判定で:
- `unresolved` → 既存 K-3 表示 (= 「→ 移動」 / compact では非表示)
- `resolved` → 3-L 拡張表示 (= duration + mode)

### 13.2 Build pipeline 接続

```
1. K-1 buildDayGraph(anchors, date) → DayGraph with MovementTransition[]
2. 3-L resolveMovements(graph) → DayGraph with MovementSegment[]
3. K-2 PlanClient で useMemo に統合
4. K-3 DayGraphTimeline が timingStatus で分岐表示
```

3-L は K-1 graph に attribute 追加のみ。 nodes 配列 / edges 配列は不変。 **graph integrity 維持**。

---

## 14. 3-M Arrival Risk Memory との境界

| 領域 | 責任 |
|---|---|
| **3-L** | 移動の **事実** を計算 (= duration / mode / source / confidence) |
| **3-M** | 事実 + 過去観測差分から **判断** (= 「余裕度」 / 「遅刻可能性」 / 「buffer 推奨」) |

3-L が出す:
- duration: 30 min
- mode: walking
- confidence: medium
- slackAnalysis: { availableMin: 45, durationMin: 30, utilization: 0.67 }

3-M が解釈:
- 「過去 5 回観測で 25-35 min ばらつき → 余裕度 medium」
- 但し 3-M でも 「遅刻しそう」 等の warning 文言は **永続禁止**
- 「余裕度 medium」 を visual で控えめに表現 (= K-3c-iii 階調維持)

**3-L は判断しない、 3-M も判断しない**。 両者とも観察、 user が判断する。

---

## 15. Commit 階段 (= 7 commits、 各独立 testable)

| Commit | 範囲 | 規模目安 |
|---|---|---|
| **L-1** | TransportMode / MovementSegment / Provider type 拡張 (= 後方互換) + tests | ~300 行 |
| **L-2** | Distance heuristic helper (= alter-morning 経路 reuse、 API なし、 純粋計算) + tests | ~250 行 |
| **L-3** | Routes API client + memory cache pyramid + anonymization gateway + tests (= sandbox/mock) | ~400 行 |
| **L-4** | Privacy guard (= sensitive proximity skip) + cost cap + rate limit + circuit breaker + tests | ~300 行 |
| **L-5** | DayGraph integration (= resolveMovements、 MovementTransition → MovementSegment) + tests | ~250 行 |
| **L-6** | DayGraphTimeline UI 拡張 (= timingStatus 分岐表示、 K-3c-iii 階層 2 維持) + tests | ~150 行 |
| **L-7** | closeout audit + freeze | docs only |

各 commit 単独で:
- targeted tests PASS
- plan unit tests 全 PASS
- tsc L surface errors 0
- frozen branches HEAD 不変

### Branch 戦略

- 新 branch: `feat/alter-plan-phase3-l-transport-foundation` (= 仮称)
- base: **GitHub 復旧後の origin/main** (= K closeout PR 着地後、 K runbook §2 PR L 着地後)
- 又は: 既存 K-3c-iii frozen 上に積む (= 同 stacked pattern、 GitHub 復旧前でも可)
- 7 commits 順次

---

## 16. STOP 条件 (= 実装着手前 必須クリア、 CEO 判断)

| # | 条件 | 状態 |
|---|---|---|
| 1 | Google Cloud project Routes API 有効化 | ❌ CEO 承認 + Cloud 設定必要 |
| 2 | server-side env API key 追加 (= 永続制約 「env 変更禁止」 と緊張) | ❌ CEO 緩和承認必要 |
| 3 | Monthly cost cap 承認 (= ~$50/月) | ❌ CEO 承認必要 |
| 4 | Service Specific Terms 確認 (= cache 制約) | ❌ 法務確認必要 |
| 5 | Privacy policy 更新 (= 第三者 API 送信明記) | ❌ 法務 + CEO 承認必要 |
| 6 | dev environment での sample data 採用判断 | △ 設計可能、 CEO 判断 |
| 7 | 実装 GO の明示 CEO 承認 | ❌ 設計レビュー後 |

**全 7 条件クリアまで 3-L 実装着手なし**。

---

## 17. 永続禁止 (= 3-L 全範囲)

- ❌ Optimization 文言 (= 「速く」 「最短」 「最適」 等)
- ❌ Recommendation 文言 (= 「おすすめ」 「推奨」)
- ❌ Warning 文言 (= 「遅刻」 「危険」)
- ❌ AI-Subject 文言 (= 「Alter が」)
- ❌ Amber / orange / red 警告色
- ❌ Sensitive raw data (= title / location / id) を 3rd party API に送信
- ❌ Persistent route cache (= Google data の localStorage 保存)
- ❌ 全座標精度 (= ~10m 以下) で API call
- ❌ anchor.id / userId / title を API / telemetry に含む
- ❌ Real-time traffic (= 3-L MVP scope 外)
- ❌ Multi-stop trip optimization
- ❌ Buffer 自動追加 (= 3-M 領域)
- ❌ Arrival Risk 推論 (= 3-M)
- ❌ LLM 呼出
- ❌ DB migration / new dependency (= CEO 緩和承認まで)
- ❌ Frozen branches への commit

---

## 18. Version 履歴

| version | 日付 | 変更内容 | 承認 |
|---|---|---|---|
| v0.1 | 2026-05-22 | 初版 (= 応答 text only、 K closeout 直後) | CEO design review GO |
| **v0.2** | **2026-05-22** | **GPT 7 補正 + Claude 自立 12 革新統合、 docs commit** | **CEO 確認待ち** |
| (将来) v0.3 | TBD | CEO STOP 条件クリア後の v0.3 (= 実装着手前の最終) | TBD |
| (将来) v1.0 | TBD | 実装着手時の最終 design | TBD |

---

## 19. CEO 判断ポイント

1. **v0.2 設計レビュー結果**: 採用 / 部分修正 / 全面再検討
2. **STOP 条件 7 項目**: いずれ / 全部 クリアできるか、 別 phase 預けるか
3. **Provider 選択**: Google Routes API のみ / 国内 transit 追加 / OSS only など
4. **Cost budget**: ~$50/月 承認、 又は別 budget
5. **Privacy policy update**: 法務確認のタイミング
6. **次フェーズ優先順位**:
   - (a) 3-L 実装 (= STOP 条件クリア後)
   - (b) K-3+ refinement (= TimeBucket 背景 等)
   - (c) 初期テストユーザー獲得 (= deferred smoke 解消)
   - (d) Deploy 準備

---

## 20. 関連 docs

- `docs/alter-plan-phase3-k-closeout-audit.md` — K phase 完了監査
- `docs/alter-plan-phase3-k-deferred-smoke-ledger.md` — K deferred items
- `docs/alter-plan-phase3-k-pr-runbook.md` — K 系 PR 順序
- `docs/alter-plan-phase3-k-daygraph-design.md` — K design v1.0-v1.2 (= K-1f-α MovementSegment reserved fields 出典)
- `docs/decision-log.md` — 全 phase decision の chronological 正史
- `CLAUDE.md` — Rule 7 (State Safety) + Rule 8 (Work-Start Verification)

---

## 21. 結論

3-L Transport Layer は **「移動の事実を観察する Truth Layer」**:

- 世界トップアプリ (= Google Maps / Apple Maps / Citymapper) の **「最適化」 思想を超越**
- Aneurasync 革新: 「最短」 ではなく「観察」、 「速く」 ではなく「ありのまま」
- Provider-independent / Privacy-first / Graceful-degradation の世界水準実装思想

実装着手前に CEO 7 条件クリア必須。 設計 v0.2 は docs commit として記録、 実装 GO は CEO 別承認後の別 branch で。
