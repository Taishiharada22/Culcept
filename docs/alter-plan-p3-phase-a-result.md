# P3 Phase A Result — ICS end-to-end 主要経路 pass

起草日: 2026-05-28
親 phase: P3 Completion → Phase A (= ICS 本流復帰)
CEO 確定: 2026-05-28 (Phase A 主要経路 pass、 Phase B 着手判断へ)

---

## §1. 完了宣言

**Phase A (= ICS file import の end-to-end 通し) は主要経路 pass で完了**。

- ICS file 読み込み → preview → save → DB 反映 → UI 表示 → Recurring 展開 まで通し動作確認
- staging (= `hjcrvndumgiovyfdacwc`) に対して smoke 実施
- production には一切書き込みなし

---

## §2. 検証結果

### §2.1 通し動作確認 (= staging smoke、 CEO 視覚確認)

| 項目 | 結果 | 根拠 |
|------|------|------|
| `.ics` file 読み込み | ✅ | preview に 3 event 表示 |
| `icsParser` 動作 | ✅ | OneOff / Recurring / AllDay 識別 |
| preview UI | ✅ | IcsImportModal 表示 + check / 注意 |
| save (= bundle RPC) | ✅ | DB 書き込み成功 (= UI に anchor 反映) |
| 6/1 (月) OneOff: `P3 Smoke - Team Meeting` | ✅ | 09:00-10:00 @ Office Tokyo |
| 6/1 (月) Recurring: `P3 Smoke - Daily Standup` | ✅ | 10:00-10:15 @ Online |
| 6/2 (火) Recurring: `P3 Smoke - Daily Standup` 展開 | ✅ | 09:30-09:45 表示 |
| 6/3 (水) AllDay: `P3 Smoke - Public Holiday` | ✅ | 6/3 へ日付移動 → all-day event 表示確認 (= CEO 視覚確認済、 2026-05-29 補正) |
| Source 一覧 (= SourceListModal) | ❓ | 導線不明、 後回し可 (= CEO 確認) |

→ **核心経路** (= preview → save → DB → UI 反映 → 展開 → all-day 表示) は全 pass。 残るは SourceListModal 導線のみ (= 後段)

### §2.2 検証環境

| 項目 | 値 |
|------|------|
| dev server | localhost:3000 (= 起動済 → 確認後 kill) |
| linked ref (CLI) | `hjcrvndumgiovyfdacwc` (staging) |
| `.env.local` SUPABASE_URL | `hjcrvndumgiovyfdacwc.supabase.co` (= staging、 CEO α 切替済) |
| smoke fixture | `/tmp/p3-smoke.ics` (= 3 VEVENT) |
| production への書き込み | **0** |

---

## §3. 解析した重大問題 (= 解決済)

### §3.1 problem 1: `supabase link` と dev server runtime env の乖離

#### 観察

CHECK violation error が出続けたが、 staging の CHECK は `'ics'` を含む。 矛盾。

#### 原因

`supabase link` は CLI 向きのみ、 dev server は `.env.local` の `SUPABASE_URL` を使う。 link を staging に切替えていても、 `.env.local` が production のままなら dev server は production に request を送る。

#### 解決

CEO が α 採用で `.env.local` を staging credentials に切替 → dev server 再起動 → smoke 成功。

#### 恒久対策

`docs/alter-plan-p3-completion-readiness.md` §4-X / §4-Y に記録:
- 「`supabase link` と dev server runtime env は別物」 明記
- smoke 前の必須 3 点確認 (= CLI link / runtime URL / 両者一致)
- production runtime smoke 禁止 (= 恒久ルール)
- env 切替後 dev server 再起動必須

---

## §4. Phase A 着地 commit chain

| # | commit | 内容 |
|---|--------|------|
| 1 | `dc79ee02` | P3 completion readiness 起草 |
| 2 | `bd30e174` | Phase A cherry-pick — ICS scope 19 files |
| 3 | `5c50efef` | Phase A Step 5-7 — PlanClient 手動移植 + D1/D2 取り込み |
| 4 | `d395eb37` | payload log + readiness §4 緊急補正 (= production runtime smoke 事故防止) |
| 5 | `6e718a4e` | RPC payload 詳細 log 強化 (= source_type mismatch 解析用) |
| 6 | (本 commit) | Phase A result 固定 + Phase B readiness 起草 |

### §4.1 含まれる core 変更

- ICS scope 19 files (= cherry-pick from `feat/alter-plan-p3-a-1-google-readiness`)
- D1/D2 (= anchor-detail-format / SourceListModal) cherry-pick
- PlanClient.tsx ICS 部分手動移植 (= 7 edits、 Google 関連除外)
- migration `20260526100000_p3_ics_import.sql` staging apply
- payload log infrastructure (= 今後の debug 用に残す)
- readiness §4 (= 環境方針補正、 production runtime smoke 禁止)

### §4.2 production への影響

| 項目 | 影響 |
|------|------|
| schema 変更 | 0 |
| schema_migrations | 0 |
| user data | 0 |
| API request (read) | 数件発生 (= production runtime で動いていた間の read 系) |
| API request (write) | **0** (= CHECK violation で全 reject、 production には書き込みが届かなかった) |

---

## §5. 残課題 (= Phase A scope 外 / 別 phase)

### §5-a. 6/3 (水) AllDay event — 確認済 (= 2026-05-29 補正、 残課題ではない)

- 観察: 当初 6/3 への日付移動が進まず未確認と報告したが、 CEO 再確認で **6/3 へ移動 → all-day event 正常表示** を視覚確認済
- 結論: ICS import → DB 保存 → UI 反映 → all-day 表示 まで **全経路 pass**
- 日付移動 UI も正常動作 (= 当初の「不到達」 は一時的な操作問題)
- → 本項は **解消済**、 残課題から除外

### §5-b. SourceListModal 導線

- 観察: 「📋 教えた予定」 button から SourceListModal を開く想定だが、 CEO 確認時点で導線不明
- 原因仮説: 「+ 教える」 button 列にあるが、 表示位置 / 表示条件で見えにくい / Pane mode で表示されない 等
- 対応: UI 改修 (= 別 phase、 後回し可)

### §5-c. 後段 phase 候補

1. **Phase B**: Google Calendar end-to-end (= 本流復帰の続き)
2. SourceListModal 導線改善
3. 1114 件の tsc error 整理 (= 既存 main の type debt、 migration-debt closeout §5 同様の deferred)

---

## §6. Phase B (Google Calendar) 着手判断材料

### §6.1 Phase A で固まった土台

- `external_anchor_sources` / `external_anchors` table の staging 動作確認
- `create_external_anchor_bundle` RPC の動作確認 (= atomic insert)
- `external_uid` dedup の動作確認 (= 同 UID 再 import で skip)
- IcsImportModal の UI 動作確認

### §6.2 Phase B の scope

- Google Calendar OAuth (= connect / callback / status / disconnect)
- Google events fetch (= access token refresh / event list)
- `googleEventsToAnchorMapper` (= event → ExternalAnchorInput 変換)
- save action (= ICS と同じ `createSourceWithAnchors` 経路を流用)
- UI: CalendarConnectBanner + Google import trigger

### §6.3 Phase A 教訓を Phase B に持ち込む

1. **runtime env 確認**: `.env.local` の staging 切替を smoke 前に必須化
2. **payload log**: 既存の `[external-anchor-repo] RPC payload` log を Google import でも活用
3. **production runtime smoke 禁止** (= 恒久ルール、 readiness §4-X)

---

## §7. CEO 判断仰ぐ 3 点 (= Phase B 着手前)

1. **Phase A 完了固定** OK か (= 本 result doc commit)
2. **`.env.local` を production credentials に戻す** タイミング (= 通常運用復帰 / Phase B 着手まで staging 維持か)
3. **Phase B 着手** GO か (= readiness 起草 → CEO 確認 → 実装着手)

---

## §8. 関連 doc

- `docs/alter-plan-p3-completion-readiness.md` (= 親 readiness、 §4 補正済)
- `docs/alter-plan-p3-phase-b-readiness.md` (= 本 commit で同時起草、 Phase B 設計)
- `docs/alter-plan-p3-ics-import-readiness.md` (= 元 readiness、 main 既存)
- `docs/alter-plan-foundation-design.md` (= ExternalAnchor 設計、 §2 / §11 / §12)
