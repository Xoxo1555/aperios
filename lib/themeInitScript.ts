/**
 * Anti-FOUC theme init script — server-safe, no React (must stay importable
 * from Server Components, hence kept out of the "use client" lib/theme.tsx).
 */

export const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem("aperio-theme");
    var theme = stored === "dark" || stored === "light"
      ? stored
      : (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "light");
  }
})();
`;