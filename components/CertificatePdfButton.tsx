"use client";

import { useState } from "react";
import { jsPDF } from "jspdf";
import { useLanguage } from "lib/i18n";
import { BiIcon } from "components/BiIcon";

interface Props {
  serial: string;
  title: string;
  artist: string;
  edition: string;
  size: string;
  mount: string;
  price: string;
  orderNumber: string;
  hash: string;
  imageUrl: string;
  /** When true, no PDF is generated: the certificate is revoked and must
   *  never be exported as a valid document (I6 amendment 3). */
  revoked?: boolean;
}

export default function CertificatePdfButton(props: Props) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);

  async function download() {
    if (props.revoked) return;
    setBusy(true);
    try {
      const doc = new jsPDF({ unit: "mm", format: "a4" }); // 210 × 297
      const W = 210;

      // Background
      doc.setFillColor(250, 247, 240);
      doc.rect(0, 0, W, 297, "F");

      // Double border
      doc.setDrawColor(183, 154, 75);
      doc.setLineWidth(0.8);
      doc.rect(14, 14, W - 28, 269);
      doc.setLineWidth(0.3);
      doc.rect(19, 19, W - 38, 259);

      // Header
      doc.setTextColor(28, 36, 51);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.text("APERIO. FINE ART", W / 2, 42, { align: "center" });
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(t("cert_of_auth").toUpperCase(), W / 2, 50, { align: "center" });

      // Watermark (light grey, rotated)
      doc.setTextColor(232, 226, 210);
      doc.setFontSize(64);
      doc.text("APERIO", W / 2, 175, { align: "center", angle: -18 });
      doc.setTextColor(28, 36, 51);

      // Photo
      try {
        const img = await loadImage(props.imageUrl);
        const aspect = img.height / img.width;
        let iw = 80;
        let ih = iw * aspect;
        if (ih > 90) {
          ih = 90;
          iw = ih / aspect;
        }
        doc.addImage(img, "JPEG", 24, 70, iw, ih);
      } catch {
        doc.setFillColor(240, 238, 230);
        doc.roundedRect(24, 70, 80, 90, 3, 3, "F");
        doc.setTextColor(140, 130, 110);
        doc.setFontSize(10);
        doc.text(`${t("work_label")}:`, 64, 112, { align: "center" });
        doc.text(props.title, 64, 122, { align: "center", maxWidth: 72 });
      }

      // Details
      const x = 118;
      let y = 72;
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(props.title, x, y);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(90, 98, 114);
      doc.text(`${props.artist} · ${t("limited_edition_label")}`, x, y + 7);
      doc.setTextColor(28, 36, 51);

      const rows: Array<[string, string]> = [
        [t("cert_serial"), props.serial],
        [t("edition"), props.edition],
        [t("cert_size"), props.size],
        [t("cert_mount"), props.mount],
        [t("cert_purchase_value"), props.price],
        [t("cert_order"), props.orderNumber],
      ];
      doc.setFontSize(10);
      for (const [k, v] of rows) {
        doc.setFont("helvetica", "bold");
        doc.setTextColor(183, 154, 75);
        doc.text(k.toUpperCase(), x, y + 20);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(28, 36, 51);
        doc.text(v, x + 60, y + 20);
        y += 10;
      }

      // Hash
      doc.setFontSize(8);
      doc.setTextColor(140, 130, 110);
      doc.text(`${t("cert_fingerprint")}: ${props.hash}`, 24, 240, { maxWidth: 162 });
      doc.text(`${t("cert_verify_online")}: aperio.gallery/certificates/${props.serial}`, 24, 245, { maxWidth: 162 });

      // Signature
      doc.setDrawColor(183, 154, 75);
      doc.line(140, 258, 188, 258);
      doc.setFontSize(9);
      doc.setTextColor(28, 36, 51);
      doc.text(props.artist, 164, 263, { align: "center" });
      doc.setFontSize(8);
      doc.setTextColor(140, 130, 110);
      doc.text(t("cert_signature"), 164, 268, { align: "center" });

      doc.save(`certificate-${props.serial}.pdf`);
    } catch (err) {
      console.error("PDF generation failed", err);
      alert(t("pdf_failed"));
    } finally {
      setBusy(false);
    }
  }

  if (props.revoked) {
    return (
      <span className="badge rounded-pill" style={{ background: "#b02a37", color: "#fff", fontSize: "0.72rem", letterSpacing: "0.08em" }}>
        {t("cert_revoked")}
      </span>
    );
  }

  return (
    <button className="btn btn-gold" onClick={download} disabled={busy}>
      {busy ? (
        <span className="spinner-border spinner-border-sm" />
      ) : (
        <>
          <BiIcon name="bi-file-earmark-text" className="me-2" />{t("download_pdf")}
        </>
      )}
    </button>
  );
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}