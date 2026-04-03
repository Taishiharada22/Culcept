# Aneurasync 製品比較監査 V4
## 設計判断用ドキュメント — 2026-04-03

> **読み方**: 各カテゴリーは「事実」→「評価」→「指標」→「改善案」の4段構成。
> 事実と評価は段落レベルで完全に分離。主観語は測定可能な指標に置換済み。

---

## 1. Home画面 / ファーストインプレッション

### 事実

**描画コンポーネント（13種）**: HomeHeader, LoginIntroAnimation, InlineInnerWeather(×2), ZoneErrorBoundary(×2), AlterFollowup, AnswerCard, ContextReel, AskHero, HomeQuickAccess, InlineCelebration, PostObservationReveal, HomeTour, ValuesOnboardingOverlay。
`AneurasyncHome.tsx`: 738行。useState: 22個。useRef: 5個。useMemo: 3個。dynamic import: 4個。

**InstrumentRailはHome画面に存在しない**。ファイル(`components/home/InstrumentRail.tsx`)は存在するが、`AneurasyncHome.tsx`内にimportも描画もなし（grep結果: 0件）。

**初回表示の情報レイヤー**:
1. ALTER ラベル + Sync% バッジ（上部バー）
2. InlineInnerWeather（2箇所：compact + full）
3. AlterFollowup（前回セッションのフォローアップ）
4. AnswerCard（Alterの提案カード: proposal / confidence / alternative / caution / sources）
5. 挨拶タイプライター（時間帯別5パターン + ユーザー名）
6. ContextReel（インサイト巡回: 最大10種のデータスロット）
7. Suggestion chips（4個固定: 「今日どう動く？」「なんでこうなる？」「仕事の進め方」「今日の服」）
8. Composer（テキストエリア + 送信ボタン）
9. HomeQuickAccess（下部ナビゲーション）

**データフェッチ**: `useHomeData` hook経由で11個のuseQuery → 13 APIエンドポイント。初回レンダリング時に全て並行発火。

**CTA**: 送信ボタン(1) + サジェスションチップ(4) + スクロールトップ(1) = 計6個。

**比較対象**: Replika（ホーム=チャット画面のみ）、Character.ai（キャラ選択→チャット）、Pi（単一チャット）。

### 評価

Home画面は「会話キャンバス」として設計されている。チャットアプリのシンプルさ（Replika: 情報レイヤー2、CTA 1）と比較すると、情報レイヤー9、CTA 6は初見ユーザーにとって認知負荷が高い。ただし、これは「AIチャットアプリ」ではなく「自己理解OS」であるため、ContextReelやAnswerCardが核体験への導線として機能する場合、この密度は正当化される。

ContextReelが「観測していないユーザー」にとって空振り（データなし→表示なし）になる場合、初回体験が「挨拶＋空白＋Composer」に縮退するリスクがある。

### 測定指標

| 指標 | 現状値 | 参考値（Replika） |
|------|--------|-------------------|
| 初回表示の情報レイヤー数 | 9 | 2 |
| CTA数 | 6 | 1 |
| useState数 | 22 | N/A（非公開） |
| API並行発火数 | 13 | N/A |
| 初回表示で描画されるコンポーネント数 | 13 | N/A |
| 条件非表示コンポーネント数 | 4（ContextReel, InlineCelebration, PostObservationReveal, AlterFollowup） | N/A |

### 改善案

- **[即実行可]** InlineInnerWeatherが2箇所描画されている（compact + full）。1つに統合し、展開/折りたたみで切替。情報レイヤー 9→8。
- **[要検証]** 初回ユーザー（観測0回）のHome画面を実際にレンダリングし、ContextReelとAnswerCardが何を表示するか確認。空の場合、初回専用の導入コンテンツが必要。
- **[要判断]** Suggestion chips 4個は固定値。ユーザーの観測段階（streak level）に応じた動的チップへの変更を検討。

---

## 2. AI対話（Alter）

### 事実

**日次上限**: `MAX_DAILY_ROUNDS = 5`（`useAlterChat.ts` line 30）。JSTベースでリセット。β テスターはバイパス（line 103）。

**会話永続化**: なし。メッセージはReact state内のみ（`messages: AlterMessage[]`）。localStorageには日次カウント(`aneurasync_alter_daily_v1`)のみ保存。リロードで会話消失。DB保存なし。

**エンジン構成**（`app/api/stargazer/alter/route.ts`: 4,123行）:
- Phase 0: Gemini（utterance reading）
- Phase A: state integration
- Phase 2: relational lens
- Phase 3: judgment engine（ForceBalance + ActionShape）
- モデル: Claude Sonnet、温度 0.6（main）/ 0.4（retry）/ 0.3（clarify）

**P1-Aルーター**: 5タイプ（emotional / self_understanding / knowledge / strategy / judgment）。専用プロンプトパス各1本。PASS率: 90%（eval 35ケース中、ルーター正解率100%）。

**エラーハンドリング**: 429レスポンス（上限到達時）。AbortControllerによるリクエストキャンセル。リトライロジックなし（指数バックオフなし）。

**Talk画面**: `app/(culcept)/talk/`配下に4ファイル（page.tsx, TalkPageClient.tsx, [threadId]/page.tsx, [threadId]/ChatClient.tsx）。

**チャット関連コンポーネント**: 6個（AskHero, AnswerCard, AlterFollowup, AlterFeedback, ChatClient, TalkPageClient）。

**比較対象**: ChatGPT（無制限、会話履歴DB保存、スレッド管理）、Pi（無制限、トピック切替）、Replika（無制限、会話履歴永続）。

### 評価

1日5回の上限は、「観測としての対話」を強制する設計意図として成立するが、ユーザーが日常の意思決定支援として使い始めた場合（Daily Guidance Engine等）、5回は極めてタイト。「今日の服」+「仕事の進め方」+「昼食の判断」で3回消費。

会話がリロードで消失する点は、同カテゴリの全競合（ChatGPT, Pi, Replika, Character.ai）が会話履歴をDB保存している中で、唯一の非永続設計。これが「毎回フレッシュな観測」の意図なのか、未実装なのかで評価が分かれる。

4,123行のルートファイルは、単一ファイルとしてメンテナンス困難。Phase分割がファイル内に留まっており、モジュール分離されていない。

### 測定指標

| 指標 | 現状値 | ChatGPT | Pi | Replika |
|------|--------|---------|-----|---------|
| 日次対話上限 | 5回 | 無制限(有料) | 無制限 | 無制限 |
| 会話履歴永続 | なし | DB保存 | DB保存 | DB保存 |
| レスポンス生成パイプラインPhase数 | 5 | N/A | N/A | N/A |
| ルートファイル行数 | 4,123 | N/A | N/A | N/A |
| エンジンファイル行数 | 5,746 | N/A | N/A | N/A |
| リトライロジック | なし | あり | あり | あり |
| 質問タイプ分類数 | 5 | N/A | N/A | N/A |

### 改善案

- **[即実行可]** `alter/route.ts`（4,123行）をPhase別モジュールに分割。各Phaseを独立ファイル化し、route.tsはオーケストレーションのみに。
- **[要判断]** 会話履歴のDB永続化。設計意図として非永続なら、その旨をUIで明示（「毎回、今のあなたに合わせます」等）。未実装ならrendezvous_messagesテーブル同様のスキーマで実装。
- **[要検証]** 日次5回の上限値がβテスターの利用実態と一致するか。平均何回使われているか計測後に調整。

---

## 3. 観測エンジン（Stargazer）

### 事実

**規模**: `lib/stargazer/`: 201ファイル。プロジェクト最大のモジュール群。

**45軸ベイズモデル**: 共役ガウス更新（`bayesianAxisUpdater.ts`）。回答時間シグナル（`responseTimeEngine.ts`）。矛盾検出4種（`contradictionEngine.ts`）。状態重み付け（`stateWeighting.ts`）。IRT弁別力（`itemDiscrimination.ts`）。

**質問システム**: 19個の質問関連モジュール。適応的選択ロジック4系統（`adaptiveQuestionPool.ts`, `adaptiveQ2.ts`, `intraSessionAdapter.ts`, `lensDiscovery.ts`）。

**ストリークシステム**（`streakIntelligence.ts`）:
| レベル | 日数 | 条件 | アンロック内容 |
|--------|------|------|---------------|
| observer | 3日 | — | 基本パターン表示、日次予測 |
| seeker | 7日 | — | 週間パターン、Alter基本、回答時間分析 |
| introspector | 14日 | — | 周期パターン、深層予測、Alterディープモード |
| contradiction_witness | 21日 | 矛盾3+ | 矛盾マップ、盲点検出、挑発的質問 |
| abyss_traveler | 30日 | 矛盾3+, 品質0.7+ | 全パターンエンジン、精度ダッシュボード |

**フリーズ保護**: 最大2回。7日ごとに1回獲得。条件: 1日スキップ + フリーズ残あり + 3日以上のストリーク。

**24アーキタイプ**: Cognition(3) × Emotion(2) × Social(2) × Execution(2)。重み減衰: `weight = 1/(1 + obsCount * 0.08)`。

**Stargazerページ**: `app/(immersive)/stargazer/`配下にサブページ10個（predictions, admin, values, transform, wound, events, flexibility, simulation, dreams, rhythm）。

**比較対象**: MBTI公式サイト（16タイプ、固定質問、適応なし）、16Personalities（静的テスト）、Hume AI（感情検出、リアルタイム）、Crystal（DISC+Big Five、LinkedIn連携）。

### 評価

45軸 × ベイズ更新 × 矛盾検出 × IRT適応選択という組み合わせは、消費者向け性格診断として前例のない深度。MBTI（16タイプ、固定質問）やBig Five（5因子、静的テスト）とは根本的に異なるアプローチ。

ただし、201ファイルの規模に対して、ユーザーが直接触れるStargazerページは10個。ライブラリの深さとUIの表出面積の乖離が大きい。

ストリークシステムは観測継続を促す設計だが、30日到達で全機能解放という構造は、「最初から全identity要素アクセス可能」（CLAUDE.md設計原則: No identity locks）と矛盾する可能性がある。ストリークは「機能ロック」ではなく「精度向上の可視化」であれば整合するが、アンロック表現がロック的になっていないか要確認。

### 測定指標

| 指標 | 現状値 | MBTI | 16Personalities | Crystal |
|------|--------|------|-----------------|---------|
| 性格軸数 | 45 | 4 | 5(Big Five) | 7(DISC+) |
| タイプ数 | 24 | 16 | 16 | 14 |
| 適応的質問選択 | あり（4系統） | なし | なし | なし |
| リアルタイム更新 | あり（ベイズ） | なし | なし | なし |
| 矛盾検出 | 4種 | なし | なし | なし |
| 継続観測設計 | ストリーク5段階 | 1回完結 | 1回完結 | 1回完結 |
| ライブラリファイル数 | 201 | N/A | N/A | N/A |
| ユーザー面ページ数 | 10 | 1 | 1 | 3 |

### 改善案

- **[要確認]** ストリークの「アンロック」表現が「No identity locks」原則と整合するか。UIコピーで「精度が上がった」vs「機能が解放された」の区別を確認。
- **[要判断]** 201ファイルのうち、実際にAPIやUIから参照されていないモジュールの棚卸し。dead code比率を計測。
- **[即実行可]** Stargazerページ10個のうち、各ページからlib/stargazerのどのモジュール群を使用しているかの依存マップ作成。

---

## 4. パーソナライゼーション / プロフィール

### 事実

**Profile API**（`app/api/stargazer/profile/route.ts`）: axis_scores, archetype_code, confidence, axis distributions, fluctuation patterns, companion insights を返却。

**MyPageデータ取得**（`app/(culcept)/my-page/page.tsx`）: 5個のSupabase並行クエリ（stargazer_profiles, stargazer_resolved_types, stargazer_observations count, notifications unread count, origin_snapshots）。

**Home画面へのデータフロー**: `useHomeData()`経由で identityLive, sgData, innerWeather, prophecy, blindSpot, ptData, calendarFeed, streakDays, atmosphere を取得。AnswerCardのconfidence、ContextReelのインサイト、AskHeroのnudgeに反映。

**パーソナライゼーション接点**: Home（Alter応答のパーソナライズ、ContextReel）、Stargazer（観測結果）、Origin（行動パターン）、Calendar（天気×気分×コーデ）、Rendezvous（マッチングスコア）。

**buildPersonalizedFacts()**（`alterHomeAdapter.ts` line 1621）: archetype重み減衰付きでパーソナリティ情報をプロンプトに注入。観測回数が増えるとarchetype依存度が下がる設計。

**比較対象**: Spotify（聴取履歴→Discover Weekly）、TikTok（視聴行動→FYP）、Netflix（視聴×評価→推薦）。

### 評価

パーソナライゼーションの「入力面」は豊富（45軸 × 行動ログ × 矛盾検出 × Origin日記 × Calendar気分）だが、「出力面」がAlter応答とContextReelに集中している。Spotify的な「あなただけのプレイリスト」に相当する、パーソナライズされたランディング体験が限定的。

Home画面の13APIエンドポイント並行発火は、データ収集としては充実しているが、それがユーザーに「自分専用」と感じさせるUIに変換されているかは、ContextReelの表示内容に依存する。

### 測定指標

| 指標 | 現状値 | Spotify | TikTok |
|------|--------|---------|--------|
| パーソナライゼーション入力軸 | 45+(性格) + Origin + Calendar + 行動ログ | 聴取履歴 | 視聴行動 |
| パーソナライズ出力接点 | 2（Alter応答、ContextReel） | 5+（Discover, Daily Mix, Release Radar等） |  1（FYP） |
| Home API並行数 | 13 | N/A | N/A |
| プロフィールAPI応答項目 | 6種 | N/A | N/A |

### 改善案

- **[要検証]** ContextReelに表示される10スロットのうち、実際にデータが入るスロット数をストリークレベル別に計測。observer(3日)時点で何スロット表示されるか。
- **[要判断]** パーソナライズ出力の多様化。現状のAlter応答＋ContextReelに加え、「今週のあなた」ダイジェスト（週次メール/通知）等の追加出力チャネル。
- **[即実行可]** MyPageの5並行クエリをuseHomeData同様にReact Query化（staleTime/gcTime設定）して、キャッシュ効率を改善。

---

## 5. オンボーディング

### 事実

**HomeTour**（`components/home/HomeTour.tsx`）: 5ステップのスポットライトツアー。ターゲット: `[data-tour="orbit-dock"]`, `[data-tour="alter-oneliner"]`, `[data-tour="ask-hero"]`, `[data-tour="rendezvous"]`, `[data-tour="deep-identity"]`。

**ValuesOnboardingOverlay**（`components/home/ValuesOnboardingOverlay.tsx`: 32,147バイト）: HomeTour完了後に起動。5ステップ（values / passions / career / lifestyle+prefecture / romantic dealbreaker）。価値観選択肢: 32個。趣味選択肢: 10+個。保存: localStorage + API同期。

**Rendezvousオンボーディング**: 3つの独立コンポーネント（RendezvousOnboarding, OnboardingFlow, PartnerOnboardingHub）。

**オンボーディング完了フラグ**: `aneurasync_values_onboarding_done_v1`（localStorage）。

**ツアーの表示条件**: DB hydrationチェック後（lines 298-315）、未表示の場合にshowHomeTour=true。

**比較対象**: Duolingo（言語選択→レベルテスト→1レッスン、5分完結）、Notion（テンプレート選択→即利用）、Headspace（目的選択→呼吸体験→完了、3分）。

### 評価

HomeTour(5ステップ) → ValuesOnboarding(5ステップ) = 計10ステップは、初回セッションとしてはDuolingo(3ステップ)やHeadspace(3ステップ)の3倍以上。ただし、Aneurasyncの核体験が「自己理解」であるため、初期データ収集の必要性は競合より高い。

問題は、オンボーディング完了後に「最初のAha Moment」に到達するまでの距離。Duolingoは1レッスン（5分）で「学べた」感覚を提供する。Aneurasyncで最初のインサイト（ContextReelに有意な表示）が出るのは観測3日後（observer到達時）。

ValuesOnboardingの32個の価値観選択肢は選択肢過多（Hick's Law）。Duolingoの言語選択（20言語→1タップ）と比較して、認知負荷が高い。

### 測定指標

| 指標 | 現状値 | Duolingo | Headspace | Notion |
|------|--------|----------|-----------|--------|
| オンボーディングステップ数 | 10（Tour 5 + Values 5） | 3 | 3 | 2 |
| 初回Aha Momentまでの日数 | 3日（observer到達） | 5分 | 3分 | 即時 |
| 初回選択肢の最大数 | 32（価値観） | 20（言語） | 5（目的） | 10（テンプレート） |
| オンボーディングデータ保存先 | localStorage + API | サーバー | サーバー | サーバー |
| 途中離脱からの復帰 | localStorageフラグ | サーバー記録 | サーバー記録 | サーバー記録 |

### 改善案

- **[即実行可]** ValuesOnboarding の価値観32個を「よく選ばれるTOP8」+「もっと見る」に分割。初回選択の認知負荷を32→8に低減。
- **[要検証]** HomeTour 5ステップの完了率を計測。ステップ2以降で離脱率が急上昇する場合、3ステップに短縮。
- **[要判断]** 「初回Aha Moment」を3日後ではなく初回セッション内に前倒しする設計。例: オンボーディングの5問回答だけで暫定アーキタイプを表示し、「観測を続けると精度が上がる」で継続動機を作る。

---

## 6. デザインシステム / 視覚的一貫性

### 事実

**2つのデザインシステムが共存**:
1. `glassmorphism-design.tsx`（1,010行、19エクスポート、223箇所でimport）
2. `design-system.tsx`（604行、15エクスポート、1箇所でimport）

**デザイントークン**（`lib/design-tokens.ts`）: 14トークングループ（COLORS, SURFACE, TEXT, BORDER, SHADOW, ZONES(5), HIERARCHY, SPACE(10), RADII(6), FONT(2), TYPE(7), MOTION, BREAKPOINT(4), zoneCardStyle）。

**CSSアニメーション**: globals.css: 20個の@keyframes。home-animations.css: 24個の@keyframes。合計: 34個（重複除外後の一意の名前）。

**インラインスタイル**: tsx全体で`style={{`が8,524箇所。
**ハードコードされた色値**: tsx全体で#hex/rgb/rgbaが2,333箇所。

**比較対象**: Stripe（1デザインシステム、0インラインスタイル原則）、Linear（Radix UI + カスタムトークン）、Vercel（Geist、単一トークン体系）。

### 評価

glassmorphism-design(223 import) vs design-system(1 import) は事実上glassmorphism一本化されている。design-system.tsxの15コンポーネントは参照1箇所のみで、削除候補。

8,524箇所のインラインスタイルと2,333箇所のハードコード色値は、デザイントークンが定義されている（14グループ）にもかかわらず、実際にはトークン経由での色指定が少数派であることを示す。これはテーマ変更やダークモード対応を事実上不可能にする。

34個の@keyframesアニメーションは、アニメーション重視の世界観と整合するが、重複や未使用のものがないか要確認。

### 測定指標

| 指標 | 現状値 | Stripe | Linear |
|------|--------|--------|--------|
| デザインシステム数 | 2（実質1） | 1 | 1 |
| デザインシステムimport比率 | 223:1 | N/A | N/A |
| インラインスタイル箇所数 | 8,524 | 0原則 | 最小限 |
| ハードコード色値 | 2,333 | 0 | 0原則 |
| @keyframes数 | 34 | N/A | N/A |
| デザイントークングループ数 | 14 | N/A | N/A |

### 改善案

- **[即実行可]** `design-system.tsx`（604行、import 1箇所）を削除。参照箇所をglassmorphism-designに移行。
- **[要判断]** 8,524箇所のインラインスタイルの段階的トークン化。優先度: 色値（2,333箇所）→ スペーシング → フォントサイズ の順。全置換は非現実的なので、新規コード＋主要ページから開始。
- **[即実行可]** 34個の@keyframesから未使用のものをgrep検索で特定し削除。

---

## 7. ナビゲーション / 情報設計

### 事実

**ナビゲーション定義**（`lib/navigation.ts`）:
- MAIN_NAV: 5項目（ホーム, 観測, メッセージ, Rendezvous, マイページ）
- HOME_QUICK_NAV: 5項目（コーデ, 観測, 日記, トーク, 出会う）
- HOME_MORE_NAV: 3項目（外見分析, Genome, Presence）
- EXPLORE_NAV: 4項目（探索系）
- 合計: 17個のナビゲーション項目（4セットに分散）

**ページ数**: 145個のpage.tsxファイル。notFound: 9個。redirect: 42個。

**ルーティング深度**: 最大7階層（例: `app/(immersive)/rendezvous/session/[sessionId]/page.tsx`）。

**ナビゲーションコンポーネント**: 専用のnav/header/footer/sidebarコンポーネントファイルなし。GlassNavbar（glassmorphism-design.tsx内）とPageHeader（design-system.tsx内）で処理。

**パンくずリスト**: 専用実装なし。PageHeaderのbackHref/backLabelで「戻る」のみ。

**比較対象**: Instagram（5タブ、深度3）、Notion（サイドバー+パンくず、深度∞）、Linear（3層、パンくず常時表示）。

### 評価

145ページを17ナビゲーション項目で接続している。最大深度7は、モバイルアプリとしてはInstagram(3)やTwitter(4)を大幅に超える。パンくずリスト不在のため、深度4以降で現在地を見失うリスクが高い。

ナビゲーション4セット（MAIN 5 + QUICK 5 + MORE 3 + EXPLORE 4）は、ユーザーによって異なる文脈で異なるセットが表示される設計だが、「この機能はどこからアクセスするか」が予測困難になる。

HomeQuickAccessとMAIN_NAVで項目が重複（観測=Stargazer、トーク=メッセージ等）しているが、ラベルが異なる（「観測」vs「Stargazer」、「トーク」vs「メッセージ」）場合、同一機能と認識できない可能性がある。

### 測定指標

| 指標 | 現状値 | Instagram | Linear | Notion |
|------|--------|-----------|--------|--------|
| メインナビ項目数 | 5 | 5 | 3 | サイドバー |
| ナビゲーションセット数 | 4 | 1 | 1 | 1 |
| ナビ項目合計 | 17 | 5 | 8 | N/A |
| ページ総数 | 145 | N/A | N/A | N/A |
| 最大ルーティング深度 | 7 | 3 | 3 | ∞(パンくず付) |
| パンくずリスト | なし | なし | あり | あり |
| ラベル重複/不一致 | 要確認 | なし | なし | N/A |

### 改善案

- **[即実行可]** MAIN_NAVとHOME_QUICK_NAVのラベル不一致を確認・統一。同一機能は同一ラベルに。
- **[要判断]** 深度5以上のページにパンくずリストを追加。GlassNavbarの拡張またはPageHeaderへのパンくず統合。
- **[要検証]** 145ページのうち、MAIN_NAVまたはHOME_QUICK_NAVから2クリック以内でアクセスできるページ数を計測。到達率が50%未満なら情報設計の見直し。

---

## 8. パフォーマンス / ローディング

### 事実

**loading.tsx**: 10個（calendar, sns/profile, genome-card, culcept, origin, my-page, rendezvous, stargazer, immersive, legal）。
**error.tsx**: 1個（`app/error.tsx`のみ。全145ページで共有）。
**Suspense**: 29箇所。
**dynamic import**: 58箇所。
**next/image**: 16箇所（imgタグの使用数は未計測）。
**React.memo/useMemo**: 700箇所。
**middleware.ts**: なし（プロジェクトルートに存在しない）。

**next.config.js設定**:
- `ignoreBuildErrors: true`（line 42。理由: tscでOOM。CIで`tsc --noEmit`別途実行）
- `bodySizeLimit: "100mb"`（line 36。Server Action用）
- `hostname: "**"`（line 16。全ホスト許可）
- Turbopack有効
- Three.js外部化（`serverExternalPackages`）
- Sentry統合有効

**比較対象**: Vercel公式推奨（error.tsx全レイアウト、middleware.ts必須、CSP設定）、Next.js Best Practices。

### 評価

error.tsxが1個のみ。145ページ中、特定のページグループ（例: Stargazer観測中、EC決済中）でエラーが発生した場合、全て同一のエラー画面に遷移する。文脈に応じたエラーリカバリ（「もう一度観測する」vs「購入をやり直す」）ができない。

loading.tsx 10個は主要レイアウトをカバーしているが、重い個別ページ（Origin: 75,257バイトのクライアントコンポーネント、MyPage: 22,125バイト）に個別のloading.tsxがあるかは確認済み（Origin: あり、MyPage: あり）。

`ignoreBuildErrors: true`はOOM回避の合理的対応だが、CIの`tsc --noEmit`で型エラーが検出されている場合、ビルド成功=型安全ではないことをチームが認識している必要がある。

`hostname: "**"`は全リモートホストからの画像読み込みを許可。本番環境では許可ホストを限定すべき。

`bodySizeLimit: "100mb"`はServer Actionの画像アップロード用だが、100MBは一般的なWebアプリの上限（10MB）の10倍。意図的な大容量対応か確認。

### 測定指標

| 指標 | 現状値 | Next.js推奨 | Vercel推奨 |
|------|--------|------------|------------|
| error.tsx数 | 1 | レイアウト毎 | レイアウト毎 |
| loading.tsx数 | 10 | ページ毎推奨 | N/A |
| Suspense使用数 | 29 | 積極的推奨 | N/A |
| dynamic import数 | 58 | 必要箇所 | N/A |
| next/image使用数 | 16 | 全画像推奨 | 全画像推奨 |
| middleware.ts | なし | 認証用に推奨 | 推奨 |
| 画像ホスト制限 | `**`（全許可） | ホワイトリスト | ホワイトリスト |
| Server Action上限 | 100MB | 1MB(デフォルト) | N/A |
| ignoreBuildErrors | true | false推奨 | false推奨 |
| React.memo/useMemo | 700 | 必要箇所のみ | N/A |

### 改善案

- **[即実行可]** 主要レイアウトグループ（Stargazer, Rendezvous, EC系）にerror.tsxを追加。最低3個追加で文脈別エラーリカバリ。
- **[即実行可]** `remotePatterns`の`hostname: "**"`を実際に使用されているホスト（Supabase Storage, CDN等）のホワイトリストに変更。
- **[要判断]** `bodySizeLimit: "100mb"`の根拠確認。画像アップロードが実際に100MBを必要とするか。不要なら10MBに引き下げ。
- **[要判断]** middleware.tsの導入。認証チェック、リダイレクト、CSPヘッダー設定に使用。現状これらは各route内で個別処理されている。

---

## 9. セキュリティ / 認証

### 事実

**middleware.ts**: プロジェクトルートに存在しない。
**CSPヘッダー**: 0箇所。ソースコード内にContent-Security-Policyの設定なし。
**Supabase Auth**: 140箇所で`createServerClient`/`createClient`使用。
**レート制限**: 14箇所で関連キーワード検出。Alter APIの429レスポンス（日次上限）が主。汎用レート制限ミドルウェアなし。
**dangerouslySetInnerHTML**: 5箇所。
**入力バリデーション**: 140+箇所でバリデーションパターン検出。
**.env管理**: `.gitignore`に`.env*`含む。`.env.local`はgit追跡外（確認済み）。

**比較対象**: OWASP Top 10対応チェックリスト、Vercel Security Best Practices。

### 評価

CSPヘッダー完全不在は、XSS攻撃に対する防御層がゼロであることを意味する。dangerouslySetInnerHTML 5箇所と組み合わせると、入力値が適切にサニタイズされていない場合にXSSリスクが存在する。

middleware.ts不在により、認証チェックが各APIルート内で個別実装されている。369個のAPIルートそれぞれで認証チェックが正しく行われているか、網羅的確認が必要。1箇所でも漏れがあれば、未認証アクセス可能なエンドポイントが生まれる。

汎用レート制限がないため、Alter以外のAPIエンドポイント（特にAI生成系: Origin AI draft, journal go-deeper等）が無制限にコール可能。LLM APIコスト攻撃のリスク。

### 測定指標

| 指標 | 現状値 | OWASP推奨 | Vercel推奨 |
|------|--------|-----------|------------|
| CSPヘッダー | なし | 必須 | 推奨 |
| middleware.ts | なし | 認証用に推奨 | 推奨 |
| 汎用レート制限 | なし | 必須 | 推奨 |
| dangerouslySetInnerHTML | 5箇所 | 最小限+サニタイズ | 最小限 |
| 認証チェック方式 | 個別実装(369ルート) | 一元管理 | middleware推奨 |
| APIルート総数 | 369 | N/A | N/A |
| Supabase Auth使用箇所 | 140 | N/A | N/A |

### 改善案

- **[即実行可]** CSPヘッダーを`next.config.js`のheadersセクションまたはmiddleware.tsで設定。最低限`default-src 'self'`から開始。
- **[即実行可]** dangerouslySetInnerHTML 5箇所を特定し、入力がサニタイズされているか確認。DOMPurify等のサニタイザー未使用なら追加。
- **[要判断]** middleware.ts導入。認証ルート保護の一元化。Supabase Auth middleware patternの採用。
- **[要判断]** AI生成系エンドポイントに汎用レート制限追加。Upstash Rate Limit（既にcaching用にUpstash導入済み）の活用。

---

## 10. テスト / 品質保証

### 事実

**テストファイル**: 55個（.test.ts/.test.tsx/.spec.ts/.spec.tsx）。
**E2Eテスト**: Playwright使用。23個のspecファイル（`tests/e2e/`）。テスト対象: anonymous auth, API health, auth redirect, battle, calendar, genome card, home sections, my-style, origin, personal color, presence, rendezvous, stargazer(5 specs)。
**CI/CD**: 2ワークフロー（`.github/workflows/`）。`ci.yml`（lint + unit tests、ubuntu-latest、Node 24、タイムアウト10分）。`expire-orders.yml`（cronジョブ、5分毎）。
**Sentry**: `global-error.tsx`でcaptureException。next.config.jsでwithSentryConfig。
**TypeScript**: `tsconfig.json`で`strict: true`。ただし`next.config.js`で`ignoreBuildErrors: true`。

**CIで実行されるコマンド**: `npm run lint` + `npm run test:unit`。E2Eテストの自動実行はCIに含まれていない。

**比較対象**: Vercel（E2E CI必須、カバレッジゲート）、Stripe（テストカバレッジ90%+）、Linear（E2E + visual regression）。

### 評価

55個のテストファイル / 642,437行 = テストファイル比率0.0085%。これは商用プロダクトとして非常に低い。ただし、E2E 23 specがStargazer(5), Rendezvous(2), Origin(1), Home(2)等の主要フローをカバーしている点は評価できる。

CIがunit testとlintのみで、E2Eを含まない。E2Eが手動実行のみの場合、リグレッションの自動検出ができない。

`ignoreBuildErrors: true` + `strict: true`の組み合わせは矛盾的。strictモードで型エラーを検出する設定だが、ビルド時にそれを無視する。CIの`tsc --noEmit`で補完しているが、ビルド成果物自体に型エラーが含まれる可能性がある。

### 測定指標

| 指標 | 現状値 | Stripe（参考） | Vercel推奨 |
|------|--------|---------------|------------|
| テストファイル数 | 55 | N/A | N/A |
| E2E specファイル数 | 23 | N/A | 主要フロー全カバー |
| CI自動実行テスト | unit + lint | unit + integration + E2E | unit + E2E |
| E2E CI自動実行 | なし | あり | 推奨 |
| TypeScript strict | true | true | true |
| ignoreBuildErrors | true | false | false |
| テストカバレッジ計測 | なし | 90%+ | 推奨 |
| visual regression | なし | N/A | 推奨 |

### 改善案

- **[即実行可]** CIにE2Eテスト実行ステップを追加。Playwright GitHub Actionで最低限smoke testを自動実行。
- **[要判断]** テストカバレッジ計測の導入（istanbul/c8）。全体カバレッジゲートは非現実的だが、新規コードのカバレッジ計測は即可能。
- **[要判断]** `ignoreBuildErrors: true`の解消。OOMの根本原因を調査（incremental compilation設定、メモリ増量、ファイル分割等）。

---

## 11. Rendezvous（マッチング / ソーシャル）

### 事実

**規模**:
- APIルート: 123個（`app/api/rendezvous/`）
- コンポーネント: 27個
- ライブラリ: 138ファイル（`lib/rendezvous/`）
- ページ: 46ファイル（`app/(immersive)/rendezvous/`）
- 管理画面: 2ファイル（`app/(culcept)/admin/rendezvous/`）
- Cronジョブ: 3個（notification-dispatch, candidate-generation, anima-generation）

**マッチングアルゴリズム**: 8種以上のマッチング系モジュール（seasonal, session, narrative phase, living match evolution, temporal, growth edge, similarity-complementarity matrix, partner scoring）。

**リアルタイム機能**: WebRTCシグナリング（`webrtcSignaling.ts`）、リアルタイムチャット（`realtimeChat.ts`）、コンステレーションエンジン（`constellationEngine.ts`）。

**感覚デザイン**: サウンドデザイン（`soundDesign.ts`）、ハプティクス（`haptics.ts`）。

**3枠設計**: 恋愛（スワイプ+L2ゲート）/ つながり（アバター先行+友達/コミュニティ/ビジネス）/ パートナー（独立枠）。

**比較対象**: Tinder（スワイプ、ELOスコア）、Hinge（プロフィール質問、Most Compatible）、Bumble（24h制限、女性先行）、Pairs（日本市場、コミュニティ機能）。

### 評価

123 APIルート + 138 libファイルは、Rendezvous単体でスタンドアロンアプリ級の規模。Aneurasyncの核が「自己理解」であるならば、Rendezvousは「自己理解の応用先」として位置づけられるが、コードベースの比重としてはStargazer(201ファイル)に次ぐ第2の柱。

8種のマッチングアルゴリズムは、ユーザー数が少ない段階（βフェーズ）では全てのアルゴリズムが有効に機能しない。マッチングの質はアルゴリズムの精度よりもプールサイズに依存する。

WebRTC + サウンドデザイン + ハプティクスは、マッチングアプリとしてはリッチだが、「価値仮説検証フェーズ」（CLAUDE.md）にある現段階では、これらの機能が使われるかの検証が先。

### 測定指標

| 指標 | 現状値 | Tinder | Hinge | Pairs |
|------|--------|--------|-------|-------|
| APIルート数 | 123 | N/A | N/A | N/A |
| マッチングアルゴリズム種類 | 8+ | 1(ELO) | 1(ML) | 1(フィルタ) |
| リアルタイム機能 | WebRTC + Chat | Chat | Chat | Chat |
| カテゴリ分類 | 3枠 | 1 | 1 | 1+コミュニティ |
| Cronジョブ数 | 3 | N/A | N/A | N/A |
| 感覚デザイン | サウンド + ハプティクス | ハプティクス | なし | なし |

### 改善案

- **[要判断]** βフェーズでの8種マッチングアルゴリズムの優先順位。プールサイズが小さい段階ではsimilarity-complementarity matrix 1本で十分な可能性。他はプールサイズ閾値到達後に有効化。
- **[要検証]** 123 APIルートのうち、実際にフロントエンドから呼ばれているルートの数を計測。未使用ルートがあれば整理。
- **[要判断]** WebRTC/サウンド/ハプティクスの利用率を計測してから、βフェーズでの維持/凍結を判断。

---

## 12. Origin（ジャーナル / 日記）

### 事実

**規模**:
- ページ: 118ファイル（`app/(culcept)/origin/`）
- メインクライアント: `OriginPageClient.tsx`（75,257バイト）
- コンポーネント: 115ファイル（`_components/`）
- APIルート: 17個（`app/api/origin/`）
- ライブラリ: 95ファイル（`lib/origin/`）

**サブシステム**:
- Memory系: 6コンポーネント（Crystals, GemCard, HandleStep, DiveFlow, Transition, ExplorationFlow）
- Daily Orbit系: 25ファイル（`lib/origin/dailyOrbit/`）
- Life Profile系: 11ファイル（`lib/origin/lifeProfile/`）
- タイムライン系: 5コンポーネント（LifeCalendar, FormationTimeline, ChapterTimeline, EchoTraceView, TimelineNode）
- 分析系: 4コンポーネント（ExcavationModule, FormationChainDisplay, BehavioralLawsPanel, WhyLedgerCards）

**Stargazer連携**: `stargazerPipeline.ts`でOriginデータをStargazer観測にフィード。`rendezvousPipeline.ts`でRendezvousにも連携。

**AI機能**: `ai-draft`（下書きAI生成）、`go-deeper`（深掘り探索）。

**比較対象**: Day One（ジャーナル特化、テンプレート、写真/音声）、Notion日記（自由形式、テンプレート）、Reflectly（AI日記、感情トラッキング）。

### 評価

75,257バイト（約2,000行推定）の単一クライアントコンポーネントは、コード分割の観点で問題。115個のサブコンポーネントがあるにもかかわらず、メインクライアントが巨大なのは、状態管理がトップレベルに集中している可能性。

Memory系(6) + Daily Orbit(25) + Life Profile(11) + タイムライン(5) + 分析(4) = 51個のサブシステムは、ジャーナルアプリとしては異例の深度。Day One（写真+テキスト+位置情報）やReflectly（感情+AI要約）と比較して、「記録」ではなく「構造的自己分析」を志向している。

Stargazer連携（パイプライン）とRendezvous連携は、Originを「孤立した日記」ではなく「観測データの入力チャネル」として位置づける設計。これはAneurasyncの核（自己理解OS）と高い整合性。

### 測定指標

| 指標 | 現状値 | Day One | Reflectly | Notion日記 |
|------|--------|---------|-----------|-----------|
| メインクライアントサイズ | 75,257B | N/A | N/A | N/A |
| サブコンポーネント数 | 115 | N/A | N/A | N/A |
| サブシステム数 | 5（Memory, DailyOrbit, LifeProfile, Timeline, Analysis） | 2 | 2 | 0 |
| AI機能 | 2（draft, go-deeper） | なし | 1（要約） | AI要約 |
| 他機能連携 | 2（Stargazer, Rendezvous） | なし | なし | なし |
| APIルート数 | 17 | N/A | N/A | N/A |

### 改善案

- **[要判断]** `OriginPageClient.tsx`（75,257B）の分割。タブ/セクション単位でコード分割し、動的インポート化。
- **[要検証]** 115コンポーネントのうち、実際にOriginPageClientから直接/間接に参照されているものの数を計測。
- **[即実行可]** Origin → Stargazer パイプラインの動作確認。日記データがStargazerの45軸にどう影響するかの可視化テスト。

---

## 13. EC / マネタイゼーション

### 事実

**Stripe統合**: `lib/stripe.ts`（APIバージョン: 2025-12-15.clover）。Webhookシークレット管理あり。

**ECページ**: 21個。Drops(5) + Shops(11) + Products(1) + Auction(1) + Orders(1) + Checkout(1) + My-drops(1)。

**EC API**: checkout/session, stripe/webhook, external-shop/import, external-shop/copy-to-drop, uploads/drop-images。

**Drops系コンポーネント**: 23ファイル（DropCard, DropsPageWrapper, NewDropForm, DropsFilters, ImageModalGallery, BidBox, BuyButton等）。

**オークション**: 2ファイル（page.tsx + AuctionPageClient.tsx）。

**Cronジョブ**: `expire-orders.yml`（5分毎、注文期限切れ処理）。

**比較対象**: ZOZOTOWN（EC特化、コーデ提案）、Depop（C2Cファッション、ソーシャル）、Grailed（中古ファッション、オークション）。

### 評価

21 ECページ / 145総ページ = 14.5%。コードベースの約1/7がEC機能だが、CEO方針で「マネタイズ設計は後回し」と明記されている。

EC機能（Shops, Drops, Auction）はAneurasyncの核（自己理解OS）との接続が限定的。Calendar/My-StyleはStargazerと連携しているが、Shops/DropsはStargazerの45軸データを活用していない。「あなたの性格に合う服」ではなく「商品一覧」になっている場合、核体験との乖離が大きい。

ただし、「パーソナルカラー × 骨格 × スタイルDNA → おすすめ商品」のパイプラインが存在すれば、核体験との接続は可能。現状のShops管理画面（analytics, insights, fit-color）がこの方向を示唆。

### 測定指標

| 指標 | 現状値 | ZOZOTOWN | Depop |
|------|--------|----------|-------|
| ECページ比率 | 14.5%（21/145） | 100% | 80%+ |
| Stargazerデータ活用 | 未確認（fit-colorページあり） | パーソナルカラー連携 | なし |
| 決済手段 | Stripe | 多数 | Stripe |
| 商品形態 | Drops + Shops + Auction | 在庫販売 | C2C |
| EC用Cronジョブ | 1（expire-orders） | N/A | N/A |
| 管理画面 | analytics, insights, drafts | 充実 | 基本 |

### 改善案

- **[要判断]** CEO方針「マネタイズは後回し」に従い、ECページ21個を凍結（β期間中はナビゲーションから非表示化）するか、核体験との接続を強化するかの二択。
- **[要検証]** `shops/me/products/[id]/fit-color/page.tsx`がStargazerのパーソナルカラーデータを実際に使用しているか確認。使用していれば、これがEC-核体験接続の起点。
- **[要判断]** EC機能を「自己理解の出力先」として再定義する場合の設計方針。例: 「Stargazer観測結果 → あなたに合うDrops」の推薦パイプライン。

---

## 14. アクセシビリティ / 国際化

### 事実

**i18n設定**: next-intl使用。`i18n/request.ts`で設定。ロケールファイル: 2言語（`messages/en.json`, `messages/ja.json`）。ただし、ロケールファイルの内容は限定的（Nav, Match等の一部キーのみ）。UIテキストの大部分はハードコード日本語。

**ARIA属性**: 254箇所。
**role属性**: 99箇所。
**sr-only**: 6箇所。
**フォーカス管理**: 34パターン（autoFocus 11箇所、focus()メソッド呼び出し、FocusTrapコンポーネント1個）。
**キーボードイベント**: 36箇所（onKeyDown/onKeyUp/onKeyPress）。

**比較対象**: Apple Human Interface Guidelines、WCAG 2.1 AA、GOV.UK Design System。

### 評価

ARIA 254 + role 99 = 353個のアクセシビリティ属性は、意識的な対応を示す。ただし、sr-only 6箇所は645,000行のコードベースに対して極めて少ない。スクリーンリーダーユーザーにとって、視覚的に表示される情報の大部分がアクセス不可能。

FocusTrapが1個（genome-card内）のみ存在するが、モーダル/オーバーレイは複数（HomeTour, ValuesOnboardingOverlay, InlineCelebration, PostObservationReveal, GlassModal）あり、全てにフォーカストラップが必要。

i18nは構造（next-intl）は導入されているが、実質日本語のみ。en.jsonの内容が限定的で、UIの95%以上がハードコード日本語。国際化対応とは言えない現状。

### 測定指標

| 指標 | 現状値 | WCAG 2.1 AA要件 | Apple HIG |
|------|--------|-----------------|-----------|
| ARIA属性 | 254 | 全インタラクティブ要素 | 全UI要素 |
| role属性 | 99 | 必要箇所全て | N/A |
| sr-only | 6 | 視覚情報全てに代替 | N/A |
| FocusTrap | 1 | モーダル毎 | モーダル毎 |
| モーダル/オーバーレイ数 | 5+ | N/A | N/A |
| 対応言語 | 2（実質1） | N/A | N/A |
| ハードコードテキスト | UIの95%+ | 0%推奨 | 0%推奨 |
| キーボードナビゲーション | 36箇所 | 全機能 | 全機能 |

### 改善案

- **[即実行可]** 全モーダル/オーバーレイにフォーカストラップを追加。既存のFocusTrapコンポーネントを再利用。
- **[要判断]** sr-only追加の優先順位。Home画面 → Stargazer → Origin の順で、視覚的に表示されるインサイト/数値に代替テキストを追加。
- **[要判断]** i18n方針。日本市場特化であれば、en.jsonは削除してi18n構造自体を外す（メンテナンスコスト削減）。国際化予定があるなら、ハードコードテキストのキー化を計画。
- **[要検証]** WAVE等のアクセシビリティ監査ツールでHome画面を検査し、具体的な違反箇所を特定。

---

## 15. ブランド / コピー / トーン

### 事実

**ブランドアイデンティティ**:
- アプリ名: `APP_NAME = "Aneurasync"`（`lib/constants.ts` line 1）
- タグライン: 「あなたの本質を、観測しつづける。」（`app/layout.tsx` line 42）
- テーマカラー: `#8B5CF6`（紫、`app/layout.tsx` line 59）
- フォント: Noto Sans JP（400-900）+ JetBrains Mono（400,500,700）

**OG/SEO設定**（`app/layout.tsx` lines 39-56）:
- og:title: "Aneurasync"
- og:description: 「あなたの本質を、観測しつづける。」
- og:type: "website"
- PWA対応: manifest.json, apple-mobile-web-app-capable: "yes"

**コピー定数ファイル**: 集約されたコピー定数ファイルなし。各機能に分散:
- Rendezvous: contextualPromptEngine.ts, notificationTemplates.ts, icebreakerTemplates.ts
- Origin: textureMap.ts
- Stargazer: textLocalizer.ts
- Home: SUGGESTION_CHIPS（AneurasyncHome.tsx内にハードコード）

**ドキュメント**: `docs/`に52ファイル（技術文書中心。ブランドガイドラインファイルなし）。

**比較対象**: Headspace（瞑想→穏やかなトーン統一）、Duolingo（学習→遊び心統一）、Notion（生産性→ニュートラル統一）。

### 評価

「あなたの本質を、観測しつづける。」はAneurasyncの核を1文で表現する強いタグライン。紫テーマ（#8B5CF6）+ Noto Sans JP + JetBrains Monoの組み合わせは、「テクノロジー × 内省」の世界観と整合。

ブランドガイドラインが明文化されていない。52個のドキュメントは全て技術文書で、「トーンガイド」「コピー原則」「ビジュアル言語規定」が存在しない。これにより、各機能のUIコピーが統一されたトーンで書かれているか保証できない。

コピーが各機能に分散（5+箇所）しており、トーンの統一管理ができていない。Suggestion chipsの「今日どう動く？」（カジュアル）とタグラインの「あなたの本質を、観測しつづける。」（詩的）にトーンの差がある。

Alterの声の制約（1文目結論14-28文字 + 後半理由）は定義されているが、全UIコピーに適用されるトーンガイドではない。

### 測定指標

| 指標 | 現状値 | Headspace | Duolingo | Notion |
|------|--------|-----------|----------|--------|
| タグライン | あり（1文） | あり | あり | あり |
| ブランドガイドライン文書 | なし | あり | あり | あり |
| トーンガイド | なし（Alterのみ制約あり） | あり | あり | あり |
| コピー集約箇所 | 5+箇所に分散 | 集約 | 集約 | 集約 |
| OG/SEO設定 | 完備 | 完備 | 完備 | 完備 |
| PWA対応 | あり | あり | あり | なし |
| テーマカラー | 1色（#8B5CF6） | 1色 | 1色 | 1色 |
| フォント | 2（和文+モノ） | 2 | カスタム | 2 |

### 改善案

- **[即実行可]** ブランドトーンガイドの策定。「Aneurasyncの声」を定義: 詩的×分析的、温かい×正確、観測者の視点。SUGGESTION_CHIPSやエラーメッセージ等のUIコピーをガイドに沿って見直し。
- **[要判断]** コピー定数の集約。現在5+箇所に分散しているUIテキストを、機能横断のコピーライブラリ（`lib/copy/`等）に整理。
- **[即実行可]** OGイメージの確認。現状`og:image`未設定の場合、SNS共有時にプレビューが表示されない。Aneurasyncブランドのog:imageを設定。

---

## クロスカテゴリ改善マトリクス

### Tier 1: 即実行可（コード変更のみ、ユーザーテスト不要）

| # | カテゴリ | 改善内容 | 影響範囲 |
|---|---------|---------|---------|
| 1 | 6. デザイン | `design-system.tsx`（604行）削除、参照1箇所を移行 | ファイル削減 |
| 2 | 8. パフォーマンス | error.tsx追加（Stargazer/Rendezvous/EC用、3個） | エラーリカバリ向上 |
| 3 | 8. パフォーマンス | remotePatterns `hostname: "**"` をホワイトリスト化 | セキュリティ向上 |
| 4 | 9. セキュリティ | CSPヘッダー設定（`default-src 'self'`から開始） | XSS防御 |
| 5 | 9. セキュリティ | dangerouslySetInnerHTML 5箇所のサニタイズ確認 | XSS防御 |
| 6 | 10. テスト | CIにE2Eテスト（Playwright smoke）追加 | リグレッション防止 |
| 7 | 14. a11y | 全モーダル/オーバーレイにFocusTrap追加 | アクセシビリティ |
| 8 | 15. ブランド | OGイメージ設定 | SNS共有体験 |
| 9 | 6. デザイン | 未使用@keyframesの特定・削除 | CSS軽量化 |
| 10 | 7. ナビ | MAIN_NAV/HOME_QUICK_NAVのラベル統一 | 認知負荷低減 |

### Tier 2: 要検証（データ計測・ユーザーテスト後に判断）

| # | カテゴリ | 検証内容 | 検証方法 |
|---|---------|---------|---------|
| 1 | 1. Home | 初回ユーザー（観測0）のHome画面レンダリング内容 | テストアカウントで実画面確認 |
| 2 | 2. Alter | β日次利用回数の分布（5回上限の妥当性） | analytics集計 |
| 3 | 5. オンボ | HomeTourステップ別完了率 | イベント計測追加 |
| 4 | 4. パーソナ | ContextReel表示スロット数のストリーク別分布 | デバッグモードで確認 |
| 5 | 7. ナビ | 145ページの2クリック到達率 | ナビゲーションツリー分析 |
| 6 | 11. Rendezvous | 123 APIルートのフロントエンド参照率 | grep集計 |
| 7 | 12. Origin | 115コンポーネントの実参照率 | 依存分析 |
| 8 | 13. EC | fit-colorページのStargazerデータ活用有無 | コード読解 |
| 9 | 14. a11y | WAVE監査でのHome画面違反箇所数 | ツール実行 |

### Tier 3: 要判断（CEO方針・設計思想に関わる）

| # | カテゴリ | 判断事項 | 判断基準 |
|---|---------|---------|---------|
| 1 | 2. Alter | 会話履歴DB永続化 vs 意図的非永続 | 「毎回フレッシュ」が核体験に必要か |
| 2 | 3. Stargazer | ストリーク「アンロック」と「No identity locks」原則の整合 | UIコピーの表現次第 |
| 3 | 5. オンボ | 初回Aha Momentの前倒し（3日→初回セッション） | 暫定アーキタイプ表示の精度リスク |
| 4 | 8. パフォーマンス | middleware.ts導入（認証一元化） | 369ルートの認証リファクタ規模 |
| 5 | 9. セキュリティ | AI生成系API汎用レート制限 | LLMコスト vs ユーザー体験 |
| 6 | 11. Rendezvous | βフェーズでの8種アルゴリズム優先順位 | プールサイズ閾値 |
| 7 | 13. EC | EC 21ページの凍結 vs 核体験接続強化 | CEO方針「マネタイズ後回し」との整合 |
| 8 | 14. a11y | i18n方針（日本特化 vs 国際化準備） | 市場戦略 |
| 9 | 15. ブランド | UIコピー集約方針 | 開発速度 vs トーン統一 |
| 10 | 10. テスト | ignoreBuildErrors解消の優先度 | OOM根本解決のコスト |

---

## 4層変化サマリー

### Layer 1: 体験の変化

| 変化 | 現状 | 目標 | 影響カテゴリ |
|------|------|------|-------------|
| 初回Aha Momentの前倒し | 3日後（observer到達） | 初回セッション内 | 5, 3, 4 |
| オンボーディング軽量化 | 10ステップ | 5-6ステップ | 5 |
| 会話の記憶/継続性 | リロードで消失 | 判断必要（永続 or 意図的リセット明示） | 2 |
| エラーリカバリ文脈化 | 全画面共通1個 | 機能別3-4個 | 8 |
| Home情報密度最適化 | 9レイヤー、6CTA | ストリークレベルに応じた段階的開示 | 1, 4 |

### Layer 2: 構造の変化

| 変化 | 現状 | 目標 | 影響カテゴリ |
|------|------|------|-------------|
| デザインシステム統一 | 2システム共存（223:1） | 1システム | 6 |
| ナビゲーション整理 | 4セット17項目 | ラベル統一、深層ページにパンくず | 7 |
| EC-核体験接続 | 分離（14.5%のページが孤立） | Stargazerデータ活用推薦 or 凍結 | 13, 3, 4 |
| Alterルートファイル分割 | 4,123行1ファイル | Phase別モジュール | 2 |
| Originクライアント分割 | 75,257B 1ファイル | タブ/セクション別動的インポート | 12 |
| 認証一元化 | 369ルート個別実装 | middleware.ts | 8, 9 |

### Layer 3: 技術基盤の変化

| 変化 | 現状 | 目標 | 影響カテゴリ |
|------|------|------|-------------|
| CSPヘッダー追加 | なし | `default-src 'self'`以上 | 9 |
| 画像ホスト制限 | `**`（全許可） | ホワイトリスト | 8, 9 |
| E2E CI自動化 | 手動のみ | Playwright smoke on PR | 10 |
| AI APIレート制限 | Alterのみ(5回/日) | 全AI生成系エンドポイント | 9 |
| インラインスタイル削減 | 8,524箇所 | 新規コード0原則 + 主要ページ段階的移行 | 6 |
| FocusTrap全モーダル | 1箇所 | 5+箇所 | 14 |

### Layer 4: ブランド / コピーの変化

| 変化 | 現状 | 目標 | 影響カテゴリ |
|------|------|------|-------------|
| トーンガイド策定 | なし（Alter制約のみ） | 全UI適用のトーンガイド | 15 |
| UIコピー集約 | 5+箇所に分散 | 集約ライブラリ | 15 |
| OGイメージ設定 | 未確認 | ブランドOG画像 | 15 |
| i18n方針決定 | 2言語（実質1） | 日本特化決定 or 国際化ロードマップ | 14 |
| ストリーク表現見直し | 「アンロック」的 | 「精度向上」的（No identity locks整合） | 3, 15 |

---

## 総括

Aneurasyncは「自己理解OS」として、消費者向け性格診断の深度（45軸ベイズ × 矛盾検出 × IRT適応）で前例のないエンジンを構築している。Stargazer(201ファイル) → Alter(判断エンジン) → Origin(行動記録) → Rendezvous(関係性応用) のデータパイプラインは、単なるチャットボットやMBTI的診断とは根本的に異なるアーキテクチャ。

一方で、そのエンジンの深さがユーザー体験の表層に十分に反映されていない。初回Aha Momentまで3日、オンボーディング10ステップ、会話非永続、エラー画面1種。エンジンの精緻さとUX表層の間にギャップがある。

優先順位の提案:
1. **即効性**: Tier 1の10項目（セキュリティ・品質基盤の底上げ）
2. **体験改善**: 初回Aha Momentの前倒し + オンボーディング軽量化（ユーザー獲得の成否に直結）
3. **構造整理**: デザインシステム統一 + Alter/Originファイル分割（開発効率の基盤）
4. **CEO判断**: EC方針 + 会話永続化 + i18n方針（事業戦略に依存）
