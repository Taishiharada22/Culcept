# Life Ops L-6 — 予約導線 pure deep-link mini-design【pure 実装可・API/特定店舗/自動はゲート】

> 2026-06-09 / Life Ops 縦トラック（branch `claude/life-ops-vertical`）
> 参照: boundary §2 L-6・§5 / Appendix A.3 Phase2・A.4 / candidate-types / permission(L-7) / category-model(group)。
> **CEO 指示**: L-6 予約導線 pure 層（deep-link・API 呼ばない）。Phase 3-4(入力補助/自動予約)・実データ源は停止。横非 import 継続。

---

## 0. 一行
`placeQuery`（L-1）→ 予約/検索**ページ**の **deep-link URL を組み立てる pure 層**（fetch しない）。**permission（L-7 open_link 許可）を厳守**し、許可カテゴリ（美容系）のみリンクを出す。

## 1. 設計判断（前提を疑った結果）
- **deep-link ≠ 外部送信**: URL 文字列を作るだけ。fetch/API なし。ユーザーがクリックして初めて外部遷移（自動で開かない）。→ pure・安全。
- **検索ページ誘導**（特定店舗でない）: `freeWord`/`query` で検索ページへ。特定店舗・電話・公式・LINE は **実データ（Places API）= CEO ゲート**。
- **permission 厳守**: `isActionAllowed("open_link", assessment)` が false（医療 suggest cap / 買い物 suggest / 事務 notify）なら **空**（deep-link 出さない）。＝美容系（open_link 許可）のみ。
- **platform（世界観）**: 美容系 → **ホットペッパービューティー**（日本の美容予約標準）+ **Google マップ**。買い物の地図探索リンクは後続（permission 拡張要）。

## 2. 型 / API（実装 `lib/lifeops/booking-link.ts`）
```ts
export type BookingPlatform = "hotpepper_beauty" | "google_maps";
export interface BookingLink {
  readonly platform: BookingPlatform;
  readonly label: string;   // 「ホットペッパーで探す」「地図で探す」
  readonly url: string;     // 検索ページ deep-link（encodeURIComponent・API 呼ばない）
}
export interface BookingLinkOptions { readonly area?: string | null; } // 地域/駅（注入・実データ源は別）
export function buildBookingLinks(
  candidate: LifeOpsCandidate,
  assessment: PermissionAssessment,
  opts?: BookingLinkOptions,
): readonly BookingLink[];
```

## 3. ロジック（pure）
```
if !isActionAllowed("open_link", assessment) → []        // permission 尊重（美容系のみ通る）
if !candidate.placeQuery → []                            // 検索語なし（事務/準備/薬）
query = placeQuery + (area ? " " + area : "")
美容系(group=body_appearance ∧ open_link許可) → [hotpepper_beauty, google_maps]
（将来 買い物等 → google_maps のみ・permission 拡張後）
URL:
  hotpepper_beauty: https://beauty.hotpepper.jp/CSP/bt/freeword/?freeWord=<enc(query)>
  google_maps:      https://www.google.com/maps/search/?api=1&query=<enc(query)>   // Google 公式 URL scheme
```
- `area` は注入 optional（なくても検索ページに誘導可・地域はユーザーが絞る）。実データ源（居住地/予定の駅）は別 slice。

## 4. 安全（A.4 整合）
- deep-link は open_link action 相当。**permission が open_link を許可したカテゴリのみ**。
- L-7 で美容系は `requiresExplicitConfirmation=true`（appearance_change 等）。UI は「予約ページへ進めます」前に確認（L-8 confirmationNote 表示済）。リンクは検索ページで、予約確定はユーザーが外部で行う（自動でない）。

## 5. 厳守 / 非スコープ
- pure・deterministic・**横エンジン非 import**・**no-fetch/no-API**・no-DB・no-UI・no-実データ源・barrel 非 export。
- **非スコープ（ゲート/後続）**: Places API 実検索・特定店舗/電話/公式サイト/LINE（実データ=CEO ゲート）・フォーム入力補助/自動予約（Phase3-4=stop）・買い物の地図リンク（permission 拡張要）・card への配線（L-8/横R2）。

## 6. テスト（`tests/unit/lifeops/lifeOpsBookingLink.test.ts`）
- 美容系（beauty_salon 等・open_link 許可）→ hotpepper+google の 2 リンク・URL に encode 済 query・area 反映。
- 医療(dental)/買い物(groceries)/事務(license)/準備(outfit_prep) → **空**（open_link 不許可 or placeQuery なし）。
- URL 形式（freeWord / maps query）・encodeURIComponent（スペース/日本語）・area null/あり。pure（同入力同出力）。**fetch を呼ばない**（型/実装上 no-network）。

## 7. 停止
L-6 pure deep-link 着地後、**Places API 実検索 / 特定店舗・電話・公式・LINE / 入力補助・自動予約 / card 配線** に入る前は停止（CEO ゲート/横R2）。
