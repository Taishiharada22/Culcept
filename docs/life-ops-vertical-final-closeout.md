# Life Ops 縦トラック — Final Closeout / Audit / Handoff【2026-06-12・branch `claude/life-ops-vertical`】

> CEO 指示: 主要 6 群の collector 合流をもって縦を closeout。追加実装なし・docs-only。
> **完成の定義**: Life Ops 縦の「**何を・いつ・どこまで許可して・どう見せ・どこへ誘導し・どう学習するか**」の pure 提案層。
> **未完の定義**: 実データ・横R2配置・UI本配置・通知・外部実行・学習の live 化（全てゲート・§9/§14）。

---

## 1. 最終カテゴリ数
**32 カテゴリ・6 群**（body_appearance 10 / pre_event_prep 5 / daily_upkeep 5 / money_admin 6 / growth 5 / relationship 1[単一受け皿・touchpoint 25 種は relationship-model 側]）。

## 2. 6 群ごとの完了範囲
| 群 | 完了（pure） | 備考 |
|---|---|---|
| ①身体・外見 | カテゴリ10・cadence(カット42/カラー56/眉28)・周期候補・イベント前倒し・L-6予約deep-link・L-9学習 | 医療4は health_sensitive で suggest cap |
| ②予定前準備 | one-shot 5種（服/資料/荷造り/チケ宿/持物）・イベント種→準備マップ | gift/手土産は⑥へ統合 |
| ③買い物・家事・生活維持 | 補充cadence(食料品4/日用品14)・家事cadence(洗濯/掃除)・ゴミ出しweekly | — |
| ④お金・契約・事務 | deadline(免許30/パスポート60/税21)・recurring毎月(家賃/カード/サブスク) | 通知のみL1 |
| ⑤成長・仕事・学習 | habit model(週目標+連続・低圧3phase・責めない)・**Growth Neuron Taxonomy**(5カテゴリ×dimension×closed vocab)・rationale evidence | met/on_track は出さない |
| ⑥人間関係・Gift | touchpoint 25種・opaque personRef・suppression(手動)・**Gift Intelligence**(DesireSignal/多段pipeline/N選)・candidate generator・偵察プロンプト・下書き構造(本文blocked) | Tier A同意面は将来 /plan coalter ペア基盤に抽象化 |

## 3. 完成した時間構造（7 つ）
| 構造 | engine | 用途 |
|---|---|---|
| cadence（前回→経過） | cadence-model + candidate-engine | 美容/買い物/家事/（将来）連絡周期 |
| event prep（before） | event-preparation (a) | 外見重要イベント前の nearing 前倒し |
| one-shot event | event-preparation (b) | 面接→服/資料・旅行→荷造り |
| deadline（期日逆算） | deadline-engine | 免許/パスポート/税・お礼 followup |
| recurring（毎月/毎年/**毎週**） | recurrence-model | 家賃/カード/サブスク・誕生日/記念日・ゴミ出し |
| habit（週目標+連続） | habit-model | 成長5カテゴリ（低圧・責めない） |
| **post-event**（終了後窓） | relationship-candidates 小拡張 | 結果を聞く1-5日・会った後0-3日 |

## 4. collector に合流した入力（6 系統・`collectLifeOpsCandidates(inputs, nowISO)`）
`cadenceObservations` / `upcomingEvents` / `deadlineObservations` / `recurringObservations` / `habitObservations` / `relationshipObservations`。
優先順位: deadline → recurring → event前倒し → one-shot → 周期 → habit → relationship（低圧ほど末尾）。dedup=(category,menu)・relationship のみ touchpoint×personRef。

## 5. presenter 対応の文言範囲（card-presenter）
全 7 dueReason kind の非断定文言（cycle「前回から◯日(目安◯日)」/ event「◯日後の◯◯に向けて」/ deadline「期日まで◯日/過ぎています」/ recurring「毎月・あと◯日」/ habit 低圧3形+neuron精緻化(「復習を軽めに1回」)+evidence補足行 / relationship touchpoint別低圧(「ひとこと考えておくと安心です」等・NG=今すぐ/送信/必ず喜ぶ)）+ riskNotes(redacted)+確認注記+actionLabel+gift控えめ補足行+urgency(overdue/high/normal)+title(カテゴリ label・relationship は touchpoint label)。L-8b React カード+preview 世界観確認済。

## 6. permission / blocked action の範囲
- **汎用 L-7**: L0-L5→action(observe/notify/suggest/open_link/assist_input/auto_execute)。初期上限 open_link・**L4/L5 常時 blocked（future-gated）**・health_sensitive→suggest cap・A.4 risk 群→確認必須。
- **relationship 専用**: max=**suggest**・確認必須・blocked=[auto_send, auto_notify, external_message, purchase, reservation, **draft_body_generation**]。
→ **「勝手に予約・購入・連絡・送信しない」が全カテゴリで構造的に不可能**（テスト固定）。

## 7. Gift Intelligence の現在地
**完了（pure）**: GiftInterest 19語彙 / DesireSignal(confidence=source導出・freshness half-life 14/60日・stale降格) / Tier A蒸留・B構造化・C偵察→統一 / 多段 pipeline(suppression→sanitize→scoring→constraints→戦略生成→重複回避→portfolio) / GiftRecommendation N選(safe/easy/surprise/experience/premium・定数カタログ合成) / reasonCodes→低圧文言(感情断定なし) / candidate への optional metadata(最大3・根拠 low のみは非添付)。
**未実施（ゲート）**: 実商品検索・価格・在庫・購入・gift deep-link・実カタログ injected・Tier A 実蒸留配線・偵察キャプチャ UI。

## 8. A-4 本流へ渡す範囲（seam）
- **唯一の入口**: `collectLifeOpsCandidates(inputs, nowISO)`（契約: `docs/life-ops-r2-integration-contract.md`）。横R2 が配置・suggestedWindow 確定・3案化、R4 が trigger。依存方向は横→縦の一方向。
- 併せて渡す: `assessLifeOpsPermission`/`assessRelationshipPermission`（許可判定）・`toLifeOpsCardViewModels`（表示VM）・`LifeOpsCard(List)` React。
- **A-4 structured source / writer / action rail には全 commit 不接触**（merge-base diff で範囲外ファイルゼロを確認済）。

## 9. 今後のゲート領域（再開時も CEO 承認/設計監査が必要）
実データ接続（前回日/イベント/期日/habit実績/関係日付/Tier A蒸留/contact import）・UI（入力/表示/Home本配置）・DB（schema/migration）・通知/配送・message draft 本文生成（LLM）・LLM 分類・商品検索/価格/在庫・deep-link/外部API（Places/EC）・送信/購入/予約（Phase3-4）・production/deploy/canary・push/PR/merge。

## 10. 全 commit 一覧（23・時系列）
`b9358cf7`(L-1 design) `5e76dfa3`(L-1) `87084c14`(L-2) `e28ce1b9`(L-3 design) `c0711f3c`(L-3) `6ed3ef3a`(L-4a) `316c45e4`(L-4b) `13bc016d`(買い物) `ebfa4c69`(deadline+事務) `153a3727`(collector+R2契約) `e51edda7`(結合テスト) `ac88b427`(L-7) `b4574544`(L-8a) `469ebf64`(L-8b+preview) `7791fe6c`(L-6) `b786b868`(L-9) `8e1fb236`(card配線) `2ad0ba97`(recurring+事務) `ec24d8f4`(家事) `85cf3f9b`(habit) `7eab4298`(growth neuron) `c2401e53`(relationship/gift契約) `64e33c07`(relationship candidates)。

## 11. tests / tsc
**228 tests / 16 files 全 PASS**。`tsc --noEmit` total **55 = main baseline**（lifeops 起因エラー 0・全 slice で footprint 0 維持）。

## 12. 純度確認
lib/lifeops の import は **`./` 同一 dir のみ**（横エンジン/外部/React/Supabase 皆無・L-8b React は components 側で表示専用）。DB/UI(本配置)/通知/送信/購入/外部API/LLM分類/実データ/production **ゼロ**。**push/PR/merge 未実施**（upstream 未設定を確認）。

## 13. working tree clean
closeout 時点で clean（本 doc commit 後も clean）。

## 14. ゲート解除後 / 本流接続後 / 再開時に進める残作業（全網羅・漏れなし）

> 表現補正（2026-06-12 CEO）: 本節は「production 後に進める内容」**ではない**。正確には **「ゲート解除後 / 本流接続後 / 再開時に進める残作業」**。
> 特に **§14-H（小さな pure 残り）は production 後を待たず、CEO の再開指示があれば local-only で着手可能**（実データ/UI/外部に触れないため）。A〜G は各々のゲート（実データ=CEO・横R2=本流・UI=世界観・外部=API キー/課金・通信=最厳格・production=承認）に依存。
### A. 実データ源接続（CEO ゲート）
1. lastCompletedAt 収集（美容/買い物/家事・L0 記録 or 横蒸留） 2. upcoming events（構造化入力 or 共有予定・calendar title 推定は却下済） 3. 期日/引き落とし日/更新日入力（事務） 4. habit 実績（doneThisWeek/daysSinceLast） 5. 関係日付（誕生日/記念日/最終接点）構造化入力・contact import（ゲート） 6. **Tier A 実蒸留 pipeline**（相手の wishlist/later/habit/plan/style/consumable→DesireSignal。consent 基盤は /plan coalter ペア側） 7. 偵察結果キャプチャ（post-meeting 構造化入力） 8. L-9 完了イベント実収集→`personalizeCadenceSpec` を L-3 に自動配線。
### B. 横 R2/R4 本流接続（本流セッション）
9. `collectLifeOpsCandidates`→R2 配置・suggestedWindow 確定 10. 守る/楽/攻める 3案統合 11. Morning Briefing（生活行動候補/準備不足/3案） 12. Moment Trigger 発火+内容（配送は更にゲート） 13. Home 本配置（lifeops-preview は dev fixture のまま）。
### C. UI 拡張（世界観ゲート）
14. Tier B プロファイル入力 UI（closed vocab 選択） 15. growth neuron dimension 選択 UI 16. gift recommendation 表示 UI（metadata→カード） 17. 偵察ミッション表示 18. suppression（喪中/do-not-suggest）入力 UI 19. 関係カードの人物名ローカル解決（personRef→表示名・端末側）。
### D. 外部実行（CEO 承認: API キー/課金）
20. Places API 実検索・特定店舗/電話/公式/LINE 21. gift searchQuery→EC deep-link 化（booking-link 同型） 22. 実商品検索/価格/在庫（injected catalog 差し替え契約→実 API） 23. 予約 Phase3 入力補助/Phase4 自動予約（**stop**） 24. 購入導線（**stop**）。
### E. 通信（最厳格）
25. message draft 本文生成（LLM・現在 literal blocked） 26. 送信は永続 blocked 方針（送るのは常にユーザー）。
### F. 学習・深化
27. gift 反応履歴学習（reactionHistory→次回精度・L-9 同型） 28. GrowthProfile 実収集+state(energy/density)横接続 29. 連絡周期の個人学習（関係別 threshold を L-9 同型で override） 30. LLM 分類（free text→taxonomy・ゲート）。
### G. production
31. DB schema/migration（CEO 承認） 32. 通知配送/push 基盤 33. deploy/canary/rollout 34. GitHub push/PR/merge（CEO 指示時）。
### H. 縦の小さな pure 残り（再開時に自律可能）
35. casual_checkin / shared_plan_followup の候補化 36. seasonal_gift の具体日 preset（お中元/お歳暮/母父の日） 37. gift 実カタログ injected 契約（ProductDescriptor 拡張 DTO） 38. E2E: 偵察→scouting_result→gift 循環テスト 39. growth neuron×gift の橋（相手の habit→gift signal は Tier A 蒸留に含む）。

---
**判定: Life Ops 縦トラック closeout 完了・freeze。** 縦の pure 提案層（6 群・7 時間構造・collector 単一出口・permission・presenter・gift intelligence）は完成・凍結。以降の全作業は §14（ゲート解除後/本流接続後/再開時）に整理済み。

## 15. freeze 後の分岐（2026-06-12 CEO・このセッションは追加実装しない）
1. **A-4 本流側**で横R2 / Morning Briefing / Moment Trigger / Plan 配置へ接続（§14-B・別セッション）。
2. **production gate 解除後**に実データ / DB / UI / notification / 外部API へ進む（§14-A/C/D/E/G）。
3. **CEO 判断で §14-H の小さな pure 残りだけ別 slice で再開**（local-only・production 前でも可）。
4. **いったん別トラックへ移る**。
→ 本縦セッションはここで freeze。次の入力でいずれの分岐かを CEO が指示。
