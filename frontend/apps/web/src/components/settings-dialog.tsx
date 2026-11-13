import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@my-better-t-app/ui/components/dialog";
import { Label } from "@my-better-t-app/ui/components/label";
import { Separator } from "@my-better-t-app/ui/components/separator";
import { Switch } from "@my-better-t-app/ui/components/switch";
import { ToggleGroup, ToggleGroupItem } from "@my-better-t-app/ui/components/toggle-group";
import { Monitor, Moon, Sun } from "lucide-react";

import { useTheme } from "@/components/theme-provider";
import { setPrefs, usePrefs } from "@/lib/prefs";
import { setUi, useUi } from "@/lib/ui-store";

const THEMES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

function SettingRow({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <Label className="items-start justify-between gap-4 py-1 leading-normal">
      <span className="grid gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} className="mt-1" />
    </Label>
  );
}

export function SettingsDialog() {
  const { settingsOpen } = useUi();
  const prefs = usePrefs();
  const { theme = "dark", setTheme } = useTheme();

  return (
    <Dialog open={settingsOpen} onOpenChange={(open) => setUi({ settingsOpen: open })}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Settings</DialogTitle>
          <DialogDescription>Saved in this browser only.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <span id="theme-label" className="text-sm font-medium">
            Colour theme
          </span>
          <ToggleGroup
            aria-labelledby="theme-label"
            variant="outline"
            spacing={0}
            value={[theme]}
            onValueChange={(value) => {
              const next = value[0];
              if (next) setTheme(next);
            }}
          >
            {THEMES.map(({ value, label, icon: Icon }) => (
              <ToggleGroupItem key={value} value={value} aria-label={label} className="gap-1.5 px-3">
                <Icon aria-hidden="true" />
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <Separator />

        <div className="grid gap-3">
          <SettingRow
            label="High contrast"
            hint="Stronger borders and text everywhere."
            checked={prefs.highContrast}
            onChange={(highContrast) => setPrefs({ highContrast })}
          />
          <SettingRow
            label="Announce frames while playing"
            hint="Screen readers read each new frame during playback. Off by default so speech doesn't cover the sound."
            checked={prefs.announceFrames}
            onChange={(announceFrames) => setPrefs({ announceFrames })}
          />
          <SettingRow
            label="Single-key shortcuts"
            hint="Space, arrows, M, K, D and more. Press ? to see them all."
            checked={prefs.shortcuts}
            onChange={(shortcuts) => setPrefs({ shortcuts })}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
