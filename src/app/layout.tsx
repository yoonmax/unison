import type { Metadata, Viewport } from "next";
import { Fraunces, Geist } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
});

export const metadata: Metadata = {
  title: "Unison — Different minds. One word.",
  description:
    "A cooperative word game for 2–4 friends. Everyone sees one word, everyone answers in secret, and you keep going until you all say the same thing.",
  applicationName: "Unison",
  openGraph: {
    title: "Unison",
    description: "Different minds. One word.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#f7f5f0",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} ${fraunces.variable} antialiased`}>
      <body className="relative">
        <Providers>
          <div className="relative z-10 flex min-h-dvh flex-col">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
