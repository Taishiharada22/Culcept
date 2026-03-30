# Genome Card — コンテンツ魅力度を最高峰超えに

## 現状分析

### 評価スコア（Content Desirability: 27/100 → 目標: 80+/100）

| 観点 | 現在 | 最高峰平均 | 原因 |
|-----|:----:|:---------:|------|
| この人を知りたい | 35 | 85 | cardFrontが静的motto1文のみ。人間味がない |
| 会話の糸口 | 40 | 90 | talkSuggestionが常にnull |
| FOMO | 25 | 95 | 27タイプの豊富なコンテンツが表に出ていない |
| データ充実度 | 20 | 90 | Stargazer観測データ→カードへの変換が薄い |
| カスタマイズ性 | 15 | 85 | ユーザーが自分のカードを編集できない |

### 根本原因
27アーキタイプには **motto, midnightThought, forbiddenPhrase, secretDesire, innerContradiction, lovePattern, childhoodScene, romanticMatch, strengths, blindSpots, safeState, stressState, growthKey, quote, dualView** という非常にリッチなコンテンツがあるのに、カードでは `coreValue=motto` と `dilemma=innerContradiction` の2フィールドしか使っていない。

### 利用可能だが未使用のデータ
1. **stargazer_observations** — 最新の観測回答（latestCuriosity）は取得済だが表示条件がLv3限定
2. **personality_dimensions** — 15軸のスコアがあるが5軸レーダーに圧縮するだけ
3. **face_phenotype** — 目の形、眉、鼻、口の印象が未使用
4. **27アーキタイプの深層コンテンツ** — midnightThought, forbiddenPhrase, lovePattern, childhoodScene等

## 改善計画

### C-1: カード表面に「人間味のある自己紹介」を追加（Impact: +15pt）
**cardFrontの拡張** — 静的mottoだけでなく、複数の側面を見せる

**新しいcardFrontフィールド:**
- `coreValue` → motto（既存）
- `dilemma` → innerContradiction（既存）
- `currentCuriosity` → 最新のStargazer観測回答（既存だがLv2から表示に変更）
- **`secretDesire`** → 「本当はこう思ってる」（新規追加）
- **`childhoodScene`** → 「子供の頃の原風景」（新規追加）

**実装:**
- `cardTypes.ts`: cardFrontに`secretDesire`, `childhoodScene`フィールド追加
- `filterByVisibility.ts`: archetypeDefから新フィールドをpopulate
- `GenomeCardLiving.tsx`: 表面に日替わりで異なるフィールドを表示（毎日違う面が見える）

### C-2: カード裏面を「深層プロファイル」に進化（Impact: +12pt）
**cardBackの大幅拡張** — レーダーだけでなく「この人の内面」を見せる

**新しいcardBackフィールド:**
- `radarAxes` → 5軸レーダー（既存）
- `bodyTraits` → 外見特性（既存 + face_phenotypeの目・眉・鼻・口の印象追加）
- **`lovePattern`** → 恋愛パターン（新規）
- **`midnightThought`** → 深夜の独白（新規）
- **`strengths`** → 強み3つ（新規）
- **`blindSpots`** → 死角（新規）
- **`stressResponse`** → ストレス時の行動（新規）
- **`quote`** → このタイプを体現する名言（新規）

**実装:**
- `cardTypes.ts`: cardBackに新フィールド追加
- `filterByVisibility.ts`: Lv1→基本、Lv2→strengths+quote、Lv3→全開示
- `GenomeCardLiving.tsx`: 裏面レイアウトを「深層プロファイル」に全面改修

### C-3: 日替わり自動回転コンテンツ（Impact: +10pt）
**既存のgetDailyContentを拡張** — 7日間で全面が異なるカード体験

現在: `[日曜のモットー, 月曜の強み, 火曜の死角, 水曜の成長, 木曜の安心, 金曜のストレス, 土曜の名言]`
→ これをカード表面の「INSIGHT OF THE DAY」セクションとして目立たせる

### C-4: currentCuriosityの表示レベル緩和（Impact: +8pt）
現在Lv3限定のcurrentCuriosity（最新の観測回答）をLv2から表示に変更。
自分のカードでは常に表示（自分のデータは隠す理由がない）。

### C-5: bodyTraitsにface_phenotypeの詳細追加（Impact: +5pt）
現在: 「オータム / ストレート / 四角顔」
改善後: 「オータム / ストレート / 四角顔 / 印象：知的で芯がある」

face_phenotype.face_impressionから印象スコアを人間的な表現に変換。

## 実装順序

1. **C-1 + C-2**: cardTypes + filterByVisibility の型拡張（同時）
2. **C-4**: currentCuriosity表示レベル緩和
3. **C-5**: bodyTraits拡張
4. **C-2続き**: GenomeCardLiving裏面レイアウト改修
5. **C-1続き**: GenomeCardLiving表面コンテンツ拡張
6. **C-3**: 日替わりセクション強化
7. プレビュー検証

## 期待される改善

| 観点 | Before | After | 根拠 |
|-----|:------:|:-----:|------|
| この人を知りたい | 35 | 82 | 深層コンテンツ6種（motto→secretDesire→lovePattern→midnightThought→strengths→quote→childhoodScene）で「この人」が見える |
| 会話の糸口 | 40 | 78 | forbiddenPhrase, lovePattern, innerContradictionが自然な会話トピックになる |
| FOMO | 25 | 75 | 日替わりコンテンツ + 7日間で全面が変わる + 27タイプ固有の深いコンテンツ |
| データ充実度 | 20 | 80 | 15+フィールドが全てpopulate + face_phenotype詳細 |
| カスタマイズ性 | 15 | 40 | 今回は見送り（将来フェーズ）|
| **合計** | **27** | **71** | +44pt |
