# Candidate Lens Phase 5 — Purpose-aware Enrichment 計画（計画のみ・未実装）

作成: 2026-06-19 / 状態: **計画のみ（実装・外部取得・スクレイピング・API追加・DB保存・production 有効化は未 GO）**
親: `docs/purpose-adaptive-candidate-lens-mini-design.md` / Phase 4 = `docs/candidate-lens-phase4-places-details-plan.md`

---

## 0. なぜ Phase 5 か（現状診断・コード根拠）

CEO 指摘:「仕事なのにスタバをただ近場で調べるだけでは浅い。目的に合わせて検索時点から見る情報を変えるべき」。
コードを監査した結論 = **指摘は正確**。現状は「見せ方」は目的別だが、「**探し方・選び方**」は目的非依存。

| 層 | 現状 | 目的が効いているか | 根拠 |
|---|---|---|---|
| 検索クエリ | `locationText + title` を素朴連結（例「スタバ ミーティング」） | **効いていない** | `lib/plan/placeSearchQueryBuilder.ts` — 設備語/目的語の拡張なし |
| 候補の並び順 | Google 返却順（近接 bias のみ） | **効いていない** | `PLACE_AFFINITY_RANKING_ENABLED=false`（`placeAffinityReasonUi.ts:39`） |
| 観測理由の付与 | 観測がある場所に「よく行く」等を添える（順位不変） | 部分的に効く | `PLACE_AFFINITY_REASON_UI_ENABLED=true`（同 :27）→ lens の affinityReason へ |
| 表示属性・比較表・コピー | 目的レンズで行集合/文言を切替 | **効いている（表示のみ）** | `candidateLensUi.ts` `CARD_CHIP_KEYS` 等 |
| 写真/営業時間 | Place Details で実値化（Phase 4） | — | `placeDetailsEnrichment.ts` |
| 地図 | 実 Google 地図（REDO-15・本コミット） | — | `LensPlaceMap` |

→ 「おすすめの純度が低い」体感の根因 = **検索時点・評価時点で目的が効いていない**。これが P5-a / P5-d。
   さらに「設備（電源/Wi-Fi/席）が未確認のまま」= 公式情報を見ていない。これが P5-b / P5-c。

honesty 原則は不変: 確証がなければ静か/混雑/雰囲気は**未確認のまま**。推測で実値化しない。

---

## P5-a: Purpose-aware Search Query Expansion（目的別 検索語拡張）

### 狙い
目的レンズに応じて、検索時点で「設備語・目的語」を混ぜる。仕事なら電源/Wi-Fi/作業、旅行なら写真映え/雨でも、友達なら話しやすい/座れる。

### 既存への混ぜ方（重要 = 結果を壊さない二段構え）
現 `buildPlaceSearchQuery` は単一 textQuery を返す。**入れすぎ注意**（Places Text Search は語を増やすと 0 件/不安定化しやすい）。
→ **primary / secondary intent の 2 query 分離**を提案:
- **primary query**: `地名 + カテゴリ`（＝現状そのまま・必ず結果が返る土台）
- **secondary intent query**: `地名 + 目的語 + 設備語`（例「成田美郷台 カフェ 電源 Wi-Fi 作業」）
- 実行戦略案 A（安全）: primary を主とし、secondary は**別 fetch で薄く併走**→ secondary が 0/少件なら primary に静かに fallback（secondary をユーザーに見せる前に件数 gate）。
- 実行戦略案 B（最小）: secondary は出さず、**primary の結果を目的別語との適合で reorder のヒント**にだけ使う（P5-d と合流）。
- 既定は **案 A を flag 付きで dev 検証 → 安定したら採用**。語彙表は pure table（lens × 目的語/設備語）。

### 目的別語彙（初版・pure table 案）
```
focus_work / meeting_prep : 電源 Wi-Fi 作業 打ち合わせ 静か 長居 コンセント（+ オンライン会議）
conversation              : 話しやすい 座れる 雰囲気 待ち合わせ
errand                    : 近い 立ち寄り 営業時間
travel(将来)              : 写真映え 駅近 営業時間 雨でも 屋内
generic                   : （拡張しない＝現状）
```

### 確認ポイント（CEO 質問への回答骨子）
- **既存 Places Search にどう混ぜるか** → `buildPlaceSearchQuery` を壊さず、secondary query を**追加 pure 関数**で生成。server route は primary を既存どおり、secondary は flag 下で別呼び出し（cost 二重化に注意 = §課金）。
- 課金: secondary query は Text Search 呼び出しが**最大もう 1 回**増える。招待制少人数なら無料枠内だが、**flag + 件数 gate + 1 候補セットにつき secondary 1 回上限**を設計。

---

## P5-b: Official Source Enrichment（公式店舗ページからの設備 evidence）

### 狙い
チェーン店の**公式ページ**に電源/Wi-Fi/席/設備が載っている場合、それを **evidence=「公式ページに記載あり」** として扱う（断定でなく出典付き）。

### Google Places の websiteUri の扱い
- Place Details (New) の `websiteUri` フィールドで**公式 URL を取得可能**。
- ★現行 field mask = `id,photos,regularOpeningHours`（`placeDetailsEnrichment.ts`）。`websiteUri` 追加は **Enterprise SKU 据え置き**か要確認（P5-b 実装前に SKU 影響を P4-0 同様に再調査）。`websiteUri` 自体は Pro/Enterprise tier 想定 → **mask 拡張は課金確認後**。

### 公式サイトを読む場合の規約・robots・保存方針（安全設計 = 必須）
やってよい方向のみ:
- **公式 URL のみ**（Places の websiteUri 由来。口コミ/まとめサイトは読まない）
- **少量・遅延取得**（1 候補 1 回・timeout 短・retry 0・並列しない）
- **robots.txt 尊重**（Disallow なら取得しない）/ **User-Agent 明示**
- **保存しない**（HTML/抽出結果を DB/localStorage に永続化しない・セッション memo のみ）
- **出典表示必須**（「公式ページに記載」+ リンク）
- **fail-open**（取れなければ未確認のまま・UI 不変）
- 抽出は**設備語の有無判定のみ**（電源/Wi-Fi/席/モバイルオーダー/駐車場/ドライブスルー）。本文転載しない。

やらない方向（禁止）:
- 無差別 Web スクレイピング / 口コミサイト解析 / 大量取得 / 保存 / 公式でない情報を確定情報として出す

### 何を evidence=fact、何を unconfirmed のままにするか
- **fact 扱い**: 公式ページに**明示記載**がある設備（例「全席電源あり」→ 電源=fact, 出典=公式）。営業時間は Places の `regularOpeningHours`（Phase 4 既存）が fact。
- **unconfirmed のまま**: 静かさ・混雑・雰囲気（主観/変動）は公式記載があっても**確定実値化しない**（「公式は静かと記載」程度の hedged 表示に留めるか、未確認維持を既定）。記載がなければ当然未確認。

### 技術上の現実
- server-side fetch（client から公式サイトを直接叩かない = CORS/規約/key 露出回避）。
- 取得は**新規 server endpoint**（`/api/plan/places/official-source` 等）＝**API追加に該当 → 本計画では実装しない**。

---

## P5-c: Evidence Preview Modal（アプリ内・画面中央の前面プレビュー）

### 狙い（CEO の要望そのまま）
場所名や公式 URL をタップ → **ブラウザ遷移でなくアプリ内中央に長方形プレビュー**。背景暗転・周囲クリックで閉じる・元の候補画面へ復帰。**ボトムシートではない**（③ compare はボトムシート、これは中央モーダル＝区別）。

### UI 構造案
```
② 詳細 or ③ 比較
  └ 店舗名 / 「公式情報を見る」タップ
      → 画面中央に大きめ長方形 modal（fixed inset-0 flex items-center justify-center / 背景 black/55）
          ├ ヘッダー: 店舗名 + 出典ドメイン + 閉じる×
          ├ 本体: 公式情報（設備/営業時間/出典 URL）
          └ 周囲クリック→閉じ（既存 click-catcher パターン流用）
      → 元の ②/③ に戻る（state 復帰）
```
既存の Lens Overlay / ③ Portal と**同じ createPortal + click-catcher 技法**を流用可能（新規概念は最小）。

### iframe 不可時の fallback（3 段）
多くのサイトは `X-Frame-Options` / CSP で iframe 埋め込み拒否 → **最初から「必ず iframe」にしない**。
```
第一: iframe / web preview（埋め込み許可サイトのみ）
  ↓ 拒否
第二: server-side reader card（P5-b の抽出結果を整形した「公式情報カード」）
  ↓ それも無い
第三: source card（公式 URL + ドメイン表示 +「ブラウザで開く」= 明示的に外部遷移）
```
→ 既定設計は **第二（reader card）を主役**にする方が安全（iframe 依存しない・規約衝突少・P5-b と直結）。iframe は許可サイトのみの加点。

### 課金/外部アクセス
- iframe: 課金なし（ブラウザが直接ロード・ただし埋め込み拒否多数）。
- reader card: P5-b の server fetch に依存（= API追加）。
- 本計画では**実装しない**（preview modal の UI 骨格は P5-c 単独で先行できるが、中身＝公式情報は P5-b 依存）。

---

## P5-d: Work-purpose Candidate Scoring（目的別の候補評価）

### 狙い
仕事目的では「近い順」でなく **電源/Wi-Fi/営業時間/公式設備/移動負担** を重視して評価する。ただし確証なき静か/雰囲気/混雑は**未確認のまま**（推測で実値化しない）。

### 評価軸（仕事 lens 案）
```
work_fit score = w1·電源evidence + w2·Wi-Fi evidence + w3·営業時間(確認済) + w4·移動距離(近さ) + w5·公式情報の有無
                 （静かさ/混雑は evidence があれば加点・なければ中立=罰しない）
```
- 既存 `scorePlaceCandidates`（`placeAffinityCombiner.ts`）の**bounded nudge / clamp**思想を流用（未訪問/未確認を罰しない・general 勝者を覆さない）。
- ★**ranking 反映は P3-c「行順だけ」より踏み込むため、実装前に C（explanation 層）必須**（フィルターバブル/過剰断定の回避・opt-out・多様性ガード）。
- 反映先は ③ の推薦/winner にまで及ぶため、`PLACE_AFFINITY_RANKING_ENABLED` とは別の **work-scoring 専用 flag** + 強 gate。

### 何を fact / 何を unconfirmed
- fact: 営業時間（Places）・公式記載の設備（P5-b）・移動距離（haversine 既存）。
- unconfirmed 維持: 静か/混雑/雰囲気（evidence なき限り）。

---

## 横断: flag 構成 / tests / smoke / rollback / 課金まとめ

### flag 構成（全て default OFF・production hard block・段階 GO 前提）
```
PLACE_CANDIDATE_LENS_SEARCH_EXPANSION_ENABLED   (P5-a)  default OFF
PLACE_CANDIDATE_LENS_OFFICIAL_SOURCE_ENABLED    (P5-b)  default OFF（+ server endpoint は別 GO）
PLACE_CANDIDATE_LENS_EVIDENCE_PREVIEW_ENABLED   (P5-c)  default OFF
PLACE_CANDIDATE_LENS_WORK_SCORING_ENABLED       (P5-d)  default OFF（+ explanation 必須）
```
※ 既存同様 `&& process.env.NODE_ENV !== "production"`。外部 fetch 系（P5-b）は Phase 4 の二重スイッチ（const flag + 本番 env gate）を踏襲。

### 課金/API/外部アクセスが発生する箇所（明示）
| Phase | 外部アクセス | 課金 | 新規 endpoint |
|---|---|---|---|
| P5-a | Text Search **+最大1回/候補セット** | Places Text Search 従量（無料枠内想定・要 gate） | なし（既存 route 拡張） |
| P5-b | **公式サイト fetch（server）** + Details `websiteUri`（mask 拡張） | websiteUri は SKU 要確認・公式 fetch は自前帯域 | **あり（要 CEO 承認）** |
| P5-c | iframe（課金なし）/ reader card（P5-b 依存） | — | reader は P5-b 依存 |
| P5-d | なし（P5-a/b の取得結果を評価するのみ） | — | なし |

### tests / smoke（実装時の必須・各 Phase）
- pure 関数（語彙拡張・抽出判定・スコア）は unit 100%。
- P5-b: robots 尊重・保存ゼロ・出典必須・fail-open・key/PII 非露出 を test 化（Phase 4 の grep test 流用）。
- P5-c: iframe 拒否時 fallback・周囲クリック閉じ・元画面復帰 を smoke。
- 各 Phase 単独で dev smoke → CEO 確認 → 次。

### rollback
- 各 flag OFF で即座に現状（Phase 4 + 実地図）へ復帰。
- P5-b 外部 fetch は本番 env gate を閉じれば外部アクセス 0。

---

## 推奨進行順（CEO 判断待ち）
1. **P5-a（検索語拡張）** — 最も体感に効く・外部 endpoint 不要・既存 route 拡張で収まる。**最有力の次の一手**。
2. **P5-c の UI 骨格のみ**（中身は後）— preview modal の見た目/開閉を先に作る（外部取得なしで安全）。
3. **P5-b（公式 source）** — 規約/robots/endpoint 設計が重く CEO 承認必須。P5-c の中身として後続。
4. **P5-d（work scoring）** — explanation 層が前提。最後。

> 本ドキュメントは**計画のみ**。実装・外部サイト取得・スクレイピング・API 追加・DB 保存・production 有効化はしていない。
