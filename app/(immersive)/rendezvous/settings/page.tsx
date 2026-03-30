import RendezvousSettingsForm from "@/components/rendezvous/RendezvousSettingsForm";

/**
 * Rendezvous settings page (server component).
 * Renders the client-side RendezvousSettingsForm.
 */

export const metadata = {
  title: "探索方針 | Rendezvous | Aneurasync",
};

export default function RendezvousSettingsPage() {
  return <RendezvousSettingsForm />;
}
