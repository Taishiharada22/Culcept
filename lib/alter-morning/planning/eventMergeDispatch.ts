/**
 * Event merge dispatch — PR #41b-1a (CEO 2026-04-29)
 *
 * Goal:
 *   currentEvents (LLM 生 + guard 補正) と priorPersistedEvents を、
 *   各 event の **turn_mode に応じて dispatch** で merge する純関数。
 *
 *   旧 mergeEventFields (legacyAdapter) の課題:
 *     1. length mismatch (current.length !== prior.length) で **currentEvents を全 discard**
 *        → LLM が複数 events 出した場合 (append + 既存) でも 1 件に潰れる
 *     2. position fallback が turn_mode 不問で fire
 *        → modify event が「同 position の prior」 と誤合流する可能性
 *     3. mergeIntoPrior は「cur の null は prior 維持」 で intentional update を表現できない
 *        → modify (時間変更/移動手段変更) で cur の non-null を override したいが
 *          mergeIntoPrior の semantics は「null fill だけ受ける」 ので、
 *          「9時 → 10:00 に変更」 が反映されない (CEO Case 1 失敗の真因)
 *
 *   本 helper の責務:
 *     A. length-mismatch でも各 event を独立に処理 (discard 廃止)
 *     B. turn_mode 別 dispatch (modify / create / append)
 *     C. modify event は target を resolveTargetRef で特定し applyModifyPatch
 *     D. create event は既存 mergeIntoPrior 経路を維持 (position fallback は length match に限定)
 *     E. append event は新規追加 (PR #41b-1b で event_id 新規発行)
 *
 * 設計原則:
 *   - **pure**: 副作用なし、副作用は呼び出し側が decide
 *   - **observable**: dispatch[] で各 event の判断経路を返す (trace 用)
 *   - **conservative**: unresolved modify は fallback で create 扱い (data loss 防止)
 *   - **idempotent**: 同じ入力で同じ出力
 */

import type { Event } from "../comprehension/eventSchema";
import type { ModifyOperation } from "../comprehension/planOperation";
import { resolveTargetRef } from "./modifyRouter";
import {
  isSameEventCanonical,
  isFromCurrentUtterance,
  countNonEmptyCriticalSlots,
  utteranceImpliesDifferentPlace,
} from "./canonicalEventIdentity";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface MergeDispatchInput {
  currentEvents: Event[];
  priorPersistedEvents: Event[];
  /**
   * PR-50 Commit 12 (CEO 2026-04-30): current turn の utterance。
   *
   * 用途:
   *   priorEvents non-empty 時、create event が「current utterance 由来」 か
   *   「prior の re-extraction」 かを判定するため。re-extraction なら drop
   *   して duplicate を防ぐ。
   *
   *   省略時 (undefined): 既存挙動互換 (Commit 12 以前のテスト) のため、
   *   utterance チェックを skip して保守的に従来通り処理する。
   */
  utterance?: string;
}

/**
 * 各 cur event の dispatch 判断結果。trace に乗せて UX bug の真因 pin に使う。
 */
export interface MergeDispatchDecision {
  /** cur の元 event_id (LLM 生) */
  cur_event_id: string;
  cur_turn_mode: "create" | "append" | "modify";
  /**
   * 採用された経路:
   *   - "modify_applied": modify が target に解決され applyModifyPatch 適用
   *   - "modify_unresolved_fallback_create": target_ref 解決失敗 → create 扱い
   *   - "merged_into_prior": create が同一性判定で prior にマッチ → mergeIntoPrior
   *   - "kept_as_new": 同一性 / target なし、cur をそのまま新規 events として追加
   */
  action:
    | "modify_applied"
    | "modify_unresolved_fallback_create"
    | "modify_unresolved_dropped"
    | "merged_into_prior"
    | "kept_as_new"
    | "create_re_extraction_dropped"
    | "create_insufficient_slots_dropped";
  target_event_id?: string;
  /** modify resolveTargetRef.confidence (high/medium/low/null) */
  confidence?: string | null;
  /** modify resolveTargetRef.strategy */
  strategy?: string;
}

export interface MergeDispatchResult {
  /** merge 後の events (canonical truth、prior modified + new appended) */
  effectiveEvents: Event[];
  /** 各 cur event の dispatch 判断 (trace 用) */
  dispatch: MergeDispatchDecision[];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// applyModifyPatch — modify event の意図的 update を prior に適用
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * modify event (cur) の non-null フィールドを prior に **override** する
 * (intentional update セマンティクス、 mergeIntoPrior の null-fill とは異なる)。
 *
 * 規則 (CEO 2026-04-29 PR-46 hotfix):
 *   - **event_id**: prior 維持 (同一性 anchor の安定)
 *   - **turn_mode**: prior 維持 (= "create"、modify は apply 後消える)
 *   - **target_ref / target_ref_confidence / change_scope**: 解決済なので null 化
 *   - **when.startTime**: cur non-null なら override (CEO Case 1: 「9時を10時に変更」)
 *   - **when.timeHint**: cur non-null なら override
 *   - **transport**: cur non-null なら override (CEO Case 2: 「移動手段は車に変更」)
 *   - **where**: 常に prior 維持 (modify では where は touch しない)
 *   - **what**: 常に prior 維持 (modify では what は touch しない)
 *   - **who**: 常に prior 維持
 *   - **certainty**: cur non-null なら override
 *   - **missing_semantic_critical / missing_solver_blockers**: prior 維持
 *     (cur は modify partial output なので missing list は信頼できない)
 *
 * CEO 2026-04-29 設計判断 (where/what/who を override しない):
 *   modify event の cur.what / cur.where は「内部編集命令文字列」 が混入する
 *   ことが多い (e.g., LLM が cur.what.activity="9時を10時に変更" を出す)。
 *   これを prior.what に override すると plan_item.text に command 文字列が
 *   leak する。
 *
 *   現状の modify pattern は時刻変更 / 移動手段変更が主。場所変更や活動変更は
 *   将来 PR で別 pattern として扱う (e.g., change_scope='replace' で明示的に
 *   全 slot 置換、または「サドヤから新宿に」 を専用 pattern detect)。
 *
 *   CEO directive: 「modify command event は plan item 化しない。apply後の plan
 *   text は、変更後の予定内容だけにする」 → prior の plan item を維持する。
 *
 * 戻り値: 新しい Event オブジェクト (input は不変)。
 */
export function applyModifyPatch(prior: Event, cur: Event): Event {
  // when patch: cur の non-null を採用、両方 null なら prior 維持
  //   CEO 2026-04-29 PR #44: endTime も override 対象 (modify で「11時まで」 等を反映)
  const whenChanged =
    cur.when.startTime != null ||
    cur.when.timeHint != null ||
    (cur.when.endTime ?? null) != null;
  const newWhen = {
    startTime: cur.when.startTime ?? prior.when.startTime,
    endTime: (cur.when.endTime ?? null) ?? (prior.when.endTime ?? null),
    timeHint: cur.when.timeHint ?? prior.when.timeHint,
    provenance: whenChanged ? cur.when.provenance : prior.when.provenance,
  };

  // transport patch: cur.transport non-null なら override (CEO Case 2)
  const newTransport = cur.transport ?? prior.transport;

  // where / what / who: 常に prior 維持 (PR-46 text leak fix)
  //   modify event は cur に command 文字列が混入する可能性があるため、
  //   時刻 / 移動手段以外は touch しない。

  return {
    ...prior,
    event_id: prior.event_id,
    turn_mode: prior.turn_mode, // = "create" を維持
    target_ref: null, // modify 解決後 clear
    target_ref_confidence: null,
    change_scope: null,
    when: newWhen,
    where: prior.where, // PR-46: 常に prior 維持 (text leak 防止)
    what: prior.what, // PR-46: 常に prior 維持 (text leak 防止)
    who: prior.who, // PR-46: 常に prior 維持
    transport: newTransport,
    certainty: cur.certainty ?? prior.certainty,
    missing_semantic_critical: prior.missing_semantic_critical,
    missing_solver_blockers: prior.missing_solver_blockers,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// applyModifyPatchFromOperation — PlanOperation.modify を prior に適用
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * `applyModifyPatch(prior, cur: Event)` の operation 版 sibling。
 *
 * CEO 2026-04-30 PR-50 Commit 4:
 *   既存 `applyModifyPatch` は `cur: Event` を取る (turn_mode / target_ref 等を持つ)。
 *   `PlanOperation.modify` は `targetRef: string` + `patch: EventPatch` の組で、
 *   Event 型ではない。両者の橋渡しを本関数で行う。
 *
 * 適用範囲 (Commit 4 暫定制限):
 *   - **when.startTime / endTime / timeHint**: patch.when 経由で override
 *   - **transport**: patch.transport 経由で override
 *   - **where / what / who**: prior 維持 (touch しない)
 *
 * なぜ where / what / who を touch しないか (PR-46 contract):
 *   modify event の patch.what / patch.where に LLM が **編集命令文字列**
 *   を入れがち (e.g., patch.what.activity="9時を10時に変更")。これを prior に
 *   override すると plan_item.text に command 文字列が leak する。
 *   既存 applyModifyPatch (cur: Event 版) も同 contract で touch しない。
 *
 * 将来拡張 (Commit 4 では未実装):
 *   - 「サドヤから新宿に変更」 のような場所変更を扱う場合、change_scope='replace'
 *     を schema 層で導入し、where override を **明示的選択肢** として patch に渡す
 *   - 同様に what / who 変更も明示的 scope で扱う
 *   - 現状: PlanOperation.modify の patch は当層で when / transport のみ通す
 *
 * 戻り値: 新しい Event オブジェクト (prior は不変)。
 */
export function applyModifyPatchFromOperation(
  prior: Event,
  op: ModifyOperation,
): Event {
  const whenPatch = op.patch.when;
  const newStartTime = whenPatch?.startTime ?? prior.when.startTime;
  const newEndTime =
    whenPatch?.endTime !== undefined && whenPatch.endTime !== null
      ? whenPatch.endTime
      : (prior.when.endTime ?? null);
  const newTimeHint = whenPatch?.timeHint ?? prior.when.timeHint;
  const whenChanged =
    (whenPatch?.startTime != null) ||
    (whenPatch?.endTime != null) ||
    (whenPatch?.timeHint != null);
  const newWhen = {
    startTime: newStartTime,
    endTime: newEndTime,
    timeHint: newTimeHint,
    // patch.when.provenance は EventPatch 型に存在しないので、prior の provenance
    // を維持する。明示変更を反映する場合は将来 patch に provenance を載せる。
    provenance: whenChanged ? prior.when.provenance : prior.when.provenance,
  };

  // transport: patch.transport が string なら override、undefined なら prior 維持
  //   `op.patch.transport` の型は `string | null | undefined`。null は parser が
  //   omit して undefined にする (parsePlanOperations) ため、ここは string のみ
  //   override 対象として扱う。
  const newTransport =
    typeof op.patch.transport === "string"
      ? op.patch.transport
      : prior.transport;

  return {
    ...prior,
    event_id: prior.event_id,
    turn_mode: prior.turn_mode,
    // target_ref / target_ref_confidence / change_scope: 解決後 clear
    target_ref: null,
    target_ref_confidence: null,
    change_scope: null,
    when: newWhen,
    // PR-46 contract: where / what / who は prior 維持 (text leak 防止)
    //   将来 PR で change_scope='replace' を導入する場合、ここで分岐する。
    where: prior.where,
    what: prior.what,
    who: prior.who,
    transport: newTransport,
    certainty: prior.certainty,
    missing_semantic_critical: prior.missing_semantic_critical,
    missing_solver_blockers: prior.missing_solver_blockers,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// mergeIntoPrior — create event の null-fill merge (既存路、再 export)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * create event の null-fill merge (既存 mergeIntoPrior と同じ semantics)。
 *
 * 規則:
 *   - cur.X non-null → 採用
 *   - cur.X null → prior 維持 (defensive、partial event 防御)
 *   - priorWhereLocked → where 完全保持 (where lock 尊重)
 *
 * これは applyModifyPatch とは異なる「保守的 merge」。
 * 別ファイルに extract せず、本 dispatch helper 内に複製する
 * (legacyAdapter.ts の mergeIntoPrior を直接 import すると循環参照リスクあり、
 * かつ applyModifyPatch との対比が明確になる)。
 */
export function mergeIntoPriorCreate(prior: Event, cur: Event): Event {
  const priorWhereLocked = prior.where.placeType === "exact_proper_noun";

  const startTime = cur.when.startTime ?? prior.when.startTime;
  const activity =
    cur.what.activity && cur.what.activity.length > 0
      ? cur.what.activity
      : prior.what.activity;
  const activityCanonical =
    cur.what.activityCanonical && cur.what.activityCanonical.length > 0
      ? cur.what.activityCanonical
      : prior.what.activityCanonical;

  const mergedWhere = priorWhereLocked
    ? prior.where
    : {
        place_ref: cur.where.place_ref ?? prior.where.place_ref,
        placeType: cur.where.placeType ?? prior.where.placeType,
        coordinates: cur.where.coordinates ?? prior.where.coordinates,
        provenance:
          cur.where.place_ref != null || cur.where.coordinates != null
            ? cur.where.provenance
            : prior.where.provenance,
      };

  return {
    ...prior,
    event_id: prior.event_id,
    turn_mode: cur.turn_mode ?? prior.turn_mode,
    target_ref: cur.target_ref ?? prior.target_ref,
    target_ref_confidence:
      cur.target_ref_confidence ?? prior.target_ref_confidence,
    change_scope: cur.change_scope ?? prior.change_scope,
    when: {
      startTime,
      timeHint: cur.when.timeHint ?? prior.when.timeHint,
      provenance:
        cur.when.startTime != null
          ? cur.when.provenance
          : prior.when.provenance,
    },
    where: mergedWhere,
    what: {
      activity,
      activityCanonical,
      provenance:
        cur.what.activity && cur.what.activity.length > 0
          ? cur.what.provenance
          : prior.what.provenance,
    },
    who: cur.who.length > 0 ? cur.who : prior.who,
    transport: cur.transport ?? prior.transport,
    certainty: cur.certainty ?? prior.certainty,
    missing_semantic_critical: prior.missing_semantic_critical,
    missing_solver_blockers: prior.missing_solver_blockers,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers (event_id 衝突回避 — PR #41b-1b)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * event_id の衝突を回避する fresh id 発行 (PR #41b-1b)。
 *
 * 既存 events の event_id と衝突しないように `event_${N}` 形式で新 id を生成。
 *   1. 既存 ids に `event_${n}` と一致するものを 1 から順に試す
 *   2. 衝突しない最小 N を返す
 *
 * 用途:
 *   append event (or kept_as_new) の event_id が priorCopy / 他 newEvents と
 *   衝突する場合、data 上書きを防ぐため新 id に rename する。
 *
 * 例:
 *   existing ids = ["event_1", "event_2"] → return "event_3"
 *   existing ids = ["event_1", "event_3"] → return "event_2"
 *   existing ids = []                       → return "event_1"
 */
export function generateNonCollidingEventId(
  existing: ReadonlyArray<Event>,
): string {
  const ids = new Set(existing.map((e) => e.event_id));
  let n = 1;
  while (ids.has(`event_${n}`)) n++;
  return `event_${n}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Public API — dispatchEventMerge
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 各 cur event を turn_mode で dispatch して merge する。
 *
 * 動作:
 *   1. priorPersistedEvents を mutable copy として保持 (modify で patch、create でも replace)
 *   2. cur events を順に処理:
 *      - modify: resolveTargetRef → 解決 event を applyModifyPatch
 *        解決失敗 → fallback で newEvents に追加 (create 扱い)
 *      - create: 同一性判定 (event_id, then time+place, then position fallback if length match)
 *                マッチあり → mergeIntoPriorCreate でprior を update
 *                マッチなし → newEvents に追加 (PR #41b-1b で append として扱う)
 *      - append: そのまま newEvents に追加 (PR #41b-1b で event_id 新規発行)
 *   3. 結果: priorCopy (modified) + newEvents (新規追加分)
 *
 * 例外処理:
 *   - currentEvents 空 → priorPersistedEvents 全部返す (既存 contract 維持)
 *   - priorPersistedEvents 空 → currentEvents 全部返す (新規 plan の初回 turn)
 */
export function dispatchEventMerge(
  input: MergeDispatchInput,
): MergeDispatchResult {
  const { currentEvents, priorPersistedEvents, utterance } = input;

  // 空配列 short-circuit
  if (currentEvents.length === 0) {
    return { effectiveEvents: priorPersistedEvents, dispatch: [] };
  }
  if (priorPersistedEvents.length === 0) {
    // 初回 turn or prior 不在: cur を全て kept_as_new として扱う
    return {
      effectiveEvents: currentEvents,
      dispatch: currentEvents.map((cur) => ({
        cur_event_id: cur.event_id,
        cur_turn_mode: cur.turn_mode,
        action: "kept_as_new" as const,
      })),
    };
  }

  // priorCopy: modify で patch される / create で replace される mutable list
  const priorCopy: Event[] = [...priorPersistedEvents];
  const newEvents: Event[] = [];
  const dispatch: MergeDispatchDecision[] = [];

  // CEO 2026-04-29 Commit A: position fallback 廃止のため lengthMatch 不要に。

  /**
   * cur を newEvents に push する直前に event_id 衝突を検査し、
   * 衝突する場合は fresh id にrename する (PR #41b-1b: data loss 防止)。
   *
   * 衝突 chk 対象: priorCopy + 現時点の newEvents (両方を見て fresh id 発行)
   *
   * 戻り値: rename された (or 元のままの) Event。dispatch.push 側で
   * effective_event_id を記録する用途で caller が利用。
   */
  const pushNewWithRename = (cur: Event): Event => {
    const idCollides = [...priorCopy, ...newEvents].some(
      (e) => e.event_id === cur.event_id,
    );
    const finalEvent = idCollides
      ? {
          ...cur,
          event_id: generateNonCollidingEventId([...priorCopy, ...newEvents]),
        }
      : cur;
    newEvents.push(finalEvent);
    return finalEvent;
  };

  currentEvents.forEach((cur, idx) => {
    if (cur.turn_mode === "modify") {
      // ── modify: resolveTargetRef → applyModifyPatch ──
      if (cur.target_ref) {
        const resolution = resolveTargetRef(cur.target_ref, priorCopy);
        if (resolution.event_id) {
          const targetIdx = priorCopy.findIndex(
            (e) => e.event_id === resolution.event_id,
          );
          if (targetIdx >= 0) {
            priorCopy[targetIdx] = applyModifyPatch(priorCopy[targetIdx], cur);
            dispatch.push({
              cur_event_id: cur.event_id,
              cur_turn_mode: "modify",
              action: "modify_applied",
              target_event_id: resolution.event_id,
              confidence: resolution.confidence,
              strategy: resolution.strategy,
            });
            return;
          }
        }
        // resolveTargetRef が解決できなかった場合の最終手段:
        // CEO 2026-04-29 single event fallback —
        //   priorCopy.length === 1 なら、target_ref 文字列が無くても
        //   その単一 event を target と推定 (e.g., 「今日の予定」「それ」 等)。
        //   medium confidence で apply、CEO Case 2 (移動手段変更) で重要。
        if (priorCopy.length === 1) {
          priorCopy[0] = applyModifyPatch(priorCopy[0], cur);
          dispatch.push({
            cur_event_id: cur.event_id,
            cur_turn_mode: "modify",
            action: "modify_applied",
            target_event_id: priorCopy[0].event_id,
            confidence: "medium",
            strategy: "single_event_fallback",
          });
          return;
        }
      }
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // PR-50 Commit 12 (CEO 2026-04-30): unsafe fallback 廃止
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 旧挙動: 未解決 modify を kept_as_new で新規 event 化 (data loss 防止)
      // 真因 (CEO Preview 2026-04-30):
      //   LLM が「移動は車に変更」 を target_ref="移動" で 2 件 modify として
      //   出力 → resolveTargetRef が「移動」 という event を見つけられず失敗
      //   → 旧挙動で 2 件が ghost event (event_4 / event_5) として persist
      //   → plan に「[時間未確定] [内容暫定]」 が増殖
      //
      // 新挙動: 未解決 modify は **drop** (state 不変)
      //   - ghost event を作らない
      //   - user の意図 (transport 変更等) は別経路で拾う:
      //     * Commit 7 deterministic synth (utterance pattern) で transport modify
      //       を生成 (= 失敗しない)
      //     * 万一 deterministic も hit しなければ user は再発話 (UX 上は
      //       duplicate 増殖よりはるかに mash)
      //
      // CEO 確定 (2026-04-30):
      //   "失敗した modify は絶対に新規予定として保存しない"
      dispatch.push({
        cur_event_id: cur.event_id,
        cur_turn_mode: "modify",
        action: "modify_unresolved_dropped",
      });
      return;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // PR-50 Commit 12 (CEO 2026-04-30): create / append 共通の strict 経路
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 旧挙動 (PR #41b-1b 以前):
    //   - create: 厳密な同一性 (event_id OR 完全一致 (when, place_ref)) → merge
    //             それ以外 → kept_as_new
    //   - append: 全件 kept_as_new
    //
    // 真因 (CEO Preview 2026-04-30):
    //   - LLM の raw place_ref ("スタバ") と persisted resolved
    //     ("スターバックス コーヒー SHIBUYA TSUTAYA 2F店") は完全一致しない
    //     → 同じ予定なのに kept_as_new で duplicate
    //   - 「12時に新宿でランチ」 turn 5 で LLM が prior 4 件を re-extraction
    //     → 全部 duplicate 化 + 新 append も混じり 8 件に増殖
    //
    // 新挙動 (4 段階判定):
    //   1. canonical identity match → mergeIntoPriorCreate
    //      (when 一致 + activity 一致 + (place_ref / coordinates / exact_proper_noun
    //       包含) の厳格判定。substring 単独は禁止)
    //   2. priorEvents non-empty + current utterance 由来でない → drop
    //      (= LLM の prior re-extraction 検出)
    //   3. when/where/what が 2 slot 未満 → drop (中身が空に近い event は弾く)
    //   4. それ以外 → 本物の append として kept_as_new
    //
    // append vs create の区別は本層では削除 (両方同じ判定)。
    // CEO 確定 (2026-04-30):
    //   "events[] fallback は安全な append だけを通す"

    // 1. canonical identity match (Commit 12 強化)
    //    既存 priorCopy のいずれかと canonical 同一なら mergeIntoPriorCreate。
    //
    //    旧コード (PR #41b-1a): event_id 一致を優先 check していたが、CEO Case 3
    //    + collision (LLM が prior と同じ event_id を出す) で誤 merge する不具合
    //    あり。新コードは canonical identity (when + activity + place) のみで判定し、
    //    event_id 一致は collision case として pushNewWithRename で処理する。
    //
    //    PR-50 Commit 12.1 (CEO 2026-04-30): 条件 D (片方 null 救済) match で、
    //    かつ utterance が新 place を強く示唆する場合は merge を **skip** して
    //    本物 append として処理続行する。
    //    例: prior=「09:00 サドヤ コーヒー」 + cur=「12:00 null ランチ」 +
    //        utterance=「12時に新宿でランチ」 → utterance に "新宿" が出現し
    //        prior の "サドヤ" と異なる → merge skip → 別予定 append。
    const priorMatchIdx = priorCopy.findIndex((p) =>
      isSameEventCanonical(p, cur),
    );
    if (priorMatchIdx >= 0 && priorMatchIdx < priorCopy.length) {
      const matched = priorCopy[priorMatchIdx];
      // 条件 D match (cur.where.place_ref === null + matched が confident) で
      // utterance が新 place を示唆 → merge skip
      const isPartialMatch =
        cur.where.place_ref === null && matched.where.place_ref !== null;
      const utteranceSignalsDifferentPlace =
        isPartialMatch &&
        utterance !== undefined &&
        matched.where.place_ref !== null &&
        utteranceImpliesDifferentPlace(utterance, matched.where.place_ref);
      if (!utteranceSignalsDifferentPlace) {
        priorCopy[priorMatchIdx] = mergeIntoPriorCreate(
          priorCopy[priorMatchIdx],
          cur,
        );
        dispatch.push({
          cur_event_id: cur.event_id,
          cur_turn_mode: cur.turn_mode === "append" ? "append" : "create",
          action: "merged_into_prior",
          target_event_id: priorCopy[priorMatchIdx].event_id,
        });
        return;
      }
      // utterance signals different place → 条件 D match を skip して
      // 続く judgment へ進む (utterance 由来 / slot count / kept_as_new)
    }

    // 2. priorEvents non-empty + current utterance 由来でない → drop
    //    (LLM の prior re-extraction を検出して duplicate を防ぐ)
    //    utterance が undefined (= caller が指定しない) なら check skip (互換性)
    if (priorCopy.length > 0 && utterance !== undefined) {
      if (!isFromCurrentUtterance(cur, utterance)) {
        dispatch.push({
          cur_event_id: cur.event_id,
          cur_turn_mode: cur.turn_mode === "append" ? "append" : "create",
          action: "create_re_extraction_dropped",
        });
        return;
      }
    }

    // 3. when/where/what で 2 slot 未満 non-empty → drop
    //    中身が空に近い event を新規追加しない (defensive)
    if (countNonEmptyCriticalSlots(cur) < 2) {
      dispatch.push({
        cur_event_id: cur.event_id,
        cur_turn_mode: cur.turn_mode === "append" ? "append" : "create",
        action: "create_insufficient_slots_dropped",
      });
      return;
    }

    // 4. 本物の append として kept_as_new (event_id 衝突時は rename)
    pushNewWithRename(cur);
    dispatch.push({
      cur_event_id: cur.event_id,
      cur_turn_mode: cur.turn_mode === "append" ? "append" : "create",
      action: "kept_as_new",
    });
  });

  return {
    effectiveEvents: [...priorCopy, ...newEvents],
    dispatch,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// dedupCanonicalEvents — PR-50 Commit 14 (CEO 2026-04-30)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * events 配列内の **同一 canonical event** を 1 件に統合する dedup pass。
 *
 * 設計原則 (CEO 2026-04-30):
 *   合言葉: 「増殖は止める。でも、本物の別予定は潰さない」
 *
 *   merge 条件 (isSameEventCanonical で判定):
 *     - same startTime
 *     - same activity
 *     - same place identity (place_ref 完全一致 / coordinates 近接 /
 *       exact_proper_noun 包含 / 片方 null + confident 救済)
 *
 *   保護される「本物の別予定」 (merge されない):
 *     - different startTime (例: 10:00 スタバ + 12:00 スタバ → 別予定)
 *     - different place (例: 10:00 スタバ + 10:00 サドヤ → 別予定)
 *     - different activity (例: 10:00 スタバ コーヒー + 10:00 スタバ ランチ → 別予定)
 *
 * merge 方向 (CEO + GPT 確定 2026-04-30):
 *   **base (= 先にある event) を維持**、後から来た duplicate から non-null
 *   情報だけ補完。これにより:
 *     - event_id は base 維持 → capturedHistory / dialogState.focus.event_id
 *       の参照が壊れない
 *     - place は exact_proper_noun / coordinates ありが優先される
 *       (mergeIntoPriorCreate の priorWhereLocked + cur non-null 採用ロジック
 *       により自然に達成)
 *     - transport は non-null を優先 (mergeIntoPriorCreate の cur.transport ?? prior.transport)
 *
 * 用途 (legacyAdapter.ts Commit 14 invariant pass):
 *   effectiveEvents 構築直後に呼び出す。dispatchEventMerge の中で発生する
 *   merge とは別レイヤ (= 後段の独立 invariant 修復)。
 *
 *   既存 polluted session に同一 canonical の event が複数存在する場合、
 *   ここで 1 件に統合して plan UI の duplicate 表示を防ぐ。
 *
 *   different startTime をまたぐ merge は **行わない** (CEO 確定 2026-04-30)。
 *   それは future PR の scope (本物別予定を潰すリスクが高い)。
 *
 * pure: 副作用なし、新配列を返す。
 *
 * 計算量: O(n²) だが events 件数は通常 n ≤ 10 程度なので実用上問題なし。
 */
export function dedupCanonicalEvents(events: Event[]): Event[] {
  const result: Event[] = [];
  for (const ev of events) {
    const matchIdx = result.findIndex((r) => isSameEventCanonical(r, ev));
    if (matchIdx >= 0) {
      // base (result[matchIdx]) を維持し、ev (duplicate) から non-null 情報を
      // 補完する。mergeIntoPriorCreate(prior, cur) で:
      //   - event_id: prior 維持
      //   - startTime / activity: 同一性前提で同じ値
      //   - where: priorWhereLocked (= prior が exact_proper_noun) なら prior 完全保持、
      //            それ以外は cur の non-null を採用 (= cur が exact_proper_noun なら
      //            それを優先する効果)
      //   - coordinates: cur.where.coordinates ?? prior.where.coordinates (non-null 優先)
      //   - transport: cur.transport ?? prior.transport (non-null 優先)
      result[matchIdx] = mergeIntoPriorCreate(result[matchIdx], ev);
    } else {
      result.push(ev);
    }
  }
  return result;
}
