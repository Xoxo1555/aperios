"use client";

import Link from "next/link";
import { useLanguage } from "lib/i18n";
import { BiIcon } from "components/BiIcon";

export default function ContactClient() {
  const { t } = useLanguage();

  return (
    <div className="bg-background text-foreground">
      <div className="container py-5" style={{ maxWidth: 1000 }}>
        <nav aria-label="breadcrumb" className="mb-4 pt-3">
          <ol className="breadcrumb mb-0" style={{ fontSize: "0.85rem" }}>
            <li className="breadcrumb-item">
              <Link href="/" style={{ color: "var(--ap-gold-2)" }}>{t("nav_home")}</Link>
            </li>
            <li className="breadcrumb-item active" aria-current="page" style={{ color: "var(--ap-card-muted)" }}>
              {t("contact")}
            </li>
          </ol>
        </nav>

        <div className="row g-5">
          <div className="col-lg-5">
            <div className="gallery-label" style={{ color: "var(--ap-gold-2)" }}>{t("contact_label")}</div>
            <h1 className="font-serif font-bold mb-3" style={{ fontSize: "clamp(2rem, 3.5vw, 2.8rem)" }}>
              {t("contact_title")}<span style={{ color: "var(--ap-gold)" }}>.</span>
            </h1>
            <p className="text-muted-foreground mb-4" style={{ lineHeight: 1.7, fontSize: "0.98rem" }}>
              {t("contact_subtitle")}
            </p>

            <div className="grid gap-4 mt-4">
              <div className="flex gap-3 items-start">
                <span className="icon-btn" style={{ width: 44, height: 44, flexShrink: 0, color: "var(--ap-gold-2)", background: "rgba(245,158,11,0.12)", borderColor: "rgba(245,158,11,0.35)" }}>
                  <BiIcon name="bi-geo-alt" />
                </span>
                <div>
                  <div className="font-bold" style={{ fontSize: "0.95rem", color: "var(--ap-gold-light)" }}>{t("contact_gallery_title")}</div>
                  <div className="text-muted-foreground" style={{ fontSize: "0.88rem", lineHeight: 1.5 }}>
                    {t("contact_gallery_addr_1")}
                    <br />
                    {t("contact_gallery_addr_2")}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 items-start">
                <span className="icon-btn" style={{ width: 44, height: 44, flexShrink: 0, color: "var(--ap-gold-2)", background: "rgba(245,158,11,0.12)", borderColor: "rgba(245,158,11,0.35)" }}>
                  <BiIcon name="bi-telephone" />
                </span>
                <div>
                  <div className="font-bold" style={{ fontSize: "0.95rem", color: "var(--ap-gold-light)" }}>{t("contact_phone_title")}</div>
                  <div className="text-muted-foreground" style={{ fontSize: "0.88rem", lineHeight: 1.5 }}>
                    {t("contact_phone_mg")}
                    <br />
                    {t("contact_phone_intl")}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 items-start">
                <span className="icon-btn" style={{ width: 44, height: 44, flexShrink: 0, color: "var(--ap-gold-2)", background: "rgba(245,158,11,0.12)", borderColor: "rgba(245,158,11,0.35)" }}>
                  <BiIcon name="bi-envelope" />
                </span>
                <div>
                  <div className="font-bold" style={{ fontSize: "0.95rem", color: "var(--ap-gold-light)" }}>{t("contact_email_title")}</div>
                  <div className="text-muted-foreground" style={{ fontSize: "0.88rem" }}>
                    contact@aperio.gallery
                    <br />
                    artistes@aperio.gallery
                  </div>
                </div>
              </div>

              <div className="flex gap-3 items-start">
                <span className="icon-btn" style={{ width: 44, height: 44, flexShrink: 0, color: "var(--ap-gold-2)", background: "rgba(245,158,11,0.12)", borderColor: "rgba(245,158,11,0.35)" }}>
                  <BiIcon name="bi-clock" />
                </span>
                <div>
                  <div className="font-bold" style={{ fontSize: "0.95rem", color: "var(--ap-gold-light)" }}>{t("contact_hours_title")}</div>
                  <div className="text-muted-foreground" style={{ fontSize: "0.88rem", lineHeight: 1.5 }}>
                    {t("contact_hours_week")}
                    <br />
                    {t("contact_hours_closed")}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="col-lg-7">
            <div className="bg-card rounded-2xl p-4 p-md-5 border border-border">
              <h3 className="!text-card-foreground font-bold mb-3" style={{ fontSize: "1.3rem", color: "var(--ap-gold-light)" }}>
                {t("contact_form_title")}
              </h3>
              <p className="text-muted-foreground mb-4" style={{ fontSize: "0.9rem" }}>
                {t("contact_form_sub")}
              </p>

              <form>
                <div className="row g-3 pb-2">
                  <div className="col-md-6">
                    <label className="form-label text-xs uppercase tracking-wider text-muted-foreground font-semibold">{t("contact_name_label")}</label>
                    <input className="form-control bg-card text-card-foreground border-border" placeholder={t("contact_name_placeholder")} required />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label text-xs uppercase tracking-wider text-muted-foreground font-semibold">{t("contact_email_label")}</label>
                    <input className="form-control bg-card text-card-foreground border-border" type="email" placeholder={t("contact_email_placeholder")} required />
                  </div>
                  <div className="col-12">
                    <label className="form-label text-xs uppercase tracking-wider text-muted-foreground font-semibold">{t("contact_subject_label")}</label>
                    <select className="form-select bg-card text-card-foreground border-border">
                      <option>{t("contact_subject_option_1")}</option>
                      <option>{t("contact_subject_option_2")}</option>
                      <option>{t("contact_subject_option_3")}</option>
                      <option>{t("contact_subject_option_4")}</option>
                      <option>{t("contact_subject_option_5")}</option>
                    </select>
                  </div>
                  <div className="col-12">
                    <label className="form-label text-xs uppercase tracking-wider text-muted-foreground font-semibold">{t("contact_message_label")}</label>
                    <textarea className="form-control bg-card text-card-foreground border-border min-h-[160px] resize-y" rows={6} placeholder={t("contact_message_placeholder")} required />
                  </div>
                  <div className="col-12">
                    <button className="btn btn-gold w-full" type="submit">
                      <span className="inline-flex items-center justify-center shrink-0">
                        <BiIcon name="bi-send" className="me-2" />
                      </span>
                      {t("contact_submit")}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-2xl p-4 text-center relative overflow-hidden surface-dark border border-border" style={{ background: "rgba(20,17,22,0.97)" }}>
          <div className="pattern-lamba absolute" style={{ inset: 0, opacity: 0.2 }} />
          <div className="relative py-3">
            <h4 className="!text-card-foreground font-bold mb-2" style={{ color: "var(--ap-accent-on-dark)" }}>{t("contact_visit_title")}</h4>
            <p className="text-muted-foreground mx-auto mb-0" style={{ maxWidth: 580, fontSize: "0.92rem", lineHeight: 1.6 }}>
              {t("contact_visit_desc")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
