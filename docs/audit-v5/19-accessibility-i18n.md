# 19. Accessibility / i18n 改善パック

## この機能を改善させるための依頼文

```
以下はAneurasyncのAccessibility/i18n関連に関する独立監査パックです。
- この機能だけを対象にしてください
- 他機能との依存は考慮してください（全UIコンポーネント、モーダル、フォーム、アニメーション等）
- 全問題点を洗い出してください
- 全改善案を出してください
- 必ず反証してください
- 無難な改善ではなく、世界トップを超える案まで出してください
- 対象: 全tsx/tsファイルのaria属性, i18n/request.ts, messages/en.json(13行), messages/ja.json(13行), components/genome-card/_components/FocusTrap.tsx, app/globals.css(@keyframes 186箇所), 全モーダル/オーバーレイコンポーネント
```

---

## 1. この機能の役割

障がいのあるユーザーを含む全ユーザーが Aneurasync を利用できるアクセシビリティ基盤と、複数言語でサービスを提供する国際化（i18n）基盤。スクリーンリーダー対応、キーボードナビゲーション、フォーカス管理、色覚対応、モーション軽減対応を含む。i18n は next-intl で2言語（日本語/英語）の構造が存在するが、実質日本語のみ。

---

## 2. 現状の事実

### アクセシビリティ

| 指標 | 値 | 検出方法 |
|------|-----|---------|
| `aria-` 属性 | 344箇所 | `grep -r "aria-" --include="*.tsx" -c` |
| `role="..."` 属性 | 115箇所 | `grep -r 'role="' --include="*.tsx" -c` |
| `sr-only` クラス | **2箇所** | `grep -r "sr-only" --include="*.tsx" -c` |
| FocusTrap | 4ファイル | `ShareMyCardModal.tsx`, `FocusTrap.tsx`, `SendRequestModal.tsx`, `ConnectionEstablishedModal.tsx`（全て genome-card 内） |
| `onKeyDown`/`onKeyUp`/`onKeyPress` | 46箇所 | `grep -r` |
| `autoFocus` | 13箇所 | `grep -r "autoFocus" --include="*.tsx" -c` |
| `@keyframes`（CSS） | 186箇所 | `grep -r "@keyframes" --include="*.css" -c` |
| `prefers-reduced-motion` 対応 | 17箇所 | `grep -r "prefers-reduced-motion" -c` |
| モーダル/オーバーレイ | 62ファイル以上 | `grep -rl "Modal\|Overlay\|Dialog\|Drawer"` |
| 総コード行数 | 616,446行 | `wc -l`（app + components + lib） |

### i18n

| 指標 | 値 |
|------|-----|
| i18n基盤 | next-intl（`i18n/request.ts`） |
| 対応ロケール | `en`, `ja`（`SUPPORTED` Set） |
| デフォルトロケール | `"en"`（cookie未設定時） |
| `messages/en.json` | 13行、7キー（Nav.match/shops/drops, Match.title/streetClassic/minimalLoud/modernVintage/cta） |
| `messages/ja.json` | 13行、7キー（同構造の日本語） |
| UIハードコード日本語率 | **99%以上** |
| ロケール切替UI | 未確認 |

### FocusTrap 実装箇所

| ファイル | 用途 |
|---------|------|
| `genome-card/_components/FocusTrap.tsx` | FocusTrap コンポーネント定義 |
| `genome-card/_components/ShareMyCardModal.tsx` | カード共有モーダル |
| `genome-card/_components/SendRequestModal.tsx` | リクエスト送信モーダル |
| `genome-card/_components/ConnectionEstablishedModal.tsx` | 接続完了モーダル |

### FocusTrap が未適用のモーダル/オーバーレイ（代表例）

- `components/ui/glassmorphism-design.tsx`（GlassModal）
- `components/ui/dialog.tsx`
- `components/home/ValuesOnboardingOverlay.tsx`
- `components/rendezvous/IncomingCallOverlay.tsx`
- `components/rendezvous/UniverseNodeOverlay.tsx`
- `components/rendezvous/WelcomeBackOverlay.tsx`
- `components/rendezvous/ReportFormModal.tsx`
- `components/rendezvous/PhotoUnlockAnimation.tsx`

---

## 3. 世界トップ比較

| 基準 | 内容 | Aneurasync対応状況 |
|------|------|-------------------|
| **WCAG 2.1 AA** | Web標準。コントラスト4.5:1、全操作キーボード可能、フォーカス管理 | 部分的（aria-344箇所あるが sr-only 2箇所、FocusTrap 限定的） |
| **JIS X 8341-3** | 日本の Web アクセシビリティ基準。WCAG 2.1 と整合 | 未準拠 |
| **Apple HIG** | 全UIにVoiceOver対応内蔵。Dynamic Type対応 | 未対応 |
| **GOV.UK Design System** | 政府基準。最高レベルの a11y。全パターンにガイダンス | 未対応 |
| **Headspace** | 瞑想アプリながら WCAG AA 準拠。音声ガイドのテキスト代替 | 同カテゴリとして参考 |
| **Linear** | 完全キーボード操作。全モーダルに FocusTrap。高コントラストモード | 開発ツールとして参考 |

---

## 4. 測定指標

| 指標 | Aneurasync 現状値 | WCAG 2.1 AA 要件 | Headspace | Linear |
|------|-------------------|------------------|-----------|--------|
| aria 属性密度 | 344/616,446行 = 0.056% | 全インタラクティブ要素 | 高密度 | 高密度 |
| sr-only | **2箇所** | 視覚情報全てに代替テキスト | 全画像/アイコン | 全アイコン |
| FocusTrap 適用率 | 4/62+ = **6.5%** | 全モーダル/ダイアログ | 全モーダル | 全モーダル |
| キーボード操作 | 46箇所にイベント | 全機能 | 全機能 | 全機能 |
| prefers-reduced-motion | 17/186 = **9.1%** | 全アニメーション | 対応 | 対応 |
| カラーコントラスト | **未監査** | 4.5:1（通常テキスト）、3:1（大テキスト） | 準拠 | 準拠 |
| i18n カバー率 | 7キー/推定数千キー = **<1%** | N/A | 完全 | 完全 |

---

## 5. 全問題点

### P1: sr-only が2箇所のみ
616,446行のコードに対して `sr-only`（スクリーンリーダー専用テキスト）が2箇所。視覚的に表現される情報（アイコン、色、グラフ、進捗バー、カラーパレット等）のテキスト代替が極めて不足。スクリーンリーダーユーザーにとって機能の大部分が利用不能。

### P2: FocusTrap が genome-card の4ファイルのみ
62以上のモーダル/オーバーレイのうち、FocusTrap が適用されているのは genome-card 内の4ファイルのみ（6.5%）。GlassModal、ValuesOnboardingOverlay、IncomingCallOverlay 等の主要モーダルでフォーカスがモーダル外に逃げる。キーボードユーザーがモーダル裏の要素に Tab 移動してしまう。

### P3: prefers-reduced-motion の対応が9.1%
CSS に186箇所の `@keyframes` があるが、`prefers-reduced-motion` 対応は17箇所のみ。前庭障害やモーション酔いのユーザーにとって、Framer Motion のアニメーション + CSS アニメーションが身体的不快を引き起こす可能性。

### P4: Glassmorphism のカラーコントラスト未監査
Glassmorphism デザインシステム（半透明背景 + ぼかし）はコントラスト不足のリスクが高い。`backdrop-blur` + 低不透明度の背景上のテキストが WCAG 4.5:1 基準を満たすか未検証。特に `#8B5CF6`（紫）のテーマカラーと白テキストの組み合わせ。

### P5: i18n が事実上機能していない
`messages/en.json` は Nav と Match の7キーのみ。UIの99%がハードコード日本語。デフォルトロケールが `"en"` なのに英語コンテンツがほぼない。英語ロケールのユーザーが来た場合、日本語ハードコードUIと7キー分の英語が混在する破綻した体験。

### P6: autoFocus 13箇所のモバイル影響
`autoFocus` が13箇所に使用。モバイルデバイスではソフトキーボードが自動表示され、画面が不意にスクロールする問題を引き起こす可能性。特に Origin コンポーネントでの使用が多い。

### P7: キーボードのみでの全機能到達可能性が未検証
46箇所にキーボードイベントがあるが、全機能がキーボードのみで操作可能かの体系的な検証がない。特にドラッグ操作（Framer Motion drag）、スワイプ操作（Rendezvous のカードスワイプ）のキーボード代替が未確認。

### P8: 動的コンテンツのライブリージョン対応
Alter の応答、ContextReel のインサイト更新、リアルタイム通知等の動的コンテンツに `aria-live` リージョンが設定されているか未確認。スクリーンリーダーが新しいコンテンツの出現を通知できない可能性。

---

## 6. 全改善案

### A. GlassModal に FocusTrap 追加
最も汎用的なモーダルコンポーネント `GlassModal`（`components/ui/glassmorphism-design.tsx`）に、既存の `FocusTrap`（`genome-card/_components/FocusTrap.tsx`）を適用。GlassModal を使用する全画面に波及。

### B. prefers-reduced-motion のグローバル対応
`app/globals.css` に以下を追加:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```
186箇所の個別対応ではなく、グローバルに全アニメーションを無効化。

### C. 主要画面に sr-only 追加
Home（Composer aria-label）、Stargazer（進捗バー、スコア表示）、Origin（感情アイコン）の主要画面に、視覚情報のテキスト代替を追加。優先度: アイコンボタン > グラフ/チャート > 色表現。

### D. Glassmorphism カラーコントラスト監査
WAVE または axe-core で Home 画面の Glassmorphism コンポーネントのコントラスト比を検査。`backdrop-blur` + 背景色の組み合わせで WCAG 4.5:1 を満たさない箇所を特定。

### E. i18n 方針の決定
選択肢A: 日本市場特化 → `messages/en.json` 削除、デフォルトロケールを `"ja"` に変更、next-intl のオーバーヘッド除去
選択肢B: 国際化準備維持 → デフォルトロケールを `"ja"` に変更（最低限）、en.json は将来用に維持

### F. FocusTrap の共通化とモーダル全適用
`genome-card/_components/FocusTrap.tsx` を `components/ui/FocusTrap.tsx` に移動し、全モーダル/オーバーレイに段階的適用。

---

## 7. 改善案への反証

### A反証: FocusTrap 追加はテストコストが高い
GlassModal に FocusTrap を追加すると、GlassModal を使用する全画面でのフォーカス管理をテストする必要がある。FocusTrap のバグ（フォーカスが抜けない、特定要素にフォーカスできない等）が全モーダルに波及するリスク。

### B反証: グローバル prefers-reduced-motion は UX を損なう
全アニメーション無効化は、アニメーションに意味がある場面（ローディング表示、状態遷移の視覚フィードバック）でも無効化される。「減らす」ではなく「全消し」はアクセシビリティの過剰対応。

### C反証: sr-only 追加は beta フェーズでは不要
beta テスター3人にスクリーンリーダーユーザーがいない場合、sr-only の追加は誰にも使われないコードの追加。beta フェーズでは視覚ユーザー向けの体験品質が最優先。

### D反証: コントラスト監査の結果が大量のエラーを返す可能性
Glassmorphism の半透明デザインは本質的にコントラスト不足になりやすい。監査結果がデザインシステムの根本的な見直しを要求する可能性があり、対応工数が予測不能。

### E反証: en.json 削除は国際化の選択肢を閉じる
beta 後に海外展開する場合、i18n 基盤を再構築するコスト。7キーの en.json を維持するコストはゼロに近い。

### F反証: 全モーダル適用は段階的でも工数大
62以上のモーダル/オーバーレイに FocusTrap を適用するのは、1ファイル15分としても15時間以上。beta フェーズでの優先度として高くない。

---

## 8. 反証後の再修正

### A再修正
GlassModal 単体でテスト。GlassModal は汎用コンポーネントのため、ここに FocusTrap を入れれば使用箇所全てに波及。テストは GlassModal の単体テスト + 主要3画面のスモークテストで十分。

### B再修正
グローバル全消しではなく、`animation-duration` を短縮（`0.01ms` → `0.2s`）。意味のあるアニメーション（ローディングスピナー等）は個別に `prefers-reduced-motion: no-preference` で維持。

### C再修正
sr-only はアクセシビリティの法的要件（JIS X 8341-3、障害者差別解消法）の観点から、beta フェーズでも最低限の対応が望ましい。全画面ではなく、主要CTA（ボタン）のアイコンに aria-label が付いているか確認するレベル。

### F再修正
全62箇所ではなく「GlassModal + dialog.tsx」の2箇所のみ。この2つが最も汎用的で、適用すれば多くのモーダルをカバー。

---

## 9. 確定改善

### 9-1. GlassModal に FocusTrap 追加
`components/ui/glassmorphism-design.tsx` の `GlassModal` コンポーネントに、`genome-card/_components/FocusTrap.tsx` を適用。最も汎用的なモーダルから着手。

### 9-2. prefers-reduced-motion のグローバル対応
`app/globals.css` に `@media (prefers-reduced-motion: reduce)` ルールを追加。`animation-duration` と `transition-duration` を短縮。ローディングスピナー等の必要なアニメーションは個別例外。

### 9-3. デフォルトロケールの `"ja"` への変更
`i18n/request.ts` のデフォルトロケールを `"en"` → `"ja"` に変更。現在の cookie 未設定ユーザーが英語デフォルトになる問題を解消。日本語アプリのデフォルトが英語なのは明らかな設定ミス。

---

## 10. 要検証改善

### 10-1. WAVE / axe-core による Home 画面の a11y 監査
Home 画面を WAVE または axe-core で検査し、違反数と深刻度を計測。Glassmorphism のコントラスト不足箇所を特定。

### 10-2. キーボードのみ操作での全機能到達可能性
主要導線（Home → Stargazer → 質問回答 → インサイト表示）をキーボードのみで操作し、到達不能箇所を特定。特にドラッグ/スワイプ操作のキーボード代替。

### 10-3. Framer Motion アニメーションの prefers-reduced-motion 対応状況
Framer Motion の `useReducedMotion()` フックが使用されているか確認。CSS の `@media` だけでは Framer Motion の JS アニメーションは無効化されない。

---

## 11. 要判断改善

### 11-1. i18n 方針: 日本特化 vs 国際化準備
選択肢A: 日本市場特化。`messages/en.json` 削除、next-intl 除去（ビルドサイズ削減）
選択肢B: 国際化準備維持。デフォルト `"ja"` に変更のみ。en.json と基盤は維持
CEO判断。beta ユーザーが全員日本語話者なら A が合理的。

### 11-2. sr-only 追加の範囲と優先度
全アイコンボタンに aria-label を追加する（工数大）か、主要CTA のみに限定するか。beta フェーズでのアクセシビリティ対応レベルの判断。CEO判断。

### 11-3. アクセシビリティ対応のロードマップ
WCAG 2.1 AA 完全準拠を目指すタイミング。beta → 正式リリース前 → リリース後のいずれか。法的要件（障害者差別解消法 2024年改正で民間事業者にも合理的配慮の提供義務）との兼ね合い。CEO判断。

---

## 12. 修正時の副作用 / 依存関係

| 改善 | 影響範囲 | 副作用リスク |
|------|---------|------------|
| GlassModal FocusTrap | `components/ui/glassmorphism-design.tsx` + GlassModal 使用箇所全て | FocusTrap のバグがモーダル体験全体に波及。Tab 順序の変更。特定要素（input, textarea）へのフォーカスが FocusTrap で阻害される可能性 |
| prefers-reduced-motion | `app/globals.css` + 全アニメーション | ローディングスピナーの消失。Framer Motion の JS アニメーションは CSS では制御不可（別途対応必要） |
| デフォルトロケール変更 | `i18n/request.ts` | cookie 未設定の既存ユーザーのロケールが en → ja に変更。en.json の7キーを使用している画面で表示言語が変わる |
| sr-only 追加 | 各コンポーネントの JSX | DOM構造の微細な変更。CSS の `sr-only` クラスが Tailwind CSS 4 で利用可能か確認必要 |
| en.json 削除 | `i18n/request.ts`, next-intl 設定, `next.config.ts` | `SUPPORTED` Set から `"en"` を除去。routing/middleware への影響。`useTranslations()` の fallback 挙動変更 |
| FocusTrap 共通化 | `genome-card/_components/FocusTrap.tsx` → `components/ui/FocusTrap.tsx` | import パスの変更。genome-card 内の3ファイルの import 修正 |

---

## 13. 削るもの / 残すもの / 強化するもの / 統合するもの

| 区分 | 対象 | 理由 |
|------|------|------|
| **削る** | `messages/en.json` の形骸的7キー（日本特化決定後） | 「国際化対応済み」の誤認を生む。コピー品質がゼロ |
| **削る** | デフォルトロケール `"en"`（即時修正） | 日本語アプリのデフォルトが英語は明らかな設定ミス |
| **残す** | `aria-` 344箇所 | 既存のアクセシビリティ対応。維持 |
| **残す** | `role="..."` 115箇所 | セマンティックHTML の補強。維持 |
| **残す** | next-intl 基盤構造（国際化準備維持の場合） | 将来の多言語対応用。構造のみ維持 |
| **強化** | FocusTrap → GlassModal + dialog.tsx に適用 | 最小工数で最大カバレッジ |
| **強化** | `prefers-reduced-motion` → グローバル対応 | 186箇所の @keyframes を一括カバー |
| **強化** | sr-only → 主要CTAのアイコンボタン | スクリーンリーダーの最低限の操作保証 |
| **統合** | `FocusTrap` → genome-card から `components/ui/` に移動 | 共通コンポーネント化 |

---

## 14. この機能が世界トップを超えるための最終条件

WCAG 2.1 AA 完全準拠。「自分を知る」アプリが「誰でも使える」アプリであること。具体的には:

1. **全インタラクティブ要素に ARIA ラベル**: ボタン、リンク、入力欄の全てがスクリーンリーダーで認識可能
2. **全モーダルに FocusTrap**: キーボードユーザーがモーダル操作で迷子にならない
3. **カラーコントラスト 4.5:1 以上**: Glassmorphism の美しさとアクセシビリティの両立。`backdrop-blur` + 十分な背景不透明度
4. **キーボード完全操作可能**: ドラッグ/スワイプのキーボード代替（矢印キー操作等）
5. **prefers-reduced-motion 完全対応**: CSS アニメーション + Framer Motion の両方
6. **動的コンテンツの aria-live**: Alter の応答、インサイト更新がスクリーンリーダーで通知される

「自分を知る」体験は、視覚に頼らなくても、キーボードだけでも、色を見分けられなくても、モーションに酔いやすくても、誰もがアクセスできるべき。アクセシビリティは機能ではなく、権利。
