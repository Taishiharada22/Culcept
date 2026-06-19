# Candidate Lens — UI Explanation Layer 設計（「なぜこの見え方なのか」を薄く）

> ステータス: **設計のみ**。実装しない（UI explanation 実装は別 GO）。
> 目的: P3-c で ③ 比較表の行順がユーザー傾向で変わり、P4 で写真/営業時間が入った。次は「なぜこの見え方なのか」を **薄く** 説明し、Aneurasync らしさ（透明性＋自己理解の入口）を増す。
> 設計思想整合: 中心問い「第二の自己として必要か」／最高体験「自分って、そういう人間だったのか」。説明は**断定でなく、訂正できる仮説の鏡**。

---

## 1. 前提を疑う — 何を説明し、何を説明しないか（最小スコープ）

現状、③ で「見え方」を決めている要素のうち **大半は既に honest に説明済み**:

| 見え方の要素 | 既存の説明 | 追加要否 |
|---|---|---|
| 写真・営業時間（Google 由来） | **Powered by Google** ＋ author attribution（P4） | ほぼ不要（既出） |
| ✨おすすめ（推薦） | `recommendation.basisPhrase`（「徒歩の点で合いそう」） | 不要（既出） |
| 相性高めバッジ | 観測由来 reason | 不要（既出） |
| 優位ハイライト（✓） | 表示値の差（canonical） | 不要（自明） |
| **③ 比較表の行順** | **無言**（P3-c で傾向反映・理由が出ていない） | ★**ここだけが説明の空白** |

→ **結論: explanation layer の核は「③ 行順がなぜこの順なのか」1 点に絞る。** 他は既存説明で足りる（過剰説明＝ノイズ・アプリが自己弁護して見える uncanny を避ける）。
※ `[CandidateLensPanel.tsx:378]` の「基準について」は現在**ただのラベル**（無機能）＝ここを説明の入口に機能化するのが最小・自然。

---

## 2. honesty / creepiness 原則（薄さの定義）

memory `feedback_surface-hint-freeze`（「兆候あり」1 行で固定・薄い分析に育てない）と `feedback_copy-design-principles` に整合。

1. **行為の説明であって、人格の断定でない**。「並べています」は説明する／「あなたは駅近を好む人です」は言わない。
2. **仮説トーン固定**（「〜のようです / 〜をもとに」）。断定しない。
3. **可逆・主権**: 「元の並びに戻す」を常設。ユーザーがいつでも canonical に戻せる。
4. **sufficient な時だけ出す**: 実際に並びが canonical と変わった時だけ表示（変化が無い／観測が薄い時は出さない＝無いものを説明しない）。
5. **薄さ＝1 行**: 段落にしない。育てない（surface-hint-freeze 思想）。
6. **追跡語を避ける**: 「よく見る順」「履歴から」「監視」→ ❌。「最近の選び方をもとに」→ ✅。
7. **二重説明しない**: 写真/営業時間は Powered by Google で足りる。explanation で重ねて語らない。
8. **①② には出さない**: 説明は ③（並びが変わる場所）に限定。browse/detail を賑やかにしない。

---

## 3. UI 設計（surface・progressive disclosure）

- **入口**: ③ ヘッダ下の既存「基準について」を**機能化**（タップで展開／または直下に 1 行 note）。デフォルトは**畳んだ薄い 1 行**。
- **Tier 1 note（核・1 行）**: 並びが personalized な時だけ、比較表の直上に薄く:
  > 「最近の選び方をもとに、**徒歩の近さ**を上に並べています。」＋ 右に「元の並びに戻す」リンク。
  - 「徒歩の近さ」部分は **実際に前方へ寄せた軸（lead 軸）** を動的に出す（捏造でなく applied 値由来）。
- **制御**: 「元の並びに戻す」→ その ③ セッションで canonical 表示（`preference=undefined` 相当）に切替。**観測は消さない**（表示の主権のみ・可逆）。再表示は「あなたの並びに戻す」。
- **progressive disclosure（任意・将来）**: 「基準について」展開で、比較の読み方（優位＝表示値の差・未確認は捏造しない・Google 提供）を 2〜3 行で補足。Tier 2＝余力時。
- **出さない条件**: explanation が null（並び不変／apply OFF／観測不足）→ note も「戻す」も非表示＝**現状と完全一致**。

---

## 4. コピー案（2 register・CEO 判断）

| register | 例 | 性格 | リスク |
|---|---|---|---|
| **A（行為説明・最安全）** ★推奨デフォルト | 「最近の選び方をもとに、**徒歩の近さ**を上に並べています。」 | 行為のみ・人格に触れない | 低（無味だが安全） |
| **B（やさしい鏡・Aneurasync らしい）** | 「最近は、**近さ**を大事にして選んでいるみたいですね。並びにも反映しています。」 | 観測した傾向を仮説として返す＝自己理解の入口 | 中（行動傾向の言及・「みたい」で緩和） |

- **推奨**: **A をデフォルト出荷**（誤断定リスク最小）→ dogfood で **B を A/B 検証**（納得感・不快感を計測）。B は「みたいですね」の仮説トーン・「並びにも反映」の行為接続・「戻す」併設を厳守する条件で採用可。
- **禁止コピー**: 「あなたは駅近好きです」（人格断定）／「よく見る順」「履歴から」（追跡語）／数字での精度主張（copy-design-principles）。
- lead 軸 → 日本語（honest map・例）: walk_estimate→「徒歩の近さ」/ margin_impact→「予定の余白」/ schedule_fit→「予定とのつながり」/ affinity_reason→「なじみのある場所」/ category→「場所の種類」/ address→「場所」。

---

## 5. pure 層の拡張（実装は別 GO・テスト可能に分離）

`buildLensComparisonView`（`lib/plan/candidateLens/candidateLensUi.ts`）に **explanation payload** を additive 追加（推薦/行順ロジックは不変）:
```ts
// LensComparisonView に追加（preference 適用で順序が canonical と変わった時だけ非 null）
readonly explanation: {
  readonly reordered: true;
  readonly leadAxes: readonly AttributeKey[]; // 前方へ寄せた軸（先頭 1〜2・表示文言の元）
} | null;
```
- 生成: canonical 行順 `canonicalMain.map(r=>r.key)` と applied 行順 `ordered` を比較 → **先頭が変わった時だけ** `reordered:true`＋`leadAxes`=前方化した軸。同一なら `null`。
- ★純粋・捏造なし: leadAxes は **実際に適用された preference 由来**のみ（applyPreferenceToAxes の結果から導出）。UI はこの payload が非 null の時だけ note を出す（§3 出さない条件と一致）。
- copy（軸→日本語）は UI 層の表（§4）。pure 層は AttributeKey を返すだけ（i18n/トーンは UI）。

---

## 6. flag 構成（既存に乗せる・default OFF・production gate 継承）
- 新 UI flag `PLACE_CANDIDATE_LENS_EXPLANATION_ENABLED`（default OFF・dev-only）＋ `isCandidateLensExplanationEnabled()`（P4-e の `envGateOpen()` 同型 or 既存 production hard block 流儀）。
- **依存**: explanation は P3-c apply（`PLACE_CANDIDATE_LENS_PREF_APPLY_ENABLED`）が ON で並びが変わった時のみ意味を持つ。apply OFF → explanation payload は常に null → note 非表示。
- explanation UI flag OFF → note/「戻す」を一切描画しない＝**現状完全不変**（DOM バイト不変）。

---

## 7. やらないこと（スコープ外）
- 人格断定・固定ラベル（「あなたは〜な人」）。
- 追跡語（「よく見る」「履歴」「監視」）。
- 薄い観測での説明（sufficient gate 未達では出さない）。
- 写真/営業時間の二重説明（Powered by Google で足りる）。
- ①②（browse/detail）への説明追加。
- ranking（候補順）への反映や、その説明（候補順は不変＝説明する対象が無い）。
- 観測ログの削除（「戻す」は表示の主権のみ・データ削除は別 opt-out 設計）。

---

## 8. 段階実装案（各別 GO）
- **E-a｜pure explanation payload**: `buildLensComparisonView` に `explanation` を additive 追加＋ unit tests（reordered 判定・leadAxes・null 条件）。UI 不接続。
- **E-b｜UI note + reset（dev-only）**: ③「基準について」機能化＋1 行 note（register A）＋「元の並びに戻す」トグル。explanation flag gate。dev smoke。
- **E-c｜コピー検証**: register A デフォルト → dogfood で B を A/B（納得感・不快感）。採用は CEO。

---

## 9. tests / 受け入れ基準
- pure: 並びが canonical と変化→`explanation.reordered=true`＋leadAxes 正・変化なし/apply OFF/観測不足→`null`。leadAxes は applied preference 由来（捏造なし）。
- UI: explanation flag OFF → note/戻す 非描画（現状一致）。flag ON＋payload 非 null → 1 行 note（lead 軸文言）＋戻す。「戻す」→ canonical 表示・再度「あなたの並びに戻す」で復帰。
- honesty: 人格断定・追跡語が文言に**現れない**（コピー定数の語彙 test）。①②に explanation を出さない。

---

## 10. CEO 判断ポイント
1. **コピー register**: A（行為説明・推奨デフォルト）/ B（やさしい鏡）/ 両方（A 出荷→B 検証）。
2. **surface**: 「基準について」機能化（タップ展開）か、常時 1 行 note か（推奨: 1 行 note＋「基準について」展開は将来）。
3. **「戻す」の意味**: 表示のみ可逆（推奨・観測は保持）/ 観測も含めた opt-out（別設計）。
4. 実装 GO の起点（E-a pure から段階）。

> 本書は設計。**実装は CEO GO（E-a〜）まで行わない。** production 有効化・ranking 反映・観測削除は対象外。
