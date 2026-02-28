"use client";

import { useEffect } from "react";
import { useThemeStore, applyThemeVars } from "@/stores/theme";

export default function ThemeApplier() {
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    applyThemeVars(theme);
  }, [theme]);

  return null;
}
