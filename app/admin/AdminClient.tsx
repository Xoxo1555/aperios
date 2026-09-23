"use client";

import { useCallback, useEffect, useState } from "react";
import { BiIcon } from "components/BiIcon";
import { fmtEur } from "lib/format";

type Tab = "dashboard" | "users" | "transactions" | "exceptions";

interface AdminStats {
  users: number;
  photos: number;
  orders: number;
  revenue: number;
  commission: number;
  volume: { deposits: number; purchases: number; payouts: number };
  refundPending: number;
  refundPendingReasons: Record<string, number>;
  oldestRefundPending: { orderNumber: string; refundReason: string; total: string; createdAt: string; userEmail: string } | null;
  openDisputes: number;
  negativeBalances: number;
  negativePhotographers: Array<{ id: number; name: string; email: string; availableBalance: string }>;
}

interface Overview {
  stats: AdminStats;
  recentOrders: Array<{ id: number; orderNumber: string; total: string; status: string; createdAt: string; userName: string; userEmail: string }>;
  recentUsers: Array<{ id: number; name: string; email: string; role: string; createdAt: string }>;
}

interface Tx {
  id: string;
  reference: string;
  amount: string;
  type: string;
  status: string;
  paymentMethod: string;
  createdAt: string;
  userName: string;
  userEmail: string;
}

interface TxsResponse {
  transactions: Tx[];
  total: number;
  page: number;
  pages: number;
  totals: Record<string, number>;
}

interface AUser {
  id: number;
  name: string;
  email: string;
  role: string;
  availableBalance: string;
  payoutEnabled: boolean;
  emailVerified: boolean;
  createdAt: string;
}

interface UsersResponse {
  users: AUser[];
  total: number;
  page: number;
  pages: number;
}

const STATUS_COLORS: Record<string, string> = {
  completed: "var(--ap-green)",
  pending: "var(--ap-gold)",
  paid: "var(--ap-green)",
  failed: "#e11d48",
  cancelled: "var(--ap-muted)",
};

function badgeColor(status: string) {
  const c = STATUS_COLORS[status] ?? "var(--ap-gold)";
  return { color: c, background: "rgba(125,189,140,0.12)" };
}

function typeColor(type: string) {
  switch (type) {
    case "deposit": return { color: "var(--ap-green)", icon: "bi-arrow-down-circle" };
    case "purchase": return { color: "var(--ap-gold)", icon: "bi-cart" };
    case "payout": return { color: "#38bdf8", icon: "bi-arrow-up-circle" };
    default: return { color: "var(--ap-muted)", icon: "bi-circle" };
  }
}

export default function AdminClient() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [txs, setTxs] = useState<TxsResponse | null>(null);
  const [usersData, setUsersData] = useState<UsersResponse | null>(null);

  const [txType, setTxType] = useState("");
  const [txPage, setTxPage] = useState(1);
  const [userQ, setUserQ] = useState("");
  const [userRole, setUserRole] = useState("");
  const [userPage, setUserPage] = useState(1);
  const [loadError, setLoadError] = useState("");

  const loadOverview = useCallback(async () => {
    try {
      const res = await fetch("/api/admin");
      if (!res.ok) throw new Error();
      setOverview(await res.json());
    } catch {
      setLoadError("Impossible de charger le tableau de bord.");
    }
  }, []);

  const loadTxs = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(txPage), limit: "30" });
      if (txType) params.set("type", txType);
      const res = await fetch(`/api/admin/transactions?${params}`);
      if (!res.ok) throw new Error();
      setTxs(await res.json());
    } catch {
      setLoadError("Impossible de charger le journal des transactions.");
    }
  }, [txPage, txType]);

  const loadUsers = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(userPage), limit: "25" });
      if (userRole) params.set("role", userRole);
      if (userQ) params.set("q", userQ);
      const res = await fetch(`/api/admin/users?${params}`);
      if (!res.ok) throw new Error();
      setUsersData(await res.json());
    } catch {
      setLoadError("Impossible de charger les utilisateurs.");
    }
  }, [userPage, userRole, userQ]);

  useEffect(() => { loadOverview(); }, [loadOverview]);
  useEffect(() => { if (tab === "transactions" || tab === "exceptions") loadTxs(); }, [tab, loadTxs]);
  useEffect(() => { if (tab === "users") loadUsers(); }, [tab, loadUsers]);

  const activeTransactions: Tx[] = txs?.transactions ?? [];

  const tabs: Array<{ id: Tab; label: string; icon: string }> = [
    { id: "dashboard", label: "Tableau de bord", icon: "bi-speedometer2" },
    { id: "users", label: "Utilisateurs", icon: "bi-people" },
    { id: "transactions", label: "Transactions", icon: "bi-receipt" },
    { id: "exceptions", label: "Exceptions", icon: "bi-exclamation-octagon" },
  ];

  return (
    <>
      <div className="flex flex-wrap gap-2 mb-4">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`btn ${tab === t.id ? "btn-gold" : "btn-ghost"}`}
            onClick={() => setTab(t.id)}
          >
            <BiIcon name={t.icon} className="me-1" />{t.label}
          </button>
        ))}
      </div>

      {loadError && <div className="alert alert-danger py-2 mb-3" style={{ fontSize: "0.85rem" }}>{loadError}</div>}

      {tab === "dashboard" && (
        <DashboardTab overview={overview} />
      )}

      {tab === "users" && (
        <UsersTab
          data={usersData}
          q={userQ}
          role={userRole}
          onQ={setUserQ}
          onRole={setUserRole}
          onPage={setUserPage}
        />
      )}

      {tab === "transactions" && (
        <TransactionsTab
          data={txs}
          activeTransactions={activeTransactions}
          type={txType}
          onType={setTxType}
          onPage={setTxPage}
        />
      )}

      {tab === "exceptions" && (
        <ExceptionsTab
          data={txs}
          activeTransactions={activeTransactions.filter((t) => t.status === "failed")}
          onPage={setTxPage}
        />
      )}
    </>
  );
}

function DashboardTab({ overview }: { overview: Overview | null }) {
  if (!overview) {
    return <div className="text-center py-5"><div className="spinner-border text-warning" /></div>;
  }
  const s = overview.stats;
  const cards = [
    { label: "CA brut (ventes)", value: fmtEur(s.revenue), icon: "bi-graph-up-arrow", color: "var(--ap-gold)" },
    { label: "Commission plateforme (20%)", value: fmtEur(s.commission), icon: "bi-percent", color: "var(--ap-green)" },
    { label: "Dépôts portefeuille", value: fmtEur(s.volume.deposits), icon: "bi-arrow-down-circle", color: "var(--ap-green)" },
    { label: "Achats wallet", value: fmtEur(s.volume.purchases), icon: "bi-cart", color: "var(--ap-gold)" },
    { label: "Retraits payés", value: fmtEur(s.volume.payouts), icon: "bi-arrow-up-circle", color: "#38bdf8" },
    { label: "Commandes", value: String(s.orders), icon: "bi-receipt", color: "var(--ap-gold)" },
    { label: "Utilisateurs", value: String(s.users), icon: "bi-people", color: "var(--ap-green)" },
    { label: "Photos", value: String(s.photos), icon: "bi-images", color: "var(--ap-gold)" },
    { label: "Remboursements en attente", value: String(s.refundPending), icon: "bi-arrow-counterclockwise", color: "#e11d48" },
    { label: "Litiges ouverts", value: String(s.openDisputes), icon: "bi-shield-x", color: "#fb923c" },
    { label: "Soldes vendeurs négatifs", value: String(s.negativeBalances), icon: "bi-dash-circle", color: "#e11d48" },
  ];

  return (
    <>
      <div className="row g-3 mb-4">
        {cards.map((c, i) => (
          <div className="col-6 col-md-4 col-lg-3" key={i}>
            <div className="stat-tile">
              <BiIcon name={c.icon} className="text-gold" style={{ fontSize: "1.2rem", color: c.color }} />
              <div className="value font-display mt-1">{c.value}</div>
              <div className="label">{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Exceptions financières (I6 clôture — tâche 2) : remboursements à
          traiter, litiges ouverts, soldes vendeurs négatifs. */}
      <div className="row g-4 mb-4">
        <div className="col-lg-4">
          <div className="bg-surface rounded-2xl p-4" style={{ border: "1px solid var(--ap-border)" }}>
            <h5 className="font-display font-bold mb-3"><BiIcon name="bi-arrow-counterclockwise" className="me-2" style={{ color: "#e11d48" }} />Remboursements en attente</h5>
            {s.refundPending === 0 ? (
              <p className="text-muted-2 mb-0" style={{ fontSize: "0.85rem" }}>Aucun remboursement en attente.</p>
            ) : (
              <>
                {Object.entries(s.refundPendingReasons).map(([reason, n]) => (
                  <div key={reason} className="flex justify-between items-center py-1" style={{ borderBottom: "1px solid var(--ap-border)" }}>
                    <span className="text-muted-2" style={{ fontSize: "0.78rem" }}>{reason}</span>
                    <span className="badge rounded-pill" style={{ fontSize: "0.65rem", ...badgeColor("pending") }}>{n}</span>
                  </div>
                ))}
                {s.oldestRefundPending && (
                  <div className="mt-2" style={{ fontSize: "0.78rem" }}>
                    <div className="text-muted-2">Plus ancienne en attente</div>
                    <div className="fw-semibold">{s.oldestRefundPending.orderNumber} · {s.oldestRefundPending.refundReason}</div>
                    <div className="text-muted-2">{s.oldestRefundPending.userEmail} · {new Date(s.oldestRefundPending.createdAt).toLocaleString()}</div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        <div className="col-lg-4">
          <div className="bg-surface rounded-2xl p-4" style={{ border: "1px solid var(--ap-border)" }}>
            <h5 className="font-display font-bold mb-3"><BiIcon name="bi-shield-x" className="me-2" style={{ color: "#fb923c" }} />Litiges ouverts</h5>
            <div className="value font-display mt-1">{s.openDisputes}</div>
            <p className="text-muted-2 mb-0" style={{ fontSize: "0.78rem" }}>Commandes payées avec <span className="badge rounded-pill text-bg-warning" style={{ fontSize: "0.62rem" }}>disputed_at</span> — vente conservée, surveillance requise.</p>
          </div>
        </div>
        <div className="col-lg-4">
          <div className="bg-surface rounded-2xl p-4" style={{ border: "1px solid var(--ap-border)" }}>
            <h5 className="font-display font-bold mb-3"><BiIcon name="bi-dash-circle" className="me-2" style={{ color: "#e11d48" }} />Soldes vendeurs négatifs</h5>
            <div className="value font-display mt-1">{s.negativeBalances}</div>
            <div style={{ maxHeight: 140, overflow: "auto" }} className="mt-2">
              {s.negativePhotographers.map((p) => (
                <div key={p.id} className="flex justify-between items-center py-1" style={{ borderBottom: "1px solid var(--ap-border)", fontSize: "0.78rem" }}>
                  <span className="text-muted-2">{p.name}</span>
                  <span style={{ color: "#e11d48", fontWeight: 600 }}>{fmtEur(p.availableBalance)}</span>
                </div>
              ))}
              {s.negativeBalances > s.negativePhotographers.length && (
                <div className="text-muted-2 mt-1" style={{ fontSize: "0.72rem" }}>+ {s.negativeBalances - s.negativePhotographers.length} autre(s)…</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="row g-4">
        <div className="col-lg-6">
          <div className="bg-surface rounded-2xl p-4" style={{ border: "1px solid var(--ap-border)" }}>
            <h5 className="font-display font-bold mb-3"><BiIcon name="bi-receipt" className="me-2 text-gold" />Dernières commandes</h5>
            <div style={{ maxHeight: 340, overflow: "auto" }}>
              {overview.recentOrders.map((o) => (
                <div key={o.id} className="flex justify-between items-center py-2" style={{ borderBottom: "1px solid var(--ap-border)" }}>
                  <div>
                    <div className="fw-semibold" style={{ fontSize: "0.85rem" }}>{o.orderNumber}</div>
                    <div className="text-muted-2" style={{ fontSize: "0.72rem" }}>{o.userName} · {o.userEmail}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-gold font-bold" style={{ fontSize: "0.88rem" }}>{fmtEur(o.total)}</div>
                    <span className="badge rounded-pill uppercase" style={{ fontSize: "0.6rem", ...badgeColor(o.status) }}>{o.status}</span>
                  </div>
                </div>
              ))}
              {overview.recentOrders.length === 0 && <p className="text-muted-2 mb-0" style={{ fontSize: "0.85rem" }}>Aucune commande récente.</p>}
            </div>
          </div>
        </div>
        <div className="col-lg-6">
          <div className="bg-surface rounded-2xl p-4" style={{ border: "1px solid var(--ap-border)" }}>
            <h5 className="font-display font-bold mb-3"><BiIcon name="bi-people" className="me-2 text-gold" />Derniers utilisateurs</h5>
            <div style={{ maxHeight: 340, overflow: "auto" }}>
              {overview.recentUsers.map((u) => (
                <div key={u.id} className="flex justify-between items-center py-2" style={{ borderBottom: "1px solid var(--ap-border)" }}>
                  <div>
                    <div className="fw-semibold" style={{ fontSize: "0.85rem" }}>{u.name}</div>
                    <div className="text-muted-2" style={{ fontSize: "0.72rem" }}>{u.email}</div>
                  </div>
                  <span className="badge rounded-pill uppercase" style={{ fontSize: "0.6rem", ...badgeColor(u.role) }}>{u.role}</span>
                </div>
              ))}
              {overview.recentUsers.length === 0 && <p className="text-muted-2 mb-0" style={{ fontSize: "0.85rem" }}>Aucun utilisateur.</p>}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function UsersTab({ data, q, role, onQ, onRole, onPage }: {
  data: UsersResponse | null; q: string; role: string;
  onQ: (v: string) => void; onRole: (v: string) => void; onPage: (v: number) => void;
}) {
  const [debouncedQ, setDebouncedQ] = useState(q);
  useEffect(() => {
    const id = setTimeout(() => onQ(debouncedQ), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ]);

  return (
    <div className="bg-surface rounded-2xl p-4" style={{ border: "1px solid var(--ap-border)" }}>
      <div className="flex flex-wrap gap-2 mb-3">
        <input
          className="form-control"
          style={{ maxWidth: 260 }}
          placeholder="Rechercher (nom / email)"
          value={debouncedQ}
          onChange={(e) => { setDebouncedQ(e.target.value); onPage(1); }}
        />
        <select className="form-select" style={{ maxWidth: 180 }} value={role} onChange={(e) => { onRole(e.target.value); onPage(1); }}>
          <option value="">Tous les rôles</option>
          <option value="admin">Admin</option>
          <option value="photographer">Créateur</option>
          <option value="buyer">Collecteur</option>
        </select>
      </div>

      <div style={{ maxHeight: 520, overflow: "auto" }}>
        <table className="table table-dark-ap table-sm align-middle">
          <thead>
            <tr>
              <th>Nom</th><th>Email</th><th>Rôle</th><th className="text-right">Solde</th><th>Inscrit</th>
            </tr>
          </thead>
          <tbody>
            {(data?.users ?? []).map((u) => (
              <tr key={u.id}>
                <td className="fw-semibold">{u.name}</td>
                <td style={{ fontSize: "0.8rem" }}>{u.email}</td>
                <td><span className="badge rounded-pill uppercase" style={{ fontSize: "0.6rem", ...badgeColor(u.role) }}>{u.role}</span></td>
                <td className="text-right" style={{ fontSize: "0.85rem" }}>{fmtEur(u.availableBalance)}</td>
                <td className="text-muted-2" style={{ fontSize: "0.75rem" }}>{new Date(u.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
            {(data?.users ?? []).length === 0 && (
              <tr><td colSpan={5} className="text-center text-muted-2 py-3">Aucun utilisateur.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {data && data.pages > 1 && (
        <div className="flex items-center justify-between mt-3">
          <span className="text-muted-2" style={{ fontSize: "0.8rem" }}>{data.total} utilisateurs · page {data.page}/{data.pages}</span>
          <div className="flex gap-2">
            <button className="btn btn-ghost btn-sm" disabled={data.page <= 1} onClick={() => onPage(data.page - 1)}>Précédent</button>
            <button className="btn btn-ghost btn-sm" disabled={data.page >= data.pages} onClick={() => onPage(data.page + 1)}>Suivant</button>
          </div>
        </div>
      )}
    </div>
  );
}

function TransactionsTab({ data, activeTransactions, type, onType, onPage }: {
  data: TxsResponse | null; activeTransactions: Tx[]; type: string;
  onType: (v: string) => void; onPage: (v: number) => void;
}) {
  return (
    <TxList
      data={data}
      activeTransactions={activeTransactions}
      totals={data?.totals ?? {}}
      type={type}
      onType={onType}
      onPage={onPage}
    />
  );
}

function ExceptionsTab({ data, activeTransactions, onPage }: {
  data: TxsResponse | null; activeTransactions: Tx[]; onPage: (v: number) => void;
}) {
  const [retrying, setRetrying] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState("");

  async function retryPayout(reference: string) {
    setRetrying((m) => ({ ...m, [reference]: true }));
    try {
      const res = await fetch(`/api/admin/payouts/${encodeURIComponent(reference)}/retry`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (res.ok) setMsg(`Retrait ${reference} relancé avec succès.`);
      else setMsg(d.error ?? "Échec de la relance.");
    } catch {
      setMsg("Échec de la relance.");
    } finally {
      setRetrying((m) => ({ ...m, [reference]: false }));
    }
  }

  return (
    <div className="bg-surface rounded-2xl p-4" style={{ border: "1px solid var(--ap-border)" }}>
      <div className="flex items-center gap-2 mb-3">
        <BiIcon name="bi-exclamation-octagon" className="text-danger" />
        <h5 className="font-display font-bold mb-0">Transactions en échec</h5>
      </div>
      {msg && <div className="alert alert-info py-2 mb-3" style={{ fontSize: "0.82rem" }}>{msg}</div>}

      <div style={{ maxHeight: 520, overflow: "auto" }}>
        <table className="table table-dark-ap table-sm align-middle">
          <thead>
            <tr><th>Référence</th><th>Type</th><th>Montant</th><th>Utilisateur</th><th>Date</th><th>Action</th></tr>
          </thead>
          <tbody>
            {activeTransactions.map((t) => (
              <tr key={t.id}>
                <td style={{ fontSize: "0.8rem" }}>{t.reference}</td>
                <td>
                  <span className="text-muted-2" style={{ fontSize: "0.75rem" }}>
                    <BiIcon name={typeColor(t.type).icon} className="me-1" />{t.type}
                  </span>
                </td>
                <td style={{ fontSize: "0.85rem" }}>{fmtEur(t.amount)}</td>
                <td style={{ fontSize: "0.75rem" }}>{t.userName}<br /><span className="text-muted-2">{t.userEmail}</span></td>
                <td className="text-muted-2" style={{ fontSize: "0.72rem" }}>{new Date(t.createdAt).toLocaleString()}</td>
                <td>
                  {t.type === "payout" && t.reference.startsWith("PAY-") ? (
                    <button className="btn btn-ghost btn-sm" disabled={retrying[t.reference]} onClick={() => retryPayout(t.reference)}>
                      {retrying[t.reference] ? <span className="spinner-border spinner-border-sm" /> : <><BiIcon name="bi-arrow-clockwise" className="me-1" />Relancer</>}
                    </button>
                  ) : (
                    <span className="text-muted-2" style={{ fontSize: "0.72rem" }}>—</span>
                  )}
                </td>
              </tr>
            ))}
            {activeTransactions.length === 0 && (
              <tr><td colSpan={6} className="text-center text-muted-2 py-3">Aucune transaction en échec.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {data && data.pages > 1 && (
        <div className="flex items-center justify-end mt-3 gap-2">
          <button className="btn btn-ghost btn-sm" disabled={data.page <= 1} onClick={() => onPage(data.page - 1)}>Précédent</button>
          <button className="btn btn-ghost btn-sm" disabled={data.page >= data.pages} onClick={() => onPage(data.page + 1)}>Suivant</button>
        </div>
      )}
    </div>
  );
}

function TxList({ data, activeTransactions, totals, type, onType, onPage }: {
  data: TxsResponse | null; activeTransactions: Tx[]; totals: Record<string, number>;
  type: string; onType: (v: string) => void; onPage: (v: number) => void;
}) {
  return (
    <div className="bg-surface rounded-2xl p-4" style={{ border: "1px solid var(--ap-border)" }}>
      <div className="flex flex-wrap gap-3 mb-3">
        <select className="form-select" style={{ maxWidth: 200 }} value={type} onChange={(e) => { onType(e.target.value); onPage(1); }}>
          <option value="">Tous les types</option>
          <option value="deposit">Dépôts</option>
          <option value="purchase">Achats</option>
          <option value="payout">Retraits</option>
        </select>
        <div className="flex gap-2 flex-wrap">
          {Object.entries(totals).map(([k, v]) => (
            <span key={k} className="badge rounded-pill" style={{ fontSize: "0.7rem", ...badgeColor(k), background: "rgba(125,189,140,0.12)" }}>
              {k}: {fmtEur(v)}
            </span>
          ))}
        </div>
      </div>

      <div style={{ maxHeight: 520, overflow: "auto" }}>
        <table className="table table-dark-ap table-sm align-middle">
          <thead>
            <tr><th>Référence</th><th>Type</th><th>Statut</th><th className="text-right">Montant</th><th>Utilisateur</th><th>Date</th></tr>
          </thead>
          <tbody>
            {activeTransactions.map((t) => (
              <tr key={t.id}>
                <td style={{ fontSize: "0.78rem" }}>{t.reference}</td>
                <td style={{ fontSize: "0.78rem" }}>
                  <BiIcon name={typeColor(t.type).icon} className="me-1" style={{ color: typeColor(t.type).color }} />{t.type}
                </td>
                <td><span className="badge rounded-pill uppercase" style={{ fontSize: "0.6rem", ...badgeColor(t.status) }}>{t.status}</span></td>
                <td className="text-right" style={{ fontSize: "0.85rem" }}>{fmtEur(t.amount)}</td>
                <td style={{ fontSize: "0.72rem" }}>{t.userName}<br /><span className="text-muted-2">{t.userEmail}</span></td>
                <td className="text-muted-2" style={{ fontSize: "0.72rem" }}>{new Date(t.createdAt).toLocaleString()}</td>
              </tr>
            ))}
            {activeTransactions.length === 0 && (
              <tr><td colSpan={6} className="text-center text-muted-2 py-3">Aucune transaction.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {data && data.total > 0 && (
        <div className="flex items-center justify-between mt-3">
          <span className="text-muted-2" style={{ fontSize: "0.8rem" }}>{data.total} transactions · page {data.page}/{data.pages}</span>
          <div className="flex gap-2">
            <button className="btn btn-ghost btn-sm" disabled={data.page <= 1} onClick={() => onPage(data.page - 1)}>Précédent</button>
            <button className="btn btn-ghost btn-sm" disabled={data.page >= data.pages} onClick={() => onPage(data.page + 1)}>Suivant</button>
          </div>
        </div>
      )}
    </div>
  );
}
