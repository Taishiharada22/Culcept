/**
 * Plan Editor — 既存プランに対する編集操作を解析・適用する
 *
 * ユーザーがプラン提示後に送るメッセージを解析して、
 * 追加・削除・時間変更・開始時間変更・差し替えを適用する。
 *
 * 設計原則:
 * - 編集メッセージは宣言型（「〜の後にスタバでミーティング」）も命令型（「ランチを削除して」）も対応
 * - アンカー（「〜の後」「〜の前」）を検出して挿入位置を特定
 * - 既存アイテムとのファジーマッチで対象を特定
 * - 編集できなかった場合は具体的なエラーメッセージを返す
 */

import type { PlanItem, MorningPlan } from "./types";
import { parseIntent, intentToPlanItems } from "./intentParser";
import { parseUserInput } from "./planningEngine";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 編集操作の型
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface EditResult {
  /** 編集が適用されたか */
  applied: boolean;
  /** 編集後のアイテム一覧（travel 除外済み） */
  items: PlanItem[];
  /** ユーザーへの応答メッセージ */
  message: string;
  /** 検出された編集操作 */
  operations: EditOperation[];
}

interface EditOperation {
  type: "add" | "remove" | "modify_duration" | "modify_start" | "replace";
  target?: string;
  detail: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 編集パターン検出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 削除要求 */
const REMOVE_PATTERNS = [
  /(.+?)を?(やめ|なくし|外し|削除|取り消|キャンセル|いらない|なし)/,
  /(やめ|なくし|外し|削除|取り消|キャンセル)(?:て|して|する)?\s*[:：]?\s*(.+)/,
];

/** 開始時間変更 */
const START_TIME_CHANGE_RE =
  /(.+?)を?\s*(?:(\d{1,2})(?::(\d{2}))?時?(?:から|開始|スタート)|(\d{1,2})(?::(\d{2}))?時?に(?:変更|する|して))/;

/** 所要時間変更 */
const DURATION_CHANGE_RE =
  /(.+?)を?\s*(\d+)\s*(?:分|時間)(くらい|ぐらい|程度)?に(?:変更|する|して|短く|長く)?/;

/** アンカー（挿入位置） */
const ANCHOR_AFTER_RE =
  /(.+?)(?:が|の)?(?:終わったら|の?後(?:に|で|は)?|が済んだら|してから)/;
const ANCHOR_BEFORE_RE =
  /(.+?)(?:の)?前に/;

/** 順序変更 */
const REORDER_RE =
  /(.+?)を?(?:先|最初)にして/;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ファジーマッチ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ユーザーの参照テキストと既存プランアイテムをファジーマッチする。
 * 「田中さんとの食事」→「田中さんとランチ」等のゆらぎを吸収する。
 */
function fuzzyMatchItem(reference: string, items: PlanItem[]): PlanItem | null {
  const ref = reference.trim().replace(/[のを。、]/g, "");
  if (!ref) return null;

  // 完全一致
  const exact = items.find(i => i.text === ref);
  if (exact) return exact;

  // 部分一致（参照がアイテム名に含まれる or 逆）
  const partial = items.find(i =>
    i.text.includes(ref) || ref.includes(i.text)
  );
  if (partial) return partial;

  // キーワードマッチ（参照の主要語がアイテム名に含まれる）
  const keywords = ref
    .replace(/さん|くん|ちゃん|との?|する|した|して|に行く|に行って/g, "")
    .split(/\s+/)
    .filter(w => w.length >= 2);
  if (keywords.length > 0) {
    const keywordMatch = items.find(i =>
      keywords.some(kw => i.text.includes(kw))
    );
    if (keywordMatch) return keywordMatch;
  }

  // withWhom マッチ（「田中さん」→ withWhom === "田中さん"）
  const nameMatch = ref.match(/(.+?)(?:さん|くん|ちゃん)/);
  if (nameMatch) {
    const name = nameMatch[0];
    const byWhom = items.find(i => i.withWhom?.includes(name) || i.text.includes(name));
    if (byWhom) return byWhom;
  }

  // 食事系のシノニム
  const mealSynonyms = ["ランチ", "食事", "ご飯", "ごはん", "ディナー", "昼食", "夕食", "朝食"];
  const refHasMeal = mealSynonyms.some(s => ref.includes(s));
  if (refHasMeal) {
    const mealItem = items.find(i => mealSynonyms.some(s => i.text.includes(s)));
    if (mealItem) return mealItem;
  }

  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// メインのプラン編集関数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function applyPlanEdit(message: string, plan: MorningPlan): EditResult {
  const operations: EditOperation[] = [];
  // travel 以外のアイテムを作業用コピー
  let items = plan.items.filter(i => i.kind !== "travel").map(i => ({ ...i }));
  let applied = false;

  // ── 1. 削除検出 ──
  for (const pattern of REMOVE_PATTERNS) {
    const m = message.match(pattern);
    if (m) {
      const targetRef = (m[1] || m[2]).trim();
      const target = fuzzyMatchItem(targetRef, items);
      if (target) {
        items = items.filter(i => i.id !== target.id);
        operations.push({ type: "remove", target: target.text, detail: `「${target.text}」を削除` });
        applied = true;
      }
      break;
    }
  }

  // ── 2. 開始時間変更検出 ──
  const startM = message.match(START_TIME_CHANGE_RE);
  if (startM) {
    const targetRef = startM[1].trim();
    const hour = startM[2] || startM[4];
    const min = startM[3] || startM[5] || "00";
    const target = fuzzyMatchItem(targetRef, items);
    if (target && hour) {
      const newTime = `${hour.padStart(2, "0")}:${min.padStart(2, "0")}`;
      target.startTime = newTime;
      if (target.kind === "todo") target.kind = "fixed";
      operations.push({ type: "modify_start", target: target.text, detail: `「${target.text}」を${newTime}開始に変更` });
      applied = true;
    }
  }

  // ── 3. 所要時間変更検出 ──
  const durM = message.match(DURATION_CHANGE_RE);
  if (durM) {
    const targetRef = durM[1].trim();
    const durStr = durM[2];
    const target = fuzzyMatchItem(targetRef, items);
    if (target && durStr) {
      const isHour = message.includes("時間");
      const newDur = isHour ? parseInt(durStr) * 60 : parseInt(durStr);
      target.durationMin = newDur;
      operations.push({ type: "modify_duration", target: target.text, detail: `「${target.text}」を${newDur}分に変更` });
      applied = true;
    }
  }

  // ── 4. 順序変更検出 ──
  const reorderM = message.match(REORDER_RE);
  if (reorderM) {
    const targetRef = reorderM[1].trim();
    const target = fuzzyMatchItem(targetRef, items);
    if (target) {
      items = items.filter(i => i.id !== target.id);
      items.unshift(target);
      operations.push({ type: "replace", target: target.text, detail: `「${target.text}」を最初に移動` });
      applied = true;
    }
  }

  // ── 5. アンカー付き追加検出（「〜の後に X して Y して」） ──
  const anchorAfterM = message.match(ANCHOR_AFTER_RE);
  const anchorBeforeM = !anchorAfterM ? message.match(ANCHOR_BEFORE_RE) : null;

  if (anchorAfterM || anchorBeforeM) {
    const anchorRef = (anchorAfterM?.[1] || anchorBeforeM?.[1] || "").trim();
    const anchorItem = fuzzyMatchItem(anchorRef, items);

    if (anchorItem) {
      // アンカー以降のテキストから新しいアイテムを抽出
      const anchorPattern = anchorAfterM?.[0] || anchorBeforeM?.[0] || "";
      const restText = message.substring(message.indexOf(anchorPattern) + anchorPattern.length).trim();

      if (restText) {
        const newItemsFromRest = extractNewItems(restText);
        if (newItemsFromRest.length > 0) {
          const anchorIdx = items.findIndex(i => i.id === anchorItem.id);
          const insertIdx = anchorAfterM ? anchorIdx + 1 : anchorIdx;
          items.splice(insertIdx, 0, ...newItemsFromRest);
          for (const ni of newItemsFromRest) {
            operations.push({ type: "add", detail: `「${ni.text}」を「${anchorItem.text}」の${anchorAfterM ? "後" : "前"}に追加` });
          }
          applied = true;
        }
      }
    }
  }

  // ── 6. アンカーなしの追加（新しいアイテムが含まれているが位置指定なし） ──
  if (!applied) {
    const newItemsFromFull = extractNewItems(message);
    // 既存アイテムとの重複を除外
    const existingTexts = new Set(items.map(i => i.text));
    const genuinelyNew = newItemsFromFull.filter(ni => !existingTexts.has(ni.text));

    if (genuinelyNew.length > 0) {
      items.push(...genuinelyNew);
      for (const ni of genuinelyNew) {
        operations.push({ type: "add", detail: `「${ni.text}」を追加` });
      }
      applied = true;
    }
  }

  // ── 応答メッセージ構築 ──
  let msg: string;
  if (!applied) {
    msg = "どこを変えたい？\n・タスクの追加や削除\n・開始時間の変更\n・時間の長さ\n・順番の入れ替え\nなんでも言ってね。";
  } else {
    const summaryParts = operations.map(op => op.detail);
    msg = summaryParts.join("、") + "。\nこれでどう？";
  }

  return { applied, items, message: msg, operations };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 差分追加 — 2回目入力の保証付き差分追加
//
// CEO方針:
// - 全量再パース禁止
// - 既存アイテムは壊さず、anchor item の後ろにだけ挿入する
// - 「田中さんとの食事が終わったら〜」のような文は既存の食事アイテムを
//   anchor にして後続追加する
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface DifferentialAddResult {
  /** 追加が成功したか */
  applied: boolean;
  /** 既存 + 新規アイテム（travel 除外済み。既存アイテムは不変） */
  items: PlanItem[];
  /** ユーザーへの応答メッセージ */
  message: string;
  /** アンカーに使用されたアイテム（デバッグ用） */
  anchorItem?: PlanItem;
  /** 追加されたアイテム数 */
  addedCount: number;
}

/**
 * 2回目以降のユーザー入力を既存プランへ差分追加する。
 *
 * 保証:
 * - 既存アイテムは一切変更しない（id, text, duration, startTime 全て不変）
 * - 新しい入力のみをパースし、新規 PlanItem を生成
 * - アンカー参照（「食事の後に」「ミーティングが終わったら」）を検出し、
 *   対応する既存アイテムの直後に挿入
 * - アンカーがない場合は末尾に追加
 * - 全量再パースは行わない
 */
export function addDifferentialItems(
  message: string,
  plan: MorningPlan,
  sourceTurnIndex: number,
): DifferentialAddResult {
  // 既存アイテム（travel 除外）を不変コピー
  const existingItems = plan.items.filter(i => i.kind !== "travel");

  // ── Step 1: アンカー参照を検出 ──
  const anchorAfterM = message.match(ANCHOR_AFTER_RE);
  let anchorItem: PlanItem | null = null;
  let textForParse = message;

  if (anchorAfterM) {
    const anchorRef = anchorAfterM[1].trim();
    anchorItem = fuzzyMatchItem(anchorRef, existingItems);
    if (anchorItem) {
      // アンカー部分を除去して残りをパース
      textForParse = message.substring(
        message.indexOf(anchorAfterM[0]) + anchorAfterM[0].length
      ).trim();
    }
  }

  // ── Step 2: 新規入力のみをパース（既存アイテムには触らない） ──
  const newItems = extractNewItems(textForParse);

  // sourceTurnIndex を設定
  for (const item of newItems) {
    item.sourceTurnIndex = sourceTurnIndex;
  }

  // 既存アイテムとの重複を除外
  const existingTexts = new Set(existingItems.map(i => i.text));
  const existingWhats = new Set(existingItems.map(i => i.what).filter(Boolean));
  const genuinelyNew = newItems.filter(ni =>
    !existingTexts.has(ni.text) && !(ni.what && existingWhats.has(ni.what))
  );

  if (genuinelyNew.length === 0) {
    return {
      applied: false,
      items: existingItems,
      message: "新しい予定が見つからなかったよ。何を追加したい？",
      addedCount: 0,
    };
  }

  // ── Step 3: 挿入位置を決定 ──
  let result: PlanItem[];
  if (anchorItem) {
    // アンカーの後ろに挿入
    const anchorIdx = existingItems.findIndex(i => i.id === anchorItem!.id);
    result = [...existingItems];
    result.splice(anchorIdx + 1, 0, ...genuinelyNew);
  } else {
    // アンカーなし → 末尾に追加
    result = [...existingItems, ...genuinelyNew];
  }

  // ── Step 4: 応答メッセージ ──
  const addedLabels = genuinelyNew.map(i => `「${i.text}」`).join("・");
  const anchorLabel = anchorItem ? `「${anchorItem.text}」の後に` : "";
  const msg = `${anchorLabel}${addedLabels}を追加したよ。これでどう？`;

  return {
    applied: true,
    items: result,
    message: msg,
    anchorItem: anchorItem ?? undefined,
    addedCount: genuinelyNew.length,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ヘルパー: テキストから新しい PlanItem を抽出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function extractNewItems(text: string): PlanItem[] {
  // 接続表現を分割点として使い、各パーツを intent parse
  const cleanedText = text
    .replace(/^[、。\s]+/, "")
    .replace(/[、。\s]+$/, "")
    // 「帰る」「帰宅」は行動だがプランアイテムにしない
    .replace(/[、。]?\s*(そして|それで)?\s*(帰る|帰宅する?|家に帰る)\s*$/, "")
    .trim();

  if (!cleanedText || cleanedText.length < 2) return [];

  // intentParser と planningEngine の両方でパースして統合
  const intent = parseIntent(cleanedText);
  const intentItems = intentToPlanItems(intent);
  const { items: legacyItems } = parseUserInput(cleanedText);

  // intentParser の結果を優先（companion 等の構造化情報が豊富）
  if (intentItems.length > 0) return intentItems;
  // フォールバック: legacyItems
  return legacyItems;
}
