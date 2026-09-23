"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "lib/i18n";
import { BiIcon } from "components/BiIcon";

export default function NewCollectionForm() {
  const router = useRouter();
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.ok) {
        setName("");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex gap-2">
      <input
        className="form-control"
        placeholder={t("new_collection_placeholder")}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && create()}
        style={{ width: 240 }}
      />
      <button className="btn btn-gold" onClick={create} disabled={busy}>
        <BiIcon name="bi-plus-lg" className="me-1" />{t("create")}
      </button>
    </div>
  );
}
