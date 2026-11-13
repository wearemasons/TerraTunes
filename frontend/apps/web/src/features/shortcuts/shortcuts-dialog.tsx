import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@my-better-t-app/ui/components/dialog";
import { Kbd, KbdGroup } from "@my-better-t-app/ui/components/kbd";
import { Label } from "@my-better-t-app/ui/components/label";
import { Separator } from "@my-better-t-app/ui/components/separator";
import { Switch } from "@my-better-t-app/ui/components/switch";
import { Fragment } from "react";

import { setPrefs, usePrefs } from "@/lib/prefs";
import { setUi, useUi } from "@/lib/ui-store";

import { SHORTCUTS, type ShortcutDef } from "./shortcuts";

const SCOPES: ShortcutDef["scope"][] = ["Everywhere", "Player", "Explore mode"];

export function ShortcutsDialog() {
  const { shortcutsOpen } = useUi();
  const prefs = usePrefs();

  return (
    <Dialog open={shortcutsOpen} onOpenChange={(open) => setUi({ shortcutsOpen: open })}>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Single-key shortcuts never fire while you type, and they ignore Ctrl, Alt and Cmd so screen-reader
            commands keep working.
          </DialogDescription>
        </DialogHeader>

        <Label className="justify-between gap-4 py-1 text-sm">
          Enable single-key shortcuts
          <Switch checked={prefs.shortcuts} onCheckedChange={(checked) => setPrefs({ shortcuts: checked })} />
        </Label>

        {SCOPES.map((scope) => (
          <section key={scope} aria-labelledby={`shortcuts-${scope}`} className="grid gap-2">
            <Separator />
            <h3 id={`shortcuts-${scope}`} className="text-xs font-medium text-muted-foreground uppercase">
              {scope}
            </h3>
            <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
              {SHORTCUTS.filter((s) => s.scope === scope).map((shortcut) => (
                <Fragment key={`${scope}-${shortcut.label}`}>
                  <dt>
                    <KbdGroup>
                      {shortcut.keys.map((key) => (
                        <Kbd key={key} className="text-foreground">
                          {key}
                        </Kbd>
                      ))}
                    </KbdGroup>
                  </dt>
                  <dd>{shortcut.label}</dd>
                </Fragment>
              ))}
            </dl>
          </section>
        ))}
      </DialogContent>
    </Dialog>
  );
}
