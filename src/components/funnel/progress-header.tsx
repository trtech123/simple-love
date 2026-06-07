import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";

type ProgressHeaderProps = {
  current: number;
  total: number;
  label?: string;
  backHref?: string;
};

export function ProgressHeader({ current, total, label, backHref }: ProgressHeaderProps) {
  const progress = total > 0 ? Math.min(100, Math.max(0, Math.round((current / total) * 100))) : 0;

  return (
    <header className="progress-header">
      <div className="progress-header__top">
        {backHref ? (
          <Link className="icon-link" href={backHref} aria-label="חזרה">
            <ArrowRight aria-hidden="true" size={19} />
          </Link>
        ) : (
          <span className="icon-link icon-link--empty" aria-hidden="true" />
        )}
        <Wordmark size={22} />
        <span className="progress-header__count" aria-label={`שאלה ${current} מתוך ${total}`}>
          {current} מתוך {total}
        </span>
      </div>
      <div className="progress-header__meta">
        <span>{label ?? "השאלון שלך"}</span>
        <span dir="ltr">{progress}%</span>
      </div>
      <div className="funnel-progress" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>
    </header>
  );
}
