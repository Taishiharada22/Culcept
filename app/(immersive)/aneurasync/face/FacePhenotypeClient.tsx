"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { LightBackground } from "@/components/ui/glassmorphism-design";
import type {
  FacePhenotypeData,
  CategorySelection,
  NoseImpression,
  MouthImpression,
  FaceImpressionScores,
  SectionId,
  ComparisonCategoryId,
} from "@/types/face-phenotype";
import type { HairRecipe } from "@/lib/hair/hairOptions";
import { STORAGE_KEY as HAIR_STORAGE_KEY } from "@/lib/hair/hairOptions";
import {
  FACE_COMPARISON_CATEGORIES,
} from "@/lib/face/references";
import { NOSE_AXES, MOUTH_AXES } from "@/lib/face/impressionAxes";

import FacePhotoUpload from "./_components/FacePhotoUpload";
import ComparisonStep from "./_components/ComparisonStep";
import ImpressionStep from "./_components/ImpressionStep";
import HairModuleStep from "./_components/HairModuleStep";
import FaceImpressionStep from "./_components/FaceImpressionStep";
import CategoryNav from "./_components/CategoryNav";
import ResultSummary from "./_components/ResultSummary";

/* ── Types ── */

type FlowStep = "upload" | "assess" | "confirm" | "done";

// Group A sub-steps: 3 comparison categories in order
const COMPARISON_ORDER: ComparisonCategoryId[] = [
  "face_shape",
  "eye_shape",
  "brow_shape",
];

// Group B sub-steps
type ImpressionTarget = "nose" | "mouth";
const IMPRESSION_ORDER: ImpressionTarget[] = ["nose", "mouth"];

/* ── Component ── */

export default function FacePhenotypeClient({ embedded = false }: { embedded?: boolean }) {
  // Main flow
  const [step, setStep] = useState<FlowStep>("upload");
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);

  // Assessment state
  const [activeSection, setActiveSection] = useState<SectionId>("skeletal");
  const [compIdx, setCompIdx] = useState(0); // Group A sub-index
  const [impIdx, setImpIdx] = useState(0); // Group B sub-index
  const [selections, setSelections] = useState<FacePhenotypeData>({});
  const [hairRecipe, setHairRecipe] = useState<HairRecipe>({});

  // Save state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Completed sections
  const completedSections = new Set<SectionId>();
  if (
    selections.face_shape?.primary &&
    selections.eye_shape?.primary &&
    selections.brow_shape?.primary
  ) {
    completedSections.add("skeletal");
  }
  if (selections.nose_impression && selections.mouth_impression) {
    completedSections.add("impression");
  }
  if (Object.keys(hairRecipe).length >= 2) {
    completedSections.add("hair");
  }
  if (selections.face_impression) {
    completedSections.add("overall");
  }

  // Load existing data on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Fetch face phenotype + eye profile in parallel
        const [faceRes, eyeRes] = await Promise.all([
          fetch("/api/aneurasync/face-phenotype"),
          fetch("/api/eye-profile"),
        ]);

        if (cancelled) return;

        let restored: FacePhenotypeData = {};

        if (faceRes.ok) {
          const json = await faceRes.json();
          if (json.face_phenotype?.phenotype) {
            restored = json.face_phenotype.phenotype;
            if (json.face_phenotype.photo_url) {
              setPhotoBase64(json.face_phenotype.photo_url);
            }
          }
        }

        // Pre-populate eye_shape from existing eye_profile if not already set
        if (eyeRes.ok && !restored.eye_shape?.primary) {
          const eyeJson = await eyeRes.json();
          if (eyeJson.eye_profile?.eye_type) {
            restored = {
              ...restored,
              eye_shape: { primary: eyeJson.eye_profile.eye_type },
            };
          }
        }

        if (!cancelled && Object.keys(restored).length > 0) {
          setSelections(restored);
        }
      } catch {
        /* continue fresh */
      }
      // Load hair recipe from localStorage
      try {
        const raw = localStorage.getItem(HAIR_STORAGE_KEY);
        if (raw && !cancelled) setHairRecipe(JSON.parse(raw));
      } catch {
        /* ignore */
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Handlers ──

  const handlePhotoComplete = useCallback((base64: string) => {
    setPhotoBase64(base64);
    setStep("assess");
    setActiveSection("skeletal");
    setCompIdx(0);
  }, []);

  const handleComparisonSelect = useCallback(
    (catId: ComparisonCategoryId, sel: CategorySelection) => {
      setSelections((prev) => ({ ...prev, [catId]: sel }));
      // Auto-advance to next comparison category
      const nextIdx = compIdx + 1;
      if (nextIdx < COMPARISON_ORDER.length) {
        setCompIdx(nextIdx);
      } else {
        // Skeletal done → move to impression
        setActiveSection("impression");
        setImpIdx(0);
      }
    },
    [compIdx],
  );

  const handleImpressionComplete = useCallback(
    (target: ImpressionTarget, scores: Record<string, number>) => {
      if (target === "nose") {
        setSelections((prev) => ({
          ...prev,
          nose_impression: scores as unknown as NoseImpression,
        }));
      } else {
        setSelections((prev) => ({
          ...prev,
          mouth_impression: scores as unknown as MouthImpression,
        }));
      }
      const nextIdx = impIdx + 1;
      if (nextIdx < IMPRESSION_ORDER.length) {
        setImpIdx(nextIdx);
      } else {
        // Impression done → move to hair
        setActiveSection("hair");
      }
    },
    [impIdx],
  );

  const handleHairComplete = useCallback(() => {
    // Reload hair recipe from localStorage
    try {
      const raw = localStorage.getItem(HAIR_STORAGE_KEY);
      if (raw) setHairRecipe(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    setActiveSection("overall");
  }, []);

  const handleFaceImpressionComplete = useCallback(
    (scores: FaceImpressionScores) => {
      setSelections((prev) => ({ ...prev, face_impression: scores }));
      setStep("confirm");
    },
    [],
  );

  const handleSectionNav = useCallback(
    (section: SectionId) => {
      setActiveSection(section);
      if (section === "skeletal") setCompIdx(0);
      if (section === "impression") setImpIdx(0);
    },
    [],
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/aneurasync/face-phenotype", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phenotype: selections,
          photo_url: null, // Don't store base64 in DB (too large)
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "保存に失敗しました");
      }
      setStep("done");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }, [selections]);

  // ── Render ──

  if (loading) {
    if (embedded) {
      return (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full w-8 h-8 border-2 border-slate-300 border-t-slate-600" />
        </div>
      );
    }
    return (
      <LightBackground>
        <div className="min-h-dvh flex items-center justify-center">
          <div className="animate-spin rounded-full w-8 h-8 border-2 border-slate-300 border-t-slate-600" />
        </div>
      </LightBackground>
    );
  }

  const content = (
    <div className={embedded ? "px-4 py-6 max-w-4xl mx-auto" : "min-h-dvh px-4 py-6 max-w-md mx-auto"}>
      {/* Header (standalone only) */}
      {!embedded && (
        <div className="flex items-center justify-between mb-4">
          <Link href="/aneurasync" className="text-slate-500 text-sm">
            ← 戻る
          </Link>
          <h1 className="text-sm font-semibold text-slate-700">
            顔まわり判定
          </h1>
          <div className="w-10" />
        </div>
      )}

        {/* Category nav (only in assess mode) */}
        {step === "assess" && (
          <CategoryNav
            active={activeSection}
            completed={completedSections}
            onChange={handleSectionNav}
          />
        )}

        {/* Error */}
        {saveError && (
          <div className="mb-3 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-xs text-center">
            {saveError}
          </div>
        )}

        {/* Steps */}
        <AnimatePresence mode="wait">
          <motion.div
            key={
              step === "assess"
                ? `${step}-${activeSection}-${compIdx}-${impIdx}`
                : step
            }
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.25 }}
          >
            {/* Upload */}
            {step === "upload" && (
              <FacePhotoUpload onComplete={handlePhotoComplete} />
            )}

            {/* Assess: Group A (skeletal) */}
            {step === "assess" &&
              activeSection === "skeletal" &&
              photoBase64 && (
                <ComparisonStep
                  key={COMPARISON_ORDER[compIdx]}
                  category={
                    FACE_COMPARISON_CATEGORIES.find(
                      (c) => c.id === COMPARISON_ORDER[compIdx],
                    )!
                  }
                  userImage={photoBase64}
                  existing={selections[COMPARISON_ORDER[compIdx]]}
                  onSelect={(sel) =>
                    handleComparisonSelect(COMPARISON_ORDER[compIdx], sel)
                  }
                />
              )}

            {/* Assess: Group B (impression) */}
            {step === "assess" &&
              activeSection === "impression" &&
              photoBase64 && (
                <>
                  {IMPRESSION_ORDER[impIdx] === "nose" && (
                    <ImpressionStep
                      title="鼻"
                      icon="👃"
                      axes={NOSE_AXES}
                      userImage={photoBase64}
                      existing={
                        selections.nose_impression as
                          | Record<string, number>
                          | undefined
                      }
                      onComplete={(scores) =>
                        handleImpressionComplete("nose", scores)
                      }
                    />
                  )}
                  {IMPRESSION_ORDER[impIdx] === "mouth" && (
                    <ImpressionStep
                      title="口元"
                      icon="👄"
                      axes={MOUTH_AXES}
                      userImage={photoBase64}
                      existing={
                        selections.mouth_impression as
                          | Record<string, number>
                          | undefined
                      }
                      onComplete={(scores) =>
                        handleImpressionComplete("mouth", scores)
                      }
                    />
                  )}
                </>
              )}

            {/* Assess: Group C (hair) */}
            {step === "assess" &&
              activeSection === "hair" &&
              photoBase64 && (
                <HairModuleStep
                  userImage={photoBase64}
                  onComplete={handleHairComplete}
                />
              )}

            {/* Assess: Face overall impression */}
            {step === "assess" &&
              activeSection === "overall" &&
              photoBase64 && (
                <FaceImpressionStep
                  userImage={photoBase64}
                  existing={selections.face_impression}
                  onComplete={handleFaceImpressionComplete}
                />
              )}

            {/* Confirm */}
            {step === "confirm" && (
              <ResultSummary
                data={selections}
                hairRecipe={hairRecipe}
                mode="confirm"
                saving={saving}
                onSave={handleSave}
                onEditSection={(section) => {
                  setStep("assess");
                  handleSectionNav(section as SectionId);
                }}
              />
            )}

            {/* Done */}
            {step === "done" && (
              <ResultSummary
                data={selections}
                hairRecipe={hairRecipe}
                mode="done"
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
  );

  if (embedded) return content;
  return <LightBackground>{content}</LightBackground>;
}
