import type { Metadata } from "next";
import "./globals.css";
import "./responsive-fixes.css";

export const metadata: Metadata = {
  title: "ChargePilot | EV Charging Operations",
  description: "Capacity-aware EV charging and station operations.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
