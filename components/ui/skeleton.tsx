"use client";

/**
 * Skeleton Loader component - shimmer effect for placeholders
 * 
 * Variants:
 * - type="image": rectangular skeleton for image placeholders
 * - type="text": horizontal lines for text content
 * - type="button": button-shaped skeleton
 * - type="icon": square skeleton for icons
 * 
 * Can also use rows={n} for multi-line text skeleton
 */

interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  radius?: string | number;
  type?: "image" | "text" | "button" | "icon";
  rows?: number;
  animated?: boolean;
  style?: React.CSSProperties;
}

const SHIMMER_COLOR = "rgba(255, 255, 255, 0.08)";
const BASE_COLOR = "var(--ap-surface)";

export function Skeleton({
  className,
  width = "100%",
  height = "1rem",
  radius = "4px",
  type = "text",
  rows = 1,
  animated = true,
  style,
}: SkeletonProps) {
  const baseClass = [
    "skeleton",
    "inline-block",
    "align-middle",
    "border-radius",
    radius !== "4px" ? `rounded-${radius}` : "",
    "h-",
    typeof height === "number" ? `${height}` : height,
    "w-full",
    "max-w-full",
    "animate-shimmer",
    !animated ? "animate-none" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const textClass = [
    "skeleton-text",
    "animate-shimmer",
    !animated ? "animate-none" : "",
    "space-y-1",
    rows > 1 ? `w-${rows * 24}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const imageClass = [
    "skeleton-image",
    "h-32",
    "w-full",
    "max-w-full",
    "rounded-2xl",
    "animate-shimmer",
    !animated ? "animate-none" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const buttonClass = [
    "skeleton-button",
    "h-10",
    "w-24",
    "rounded-lg",
    "animate-shimmer",
    !animated ? "animate-none" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const iconClass = [
    "skeleton-icon",
    "h-5",
    "w-5",
    "rounded",
    "animate-shimmer",
    !animated ? "animate-none" : "",
  ]
    .filter(Boolean)
    .join(" ");

  let content: React.ReactNode;

  switch (type) {
    case "image":
      content = (
        <div className={imageClass} />
      );
      break;
    case "text":
      if (rows > 1) {
        content = (
          <div className={textClass}>
            {[...Array(rows)].map((_, i) => (
              <div key={i} className="skeleton-line" />
            ))}
          </div>
        );
      } else {
        content = <div className="skeleton-line" />;
      }
      break;
    case "button":
      content = (
        <div className={buttonClass} />
      );
      break;
    case "icon":
      content = (
        <div className={iconClass} />
      );
      break;
    default:
      content = <div className={baseClass} />;
  }

  return <div style={style}>{content}</div>;
}