// app/stargazer/_components/StargazerLayoutClient.tsx
// Client wrapper that provides StateLinkedBackground with time-of-day detection
"use client";

import { useState, useEffect } from "react";
import StateLinkedBackground, {
  type EmotionalState,
  type TimeOfDay,
} from "./StateLinkedBackground";

function detectTimeOfDay(): TimeOfDay {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

interface Props {
  emotionalState?: EmotionalState;
  children: React.ReactNode;
}

export default function StargazerLayoutClient({
  emotionalState = "calm",
  children,
}: Props) {
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>(() => detectTimeOfDay());

  useEffect(() => {
    // Update every 10 minutes in case the user stays on the page across time boundaries
    const interval = setInterval(() => {
      setTimeOfDay(detectTimeOfDay());
    }, 10 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <StateLinkedBackground
      emotionalState={emotionalState}
      timeOfDay={timeOfDay}
    >
      {children}
    </StateLinkedBackground>
  );
}
