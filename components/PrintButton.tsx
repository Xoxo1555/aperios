"use client";

import { useLanguage } from "lib/i18n";
import { BiIcon } from "components/BiIcon";

export default function PrintButton() {
  const { t } = useLanguage();
  return (
    <button className="btn btn-gold" onClick={() => window.print()}>
      <BiIcon name="bi-printer" className="me-2" />{t("print_save_pdf")}
    </button>
  );
}