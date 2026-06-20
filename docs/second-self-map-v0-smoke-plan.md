# Second Self Map — v0 全体 smoke / closeout plan

> 2026-06-05 / code branch `claude/second-self-map-v0`（実装完・main 未着地）
> ループ「仮説→選択→feedback→belief 反映」が閉じた節目の**通し smoke**。unit は mobility 75 test PASS 済。
> 関連: `docs/second-self-map-implementation-plan.md` / `docs/second-self-map-v0f-mini-design.md`。

---

## 0. 目的
v0-A〜F を**実機で通し**検証：belief が育つ → 仮説が surface → 選ぶ → feedback が**別 store**に記録 → 次回 belief が**加重で動く**（correction が強く効く）。silence ガードも確認。

## 1. 起動
```
cd /Users/haradataishi/Culcept-second-self-v0 && npm run dev
```
→ localhost:PORT を開く → `/plan` → Map タブ → **≥2 anchor がある日**（leg が存在）を表示。今日 = `2026-06-05`。

## 2. 最初に1回: legKey を取得
leg card を開いて任意の mode を1回選ぶ → DevTools console:
```js
const S = JSON.parse(localStorage['aneurasync.plan.map.selectedMode.v1']);
const day = Object.keys(S.byDay).at(-1);
const leg = Object.keys(S.byDay[day]).at(-1);
console.log({ day, leg }); // この leg を以降の seed に使う
```

## 3. 共通ヘルパ（console に貼る・LEG だけ書き換え）
```js
const SK='aneurasync.plan.map.selectedMode.v1', FK='aneurasync.plan.map.hypothesisFeedback.v1';
const LEG='＜手順2の leg＞', TODAY='2026-06-05';
const rd=k=>JSON.parse(localStorage[k]||'null');
const wr=(k,v)=>localStorage[k]=JSON.stringify(v);
const clearToday=S=>{ if(S.byDay[TODAY]) delete S.byDay[TODAY][LEG]; }; // today 未選択=仮説を再評価させる
const dump=()=>{ console.log('selected', rd(SK)); console.log('feedback', rd(FK)); };
```

---

## 4. ループ本線（surface → 記録 → 反映）

### A) 仮説 surface（belief 育成）
```js
const S=rd(SK)||{version:1,byDay:{}};
for(const d of ['2026-06-01','2026-06-02','2026-06-03']) (S.byDay[d]??={})[LEG]='train';
clearToday(S); wr(SK,S); location.reload();
```
→ leg 再オープン。**期待**: 「いつもは 電車 を選びがちです」surface（recall は抑止＝重複しない）。

### B) live writeback（仮説への訂正を記録）
A の仮説「電車」が出ている状態で、card で **「徒歩」** を選ぶ → `dump()`。
**期待**: feedback に `{kind:"explicitCorrection", surfacedMode:"train", chosenMode:"walk"}`（selected 正本は walk）。

### C) belief 反映 ①（拮抗 → 沈黙）
correction を2日分 seed（実クリックの蓄積を模擬）:
```js
const S=rd(SK), F=rd(FK)||{version:1,byDay:{}};
for(const d of ['2026-06-04','2026-06-06']){
  (S.byDay[d]??={})[LEG]='walk';
  (F.byDay[d]??={})[LEG]={kind:'explicitCorrection',surfacedMode:'train',chosenMode:'walk'};
}
clearToday(S); wr(SK,S); wr(FK,F); location.reload();
```
→ belief: train 3 + walk 2×2=4（total 7・topShare 0.57<0.6）。**期待**: 仮説が**沈黙**（contested を断定しない＝split guard）。ジャンプしない。

### D) belief 反映 ②（逆転 → 徒歩）
correction をもう1日:
```js
const S=rd(SK), F=rd(FK);
(S.byDay['2026-06-07']??={})[LEG]='walk';
(F.byDay['2026-06-07']??={})[LEG]={kind:'explicitCorrection',surfacedMode:'train',chosenMode:'walk'};
clearToday(S); wr(SK,S); wr(FK,F); location.reload();
```
→ belief: train 3 + walk 6（total 9・topShare 0.67）。**期待**: 「いつもは **徒歩**」へ遷移。
→ **本線 PASS = train→沈黙→徒歩 の滑らかな遷移**（correction 重み2が belief を動かした）。

---

## 5. ガード（断定しない・記録しない条件）

### E) confirmation（増幅しない）
A 状態（仮説「電車」）で **「電車」** を選ぶ → `dump()`。
**期待**: feedback に `{kind:"confirmation", surfacedMode:"train", chosenMode:"train"}`。
（belief 非増幅の厳密検証は unit test #11。実機は「confirmation が記録される」ことを確認すれば十分）

### F) cold-start
履歴ゼロの**別 leg**を開く → **期待**: 仮説出ない（沈黙）。

### G) sensitive
sensitive anchor を含む leg → **期待**: 仮説出ない・選んでも feedback 記録なし（`dump()` で該当 leg に entry なし）。

### H) readOnly（過去 leg）
done 状態（2つ前以前）の leg → **期待**: 仮説出ない・選択不可（実績の器）。仮に選べても feedback 記録なし。

### I) re-selection stale（任意・上級）
仮説「電車」→「徒歩」選択（correction 記録）→ 直後に **「バス」** へ選び直し → `dump()`。
**期待**: feedback は `{correction, chosenMode:"walk"}` の**まま**（surfacedMode null で上書きされない）。
belief 上は bus が weight1（feedback.chosenMode=walk≠bus=stale→基準）。

---

## 6. PASS 基準
| 区分 | PASS 条件 |
|---|---|
| 本線 | A surface / B 訂正記録 / C 沈黙 / D 徒歩へ逆転（= ループが閉じている） |
| ガード | E confirmation 記録 / F cold-start 沈黙 / G sensitive 沈黙&非記録 / H readOnly 沈黙&非記録 |
| store 整合 | selectedMode=現在選択の正本 / hypothesisFeedback=文脈注釈（kind+surfacedMode+chosenMode・root version 1） |

## 7. closeout（smoke PASS 後）
- plan doc / MEMORY に v0 完了を記録。
- **main 着地は CEO 判断**（現状 branch `claude/second-self-map-v0`・未着地）。
- 次 Wave 1: L1(full belief/S2-B) → L2(correction 理由/S6) → L3(selective forgetting) → L4(cold-start pooling) → L5(context/weather)。
- v0-F mini design §9 の tuning 判断点（correction=2.0 / strength 閾値 / confirmation discount）は smoke 知見を踏まえ再検討可。
