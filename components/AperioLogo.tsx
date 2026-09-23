import React from "react";

/**
 * AperioLogo — médaillon doré standardisé
 * Délègue au composant Logo officiel pour garantir l'uniformité.
 * Conservé pour compatibilité (Navbar/Footer/auth importent AperioLogo).
 */
import Logo from "./Logo";

interface Props {
  size?: number;
  className?: string;
}

export default function AperioLogo({ size = 40, className = "" }: Props) {
  // size conservé pour compat API mais le design système impose w-10 h-10 (40px)
  // On mappe les anciennes tailles vers le standard.
  void size;
  return <Logo withLink={false} className={className} />;
}