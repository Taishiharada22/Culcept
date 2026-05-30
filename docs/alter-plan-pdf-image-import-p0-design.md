# PDF/画像取り込み P0-1 評価設計書（Phase 0 = 数字で arch を決める）

- **対象**: PDF/画像取り込み実装に入る前の **「測れる品質」設計**。GPT 補正 #7「実装前に P0-1 を完全具体化」を受けた本命作業。
- **状態**: 設計のみ（実装未着手）。CEO 承認後に P0 実行に入る。
- **branch**: `feat/plan-pdf-image-import` 継続。
- **前提**: readiness v2 + v2.1 補正パッチ採用済。Phase 1 対象は **表形式の勤務表 / 時間割 / 当番表**に限定。
- **日付**: 2026-05-30。CEO 方針 ①〜⑧。

---

## §0. 結論（先出し）

「**測れない品質は守れない**」を実体化する設計書。本書で固めるもの:

1. **Golden dataset 25 件**（CEO 提供 11 + 私の合成 14）+ 正解 JSON の形式
2. **個別指標 8 軸**（v2.1 §1 を実測可能形に具体化）+ 集計 metric の計算式
3. **4 architecture × 5 設定 = 20 条件並走評価**（GPT 補正 #1）
4. **本人行指定 UX**（fingerprint アプローチ・私の独自）
5. **略号辞書 UX**（自動凡例 OCR + ユーザー補完・私の独自）
6. **採用基準**（どの数字でどの arch を採用するか）
7. **P0 実行手順 + 工数見積もり**

---

## §1. Golden dataset 設計

### 1.1 構成（計 25 件）

| 区分 | 種類 | 件数 | 入手 |
|---|---|---|---|
| **デジタル PDF** | 勤務表 | 5 | 3 CEO 提供（航空運航 + 2 他業種） + 2 私の合成 |
| | 学校時間割 | 3 | CEO 提供 1 (子のもの可) + 2 公開 PDF |
| | 部活/当番表 | 2 | 公開ソース or 合成 |
| **スキャン PDF** | 勤務表 | 3 | CEO 提供（実シフト表のスキャン） |
| | 時間割 | 1 | 私の合成 |
| **スマホ撮影画像** (PNG/HEIC) | 紙の勤務表 | 4 | CEO 提供 |
| | 紙の時間割 | 2 | 公開 |
| **screenshot** | スクショ勤務表 | 3 | 私の合成 |
| **edge case** | 手書きシフト 1 / 多月またぎ 1 | 2 | 私の合成 |

→ **合計 25 件**。GPT 補正「20-30 件」レンジの中央。

### 1.2 サンプル多様性の確保

- 業種: 航空 / 看護 / コンビニ / 物流 / コールセンター / 教育 / 飲食
- レイアウト: 横長 / 縦長 / 90°回転 / 多列 / 多行
- 言語: 日本語主 / 英語混在
- 解像度: 150-600 dpi
- 色: モノクロ / カラー（色が意味を持つもの含む）
- 凡例: 完全 / 不完全 / なし

### 1.3 正解 JSON 形式（重要）

各ファイルに対して **golden JSON** を作る:

```typescript
{
  "fileId": "uuid",
  "fileMeta": {
    "name": "shift-2025-02.pdf",
    "sha256": "...",
    "pageCount": 1,
    "kind": "shift_table" | "schedule_list" | "timetable" | "duty_roster",
    "medium": "pdf" | "scan_pdf" | "image" | "photo" | "screenshot",
    "language": "ja"
  },
  "personRow": {
    "displayName": "石原 陽太郎",
    "rowIndexFromTop": 1,  // 1-based
    "bbox": [x, y, w, h]   // 本人行の bbox
  },
  "abbreviationDictionary": {
    "G":    { "label": "日勤",       "startTime": "09:00", "endTime": "17:45", "endsNextDay": false, "isOff": false },
    "E-18": { "label": "早朝勤務18", "startTime": "06:15", "endTime": "18:15", "endsNextDay": false, "isOff": false },
    "N":    { "label": "夜勤",       "startTime": "22:00", "endTime": "06:45", "endsNextDay": true,  "isOff": false },
    "AL":   { "label": "有給",       "isOff": true },
    "HREQ": { "label": "希望休",     "isOff": true }
  },
  "events": [
    {
      "id": "ev-001",
      "date": "2025-02-01",
      "title": "日勤",
      "abbreviation": "G",  // golden で略号も持つ
      "startTime": "09:00",
      "endTime": "17:45",
      "endsNextDay": false,
      "isOff": false,
      "locationText": null,
      "sourceRegion": {
        "page": 1,
        "bbox": [120, 340, 28, 22]  // セルの bbox
      }
    },
    // ... 28 日分 × 本人行
  ],
  "annotationMeta": {
    "annotator": "CEO" | "claude",
    "verifiedBy": "CEO",
    "annotatedAt": "2026-05-30T...",
    "notes": "..."
  }
}
```

### 1.4 golden JSON 作成プロセス

1. **私が PDF/画像を見て VLM (Sonnet 4.6) で 1st draft**
2. **私が 1st draft を手動レビュー + 修正**（VLM ミス潰し）
3. **CEO が抜き取り検証**（5/25 件 = 20% 程度を CEO が確認）
4. **golden 確定**: フォルダ `evaluation/golden/` に commit

### 1.5 Golden の 2 重価値（私の独自・⑦）

このフォーマットは:
- ✅ 評価データ（現在の用途）
- ✅ 将来のテンプレート学習の初期 corpus
- ✅ prompt few-shot example
- ✅ Source-of-Truth Match Mode の bbox 検証用

→ 一度作れば 4 用途に再利用。**evaluation の投資が product asset 化する**。

---

## §2. 個別評価指標（v2.1 §1 を実測可能形に）

### 2.1 イベント単位の 8 軸判定

Phase 1 の golden 25 件について、各イベントを以下で評価:

| # | 指標 | 計算 | 失敗例 |
|---|---|---|---|
| 1 | **date_exact** | golden.date == extracted.date（YYYY-MM-DD） | 「2/14」を「2/13」と読む |
| 2 | **startTime_exact** | golden.startTime == extracted.startTime（±0 分） | 「6:15」を「6:00」と読む |
| 3 | **endTime_exact** | golden.endTime == extracted.endTime（±0 分、null も比較） | 「18:15」を null |
| 4 | **endsNextDay_correct** | golden.endsNextDay == extracted.endsNextDay | 「N」を日内で取って日跨ぎフラグ false |
| 5 | **title_semantic_match** | LLM-as-judge で「意味として等価」判定 (score ≥ 0.9) | 「日勤」を「会議」と取る |
| 6 | **location_exact** | golden.locationText == extracted.locationText（or 両方 null） | 場所を取りこぼし |
| 7 | **abbreviation_match** | golden.abbreviation == extracted.source_abbreviation | 略号が辞書ミスマッチ |
| 8 | **sourceRegion_iou** | golden.bbox と extracted.bbox の IoU ≥ 0.5 | bbox がズレている |

### 2.2 集計 metric

**ファイル単位**:
- `precision = 正しく抽出されたイベント数 / 抽出された全イベント数`
- `recall = 正しく抽出されたイベント数 / golden イベント数`
- `F1 = 2 × P × R / (P + R)`
- `全 8 軸完全一致率 = (全 8 軸 ✅ のイベント数) / 抽出イベント数`

**「正しく抽出された」の定義（厳密）**:
- 軸 1-4（date, startTime, endTime, endsNextDay）が全 ✅ + 軸 5（title 意味等価）✅
- = 「予定として実用上正しい」最低条件

### 2.3 目標数値（v2.1 §1.3 を表形式 vertical 限定で厳しく）

| 指標 | Phase 1 ターゲット | Phase 2 ターゲット |
|---|---|---|
| event-level F1 | ≥ **92%** | ≥ **95%** |
| 全 8 軸完全一致率 | ≥ **80%** | ≥ **92%** |
| date_exact | ≥ 99% | ≥ 99% |
| startTime_exact | ≥ **97%** | ≥ **99%** |
| endTime_exact | ≥ **97%** | ≥ **99%** |
| endsNextDay_correct | ≥ **99%** | ≥ **99.5%** |
| title_semantic_match | ≥ 95% | ≥ 97% |
| abbreviation_match | ≥ **97%** | ≥ **99.5%** |
| sourceRegion_iou ≥ 0.5 | ≥ 90% | ≥ 95% |

→ **時刻一致 97%+ / 日跨ぎ 99%+ / 略号 97%+** は GPT 提案の「シフト表特化なら厳しく」を反映。

---

## §3. 4 architecture × 5 設定 = 20 条件並走（GPT 補正 #1）

### 3.1 architecture 候補（v2 §4）

- **A**: Sonnet 4.6 単独 + Structured Outputs
- **B**: Docling (self-host) + Sonnet 4.6
- **C**: Mistral OCR 3 (API) + Sonnet 4.6
- **D**: Gemini-3-Flash 単独

### 3.2 設定軸（GPT 補正の核心）

| 設定 | 略号辞書 | 本人行指定 | 凡例自動取り込み |
|---|---|---|---|
| **S0** ベースライン | なし | なし | なし |
| **S1** 凡例のみ | なし | なし | あり（凡例を VLM が抽出） |
| **S2** 辞書あり | ユーザー手動辞書 | なし | あり |
| **S3** 本人行あり | なし | あり（人間が指定） | あり |
| **S4** 両方あり | ユーザー手動辞書 | あり | あり |

### 3.3 評価マトリクス: 4 × 5 = 20 条件

| | S0 | S1 | S2 | S3 | S4 |
|---|---|---|---|---|---|
| **A** Sonnet 4.6 単独 | | | | | |
| **B** Docling+Sonnet | | | | | |
| **C** Mistral OCR+Sonnet | | | | | |
| **D** Gemini-3-Flash | | | | | |

→ **各セル = golden 25 件で評価 → 8 指標を取る = 25 × 8 = 200 datapoint/cell × 20 cells = 4000 datapoint**。

### 3.4 私の事前予測（リサーチに基づく）

- **S0 → S4 で精度がモデル差より跳ねる**（GPT 仮説の検証）
- **arch C (Mistral OCR + Sonnet) が cost/精度バランス最強**（OCR 96.6% table + Sonnet 意味解釈）
- **arch B (Docling + Sonnet) が dense table 精度最強**（97.9% from FinTabNet baseline）
- **arch A (Sonnet 単独) は汎用に強いが dense table で劣る**

→ **事前予測を裏切る結果が出る可能性を残す**（前提を疑う・①）。数字で決める。

### 3.5 比較条件の統制

- 同じ golden 25 件
- 同じ Structured Outputs schema
- 同じ deterministic validator
- 同じ prompt template（arch 固有差別化は最小限）
- 同じレポート形式

---

## §4. 本人行指定 UX 設計（私の独自・⑦）

### 4.1 初回（uploading）

```
[1] ユーザーが PDF/画像を upload
[2] サムネイル + interactive viewer 表示
[3] 「あなたの行をタップしてください」プロンプト
[4] ユーザーが画像上の本人の行を1クリック
[5] system が周辺特徴を fingerprint 化:
    - row_index_from_top
    - 周辺3行の名前文字列 hash
    - 行の bbox（h/y 座標）
    - 行内最頻略号 (initial value)
[6] template として保存（user_shift_templates）
```

### 4.2 2 回目以降

```
[1] ユーザーが同形式の PDF を upload
[2] system が fingerprint で auto-match:
    - row_index 一致 ?
    - 名前文字列 hash 一致 ?
    - 行 bbox 近傍 ?
[3a] match → 自動で本人行 crop して VLM へ
[3b] mismatch → 「前回は X 行目でしたが、今月は Y 行目に見えます」確認
```

### 4.3 fingerprint アルゴリズム

```typescript
type PersonRowFingerprint = {
  templateId: string;
  rowIndexFromTop: number;  // 1-based
  nameStringHash: string;   // sha256 of normalized name
  surroundingNameHashes: string[];  // 上下3行の名前 hash
  bboxYRatio: number;       // 行 y / page height
  bboxHRatio: number;       // 行 h / page height
  mostFrequentAbbr: string; // 行内最頻略号
};

function matchScore(saved: PersonRowFingerprint, detected: PersonRowFingerprint): number {
  // weighted similarity 0-1
  // name hash 一致 = 0.5
  // row_index 近傍 = 0.2
  // bbox 近傍 = 0.15
  // 周辺名前 hash 一致 = 0.1
  // 最頻略号 一致 = 0.05
  // total = 0-1
}

function needsConfirmation(score: number): boolean {
  return score < 0.7;  // 0.7 未満は人間確認
}
```

### 4.4 local crop の実装方針

- **client-side crop**: canvas で本人行 + 凡例 + 日付行 + 注記欄だけを切り出す
- **送信サイズ削減**: 全体 1MB → 本人行 + 周辺 200KB
- **プライバシー**: 他人の予定が VLM に到達しない

---

## §5. 略号辞書 UX 設計（私の独自・⑦）

### 5.1 「自動凡例 OCR」モジュール（v2.1 §3.2 を具体化）

凡例部分は本表より構造が単純（線形「略号 = 説明」リスト）。**別 pipeline で 100% 近く取れる**。

```typescript
type LegendExtraction = {
  abbreviation: string;
  rawLabel: string;        // 「9:00-17:45」のような原文
  parsedStartTime?: string;
  parsedEndTime?: string;
  isOff?: boolean;
  confidence: number;
};

async function extractLegend(image: Image): Promise<LegendExtraction[]> {
  // 1. VLM で凡例領域を特定（「凡例」「シフトコード」等のキーワード周辺）
  // 2. 線形「略号 = 説明」を抽出
  // 3. 時刻パターン正規表現で parsedStartTime/endTime 抽出
}
```

### 5.2 ユーザー補完 UX

- **VLM 凡例抽出結果を「初期値」として提示**
- 「不完全項目」（時間帯未記載 / isOff 判定不能）は**ハイライト**して入力要求
- ユーザーが修正・追加 → template に保存

### 5.3 学習：自動完成

- 同フォーマットで 2 回目以降は前回の dictionary を引く
- 新略号が出てきたら「これは何ですか？」確認

---

## §6. 採用基準（どの数字で arch を採用するか）

### 6.1 一次基準（精度）

S4（全部 ON 設定）で:
- **event-level F1 ≥ 92%** が最低ライン → クリアしない arch は**脱落**

### 6.2 二次基準（精度差 + コスト）

複数 arch が F1 ≥ 92% を満たす場合、以下の優先順位で決定:

| 優先度 | 基準 | 重み |
|---|---|---|
| 1 | F1 最高 | 40% |
| 2 | startTime/endTime exact 率 | 25% |
| 3 | cost (per 1000 PDFs) | 15% |
| 4 | latency (median) | 10% |
| 5 | self-host 可能性 | 5% |
| 6 | sourceRegion bbox 精度 (IoU) | 5% |

### 6.3 採用 arch がフェーズで切り替わる可能性

- Phase 1 採用が Phase 2 で再評価される（テンプレ運用時の精度）
- Phase 3（手書き）でさらに別 arch にスイッチもあり

### 6.4 fallback policy

- 採用 arch が API outage 時の fallback 候補を確保（例: Sonnet → Gemini）
- 既存 `runRouter` の fail-over 機構を流用

---

## §7. P0 実行手順 + 工数

### 7.1 P0 全体フロー

```
P0-1 (本書) — 評価設計 → ★ ここで CEO 承認待ち（実装前停止）
   ↓
P0-2 — Golden dataset 構築（25 件 + golden JSON）
   ↓
P0-3 — 評価 harness 実装（4 arch × 5 設定 = 20 条件）
   ↓
P0-4 — 全 20 条件を golden で run、 200 datapoint × 20 cell 収集
   ↓
P0-5 — 結果分析 + arch 採用判断（採用基準 §6 に照らす）
   ↓
P0-6 — CEO 報告 + 採用 arch 確定
   ↓
P1A 実装に入る
```

### 7.2 工数見積もり

| 段階 | 工数（私の作業） | 工数（CEO 作業） |
|---|---|---|
| P0-1 評価設計 | **完了**（本書） | 承認 |
| P0-2 golden dataset 構築 | 6-10h（25 件 × 20-30分） | 11 件提供 + 5/25 件検証 |
| P0-3 評価 harness 実装 | 8-12h | - |
| P0-4 20 条件 run | 6-10h（待機含む） | - |
| P0-5 分析 + 判断 | 2-4h | レビュー |
| P0-6 報告 + 承認 | 1h | 判断 |
| **合計** | **23-37h** | 提供 + 承認 |

→ **約 3-5 セッション**で完了見込み。

### 7.3 P0 commit 計画

- **P0-2**: `evaluation/golden/*.json` + `evaluation/golden/*.pdf|png|jpg` を commit
- **P0-3**: `lib/evaluation/extractionHarness.ts` + `tests/evaluation/...` を commit
- **P0-4**: `evaluation/results/p0-{arch}-{setting}.json` を commit
- **P0-5**: `docs/alter-plan-pdf-image-import-p0-result.md` を起草・commit

---

## §8. リスク / 難所（実装時の予防策）

1. **golden JSON 作成負担**: 25 件 × 28 日 = 700 イベント手動アノテーション → VLM 1st draft で時短
2. **CEO 提供分の機密性**: 業務シフトは社内利用想定 → 本人の名前以外マスク or 合成
3. **20 条件 run の cost**: 25 件 × 20 cell × 平均 $0.02 = $10 程度 → 許容
4. **arch 公平性**: prompt template 差をどう統制するか → 共通 schema + 共通 system prompt
5. **bbox 精度評価**: golden bbox を手で取るのは大変 → 「ざっくり領域」を正解とし IoU ≥ 0.5 で合格基準
6. **legend extractor の 100% 信仰**: 凡例レイアウトが特殊な場合（複数列） → fallback 必要

---

## §9. CEO 判断仰ぐ点（短く）

1. **本書 P0-1 評価設計を承認**するか
2. **Golden dataset の CEO 提供分** 11 件の提供を依頼してよいか:
   - 勤務表 3（航空シフト表 1 = 既提示済 + 他業種 2）
   - スキャン勤務表 3（実シフト表）
   - スマホ撮影 4
   - 子の時間割 1
3. **golden JSON の作成方針** = 「私が VLM 1st draft + 手動修正 → CEO が抜き取り検証」で良いか
4. **目標数値**: F1 ≥ 92% / 時刻 ≥ 97% / 日跨ぎ ≥ 99% / 略号 ≥ 97% で確定して良いか
5. **fingerprint 本人行特定 UX**（§4）に同意か
6. **自動凡例 OCR + ユーザー補完 UX**（§5）に同意か
7. **採用基準の重み付け**（§6.2）に同意か / 別の優先順位希望か
8. **P0-2 着手 GO** か

---

## §10. 今回の stop

- 本書 = **P0-1 評価設計のみ**。実装には入らない。
- branch `feat/plan-pdf-image-import` に本 doc を commit して停止。
- v2 + v2.1 patch + P0-1 設計の 3 doc が hand-off の核。
- **GO の場合**: CEO から golden dataset 11 件の提供 → 私が golden JSON 作成 → P0-3 評価 harness 実装 → P0 完了。
- push/PR/remote は GitHub 復旧後。
