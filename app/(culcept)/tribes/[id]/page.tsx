"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  LightBackground,
  GlassNavbar,
  GlassCard,
  GlassButton,
  GlassBadge,
  FadeInView,
  FloatingNavLight,
} from "@/components/ui/glassmorphism-design";
import { getStyleDrive } from "@/lib/styleDrive";
import {
  type CustomTribe,
  type CustomTribeTopic,
  createCustomTopic,
  readCustomTopics,
  readCustomTribes,
  writeCustomTopics,
} from "@/lib/customTribes";
import { MAIN_NAV } from "@/lib/navigation";

type DrivePost = {
  card_id: string;
  image_url: string;
  title: string;
  tags: string[];
  score: number;
  upvotes: number;
  downvotes: number;
  myVote: number;
};


function formatRelativeTime(value?: string | null) {
  if (!value) return "just now";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "just now";
  const diff = Date.now() - time;
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;
  if (diff < hour) return `${Math.max(1, Math.round(diff / (60 * 1000)))}分前`;
  if (diff < day) return `${Math.max(1, Math.round(diff / hour))}時間前`;
  return `${Math.max(1, Math.round(diff / day))}日前`;
}

export default function DriveDetailPage() {
  const params = useParams<{ id: string | string[] }>();
  const router = useRouter();
  const driveId = Array.isArray(params?.id) ? params?.id?.[0] ?? "" : params?.id ?? "";
  const drive = useMemo(() => getStyleDrive(driveId), [driveId]);

  const [posts, setPosts] = useState<DrivePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState<string | null>(null);
  const [creatingBattle, setCreatingBattle] = useState(false);
  const [customTribe, setCustomTribe] = useState<CustomTribe | null>(null);
  const [topics, setTopics] = useState<CustomTribeTopic[]>([]);
  const [topicDraft, setTopicDraft] = useState({ title: "", body: "" });

  useEffect(() => {
    if (!driveId) return;

    if (!drive) {
      const match = readCustomTribes().find((tribe) => tribe.id === driveId) ?? null;
      setCustomTribe(match);
      setTopics(match ? readCustomTopics(match.id) : []);
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        const res = await fetch(`/api/tribes/${driveId}/posts`);
        const data = await res.json();
        setPosts(data.posts || []);
      } catch (error) {
        console.error("Failed to load drive posts:", error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [driveId, drive]);

  const handleVote = async (cardId: string, vote: number) => {
    if (voting) return;
    setVoting(cardId);
    try {
      const res = await fetch(`/api/tribes/${driveId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ card_id: cardId, vote }),
      });
      const data = await res.json();
      setPosts((prev) =>
        prev.map((post) =>
          post.card_id === cardId
            ? { ...post, score: data.score, upvotes: data.upvotes, downvotes: data.downvotes, myVote: vote }
            : post
        )
      );
    } catch (error) {
      console.error("Vote failed:", error);
    } finally {
      setVoting(null);
    }
  };

  const handleCreateBattle = async () => {
    if (creatingBattle) return;
    setCreatingBattle(true);
    try {
      const res = await fetch(`/api/tribes/${driveId}/battle`, { method: "POST" });
      const data = await res.json();
      if (data?.battleId) {
        router.push(`/battle/drive-${data.battleId}`);
        return;
      }
    } catch (error) {
      console.error("Battle create failed:", error);
    } finally {
      setCreatingBattle(false);
    }
  };

  const handleAddTopic = () => {
    if (!customTribe || !topicDraft.title.trim() || !topicDraft.body.trim()) return;
    const topic = createCustomTopic(topicDraft);
    const next = [topic, ...topics];
    setTopics(next);
    writeCustomTopics(customTribe.id, next);
    setTopicDraft({ title: "", body: "" });
  };

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

  if (!drive && !customTribe) {
    return (
      <LightBackground>
        <div className="min-h-screen flex items-center justify-center text-gray-500">
          コミュニティが見つかりません
        </div>
      </LightBackground>
    );
  }

  if (customTribe) {
    return (
      <LightBackground>
        <GlassNavbar>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/tribes"
                className="w-10 h-10 rounded-xl bg-white/50 backdrop-blur-sm border border-white/60 flex items-center justify-center text-gray-500 hover:bg-white/80 transition-all shadow-sm"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <div>
                <h1 className="text-xl font-bold text-gray-800">{customTribe.name}</h1>
                <p className="text-xs text-gray-400">Custom Community</p>
              </div>
            </div>
            <GlassBadge variant="gradient" size="sm">CUSTOM</GlassBadge>
          </div>
        </GlassNavbar>

        <div className="h-24" />

        <main className="max-w-5xl mx-auto px-4 sm:px-6 pb-32 space-y-8">
          <FadeInView>
            <GlassCard className="overflow-hidden">
              <div
                className="absolute inset-0 opacity-10"
                style={{ background: `linear-gradient(135deg, ${customTribe.accent}, rgba(255,255,255,0.95))` }}
              />
              <div className="relative p-8 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-4">
                  <div
                    className="flex h-16 w-16 items-center justify-center rounded-2xl text-3xl text-white shadow-lg"
                    style={{ background: `linear-gradient(135deg, ${customTribe.accent}, #ffffff33)` }}
                  >
                    {customTribe.icon}
                  </div>
                  <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <GlassBadge variant="gradient" size="sm">OWNER SPACE</GlassBadge>
                      <span className="text-xs text-slate-400">{customTribe.members.toLocaleString()} members</span>
                    </div>
                    <h2 className="text-2xl font-bold text-gray-800">{customTribe.name}</h2>
                    <p className="mt-2 max-w-2xl text-gray-500">{customTribe.description}</p>
                    {customTribe.tags.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {customTribe.tags.map((tag) => (
                          <span key={tag} className="rounded-full border border-white/80 bg-white/70 px-3 py-1 text-xs text-slate-500">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-3 rounded-3xl border border-white/70 bg-white/70 p-5 lg:max-w-xs">
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Discussion Focus</div>
                  <p className="text-sm leading-6 text-slate-600">{customTribe.prompt}</p>
                  <div className="flex flex-wrap gap-2">
                    <GlassButton href="/my-style" variant="secondary" size="sm">My Style</GlassButton>
                    <GlassButton href="/drops/new" variant="primary" size="sm">商品を追加</GlassButton>
                  </div>
                </div>
              </div>
            </GlassCard>
          </FadeInView>

          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <FadeInView>
              <GlassCard>
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-bold text-slate-900">トピックを追加</div>
                    <p className="text-xs text-slate-400">コミュニティで話したい観点を残していけます。</p>
                  </div>
                  <GlassBadge variant="default" size="sm">{topics.length} topics</GlassBadge>
                </div>

                <div className="space-y-3">
                  <input
                    value={topicDraft.title}
                    onChange={(e) => setTopicDraft((prev) => ({ ...prev, title: e.target.value }))}
                    className="w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm outline-none focus:border-violet-400"
                    placeholder="例: 今週のジャケット共有"
                  />
                  <textarea
                    value={topicDraft.body}
                    onChange={(e) => setTopicDraft((prev) => ({ ...prev, body: e.target.value }))}
                    className="min-h-[120px] w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm outline-none focus:border-violet-400"
                    placeholder="共有したいルール、観点、今見たい商品などを書いてください。"
                  />
                  <GlassButton onClick={handleAddTopic} variant="gradient" size="sm">
                    トピックを追加
                  </GlassButton>
                </div>
              </GlassCard>
            </FadeInView>

            <FadeInView delay={0.05}>
              <GlassCard>
                <div className="mb-4 text-sm font-bold text-slate-900">運用テンプレート</div>
                <div className="space-y-3 text-sm text-slate-600">
                  {[
                    "今週のベストコーデ",
                    "買う前に見たい採寸ポイント",
                    "色合わせの成功例 / 失敗例",
                  ].map((item) => (
                    <div key={item} className="rounded-2xl border border-white/80 bg-white/70 px-4 py-3">
                      {item}
                    </div>
                  ))}
                </div>
              </GlassCard>
            </FadeInView>
          </div>

          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-xl">📝</span>
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Community Topics</h3>
            </div>
            {topics.length === 0 ? (
              <GlassCard className="p-10 text-center">
                <div className="text-5xl mb-4">💡</div>
                <h3 className="text-xl font-bold text-gray-800 mb-2">まだトピックがありません</h3>
                <p className="text-gray-500">上のフォームから、コミュニティの最初の話題を作れます。</p>
              </GlassCard>
            ) : (
              <div className="space-y-4">
                {topics.map((topic, index) => (
                  <FadeInView key={topic.id} delay={0.03 * index}>
                    <GlassCard>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-lg font-bold text-slate-900">{topic.title}</div>
                          <p className="mt-2 text-sm leading-6 text-slate-600">{topic.body}</p>
                        </div>
                        <GlassBadge variant="default" size="sm">{formatRelativeTime(topic.createdAt)}</GlassBadge>
                      </div>
                    </GlassCard>
                  </FadeInView>
                ))}
              </div>
            )}
          </section>
        </main>

        <FloatingNavLight items={MAIN_NAV} activeHref="/tribes" />
        <div className="h-24" />
      </LightBackground>
    );
  }

  return (
    <LightBackground>
      <GlassNavbar>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/tribes"
              className="w-10 h-10 rounded-xl bg-white/50 backdrop-blur-sm border border-white/60 flex items-center justify-center text-gray-500 hover:bg-white/80 transition-all shadow-sm"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-xl font-bold text-gray-800">{drive?.name}</h1>
              <p className="text-xs text-gray-400">Curated Community</p>
            </div>
          </div>
          <GlassBadge variant="gradient" size="sm">VOTE</GlassBadge>
        </div>
      </GlassNavbar>

      <div className="h-24" />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 pb-32">
        <FadeInView>
          <GlassCard className="mb-8 overflow-hidden">
            <div className={`absolute inset-0 bg-gradient-to-br ${drive?.gradient} opacity-10`} />
            <div className="relative p-8 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${drive?.gradient} text-white flex items-center justify-center text-3xl shadow-lg`}>
                  {drive?.icon}
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-800">{drive?.name}</h2>
                  <p className="text-gray-500">{drive?.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <GlassButton variant="secondary" size="sm" href="/battle">
                  バトルを見る
                </GlassButton>
                <GlassButton variant="primary" size="sm" onClick={handleCreateBattle}>
                  {creatingBattle ? "開催中..." : "勝者でバトル開催"}
                </GlassButton>
              </div>
            </div>
          </GlassCard>
        </FadeInView>

        {posts.length === 0 ? (
          <GlassCard className="p-10 text-center">
            <div className="text-5xl mb-4">📭</div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">投稿がまだありません</h3>
            <p className="text-gray-500">コーデが集まり次第、投票が始まります。</p>
          </GlassCard>
        ) : (
          <div className="space-y-4">
            {posts.map((post, index) => (
              <FadeInView key={post.card_id} delay={0.03 * index}>
                <GlassCard className="overflow-hidden">
                  <div className="relative flex flex-col md:flex-row">
                    <div className="w-full md:w-20 flex md:flex-col items-center justify-center gap-2 border-b md:border-b-0 md:border-r border-white/60 bg-white/40 p-3">
                      <button
                        className={`w-9 h-9 rounded-full border flex items-center justify-center text-lg transition-colors ${
                          post.myVote === 1
                            ? "bg-emerald-100 border-emerald-300 text-emerald-500"
                            : "bg-white/70 border-white/80 text-gray-400 hover:text-emerald-500"
                        }`}
                        onClick={() => handleVote(post.card_id, post.myVote === 1 ? 0 : 1)}
                      >
                        ▲
                      </button>
                      <div className="text-sm font-bold text-gray-700">{post.score}</div>
                      <button
                        className={`w-9 h-9 rounded-full border flex items-center justify-center text-lg transition-colors ${
                          post.myVote === -1
                            ? "bg-rose-100 border-rose-300 text-rose-500"
                            : "bg-white/70 border-white/80 text-gray-400 hover:text-rose-500"
                        }`}
                        onClick={() => handleVote(post.card_id, post.myVote === -1 ? 0 : -1)}
                      >
                        ▼
                      </button>
                    </div>

                    <div className="flex-1 p-5">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          {index === 0 && <GlassBadge variant="gradient" size="sm">TOP</GlassBadge>}
                          <span className="text-sm text-gray-400">Community Vote</span>
                        </div>
                        <span className="text-xs text-gray-400">{post.upvotes} up / {post.downvotes} down</span>
                      </div>
                      <h3 className="text-lg font-bold text-gray-800 mb-2">{post.title}</h3>
                      <div className="flex flex-wrap gap-2 mb-4">
                        {(post.tags || []).slice(0, 4).map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-1 rounded-full bg-white/70 border border-white/80 text-xs text-gray-500"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                      <div className="relative rounded-2xl overflow-hidden border border-white/70 bg-white/70 h-64 sm:h-80">
                        <Image
                          src={post.image_url}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="(min-width: 768px) 720px, 100vw"
                        />
                      </div>
                    </div>
                  </div>
                </GlassCard>
              </FadeInView>
            ))}
          </div>
        )}
      </main>

      <FloatingNavLight items={MAIN_NAV} activeHref="/tribes" />
      <div className="h-24" />
    </LightBackground>
  );
}
