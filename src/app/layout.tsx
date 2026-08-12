import type { Metadata } from "next";
import { TooltipProvider } from "@/components/ui/tooltip";
import "@fontsource-variable/inter";
import "@fontsource-variable/space-grotesk";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trust the Verdict? | Open Day 2026",
  description: "An educational multi-agent AI integrity demonstration.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
