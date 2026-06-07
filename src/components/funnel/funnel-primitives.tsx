import type { ComponentType, ReactNode } from "react";
import { Check, HeartHandshake } from "lucide-react";

type IconComponent = ComponentType<{ size?: number; "aria-hidden"?: boolean; strokeWidth?: number }>;

export function PriceSummary({
  title,
  price = "99 ש״ח",
  caption,
}: {
  title: string;
  price?: string;
  caption?: string;
}) {
  return (
    <div className="price-summary">
      <span>{title}</span>
      <strong>{price}</strong>
      {caption ? <p>{caption}</p> : null}
    </div>
  );
}

export function IconList({
  items,
}: {
  items: Array<{ icon?: IconComponent; title: string; text?: string }>;
}) {
  return (
    <ul className="icon-list">
      {items.map((item) => {
        const Icon = item.icon ?? Check;

        return (
          <li key={item.title}>
            <span className="icon-list__icon" aria-hidden="true">
              <Icon size={18} strokeWidth={2.2} />
            </span>
            <span>
              <strong>{item.title}</strong>
              {item.text ? <small>{item.text}</small> : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function FunnelStateIcon({ icon: Icon = HeartHandshake }: { icon?: IconComponent }) {
  return (
    <span className="funnel-state-icon" aria-hidden="true">
      <Icon size={30} strokeWidth={2} />
    </span>
  );
}

export function FunnelActions({ children }: { children: ReactNode }) {
  return <div className="funnel-actions">{children}</div>;
}
