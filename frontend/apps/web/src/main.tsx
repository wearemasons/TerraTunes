import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import ReactDOM from "react-dom/client";

import { player } from "./audio/player";
import Loader from "./components/loader";
import { PageError, PageNotFound } from "./components/status";
import { NotFoundError } from "./lib/api/source";
import { getPrefs } from "./lib/prefs";
import { routeTree } from "./routeTree.gen";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, error) => !(error instanceof NotFoundError) && count < 1,
      refetchOnWindowFocus: false,
    },
  },
});

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
  defaultPendingComponent: () => <Loader />,
  defaultErrorComponent: ({ error }) => <PageError error={error} />,
  defaultNotFoundComponent: () => <PageNotFound />,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// Restore the listener's saved volume before anything can play.
const prefs = getPrefs();
player.setVolume(prefs.volume);
player.setMuted(prefs.muted);

const rootElement = document.getElementById("app");

if (!rootElement) {
  throw new Error("Root element not found");
}

if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}
