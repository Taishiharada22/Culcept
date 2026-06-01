# 予定追加 体験リデザイン（2カラム・タイムライン配置）設計案

- **対象**: `/plan` の「予定を追加」体験。現状 = `AddAnchorModal.tsx`（縦フォーム「Alter に教える」）。理想 = CEO 提示イメージ（左タイムライン＋右作成パネル、右で作った予定カードを左へスワイプ配置、完了後 Alter が補完）。
- **状態**: **方針案（実装前 stop）**。CEO レビューで **補正付き GO**。本改訂（Phase A-0 設計補正）反映後、CEO GO で **A-1 pure 層**から着手。
- **branch**: `claude/nifty-turing-128e67`。
- **絶対条件**: 既存 `AddAnchorModal` パスと anchor スキーマ／API 契約／downstream パイプライン（DayGraph / transport / baseline / list・calendar・map tab）を**壊さない**。新体験は **flag で併存**させ、段階的に主導線へ昇格する。

---

## 0. CEO 決定事項（2026-06-01）

CEO レビュー（GPT 併走）で **補正付き GO**。設計補正は §0.5（Phase A-0）に確定。詳細は A-0-6。

| 論点 | 決定 |
|---|---|
| v1 スコープ | 設計書起草（本書）→ **補正付き GO**。§0.5 反映後、CEO GO で **A-1 pure 層から実装** |
| companions（誰と） | **v1 据え置き**（DB 列追加せず・v1 非表示。Phase C で migration 設計） |
| 繰り返し（recurring） | 新シートは **one_off 専用**。繰り返しは既存 `AddAnchorModal` へ退避（非回帰） |
| 動かせなさ（rigidity） | **2段階（hard / soft）維持**（DB enum 変更なし） |
| 既存モーダル | **併存**（flag 切替）。安定まで legacy 維持 |
| 時間永続（end_time） | **検証済＝start・end 両方が round-trip 永続**（A-0-1）。開始＋終了は本保存・migration 不要 |

---

## 0.5 Phase A-0 設計補正（2026-06-01・CEO/GPT レビュー反映）

前提を疑い独立検証した結果と補正を以下に確定する（CEO ルール①②④）。

### A-0-1.【検証済】終了時刻・所要の永続性 — GPT 最大懸念は否定

GPT 指摘「end_time / duration が保存されず `15:00–17:00` がリロードで `15:00 のみ` に戻る危険」を**実装前チェックとして独立検証**した：

- builder `lib/plan/anchor-input-form.ts:371` … `form.endTime` を input へ写像
- DTO `lib/plan/external-anchor-input.ts:47,284` … `endTime?` 定義＋HH:MM 検証（翌日跨ぎ可）
- 書込 `lib/plan/external-anchor-repository-supabase.ts:265,321` … `end_time: input.endTime ?? null` で DB INSERT
- 読戻 同 `:182,210` … `row.end_time` を endTime に復元（**リロード round-trip 確認**）
- 列 `supabase/migrations/20260430100100_external_anchors.sql:140` … `end_time TIME`（nullable・存在）
- **`duration` 列／フィールドは全層に存在しない**（grep 0 件）→ 所要 = end − start の派生。**duration migration 不要**

→ **結論**: `start_time`（NOT NULL・必須・検証 `external-anchor-input.ts:275`）と `end_time`（nullable）は**両方 round-trip で永続**。**開始＋終了は「仮表示」ではなく本実装**（リロード後も再現）。GPT #1・#3 の前提は**誤り**。時間モデルに migration は**一切不要**。
→ 制約: `start_time NOT NULL` のため「終了のみ（start 無し）」は保存不可 → 配置時に start を解決して具体化する（§4.3）。

### A-0-2. ComposeDraftState 新設（旧フォームへ寄せ過ぎない）

UI 内部状態を `AnchorFormState` に無理に寄せると、新 UI 固有状態（未配置 / placing / ghostY / 仮 end / placed-but-unsaved）が表現できない（GPT #3・妥当）。

- **UI 内部**: `ComposeDraftState`（`lib/plan/compose/composeDraft.ts`・pure）。例: `id` / `core{ title, locationText, rigidity, locationCategory? }` / `timeConstraint{ mode: none|start|end|both, startMin?, endMin? }` / `placement: unplaced|placing|placed` / `resolvedStartMin?` / `resolvedEndMin?` / `ghostY?`
- **保存境界のみ**で `ComposeDraftState → AnchorFormState → buildAnchorInputFromForm → CreateOneOffAnchorInput` に変換（既存検証・契約を**単一経路**で再利用）。
- 既存資産は**保存直前だけ**使う。内部状態は新モデルが持つ。

### A-0-3. 日付切替時の未保存 draft（Phase A）

上部矢印で対象日を変える際、**未保存の placed draft があれば日付切替をブロック**し「保存する / 破棄する / 戻る」を出す。日付別 draft 保持は強いが Phase A では重いので不採用。

### A-0-4. placed draft の削除／戻す導線（Phase A 要件）

ドラッグ配置は必ず置き間違いが起きる（GPT #5・妥当）。Phase A 最低要件: **placed カードを削除できる**（タップ→削除）。「右へ戻す（unplaced 化）」「時刻変更（再ドラッグ）」は準必須。

### A-0-5. タイムライン表示は「俯瞰」基本（CEO 原文「画面に収まる」）

単純な 24h 長尺スクロールは CEO 意図（1日を見渡す）に反する（GPT #2・妥当）。

- **既定＝俯瞰**: 既定可視域（初期 6:00–24:00）を**シート高に圧縮**して1日を見渡す（`PX_PER_MIN = canvasHeight / windowMinutes` 動的算出）。内部は1分刻み。早朝帯は控えめスクロールで到達。
- **ドラッグ中のみ精密**: 吹き出しで exact time（`09:17–10:47`）。真のズームは Phase A+ 預け。
- **レスポンシブ前提**: 大画面＝左右2カラム / スマホ＝左タイムラインを細く圧縮し右入力を主役。

### A-0-6. 確定した CEO 判断（旧 §11 の5点）

1. シート形態: **lg 2カラムで開始**（スマホはレスポンシブ前提・A-0-5）
2. 未配置 draft のまま完了: **ブロック**（配置を促す）
3. 既定ブロック長: **60分**。ただし**「開始のみ／未定」では可視化のみの仮長**（end 未保存）。**開始＋終了は入力値を本保存**（仮ではない・A-0-1）
4. 「誰と？」欄: **v1 非表示**（表示して非保存は誤解を生む。Phase C で DB 設計後）
5. Phase A の「Alter の解釈」カード: **完全非表示**（補完していないのに出すと嘘になる）

### A-0-7. 実装サブフェーズ（GPT 順）

- **A-1 pure 層**: `timeline-geometry` / `composeDraftReducer` / 時間条件 resolver（UI 無し・テスト可能）
- **A-2 骨格**: `AddAnchorComposeSheet` / `DayTimelineCanvas` / `ComposeFormPanel` / `ComposeCard`（保存無しでも可）
- **A-3 配置体験**: draft→placing→placed / ゴースト / 吸着 / placed 削除 / 未配置ブロック
- **A-4 保存接続**: placed[] → `createAnchorBundle` / onSuccess reload / flag 分岐 / legacy 併存
- **A-5 実機 smoke**: 作成→配置→完了→/plan 反映→**リロード後も破綻しない**→flag OFF で旧 modal 不変

**立入禁止（本トラック外）**: Phase B/C・migration・transport 本格接続・ListTab 管制官化・DB schema 変更。

---

## 1. 体験の本質と「状態モデル」

### 1.1 本質
普通のカレンダー = 「全部自分で入力して保存」。本体験 = **「予定の素材を作り、1日の時間軸に流し込み、残りを Alter が整える」**。Aneurasync 哲学（自己理解の可視化・Alter が第二の自己として補完する）と整合する。

### 1.2 イメージ3枚の独立分析（状態遷移として読む）
3枚は別画面ではなく、**同一ボトムシート上の時間軸状態遷移**である。実装で必ず必要になる状態（内部表現は `ComposeDraftState`・A-0-2）：

1. **draft** — 右パネルで作成中・未配置。必須（何を／どこで）が埋まると配置可能になる。
2. **placing** — 予定カードをドラッグ中。左タイムラインに薄いゴースト枠＋吹き出し（`09:17 - 10:47` 等、内部1分単位）を表示し、時間条件に応じて吸着。
3. **placed** — 時間確定。左に予定ブロックとして定着（複数可・どんどん埋まる・削除可 A-0-4）。
4. **committed** — ユーザーが「完了」押下 → ユーザーのターン終了 → Alter が移動・休憩・集中ブロックを補完し、「Alter の解釈」カードで**何をしたか可視化**（Phase B）。

現状 `AddAnchorModal` は 1→4 を「フォーム送信」1ステップに潰している。**この4状態を持つこと自体が新アーキ**であり、本リデザインの核。

### 1.3 左パネルの要件（独立に確認した重要点）
左タイムラインには**当日の既存予定（朝のルーティン / スタンドアップ / ランチ…）が既に描画**されている。つまり左は「選択日の既存 anchor を文脈として読み込み、その合間に新規 draft を置く」面。既存予定は read-only 文脈、新規 draft のみが完了で保存対象。

---

## 2. 現状コード監査（既存資産 / 新規構築）

| 領域 | 現状 | 判定 | 参照 |
|---|---|---|---|
| 入力 UI | 縦フォーム。`AnchorFormState` + `onChange` + `Field`。title/date/startTime/rigidity/location 主要＋「もっと細かく」 | 🟡 2カラム化は新規／**state・builder は保存境界で再利用** | `AnchorFormFields.tsx` / `AddAnchorModal.tsx` |
| 永続契約 | `buildAnchorInputFromForm` → `createAnchorBundle({source, anchors:[...]})`。**anchors は配列で一括 POST 可** | 🟢 **再利用＝スキーマ／API 無改修** | `lib/plan/anchor-input-form.ts` / `lib/plan/anchor-fetch.ts:179` |
| 終了時刻の永続 | `end_time TIME`（nullable）。builder/DTO/repo/round-trip すべて通る | 🟢 **検証済（A-0-1）** | `external-anchor-repository-supabase.ts:182,265` |
| 場所「カフェだけOK」 | `location_text` nullable、`PlaceCandidatesPanel` 候補非強制 | 🟢 **既に要件充足** | `external-anchors.sql:142` / `PlaceCandidatesPanel.tsx` |
| 動かせなさ | `rigidity NOT NULL CHECK(hard\|soft)`、UI 2択あり | 🟢 既存維持 | `external-anchors.sql:149` / `RIGIDITY_OPTIONS` |
| 移動手段＝区間 | `MovementSegment`（resolved/unresolved 判別共用体）は**anchor と別レイヤー**。events 間で計算 | 🟢 **GPT 核心指摘は設計済み** | `lib/plan/transport/transportTypes.ts` |
| 縦タイムライン | `DayGraphTimeline` は**テキスト箇条書き**。時間→座標写像は不在 | 🔴 **新規**（data 層 buildDayGraph は再利用可） | `DayGraphTimeline.tsx` |
| ドラッグ配置／吸着 | plan 配下に framer-motion `drag` / `onDragEnd` 不在 | 🔴 **ゼロから構築** | （該当なし） |
| 完了→Alter 補完 | `enhanceAlterNotes`（注釈文 LLM 強調・canary・既定OFF）のみ。補完オーケストレータ／休憩・集中挿入／解釈カードは不在。移動実数は transport Phase 1 が `duration=null` スタブ | 🔴 **新規**（Phase B）。移動実数は Routes API（Phase 2）待ち | `_actions/enhanceAlterNotes.ts` / `lib/alter-morning/planning/planRebuild.ts` |
| 誰と | 型にも DB にも不在 | 🔴 v1 据え置き（CEO 決定） | （該当なし） |

---

## 3. フェーズ分割

- **Phase A（ビジュアル骨格・フロント中心 / スキーマ無改修）** — 実装サブフェーズ A-1〜A-5・立入禁止は §0.5 A-0-7。
  2カラムボトムシート／左の俯瞰タイムライン（既存予定描画＋ゴースト＋draft 配置・A-0-5）／右の質問形式作成パネル／予定カード生成／ドラッグ配置＋4ケース吸着／placed 削除（A-0-4）／完了で **既存 bundle API に一括 POST**。Alter 補完は**なし**（完了＝保存）。flag で legacy と併存。
- **Phase B（Alter 補完・バックエンド）**
  完了→区間補完オーケストレータ（移動・休憩・集中ブロック）＋「Alter の解釈」カード。移動時間は当面 transport Phase 1 の**概算**表示（"概算" と明示）。Routes API 成立後に実数化。
- **Phase C（任意拡張）**
  誰と永続化（migration / CEO 承認）／日次「使える移動手段」／自動配置「Alter に置かせる」／配置後アクションメニュー。

---

## 4. Phase A 詳細設計

### 4.1 コンポーネント構成

**新規**
- `app/(culcept)/plan/components/compose/AddAnchorComposeSheet.tsx` — 2カラムボトムシートの親。`GlassModal size="lg"`。状態機械（draft/placing/placed/committed）と draft 配列を保持。
- `.../compose/DayTimelineCanvas.tsx` — 左の俯瞰タイムライン（A-0-5）。既存予定（read-only）＋placed draft＋placing ゴーストを座標描画。ドロップ受け・placed 削除。
- `.../compose/ComposeCard.tsx` — 右で作った予定カード（ドラッグ可能ハンドル）。`placed` 後は左ブロックとして表示。
- `.../compose/ComposeFormPanel.tsx` — 右の質問形式作成パネル（なにをする？／どこで？／時間は？／動かせなさ）。
- `lib/plan/timeline-geometry.ts` — **pure** な時間↔座標写像（`minutesToY` / `yToMinutes` / `snapMinutes`）。テスト容易。
- `lib/plan/compose/composeDraft.ts` — **pure** な `ComposeDraftState` 型＋reducer＋保存境界変換（A-0-2）。

**再利用（重要・無改修）**
- `AnchorFormState` / `emptyAnchorFormState` / `mergeInitialState` / `buildAnchorInputFromForm` / `buildSourceInputFromForm`（`lib/plan/anchor-input-form.ts`）— **保存境界でのみ**使用
- `createAnchorBundle`（`lib/plan/anchor-fetch.ts`）— **anchors 配列で一括 POST**
- `PlaceCandidatesPanel` / `useBiasContext` / `RIGIDITY_OPTIONS`（右パネルに組み込む）
- `buildDayGraph` 系（既存予定の当日構造取得。`PlanClient` が既に `dayGraphByDate` を保持）
- `GlassModal` / `GlassButton` / `GlassBadge`（`components/ui/glassmorphism-design`）

→ persisted contract が legacy と1ビットも変わらず、API/スキーマ/既存テストに非接触。

### 4.2 データフロー & 状態機械

```
[右パネル] onChange → ComposeDraftState 1件（A-0-2。保存境界でのみ AnchorFormState へ変換）
   └ 必須(title・空でない locationText※)充足 → ComposeCard 生成 = draggable
        ※「カフェ」だけでも可（location_text 任意のまま）。title 必須・場所は文言があれば可
[ドラッグ] DayTimelineCanvas へ drop → yToMinutes(snap) で startMin 確定（§4.3）→ placement=placed
[複数] 右で次の draft を作り、どんどん placed（削除も可・A-0-4）
[日付切替] 未保存 placed があれば ブロック→保存/破棄/戻る（A-0-3）
[完了] placed draft[] を保存境界で CreateOneOffAnchorInput[] へ変換 →
        createAnchorBundle({ source:{sourceType:"manual"}, anchors:[...] }) 1回 POST
        → onSuccess（PlanClient.load() 再取得）→ シート閉じる
        ※ Phase A は committed=保存。Phase B でここに Alter 補完を挿入
```

- placed draft は**クライアント state のみ**（未保存）。完了押下まで DB に触れない（`confirmed_at NOT NULL` 不変条件と両立）。
- 既存予定は read-only。完了で保存されるのは新規 draft だけ。
- 1回の完了 = 1 source（manual）に複数 anchor。bundle API が既に対応済。

### 4.3 時間モデル（`start_time NOT NULL` の解法・4ケース吸着）【A-0-1 検証反映】

**核心**: `start_time`（必須）と `end_time`（任意）は**両方 round-trip で永続**（A-0-1 検証済・`duration` 列は無く所要=end−start）。「未定」は入力モードに過ぎず、配置 Y か時間入力が**保存前に必ず具体 startMin を生む**。→ **migration 不要**。

3ホイール同時編集（画像 `15:00-17:00=60分` は内部矛盾）を避け **最小入力**：

| ケース | 右入力 | ドロップ挙動 | 保存される値 | 60分の役割 |
|---|---|---|---|---|
| 未定 | 空 | Y → startMin（1分 snap）自由配置 | start のみ（end=null） | 可視化のみ（仮） |
| 開始のみ | 開始 | 開始へ上端吸着 | start のみ（end=null） | 可視化のみ（仮）。Phase B で Alter が長さ調整 |
| 終了のみ | 終了 | 終了へ下端吸着 | start(=end−既定長) ＋ end | 既定長が**保存 start に影響**（soft なら Phase B 調整可） |
| 開始＋終了 | 両方 | 区間固定配置 | start ＋ end（**本保存・リロード再現**） | 不使用（所要=end−start を自動表示） |

- 内部1分刻み、表示は1時間主線＋薄い15/30分補助線。ドラッグ中の吹き出しで exact time。
- `rigidity=hard` は固定寄り、`soft` は吸着許容を緩める（Phase A は視覚ヒントのみ・保存値不変）。
- **保存境界**: `resolvedStartMin`/`resolvedEndMin` → `AnchorFormState.startTime/endTime`（HH:MM）→ `buildAnchorInputFromForm`（startTime 必須検証 `external-anchor-input.ts:275`）。

### 4.4 左タイムライン（DayTimelineCanvas）

- `lib/plan/timeline-geometry.ts`（pure）: `minutesToY` / `yToMinutes` / `snapMinutes(grid=1)`。**俯瞰基本（A-0-5）**＝既定可視域（初期 6:00–24:00）をシート高に圧縮して1日を見渡す（`PX_PER_MIN = canvasHeight / windowMinutes` で動的算出）。早朝帯は控えめスクロールで到達。内部1分刻み。
- 既存予定ブロック: `top = minutesToY(start)`, `height = minutesToY(end)-minutesToY(start)`（end 無は既定長）。色は密度可視のための淡色（紫=集中/仕事・青=ルーティン・黄=食事…の緩い分類。視認用であり厳密カテゴリ色ではない）。
- ゴースト枠: placing 中に snap 後の `[start,end]` を点線で先行表示。
- placed カードは削除可（A-0-4）。
- **DayGraphTimeline（テキスト箇条書き）は別物として温存**。Canvas は新規。data は当日 anchor（PlanClient が保持）から直接構築。

### 4.5 右パネル（ComposeFormPanel）

質問形式（教科書フォーム感を避ける）：
- **なにをする？**（title・必須）
- **どこで？**（locationText・任意だが「何かしらの文言」を促す。`PlaceCandidatesPanel` を下に・非強制。CEO 要件「カフェだけでも可」を満たす）
- **時間は？**（§4.3 の最小入力。空＝未定）
- **動かせなさ**（hard/soft・既存 `RIGIDITY_OPTIONS`）
- 「誰と？」は v1 **非表示**（A-0-6）
- 「繰り返しの予定はこちら →」= 既存 `AddAnchorModal` を開く小導線（recurring 退避・非回帰）

### 4.6 ドラッグ＆吸着の実装方針

- **framer-motion `drag`**（依存済・他所で使用）＋ `onDragEnd` で Canvas 上の Y を取得 → `yToMinutes` → snap → placed。`useReducedMotion` で控えめ化。
- スワイプ（左方向フリック）でも「最寄り空き枠へ置く」簡易動作を許容（イメージ②準拠）。ドラッグが主、スワイプは補助。
- 衝突は Phase A では「重なり可・半透明警告」程度（厳密な重なり解決は Phase B Alter 側）。

### 4.7 完了 → 保存（Phase A は Alter 補完なし）

- placed draft[] → 保存境界変換 → `createAnchorBundle` 1回 POST。
- 検証失敗は既存 `AnchorInputValidationError` 経路で右パネルにフィールド表示（既存資産）。
- 成功 → `onSuccess()`（`PlanClient.load()` 再取得）→ シート閉。
- 「Alter の解釈」カードは Phase A では**出さない**（A-0-6）。

### 4.8 繰り返し・誰と（決定の反映）
- 繰り返し: 新シート非対応。`AddAnchorModal`（recurring 対応済）へ小導線で退避。
- 誰と: v1 据え置き（CEO 決定）。Phase C で companions 列 migration を別途起草。

---

## 5. Phase B スケッチ（Alter 補完 + 解釈カード）

- 完了時 placed anchors（保存後）→ **補完オーケストレータ**（新規）：
  1. 隣接 anchor 間に `MovementSegment` を生成（既存 `planRebuild` / `synthesizeTravelItems` 資産を anchor ドメインに接続）。移動実数は Phase 1 スタブ（`duration=null`）→ **概算 or 非表示**。Routes API 成立で実数化。
  2. 休憩・集中ブロックの提案（**新規ヒューリスティック**：詰まり過ぎ検出・固定予定保護・食事/睡眠/ルーティン非破壊）。
  3. 「Alter の解釈」カード生成（移動の確保／集中の調整／休憩の最適化を**実施項目として可視化**。LLM or テンプレ）。
- **思想**: 裏で勝手に変えず「何をしたか」を見せる。後退・skip も honest に。
- 依存: transport Phase 2（Routes API）、`PLAN_FLAGS` 拡張、canary 配信。

---

## 6. 移動手段 ＝ 区間（anchor の属性にしない）

- CEO/GPT の「移動は予定ではなく予定間の属性」は**既存 `MovementSegment` で設計済**。anchor カードに移動手段欄を**必須化しない**（任意の区間例外指定は Phase C）。
- 「使える移動手段（日次）」は anchor でも区間でもなく**日レベル条件**。データの居場所が無いため Phase C。それまでは Alter 既定ヒューリスティック（公共交通に限定しない）でフォールバック。

---

## 7. 写真取り込み（`feat/plan-pdf-image-import`）との衝突回避

並行ブランチはシフト表 VLM 抽出（`lib/plan/shift/*`・`ShiftImportModal`・`plan_day_indicators`・dormant `/plan/dev-shift-draft`）。**核は完全分離**。共有ファイルは加算的：

| ファイル | 写真側 | 本件 | 回避策 |
|---|---|---|---|
| `PlanClient.tsx` | `FetchState` に dayIndicators 追加・tab へ prop | `openAdd` がどのシートを開くか分岐 | **最小差分**: `openAdd` に flag 分岐を足すだけ。`FetchState`／`load()`／tab prop は触らない |
| `lib/plan/featureFlags.ts` | shift 系フラグ | `composeTimelineEnabled`（新）追加 | 別キー加算 |
| `external-anchor-input.ts` / `anchor-fetch.ts` / `api/plan/anchors/route.ts` | shift_image source・dayIndicators | **再利用のみ・無改修** | 触らない＝衝突ゼロ |

- 結論: **実質衝突なし**。先に main へ入った方を後発が rebase 取り込み。本件は新規 `components/compose/*` と新 flag が主で、`PlanClient` は数行。
- `AddAnchorModal` / `AnchorFormFields` / `DayGraphTimeline` / anchor 型 / repository は写真側が**未接触** → 安全。

---

## 8. 不変条件（壊さないもの・絶対）

- 既存 `AddAnchorModal` パスは**残す**（flag OFF で従来どおり）。新体験が安定するまで削除しない。
- anchor スキーマ（`external_anchors`）・`createAnchorBundle` API 契約・`CreateExternalAnchorInput` 型を**変更しない**（Phase A は完全再利用）。
- downstream（DayGraph / transport / baseline / list・calendar・map / P2 LLM note）への入力契約を変えない。
- `confirmed_at NOT NULL` 不変: draft は完了まで未保存。
- 既存テスト（anchor input / 各 render contract）を壊さない。新規は新規テストで担保。
- 文言・data-testid: 既存を変更しない。新規 UI は新規 testid。
- **立入禁止**: Phase B/C・migration・transport 本格接続・ListTab 管制官化・DB schema 変更（A-0-7）。

---

## 9. フラグ & ロールアウト

- 新 flag: `PLAN_FLAGS.composeTimelineEnabled`（env `PLAN_COMPOSE_TIMELINE_ENABLED`、既定 **false**）。`lib/plan/featureFlags.ts` に加算。
- canary: 既存 `canaryUserIds` を流用可。
- `openAdd`（`PlanClient`）: flag ON かつ対象ユーザ → `AddAnchorComposeSheet`、それ以外 → 既存 `AddAnchorModal`。
- 段階: 内部 dogfood → canary → 既定 ON → legacy 撤去判断（別 stop）。

---

## 10. テスト方針

- `lib/plan/timeline-geometry.ts`: pure unit（minutesToY/yToMinutes/snap、4ケース吸着の境界、俯瞰圧縮の高さ算出）。
- `lib/plan/compose/composeDraft.ts`: reducer 単体（draft→placing→placed→削除、保存境界変換、未配置検出）。
- 完了→`createAnchorBundle` 入力: placed[] → `CreateOneOffAnchorInput[]` 変換の契約テスト（既存 builder 再利用なので主に map 部分）。
- render contract: `AddAnchorComposeSheet` の testid 骨格（既存 modal の contract と独立）。
- 既存 anchor input／legacy modal テストは**不変**で全 PASS を確認。
- self Playwright smoke（CEO 判断）: 作成→ドラッグ配置→吸着→完了→/plan 反映→**リロード後も再現**→flag OFF で旧 modal 不変。

---

## 11. CEO 判断（§0.5 A-0-6 で5点確定済）

旧 §11 の5論点は A-0-6 で確定。追加の実装判断は以下のみ（本書で確定・異議あれば指示）：
- 「終了のみ」は再現性のため **start(=end−既定長)＋end の両方を保存**（A-0-1）。Phase B で soft なら調整。
- 既定可視域は **6:00–24:00 を初期**とし、早朝は控えめスクロール（A-0-5）。

---

## 12. 今回の stop

- 本書 = **方針案＋ A-0 設計補正**。実装は CEO GO 後。
- branch `claude/nifty-turing-128e67` に本 doc を commit して停止。
- **GO の場合**: §0.5 A-0-7 の順（A-1 pure 層 → A-2 骨格 → A-3 配置 → A-4 保存 → A-5 smoke）で additive 実装。各サブフェーズ末で tsc/test 検証＋ stop。
- Phase B / C・migration・transport 本格接続・ListTab 管制官化・staging・merge・remote・本番有効化は引き続き **CEO gate**。
