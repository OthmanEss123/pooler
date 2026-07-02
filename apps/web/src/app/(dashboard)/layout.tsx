import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { CopilotWidget } from "@/components/layout/copilot-widget";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-surface">
      <Sidebar />
      <div className="lg:pl-64">
        <Topbar />
        <main className="mx-auto w-full max-w-[1520px] px-4 py-5 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
      <CopilotWidget />
    </div>
  );
}
