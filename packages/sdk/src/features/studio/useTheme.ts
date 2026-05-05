import * as React from "react";

import type { Action } from "../provider/actionsStore";
import { actionsStore } from "../provider/actionsStore";

type Theme = "dark" | "light" | "system";

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

  const applyTheme = (themeToApply: "dark" | "light") => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(themeToApply);
  };

  React.useEffect(() => {
    const root = window.document.documentElement;

    root.classList.remove("light", "dark");

    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

      const updateSystemTheme = () => {
        const systemTheme = mediaQuery.matches ? "dark" : "light";
        applyTheme(systemTheme);
      };

      // Apply initial system theme
      updateSystemTheme();

      // Listen for changes to system theme preference
      mediaQuery.addEventListener("change", updateSystemTheme);

      return () => {
        mediaQuery.removeEventListener("change", updateSystemTheme);
        root.classList.remove("light", "dark");
      };
    }

    root.classList.add(theme);

    // On unmount (e.g. user signs out → studio chrome unmounts), clear the
    // class so the host page returns to its default (light) state.
    return () => {
      root.classList.remove("light", "dark");
    };
  }, [theme]);

  React.useEffect(() => {
    localStorage.setItem("theme", theme);
  }, [theme]);

  return {
    theme,
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
        groupLabel: "Studio",
        checkIfAvailable: () => true,
        hasChildren: true,
        execute: () => {},
      },
      {
        id: "switch-to-light-theme",
        parentActionId: pageId,
        label: "Switch to light theme",
        groupLabel: "Studio",
        checkIfAvailable: () => theme !== "light",
        execute: () => setTheme("light"),
      },
      {
        id: "switch-to-dark-theme",
        parentActionId: pageId,
        label: "Switch to dark theme",
        groupLabel: "Studio",
        checkIfAvailable: () => theme !== "dark",
        execute: () => setTheme("dark"),
      },
      {
        id: "switch-to-system-theme",
        parentActionId: pageId,
        label: "Switch to system theme",
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
