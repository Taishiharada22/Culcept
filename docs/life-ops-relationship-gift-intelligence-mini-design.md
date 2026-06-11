# Life Ops A-6 — Relationship / Gift Intelligence mini-design【pure 契約・DB/UI/通知/送信/外部API/LLM分類 禁止】

> 2026-06-09 / Life Ops 縦トラック（branch `claude/life-ops-vertical`）
> **CEO 指示**: 人間関係を「誕生日を思い出す」で終わらせず、**相手の状態・欲・予定・価値観・過去反応・関係性から、最適な接点/贈り物/言葉/タイミングを根拠付きで出す** pure contract。Rendezvous/Genome Card は初期 scope 外・同意面は将来の /plan coalter ペア基盤に抽象化。

---

## 1. relationship / gift category 一覧（25 touchpoint・3 群 + 抑制）
- **celebration_gift（12）**: birthday / anniversary / seasonal_gift / promotion / new_job / graduation / exam_pass / marriage / childbirth / new_home / recovery / opening_business
- **reciprocity（6）**: thank_you_followup / return_gift / borrowed_item_return / introduction_thanks / hosted_meal_thanks / support_thanks
- **contact（7）**: long_time_no_contact / casual_checkin / post_meeting_followup / pre_event_encouragement / post_event_result_check / visit_family / shared_plan_followup
- **抑制（touchpoint でなく制御）**: do_not_suggest / mourning_suppression / sensitive_period / relationship_distance / frequency_cap

## 2. Tier A / B / C の入力差（全て **DesireSignal に統一合流**）
| Tier | 相手 | 入力 | source 値 |
|---|---|---|---|
| **A** | ユーザー（同意済） | `ConsentedDistilledProfile`（蒸留済 desireSignals + styleFit/owned カテゴリ） | wishlist / later_candidate / recent_habit / upcoming_plan / style_profile / consumable_cycle |
| **B** | 非ユーザー | `PartnerStructuredProfile`（closed vocabulary: relationKind/ageRange/interests/disliked/knownNeeds…） | manual_structured_hint |
| **C** | 偵察 | 聞くきっかけ提案（通信実行なし）→ 結果を構造化キャプチャ | scouting_result |
3 経路の出力が同一の `DesireSignal[]` になるため、推薦パイプラインは Tier を知らない（単一契約）。

## 3. consent / scope abstraction
縦は**どの画面で同意が成立したかを知らない**。`ConsentedDistilledProfile.consentScopeId`（opaque）を受けるのみ。将来の /plan coalter・2人チャット・予定共有が同意面になっても契約不変。「Genome Card」という語に依存しない。

## 4. opaque personRef
`p_` 始まりの opaque token（`^p_[a-z0-9][a-z0-9_-]{3,63}$`）のみ受理。email/電話/実名/UUID 風はパターンで弾き、不正 ref の入力は**全体 fail-closed（空出力）**。表示名の解決は将来 UI のローカル責務（縦は知らない）。

## 5. redaction 方針
presenter（reason 文言・偵察プロンプト）は **personRef を引数に取らない**＝出力に identity が乗る経路が構造的にない。reason は **code → 定数文言**のみ（入力文字列は表示に乗らない）。生データ非開示・蒸留出力のみ（「最近、旅行準備の流れがあるため…」型）。

## 6. desire signal model（CEO DTO 準拠）
`DesireSignal { source, category, freshness, strength, confidence }`。category は **GiftInterest closed vocabulary（19 値）**に sanitize（free text drop）。**confidence は source から導出**（入力値を信用しない）: wishlist=high / manual・scouting・later・consumable=medium / habit・plan・style=low（inference は低め）。

## 7. freshness / desire half-life
`freshnessFromDaysSince`: ≤14日=fresh / ≤60日=recent / >60日=stale。score = freshness(1.0/0.6/0.2) × strength(1.0/0.6/0.3) × confidence(1.0/0.7/0.4)。**stale×strong×high(0.2) < fresh×strong×low(0.4)**＝古い wishlist より今の関心が勝つ。stale 由来の推薦は confidence を low に降格（強く出さない）。

## 8. gift recommendation pipeline（多段 pure）
personRef 検証 → touchpoint の gift 適合 → **suppression**（do_not_suggest/mourning…→空）→ signal sanitize → freshness scoring → **hard constraints**（disliked/owned）→ 戦略別候補生成（safe=確実系 source / surprise=推測系 source 上位）→ **過去贈答の重複回避** → portfolio 選抜（戦略分散・N 選）→ reasonCodes 付与 → 最終 N 件。

## 9. product recommendation DTO（CEO 準拠）
`GiftRecommendation { strategy(safe|easy|surprise|premium|experience), productDescriptor, searchQuery, budgetBand, reasonCodes[], confidence, riskFlags[] }`。descriptor/query は **GIFT_CATALOG_HINTS 定数**（19 カテゴリ）からの合成のみ（free text 不可能）。live 検索/価格/在庫/購入なし。将来の商品レベルは injected catalog 差し替えで深化。

## 10. occasion / relationship / budget / formality
`GiftOccasionFrame { touchpointId, relationKind(7種), budgetBand, formality }` + `defaultBudgetBand(relation×touchpoint)`（結婚・出産・新居・開業=high / 誕生日は partner=high・family/close_friend=middle / 礼系=low / fallback=middle）。

## 11. suppression / do-not-suggest / mourning（手動入力のみ）
do_not_suggest→**全 touchpoint 抑制** / relationship_distance→全抑制 / mourning→celebration_gift 群抑制（礼・返却は許可）/ sensitive_period→celebration_gift 抑制 / frequency_cap（直近接点数≥3）→contact 群抑制。**自動検出しない**。

## 12. communication draft structure（本文生成 blocked）
`ContactDraftStructure { tone, length, opener(recent_topic|gratitude|season|occasion), cta(none|light_meet|ask_recent), bodyGeneration:"blocked" }`。touchpoint×relationKind から構造を導出。本文は型レベルで blocked（literal）。

## 13. permission / blocked action（初期は最も高い安全）
`assessRelationshipPermission()`: maxAllowedAction=**suggest**・requiresExplicitConfirmation=true・blocked=[auto_send, auto_notify, external_message, purchase, reservation, **draft_body_generation**]。searchQuery/deepLink の実リンク化は後続 gate（descriptor/query 文字列までが pure 圏）。

## 14. low-pressure wording
reason 文言は仮説形（「〜に沿っています」「〜合いそうです」）。**相手の感情を推定・断定しない**（「喜ぶはず/必ず/感動」禁止・テスト固定）。偵察プロンプトも自然な聞き方の提案のみ。

## 15. collector / presenter への最小接続
本 slice は **contract 優先で collector 合流は次 slice**（CEO 許可・設計肥大回避）。presenter 相当は `giftReasonTexts(codes)`（code→定数文言）と scouting prompt 定数を本 slice 内に持つ。candidate generator（touchpoint→LifeOpsCandidate・annual recurring 誕生日等）は次 slice。

## 16. 将来 gate（進む前に必ず停止）
相手実データ接続・consent 基盤実装（/plan coalter 側）・実カタログ/商品検索/価格（外部 API）・deep-link 化・下書き本文生成（LLM）・連絡先/address book・UI・通知・DB。**絶対禁止リスト**（実名/email/電話/SNS ID/raw note/calendar title 推定/SNS scraping/自動送信/自動購入）は契約とテストで固定。

## 実装 / テスト
`lib/lifeops/relationship-model.ts`（personRef/touchpoint taxonomy/suppression/draft 構造/偵察/permission）+ `lib/lifeops/gift-intelligence.ts`（vocabulary/DesireSignal/scoring/Tier 変換/pipeline/DTO/reason 文言）+ tests（CEO 16 項目）。
