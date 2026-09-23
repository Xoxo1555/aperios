"use client";

import { useState } from "react";
import { BiIcon } from "components/BiIcon";
import { useLanguage } from "lib/i18n";

interface Props {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  minLength?: number;
}

export default function PasswordField({
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
  minLength,
}: Props) {
  const { t } = useLanguage();
  const [show, setShow] = useState(false);
  const resolvedLabel = label ?? t("password_label");
  return (
    <div className="flex flex-col gap-1.5">
      {resolvedLabel && <label className="form-label">{resolvedLabel}</label>}
      <div className="relative">
        <input
          className="form-control"
          type={show ? "text" : "password"}
          value={value}
          minLength={minLength}
          placeholder={placeholder}
          autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)}
          required
        />
        <button
          type="button"
          className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center justify-center p-1 bg-transparent border-0 cursor-pointer text-muted-foreground hover:text-gray-600 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ap-accent)]"
          aria-label={show ? t("hide_password") : t("show_password")}
          onClick={(e) => { e.preventDefault(); setShow((prev) => !prev); }}
        >
          {show ? <BiIcon name="bi-eye" style={{ fontSize: 20 }} /> : <BiIcon name="bi-eye-slash" style={{ fontSize: 20 }} />}
        </button>
      </div>
    </div>
  );
}