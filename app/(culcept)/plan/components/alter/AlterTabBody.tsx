"use client";

/**
 * AlterTabBody — Alter タブのコンテンツ領域（構成ルート・v2: 参照画像レイアウト）
 *
 * 正本: docs/alter-tab-visual-contract.md §3 / §5
 * 構成（参照画像準拠）:
 *  1. ヘッダー
 *  2. 上段 2 カラング: あなたのバッテリー（人体 + コールアウト + コネクタ）| 状態の背景（昨日までの影響）
 *  3. 周辺カード 2x2（外出耐性 / 夜の余白 / 持ち越し / 成立見込み）
 *  4. 今日の推移予測（B5 改名）+ 流れレール（W1・D-1: flowTimeline の事実マーカーを統合）
 *  5. Night Check / 5'. Morning Reveal
 *  6-7. 会話エリア（見立てメッセージ → チップ → 直近往復）→ CTA → 入力バー
 * 規律:
 *  - データは props の AlterBatteryViewModel のみ（mock）。fetch / 保存なし
 *  - コールドスタート（全系統 unknown）: チップ列を人体直下に昇格（§3.6）
 *  - 補正シートの選択は視覚フィードバック + モックコールバックのみ（実更新は Stage 1 の applyUserCorrection）
 */

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { AlterBatteryViewModel } from "@/lib/plan/dayState/dayStateTypes";
import { AlterAvatar } from "./AlterAvatar";
import { AlterCtaRow } from "./AlterCtaRow";
import { AlterInputBar } from "./AlterInputBar";
import { AlterQuickReplies } from "./AlterQuickReplies";
import { HumanBatteryCard } from "./HumanBatteryCard";
import { NightCheckCard } from "./NightCheckCard";
import { ForecastGrid, StateBackgroundPanel } from "./ForecastCards";
import { ResourceTrendChart } from "./ResourceTrendChart";
import { type AlterScreenViewModel } from "./screenViewModel";
import { BAND_LABEL, type ZoneKey } from "./bandDisplay";
import { SunIcon } from "./alterIcons";

export type CorrectionTarget = ZoneKey | "outingTolerance";
export type CorrectionDirection = "lower" | "match" | "higher";
export type SleepChoice = "よく眠れた" | "浅い" | "短い";

export interface AlterTabBodyProps {
  /** over.png 表示 VM（基底 AlterBatteryViewModel を内包）。CEO 2026-06-11 契約緩和 */
  screen: AlterScreenViewModel;
  onCorrection?: (target: CorrectionTarget, direction: CorrectionDirection) => void;
  onSleepInput?: (choice: SleepChoice) => void;
  onNightCheckAnswer?: (chip: string) => void;
  onQuickReply?: (chip: string) => void;
  onCompose?: () => void;
  onViewAdjustments?: () => void;
  onSend?: (message: string) => void;
}

type SheetTarget = { kind: "correction"; target: CorrectionTarget } | { kind: "sleep" };

const CORRECTION_CHOICES: Array<{ label: string; direction: CorrectionDirection }> = [
  { label: "もっと低い", direction: "lower" },
  { label: "合ってる", direction: "match" },
  { label: "もっと高い", direction: "higher" },
];

const SLEEP_CHOICES: SleepChoice[] = ["よく眠れた", "浅い", "短い"];

/** §3.5' きのうの答え合わせ（コンポーネントマップ外のため AlterTabBody 内ローカル） */
function MorningRevealCard({ morningReveal }: { morningReveal: NonNullable<AlterBatteryViewModel["morningReveal"]> }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="rounded-3xl border border-violet-100 bg-gradient-to-br from-violet-50/80 to-white/80 p-3.5 shadow-sm backdrop-blur-sm">
      <div className="flex items-center gap-1.5">
        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-violet-100/90 text-violet-500">
          <SunIcon size={11} />
        </span>
        <span className="text-[10px] font-medium text-slate-500">きのうの答え合わせ</span>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="ml-auto rounded-full p-1 text-slate-300 transition-colors hover:text-slate-500"
          aria-label="閉じる"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M6 6 L18 18 M18 6 L6 18" />
          </svg>
        </button>
      </div>
      <div className="mt-1.5 space-y-1">
        {morningReveal.items.map((item) => (
          <p key={item.label} className="text-[12.5px] leading-relaxed text-slate-700">
            {item.verdict === "match" ? (
              <>きのうの「{item.label} {BAND_LABEL[item.estimatedBand]}」は、見立てどおりだったようです。</>
            ) : (
              <>
                きのうは「{item.label} {BAND_LABEL[item.estimatedBand]}」と見ていました。実際は「
                {BAND_LABEL[item.actualBand]}」寄りだったようです。
              </>
            )}
          </p>
        ))}
      </div>
      <p className="mt-1.5 text-[10px] text-slate-400">{morningReveal.adjustmentNote}</p>
    </div>
  );
}

export function AlterTabBody({
  screen,
  onCorrection,
  onSleepInput,
  onNightCheckAnswer,
  onQuickReply,
  onCompose,
  onViewAdjustments,
  onSend,
}: AlterTabBodyProps) {
  const vm = screen.base;
  const [sheet, setSheet] = useState<SheetTarget | null>(null);
  const [pulseZone, setPulseZone] = useState<ZoneKey | null>(null);
  const [ack, setAck] = useState<string | null>(null);
  const ackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (ackTimer.current) clearTimeout(ackTimer.current);
  }, []);

  const showAck = (message: string) => {
    setAck(message);
    if (ackTimer.current) clearTimeout(ackTimer.current);
    ackTimer.current = setTimeout(() => setAck(null), 2200);
  };

  const isColdStart =
    vm.battery.brain.band === "unknown" &&
    vm.battery.heart.band === "unknown" &&
    vm.battery.body.band === "unknown";

  const sheetZoneLabel =
    sheet?.kind === "correction"
      ? sheet.target === "outingTolerance"
        ? vm.contextCards.outingTolerance.label
        : vm.battery[sheet.target].label
      : null;

  const handleCorrection = (direction: CorrectionDirection) => {
    if (sheet?.kind !== "correction") return;
    onCorrection?.(sheet.target, direction);
    if (sheet.target !== "outingTolerance") {
      setPulseZone(sheet.target);
      setTimeout(() => setPulseZone(null), 950);
    }
    setSheet(null);
    showAck("補正を受け取りました");
  };

  const handleSleep = (choice: SleepChoice) => {
    onSleepInput?.(choice);
    setSheet(null);
    showAck("受け取りました");
  };

  return (
    <div className="relative min-h-screen">
      {/* ヘッダー（Alter/ライブ/サブコピー/設定）は CEO B5 指示で削除 */}
      <div className="mx-auto max-w-3xl space-y-2 px-3 pb-24 pt-3">
        {/* 上段 2 カラム（over.png 構図）: あなたのバッテリー | 状態の背景 4 セル */}
        <div className="grid grid-cols-[1.62fr_1fr] items-stretch gap-1.5">
          <HumanBatteryCard
            battery={vm.battery}
            outingTolerance={vm.contextCards.outingTolerance}
            eveningSlack={vm.contextCards.eveningSlack}
            meterPct={screen.meterPct}
            onZoneTap={(z) => setSheet({ kind: "correction", target: z })}
            onOutingTap={() => setSheet({ kind: "correction", target: "outingTolerance" })}
            pulseZone={pulseZone}
          />
          <StateBackgroundPanel stateBg={screen.stateBg} onSleepTap={() => setSheet({ kind: "sleep" })} />
        </div>

        <AnimatePresence>
          {ack && (
            <motion.p
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="px-2 text-center text-[10.5px] text-indigo-400"
            >
              {ack}
            </motion.p>
          )}
        </AnimatePresence>

        {/* コールドスタート: チップ列を人体直下に昇格 */}
        {isColdStart && (
          <div className="rounded-3xl border border-white bg-white/80 p-3 shadow-sm backdrop-blur-sm">
            <AlterQuickReplies
              quickReplies={vm.quickReplies}
              lead="まだ読めていません。いまの感じをタップで教えてもらえると、今日の見立てが始まります"
              onSelect={onQuickReply}
            />
          </div>
        )}

        {/* 数値カード 2x2: 消耗予測 / 回復見込み / 持ち越し / 成立見込み（over.png） */}
        <ForecastGrid
          consumption={screen.consumption}
          nightRecovery={screen.nightRecovery}
          carryOver={screen.carryOver}
          feasibility={screen.feasibility}
        />

        {/* 今日の推移予測 + 流れレール（D-1: 事実セグメントをチャート下部に統合） */}
        <ResourceTrendChart trend={screen.trend} segments={vm.flowTimeline.segments} />

        {/* Night Check（state=hidden なら描画なし） */}
        <NightCheckCard nightCheck={vm.nightCheck} onAnswer={onNightCheckAnswer} />

        {/* 5'. Morning Reveal（朝のみ・null なら描画なし） */}
        {vm.morningReveal !== null && <MorningRevealCard morningReveal={vm.morningReveal} />}

        {/* 6. cockpit input panel（B13/B14・CEO 判断）: 吹き出し往復は廃止。
            alterMessage / chips / CTA / 状態入力スリットを「1 つの操作盤」に見せる（B14・指示④）:
            見出しバー + 内部を区切り線で連結し、外周 1 枠に統合 */}
        <div className="overflow-hidden rounded-3xl border border-indigo-100 bg-gradient-to-b from-white/90 via-indigo-50/55 to-violet-50/70 shadow-[0_12px_38px_rgba(99,102,241,0.2)] backdrop-blur-xl">
          {/* 見出し行: アバター + 見立て要約（操作盤のタイトル帯） */}
          <div className="flex items-center gap-2 border-b border-indigo-100/70 bg-white/45 px-3 py-2">
            <AlterAvatar size={26} />
            <p className="min-w-0 text-[12px] font-medium leading-snug text-slate-700">{vm.alterMessage}</p>
          </div>
          {/* 操作群: チップ → CTA → 入力スリットを詰めて連結 */}
          <div className="space-y-2 px-3 pb-2.5 pt-2">
            {!isColdStart && <AlterQuickReplies quickReplies={vm.quickReplies} onSelect={onQuickReply} />}
            <AlterCtaRow onCompose={onCompose} onViewAdjustments={onViewAdjustments} />
            <AlterInputBar
              onSend={(m) => {
                onSend?.(m);
                showAck("受け取りました");
              }}
            />
          </div>
        </div>
      </div>

      {/* 補正シート（系統 / 外出耐性 / 睡眠入力）
          AnimatePresence の直接子は key 付き motion 要素にする（Fragment で包むと exit が完了しない） */}
      <AnimatePresence>
        {sheet !== null && (
          <motion.button
            key="correction-backdrop"
            type="button"
            aria-label="シートを閉じる"
            className="fixed inset-0 z-40 bg-slate-900/20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSheet(null)}
          />
        )}
        {sheet !== null && (
          <motion.div
            key="correction-sheet"
            className="fixed inset-x-0 bottom-0 z-50"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
          >
            <div className="mx-auto max-w-3xl rounded-t-3xl border border-white/90 bg-white/95 p-5 pb-8 shadow-2xl backdrop-blur-xl">
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-200" />
              {sheet.kind === "correction" ? (
                <>
                  <p className="text-sm font-semibold text-slate-800">
                    {sheetZoneLabel}の見立て、合っていますか？
                  </p>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {CORRECTION_CHOICES.map((choice) => (
                      <button
                        key={choice.direction}
                        type="button"
                        onClick={() => handleCorrection(choice.direction)}
                        className="rounded-2xl border border-slate-200 bg-white px-2 py-2.5 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:border-indigo-200 hover:bg-indigo-50"
                      >
                        {choice.label}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-slate-800">昨夜の眠りは、どうでしたか？</p>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {SLEEP_CHOICES.map((choice) => (
                      <button
                        key={choice}
                        type="button"
                        onClick={() => handleSleep(choice)}
                        className="rounded-2xl border border-slate-200 bg-white px-2 py-2.5 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:border-violet-200 hover:bg-violet-50"
                      >
                        {choice}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
