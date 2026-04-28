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
import { resolveTargetRef } from "./modifyRouter";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface MergeDispatchInput {
  currentEvents: Event[];
  priorPersistedEvents: Event[];
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
    | "merged_into_prior"
    | "kept_as_new";
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
 * 規則 (CEO 2026-04-29):
 *   - **event_id**: prior 維持 (同一性 anchor の安定)
 *   - **turn_mode**: prior 維持 (= "create"、modify は apply 後消える)
 *   - **target_ref / target_ref_confidence / change_scope**: 解決済なので null 化
 *   - **when.startTime**: cur non-null なら override (CEO Case 1: 「9時を10時に変更」)
 *   - **when.timeHint**: cur non-null なら override
 *   - **where.place_ref**: cur non-null なら override
 *     priorWhereLocked (exact_proper_noun) でも、modify は user 明示なので尊重し
 *     override する (e.g., 「サドヤから新宿に変更」)
 *   - **what.activity**: cur non-empty なら override
 *   - **transport**: cur non-null なら override (CEO Case 2: 「移動手段は車に変更」)
 *   - **who**: cur non-empty なら override
 *   - **certainty**: cur non-null なら override
 *   - **missing_semantic_critical / missing_solver_blockers**: prior 維持
 *     (cur は modify partial output なので missing list は信頼できない)
 *
 * 戻り値: 新しい Event オブジェクト (input は不変)。
 */
export function applyModifyPatch(prior: Event, cur: Event): Event {
  // when patch: cur の non-null を採用、両方 null なら prior 維持
  const whenChanged = cur.when.startTime != null || cur.when.timeHint != null;
  const newWhen = {
    startTime: cur.when.startTime ?? prior.when.startTime,
    timeHint: cur.when.timeHint ?? prior.when.timeHint,
    provenance: whenChanged ? cur.when.provenance : prior.when.provenance,
  };

  // where patch: cur.place_ref non-null なら override (lock を尊重しつつも override)
  //   理由: modify は user の明示的意図なので、prior が exact_proper_noun でも
  //   user が「変更する」と言ったら従う。
  const newWhere =
    cur.where.place_ref != null
      ? {
          place_ref: cur.where.place_ref,
          placeType: cur.where.placeType ?? prior.where.placeType,
          coordinates: cur.where.coordinates ?? prior.where.coordinates,
          provenance: cur.where.provenance,
        }
      : prior.where;

  // what patch: cur.activity non-empty なら override
  const newWhat =
    cur.what.activity && cur.what.activity.length > 0
      ? {
          activity: cur.what.activity,
          activityCanonical: cur.what.activityCanonical || cur.what.activity,
          provenance: cur.what.provenance,
        }
      : prior.what;

  // transport patch: cur.transport non-null なら override (CEO Case 2)
  const newTransport = cur.transport ?? prior.transport;

  // who patch: cur.who non-empty なら override
  const newWho = cur.who.length > 0 ? cur.who : prior.who;

  return {
    ...prior,
    event_id: prior.event_id,
    turn_mode: prior.turn_mode, // = "create" を維持
    target_ref: null, // modify 解決後 clear
    target_ref_confidence: null,
    change_scope: null,
    when: newWhen,
    where: newWhere,
    what: newWhat,
    who: newWho,
    transport: newTransport,
    certainty: cur.certainty ?? prior.certainty,
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
  const { currentEvents, priorPersistedEvents } = input;

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

  const lengthMatch = currentEvents.length === priorPersistedEvents.length;

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
      }
      // 未解決 modify: fallback で create 扱い (data loss 防止)
      newEvents.push(cur);
      dispatch.push({
        cur_event_id: cur.event_id,
        cur_turn_mode: "modify",
        action: "modify_unresolved_fallback_create",
      });
      return;
    }

    if (cur.turn_mode === "append") {
      // ── append: そのまま新規追加 (PR #41b-1b で event_id 新規発行) ──
      newEvents.push(cur);
      dispatch.push({
        cur_event_id: cur.event_id,
        cur_turn_mode: "append",
        action: "kept_as_new",
      });
      return;
    }

    // ── create: 同一性判定で prior にマッチさせ mergeIntoPriorCreate ──
    let priorMatchIdx = priorCopy.findIndex((p) => p.event_id === cur.event_id);
    if (
      priorMatchIdx < 0 &&
      cur.when.startTime != null &&
      cur.where.place_ref != null
    ) {
      priorMatchIdx = priorCopy.findIndex(
        (p) =>
          p.when.startTime === cur.when.startTime &&
          p.where.place_ref === cur.where.place_ref,
      );
    }
    // position fallback: turn_mode="create" + length match に限定 (CEO directive D)
    if (priorMatchIdx < 0 && lengthMatch) {
      priorMatchIdx = idx;
    }

    if (priorMatchIdx >= 0 && priorMatchIdx < priorCopy.length) {
      priorCopy[priorMatchIdx] = mergeIntoPriorCreate(
        priorCopy[priorMatchIdx],
        cur,
      );
      dispatch.push({
        cur_event_id: cur.event_id,
        cur_turn_mode: "create",
        action: "merged_into_prior",
        target_event_id: priorCopy[priorMatchIdx].event_id,
      });
    } else {
      // 同一性なし → 新規追加
      newEvents.push(cur);
      dispatch.push({
        cur_event_id: cur.event_id,
        cur_turn_mode: "create",
        action: "kept_as_new",
      });
    }
  });

  return {
    effectiveEvents: [...priorCopy, ...newEvents],
    dispatch,
  };
}
