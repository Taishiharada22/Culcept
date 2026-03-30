"use client";

import { useMemo, useEffect, useState, useRef } from "react";
import type { GenomeStrand } from "@/lib/aneurasync/personaGenome";

const STORAGE_KEY = "culcept_genome_confidence_v1";
const DISCOVERY_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface DarkGeneDiscovery {
  basePairId: string;
  label: string;
  previousConfidence: number;
  newConfidence: number;
  discoveredAt: string; // ISO
  strandId: string;
}

interface UseDarkGenesResult {
  /** All base pairs with confidence < 0.3 */
  darkGenes: Array<{ id: string; label: string; confidence: number; strandId: string }>;
  /** Recently discovered genes (confidence crossed 0.3 threshold) */
  discoveries: DarkGeneDiscovery[];
  /** IDs of recently discovered genes (for particle effects) */
  recentDiscoveryIds: Set<string>;
  /** Total dark gene count */
  darkCount: number;
  /** Total discovered count (all time) */
  discoveredCount: number;
}

/**
 * Track dark genes (confidence < 0.3) and detect when genes are "discovered"
 * (confidence crosses from < 0.3 to >= 0.3).
 * Uses localStorage for persistence across sessions.
 */
export function useDarkGenes(strands: GenomeStrand[]): UseDarkGenesResult {
  const [discoveries, setDiscoveries] = useState<DarkGeneDiscovery[]>([]);
  const initialized = useRef(false);

  // All current dark genes
  const darkGenes = useMemo(() => {
    const result: UseDarkGenesResult["darkGenes"] = [];
    for (const strand of strands) {
      for (const bp of strand.basePairs) {
        if (bp.confidence < 0.3) {
          result.push({
            id: bp.id,
            label: bp.label,
            confidence: bp.confidence,
            strandId: strand.id,
          });
        }
      }
    }
    return result;
  }, [strands]);

  // Detect discoveries on mount
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const prevMap: Record<string, number> = stored ? JSON.parse(stored) : {};
      const now = new Date().toISOString();
      const newDiscoveries: DarkGeneDiscovery[] = [];

      // Build current confidence map
      const currentMap: Record<string, number> = {};
      for (const strand of strands) {
        for (const bp of strand.basePairs) {
          currentMap[bp.id] = bp.confidence;

          // Check if this gene was dark and is now discovered
          const prevConf = prevMap[bp.id];
          if (
            prevConf !== undefined &&
            prevConf < 0.3 &&
            bp.confidence >= 0.3
          ) {
            newDiscoveries.push({
              basePairId: bp.id,
              label: bp.label,
              previousConfidence: prevConf,
              newConfidence: bp.confidence,
              discoveredAt: now,
              strandId: strand.id,
            });
          }
        }
      }

      // Load existing discoveries
      const discoveryKey = `${STORAGE_KEY}_discoveries`;
      const existingDisc: DarkGeneDiscovery[] = (() => {
        try {
          const raw = localStorage.getItem(discoveryKey);
          return raw ? JSON.parse(raw) : [];
        } catch {
          return [];
        }
      })();

      // Merge new discoveries
      const allDiscoveries = [...existingDisc, ...newDiscoveries];

      // Save updated maps
      localStorage.setItem(STORAGE_KEY, JSON.stringify(currentMap));
      localStorage.setItem(discoveryKey, JSON.stringify(allDiscoveries));

      setDiscoveries(allDiscoveries);
    } catch {
      // localStorage unavailable — no-op
    }
  }, [strands]);

  // Recent discoveries (within 24h) for particle effects
  const recentDiscoveryIds = useMemo(() => {
    const cutoff = Date.now() - DISCOVERY_WINDOW_MS;
    const ids = new Set<string>();
    for (const d of discoveries) {
      if (new Date(d.discoveredAt).getTime() > cutoff) {
        ids.add(d.basePairId);
      }
    }
    return ids;
  }, [discoveries]);

  return {
    darkGenes,
    discoveries,
    recentDiscoveryIds,
    darkCount: darkGenes.length,
    discoveredCount: discoveries.length,
  };
}
