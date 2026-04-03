# Genome Card 改善パック

## この機能を改善させるための依頼文

```
以下はAneurasyncのGenome Card機能に関する独立監査パックです。
- この機能だけを対象にしてください
- 他機能との依存は考慮してください（Stargazerのアーキタイプ、Presence、Rendezvous等）
- 全問題点を洗い出してください
- 全改善案を出してください
- 必ず反証してください
- 無難な改善ではなく、世界トップを超える案まで出してください
- 対象: app/(culcept)/genome-card/(21ファイル), app/api/genome-card/(5ルート), components/genome/(4ファイル)
```

---

## 1. この機能の役割

Stargazerの観測データ（性格アーキタイプ+レーダースコア）をカード化し、友達同士で交換・比較できる機能。「パーソナルカラー + 性格 + スタイルDNA + 価値観」を1枚のカードに凝縮する。Genome Cardの交換が「相互理解のきっかけ」となり、Rendezvousでのカード閲覧やトーク（DM）機能へ接続する。

バイラル設計の観点では、SNS共有→新規ユーザー獲得の導線として機能する。価値仮説検証フェーズにおいて「Genome Card拡散+課金成立性」が検証対象の1つ。

---

## 2. 現状の事実

### ページ構成
- **ファイル数**: 21（メインpage+GenomeCardClient.tsx 803行、[userId]カード閲覧、exchange交換、connect接続、share共有、loading）
- **サブページ**: [userId]（他ユーザーカード閲覧）、exchange（交換管理）、connect（接続リクエスト）、share/[shareId]（共有リンク閲覧）

### コンポーネント
- **ローカルコンポーネント**: _components/12個
  - ArchetypeEmblem — アーキタイプアイコン
  - CardErrorBoundary — エラーハンドリング
  - CompareRadar — レーダーチャート比較
  - ConnectionEstablishedModal — 接続完了モーダル
  - FocusTrap — アクセシビリティ
  - GenomeCardLiving — ライブカード表示
  - GenomeCardVisual — カードビジュアル
  - SendRequestModal — 交換リクエスト送信
  - ShareMyCardModal — カード共有モーダル
  - VisibilityControl — 可視性制御
- **グローバルコンポーネント**: components/genome/4個
  - FriendCompatibilityReport — 友達互換性レポート
  - GenomeBackground — 背景デザイン
  - GenomeCardShare — 共有用カード
  - HairAnalysisPanel — 髪分析パネル

### APIルート
- 5個: main（カードデータ取得）, [userId]（他ユーザーカード）, exchange（交換管理）, preview（プレビュー生成）, share（共有リンク生成）

### 表示データ
- archetypeCode, archetypeName, archetypeEmoji
- レーダースコア: analytical / cautious / social / expressive / independent（5軸）
- completeness% — 観測完了度
- observationCount — 観測回数

### 交換システム
- GenomeConnection（status: pending / accepted / declined）
- Request → Accept / Decline フロー
- 可視性制御: VisibilityControl.tsxでカード情報の公開範囲設定

### 残件
- completeness stale解消済み（監査バックログクローズ）

---

## 3. 世界トップ比較

| サービス | カード/プロフィール設計 | 交換/共有 | 比較機能 | バイラル性 |
|----------|----------------------|----------|---------|-----------|
| **Pokemon TCG** | レア度+ステータス+アート | トレード（対面/オンライン） | バトル | コレクション欲 |
| **Spotify Blend** | 2人の音楽嗜好マッチ% | 自動（リンク招待） | Blend%+共有プレイリスト | SNSシェア |
| **16Personalities (MBTI)** | 4文字タイプ+説明 | スクショ共有 | なし | SNSバイラル（タイプ自慢） |
| **LinkedIn Profile** | スキル+推薦+実績 | プロフィールURL共有 | なし | プロフェッショナル文脈 |
| **Aura (写真評価)** | 写真+オーラカラー | 自動生成+共有 | なし | TikTokバイラル |

---

## 4. 測定指標

| 指標 | Aneurasync | Spotify Blend | 16Personalities | Aura |
|------|-----------|--------------|----------------|------|
| カードデータ項目 | 6（archetype, emoji, radar5, completeness, obsCount） | 音楽嗜好% | 4文字タイプ+説明 | オーラカラー |
| 交換フロー | Request/Accept/Decline | 自動（リンク） | なし | なし |
| 比較機能 | レーダーチャート+互換性レポート | Blend%+プレイリスト | なし | なし |
| 可視性制御 | あり（粒度設定） | なし | なし | なし |
| コンポーネント数 | 16（12ローカル+4グローバル） | N/A | N/A | N/A |
| SNS共有 | ShareMyCardModal | あり | スクショ | TikTok最適化 |
| OGイメージ | 未確認 | あり | あり | あり |

---

## 5. 全問題点

1. **カード表示データが6項目のみ**。Stargazer 45軸の情報が大幅に圧縮されている。5軸レーダー（analytical/cautious/social/expressive/independent）はStargazer 45軸のごく一部
2. **交換システムがRequest/Accept型で摩擦が大きい**。Spotify Blendのような「リンクを送るだけで即座に比較開始」に比べ、承認待ちの時間ロスがある
3. **completeness%の算出ロジックの透明性不足**。何をすれば100%に近づくかユーザーに不明。「あと何をすればいい？」に答えられない
4. **FriendCompatibilityReportの内容がRendezvousのマッチングスコアとどう違うか不明**。同じStargazerデータから2つの異なる「相性」が出ると混乱する
5. **SNS共有時のOGイメージが動的に生成されるか未確認**。genome-cardディレクトリにopengraph-image.tsxが存在するか不明。静的OGイメージだとカード内容が反映されない
6. **803行のメインクライアントに交換/接続/共有の3フローが混在**。各フローの状態管理が複雑化している可能性
7. **HairAnalysisPanelがgenomeグローバルコンポーネントに存在**する理由が不明瞭。髪分析はPhenotype領域の機能
8. **レーダーチャートの5軸名称（analytical/cautious/social/expressive/independent）がユーザーに分かりやすいか未検証**。英語名称が日本語UIと不整合
9. **交換されたカードの「鮮度」管理**。Stargazer観測データが更新されても交換済みカードが古いデータのままの可能性
10. **カード交換→Rendezvous/トークへの遷移率が未計測**。導線が機能しているか不明

---

## 6. 全改善案

**A. カードデータ拡充**
45軸のうちトップ3特徴的軸（最もスコアが高い/低い軸）を「あなたの特徴」として表示。デフォルト6項目+タップで展開する追加情報

**B. 即時シェア強化**
Request/Acceptに加え、「シェアリンク」で即座にカードを見せる軽量共有パス。share/[shareId]の既存機能を強化し、閲覧者が自分のカードも自動生成→比較へ誘導

**C. completeness%の内訳表示**
各領域の完了度と「次のアクション」を明示。「Stargazerであと5問回答すると+10%」のようなガイダンス

**D. OGイメージの動的生成**
Next.js App RouterのImageResponse APIを使い、ユーザーのarchetypeEmoji+archetypeName+レーダーチャートを動的OGイメージとして生成

**E. バイラル設計: SNS共有最適化**
共有時に「あなたのGenome Cardを作ろう」CTA付きランディングページ。共有→閲覧→登録→自分のカード生成の導線

**F. FriendCompatibilityReport vs Rendezvousスコアの棲み分け定義**
Genome Card: 「友達としての相性」（共通点+会話のきっかけ）。Rendezvous: 「関係性の可能性」（深層マッチ）。明確にラベル分け

**G. レーダー軸名称の日本語化**
analytical→分析的, cautious→慎重, social→社交的, expressive→表現的, independent→独立的

**H. カード鮮度管理**
交換済みカードに「最終更新日」表示。Stargazerデータ更新時にカードも自動更新。「前回からの変化」バッジ

**I. 交換→アクション遷移計測**
カード交換後の行動追跡: トーク開始率、Rendezvous閲覧率、再訪問率

---

## 7. 改善案への反証

**A反証**: 45軸の情報は複雑すぎる。6項目に圧縮しているのは意図的なシンプルさ。情報過多はカードの「見せたい」欲求を下げる

**B反証**: share/[shareId]で即時閲覧は既に実装済みの可能性が高い。改善不要

**D反証**: opengraph-image.tsxが既に存在する可能性（genome-cardディレクトリ内に未確認）。二重実装リスク

**E反証**: βフェーズでバイラル設計は時期尚早。「今はやらないこと: 大規模マーケティング」に該当

**G反証**: 英語名称はデザイン上の意図（グローバル感、Aneurasyncの世界観）。日本語化は世界観を損なう

**H反証**: カード鮮度の自動更新は交換相手への通知が必要。「監視されている感」のリスク

---

## 8. 反証後の再修正

**A再修正**: 6項目はデフォルト表示のまま維持。「もっと見る」で追加3軸を展開。情報階層を分けることでシンプルさと深さを両立

**B再修正**: share機能の現状確認。即時閲覧可能なら改善対象から除外

**D再修正**: OGイメージの実装状況を確認（genome-card配下にopengraph-image.tsx不在なら追加）。存在する場合は内容の品質確認

**E再修正**: 大規模マーケティングではなく「知人間の自然なシェア」を支援する設計に限定。CTA付きLPは不要。カード自体の美しさでシェア欲求を喚起

**G再修正**: 英語名称はカード上に維持。ただし初回表示時のツールチップで日本語説明を追加

**H再修正**: 自動更新ではなく「更新ボタン」で手動更新。交換相手には「カードが更新されました」の通知（遅延通知原則に従い3h以上遅延）

---

## 9. 確定改善

1. **completeness%の内訳表示追加** — ユーザーに「次のアクション」を明示。「Stargazerであと○問で+○%」形式
2. **SNS共有時のOGイメージ実装状況確認** — 不在なら動的OGイメージ生成を追加。存在するなら品質レビュー
3. **レーダー軸の日本語ツールチップ追加** — 英語名称はデザイン維持、初回表示時に日本語説明をオーバーレイ

---

## 10. 要検証改善

1. **カード交換の利用率** — βテスター間での交換リクエスト数/承認率
2. **share/[shareId]の閲覧数** — 共有リンク経由のカード閲覧UU
3. **FriendCompatibilityReportの利用率** — レポート表示回数/表示後のアクション
4. **OGイメージの現状** — genome-card/opengraph-image.tsxの有無と品質
5. **交換後のアクション遷移率** — トーク開始/Rendezvous閲覧/再訪問

---

## 11. 要判断改善（CEO判断）

1. **カードデータの拡充タイミング** — 45軸の追加表示をいつ実装するか
2. **バイラル設計の開始時期** — 「少人数の初期検証ユーザー獲得」の手段としてGenome Cardシェアを使うか
3. **FriendCompatibilityReport vs Rendezvousスコアの棲み分け** — ユーザーに見せる「相性」の統一/分離方針
4. **カード鮮度管理の方針** — 自動更新 vs 手動更新 vs 更新なし（スナップショット保持）

---

## 12. 修正時の副作用 / 依存関係

| 改善項目 | 副作用・依存 |
|----------|-------------|
| completeness内訳 | Stargazer profile APIの応答拡張が必要。各機能の「完了条件」定義が前提。MyPage Identity Progressとの整合性確認 |
| OGイメージ | Vercelのビルド設定確認（OG画像生成のメモリ制限: Edge Runtime 128MB、処理時間制限）。@vercel/ogパッケージの依存追加 |
| データ拡充 | GenomeCardVisual.tsxの表示ロジック変更。CompareRadar.tsxの軸追加対応。カードサイズ/レイアウト変更 |
| 日本語ツールチップ | GenomeCardVisual.tsxにツールチップUI追加。初回表示フラグのlocalStorage管理 |
| 鮮度管理 | GenomeConnection テーブルにlast_updated_at追加（DB migration必要、CEO承認） |

---

## 13. 削るもの / 残すもの / 強化するもの / 統合するもの

### 削る
- なし（21ファイルは機能に対して適切な規模）

### 残す
- Request/Accept交換フロー（信頼性の高い接続を保証）
- 可視性制御（プライバシー保護）
- 5軸レーダーチャート比較
- FriendCompatibilityReport

### 強化
- completeness%の透明化（内訳+次のアクション表示）
- SNS共有体験（OGイメージ品質向上）
- レーダー軸の理解容易性（日本語ツールチップ）
- 交換後のアクション遷移計測

### 統合
- なし（Genome Cardは独立した交換体験として維持）

---

## 14. この機能が世界トップを超えるための最終条件

Spotify Blendの「2人のマッチ%」がバイラルするのは「共有→比較→会話」のループが自然に回るからである。16Personalitiesの「私はINFJ」がSNSで拡散するのは「自分を4文字で表現できる快感」があるからである。

Aneurasyncが超えるための条件は3つ。

**条件1: カードが「見せたくなる」美しさ**
GenomeCardVisualのデザイン品質がSNS映えするレベルであること。アーキタイプ+レーダーチャート+パーソナルカラーの組み合わせが「自分だけの美しいカード」として所有欲を喚起する。16PersonalitiesのタイプカードやAuraのオーラカラーと同等以上のビジュアルインパクト。

**条件2: 比較が「会話のきっかけ」になる具体性**
「あなたはanalytical 85%、相手は35%」だけでなく「ここが面白い: あなたは分析で判断する人、相手は直感で判断する人→議論すると新しい視点が生まれやすい」のように、比較結果が会話を生む内容であること。Spotify Blendの「共有プレイリスト」に相当する「共有テーマ」を提供する。

**条件3: 交換→Rendezvousへの自然な導線**
Genome Cardが「自己表現の出力」であると同時に「関係構築の入口」であること。カード交換した相手とのRendezvousマッチングスコアが自然に表示され、「もっと深く知りたい」という欲求を喚起する。交換がゴールではなく、関係性の始まりとして設計されていること。
