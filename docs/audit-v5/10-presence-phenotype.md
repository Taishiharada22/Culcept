# Presence / Phenotype / 外見分析系 改善パック

## この機能を改善させるための依頼文

```
以下はAneurasyncのPresence/Phenotype/外見分析系機能に関する独立監査パックです。
- この機能だけを対象にしてください
- 他機能との依存は考慮してください（Stargazer、Genome Card、Calendar、Rendezvous等）
- 全問題点を洗い出してください
- 全改善案を出してください
- 必ず反証してください
- 無難な改善ではなく、世界トップを超える案まで出してください
- 対象: app/(culcept)/sns/profile/(33ファイル), app/(culcept)/body-color/(16ファイル), app/api/body-color/(6ルート), app/api/eye-profile/, app/api/aneurasync/face-phenotype/, app/api/aneurasync/hair-phenotype/
```

---

## 1. この機能の役割

**Presence**: ユーザーの内面（Stargazer観測データ）を可視化する「人物ミラー」。5タブ構成で、性格の深層/変化/対人関係/鏡像/自己認識を多角的に表示する。Aneurasyncの「第二の自己」体験の可視化レイヤー。

**Phenotype/外見分析**: 顔型・目・眉・鼻・口・印象・髪・体を多軸で分析する。パーソナルカラー診断を含む。分析結果はGenome Card（表示）、Calendar（コーデ提案のoutfitDna）、Rendezvous（faceTypeClassifier）に連携し、外見データが内面分析と統合される設計。

**2機能の関係**: Presenceは「内面の可視化」、Phenotypeは「外見の構造化」。両者がStargazerの45軸モデルと統合されることで「あなたの全体像」が完成する。

---

## 2. 現状の事実

### Presence（人物ミラー）
- **ファイル数**: 33（コンポーネント19 + ライブラリ4 + ページ等）
- **5タブ構成**:
  1. **Depth** — 深層分析（EntropySig, DarkMatter, TemporalStrata）
  2. **Change** — 変化追跡（MetamorphosisChronicle, PresencePulse）
  3. **Relations** — 対人関係（RelationalPrism, OrbiterPatterns, CompanionLevel）
  4. **Mirror** — 鏡像（StateMirror, ContradictionTheater, MicroMoment）
  5. **Self** — 自己認識（PredictiveSelf, PresenceGapCard）
- **主要コンポーネント19個**: OthersViewTab, MetamorphosisChronicle, ContradictionTheater, EntropySig, OrbiterPatterns, StateMirror, RelationalPrism, PredictiveSelf, PresencePulse, MicroMoment, CompanionLevel, PresenceShareButton, Primitives, PresenceHero, PresenceGapCard, DarkMatter, TemporalStrata, PresenceWelcome等
- **ライブラリ**: 4個（presenceTypes, presenceUtils, presenceData, presenceFetch推定）

### Body-Color/Avatar（外見分析）
- **ファイル数**: 16（アバターキャプチャ、SNS共有、フェイスハブ、カラー/ボディ/ヘア詳細ビュー）
- **顔写真セッション**: real-face-session（写真撮影→AI分析フロー）

### Phenotype API
- **APIルート**: 10個
  - body-color: 6ルート（profile, analysis, avatar, capture, share, detail）
  - eye-profile: 1ルート
  - face-phenotype: 1ルート
  - hair-phenotype: 1ルート
  - phenotype: 1ルート（統合エンドポイント）

### 分析軸の全体像
| カテゴリ | 軸数 | 内訳 |
|---------|------|------|
| 顔型 | 6 | 卵型、丸型、面長、ベース型、逆三角形、ひし形 |
| 目型 | 6 | アーモンド、丸目、切れ長、奥二重、たれ目、つり目 |
| 眉型 | 7 | アーチ、ストレート、角度、太め、細め、上がり、下がり |
| 鼻 | 3軸 | 高さ、幅、形状 |
| 口 | 3軸 | 厚さ、幅、形状 |
| 印象 | 5軸 | フェミニン-マスキュリン、ソフト-シャープ、クール-ウォーム、モダン-クラシック、カジュアル-フォーマル |
| 髪 | 4カテゴリ | 長さ(6), 前髪(6), シルエット(6), テクスチャ(9) + カラーhex |
| 体(CFV) | 25軸 | Color Feature Vector |
| 体(CPV) | 10軸 | Color Profile Vector |
| 体(計測) | 24キー | 身体計測値 |

### 連携先
1. **Stargazer** — 性格分析との統合（Presenceの全タブがStargazerデータに依存）
2. **Genome Card** — archetypeEmoji+レーダー+パーソナルカラー表示
3. **Calendar** — コーデ提案のoutfitDna（パーソナルカラー+体型→似合う服）
4. **Rendezvous** — faceTypeClassifier（顔型情報の参照）

### 残件
- face_type race解消済み（body-color監査バックログクローズ）
- hair fallbackは誤検出でクローズ

---

## 3. 世界トップ比較

| サービス | 分析対象 | AI活用 | 連携 | 差別化要素 |
|----------|---------|--------|------|------------|
| **ZOZOMAT/ZOZOSUIT** | 足+体計測 | AI推薦 | ZOZO EC | 専用ハードウェアによる精度 |
| **Perfect Corp/YouCam** | 顔+メイク | AR Beauty | コスメEC | リアルタイムARシミュレーション |
| **Meitu** | 顔分析+美化 | AI顔分析 | SNS共有 | 中国市場2億+ユーザー |
| **Color Me Beautiful** | パーソナルカラー | なし（人手） | なし | 4シーズン分類の元祖 |
| **FaceApp** | 顔変換 | GAN | SNS共有 | エイジング/性別変換のバイラル |

---

## 4. 測定指標

| 指標 | Aneurasync | ZOZOMAT | Perfect Corp | Meitu | Color Me Beautiful |
|------|-----------|---------|--------------|-------|-------------------|
| 顔分析軸数 | 30+（6+6+7+3+3+5） | なし | 100+ | 50+ | なし |
| 体分析軸数 | 59（CFV25+CPV10+計測24） | 100+（ZOZOSUIT） | なし | なし | なし |
| パーソナルカラー | CPV10軸 | なし | 4シーズン | なし | 4シーズン |
| Presenceタブ | 5（内面可視化） | なし | なし | なし | なし |
| Presenceコンポーネント | 19 | N/A | N/A | N/A | N/A |
| API数 | 10 | N/A | N/A | N/A | N/A |
| 他機能連携 | 4（Stargazer/Genome/Calendar/Rendezvous） | ZOZO EC | コスメEC | SNS | なし |
| AR機能 | なし | なし | あり | あり | なし |
| 入力方式 | 写真1枚 | 専用マット/スーツ | リアルタイムカメラ | リアルタイムカメラ | 対面診断 |

---

## 5. 全問題点

1. **Presenceの19コンポーネントと5タブは情報密度が高い**。初見ユーザーが「何を見ればいいか」分からない。ContradictionTheater, EntropySig, DarkMatter等の概念が抽象的
2. **Phenotypeの59体分析軸（CFV25+CPV10+計測24）はユーザーにとって過剰な可能性**。「何に使えるか」が結果画面で不明。数字の羅列に見えるリスク
3. **顔分析の精度検証が不明**。6顔型の分類正解率、目型/眉型の判定精度のベンチマークデータがない
4. **real-face-sessionの顔写真データのプライバシー保護レベル**。Supabase Storageに保存される写真の暗号化/アクセス制御/保存期間が未文書化
5. **Presenceの「人物ミラー」コンセプトとBody-Colorの「外見分析」の関係がユーザーに不明瞭**。ナビゲーション上「Presence」と「Phenotype（Body-Color）」が別機能として存在し、両方を使う理由が不明
6. **10 APIルートそれぞれのレスポンス時間が不明**。AI顔分析処理は数秒かかる可能性。ローディング体験の設計が重要
7. **Presence 5タブのデータ依存**。全タブがStargazer観測データに依存するため、Stargazer未完了ユーザーへの表示が空/不完全になる
8. **CompanionLevel（関係深度レベル）の算出根拠が不透明**。ユーザーに「なぜこのレベルか」が説明できない可能性
9. **PresenceShareButton の共有体験**。Presenceの複雑な多タブ情報をどのように1枚の共有画像にまとめるか
10. **外見分析の再実行フロー**。髪型/体型変化後の再分析手順が不明。古い分析結果が残り続けるリスク
11. **印象5軸（フェミニン-マスキュリン等）のジェンダーセンシティビティ**。フェミニン-マスキュリン軸の表現が不適切と受け取られる可能性

---

## 6. 全改善案

**A. Presence初回ガイド強化**
PresenceWelcome.tsxの内容を確認・改善。5タブそれぞれの目的を「あなたの深層を見る」「変化を追う」「人との関わりを知る」「自分の鏡を覗く」「未来の自分を予測する」のように1行で説明

**B. Phenotype結果の「So What」セクション**
分析結果画面に「この結果の活用先」を直接表示。「あなたの顔型は卵型→Calendarで似合うコーデを見る」「パーソナルカラーはAutumn→Genome Cardに反映済み」のようにアクション接続

**C. 顔分析精度のベンチマーク計測**
テストデータセット（N=100顔）で6顔型分類の正解率を計測。精度が低い場合はモデル改善またはUI上の「参考値」表記追加

**D. 顔写真データの保存ポリシー文書化**
Supabase StorageのRLSポリシー確認。保存期間（無期限/90日/分析後即削除）の方針決定。プライバシーポリシーページへの反映

**E. Presence←→Phenotypeの統合ナビゲーション**
「あなたの全体像」として内面（Presence）と外見（Phenotype）を1つの導線で接続。PresenceHeroに「外見分析を見る」リンク、Phenotype結果に「内面ミラーを見る」リンク

**F. APIレスポンス時間の計測とキャッシュ最適化**
10 APIルートの平均応答時間を計測。AI処理を含むルート（face-phenotype, hair-phenotype）にはプログレスバー/スケルトンUI追加

**G. Stargazer未完了時のPresence表示**
観測データ不足時に「あとN問回答するとこのタブが解放されます」ではなく「現在の限られたデータからの推定」を表示。「No identity locks」原則に従い全タブアクセス可能を維持

**H. 外見分析の再実行フロー**
「再分析」ボタンをPhenotype結果画面に追加。再分析時は前回結果との比較表示（「前回→今回」の変化ハイライト）

**I. 印象軸のジェンダーニュートラル化**
フェミニン-マスキュリン → ソフト印象-シャープ印象（既存のソフト-シャープ軸と統合検討）

**J. Presence月次変化レポート**
MetamorphosisChronicle（変化追跡）の月次サマリー自動生成。「今月のあなたの変化」を1ページにまとめる

---

## 7. 改善案への反証

**A反証**: 「No identity locks」原則でガイドは最小限であるべき。過度な説明は探索の楽しみを損なう

**B反証**: 「So What」はCalendar連携で既に間接的に実現している。Phenotype結果画面に直接表示する必要性は低い

**C反証**: 顔分析AIモデルの精度計測にはラベル付きテストデータセットの準備が必要。工数が大きい

**D反証**: プライバシーポリシーは法務領域。Build Unitの技術的対応（暗号化/RLS）は実装済み

**E反証**: Presence（内面）とPhenotype（外見）は概念的に異なる。無理に統合するとコンセプトが曖昧になる

**G反証**: データ不足時の「推定」表示は精度が低く、誤った自己理解を与えるリスク

**I反証**: フェミニン-マスキュリンは国際的に認知された印象分類（Image Consulting業界標準）。ジェンダーではなく印象の軸

---

## 8. 反証後の再修正

**A再修正**: ガイドはロック/制限ではなく「歓迎メッセージ」として設計。「ようこそ、あなたの人物ミラーへ。5つの視点であなた自身を映し出します」程度。PresenceWelcomeの現状を確認し、不足なら追加

**B再修正**: Calendar連携は間接的すぎる。Phenotype結果画面に「この結果が活きる場所」セクションを1箇所追加。リンク3個程度で軽量

**C再修正**: 100件のフルベンチマークではなく、社内テスト（チーム3-5人の顔写真）で明らかな誤分類がないかスモークテスト

**E再修正**: 統合ではなく「相互参照」。PresenceのRelationsタブに「あなたの外見印象」サマリーを1カード表示。Phenotypeに「内面との関連」サマリーを1カード表示

**G再修正**: 推定ではなく「データが増えると精度が上がります」の表示。空欄にはせず、「?」アイコンで「もっと観測すると見えてきます」を表示

**I再修正**: フェミニン-マスキュリンの名称は維持しつつ、UIに「これは性別ではなく、印象の軸です」の注釈を追加

---

## 9. 確定改善

1. **Phenotype結果画面に「活用先」セクション追加** — Calendar連携、Genome Card表示、Rendezvousとのリンク3個。軽量実装
2. **Presence初回アクセス時のガイド確認・改善** — PresenceWelcome.tsxの内容を確認し、5タブの目的説明が不足していれば追加
3. **印象軸「フェミニン-マスキュリン」に注釈追加** — 「性別ではなく印象の分類です」の1行テキスト

---

## 10. 要検証改善

1. **顔分析の分類精度** — チーム内スモークテスト（3-5人）で明らかな誤分類の有無確認
2. **10 APIのレスポンス時間** — 特にAI処理含むface-phenotype, hair-phenotypeの応答時間計測
3. **Presence各タブの利用率** — β開始後に5タブそれぞれのページビュー/滞在時間計測
4. **Stargazer未完了ユーザーのPresence表示状態** — データ不足時に各タブがどう表示されるか確認
5. **外見分析の再実行需要** — βテスターに「髪型変えたら再分析したいか」ヒアリング

---

## 11. 要判断改善（CEO判断）

1. **顔写真データの保存ポリシー** — 無期限保存/90日保存/分析後即削除の方針決定
2. **Presence/Phenotypeの統合ナビゲーション方針** — 相互参照の追加 or 現状維持
3. **印象軸の名称変更** — フェミニン-マスキュリン維持（注釈追加）vs ソフト印象-シャープ印象への変更
4. **月次変化レポートの優先度** — MyPageのマイルストーンレポートとの統合検討
5. **AR機能の将来検討** — Perfect Corp的なリアルタイムAR分析の導入可否

---

## 12. 修正時の副作用 / 依存関係

| 改善項目 | 副作用・依存 |
|----------|-------------|
| 「活用先」セクション | Calendar, Genome Card, Rendezvousへのリンク追加。各機能のルーティング確認。body-color/配下のページ修正 |
| ガイド追加 | PresenceWelcome.tsxの修正。初回表示ロジック（localStorage or DB）の追加 |
| 印象軸注釈 | body-color関連コンポーネントの修正。多言語対応時の翻訳キー追加 |
| 精度計測 | テストデータの準備。顔分析AIモデル（face-phenotype API）の入出力仕様理解 |
| レスポンス時間計測 | API middleWare またはログ追加。Vercel Functions のタイムアウト設定確認 |
| 再実行フロー | Supabase StorageのRLSポリシー確認。古い分析結果の上書き/バージョニング方針 |

---

## 13. 削るもの / 残すもの / 強化するもの / 統合するもの

### 削る
- なし（Presence 33ファイル+Body-Color 16ファイルは機能に対して適切な規模。独自性がある）

### 残す
- 59体分析軸（CFV25+CPV10+計測24）— 他社にない分析深度
- 30+顔分析軸（6+6+7+3+3+5）
- Presence 5タブ構成（Depth/Change/Relations/Mirror/Self）
- 4機能連携（Stargazer/Genome/Calendar/Rendezvous）
- 「No identity locks」原則（全タブ・全分析に最初からアクセス可能）

### 強化
- Phenotype結果の活用先提示（「So What」セクション）
- Presence初回ガイド
- 印象軸の理解容易性（注釈追加）
- 分析精度の検証基盤

### 統合
- Presence + Phenotypeの相互参照検討（CEO判断）

---

## 14. この機能が世界トップを超えるための最終条件

Perfect CorpはAR Beauty（リアルタイム顔分析+メイクシミュレーション）。ZOZOMATは体計測（専用ハードウェアによる精度）。Meituは顔分析+美化（2億ユーザーのデータ規模）。

Aneurasyncがこれら全てを超えるための条件は2つ。

**条件1: 外見分析結果が「自己理解の一部」として内面分析（Stargazer）と統合されること**
Perfect Corpの顔分析は「メイクをどうするか」のツール。ZOZOMATの体計測は「服をどう選ぶか」のツール。いずれも外見を「変える/整える」ための道具に過ぎない。Aneurasyncの外見分析は「自分を知る」ための入口。「あなたの顔型×性格×行動パターン→あなただけのスタイル」という唯一無二の体験を提供する。外見分析が孤立したツールではなく、45軸性格モデルの一部として機能すること。

**条件2: Presenceが「自分を見る」体験として中毒性を持つこと**
Spotify Wrappedは年1回の「自分振り返り」で中毒性がある。Presenceは常時アクセス可能な「自分のミラー」。5タブのうち少なくとも1つが「毎日開きたくなる」体験を提供する必要がある。候補はChange（変化追跡）タブ。「昨日と今日で何が変わったか」が見えることで、日常的なアクセス理由が生まれる。データが増えるほど鏡の解像度が上がり、見える自分が鮮明になる。この「解像度が上がる快感」がPresenceの核心。
