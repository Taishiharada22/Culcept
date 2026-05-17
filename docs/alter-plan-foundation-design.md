# Alter Plan Foundation Design

> Status: Draft / 設計提案
> Author: Build Unit（起草） → CEO 承認待ち
> Date: 2026-04-30
> Scope: 論理モデル・責務・依存関係・Wave roadmap の確定。DB migration および実装は別 PR。

---

## 1. Goal

Alter は外部 AI ではなく、**本人の代理思考**として働く。

Alter Plan は、本人の生活構造（外部固定予定 / 揺らぎ / 行動履歴 / 周期リズム）をもとに、本人が動き出す前に**今日の流れを先に組み立てる**仕組み。本人はそれを「自分が組んだ流れを確認・修正する」体験として受け取る。

Alter の組み立てと本人の意思がズレた箇所は、**失敗ではなく本人モデル更新の機会**として扱う。

### 不変原則

- **未確認 AI 推測の confirmed 化は永久禁止**
- **承認済み recurrence ルールの自動 materialization は許可**
- **最終確定は常に本人の意志で行う**

これにより、Alter Plan は「過干渉 AI 提案」ではなく「本人 OS の時間・空間投影」として成立する。

---

## 2. Core Concepts

4 つの論理 schema が Plan の基盤を構成する。

### 2.0 不変原則：ExternalAnchor / PlanSeed の境界

設計実装上、両者は決して混同してはならない。

```
ExternalAnchor は、本人の希望ではなく、
生活上すでに存在する外部制約である。

PlanSeed は、本人の希望・兆候・揺らぎであり、
確定予定ではない。

Alter はこの 2 つを混同してはならない。
```

- ExternalAnchor の例: 仕事 / 授業 / バイト / 通院 / フライト / 試験 / 会議
- PlanSeed の例: カフェ行きたい / ジム行きたい / 誰かと会いたい / 整理したい

判別ロジックは §6 参照。

### 2.1 ExternalAnchor

動かせない外部固定予定（仕事 / 学校 / バイト / 通院 / フライト 等）。

**設計原則**: ExternalAnchor は **discriminated union** として定義する。`anchorKind` で「単発予定」と「繰り返し予定」を型レベルで区別し、validity 必須原則と型定義の矛盾を排除する。

```ts
// 共通 base
type ExternalAnchorBase = {
  id: string;
  userId: string;

  title: string;
  startTime: string;          // 開始時刻（HH:mm 形式 or ISO 8601）
  endTime?: string;
  locationText?: string;
  locationCategory?: LocationCategory;

  // Rigidity
  rigidity: "hard" | "soft";  // hard = 動かすと現実崩れる / soft = 基本固定だが動かせる

  // Source Trace（external_anchor_sources を参照）
  sourceId: string;           // external_anchor_sources.id 参照（必須）
  confirmedAt: string;        // ユーザー承認時刻（必須）
  confidence?: number;        // 抽出時の自信度

  // Sensitive
  sensitiveCategory?: "medical" | "legal" | "exam" | "other";
};

// 単発予定: 特定の日付に紐づく
type OneOffExternalAnchor = ExternalAnchorBase & {
  anchorKind: "one_off";
  date: string;               // YYYY-MM-DD（必須）
  recurrenceRule?: never;
  validFrom?: never;
  validUntil?: never;
  exceptionDates?: never;
};

// 繰り返し予定: validity window + recurrence rule（必須）
type RecurringExternalAnchor = ExternalAnchorBase & {
  anchorKind: "recurring";
  validFrom: string;          // YYYY-MM-DD（必須）
  validUntil?: string;        // YYYY-MM-DD（終了未定なら省略可）
  recurrenceRule: string;     // iCal RRULE（必須）
  exceptionDates?: string[];  // 祝日 / 休講 / シフト変更等
  date?: never;
};

type ExternalAnchor = OneOffExternalAnchor | RecurringExternalAnchor;

// Source は別 entity として独立する。
// 1 source（1 PDF / 1 会話発話 等）から複数 ExternalAnchor が派生する場合があるため正規化する。
// これにより source 単位削除（「この PDF から抽出した全予定を消す」）が単純な DELETE で成立する。
type ExternalAnchorSource = {
  id: string;
  userId: string;

  sourceType: "manual" | "template" | "pdf" | "image" | "chat";
  originalFilename?: string;  // PDF / 画像時のみ
  extractedAt?: string;       // 抽出時刻
  capturedAt: string;         // ソース取り込み時刻

  // Raw retention policy（§11 参照）
  rawRetention: "discarded" | "stored";  // default: discarded
  rawStoragePath?: string;    // stored 時のみ
  rawExpiresAt?: string;      // stored 時の自動失効日

  notes?: string;
};

type LocationCategory =
  | "home" | "office" | "school" | "cafe"
  | "outdoor" | "public" | "transit" | "unknown";
```

### 2.2 PlanSeed

揺らぎの希望（「カフェで仕事したい」「ジム行きたい」等）。

```ts
type PlanSeed = {
  id: string;
  userId: string;

  signal: string;             // 元発話
  desiredAction?: string;     // 構造化した希望
  desiredDate?: string;       // 「明日」「来週水曜」を解決した日付
  desiredTimeHint?: "morning" | "afternoon" | "evening" | "anytime";
  actionShape?: ActionShape;  // alterHomeAdapter の 8 形を流用（full_go / bounded_go / prepare_then_go / trial_then_decide / observe_first / delegate_or_request / defer_with_trigger / skip）

  confidence: number;
  status: "active" | "consumed" | "expired" | "rejected";

  source: "chat" | "manual";
  capturedAt: string;
  expiresAt?: string;         // 漠然な希望は自動失効
};
```

### 2.3 PlanDriftEvent

ズレの観測。passive / inferred / explicit の 3 種。

**重要**: PlanDriftEvent は `planItemId` を必須にしない。Wave 1 では DraftPlan item がまだ存在しないため、ズレの対象は ExternalAnchor / PlanSeed / OutfitCalendarItem も含む。`target` 構造で多態的に扱う。

```ts
type PlanDriftTarget =
  | { targetType: "external_anchor"; externalAnchorId: string }
  | { targetType: "plan_seed"; planSeedId: string }
  | { targetType: "draft_plan_item"; draftPlanItemId: string }
  | { targetType: "outfit_calendar_item"; outfitCalendarItemId: string };

type PlanDriftEvent = {
  id: string;
  userId: string;
  target: PlanDriftTarget;    // 対象の多態的識別（必須）

  driftType:
    | "time_changed"
    | "location_changed"
    | "deleted"
    | "delayed"
    | "completed"
    | "skipped"
    | "replaced";

  predicted?: {
    startTime?: string;
    endTime?: string;
    locationCategory?: LocationCategory;
    actionShape?: ActionShape;
    intensity?: number;
  };
  actual?: {
    startTime?: string;
    endTime?: string;
    locationCategory?: LocationCategory;
    completed?: boolean;
    skippedReason?: string;
    intensityFelt?: number;
  };

  evidenceSource: "passive" | "inferred" | "explicit";
  evidenceStrength: "weak" | "medium" | "strong";

  // 反復検出のための集計キー
  patternKey?: string;        // 同パターン識別用ハッシュ
  repetitionCount?: number;   // 同 patternKey の累積回数
  timeWindowDays?: number;    // 反復の時間窓

  // 元対象が削除されても drift event の意味を保つためのスナップショット
  targetSnapshot?: {
    title?: string;
    startTime?: string;
    endTime?: string;
    locationText?: string;
    sourceKind?: string;
  };

  createdAt: string;
};
```

**polymorphic target の整合性確保**:

PlanDriftEvent は `target: PlanDriftTarget` の polymorphic association を採用するため、**DB レベルの完全な外部キー制約は張れない**（PostgreSQL の標準 FK は target_type + target_id の組み合わせを参照できない）。代わりに以下で整合性を確保する：

- **API 層で target_type ごとの存在確認**: 書き込み時に対応する entity（external_anchors / plan_seeds / draft_plan_items / outfit_calendar_items）の存在を検証
- **targetSnapshot 保存**: 対象の主要 field（title / startTime / locationText 等）をコピー保存
- 元対象（ExternalAnchor 等）が削除されても、drift event の意味（何がいつズレたか）は失われない
- patternKey は targetSnapshot を参照可能にする

**evidenceStrength の動的昇格**:

passive 単発は `weak`、同 patternKey が短期間に反復された場合は `medium` 〜 `strong` に昇格する。具体的な反復関数は Wave 4 で確定する。本設計書では方向性のみ固定する：

- 1 回の編集（単発） → `weak`
- 短期間に 3 回連続同パターン → `medium`
- 7 回以上反復 → `strong`

**Drift Logging の段階性（記録 → 反復検出 → evidenceStrength → 学習）**:

この順序を逆転させない。データが薄い段階で学習を回すと暴走する。

| Wave | 内容 | 学習の有無 |
|---|---|---|
| Wave 1 | passive drift logging（編集 / 削除 / 時間変更 / 完了 / 延期 / 置換 / 場所変更） | **記録のみ**、学習しない |
| Wave 2 | inferred drift logging 追加（会話・行動からの推定） | 記録のみ、学習しない |
| Wave 3 | explicit drift logging 追加（チェックイン UI） | 記録のみ、学習しない |
| Wave 4 | 反復検出 + evidenceStrength 動的昇格 + Drift Learning（A: 時刻 / E: 完了 / D: 強度） | **学習開始** |

Wave 1 の passive drift logging は、まず ExternalAnchor の編集 / 削除 / 時間変更 / テンプレ修正などから始まる。DraftPlan item がまだ存在しないため、target は最初 `external_anchor` 中心になる。

### 2.4 DraftPlan

Alter が組み立てた今日の流れ。

```ts
type DraftPlan = {
  id: string;
  userId: string;
  date: string;               // 対象日

  level: "candidate" | "draft";

  items: DraftPlanItem[];

  generatedAt: string;
  generatedBy: "rule" | "alter_engine";
  basedOn: {
    anchorIds: string[];
    seedIds: string[];
    rhythmSnapshot?: string;  // 派生元の Rhythm 集計時点
  };

  status: "pending" | "viewed" | "modified" | "accepted" | "rejected";
};

type DraftPlanItem = {
  id: string;
  startTime: string;
  endTime?: string;
  title: string;
  origin: "anchor" | "seed" | "rhythm_inferred";
  rigidity: "hard" | "soft" | "suggestion";
  reason?: string;            // なぜ Alter がここに置いたか
  confidence: number;
};
```

`level` の表現分岐：

| schema 値 | UI 表現 | 意味 |
|---|---|---|
| `candidate` | 「候補」「ヒント」 | 控えめ提示、断定しない |
| `draft` | 「下書き」 | Alter が代理思考として組み立てた状態 |

### 2.5 Rhythm Fabric（派生概念）

**独立 schema を持たない**。PlanDriftEvent の集計ビューとして自動派生する。

| Rhythm 要素 | 派生元 | 集計方法 |
|---|---|---|
| 起床リズム | passive `time_changed` | 曜日別平均 + 標準偏差 |
| エネルギー周期 | `completed` 比率 | 時間帯×曜日×完了率 |
| モード周期 | ActionShape 分布 | 曜日別 ActionShape 比率 |
| 場所選好周期 | locationCategory 分布 | 曜日×時間帯×場所 |
| 強度許容度 | `intensity_felt` 分布 | 曜日別 + 連続強度日の疲労減衰 |
| 回復必要日 | 翌日 completion 落ち込み | 強度日翌日の completion 回帰 |

実装は集計クエリのみ。Wave 4 で実装。

---

## 3. Data Lifecycle

```
[input 経路]
  manual / template / pdf / chat
       ↓
  [構造化]
       ↓
  AlterConfirmation（共通契約）
       ↓
[保存]
  ExternalAnchor or PlanSeed
       ↓
[使用]
  DraftPlan generator（Wave 4 で本実装）
       ↓
[実行]
  ユーザーが予定を編集 / 完了 / 削除
       ↓
[観測]
  PlanDriftEvent 自動記録（passive / inferred / explicit）
       ↓
[派生]
  Rhythm Fabric 集計
       ↓
[フィードバック]
  次の DraftPlan generator 入力へ
```

---

## 4. Common Confirmation Contract

PDF 取り込み / 会話キャプチャ / DraftPlan 確認の 3 シーンで**共通契約**を持つ。**UI は別、契約と状態は共通**。

### 4.1 契約層（型・操作モデル）

```ts
type AlterConfirmationAction =
  | "accept"
  | "edit"
  | "reject"
  | "snooze";

type AlterConfirmationMeta = {
  source: "pdf" | "chat" | "draft" | "manual";
  confidence: number;
  reason?: string;
  requiresUserApproval: true;
};
```

### 4.2 状態層（状態遷移）

```
pending → editing → confirmed
       ↘ rejected
       ↘ snoozed
```

**Terminal vs Paused（W1-7b 補足）**:

| state | 分類 | 再アクション |
|---|---|---|
| `pending` | active | 全 action 可 |
| `editing` | active | 全 action 可（edit は idempotent） |
| `snoozed` | **paused（non-terminal）** | 全 action 可（accept / edit / reject で再開、snooze は idempotent） |
| `confirmed` | **terminal** | 不可（no-op） |
| `rejected` | **terminal** | 不可（no-op） |

`snoozed` は「拒否」ではなく「後で決める」であり、`accept` / `edit` / `reject` で再開可能。時間経過による `pending` 自動復帰は API/UI 層の責務（FSM 外）。

状態遷移は 3 シーン共通。同一 hook / state machine で実装する。これがないと 3 箇所で重複実装され、バグの温床になる。

### 4.3 表現層（シーン別 UI）

| シーン | UI 形式 | 単位 |
|---|---|---|
| PDF 取り込み | 編集可能テーブル | 複数件まとめて確認 |
| 会話キャプチャ | 小カード | 1 件単位の即時確認 |
| DraftPlan 確認 | Flow 内 inline | 時間軸上で確認 |

### 4.4 ズレの UI 表現原則：沈黙デフォルト

ユーザーが予定を編集したとき、「Alter が学んだ」表示は**出さない**。学習は静かに動く。

理由: 毎回「学んだ」と表示すると Plan が学習臭くなり、本人 OS としての自然さを損なう。ズレは内部で `PlanDriftEvent` として記録され、Rhythm Fabric に集計されるが、UI には現れない。

例外: ユーザーが明示的に「Alter の学び」表示モードを ON にした場合のみ、軽い視覚フィードバックを出す（Wave 5+ のオプション機能）。

---

## 5. DraftPlan Gate

3 段階で発火を制御する。

### Level 0: 表示なし
- ExternalAnchors のみ表示
- Alter は組み立てない
- ユーザーが手動で予定を入れる段階

### Level 1: candidate / hint
- 「こういう組み方もあるかも」を控えめに提示
- **「下書き」と呼ばない**
- 自信度を明示（控えめなマイクロコピー）

### Level 2: draft
- 「下書き」として 1 日の流れを提示
- Alter が本人の代理思考として組み立てた状態

### MVP 判定基準（仮、実装時調整可）

```
Level 1 candidate（いずれか満たす）:
  - ExternalAnchor が 1 日分以上ある
  - PlanSeed が 3 件以上ある
  - passive PlanDriftEvent が 5 件以上ある

Level 2 draft（全て満たす）:
  - ExternalAnchor が 1 週間分以上ある
  - PlanDriftEvent が 20 件以上ある
  - PlanSeed が 5 件以上ある
  - 利用日数が 7 日以上
```

**注**: これらは絶対値ではなく初期 MVP 値。実装時に調整可能。

### Readiness Score（将来）

固定閾値は MVP 段階の便宜。ユーザータイプによってデータの入り方が違う（学生は Anchors 強いが Signals 薄い、会話派は逆）。実データが溜まった段階で readiness score（重み付き連続値）への移行を検討する。

設計書では公式を書かない。Explicit OUT セクション参照。

---

## 6. Anchors / Signals 判別ロジック

Home 会話キャプチャ時の判別。

### 6.1 ルール辞書（一次判定）

**ExternalAnchor 寄りの語彙**:
仕事 / 授業 / バイト / 面接 / 予約 / 通院 / 会議 / 試験 / フライト / 新幹線 / シフト / 通勤 / 通学

**PlanSeed 寄りの語彙**:
〜したい / 〜できたら / 〜たぶん / どこか / 近場 / カフェで作業したい / ジム / 散歩 / リフレッシュ

ルール辞書で 70-80% カバーを狙う。LLM 呼び出しコストを抑える。

### 6.2 LLM フォールバック（二次判定）

ルール辞書で曖昧な場合のみ LLM 呼び出し。判定軸：

- **確信度**（明示日時か漠然か）
- **不可動度**（動かせない事実か揺らぎか）

### 6.3 判定マトリクス

```
確信度 高 ∧ 不可動度 高 → ExternalAnchor 候補（要ユーザー確認）
確信度 中 ∨ 不可動度 低 → PlanSeed
確信度 低                → 棄却
```

### 6.4 ユーザー確認

ExternalAnchor 候補は**必ず** AlterConfirmation を通す。PlanSeed は確信度高い場合のみ確認、低い場合は背景で蓄積（明示確認なし）。

### 6.5 不可動度の ML モデル化は Explicit OUT

ルール + LLM フォールバックで MVP は十分。専用 ML モデル化は Wave 5+ で検討。

---

## 7. Document Import 位置づけ

PDF / 画像から ExternalAnchor を取得する経路。

### Phase 1a: 単発予定 PDF（Wave 2）

対象: 予約票 / 会議招待 / 旅行 itinerary 単予定 / 診察予約

処理:
```
アップロード → Vision LLM → 構造化 JSON → AlterConfirmation → ExternalAnchor 保存
```

### Phase 1b: 時間割 PDF（Wave 2）

対象: 学校時間割 / 定期的な授業表

処理:
```
アップロード → Vision LLM（表構造抽出） → 構造化 JSON → AlterConfirmation 表形式 → ExternalAnchor 保存
```

**MVP 第一弾の境界**:
- 構造化 → 確認画面表示まで
- recurrence rule の自動推定は **MVP 範囲外**（手動補完で OK）
- 学期期間 / 祝日 / 教室変更は **MVP 範囲外**

### Phase 2: 高度（Wave 5）

シフト表（自分の名前抽出）/ 手書き写真 / recurrence 自動推定 / 学期カレンダー連携

### 7.1 アーキテクチャ

```
[アプリ Frontend]
  ファイル選択 / カメラ撮影
       ↓
[Next.js API Route]
  認証 → ファイル受領
       ↓
[Vision LLM 呼び出し]
  Claude Sonnet 4 / Opus 4.7
  プロンプト: 構造化スキーマ提示
       ↓
[構造化 JSON]
       ↓
[AlterConfirmation]
  ユーザー確認 / 編集
       ↓
[ExternalAnchor 保存]
  Supabase RLS で本人スコープ
```

### 7.2 Vision LLM が決定的に強い理由

時間割 / シフト表は 2D テーブル構造。OCR + テキスト抽出だと列行対応が崩れる。Vision LLM ならテーブル構造を直接理解できる。手書き / スキャン / 写真でも動く。

### 7.3 raw ファイル保存方針

詳細は §11 Privacy & Source Trace 参照。原則として raw 画像 / PDF は保存しない。

### 7.4 Staging 層（確認前の抽出結果の置き場）

未確認の抽出結果は **ExternalAnchor として保存しない**（§2.1 の `confirmedAt` 必須原則を守る）。

ただし、PDF / 画像 / 会話から構造化された JSON を AlterConfirmation 画面に出すまでの**一時保持**が必要になる。設計書ではこの staging 層を明確に分離する。

| 段階 | 保持方針 | 採用判断 |
|---|---|---|
| **MVP** | **client / session state のみ** | 採用 |
| **将来** | TTL 付き **import session**（`plan_import_sessions` / `extracted_anchor_candidates`） | Wave 5+ で検討 |

**MVP（client / session state）の特徴**:
- 確認画面を閉じる / リロードすると消える
- privacy は最強（DB に未確認データが一切残らない）
- UX は弱め（途中離脱で再アップロード必要）

**将来（import session）の特徴**:
- TTL 付きで永続化（例: 24 時間）
- 承認後に ExternalAnchor へ昇格
- 未承認は TTL で自動削除
- ExternalAnchor とは**完全に別テーブル**で分離

**不変原則**:

```
未確認の抽出結果は ExternalAnchor と同一テーブルに混ぜない。
confirmed と staging は schema レベルで分離する。
将来 import session を導入する際も、ExternalAnchor への直接書き込みは禁止。
昇格処理を経由する。
```

これがないと「未確認データの紛れ込み」という最悪のバグが起きる。

---

## 8. UI Relation

### 8.1 Home ⇄ Plan の横スワイプ

- Home は変更しない（既存 Alter chat 体験を保つ）
- 右スワイプで Plan へ移動
- Plan から左スワイプで Home へ戻る

### 8.2 Plan 内 3 タブ

| タブ | 責務 | 内容 |
|---|---|---|
| Calendar | 俯瞰 | 月 / 週 / 日表示、コーデカレンダー統合、予定 + 天気 |
| Flow | 今日の流れ | タイムライン、移動、AlterConfirmation inline |
| Map | 空間 | 今日の予定の地図、ピン、経路 |

### 8.3 Calendar とコーデカレンダー統合

`lib/shared/wearEvents.ts`（Shared Style Domain）と接続。Calendar セルに以下を重ねる：

- 予定マーク
- コーデサムネ（既存機能）
- 天気アイコン（既存）

コーデ変更 UX は既存スワイプ操作を維持（日をクリックするとスワイプでコーデ変更可能）。

### 8.4 Map のスコープ

**今日の予定のみ表示**。明日以降は Calendar / Flow から確認する。

---

## 9. Wave Roadmap

並行 5 Wave 構造。GPT 案の直列 6 段階は Drift Logging の前倒しや UI / Anchors / Logging の並行性を表現しきれないため、並行トラック構造を採用する。

### Wave 1: Foundation（並行）

並行 5 トラック：

1. 本設計書起草（本ドキュメント）
2. 4 schema 論理定義（TypeScript 型）
3. Plan 3 タブ UI 骨格（空表示 OK）
4. ExternalAnchor 手動入力 + 曜日テンプレート
5. **passive drift logging**（編集操作ログ記録）

着手依存: 設計書 CEO 承認後。

**重要**: Wave 1 段階で passive drift logging を開始することで、後続 Wave で利用するデータが早期から蓄積される。Drift Logging を後ろに置くと、Level 2 draft 発火条件（実績 20 件）達成までに長期間を要する。

### Wave 2: 取得層（並行）

並行 4 トラック：

1. Document Import Phase 1a + 1b（構造化 → 確認まで）
2. Home 会話キャプチャ + Anchors/Signals 判別
3. inferred drift logging（会話・行動からの推定）
4. AlterConfirmation 3 層実装（契約 + 状態 + 表現）

### Wave 3: Level 1 Candidate 本実装

**範囲**:

1. Level evaluator 実装（Level 0 / 1 / 2 判定ロジック）
2. DraftPlan schema 実装
3. **Level 1 candidate / hint 本実装**
   - candidate 生成ロジック
   - 「候補」「ヒント」UI
4. **Level 2 draft は contract / stub / 表示枠予約まで**
   - presentation contract 定義
   - generator は stub（空配列を返す or 簡易ルール）
   - UI に表示枠を予約（中身は Wave 4 で埋める）
5. explicit drift logging（チェックイン UI）

**重要原則**: Wave 3 では Level 2 draft generator を**本実装しない**。Level 1 candidate までで安定運用し、データを蓄積する。Level 2 への移行は Wave 4 で行う。

### Wave 4: Level 2 Draft + Drift Learning

**範囲**:

1. **DraftPlan generator 本実装**（Level 2）
   - ExternalAnchors の隙間に PlanSeeds を配置
   - Rhythm Fabric を使って順序・強度を調整
2. Drift Learning 3 軸
   - **A: 時刻ズレ**（predicted_start vs actual_start）
   - **E: 完了ズレ**（done / skipped / delayed / replaced）
   - **D: 強度ズレ**（task density 4 次元）
3. Rhythm Fabric 集計ビュー実装
4. evidence_strength の反復関数化（具体式確定）

着手依存: Wave 3 で蓄積された PlanDriftEvent が一定量に達してから（目安: 利用ユーザーの 50% 以上が Level 2 発火条件を満たす）。

### Wave 5: 拡張（将来）

- Document Import Phase 2（シフト表 / 手書き / recurrence 自動推定）
- 残り Drift 軸（B: 場所 / C: モード / F: 順序 / G: 不在）
- Google Calendar / iCal 連携（CEO 承認案件）
- Before / During / After 介入（別設計書）
- Readiness score 公式化検討
- ズレ表示モードのオプション機能

### 9.1 Wave 並行性のまとめ

| 並行可能 | 理由 |
|---|---|
| Wave 1 内 5 トラック | schema 定義と UI 骨格と入力経路と passive logging は依存関係なし |
| Wave 2 内 4 トラック | Document Import / 会話キャプチャ / inferred logging / Confirmation はそれぞれ独立 |
| Wave 3 と Wave 4 の一部準備 | Wave 3 で contract / stub を定義しておくことで Wave 4 generator 本実装が早く動ける |

### 9.2 Wave 1 Commit 階段

Wave 1 は並行設計だが、**実装 commit は分割する**。一気に landing するとレビュー負荷と回帰リスクが膨らむため。

**Home 非破壊原則**: Home 既存レイアウトは Wave 1 中盤までは変更しない。横スワイプ統合は Wave 1 最終段で feature flag 配下から段階的に開く。

```
W1-1: Plan foundation types
  - types/plan/external-anchor.ts
  - types/plan/external-anchor-source.ts
  - types/plan/plan-seed.ts
  - types/plan/plan-drift-event.ts（target 多態構造）
  - types/plan/draft-plan.ts
  - types/plan/alter-confirmation.ts（contract types）
  - 必要に応じて Zod schema を同梱
  Test: 型コンパイル通過のみ
  Risk: 低（型のみ、UI / DB 触らない）

W1-2: Plan route / shell skeleton
  - app/(culcept)/plan/page.tsx（feature flag 配下）
  - Calendar / Flow / Map の空タブ
  - Home は変更しない（横スワイプ統合は W1-8 まで保留）
  Test: ルーティング E2E
  Risk: 低（Plan 側のみ）

W1-3: ExternalAnchor migration draft（CEO 承認案件）
  - supabase/migrations/<date>_external_anchor_sources.sql
  - supabase/migrations/<date>_external_anchors.sql
  - RLS 設定（user-scoped）
  - validity window / rigidity / sensitive_category
  - external_anchor_sources を別テーブルとして正規化
  ※ migration ファイル起草は自律可、本番実行は CEO 承認

W1-4: ExternalAnchor manual / template input
  - 手動入力フォーム
  - 曜日テンプレート入力
  - API route（/api/plan/anchors）
  - validation
  - external_anchor_sources への保存込み
  Test: schema validation, RLS 確認
  Risk: 中（実データ流入の入口）

W1-5: PlanDriftEvent migration draft（CEO 承認案件）
  - supabase/migrations/<date>_plan_drift_events.sql
  - target 多態構造に対応（target_type + target_id の polymorphic association）
  - evidenceSource / evidenceStrength / patternKey / repetitionCount
  - planItemId 必須にしない設計を migration で表現

W1-6: passive drift logging
  - ExternalAnchor の編集 / 削除 / 時間変更 hook
  - 曜日テンプレート修正 hook
  - PlanDriftEvent 保存 API
  - patternKey 計算関数（対象 type ごと）
  - target = "external_anchor" を最初に対応
  ※ DraftPlan item の target 対応は Wave 3 以降
  Test: event capture unit test
  Risk: 中

W1-7: AlterConfirmation state layer
  - Confirmation hook
  - State machine（pending → editing → confirmed/rejected/snoozed）
  - 契約層 types
  - UI は用途別（PDF / 会話 / Draft）で別実装、状態のみ共通
  - W1-4 と並行可（独立 commit）
  Test: 状態遷移 unit test
  Risk: 低

W1-8: Home ⇄ Plan アクセス導線
  - Home 既存レイアウトは変更しない
  - Home 上の既存カレンダーアイコンを Plan へ繋ぐ準備
  - 横スワイプまたはタブ遷移の最小導線（feature flag 配下）
  - feature flag を段階的に開ける
  ※ Home 体験劣化リスクが最大なので最後に分離
  Test: navigation E2E、Home 既存 UI に影響しないことを確認
  Risk: 高（Home 体験への影響）
```

**依存グラフ**:

```
W1-1 ──┬──> W1-2 ────────────────> W1-8
       ├──> W1-3 ──> W1-4 ──> W1-6
       ├──> W1-5 ──┘
       └──> W1-7（独立、W1-4 と並行可）
```

**migration の本番実行は CEO 承認後**。migration ファイルの起草・PR 作成は自律実行範囲。

---

## 10. Explicit OUT

### 永久 OUT（境界として固定）

- 未確認 AI 推測予定の confirmed 化
- raw PDF / image の無期限保存（明示許可時のみ例外）
- source trace なしの ExternalAnchor 保存
- validity window なしの recurring ExternalAnchor 保存
- 多人数の予定共有（aneurasync は本人 OS のため）
- Alter が本人の意志を上書きする操作

### 一時 OUT（Wave 5+ で復帰検討）

- 不可動度の ML モデル化（ルール + LLM で代替）
- Recurrence rule の自動推定
- 学期 / 祝日カレンダー連携
- Google Calendar / iCal 双方向同期
- Push 介入（Before / During / After は別設計書）
- Readiness score 公式化
- ズレ表示モードのオプション機能

### OK と明示するもの

- **承認済み recurrence ルールの自動 materialization**
  - 例: 「平日 9:00-18:00 = 仕事」をユーザーが 1 回承認すれば、以後の平日は自動展開
  - これは「自動予定確定」ではなく、承認済みルールの展開

---

## 11. Privacy & Source Trace

PDF / 時間割 / シフト表 / 通院 / 仕事予定はセンシティブ情報。本セクションが抜けると後の実装で必ず破綻する。

### 11.1 Storage 方針

- raw 画像 / PDF は Supabase Storage に保存しない
- パース後即破棄、構造化 JSON のみ保存
- 例外: ユーザーが明示的に「元ファイルも保持」を選択した場合のみ
  - 保存先: user-scoped bucket
  - RLS で本人のみアクセス
  - 保存期限: ユーザー指定（デフォルト 30 日）

### 11.2 Source Trace

ExternalAnchor の source 情報は **`external_anchor_sources` 別 entity** として独立する（§2.1 参照）。これにより 1 source（1 PDF / 1 会話発話）から派生した複数 ExternalAnchor を **source 単位削除（単純な DELETE WHERE source_id = ?）** で一括管理できる。

```
external_anchor_sources（1）
       ↓ id 参照
external_anchors（N）
```

ExternalAnchor 側必須 field:
- `sourceId`: external_anchor_sources.id への参照（必須）
- `confirmedAt`: ユーザー承認時刻（必須、未確認データは保存しない）
- `confidence?`: 抽出時の自信度

ExternalAnchorSource 側必須 field:
- `sourceType`: "manual" | "template" | "pdf" | "image" | "chat"
- `originalFilename?`: PDF / 画像時のみ
- `extractedAt?`: 抽出時刻
- `capturedAt`: ソース取り込み時刻
- `rawRetention`: "discarded" | "stored"（default: discarded）
- `rawStoragePath?`: stored 時のみ
- `rawExpiresAt?`: stored 時の自動失効日

### 11.3 User Control

- **source 単位削除**: 「この PDF から抽出した全予定を消す」
- **anchor 個別削除**
- **全 source 一括 export**（GDPR / 個人情報保護法対応）
- **sensitive category 削除**（医療 / 法的予定の一括消去）

### 11.4 Sensitive Categories

`sensitiveCategory` フィールドでカテゴリタグ：

```
"medical"  → 通院 / 診察 / 検査
"legal"    → 法廷 / 弁護士相談 / 公的手続き
"exam"     → 試験 / 入試
"other"    → ユーザー指定
```

将来の共有機能（永久 OUT 候補）でも sensitive はデフォルト除外。

### 11.5 暗号化（将来検討）

ユーザーごとの暗号化キー（KMS）は Wave 5+ で検討。MVP では Supabase 標準の at-rest 暗号化に依存。

---

## 12. Validity / Exceptions Model

ExternalAnchor は永続固定ではなく、**期限つきの外部制約**として扱う。

### 12.1 Validity Window

ExternalAnchor は §2.1 の **discriminated union（OneOff / Recurring）** で表現される。anchorKind により validity 必須範囲が異なる：

| anchorKind | 必須 field | optional field |
|---|---|---|
| `one_off` | `date` | （なし） |
| `recurring` | `validFrom`, `recurrenceRule` | `validUntil`, `exceptionDates` |

**永続固定の禁止**:

- recurring anchor で `validFrom` を持たない / `recurrenceRule` を持たないものは**永久 OUT**（§10 参照）
- `validUntil` 省略は「終了日未定」を意味する。「永続」ではない
- 学期終了 / 契約終了 / 転職等で `validUntil` が判明したら更新する

### 12.2 Recurrence Rule

iCal RRULE 準拠（例: `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR`）。

MVP では手動入力可。自動推定は Wave 5。

### 12.3 Exception Dates

祝日 / 休講 / シフト変更の例外日を配列で保持。ユーザーが個別追加可能。

### 12.4 Rigidity 定義

| rigidity | 意味 | DraftPlan 配置 |
|---|---|---|
| `hard` | 動かすと現実が崩れる | 絶対固定。隙間にのみ Seeds 配置 |
| `soft` | 基本固定だが、当日状態で動かせる | 再配置候補。当日体調や状況で動かせる |

例:
- `hard`: 仕事会議、授業、医者予約、フライト
- `soft`: 定期ジム、習い事、定期通院（変更可能なもの）

### 12.5 Validity 期限切れの扱い

`validUntil` を過ぎた ExternalAnchor は：

- DraftPlan には登場しない
- Calendar 表示からも自動非表示
- ユーザーが手動アーカイブまで record として保持
- ユーザーに「この予定は期限切れです、削除しますか？」と通知（Wave 4+）

---

## 設計書サマリ

本設計書は Alter Plan の論理基盤を固定する。実装は CEO 承認後、Wave 1 から並行着手する。

| 項目 | 確定内容 |
|---|---|
| **4 schema** | ExternalAnchor / PlanSeed / PlanDriftEvent / DraftPlan |
| **Rhythm Fabric** | 派生概念、独立 schema なし |
| **Common Confirmation Contract** | 契約 + 状態 + 表現の 3 層 |
| **DraftPlan Gate** | Level 0 / 1 / 2、MVP 固定閾値 |
| **Document Import** | PDF / 画像 → 構造化 → 確認まで |
| **Privacy** | raw 非保存、source trace 必須 |
| **Validity** | window + exceptions + rigidity 必須 |
| **Wave 構造** | 並行 5 Wave、Wave 3 = candidate 本実装 + draft stub、Wave 4 = draft generator + Drift Learning |

実装は CEO 承認後。本設計書の変更が必要になった場合は、別 PR で改訂する。

---

## Appendix: 関連既存資産

aneurasync 既存実装で本設計に接続するもの：

- `components/ui/glassmorphism-design.tsx` — UI コンポーネント基盤
- `lib/shared/wearEvents.ts` — Calendar とコーデカレンダー統合のための Shared Style Domain
- `lib/stargazer/alterHomeAdapter.ts` — ActionShape 8 形（PlanSeed / DraftPlan で流用）
- `lib/stargazer/bayesianAxisUpdater.ts` — Drift Learning A 軸更新で流用
- `lib/stargazer/contradictionEngine.ts` — Drift Learning E 軸の抵抗パターン検出で流用
- `lib/stargazer/stateWeighting.ts` — Drift Learning D 軸の状態重み付けで流用

これらを Wave 1-4 で順次接続する。
