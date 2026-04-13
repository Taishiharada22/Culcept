"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { migrateStorageKeys } from "@/lib/storageMigration";
import SaveToastProvider from "@/components/ui/SaveToastProvider";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1分間はstale扱いしない
            gcTime: 5 * 60 * 1000, // 5分間キャッシュ保持
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  useEffect(() => {
    migrateStorageKeys();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <SaveToastProvider>
        {children}
      </SaveToastProvider>
    </QueryClientProvider>
  );
}
