# Alter タブ Visual Contract / Shared Reference（v0）

- 日付: 2026-06-11
- 作成: Claude（CEO 構想 + GPT 整理 + 参照画像監査 + 既存 UI 精査の統合）
- ステータス: **docs-only の視覚契約。実装・画像生成・UI 試作はまだ行わない**
- 役割: 後続の **UI 専用セッション（Session B）** と **ロジックセッション（Session A）** が共通参照する凍結契約
- 論理契約の正本: `docs/day-state-alter-tab-v0-design.md`（v0.1）。データの意味・採点・保存は全てそちらに従う。本書は**見え方と語彙の契約**

---

## 0. スコープ — 作るもの / 絶対に作らないもの

**作るもの**: `/plan` 内 Alter タブを開いた後の**コンテンツ領域のみ**（`AlterTabBody` 配下）。

**絶対に作らないもの**:
- 最上部のセグメントタブ（`Alter / カレンダー / リスト / マップ`）— 既存 `/plan`（PlanClient）がタブを管理する。参照画像の上部タブは**実装対象外**
- 最下部のボトムタブバー（`ホーム / /plan / 分析 / 設定`）— グローバルナビには触れない。参照画像の下部バーは**実装対象外**
- 医療・診断・健康スコア風の画面 / 赤色警告 / フィットネススコア感 / ランキング感 / ダークモード
- **「今日の開始残量」という主タイトル（不採用確定）**
- 大きな % 数値表示（48% / 61% など。参照画像の数値表示は**真似しない**）
- 5 段階水位 UI を固定仕様にした表現（水位は連続でよい。数字を出さないことだけが HARD）

## 1. UI 思想

- この画面は「今日のコンディション管理画面」ではない。**ユーザー自身をひとつのバッテリーとして扱い、Alter が現在の残量・余力・負荷・回復余地を見立てる画面**である。
- **Alter タブ = Reality Graph の操縦席**（設計書 §2.4）。状態メーター画面に縮めない。人体バッテリー（DayStateRecord）を中心に、予定（DayGraph）・場所（A4）・差分（A3）・答え合わせ（Night Check）が将来ここに流れ込む。
- チャットは**残す**が主役にしない: 状態可視化 + 調整 + 会話の融合であり、構成比は「人体バッテリー > 周辺カード > 今日の流れ > 会話」。
- 状態は**見立て**であって診断ではない。断定しない・押し付けない・採点される（外れたら翌日直る）。
- ヘッダーの「● ライブ」表記を使う場合、意味は「**開いた瞬間に最新導出**」に限定（常時監視を示唆しない。MomentState は derive-on-open・保存なし）。

## 2. 参照画像の監査（採用 / 不採用の確定表）

CEO 提供の参照画像（iPhone モック）を精査した結果:

| 画像の要素 | 判定 | 理由 / 置き換え |
|---|---|---|
| 上部セグメントタブ・下部ナビ | ❌ 作らない | CEO 指示①。既存 PlanClient / グローバルナビの管轄 |
| タイトル「今日の開始残量」 | ❌ 不採用 | CEO 指示②。「あなたのバッテリー」/「いまの余力」へ。残量は朝リセットでなく引き継ぎ |
| 「集中余力 48%」等の % 大表示 | ❌ 不採用 | 採点不能数値の表示禁止（設計書 §4.2）。帯語 + 水位フィルへ |
| 人体に 4 メトリクスを線で接続 | △ 構図は採用・意味を変更 | 4 部位カードでなく **3 系統バッテリー（脳/心臓/体）が体内を巡る**表現へ。外出耐性は人体から切り離し周辺カードへ |
| 「睡眠 5.8h」カード | △ 枠は残す・データ源がない | 睡眠の取得経路は存在しない（生理 API ゼロ）。v0 は本人入力 or「まだ読めていません」。**偽データ禁止** |
| 「昨日の負荷 72%」カード | △ 帯表示で採用 | 前日 facts からの**事実表示**は可（「高め」）。今日の見立てへの数値的利用は B1 gate 後。% は出さない |
| 「回復の質 64%」カード | △ 枠のみ・v0 は unknown 許容 | 導出材料が弱い（睡眠なし）。前夜の余白消化 + Night Check から弱く導出 or「まだ読めていません」 |
| 「体質スタミナ 高い・持久タイプ」 | ❌ v0 不採用 | 相当する軸が**存在しない**（axisRegistry 全確認）。遅い層（体質）は将来の軸拡張 + CEO 判断マター |
| 「今日の成立見込み 78%」 | △ 帯語で採用 | dayFeasibility（採点対象）として「大きく崩れにくい見立て」等の帯語。% 禁止 |
| 「今日の消耗予測 −39%/−42%」「回復後予測 75%/64%」 | ❌ v0 不採用 | 採点不能の連続予測 = 数式コスプレの最たるもの。v1 でも要採点設計 |
| 時系列の「リソース推移予測」折れ線 | ❌ 予測曲線は不採用 → ✅ **事実ベースの「今日の流れ」に置換** | 予定密度・移動・余白の時間帯表示（DayGraph の事実）は可。予測曲線は不可。回復タイム帯 = 夜の余白（事実）表示は可 |
| Alter メッセージ + クイックチップ + 入力バー | ✅ 採用 | 既存 route `source:"plan"` への入口として実装（§6） |
| CTA「調整案を見る」「今日を整える」 | ✅ 2 つまで採用 | 「今日を組む」(compose) を第 1 CTA、「調整案を見る」を第 2 CTA として採用（§3.7 が正。後者は A3 接続までモック導線） |
| 明るい glass・ラベンダー/ブルー/ミント/ローズ | ✅ 採用 | 既存 glassmorphism と一致（§9 アートディレクション） |

## 3. 画面構成（上から）

### 3.1 Alter ヘッダー
- 左: `Alter` 大見出し + 小バッジ（`● ライブ` を使う場合は §1 の意味限定）
- サブコピー候補: `あなたの現実を、いっしょに組む` / CEO 原案 `あなたの現実を制御する` も可（CEO 選択）
- 右上: 設定/調整アイコン 1 個まで
- セグメントタブは置かない

### 3.2 メインカード: あなたのバッテリー
- タイトル候補: **`あなたのバッテリー`**（推奨・世界観）/ `いまの余力`
- サブコピー（いずれか 1 行）:
  - `昨日・睡眠・予定の影響を引き継いで見ています`
  - `毎朝満タンに戻るものではありません`
  - `これは診断ではなく、今日を組むための見立てです`
- 中央: 半透明の人体シルエット（性別ニュートラル・柔らかい輪郭・プレースホルダー可）
- 人体内部に 3 系統のバッテリーが**液体・光として巡る**:

| 系統 | 位置 | 色 | ラベル | データ |
|---|---|---|---|---|
| 脳バッテリー | 頭部 | パープル〜青紫 | `集中の余力` / `あたまの余白` | `battery.brain` |
| 心臓バッテリー | 胸・心臓 | ピンク〜ローズ（怖くない・医療的でない柔らかい光） | `心の余力` / `こころの余白` | `battery.heart` |
| 体バッテリー | 胴体→腕・脚へ巡る | ブルー〜ミント | `からだの余力` / `体力の残量` | `battery.body` |

- 各系統のコールアウト（人体の脇に小カード）: ラベル + 帯語（`ほとんど残っていません / 少なめ / ふつう / 余裕あり / 読めていません` — very_low 帯の語も確定済み）+ 「見立て」バッジ + 根拠チップ 1-2 個。**% 数値は置かない**
- 系統タップ → 補正シート: `もっと低い / 合ってる / もっと高い`（即時に水位が変わる）
- unknown の系統: 薄い輪郭 + `まだ読めていません`
- 水位は visualFill（0-1 連続）で描画。ゆらぎ/流れのアニメーション（framer-motion + SVG）。**ゲージ目盛り・数値・段階線を描かない**

### 3.3 周辺カード（Reality Context Cards）
人体の周囲または下に配置。**人体内部の水位ではない**ことを構図で明確に。

| カード | v0 表示 | データ源 / 充足 |
|---|---|---|
| `外出耐性` | 帯語（`軽めなら動けそう` 等）+ 根拠（`移動が多め`/`雨なし`） | estimates.outingTolerance（合成見立て・補正可） |
| `夜の余白` | **時間表示可**（`2.5h 確保できそう`）— 予定由来の事実 | facts.eveningSlackMin（設計書 §4.2: 事実分数は数値可） |
| `睡眠` | 本人入力 or `まだ読めていません` | **取得経路なし**。チップ入力（`よく眠れた/浅い/短い`）のみ。偽データ禁止 |
| `昨日の負荷` | 帯語（`高め`）+ 小バー可（数値なし） | 前日 record の facts（**表示は事実、見立てへの利用は B1 後**） |
| `回復の質` | 帯語 or `まだ読めていません` | v0 は弱導出（前夜余白 + Night Check）。unknown 許容 |
| `明日への持ち越し` | 帯語（`少なめに抑えられそう`） | carryOverOut（夜以降に充足）。スパークラインは v0 なし |
| `今日の成立見込み` | 帯語（`大きく崩れにくい見立て`） | estimates.dayFeasibility（followup で採点される） |

### 3.4 今日の流れ（事実ベース）
- 目的: 分析ではなく「今日の流れ」を直感的に見せる
- v0: **予測曲線は置かない**。予定ブロック・移動・余白の時間帯表示（既存 TimelineSpine の転用 or 簡略横帯）+ 夜の余白帯のハイライト
- `14:00 前は移動が要ります` のような時刻つき事実注記は可

### 3.5 Night Check カード（夜 17:00-05:00 のみ / 繰越時は朝）
- 主問 `今日は、最後まで余力がありましたか？` + 5 チップ。設計書 §5 が正本

### 3.6 会話エリア（コンパクト）
- Alter の短い見立てメッセージ（1-2 行・観測トーン・断定なし）
- クイックチップ: `元気` / `少し疲れた` / `眠い` / `集中したい` / `外出は軽め`
  - チップ→フィールド対応: 元気→energyLevel:high / 少し疲れた→energyLevel:low / 眠い→energyLevel:low + recoveryNeed:high / 集中したい→保存しない ephemeral 信号（dailyMode 導出の desire 入力。focusReserve には書かない — 願望と状態を混同しない。例外的に user_confirmed 書き込みなし）/ 外出は軽め→outingTolerance:low（全て user_confirmed）
- 直近 1-2 往復のみ表示（フルログは既存 Alter 面へ）
- 入力バー `Alterに話しかける…` → 既存 `/api/stargazer/alter` へ `{ message, sessionId, source: "plan", mode: "warm" }`（既存 body 型の `source?: string` でそのまま受領可能・新 API 不要。"plan" 固有の route 分岐は追加しない）。セッションは `PLAN_ALTER_SESSION_KEY`（新設定数。Stage 1 で定義）で独立管理。`useAlterChat` の軽量パターン（ラリー上限あり）を踏襲

### 3.7 CTA（2 つまで）
- 第 1: `今日を組む`（既存 compose を開く）
- 第 2: `調整案を見る`（A3 soft connection 接続までは**モック/導線のみ**）
- フルラウンド・淡いグラデーション（GlassButton variant="gradient" 系）

## 4. ViewModel 契約（Session A が生成し、Session B が読むだけの境界面)

```ts
// 正本: 設計書 §3 の DayStateRecordV0 から buildAlterBatteryViewModel() で導出する。
// Session B はこの型だけを見る。ロジックの再定義禁止。
type Band = "very_low" | "low" | "medium" | "high" | "unknown";
type BatteryZone = {
  label: string;                 // "集中の余力" 等（本書 §3.2 の候補から）
  band: Band;                    // テキスト表示用（帯語に変換して出す）
  visualFill: number;            // 0-1。描画専用。画面に数値として出さない
  confidence: "low" | "medium" | "high";
  source: "見立て" | "本人";      // バッジ表示
  evidence: string[];            // 表示用の根拠語（EvidenceTag → 日本語語彙に変換済み）
  correctable: true;
};

type AlterBatteryViewModel = {
  battery: { brain: BatteryZone; heart: BatteryZone; body: BatteryZone };
  contextCards: {
    outingTolerance: { label: "外出耐性"; band: Band; text: string; evidence: string[]; correctable: true };
    eveningSlack:    { label: "夜の余白"; text: string; evidence: string[] };       // 事実: "2.5h 確保できそう"
    sleep:           { label: "睡眠"; band: Band; text: string };                    // v0 は本人入力 or unknown
    yesterdayLoad:   { label: "昨日の負荷"; band: Band };                            // 事実表示（B1 前は表示のみ）
    recoveryQuality: { label: "回復の質"; band: Band };                              // v0 unknown 許容
    carryOver:       { label: "明日への持ち越し"; band: Band };
    feasibility:     { label: "今日の成立見込み"; band: Band; text: string };        // 帯語のみ
  };
  flowTimeline: {                // 事実表示のみ（予測曲線なし）
    segments: Array<{ kind: "event" | "travel" | "gap";
                      startHHMM: string; endHHMM: string;
                      label?: string; isEveningSlack?: boolean }>;
  };
  alterMessage: string;          // 観測トーン 1-2 行。禁止語 regression 対象
  quickReplies: string[];        // §3.6 の 5 チップ
  nightCheck?: {                 // 表示状態（設問・チップ文言は設計書 §5 が正本）
    state: "hidden" | "main" | "followup" | "answered" | "carried_over";
    question: string; chips: string[];
  };
};
```

- enum→Band 写像（**全 contextCards 分を凍結**）:
  - energyLevel: depleted→very_low / low→low / medium→medium / high→high / unknown→unknown
  - focusReserve・emotionalReserve: low→low / medium→medium / high→high / unknown→unknown（very_low なし）
  - outingTolerance: low→low / medium→medium / high→high / unknown→unknown
  - dayFeasibility: likely_steady→high / mixed→medium / likely_fragile→low / unknown→unknown
  - carryOver（carryOverOut.recoveryDebt）: none→low / some→medium / high→high / 夜まで未充足→unknown
  - sleep（本人チップ）: よく眠れた→high / 浅い→low / 短い→low / 未入力→unknown
  - yesterdayLoad・recoveryQuality: 導出閾値は Session A が fixture で確定し closeout に記録（band 値域は low/medium/high/unknown）
- visualFill: 内部連続中間値から導出（保存しない値。設計書 §4.2 の三層規律準拠）。band との矛盾禁止（band=low なのに fill 0.8 等は contract violation としてテスト対象）

## 5. コンポーネントマップ

**新規（Session B が作る）**: `AlterTabBody` / `AlterHeader` / `HumanBatteryCard` / `HumanBatteryFigure`（SVG シルエット + 液体アニメ。プレースホルダー可）/ `BatteryCallout` / `RealityContextCards` / `TodayFlowStrip` / `NightCheckCard` / `AlterChatPreview` / `AlterQuickReplies` / `AlterCtaRow` / `AlterInputBar`

**再利用（既存。土台精査で確認済み）**:
- `GlassCard variant="gradient"`（from-white/85 to-white/50 backdrop-blur-xl）— カード群の器
- `GlassButton variant="gradient"`（pink-500→purple-500→indigo-500）— CTA
- `FadeInView` — セクション入場
- `TimelineSpine` 3 カラム構造（時刻 w-12 / spine w-10 / card flex-1）+ category icons — 今日の流れ
- `FollowUpChip` 系の 3 択チップパターン — 補正シート / Night Check
- レイアウト規約: sticky header（bg-white/95 backdrop-blur-sm px-4 py-2 border-b border-slate-100）/ body px-4 py-3 / breathe-md（40px）セクション間隔 / max-w-3xl 中央 / pb-24

**作らない**: `SegmentTabs` / `BottomTabs` / `GlobalNavigation` / `PlanTabBar`

## 6. 実装上の遵守事項（Session B 向け）

- 既存 UI 規約（glassmorphism / breathe / sticky header / category color）を踏襲。新 UI ライブラリ導入禁止
- 既存 `/plan` タブ管理・グローバルナビ・PlanClient.tsx に**触れない**（タブ配線は Stage 1 で契約管理側が行う）
- データは mock ViewModel のみ。API / DB / localStorage 接続は禁止
- 人体イラストはプレースホルダーで開始してよいが、**3 系統バッテリーの意味**（独立した 3 つの液体系が巡る）を持つこと
- ダークモードはスコープ外
- 完成後、参照画像と並べて差分確認。ただし元画像の % 表示・上下タブ・開始残量ラベルは**意図的に再現しない**

## 7. 禁止事項チェックリスト（regression 用）

- [ ] 「おすすめ / これをした方がいい / 最適 / 推奨 / 改善 / 警告 / 危険 / 注意 / リスク」（N-3。decision-log:13583-13588）が画面のどこにも無い
- [ ] 見立て・予測への数値（% / 点数 / 確率 / スコア）が無い（時刻 HH:MM と事実由来の時間量 `2.5h` のみ可）
- [ ] 「今日の開始残量」が無い
- [ ] 断定形（「あなたは疲れています」）が無い — 全て「〜に見ています / 〜そうです」
- [ ] 赤色警告・診断調・医療風 UI が無い
- [ ] 取得経路の無いデータ（睡眠時間等）の偽表示が無い
- [ ] streak / バッジ / 他者比較 / ランキングが無い

## 8. アートディレクション + 画像生成プロンプト seed（確定版）

トーン: 明るい / 未来的だが冷たすぎない / 淡いラベンダー・ブルー・ミント・ローズ / 白ガラスカード / iOS 的柔らかさ / 高級感 / 「ヘルスケアアプリ」ではなく「パーソナル現実管制 UI」

```
Create a bright premium Japanese iPhone app UI for the /plan Alter tab content only.
Do not include any top segment tabs and do not include any bottom global navigation bar.

The screen is a personal reality control dashboard, not a healthcare app. The central
visual is a translucent, gender-neutral full-body human silhouette representing the user
as a living battery. Inside the body, show three independent soft liquid-energy systems
circulating: a purple-blue brain battery in the head (focus reserve), a rose-pink heart
battery around the chest (emotional reserve), and a blue-mint full-body battery flowing
through the torso and limbs (physical energy). The fluids feel like gentle luminous water,
not a medical scan. No gauge ticks, no numbers on the body.

Main title: 「あなたのバッテリー」. Do not render any other title text. Small note that the state
carries over from yesterday, sleep and today's schedule. Each battery has a small callout
chip with a qualitative label such as 少なめ / ふつう / 余裕あり / 読めていません, a
「見立て」 badge, and 1-2 reason chips like 夜勤明け・予定が密. No percentage numbers.

Around or below the body, place reality-context cards: 外出耐性, 夜の余白 (may show 2.5h),
睡眠, 昨日の負荷, 回復の質, 明日への持ち越し, 今日の成立見込み — qualitative bands, not
body compartments. Below them, a simple fact-based day-flow strip showing schedule blocks,
travel and free gaps (no prediction curves).

Compact Alter conversation area near the bottom: short observation-tone message, quick
reply chips 元気 / 少し疲れた / 眠い / 集中したい / 外出は軽め, then two CTA buttons
今日を組む and 調整案を見る, and an input bar Alterに話しかける….

Style: white glass cards, rounded-3xl, subtle shadows, soft lavender/blue/mint/rose
gradients, Japanese typography, bright iOS premium calm.

Negative: no medical dashboard, no hospital UI, no health diagnosis, no fitness score app,
no warning red, no risk labels, no top tab bar, no bottom navigation, no dark mode,
no dense analytics, no percentage numbers anywhere, no numeric readouts on any card or on
the body, no generic chatbot layout, no gauge dials, no streak badges, no alternative title text.
```

## 9. 出典（主要な既存部品の file:line）

`components/ui/glassmorphism-design.tsx:143-176`（GlassCard gradient）`:289-296`（GlassButton gradient）`:640-662`（FadeInView）`:745-811`（ProgressRing — 使う場合も数値 overlay 禁止）/ `app/(culcept)/plan/components/list/TimelineSpine.tsx:42-125,170-309` / `SummaryFooter.tsx:64-205` / `FlowTab.tsx:327-768`（sticky header・FAB 規約）/ `hooks/useAlterChat.ts`（POST 契約・ラリー上限）/ `app/api/stargazer/alter/route.ts`（body 型に source:"plan" 定義済み）/ `lib/origin/dailyOrbit/types.ts:40-49`（bodyEcho 語彙）/ `docs/decision-log.md:13583-13588`（N-3 語彙）
