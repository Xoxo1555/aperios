"use client";

import { useSyncExternalStore, type ReactNode } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "aperio-theme";

/* Script exécuté de façon synchrone, avant l'hydratation React, pour
   poser data-theme sur <html> et éviter tout flash de la mauvaise
   palette au chargement (FOUC). Voir app/layout.tsx. */
export { themeInitScript } from "lib/themeInitScript";

/* ============================================================================
   UNE SEULE source de vérité pour le thème : l'attribut [data-theme] posé sur
   <html>. La palette CSS (variables --ap-*) est pilotée par cet attribut
   (`:root[data-theme="dark"]`, cf. globals.css) ; l'icône du toggle, son
   aria-label, tout ce qui doit « refléter le thème » se dérive de la MÊME
   valeur via le store externe ci-dessous.

   Avant, l'état vivait dans un useState React (initialisé depuis le DOM) ET
   dans l'attribut : deux copies. L'icône était en plus conditionnée par
   useMounted() (rendu serveur → faux → icône « lune » systématique), et le
   clic toggletait une valeur d'état potentiellement décalée. Résultat : une
   icône qui pouvait ne pas refléter le thème réel, et un clic qui pouvait ne
   rien changer visuellement (ex. clic pendant l'hydratation, ou état désync).

   Ici : getSnapshot() lit l'attribut à l'instant T. Un clic écrit l'attribut
   (la CSS change immédiatement) puis notifie les abonnés (l'icône re-rend à
   l'instant T+1). Plus aucune copie qui peut diverger.
   ============================================================================ */

type Listener = () => void;
const listeners = new Set<Listener>();

function getThemeFromDom(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function subscribeTheme(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function notifyTheme(): void {
  listeners.forEach((l) => l());
}

export function setTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
  try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* ignore */ }
  notifyTheme();
}

/* Toggle dérivé de l'état RÉEL courant (l'attribut), jamais d'une copie
   mémorisée : chaque clic inverse réellement le thème, y compris en cas de
   double-clic rapide. */
export function toggleTheme(): void {
  setTheme(getThemeFromDom() === "dark" ? "light" : "dark");
}

export function useTheme(): { theme: Theme; toggleTheme: () => void; setTheme: (t: Theme) => void } {
  const theme = useSyncExternalStore(subscribeTheme, getThemeFromDom, () => "light" as Theme);
  return { theme, toggleTheme, setTheme };
}

/* Garde-structure conservé pour compatibilité avec app/layout.tsx (le store
   étant global, il n'a rien à fournir). */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}