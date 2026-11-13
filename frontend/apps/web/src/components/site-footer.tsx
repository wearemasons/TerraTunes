import { Link } from "@tanstack/react-router";

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>
          TeraTones · NASA Space Apps 2026 · The Earth Information Jukebox. Imagery credit: NASA Earth Information Center and
          Scientific Visualization Studio. Not endorsed by NASA.
        </p>
        <p>
          <Link to="/about" hash="credits" className="underline underline-offset-4 hover:text-foreground">
            Credits and method
          </Link>
        </p>
      </div>
    </footer>
  );
}
