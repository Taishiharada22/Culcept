# Life Ops card 配線（L-6 deep-link → L-8 カード）mini-design【表示専用・A-4/DB 非接触】

> 2026-06-09 / Life Ops 縦トラック（branch `claude/life-ops-vertical`）
> 参照: card-presenter(L-8a) / LifeOpsCard(L-8b) / booking-link(L-6) / permission(L-7)。
> **CEO 指示**: card 配線で進む。**A-4 側の DB/writer/action rail へ触らない**。まず mini-design。表示専用・DB/write/production 非接触。

---

## 0. 一行
L-8 カードの「予約ページへ進めます」ボタンを、**L-6 deep-link の実外部リンク**（ホットペッパー/Google マップ検索ページ）に配線する。**外部ページを新規タブで開くだけ**（action 記録・DB write・A-4 action rail に一切触れない）。

## 1. 確認 10 項目への回答
1. **残る card 記録タスクの正確な範囲**: presenter(L-8a) が `bookingLinks` を ViewModel に載せ、card(L-8b) がそれを実リンクボタンで描画する **2 点のみ**。それ以外（実データ/横R2/通知/予約実行）は範囲外。
2. **card 内ボタンの現在状態**: `LifeOpsCard` は `actionLabel`（例「予約ページへ進めます」）を **GlassButton(onClick 任意・未配線)** で表示するのみ。リンクではない。
3. **どのリンクを実リンク化するか**: `buildBookingLinks`(L-6) が返す **deep-link のみ**（open_link 許可＝美容系）。actionLabel が「予約ページへ進めます」のカテゴリで bookingLinks が非空のとき。
4. **hotpepper / google deep-link の扱い**: それぞれを **styled `<a href target="_blank" rel="noopener noreferrer">`** で描画（外部・新規タブ・noopener 安全）。URL は L-6 が組んだ検索ページ（fetch しない）。クリックはユーザー操作（自動遷移しない）。
5. **deep-link がない場合の fallback**: `bookingLinks` 空（通知/候補/医療 cap/placeQuery なし＝事務・買い物・医療・準備）→ **従来の actionLabel ボタン（リンクでない・onClick なし・純表示）**。外部遷移しない。
6. **preview で確認する画面**: `/lifeops-preview`。美容院カードに「ホットペッパーで探す」「地図で探す」の実リンク（href 検証）、非美容カードはリンクなしラベルのまま。世界観（glassmorphism トーン）維持を screenshot で確認。
7. **A-4 本流との重複がないこと**: A-4＝プラン candidate の accept/dismiss/later → seed status/DB（action rail）。本 card 配線は **外部検索ページを開くだけ**で、**plan action 記録・seed 遷移・DB write を一切しない**。concern が別＝重複なし・rail 非接触。
8. **DB/write/production に触れない**: card は client の `<a href>`（外部 nav）。**fetch/DB/server action/write なし**・横エンジン非 import・実データ非接触。
9. **tests / tsc の範囲**: presenter test に `bookingLinks`（美容系=2件・非美容=空・area 反映）を追加。card は React（preview 検証）。tsc footprint 0 維持。
10. **closeout 条件**: presenter+card 更新 / 美容系カードに実 deep-link・非美容は fallback / A-4・DB 非接触 / preview screenshot で世界観 OK / tests・tsc green / proxy.ts 一時公開 revert / working tree clean。

## 2. 実装
- **L-8a `card-presenter.ts`**: `LifeOpsCardViewModel += bookingLinks: readonly BookingLink[]`。`toLifeOpsCardViewModel(candidate, assessment, opts?: { area? })` が `buildBookingLinks(candidate, assessment, { area })` を載せる。`toLifeOpsCardViewModels(candidates, opts?)` で area 透過。
- **L-8b `LifeOpsCard.tsx`**: `vm.bookingLinks.length>0` → 各リンクを styled `<a href target=_blank rel="noopener noreferrer">`（GlassButton secondary 風 class）で横並び。空 → 従来 actionLabel ボタン（fallback）。
- **preview page**: 既存 `toLifeOpsCardViewModels` 経由で bookingLinks 自動付与（page 変更最小）。

## 3. 厳守 / 非スコープ
- 表示専用・**外部リンクを開くだけ**・**A-4 action rail / seed / DB / write 非接触**・横エンジン非 import・no-fetch・実データ非接触。
- **非スコープ**: 予約実行/入力補助(Phase3-4)・実店舗/電話/公式/LINE(実データ)・横R2 配置・action 記録/analytics。

## 4. テスト
- presenter: 美容院→bookingLinks 2件(hotpepper/google・url 検証)・area 反映 / 事務・買い物・医療・準備→空 / pure。
- card: preview で美容院に実リンク(href)・非美容は fallback ラベル・console error 0・世界観 OK。tsc footprint 0。

## 5. closeout
preview 確認後、proxy.ts 一時公開 revert・working tree clean・commit（presenter/card/preview/test）。A-4/DB 非接触を明記。
