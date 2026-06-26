# production 解放 網羅監査（2026-06-26）— 全54項目を FIX / 明確 BLOCK に分類

> workflow wf_91e1def0-783(19 agent・patch+反証検証)。read-only 監査 + 安全 patch のみ。production 変更なし。
> 結論: 「全部 flag を立てれば最新が出る」は不成立。多くは migration/consent/課金/未実装 の明確理由で堰き止められている。

## 1. 今回 修正済み（安全・commit 7db57c034・default OFF）
候補レンズ overlay(①捲る/②なぜ/③比較表+地図)を本番点火可に。isCandidateLensUiEnabled の NODE_ENV!=='production' hard block を NEXT_PUBLIC_PLACE_CANDIDATE_LENS_UI=true との OR に。
- env 未設定＝現本番と同一 false(退化なし)。dev は従来 ON。test 20 passed(default-false + opt-in 点火)。
- 地図は browser key 未設定なら装飾タイルに fail-open＝課金は key 設定時のみ(CEO opt-in)。
- 点火方法: Production scope に NEXT_PUBLIC_PLACE_CANDIDATE_LENS_UI=true + redeploy。これで「予定追加後の候補が古い」が最新 overlay に。
- 注: 観測 write(preference 学習)/比較 reorder/explanation note は本番 hard block 維持(consent 前提・別 GO)。overlay 本体だけ解放。

## 2. 明確な堰き止め理由（CEO 承認でも今は繋がない＝壊れる/漏れる）
| 機能 | 明確な理由 | 解放の前提 |
|---|---|---|
| シフト取込が反映されない(数日のみ) | 取込入口は出るが save gate OFF + connection guard が production deny＝取り込んでも DB に書かれない。さらに 休み表示 reader は plan_day_indicators が無いと 42P01→[] graceful degrade。→ §3 で要 live 確認 | save を production 許可する code+flag+(必要なら)migration。別 GO |
| CoAlter タブの Plan Intelligence が mock | route が設計上 fixture 入力のみ(realSelf = null ハードコード・#9 swap 点未実装)。real 化は build 作業 | #9 の fetch 配線(getPersonalizationSnapshot)+ PLAN_COALTER_PERSONALIZATION_REAL_READ + 軸 snapshot の RLS/consent read。私が実装可(別 slice) |
| Reality write 群(PRM 学習/tendency feedback/review) | gate が flag+auth のみで consent gate も canary も無い。clean prod に table 実在ゆえ flag 点火＝全 user の判断傾向・深層観測派生データを同意なし永続化＝漏洩/規律違反 | 各 route に consent + production canary allowlist を配線(code)してから点火。CEO 承認 |
| Travel personalization 実読み | consent が ?consent=1(client query)だけの local gate＝実質 consent なしで本人の性格軸を読む | DB-backed consent(6b-2c)実装 + 軸 RLS 確認後に点火 |
| Place Details enrichment(写真/営業時間) | Google Places API 実課金 fetch | Maps key + 予算確認 + PLACE_DETAILS_ENRICH_PROD_ALLOWED=1(CEO 承認) |
| preference 観測 write / Post-Visit 答え合わせ | 行動データの write(localStorage でも consent 前提・dev-only 設計) | consent gate 配線後(別 GO) |

## 3. 最重要の live 確認（シフト/「数日のみ」の真因を確定）
監査エージェントは MEMORY の B-7(旧 legacy production の table 未適用)を引いたが、新 clean prod は staging migration から構築＝Plan table は存在する可能性が高い(実際 CEO は予定追加に成功＝external_anchors は実在)。よって「数日のみ」は (a) shift save が production で塞がれて書かれない か (b) plan_day_indicators 不在 のどちらか。read-only SQL で確定：
```sql
SELECT t AS table_name, (to_regclass('public.'||t) IS NOT NULL) AS exists_in_prod
FROM (VALUES ('external_anchors'),('external_anchor_sources'),
             ('plan_day_indicators'),('plan_seeds')) v(t)
ORDER BY t;
```
- 全 true → table はある→「数日のみ」は shift save 塞ぎが主因(save を別 GO で解放)。
- どれか false → その migration を staging→clean prod へ適用(CEO GO + owner)。

## 4. 「全部繋げてよいか」への答え
No(安全には不可)。§1 の候補レンズ overlay は安全に解放済(flag 点火だけ)。だが §2 は consent 未/課金/未実装/save 塞ぎ の明確理由があり flag を立てるだけでは壊れる・漏れる。各々 code 変更 or migration or 課金承認が前提。順序＝(A) §1 flag 点火 →(B) §3 live 確認で shift 真因確定 →(C) consent gate/#9 fetch を私が PR 実装 →(D) migration/課金は CEO GO。

## 5. 次に私が実装できる安全な PR（CEO 指示で着手）
1. CoAlter Plan Intelligence real 化(#9): route の realSelf=null を auth client + getPersonalizationSnapshot に配線(flag gate・staging 軸なし→demo fallback で退化なし)。
2. Reality write 群 + Travel personalization に consent gate を配線(点火しても consent 無しでは書かない)。
3. shift save の production 経路(connection guard を canary allowlist 方式に)— ただし migration 確認後。

---
本書: read-only 監査 + §1 の安全 patch のみ。env変更/redeploy/SQL/db push/consent未の点火/origin push 一切なし。
