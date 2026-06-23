import * as React from "react";

import type { Action } from "../provider/actionsStore";
import { actionsStore } from "../provider/actionsStore";

type Theme = "dark" | "light" | "system";
type ResolvedTheme = "dark" | "light";

let activeThemeOwnerCount = 0;

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  const storedTheme = localStorage.getItem("theme") as Theme | null;
  return storedTheme || "system";
}

/**
 * Read-only access to the studio theme. Does not mutate `<html>` or localStorage.
 * Use this when you need the current theme value (e.g. to pass to a Toaster) but
 * are not the owner of the studio chrome — applying the theme would bleed onto
 * the host site.
 */
export function useThemeValue(): { theme: Theme } {
  const [theme] = React.useState<Theme>(readStoredTheme);
  return { theme };
}

/**
 * Owns the studio theme: writes the active class onto `<html>` and persists
 * changes to localStorage. Should only be mounted from the studio chrome —
 * never from contexts that share `<html>` with the user's site.
 */
export function useApplyTheme() {
  const [theme, setTheme] = React.useState<Theme>(readStoredTheme);
  const [resolvedTheme, setResolvedTheme] = React.useState<ResolvedTheme>("light");

  React.useEffect(() => {
    const root = window.document.documentElement;
    const body = window.document.body;
    activeThemeOwnerCount += 1;

    const applyTheme = (themeToApply: ResolvedTheme) => {
      setResolvedTheme(themeToApply);
      root.classList.remove("light", "dark");
      root.classList.add(themeToApply);
      root.dataset.camoxStudioTheme = themeToApply;

      body.classList.remove("light", "dark");
      body.classList.add("camox-studio-theme", themeToApply);
      body.dataset.camoxStudioTheme = themeToApply;
    };

    const resolveTheme = () => {
      if (theme !== "system") return theme;
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    };

    applyTheme(resolveTheme());

    const observer = new MutationObserver(() => {
      const themeToApply = resolveTheme();
      if (root.classList.contains(themeToApply) && body.classList.contains(themeToApply)) return;
      applyTheme(themeToApply);
    });

    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    observer.observe(body, { attributes: true, attributeFilter: ["class"] });

    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const updateSystemTheme = () => applyTheme(resolveTheme());
      mediaQuery.addEventListener("change", updateSystemTheme);

      return () => {
        mediaQuery.removeEventListener("change", updateSystemTheme);
        observer.disconnect();
        activeThemeOwnerCount -= 1;
        if (activeThemeOwnerCount > 0) return;
        root.classList.remove("light", "dark");
        delete root.dataset.camoxStudioTheme;
        body.classList.remove("camox-studio-theme", "light", "dark");
        delete body.dataset.camoxStudioTheme;
      };
    }

    // On unmount (e.g. user signs out → studio chrome unmounts), clear the
    // class so the host page returns to its default (light) state.
    return () => {
      observer.disconnect();
      activeThemeOwnerCount -= 1;
      if (activeThemeOwnerCount > 0) return;
      root.classList.remove("light", "dark");
      delete root.dataset.camoxStudioTheme;
      body.classList.remove("camox-studio-theme", "light", "dark");
      delete body.dataset.camoxStudioTheme;
    };
  }, [theme]);

  React.useEffect(() => {
    localStorage.setItem("theme", theme);
  }, [theme]);

  return {
    theme,
    resolvedTheme,
    setTheme,
  };
}

export function useThemeActions() {
  const { theme, setTheme } = useApplyTheme();
  // Register theme switching actions
  React.useEffect(() => {
    const pageId = "change-theme";
    const actions = [
      {
        id: pageId,
        label: "Change theme",
        aliases: ["Theme", "Appearance", "Color mode"],
        groupLabel: "Studio",
        checkIfAvailable: () => true,
        hasChildren: true,
        execute: () => {},
      },
      {
        id: "switch-to-light-theme",
        parentActionId: pageId,
        label: "Switch to light theme",
        aliases: ["Light mode"],
        groupLabel: "Studio",
        checkIfAvailable: () => theme !== "light",
        execute: () => setTheme("light"),
      },
      {
        id: "switch-to-dark-theme",
        parentActionId: pageId,
        label: "Switch to dark theme",
        aliases: ["Dark mode"],
        groupLabel: "Studio",
        checkIfAvailable: () => theme !== "dark",
        execute: () => setTheme("dark"),
      },
      {
        id: "switch-to-system-theme",
        parentActionId: pageId,
        label: "Switch to system theme",
        aliases: ["System mode", "Auto theme"],
        groupLabel: "Studio",
        checkIfAvailable: () => theme !== "system",
        execute: () => setTheme("system"),
      },
    ] satisfies Action[];

    actionsStore.send({ type: "registerManyActions", actions });

    return () => {
      actionsStore.send({
        type: "unregisterManyActions",
        ids: actions.map((a) => a.id),
      });
    };
  }, [theme, setTheme]);
}
