# Life Ops — A-4-c19 Mainline Readiness / Integration Design（read-only audit・本線実装なし）

> 2026-06-11 / CEO・GPT GO。本書は **設計のみ**（PlanClient/R4/notification/production 不接触）。
> 成立済み: 候補生成〜compose〜Morning/Moment preview・action contract・4 action writer wiring（done=2 段階）・
> feedback read→cadence merge・staging operator E2E（c17b later / c18b done 共に PASS）・cleanup・full suite green。

---

## 1. 本線 surface audit（read-only・実態）

- `/plan` = `page.tsx`（`planRouteLive` flag + auth + anonymous gate）→ `PlanClient`（client root・**Calendar / Flow / Map の 3 tab**）。
  List tab は旧 unit（`LIST_NEW_TIMELINE_ENABLED` 別 flag・placeholder 保持）= 接続対象外。
- 提案表示の既存経路 = `proposalsByDate` chips（**localStorage 由来**・J-6e read-only display・accept/dismiss は local event）。
- **Morning Briefing 相当の本線 surface は存在しない**(MapTab が Alter Morning *API 資産*を流用しているのみ)。
- **Moment/R4 trigger の本線 surface も存在しない**（R4 は lib のみ・未配線）。
- ★preview compute の入力は **fixture のまま**（実データ源は gated feedbackCadence のみ・default OFF）。

### Surface 比較（最初の接続先）
| 案 | 内容 | 自然さ | 回帰面 | rail 幅 | 判定 |
|---|---|---|---|---|---|
| A | FlowTab 当日 section に挿入 | 高（今日文脈） | 中（既存 tab 改変） | 狭い | 次点 |
| B | CalendarTab 当日 cell に chip | 低 | 中 | 不可能（誤操作） | 不採用 |
| **C** | **PlanClient 上部の独立『生活まわり』card（tab 外・当日 Morning 代表のみ）** | 高 | **最小（既存 tab 不改変）** | 十分 | **推奨** |
| D | Moment trigger surface | —（本線に存在しない） | R4 と一体 | — | 持ち込まない |

採用方針=**C**: card 形は preview で実証済み・候補 0 なら card 自体不出現（静けさ維持）・既存 3 tab と localStorage proposals 経路に不干渉。

## 2. 本線へ持ち込む VM 範囲
**Morning 代表のみ**（headline + recommended tier highlights ≤3 + rail）。
- 3 案 summary は持ち込まない（Plan 本線の tier 概念と二重化・情報過多）。
- Moment は持ち込まない（通知性が強く R4 設計と一体・別 gate）。重複制御は本線では「card 1 つだけ」で自然成立。

## 3. action rail の範囲
第 1 段 = **後で / 不要 / 完了※（2 段階確認）の 3 つ**。
- ★**「採用」は本線 hold**: preview では fixtureNotice が「予定に入らない」誤解を防いでいたが、本線では「採用＝予定に入った」と誤解する。
  採用の本線意味（M1 記録のみ vs plan seed 化）は Plan 本線接続（cross-track gate）と一体で未決 → 意味確定後の別 slice。
- c15 contract（4 action・固定順）は**不変更**。surface 側 filter で 3 つを出す（contract と表示の分離）。

## 4. 本線文言（preview 限定文言の置換）
- 原則: 「本線には反映されません」は本線では嘘になる → **「予定には書き込みません」を軸**に置換。
- 案: ok=「記録しました（予定には入れていません。提案の調整にだけ使います）」／
  ok_done=「完了を記録しました。次の提案周期に反映されます（予定には書き込みません）」＋
  done 直後 1 行「完了を記録したので、この件の提案はしばらく控えます」（**cadence で候補が消える体感のケア**）。
- BANNED_WORDS（断定/督促/「予定に入れた」）は本線でも test 維持。

## 5. flag / gate 設計（本 slice で具体化済み・dormant）
- `PLAN_FLAGS.lifeopsMainline`（`LIFEOPS_MAINLINE === "true"`・**default OFF・consumer なし**）を追加。
- `isLifeOpsMainlineAllowed({mainline, planRouteLive, supabaseUrl})` = mainline ∧ planRouteLive ∧ **staging allowlist ∧ production deny**。
- **二段階解禁**: 第 1 段=staging first（上記）。第 2 段=production 解禁は **deny 解除の別 CEO gate**（helper 改修+明示承認が必要＝事故で開かない）。
- read/write flags（master ∧ feedback read/write）は独立維持 → 表示と write を別々に殺せる。

## 6. permission 設計
自動でできないこと=**全 write は user gesture 起点のみ**（自動 done なし・cron/notification 起点なし）。done は 2 段階確認を本線でも維持。
**Plan apply とは別物**: Life Ops feedback は M1（prm_learning_events）のみ・anchors/plan_seeds/localStorage proposals に不接触（test で固定）。

## 7. writer 接続境界（再利用可否）
- **再利用可・ただし gate 差し替えの移設が必要**: 現 server action は dev host 三重ガード（`REALITY_CANDIDATE_ACTIONS_DEV_HOST`）前提。
  本線版は `app/(culcept)/plan/_actions/` に置き、host ガード→`isLifeOpsMainlineAllowed` に差し替え。
  **route/resolver/intent/writer/confirm token の pure 部は変更 0 で共有**。
- 本線でも server 側 candidate 再計算は可: 表示と同じ `computeLifeOpsPreviewModel` を server で呼ぶ＝「現在の代表」の単一ソース維持。
- client からは **candidateKey + action + confirm の 3 値のみ**（handle/category/menu/writer DTO 非送信）を本線でも維持可。
- ★**前提 gap**: 本線で見せる候補が fixture では意味がない → **実データ源接続（最低 cadence real read 1 本）が本線より先**。

## 8. UX リスク
| リスク | 対策 |
|---|---|
| done 誤操作（cadence 歪み） | 2 段階確認維持＋amber 区別＋確認文言 |
| rail 情報量（モバイル 390px） | 採用 hold で chip 3 個・実機確認を観測条件に |
| 生活提案がうるさい | 候補 0→card 不出現・cap 済み・Moment 不持込・1 日 1 card・督促語なし |
| cadence が効いて候補が消える体感（「消えた？」） | done 直後の説明 1 行＋ok_done 文言で周期反映を明示 |
| 「採用」の誤解（予定に入った？） | 本線 hold（§3） |

## 9. observation 条件（本線接続前に必要な operator 観測）
1. **実データ源接続後**の代表妥当性（fixture でなく実 cadence/deadline で変な候補が出ないか）≥5 セッション
2. done→候補消滅の体感（read flags ON で done 後に preview 再訪・「もう急かさない」を目視）≥2 回
3. モバイル幅（≈390px）で rail/確認 block の表示 1 回
4. cooldown/duplicate の実挙動（同 action 連打→duplicate_cooldown 表示）1 回
5. 4 action 各 ≥2 回の累計（c17b later=1・c18b done=1 済み）
→ 目安: **追加 5〜7 operator セッション**。充足判定は CEO。

## 10. rollback / disable 方針
- `LIFEOPS_MAINLINE` 未設定/false → card 不出現（構造的・render 経路ごと消える）。
- `LIFEOPS_FEEDBACK_WRITE=false` → rail 押下は gate_off（表示のみ生存も可）。全 flag OFF で c18 以前と完全同一。
- DB: 本線用 migration なし。行は `source_kind='lifeops'` で識別可能 → 既存 exact cleanup script で除去可。不可逆要素なし。

## 11. Readiness Matrix
| 項目 | 状態 |
|---|---|
| 候補生成〜compose〜Morning VM | ✅ |
| action contract / writer / done 2 段階 / E2E（later・done） | ✅ |
| feedback read → cadence merge（gated） | ✅ |
| **実データ源（cadence/deadline real read）** | ❌ **最大 gap（fixture のまま）** |
| 「採用」の本線意味 | ❌ 未決（hold） |
| 本線 gate（flag+helper） | ✅ 本 slice で dormant 追加 |
| 本線 server action（gate 差し替え版） | ❌ 未実装（本線 slice 範囲） |
| モバイル幅検証 / 観測条件 §9 | ❌ 充足待ち |
| production 解禁条件 | ✅ 定義済（二段階・deny 解除=別 CEO gate） |

## 12. 最小 slice 案（実装 GO 時）と推奨順序
最小 slice =「`LIFEOPS_MAINLINE` gated・PlanClient 上部『生活まわり』card（当日 Morning 代表 ≤3・rail=後で/不要/完了※・本線文言・gate 差し替え server action）」。
**ただし hold 推奨**。順序: **c20=cadence real read 接続（preview 内・dormant flag `lifeopsCadenceReadonly` の wiring）→ c21=実データ operator 観測（§9 充足）→ c22=本線最小 card**。

## 13. 本線 slice の test plan（固定するべき lock）
①flag OFF→card 不出現・PlanClient DOM 不変 ②gate matrix（staging/prod/planRouteLive）③rail に採用なし・done 確認付き維持
④本線文言（「予定には書き込みません」明示・BANNED_WORDS）⑤handle/PII 非搬出 ⑥本線 server action の deny matrix
⑦anchors/plan_seeds/localStorage proposals 不干渉 ⑧cooldown/PRG 維持。（今 slice では flag default OFF + gate matrix + dormant lock のみ追加）
