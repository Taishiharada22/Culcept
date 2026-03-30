# Home Alter 品質監査レポート

**監査日**: 2026-03-29
**対象**: `lib/stargazer/alterHomeAdapter.ts` + `app/api/stargazer/alter/route.ts`
**テストスイート**: `tests/unit/stargazer/homeAlterAudit.test.ts` (84テストケース)

---

## 1. 総合評価

| 監査軸 | 状態 | 精度/評価 | 優先度 |
|--------|------|-----------|--------|
| A. トーン | 合格 | formatHomeAlterResponse で命令形→提案形の変換が機能。ただし `断れ` 未対応 | P1 |
| B. 出力品質 | 合格 | validateHomeAlterResponse の10項目検査が正常動作 | - |
| C. 整合性 (metadata/text/mode) | 合格 | reconcileDecisionMetadata の構造ルール正常。parseDecisionMetadata のフォールバック正常 | - |
| D-1. カテゴリ分類 | 要改善 | **81.0%** (68/84) — work カテゴリの検出漏れ | P1 |
| D-2. ドメイン検出 | 要改善 | **70.2%** (59/84) — self ドメインの検出弱い | P1 |
| D-3. 応答モード | 危険 | **40.5%** (34/84) — conclude すべき場面で branch になりすぎ | **P0** |
| E. 学習ループ | 正常 | followup API + insight injection が機能 | - |

---

## 2. P0: 応答モード精度 40.5% の原因分析

### 問題
`selectResponseMode` が conclude を返すべき場面の大半で branch を返す。
84テストケース中、50件で不一致（全て conclude→branch の方向）。

### 根本原因
`selectResponseMode` の branch 条件が緩すぎる:

```typescript
// 現在のロジック:
if (ctx.ambiguity_score > 0.5 && ctx.domain_confidence > 0) return "branch";
if (ctx.ambiguity_score > 0.65) return "branch";
```

`ambiguity_score` = unknown変数数 / 6。隠れ変数6個中4個以上が unknown なら 0.67 → branch。

**問題**: ほとんどの自然文は4個以上 unknown になる。例:
- 「上司が飲みに行こうって言ってるけど最近疲れてる」
  - target_type: specific_person, relationship_distance: medium, urgency: unknown
  - emotional_stake: unknown, social_risk: unknown, reversibility: unknown
  - → 3/6 unknown = 0.5 → domain_confidence > 0 なので branch

`ambiguity_score > 0.5` が事実上ほぼ全ての文にマッチしている。

### 修正案 (P0)

**選択肢A**: 閾値を引き上げる
```typescript
// branch 条件をもっと厳しく
if (ctx.ambiguity_score > 0.65 && ctx.domain_confidence > 0) return "branch";
if (ctx.ambiguity_score > 0.8) return "branch";
```

**選択肢B**: 文の情報量で判定する（推奨）
```typescript
// 質問に主語+述語+対象があれば conclude
const hasSubjectVerb = /[がはも].{2,20}[るいたすく？?]/.test(message);
const messageLength = message.length;
if (hasSubjectVerb && messageLength > 15) return "conclude";
// 短文 + unknown多 → branch
if (ctx.ambiguity_score > 0.65) return "branch";
return "conclude";
```

**影響範囲**: `selectResponseMode` のみ。`analyzeQueryContext` は変更不要。
**リスク**: branch→conclude に寄せすぎると、本来聞くべき情報を聞かずに回答するリスク。ただし現状は逆方向（聞きすぎ）。

---

## 3. P1: カテゴリ分類精度 81.0% の改善

### 不一致パターン

| パターン | 件数 | 例 |
|----------|------|-----|
| work キーワード不足 | 10件 | 「転職」「プレゼン」「副業」「起業」「同僚」「残業」が work にマッチしない |
| gathering キーワード不足 | 3件 | 「忘年会」「新歓」「一次会」「参加」が gathering にマッチしない |
| 誤分類 (general→work) | 1件 | 「仕事の愚痴」→ work（正しいのは general） |
| 混在カテゴリ | 2件 | 飲み会+仕事 → work 優先、飲み会+謝罪 → gathering |

### 修正案

`classifyQuestion` の regex を拡張:

```typescript
// work: 追加キーワード
if (/仕事|タスク|業務|進め方|やり方|働|プロジェクト|転職|プレゼン|副業|起業|同僚|残業|キャパ|退職|面接/.test(m)) return "work";

// gathering: 追加キーワード
if (/飲み会|集まり|パーティ|飲み|宴会|食事会|誘[わい]|忘年会|新歓|送別会|一次会|二次会|参加/.test(m)) return "gathering";
```

**影響範囲**: `classifyQuestion` のみ。CATEGORY_FACT_PRIORITY の ranking に影響。
**リスク**: 低。カテゴリは fact 選択の優先順位に使うだけで、判断結果には直接影響しない。

---

## 4. P1: ドメイン検出精度 70.2% の改善

### 不一致パターン

| パターン | 件数 | 例 |
|----------|------|-----|
| self → general | 12件 | 「やる気」「自信」以外の self 表現が検出されない |
| family 検出弱い | 3件 | 「母」単独、「親に〜相談」 |
| friend 検出弱い | 2件 | 「飲み会で失言」→ friend |
| romance 検出弱い | 2件 | 「同じような人を好きになる」 |

### 修正案

`DOMAIN_SIGNALS` の拡張:

```typescript
self: [
  /やる気/, /自信/, /不安[だで]/, /モチベ/, /落ち込[むみんで]/,
  /疲れ[たて]/, /眠れ/, /イライラ/, /焦[りる]/, /何もしたくない/,
  /自分[がはのを].*わから/, /どうしたらいい.*自分/,
  // 追加:
  /似合わない/, /寝つき/, /髪切/, /ジム/, /趣味/, /SNS.*やめ/,
  /怖い.*分からない/, /比べ/, /ギリギリ/, /嬉しすぎ/,
  /全部嫌/, /もう無理/, /こんな目/,
],
family: [
  // 追加: 「母」単独のマッチング改善
  /母[がにはをと]/, /母と/, /親に/,
],
```

**影響範囲**: `analyzeQueryContext` のドメイン検出。`buildDomainOverlay` の性格オーバーレイに影響。
**リスク**: 中。ドメイン検出がプロンプトの性格オーバーレイを変えるため、判断のニュアンスが変わる可能性。

---

## 5. P1: トーンの未対応パターン

### 発見された未対応命令形

`formatHomeAlterResponse` で変換されない命令形:

| 命令形 | 出現可能性 | 修正案 |
|--------|-----------|--------|
| `断れ` | 高（飲み会拒否の文脈） | `断ってみるのがよさそうです` |
| `行け` | 中 | `行ってみるのがよさそうです` |
| `やれ` | 中 | `やってみるのがよさそうです` |
| `聞け` | 低 | `聞いてみるのがよさそうです` |
| `待て` | 低 | `待ってみるのがよさそうです` |

### 修正案

```typescript
// formatHomeAlterResponse に追加
result = result.replace(/断れ(?!る|ば|ない)([。.])/g, "断ってみるのがよさそうです$1");
result = result.replace(/断れ(?!る|ば|ない)$/gm, "断ってみるのがよさそうです");
result = result.replace(/行け(?!る|ば|ない)([。.])/g, "行ってみるのがよさそうです$1");
result = result.replace(/行け(?!る|ば|ない)$/gm, "行ってみるのがよさそうです");
result = result.replace(/やれ(?!る|ば|ない)([。.])/g, "やってみるのがよさそうです$1");
result = result.replace(/やれ(?!る|ば|ない)$/gm, "やってみるのがよさそうです");
result = result.replace(/聞け(?!る|ば|ない)([。.])/g, "聞いてみるのがよさそうです$1");
result = result.replace(/聞け(?!る|ば|ない)$/gm, "聞いてみるのがよさそうです");
result = result.replace(/待て(?!る|ば|ない)$/gm, "待ってみるのがよさそうです");
```

**リスク**: 低。可能形（断れる/行ける）は negative lookahead で保護済み。

---

## 6. 良い点（維持すべきもの）

1. **ForceBalance → ActionShape 変換が正確**: 5ケース全て正しく動作
2. **reconcileDecisionMetadata の構造ルール**: relation=low ルール、cost=high ルールが正常動作
3. **parseDecisionMetadata のフォールバック**: メタデータブロック欠損時にテキスト推論が動作
4. **validateHomeAlterResponse の10項目検査**: 結論先行・次の一手・具体性・判断放棄の検出が正常
5. **formatHomeAlterResponse の「君」「あなた」除去**: 全パターン正常動作
6. **命令形→提案形変換**: 主要パターン（しろ/せよ/送れ/選べ/書け/出せ/試せ/メモしろ等）対応済み
7. **SHAPE_SIGNAL_PATTERNS の統一**: inferActionShapeFromText と reconcileDecisionMetadata で同一パターンを使用

---

## 7. 失敗ケース集（最小10件）

| # | ID | 入力 | 期待 | 実際 | 問題 | 原因 | 修正箇所 |
|---|-----|------|------|------|------|------|----------|
| 1 | W01 | 転職するか悩んでる | category=work | general | 「転職」が work regex にない | classifyQuestion | regex 追加 |
| 2 | W03 | プレゼン明日なのに全然準備してない | category=work | general | 「プレゼン」が work regex にない | classifyQuestion | regex 追加 |
| 3 | CA06 | どうして母と話すとイライラ | domain=family | self | 「母と」が family signals にマッチしない | DOMAIN_SIGNALS | regex 追加 |
| 4 | GN04 | ジム行くべき？ | domain=self | general | 短文で self シグナル不足 | DOMAIN_SIGNALS | regex 追加 |
| 5 | O01 | 明日の面接、何着ていけばいい？ | mode=conclude | branch | ambiguity_score 閾値低すぎ | selectResponseMode | 閾値調整 |
| 6 | C04 | 元カレから連絡きた。返信すべき？ | mode=conclude | branch | 十分な情報あるのに branch | selectResponseMode | 閾値調整 |
| 7 | W05 | 上司のやり方に納得いかない。言うべき？ | mode=conclude | branch | 主語+行動あるのに branch | selectResponseMode | 閾値調整 |
| 8 | CA04 | 最近やる気が出ない原因が知りたい | mode=conclude | branch | cause 系は conclude すべき | selectResponseMode | cause 系例外 |
| 9 | G06 | 元カノも来るかもしれない忘年会 | category=gathering | general | 「忘年会」が gathering にない | classifyQuestion | regex 追加 |
| 10 | S03 | 一次会だけ行って帰ろうかな | category=gathering | general | 「一次会」が gathering にない | classifyQuestion | regex 追加 |
| 11 | tone | 断れ。 | 提案形に変換 | 変換なし | formatHomeAlterResponse 未対応 | formatHomeAlterResponse | regex 追加 |
| 12 | G03 | 飲み会断りたいけど付き合い悪い | domain=work | romance | 「付き合」が romance にマッチ | DOMAIN_SIGNALS | 「付き合い」除外 |

---

## 8. 改善優先順位

### P0 (即時対応推奨)
1. **応答モード閾値の調整** — `selectResponseMode` の branch 条件を `ambiguity_score > 0.65` に引き上げ + 文長条件追加

### P1 (早期対応)
2. **カテゴリ regex 拡張** — 転職/プレゼン/副業/起業/同僚/残業/忘年会/新歓/一次会 を追加
3. **ドメイン regex 拡張** — self/family/friend の検出パターン追加
4. **トーン: 断れ/行け/やれ 変換追加** — formatHomeAlterResponse に5パターン追加

### P2 (改善フェーズ)
5. **ドメイン混在時の優先ルール** — romance シグナルの「付き合」が「付き合い悪い」にマッチする問題
6. **cause カテゴリの応答モード例外** — 原因探索系は branch より conclude が適切

---

## 9. テストスイート

- **ファイル**: `tests/unit/stargazer/homeAlterAudit.test.ts`
- **テストケース数**: 84件
- **カテゴリ分布**: gathering=10, outfit=8, contact=10, work=10, cause=8, general=38 (エッジケース含む)
- **ドメイン分布**: romance=8, work=18, friend=8, family=5, self=17, general=28
- **応答モード分布**: conclude=58, branch=23, clarify=3
- **テスト実行**: `npx vitest run tests/unit/stargazer/homeAlterAudit.test.ts`
- **全33テスト pass** (統計評価方式)

---

## 10. 人手監査フレームワーク（LLM出力の品質評価用）

以下の5段階評価を各レスポンスに対して実施:

| 評価軸 | 1 (最低) | 3 (普通) | 5 (最高) |
|--------|----------|----------|----------|
| 自然さ | 機械的・テンプレ感 | 読めるが堅い | 友人と話しているよう |
| やさしさ | 命令的・上から | 丁寧だが距離感 | 寄り添い・安心感 |
| 個別性 | 誰にでも言える内容 | 一部データ反映 | この人にしか言えない |
| 判断明確性 | 曖昧・放棄 | 結論あるが弱い | 一読で判断が伝わる |
| 次の一手の具体性 | 漠然・汎用 | ある程度具体的 | 今日1分でできる |

**合格ライン**: 全5軸の平均 3.5 以上、かつ判断明確性 3 以上
