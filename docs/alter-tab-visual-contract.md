# Alter タブ Visual Contract / Shared Reference（v0）

- 日付: 2026-06-11
- 作成: Claude（CEO 構想 + GPT 整理 + 参照画像監査 + 既存 UI 精査の統合）
- ステータス: **docs-only の視覚契約。実装・画像生成・UI 試作はまだ行わない**
- 役割: 後続の **UI 専用セッション（Session B）** と **ロジックセッション（Session A）** が共通参照する凍結契約
- 論理契約の正本: `docs/day-state-alter-tab-v0-design.md`。データの意味・採点・保存は全てそちらに従う。本書は**見え方と語彙の契約**
- **改訂 v0.1（2026-06-12・W0）**: CEO visual policy 緩和（2026-06-11・Session B の B4/B5/B13 裁定）を正本化。旧 HARD「数値非表示」→ 新原則「**数値は具体的に。ただし嘘でないこと**」（§0.1）。緩和は **Alter タブ表面限定**。あわせて B5（ヘッダー削除）/B13（操作盤化）の構成変更を反映

---

## 0. スコープ — 作るもの / 絶対に作らないもの

**作るもの**: `/plan` 内 Alter タブを開いた後の**コンテンツ領域のみ**（`AlterTabBody` 配下）。

**絶対に作らないもの**:
- 最上部のセグメントタブ（`Alter / カレンダー / リスト / マップ`）— 既存 `/plan`（PlanClient）がタブを管理する。参照画像の上部タブは**実装対象外**
- 最下部のボトムタブバー（`ホーム / /plan / 分析 / 設定`）— グローバルナビには触れない。参照画像の下部バーは**実装対象外**
- 医療・診断・健康スコア風の画面 / 赤色警告 / フィットネススコア感 / ランキング感 / ダークモード
- **「今日の開始残量」という主タイトル（不採用確定）**
- 5 段階水位 UI を固定仕様にした表現（水位は連続でよい）
- 出自の無い数値・履歴の捏造・実測断定（§0.1 の新原則）

## 0.1 数値表示ポリシー（v0.1 改訂 — CEO 裁定 2026-06-11 の正本化）

**旧 HARD「数値非表示」は廃止**し、次に置き換える:

> **数値は具体的に。ただし嘘でないこと。** すべての数値には出自（provenance）が必要。

- **スコープ: 本緩和は /plan Alter タブ表面（AlterTabBody 配下 + dev preview + dogfood 検証）に限定**。A3 What-if / N-3 empty-day / 他タブ / Home 等への**自動波及は禁止**（それらの数字・語彙禁止は別表面への別の CEO 確定決定であり不変）。本番一般公開への適用は **activation 前に CEO 再裁定**。
- **数値の出自分類（全数値がいずれかを宣言する）**:

| 分類 | 定義 | 表示条件 |
|---|---|---|
| `vm_derived` | 正本 VM の値からの決定論導出（meterPct = visualFill×100、band→% 固定写像） | 可（見立てバッジの傘下） |
| `flow_derived` | flowTimeline（予定事実）からの決定論導出（夜の余白 h・負荷予定・回復帯・推移の時刻軸・now） | 可 |
| `user_reported` | 本人申告（睡眠 h 等）。申告が無い日は数値を出さない | 可 |
| `mock_reference` | 実導出が未設計の参考値（消耗予測・回復後予測・推移カーブ動態・体質スタミナ・睡眠 5.8h） | dogfood 検証では可。**「参考値」明示必須・実測断定禁止・本番 activation 前に再裁定必須** |
| `unknown` | 出自なし | **数値表示禁止 — `—` または「まだ読めていません」**（unknown→0% は禁止。0 は実測風に読める） |

- 緩和後も維持する安全装置: 見立てバッジ + 観測トーン（断定禁止）/ ワンタップ補正 / **履歴トレンド非依存**（履歴 sparkline の捏造禁止 — B13 で確立。推移予測は当日 flowTimeline 由来の決定論導出のみ）/ **正本保存禁止**（DayStateRecord は enum 帯のまま。数値は表示 derived 層のみ — BANNED regression テストが機械ガード）/ 採点誠実性（採点不能の連続予測は mock_reference のまま。Morning Reveal の内部 strict・表示柔らかくは不変）/ unknown 正直表示（source 型縛り）。

## 1. UI 思想

- この画面は「今日のコンディション管理画面」ではない。**ユーザー自身をひとつのバッテリーとして扱い、Alter が現在の残量・余力・負荷・回復余地を見立てる画面**である。
- **Alter タブ = Reality Graph の操縦席**（設計書 §2.4）。状態メーター画面に縮めない。人体バッテリー（DayStateRecord）を中心に、予定（DayGraph）・場所（A4）・差分（A3）・答え合わせ（Night Check）が将来ここに流れ込む。
- 会話の吹き出し往復は**置かない**（B13 CEO 裁定）: alterMessage 1 行 + チップ + CTA + 状態入力スリットの**操作盤（cockpit input panel）**として一体化。構成比は「人体バッテリー > 状態の背景/予測カード > 操作盤」。
- 状態は**見立て**であって診断ではない。断定しない・押し付けない・採点される（外れたら翌日直る）。
- ヘッダーの「● ライブ」表記を使う場合、意味は「**開いた瞬間に最新導出**」に限定（常時監視を示唆しない。MomentState は derive-on-open・保存なし）。

## 2. 参照画像の監査（採用 / 不採用の確定表）

CEO 提供の参照画像（iPhone モック）を精査した結果:

| 画像の要素 | 判定 | 理由 / 置き換え |
|---|---|---|
| 上部セグメントタブ・下部ナビ | ❌ 作らない | CEO 指示①。既存 PlanClient / グローバルナビの管轄 |
| タイトル「今日の開始残量」 | ❌ 不採用 | CEO 指示②。「あなたのバッテリー」/「いまの余力」へ。残量は朝リセットでなく引き継ぎ |
| 「集中余力 48%」等の % 大表示 | ✅ 採用（2026-06-11 CEO 緩和） | 出自付き数値（§0.1 vm_derived）。帯語 + 水位フィルに % を併記 |
| 人体に 4 メトリクスを線で接続 | △ 構図は採用・意味を変更 | 4 部位カードでなく **3 系統バッテリー（脳/心臓/体）が体内を巡る**表現へ。外出耐性は人体から切り離し周辺カードへ |
| 「睡眠 5.8h」カード | △ 枠は残す・データ源がない | h 数値は **user_reported 時のみ**。mock の 5.8h は mock_reference「参考値」明示必須。未入力は「まだ読めていません」 |
| 「昨日の負荷 72%」カード | ✅ 採用（緩和） | 帯語 + % 併記可（vm_derived 写像）。今日の見立てへの数値的利用は B1 gate 後のまま |
| 「回復の質 64%」カード | ✅ 採用（緩和） | % 併記可（vm_derived）。導出は弱いまま — unknown 時は数値禁止「まだ読めていません」 |
| 「体質スタミナ 高い・持久タイプ」 | △ 枠のみ許可（緩和）・**実導出なし** | 相当する軸が存在しないため **mock_reference 明示のまま**。実導出は軸拡張 + CEO マター |
| 「今日の成立見込み 78%」 | ✅ 採用（緩和） | dayFeasibility の帯語 + % 併記可（vm_derived 写像・採点対象は不変） |
| 「今日の消耗予測 −39%/−42%」「回復後予測 75%/64%」 | △ 表示は許可（緩和）・**実導出なし** | **mock_reference**（採点設計が立つまで実導出禁止 — 数式コスプレ原則は不変）。「参考値」明示必須 |
| 時系列の推移チャート | ✅ 「今日の推移予測」として採用（B5 改名・緩和） | 時刻軸/回復帯/now = flow_derived。曲線動態 = mock_reference。履歴なし。**副作用: 事実帯（予定ラベル）が render 木から消滅 — 復旧 or 統合は Stage 1 判断（preflight 参照）** |
| Alter メッセージ + クイックチップ + 入力 | △ 操作盤として採用（B13） | 吹き出し往復は廃止。alterMessage + チップ + CTA + 状態入力スリットの操作盤一体化（§3.6） |
| CTA「調整案を見る」「今日を整える」 | ✅ 2 つまで採用 | 「今日を組む」(compose) を第 1 CTA、「調整案を見る」を第 2 CTA として採用（§3.7 が正。後者は A3 接続までモック導線） |
| 明るい glass・ラベンダー/ブルー/ミント/ローズ | ✅ 採用 | 既存 glassmorphism と一致（§9 アートディレクション） |

## 3. 画面構成（上から）

### 3.1 Alter ヘッダー【B5 CEO 指示で削除 — superseded】
- 最終デザイン（5bb868fd）にヘッダーは存在しない（見出し / ● ライブ / サブコピー / 設定アイコン全廃）。`AlterHeader.tsx` は dead code（W1 衛生対象）
- セグメントタブを置かない規律は不変

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

- 各系統のコールアウト（人体の脇に小カード）: ラベル + 帯語（`ほとんど残っていません / 少なめ / ふつう / 余裕あり / 読めていません` — very_low 帯の語も確定済み）+ 「見立て」バッジ + 根拠チップ 1-2 個 + **% 併記可（vm_derived・§0.1）**
- 系統タップ → 補正シート: `もっと低い / 合ってる / もっと高い`（即時に水位が変わる）
- unknown の系統: 薄い輪郭 + `まだ読めていません`
- 水位は visualFill（0-1 連続）で描画。ゆらぎ/流れのアニメーション（framer-motion + SVG）。ゲージ目盛り・数値は出自付きで可（§0.1）。band↔visualFill の整合（§4）は不変

### 3.3 周辺カード（Reality Context Cards）
人体の周囲または下に配置。**人体内部の水位ではない**ことを構図で明確に。

| カード | v0 表示 | データ源 / 充足 |
|---|---|---|
| `外出耐性` | 帯語（`軽めなら動けそう` 等）+ 根拠（`移動が多め`/`雨なし`） | estimates.outingTolerance（合成見立て・補正可） |
| `夜の余白` | **時間表示可**（`2.5h 確保できそう`）— 予定由来の事実 | facts.eveningSlackMin（設計書 §4.2: 事実分数は数値可） |
| `睡眠` | 本人入力 or `まだ読めていません` | **取得経路なし**。チップ入力（`よく眠れた/浅い/短い`）のみ。偽データ禁止 |
| `昨日の負荷` | 帯語 + % 併記・バー可（vm_derived 写像） | 前日 record の facts（**表示は事実、見立てへの利用は B1 後**） |
| `回復の質` | 帯語 + % 併記可。unknown 時は数値禁止（`まだ読めていません`） | v0 は弱導出（前夜余白 + Night Check）。unknown 許容 |
| `明日への持ち越し` | 帯語 + % 併記・現在値バー可。**履歴スパークラインは引き続き禁止（捏造）** | carryOverOut（夜以降に充足） |
| `今日の成立見込み` | 帯語 + % 併記可（vm_derived 写像） | estimates.dayFeasibility（followup で採点される） |

### 3.4 今日の推移予測（B5 改名・B4 採用 — 旧「今日の流れ（事実横帯）」を置換）
- 3 系列（体力/集中/負荷）+ 回復帯 + now マーカー（1 分更新）。時刻軸・回復帯・now = **flow_derived**。曲線動態 = **mock_reference**（Stage 1+ で実導出 + 採点設計が立つまで「参考値」扱い）
- 履歴は描かない（当日のみ — 履歴捏造禁止）
- **記録: この置換により旧事実横帯（予定ラベル「カフェ」等の事実表示）が render 木から消滅**。復旧（横帯併設）or 推移予測への統合は **Stage 1 判断事項**（`docs/day-state-stage1-preflight.md`）
- `14:00 前は移動が要ります` のような時刻つき事実注記は引き続き可

### 3.5 Night Check カード（夜 17:00-05:00 のみ / 繰越時は朝）
- 主問 `今日は、最後まで余力がありましたか？` + 5 チップ。設計書 §5 が正本

### 3.5' Morning Reveal（きのうの答え合わせ・朝 05:00-11:00 のみ。MomentState.timeBucket ∈ {early_morning, morning} で判定）
- 表示条件: 前日の Night Check 回答済み。1 朝 1 回・閉じられる（既読は Stage 1 の `plan_morning_reveal_v0`）
- 内容: 凍結見立て vs 実際（**帯語のみ・数値なし — §0.1 緩和の意図的例外**。採点開示面に % を出すと採点が数値精度を主張する誤読を生むため、内部 strict・表示柔らかく（CEO 追認条件）を維持。解除は CEO 再裁定で可）+ 記録/反映の 1 行
- コピー例（B1 解錠前の正規形）: `きのうは「からだの余力 少なめ」と見ていました。実際は「少し余った」ようです。この差は記録しました。反映はもう少し学んでから`
- **verdict の表示規律（CEO 追認条件 2026-06-11）**: 内部採点は strict（±1 吸収なし）だが、**UI に「外れた」「ハズレ」等の強い表現を出さない**。verdict（match/over/under）は内部値であり、表示は「実際は『◯◯』だったようです」の観測トーンのみ
- **adjustmentNote の規律**: B1 解錠前は「記録した」系のみ。「今日は少し上げて見ています」等の**反映済み表現は、補正が実際に適用される Stage 3 から**（事実でないことを言わない — 設計書第一原則）
- これが「毎晩採点される AI」の**開示面**であり、「自分って、そういう人間だったのか」の日次版。外れを隠さないことが信頼の源泉（補正の可視化は信頼を上げる — 外部研究確認済み）

### 3.6 操作盤（cockpit input panel）— B13 CEO 裁定で「会話エリア」から再設計
- 吹き出しの会話往復は**廃止**（B13）。alterMessage 1 行（観測トーン・断定なし・アバター付きタイトル帯）+ チップ + CTA + **状態入力スリット**（placeholder「いまの状態をひとことで…」）を操作盤として一体化
- クイックチップ: `元気` / `少し疲れた` / `眠い` / `集中したい` / `外出は軽め`
- **コールドスタート（初回・全 unknown 時）**: チップ列を人体直下に昇格し「3 タップで初期化」できる導線にする（unknown を偽推定で埋めない代わりに、本人入力への最短路を出す）
  - チップ→フィールド対応: 元気→energyLevel:high / 少し疲れた→energyLevel:low / 眠い→energyLevel:low + recoveryNeed:high / 集中したい→保存しない ephemeral 信号（dailyMode 導出の desire 入力。focusReserve には書かない — 願望と状態を混同しない。例外的に user_confirmed 書き込みなし）/ 外出は軽め→outingTolerance:low（全て user_confirmed）
- 会話表示なし（対話・フルログは既存 Alter 面へ）
- 状態入力スリットの送信先（Stage 1 配線）: 既存 `/api/stargazer/alter` へ `{ message, sessionId, source: "plan", mode: "warm" }`（既存 body 型の `source?: string` でそのまま受領可能・新 API 不要。"plan" 固有の route 分岐は追加しない）。セッションは `PLAN_ALTER_SESSION_KEY`（新設定数。Stage 1 で定義）で独立管理。`useAlterChat` の軽量パターン（ラリー上限あり）を踏襲

### 3.7 CTA（2 つまで）
- 第 1: `今日を組む`（既存 compose を開く）
- 第 2: `調整案を見る`（A3 soft connection 接続までは**モック/導線のみ**）
- フルラウンド・淡いグラデーション（GlassButton variant="gradient" 系）

## 4. ViewModel 契約（Session A が生成し、Session B が読むだけの境界面)

```ts
// 正本: buildAlterBatteryViewModel(record, moment, yesterdayRecord?, segments?) で導出する。
// 第 4 引数 segments?（DaySegmentLite[]）は v0.3 監査で正式化: record は segment を保持しない（store slow）ため、
// 「今日の流れ」の完全表示には build/derive と同じ lite segments を共有する。未提供時は nowSegment のみの縮退表示。
// Session B はこの型だけを見る。ロジックの再定義禁止。
type Band = "very_low" | "low" | "medium" | "high" | "unknown";
type BatteryZone = {
  label: string;                 // "集中の余力" 等（本書 §3.2 の候補から）
  band: Band;                    // テキスト表示用（帯語に変換して出す）
  visualFill: number;            // 0-1。**正本 VM の文字列に数値を出さない**（数値表示は derived 層の責務 — §4.1。meterPct=visualFill×100 等は screenViewModel 側）
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
    sleep:           { label: "睡眠"; band: Band; text: string;
                       source: "user_reported" | "unknown";
                       correctable: true };                                          // **source ≠ user_reported なら band は必ず "unknown"（型で偽データを縛る）**
                                                                                     // 入力経路: カードタップ → チップ（よく眠れた/浅い/短い）→ userInputs.sleepQuality（設計書 §3.2）
    yesterdayLoad:   { label: "昨日の負荷"; band: Band };                            // 事実表示（B1 前は表示のみ）
    recoveryQuality: { label: "回復の質"; band: Band;
                       source: "night_check_derived" | "unknown" };                   // **source=unknown なら band も "unknown"**。v0 の導出源は前夜 Night Check のみ（user_reported 入力経路は将来の additive 改訂）
    carryOver:       { label: "明日への持ち越し"; band: Band };
    feasibility:     { label: "今日の成立見込み"; band: Band; text: string };        // text は帯語（% 併記は derived 層の責務）
  };
  flowTimeline: {                // 事実表示のみ（予測曲線なし）
    segments: Array<{ kind: "event" | "travel" | "gap";
                      startHHMM: string; endHHMM: string;
                      label?: string; isEveningSlack?: boolean }>;
  };
  morningReveal: {               // きのうの答え合わせ（§3.5'）。前日未回答・前日レコード欠如・朝以外は null（undefined 不可・null 一本化）
    forDate: string;
    items: Array<{ label: string; estimatedBand: Band; actualBand: Band;
                   verdict: "match" | "over" | "under" }>;
    // items の選定規則（v0 凍結）: energyLevel のみ必須。dayFeasibility は planVerdict 回答時のみ追加可。
    // recoveryNeed は載せない（「余力」方向の帯語と意味反転するため。載せるのは専用語彙凍結後）。
    // 表示用 actualBand 写像（dayFelt→Band）: 5→high / 4→high / 3→medium / 2→low / 1→very_low
    adjustmentNote: string;      // B1 前 = 「この差は記録しました。反映はもう少し学んでから」系（固定テーブル）。反映済み表現は Stage 3 から
  } | null;
  alterMessage: string;          // 観測トーン 1-2 行。禁止語 regression 対象
  quickReplies: string[];        // §3.6 の 5 チップ
  nightCheck: {                  // 表示状態（設問・チップ文言は設計書 §5 が正本）
    // v0.3 監査で「常時返却 + state='hidden'」に統一（optional 廃止 — Session B の分岐を単純化）
    state: "hidden" | "main" | "followup" | "answered" | "carried_over";
    question: string; chips: string[];
  };
};
```

- **futureSlots（実装しない・型未定義の docs 予約。Session B が想像で作ることを禁止）**: `adjustmentDiffSlot`（A3 から流入）/ `placeCandidateSlot`（A4 から流入）/ `requestFrameSlot`（compose 拡張から流入）。型は各トラックの CEO 判断後に additive 改訂で追加する。
- **feasibility.text の制約**: 固定テーブル（band→帯語文）からのみ生成。「今日の流れは大きく崩れにくそうです」程度に抑え、断定・強い成立保証の文言は禁止（dayFeasibility は day-level proxy — 設計書 §3.3）。
- enum→Band 写像（**全 contextCards 分を凍結**）:
  - energyLevel: depleted→very_low / low→low / medium→medium / high→high / unknown→unknown
  - focusReserve・emotionalReserve: low→low / medium→medium / high→high / unknown→unknown（very_low なし）
  - outingTolerance: low→low / medium→medium / high→high / unknown→unknown
  - dayFeasibility: likely_steady→high / mixed→medium / likely_fragile→low / unknown→unknown
  - carryOver（carryOverOut.recoveryDebt）: none→low / some→medium / high→high / 夜まで未充足→unknown
  - sleep（本人チップ）: よく眠れた→high / 浅い→low / 短い→low / 未入力→unknown
  - yesterdayLoad・recoveryQuality: 導出閾値は Session A が fixture で確定し closeout に記録（band 値域は low/medium/high/unknown）
- visualFill: 内部連続中間値から導出（保存しない値。設計書 §4.2 の三層規律準拠）。band との矛盾禁止（band=low なのに fill 0.8 等は contract violation としてテスト対象）

### 4.1 表示専用 derived 層（screenViewModel）の正本化（v0.1）

- Session B の `app/(culcept)/plan/components/alter/screenViewModel.ts`（`AlterScreenViewModel`）は **canonical `AlterBatteryViewModel` の拡張ではなく、表示専用 derived adapter**（base を内包・不変）。
- **Stage 1 以降も canonical VM を表示都合で拡張しない**。数値（meterPct・band→% 写像・予測系列）は derived 層の責務。正本 VM は帯語 + visualFill のまま（`tests/unit/dayStateViewModel.test.ts` の BANNED regression が機械ガード）。
- band→% 固定写像（RESERVE_PCT / LOAD_PCT / QUALITY_PCT / CARRY_PCT / FEAS_PCT）を **vm_derived の正式表示規則として凍結**。ただし **unknown→0 は禁止**（W1 修正対象 — unknown は数値を出さない）。

## 5. コンポーネントマップ

> 注（2026-06-12）: 本リストは Session B **起動時の指示（歴史的）**。最終実装の正は B branch `5bb868fd` — AlterHeader / TodayFlowStrip / RealityContextCards は dead code（preflight W1-3）、AlterChatPreview は avatar 供給のみ、実構成には StateBackgroundPanel / ForecastGrid / ResourceTrendChart / 操作盤系が追加されている。「TimelineSpine — 今日の流れ」転用も §3.4 の置換により不使用。

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
- 完成後、参照画像と並べて差分確認。ただし元画像の上下タブ・開始残量ラベルは**意図的に再現しない**（% 表示は 2026-06-11 緩和で解禁済み）

## 7. 禁止事項チェックリスト（regression 用）

- [ ] 「おすすめ / これをした方がいい / 最適 / 推奨 / 改善 / 警告 / 危険 / 注意 / リスク」（N-3。decision-log:13583-13588）が画面のどこにも無い
- [ ] **出自（§0.1 の 5 分類）のない数値が無い**（旧「数値ゼロ」基準は 2026-06-11 CEO 緩和で置換）
- [ ] **unknown に数値が出ていない**（`—` / 「まだ読めていません」。unknown→0% は禁止）
- [ ] **mock_reference の数値に「参考値」明示がある**（実測断定なし）
- [ ] 履歴トレンド・スパークラインの捏造が無い（推移は当日 flow_derived のみ）
- [ ] 「今日の開始残量」が無い
- [ ] 断定形（「あなたは疲れています」）が無い — 全て「〜に見ています / 〜そうです」
- [ ] 赤色警告・診断調・医療風 UI が無い
- [ ] 取得経路の無いデータが**無宣言で**表示されていない（mock_reference 明示 or 非表示）
- [ ] streak / バッジ / 他者比較 / ランキングが無い

## 8. アートディレクション + 画像生成プロンプト seed（歴史的 seed）

> 注: 本 seed は人体アセット確定（B21・`5bb868fd`）以前の探索用。数値禁止系の negative は 2026-06-11 緩和**以前**の内容であり、現行の正は実装（Session B branch）+ 本契約改訂版（§0.1）。

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

`components/ui/glassmorphism-design.tsx:143-176`（GlassCard gradient）`:289-296`（GlassButton gradient）`:640-662`（FadeInView）`:745-811`（ProgressRing — 数値 overlay は出自付きで可・§0.1）/ `app/(culcept)/plan/components/list/TimelineSpine.tsx:42-125,170-309` / `SummaryFooter.tsx:64-205` / `FlowTab.tsx:327-768`（sticky header・FAB 規約）/ `hooks/useAlterChat.ts`（POST 契約・ラリー上限）/ `app/api/stargazer/alter/route.ts`（body 型に source:"plan" 定義済み）/ `lib/origin/dailyOrbit/types.ts:40-49`（bodyEcho 語彙）/ `docs/decision-log.md:13583-13588`（N-3 語彙）
