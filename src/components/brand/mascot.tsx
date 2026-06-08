import { useId, type CSSProperties } from "react";

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

export type LoviMood = "smile" | "think" | "happy" | "love";

type LoviProps = {
  mood?: LoviMood;
  size?: number;
  halo?: boolean;
  wings?: boolean;
  title?: string;
  className?: string;
};

export function Lovi({
  mood = "smile",
  size = 80,
  halo = true,
  wings = true,
  title = "LovLov cupid",
  className,
}: LoviProps) {
  const gradientId = `lovi-${useId().replace(/:/g, "")}`;
  const height = (size * 120) / 140;
  const ink = "#2a1014";

  return (
    <svg
      width={size}
      height={height}
      viewBox="0 0 140 120"
      fill="none"
      role="img"
      aria-label={title}
      className={className}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff8090" />
          <stop offset="1" stopColor="#e03250" />
        </linearGradient>
      </defs>
      {wings ? (
        <g fill="#ffd2d6">
          <path d="M44 47 C24 31 5 39 10 55 C0 59 4 75 17 72 C14 84 28 88 35 78 Z" />
          <path d="M96 47 C116 31 135 39 130 55 C140 59 136 75 123 72 C126 84 112 88 105 78 Z" />
        </g>
      ) : null}
      {halo ? <ellipse cx="70" cy="21" rx="15" ry="4.6" stroke="#ffaeb6" strokeWidth="3" /> : null}
      <path
        d="M70 105 C44 85 30 69 30 53 C30 41 39 33 50 33 C59 33 66 38 70 46 C74 38 81 33 90 33 C101 33 110 41 110 53 C110 69 96 85 70 105 Z"
        fill={`url(#${gradientId})`}
      />
      <ellipse cx="53" cy="69" rx="6" ry="3.8" fill="#ff5e72" opacity="0.5" />
      <ellipse cx="87" cy="69" rx="6" ry="3.8" fill="#ff5e72" opacity="0.5" />
      <LoviFace mood={mood} ink={ink} />
    </svg>
  );
}

function LoviFace({ mood, ink }: { mood: LoviMood; ink: string }) {
  if (mood === "love") {
    return (
      <>
        <path d={heartEyePath(60, 58)} fill={ink} />
        <path d={heartEyePath(80, 58)} fill={ink} />
        <path d="M61 69 Q70 80 79 69 Z" fill={ink} />
      </>
    );
  }

  if (mood === "think") {
    return (
      <>
        <circle cx="61" cy="56" r="4" fill={ink} />
        <circle cx="81" cy="56" r="4" fill={ink} />
        <circle cx="70" cy="71" r="3" fill={ink} />
      </>
    );
  }

  if (mood === "happy") {
    return (
      <>
        <path d="M55 58 Q60 52 65 58" stroke={ink} strokeWidth="3.2" fill="none" strokeLinecap="round" />
        <path d="M75 58 Q80 52 85 58" stroke={ink} strokeWidth="3.2" fill="none" strokeLinecap="round" />
        <path d="M60 69 Q70 79 80 69" stroke={ink} strokeWidth="3.2" fill="none" strokeLinecap="round" />
      </>
    );
  }

  return (
    <>
      <circle cx="60" cy="58" r="4.4" fill={ink} />
      <circle cx="80" cy="58" r="4.4" fill={ink} />
      <path d="M62 70 Q70 77 78 70" stroke={ink} strokeWidth="3.2" fill="none" strokeLinecap="round" />
    </>
  );
}

function heartEyePath(cx: number, cy: number, size = 4.6) {
  return `M${cx} ${cy + size * 0.85} C ${cx - size} ${cy}, ${cx - size} ${cy - size * 0.75}, ${cx} ${
    cy - size * 0.22
  } C ${cx + size} ${cy - size * 0.75}, ${cx + size} ${cy}, ${cx} ${cy + size * 0.85} Z`;
}
