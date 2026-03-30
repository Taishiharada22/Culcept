"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { ObservationFeedback } from "@/types/stargazer";

interface Props {
  show: boolean;
  feedback: ObservationFeedback | null;
  message?: string;
  type?: "success" | "info" | "warning";
  onClose?: () => void;
}

export default function FeedbackToast({ show, feedback, message, type = "success", onClose }: Props) {
  const displayMessage = feedback?.message || message || "";
  const colors = {
    success: "bg-emerald-500/20 border-emerald-500/30 text-emerald-200",
    info: "bg-amber-500/20 border-amber-500/30 text-amber-200",
    warning: "bg-red-500/20 border-red-500/30 text-red-200",
  };

  return (
    <AnimatePresence>
      {show && displayMessage && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl border backdrop-blur-md ${colors[type]}`}
          onClick={onClose}
        >
          <p className="text-sm font-medium">{displayMessage}</p>
          {feedback?.dimensionsUpdated && feedback.dimensionsUpdated.length > 0 && (
            <p className="text-xs opacity-60 mt-1">
              更新: {feedback.dimensionsUpdated.join(", ")}
            </p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
