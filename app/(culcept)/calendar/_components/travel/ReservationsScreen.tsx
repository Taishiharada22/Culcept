// app/(culcept)/calendar/_components/travel/ReservationsScreen.tsx
// ③ booking.png — 予約一覧（4スタット＋宿泊/食事/交通 section グループ＋カード3ボタン）。
"use client";

import * as React from "react";
import type { TravelScreenProps } from "./screenProps";
import type { Reservation, ReservationCategory, ReservationAction } from "../../_lib/travel/types";
import { PhotoSlot } from "./PhotoSlot";
import {
  T,
  ConciergeCard,
  ConciergeHeader,
  StatusBadge,
  CategoryChip,
  CategoryAvatar,
  TripSummaryCard,
  GoldButton,
  OutlineButton,
} from "./concierge/primitives";
import {
  Bell,
  MapPin,
  Phone,
  ListChecks,
  Check,
  CircleSlash,
  AlertCircle,
  ConciergeBell,
  ChevronRight,
  Clock,
  Menu,
  Ticket,
} from "./concierge/icons";

const SECTION_ORDER: ReservationCategory[] = ["宿泊", "食事", "交通", "体験"];

function actionIcon(kind: ReservationAction["kind"]) {
  switch (kind) {
    case "map":
      return <MapPin size={13} />;
    case "menu":
      return <Menu size={13} />;
    case "ticket":
      return <Ticket size={13} />;
    case "timetable":
      return <Clock size={13} />;
    case "detail":
      return <Clock size={13} />;
    default:
      return null;
  }
}

function ReservationCard({ r, onOpenMap, onToast }: { r: Reservation; onOpenMap: TravelScreenProps["onOpenMap"]; onToast: TravelScreenProps["onToast"] }) {
  const handle = (a: ReservationAction) => {
    if (a.url) { window.open(a.url, "_blank", "noreferrer"); return; }
    if (a.kind === "map") { onOpenMap({ point: r.coords, title: r.name }); return; }
    if (a.kind === "change") { onToast("ご変更・キャンセルはコンシェルジュ経由で承ります"); return; }
    onToast(`${a.label}は接続後に対応します`);
  };
  return (
    <ConciergeCard className="p-3">
      <div className="flex gap-3">
        <div className="flex shrink-0 flex-col items-center gap-2">
          <CategoryAvatar category={r.category} />
          <PhotoSlot photo={r.photo} className="h-16 w-16" rounded="rounded-xl" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-serif text-[15px] leading-tight" style={{ color: T.ink, fontWeight: 600 }}>{r.name}</div>
              {r.category === "交通" ? (
                <div className="mt-0.5 text-[12px]" style={{ color: T.ink2 }}>
                  {r.transitFrom} <span style={{ color: T.ink3 }}>→</span> {r.transitTo}
                </div>
              ) : (
                r.timeLabel && <div className="mt-0.5 text-[12px]" style={{ color: T.ink2 }}>{r.timeLabel}</div>
              )}
            </div>
            <div className="shrink-0 text-right">
              <StatusBadge status={r.status} />
              {r.confirmationCode && (
                <div className="mt-1.5">
                  <div className="text-[9px]" style={{ color: T.ink3 }}>確認番号</div>
                  <div className="text-[12px] font-semibold tabular-nums" style={{ color: T.ink }}>{r.confirmationCode}</div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-2 space-y-1 text-[11px]" style={{ color: T.ink2 }}>
            {r.category === "交通" ? (
              <>
                {(r.transitDepart || r.transitArrive) && (
                  <div className="flex items-center gap-1.5"><Clock size={12} style={{ color: T.ink3 }} /> {r.transitDepart} ～ {r.transitArrive}</div>
                )}
                {r.seat && <div className="flex items-center gap-1.5"><Ticket size={12} style={{ color: T.ink3 }} /> {r.seat}</div>}
              </>
            ) : (
              <>
                {r.address && <div className="flex items-start gap-1.5"><MapPin size={12} style={{ color: T.ink3 }} className="mt-0.5 shrink-0" /> <span>{r.address}</span></div>}
                {r.phone && <div className="flex items-center gap-1.5"><Phone size={12} style={{ color: T.ink3 }} /> {r.phone}</div>}
              </>
            )}
          </div>
        </div>
      </div>

      {r.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {r.tags.map((t) => (
            <CategoryChip key={t.label}>{t.label}</CategoryChip>
          ))}
        </div>
      )}

      <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: `repeat(${r.actions.length}, minmax(0,1fr))` }}>
        {r.actions.map((a) =>
          a.emphasis === "gold" ? (
            <GoldButton key={a.kind} size="sm" full onClick={() => handle(a)}>{a.label}</GoldButton>
          ) : (
            <OutlineButton key={a.kind} size="sm" full icon={actionIcon(a.kind)} onClick={() => handle(a)}>{a.label}</OutlineButton>
          ),
        )}
      </div>
    </ConciergeCard>
  );
}

export default function ReservationsScreen({ trip, day, onClose, onOpenMap, onNavigate, onToast }: TravelScreenProps) {
  const stats = day.reservationStats;
  const statCols = [
    { Icon: ListChecks, label: "すべての予約", value: stats.total, color: T.ink2 },
    { Icon: Check, label: "確定済み", value: stats.confirmed, color: T.green },
    { Icon: CircleSlash, label: "変更可能", value: stats.changeable, color: T.ink2 },
    { Icon: AlertCircle, label: "要対応", value: stats.needsAction, color: stats.needsAction > 0 ? T.amber : T.ink3 },
  ];

  return (
    <div className="min-h-full">
      <ConciergeHeader
        title="予約一覧"
        subLabel="Your Reservations"
        subCaps
        onBack={onClose}
        right={<button onClick={() => onToast("通知はまだありません")} aria-label="通知" className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-black/[0.04] active:scale-90"><Bell size={18} /></button>}
      />

      <div className="mx-auto w-full max-w-md flex-1 space-y-4 px-4 pb-6 pt-3">
        <TripSummaryCard
          thumb={<PhotoSlot photo={day.heroPhoto} className="h-12 w-16" rounded="rounded-lg" />}
          title={trip.title}
          meta={`${trip.dateRangeLabel}・${trip.partySize}名`}
          onAction={() => onNavigate("schedule")}
        />

        {/* 4スタット */}
        <ConciergeCard className="grid grid-cols-4 p-3">
          {statCols.map(({ Icon, label, value, color }, i) => (
            <div key={label} className="flex flex-col items-center gap-1 px-1 text-center" style={i > 0 ? { borderLeft: `1px solid ${T.borderSoft}` } : undefined}>
              <span style={{ color }}><Icon size={16} /></span>
              <span className="text-[9px]" style={{ color: T.ink3 }}>{label}</span>
              <span className="font-serif text-[16px]" style={{ color, fontWeight: 600 }}>{value}件</span>
            </div>
          ))}
        </ConciergeCard>

        <div className="text-[11px]" style={{ color: T.ink3 }}>ご予約の詳細・変更・キャンセルはこちらから行えます。</div>

        {/* カテゴリ section */}
        {SECTION_ORDER.map((cat) => {
          const items = day.reservations.filter((r) => r.category === cat);
          if (items.length === 0) return null;
          return (
            <section key={cat} className="space-y-2">
              <div className="font-serif text-[14px]" style={{ color: T.ink2, fontWeight: 600 }}>{cat}</div>
              {items.map((r) => (
                <ReservationCard key={r.id} r={r} onOpenMap={onOpenMap} onToast={onToast} />
              ))}
            </section>
          );
        })}

        {/* フッター */}
        <ConciergeCard interactive onClick={() => onToast("コンシェルジュにおつなぎします（準備中）")} ariaLabel="コンシェルジュに相談する" className="flex items-center gap-3 p-4" style={{ background: T.cardAlt }}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ color: T.gold, background: T.goldBg }}>
            <ConciergeBell size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold" style={{ color: T.ink }}>コンシェルジュに相談する</div>
            <div className="text-[11px]" style={{ color: T.ink3 }}>旅先でのご要望や急な変更も、お気軽にご相談ください。</div>
          </div>
          <ChevronRight size={16} style={{ color: T.ink3 }} />
        </ConciergeCard>
      </div>
    </div>
  );
}
