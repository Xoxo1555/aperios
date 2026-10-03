"use client";

import { useLanguage } from "lib/i18n";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPrint } from "@fortawesome/free-solid-svg-icons";

export default function PrintButton() {
  const { t } = useLanguage();
  return (
    <button className="btn btn-gold" onClick={() => window.print()}>
      <FontAwesomeIcon icon={faPrint} className="me-2" />{t("print_save_pdf")}
    </button>
  );
}