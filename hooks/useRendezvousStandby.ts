"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { safeLSSet } from "@/lib/safeLocalStorage";

const STANDBY_KEY = "culcept_rendezvous_last_active";

type Options = {
  thresholdHours: number; // 0 = disabled
};

export function useRendezvousStandby({ thresholdHours }: Options) {
  const [standbyActive, setStandbyActive] = useState(false);
  const [serverSynced, setServerSynced] = useState(false);
  const thresholdRef = useRef(thresholdHours);
  thresholdRef.current = thresholdHours;

  // Track activity
  useEffect(() => {
    const touch = () => safeLSSet(STANDBY_KEY, Date.now().toString());
    touch();
    const events = ["click", "scroll", "keydown", "touchstart"] as const;
    const handlers = events.map((e) => {
      window.addEventListener(e, touch, { passive: true });
      return () => window.removeEventListener(e, touch);
    });
    return () => handlers.forEach((h) => h());
  }, []);

  // Check standby
  const checkStandby = useCallback(async () => {
    const threshold = thresholdRef.current;
    if (threshold <= 0) {
      setStandbyActive(false);
      return;
    }
    const last = parseInt(localStorage.getItem(STANDBY_KEY) ?? "0", 10);
    const thresholdMs = threshold * 60 * 60 * 1000;
    if (last > 0 && Date.now() - last > thresholdMs) {
      setStandbyActive(true);
      // Sync to server
      try {
        await fetch("/api/rendezvous/standby", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: true }),
        });
        setServerSynced(true);
      } catch {
        // ignore, UI already shows standby
      }
    }
  }, []);

  useEffect(() => {
    checkStandby();
    window.addEventListener("focus", checkStandby);
    return () => window.removeEventListener("focus", checkStandby);
  }, [checkStandby]);

  const resumeStandby = useCallback(async () => {
    safeLSSet(STANDBY_KEY, Date.now().toString());
    setStandbyActive(false);
    try {
      await fetch("/api/rendezvous/standby", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: false }),
      });
    } catch {
      // ignore
    }
  }, []);

  return { standbyActive, resumeStandby };
}
