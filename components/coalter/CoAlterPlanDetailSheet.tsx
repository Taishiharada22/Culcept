"use client";

/**
 * CoAlter Plan Detail Sheet — プラン詳細ボトムシート
 *
 * Phase 1.5.2 — 場所/タイトルをタップすると下から出るボトムシート。
 * URL（Web情報）・場所・補足・削除・採用者情報を集約表示。
 *
 * Shelf / Calendar 両方から共用する。
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { PlanItem } from "@/lib/coalter/planShelf";
import type {
  RefineCandidate,
  RefineDirection,
} from "@/lib/coalter/refineItem";
import { REFINE_DIRECTION_LABEL } from "@/lib/coalter/refineItem";

const C = {
  coalter: "#6366F1",
  pulse: "#EC4899",
  s1: "#ffffff",
  s2: "#f5f6fa",
  t1: "#1a1a2e",
  t2: "#4a4a68",
  t3: "#8888a0",
  t4: "#c8c8dc",
  ok: "#10B981",
  warn: "#F59E0B",
};

interface Props {
  item: PlanItem | null;
  currentUserId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onDelete: (id: string) => void;
  /** Phase 1.5.3 ④ — direction を受けて差し替え候補を 1 件生成（プレビュー用） */
  onRefine?: (itemId: string, direction: RefineDirection) => Promise<RefineCandidate | null>;
  /** Phase 1.5.3 ④ — プレビューした候補を実際に適用 */
  onApplyRefine?: (
    itemId: string,
    patch: {
      title: string;
      description?: string;
      practicalInfo?: string | null;
      url?: string | null;
      timeSlot?: string | null;
    },
  ) => Promise<boolean>;
}

function formatDateJp(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${y}年${parseInt(m, 10)}月${parseInt(d, 10)}日`;
}

function extractHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * practicalInfo から住所らしき文字列を抽出する。
 * 完璧な精度は求めない。見つからなければ title を使う。
 * 「東京都」「大阪府」などの都道府県で始まる区間、または
 * 「区」「市」「町」「駅」を含む区間を最長で拾う。
 */
function extractAddressQuery(item: { title: string; practicalInfo: string | null }): string {
  const src = item.practicalInfo ?? "";
  // 都道府県 + 以降（句読点・括弧で打ち切り）
  const prefMatch = src.match(/(?:北海道|東京都|大阪府|京都府|[^\s、。()（）]{2,3}県)[^、。()（）]+/);
  if (prefMatch) return prefMatch[0].trim();
  // 区 / 市 / 町 / 駅 を含む断片
  const localMatch = src.match(/[^\s、。()（）]*(?:区|市|町|駅)[^\s、。()（）]*/);
  if (localMatch) return localMatch[0].trim();
  // フォールバック: タイトル
  return item.title;
}

function buildMapsUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function formatAdoptedAt(isoString: string): string {
  try {
    const d = new Date(isoString);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${y}/${m}/${day} ${hh}:${mm} に採用`;
  } catch {
    return "";
  }
}

const CATEGORY_LABEL: Record<string, string> = {
  food: "食事",
  movie: "映画",
  activity: "アクティビティ",
  shopping: "ショッピング",
  travel: "旅行",
  other: "その他",
};

const REFINE_DIRECTIONS: RefineDirection[] = [
  "cheaper",
  "earlier",
  "later",
  "closer",
  "quieter",
  "livelier",
];

export function CoAlterPlanDetailSheet({
  item,
  currentUserId,
  isOpen,
  onClose,
  onDelete,
  onRefine,
  onApplyRefine,
}: Props) {
  // リファインメント状態（Phase 1.5.3 ④）
  const [refineLoading, setRefineLoading] = useState<RefineDirection | null>(null);
  const [refineError, setRefineError] = useState<string | null>(null);
  const [preview, setPreview] = useState<
    | (RefineCandidate & { direction: RefineDirection })
    | null
  >(null);
  const [applying, setApplying] = useState(false);

  // item が変わったらリファイン状態リセット
  useEffect(() => {
    setRefineLoading(null);
    setRefineError(null);
    setPreview(null);
    setApplying(false);
  }, [item?.id]);
  // Esc キーで閉じる
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  // 背景スクロール抑止
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  const isMine = !!item && !!currentUserId && item.createdBy === currentUserId;
  const adopterLabel = item ? (isMine ? "あなたが採用" : "相手が採用") : "";
  const adopterColor = isMine ? C.coalter : C.pulse;
  const adoptedAtLabel = item ? formatAdoptedAt(item.createdAt) : "";
  const mapsUrl = item ? buildMapsUrl(extractAddressQuery(item)) : "";

  return (
    <AnimatePresence>
      {isOpen && item && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* オーバーレイ */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={onClose}
            aria-hidden
          />

          {/* シート本体 */}
          <motion.div
            className="relative w-full max-w-lg rounded-t-3xl overflow-hidden"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) onClose();
            }}
            style={{
              background: C.s1,
              boxShadow: "0 -8px 32px rgba(0,0,0,0.18)",
              maxHeight: "85vh",
            }}
          >
            {/* ドラッグハンドル */}
            <div className="flex justify-center pt-2 pb-1">
              <div
                style={{
                  width: 36,
                  height: 4,
                  borderRadius: 2,
                  background: C.t4,
                }}
              />
            </div>

            {/* スクロール本体 */}
            <div className="overflow-y-auto" style={{ maxHeight: "calc(85vh - 24px)" }}>
              {/* ── メタヘッダー ── */}
              <div className="px-5 pt-2 pb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    style={{
                      fontSize: 10,
                      color: C.coalter,
                      background: `${C.coalter}12`,
                      padding: "2px 8px",
                      borderRadius: 999,
                      fontWeight: 600,
                    }}
                  >
                    {formatDateJp(item.targetDate)}
                  </span>
                  {item.timeSlot && (
                    <span
                      style={{
                        fontSize: 10,
                        color: C.t2,
                        background: C.s2,
                        padding: "2px 8px",
                        borderRadius: 999,
                      }}
                    >
                      {item.timeSlot}
                    </span>
                  )}
                  {item.category && CATEGORY_LABEL[item.category] && (
                    <span
                      style={{
                        fontSize: 10,
                        color: C.t3,
                        border: `1px solid ${C.s2}`,
                        padding: "2px 8px",
                        borderRadius: 999,
                      }}
                    >
                      {CATEGORY_LABEL[item.category]}
                    </span>
                  )}
                  <span
                    style={{
                      fontSize: 10,
                      color: adopterColor,
                      background: `${adopterColor}10`,
                      padding: "2px 8px",
                      borderRadius: 999,
                      fontWeight: 500,
                      marginLeft: "auto",
                    }}
                  >
                    {adopterLabel}
                  </span>
                </div>
              </div>

              {/* ── タイトル ── */}
              <div className="px-5 pb-3">
                <h2
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: C.t1,
                    lineHeight: 1.4,
                  }}
                >
                  {item.title}
                </h2>
              </div>

              {/* ── 説明 ── */}
              {item.description && (
                <div className="px-5 pb-3">
                  <p style={{ fontSize: 13, color: C.t2, lineHeight: 1.7 }}>
                    {item.description}
                  </p>
                </div>
              )}

              {/* ── 実用情報（場所・料金など） ── */}
              {item.practicalInfo && (
                <div className="mx-5 mb-3 rounded-xl px-4 py-3"
                  style={{
                    background: C.s2,
                  }}
                >
                  <p
                    style={{
                      fontSize: 9,
                      color: C.t3,
                      fontWeight: 600,
                      letterSpacing: "0.08em",
                      marginBottom: 4,
                    }}
                  >
                    実用情報
                  </p>
                  <p style={{ fontSize: 12, color: C.t1, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                    {item.practicalInfo}
                  </p>
                </div>
              )}

              {/* ── アクションカード（マップ + Web）── */}
              <div className="px-5 pb-3 space-y-2">
                {/* マップで開く — 住所/タイトルから query 自動生成 */}
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-xl px-4 py-3"
                  style={{
                    background: `linear-gradient(135deg, ${C.ok}0a, ${C.coalter}06)`,
                    border: `1px solid ${C.ok}24`,
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="shrink-0 flex items-center justify-center rounded-lg"
                      style={{
                        width: 36,
                        height: 36,
                        background: `${C.ok}18`,
                        fontSize: 16,
                      }}
                      aria-hidden
                    >
                      🗺
                    </div>
                    <div className="flex-1 min-w-0">
                      <p style={{ fontSize: 11, color: C.ok, fontWeight: 600 }}>
                        マップで開く
                      </p>
                      <p
                        className="truncate"
                        style={{ fontSize: 10, color: C.t3, marginTop: 1 }}
                      >
                        {extractAddressQuery(item)}
                      </p>
                    </div>
                    <span style={{ fontSize: 14, color: C.ok }} aria-hidden>
                      ↗
                    </span>
                  </div>
                </a>

                {/* URL カード — 元候補の Web 情報 */}
                {item.url && (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-xl px-4 py-3"
                    style={{
                      background: `linear-gradient(135deg, ${C.coalter}08, ${C.pulse}06)`,
                      border: `1px solid ${C.coalter}20`,
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="shrink-0 flex items-center justify-center rounded-lg"
                        style={{
                          width: 36,
                          height: 36,
                          background: `${C.coalter}14`,
                          fontSize: 16,
                        }}
                        aria-hidden
                      >
                        🔗
                      </div>
                      <div className="flex-1 min-w-0">
                        <p style={{ fontSize: 11, color: C.coalter, fontWeight: 600 }}>
                          Webで開く
                        </p>
                        <p
                          className="truncate"
                          style={{ fontSize: 10, color: C.t3, marginTop: 1 }}
                        >
                          {extractHost(item.url)}
                        </p>
                      </div>
                      <span style={{ fontSize: 14, color: C.coalter }} aria-hidden>
                        ↗
                      </span>
                    </div>
                  </a>
                )}
              </div>

              {/* ── 控えの候補（Phase 1.5.3 ②）── */}
              {item.alternatives && item.alternatives.length > 0 && (
                <div className="px-5 pb-3">
                  <p
                    style={{
                      fontSize: 9,
                      color: C.t3,
                      fontWeight: 600,
                      letterSpacing: "0.08em",
                      marginBottom: 6,
                    }}
                  >
                    控えの候補
                  </p>
                  <p
                    style={{
                      fontSize: 10,
                      color: C.t3,
                      marginBottom: 8,
                      lineHeight: 1.5,
                    }}
                  >
                    当日うまくいかなかった時の第2候補。採用時に一緒に保存されています。
                  </p>
                  <div className="space-y-2">
                    {item.alternatives.map((alt, idx) => (
                      <div
                        key={`alt-${idx}`}
                        className="rounded-lg px-3 py-2"
                        style={{
                          background: C.s2,
                          border: `1px solid ${C.coalter}10`,
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            style={{
                              fontSize: 9,
                              color: C.coalter,
                              background: `${C.coalter}14`,
                              padding: "1px 5px",
                              borderRadius: 3,
                              fontWeight: 600,
                            }}
                          >
                            第{idx + 2}候補
                          </span>
                          <span
                            className="truncate"
                            style={{ fontSize: 12, color: C.t1, fontWeight: 500 }}
                          >
                            {alt.title}
                          </span>
                        </div>
                        {alt.oneLiner && (
                          <p
                            style={{
                              fontSize: 10,
                              color: C.t2,
                              marginTop: 3,
                              lineHeight: 1.5,
                            }}
                          >
                            {alt.oneLiner}
                          </p>
                        )}
                        {alt.practicalInfo && (
                          <p
                            className="truncate"
                            style={{ fontSize: 9, color: C.t3, marginTop: 2 }}
                          >
                            {alt.practicalInfo}
                          </p>
                        )}
                        {alt.url && (
                          <a
                            href={alt.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              fontSize: 10,
                              color: C.coalter,
                              marginTop: 3,
                              display: "inline-block",
                            }}
                          >
                            Webで開く ↗
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── 少し寄せる（Phase 1.5.3 ④ 局所リファインメント）── */}
              {isMine && onRefine && onApplyRefine && !item.isExpired && (
                <div className="px-5 pb-3">
                  <p
                    style={{
                      fontSize: 9,
                      color: C.t3,
                      fontWeight: 600,
                      letterSpacing: "0.08em",
                      marginBottom: 6,
                    }}
                  >
                    少し寄せる
                  </p>
                  <p
                    style={{
                      fontSize: 10,
                      color: C.t3,
                      marginBottom: 8,
                      lineHeight: 1.5,
                    }}
                  >
                    この候補の「ここだけ」を変えて差し替え案を見る。
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {REFINE_DIRECTIONS.map((dir) => {
                      const isLoadingThis = refineLoading === dir;
                      const isDisabled = refineLoading !== null || preview !== null;
                      return (
                        <button
                          key={dir}
                          disabled={isDisabled}
                          onClick={async () => {
                            if (!item) return;
                            setRefineError(null);
                            setRefineLoading(dir);
                            try {
                              const candidate = await onRefine(item.id, dir);
                              if (candidate) {
                                setPreview({ ...candidate, direction: dir });
                              } else {
                                setRefineError("差し替え候補の生成に失敗しました");
                              }
                            } finally {
                              setRefineLoading(null);
                            }
                          }}
                          style={{
                            fontSize: 11,
                            color: isLoadingThis ? C.s1 : C.t2,
                            background: isLoadingThis ? C.coalter : C.s2,
                            border: `1px solid ${isLoadingThis ? C.coalter : C.t4}40`,
                            padding: "5px 10px",
                            borderRadius: 999,
                            fontWeight: 500,
                            opacity: isDisabled && !isLoadingThis ? 0.4 : 1,
                            transition: "all 0.2s",
                          }}
                          aria-label={`${REFINE_DIRECTION_LABEL[dir]}に寄せた差し替え案を生成`}
                        >
                          {isLoadingThis ? "生成中…" : REFINE_DIRECTION_LABEL[dir]}
                        </button>
                      );
                    })}
                  </div>
                  {refineError && (
                    <p
                      style={{
                        fontSize: 10,
                        color: C.warn,
                        marginTop: 6,
                      }}
                    >
                      {refineError}
                    </p>
                  )}
                </div>
              )}

              {/* ── 採用コンテキスト（小さく脇役として）── */}
              <div className="px-5 pb-3">
                <div
                  className="flex items-center gap-2"
                  style={{ fontSize: 10, color: C.t3 }}
                >
                  <span aria-hidden>✦</span>
                  <span>CoAlter で採用</span>
                  {adoptedAtLabel && (
                    <>
                      <span style={{ color: C.t4 }}>·</span>
                      <span>{adoptedAtLabel}</span>
                    </>
                  )}
                </div>
              </div>

              {/* ── アクション ── */}
              <div
                className="px-5 py-3 flex items-center justify-between"
                style={{ borderTop: `1px solid ${C.s2}` }}
              >
                <button
                  onClick={() => {
                    if (confirm("このプランを削除しますか？")) {
                      onDelete(item.id);
                      onClose();
                    }
                  }}
                  style={{
                    fontSize: 12,
                    color: C.t3,
                    padding: "8px 12px",
                  }}
                  aria-label="このプランを削除"
                >
                  削除
                </button>
                <button
                  onClick={onClose}
                  className="rounded-full"
                  style={{
                    fontSize: 12,
                    color: C.t1,
                    background: C.s2,
                    padding: "8px 20px",
                    fontWeight: 500,
                  }}
                >
                  閉じる
                </button>
              </div>
            </div>
          </motion.div>

          {/* ── リファインメント プレビューモーダル（Phase 1.5.3 ④）── */}
          <AnimatePresence>
            {preview && item && onApplyRefine && (
              <motion.div
                className="absolute inset-0 z-10 flex items-center justify-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div
                  className="absolute inset-0 bg-black/40"
                  onClick={() => {
                    if (!applying) setPreview(null);
                  }}
                  aria-hidden
                />
                <motion.div
                  className="relative w-[92%] max-w-sm rounded-2xl p-5"
                  initial={{ scale: 0.94, opacity: 0, y: 8 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.94, opacity: 0, y: 8 }}
                  transition={{ type: "spring", damping: 26, stiffness: 320 }}
                  style={{
                    background: C.s1,
                    boxShadow: "0 16px 48px rgba(0,0,0,0.25)",
                  }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span
                      style={{
                        fontSize: 10,
                        color: C.coalter,
                        background: `${C.coalter}14`,
                        padding: "2px 8px",
                        borderRadius: 999,
                        fontWeight: 600,
                      }}
                    >
                      {REFINE_DIRECTION_LABEL[preview.direction]}
                    </span>
                    {preview.changeNote && (
                      <span
                        style={{
                          fontSize: 10,
                          color: C.t3,
                          fontStyle: "italic",
                        }}
                      >
                        · {preview.changeNote}
                      </span>
                    )}
                  </div>

                  <h3
                    style={{
                      fontSize: 15,
                      color: C.t1,
                      fontWeight: 700,
                      lineHeight: 1.4,
                      marginBottom: 6,
                    }}
                  >
                    {preview.title}
                  </h3>
                  <p
                    style={{
                      fontSize: 12,
                      color: C.t2,
                      lineHeight: 1.6,
                      marginBottom: 8,
                    }}
                  >
                    {preview.oneLiner}
                  </p>

                  {preview.practicalInfo && (
                    <div
                      className="rounded-lg px-3 py-2 mb-2"
                      style={{ background: C.s2 }}
                    >
                      <p
                        style={{
                          fontSize: 11,
                          color: C.t1,
                          lineHeight: 1.5,
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {preview.practicalInfo}
                      </p>
                    </div>
                  )}

                  {preview.timeSlot && preview.timeSlot !== item.timeSlot && (
                    <p style={{ fontSize: 10, color: C.t3, marginBottom: 8 }}>
                      時刻: {item.timeSlot ?? "未定"} → {preview.timeSlot}
                    </p>
                  )}

                  <p
                    style={{
                      fontSize: 10,
                      color: C.t3,
                      marginBottom: 12,
                      lineHeight: 1.5,
                    }}
                  >
                    差し替えると元の候補は上書きされます（控えの候補は残ります）。
                  </p>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPreview(null)}
                      disabled={applying}
                      className="flex-1 rounded-full"
                      style={{
                        fontSize: 12,
                        color: C.t2,
                        background: C.s2,
                        padding: "10px 14px",
                        fontWeight: 500,
                        opacity: applying ? 0.5 : 1,
                      }}
                    >
                      キャンセル
                    </button>
                    <button
                      onClick={async () => {
                        if (!item || !preview) return;
                        setApplying(true);
                        const ok = await onApplyRefine(item.id, {
                          title: preview.title,
                          description: preview.oneLiner,
                          practicalInfo: preview.practicalInfo,
                          url: preview.url,
                          // timeSlot は候補があれば更新、なければ元を踏襲
                          timeSlot: preview.timeSlot ?? item.timeSlot,
                        });
                        setApplying(false);
                        if (ok) {
                          setPreview(null);
                          onClose();
                        } else {
                          setRefineError("差し替えに失敗しました");
                          setPreview(null);
                        }
                      }}
                      disabled={applying}
                      className="flex-1 rounded-full"
                      style={{
                        fontSize: 12,
                        color: C.s1,
                        background: C.coalter,
                        padding: "10px 14px",
                        fontWeight: 600,
                        opacity: applying ? 0.7 : 1,
                      }}
                    >
                      {applying ? "差し替え中…" : "差し替える"}
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
