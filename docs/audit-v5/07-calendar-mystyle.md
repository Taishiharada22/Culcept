# Calendar / My-Style 改善パック

## この機能を改善させるための依頼文

```
以下はAneurasyncのCalendar/My-Style機能に関する独立監査パックです。
- この機能だけを対象にしてください
- 他機能との依存は考慮してください（Stargazer連携、lib/shared/の共有データ層、Home画面のContextReel等）
- 全問題点を洗い出してください
- 全改善案を出してください
- 必ず反証してください
- 無難な改善ではなく、世界トップを超える案まで出してください
- 対象: app/(culcept)/calendar/(49ファイル), app/(immersive)/my-style/(87ファイル), app/api/calendar/(9ルート), app/api/my-style/(6ルート), lib/shared/(6ファイル)
```

---

## 1. この機能の役割

**Calendar**: 天気×気分×予定からAIコーデ提案を行う日常導線。毎朝開いて「今日何を着るか」をAIが提案する。天気データ+Stargazer観測データ（mood, stress, energy, socialReadiness）を組み合わせ、パーソナルカラーや体型に適合したコーディネートを生成する。

**My-Style**: スタイルDNA・美意識の構造可視化。ユーザーのファッション嗜好を多軸で分析し、スタイルプロフィールとして構造化する。サブページ4個（diagnosis, resonance, bridge, body-profile）で深い分析を提供。

**両機能の関係**: lib/shared/（wardrobe, wearEvents, styleProfile, location, deepDrill, timeOfDay）の6ファイルで共有データ層を持つ。「服を選ぶ」行為を「自己理解の出力」として設計し、Stargazerの内面分析と外見の選択が循環するフィードバックループを目指す。

---

## 2. 現状の事実

### Calendar
- **ファイル数**: 49（コンポーネント23 + ライブラリ26）
- **メインクライアント**: 1,287行
- **APIルート**: 9個（day, events, generate, history, month, outfits, regenerate, weather-check, weather）
- **天気連動**: JMA office code + 座標ベースの天気取得
- **Stargazer連携**: aneurasyncIntegration.ts（ObservationContext: moodLevel, stressLevel, energyLevel, socialReadiness, decisionStyle）

### My-Style
- **ファイル数**: 87（コンポーネント47 + ライブラリ40）
- **APIルート**: 6個（ai-insight, body-profile, bridge, diagnosis/feedback, diagnosis, resonance）
- **サブページ**: 4個
- **スワイプUX**: framer-motion drag + AnimatePresenceによるスタイル嗜好学習

### 共有データ層（lib/shared/）
- `location.ts` — 居住地（都道府県→JMA office code + 座標）
- `wardrobe.ts` — ワードローブ正本（型 + リポジトリ）
- `wearEvents.ts` — 着用履歴正本（Calendar + My-Style マージ）
- `styleProfile.ts` — スタイルプロフィール正本
- `deepDrill.ts` — 深掘り分析
- `timeOfDay.ts` — 時間帯コンテキスト
- **設計原則**: shared = 正本のみ、UIロジック禁止（2026-04-02 CEO承認）

### 残件状況
- mood永続化・wardrobe bridge化 完了
- Origin signals cron CEO判断待ち
- swipe learning sync CEO判断待ち
- UI凍結（3タブFV再設計確定 3/30以降変更禁止）

---

## 3. 世界トップ比較

| サービス | 特徴 | AIコーデ | データソース | 収益モデル |
|----------|------|---------|-------------|------------|
| **ZOZOTOWN** | パーソナルカラー×体型→コーデ提案 | あり（購入直結） | 購買履歴+ZOZOSUIT体型 | EC販売 |
| **WEAR** | コーデ投稿SNS、天気連動コーデ | なし（UGC） | 投稿+気温 | 広告+ZOZO連携 |
| **Acloset** | デジタルワードローブ管理 | なし | 手動登録+着用記録 | サブスクリプション |
| **Cladwell** | 毎朝のAIコーデ提案 | あり | ワードローブ+天気 | サブスクリプション |
| **Stitch Fix** | AIスタイリング+人間スタイリスト | あり（専属） | プロフィール+購買+フィードバック | 商品販売 |

---

## 4. 測定指標

| 指標 | Aneurasync Calendar | Aneurasync My-Style | ZOZOTOWN | Cladwell | Acloset |
|------|---------------------|---------------------|----------|----------|---------|
| ファイル数 | 49 | 87 | N/A | N/A | N/A |
| APIルート | 9 | 6 | N/A | N/A | N/A |
| 共有データ層 | 6ファイル（lib/shared/） | 同左 | なし | なし | なし |
| Stargazer連携 | あり（5軸） | あり（styleProfile経由） | なし | なし | なし |
| 天気連動 | あり（JMA） | なし | あり | あり | なし |
| AIコーデ生成 | あり | AI Insight | 限定的 | あり | なし |
| ワードローブ管理 | あり（shared） | あり（shared） | なし | あり | あり |
| コーデカレンダー | あり | なし | なし | なし | あり |
| 内面データ連携 | mood/stress/energy/socialReadiness | スタイルDNA | なし | なし | なし |

---

## 5. 全問題点

1. **Calendar(49)+My-Style(87)=136ファイルの総規模**。スタイル系だけでOrigin(118ファイル)に匹敵。Aneurasyncのコア体験（自己理解）に対するファッション機能の比重が大きい
2. **共有データ層（lib/shared/）6ファイルのテスト不在の可能性**。両機能の整合性を保つ責任を負うが、型安全性・データ一貫性のテストがあるか未確認
3. **Stargazer連携（mood/stress/energy/socialReadiness）がコーデ提案にどの程度影響するか定量的に不明**。連携あり/なしでの提案差分が計測されていない
4. **My-Styleの87ファイルに対してAPIルート6個**。UIの複雑さ（47コンポーネント）に対してデータAPIが限定的。フロントエンドにビジネスロジックが偏在している可能性
5. **CalendarとMy-Styleの境界がユーザーに不明瞭**。bridgeルートで連携しているが、2機能に分かれている理由がユーザー目線で不明。ナビゲーション上「Calendar」と「Style」が別項目
6. **Calendar メインクライアント1,287行**は分割候補。日/月表示、天気、コーデ生成、イベント管理が1ファイルに混在している可能性
7. **天気データ取得（weather, weather-check）の外部API依存**。JMA APIの可用性・レート制限・応答遅延が未計測
8. **swipe learningのStargazerへの同期がCEO判断待ち**。スワイプ嗜好データが孤立している
9. **Origin signals cronがCEO判断待ち**。Calendar→Originのデータフローが未接続
10. **My-Styleのスワイプ学習精度**。何回スワイプすればスタイルDNA精度が安定するか閾値未定義

---

## 6. 全改善案

**A. 共有データ層のテスト追加**
wardrobe, wearEvents, styleProfileの型安全性テスト。正本データの整合性を保証する最低限のユニットテスト

**B. Stargazer連携の影響度計測**
mood/stressなしとありでのコーデ提案差分を10件サンプリングして比較。「性格データがコーデを変える」ことの定量証明

**C. Calendar←→My-Style双方向導線強化**
Calendarから「この服のスタイル分析を見る」リンク。My-Styleから「このアイテムを明日着る」ボタン。既存bridgeルート活用

**D. My-Style 87ファイルの依存マップ作成**
importグラフを自動生成し、未参照コンポーネント・過度な依存チェーンを特定

**E. 天気APIキャッシュ最適化**
同一日・同一地域の天気は1回取得でキャッシュ。staleTime確認。エラー時のフォールバック（前日データ使用）

**F. Calendar メインクライアント分割**
1,287行を日表示/月表示/コーデ生成/イベント管理の4コンポーネントに分割

**G. スワイプ学習精度閾値の定義**
My-Styleで何回スワイプすればスタイルDNA推定精度がN%安定するか実験。「あと○回スワイプで精度UP」のUI表示

**H. 着用フィードバックループ**
Calendar提案→着用→「今日の服どうだった？」フィードバック→次回提案改善。着用後の満足度をStargazer stateデータとして記録

**I. 季節性スタイル変化の可視化**
My-Styleに「春/夏/秋/冬のあなたのスタイル傾向」ビュー追加。着用履歴の季節集計

---

## 7. 改善案への反証

**A反証**: 共有データ層は安定動作中。テスト追加はコスト。CEO承認済みの設計を追加テストで保護する必要性が低い

**B反証**: 10件サンプリングは統計的に不十分。またβフェーズでStargazer観測データが揃っているユーザーが少ない

**C反証**: 双方向導線はナビゲーション複雑化のリスク。CalendarとMy-Styleを行き来させるのは体験として煩雑

**E反証**: 天気APIは既にReact Queryでキャッシュされている可能性が高い。二重最適化

**F反証**: 1,287行は分割するほど巨大ではない。分割はファイル数増加とprops drilling増大のトレード

**G反証**: スワイプ精度閾値はMy-Styleの核心だが、swipe learning自体がCEO判断待ち

**H反証**: 着用フィードバックは「毎日の面倒」。ユーザーに負担を強いる

**I反証**: βフェーズで季節データは1シーズン分しかない。季節比較は時期尚早

---

## 8. 反証後の再修正

**A再修正**: テスト追加は「保険」。安定動作中でも共有データ層が壊れると両機能が同時に壊れるため、最低限のスモークテストは正当化できる

**B再修正**: 統計的厳密性ではなく「差分があるか/ないか」の定性確認。5件でも差分の有無は分かる

**C再修正**: 双方向リンクではなく「コンテキストカード」で関連情報を表示。Calendar画面に「この服のスタイルDNA: ○○」バッジ表示。My-Styleに「次のCalendar予定: 明日○○」バッジ表示

**E再修正**: キャッシュ実態をReact Query設定で確認。staleTimeが適切（1時間以上）なら改善不要

**F再修正**: 分割は必須ではないが、メインクライアントのセクション構造をコメントで明示

**H再修正**: フィードバックは任意。「今日の服は？」通知を夕方に1回。回答しなくてもペナルティなし

---

## 9. 確定改善

1. **共有データ層（lib/shared/）のスモークテスト追加** — wardrobe, wearEvents, styleProfileの基本操作テスト。型安全性の保証
2. **Calendar→My-Styleコンテキスト表示** — Calendar画面に「この服のスタイルDNA」バッジ。既存bridgeルート活用。新規実装は最小限
3. **天気APIキャッシュ実態確認** — React QueryのstaleTime設定を確認し、必要に応じて最適化

---

## 10. 要検証改善

1. **Stargazer連携の影響度** — mood/stress有無でのコーデ差分を5件定性比較
2. **My-Style 87ファイルの実参照率** — importグラフ自動生成で未参照コンポーネント特定
3. **Calendar メインクライアント1,287行の構造** — セクション構成と分割の費用対効果
4. **スワイプ学習の精度収束** — swipe learning sync CEO判断後に実施
5. **JMA APIの応答時間・エラー率** — 1週間のモニタリング

---

## 11. 要判断改善（CEO判断）

1. **CalendarとMy-Styleの統合/分離方針** — 2機能を維持するか、「スタイル」として統合するか
2. **My-Style規模の妥当性** — 87ファイル（Aneurasync全体の約5%）はコア体験（自己理解）に対して適切か
3. **swipe learning syncの実行方針** — CEO判断待ち案件の進退
4. **Origin signals cronの実行方針** — CEO判断待ち案件の進退
5. **着用フィードバック機能の優先度** — 「毎日の面倒」vs「フィードバックループの完成」

---

## 12. 修正時の副作用 / 依存関係

| 改善項目 | 副作用・依存 |
|----------|-------------|
| 共有データ層テスト | テストフレームワーク（vitest/jest）の設定確認。lib/shared/はshared=正本のみ原則のため、テストもデータ操作のみ |
| コンテキスト表示 | lib/navigation.tsのHOME_QUICK_NAV「コーデ」リンク先確認。Calendar→My-Styleの遷移パス |
| Stargazer連携変更 | aneurasyncIntegration.tsの修正がCalendar全体のコーデ生成に影響 |
| 天気APIキャッシュ | weather-check APIの呼び出し元確認。キャッシュ無効化のタイミング（天気急変時） |
| My-Style分割 | 87ファイルの依存グラフ変更。import pathの大量変更リスク |

---

## 13. 削るもの / 残すもの / 強化するもの / 統合するもの

### 削る
- My-Style未参照コンポーネント（依存マップ作成後に特定）
- 重複するスタイル分析ロジック（shared正本とローカルコピーの二重管理があれば）

### 残す
- 共有データ層設計（CEO承認済み）
- 天気連動コーデ提案
- Stargazer連携（5軸ObservationContext）
- My-Styleスワイプ学習UX
- 3タブFV構成（UI凍結済み）

### 強化
- Calendar←→My-Styleのコンテキスト接続
- 共有データ層のテスト基盤
- コーデ提案に対するStargazerデータの影響度可視化

### 統合
- 検討のみ（CalendarとMy-Styleの境界再定義はCEO判断）

---

## 14. この機能が世界トップを超えるための最終条件

Cladwell/Aclosetは「ワードローブ管理+天気連動コーデ提案」。ZOZOTOWN/Stitch Fixは「購買直結AIスタイリング」。Aneurasyncが全てを超えるための条件は3つ。

**条件1: Stargazerの性格データが「今日の気分に合う服」ではなく「今日の判断パターンに合う服」を提案すること**
mood/stressは「気分」に過ぎない。Aneurasyncの45軸データが持つ独自性は「判断傾向」（cautious/expressive/analytical等）にある。「今日はプレゼンがあり、あなたはanalytical傾向が強いので、知的な印象の組み合わせ」という提案は他社にできない。

**条件2: 着用記録が逆にStargazerの精度を上げるフィードバックループの実現**
「この服を選んだ日は社交的な予定が多かった」→「socialReadinessが高い日はこの系統を選ぶ傾向」→ Stargazerの行動パターン精度向上。服の選択が内面理解のシグナルになる。

**条件3: 「服を選ぶ」が「自分を理解する」行為になること**
ユーザーが「今日なぜこの服を選んだのか」を振り返った時、自分の判断傾向に気づく。Calendar/My-Styleが単なるファッションツールではなく、Aneurasyncの「第二の自己」体験の一部として機能すること。これは設計思想としては既に確立されているが、ユーザーが実際にそう感じるかはβ検証で確認が必要。
