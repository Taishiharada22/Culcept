# PDF/画像からの予定取り込み readiness

- **対象**: 紙媒体 / PDF / 画像から Aneurasync Plan に予定を取り込む機能。
- **状態**: **readiness のみ（実装未着手）**。前提検証 + scope + アーキテクチャ法案 + 革新点 + フェーズ案 + stop point の整理。
- **branch**: `feat/plan-pdf-image-import`（main 派生・独立トラック）。
- **背景**: OAuth (Google/Outlook) ✅ / ICS URL ✅ が main 着地済。次の主要 vertical = **会社/学校/組織が紙・PDF・画像でしか配らないスケジュール**。
- **日付**: 2026-05-30。CEO 方針 ①〜⑧（前提を疑う / 自立リサーチ / シンプル法案 / 外科的 / 目標駆動 / 人間同等推論 / 革新 / 世界トップシェア）。

---

## §0. 結論（先出し）

GPT 提案は**おおむね正しい**が、いくつか深掘り・補正・超越アイデアを加える:

1. **「完全自動」より「抽出→候補→確認→反映」**: 採用（GPT § 結論と一致）。誤登録より承認摩擦のほうが安い。
2. **シフト表テンプレート学習型**: 採用 + 補正。「ユーザーが説明する」より**「VLM が初回 PDF から自動推定 → ユーザーは差分を承認」**のほうが摩擦低い（GPT 案を超える）。
3. **真のターゲットは「シフト表だけ」ではない**: 学校・部活・保育園・予約票・イベントチラシも含む。**汎用 PDF/画像 → 候補化** を Phase 1、**シフト表 vertical（テンプレート学習）** を Phase 2 に分割（GPT は最初から特化を志向していたが、私は基盤先行を推奨）。
4. **3 大新規アクシス（GPT 未言及）**:
   - **deterministic 検証層**（VLM ハルシネーション対策）
   - **プライバシー: 本人行を local で抽出して他人の個人情報を VLM に送らない**選択肢
   - **第二の自己との統合**（Stargazer の睡眠タイプ・疲労パターンとシフト連携 = Aneurasync ならではの差別化）
5. **3 段階信頼度**（高 = 自動反映候補 / 中 = 要確認 / 低 = 下書き保持）: 採用。具体的に「閾値」と「アルゴリズム」を §7 で確定。
6. **CEO 提示画像（航空運航デスクシフト表 2025/2）の特性反映**: 90°回転 / 色分けが意味を持つ / 派生記号 / セル内複数名 / 連絡事項欄。GPT 案より広い設計が必要（§3.3）。

→ 推奨パス: **Phase 1A（汎用 PDF/画像 → 候補化）→ Phase 1B（実画像でロバスト性確認）→ Phase 2（シフト表 vertical テンプレート学習）→ Phase 3（写真・手書き）**。

---

## §1. 前提検証（既存資産との接続）

| 要素 | 既存資産 | PDF/画像取り込みでの利用 |
|---|---|---|
| イベント形 | `IcsAnchorDraft` (one_off / recurring) | **そのまま流用**。VLM 出力を IcsAnchorDraft[] に正規化 |
| TZ | `icsParser.icalTimeToIso` zone-aware（JST 変換済） | 流用（VLM 出力時刻も同じ正規化） |
| dedup | externalUid 完全一致 | PDF はファイル単位で UID を合成（hash + 行 index）→ 再取り込みで上書きできるよう設計 |
| 永続化 | `createSourceWithAnchors` (sourceType union) | **新 sourceType: `'pdf_extracted'` / `'image_extracted'`** 追加（migration draft） |
| preview UI | 既存 preview state (`IcsImportModal` の preview kind) | **流用**。VLM 出力 → IcsAnchorDraft[] → buildIcsPreview → 既存 preview/承認/dedup |
| modal | `IcsImportModal` の手動取り込みセクション（U3 redesign 済） | **PDF/画像 row を additive 追加**（提案: 「.ics ファイル」「URL」と並ぶ 3 番目の手段） |
| LLM 基盤 | `lib/ai/runAI` / `lib/ai/runRouter` (Anthropic / OpenAI / Gemini routable) | **VLM (画像理解) は別 endpoint**。Claude Sonnet 4.5 / GPT-4o / Gemini 2.5 Flash が候補 |

→ **新規実装の真の本質**は: ①PDF/画像 → VLM 呼出し ②VLM 出力の deterministic 検証 ③シフト表テンプレート（Phase 2）。残り（preview/承認/dedup/persist/TZ）は流用。

---

## §2. GPT 案の精査（採用・補正・超越）

| GPT 提案 | 私の判定 | 補正・超越 |
|---|---|---|
| 「抽出→候補→確認→反映」 | ✅ 採用 | 既存 ICS と同じ pipeline に流す（実装上 1 経路） |
| 信頼度 3 段階（高/中/低） | ✅ 採用 | 閾値・算出式を §7 で明文化 |
| シフト表テンプレート学習 | ✅ 採用 | **「人が説明する」→「VLM 自動推定 + 差分承認」に補正**。摩擦半減 |
| 略号辞書 / 日跨ぎ / 本人行 | ✅ 採用 | テンプレート JSON に統合（§5.3） |
| OCR + 表構造認識 | △ 部分採用 | 純 OCR より **VLM (multimodal) で 1 段で**やる方が現在は強い。OCR は VLM が困った時のフォールバック |
| 「凡例から自動候補生成」 | ✅ 採用 | VLM が凡例パートを認識して辞書 default を提案 |
| 「連絡事項は候補メモ」 | ✅ 採用 | カレンダー反映前に「これは予定ですか？」確認 |
| **欠落: 検証層** | ⚠️ 補正 | VLM ハルシネーション対策に **deterministic 検証層**（§5.4） |
| **欠落: プライバシー** | ⚠️ 補正 | 本人行 local 抽出 / 他人除去 / consent（§6） |
| **欠落: Aneurasync 統合** | ⚠️ 補正 | Stargazer 睡眠タイプ・疲労パターン → 無理シフト警告（§5.5、超越点） |

---

## §3. 真のターゲット（シフト表に限らない）

### 3.1 ターゲット用途（広い）

| 用途 | 構造 | 難所 | Phase |
|---|---|---|---|
| 会社シフト表（航空・看護・コンビニ・物流） | 表 + 略号 + 凡例 | 本人行 / 略号 / 日跨ぎ / 色 | **Phase 2 主役** |
| 学校時間割・行事予定 | 表 / リスト | クラス特定 / 不定期行事 | Phase 2 |
| 子の保育園・幼稚園予定表 | リスト + 日付 | 親が見る予定 vs 子の予定 | Phase 1 |
| 部活・サークル予定 | リスト | 場所表記揺れ | Phase 1 |
| フィットネスクラスSchedule | 表 | 講師・コース選択 | Phase 1 |
| 病院予約票 | 単票 | 個人情報 | Phase 1 |
| イベントチラシ・コンサート案内 | 自由レイアウト | レイアウトばらつき | Phase 1 |
| ホテル予約確認書 | 半構造 | チェックイン/アウト | Phase 1 |

→ **Phase 1（汎用）で 80% の用途**をカバーでき、**Phase 2（シフト表 vertical）で残り 20% の高需要**を取る。

### 3.2 CEO 提示画像の構造分析（具体）

CEO が送ってきた航空運航デスクシフト表 (2025/2) の実構造:
- **90°回転して印刷**（横長 A3 想定）→ OCR 前処理: 自動回転検出が必要
- **10 行（人名）× 28 列（日付）= 280 セル**
- **色分けが意味を持つ**: 緑(G=日勤9-17:45) / 桃(HREQ 希望休) / 紺(N 夜勤) / 青(L) / 桃濃(H?)
- **派生記号**: E-18 / E-16 / E-G / G-L / BD / 18-N / N / N̄ / H / L / AL（凡例不完全）
- **セル内複数名**（代務）: 「松田/田口」「香田/松田」
- **連絡事項欄**: 「18日デスクMTG 14-15時」のような追加予定
- **下部凡例**: G=9:00-17:45 のみ完全、E-18 / N の時間帯あり、他の略号は時間帯未記載
- **本人名は「石原 陽太郎」**（1 行目）
- **公休数** が右上に集計（情報密度高）

→ シフト表 vertical は GPT 想定より広い設計が必要。**凡例の不完全さ**を front-end で補えるテンプレート編集 UI が必須。

---

## §4. アーキテクチャ法案 — 3 案 + 推奨

### 案 A: 最薄スタート（汎用 PDF/画像 → 候補化）

```
ファイル (.pdf / .png / .jpg / HEIC)
    ↓ client-side preview + 不要部分 crop UI
    ↓ server action (file upload)
    ↓ VLM (Claude Sonnet 4.5 / GPT-4o / Gemini 2.5 Flash)
    ↓ deterministic 検証層（日付形式 / 時刻範囲 / 重複）
    ↓ IcsAnchorDraft[]
    ↓ 既存 buildIcsPreview / 承認 / dedup / persist
```

- **長所**: 速い（既存基盤に乗る）、汎用性、Phase 2 の土台になる
- **短所**: シフト表精度は中程度
- **新規規模**: action 1 / VLM 呼出 helper / 検証 module / migration（`pdf_extracted` sourceType）

### 案 B: シフト表特化先行

VLM + テンプレート設定 UI（本人行・略号辞書・日跨ぎ・凡例補完）から開始。

- **長所**: CEO の現実ニーズ直結、差別化最大
- **短所**: 初回設定 UX 重い、汎用 PDF をカバーしない
- **新規規模**: テンプレート編集 UI + 永続化スキーマ + パッキング + 案 A の全部

### 案 C: ハイブリッド = Phase 1 → Phase 2（**推奨**）

- **Phase 1**: 案 A（汎用 → 候補化）。最初の release はこれ。
- **Phase 2**: シフト表 vertical（テンプレート学習）を案 A の上に乗せる。
- **Phase 3**: 写真撮影 / 手書き対応の追加ロバスト性。

→ **Phase 1 で「PDF 取り込み」基盤を確立**してから **Phase 2 で勝ち筋に特化**する。土台が共有されるので無駄なし。

---

## §5. 設計詳細（推奨パス = 案 C）

### 5.1 VLM 選定（Phase 1）

- **第一候補**: Claude Sonnet 4.5 — 表認識・iCalendar 構造化に強い、Aneurasync の既存依存
- **代替**: GPT-4o (vision)、Gemini 2.5 Flash (cost 低)
- 既存 `runAI` / `runRouter` 流用 — fail-over・cost cap が無料で乗る
- VLM は **「VLM = vision-capable text LLM」前提**。ファイル形式は PDF first page を画像化（pdf-lib + canvas）/ 直接画像入力

### 5.2 出力契約（VLM プロンプト → JSON）

VLM には以下を返させる:
```json
{
  "events": [
    {
      "title": "string",
      "date": "YYYY-MM-DD",
      "startTime": "HH:MM" | null,
      "endTime": "HH:MM" | null,
      "endsNextDay": false,
      "locationText": "string" | null,
      "confidence": 0.0-1.0,
      "sourceRegion": "string"  // OCR span (debug)
    }
  ],
  "ambiguities": [
    { "question": "...", "context": "..." }
  ],
  "doc_meta": { "kind": "shift_table" | "schedule" | "flyer" | "form", "month": "YYYY-MM" | null }
}
```

- **deterministic 検証**: zod schema + 日付連続性 + 時刻範囲 + 文字長
- **validation 不通過 → retry 1 回 + fail-soft（部分結果採用）**

### 5.3 シフト表テンプレート（Phase 2）

**革新点（GPT 案を超える）**: 「人が説明する」→「**VLM が初回 PDF を見て、テンプレート JSON を自動推定 → ユーザーは編集だけ**」

```json
{
  "templateId": "uuid",
  "userId": "uuid",
  "kind": "shift_table",
  "personRowSelector": {
    "displayName": "石原 陽太郎",
    "rowFingerprint": "...",  // 次回特定用
    "altNames": ["石原"]
  },
  "dateColumnPattern": "horizontal_top",
  "abbreviations": {
    "G": { "label": "日勤", "startTime": "09:00", "endTime": "17:45", "endsNextDay": false, "isOff": false },
    "E-18": { "label": "早朝勤務", "startTime": "06:15", "endTime": "18:15", ... },
    "N": { "label": "夜勤", "startTime": "22:00", "endTime": "06:45", "endsNextDay": true, ... },
    "AL": { "label": "有給", "isOff": true },
    "HREQ": { "label": "希望休", "isOff": true }
  },
  "colorMappings": { "green": "G", "blue": "L", ... },
  "notesField": "下部の連絡事項欄を抽出する"
}
```

- **DB に persist**（user_shift_templates テーブル新規）
- **2 回目以降**: 同じフォーマットなら fingerprint で自動マッチ → 略号辞書を引いて直接変換
- **レイアウト変更時**: 「前回と変わっています、再学習しますか？」

### 5.4 deterministic 検証層（GPT 未言及 = 革新）

VLM 出力に対し**機械的な妥当性チェック**:

| 検証項目 | アクション |
|---|---|
| 日付が YYYY-MM-DD 形式 | 不可 → reject |
| 日付が doc_meta.month と一致 | 不一致 → flag (ambiguous) |
| startTime < endTime（endsNextDay=false 時） | 不一致 → flag |
| endsNextDay=true なら startTime > endTime | 妥当 |
| 同一人物・同日に複数 event | 警告（マージするか確認） |
| 略号が辞書にない | 「これは何ですか？」確認 |
| イベント数 < 期待値の 50% | OCR 失敗の可能性、再試行 |

→ **ハルシネーション対策の本質**。VLM をブラックボックスにせず、機械が検算する。

### 5.5 第二の自己との統合（**Aneurasync 独自・差別化の核**）

GPT 案にはこの観点が無い。我々が他社に勝てる唯一の道:

- **Stargazer 睡眠タイプ**: 「N 連勤 3 日」を取り込んだ時、ユーザーが「夜型でない」なら警告
- **疲労パターン**: 過去の Footprint から「夜勤後 3 日休む傾向」を抽出 → 取り込み後に「今月のシフトはあなたのリズムに合っていますか？」alter 発火
- **連続勤務検出**: 取り込んだシフトから「7 連勤」を検出 → 健康警告
- **これは「予定取り込み」を「第二の自己 = ユーザーの代わりに見てくれる人」に変える**

→ シンプル PDF→Calendar service との決定的な差別化。

### 5.6 UI 入口

modal の「**手動で取り込む**」セクションに **3 つ目の row** として追加:
- `.ics ファイル` / `公開カレンダー URL` / `PDF・画像から取り込む`（NEW）

ボタンクリック → 専用 wizard modal を開く（IcsImportModal とは別。複雑性が違うため別 modal が正解）:
- step 1: ファイル選択
- step 2: VLM 解析中スピナー
- step 3: 抽出結果 preview（既存 preview UX を流用、信頼度別に色分け）
- step 4: 承認 → 取り込み

---

## §6. プライバシー / 安全性（GPT 未言及 = 補正）

| リスク | 対策 |
|---|---|
| シフト表に他人の名前・予定 | **本人行のみ local crop**（client-side で本人行を選択 → その行だけ image にしてから VLM へ）。option として「全体を送る」 |
| 会社の機密 PDF | 「個人利用範囲ですか？」consent。「業務利用範囲」「機密区分」を user 入力 |
| VLM への送信 | https 限定 / log にファイル全体を残さない（hash + meta のみ） |
| OCR 結果の DB 保存 | raw OCR は保存しない（discarded）、anchors のみ永続化 |
| テンプレートに他人情報 | テンプレート保存時に「他人の名前を含めない」hint |

→ TB-5 で得た「衛生原則」（debug 残骸禁止 / log で個人情報を出さない / commit 前 revert）を厳格適用。

---

## §7. 信頼度 3 段階（GPT 案の具体化）

| 段階 | 閾値 | UI 扱い |
|---|---|---|
| **高** | confidence ≥ 0.85 + 検証層 全 PASS + 略号辞書ヒット | 「✓ 自動反映候補」: 取り込み preview で default 選択 |
| **中** | confidence 0.5-0.85 or 検証層 1 件 flag | 「⚠ 要確認」: default unchecked、ユーザーが選択して反映 |
| **低** | confidence < 0.5 or 略号辞書 miss or ambiguities あり | 「✎ 下書き」: 取り込まれず、ユーザーの追加情報待ち |

- confidence は VLM 自己申告 + 検証層 score の和（重み付き）
- preview UI は 3 段階を別 section で表示（high → mid → low）

---

## §8. フェーズ案（着手は CEO gate）

| Phase | 内容 | 完了条件 | stop |
|---|---|---|---|
| **P0** | 実 PDF/画像で VLM 出力を手動評価（汎用5 + シフト表3） | 出力品質ベースライン確定 | →stop |
| **P1A-1** | sourceType 'pdf_extracted' / 'image_extracted' migration draft + union 追加 (TB-1 mirror) | tsc / unit / 既存非破壊 | →stop |
| **P1A-2** | VLM 呼出 helper (`lib/ai/extractPlanFromVision.ts`) pure DI + unit test (fixture VLM 出力) | unit test PASS | →stop |
| **P1A-3** | deterministic 検証層 (`lib/plan/pdf/extractionValidator.ts`) pure + unit test | unit test PASS | →stop |
| **P1A-4** | server action `extractPlanFromFileAction` (auth + VLM + 検証 + draft 返却) | unit test PASS | →stop |
| **P1A-5** | wizard modal (PDF/画像取り込み専用) + render contract test | render PASS / self smoke | →stop |
| **P1A-6** | staging smoke (CEO 実機、汎用 PDF/画像 5 例) | CEO pass | →stop |
| **P2-1** | shift_template DB スキーマ + repository | unit test | →stop |
| **P2-2** | VLM プロンプト拡張: 初回 PDF から template 自動推定 | unit + 実例検証 | →stop |
| **P2-3** | テンプレート編集 UI (本人行 / 略号辞書 / 日跨ぎ / 凡例補完) | render test + smoke | →stop |
| **P2-4** | 2 回目以降の自動マッチ + 略号辞書適用 + 日跨ぎ生成 | unit + 実シフト 3 ヶ月分検証 | →stop |
| **P2-5** | Stargazer 統合（睡眠タイプ・連続勤務警告 = §5.5 革新） | 設計判断 + 実装 | →stop |
| **P3-X** | 手書き・写真ロバスト性 / クロップ UI / 多月またぎ | 別 phase | - |

→ **P1A だけで「会社案内 / 子の保育園予定表 / イベントチラシ」をかなり取れる**。Phase 2 でシフト表 vertical を取りに行く。

---

## §9. 不確実性 / 難所（自立リサーチ）

1. **VLM 精度 vs cost のバランス**: Sonnet 4.5 が高精度だが cost。Gemini 2.5 Flash は安いが表認識劣る場合あり → P0 で実評価
2. **PDF → 画像化**: pdf-lib + canvas を Node.js で動かす（serverless での冷起動）か、専用 library（pdf2pic）か
3. **画像 EXIF の回転**: HEIC（iPhone）の回転メタデータ未処理で OCR ズレ → 前処理で auto-rotate
4. **シフト表の月またぎ**: 月末/翌月初の連勤、年またぎ
5. **テンプレートの version 管理**: ユーザーが略号を変えた時の旧データ整合
6. **OCR fallback**: VLM が完全失敗時の純 OCR (Tesseract/Google Vision API)
7. **コスト管理**: 1 ユーザー月 100 シフト読み込んだら？ → cost cap & rate limit 必須

---

## §10. CEO 判断仰ぐ点

1. **Phase 順番**: 案 C (Phase 1A 汎用 → 2 シフト表 vertical → 3 写真/手書き) で良いか / 別案にするか
2. **VLM 選定**: 第一候補 Claude Sonnet 4.5 で良いか / 別 model 指定
3. **プライバシー方針**: 「本人行 local crop」を default にするか / 「全体送信」を default にして option で crop か
4. **第二の自己統合**（§5.5）: Phase 2 の最後でやるか / Phase 1A 段階から弱統合（連勤警告のみ）するか
5. **新 sourceType の命名**: `'pdf_extracted'` / `'image_extracted'` で良いか
6. **wizard modal を別 modal にするか / IcsImportModal 内に組み込むか**: 私の推奨は別 modal（複雑性差・既存 modal の SSR contract を壊さない）
7. **P0 評価**を最初に実施するか（CEO 実機 PDF + 私の評価レポート）

---

## §11. 今回の stop

- 本書 = **readiness のみ**。実装には入らない。
- branch `feat/plan-pdf-image-import` に本 doc を commit して停止。
- **GO の場合**: P0（VLM 評価）から開始。CEO に「評価用 PDF (汎用 5 + シフト表 3) 提供 + 私が VLM 呼んで出力品質を見る」を依頼。
- push/PR/remote は GitHub 復旧後に別判断。
- 本実装は P1A-1（migration draft）から、各 phase 間 stop で進める。
