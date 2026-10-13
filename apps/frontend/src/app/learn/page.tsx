import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { LearnView } from "@/components/learn/LearnView";

export const metadata: Metadata = { title: "Learn" };

export default function LearnPage() {
  return (
    <AppShell wide>
      <Suspense>
        <LearnView />
      </Suspense>
    </AppShell>
  );
}
