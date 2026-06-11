# Alter Tab UI Mock — Closeout（Session B / UI Layout）

- 日付: 2026-06-11
- 実装: Session B（UI 専用セッション。branch `claude/session-b-ui-from-7a817ab1` — CEO 許可により `7a817ab1` から新規作成）
- 契約正本（読み取り専用・全て不変更）: `docs/alter-tab-visual-contract.md` / `docs/day-state-alter-tab-v0-design.md` §7・§9 / `docs/day-state-stage0-closeout.md` / `docs/handoff-session-b-ui.md` / `lib/plan/dayState/dayStateTypes.ts` / CEO 提供参照画像
- 検証: 敵対的契約監査 4 観点（並列 workflow・finding ごとに敵対検証）+ preview 実機検証（mobile 390px）+ tsc + 既存テスト

## 1. 成果（commit / touched files）

| commit | 内容 |
|---|---|
| `9f918a72` | WIP: 12 コンポーネント + 表示語彙 + mock fixture + dev preview（新規 15 ファイル・1530 行） |
| `baff986a` | fix: 補正シート exit 修正（AnimatePresence 直接子 key 付与）+ サブコピー 1 行規定遵守（監査反映） |

**touched files（全て新規。既存ファイル変更ゼロ — `git diff 7a817ab1..HEAD --name-only` で検証可能）**:

| 種別 | ファイル |
|---|---|
| 構成ルート | `app/(culcept)/plan/components/alter/AlterTabBody.tsx`（補正シート・Morning Reveal ローカル含む） |
| コンポーネント 11 | `AlterHeader` / `HumanBatteryCard` / `HumanBatteryFigure` / `BatteryCallout` / `RealityContextCards` / `TodayFlowStrip` / `NightCheckCard` / `AlterChatPreview` / `AlterQuickReplies` / `AlterCtaRow` / `AlterInputBar`（同ディレクトリ） |
| 表示語彙 | `app/(culcept)/plan/components/alter/bandDisplay.ts`（§3.2 凍結帯語 + カード別語彙 + ゾーン配色。コンポーネント 12 への追加サポートモジュール — ロジックなし・定数のみ） |
| mock | `app/(culcept)/plan/components/alter/__mocks__/alterBatteryViewModel.mock.ts`（7 variant + 会話 mock） |
| preview | `app/(culcept)/plan/dev-alter-tab/page.tsx`（1 route のみ・三重ガード・どこからもリンクなし） |
| closeout | 本書 |

**HARD 制約の遵守**: PlanClient.tsx / グローバルナビ / FlowTab / CalendarTab / MapTab / API route / Supabase / localStorage / featureFlags / `lib/plan/dayState/` — 全て不接触（監査 2 系統目が grep + git diff で検証、違反 0）。データ接続は `import type { AlterBatteryViewModel }` のみ。runtime import は `lib/plan/dayState` からゼロ（Session A の「UI 不接続」状態を維持）。

## 2. 検証結果

| 項目 | 結果 |
|---|---|
| `npx tsc --noEmit`（8GB） | **55 errors = baseline と同数**（alter/dev-alter-tab 起因 0） |
| 既存テスト | dayState 4 ファイル **94/94 PASS**（Session A 領域不変の確認） |
| preview 描画 | 全 7 variant が **200 / コンパイル成功 / console エラーなし**（夜 variant 検証時の console error 履歴は編集途中の一時 parse error の蓄積。修正後の全 variant 再取得で再発なし） |
| 表示検証 | a11y snapshot + スクリーンショット 4 枚（朝 / 夜下部 / 脳 unknown / コールドスタート）で目視確認 |

**表示上機能の確認（DoD 項目・preview 実機）**:
- 補正シート: 系統タップ → 開く → 3 択（もっと低い/合ってる/もっと高い）→ 選択で ~0.5s で閉じる + ack「補正を受け取りました」+ 対象系統の柔らかいパルス ✅
- 睡眠シート: カードタップ → よく眠れた/浅い/短い → 閉じる + ack ✅
- Night Check: 主問 + 5 チップ表示・選択ハイライト・「受け取りました」✅（followup 3 チップ / answered 静音表示 / carried_over「きのうは〜」も描画確認）
- チップ列: 5 チップ選択可。コールドスタートで人体直下へ昇格 + 重複表示なし（「元気」ボタン計 1 個を確認）✅
- CTA 2 つ（今日を組む / 調整案を見る）+ 入力バー（送信でクリア・モックコールバック）✅
- unknown 系統: 破線輪郭 + 液体なし + 「まだ読めていません」✅ / morningReveal=null variant で Reveal 非表示 ✅
- mobile 390px 基準 + max-w-3xl + breathe-md（space-y-10 = 40px）+ sticky header ✅

## 3. visual-contract §7 チェックリスト — 全項目 PASS

| # | 項目 | 結果 / 根拠 |
|---|---|---|
| 1 | N-3 禁止 9 語が画面に無い | ✅ rendered 文字列への grep 0 件（ヒットはコードコメント内の契約引用のみ）。監査 1 系統目 0 件 |
| 2 | 見立て・予測への数値が無い | ✅ 数値は HH:MM と事実由来「2.5h」のみ。昨日の負荷の小バーは幅のみ（数値ラベルなし）。CSS の `w-[44%]` / SVG gradient offset は描画文字列でない |
| 3 | 「今日の開始残量」が無い | ✅ タイトルは「あなたのバッテリー」 |
| 4 | 断定形が無い | ✅ 帯語 + 「見立て」バッジ + 観測トーン（〜に見ています/〜そうです/〜できそう）。監査 4 系統目 0 件 |
| 5 | 赤色警告・診断調・医療風が無い | ✅ `red-*` クラス 0。心臓はローズ系の柔らかい光（契約色）。負荷バーは amber |
| 6 | 取得経路の無いデータの偽表示が無い | ✅ 睡眠は全 variant で source unknown → band unknown +「まだ読めていません」（時間数値なし） |
| 7 | streak / バッジ / 他者比較 / ランキングが無い | ✅ 該当 UI なし |

## 4. 参照画像との差分メモ（意図的に再現していない要素 = visual-contract §2 の確定表どおり）

**再現しない（契約で不採用確定）**:
- 上部セグメントタブ（Alter/カレンダー/リスト/マップ）・下部ボトムナビ（ホーム//plan/分析/設定）— PlanClient / グローバルナビ管轄
- 主タイトル「今日の開始残量」→「あなたのバッテリー」へ置換
- % 大表示すべて（集中余力 48% / 体力 61% / 回復必要度 68% / 外出耐性 31% / 睡眠 5.8h / 昨日の負荷 72% / 回復の質 64% / 持ち越し 28% / 成立見込み 78%）→ 帯語 + visualFill 水位（数値・目盛りなし）
- 「回復必要度」の人体接続 → 3 系統は全て余力方向（脳=集中/心臓=心/体=からだ）。recoveryNeed は人体に置かない（§9.3）
- 外出耐性の人体接続 → 周辺カードへ分離
- 「体質スタミナ 高い・持久タイプ」カード → 不採用（対応軸が存在しない）
- 「今日の消耗予測 −39%/−42%」「夜の回復見込み・回復後予測 75%/64%」→ 不採用（採点不能の連続予測）
- 「今日のリソース推移予測」折れ線 → 事実ベース「今日の流れ」（予定/移動/余白 + 夜の余白ハイライト）に置換
- スパークライン（持ち越し/成立見込み）→ 帯語のみ
- チャットのタイムスタンプ（09:30 等）・マイクアイコン → 省略（mock 範囲外）
- CTA「今日を整える」→ 契約の「今日を組む」（第 1）+「調整案を見る」（第 2）

**採用（参照画像と同系）**: 全体構図（人体中心 + 脇コールアウト + 周辺カード群 + 会話 + チップ + CTA + 入力バー）/ 明るい glass + ラベンダー・ブルー・ミント・ローズ / Alter ヘッダー +「● ライブ」+ 設定アイコン 1 個 / 夜の余白「2.5h」の時間表示（事実由来のため可）。

**参照画像に無い契約由来の追加**: Night Check カード（夜）/ Morning Reveal「きのうの答え合わせ」（朝・B1 前文言固定）/ コールドスタートのチップ列昇格。

## 5. 敵対的監査の結果（workflow 4 観点並列 + finding 単位の敵対検証）

- 観点: ①§7 チェックリスト ②HARD 制約（git diff + grep） ③型・契約整合（fixture vs 型正本 / band-fill / B1 文言） ④コピー・トーン
- **confirmed 1 件のみ（LOW）**: HumanBatteryCard がサブコピー候補 1（上部）と候補 3（フッター）を併用 → §3.2「いずれか 1 行」逸脱 → **`baff986a` で修正済み**（フッターは補正アフォーダンス案内「タップで補正できます」のみ残置）
- 棄却 0 件 / その他 3 観点は指摘なし
- 実装バグ 1 件を preview 検証で発見・修正: AnimatePresence 直下を Fragment で包んでいたため補正シートの exit が完了せず残存 → key 付き motion 要素 2 つに分離（`baff986a`）

## 6. 契約差分の有無

**契約差し戻し（実装を止めるべき契約変更）= なし**。ViewModel の形・語彙・構成の変更は不要だった。

**記録事項（契約の白地を表示層で確定 / fixture 補完 — 契約変更ではないが次セッションへの引き継ぎ）**:
1. **fixture の nightCheck 補完**: handoff の fixture 原文に `nightCheck` が無いが型は必須（常時返却 + state="hidden"）。設計書 §5.2 正本文言（Session A 実装 `buildAlterBatteryViewModel.ts` と同一）で補完した
2. **followup 状態の文言**: 現行 builder は followup state を出力しない（state machine 値は型に存在）。mock は設計書 §5.2 の followup 設問「予定は、見立て通りに運びましたか？」+ 3 チップを供給して UI を検証した
3. **band→語彙の表示層確定**: 余力方向は §3.2 凍結帯語をそのまま使用。**契約に明示語彙の無い 3 カード**は契約の例示に沿って確定 — 昨日の負荷（高め/ふつう/軽め）・回復の質（とれていそう/ふつう/浅め）・持ち越し（少なめに抑えられそう/少し残りそう/多めに残りそう）。変更したい場合は `bandDisplay.ts` の定数のみ
4. **Morning Reveal の actual 表記**: 契約コピー例の「少し余った」(dayFelt アンカー語) は VM に存在しないため、帯語「余裕あり」寄り表記で表現（§3.5' の「帯語のみ」規定内。アンカー語を出したい場合は VM への additive 改訂が必要 = 契約管理側判断)
5. **会話エリアの順序**: §3.6（メッセージ → チップ → 直近往復 → 入力バー）を視覚正本として採用し、CTA（§3.7）を入力バーの前に配置。§7.2 の番号列（6 チップ → 7 Composer → 8 CTA）とは粒度差があるが矛盾ではないと判断
6. **ヘッダーサブコピー**: 候補 1「あなたの現実を、いっしょに組む」を採用（CEO 原案「あなたの現実を制御する」への差し替えは AlterHeader.tsx 1 行）

## 7. dev preview の運用ノート + 判断事項

- 三重ガード: 既存 pure helper `isCandidateActionsPreviewHostAllowed` + 既存 env 変数 `REALITY_CANDIDATE_ACTIONS_DEV_HOST` を共有（dev-reality-pipeline と同前例。新規 env 変数・新規 helper ファイルなし）。production では構造的に不可視
- variant 切替は `?v=` searchParams（morning/night/followup/answered/carried/unknown/coldstart）。自己リンクのみ・外部からのリンクなし
- 検証環境の事実記録: worktree に node_modules が無く `npm ci` を実施 / `.env.local` を main checkout から複製（gitignored・repo 不変更）し `REALITY_CANDIDATE_ACTIONS_DEV_HOST=true` をローカル追記 / preview ブラウザは既存の staging 認証セッションで proxy.ts を通過（新規アカウント操作なし）
- **判断事項（CEO）**: `dev-alter-tab` ページの残置 or 削除。**推奨 = Stage 1（タブ配線）まで残置**（配線後の見え方比較とコピー調整の確認台として有用。ガードにより本番不可視）

## 7.5 v2 再設計（同日・CEO 0 点評価への対応）

初版に対する CEO 評価は「土台 OK / デザイン・レイアウト・UI・記載内容は 0 点（理想画像との乖離）」。差分監査（A 品質ギャップ / B 構図 / C 契約 §2 不採用項目）を提示し、CEO 判断「**Figma を飛ばして実装を磨く**」を受けて v2 を実装した（commit `4ba33735`）。

**v2 で理想画像に寄せた点（A/B バケットの解消）**:
- 人体: パーツを SVG `<mask>` で合成した有機シルエット（継ぎ目なし均一ボディ + 拡大 mask による連続リム輪郭 + ぼかし aura）。液体はぼかしグラデ + 液面波 2 層 + 内部ハイライト。心臓はローズの柔らかい光 + 鼓動。unknown は破線輪郭
- 構図: 人体中央 + **浮遊コールアウト 3 枚 + 点線コネクタ（部位側に色ドット）**。状態の背景（昨日までの影響）= 睡眠/昨日の負荷/回復の質の 3 連。周辺 4 カード 2x2。今日の流れは 06:00-24:00 の**事実横帯**（時刻軸 + 凡例 + 区間注記。予測曲線なしは維持）
- ディテール: 専用ストロークアイコン 14 種（`alterIcons.tsx` 追加）/ カード密度・タイポを参照画像準拠に / 会話はキャラアバター + 時刻 + アイコン付きチップ横スクロール / CTA は紫・橙の大型フルラウンド 2 色 / 入力バーはアバター + マイク（視覚のみ）+ 送信
- ヘッダーサブコピーを CEO 原案「あなたの現実を制御する」へ（§3.1 の許可選択肢内）

**維持した契約制約（C バケット — 理想画像と異なるまま。解除は契約改訂 = CEO 判断）**: % 数値・消耗/回復予測・リソース推移曲線・体質スタミナ・睡眠時間の偽表示・「今日の開始残量」。セクション間隔は参照画像の密度を優先し breathe-md（40px）より詰めた（§5 レイアウト規約からの意図的逸脱・CEO 0 点評価を優先）。

**検証（v2）**: 全 7 variant 描画 / 補正・睡眠シート開閉 0.6s / チップ選択・CTA・送信クリア OK / tsc 55 = baseline / N-3・red・開始残量 grep 0 / 94 tests 不変。
**インシデント記録**: dev server の `.next` キャッシュ破損（instance 強制停止後）により**エラーなしで hydration が無言不発**（全ページ静的化・click 無反応）。`rm -rf .next` + 再起動で解消。今後 preview が無反応の場合はまずキャッシュクリアを疑うこと。

## 7.6 v3 — B1 visual shell reconstruction（CEO 方針転換: 機能より見た目再現を優先）

CEO 指示「今の実装を磨くのではなく、理想画像を基準に UI シェルを作り直せ。人体は高品質アセット化 + 動的レイヤー」を受けた再構築（commit `e820bebb`）。

**実装**:
- `HumanBatteryFigure` を **5 レイヤー構造**（ambient glow / base human body / body / brain / heart）に分離。CEO 提供アセット（人体ベース・心臓・頭・星雲テクスチャ）と 1:1 対応する差し替えスロット設計
- base 層の組み込みフォールバック: 解剖学プロポーション改善（顎・首・肩・ウエスト・手・ふくらはぎ・足）+ opaque 合成 + **リムライト filter**（feMorphology erode → edge → blur → white = ガラスマネキンの輪郭発光）+ 星雲 ambient（固定座標スパークル 12 点・random 不使用）+ 心臓の軌道リング
- 人体主役化: ステージ 340px。下部は会話 + チップ + CTA + 入力バーを 1 枚の glass 操縦席パネルに一体化
- ViewModel 接続維持: 描画は `vm.battery.*.visualFill` / `band` のみから。型変更なし・dayState 不接触・mock fixture 外の偽データなし

**アセット受け入れ手順（CEO 添付画像 5 点はチャット上のみでファイル未着）**: `app/(culcept)/plan/components/alter/assets/` に **実透過 PNG/WebP**（チェッカーボード焼き込み不可）で `human-body-base.png`（必須）/ `heart-glow.png` / `glow-texture.png`（任意）を配置 → base 層を画像 + CSS mask（alpha を mask に流用し液体をクリップ）へ差し替え（1 commit・構造変更なし）

**運用ノート（再現性確認済み）**: dev server が**既存の `.next` dev キャッシュを再利用して起動すると、エラーなしで全ページ hydration 不能**（Next 16.1.6 Turbopack + 本リポジトリ構成）。preview 起動前に `rm -rf .next` を必須手順とする。

## 7.7 B2-static-clone（over.png 設計図化 + CEO アセット実装。commit `75a20cca`）

CEO 指示「B1 不受領。over.png を設計図に静的クローン → 禁止要素置換 → vm 再接続」に対応。実際は vm 接続を切らずに over.png の骨格へ組み替えた（最終要件「vm に戻す」を先に満たした形）。

**アセットパイプライン**: CEO 提供 6 ファイルは全て alpha なし（チェッカーボード焼き込み）+ キャンバス不揃い。`assets/_processAssets.mjs` で実透過化 — 被写体がチェッカーより暗い側に分布する性質を使い「輝度キーイング（T = 四隅チェッカー最小輝度 − 3）→ alpha 強ブラー（市松周期の均し）→ 再ブースト」。body は陰影保持 + クールトーン再キー。brain-mask.png は被写体とチェッカーの輝度が重なり分離不能 → 頭部ゾーンは body.png の alpha 行幅実測（頭 1–12% / 首 12% / 肩 18%）で代替。

**over.png との対応表（禁止要素は契約語彙へ置換）**: 今日の開始残量→あなたのバッテリー / 集中余力48%→集中の余力・少なめ / 回復必要度68%→心の余力（人体から recoveryNeed を外す §9.3）/ 体力61%→からだの余力 / 外出耐性31%・夜の余白→浮遊周辺カード（§3.3「人体の周囲」配置・コネクタなし）/ 状態の背景 4 枚→睡眠・昨日の負荷・回復の質の 3 枚（体質スタミナは軸なしで不採用）/ 下段 4 枚→持ち越し・成立見込みの 2 枚（消耗予測・回復後予測は採点不能で不採用）/ リソース推移グラフ→今日の流れ事実横帯 / ※数値は目安です→※見立ては体調や予定により変動します。

**overlay デバッグ**: `?overlay=0.5&oy=-120` で over.png を半透明表示（dev 専用・本番背景貼りではない）。

**環境事象の追記（重要）**: dev server の hydration 無言不発は `.next` 削除でも**非決定的に再発**。症状 = 全ページ static・console/network エラー 0・`window.__next_f` が空配列（RSC flight 不達）。/login でも発生するため Session B コード起因ではない。インタラクション検証は健全インスタンスで PASS 済み（補正シート・睡眠シート・Night Check・チップ・送信）。恒久対処の候補 = `next dev --webpack`（launch.json 変更 = Session B 範囲外・CEO 判断）or 通常 Chrome での確認。

## 7.8 B3 visual polish（commit `d1fe6f61`）+ over.png 差分の三分類

B3 対応: 色面/halo によるコントラスト確保・水位視認性（白い水面ライン・頭の紫濃度・青/シアン統一）・body alpha 再キー（脚の隙間保持）・`v=visual` 検証 variant（band medium と整合する fill 0.62/0.50/0.55 — 実データを偽らない）・右カラム/下段/流れ/操縦席の密度と階層強化。

**over.png 差分の三分類（B3 合格条件の自己監査）**:

| 分類 | 項目 |
|---|---|
| **解消済み** | 人体中央主役・アセット駆動 / 浮遊カード 5 枚（3L+2R）+ 点線コネクタ / 色面+halo で人体が背景に溶けない / 頭・体の水位が水面ラインで一目 / 2 カラム骨格（メイン+状態の背景）/ 下段ペア / チャート位置に全幅帯 / 会話（アバター・時刻・アイコンチップ）/ 2 色大型 CTA / 入力バー（アバター+マイク+送信）/ 操縦席パネル一体化 |
| **残り（品質ギャップ）** | 心臓グローが右カードに一部隠れる / 体上部（液体より上）のガラス質感が over.png より平板 / カード間の「接続感」はまだ over.png の完成度に未達 / glow.png 星雲がやや弱い / コールドスタートはゴースト表示（破線でなく低透明度） |
| **契約上あえて不採用** | % 数値全部 / 「今日の開始残量」/ 睡眠 5.8h / 昨日の負荷 72%・回復の質 64%（帯語に置換）/ 体質スタミナ / 消耗予測・回復後予測 / リソース推移予測グラフ / 上下タブ / 設定アイコンの通知風ドット |

## 7.9 over.png 1:1 設計（B4・CEO 契約緩和。commit `b68f6050`）

**契約変更（CEO 2026-06-11 明示承認）**: visual-contract §2 の不採用項目「% 表示 / グラフ / 消耗予測 / 回復後予測 / 体質スタミナ / リソース推移予測」を**解除**し over.png に合わせる。維持: 上下タブ不要・人体方向・「今日の開始残量」非採用（→「あなたのバッテリー」継続）。
→ これは visual-contract の正本変更であり、本来は契約凍結セッションが §2 を改訂すべき**差し戻し事項**。CEO 直接承認のため Session B で先行実装し、ここに記録（契約管理側で §2 を追従改訂する必要あり）。

**型境界の守り方**: `AlterBatteryViewModel`（lib/plan/dayState・Session A 領域）は**不変更**。`screenViewModel.ts` に **`AlterScreenViewModel`** を新設し、基底 VM を内包しつつ over.png 固有の数値・系列（meterPct / stateBg / consumption / nightRecovery / carryOver / feasibility / trend）を Session B 側で足した。meterPct は基底 `visualFill` から導出（VM 連動）。

**実装（over.png 構成要素の対応）**:
| over.png | 実装 |
|---|---|
| 今日の開始残量（左 3 メーター + 人体 + 右 体力/夜の余白） | あなたのバッテリー（左: 集中%/心%/外出耐性% 、右: からだ%/夜の余白）+ 人体 + 点線コネクタ |
| 集中余力 48% 等の % | 各メーターに % 数値（band 帯語をサブに併記） |
| 状態の背景 4 枠 | 1 枠に 4 セル（睡眠 5.8h / 昨日の負荷 72%+bar / 回復の質 64%+bar / 体質スタミナ 高い・持久力タイプ） |
| 今日の消耗予測（体力-39/集中-42/負荷65） | ForecastGrid セル 1 |
| 夜の回復見込み 2.5h（回復後 75/64） | ForecastGrid セル 2（bar 付き） |
| 明日への持ち越し 28% + sparkline | ForecastGrid セル 3 |
| 今日の成立見込み 78% + sparkline | ForecastGrid セル 4 |
| 今日のリソース推移予測（折れ線 + 回復タイム + 14:00） | ResourceTrendChart（体力/集中/負荷 3 本 + 回復帯 + now 線 + 0-100 軸 + 06:00-24:00） |
| 会話 + チップ + CTA + 入力 | 既存（操縦席パネル） |

**人体（CEO 指摘 2 点）**: ①「輪郭が薄れている」→ アセット alpha の境界帯から rim（ラベンダー白の縁光）を `_processAssets.mjs` で焼き込み、カード背景に色面+halo を維持。②「心臓の位置がずれている」→ HEART_CENTER を胸中央（yPct 20.5）へ補正。

**v=visual variant**: body 0.62 / brain 0.50 / heart 0.55（band medium と整合）で over.png の水位印象を検証。

**残課題（Stage 1 / 契約側）**:
- over.png 数値（消耗予測・回復後予測・推移カーブ・体質スタミナ）は **mock 表示値**。Stage 1+ で実導出が必要。特に消耗予測・推移予測は設計書 §4 で「採点不能」とされた連続予測 = 採点設計を伴わない数値表示は信頼設計と矛盾し得る → 契約側で再整理が必要。
- 体質スタミナは対応軸が axisRegistry に無い（§2 監査）。mock のまま。軸拡張は CEO マター。
- visual-contract §2/§3 の正本改訂（% 解禁・グラフ追加・「今日の流れ」→「リソース推移予測」置換）を契約管理セッションで反映要。
- 旧 `TodayFlowStrip.tsx` / `RealityContextCards.tsx` の `StateBackgroundColumn`・`ContextCardGrid` は superseded（未使用・将来削除可）。

## 7.10 B5 — 器と液体の役割分離（commit `fcb3d1dc`）

CEO B5 指示: ①心臓 → 胸の左上（xPct 45.5 / yPct 18.5）②「今日のリソース推移予測」→「**今日の推移予測**」+ 全系列に時間ごとのデータ点 ・ ③**ヘッダー削除**（Alter / ライブ / あなたの現実を制御する / 右の設定ボタン。`AlterHeader.tsx` は superseded・未使用）④「消えかけた発光体」問題への対応 — **ベース人体 = 器 / 色は液体レイヤーのみ**の役割分離: base alpha 3.6 で芯出し・blur 減・drop-shadow 霧除去・blur なし斜めガラス光沢 / 背面プレートをラベンダー〜ブルーグレーに深化 / body 液体 = 上淡シアン→下濃青 + 水面ライン + 直下ハイライト / brain 液体 = 上淡ラベンダー紫→下濃青紫 + 白い水面ライン + 光の縁 / 星雲 glow 減光。

## 8. 残課題（Stage 1 / 契約管理側へ）

- 実配線（PlanClient タブ追加・buildAlterBatteryViewModel 接続・localStorage・補正の applyUserCorrection 接続・ミニ Composer の `/api/stargazer/alter` source:"plan" 接続）は Stage 1（CEO GO 後・stop gate 解錠後）
- 補正タップの「即時に水位が変わる」(§3.2) は mock では ack + パルスまで（実水位更新は applyUserCorrection の配線後。ロジック再定義禁止のため mock では再現しない）
- HumanBatteryFigure はプレースホルダー実装（契約許容）。アートディレクション確定後に §8 の画像生成 seed と合わせて磨き込み余地あり
