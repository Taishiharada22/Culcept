# ディープリサーチ: 日常プランニングの方法論

> **日付**: 2026-04-13
> **依頼元**: CEO（Taishi）
> **Research Unit**: Insight Synthesizer
> **ステータス**: 完了

---

## 要約（3行）

1. 人間の1日のプランは「活動の列挙」ではなく「移動を含むツアー構造」であり、Hagerstrand の時空間制約理論がその学術的基盤となる
2. 現在の Morning Protocol は移動時間の概念がゼロであり、「自宅 → 移動 → 到着 → 滞在 → 移動 → 次の目的地」というツアー構造への転換が必要
3. API不要のヒューリスティック移動時間推定（都市部: 車15-20分/電車25-35分）で十分に実用的なプランが組める

---

## 1. 日常プランニングの学術的知見

### 1.1 Hagerstrand の時間地理学（Time Geography）

スウェーデンの地理学者 Torsten Hagerstrand が1960-70年代に提唱した時間地理学は、人間の日常活動を時空間の中で捉える概念フレームワークである。

#### 3つの制約（Three Constraints）

| 制約タイプ | 定義 | 日常プランへの影響 |
|---|---|---|
| **能力制約（Capability）** | 個人の身体的・技術的限界。移動手段や体力の制約 | 「車がないから電車で行く」「疲れやすいから1日3件が限界」 |
| **結合制約（Coupling）** | 特定の時刻に特定の場所にいなければならない制約 | 「14時に歯医者」「19時に友人と食事」 |
| **権威制約（Authority）** | 社会的・制度的ルールによる制約 | 「営業時間内に銀行に行く」「9-17時は仕事」 |

#### 時空間プリズム（Space-Time Prism）

時空間プリズムは、2つのアンカーポイント（固定予定）の間で、個人が到達可能な全ての時空間パスの包絡線を表す。つまり「14時の歯医者と19時の食事の間に、どこまで行けて何ができるか」の可能性空間を表現する。

**Aneurasync への示唆**: 現在のプランニングエンジンは結合制約（固定予定）のみを扱っている。能力制約（移動手段・体力）と権威制約（営業時間等）を加えることで、プランの現実性が飛躍的に向上する。

### 1.2 Activity-Based Travel Demand Modeling（活動ベース交通需要モデル）

交通計画の分野で1970年代から研究され、2000年代以降に実用化が進んだモデリング手法。

#### 核心原則

> 「交通需要は人々の日常活動パターンから派生する」

このモデルは以下を予測する:
- **何の活動**が行われるか
- **いつ**行われるか
- **どこで**行われるか
- **どのくらいの時間**行われるか
- **誰と**行われるか
- **どの交通手段**で到達するか

#### ツアーベース構造（Tour-Based Structure）

活動ベースモデルの核心は**ツアー**の概念である。ツアーとは「自宅を出発し、1つ以上の目的地を経由して、自宅に戻るトリップの連鎖」を指す。

```
[自宅] → 移動A → [目的地1: カフェで作業] → 移動B → [目的地2: 歯医者] → 移動C → [自宅]
```

このツアー内のトリップは相互依存する。カフェでの滞在時間は歯医者の予約時刻に制約され、移動手段は出発地から最終目的地までの一貫性が求められる（車で出たら帰りも車）。

**Aneurasync への示唆**: 現在の `PlanItem[]` はフラットなリスト構造だが、これを `Tour` 構造に変換することで、移動の連鎖と時間制約を自然にモデリングできる。

### 1.3 Trip Chaining（連鎖移動）

Trip chaining は「1つの外出で複数の用事を連鎖的にこなす」行動パターンを指す。

#### 一般的なパターン

| パターン | 構造 | 例 |
|---|---|---|
| **Simple Tour** | H → A → H | 自宅→マクドナルド→自宅 |
| **Complex Tour** | H → A → B → H | 自宅→マクドナルド→BMW→自宅 |
| **Chained Tour** | H → A → B → C → H | 自宅→カフェ→歯医者→スーパー→自宅 |
| **Multi-Base Tour** | H → Work → A → Work → H | 自宅→職場→ランチ→職場→自宅 |

#### 研究知見

- 個人間変動よりも個人内変動（日ごとの変動）の方が大きい
- 活動パターンは完全に習慣的でも完全にランダムでもなく、その中間にある
- 朝と夕方に明確な移動ピークがある

**Aneurasync への示唆**: ユーザーが「マクドナルドで作業してBMWに寄る」と言った場合、これを `H → McDonald's → BMW → H` のComplex Tourとしてモデリングし、各区間の移動時間を自動挿入すべき。

---

## 2. 実世界のスケジューリングアプリの設計パターン

### 2.1 Google Calendar の移動時間機能

- Google Maps と連携して、出発地から目的地までの移動時間を推定
- **手動追加が必要**: 各イベントに個別にaddressを入力し、マップアイコンをクリックして移動時間を追加
- 自動挿入はネイティブ機能として存在しない

### 2.2 サードパーティの移動時間自動挿入ツール

| ツール | アプローチ | 特徴 |
|---|---|---|
| **Travel Time App** | Google Calendar 拡張 | イベント前後に自動的に移動時間をブロック。Google Maps ルーティングで精度確保 |
| **Reclaim.ai** | AI スケジューラー | 場所検出 → 自動で移動時間を挿入。フライト前後は空港遅延も考慮 |
| **Morgen** | カレンダーアプリ | 次週のイベントに対して、交通手段と時間帯を考慮した移動時間を自動計算 |
| **Calendar Auto Route Calculator** | Google Apps Script | カレンダー登録時に電車/徒歩のルートを自動計算し「移動」イベントを追加 |

#### 共通設計パターン

1. **移動時間は独立イベントとして挿入** — 活動と移動を分離して管理
2. **出発地は前のイベントの場所 or 自宅** — 場所の連鎖が前提
3. **交通手段はユーザー設定 or 自動検出** — 車/電車/徒歩のデフォルト設定
4. **往復の概念** — 「行き」だけでなく「帰り」の移動時間も含む

### 2.3 Reclaim.ai の設計思想（特に注目すべき）

Reclaim.ai は Clockwise（2026年3月にサービス終了）の後継として最も先進的なAIスケジューラー。

- **柔軟ホールド**: 重要なタスクや移動時間を「柔軟な予約」として確保し、他の予定が入りそうになるまではオープンに保つ
- **自動リスケジュール**: コンフリクト発生時に自動的に再配置
- **バッファタイム**: 会議間のバッファ・移動時間・休憩を自動スケジュール
- **トラベルタイム**: 場所が検出されたイベントの前後に自動的に移動時間を挿入

**Aneurasync への示唆**: Reclaim の「柔軟ホールド」は、Alter の `PlanItem.kind: "todo"` と親和性が高い。固定予定を軸に、柔軟なタスクを配置し、その間に移動時間を自動挿入する設計が有効。

### 2.4 Routific / OptimoRoute の設計思想

物流・配送向けだが、マルチストップ計画の設計思想は参考になる。

- **Routific**: 「AIは人間のディスパッチャーを補完すべきで、置き換えるべきではない」。最適なルートは「人間にとって意味のあるルート」でもあるべき
- **OptimoRoute**: 各ストップの「サービス時間」（現地での滞在時間）を明示的にモデリング。到着時刻の精度はサービス時間の正確性に依存
- **共通**: 停車時間（dwell time）と移動時間の分離が設計の基本

**Aneurasync への示唆**: Routific の「人間にとって意味のあるルート」原則は Aneurasync の設計思想と一致する。最適化よりも納得感。OptimoRoute の「サービス時間」概念は `PlanItem.durationMin`（滞在時間）と移動時間の分離に直結する。

### 2.5 Fantastical / Notion Calendar / Todoist の統合UX

| ツール | 特徴 | プランニングUX |
|---|---|---|
| **Fantastical** | 自然言語入力 | 「明日14時に歯医者」と入力→自動的にイベント作成 |
| **Notion Calendar** | DB連携 | Notion のタスクDBとカレンダーの双方向同期 |
| **Todoist** | タスク管理 | Fantastical との統合で、タスクとイベントを一元管理 |
| **Akiflow** | 統合ビュー | 複数ツールのタスク+カレンダーを1つのビューに集約 |

**Aneurasync への示唆**: Fantastical の自然言語入力は Alter の `intentParser` と同じアプローチ。ただしこれらのツールはどれも**移動時間の自動挿入**は主機能として持っていない。ここに Aneurasync の差別化余地がある。

---

## 3. 移動時間の推定方法

### 3.1 API ベースの精密推定

| API | 対応モード | 特徴 |
|---|---|---|
| **Google Maps Directions API** | 車/電車/徒歩/自転車 | 交通状況考慮（best_guess/pessimistic/optimistic）、出発・到着時刻指定可能 |
| **Google Distance Matrix API** | 同上 | 1対多/多対多の移動時間を一括取得。1回のリクエストで最大25起点×25目的地 |
| **Apple MapKit Directions** | 車/電車/徒歩 | ETA推定。最大10目的地への到着時間を一括取得 |

**コスト問題**: Google Maps API は有料（月$200の無料枠あり）。日常的なプランニングで毎朝APIを叩くのはコスト面で課題。

### 3.2 API 不要のヒューリスティック推定（推奨アプローチ）

日本の都市部データに基づく実用的な推定値:

#### 交通手段別の移動速度

| 交通手段 | 平均速度 | 参考データ |
|---|---|---|
| **徒歩** | 4.8 km/h（80m/分） | 一般的な歩行速度 |
| **自転車** | 14.4 km/h（240m/分） | 都市部の平均 |
| **車（都市部）** | 17 km/h（283m/分） | 信号・渋滞込みの実効速度 |
| **車（郊外）** | 30-40 km/h | 信号が少なく流れがよい |
| **電車** | — | 乗車時間+徒歩アクセス+待ち時間で推定 |

#### 距離なしの簡易推定テーブル（推奨）

CEOの指摘通り、厳密な距離計算よりも**場所カテゴリ間のヒューリスティック**が実用的:

| 移動パターン | 車 | 電車 | 徒歩 | 自転車 |
|---|---|---|---|---|
| **近場（同一エリア）** | 10分 | — | 15分 | 7分 |
| **市内移動** | 20分 | 30分 | — | 20分 |
| **隣接市区移動** | 30分 | 40分 | — | — |
| **広域移動** | 45分 | 60分 | — | — |

さらに以下のオーバーヘッドを加算:

| 要素 | 加算時間 |
|---|---|
| **駐車場の確保**（車の場合） | +5分 |
| **駅までの徒歩**（電車の場合） | +10分（出発側+到着側） |
| **電車の待ち時間** | +5分 |
| **出発準備**（自宅から出る場合） | +10分 |

#### 実装上の距離区分判定ロジック

場所カテゴリから距離区分を推定する方法:

```
近場の手がかり:
- 「近くの〇〇」「いつもの〇〇」「歩いて行ける」
- コンビニ、ドラッグストア、近所のスーパー

市内移動の手がかり:
- 特定の店舗名（マクドナルド、BMW、スターバックス等）
- 病院、歯医者、銀行、役所
- ショッピングモール、映画館

広域移動の手がかり:
- 「〇〇駅の近く」（遠い駅名）
- 「〇〇市に行く」
- 空港、大型施設
```

**Aneurasync への示唆**: 初期実装はAPIなしのヒューリスティックで十分。`placeTable.ts` に距離区分（near/city/adjacent/wide）を追加し、交通手段とのクロスで移動時間を自動推定する。精度よりも「移動時間がゼロでなくなる」こと自体が最大の改善。

### 3.3 日本特有の考慮事項

- **通勤時間の全国平均**: 片道39.5分（総務省統計局）
- **首都圏平均**: 片道56.5分
- **東京圏で最頻の通勤時間**: 60-74分（23.2%の通勤者）
- **交通手段の主流**: 都市部は電車、全国では車
- **都市部の車の実効速度**: 時速17km程度（信号・渋滞込み）

---

## 4. マルチストップ（複数目的地）プランの構造

### 4.1 ツアー構造のモデリング

CEOの指摘に基づく正しいプラン構造:

```
現在のモデル（問題あり）:
┌─────────────────────┐
│  09:00  仕事 (120分)  │
│  11:00  BMW (30分)    │  ← 移動時間なし
│  11:30  マック (90分)  │  ← 移動時間なし
└─────────────────────┘

あるべきモデル:
┌─────────────────────────────────────┐
│  09:00  出発準備 (10分)               │
│  09:10  🚗 自宅→マクドナルド (20分)   │  ← 移動
│  09:30  マクドナルドで仕事 (120分)     │  ← 滞在
│  11:30  🚗 マクドナルド→BMW (15分)    │  ← 移動
│  11:45  BMWで用事 (30分)              │  ← 滞在
│  12:15  🚗 BMW→自宅 (20分)           │  ← 移動
│  12:35  帰宅                          │
└─────────────────────────────────────┘
```

### 4.2 ツアー構造の型設計（提案）

```typescript
interface TourLeg {
  /** 移動 or 滞在 */
  type: "travel" | "stay";
  /** 開始時刻 */
  startTime: string; // HH:mm
  /** 所要時間（分） */
  durationMin: number;
  /** 移動の場合: 出発地 */
  from?: string;
  /** 移動の場合: 到着地 */
  to?: string;
  /** 移動の場合: 交通手段 */
  transport?: TransportMode;
  /** 滞在の場合: 場所ラベル */
  location?: string;
  /** 滞在の場合: やること */
  activity?: string;
  /** 元の PlanItem ID（滞在の場合） */
  planItemId?: string;
}

interface DayTour {
  /** 自宅出発時刻 */
  departureTime: string;
  /** 帰宅予定時刻 */
  estimatedReturnTime: string;
  /** ツアーの各区間 */
  legs: TourLeg[];
  /** 総移動時間（分） */
  totalTravelMin: number;
  /** 総滞在時間（分） */
  totalStayMin: number;
}
```

### 4.3 各ストップでの滞在時間 + 移動時間 + バッファの設計

#### バッファタイムの研究知見

- **推奨バッファ**: 予定間に15-30分のバッファが一般的に推奨される
- **目的**: 予期せぬ遅延の吸収、精神的リセット、次の予定の準備
- **差別化**: サービスの種類によってバッファを変える（例: 歯医者後は長めに、カフェ→カフェは短めに）
- **研究**: 5-10分の小バッファでも効果がある。まず小さく始めてフロー（流れ）と満足度への影響を観測すべき

#### Aneurasync への提案: バッファ設計

| 移動パターン | バッファ |
|---|---|
| 滞在 → 近場移動 | +5分 |
| 滞在 → 市内移動 | +10分 |
| 自宅出発 | +10分（出発準備） |
| 重要な予定の前 | +15分（到着余裕） |
| 医療・役所系の後 | +10分（会計・整理） |

---

## 5. コーデ提案に必要な情報と収集タイミング

### 5.1 ファッションテック先行事例

#### Cladwell

- **コア機能**: 手持ち服のデジタルクローゼット + 天気連動の毎日のコーデ提案
- **入力情報**: 服の写真、天気（自動取得）、アクティビティ/場面（手動選択）
- **提案ロジック**: 天気 + 着用パターン + スタイル嗜好 → 3候補を毎朝提示
- **特徴**: 「週間プランニング」「旅行プランニング」「特別な場面プランニング」の3モードが存在

#### Stylebook

- **コア機能**: ワードローブ管理 + コーデ記録 + 着用スケジュール
- **特徴**: カレンダーにコーデを事前登録する「スケジュール」機能
- **UIの特色**: シンプルで機能主義的。デザイン賞は取らないが長年の固定ファンがいる

### 5.2 コーデ提案に必要な最小情報セット

学術研究とアプリ事例から抽出した、コーデ提案に必要な情報を3層に分類:

#### 必須層（これがないと提案不可能）

| 情報 | 取得方法 | Aneurasync の状況 |
|---|---|---|
| **手持ち服のリスト** | ユーザー登録 | My-Style で管理済み |
| **天気（気温+天候）** | API自動取得 | Calendar で取得済み |

#### 推定可能層（聞かなくても推定できる）

| 情報 | 推定方法 | Aneurasync の状況 |
|---|---|---|
| **場所の屋内/屋外** | placeTable のカテゴリ | placeTable に traits.indoor あり |
| **フォーマリティ** | イベントタイプから推定 | EVENT_TYPE_PATTERNS で検出中 |
| **歩き量** | 移動手段+目的地数から推定 | 移動時間が入れば推定可能に |
| **一緒にいる人** | テキストから自動検出 | TO_PROTECT_COMPANION で検出中 |

#### 確認層（曖昧なときだけ聞く）

| 情報 | いつ聞く | 聞き方 |
|---|---|---|
| **雰囲気の希望** | イベントタイプが混在する時 | 「仕事とデート、どっちが重め?」 |
| **気合レベル** | 特別な予定がある時 | 「気合入れたい感じ?」 |

### 5.3 天気 x 予定 x 場所 → コーデ提案の設計パターン

学術研究（"Learning Context-Aware Outfit Recommendation", MDPI 2023）から:

- **ユーザー情報**: 体型、肌色、身長、スタイル嗜好
- **コンテキスト情報**: 季節、天気、地理的位置、TPO（時間・場所・場面）
- **アイテム情報**: 色、パターン、テクスチャ、ガーメントタイプ
- **履歴情報**: 過去の着用パターン、ユーザーの好みの変化

**4つの推薦タスク**:
1. アイテム検索（Item Retrieval）
2. 補完アイテム推薦（Complimentary Item）
3. 全身コーデ推薦（Whole Outfit）← Aneurasync はここ
4. カプセルワードローブ推薦（Capsule Wardrobe）

**Aneurasync への示唆**: 既存の `outfitBridge.ts` が `MorningPlan → EventContext → vcIntent → outfitEngine` の流れを持っている。移動時間が入ることで「歩き量」の推定精度が上がり、結果としてコーデ提案の質も向上する。

### 5.4 収集タイミングの設計

```
Morning Protocol フロー:
1. ユーザーが「今日の予定」を入力
2. intentParser が場所・タスク・交通手段を構造化
3. ツアー構造（移動+滞在）を自動生成  ← 新規追加
4. 移動時間からwalkLevelを自動推定     ← 新規追加
5. sufficiencyGate で不足情報を判定
6. 不足があれば1問だけ聞く
7. プラン提示（移動時間込み）          ← 改善
8. コーデ提案（移動情報も反映）        ← 改善
```

**重要な原則**: 「聞くべき情報」と「推定可能な情報」を厳密に分離する。移動時間は**推定可能な情報**であり、ユーザーに聞くものではない。「マクドナルドで作業してBMWに寄る」と言われたら、移動時間は Alter が自動で挿入すべき。

---

## 6. 人間の1日のプランの典型構造

### 6.1 1日の活動フェーズ

```
Phase 1: 起床・準備（Morning Routine）
  └── 時間: 30-90分
  └── 場所: 自宅
  └── コーデ: このフェーズで決定

Phase 2: 出発準備
  └── 時間: 10-15分
  └── 行動: 持ち物確認、身支度最終チェック

Phase 3: 移動（Outbound Travel）
  └── 時間: 交通手段依存
  └── 出発時刻 = 到着希望時刻 - 移動時間 - バッファ

Phase 4: 活動（Activity at Destination）
  └── 時間: タスク依存
  └── 場所: 目的地

Phase 5: 移動（Inter-Stop Travel）※複数目的地の場合
  └── 時間: 前の目的地から次の目的地への移動

Phase 6: 活動（Activity at Next Destination）
  └── 繰り返し

Phase 7: 帰路（Return Travel）
  └── 時間: 最終目的地→自宅

Phase 8: 帰宅後（Evening Routine）
  └── 夕食・リラックス・振り返り
```

### 6.2 時間見積もりの粒度

#### 研究知見

| 粒度 | 用途 | 精度 | 認知負荷 |
|---|---|---|---|
| **5分** | エグゼクティブ級の時間管理 | 最高 | 高い |
| **15分** | プロジェクト管理の最適解 | 高い | 適度 |
| **30分** | 日常プランニング | 中 | 低い |

- 15分刻みが「精度と使いやすさのスイートスポット」（時間追跡の研究）
- 15-25分の集中フェーズ + 5分休憩はポモドーロ・テクニックとも一致
- 5分刻みは「ノイズの効率的トリアージ」に向くが、日常プランには過剰

**Aneurasync への示唆**: プランの表示は**15分刻み**が最適。ただし移動時間の内部計算は5分刻みで行い、表示時に15分単位に丸める。

### 6.3 バッファタイムの一般的な配分

| 場面 | 推奨バッファ |
|---|---|
| 通常の予定間 | 15分 |
| 重要な会議の前 | 30分 |
| 医療系の後（会計含む） | 15分 |
| 移動を伴う予定の前 | 移動時間 + 10分 |
| 初めて行く場所 | 移動時間 + 15分 |
| 連続タスク間（同じ場所） | 5-10分 |

---

## 7. 総合インサイト

### 7.1 現在の Morning Protocol の根本的な問題

現在のコード（`planningEngine.ts` の `buildDayPlan`）を分析した結果:

1. **`PlanItem` に移動の概念がない** — `kind: "fixed" | "todo"` の2種類のみ。`"travel"` がない
2. **場所間の関係がモデリングされていない** — `locationSequence` は存在するが、移動時間の計算に使われていない
3. **時間配置が「空き時間詰め込み」方式** — 固定予定の間にtodoを詰めているだけで、移動によるギャップを考慮していない
4. **出発準備・帰宅のモデリングがない** — 1日のプランは「活動」で始まり「活動」で終わっている

### 7.2 改善の方向性（3段階）

#### Phase 1: 最小限の移動時間挿入（推奨: 即時実装）

- `PlanItem` に `kind: "travel"` を追加
- `placeTable` に距離区分（near/city/adjacent/wide）を追加
- `DayConditions.mainTransport` + 距離区分 → ヒューリスティック移動時間を自動挿入
- `buildDayPlan` をツアー構造対応に拡張

#### Phase 2: 出発時刻の逆算（推奨: Phase 1 の後）

- 固定予定の開始時刻から移動時間を逆算して出発時刻を提示
- 「14時に歯医者 → 車で20分 → 13:30に出発」
- 出発時刻をプランに明示的に表示

#### Phase 3: API連携による精密推定（将来）

- Google Maps API / Apple MapKit で実際の移動時間を取得
- ユーザーの居住地 + 目的地の住所から精密推定
- コスト管理のため、固定予定のある日のみAPI呼び出し

### 7.3 Aneurasync の差別化ポイント

1. **「第二の自己」としてのプランニング**: 単なるスケジューラーではなく、「あなたの行動パターンを知っている存在」が移動時間まで含めて1日を設計する
2. **ツアー構造 + コーデ統合**: 移動時間が入ることで歩き量・外出時間が正確になり、コーデ提案の質が飛躍的に向上
3. **ヒューリスティック推定で十分**: API不要でも「移動時間ゼロ → 移動時間あり」の差は圧倒的。精密さよりも存在すること自体が価値
4. **パーソナライズ学習**: 「この人はマクドナルドまで車で15分」を学習し、次回から精度向上

---

## 8. 推奨アクション

### 即座に実行すべきこと

1. **`PlanItem` 型に `kind: "travel"` を追加** — 移動をファーストクラスのプランアイテムにする
2. **`placeTable.ts` に距離区分を追加** — 各場所カテゴリに `distanceHint: "near" | "city" | "adjacent" | "wide"` を設定
3. **ヒューリスティック移動時間テーブルを実装** — 交通手段 x 距離区分 → 移動時間（分）のマッピング
4. **`buildDayPlan` をツアー構造対応に拡張** — 滞在アイテム間に自動的に移動アイテムを挿入

### 設計時に守るべき原則

- **移動時間はユーザーに聞かない** — 推定して提示し、ユーザーが修正する
- **精度よりも存在が重要** — 「車で20分」が実際は25分でも、「移動時間ゼロ」よりはるかに有用
- **出発準備 + 到着バッファを含める** — 現実の外出は「出発準備10分 + 移動 + 到着バッファ5-10分」
- **帰路も含める** — 最終目的地 → 自宅の移動時間も明示する
- **15分刻みで表示** — 内部計算は5分刻み、UI表示は15分刻み

### CEO判断待ち事項

1. **API利用の判断**: Google Maps API を将来的に使うか（コスト vs 精度のトレードオフ）
2. **移動時間の学習**: ユーザーが修正した移動時間を `TaskDurationMemory` と同様に学習するか
3. **実装優先度**: 移動時間挿入を既存の Morning Protocol の改善として入れるか、独立フェーズとするか

---

## 情報ソース

### 学術文献
- Hagerstrand, T. (1970). "What about people in regional science?" — 時間地理学の原典
- [Space-time prism bounds of activity programs (2018)](https://www.tandfonline.com/doi/full/10.1080/13658816.2018.1563300)
- [Hagerstrand meets big data: time-geography in the age of mobility analytics (2023)](https://link.springer.com/article/10.1007/s10109-023-00421-0)
- [A framework for modern time geography (2023, PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC9934508/)
- [Time Geography - Wikipedia](https://en.wikipedia.org/wiki/Time_geography)
- [The current state of activity-based travel demand modelling (2023)](https://www.tandfonline.com/doi/full/10.1080/01441647.2023.2198458)
- [Activity Based Models (TF Resource)](https://tfresource.org/topics/Activity_based_models.html)
- [Trip chaining behavior (ScienceDirect)](https://www.sciencedirect.com/science/article/abs/pii/019126157990016X)
- [Variability in daily activity-travel patterns (Springer 2016)](https://link.springer.com/article/10.1007/s12544-016-0213-9)
- [Efficient door-to-door travel time estimation (Springer 2025)](https://link.springer.com/article/10.1007/s11116-025-10705-7)
- [Disparities in travel times between car and transit (Nature 2020)](https://www.nature.com/articles/s41598-020-61077-0)
- [Learning Context-Aware Outfit Recommendation (MDPI 2020)](https://www.mdpi.com/2073-8994/12/6/873)
- [Study of AI-Driven Fashion Recommender Systems (Springer 2023)](https://link.springer.com/article/10.1007/s42979-023-01932-9)

### アプリ・サービスの設計パターン
- [Travel Time for Google Calendar](https://www.addtraveltime.com/)
- [Reclaim.ai — AI Calendar](https://reclaim.ai/)
- [Reclaim.ai — Buffer Time](https://reclaim.ai/features/buffer-time)
- [Reclaim.ai — Travel Time, Decompression Time, Tasks](https://help.reclaim.ai/en/articles/4281992-travel-time-decompression-time-and-tasks-habit-breaks)
- [Morgen — Auto-schedule travel time](https://www.morgen.so/guides/auto-schedule-travel-time)
- [Calendar Auto Route Calculator (Apps Script)](https://mdaisuke.net/en/2025/12/22/calendar-auto-route/)
- [Routific — Route Optimization](https://www.routific.com/route-optimization)
- [OptimoRoute — Route Optimization Basics](https://optimoroute.com/route-optimization-basics/)
- [Fantastical](https://flexibits.com/fantastical)
- [Cladwell — Smart Closet App](https://cladwell.com/app)
- [Stylebook Review (2025)](https://www.cottoncashmerecathair.com/blog/2020/4/10/how-i-catalog-my-closet-and-track-what-i-wear-with-the-stylebook-app-review)

### 移動時間・速度データ
- [自動車・自転車・徒歩の移動時間換算](https://note.com/uchikun/n/nbd772f36f8d1)
- [通勤時間の平均（ニフティ不動産）](https://myhome-style.com/column/area/241010410784/)
- [都道府県別平均通勤時間（ニッセイ基礎研究所）](https://www.nli-research.co.jp/report/detail/id=65487?site=nli)
- [総務省統計局 通勤・通学時間FAQ](https://www.stat.go.jp/library/faq/faq23/faq23e02.html)
- [Google Maps Directions API](https://developers.google.com/maps/documentation/directions/overview)
- [Apple MapKit Directions](https://developer.apple.com/documentation/mapkit/mkdirections)

### バッファタイム・時間粒度
- [Buffer Time (Cal.com)](https://cal.com/blog/what-is-buffer-time-learn-how-to-use-buffer-times-in-scheduling)
- [Buffer Time (zcal)](https://zcal.co/blog/buffer-time)
- [15-minute granularity (Mataee)](https://mataee.com/en/blog/regle-15-minutes-granularite-suivi-temps)
- [15-Minute Increments (The 7 Minute Life)](https://the7minutelife.com/why-15-minute-increments/)
- [Time Granularity (My Biased Read)](https://biasedread.com/p/time-granularity)
