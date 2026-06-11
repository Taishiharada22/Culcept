# Life Ops — A-4-c33 Structured Source Input UI Mini-Design（staging gated・deadline first）

> 2026-06-11 / CEO・GPT GO。**禁止**: cadence UI・free text 系入力欄（title/memo/note/description/placeQuery/URL/calendar title/
> event name/store name/location name/raw text）・production 表示/write/enable・R4・notification・external API・accept 表示・push/PR/merge。

---

## 1. 設計核心: 登録入口 ≠ 候補 card（bootstrap 問題）

```
候補 card（生活まわり）= 候補がある時だけ（既存・c23/c26 不変更）
登録入口（生活まわりを登録）= **source 0 件でも出る**別 card（staging gated・production 絶対不可視）
```
初回ユーザー（source 0→candidate 0→候補 card null）が登録できる入口を独立 card として常設（gate 内）。

## 2. UI scope（最小・自由文ゼロ）
`LifeOpsSourceInputCard`（client・presentational）: 種類=**辞書 `money_admin` group 由来の enum picker**（確定申告/免許の更新/
パスポートの更新・表示名は辞書 label）＋期限日=`<input type="date">`＋[登録]。入力要素は **select / date / hidden(sourceType=deadline) のみ**
（text/textarea 不存在を render lock）。footnote=「予定には追加しません。生活提案の材料として使います。」
※GPT 例の「支払い/書類提出」は辞書未登録＝picker は辞書実在分のみ（辞書拡張は別 slice・app-layer validation 方針 c27 と整合）。

## 3. server action（`plan/_actions/lifeops-structured-input.ts`・"use server"）
client から受ける値=**sourceType/categoryId/menu(deadline では送らず null)/dueDateISO の最大 4 つだけ**。
occurrence_key/confidence/status/user_id/DB id/raw/source_ref/title 系は **formData から読まない**（static lock）。
flow: ①mainline gate（mainline∧planRouteLive∧staging∧!prod）②auth userId 注入 ③c31 builder（辞書/ISO/shape validation+
**occurrence 自動生成**）④duplicate guard=**新 read 口** ⑤c9 系 writer（write gate=master∧LIFEOPS_STRUCTURED_SOURCE_WRITE∧staging∧!prod）
⑥PRG `/plan?lifeopsSrc=token`（ok/already_exists/invalid/gate_off/denied・allowlist 検証→固定辞書文言）。

## 4. duplicate guard 読み口（c32 finding 対応・推奨案採用）
`readActiveStructuredRowsForDuplicateGuard(client, userId, env)`（**server-only・writer module 内**）:
**write gate 配下**（duplicate 判定は write 操作の一部＝write flag OFF/production→**query 0**）・column-restricted（c27 COLUMNS）・
active のみ・LIMIT。**UI/DTO へ rows を出さない**（server action 内で writer へ渡すだけ・DB row→candidate 直結禁止の原則維持）。

## 5. gate / 文言
入口表示=mainline gate ∧ `LIFEOPS_STRUCTURED_SOURCE_WRITE`（page が判定し props 渡し・**default OFF→props 不渡し=非表示**・
production は二重 gate で不可視+action も gate_off）。文言: 成功=「登録しました。生活まわりの提案に反映します。」/
duplicate=「同じ期限はすでに登録されています。」/ validation=「期限日を確認してください。」（invalid_* を集約）。

## 6. test（GPT 16）と既存 lock 進化
新 render/contract test（production・OFF 非表示／0 件でも入口表示／free text 欄不存在／form field 名 allowlist／action static=builder・
read 口・formData 4 名のみ／文言／390px wrap／tabs 不干渉）＋ **lock 進化 2 件**: c31「writer の app consumer 0」→input action を公認／
c19「mainline gate consumer=2 file」→input action を追加し 3 file。

## 7. CEO smoke（c33b・別 checklist で停止）
before 0 → /plan で入口表示 → tax_filing+期限登録 → count 1・候補 card に出る → 同じ期限再登録→duplicate → exact cleanup → 0。
Claude は operator login を扱わないため **CEO 手順で停止**。
