"use client";

import * as React from "react";
import { motion } from "framer-motion";
import Image, { type ImageLoader } from "next/image";
import type { WardrobeItem } from "@/app/my-style/_lib/types";
import type {
  EventContext,
  WeatherContext,
  Slot,
  SlotState,
  SavedOutfit,
} from "../_lib/vcTypes";
import { SLOT_ORDER } from "../_lib/vcTypes";
import { computePrimaryEvent, computeIntent, intentToBadges } from "../_lib/vcIntent";
import { buildCandidates } from "../_lib/vcCandidates";
import SlotSwipeLane from "./SlotSwipeLane";
import EventProfileForm from "./EventProfileForm";

const passthroughLoader: ImageLoader = ({ src }) => src;

/* ═══════════════════════════════════════════════
   localStorage
   ═══════════════════════════════════════════════ */
const OUTFIT_KEY_PREFIX = "culcept_outfit_v1_";
const OUTFIT_SESSION_KEY_PREFIX = "culcept_outfit_session_v1_";
const MAX_STORED_OUTFITS = 30;
const FALLBACK_STORED_OUTFITS = 14;

const memoryOutfitCache = new Map<string, SavedOutfit>();

function getStorage(kind: "local" | "session"): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function isQuotaExceededError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  const code = "code" in error && typeof error.code === "number" ? error.code : null;
  return (
    name === "QuotaExceededError" ||
    name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    code === 22 ||
    code === 1014
  );
}

function compactSavedOutfit(outfit: Partial<SavedOutfit>): SavedOutfit {
  const slotItemIds = Object.fromEntries(
    Object.entries(outfit.slotItemIds ?? {}).filter(([, itemId]) => typeof itemId === "string" && itemId.length > 0),
  ) as Partial<Record<Slot, string>>;

  return {
    date: typeof outfit.date === "string" ? outfit.date : "",
    slotItemIds,
    lockedSlots: Array.isArray(outfit.lockedSlots)
      ? Array.from(new Set(outfit.lockedSlots.filter((slot): slot is Slot => SLOT_ORDER.includes(slot as Slot)))).slice(0, SLOT_ORDER.length)
      : [],
    createdAt: typeof outfit.createdAt === "string" ? outfit.createdAt : new Date().toISOString(),
  };
}

function readSavedOutfit(storage: Storage | null, key: string): SavedOutfit | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const compacted = compactSavedOutfit(JSON.parse(raw) as Partial<SavedOutfit>);
    return compacted.date ? compacted : null;
  } catch {
    return null;
  }
}

function pruneStoredOutfits(storage: Storage | null, prefix: string, preserveKey: string, keep: number): void {
  if (!storage) return;
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(prefix)) keys.push(key);
  }

  keys.sort((a, b) => b.localeCompare(a));
  const keepKeys = new Set([
    preserveKey,
    ...keys.filter(key => key !== preserveKey).slice(0, Math.max(keep - 1, 0)),
  ]);

  for (const key of keys) {
    if (!keepKeys.has(key)) {
      storage.removeItem(key);
    }
  }
}

function loadOutfit(date: string): SavedOutfit | null {
  const localKey = `${OUTFIT_KEY_PREFIX}${date}`;
  const sessionKey = `${OUTFIT_SESSION_KEY_PREFIX}${date}`;

  const local = readSavedOutfit(getStorage("local"), localKey);
  if (local) {
    memoryOutfitCache.set(date, local);
    return local;
  }

  const session = readSavedOutfit(getStorage("session"), sessionKey);
  if (session) {
    memoryOutfitCache.set(date, session);
    return session;
  }

  return memoryOutfitCache.get(date) ?? null;
}

function saveOutfitToStorage(outfit: SavedOutfit) {
  const compacted = compactSavedOutfit(outfit);
  const localStorageRef = getStorage("local");
  const sessionStorageRef = getStorage("session");
  const localKey = `${OUTFIT_KEY_PREFIX}${outfit.date}`;
  const sessionKey = `${OUTFIT_SESSION_KEY_PREFIX}${outfit.date}`;
  const serialized = JSON.stringify(compacted);

  const tryWrite = (storage: Storage | null, key: string) => {
    if (!storage) return false;
    storage.setItem(key, serialized);
    return true;
  };

  const localRetentionSteps = [MAX_STORED_OUTFITS, FALLBACK_STORED_OUTFITS, 1];

  for (const keep of localRetentionSteps) {
    try {
      pruneStoredOutfits(localStorageRef, OUTFIT_KEY_PREFIX, localKey, keep);
      if (tryWrite(localStorageRef, localKey)) {
        sessionStorageRef?.removeItem(sessionKey);
        memoryOutfitCache.set(outfit.date, compacted);
        return;
      }
    } catch (error) {
      if (!isQuotaExceededError(error)) {
        console.warn("Failed to save selected outfit:", error);
        break;
      }
    }
  }

  const sessionRetentionSteps = [FALLBACK_STORED_OUTFITS, 1];
  for (const keep of sessionRetentionSteps) {
    try {
      pruneStoredOutfits(sessionStorageRef, OUTFIT_SESSION_KEY_PREFIX, sessionKey, keep);
      if (tryWrite(sessionStorageRef, sessionKey)) {
        memoryOutfitCache.set(outfit.date, compacted);
        return;
      }
    } catch (error) {
      if (!isQuotaExceededError(error)) {
        console.warn("Failed to save selected outfit fallback:", error);
        break;
      }
    }
  }

  memoryOutfitCache.set(outfit.date, compacted);
  console.warn("Stored selected outfit only in memory because browser storage is full.");
}

/* ═══════════════════════════════════════════════
   SelectedRecipeRail
   ═══════════════════════════════════════════════ */
function SelectedRecipeRail({ draft }: { draft: Partial<Record<Slot, WardrobeItem>> }) {
  const selected = SLOT_ORDER.filter((s) => draft[s]);
  if (selected.length === 0) return null;

  return (
    <div className="px-4 py-1.5">
      <p className="text-[9px] text-gray-400 mb-1">選択中</p>
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {selected.map((slot) => {
          const item = draft[slot]!;
          return (
            <div key={slot} className="shrink-0 w-10 h-10 rounded-lg bg-white/70 border border-white/60 shadow-sm overflow-hidden relative">
              {item.imageUrl ? (
                <Image loader={passthroughLoader} src={item.imageUrl} alt={item.name} fill className="object-contain p-0.5" sizes="40px" unoptimized />
              ) : (
                <div className="flex items-center justify-center h-full text-gray-300 text-sm">👕</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   VisualCoordinatePanel
   ═══════════════════════════════════════════════ */
interface Props {
  date: string;
  events: EventContext[];
  weather?: WeatherContext;
  inventory: WardrobeItem[];
  onSave?: (payload: SavedOutfit) => Promise<void> | void;
  onClose?: () => void;
}

export default function VisualCoordinatePanel({
  date,
  events,
  weather,
  inventory,
  onSave,
  onClose,
}: Props) {
  /* ── 主予定 ── */
  const baseEvent = React.useMemo(() => computePrimaryEvent(events), [events]);

  /* ── ユーザー入力プロファイル（baseEvent をデフォルトに） ── */
  const [profileOverride, setProfileOverride] = React.useState<Partial<EventContext>>({});

  // base + override をマージした完全プロファイル
  const mergedProfile = React.useMemo<EventContext>(() => {
    const fallback: EventContext = {
      id: "__default",
      title: "通常",
      type: "errand",
      startAt: `${date}T10:00:00`,
    };
    const base = baseEvent ?? fallback;
    return { ...base, ...profileOverride } as EventContext;
  }, [baseEvent, profileOverride, date]);

  /* ── Intent（リアルタイム計算） ── */
  const intent = React.useMemo(
    () => computeIntent(mergedProfile, weather),
    [mergedProfile, weather],
  );

  const badges = React.useMemo(() => intentToBadges(intent), [intent]);

  /* ── 候補（Intent変化で再生成） ── */
  const candidates = React.useMemo(
    () => buildCandidates(inventory, intent),
    [inventory, intent],
  );

  /* ── Slot状態 ── */
  const initSlotState = (): Record<Slot, SlotState> => ({
    accessory: { index: 0, locked: false },
    outer: { index: 0, locked: false },
    top: { index: 0, locked: false },
    bottom: { index: 0, locked: false },
    shoes: { index: 0, locked: false },
  });

  const [slotState, setSlotState] = React.useState<Record<Slot, SlotState>>(initSlotState);
  const [saved, setSaved] = React.useState(false);

  // Intent/candidates が変わったら、ロックされていないスロットのindexをリセット
  const prevIntentRef = React.useRef(intent);
  React.useEffect(() => {
    if (prevIntentRef.current === intent) return;
    prevIntentRef.current = intent;
    setSlotState((prev) => {
      const next = { ...prev };
      for (const slot of SLOT_ORDER) {
        if (!prev[slot].locked) next[slot] = { index: 0, locked: false };
      }
      return next;
    });
    setSaved(false);
  }, [intent]);

  /* ── Draft（選択中アイテム） ── */
  const draft = React.useMemo(() => {
    const d: Partial<Record<Slot, WardrobeItem>> = {};
    for (const slot of SLOT_ORDER) {
      const cands = candidates[slot];
      const idx = slotState[slot].index;
      if (cands[idx]) d[slot] = cands[idx].item;
    }
    return d;
  }, [candidates, slotState]);

  /* ── 保存済みデータ復元 ── */
  React.useEffect(() => {
    const existing = loadOutfit(date);
    if (!existing) return;
    const newState = { ...slotState };
    let restored = false;
    for (const slot of SLOT_ORDER) {
      const savedItemId = existing.slotItemIds[slot];
      if (!savedItemId) continue;
      const idx = candidates[slot].findIndex((c) => c.item.id === savedItemId);
      if (idx >= 0) {
        newState[slot] = { index: idx, locked: existing.lockedSlots.includes(slot) };
        restored = true;
      }
    }
    if (restored) { setSlotState(newState); setSaved(true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  /* ── Handlers ── */
  const handleIndexChange = (slot: Slot, nextIndex: number) => {
    if (slotState[slot].locked) return;
    setSlotState((prev) => ({ ...prev, [slot]: { ...prev[slot], index: nextIndex } }));
    setSaved(false);
  };

  const handleToggleLock = (slot: Slot) => {
    setSlotState((prev) => ({ ...prev, [slot]: { ...prev[slot], locked: !prev[slot].locked } }));
  };

  const handleProfileChange = (patch: Partial<EventContext>) => {
    setProfileOverride((prev) => ({ ...prev, ...patch }));
  };

  const handleSave = async () => {
    const payload: SavedOutfit = {
      date,
      primaryEventId: mergedProfile.id,
      slotItemIds: Object.fromEntries(
        SLOT_ORDER.filter((s) => draft[s]).map((s) => [s, draft[s]!.id]),
      ) as Partial<Record<Slot, string>>,
      lockedSlots: SLOT_ORDER.filter((s) => slotState[s].locked),
      intentSnapshot: intent,
      createdAt: new Date().toISOString(),
    };
    saveOutfitToStorage(payload);
    setSaved(true);
    if (onSave) await onSave(payload);
  };

  const handleReset = () => {
    setSlotState(initSlotState());
    setProfileOverride({});
    setSaved(false);
  };

  const hasAnyCandidates = SLOT_ORDER.some((s) => candidates[s].length > 0);

  /* ── 日付ヘッダー ── */
  const dateObj = new Date(date + "T00:00:00");
  const weekday = ["日", "月", "火", "水", "木", "金", "土"][dateObj.getDay()];
  const mm = dateObj.getMonth() + 1;
  const dd = dateObj.getDate();

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <div className="sticky top-0 z-20 bg-white/90 backdrop-blur-xl border-b border-white/50">
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <div className="flex items-baseline gap-2">
            <h2 className="text-sm font-bold text-gray-800">コーデ選択</h2>
            <span className="text-xs text-gray-500">
              {mm}/{dd} ({weekday})
            </span>
            {weather?.tempC != null && (
              <span className="text-[10px] text-gray-400">
                {weather.condition === "rain" ? "🌧️" : weather.condition === "snow" ? "❄️" : weather.condition === "cloudy" ? "☁️" : "☀️"}
                {weather.tempC}°C
              </span>
            )}
          </div>
          {onClose && (
            <motion.button whileTap={{ scale: 0.9 }} onClick={onClose} className="text-gray-400 text-lg">
              ✕
            </motion.button>
          )}
        </div>
      </div>

      {/* ── 予定プロファイル入力 ── */}
      <div className="px-4 py-2 border-b border-gray-100/50">
        <EventProfileForm
          profile={mergedProfile}
          onChange={handleProfileChange}
          badges={badges}
        />
      </div>

      {/* ── 選択中プレビュー ── */}
      <SelectedRecipeRail draft={draft} />

      {/* ── スロット一覧 ── */}
      {hasAnyCandidates ? (
        <div className="flex-1 overflow-y-auto pb-20">
          {SLOT_ORDER.map((slot) => (
            <SlotSwipeLane
              key={slot}
              slot={slot}
              items={candidates[slot].map((c) => c.item)}
              index={slotState[slot].index}
              locked={slotState[slot].locked}
              onIndexChange={(i) => handleIndexChange(slot, i)}
              onToggleLock={() => handleToggleLock(slot)}
            />
          ))}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-gray-400 px-8">
            <p className="text-3xl mb-3">👗</p>
            <p className="text-sm">ワードローブにアイテムがありません</p>
            <p className="text-xs mt-1 text-gray-300">マイスタイルからアイテムを登録してください</p>
          </div>
        </div>
      )}

      {/* ── Actions ── */}
      {hasAnyCandidates && (
        <div className="sticky bottom-0 z-20 bg-white/90 backdrop-blur-xl border-t border-white/50 px-4 py-3 flex gap-2">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleReset}
            className="flex-shrink-0 px-4 py-2.5 rounded-xl bg-gray-100/80 text-gray-500 text-xs font-medium border border-gray-200/50"
          >
            リセット
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleSave}
            className={`
              flex-1 py-2.5 rounded-xl text-sm font-bold transition-all
              ${saved
                ? "bg-emerald-50/80 text-emerald-600 border border-emerald-200/60"
                : "bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-300/30"
              }
            `}
          >
            {saved ? "保存済み ✓" : "このコーデで決定"}
          </motion.button>
        </div>
      )}
    </div>
  );
}
