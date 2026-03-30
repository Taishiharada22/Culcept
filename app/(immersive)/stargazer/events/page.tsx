// app/stargazer/events/page.tsx
import type { Metadata } from "next";
import EventsClient from "./EventsClient";

export const metadata: Metadata = {
  title: "人生の出来事 — Stargazer",
  description: "人生の出来事と、あなたの性格変化の相関を観測する。",
};

export default function EventsPage() {
  return <EventsClient />;
}
