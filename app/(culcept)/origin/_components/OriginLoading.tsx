"use client";

import { motion } from "framer-motion";

export default function OriginLoading() {
  return (
    <div className="py-8 text-center">
      <motion.p
        animate={{ opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="text-xs text-gray-400"
      >
        ···
      </motion.p>
    </div>
  );
}
