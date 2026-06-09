import Link from "next/link";
import type { ReactNode } from "react";
import { Bot, HeartHandshake, MessageCircle, UserRound } from "lucide-react";

type AppFrameProps = {
  children: ReactNode;
  active: "home" | "matches" | "profile" | "chat" | "questionnaire";
  avatarLabel?: string | null;
};

type AppNavItem = {
  href: string;
  label: string;
  icon: typeof MessageCircle;
  active: AppFrameProps["active"][];
};

const navItems: AppNavItem[] = [
  { href: "/app", label: "מאמנת", icon: MessageCircle, active: ["home"] },
  { href: "/matches", label: "התאמות", icon: HeartHandshake, active: ["matches", "chat", "questionnaire"] },
  { href: "/profile/matching", label: "פרופיל", icon: UserRound, active: ["profile"] },
];

export function AppFrame({ children, active, avatarLabel }: AppFrameProps) {
  return (
    <div className="app-home-shell" dir="rtl">
      <section className="app-home-page" aria-label="LovLov">
        <AppTopbar avatarLabel={avatarLabel} />
        {children}
      </section>
      <nav className="app-bottom-nav" aria-label="ניווט ראשי">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.active.includes(active);

          return (
            <Link
              aria-current={isActive ? "page" : undefined}
              className={isActive ? "app-nav-button app-nav-button--active" : "app-nav-button"}
              href={item.href}
              key={item.href}
            >
              <Icon size={19} strokeWidth={2.2} aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function AppTopbar({ avatarLabel }: { avatarLabel?: string | null }) {
  return (
    <header className="app-home-topbar">
      <Link className="app-home-brand" href="/" dir="ltr">
        LOVLOV.ME
      </Link>
      <div className="app-home-avatar" aria-hidden="true">
        {avatarLabel?.trim().charAt(0) || <Bot size={19} strokeWidth={2.2} />}
      </div>
    </header>
  );
}
