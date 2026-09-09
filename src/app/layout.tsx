import type { Metadata, Viewport } from "next";
import "./globals.css";
import { OAuthHashHandler } from "@/components/OAuthHashHandler";

export const metadata: Metadata = {
  title: "Devly",
  description: "Describe what you want. Devly builds it.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("y5.theme");if(t==="paper"||t==="graphite")document.documentElement.setAttribute("data-theme",t);else t="paper";document.documentElement.style.colorScheme=t==="paper"?"light":"dark";}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full">
        <OAuthHashHandler />
        {children}
      </body>
    </html>
  );
}
