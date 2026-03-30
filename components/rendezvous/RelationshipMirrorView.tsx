"use client";

import { motion } from "framer-motion";
import {
  GlassCard,
  GlassBadge,
  FadeInView,
} from "@/components/ui/glassmorphism-design";
import type {
  MirrorProfile,
  RelationshipArchetype,
} from "@/lib/rendezvous/relationshipMirror";

// ---------- Archetype Icons ----------

const ARCHETYPE_ICONS: Record<RelationshipArchetype, string> = {
  quiet_catalyst: "\u{1F9EA}",    // test tube
  mutual_grower: "\u{1F331}",     // seedling
  deep_diver: "\u{1F30A}",        // ocean wave
  social_weaver: "\u{1F578}",     // spider web
  storm_chaser: "\u{26C8}",       // cloud with lightning
  steady_anchor: "\u{2693}",      // anchor
  bridge_builder: "\u{1F309}",    // bridge at night
  mirror_seeker: "\u{1FA9E}",     // mirror
};

const CATEGORY_LABELS: Record<string, string> = {
  romantic: "\u30ED\u30DE\u30F3\u30C6\u30A3\u30C3\u30AF",
  friendship: "\u53CB\u60C5",
  cocreation: "\u5171\u5275",
  community: "\u30B3\u30DF\u30E5\u30CB\u30C6\u30A3",
};

const PATTERN_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  attraction: { label: "\u5F15\u529B", color: "text-pink-600" },
  avoidance: { label: "\u56DE\u907F", color: "text-amber-600" },
  growth: { label: "\u6210\u9577", color: "text-emerald-600" },
  comfort: { label: "\u5B89\u5FC3", color: "text-blue-600" },
  friction: { label: "\u6469\u64E6", color: "text-orange-600" },
  transformation: { label: "\u5909\u5BB9", color: "text-violet-600" },
};

// ---------- Sub-components ----------

function ArchetypeCard({
  persona,
}: {
  persona: MirrorProfile["relationshipPersona"];
}) {
  const icon = ARCHETYPE_ICONS[persona.archetype];

  return (
    <FadeInView delay={0.1}>
      <GlassCard className="relative overflow-hidden border-indigo-200/50">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent pointer-events-none" />

        <div className="relative p-6">
          <div className="flex items-center gap-3 mb-4">
            <motion.span
              className="text-4xl"
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 200, delay: 0.3 }}
            >
              {icon}
            </motion.span>
            <div>
              <p className="text-xs text-indigo-500 font-medium tracking-wider">
                {"\u3042\u306A\u305F\u306E\u95A2\u4FC2\u6027\u30D1\u30FC\u30BD\u30CA\u30EA\u30C6\u30A3"}
              </p>
              <h2 className="text-2xl font-bold text-slate-800">
                {persona.title}
              </h2>
            </div>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">
            {persona.description}
          </p>
        </div>
      </GlassCard>
    </FadeInView>
  );
}

function PatternCard({
  pattern,
  index,
}: {
  pattern: MirrorProfile["patterns"][number];
  index: number;
}) {
  const meta = PATTERN_TYPE_LABELS[pattern.type] ?? {
    label: pattern.type,
    color: "text-slate-600",
  };

  return (
    <FadeInView delay={0.15 + index * 0.08}>
      <GlassCard className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <GlassBadge
              variant="default"
              size="sm"
              className="text-xs"
            >
              <span className={meta.color}>{meta.label}</span>
            </GlassBadge>
            <h3 className="text-sm font-semibold text-slate-800">
              {pattern.title}
            </h3>
          </div>
          {/* Significance indicator */}
          <div className="flex items-center gap-1 shrink-0">
            {[0.2, 0.4, 0.6, 0.8, 1.0].map((threshold, i) => (
              <div
                key={i}
                className={`w-1.5 h-1.5 rounded-full ${
                  pattern.significance >= threshold
                    ? "bg-indigo-500"
                    : "bg-slate-200"
                }`}
              />
            ))}
          </div>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed mb-3">
          {pattern.description}
        </p>

        {/* Evidence */}
        <div className="space-y-1">
          {pattern.evidence.map((ev, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <span className="text-indigo-400 text-xs mt-0.5">{"\u25B8"}</span>
              <span className="text-xs text-slate-500">{ev}</span>
            </div>
          ))}
        </div>

        {/* Axes */}
        {pattern.axes.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {pattern.axes.map((axis) => (
              <span
                key={axis}
                className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-500"
              >
                {AXIS_LABELS[axis] ?? axis}
              </span>
            ))}
          </div>
        )}
      </GlassCard>
    </FadeInView>
  );
}

const AXIS_LABELS: Record<string, string> = {
  conversation_temperature: "\u4F1A\u8A71\u306E\u6E29\u5EA6\u611F",
  distance_need: "\u8DDD\u96E2\u611F",
  depth_speed: "\u6DF1\u307E\u308B\u30B9\u30D4\u30FC\u30C9",
  stability_need: "\u5B89\u5B9A\u6027\u306E\u6B32\u6C42",
  stimulation_need: "\u523A\u6FC0\u306E\u6B32\u6C42",
  initiative: "\u4E3B\u5C0E\u6027",
  emotional_openness: "\u611F\u60C5\u306E\u958B\u793A\u5EA6",
  conflict_directness: "\u5BFE\u7ACB\u306E\u76F4\u63A5\u5EA6",
  social_energy: "\u793E\u4EA4\u30A8\u30CD\u30EB\u30AE\u30FC",
  structure_preference: "\u69CB\u9020\u5316\u306E\u597D\u307F",
};

function GrowthTrajectorySection({
  trajectory,
}: {
  trajectory: MirrorProfile["growthTrajectory"];
}) {
  if (trajectory.mostGrown.length === 0 && trajectory.stagnant.length === 0) {
    return null;
  }

  return (
    <FadeInView delay={0.4}>
      <GlassCard className="p-4">
        <h3 className="text-sm font-semibold text-slate-800 mb-3">
          {"\u6210\u9577\u306E\u8ECC\u8DE1"}
        </h3>

        {/* Most grown axes */}
        {trajectory.mostGrown.length > 0 && (
          <div className="mb-3">
            <p className="text-xs text-emerald-600 font-medium mb-2">
              {"\u2191 \u4F38\u3073\u3066\u3044\u308B\u8EF8"}
            </p>
            <div className="space-y-2">
              {trajectory.mostGrown.map((item) => (
                <div key={item.axis}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-slate-600">{item.label}</span>
                    <span className="text-xs text-emerald-600 font-medium">
                      +{Math.round(item.delta * 100)}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.round(item.delta * 100)}%` }}
                      transition={{ duration: 0.8, delay: 0.5 }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stagnant axes */}
        {trajectory.stagnant.length > 0 && (
          <div>
            <p className="text-xs text-amber-600 font-medium mb-2">
              {"\u2194 \u505C\u6EDE\u3057\u3066\u3044\u308B\u8EF8"}
            </p>
            <div className="flex flex-wrap gap-2">
              {trajectory.stagnant.map((item) => (
                <GlassBadge key={item.axis} variant="default" size="sm">
                  <span className="text-xs text-amber-600">{item.label}</span>
                </GlassBadge>
              ))}
            </div>
          </div>
        )}
      </GlassCard>
    </FadeInView>
  );
}

function StatsOverview({ stats }: { stats: MirrorProfile["stats"] }) {
  return (
    <FadeInView delay={0.5}>
      <GlassCard className="p-4">
        <h3 className="text-sm font-semibold text-slate-800 mb-3">
          {"\u5168\u4F53\u30B5\u30DE\u30EA\u30FC"}
        </h3>

        <div className="grid grid-cols-2 gap-3">
          <StatItem
            label={"\u7DCF\u63A5\u7D9A\u6570"}
            value={String(stats.totalConnections)}
          />
          <StatItem
            label={"\u30A2\u30AF\u30C6\u30A3\u30D6"}
            value={String(stats.activeConnections)}
          />
          <StatItem
            label={"\u5E73\u5747\u540C\u671F\u30B9\u30B3\u30A2"}
            value={`${Math.round(stats.averageSyncScore * 100)}%`}
          />
          <StatItem
            label={"\u4E3B\u306A\u30AB\u30C6\u30B4\u30EA"}
            value={CATEGORY_LABELS[stats.dominantCategory] ?? stats.dominantCategory}
          />
        </div>

        {/* Diversity meter */}
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-500">
              {"\u63A5\u7D9A\u306E\u591A\u69D8\u6027"}
            </span>
            <span className="text-xs text-indigo-600 font-medium">
              {Math.round(stats.connectionDiversity * 100)}%
            </span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-indigo-400 to-purple-500 rounded-full"
              initial={{ width: 0 }}
              animate={{
                width: `${Math.round(stats.connectionDiversity * 100)}%`,
              }}
              transition={{ duration: 0.8, delay: 0.6 }}
            />
          </div>
        </div>
      </GlassCard>
    </FadeInView>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center p-2 rounded-lg bg-slate-50/50">
      <p className="text-lg font-bold text-indigo-600">{value}</p>
      <p className="text-[10px] text-slate-500">{label}</p>
    </div>
  );
}

// ---------- Main Component ----------

export default function RelationshipMirrorView({
  mirrorProfile,
}: {
  mirrorProfile: MirrorProfile;
}) {
  return (
    <div className="space-y-4">
      {/* Archetype Card */}
      <ArchetypeCard persona={mirrorProfile.relationshipPersona} />

      {/* Patterns */}
      {mirrorProfile.patterns.length > 0 && (
        <div>
          <FadeInView delay={0.2}>
            <h3 className="text-sm font-semibold text-slate-700 mb-2 px-1">
              {"\u5168\u95A2\u4FC2\u3092\u901A\u3058\u3066\u898B\u3048\u308B\u30D1\u30BF\u30FC\u30F3"}
            </h3>
          </FadeInView>
          <div className="space-y-3">
            {mirrorProfile.patterns.map((pattern, i) => (
              <PatternCard key={pattern.id} pattern={pattern} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* Growth Trajectory */}
      <GrowthTrajectorySection trajectory={mirrorProfile.growthTrajectory} />

      {/* Stats */}
      <StatsOverview stats={mirrorProfile.stats} />
    </div>
  );
}
