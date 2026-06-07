import type { CSSProperties } from "react";

export type MascotPose = "wave" | "think" | "celebrate" | "rest";

type MascotProps = {
  pose?: MascotPose;
  size?: number;
  title?: string;
  className?: string;
};

/**
 * "Lev" — the lovlov heart mascot. A soft coral heart with a friendly face,
 * rendered as inline SVG so it scales crisply and inherits no external assets.
 * Pose controls the eyes/mouth and the little arm gesture to match the mockups.
 */
export function Mascot({ pose = "wave", size = 96, title = "לב", className }: MascotProps) {
  const style: CSSProperties = { width: size, height: size, display: "inline-block" };

  return (
    <svg
      viewBox="0 0 120 120"
      role="img"
      aria-label={title}
      className={className}
      style={style}
    >
      <defs>
        <linearGradient id="lev-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f4795a" />
          <stop offset="1" stopColor="#e8492c" />
        </linearGradient>
      </defs>

      {/* heart body */}
      <path
        d="M60 104C36 86 16 70 16 47.5 16 33 27 23 40 23c8 0 15 4 20 11 5-7 12-11 20-11 13 0 24 10 24 24.5C104 70 84 86 60 104Z"
        fill="url(#lev-body)"
      />

      {/* cheeks */}
      <circle cx="40" cy="60" r="6" fill="#ff9a7e" opacity="0.55" />
      <circle cx="80" cy="60" r="6" fill="#ff9a7e" opacity="0.55" />

      {/* eyes */}
      {pose === "rest" ? (
        <>
          <path d="M44 52c2.5 2.5 6 2.5 8.5 0" fill="none" stroke="#3a1410" strokeWidth="3" strokeLinecap="round" />
          <path d="M67 52c2.5 2.5 6 2.5 8.5 0" fill="none" stroke="#3a1410" strokeWidth="3" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="48" cy="52" r="4" fill="#3a1410" />
          <circle cx="72" cy="52" r="4" fill="#3a1410" />
        </>
      )}

      {/* mouth */}
      {pose === "celebrate" ? (
        <path d="M52 64c4 6 12 6 16 0" fill="#3a1410" />
      ) : (
        <path d="M53 63c3 3.5 11 3.5 14 0" fill="none" stroke="#3a1410" strokeWidth="3" strokeLinecap="round" />
      )}

      {/* arm gesture */}
      {pose === "wave" && (
        <path d="M96 44c6-3 11-2 13 2" fill="none" stroke="#e8492c" strokeWidth="6" strokeLinecap="round" />
      )}
      {pose === "celebrate" && (
        <>
          <path d="M30 40c-5-5-6-11-3-15" fill="none" stroke="#e8492c" strokeWidth="6" strokeLinecap="round" />
          <path d="M90 40c5-5 6-11 3-15" fill="none" stroke="#e8492c" strokeWidth="6" strokeLinecap="round" />
        </>
      )}
      {pose === "think" && (
        <circle cx="74" cy="74" r="4" fill="#e8492c" />
      )}
    </svg>
  );
}
