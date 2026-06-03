# PDF/画像からの予定取り込み readiness **v2**

- **対象**: 紙媒体 / PDF / 画像から Aneurasync Plan に予定を **元原稿どおりに正確に** 反映する機能。
- **状態**: **readiness のみ（実装未着手）**。v1（`alter-plan-pdf-image-import-readiness.md`、2026-05-30 起草）に対して **2025-2026 年 SOTA リサーチを反映 + CEO 指示「最重要 = 元原稿どおりの高品質反映」を最上位制約に再構成** した版。
- **branch**: `feat/plan-pdf-image-import`（v1 と同）。
- **CEO 方針**: 「画像/PDF からの取り込み・反映が、どれだけ元原稿どおりに正確か」が**最優先**。Stargazer 統合などの "膨らみ" は後段（v1 で提案した §5.5 は Phase 2-3 に降格）。
- **日付**: 2026-05-30。CEO 方針 ①〜⑧（前提を疑え / 自立リサーチ / シンプル法案 / 外科的 / 目標駆動 / 人間同等推論 / 革新 / 世界トップシェア）。

---

## §0. 結論（先出し・v2 の核心）

1. **「正確性」の定義を厳密化**（§1）: 8 軸 + event-level precision/recall + golden dataset で測る。**「90% 帯（業界既存）→ 95%+ 帯（我々の目標）」** が勝ち筋。
2. **Single-VLM 1 段から、構造化レイヤー + 意味解釈レイヤーの hybrid に進化**（§5）: 2025-2026 SOTA 文献（OmniDocBench v1.5 / Docling / Mistral OCR 3）が示すとおり、dense table での VLM 単独は cell-level で**71-74% TEDS** に対し、構造化 OCR ベースが **82-97% TEDS**。
3. **Anthropic Structured Outputs（GA 2025-11-14）を必須化**: JSON schema を grammar 制約で token 生成時に縛る → **schema 違反が構造的に不可能**になる（hallucination の主要発生源を 1 つ消す）。
4. **革新点・差別化の核**:
   - **Source-of-Truth Match Mode**（§7・新規）: preview の各イベントに**元 PDF の該当領域を bbox hi-light で並列表示**。ユーザーが「正確に取れたか」を秒で判断できる。Magic Calendar 等にはない。
   - **Round-trip 検証**（§8・新規）: 抽出 JSON を**「PDF と一致してますか？」**第二の VLM パスで自己検証。低信頼を自動検出。
   - **Hybrid architecture**: 既存プロダクト（Calendara 90% / Magic Calendar 体感同等）と差別化、95%+ を本気で狙う。
5. **P0 = アーキ評価ベンチマーク先行**: 4 候補（Sonnet 4.6 / Docling+Sonnet / Mistral OCR 3+Sonnet / Gemini-3-Flash）を**同じ test set**で並走評価 → 数字で 1 つに絞る。v1 の「P0 = VLM 出力評価」を厳密化。
6. **シフト表テンプレート**は Phase 2 維持（v1 のまま）。CEO 提示画像（航空運航シフト表）の構造特性は §10 に反映済。
7. **Stargazer 統合（連勤警告等）**は v1 §5.5 から **Phase 2 末 〜 Phase 3 に降格**。CEO 指示「正確性最優先」の徹底。

---

## §1. 「正確性」の厳密定義（最重要）

「元原稿どおりに正確」を**測れる**ようにする。CEO 主観評価だけでは scale しない。

### 1.1 イベント単位の 8 軸判定（全 ✅ で「完全一致」）

| # | 軸 | 判定基準 |
|---|----|---------|
| 1 | **日付** | YYYY-MM-DD が原稿と完全一致（年/月/日いずれかズレ = 不一致） |
| 2 | **開始時刻** | HH:MM が ±0 分一致（略号「N=22:00-翌7:00」等もそのとおり） |
| 3 | **終了時刻** | HH:MM が ±0 分一致（記載なしの場合は draft.endTime が undefined） |
| 4 | **日跨ぎフラグ** | `endsNextDay` が原稿の意味と一致（夜勤は true、日勤は false） |
| 5 | **タイトル意味等価** | 語順違いは OK、意味として 1 対 1 対応（「日勤」≒「Day shift」） |
| 6 | **場所** | 記載がある場合は完全一致、無い場合は undefined |
| 7 | **取りこぼし無** | 原稿にある予定が抜けない（recall = 1.0） |
| 8 | **取りすぎ無** | 原稿にない予定が出ない（precision = 1.0） |

### 1.2 集計 metric

- **event-level precision** = (正しく取れた予定 / 抽出された予定総数)
- **event-level recall** = (正しく取れた予定 / 原稿の予定総数)
- **F1 = 2PR/(P+R)**
- **全 8 軸完全一致率** = (完全一致イベント / 抽出されたイベント) — これが「ユーザー体感の正確性」に最も近い

### 1.3 ゴール（私の提案・CEO 判断）

| Phase | 目標 | 業界比較 |
|---|---|---|
| Phase 1 リリース | **event-level F1 ≥ 92%** / 全 8 軸完全一致 **≥ 80%** | Calendara 90% / Photo2Calendar 体感同等 |
| Phase 2 リリース（シフト表 vertical） | event-level F1 ≥ 96% / 全 8 軸完全一致 ≥ 92% | 世界トップ |
| Phase 3 | F1 ≥ 98%（実用上の天井） | 業界 SOTA を超える |

### 1.4 Golden dataset（精度測定の前提）

- **CEO 提供 5 PDF + 3 シフト表 + 3 写真**（手書きを含む）= 計 11 件で start
- **私が合成**: PDF（learning event、フィットネス、保育園、病院、イベント）5 件 + シフト表 SNS 公開済例 5 件 = 計 10 件
- **全 21 件に正解 JSON を手動付与**（CEO + 私）
- 各 Phase で**自動回帰評価**（CI に組み込む）
- ユーザーから 30 件追加で**month-1 reaudit**

---

## §2. 前提検証（既存資産との接続・v1 §1 から継続、変更なし）

| 要素 | 既存資産 | 利用 |
|---|---|---|
| イベント形 | `IcsAnchorDraft` (one_off / recurring) | 流用（VLM/OCR 出力を IcsAnchorDraft[] に正規化） |
| TZ | `icsParser.icalTimeToIso` zone-aware | 流用（時刻は JST naive で渡す） |
| dedup | externalUid 完全一致 | ファイル hash + 行 index で UID 合成 |
| 永続化 | `createSourceWithAnchors` | 新 sourceType: `'pdf_extracted'` / `'image_extracted'` |
| preview UI | 既存 preview state | **流用 + 拡張**（§7 Source-of-Truth Match Mode を追加） |
| LLM 基盤 | `lib/ai/runAI` / `runRouter` | **拡張**（VLM/OCR provider を新規追加） |

---

## §3. 2025-2026 SOTA リサーチ要約（独自リサーチ・GPT 案を超える根拠）

### 3.1 VLM 動向

- **Anthropic Claude Sonnet 4.6**: 表処理・財務 / 文書解析で SOTA 領域。前世代 4.5 で出ていた cascading errors を改善（[Anthropic / YBuild 2026](https://ybuild.ai/en/blog/claude-sonnet-4-6-vs-gpt-5-vs-gemini-ai-model-comparison-2026)）
- **Anthropic Structured Outputs (GA 2025-11-14)**: JSON schema を**grammar 制約**として token 生成時に縛る = **schema 違反が構造的に不可能**（[TokenMix 2026](https://tokenmix.ai/blog/structured-output-json-guide)）→ **これは v2 で必須化**
- **Gemini-3-Flash**: OmniDocBench v1.5 で 90.1%（[IDP Leaderboard](https://www.idp-leaderboard.org/benchmarks/omnidocbench)）

### 3.2 OCR / 専用ドキュメント解析

- **Docling (IBM, MIT)**: 複雑表 **97.9%** 精度、**self-host 可** (TableFormer + DocLayNet)（[Procycons 2025](https://procycons.com/en/blogs/pdf-data-extraction-benchmark/), [arXiv 2501.17887](https://arxiv.org/html/2501.17887v1)）
- **Mistral OCR 3**: 表 **96.6% vs Textract 84.8%** / 手書き 88.9% vs Azure 78.2% / **$2 per 1000 pages** / 74% win rate（[VentureBeat](https://venturebeat.com/infrastructure/mistral-launches-ocr-3-to-digitize-enterprise-documents-touts-74-win-rate)）
- **FireRed-OCR**: OmniDocBench v1.5 で **92.94%** SOTA
- **2025-Q4 一気に open-source 加速**: Nanonets OCR2 / DeepSeek-OCR / OlmOCR-2 / PaddleOCR-VL / LightOnOCR-1B

### 3.3 表認識 dense layer

- **dense multi-row/column table**: VLM 単独だと **TEDS 71-74**、OCR-based RapidTable で **82.5**（[OmniDocBench Leaderboard / LlamaIndex 2025](https://www.llamaindex.ai/blog/omnidocbench-is-saturated-what-s-next-for-ocr-benchmarks)）
- 評価 metric は **GriTS F1 (cell-level)**, **TEDS (Tree-Edit Distance)** が標準

### 3.4 Hallucination 緩和

- **構造化制約 (JSON schema, XML)** が最も実用的（[arXiv 2501.10868 JSONSchemaBench](https://arxiv.org/pdf/2501.10868)）
- 学術: Contrastive Decoding (VCD/ECD/SAGE) は研究段階で API 経由では使えない
- 実装での hallucination 緩和は **「制約 + validation + round-trip 検証」の三段**で実現

### 3.5 競合プロダクト

- **Calendara**: 「90%+ 精度」と自称
- **Photo2Calendar / Agenda Hero / Smart Calendars AI**: 体感ほぼ同等、低品質画像で誤読
- → **「95%+ 帯」は競合が踏み込んでいない領域**、ここに我々の差別化空間がある

→ **v1 想定（Sonnet 4.5 単独）の精度上限は dense table で 74% TEDS が天井**。これでは CEO の「元原稿どおり」を満たさない。**Hybrid 構成（構造化 + 意味解釈）が必須**との結論。

---

## §4. アーキテクチャ法案 v2

### 4.1 候補 4 つ

| Arch | 構造化 layer | 意味解釈 layer | 想定精度 | コスト | レイテンシ | self-host | 日本語 |
|---|---|---|---|---|---|---|---|
| **A: Sonnet 4.6 単独** | (なし) | Sonnet 4.6 + Structured Outputs | F1 ~88-92% (汎用) / 表 70-75% TEDS | 中-高 | 1段 | × | ◎ |
| **B: Docling + Sonnet** | Docling (self-host) | Sonnet 4.6 | F1 ~94-97% (表は 97.9% から) | 中（Docling自前） | 2段 | ◎ | △ (英語強・日本語要評価) |
| **C: Mistral OCR 3 + Sonnet** | Mistral OCR 3 (API) | Sonnet 4.6 | F1 ~93-96% (表 96.6%) | **低** ($2/1000pg) | 2段 | × | ◎ (Mistral multilingual) |
| **D: Gemini-3-Flash 単独** | (なし) | Gemini-3-Flash | F1 ~90% (OmniDocBench 90.1%) | 低 | 1段 | × | ◎ |

### 4.2 推奨パス（最重要）

**P0 で 4 候補を golden dataset 21 件で並走評価 → 数字で 1 つ採用**。事前に勝者を決めない（前提を疑う・①）。

予想（リサーチ根拠）:
- **シフト表（dense table）特化**: B (Docling+Sonnet) or C (Mistral OCR 3+Sonnet) が勝つ
- **汎用 PDF（チラシ・予約票・保育園案内）**: A (Sonnet 4.6 単独) が cost/leyatanci で勝つ可能性
- → **混在運用**もあり得る（ドキュメント分類 → 各 arch にルーティング）

### 4.3 採用後の hybrid pipeline

```
[1] PDF/画像 入力
       ↓
[2] 前処理 (回転検出 / EXIF 補正 / PDF→画像 rasterize / 解像度確認)
       ↓
[3] ドキュメント分類 (汎用 vs 表中心 vs シフト表) ← 軽量分類モデル or Sonnet 1-shot
       ↓                                   ↓
[4a] 汎用パス: Sonnet 4.6 + SO  [4b] 表パス: Docling/Mistral → Sonnet 4.6 + SO
       ↓                                   ↓
[5] Deterministic validator (zod + 日付連続性 + 時刻範囲 + 略号辞書)
       ↓
[6] **Round-trip 検証**（第二の VLM パスで自己検証、§8）
       ↓
[7] 信頼度 3 段階分類（§8）
       ↓
[8] Preview UI + **Source-of-Truth Match Mode**（§7、革新）
       ↓
[9] ユーザー承認 → 既存 ICS pipeline (dedup / persist)
```

---

## §5. Source-of-Truth Match Mode（差別化の核・⑦革新）

**問題**: 既存プロダクト（Magic Calendar 等）の preview は「抽出結果リスト」のみ。ユーザーは「これが本当に PDF どおりか」を**判断する手段がない** → 90% 帯で頭打ち。

**解法**: preview の各イベントに **元 PDF の該当領域を bbox 付き hi-light** で並列表示。

### 5.1 実装方針

- 各 VLM/OCR 出力に `sourceRegion: { page, bbox: [x, y, w, h] }` を必須化
- preview UI の各行に「**元を見る** 🔍」ボタン → クリックで PDF 該当ページの該当 bbox を hi-light 表示
- 「**ここから取りました**」が秒で分かる

### 5.2 メリット

- ユーザーが「正確に取れたか」を秒で判断
- 取りこぼし（recall）も「**まだ取れていない予定がここに**」と PDF に sticky 表示
- ハルシネーション検知が**人間 in the loop で確実に効く**

### 5.3 Aneurasync 設計思想との整合

- 「自分のことを知っているプロダクト」= **「自分の予定が PDF のどこから来たか」を本人が把握できる**
- これは透明性 (transparency) であり、第二の自己が**ブラックボックスにならない**ための核

---

## §6. Anthropic Structured Outputs (GA) 活用

### 6.1 仕組み

- JSON schema を grammar 制約として VLM の token 生成を縛る
- **schema 違反 = 構造的に発生不可能**（[Thomas Wiegold Blog](https://thomas-wiegold.com/blog/claude-api-structured-output/)）
- 既存 `runAI` に `output_format: { type: "json_schema", json_schema: {...} }` を渡せば動作

### 6.2 出力 schema（提案）

```typescript
const ExtractionSchema = z.object({
  events: z.array(z.object({
    title: z.string().min(1).max(100),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
    endTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
    endsNextDay: z.boolean(),
    locationText: z.string().nullable(),
    confidence: z.number().min(0).max(1),
    sourceRegion: z.object({
      page: z.number().int().min(1),
      bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    }),
  })),
  ambiguities: z.array(z.object({
    question: z.string(),
    context: z.string(),
    suggestedAnswers: z.array(z.string()).optional(),
  })),
  docMeta: z.object({
    kind: z.enum(["shift_table", "schedule_list", "flyer", "form", "unknown"]),
    month: z.string().regex(/^\d{4}-\d{2}$/).nullable(),
    detectedLanguage: z.string().nullable(),
  }),
});
```

### 6.3 検証 (deterministic) 層

zod の上に追加チェック:
- 日付が doc_meta.month と一致するか
- 開始<終了（endsNextDay=false 時）
- 同一日 同一タイトル の重複
- 略号が辞書に無い → ambiguities に追加
- bbox が有効範囲か

---

## §7. Round-trip 検証（自己検証・⑦革新）

**抽出 JSON を「PDF と一致しているか」第二の VLM パスで検証**。

### 7.1 プロンプト

```
[元 PDF 画像] + [抽出 JSON]
質問: この JSON は PDF の内容を完全に反映していますか？
- 取りこぼしはありますか
- 取りすぎはありますか
- 各イベントの日時/タイトル/場所は正しいですか
回答: { matches: bool, discrepancies: [...] }
```

### 7.2 効果

- ハルシネーション（無い予定を作る）を高確率で検知
- 取りこぼし（PDF にあるのに JSON にない）を検知
- 「中信頼」「低信頼」のフラグ付けに使う

### 7.3 コスト・回避案

- 1 PDF あたり 2× コストがかかる
- → 「全イベント高信頼 + ambiguities 0」の場合は round-trip 省略
- 「信頼度低 or ambiguity あり」の場合のみ round-trip 起動

---

## §8. 信頼度 3 段階の具体化

| 段階 | 閾値 | UI 扱い | 自動採用 |
|---|---|---|---|
| **高** | confidence ≥ 0.85 ∧ 検証層 PASS ∧ Round-trip discrepancy 0 ∧ 略号辞書 hit | ✓ default 選択（user は確認のみ） | yes |
| **中** | confidence 0.5-0.85 ∨ 検証層 1 flag ∨ Round-trip 軽微 discrepancy | ⚠ default 未選択（user が選んで反映） | no |
| **低** | confidence < 0.5 ∨ 略号 miss ∨ ambiguity ∨ Round-trip 重大 discrepancy | ✎ 下書き保持（追加情報待ち、反映しない） | no |

### 8.1 confidence の合成式（提案）

```
confidence = 0.4 × VLM_confidence
           + 0.3 × deterministic_validator_score  (0-1)
           + 0.2 × round_trip_consistency_score   (0-1, omit時 0.7 default)
           + 0.1 × dictionary_hit_rate            (シフト表のみ)
```

---

## §9. プライバシー / セキュリティ（v1 §6 から進化）

| リスク | 対策 |
|---|---|
| シフト表に他人の名前・予定 | **本人行 local crop**（client で本人行を選択 → その行だけ image にしてから送信）。option で全体送信 |
| 会社の機密 PDF | 「個人利用範囲ですか？」consent。「業務利用範囲」は警告 |
| VLM/OCR API への送信 | https + Anthropic / Mistral の no-train clause 確認 |
| OCR raw 保存 | しない（discarded）、anchors + bbox 参照のみ永続化 |
| Source-of-Truth Match の bbox 表示用画像 | client 一時保存のみ、サーバに長期保存しない |
| テンプレートに他人情報 | 保存時に「他人の名前を含めない」hint |

### 9.1 PII / 本人特定の local 化

- 「本人行特定」は **Phase 2 で local 実行可能**（user name pattern match）
- VLM に送る前に本人行だけ切り出す → **他人の予定が API に流れない**

---

## §10. シフト表テンプレート（Phase 2、CEO 提示画像反映）

CEO 提示の航空運航シフト表 (2025/2) の特性を v1 §3.2 で抽出した内容を反映 + 拡張:

### 10.1 テンプレート JSON 構造

```json
{
  "templateId": "uuid",
  "userId": "uuid",
  "kind": "shift_table",
  "personRow": {
    "displayName": "石原 陽太郎",
    "rowFingerprint": "<hash of header pattern>",
    "altNames": ["石原"]
  },
  "layoutHints": {
    "orientation": "landscape",
    "rotation": 90,
    "dateAxis": "top",
    "personAxis": "left"
  },
  "abbreviations": {
    "G":    { "label": "日勤",      "startTime": "09:00", "endTime": "17:45", "endsNextDay": false },
    "E-18": { "label": "早朝勤務18", "startTime": "06:15", "endTime": "18:15", "endsNextDay": false },
    "E-16": { "label": "早朝勤務16", "startTime": "06:00", "endTime": "16:00", "endsNextDay": false },
    "N":    { "label": "夜勤",      "startTime": "22:00", "endTime": "06:45", "endsNextDay": true },
    "L":    { "label": "遅番",      "startTime": "14:00", "endTime": "22:45", "endsNextDay": false },
    "AL":   { "label": "有給",      "isOff": true },
    "HREQ": { "label": "希望休",    "isOff": true },
    "BD":   { "label": "BD",        "isOff": false, "needsUserInput": true }
  },
  "colorRules": {
    "green":  { "implies": "G" },
    "pinkLight": { "implies": "HREQ" },
    "navy":   { "implies": "N" },
    "blue":   { "implies": "L" }
  },
  "notesField": "下部の連絡事項欄を別の予定として抽出"
}
```

### 10.2 テンプレート学習プロセス（v1 §5.3 を進化）

1. **初回**: ユーザー upload → VLM が **テンプレート JSON 候補を自動生成**（凡例自動読み取り）
2. **ユーザー編集**: 不確定略号 (BD など) を補完、本人行を確認
3. **保存**: `user_shift_templates` テーブル
4. **2 回目以降**: fingerprint で auto-match → そのまま略号辞書適用
5. **fingerprint mismatch**: 「前回と変わっています、再学習しますか？」

### 10.3 セル内複数名（代務）の扱い

「松田/田口」のように同セル複数名:
- 本人含む → 本人の予定として採用 (代務メモを title に付与)
- 本人含まず → ambiguities に登録（low confidence）

---

## §11. 第二の自己統合（Phase 2 末 〜 Phase 3 に降格）

v1 §5.5 を CEO 指示「正確性最優先」に従い**降格**:
- Phase 2 で**シフト表精度を担保した後**、Stargazer 統合（連勤警告・睡眠タイプ照合）を追加
- Phase 1 / Phase 2 前段では一切触らない（焦らない）
- これは差別化の核だが、**precision が低い段階で警告を出すと user の信頼を失う**ため、土台精度 95%+ 達成後

---

## §12. コスト試算

### 12.1 1 PDF あたり cost

| Arch | 1 PDF | 100 PDF/user/月 | 1000 PDF/user/月 |
|---|---|---|---|
| A: Sonnet 4.6 単独 | ~$0.03-0.05 (image+prompt) | $3-5 | $30-50 |
| B: Docling+Sonnet | ~$0.02-0.03 (Sonnet のみ、Docling自前) | $2-3 | $20-30 |
| C: Mistral OCR 3+Sonnet | ~$0.005 (OCR $0.002 + Sonnet $0.003) | **$0.5** | **$5** |
| D: Gemini-3-Flash | ~$0.005-0.01 | $0.5-1 | $5-10 |

→ **C, D が cost 最強**。ただし精度は P0 で確認。

### 12.2 Round-trip 検証コスト

- 2× にしないため、「ambiguity あり時のみ」起動
- 想定 10-20% のリクエストで起動 → 全体 +10-20% cost

### 12.3 月間予算試算（Beta 100 ユーザー × 月 10 PDF）

- Arch A: $30-50/月
- Arch C: $5/月
- → 当面の Beta 期間は問題なし

---

## §13. リスク・難所（v1 §9 を更新）

1. **VLM 精度 vs cost** → P0 で実評価
2. **PDF → 画像化**: Node.js で pdf-lib + canvas / Vercel serverless で動くか確認（冷起動）
3. **画像 EXIF 回転**: HEIC（iPhone）対応必須
4. **シフト表月またぎ・年またぎ**: 日付正規化で対応
5. **テンプレート version 管理**: 旧 anchors 整合
6. **OCR fallback**: VLM 完全失敗時の純 OCR（Tesseract/PaddleOCR）
7. **コスト管理**: rate limit + monthly cap
8. **法的リスク**: 会社機密 PDF / 個人情報の海外 API 送信 → consent + no-train 明示
9. **日本語精度**: Docling 英語強・日本語要評価 / Mistral / Sonnet は問題なし想定
10. **bbox の精度**: VLM 出力 bbox の信頼性 → Docling / Mistral の方が高精度
11. **Source-of-Truth Match Mode の UX**: PDF viewer 実装が必要（pdf.js）→ Phase 1 から含めるとスコープ増加 → **CEO 判断**: Phase 1A は preview list のみ、Phase 1B で Source-of-Truth Match Mode

---

## §14. フェーズ案 v2（v1 §8 を更新）

| Phase | 内容 | 完了条件 | stop |
|---|---|---|---|
| **P0-1** | Golden dataset 21 件構築（CEO + 私）+ 正解 JSON 付与 | dataset commit | →stop |
| **P0-2** | 4 architecture を golden で並走評価 (A/B/C/D + Source-of-Truth bbox 精度) | 数値比較 + 採用 1 つ | →stop（採用 arch CEO 承認） |
| **P1A-1** | sourceType migration draft (`pdf_extracted` / `image_extracted`) + union | unit / tsc | →stop |
| **P1A-2** | 採用 arch の呼び出し helper (`extractPlanFromVision.ts`) + Structured Outputs + zod | unit (mock VLM) | →stop |
| **P1A-3** | deterministic validator (`extractionValidator.ts`) + round-trip 検証 helper | unit | →stop |
| **P1A-4** | server action `extractPlanFromFileAction` (auth + arch + 検証 + draft 返却) | unit | →stop |
| **P1A-5** | wizard modal (PDF/画像取り込み専用) + preview list (Source-of-Truth Match Mode は **P1B** に分離) | render + smoke | →stop |
| **P1A-6** | staging smoke (CEO 実機、汎用 PDF 5 例) | golden 評価 F1 ≥ 92% / 完全一致 ≥ 80% / CEO pass | →stop |
| **P1B** | Source-of-Truth Match Mode (PDF viewer + bbox hi-light) | render + smoke | →stop |
| **P2-1** | shift_template DB スキーマ + repository | unit | →stop |
| **P2-2** | VLM プロンプト拡張: 初回 PDF からテンプレ自動推定 | unit + 実例 | →stop |
| **P2-3** | テンプレート編集 UI（本人行 / 略号辞書 / 日跨ぎ / 色 / 凡例補完） | render + smoke | →stop |
| **P2-4** | 2 回目以降自動マッチ + 略号辞書適用 + 日跨ぎ生成 | unit + 実シフト 3 ヶ月 / F1 ≥ 96% | →stop |
| **P2-5** | Stargazer 統合（連勤警告・睡眠タイプ照合、v1 §5.5 の降格版） | 設計判断 + 実装 | →stop |
| **P3-X** | 手書き・写真ロバスト性 / 高度補正 | 別 phase | - |

→ **P0 を最初にやる**ことが v1 との最大の差。「事前に勝者を決めず数字で決める」プロセス。

---

## §15. CEO 判断仰ぐ点（v1 から進化）

1. **P0 評価先行**: golden 21 件 + 4 arch 並走評価から開始で良いか（推奨）
2. **目標精度**: Phase 1 リリースの目標 F1 ≥ 92% / 完全一致 ≥ 80% で良いか
3. **アーキ採用**: P0 結果次第だが、**事前に絞らない**で良いか（A: コスト高・精度高 / C: コスト低・精度高 / D: コスト低・1段）
4. **Source-of-Truth Match Mode** を P1B (P1A の直後) で実装するか、Phase 2 に降格するか
5. **本人行 local crop**: Phase 1 から実装するか、Phase 2 (シフト表時) に絞るか
6. **コスト試算**: Arch C なら Beta 100 ユーザー × 月 10 PDF = $5/月。これで予算 OK か
7. **Round-trip 検証**: ambiguity あり時のみ起動の方針で良いか
8. **Golden dataset**: CEO が提供する 11 件 + 私の合成 10 件で start で良いか
9. **dataset の中身**: シフト表は CEO 提示済の 1 件 + 別フォーマット 2 件、汎用 PDF は CEO 業務範囲外で OK か
10. **Wizard modal vs 既存 modal 統合**: 別 modal 推奨（v1 と同）

---

## §16. 今回の stop

- 本書 = **readiness v2 のみ**。実装には入らない。
- branch `feat/plan-pdf-image-import` に本 doc を commit して停止。
- v1 (`alter-plan-pdf-image-import-readiness.md`) は**残置**（進化の記録）。
- **GO の場合**: P0-1（golden dataset 構築）から開始。CEO に PDF 5 件 + シフト表 2-3 件 + 写真 1-2 件の提供依頼。
- push/PR/remote は GitHub 復旧後に別判断。

---

## 参考文献（リサーチ実施・出典）

- [Anthropic Claude Sonnet 4.6 vs GPT-5 vs Gemini 3 (YBuild 2026)](https://ybuild.ai/en/blog/claude-sonnet-4-6-vs-gpt-5-vs-gemini-ai-model-comparison-2026)
- [Anthropic Structured Outputs GA (Tokenmix 2026)](https://tokenmix.ai/blog/structured-output-json-guide)
- [Anthropic Structured Outputs Complete Guide (Thomas Wiegold)](https://thomas-wiegold.com/blog/claude-api-structured-output/)
- [PDF Data Extraction Benchmark 2025 (Procycons)](https://procycons.com/en/blogs/pdf-data-extraction-benchmark/)
- [IBM Granite-Docling Announcement](https://www.ibm.com/new/announcements/granite-docling-end-to-end-document-conversion)
- [Docling AAAI 2025 (arXiv 2501.17887)](https://arxiv.org/html/2501.17887v1)
- [Mistral OCR 3 Launch (VentureBeat)](https://venturebeat.com/infrastructure/mistral-launches-ocr-3-to-digitize-enterprise-documents-touts-74-win-rate)
- [Mistral OCR 3 Review (PyImageSearch)](https://pyimagesearch.com/2025/12/23/mistral-ocr-3-technical-review-sota-document-parsing-at-commodity-pricing/)
- [OmniDocBench CVPR 2025 (GitHub)](https://github.com/opendatalab/OmniDocBench)
- [OmniDocBench v1.5 Leaderboard (IDP)](https://www.idp-leaderboard.org/benchmarks/omnidocbench)
- [OmniDocBench Saturation (LlamaIndex 2025)](https://www.llamaindex.ai/blog/omnidocbench-is-saturated-what-s-next-for-ocr-benchmarks)
- [2025 OCR Revolution VLM (TechEon Medium)](https://atul4u.medium.com/beyond-text-extraction-the-2025-open-ocr-revolution-powered-by-vision-language-models-89ad33d36bbf)
- [VLM Table Extraction Benchmarking (ACL XLLM 2025)](https://aclanthology.org/2025.xllm-1.2.pdf)
- [JSONSchemaBench (arXiv 2501.10868)](https://arxiv.org/pdf/2501.10868)
- [VLM Hallucination Survey (multiple arXiv 2025)](https://arxiv.org/pdf/2504.12137)
- 競合製品: [Photo2Calendar (MUO)](https://www.makeuseof.com/this-app-turns-my-screenshots-into-calendar-events-saves-me-time/), [Calendara](https://www.usecalendara.com/blog/extract-events-from-screenshots-guide), [Agenda Hero Magic (Product Hunt)](https://www.producthunt.com/products/agenda-hero-magic), [Smart Calendars AI](https://www.smartcalendars.ai/en)
