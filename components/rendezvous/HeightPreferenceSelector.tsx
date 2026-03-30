"use client";

import { useState, useCallback } from "react";
import { GlassCard, GlassButton } from "@/components/ui/glassmorphism-design";

interface Props {
  initialMinCm?: number | null;
  initialMaxCm?: number | null;
  onSave?: (minCm: number | null, maxCm: number | null) => void;
  readOnly?: boolean;
}

const MIN_HEIGHT = 140;
const MAX_HEIGHT = 200;

export default function HeightPreferenceSelector({
  initialMinCm,
  initialMaxCm,
  onSave,
  readOnly,
}: Props) {
  const [noPreference, setNoPreference] = useState(
    !initialMinCm && !initialMaxCm,
  );
  const [minCm, setMinCm] = useState(initialMinCm ?? 155);
  const [maxCm, setMaxCm] = useState(initialMaxCm ?? 180);
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    if (!onSave) return;
    setSaving(true);
    try {
      if (noPreference) {
        onSave(null, null);
      } else {
        onSave(minCm, maxCm);
      }
    } finally {
      setSaving(false);
    }
  }, [onSave, noPreference, minCm, maxCm]);

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="text-lg font-bold text-white/90">
          身長の好みはありますか？
        </h3>
        <p className="mt-1 text-sm text-white/50">
          こだわらない場合はそのままでOK
        </p>
      </div>

      <GlassCard className="p-4 space-y-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={noPreference}
            onChange={(e) => !readOnly && setNoPreference(e.target.checked)}
            className="accent-violet-500"
          />
          <span className="text-sm text-white/70">こだわらない</span>
        </label>

        {!noPreference && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-white/50 mb-1">
                最低身長: {minCm}cm
              </label>
              <input
                type="range"
                min={MIN_HEIGHT}
                max={MAX_HEIGHT}
                value={minCm}
                onChange={(e) => {
                  if (readOnly) return;
                  const v = Number(e.target.value);
                  setMinCm(v);
                  if (v > maxCm) setMaxCm(v);
                }}
                className="w-full accent-violet-500"
              />
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1">
                最大身長: {maxCm}cm
              </label>
              <input
                type="range"
                min={MIN_HEIGHT}
                max={MAX_HEIGHT}
                value={maxCm}
                onChange={(e) => {
                  if (readOnly) return;
                  const v = Number(e.target.value);
                  setMaxCm(v);
                  if (v < minCm) setMinCm(v);
                }}
                className="w-full accent-violet-500"
              />
            </div>
            <p className="text-center text-sm text-white/60">
              {minCm}cm 〜 {maxCm}cm
            </p>
          </div>
        )}
      </GlassCard>

      {!readOnly && onSave && (
        <div className="flex justify-center">
          <GlassButton onClick={handleSave} disabled={saving}>
            {saving ? "保存中..." : "保存する"}
          </GlassButton>
        </div>
      )}
    </div>
  );
}
