/* Champ de bulles lumineuses animées, purement décoratif (aria-hidden).
   Valeurs figées (pas de Math.random()) pour rester identiques entre le
   rendu serveur et le client et éviter tout hydration mismatch. */
const BUBBLES_FULL: { size: number; left: string; delay: string; duration: string; drift: string }[] = [
  { size: 14, left: "4%", delay: "0s", duration: "13s", drift: "22px" },
  { size: 22, left: "11%", delay: "2.4s", duration: "16s", drift: "-18px" },
  { size: 9, left: "18%", delay: "5.1s", duration: "11s", drift: "14px" },
  { size: 30, left: "26%", delay: "1.1s", duration: "19s", drift: "-26px" },
  { size: 16, left: "34%", delay: "7.3s", duration: "14s", drift: "20px" },
  { size: 11, left: "42%", delay: "3.6s", duration: "12s", drift: "-16px" },
  { size: 26, left: "51%", delay: "0.6s", duration: "18s", drift: "18px" },
  { size: 13, left: "59%", delay: "6.2s", duration: "13.5s", drift: "-22px" },
  { size: 20, left: "67%", delay: "2.9s", duration: "16.5s", drift: "24px" },
  { size: 8, left: "75%", delay: "4.8s", duration: "10.5s", drift: "-12px" },
  { size: 24, left: "83%", delay: "1.8s", duration: "17s", drift: "16px" },
  { size: 12, left: "90%", delay: "5.9s", duration: "12.5s", drift: "-20px" },
  { size: 18, left: "96%", delay: "3.2s", duration: "15s", drift: "22px" },
  { size: 10, left: "56%", delay: "8.1s", duration: "11.5s", drift: "-14px" },
];

/* Version réduite pour les bandeaux plus petits (ex. CTA de fin de page). */
const BUBBLES_COMPACT = BUBBLES_FULL.filter((_, i) => i % 2 === 0);

export default function BubbleField({ variant = "full" }: { variant?: "full" | "compact" }) {
  const bubbles = variant === "compact" ? BUBBLES_COMPACT : BUBBLES_FULL;
  return (
    <div className="ap-bubble-field" aria-hidden="true">
      {bubbles.map((b, i) => (
        <span
          key={i}
          className="ap-bubble"
          style={{
            width: b.size,
            height: b.size,
            left: b.left,
            animationDelay: b.delay,
            animationDuration: b.duration,
            ["--ap-bubble-drift" as string]: b.drift,
          }}
        />
      ))}
    </div>
  );
}
