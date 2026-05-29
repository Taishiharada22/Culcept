# P3 Phase B Result — Google Calendar end-to-end pass

起草日: 2026-05-29
親 phase: P3 Completion → Phase B (= Google Calendar 本流完成)
CEO 確定: 2026-05-29 (B-4 end-to-end smoke pass、 Phase B closeout + Phase C 着手判断へ)

---

## §1. 完了宣言

**Phase B (= Google Calendar import の end-to-end 通し) は主要経路 pass で完了**。

- connect → events fetch → mapping → save → UI 反映 まで通し動作確認
- staging (= `hjcrvndumgiovyfdacwc`) に対して smoke 実施
- production には一切書き込みなし
- B-4 smoke で 2 件の実データ限定バグを発見 → 即修正 → 再 smoke で pass (= §3)

---

## §2. 検証結果

### §2.1 Phase B scope 6 条件の達成 (= readiness §0)

| # | 条件 | 結果 | 根拠 |
|---|------|------|------|
| 1 | **connect** (= OAuth flow) | ✅ | `[calendar/google/callback] success { subsCount: 2, scopesCount: 2 }`、 両 scope (calendarlist + events) 許可、 redirect `/plan?calendar_connected=1` |
| 2 | **events fetch** (= Calendar API) | ✅ | import 実行で 3 event 取得 (= `imported: 3`) |
| 3 | **mapping** (= googleEventsToAnchorMapper) | ✅ | `ExternalAnchorInput[]` 変換 → anchor 生成成功 |
| 4 | **save** (= createSourceWithAnchors atomic) | ✅ | `import_success / imported: 3 / skipped: 0` |
| 5 | **UI 反映** (= Plan UI 表示) | ✅ | 取り込んだ予定が 5/29・5/30 の Plan UI に実表示 (= CEO 視覚確認) |
| 6 | **disconnect** | ✅ | debug cycle 中に disconnect 動作確認 (= decrypt 失敗時も `proceeding to delete` で connection 削除成功 = fail-safe 動作) |

→ **核心経路 connect → fetch → save → UI 反映 が全 pass** (= CEO 確定根拠)。 disconnect も fail-safe 込みで動作確認済。

### §2.2 検証環境

| 項目 | 値 |
|------|------|
| dev server | localhost:3000 (= CEO 起動 → smoke → 確認) |
| linked ref (CLI) | `hjcrvndumgiovyfdacwc` (staging) |
| `.env.local` SUPABASE_URL | staging (= readiness §4-X 厳守) |
| Google OAuth smoke account | `th200122aish@icloud.com` (= 連携 Google account、 Console Test users 登録済) |
| import 取得時間窓 | 過去 30 日 〜 未来 90 日 (= `IMPORT_WINDOW_PAST_DAYS=30` / `IMPORT_WINDOW_FUTURE_DAYS=90`) |
| production への書き込み | **0** |

---

## §3. 解析した重大問題 (= B-4 smoke で発見、 解決済)

B-4 の実データ smoke で **2 件の実世界限定バグ**が露出。 いずれも mock ベース unit test を pass していた (= 実 Supabase / 実 OAuth でしか踏まない経路)。 **実データ smoke の価値が証明された**。

### §3.1 problem 1: 部分接続で subscriptions 0 件 → import 空振り (= Path B)

#### 観察
初回 connect で events.readonly のみ許可 (calendarlist.readonly 未許可) → `fetchCalendarList` 403 → subscriptions 0 件 → import が対象カレンダー無しで空振り。

#### 原因
`runGoogleAnchorImport` の step 4 が「subscriptions が空 = 取り込み対象なし」として終了。 ユーザーが calendarlist scope を許可しなくても primary calendar だけは取り込めるべき。

#### 解決 (= commit `703dc89b`)
step 4 に **primary fallback**: subscriptions が空なら `['primary']` で fetch 続行。 `db_error` (= 取得失敗) の場合は fallback せず error 返却 (= 障害隠蔽の防止)。 33 test pass。

### §3.2 problem 2: bytea へ生 Buffer 直渡しで decrypt_failed (= 本 phase 最重要)

#### 観察
接続成功 (`subsCount: 2`) 後、 「取り込む」 button が**毎回**「再接続が必要」 を返す。 再接続しても同じ。 dev log = `[plan/google] { kind: 'decrypt_failed', reason: 'authentication' }`。

#### 原因
`upsertConnection` が暗号化済み **生 Buffer** を supabase-js の upsert payload へ直接渡していた。 supabase-js は payload を JSON 直列化して PostgREST へ送るため、 `Buffer.toJSON()` (= `{"type":"Buffer","data":[...]}`) に化け、 元の暗号バイト列ではなく**別バイト列**が bytea カラムに保存される (= upsert 自体は成功)。 読み戻し後の復号で AES-256-GCM auth-tag 検証が必ず失敗 → `reason: 'authentication'`。 鍵ミスマッチでも Path B でもない。

#### 解決 (= commit `a683e4fb`)
書き込み時に `\x${buf.toString("hex")}` (= PostgreSQL bytea hex 入力形式) へ変換。 読み戻し側 (`findConnection`) は既に `\x`-hex を decode 済みのため、 書き⇄読みが対称になる。 schema / migration / 鍵 変更なし。 書き込み箇所は callback の 1 箇所のみ。

#### test 補強
- 既存 upsert test: payload が**生 Buffer でなく `\x...` 文字列**であることを固定
- 新規 write⇄read round-trip ガード: upsert 出力 `\x` hex を `findConnection` が同一 Buffer に復元することを固定 (= このバグ class を恒久封じ)
- oauth 該当 44/44 pass、 source tsc 1114 不変 (新規 error 0)

### §3.3 methodology 教訓 (= 恒久メモ)

- **mock ベース unit test は「実 wire の直列化」 を踏まない**。 #3.1 #3.2 とも mock repo / in-memory client では Buffer が Buffer のまま残り pass していた。 bytea / OAuth scope 等の**実インフラ依存経路は staging smoke が唯一の検出手段**。
- → 外部連携 (DB serialization / OAuth scope / network) を持つ機能は、 unit green を「実装完了」 とせず staging smoke gate まで通して初めて closeout する。

---

## §4. Phase B 着地 commit chain

| # | commit | 内容 |
|---|--------|------|
| 1 | `8da59a76` | B-1 — Google Calendar cherry-pick + source_type β恒久化 |
| 2 | `480cb915` | B-2 — importGoogleAnchors action 本実装 (= 本流 save) |
| 3 | `f39654e8` | B-2 時間窓確定 + B-3 readiness 詳細化 (docs) |
| 4 | `202b9429` | B-3 — Google import trigger 結線 (= connect→import→reflect) |
| 5 | `80cb7773` | B-4 smoke account typo 修正 + OAuth env チェックリスト (docs) |
| 6 | `ae15c996` | B-4 smoke account 確定 + testing-mode test-user 教訓 (docs) |
| 7 | `703dc89b` | B-4 fix — Google import primary fallback (= Path B、 §3.1) |
| 8 | `a683e4fb` | B-4 fix — refresh_token bytea `\x` hex 書込 (= decrypt_failed 解消、 §3.2) |
| 9 | (本 commit) | Phase B result 固定 + Phase C readiness 起草 |

### §4.1 production への影響

| 項目 | 影響 |
|------|------|
| schema 変更 | 0 |
| schema_migrations | 0 |
| user data (production) | 0 |
| API request (production runtime) | **0** (= smoke は staging runtime のみ、 §4-X 厳守) |

---

## §5. 残課題 (= Phase B scope 外 / 別 phase)

### §5-a. partial-connect の UX (= 軽微、 後段)
- calendarlist scope 未許可でも primary fallback で取り込める (= §3.1 で機能担保)。 ただし「一部のカレンダーのみ取り込まれた」 旨の UI feedback は未実装 (= 現状は imported/skipped 件数のみ)。
- 対応: 後段 UI 改修。

### §5-b. 多カレンダー運用の磨き込み (= 後段)
- per-calendar toggle は shell のみ (= G-α)。 enabled calendar の選択反映は後段。

### §5-c. 後段 phase 候補
1. **Phase C**: ICS + Google を同一 Plan UI で共存確認 → **P3 完成判定** (= 次フェーズ readiness、 §7)
2. **Outlook / 他 provider** (= ICS / Google と同 source 層流用)
3. **background sync 高度化** (= cron / webhook、 現状は手動 import trigger)
4. token refresh 失敗時の retry 高度化
5. 1114 件の tsc error 整理 (= 既存 main の type debt、 deferred)
6. カレンダータブ再設計 (= UI 全体改修)

---

## §6. P3 完成への残り (= completion-readiness §0 照合)

| P3 完成条件 | 状態 |
|------------|------|
| ICS import end-to-end | ✅ Phase A pass (= `alter-plan-p3-phase-a-result.md`) |
| Google import end-to-end | ✅ Phase B pass (= 本 doc) |
| 両系統が同一 UI で共存 + P3 完成判定 | ⬜ Phase C (= 次フェーズ) |

→ 両系統が**独立に** end-to-end pass。 残るは**共存確認 + 正式な P3 完成判定**のみ (= Phase C は薄い)。

---

## §7. CEO 判断仰ぐ (= Phase B closeout 後)

1. **Phase B 完了固定** OK か (= 本 result doc commit)
2. **Phase C 着手** GO か (= readiness `alter-plan-p3-phase-c-readiness.md` 確認 → 共存 smoke → P3 完成判定)
3. **`feat/p3-completion` の main merge タイミング** (= P3 完成判定後か、 Phase C 前に中間 merge するか)

---

## §8. 関連 doc

- `docs/alter-plan-p3-completion-readiness.md` (= 親 readiness、 §0 完成条件)
- `docs/alter-plan-p3-phase-b-readiness.md` (= Phase B 設計、 6 条件 SoT)
- `docs/alter-plan-p3-phase-a-result.md` (= ICS 側 result、 本 doc の型)
- `docs/alter-plan-p3-phase-c-readiness.md` (= 本 commit で同時起草、 次フェーズ)
