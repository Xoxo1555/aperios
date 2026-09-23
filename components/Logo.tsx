import Link from "next/link";

interface LogoProps {
  className?: string;
  withLink?: boolean;
  size?: "default" | "sm";
}

export default function Logo({ className = "", withLink = true }: LogoProps) {
  const content = (
    <>
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform duration-200"
        style={{
          background: "radial-gradient(circle at 30% 20%, #0B0B0B, #111111 72%)",
          borderTop: "1px solid rgba(255,255,255,0.22)",
          boxShadow:
            "0 0 0 1.5px rgba(255,255,255,0.10), 0 0 0 0.5px rgba(255,255,255,0.28), 0 0 22px -2px rgba(227,199,86,0.5), 0 4px 14px rgba(0,0,0,0.45)",
        }}
      >
        <div
          className="w-[78%] h-[78%] rounded-full flex items-center justify-center"
          style={{
            background:
              "linear-gradient(180deg, #E3C756 0%, #E0BA3E 40%, #D9A72A 70%, #C88E1B 100%)",
            boxShadow:
              "inset 0 2px 3px rgba(255,255,255,0.6), inset 0 -4px 8px rgba(0,0,0,0.35), 0 1px 2px rgba(0,0,0,0.5)",
          }}
        >
          <i
            className="bi bi-camera-fill"
            aria-hidden="true"
            style={{ fontSize: 17, color: "#000000", WebkitTextFillColor: "#000000" }}
          ></i>
        </div>
      </div>
      <span className="ap-led-text font-extrabold text-xl sm:text-2xl tracking-wider uppercase flex items-baseline">
        APERIO<span className="ml-0.5" style={{ WebkitTextFillColor: "#f59e0b", color: "#f59e0b" }}>.</span>
      </span>
    </>
  );

  const cls = `inline-flex items-center gap-3 shrink-0 group ${className}`;

  if (!withLink) return <span className={cls}>{content}</span>;
  return (
    <Link href="/" className={cls}>
      {content}
    </Link>
  );
}
