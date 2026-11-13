import { buttonVariants } from "@my-better-t-app/ui/components/button";
import { Toaster } from "@my-better-t-app/ui/components/sonner";
import { TooltipProvider } from "@my-better-t-app/ui/components/tooltip";
import type { QueryClient } from "@tanstack/react-query";
import { HeadContent, Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import { Suspense, lazy } from "react";

import { AppEffects } from "@/components/app-effects";
import Header from "@/components/header";
import { LiveRegion } from "@/components/live-region";
import { SettingsDialog } from "@/components/settings-dialog";
import { SiteFooter } from "@/components/site-footer";
import { ThemeProvider } from "@/components/theme-provider";
import { ShortcutsDialog } from "@/features/shortcuts/shortcuts-dialog";

import "../index.css";

const RouterDevtools = import.meta.env.DEV
  ? lazy(() => import("@tanstack/react-router-devtools").then((m) => ({ default: m.TanStackRouterDevtools })))
  : (_props: { position?: "bottom-left" }) => null;

export interface RouterAppContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
  head: () => ({
    meta: [
      { title: "TerraTunes · The Earth Information Jukebox" },
      {
        name: "description",
        content:
          "Hear NASA Earth Information Center visualizations. TerraTunes turns every frame into an accessible, musical soundscape.",
      },
    ],
    links: [{ rel: "icon", href: "/favicon.svg", type: "image/svg+xml" }],
  }),
});

function RootComponent() {
  return (
    <>
      <HeadContent />
      <ThemeProvider attribute="class" defaultTheme="dark" disableTransitionOnChange storageKey="terratunes-theme">
        <TooltipProvider delay={300}>
          <a
            href="#main"
            className={buttonVariants({
              className: "sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50",
            })}
          >
            Skip to content
          </a>
          <div className="flex min-h-svh flex-col">
            <Header />
            <main id="main" tabIndex={-1} className="flex-1 outline-none">
              <Outlet />
            </main>
            <SiteFooter />
          </div>
          <LiveRegion />
          <ShortcutsDialog />
          <SettingsDialog />
          <AppEffects />
          <Toaster richColors />
        </TooltipProvider>
      </ThemeProvider>
      <Suspense fallback={null}>
        <RouterDevtools position="bottom-left" />
      </Suspense>
    </>
  );
}
