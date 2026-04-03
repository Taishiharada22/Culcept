# Design System / UI 改善パック

## この機能を改善させるための依頼文

```
以下はAneurasyncのDesign System/UIに関する独立監査パックです。
- この機能だけを対象にしてください
- 他機能との依存は考慮してください（全画面のUI、アニメーション、テーマ等）
- 全問題点を洗い出してください
- 全改善案を出してください
- 必ず反証してください
- 無難な改善ではなく、世界トップを超える案まで出してください
- 対象: components/ui/glassmorphism-design.tsx(1,010行), components/ui/design-system.tsx(604行), lib/design-tokens.ts, app/globals.css, app/home-animations.css
```

---

## 1. この機能の役割

Aneurasync全画面のビジュアル基盤。Glassmorphismデザインシステム（半透明ガラス風UI）を中心に、GlassCard/GlassButton/GlassInput等の共通コンポーネント、デザイントークン（色/スペース/タイポ/モーション）、CSSアニメーションを提供。「テクノロジー x 内省」の世界観をUIで体現する。

Aneurasyncの「らしさ」を視覚的に成立させる唯一のレイヤーであり、ユーザーが画面を見た瞬間に「Aneurasyncだ」と認識できるかどうかはこのデザインシステムにかかっている。

---

## 2. 現状の事実

- **2つのデザインシステムが共存**:
  1. glassmorphism-design.tsx（1,010行、19エクスポート、223箇所でimport）
  2. design-system.tsx（604行、15エクスポート、1箇所でimport）
- **デザイントークン（lib/design-tokens.ts）**: 14グループ
  - COLORS, SURFACE, TEXT, BORDER, SHADOW, ZONES(5ゾーン), HIERARCHY, SPACE(10段階), RADII(6段階), FONT(2), TYPE(7), MOTION, BREAKPOINT(4), zoneCardStyle
- **CSSアニメーション**: globals.css 20個 + home-animations.css 24個 = 合計34個の@keyframes（重複除外後の一意名）
- **インラインスタイル**: tsx全体でstyle={{が8,524箇所
- **ハードコード色値**: #hex/rgb/rgbaが2,333箇所
- **glassmorphism-designの主要コンポーネント**: GlassCard, GlassButton, GlassInput, GlassTabs, GlassModal, FadeInView, GlassBadge, GlassNavbar, ProgressRing, Skeleton, Avatar, StatCard, LivePulse, Countdown等
- **Zone-basedカラーシステム**: presence, observation, identity, rendezvous, outfit, proposal, community, exploration の8ゾーン
- **Tailwind CSS 4**: 導入済みだが、インラインスタイルとの併用が多数

---

## 3. 世界トップ比較

| サービス | デザインシステム | 特徴 |
|----------|-----------------|------|
| Stripe | 1システム、インラインスタイル0原則 | トークン完全統一。「Stripe的」と一目でわかるビジュアル |
| Linear | Radix UI + カスタムトークン | ダークモード完備。ミニマルで機能的 |
| Vercel/Geist | 単一トークン体系 | コンポーネントライブラリ公開。再利用性の極致 |
| Apple HIG | 一貫したガイドライン | アクセシビリティ内蔵。プラットフォーム横断 |
| Tailwind UI | ユーティリティクラスベース | インラインスタイル不要。コピペで再現可能 |
| Raycast | カスタムデザイン言語 | 高速描画。アニメーションが機能を示す |

---

## 4. 測定指標

| 指標 | 現状値 | Stripe | Linear | Vercel |
|------|--------|--------|--------|--------|
| デザインシステム数 | 2（実質1） | 1 | 1 | 1 |
| 主要DSのimport数 | 223 | N/A | N/A | N/A |
| 副DSのimport数 | 1 | N/A | N/A | N/A |
| インラインスタイル | 8,524箇所 | 0原則 | 最小限 | 最小限 |
| ハードコード色 | 2,333箇所 | 0 | 0原則 | 0原則 |
| @keyframes | 34 | N/A | N/A | N/A |
| トークングループ | 14 | N/A | N/A | N/A |
| ダークモード | なし | あり | あり | あり |
| Zone colors | 8 | N/A | N/A | N/A |
| コンポーネント数 | 19+15=34 | N/A | N/A | N/A |

---

## 5. 全問題点

1. **design-system.tsx（604行）が1箇所でしかimportされていない**: 事実上のdead code。15エクスポートのうち14が未使用の可能性
2. **8,524箇所のインラインスタイル**: デザイントークン（14グループ）の定義があるにもかかわらず活用されていない。トークンの存在意義が形骸化
3. **2,333箇所のハードコード色**: テーマ変更・ダークモード対応が技術的に不可能。色の一貫性もハードコードでは保証できない
4. **34個の@keyframes**: 未使用のものが含まれる可能性。globals.cssとhome-animations.cssの2ファイルに分散しており管理困難
5. **ダークモード未対応**: 競合（Linear, Vercel, Stripe等）は全てダークモード提供。ユーザーからの要望が来た時に対応不可
6. **8 Zone colorsの適用一貫性が未確認**: 定義はあるが全画面で正しくゾーン色が使われているか不明
7. **glassmorphism-design.tsx自体が1,010行**: 19コンポーネントが単一ファイル。コンポーネント追加時にファイルが肥大化する構造
8. **Tailwind CSS 4とインラインスタイルの混在**: Tailwindのユーティリティクラスとstyle={{の混在がコードの可読性を下げている
9. **アクセシビリティの体系的対応なし**: コントラスト比、フォーカスリング、スクリーンリーダー対応がデザインシステムレベルで未組込み

---

## 6. 全改善案

A. **design-system.tsx削除**: 参照1箇所をglassmorphism-designコンポーネントに移行
B. **新規コードでのインラインスタイル禁止ルール制定**: ESLintカスタムルールで新規style={{を警告
C. **主要ページのハードコード色をトークン化**: Home, Stargazer, Originの3ページから着手
D. **未使用@keyframesのgrep特定と削除**: 34個のうち実際に使われているものを特定
E. **ダークモード基盤設計**: CSS変数ベースのライト/ダークテーマ切替
F. **glassmorphism-design.tsxの機能別分割**: layout系(GlassCard, GlassModal) / input系(GlassButton, GlassInput) / feedback系(Skeleton, LivePulse) / navigation系(GlassNavbar, GlassTabs)
G. **Zone colors適用一貫性監査**: 各ゾーンのページで正しいゾーンカラーが使われているか確認
H. **アクセシビリティ基盤追加**: GlassButtonのフォーカスリング、GlassCardのaria-label、コントラスト比確認
I. **Tailwind CSS活用率向上**: インラインスタイルのうちTailwindで代替可能なものをクラスに置換

---

## 7. 改善案への反証

- **A反証**: design-system.tsxの15コンポーネントが将来使われる可能性がある。削除すると再実装コストが発生
- **B反証**: インラインスタイル禁止は既存コードの書き方を大きく変える。8,524箇所の既存コードとの整合性が崩れ、「新規はTailwind、既存はstyle」の二重基準になる
- **C反証**: 2,333箇所のトークン化は膨大な作業量。ROIが不明。βフェーズでは見た目が動いていればよい
- **E反証**: ダークモードはユーザー要望次第。βフェーズの3テストユーザーから要望がなければ不要
- **F反証**: 1,010行のファイル分割はimportパスの変更を全223箇所に波及させる。バレルエクスポートで対応しても、ビルド時間やTree Shakingに影響

---

## 8. 反証後の再修正

- **A再修正**: import 1箇所のみという事実は明確。将来使うなら使う時にimportすればよい。現時点では削除が妥当。ただし、gitに残るので復元は容易
- **B再修正**: ESLintルールはwarning（error ではない）で導入。既存コードは段階的移行。新規コードのみ即時適用。二重基準は「移行期間」として許容
- **C再修正**: 全2,333箇所ではなく、Home画面のみ先行（最も表示頻度が高く影響大）。Home画面のハードコード色数を計測してから判断
- **E再修正**: ダークモード自体は後回し。ただし、ハードコード色のトークン化（CSS変数化）はダークモードの有無に関わらず保守性向上に直結する。トークン化=ダークモード準備
- **F再修正**: 分割はバレルエクスポート（index.ts）で既存import パスを維持可能。223箇所の変更不要。段階的分割が可能

---

## 9. 確定改善

1. **design-system.tsx（604行）の削除**: 参照1箇所をglassmorphism-designコンポーネントに置換。1箇所のimportを特定し、該当コンポーネントをglassmorphism-design.tsxからのimportに変更
2. **未使用@keyframesのgrep特定と削除**: globals.css + home-animations.cssの34個の@keyframesについて、tsx/css全体での参照をgrepし、未使用を削除
3. **ESLintルールで新規style={{の警告追加**: eslint.config.mjsにカスタムルール追加。severity: warn

---

## 10. 要検証改善

1. **8,524インラインスタイルのうちHome画面に含まれる数**: Home画面のトークン化コストを見積もるための前提情報
2. **34 @keyframesの使用/未使用の内訳**: grepで全参照を確認
3. **Zone colors 8色の適用一貫性**: 各ゾーンページ（/stargazer=observation, /rendezvous=rendezvous等）で正しいゾーン色が使われているか
4. **design-system.tsxの参照1箇所の特定**: どのファイルのどのコンポーネントが使用されているか

---

## 11. 要判断改善

1. **ハードコード色トークン化の優先度と範囲**: 全2,333箇所 vs Home画面のみ vs 新規コードのみ
2. **ダークモード対応の時期**: βフェーズ後 vs ユーザー要望があった時点
3. **glassmorphism-design.tsxの分割方針**: 分割する場合の粒度（4ファイル vs 機能別 vs 1コンポーネント1ファイル）
4. **アクセシビリティ対応の範囲**: WCAG AA vs AAA。対応時期

---

## 12. 修正時の副作用 / 依存関係

| 修正 | 影響範囲 | 副作用 |
|------|----------|--------|
| design-system.tsx削除 | 参照1箇所のコンポーネント差替え | 該当画面のスタイルが微妙に変わる可能性。目視確認必要 |
| ESLintルール追加 | eslint.config.mjs | CIのlintステップに影響。既存コードにwarningが大量に出る |
| @keyframes削除 | globals.css, home-animations.css | アニメーションが消える可能性。E2Eでの目視確認必要 |
| ファイル分割 | import パス全223箇所（バレルで回避可） | バレルエクスポート経由のTree Shaking非効率化の可能性 |
| トークン化 | 対象ページのtsx | 色がトークン経由になることで微妙な色差が生じる可能性 |

---

## 13. 削るもの / 残すもの / 強化するもの / 統合するもの

| 分類 | 対象 |
|------|------|
| 削る | design-system.tsx（604行）、未使用@keyframes |
| 残す | glassmorphism-design.tsx、デザイントークン14グループ、Zone colors 8色、Framer Motionアニメーション |
| 強化 | トークン活用率（インラインスタイル→トークン移行）、新規コードの品質ルール（ESLint） |
| 統合 | 2デザインシステム→1（glassmorphism-design.tsx） |

---

## 14. この機能が世界トップを超えるための最終条件

StripeやLinearのようにデザインシステムが「プロダクトの顔」として機能すること。

Aneurasyncは **Glassmorphism** という独自の視覚言語を持っている。これは明確な差別化要因であり、他のどのSaaSとも似ていない。この強みを最大化するために:

1. **全画面でトークンベースの一貫したUI**: インラインスタイル0は無理でも、主要色・主要スペースがトークン経由で管理され、1箇所の変更で全画面に反映される状態
2. **アニメーションが世界観の一部**: 34個の@keyframesは多すぎず、各々が「テクノロジー x 内省」の世界観を体現する意味を持つ
3. **1ファイルで完結するデザインシステム**: design-system.tsxを削除し、glassmorphism-design.tsxが唯一の真実
4. **「Aneurasyncらしさ」が一目で伝わる**: 半透明ガラス、微細なブラー、Zone-basedカラー、FadeInViewのアニメーション。これらが他のどのアプリとも違う「自分を見つめる空間」を演出する

最終目標: ユーザーがスクリーンショットを見ただけで「これはAneurasyncだ」と認識できるビジュアルアイデンティティの確立。
