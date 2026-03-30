// app/stargazer/_shared/PageTransition.tsx
// Subtle fade + slide transition wrapper for Stargazer sub-pages
"use client";

import { motion } from "framer-motion";

interface PageTransitionProps {
  children: React.ReactNode;
  /** Unique key for the page (e.g., pathname) */
  pageKey?: string;
}

export default function PageTransition({ children, pageKey }: PageTransitionProps) {
  return (
    <motion.div
      key={pageKey}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{
        duration: 0.2,
        ease: [0.23, 1, 0.32, 1], // custom easing for smooth feel
      }}
    >
      {children}
    </motion.div>
  );
}
