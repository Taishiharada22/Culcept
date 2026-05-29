# P3 Phase C Readiness — ICS + Google 共存確認 → P3 完成判定 (= 短く 1 枚)

起草日: 2026-05-29
親 phase: P3 Completion → Phase C (= end-to-end smoke + 完成判定)
CEO 確定: (未) — Phase B closeout 後の起草、 CEO GO 待ち

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

- **強い版 (推奨)**: ICS fixture を Google import と**同じ日付帯**(= 5/29〜5/30 付近)に調整し、 同一日に ICS event と Google event が並ぶことを確認。
- **弱い版 (許容)**: 既存 fixture `/tmp/p3-smoke.ics` (= 6/1〜6/3) のまま。 日が違っても同一 Plan 内で両 source 共存が確認できれば可。

### §2.2 再確認不要 (= Phase A / B で担保済、 重複 smoke しない)

- re-import 冪等 (UID dedup): Phase A §6.1 (ICS skip 確認) + B-4 (`skipped: 0`→再 import で skip) で担保済。
- recurring / all-day 展開: Phase A §2.1 で担保済。
- OAuth connect / disconnect: Phase B §2.1 で担保済。

---

## §3. 手順 (= CEO-driven smoke、 Claude は smoke 自体を実行しない)

1. **smoke 前必須**: `.env.local` が staging を指すこと + dev server が staging runtime で起動していることを確認 (= completion-readiness §4-X 3 点確認)
2. B-4 で Google import 済の user のまま、 ICS file を upload (= IcsImportModal、 §2.1 強い版なら日付調整済 fixture)
3. preview → save → Plan UI で **ICS event と Google event が共存表示**されることを視覚確認 (= §2.1 の 4 項目)
4. RPC payload log で両 source_type を確認 (= `google_calendar` / `ics`)
5. **P3 完成判定** (= §5 基準で CEO 判断)

---

## §4. 環境方針 (= completion-readiness §4-X 継承)

| Phase | linked ref (CLI) | runtime SUPABASE_URL | 用途 |
|-------|------------------|----------------------|------|
| Phase C smoke | `staging` | **`staging` 必須** | ICS + Google 共存確認 |
| production | **触らない** | **touch しない** | Phase C 内では一切手を出さない |

- **production runtime smoke 禁止** (= 恒久ルール)。
- env 切替後は **dev server 再起動必須** (= Next.js は起動時のみ env load)。

---

## §5. P3 完成判定の基準 (= 何をもって「完成」とするか)

以下が全て満たされたら **P3 完成**:

1. ICS import end-to-end pass (= Phase A、 済)
2. Google import end-to-end pass (= Phase B、 済)
3. 両系統が同一 Plan UI で共存表示 + source 区別正しい (= Phase C §2.1)
4. production への副作用 0 (= 全 smoke staging runtime)

→ 4 点満たし = CEO が「P3 完成」 を宣言 → P3 closeout doc 固定 + `feat/p3-completion` の main merge 判断。

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

## §7. CEO 確認 stop point (= 着手前)

1. **Phase C 着手 GO** か (= 本 readiness 確定後、 共存 smoke 着手)
2. **共存 smoke の版**: §2.1 強い版 (= 日付調整 fixture) / 弱い版 (= 既存 fixture) どちらで進めるか
3. **main merge タイミング**: P3 完成判定後に merge か、 Phase C 前に中間 merge するか

→ 上記 CEO 確認後、 Phase C 共存 smoke 着手 (= CEO-driven)。
