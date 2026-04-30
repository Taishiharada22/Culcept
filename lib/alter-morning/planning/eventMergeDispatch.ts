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
      // 未解決 modify (target_ref なし or 解決失敗 + 複数 prior):
      //   fallback で kept_as_new (data loss 防止)
      pushNewWithRename(cur);
      dispatch.push({
        cur_event_id: cur.event_id,
        cur_turn_mode: "modify",
        action: "modify_unresolved_fallback_create",
      });
      return;
    }

    if (cur.turn_mode === "append") {
      // ── append: 新規追加。event_id 衝突時は rename (PR #41b-1b: data loss 防止) ──
      pushNewWithRename(cur);
      dispatch.push({
        cur_event_id: cur.event_id,
        cur_turn_mode: "append",
        action: "kept_as_new",
      });
      return;
    }

    // ── create: 同一性判定で prior にマッチさせ mergeIntoPriorCreate ──
    //   CEO 2026-04-29 指摘 (Commit A): position fallback **廃止**。
    //   旧 logic は length match (cur.length === prior.length) なら index で fallback merge していた。
    //   これが「新規追加した cur が既存 event と誤合流して上書き」 の真因。
    //   例: cur=[新ランチ], prior=[ミーティング] (length=1=1) → position 0 で fallback
    //       → mergeIntoPriorCreate(ミーティング, 新ランチ) → ミーティングの where が「新宿」 に上書き
    //
    //   新 logic: 厳密な同一性 (event_id OR (when, place_ref)) のみで merge。
    //   それ以外は kept_as_new で新規追加 → 上書き事故ゼロ化。
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
    // position fallback: 削除 (CEO 2026-04-29 directive D 完全実装)
    //   length match による position 合流は data loss/上書き risk が高すぎる。

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
      // 同一性なし → 新規追加 (event_id 衝突時は rename)
      pushNewWithRename(cur);
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
