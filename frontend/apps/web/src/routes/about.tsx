import { Badge } from "@my-better-t-app/ui/components/badge";
import { buttonVariants } from "@my-better-t-app/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@my-better-t-app/ui/components/card";
import { Separator } from "@my-better-t-app/ui/components/separator";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@my-better-t-app/ui/components/table";
import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/about")({
  component: AboutPage,
  head: () => ({ meta: [{ title: "How it works · TeraTones" }] }),
});

const MAPPINGS = [
  { see: "Data value (from the colorbar)", hear: "Pitch", rule: "Higher value, higher note, snapped to the track's scale across three octaves." },
  { see: "Position west → east", hear: "Time and stereo", rule: "The sweep reads the map left to right; sounds move from your left ear to your right." },
  { see: "Share of high values", hear: "Loudness and brightness", rule: "More of the map near the top of the scale makes the sound louder and brighter." },
  { see: "How varied the picture is", hear: "Rhythm", rule: "A smooth map gets a calm pulse; a detailed one doubles or quadruples it." },
  { see: "Change since the last frame", hear: "Tension", rule: "Fast change adds clashing notes and pushes the tempo up to 20% faster." },
  { see: "Strongest hot spot", hear: "Bell", rule: "A bell rings where the hot spot is, panned to its side of the map." },
  { see: "No data (e.g. land on an ocean map)", hear: "Silence", rule: "Missing data is never invented; it stays quiet." },
];

const MODES = [
  { name: "Scan", text: "Sixteen notes per frame, sweeping west to east. The closest to reading the picture." },
  { name: "Overview", text: "One chord per frame. Best for hearing a whole time series change." },
  { name: "Explore", text: "Move a cursor across the map with a pointer, touch or arrow keys and hear the exact value under it." },
];

function AboutPage() {
  return (
    <div className="mx-auto grid max-w-3xl gap-10 px-4 py-10">
      <header className="grid gap-3">
        <Badge variant="outline">How it works</Badge>
        <h1 className="text-3xl font-semibold tracking-tight text-balance">Turning Earth pictures into sound you can trust</h1>
        <p className="text-base text-muted-foreground">
          NASA's Earth Information Center shows how our planet is changing, but only to people who can see it. TeraTones reads
          each visualization frame and plays it back as music, so the same story reaches listeners who are blind or have low
          vision, and gives everyone a second sense for the data.
        </p>
      </header>

      <section aria-labelledby="why" className="grid gap-3">
        <h2 id="why" className="text-xl font-semibold">
          Why sound
        </h2>
        <ul className="grid list-disc gap-2 pl-5 text-sm leading-relaxed">
          <li>Hearing is good at trends and sudden change: a rising pitch or a clash is noticed instantly.</li>
          <li>Sound works without a screen, at any zoom level and alongside a screen reader.</li>
          <li>Music carries feeling. Slow, unresolved harmony fits slow, unresolved problems.</li>
        </ul>
      </section>

      <section aria-labelledby="mapping" className="grid gap-3">
        <h2 id="mapping" className="text-xl font-semibold">
          How a picture becomes music
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          First we recover real numbers from the image by matching each pixel's colour to the visualization's own colorbar. Hue on
          its own is not data. Then fixed rules turn numbers into sound. The same picture always gives the same music.
        </p>
        <Table>
          <TableCaption>Mapping rules used for every track. Each track's audio key repeats them with real units.</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">What you see</TableHead>
              <TableHead scope="col">What you hear</TableHead>
              <TableHead scope="col">Rule</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {MAPPINGS.map((m) => (
              <TableRow key={m.see}>
                <TableHead scope="row" className="font-medium whitespace-normal">
                  {m.see}
                </TableHead>
                <TableCell className="whitespace-normal">{m.hear}</TableCell>
                <TableCell className="whitespace-normal text-muted-foreground">{m.rule}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section aria-labelledby="modes" className="grid gap-3">
        <h2 id="modes" className="text-xl font-semibold">
          Three ways to listen
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {MODES.map((mode) => (
            <Card key={mode.name} size="sm">
              <CardHeader>
                <CardTitle className="text-sm">{mode.name}</CardTitle>
                <CardDescription className="text-sm">{mode.text}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          Prefer pitch without music? Switch any track to <strong className="text-foreground">Clear tone</strong>: a plain sine
          wave that follows the data and nothing else.
        </p>
      </section>

      <section aria-labelledby="access" className="grid gap-3">
        <h2 id="access" className="text-xl font-semibold">
          Built for every listener
        </h2>
        <ul className="grid list-disc gap-2 pl-5 text-sm leading-relaxed">
          <li>Everything works with a keyboard. Press ? at any time for the shortcut list.</li>
          <li>Every track has a written description, an audio key and a transcript of key moments.</li>
          <li>Nothing plays until you press Play. Volume is limited and changes smoothly.</li>
          <li>Screen readers hear frame updates on request, so speech never covers the sound unless you want it to.</li>
          <li>Light, dark and high-contrast themes; reduced motion is respected.</li>
        </ul>
      </section>

      <Separator />

      <section aria-labelledby="credits-heading" id="credits" className="grid gap-3 scroll-mt-20">
        <h2 id="credits-heading" className="text-xl font-semibold">
          Data, honesty and credits
        </h2>
        <p className="text-sm leading-relaxed">
          Visualizations come from NASA's Earth Information Center and Scientific Visualization Studio. NASA imagery is generally
          in the public domain; each track lists its own credit line and source link. TeraTones is not endorsed by NASA.
        </p>
        <p className="text-sm leading-relaxed">
          When the backend is not connected, the jukebox plays <strong>demo tracks</strong> built from synthetic, Earth-like fields
          so it always works offline. These are clearly labelled and are not real measurements.
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Built for NASA Space Apps 2026, challenge "The Earth Information Jukebox".
        </p>
        <div>
          <Link to="/" className={buttonVariants({ variant: "default" })}>
            Open the jukebox
          </Link>
        </div>
      </section>
    </div>
  );
}
