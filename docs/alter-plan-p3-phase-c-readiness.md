# P3 Phase C Readiness — ICS + Google 共存確認 → P3 完成判定 (= 短く 1 枚)

起草日: 2026-05-29
親 phase: P3 Completion → Phase C (= end-to-end smoke + 完成判定)
CEO 確定: 2026-05-29 (= CEO + GPT 合議: **Phase C GO / 共存 smoke は強い版 / main merge は Phase C pass 後**。 補正 = 既存 ICS fixture は書き換えず Phase C 用の別 fixture を新規作成)

---

## §0. Scope (= Phase C は薄い)

**Phase C = P3 の最終確認 + 正式判定。 新規実装は原則なし。**

Phase A (ICS) と Phase B (Google) は**独立に** end-to-end pass 済。 Phase C で残るのは
**両系統が同一 user・同一 Plan UI で共存する**ことの確認と、 **P3 完成の正式判定**のみ。

含む:
1. 同一 user が ICS source と Google source を**同時に持つ**状態の確認
2. 両 source の anchor が同じ Plan UI に共存表示 + source 区別が正しい
3. source またぎで衝突しない (= 別 source_type / 別 source row / dedup は source 内)
4. **P3 完成判定** → closeout + main merge 判断

含まない (= 後段、 §6):
- Outlook / 他 provider
- background sync 高度化
- 多カレンダー運用の磨き込み
- partial-connect の UI feedback (= Phase B §5-a)

---

## §1. 前提 (= Phase B closeout 後の固定状態)

| 項目 | 値 |
|------|------|
| branch | `feat/p3-completion` (= Phase B 着地済、 同 branch 継続) |
| 直近 HEAD | `a683e4fb` (= decrypt fix) + Phase B result/Phase C readiness commit |
| linked ref (CLI) | `hjcrvndumgiovyfdacwc` (staging) |
| `.env.local` URL | smoke 前に **staging 必須** (= completion-readiness §4-X 厳守) |
| ICS 動作確認済 | Phase A result §2.1 (= preview→save→UI→recurring→all-day 全 pass) |
| Google 動作確認済 | Phase B result §2.1 (= connect→fetch→save→UI 反映、 imported:3) |
| full suite | 661 files / 15509 pass (= 2026-05-29 時点 green) |

---

## §2. 確認内容 (= 唯一の新規検証 = 共存)

Phase A / B では各系統を**単独**で smoke した。 Phase C は**両系統が同居**する状態を確認する。

### §2.1 共存 smoke (= CEO-driven、 staging)

| # | 確認項目 | 期待 | 根拠取得元 |
|---|---------|------|-----------|
| 1 | 同一 user に Google import (= B-4 済) + ICS import (= 追加 upload) | 両 source row が `external_anchor_sources` に並存 | RPC payload log の source_type (`google_calendar` / `ics`) |
| 2 | 両 source の anchor が同じ Plan UI に表示 | FlowTab / Calendar に ICS event と Google event が両方出る | CEO 視覚確認 |
| 3 | source 区別が正しい | SourceIndicator が各 anchor の出所を正しく表示 | CEO 視覚確認 |
| 4 | source 衝突なし | 一方の import が他方の anchor を消さない / 重複させない | import 前後で両 source の件数不変 |

**版 = 強い版で確定 (= CEO + GPT)**: ICS event を Google import と**同じ日付帯 (= 5/29〜5/30)** に置き、 同一日に ICS event と Google event が並ぶことを確認する。

**CEO 補正 (= 2026-05-29)**: 既存 Phase A fixture (`/tmp/p3-smoke.ics`、 6/1〜6/3) は**書き換えず**、 Phase C 用の一時 fixture を**別途新規作成**する (= Phase A 再現資産を汚さない)。

- 新規 fixture: **`/tmp/p3-phase-c-smoke.ics`** (= 作成済、 §9 参照)。 3 OneOff timed event: 5/29 13:00 / 5/29 16:00 / 5/30 11:00。
- **実 parser + mapper で検証済** (= 一時 test で parseIcsString → mapIcsEventsToDrafts を通し、 date/startTime/uid が期待通りを確認 → temp test 削除)。 → CEO smoke が fixture バグで空振りしないことを担保。
- UID は `p3c-ics-000N@aneurasync.smoke` で既存 anchor と衝突しない (= 誤 dedup / 破壊なし)。

### §2.2 再確認不要 (= Phase A / B で担保済、 重複 smoke しない)

- re-import 冪等 (UID dedup): Phase A §6.1 (ICS skip 確認) + B-4 (`skipped: 0`→再 import で skip) で担保済。
- recurring / all-day 展開: Phase A §2.1 で担保済。
- OAuth connect / disconnect: Phase B §2.1 で担保済。

---

## §3. 手順 (= CEO-driven smoke、 Claude は smoke 自体を実行しない)

1. **smoke 前必須**: `.env.local` が staging を指すこと + dev server が staging runtime で起動していることを確認 (= completion-readiness §4-X 3 点確認)
2. B-4 で Google import 済の user のまま、 **`/tmp/p3-phase-c-smoke.ics`** を upload (= IcsImportModal、 §9 fixture)
3. preview → save → Plan UI で **5/29・5/30 に ICS event と Google event が共存表示**されることを視覚確認 (= §5 の 5 条件)
4. RPC payload log で両 source_type を確認 (= `google_calendar` / `ics`)
5. **P3 完成判定** (= §5 基準で CEO 判断)。 fail したら即 stop (= CEO 指示)

---

## §4. 環境方針 (= completion-readiness §4-X 継承)

| Phase | linked ref (CLI) | runtime SUPABASE_URL | 用途 |
|-------|------------------|----------------------|------|
| Phase C smoke | `staging` | **`staging` 必須** | ICS + Google 共存確認 |
| production | **触らない** | **touch しない** | Phase C 内では一切手を出さない |

- **production runtime smoke 禁止** (= 恒久ルール)。
- env 切替後は **dev server 再起動必須** (= Next.js は起動時のみ env load)。

---

### §5.1 Phase C pass 条件 (= CEO 確定 5 点、 2026-05-29)

1. staging で **Google import 済の状態を維持**
2. **Phase C 用 ICS fixture を追加 import** (= `/tmp/p3-phase-c-smoke.ics`)
3. 同一 UI 上で **Google 由来予定と ICS 由来予定が共存表示**される (= 5/29・5/30)
4. **既存予定を壊さない** (= Google 由来 anchor が消えない / 変質しない)
5. **意図しない重複や消失がない** (= ICS import 前後で Google anchor 件数不変、 ICS 3 件が重複なく追加)

補足 (= CEO 指示):
- SourceListModal や細かい周辺確認は **任意**
- Phase C は**薄く保つ**。 新機能追加はしない
- **fail したら即 stop**

### §5.2 P3 完成判定

以下が全て満たされたら **P3 完成**:

1. ICS import end-to-end pass (= Phase A、 済)
2. Google import end-to-end pass (= Phase B、 済)
3. 共存 5 条件 pass (= §5.1)
4. production への副作用 0 (= 全 smoke staging runtime)

→ 4 点満たし = CEO が「P3 完成」 を宣言 → P3 closeout doc 固定 + `feat/p3-completion` の **main merge (= Phase C pass 後、 中間 merge しない)**。

---

## §6. P3 完成後の残課題 / 別トラック

### §6.1 P3 と同じ source 層の後段 (= 機能拡張)
1. **Outlook / 他 provider** (= ICS / Google と同 source 層流用、 event signature の provider 差のみ)
2. **background sync 高度化** (= 現状は手動 import trigger → cron / webhook)
3. **多カレンダー運用** (= per-calendar toggle の enabled 反映、 Phase B §5-b)
4. **partial-connect UI feedback** (= Phase B §5-a)
5. token refresh 失敗時 retry 高度化

### §6.2 横断的 debt (= 別 phase)
- 1114 件 tsc error 整理 (= 既存 main の type debt、 deferred)
- dev console.log / unused code / legacy path 整理
- カレンダータブ再設計 (= UI 全体改修)

### §6.3 戦略トラック (= P3 完成とは独立、 CEO 別途指示)
- **「集めた情報を会社経営・アイデアに転用するフロー」** (= Growth / Venture / Management / RFL / Orchestrator / Feedback Loop)。 P3 で確立した観測データ基盤の活用先。 別 readiness で起草。

---

## §7. CEO 確認 stop point (= 解決済、 2026-05-29)

| 論点 | CEO + GPT 判断 |
|------|---------------|
| Phase C 着手 | **GO** |
| 共存 smoke の版 | **強い版** (= 同日に ICS + Google) |
| fixture | **別途新規** (= Phase A fixture は書き換えず `/tmp/p3-phase-c-smoke.ics`) |
| main merge | **Phase C pass 後** (= 中間 merge しない) |

→ 全論点 確定。 **Claude 側準備完了** (= fixture 作成 + parser/mapper 検証済)。 次は **CEO-driven 共存 smoke** (= Claude は smoke 自体を実行しない)。

---

## §8. 関連 doc

- `docs/alter-plan-p3-completion-readiness.md` (= 親 readiness、 §0 完成条件 / §4-X 環境)
- `docs/alter-plan-p3-phase-b-result.md` (= Google 側 result、 §6 で Phase C 残を記述)
- `docs/alter-plan-p3-phase-a-result.md` (= ICS 側 result)

---

## §9. Phase C fixture (= `/tmp/p3-phase-c-smoke.ics`、 一時)

CEO 補正に従い既存 fixture を汚さず新規作成。 **`/tmp` 一時ファイル** (= repo の committed fixture にしない)。 /tmp clear 後は本節から再生成可能。

### §9.1 内容 (= 3 OneOff timed event)

| UID | 日付 | 時刻 (= 表示) | SUMMARY | LOCATION |
|-----|------|--------------|---------|----------|
| `p3c-ics-0001@aneurasync.smoke` | 5/29 | 13:00–14:00 | P3C ICS — デザインレビュー | Studio Shibuya |
| `p3c-ics-0002@aneurasync.smoke` | 5/29 | 16:00–16:30 | P3C ICS — 1on1 | Online |
| `p3c-ics-0003@aneurasync.smoke` | 5/30 | 11:00–11:30 | P3C ICS — コーヒーチャット | Cafe Nakameguro |

### §9.2 設計根拠 (= TZ 意味論)

- ICS / Google 両 mapper は ISO 文字列の **UTC components を literal に** date/time へ抽出する (= TZ 変換なし、 timezone-naive)。
- Google は API の `+09:00` 文字列から HH:MM を literal 取得 → **JST wall-clock** をそのまま表示。
- ICS parser は `toJSDate().toISOString()` (= UTC `Z`) を返す → fixture を **`...T130000Z` で書けば "13:00" 表示**となり Google と表示が揃う。
- → fixture は `DTSTART:20260529T130000Z` 等の `Z` 付き UTC で「表示したい wall-clock そのもの」を記述。

### §9.3 検証 (= 実 parser + mapper、 一時 test で確認後削除)

- `parseIcsString` → 3 event、 `startDateIso` = `2026-05-29T13:00:00.000Z` / `...T16:00...` / `2026-05-30T11:00...`、 `isAllDay=false`。
- `mapIcsEventsToDrafts` → 3 OneOff draft、 `date` = 5/29 / 5/29 / 5/30、 `startTime` = 13:00 / 16:00 / 11:00、 `endTime` / `locationText` / `sourceUid` 期待通り、 `skipped=0`。
- → fixture バグで CEO smoke が空振りしないことを担保。

### §9.4 再生成コマンド (= /tmp clear 時)

本 doc の §9.1 内容を `/tmp/p3-phase-c-smoke.ics` に再作成 (= VCALENDAR ラップ + 上記 3 VEVENT、 各 `DTSTART/DTEND` は `Z` 付き UTC、 `DTSTAMP:20260529T000000Z`)。
