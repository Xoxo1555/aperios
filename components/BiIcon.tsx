"use client";

/**
 * Renders a Bootstrap Icons glyph by name.
 *
 * The stylesheet (bootstrap-icons, loaded in app/layout.tsx) already renders
 * the correct glyph for any valid icon class — there is no need (and it is
 * actively harmful) to gate this behind a hand-maintained whitelist: valid
 * icons missing from such a list were being silently replaced by the generic
 * faCircleQuestion glyph (a 4-squares grid), which is exactly the broken
 * icon bug we're fixing. We only fall back to a valid `bi-image` glyph when
 * no Bootstrap icon class name is provided.
 */
export function BiIcon({ name, className, style }: { name: string; className?: string; style?: React.CSSProperties }) {
  const glyph = name.trim() ? name : "bi-image";
  return <i className={`bi ${glyph}${className ? ` ${className}` : ""}`} style={style} aria-hidden="true" />;
}
