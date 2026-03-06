"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import type { EarthTracePrefs } from "@/lib/origin/v2/types";
import {
  loadEarthTracePrefs,
  saveEarthTracePrefs,
  defaultEarthTracePrefs,
} from "@/lib/origin/v2/anchorStore";

/* ─── CSS Globe ─── */

function CSSGlobe({ pointCount }: { pointCount: number }) {
  // Generate decorative orbit lines and location dots
  const orbits = useMemo(() => {
    const arr: { rotation: number; tilt: number; delay: number }[] = [];
    for (let i = 0; i < 4; i++) {
      arr.push({
        rotation: i * 45 + Math.random() * 20,
        tilt: 55 + Math.random() * 30,
        delay: i * 0.5,
      });
    }
    return arr;
  }, []);

  const dots = useMemo(() => {
    const arr: { x: number; y: number; size: number; delay: number }[] = [];
    const count = Math.min(pointCount, 12) || 5;
    for (let i = 0; i < count; i++) {
      // Place dots within the globe circle
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const r = 0.3 + Math.random() * 0.55;
      arr.push({
        x: 50 + Math.cos(angle) * r * 40,
        y: 50 + Math.sin(angle) * r * 40,
        size: 3 + Math.random() * 3,
        delay: i * 0.2,
      });
    }
    return arr;
  }, [pointCount]);

  return (
    <div className="relative mx-auto" style={{ width: 280, height: 280 }}>
      {/* Globe sphere */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "radial-gradient(circle at 35% 30%, #1e3a5f 0%, #0d2240 35%, #071428 65%, #030a14 100%)",
          boxShadow:
            "inset -15px -15px 30px rgba(0,0,0,0.5), 0 0 60px rgba(59,130,246,0.2), 0 0 120px rgba(59,130,246,0.08)",
        }}
      />

      {/* Grid lines overlay */}
      <svg
        width={280}
        height={280}
        className="absolute inset-0"
        style={{ opacity: 0.12 }}
      >
        {/* Horizontal latitude lines */}
        {[0.25, 0.4, 0.5, 0.6, 0.75].map((frac, i) => {
          const y = frac * 280;
          const halfWidth = Math.sqrt(
            Math.max(0, 140 * 140 - (y - 140) * (y - 140)),
          );
          return (
            <ellipse
              key={`lat-${i}`}
              cx={140}
              cy={y}
              rx={halfWidth}
              ry={halfWidth * 0.2}
              fill="none"
              stroke="rgba(100,180,255,0.5)"
              strokeWidth={0.5}
            />
          );
        })}
        {/* Vertical longitude lines */}
        {[-0.3, 0, 0.3].map((offset, i) => (
          <ellipse
            key={`lng-${i}`}
            cx={140 + offset * 140}
            cy={140}
            rx={Math.abs(Math.cos(offset * 1.2)) * 30 + 10}
            ry={130}
            fill="none"
            stroke="rgba(100,180,255,0.4)"
            strokeWidth={0.5}
          />
        ))}
      </svg>

      {/* Atmosphere glow */}
      <div
        className="absolute inset-[-8px] rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, transparent 45%, rgba(59,130,246,0.08) 55%, rgba(59,130,246,0.15) 65%, transparent 75%)",
        }}
      />

      {/* Orbit trace lines */}
      {orbits.map((orbit, i) => (
        <motion.div
          key={i}
          className="absolute inset-[-20px] rounded-full border border-cyan-400/15"
          style={{
            transform: `rotateX(${orbit.tilt}deg) rotateY(${orbit.rotation}deg)`,
            transformStyle: "preserve-3d",
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 + orbit.delay, duration: 1 }}
        />
      ))}

      {/* Location glow dots */}
      {dots.map((dot, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${dot.x}%`,
            top: `${dot.y}%`,
            width: dot.size,
            height: dot.size,
            background: "rgba(250,200,80,0.9)",
            boxShadow: "0 0 6px rgba(250,200,80,0.6), 0 0 12px rgba(250,200,80,0.3)",
            transform: "translate(-50%, -50%)",
          }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: [0.5, 1, 0.5], scale: 1 }}
          transition={{
            delay: 0.8 + dot.delay,
            opacity: { duration: 3, repeat: Infinity, ease: "easeInOut" },
            scale: { duration: 0.5, type: "spring" },
          }}
        />
      ))}
    </div>
  );
}

/* ─── Permission Flow (dark theme) ─── */

function LocationPermissionFlow({ onGranted }: { onGranted: () => void }) {
  const [requesting, setRequesting] = useState(false);

  const handleRequest = async () => {
    setRequesting(true);
    try {
      await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        });
      });
      const prefs = loadEarthTracePrefs();
      prefs.gpsPermissionGranted = true;
      prefs.autoGrabOnOpen = true;
      saveEarthTracePrefs(prefs);
      onGranted();
    } catch {
      setRequesting(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[400px] p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center max-w-md mx-auto"
      >
        <CSSGlobe pointCount={0} />
        <h2 className="text-xl font-bold text-white mt-6 mb-3">
          地球の足跡を始めましょう
        </h2>
        <p className="text-sm text-white/50 mb-6 leading-relaxed">
          位置情報を使って、あなたの移動の記録を残します。
          <br />
          データはあなただけが見ることができます。
        </p>
        <button
          onClick={handleRequest}
          disabled={requesting}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 px-8 py-3 text-sm font-bold text-white shadow-lg shadow-blue-500/30 hover:shadow-xl transition-shadow disabled:opacity-50"
        >
          {requesting ? "確認中..." : "位置情報を許可する"}
        </button>
        <p className="text-[10px] text-white/25 mt-4">
          ※ セッション型の記録のみ。常時追跡はしません。
        </p>
      </motion.div>
    </div>
  );
}

/* ─── GPS Session Control (dark theme) ─── */

function GpsSessionControl({
  onPointCaptured,
}: {
  onPointCaptured: (point: { lat: number; lng: number; accuracy: number }) => void;
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(60);
  const [pointCount, setPointCount] = useState(0);
  const watchIdRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopSession = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
    setSecondsLeft(60);
    setPointCount(0);
  }, []);

  const startSession = useCallback(() => {
    setIsRecording(true);
    setSecondsLeft(60);
    setPointCount(0);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        onPointCaptured({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setPointCount((c) => c + 1);
      },
      () => stopSession(),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 },
    );

    timerRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          stopSession();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [onPointCaptured, stopSession]);

  useEffect(() => {
    return () => stopSession();
  }, [stopSession]);

  return (
    <div className="rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-white/80">位置記録</p>
          {isRecording ? (
            <div className="flex items-center gap-2 mt-1">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-xs text-white/40">
                記録中 ・ {secondsLeft}秒 ・ {pointCount}点
              </span>
            </div>
          ) : (
            <p className="text-xs text-white/30 mt-1">最大60秒のセッション記録</p>
          )}
        </div>
        <button
          onClick={isRecording ? stopSession : startSession}
          className={`rounded-full px-4 py-2 text-xs font-bold transition-all ${
            isRecording
              ? "bg-white/10 text-white/60 hover:bg-white/15"
              : "bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg shadow-blue-500/20"
          }`}
        >
          {isRecording ? "停止" : "記録開始"}
        </button>
      </div>

      {isRecording && (
        <div className="mt-3 h-1.5 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-400 to-cyan-400 rounded-full transition-all duration-1000"
            style={{ width: `${(secondsLeft / 60) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}

/* ─── Location Stats (dark theme) ─── */

function LocationStats({ points }: { points: { lat: number; lng: number }[] }) {
  const uniqueApprox = useMemo(
    () => new Set(points.map((p) => `${p.lat.toFixed(1)},${p.lng.toFixed(1)}`)).size,
    [points],
  );

  const stats = [
    { label: "記録ポイント", value: points.length, icon: "\uD83D\uDCCD" },
    { label: "エリア", value: uniqueApprox, icon: "\uD83C\uDF10" },
    { label: "セッション", value: "—", icon: "\uD83D\uDCE1" },
    { label: "行動圏", value: "—", icon: "\uD83D\uDDFA" },
  ];

  return (
    <div className="grid grid-cols-4 gap-2">
      {stats.map((s) => (
        <div key={s.label} className="text-center rounded-xl bg-white/5 border border-white/5 py-3">
          <div className="text-base">{s.icon}</div>
          <div className="text-lg font-bold text-white">{s.value}</div>
          <div className="text-[10px] text-white/30">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

/* ─── Main Earth Trace Section ─── */

export default function EarthTraceSection() {
  const [prefs, setPrefs] = useState<EarthTracePrefs>(defaultEarthTracePrefs);
  const [points, setPoints] = useState<{ lat: number; lng: number }[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const p = loadEarthTracePrefs();
    setPrefs(p);

    try {
      const raw = localStorage.getItem("culcept_earth_points_temp");
      if (raw) setPoints(JSON.parse(raw));
    } catch { /* silent */ }

    setLoaded(true);

    if (p.gpsPermissionGranted && p.autoGrabOnOpen) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const point = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setPoints((prev) => {
            const next = [...prev, point];
            try { localStorage.setItem("culcept_earth_points_temp", JSON.stringify(next)); } catch { /* silent */ }
            return next;
          });
        },
        () => {},
        { enableHighAccuracy: false, timeout: 5000 },
      );
    }
  }, []);

  const handlePointCaptured = (point: { lat: number; lng: number; accuracy: number }) => {
    setPoints((prev) => {
      const next = [...prev, { lat: point.lat, lng: point.lng }];
      try { localStorage.setItem("culcept_earth_points_temp", JSON.stringify(next)); } catch { /* silent */ }
      return next;
    });
  };

  const handlePermissionGranted = () => {
    setPrefs((p) => ({ ...p, gpsPermissionGranted: true }));
  };

  if (!loaded) return null;

  if (!prefs.gpsPermissionGranted) {
    return <LocationPermissionFlow onGranted={handlePermissionGranted} />;
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Hero: Globe */}
      <section className="flex flex-col items-center px-6 pt-2 pb-4">
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-[10px] tracking-[0.3em] text-white/30 uppercase mb-6 text-center font-medium"
        >
          Earth Trace
        </motion.p>

        <CSSGlobe pointCount={points.length} />

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-sm text-white/30 mt-6 text-center"
        >
          あなたの行動の軌跡が地球上に刻まれる...
        </motion.p>
      </section>

      {/* Stats */}
      <section className="mx-auto max-w-md px-4">
        <LocationStats points={points} />
      </section>

      {/* GPS Session */}
      <section className="mx-auto max-w-md px-4">
        <GpsSessionControl onPointCaptured={handlePointCaptured} />
      </section>

      {/* Recent Points */}
      {points.length > 0 && (
        <section className="mx-auto max-w-md px-4">
          <div className="rounded-2xl bg-white/5 border border-white/5 p-4">
            <p className="text-xs text-white/40 mb-2">最近の記録</p>
            <div className="flex flex-wrap gap-1.5">
              {points.slice(-8).map((p, i) => (
                <span
                  key={i}
                  className="rounded-full bg-white/5 border border-white/5 text-white/40 text-[10px] px-2.5 py-0.5"
                >
                  {p.lat.toFixed(2)}, {p.lng.toFixed(2)}
                </span>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
