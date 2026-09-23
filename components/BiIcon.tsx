"use client";

/**
 * Renders a Bootstrap Icons glyph by name.
 *
 * The stylesheet (bootstrap-icons, loaded in app/layout.tsx) already renders
 * the correct glyph for any valid icon class — there is no need (and it is
 * actively harmful) to gate this behind a hand-maintained whitelist: valid
 * icons missing from such a list were being silently replaced by the generic
 * "bi-question-circle" glyph (a 4-squares grid), which is exactly the broken
 * icon bug we're fixing. We only fall back when no name is provided.
 */
export function BiIcon({ name, className, style }: { name: string; className?: string; style?: React.CSSProperties }) {
  const normalized = name.trim() ? name : "bi-question-circle";
  return <i className={`bi ${normalized}${className ? ` ${className}` : ""}`} style={style} aria-hidden="true" />;
}
