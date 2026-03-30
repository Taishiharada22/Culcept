// Shared animation variants for the my-style page
// All animations are designed to feel premium and intentional

export const springSnappy = { type: "spring" as const, stiffness: 400, damping: 30, mass: 0.8 };
export const springGentle = { type: "spring" as const, stiffness: 200, damping: 25, mass: 1 };
export const springBouncy = { type: "spring" as const, stiffness: 300, damping: 20, mass: 0.6 };

// Tab content entrance/exit
export const tabVariants = {
  initial: { opacity: 0, y: 16, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -10, scale: 0.99 },
};
export const tabTransition = { duration: 0.25, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] };

// Staggered children
export const staggerContainer = {
  animate: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};
export const staggerItem = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
};

// Card hover lift
export const cardHover = {
  rest: { y: 0, scale: 1, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" },
  hover: { y: -3, scale: 1.01, boxShadow: "0 8px 25px rgba(0,0,0,0.08)" },
};

// FAB pulse attention
export const fabPulse = {
  animate: {
    scale: [1, 1.05, 1],
    boxShadow: [
      "0 4px 14px rgba(79,70,229,0.3)",
      "0 8px 25px rgba(79,70,229,0.5)",
      "0 4px 14px rgba(79,70,229,0.3)",
    ],
  },
  transition: { duration: 2.5, repeat: Infinity, ease: "easeInOut" as const },
};

// Hero text reveal
export const heroReveal = {
  initial: { opacity: 0, y: 20, clipPath: "inset(0 0 100% 0)" },
  animate: { opacity: 1, y: 0, clipPath: "inset(0 0 0% 0)" },
};

// Score ring draw
export const ringDraw = (progress: number) => ({
  initial: { pathLength: 0, opacity: 0 },
  animate: { pathLength: progress, opacity: 1 },
  transition: { duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.3 },
});

// Badge pop
export const badgePop = {
  initial: { scale: 0, opacity: 0 },
  animate: { scale: 1, opacity: 1 },
  transition: springBouncy,
};

// Scroll-linked parallax helper (returns a transform style)
export const parallaxStyle = (scrollY: number, rate: number = 0.15) => ({
  transform: `translateY(${scrollY * rate}px)`,
});

// Notice toast slide-in
export const toastVariants = {
  initial: { opacity: 0, y: -20, scale: 0.95 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -10, scale: 0.95 },
};
