import { Badge } from "@my-better-t-app/ui/components/badge";
import { Button, buttonVariants } from "@my-better-t-app/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@my-better-t-app/ui/components/tooltip";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AudioWaveform, Keyboard, Settings } from "lucide-react";

import { sourceQuery } from "@/lib/api/queries";
import { setUi } from "@/lib/ui-store";

const NAV = [
  { to: "/", label: "Jukebox" },
  { to: "/about", label: "How it works" },
] as const;

function DataModeBadge() {
  const { data } = useQuery(sourceQuery());
  if (!data) return null;
  return data === "demo" ? (
    <Badge variant="outline" className="hidden sm:inline-flex">
      Demo data
    </Badge>
  ) : (
    <Badge variant="secondary" className="hidden sm:inline-flex">
      Live API
    </Badge>
  );
}

export default function Header() {
  return (
    <header className="border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2 sm:gap-4">
        <Link to="/" className="flex items-center gap-2 py-1 text-sm font-semibold tracking-tight" aria-label="TeraTones home">
          <AudioWaveform className="size-5 text-primary" aria-hidden="true" />
          <span>TeraTones</span>
        </Link>

        <nav aria-label="Main" className="flex items-center">
          <ul className="flex items-center gap-1">
            {NAV.map(({ to, label }) => (
              <li key={to}>
                <Link
                  to={to}
                  activeOptions={{ exact: to === "/" }}
                  className={buttonVariants({ variant: "ghost", size: "sm" })}
                  activeProps={{ "aria-current": "page", className: "bg-muted text-foreground" }}
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <DataModeBadge />
          <Tooltip>
            <TooltipTrigger
              render={<Button variant="ghost" size="icon" aria-label="Keyboard shortcuts" onClick={() => setUi({ shortcutsOpen: true })} />}
            >
              <Keyboard aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent>Keyboard shortcuts (?)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="icon" aria-label="Settings" onClick={() => setUi({ settingsOpen: true })} />}>
              <Settings aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent>Theme, contrast and announcements</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </header>
  );
}
