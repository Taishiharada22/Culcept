# A2-1 — Context Modifier / 文脈条件付け（pure core）closeout + 接続設計 + A2-2 計画

> 2026-06-09 / Build Unit / pure model・belief 非接触・flag OFF ゆえ **main 直接着地**。

Personal Reality Graph の核：「今日のあなたなら」を今日の文脈で補正する。belief を汚さず、決定時だけ並走する注釈。

---

## 1. 実装した（A2-1 pure core）

`lib/plan/context/contextModifier.ts`（pure・新設「決定時 context 層」）:

- **`ContextSnapshot`**: 今日の文脈の **source タグ付き・抽象条件のみ**（weather/timeBand/dayType/density/energy/positionInDay/travelLoad）。全 optional。場所名/同伴者を持たない（sensitive-free を型で担保）。
- **`buildContextModifier(snapshot)`** → `ContextModifier`:
  - tilt を出す信号（research-defensible な一般則・**source 既知時のみ**）: weather rain/heat=tightens(slight) / density packed=tightens(notable)・sparse=eases(slight) / position late=tightens(slight) / energy 低=tightens(notable)・高=eases(slight) / travelLoad heavy=tightens・light=eases。
  - **記述のみ（tilt なし）**: timeBand / dayType（v0 は本人 pattern 未取得＝断定しない）。
  - **overallTilt**（定性 vote・偽数値なし）: net = tighten − ease（slight=1/notable=2）。`±2` で tighter/easier、それ未満 as_usual、信号 0 で unknown。
  - **widenUncertainty**: mixed（両方向に条件）/ 薄い証拠+notable / 薄い+出所不明 → true（★点推定を動かさず「読みにくい日」と広げる）。
  - **ignoredUnknown**: source 不明の条件は factor 化せず記録（断定回避の透明性）。
- **`contextReasonLine(modifier)`**: 1 行の honest な reason（仮説トーン・source-cited・**数字フリー**・sensitive-free）。条件なし/as_usual は null（沈黙）。
- **flag `DAY_REHEARSAL_CONTEXT_MODIFIER_ENABLED = false`** + `isContextModifierEnabled()`（flag ∧ 非 production）。

## 2. ★安全境界（CEO stop gate を設計で封じた）

| stop gate | 封じ方 |
|---|---|
| 天候/energy で belief 上書き | belief store を read も write もしない。energy/density は rehearseDay の既存入力なので **再注入しない**（並走注釈に徹する・二重適用なし） |
| 偽の確率/数値 | 出力は定性（direction×strength）と category のみ。天候/疲労への数値係数は観測がないので**作らない**。reason は数字フリー |
| source 不明な文脈を断定 | 各条件 source タグ必須。unknown/欠落 → factor を作らず ignoredUnknown。一般則は grounding:"general" と明示 |
| sensitive 情報を文脈に | snapshot は抽象条件のみ（場所/同伴者の field が型に無い） |
| UI 表示が必要 | 本 A2-1 は pure model + reason **string** のみ。render なし（配線は §5 設計のみ） |
| DB/production/external API | pure・jma を呼ばない・DB なし・flag OFF |

## 3. テスト / tsc / lint
- 新規 **22 tests PASS**（空/unknown source/各信号 tilt/timeBand・dayType 非tilt/集約/widen/reason 数字フリー・sensitive-free/pure/flag）。
- plan suite 回帰 **5376 PASS**。自変更 tsc footprint **0**（baseline 55）。eslint clean。

## 4. 学術的根拠（① 前提を疑い ② リサーチ）
- **Fleeson (2001) density-distribution**: trait = within-person 状態分布の中心傾向。状況は「今どこにいるか」を動かすが分布自体は変えない → **belief=分布（不変）/ modifier=今日の位置**。これが「belief を汚さない」の理論的支柱。
- **Mischel & Shoda (1995) CAPS / if-then signature**: 行動は状況特徴に条件付く安定な if-then。→ 文脈条件付けは心理的に実在するが**本人ごとに学習すべき**。v0 は general scaffold、後で personal 化（grounding field で区別）。
- **Situational strength (Meyer+ 2010)**: 強い状況は trait 発現を圧縮。→ 状況が異常/薄いとき発現の確信度を下げる＝**widenUncertainty**。
- **test-time conditioning（ML 類比）**: prior の重みを更新せず readout だけ条件付ける。→「決定時だけの modifier・belief 不変」。

---

## 5. A2 UI / 配線 設計（**実装は別ステップ**）

### 5-1. Day Rehearsal への接続設計
- 接続点: `CalendarTab.tsx` の `buildRehearsalInput → rehearseDay` の間（`applyPersonalPaceToRehearsalInput` と並列の seam）。
- ★**RehearsalInput を数値で書き換えない**（energy/density は既に入力済・捏造係数を入れない）。modifier は `DayRehearsal` の**横に並走する注釈**として保持。
- 効かせ方は **uncertaintyWiden の伝達のみ**（将来）: widenUncertainty=true のとき DayOutlook copy を「断定弱め」に寄せる（点推定 viability は不変）。
- snapshot の供給元（既知 source のみ）: date→dayType(observed) / 予定 or 時計→timeBand(observed) / dayGraph→density(observed) / innerWeather→energy(derived・0..1 正規化) / step index→positionInDay(observed) / 当日 transition 合計→travelLoad(observed)。weather は /plan 未配線ゆえ v0 は null（degrade）。

### 5-2. Mobility Hypothesis Surface への接続設計
- 既存 `mobilityHypothesis.ts` の `DecisionContext.weather` は A2 snapshot.weather の **部分集合**。A2 はその一般化。
- 接続: A2 snapshot から `DecisionContext { weather }` を投影して `buildMobilityHypothesis` に渡す（既存 contextNote 路を A2 が供給）。★`todayLikelyMode` は belief 由来のまま（weather で mode を変えない既存 guardrail を保持）。
- 重複回避: weather の note は mobilityHypothesis 側（leg 単位）に委譲。A2 の overallTilt は **day 単位**の注釈で役割が異なる（leg note と day tilt は別レイヤ）。

### 5-3. UI 表示設計（★UI 表示は stop gate）
- 表示は既存 `DayOutlookBanner` の reason 行に `contextReasonLine` を **追記**する形（新規 UI 部品を作らない）。widenUncertainty 時のみ「今日は当てにくい」を添える。
- 表示は necessity gate（knownSignalCount≥1 かつ reason≠null）でのみ。沈黙原則。
- ★**UI 表示の実装は user-facing ＝ branch+smoke が要る ＝ stop gate**。CEO 判断で実施。

---

## 6. A2-2 計画（次に自律実装する候補）

### A2-2: ContextSnapshot builder（pure・plan primitives から組み立て）+ shadow 配線
- 内容: 既に /plan 決定路で手に入る一次情報（source 既知のみ）から `ContextSnapshot` を組み立てる **pure builder** `buildContextSnapshotFromPlan(...)` を実装。CalendarTab に **shadow compute**（A1-8 と同じ pattern: flag ON ∧ dev のみ console.debug、**UI render なし**）で modifier を観測。
- ★これは pure builder + dev-only shadow ＝ **UI 表示なし・belief 非接触・DB/API なし・flag OFF**。stop gate に当たらない想定。
- 供給する source: dayType(observed)/timeBand(observed)/density(observed)/energy(derived)/positionInDay(observed)/travelLoad(observed)。weather は null（未配線・degrade）。
- 検証: builder unit tests（source タグ正しさ・欠落 degrade）+ shadow が flag OFF で完全不変。
- → A2-2 が満足なら自律実装 → 監査 → **A2-3 = UI 表示（DayOutlookBanner に reason 追記）の計画 → UI 表示 stop gate で CEO 判断待ち**。

### ★stop 予測
A2-2（pure builder + shadow）は安全側で自律実装可能。**A2-3（実 UI 表示）は「UI 表示が必要」stop gate に該当** → そこで CEO 判断を仰ぐ（branch+smoke が要るため）。weather 配線は external API gate ゆえ別途 CEO 判断。

---

## 次フェーズ
A2-2（snapshot builder + shadow 配線）を本バッチで自律実装 → 監査 → A2-3（UI 表示）計画提出で stop。
