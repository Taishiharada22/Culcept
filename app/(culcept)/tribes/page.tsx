"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  LightBackground,
  GlassNavbar,
  GlassCard,
  GlassButton,
  FadeInView,
  FloatingNavLight,
  GlassBadge,
} from "@/components/ui/glassmorphism-design";
import { STYLE_DRIVES } from "@/lib/styleDrive";
import {
  type CustomTribe,
  createCustomTribe,
  readCustomJoinedIds,
  readCustomTribes,
  writeCustomJoinedIds,
  writeCustomTribes,
} from "@/lib/customTribes";
import { MAIN_NAV } from "@/lib/navigation";

type Tribe = {
  id: string;
  name: string;
  description: string;
  icon: string;
  members: number;
  posts: number;
  joined: boolean;
  featured_items: { id: string; image_url: string }[];
  kind?: "curated" | "custom";
  accent?: string;
  prompt?: string;
  tags?: string[];
};

const DRIVE_MAP = new Map(STYLE_DRIVES.map((d) => [d.id, d]));
const PRESET_ACCENTS = ["#8B5CF6", "#EC4899", "#06B6D4", "#10B981", "#F59E0B", "#EF4444"];
const QUICK_TAGS = ["minimal", "street", "vintage", "luxury", "casual", "fit", "color", "swap"];


function tribeAccent(tribe: Tribe) {
  if (tribe.kind === "custom") return tribe.accent ?? "#8B5CF6";
  return DRIVE_MAP.get(tribe.id)?.accent ?? "#8B5CF6";
}

function tribeGradient(tribe: Tribe) {
  if (tribe.kind === "custom") return `linear-gradient(135deg, ${tribeAccent(tribe)}, rgba(255,255,255,0.9))`;
  const drive = DRIVE_MAP.get(tribe.id);
  return drive ? undefined : `linear-gradient(135deg, ${tribeAccent(tribe)}, rgba(255,255,255,0.9))`;
}

function mergeTribes(curated: Tribe[], custom: CustomTribe[], joinedIds: string[]) {
  const curatedMapped = curated.map((tribe) => ({
    ...tribe,
    kind: "curated" as const,
    joined: joinedIds.includes(tribe.id) || tribe.joined,
  }));

  const customMapped = custom.map((tribe) => ({
    ...tribe,
    kind: "custom" as const,
    joined: joinedIds.includes(tribe.id) || tribe.joined,
  }));

  return [...customMapped, ...curatedMapped];
}

function TribePreviewStrip({ tribe }: { tribe: Tribe }) {
  const accent = tribeAccent(tribe);

  if (!tribe.featured_items?.length) {
    return (
      <div className="flex gap-2">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="h-12 w-12 rounded-xl border border-white/70"
            style={{
              background: `linear-gradient(135deg, ${accent}22, rgba(255,255,255,0.95))`,
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {tribe.featured_items.slice(0, 4).map((item) => (
        <div key={item.id} className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-white/70 bg-white/70">
          <Image src={item.image_url} alt="" fill className="object-cover" sizes="48px" />
        </div>
      ))}
    </div>
  );
}

export default function TribesPage() {
  const [tribes, setTribes] = useState<Tribe[]>([]);
  const [loading, setLoading] = useState(true);
  const [joinedIds, setJoinedIds] = useState<string[]>([]);
  const [showComposer, setShowComposer] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const joinedIdsRef = useRef<string[]>([]);
  const [form, setForm] = useState({
    name: "",
    description: "",
    icon: "🫶",
    accent: PRESET_ACCENTS[0],
    tags: "minimal, fit",
    prompt: "",
  });

  useEffect(() => {
    joinedIdsRef.current = joinedIds;
  }, [joinedIds]);

  useEffect(() => {
    const fetchTribes = async () => {
      try {
        const res = await fetch("/api/tribes", { cache: "no-store" });
        const data = await res.json();
        const custom = readCustomTribes();
        const localJoined = readCustomJoinedIds();
        const mergedJoined = Array.from(new Set([...(data.myTribes || []), ...localJoined]));
        setJoinedIds(mergedJoined);
        setTribes(mergeTribes(data.tribes || [], custom, mergedJoined));
      } catch (error) {
        const custom = readCustomTribes();
        const localJoined = readCustomJoinedIds();
        setJoinedIds(localJoined);
        setTribes(mergeTribes([], custom, localJoined));
        console.error("Failed to fetch communities:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchTribes();

    if (window.location.hash === "#create") {
      setShowComposer(true);
    }

    const onStorage = () => {
      const custom = readCustomTribes();
      const localJoined = readCustomJoinedIds();
      setJoinedIds((prev) => Array.from(new Set([...prev.filter((id) => !id.startsWith("custom-")), ...localJoined])));
      setTribes((prev) => {
        const curated = prev.filter((tribe) => tribe.kind !== "custom");
        return mergeTribes(curated, custom, Array.from(new Set([...joinedIdsRef.current, ...localJoined])));
      });
    };

    const onHashChange = () => {
      if (window.location.hash === "#create") setShowComposer(true);
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("hashchange", onHashChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("hashchange", onHashChange);
    };
  }, []);

  const updateCustomJoinState = (tribeId: string, nextJoined: boolean) => {
    const nextIds = nextJoined ? Array.from(new Set([...joinedIds, tribeId])) : joinedIds.filter((id) => id !== tribeId);
    setJoinedIds(nextIds);
    writeCustomJoinedIds(nextIds.filter((id) => id.startsWith("custom-")));
    setTribes((prev) =>
      prev.map((tribe) =>
        tribe.id === tribeId
          ? {
              ...tribe,
              joined: nextJoined,
              members: Math.max(1, tribe.members + (nextJoined ? 1 : -1)),
            }
          : tribe
      )
    );
  };

  const toggleJoin = async (tribe: Tribe) => {
    const isJoined = joinedIds.includes(tribe.id);

    if (tribe.kind === "custom") {
      updateCustomJoinState(tribe.id, !isJoined);
      return;
    }

    try {
      await fetch(`/api/tribes/${tribe.id}/join`, {
        method: isJoined ? "DELETE" : "POST",
      });

      const nextIds = isJoined ? joinedIds.filter((id) => id !== tribe.id) : [...joinedIds, tribe.id];
      setJoinedIds(nextIds);
      setTribes((prev) =>
        prev.map((item) =>
          item.id === tribe.id
            ? { ...item, members: Math.max(0, item.members + (isJoined ? -1 : 1)), joined: !isJoined }
            : item
        )
      );
    } catch (error) {
      console.error("Join/leave failed:", error);
    }
  };

  const handleCreateCommunity = () => {
    if (!form.name.trim() || !form.description.trim()) {
      setMessage("名前と説明は必須です。");
      return;
    }

    const community = createCustomTribe({
      name: form.name,
      description: form.description,
      icon: form.icon,
      accent: form.accent,
      tags: form.tags.split(","),
      prompt: form.prompt,
    });

    const currentCustom = readCustomTribes();
    const nextCustom = [community, ...currentCustom];
    writeCustomTribes(nextCustom);

    const nextJoined = Array.from(new Set([...joinedIds, community.id]));
    writeCustomJoinedIds(nextJoined.filter((id) => id.startsWith("custom-")));

    setJoinedIds(nextJoined);
    setTribes((prev) => [community, ...prev]);
    setForm({
      name: "",
      description: "",
      icon: "🫶",
      accent: PRESET_ACCENTS[0],
      tags: "minimal, fit",
      prompt: "",
    });
    setShowComposer(false);
    setMessage("新しいコミュニティを作成しました。");
  };

  const joinedTribes = useMemo(() => tribes.filter((tribe) => joinedIds.includes(tribe.id) || tribe.joined), [tribes, joinedIds]);
  const discoverTribes = useMemo(() => tribes.filter((tribe) => !joinedIds.includes(tribe.id) && !tribe.joined), [tribes, joinedIds]);
  const customCount = tribes.filter((tribe) => tribe.kind === "custom").length;

  if (loading) {
    return (
      <LightBackground>
        <div className="min-h-screen flex items-center justify-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="w-16 h-16 rounded-full border-4 border-violet-200 border-t-violet-500"
          />
        </div>
      </LightBackground>
    );
  }

  return (
    <LightBackground>
      <GlassNavbar>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="w-10 h-10 rounded-xl bg-white/50 backdrop-blur-sm border border-white/60 flex items-center justify-center text-gray-500 hover:bg-white/80 transition-all shadow-sm"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-gray-800">コミュニティ</h1>
              <p className="text-xs text-gray-400">参加も作成も、この画面から完結</p>
            </div>
          </div>
          <GlassBadge variant="gradient" size="sm">COMMUNITY</GlassBadge>
        </div>
      </GlassNavbar>

      <div className="h-24" />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 pb-32">
        <FadeInView>
          <GlassCard className="mb-8 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-violet-400/15 via-transparent to-cyan-400/15" />
            <div className="relative p-8">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <div className="mb-3 flex items-center gap-2">
                    <GlassBadge variant="gradient" size="sm">YOUR SPACE</GlassBadge>
                    <span className="text-xs text-slate-400">Aneurasyncから直結</span>
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">自分のコミュニティを作る。</h2>
                  <p className="text-gray-500 max-w-2xl">
                    固定のドライブに乗るだけでなく、自分のテーマで部屋を作れるようにしました。
                    好みのタグ、話したい視点、共有したい空気感をそのままコミュニティにできます。
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <div className="rounded-2xl border border-white/70 bg-white/70 px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Joined</div>
                    <div className="text-2xl font-black text-slate-900">{joinedTribes.length}</div>
                  </div>
                  <div className="rounded-2xl border border-white/70 bg-white/70 px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Custom</div>
                    <div className="text-2xl font-black text-slate-900">{customCount}</div>
                  </div>
                  <GlassButton onClick={() => setShowComposer((prev) => !prev)} variant="gradient" size="sm">
                    {showComposer ? "閉じる" : "コミュニティを作成"}
                  </GlassButton>
                </div>
              </div>
            </div>
          </GlassCard>
        </FadeInView>

        {showComposer && (
          <FadeInView>
            <GlassCard className="mb-10">
              <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <div className="mb-2 text-sm font-semibold text-slate-700">コミュニティ名</div>
                      <input
                        value={form.name}
                        onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                        className="w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm outline-none focus:border-violet-400"
                        placeholder="例: Minimal Office Club"
                      />
                    </label>
                    <label className="block">
                      <div className="mb-2 text-sm font-semibold text-slate-700">アイコン</div>
                      <input
                        value={form.icon}
                        onChange={(e) => setForm((prev) => ({ ...prev, icon: e.target.value }))}
                        className="w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm outline-none focus:border-violet-400"
                        placeholder="🫶"
                      />
                    </label>
                  </div>

                  <label className="block">
                    <div className="mb-2 text-sm font-semibold text-slate-700">説明</div>
                    <textarea
                      value={form.description}
                      onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                      className="min-h-[92px] w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm outline-none focus:border-violet-400"
                      placeholder="どんな人が集まる場所か、何を共有したいかを書いてください。"
                    />
                  </label>

                  <label className="block">
                    <div className="mb-2 text-sm font-semibold text-slate-700">フォーカスタグ</div>
                    <input
                      value={form.tags}
                      onChange={(e) => setForm((prev) => ({ ...prev, tags: e.target.value }))}
                      className="w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm outline-none focus:border-violet-400"
                      placeholder="minimal, fit, color"
                    />
                    <div className="mt-3 flex flex-wrap gap-2">
                      {QUICK_TAGS.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs text-slate-600"
                          onClick={() =>
                            setForm((prev) => {
                              const current = prev.tags.split(",").map((value) => value.trim()).filter(Boolean);
                              if (current.includes(tag)) return prev;
                              return { ...prev, tags: [...current, tag].join(", ") };
                            })
                          }
                        >
                          + {tag}
                        </button>
                      ))}
                    </div>
                  </label>

                  <label className="block">
                    <div className="mb-2 text-sm font-semibold text-slate-700">このコミュニティで話したいこと</div>
                    <textarea
                      value={form.prompt}
                      onChange={(e) => setForm((prev) => ({ ...prev, prompt: e.target.value }))}
                      className="min-h-[80px] w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm outline-none focus:border-violet-400"
                      placeholder="例: 通勤服でもミニマルを崩さないバランス、骨格に合うジャケットの共有"
                    />
                  </label>

                  <div>
                    <div className="mb-2 text-sm font-semibold text-slate-700">アクセントカラー</div>
                    <div className="flex flex-wrap gap-3">
                      {PRESET_ACCENTS.map((accent) => (
                        <button
                          key={accent}
                          type="button"
                          className={`h-10 w-10 rounded-full border-2 ${form.accent === accent ? "border-slate-900" : "border-white"}`}
                          style={{ backgroundColor: accent }}
                          onClick={() => setForm((prev) => ({ ...prev, accent }))}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <GlassButton onClick={handleCreateCommunity} variant="gradient" size="sm">
                      この内容で作成
                    </GlassButton>
                    {message && <span className="text-sm text-slate-500">{message}</span>}
                  </div>
                </div>

                <div className="rounded-[28px] border border-white/80 bg-white/70 p-5">
                  <div className="mb-4 text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Preview</div>
                  <div
                    className="rounded-[28px] p-5 text-white shadow-lg"
                    style={{ background: `linear-gradient(135deg, ${form.accent}, #ffffff22)` }}
                  >
                    <div className="mb-4 flex items-center justify-between">
                      <div className="text-3xl">{form.icon || "🫶"}</div>
                      <GlassBadge variant="gradient" size="sm">CUSTOM</GlassBadge>
                    </div>
                    <div className="text-xl font-black">{form.name || "コミュニティ名"}</div>
                    <p className="mt-2 text-sm text-white/85">
                      {form.description || "説明を入れると、ここにプレビューされます。"}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {form.tags.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 5).map((tag) => (
                        <span key={tag} className="rounded-full bg-white/20 px-3 py-1 text-xs font-medium">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </GlassCard>
          </FadeInView>
        )}

        {joinedTribes.length > 0 && (
          <section className="mb-10">
            <div className="mb-4 flex items-center gap-2">
              <span className="text-xl">🫱🏻‍🫲🏼</span>
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">My Communities</h3>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {joinedTribes.map((tribe, index) => (
                <FadeInView key={tribe.id} delay={0.05 * index}>
                  <Link href={`/tribes/${tribe.id}`} className="block group">
                    <GlassCard hoverEffect className="overflow-hidden">
                      <div
                        className="absolute inset-0 opacity-10"
                        style={tribeGradient(tribe) ? { background: tribeGradient(tribe) } : undefined}
                      />
                      <div className="relative p-6">
                        <div className="mb-4 flex items-start justify-between gap-3">
                          <div className="flex items-center gap-4">
                            <div
                              className="flex h-12 w-12 items-center justify-center rounded-2xl text-2xl text-white shadow-lg"
                              style={{ background: `linear-gradient(135deg, ${tribeAccent(tribe)}, #ffffff33)` }}
                            >
                              {tribe.icon}
                            </div>
                            <div>
                              <div className="font-bold text-gray-800">{tribe.name}</div>
                              <div className="text-xs text-gray-500">{tribe.members.toLocaleString()} members</div>
                            </div>
                          </div>
                          <GlassBadge variant={tribe.kind === "custom" ? "gradient" : "default"} size="sm">
                            {tribe.kind === "custom" ? "CUSTOM" : "JOINED"}
                          </GlassBadge>
                        </div>
                        <p className="mb-4 text-sm leading-6 text-slate-500">{tribe.description}</p>
                        <TribePreviewStrip tribe={tribe} />
                      </div>
                    </GlassCard>
                  </Link>
                </FadeInView>
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="mb-4 flex items-center gap-2">
            <span className="text-xl">🛰️</span>
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Discover Communities</h3>
          </div>
          <div className="space-y-4">
            {discoverTribes.map((tribe, index) => (
              <FadeInView key={tribe.id} delay={0.05 * index}>
                <GlassCard className="overflow-hidden">
                  <div
                    className="absolute inset-0 opacity-10"
                    style={tribeGradient(tribe) ? { background: tribeGradient(tribe) } : undefined}
                  />
                  <div className="relative p-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-4">
                        <div
                          className="flex h-14 w-14 items-center justify-center rounded-2xl text-2xl text-white shadow-lg"
                          style={{ background: `linear-gradient(135deg, ${tribeAccent(tribe)}, #ffffff33)` }}
                        >
                          {tribe.icon}
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-lg font-bold text-gray-800">{tribe.name}</div>
                            {tribe.kind === "custom" && <GlassBadge variant="gradient" size="sm">CUSTOM</GlassBadge>}
                          </div>
                          <div className="text-sm text-gray-500">{tribe.description}</div>
                          <div className="mt-2 text-xs text-gray-400">
                            👥 {tribe.members.toLocaleString()} ・ 📝 {tribe.posts} posts
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <GlassButton
                          variant={joinedIds.includes(tribe.id) ? "ghost" : "secondary"}
                          size="sm"
                          onClick={() => toggleJoin(tribe)}
                        >
                          {joinedIds.includes(tribe.id) ? "参加中" : "参加する"}
                        </GlassButton>
                        <GlassButton href={`/tribes/${tribe.id}`} variant="primary" size="sm">
                          開く
                        </GlassButton>
                      </div>
                    </div>

                    {tribe.tags?.length ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {tribe.tags.slice(0, 6).map((tag) => (
                          <span key={tag} className="rounded-full border border-white/80 bg-white/70 px-2.5 py-1 text-xs text-slate-500">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    <div className="mt-4">
                      <TribePreviewStrip tribe={tribe} />
                    </div>
                  </div>
                </GlassCard>
              </FadeInView>
            ))}
          </div>
        </section>
      </main>

      <FloatingNavLight items={MAIN_NAV} activeHref="/tribes" />
      <div className="h-24" />
    </LightBackground>
  );
}
