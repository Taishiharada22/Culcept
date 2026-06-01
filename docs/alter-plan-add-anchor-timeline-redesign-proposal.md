# 予定追加 体験リデザイン（2カラム・タイムライン配置）設計案

- **対象**: `/plan` の「予定を追加」体験。現状 = `AddAnchorModal.tsx`（縦フォーム「Alter に教える」）。理想 = CEO 提示イメージ（左タイムライン＋右作成パネル、右で作った予定カードを左へスワイプ配置、完了後 Alter が補完）。
- **状態**: **方針案（実装前 stop）**。CEO 承認後に Phase A から着手。
- **branch**: `claude/nifty-turing-128e67`（本 doc を起草・commit して停止）。
- **絶対条件**: 既存 `AddAnchorModal` パスと anchor スキーマ／API 契約／downstream パイプライン（DayGraph / transport / baseline / list・calendar・map tab）を**壊さない**。新体験は **flag で併存**させ、段階的に主導線へ昇格する。

---

## 0. CEO 決定事項（2026-06-01・本 doc の前提）

| 論点 | 決定 |
|---|---|
| v1 スコープ | **まず設計書を起草**（本書）。コード着手は CEO 承認後 |
| 「誰と（companions）」永続化 | **v1 据え置き**。DB 列追加（migration）は行わない。入力欄は将来用に意識しつつ、v1 は非搭載 or クライアント表示のみ |
| 繰り返し（recurring） | （本書提案）新シートは **one_off 専用**。繰り返しは既存 `AddAnchorModal` パスへ退避（非回帰） |
| 動かせなさ（rigidity） | （本書提案）DB enum 変更を避け **2段階（hard / soft）維持**。GPT の4段階は採用しない |
| 既存モーダル | （本書提案）**併存**（flag 切替）。新体験が安定するまで legacy を残す |

---

## 1. 体験の本質と「状態モデル」

### 1.1 本質
普通のカレンダー = 「全部自分で入力して保存」。本体験 = **「予定の素材を作り、1日の時間軸に流し込み、残りを Alter が整える」**。Aneurasync 哲学（自己理解の可視化・Alter が第二の自己として補完する）と整合する。

### 1.2 イメージ3枚の独立分析（状態遷移として読む）
3枚は別画面ではなく、**同一ボトムシート上の時間軸状態遷移**である。実装で必ず必要になる状態：

1. **draft** — 右パネルで作成中・未配置。必須（何を／どこで）が埋まると配置可能になる。
2. **placing** — 予定カードをドラッグ中。左タイムラインに薄いゴースト枠＋吹き出し（`09:17 - 10:47` 等、内部1分単位）を表示し、時間条件に応じて吸着。
3. **placed** — 時間確定。左に予定ブロックとして定着（複数可・どんどん埋まる）。
4. **committed** — ユーザーが「完了」押下 → ユーザーのターン終了 → Alter が移動・休憩・集中ブロックを補完し、「Alter の解釈」カードで**何をしたか可視化**。

現状 `AddAnchorModal` は 1→4 を「フォーム送信」1ステップに潰している。**この4状態を持つこと自体が新アーキ**であり、本リデザインの核。

### 1.3 左パネルの要件（独立に確認した重要点）
左タイムラインには**当日の既存予定（朝のルーティン / スタンドアップ / ランチ…）が既に描画**されている。つまり左は「選択日の既存 anchor を文脈として読み込み、その合間に新規 draft を置く」面。既存予定は read-only 文脈、新規 draft のみが完了で保存対象。

---

## 2. 現状コード監査（既存資産 / 新規構築）

| 領域 | 現状 | 判定 | 参照 |
|---|---|---|---|
| 入力 UI | 縦フォーム。`AnchorFormState` + `onChange` + `Field`。title/date/startTime/rigidity/location 主要＋「もっと細かく」 | 🟡 2カラム化は新規／**state・builder は再利用** | `AnchorFormFields.tsx` / `AddAnchorModal.tsx` |
| 永続契約 | `buildAnchorInputFromForm` → `createAnchorBundle({source, anchors:[...]})`。**anchors は配列で一括 POST 可** | 🟢 **再利用＝スキーマ／API 無改修** | `lib/plan/anchor-input-form.ts` / `lib/plan/anchor-fetch.ts:179` |
| 場所「カフェだけOK」 | `location_text` nullable、`PlaceCandidatesPanel` 候補非強制 | 🟢 **既に要件充足** | `external-anchors.sql:142` / `PlaceCandidatesPanel.tsx` |
| 動かせなさ | `rigidity NOT NULL CHECK(hard\|soft)`、UI 2択あり | 🟢 既存維持 | `external-anchors.sql:149` / `RIGIDITY_OPTIONS` |
| 移動手段＝区間 | `MovementSegment`（resolved/unresolved 判別共用体）は**anchor と別レイヤー**。events 間で計算 | 🟢 **GPT 核心指摘は設計済み** | `lib/plan/transport/transportTypes.ts` |
| 縦ピクセルタイムライン | `DayGraphTimeline` は**テキスト箇条書き**。`minutesToY` 等の時間→座標写像は不在 | 🔴 **新規**（data 層 buildDayGraph は再利用可） | `DayGraphTimeline.tsx` |
| ドラッグ配置／吸着 | plan 配下に framer-motion `drag` / `onDragEnd` 不在 | 🔴 **ゼロから構築** | （該当なし） |
| 完了→Alter 補完 | `enhanceAlterNotes`（注釈文 LLM 強調・canary・既定OFF）のみ。補完オーケストレータ／休憩・集中挿入／解釈カードは不在。移動実数は transport Phase 1 が `duration=null` スタブ | 🔴 **新規**（Phase B）。移動実数は Routes API（Phase 2）待ち | `_actions/enhanceAlterNotes.ts` / `lib/alter-morning/planning/planRebuild.ts` |
| 時間「未定」 | `start_time TIME NOT NULL` | 🟡 配置で具体 startTime を生む → 保存形に未定は残さない（§4.3） | `external-anchors.sql:139` |
| 誰と | 型にも DB にも不在 | 🔴 v1 据え置き（CEO 決定） | （該当なし） |

---

## 3. フェーズ分割

- **Phase A（ビジュアル骨格・フロント中心 / スキーマ無改修）**
  2カラムボトムシート／左ピクセルタイムライン（既存予定描画＋ゴースト＋draft 配置）／右の質問形式作成パネル／予定カード生成／ドラッグ配置＋4ケース吸着／完了で **既存 bundle API に一括 POST**。Alter 補完は**なし**（完了＝保存）。flag で legacy と併存。
- **Phase B（Alter 補完・バックエンド）**
  完了→区間補完オーケストレータ（移動・休憩・集中ブロック）＋「Alter の解釈」カード。移動時間は当面 transport Phase 1 の**概算**表示（"概算" と明示）。Routes API 成立後に実数化。
- **Phase C（任意拡張）**
  誰と永続化（migration / CEO 承認）／日次「使える移動手段」／自動配置「Alter に置かせる」／配置後アクションメニュー。

本書は **Phase A を実装可能粒度**で、Phase B/C はスケッチで定義する。

---

## 4. Phase A 詳細設計

### 4.1 コンポーネント構成

**新規**
- `app/(culcept)/plan/components/compose/AddAnchorComposeSheet.tsx` — 2カラムボトムシートの親。`GlassModal size="lg"`（IcsImportModal と同等の広さ）。状態機械（draft/placing/placed/committed）と draft 配列を保持。
- `.../compose/DayTimelineCanvas.tsx` — 左の縦ピクセルタイムライン。既存予定（read-only）＋placed draft＋placing ゴーストを座標描画。ドロップ受け。
- `.../compose/ComposeCard.tsx` — 右で作った予定カード（ドラッグ可能ハンドル）。`placed` 後は左ブロックとして表示。
- `.../compose/ComposeFormPanel.tsx` — 右の質問形式作成パネル（なにをする？／どこで？／時間は？／動かせなさ）。
- `lib/plan/timeline-geometry.ts` — **pure** な時間↔座標写像（`minutesToY` / `yToMinutes` / snap）。テスト容易。

**再利用（重要・無改修）**
- `AnchorFormState` / `emptyAnchorFormState` / `mergeInitialState` / `buildAnchorInputFromForm` / `buildSourceInputFromForm`（`lib/plan/anchor-input-form.ts`）
- `createAnchorBundle`（`lib/plan/anchor-fetch.ts`）— **anchors 配列で一括 POST**
- `PlaceCandidatesPanel` / `useBiasContext` / `RIGIDITY_OPTIONS`（右パネルにそのまま組み込む）
- `buildDayGraph` 系（既存予定の当日構造取得。`PlanClient` が既に `dayGraphByDate` を保持）
- `GlassModal` / `GlassButton` / `GlassBadge`（`components/ui/glassmorphism-design`）

→ **右パネルは「`AnchorFormFields` の質問形式・横置き版」**であり、内部の state・build・検証は完全共用。これにより persisted contract が legacy と1ビットも変わらず、API/スキーマ/既存テストに非接触。

### 4.2 データフロー & 状態機械

```
[右パネル] onChange → AnchorFormState(draft) 1件
   └ 必須(title・少なくとも空でない locationText※)充足 → ComposeCard 生成 = draggable
        ※「カフェ」だけでも可（location_text 任意のまま）。CEO 要件どおり title 必須・場所は文言があれば可
[ドラッグ] DayTimelineCanvas へ drop → yToMinutes(snap) で startTime 確定（§4.3）→ placed draft[] に push
[繰り返し] 右パネルで draft 追加（新規 AnchorFormState）→ どんどん placed
[完了] placed draft[] を CreateExternalAnchorInput[] に map →
        createAnchorBundle({ source:{sourceType:"manual"}, anchors:[...] }) 1回 POST
        → onSuccess（PlanClient.load() で再取得）→ シート閉じる
        ※ Phase A は committed=保存。Phase B でここに Alter 補完を挿入
```

- placed draft は**クライアント state のみ**（未保存）。完了押下まで DB に触れない（confirmed_at NOT NULL 不変条件と両立）。
- 既存予定は read-only。完了で保存されるのは新規 draft だけ。
- 1回の完了 = 1 source（manual）に複数 anchor。bundle API が既に対応済。

### 4.3 時間モデル（`start_time NOT NULL` の解法・4ケース吸着）

**核心**: 「未定」は右パネルの入力モードに過ぎず、**保存形には残さない**。配置（Y 座標）または時間入力が、保存前に必ず具体 startTime を生む。→ **migration 不要**。

右パネルの時間入力は3ホイール同時編集（画像の `15:00-17:00=60分` は内部矛盾）を避け、**最小入力**にする：

| ケース | 右での入力 | ドロップ時の挙動 | Phase A の長さ決定 |
|---|---|---|---|
| 未定 | 時間欄空 | Y → startTime（1分 snap）。自由配置 | 既定ブロック長（例 60分）で可視化。endTime は未保存（任意） |
| 開始のみ | 開始だけ入力 | 開始時刻に**上端吸着** | 既定長で下端を仮置き（Phase B で Alter が長さ調整） |
| 終了のみ | 終了だけ入力 | 終了時刻に**下端吸着** | 既定長で上端を逆算 |
| 開始＋終了 | 両方入力 | その区間に**固定配置** | endTime = 入力値（所要は自動表示） |

- 内部は1分刻み、表示は1時間主線＋薄い15/30分補助線。ドラッグ中の吹き出しで exact time を見せる。
- `rigidity=hard` の draft は固定配置寄り、`soft` は吸着の許容を緩める（視覚ヒントのみ。Phase A では保存値に影響なし）。

### 4.4 左タイムライン（DayTimelineCanvas）

- `lib/plan/timeline-geometry.ts`：`PX_PER_MIN`（例 0.7px/min → 24h=1008px、スクロール領域）、`minutesToY(min)` / `yToMinutes(y)` / `snapMinutes(min, grid=1)`。表示は6:00〜22:00を初期可視域にしつつ 0:00–24:00 をスクロールで全保持。
- 既存予定ブロック：`top = minutesToY(start)`, `height = minutesToY(end)-minutesToY(start)`（end 無は既定長）。色は密度可視のための淡色（紫=集中/仕事・青=ルーティン・黄=食事…の緩い分類。厳密カテゴリ色ではなく視認用）。
- ゴースト枠：placing 中に snap 後の `[start,end]` を点線で先行表示。
- **DayGraphTimeline（テキスト箇条書き）は別物として温存**。Canvas は新規。data は当日 anchor（既に PlanClient が保持）から直接構築。

### 4.5 右パネル（ComposeFormPanel）

質問形式（教科書フォーム感を避ける）：
- **なにをする？**（title・必須）
- **どこで？**（locationText・任意だが「何かしらの文言」を促す。`PlaceCandidatesPanel` を下に・非強制。CEO 要件「カフェだけでも可」を満たす）
- **時間は？**（§4.3 の最小入力。空＝未定）
- **動かせなさ**（hard/soft・既存 `RIGIDITY_OPTIONS`）
- （誰と？ は v1 据え置き：表示するなら非保存の補助欄、または非搭載）
- 「繰り返しの予定はこちら →」= 既存 `AddAnchorModal` を開く小導線（recurring 退避・非回帰）

### 4.6 ドラッグ＆吸着の実装方針

- **framer-motion `drag`**（依存済・他所で使用）＋ `onDragEnd` で Canvas 上の Y を取得 → `yToMinutes` → snap → placed。`useReducedMotion` で控えめ化。
- スワイプ（左方向のフリック）でも「自動で最寄り空き枠へ置く」簡易動作を許容（イメージ②準拠）。ドラッグが主、スワイプは補助。
- 衝突回避は Phase A では「重なり可・視覚的に半透明警告」程度（厳密な重なり解決は Phase B Alter 側）。

### 4.7 完了 → 保存（Phase A は Alter 補完なし）

- placed draft[] → `buildAnchorInputFromForm` で各 `CreateOneOffAnchorInput` に変換 → `createAnchorBundle` 1回 POST。
- 検証失敗は既存 `AnchorInputValidationError` 経路で右パネルにフィールド表示（既存資産）。
- 成功 → `onSuccess()`（`PlanClient.load()` 再取得）→ シート閉。
- 「Alter の解釈」カードは Phase A では**出さない**（出すなら "Alter が整える準備中" の honest プレースホルダ）。誇大表示しない。

### 4.8 繰り返し・誰と（決定の反映）
- 繰り返し：新シート非対応。`AddAnchorModal`（recurring 対応済）へ小導線で退避。
- 誰と：v1 据え置き（CEO 決定）。Phase C で companions 列 migration を別途起草。

---

## 5. Phase B スケッチ（Alter 補完 + 解釈カード）

- 完了時 placed anchors（保存後）→ **補完オーケストレータ**（新規）：
  1. 隣接 anchor 間に `MovementSegment` を生成（既存 `planRebuild` / `synthesizeTravelItems` 資産を anchor ドメインに接続）。移動実数は Phase 1 スタブ（`duration=null`）→ **概算 or 非表示**。Routes API 成立で実数化。
  2. 休憩・集中ブロックの提案（**新規ヒューリスティック**：詰まり過ぎ検出・固定予定保護・食事/睡眠/ルーティン非破壊）。
  3. 「Alter の解釈」カード生成（移動の確保／集中の調整／休憩の最適化を**実施項目として可視化**。LLM or テンプレ）。
- **思想**: 裏で勝手に変えず「何をしたか」を見せる。後退・skip も honest に。
- 依存：transport Phase 2（Routes API）、`PLAN_FLAGS` 拡張、canary 配信。

---

## 6. 移動手段 ＝ 区間（anchor の属性にしない）

- CEO/GPT の「移動は予定ではなく予定間の属性」は**既存 `MovementSegment` で設計済**。anchor カードに移動手段欄を**必須化しない**（任意の区間例外指定は Phase C）。
- 「使える移動手段（日次）」は anchor でも区間でもなく**日レベル条件**。データの居場所が無いため Phase C。それまでは Alter 既定ヒューリスティック（公共交通に限定しない）でフォールバック。

---

## 7. 写真取り込み（`feat/plan-pdf-image-import`）との衝突回避

並行ブランチはシフト表 VLM 抽出（`lib/plan/shift/*`・`ShiftImportModal`・`plan_day_indicators`・dormant `/plan/dev-shift-draft`）。**核は完全分離**。共有ファイルは加算的：

| ファイル | 写真側 | 本件 | 回避策 |
|---|---|---|---|
| `PlanClient.tsx` | `FetchState` に dayIndicators 追加・tab へ prop | `openAdd` がどのシートを開くか分岐 | **最小差分**：`openAdd` に flag 分岐を足すだけ。`FetchState`／`load()`／tab prop は触らない |
| `lib/plan/featureFlags.ts` | shift 系フラグ | `composeTimelineEnabled`（新）追加 | 別キー加算 |
| `external-anchor-input.ts` / `anchor-fetch.ts` / `api/plan/anchors/route.ts` | shift_image source・dayIndicators | **再利用のみ・無改修** | 触らない＝衝突ゼロ |

- 結論：**実質衝突なし**。先に main へ入った方を後発が rebase 取り込み。本件は新規 `components/compose/*` と新 flag が主で、`PlanClient` は数行。
- `AddAnchorModal` / `AnchorFormFields` / `DayGraphTimeline` / anchor 型 / repository は写真側が**未接触** → 安全。

---

## 8. 不変条件（壊さないもの・絶対）

- 既存 `AddAnchorModal` パスは**残す**（flag OFF で従来どおり）。新体験が安定するまで削除しない。
- anchor スキーマ（`external_anchors`）・`createAnchorBundle` API 契約・`CreateExternalAnchorInput` 型を**変更しない**（Phase A は完全再利用）。
- downstream（DayGraph / transport / baseline / list・calendar・map / P2 LLM note）への入力契約を変えない。
- `confirmed_at NOT NULL` 不変：draft は完了まで未保存。
- 既存テスト（anchor input / 各 render contract）を壊さない。新規は新規テストで担保。
- 文言・data-testid：既存を変更しない。新規 UI は新規 testid。

---

## 9. フラグ & ロールアウト

- 新 flag：`PLAN_FLAGS.composeTimelineEnabled`（env `PLAN_COMPOSE_TIMELINE_ENABLED`、既定 **false**）。`lib/plan/featureFlags.ts` に加算。
- canary：既存 `canaryUserIds` を流用可。
- `openAdd`（`PlanClient`）：flag ON かつ対象ユーザ → `AddAnchorComposeSheet`、それ以外 → 既存 `AddAnchorModal`。
- 段階：内部 dogfood → canary → 既定 ON → legacy 撤去判断（別 stop）。

---

## 10. テスト方針

- `lib/plan/timeline-geometry.ts`：pure unit（minutesToY/yToMinutes/snap、4ケース吸着の境界）。
- ドロップ→startTime 確定：reducer 単体（DOM 非依存に切り出す）。
- 完了→`createAnchorBundle` 入力：placed[] → `CreateOneOffAnchorInput[]` 変換の契約テスト（既存 builder 再利用なので主に map 部分）。
- render contract：`AddAnchorComposeSheet` の testid 骨格（既存 modal の contract と独立）。
- 既存 anchor input／legacy modal テストは**不変**で全 PASS を確認。
- self Playwright smoke（CEO 判断）：作成→ドラッグ配置→吸着→完了→/plan 反映。

---

## 11. CEO 判断を仰ぐ点（残論点）

1. **新シートの広さ**：`GlassModal size="lg"` 想定（左タイムラインを収めるため）。スマホ縦で2カラムが窮屈なら「右作成→確定で左へアニメ遷移（同一面で左右トグル）」案もあり得る。lg 2カラムで進めてよいか。
2. **未配置 draft の完了時挙動**（Phase A）：作ったが置いていない draft が残ったまま「完了」した場合 — (a) 完了をブロックし配置を促す（推奨・Alter 自動配置が無い Phase A では安全）／(b) 既定時刻で仮置き保存。どちらにするか。
3. **既定ブロック長**（未定・開始のみ・終了のみの可視化長）：60分を既定とするか。
4. **「誰と？」欄の v1 表示**：据え置き決定下で、欄を (a) 非表示／(b) 表示するが非保存（将来の地ならし）。どちらにするか。
5. **Phase A の「Alter の解釈」**：完全非表示／honest プレースホルダ、どちらにするか。

---

## 12. 今回の stop

- 本書 = **方針案のみ**。実装は CEO 承認後。
- branch `claude/nifty-turing-128e67` に本 doc を commit して停止。
- **GO の場合**：Phase A を「§4.1 の pure 層（timeline-geometry）→ Canvas → ComposeCard/Panel → Sheet 統合 → `openAdd` flag 分岐」の順で、各段 tsc/test 検証しながら additive に実装。各 PR 末で stop。
- Phase B / C・migration・staging・merge・remote・本番有効化は引き続き **CEO gate**。
