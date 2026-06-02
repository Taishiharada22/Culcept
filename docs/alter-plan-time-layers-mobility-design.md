# Aneurasync Plan — Time Layers & Mobility Layer 設計（docs-only）

- **ステータス**: 設計提案 / 北極星確定・**実装は別 Phase**。本書の目的は「実装に入る前に概念の言語と境界を固定する」こと。
- **日付**: 2026-06-03
- **起草**: `frosty-hellman-b3305e` セッション（Map/Calendar 表示側）。**正本化は予定追加セッション（nifty）との合流後**。
- **関連**: `docs/aneurasync-reality-control-os-phase0-design.md` / memory: `aneurasync-philosophy` / `heart-dynamics-model-v1` / `stargazer-human-os-strategy`
- **本書では一切コードを変更しない**（DB / Supabase / CalendarTab / 予定追加UI / `lib/shared` 正本型 すべて不触）。

---

## 0. 中心命題（なぜ作るか）

**Google Calendar = 「1日 = 1つの確定タイムライン」。** 予定は固定された四角で、移動手段は1つ、衝突は「重なっています」で終わる。

**Aneurasync Plan = 「1日 = 可能性空間 + 帰結プレビュー + 選択からの学習」。** 場所・移動手段・サブ予定の収め方は、いずれも *候補の中からの選択* であり、Aneurasync は候補と「その選択が1日全体の成立性に与える帰結」を先に見せ、さらに **実際の選択を観測して本人の判断原理を学習** する。

この命題は3つの転換で実現する：

1. **時間の層化（Time Layers）** — 予定を均一な四角でなく、性質の違う層（DayTag / ContextBand / Anchor / MobilityLeg）として扱う。
2. **移動の区間化（Mobility Layer）** — 移動手段は「予定」ではなく「予定と予定の間（leg）」に属し、`candidate / recommended / selected / actual` の4状態で持つ。
3. **衝突の可能性化（ConflictCandidate）** — 衝突を「エラー」でなく「意思決定の入口」とし、解決候補と帰結を提示する。

> **最大の堀（Aneurasync 固有資産）**: `selected`（採用した移動手段）と `actual`（実際に使った移動手段）の **乖離は深層観測シグナル**。「電車推奨なのにタクシーを選んだ」→ なぜか（急ぎ / 疲労 / 雨 / 荷物 / 不安）を、判断原理・状態による変化・崩れやすい条件として学習できる（→ Decision Engine / HDM state）。これは Google が構造的に持てない。移動UIではなく **行動観測器** にする、というのが本設計の魂。

---

## 1. 設計原則 / Anti-goals

**原則**
- 全体は俯瞰できる。しかし「次に動くべき区間」だけが自然に目立つ（情報設計の階層）。
- 実データがある時だけ意味のある色・推奨を出す。無ければ中立。
- 表示（ViewModel）と正本（データモデル）と取得（route/geometry）を分離する。
- 過去は消さず薄く残す（実績学習の材料）。

**Anti-goals（やらない）**
- ❌ **距離から移動手段を推定して色を付けない**（徒歩/電車/車/バス/タクシー/自転車/飛行機を距離だけで当てるのは誤判定が多く、Plan OS の信頼を壊す）。実 mode 無し → `unknown`（中立スレート）。
- ❌ **ContextBand を通常予定（四角）として扱わない**（全部を同じ四角にすると衝突地獄になる＝Google の失敗）。
- ❌ 本 Phase で `lib/shared` に正本型を作らない（並走セッションと型主導権が衝突する。合流後に確定）。
- ❌ DB migration / Supabase schema / CalendarTab 本実装 / 予定追加UI / Decision Engine 接続 を本 Phase で行わない。

---

## 2. Time Layers — 層構造

時間を、性質の違う4層として扱う（上が背景、下が前景）：

```
DayTag        ── 全日の文脈（ダイエット日 / 休息日 / 集中日 / 旅行日）        ← 最背景・日タグ
  ContextBand ── 時間帯の文脈（仕事 09:00–18:00 / 旅行中 / 勉強時間 / 集中）  ← 背景バンド
    Anchor    ── 点の予定（会議 / ランチ / 通話 / 訪問）                       ← 前景の点
      MobilityLeg ── 予定間の移動（徒歩 / 電車 / 車 …、ExcursionLeg を含む）  ← 点と点の間
```

| 層 | 定義 | 例 | 時間特性 | UI（地図/カレンダー） |
|---|---|---|---|---|
| **DayTag** | その日全体にかかる文脈タグ | ダイエット日, 休息日, 集中日, 旅行日 | 全日・面 | 日ヘッダのタグ。線は引かない |
| **ContextBand** | 一定時間「その状態にある」文脈帯。点ではなく **mode of being** | 仕事 09:00–18:00, 旅行中, 勉強時間, 集中時間 | 長時間・帯 | 背景バンド（淡色・カテゴリ色）。拠点を持てる |
| **Anchor** | 特定時刻の具体行動 | 会議, ランチ, 通話, 訪問予定 | 短時間・点 | ピン / カード |
| **MobilityLeg** | Anchor と Anchor の間の移動（区間） | 駅→オフィス徒歩, ランチ→会社電車 | 区間 | 経路線 + 移動手段 + 所要 |

### 2.1 DayTag（全日文脈）
- その日の「枠組み」。例：**ダイエット日 / 休息日 / 集中日 / 旅行日**。
- 個々の予定や移動の*評価軸*を変える（集中日なら割り込みを重く見る、休息日なら詰め込みを警告）。
- 線・帯としては描かず、日ヘッダのタグとして表示。

### 2.2 ContextBand（時間帯文脈 = mode of being）
- 「**仕事 09:00–18:00**」は予定ではなく **文脈帯**。「この時間帯はオフィス基準・仕事中」という*状態*。例：旅行中 / 勉強時間 / 集中時間。
- **拠点（baseLocation）を持てる**（例：オフィス）。中の Anchor がこの拠点と同じ場所なら移動ゼロ、違えば ExcursionLeg（往復）が生まれる。
- 将来、**state（mode of being）** を持たせる：energy（低/中/高）・availability（遮断/割込可/空き）。これは HDM state-weighting と接続し、「同じ予定でも文脈で意味が変わる」を表現する（本 Phase は定義のみ）。

### 2.3 Anchor（点予定）
- 特定時刻の行動。例：会議 / ランチ / 通話 / 訪問。
- 既存 `ExternalAnchor`（`lib/plan/external-anchor.ts`）にほぼ対応（§8）。
- **Anchor 自身は移動手段を持たない**（移動は leg 側）。

### 2.4 MobilityLeg（予定間移動・ExcursionLeg を含む）
- Anchor[i] → Anchor[i+1] の移動。移動手段・所要・経路はここに属する（§4）。
- **ExcursionLeg** = ContextBand の拠点から *一時的に外へ出て戻る* 移動。
  - 例：オフィス勤務中（ContextBand）に **外ランチ**へ → `オフィス → ランチ → オフィス` の往復 ExcursionLeg。
  - デリバリーなら移動ゼロ（leg なし）、近場なら短い往復、外なら長い往復。
  - 地図表現：拠点＝中心、ExcursionLeg＝拠点からのループ。

### 2.5 ConflictCandidate（成立しない衝突 = 意思決定点）
- 「単なる時間の重なり」ではない。**本当に成立しない衝突**（別場所の点×点が同時刻、移動が物理的に間に合わない 等）。
- Google は「重なっています」で終わる。Aneurasync は **解決候補と帰結** を出す（§6）：ずらす / 短縮 / リモート化 / 移動手段変更 / 片方を候補から外す。
- 「contains（仕事⊃ランチ）」のような**ネストは衝突ではない**（§3）。衝突判定は厳しめにし、誤って意思決定を要求しない。

---

## 3. Anchor × ContextBand の関係分類

2つの時間区間の関係を分類して、描き分け・判定を変える：

| 関係 | 条件 | 扱い |
|---|---|---|
| `contains` | ContextBand が Anchor を内包（仕事⊃ランチ） | ネスト表示。衝突ではない |
| `nested-inplace` | 内包 ∧ **同じ場所** | 移動ゼロ。帯の中に収める |
| `nested-excursion` | 内包 ∧ **別の場所** | ExcursionLeg（往復）が生まれる |
| `overlap-conflict` | 点×点が別場所で同時刻 ∧ 移動不能 | **ConflictCandidate**（意思決定点） |
| `sequential` | 連続する別の Anchor | 通常の MobilityLeg |

この分類があるから、「9–18仕事 ＋ 12:00ランチ」が衝突ではなく *収め方の可能性* として扱える。

---

## 4. Mobility Layer（移動手段）

### 4.1 移動手段は予定ではなく leg に付く
移動手段は Anchor の属性ではなく、**Anchor 間の関係（MobilityLeg）の属性**。これを外すとロジックが崩れる。

### 4.2 4状態：candidate / recommended / selected / actual
| 状態 | 意味 | 入力源 |
|---|---|---|
| **candidate** | ユーザーが許可した移動手段の候補集合 | 予定追加（nifty）で生成 |
| **recommended** | Aneurasync が最善と判断した手段 | 推奨ロジック（将来） |
| **selected** | 今表示・採用している手段 | ユーザー操作 / 推奨の既定採用 |
| **actual** | 実際に使った手段（実績） | 実績入力 / 位置観測（将来） |

### 4.3 ★ selected↔actual の乖離＝深層観測（Aneurasync の核）
- 推奨が電車、選択がタクシー、実績がタクシー → 「なぜ推奨と違う選択をしたのか」を観測できる。
- 候補：急いでいた / 疲れていた / 荷物が多い / 雨 / 不安 / 同行者がいた …。
- これは Aneurasync 哲学（判断原理・揺れ方・状態による変化・崩れやすい条件・未言語化の欲求）の **直接の観測器**であり、Decision Engine / HDM state の学習入力になる。
- → **Mobility Layer は「移動を選ぶUI」ではなく「本人の意思決定を観測・学習する装置」**。ここが Google に作れない堀。

#### 4.3.1 観測のガードレール（鉄則・必須）
`selected↔actual` の乖離は**深層観測シグナル**だが、**人格診断・固定ラベルではない**。扱いの鉄則：

- ❌ **人格断定・固定ラベルにしない**（悪い例：「この人は怠けるからタクシーを選ぶ」）。
- ✅ **必ず状況依存の仮説として扱う**（良い例：「この状況では、ユーザーは時間効率より移動負荷の軽減を優先した *可能性がある*」）。
- ✅ **文脈・確信度と必ずセットで解釈する**：`confidence` / `context` / `weather` / `baggage` / `fatigue` / `urgency` 等。単独シグナルで結論にしない。
- ✅ **用途は本人の自己理解と Plan 改善のみ**。断定・評価・監視・スコアリングには使わない。
- ✅ 一度の乖離で決めつけない。反復パターンとして confidence を積み上げて初めて仮説を強める（Aneurasync 哲学：仮説→深掘り→反復確認）。

> この鉄則は本書全体（`recommended` の出し方、`actual` の解釈、Decision Engine への入力）に適用される横断制約とする。

### 4.4 canonical TransportMode（9種）
現状 mode enum が **3つ並存・不一致**（§8）。本設計の正準は次の9種に統一する（合流後に確定）：
`walk | bicycle | car | taxi | bus | train | shinkansen | flight | unknown`
- 実データが無ければ `unknown`（中立色）。**距離からの推定はしない**（§1 Anti-goal）。
- 表示色（MapTab に実装済み `ROUTE_MODE_COLORS`）：徒歩=緑 / 自転車=ティール / 車=青 / タクシー=黄 / バス=紫 / 電車=鉄道青 / 新幹線=濃紺 / 飛行機=シアン / 不明=中立スレート。

### 4.5 flight は道路ルートにしない
- 飛行機区間は DirectionsService の道路ルートにせず、**空路用の arc / 破線 fallback** とする（実 mode data 到着後に対応）。

---

## 5. Leg State（時間階層）— ※ MapTab に実装済み（Phase A）

「今」を中心に区間を4状態へ。focus = **「今 → 次」の区間**（= 現在時刻より後の最初の Anchor に到着する leg）。

| 状態 | 区間 | 表示（実装済み） |
|---|---|---|
| `done` | 2個前以前 | 薄いグレーの**波線**（引く） |
| `previous` | 一個前 → 今 | **細い実線**（mode 色） |
| `current` | 今 → 次 | **太い実線 + 約10秒で静かに呼吸する glow**（主役） |
| `ahead` | 次より先 | 控えめな細い実線 |

実装対応：`resolveLegState` / `getRouteStyleForLeg` / `shouldAnimateLeg` / `RouteLegViewModel`（`MapTab.tsx`）。**正本 `MobilityLeg` 型は本書 §7 のターゲット形（未実装）。**

---

## 6. 可能性空間 → 帰結プレビュー（Decision coupling）

ただの切替なら Google でもできる。Aneurasync の勝ち筋は、切替を **1日全体の成立性** に接続すること：

- 徒歩に切替 → 「次の会議に7分遅れます。ランチを10分短縮すれば成立します。」
- タクシーに切替 → 「到着12分早まります。空いた時間で次の準備ができます。」
- 電車のまま → 「最も安定。ただし駅まで徒歩8分あります。」

→ **「移動手段を選ぶUI」ではなく「1日の成立性を操作するUI」**。これは Decision Engine / feasibility と接続する大物なので **後段 Phase**（本書は接続点の定義のみ）。

---

## 7. 目標データモデル（将来の正本・**まだ作らない**）

> ⚠️ 本節は *ターゲット形* の合意用。**今 `lib/shared` に作らない**。予定追加（nifty）と合流後に正本化する。現状の `MapTab.tsx` 内 `RouteLegViewModel` は本型の *表示サブセット*。

```ts
type TransportMode =
  | "walk" | "bicycle" | "car" | "taxi" | "bus"
  | "train" | "shinkansen" | "flight" | "unknown";

type LegState = "done" | "previous" | "current" | "ahead";

interface MobilityLeg {            // = 予定間の移動（RouteLeg）
  id: string;
  fromAnchorId: string;
  toAnchorId: string;
  state: LegState;
  candidateModes: TransportMode[];   // ユーザーが許可した候補
  recommendedMode?: TransportMode;   // Aneurasync 最善
  selectedMode?: TransportMode;      // 今採用・表示
  actualMode?: TransportMode;        // 実績（← 深層観測の核）
  isExcursionFromBandId?: string;    // ContextBand 拠点からの往復なら、その band id
  routeByMode: Partial<Record<TransportMode, {
    durationMin?: number;
    distanceMeters?: number;
    polyline?: string;               // geometry（Routes API or DirectionsService）
    provider?: "google_directions" | "google_routes" | "manual" | "fallback";
    confidence?: number;
  }>>;
}

interface ContextBand {
  id: string;
  kind: "work" | "travel" | "study" | "focus" | "custom";
  label: string;
  startAt: string; endAt: string;    // ISO
  baseLocation?: { lat: number; lng: number; label?: string }; // 拠点（excursion 起点）
  stateHint?: { energy?: "low" | "mid" | "high"; availability?: "blocked" | "interruptible" | "free" };
}

interface DayTag {
  id: string;
  kind: "diet" | "rest" | "focus" | "travel" | "custom";
  label: string;
  date: string;                      // YYYY-MM-DD
}

// Anchor は既存 ExternalAnchor を再利用（§8）。本書では新規定義しない。
```

---

## 8. 既存コードとの対応（再利用 vs 新規）

| 概念 | 既存資産 | 状態 | 方針 |
|---|---|---|---|
| **Anchor** | `ExternalAnchor`（`lib/plan/external-anchor.ts`） | あり（mode 無し） | 再利用。移動手段は持たせない（leg 側） |
| **MobilityLeg 表示** | `RouteLegViewModel`（`MapTab.tsx`, Phase A） | あり | 表示器として継続。正本 `MobilityLeg` は合流後 |
| **TransportMode** | 3 enum 不一致（plan: `walking/driving/transit/flight/unknown` / alter-morning: `walk/car/public_transit/bicycle/taxi/unknown` / map: 9種） | **不統一** | canonical 9種へ統一（合流後 `lib/shared`） |
| **leg 所要/距離** | `durationHeuristic`（staged table）+ `routesApiClient`（Routes API） | あり | `routeByMode` に格納して再利用 |
| **geometry(polyline)** | DirectionsService（client, `MapTab`）/ `routesApiClient`（現状 polyline 無） | 片方のみ | 将来 Routes API polyline へ統一（DirectionsService は 2026-02 deprecated） |
| **既存 leg 概念** | `TransportSegment`（`lib/alter-morning/transport`, mode/duration, event-id, flag-gated） | あり | 最も近い既存「leg」。合流時に `MobilityLeg` と整合（命名/ID 体系を吸収） |
| **place 候補 / よく行く** | `placesApiClient` + `computeLivedGeographyFallback` | あり | 予定追加（#1: 内容に応じた場所候補・頻度上位）で利用＝nifty 領域 |
| **ContextBand / DayTag / ConflictCandidate** | なし | **新規概念** | 本書で定義。実装は将来 Phase |

> 含意：**移動の「概念」はほぼ既存資産で組める**。足りないのは (a) canonical mode の統一、(b) leg 正本型、(c) ContextBand/DayTag/Conflict の新規概念、(d) geometry の Routes API 統一。発明より *配線と整合* が主。

---

## 9. 実装境界 / セッション分担

並走を事故らせないための境界（重要）：

| セッション | 領域 | 主な対象 |
|---|---|---|
| **frosty（このセッション）** | Map / Calendar の **表示側** | 経路線・階層（done/previous/current/ahead）・移動手段の表示切替・ExcursionLeg 描画・ConflictCandidate の提示UI |
| **nifty（別セッション）** | **予定追加・入力側** | 場所候補（内容に応じた・よく行く）・予定再編集・移動手段候補（candidate）生成・保存構造 |
| **合流後（別 Phase）** | 共有正本 | `lib/shared` の `MobilityLeg`/`ContextBand`/`TransportMode` 型確定・DB/保存・Decision Engine 接続 |

原則：**正本型は片方のセッションが先に作らない**。合流後に共同で確定。

---

## 10. Phasing

- ✅ **完了**：Map Routing v1（道路沿い経路）/ 階層 v2.x（done/previous/current/ahead, 静かな glow, 距離推定撤去）/ **Phase A**（`RouteLegViewModel` 表示器・mode seam）。commit `e1176d20`。
- 🔜 **次（候補）**：(a) 本書の合意 → (b) 予定追加(nifty)で candidate 生成 → (c) `selected` を leg に流して mode 色点灯。
- 🧊 **将来**：ContextBand/DayTag/ExcursionLeg/ConflictCandidate の表示実装、Decision coupling（§6）、geometry の Routes API 統一、`lib/shared` 正本型、DB 保存、actual 観測（深層観測ループ）。
- ⛔ **凍結（本 Phase でやらない）**：DB migration / Supabase / CalendarTab 本実装 / 予定追加UI / lib/shared 正本型 / Decision Engine 接続。

---

## 11. 代表シナリオ（9–18 仕事 ＋ ランチ）

```
DayTag: （なし）
ContextBand: 仕事 09:00–18:00（拠点=オフィス）
  Anchor: 10:00 会議（社内＝拠点と同場所）   → 移動ゼロ（nested-inplace）
  Anchor: 12:00 ランチ（外の店）             → ExcursionLeg: オフィス→店→オフィス
  Anchor: 15:00 通話（社内）                 → 移動ゼロ
```
- 外ランチのまま → 「13:00 の会議に5分遅れます」。
- 可能性候補を提示：
  - **デリバリー** → 移動ゼロ（leg 消滅）、遅延なし。
  - **近場ランチ** → 短い往復、遅延なし。
  - **13:00 にずらす** → 会議と干渉なし。
- ユーザーが選んだ手段（selected）と、実際（actual）の差は観測され、次回の推奨と本人理解に反映される（§4.3）。

これが Google 式の「重複予定」ではなく **可能性空間 + 帰結プレビュー + 学習** の具体形。

---

## 12. 未解決の問い / 要決定

1. **ContextBand の判定基準**：duration 閾値（例 >3–4h）＋カテゴリ（work/study/travel）で自動判定か、ユーザー明示か、両方か。
2. **ConflictCandidate の判定閾値**：「移動が間に合わない」をどの所要・確信度で衝突とみなすか（誤検出で意思決定を強要しない厳しめ設計）。
3. **canonical TransportMode の正本所在**：合流後 `lib/shared` でよいか。既存3 enum の mapping 層をどこに置くか。
4. **geometry 統一**：DirectionsService（deprecated）→ Routes API polyline への移行時期と、client/server どちらで取得・キャッシュするか。
5. **actual（実績）の入力源**：手動入力か、位置観測か、After-Action ループ（HDM P5-3 と同型）か。
6. **DayTag の評価への効き方**：集中日/休息日が feasibility 計算をどう重み付けするか。

---

## 付録：本書の使い方
- 本書は **言語と境界の固定** が目的。実装は各項目を Phase に切り出し、CEO 承認後に着手する。
- frosty / nifty 双方は、移動・予定の概念を本書の語彙（DayTag / ContextBand / Anchor / MobilityLeg / ExcursionLeg / ConflictCandidate / candidate-recommended-selected-actual）で揃える。
- 正本型・DB・Decision Engine 接続は「合流後の別 Phase」。本書段階では作らない。
