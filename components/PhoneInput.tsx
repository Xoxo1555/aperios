"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage, type DictKey } from "lib/i18n";

const COUNTRIES: { code: string; dial: string; nameKey: DictKey }[] = [
  { code: "mg", dial: "+261", nameKey: "country_mg" },
  { code: "fr", dial: "+33", nameKey: "country_fr" },
  { code: "re", dial: "+262", nameKey: "country_re" },
  { code: "be", dial: "+32", nameKey: "country_be" },
  { code: "ch", dial: "+41", nameKey: "country_ch" },
  { code: "us", dial: "+1", nameKey: "country_us" },
  { code: "de", dial: "+49", nameKey: "country_de" },
  { code: "es", dial: "+34", nameKey: "country_es" },
  { code: "pt", dial: "+351", nameKey: "country_pt" },
  { code: "it", dial: "+39", nameKey: "country_it" },
  { code: "sa", dial: "+966", nameKey: "country_sa" },
  { code: "cn", dial: "+86", nameKey: "country_cn" },
  { code: "jp", dial: "+81", nameKey: "country_jp" },
];

function FlagSvg({ code, className }: { code: string; className?: string }) {
  const common = `${className ?? "w-6 h-4"} rounded-[2px] shrink-0`;
  if (code === "mg") {
    return (
      <svg viewBox="0 0 3 2" className={common} aria-hidden="true">
        <rect width="3" height="2" fill="#fff" />
        <rect width="1" height="2" fill="#fff" />
        <rect x="1" width="2" height="1" fill="#d8232a" />
        <rect x="1" y="1" width="2" height="1" fill="#007e3a" />
        <rect width="3" height="2" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="0.04" />
      </svg>
    );
  }
  if (code === "fr" || code === "re") {
    return (
      <svg viewBox="0 0 3 2" className={common} aria-hidden="true">
        {code === "re" && <rect width="3" height="2" rx="0.15" fill="#f5f0e6" />}
        <rect width="1" height="2" fill="#0055a4" />
        <rect x="1" width="1" height="2" fill="#fff" />
        <rect x="2" width="1" height="2" fill="#ef4135" />
        <rect width="3" height="2" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="0.04" />
      </svg>
    );
  }
  if (code === "be") {
    return (
      <svg viewBox="0 0 3 2" className={common} aria-hidden="true">
        <rect width="1" height="2" fill="#000" />
        <rect x="1" width="1" height="2" fill="#fae042" />
        <rect x="2" width="1" height="2" fill="#ed2939" />
        <rect width="3" height="2" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="0.04" />
      </svg>
    );
  }
  if (code === "ch") {
    return (
      <svg viewBox="0 0 2 2" className={common} aria-hidden="true">
        <rect width="2" height="2" fill="#da291c" />
        <rect x="0.85" y="0.4" width="0.3" height="1.2" fill="#fff" />
        <rect x="0.4" y="0.85" width="1.2" height="0.3" fill="#fff" />
      </svg>
    );
  }
  if (code === "de") {
    return (
      <svg viewBox="0 0 3 2" className={common} aria-hidden="true">
        <rect width="3" height="0.667" fill="#000" />
        <rect y="0.667" width="3" height="0.667" fill="#dd0000" />
        <rect y="1.333" width="3" height="0.667" fill="#ffcc00" />
        <rect width="3" height="2" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="0.04" />
      </svg>
    );
  }
  if (code === "es") {
    return (
      <svg viewBox="0 0 3 2" className={common} aria-hidden="true">
        <rect width="3" height="0.5" fill="#c60b1e" />
        <rect y="0.5" width="3" height="1" fill="#ffc400" />
        <rect y="1.5" width="3" height="0.5" fill="#c60b1e" />
        <rect width="3" height="2" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="0.04" />
      </svg>
    );
  }
  if (code === "pt") {
    return (
      <svg viewBox="0 0 3 2" className={common} aria-hidden="true">
        <rect width="1.2" height="2" fill="#006600" />
        <rect x="1.2" width="1.8" height="2" fill="#ff0000" />
        <circle cx="1.2" cy="1" r="0.4" fill="#ffcc00" />
        <rect width="3" height="2" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="0.04" />
      </svg>
    );
  }
  if (code === "it") {
    return (
      <svg viewBox="0 0 3 2" className={common} aria-hidden="true">
        <rect width="1" height="2" fill="#009246" />
        <rect x="1" width="1" height="2" fill="#fff" />
        <rect x="2" width="1" height="2" fill="#ce2b37" />
        <rect width="3" height="2" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="0.04" />
      </svg>
    );
  }
  if (code === "sa") {
    return (
      <svg viewBox="0 0 3 2" className={common} aria-hidden="true">
        <rect width="3" height="2" fill="#006c35" />
        <rect x="0.9" y="0.55" width="1.2" height="0.15" rx="0.075" fill="#fff" />
        <rect x="1.4" y="0.35" width="0.15" height="0.6" fill="#fff" />
        <rect width="3" height="2" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="0.04" />
      </svg>
    );
  }
  if (code === "cn") {
    return (
      <svg viewBox="0 0 3 2" className={common} aria-hidden="true">
        <rect width="3" height="2" fill="#de2910" />
        <polygon points="0.6,0.3 0.72,0.66 1.1,0.66 0.79,0.88 0.9,1.24 0.6,1.02 0.3,1.24 0.41,0.88 0.1,0.66 0.48,0.66" fill="#ffde00" />
        <circle cx="1.3" cy="0.45" r="0.08" fill="#ffde00" />
        <circle cx="1.5" cy="0.65" r="0.08" fill="#ffde00" />
        <circle cx="1.45" cy="0.9" r="0.08" fill="#ffde00" />
        <circle cx="1.25" cy="1.05" r="0.08" fill="#ffde00" />
        <rect width="3" height="2" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="0.04" />
      </svg>
    );
  }
  if (code === "jp") {
    return (
      <svg viewBox="0 0 3 2" className={common} aria-hidden="true">
        <rect width="3" height="2" fill="#fff" />
        <circle cx="1.5" cy="1" r="0.55" fill="#bc002d" />
        <rect width="3" height="2" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="0.04" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 19 10" className={common} aria-hidden="true">
      <rect width="19" height="10" fill="#b22234" />
      {[1, 3, 5, 7, 9].map((y) => (
        <rect key={y} y={y} width="19" height="1" fill="#fff" />
      ))}
      <rect width="8" height="5" fill="#3c3b6e" />
      {[1.2, 2.6, 4].map((x) =>
        [1.2, 2.6, 4].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="0.35" fill="#fff" />),
      )}
    </svg>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 shrink-0 pointer-events-none" aria-hidden="true">
      <path d="M2 4l4 4 4-4" fill="none" stroke="#f59e0b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function splitValue(value: string) {
  const match = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length).find((c) => value.replace(/\s/g, "").startsWith(c.dial));
  const dial = match?.dial ?? COUNTRIES[0].dial;
  const national = value.slice(value.indexOf(dial) + dial.length).replace(/[^\d\s]/g, "").trimStart();
  return { country: match ?? COUNTRIES[0], national };
}

export default function PhoneInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useLanguage();
  const [country, setCountry] = useState(() => splitValue(value).country);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(code: string) {
    const c = COUNTRIES.find((x) => x.code === code) ?? COUNTRIES[0];
    setCountry(c);
    setOpen(false);
    const national = splitValue(value).national;
    onChange(national ? `${c.dial} ${national}` : c.dial);
  }

  function onInput(v: string) {
    const national = v.replace(/[^\d\s]/g, "").trimStart();
    onChange(`${country.dial} ${national}`.trim());
  }

  return (
    <div ref={rootRef} className="relative flex items-stretch w-full h-12 bg-card border border-border rounded-xl transition-all focus-within:border-[#9a7b1c] focus-within:shadow-[0_0_0_3px_rgba(154,123,28,0.18)] hover:border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Indicatif pays"
        className={`flex items-center justify-center gap-1.5 pl-3 pr-2 shrink-0 rounded-l-xl bg-secondary dark:bg-[#1e1e26] hover:bg-gray-200 dark:hover:bg-[#2a2a34] transition-colors cursor-pointer focus:outline-none border-r border-border`}
      >
        <FlagSvg code={country.code} className="w-6 h-4" />
        <span className="text-zinc-100 text-xs font-medium tabular-nums">{country.dial}</span>
        <span className={`transition-transform ${open ? "rotate-180" : ""}`}>
          <Chevron />
        </span>
      </button>
      <input
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        className="flex-1 min-w-0 w-full bg-transparent text-zinc-100 text-sm px-3 focus:outline-none placeholder:text-muted-foreground tracking-wide"
        value={splitValue(value).national}
        placeholder="34 12 345 67"
        onChange={(e) => onInput(e.target.value)}
      />
      {open && (
        <ul role="listbox" className="absolute left-0 top-full mt-1.5 z-50 w-56 overflow-hidden rounded-xl border border-border bg-card p-1 shadow-md">
          {COUNTRIES.map((c) => (
            <li key={`${c.code}-${c.dial}`}>
              <button
                type="button"
                role="option"
                aria-selected={c.code === country.code}
                onClick={() => pick(c.code)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                  c.code === country.code ? "bg-[#9a7b1c]/10 text-amber-300" : "text-zinc-300 hover:bg-white/5"
                }`}
              >
                <FlagSvg code={c.code} className="w-6 h-4" />
                <span className="flex-1 truncate">{t(c.nameKey)}</span>
                <span className="tabular-nums text-muted-foreground">{c.dial}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
