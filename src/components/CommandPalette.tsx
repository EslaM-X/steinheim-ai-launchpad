import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Contrast, Moon, Rows3, Sparkles, Sun, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import { generateToday } from "@/lib/agents.functions";
import { useI18n } from "@/lib/i18n";
import { NAV_GROUPS } from "@/lib/navigation";
import { DENSITIES, THEMES, useTheme } from "@/lib/theme";

/**
 * ⌘K / Ctrl-K. Navigation, appearance and the one action worth reaching from
 * anywhere. Generating a day's content is not undoable, so it asks first.
 */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const { lang, dir } = useI18n();
  const { theme, setTheme, density, setDensity } = useTheme();
  const qc = useQueryClient();
  const run = useServerFn(generateToday);
  const [confirmGenerate, setConfirmGenerate] = useState(false);

  useEffect(() => {
    if (!open) setConfirmGenerate(false);
  }, [open]);

  const generate = useMutation({
    mutationFn: () => run({}),
    onSuccess: (data) => {
      toast.success(lang === "ar" ? `تم توليد: ${data.topic}` : `Generated: ${data.topic}`);
      qc.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const go = (to: string) => {
    onOpenChange(false);
    void navigate({ to });
  };

  const ar = lang === "ar";

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <div dir={dir}>
        <CommandInput placeholder={ar ? "ابحث في Steinheim…" : "Search Steinheim…"} />
        <CommandList>
          <CommandEmpty>{ar ? "لا توجد نتائج." : "No results."}</CommandEmpty>

          <CommandGroup heading={ar ? "إجراءات" : "Actions"}>
            <CommandItem
              value="generate today content daily توليد محتوى اليوم"
              onSelect={() => {
                if (!confirmGenerate) {
                  setConfirmGenerate(true);
                  return;
                }
                onOpenChange(false);
                generate.mutate();
              }}
            >
              <Sparkles className="text-accent" />
              {confirmGenerate
                ? ar
                  ? "تأكيد — شغّل دورة اليوم"
                  : "Confirm — run today's cycle"
                : ar
                  ? "توليد محتوى اليوم"
                  : "Generate today's content"}
              <CommandShortcut>{confirmGenerate ? "↵" : "G"}</CommandShortcut>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          {NAV_GROUPS.map((group) => (
            <CommandGroup key={group.id} heading={ar ? group.labelAr : group.label}>
              {group.items.map((item) => (
                <CommandItem
                  key={item.to}
                  value={`${item.label} ${item.labelAr} ${(item.keywords ?? []).join(" ")}`}
                  onSelect={() => go(item.to)}
                >
                  <item.icon />
                  {ar ? item.labelAr : item.label}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}

          <CommandSeparator />

          <CommandGroup heading={ar ? "المظهر" : "Appearance"}>
            {THEMES.map((option) => (
              <CommandItem
                key={option}
                value={`theme ${option} مظهر`}
                onSelect={() => setTheme(option)}
              >
                {option === "light" ? <Sun /> : option === "dark" ? <Moon /> : <Contrast />}
                {ar
                  ? { light: "فاتح", dark: "داكن", system: "حسب النظام" }[option]
                  : `Theme — ${option}`}
                {theme === option && <CommandShortcut>✓</CommandShortcut>}
              </CommandItem>
            ))}
            {DENSITIES.map((option) => (
              <CommandItem
                key={option}
                value={`density ${option} كثافة`}
                onSelect={() => setDensity(option)}
              >
                <Rows3 />
                {ar
                  ? { comfortable: "مريح", compact: "مضغوط", dense: "كثيف" }[option]
                  : `Density — ${option}`}
                {density === option && <CommandShortcut>✓</CommandShortcut>}
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading={ar ? "الحساب" : "Account"}>
            <CommandItem
              value="sign out logout تسجيل الخروج"
              onSelect={async () => {
                onOpenChange(false);
                await supabase.auth.signOut();
                void navigate({ to: "/auth" });
              }}
            >
              <LogOut />
              {ar ? "تسجيل الخروج" : "Sign out"}
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </div>
    </CommandDialog>
  );
}
