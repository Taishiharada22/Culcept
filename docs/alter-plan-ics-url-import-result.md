# ICS URL Import (Track A) Result — universal multi-provider 実機 pass

起草日: 2026-05-29
親: マルチ provider カレンダー取り込み → Track A (= universal ICS URL)
CEO 確定: 2026-05-29 (= URL 取り込み + JST 表示 実機 pass、 local main merge GO。 push/PR/remote は別承認)

---

## §1. 完了宣言

**Track A (= ICS 購読 URL からの取り込み) は実機 pass で完了**。

- Google ICS URL (= 秘密 iCal アドレス) を URL 副導線から取り込み → preview → save → Plan UI 反映 まで通し動作 (= CEO 実機確認)
- 取り込み時刻が **JST で正しく表示** されることを確認 (= TZ バグ修正後)
- production には一切書き込みなし

---

## §2. 配信内容 (= 新規 3 点 + TZ 修正)

| 段 | commit | 内容 |
|----|--------|------|
| A-1 | `6944bbaf` | `lib/plan/ics/icsUrlFetch.ts` — SSRF-guarded fetch (normalizeIcsUrl / isBlockedIp / fetchIcsText、 DI、 fail-closed) |
| A-2 | `7a3cfb18` | `fetchIcsFromUrl` action — auth gate + importIcsFromUrl → drafts、 save は既存委譲 |
| A-3 | `95f50b88` | IcsImportModal に URL 副導線 (= file 主 / URL 副) |
| TZ v1 | `49b39cba` | (不十分) 書かれた値保持 — Google の Z(UTC) 出力で空振り |
| TZ v2 | `1591d04d` | (実機 pass) zoned を `APP_TIMEZONE=Asia/Tokyo` の wall-clock へ変換 |

- 既存 ICS pipeline (parser/mapper/preview/dedup/save) を最大再利用。 新規は「server fetch」 + UI 副導線のみ。
- Outlook 公開 / Apple iCloud webcal / Google 秘密 iCal / Yahoo を **1 機能で横断** (= RFC 5545 provider 非依存)。

---

## §3. SSRF (= readiness §3、 fail-closed)

https 限定 / webcal→https / userinfo 除去 / private・loopback・**link-local(metadata 169.254.169.254)**・CGNAT・multicast 遮断 / redirect 各 hop 再検証 / timeout 10s / size 5MB / body 妥当性 / 非標準ポート拒否 / 認証付き取得禁止 (credentials omit)。 古典 bypass (10/16/8 進 IP・IPv4-mapped IPv6) も潰し込み。 36 単体 test で網羅。

---

## §4. TZ バグの解析 (= 解決済、 教訓)

- **症状**: Google ICS の 21:00(JST) が 12:00 表示 (= UTC)。
- **真因**: `icsParser` が時刻を UTC 化していた。 app は timezone-naive (= ISO の HH:MM を wall-clock として slice)。 Google ICS は時刻を **Z(UTC) 出力**するため、 12:00 がそのまま表示。
- **修正 (v2)**: zoned (UTC / 解決済 TZID) は絶対時刻を Asia/Tokyo の wall-clock へ変換 / floating・未解決は書かれた値保持 (server TZ 非依存) / 終日は日付。 → Z / TZID / floating すべて JST に揃う (実測確定)。
- **教訓**: v1 は実フィード形式 (Z vs TZID) を確認せず TZID 前提で直して空振り。 **① 前提 (= 実入力形式) を実測で確定してから直す**。

---

## §5. 検証

- icsUrlFetch 36 / plan/ics 95 (Z→JST 変換ガード + floating-preserve ガード含む) / full suite 15546 pass (唯一の失敗は既知 flake #207、 単独 36/36 green) / source tsc 1114 不変。
- production 書き込み 0。

---

## §6. 残課題 (= Track A 後)

1. **main の ICS file import の TZ ズレ** → 本 merge で `icsParser` 修正が main に届き解消。
2. **Track B (= provider native)**: Outlook = Microsoft Graph OAuth / Apple = CalDAV。 非公開カレンダー / 常時同期。 → 次フェーズ (§7)。
3. **多 TZ (= viewer 別 TZ)**: app に TZ 概念導入後。 現状 JST 製品前提で `APP_TIMEZONE` 固定。
4. **dedup-delete 注意**: 既に誤時刻で取り込んだ anchor は UID dedup で再取り込みが skip される。 修正反映後の更新は削除→再取り込み。
5. **URL 永続化 + 定期 sync**: v1 は手動取り込みのみ (= readiness §7)。

---

## §7. 次 (= Track B、 CEO 指示)

- main merge 完了後、 **Track B (provider native) へ移行** (= CEO 指示 2026-05-29)。
- Track B は外部連携 + API キー発行を伴うため、 readiness 起草 → CEO 承認 → 実装 の順 (= 着手前停止)。

---

## §8. 関連 doc

- `docs/alter-plan-ics-url-import-readiness.md` (= Track A 設計、 §3 SSRF)
- `docs/decision-log.md` (= 2026-05-29 Track A 実装 + TZ 修正 + 実機 pass 記録)
