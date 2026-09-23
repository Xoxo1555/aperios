/* AuroraGlow — halo lumineux animé façon "aurore dorée" pour bandeaux sombres.
   2-3 blobs de lumière très flous en radial-gradient doré/ambré avec une touche
   discrète de violet, mix-blend-mode: screen, mouvement lent et organique.
   Purement décoratif, aria-hidden, aucun impact sur la lisibilité. */

interface AuroraGlowProps {
  /** Nombre de blobs (2 ou 3). Défaut : 3 */
  count?: 2 | 3;
  /** Classe CSS additionnelle (ex. pour override z-index) */
  className?: string;
}

const BLOBS = [
  {
    size: "55vw",
    top: "8%",
    left: "15%",
    gradient:
      "radial-gradient(circle, rgba(245,178,61,0.45) 0%, rgba(255,207,107,0.22) 35%, rgba(139,92,246,0.08) 60%, transparent 75%)",
    duration: "10s",
    delay: "0s",
    driftX: "4vw",
    driftY: "3vh",
  },
  {
    size: "48vw",
    top: "12%",
    right: "8%",
    gradient:
      "radial-gradient(circle, rgba(255,207,107,0.38) 0%, rgba(245,178,61,0.18) 40%, rgba(139,92,246,0.06) 65%, transparent 80%)",
    duration: "12s",
    delay: "2.5s",
    driftX: "-3.5vw",
    driftY: "2.5vh",
  },
  {
    size: "42vw",
    bottom: "5%",
    left: "40%",
    gradient:
      "radial-gradient(circle, rgba(217,119,6,0.3) 0%, rgba(245,178,61,0.15) 45%, rgba(139,92,246,0.05) 70%, transparent 85%)",
    duration: "9s",
    delay: "4s",
    driftX: "3vw",
    driftY: "-2vh",
  },
];

export default function AuroraGlow({ count = 3, className = "" }: AuroraGlowProps) {
  const visible = BLOBS.slice(0, count);

  return (
    <div className={`ap-aurora ${className}`} aria-hidden="true">
      {visible.map((blob, i) => (
        <span
          key={i}
          className="ap-aurora-blob"
          style={{
            width: blob.size,
            height: blob.size,
            top: blob.top,
            left: blob.left,
            right: blob.right,
            bottom: blob.bottom,
            background: blob.gradient,
            animationDuration: blob.duration,
            animationDelay: blob.delay,
            ["--aurora-drift-x" as string]: blob.driftX,
            ["--aurora-drift-y" as string]: blob.driftY,
          }}
        />
      ))}
    </div>
  );
}
