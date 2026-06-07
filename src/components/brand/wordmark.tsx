type WordmarkProps = {
  /** Font size of the wordmark text in px. */
  size?: number;
  className?: string;
};

export function Wordmark({ size = 26, className }: WordmarkProps) {
  return (
    <span
      className={className}
      dir="ltr"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: size,
        fontWeight: 900,
        letterSpacing: 0,
        color: "var(--color-primary)",
      }}
    >
      LOVLOV.ME
      <svg viewBox="0 0 24 24" width={size * 0.6} height={size * 0.6} aria-hidden="true">
        <path
          d="M12 21C5.5 16 2 12.5 2 8.2 2 5.3 4.3 3 7.2 3 9 3 10.6 3.9 12 5.6 13.4 3.9 15 3 16.8 3 19.7 3 22 5.3 22 8.2 22 12.5 18.5 16 12 21Z"
          fill="var(--color-accent)"
        />
      </svg>
    </span>
  );
}
