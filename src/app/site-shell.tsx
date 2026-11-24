import { Crosshair, Download, GitFork, Mail, MonitorPlay, SquareArrowOutUpRight } from "lucide-react";
import Script from "next/script";
import type { ReactNode } from "react";
import { messages, primaryNav, profile, route, secondaryNav, type Locale } from "@/lib/content";
import { HeaderNavigation, ThemeButton } from "@/components/controls";

const themeInit = 'try {document.documentElement.dataset.theme = localStorage.getItem("portfolio-theme") === "light" ? "light" : "dark"} catch {}';

export function SiteShell({ locale, children }: { locale: Locale; children: ReactNode }) {
  const t = messages[locale];
  return <html lang={locale} suppressHydrationWarning>
    <body>
      <Script id="portfolio-theme" strategy="beforeInteractive">{themeInit}</Script>
      <a className="skip-link" href="#main">{t.skip}</a>
      <header className="site-header">
        <div className="container header-inner">
          <a className="brand" href={route(locale)} aria-label={profile.name}>
            <span className="brand-icon"><Crosshair aria-hidden="true" size={21} /></span>
            <span>Shafayetul<span className="brand-surname"> Islam</span></span>
          </a>
          <HeaderNavigation locale={locale} items={primaryNav.map(key => ({ label: t.nav[key], href: route(locale, key) }))} />
          <div className="header-actions">
            <ThemeButton label={t.theme} />
            <a className="button button-small header-resume" href={route(locale, "resume")}><Download size={15} aria-hidden="true" />{t.nav.resume}</a>
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1}>{children}</main>
      <footer className="site-footer">
        <div className="container footer-layout">
          <div>
            <a className="brand" href={route(locale)}><span className="brand-icon"><Crosshair aria-hidden="true" size={19} /></span>{profile.name}</a>
            <p>{t.title} · {profile.location[locale]}</p>
          </div>
          <nav aria-label={t.footerNav}>{secondaryNav.map(key => <a key={key} href={route(locale, key)}>{t.nav[key]}</a>)}</nav>
          <SocialLinks locale={locale} compact />
          <div className="footer-bottom">© {profile.name}</div>
        </div>
      </footer>
    </body>
  </html>;
}

export function SocialLinks({ locale, compact = false, full = false }: { locale: Locale; compact?: boolean; full?: boolean }) {
  const t = messages[locale];
  const links = [
    { name: "GitHub", href: profile.github, Icon: GitFork },
    { name: "LinkedIn", href: profile.linkedin, Icon: SquareArrowOutUpRight },
    ...(full ? [
      ...(profile.youtube ? [{ name: "YouTube", href: profile.youtube, Icon: MonitorPlay }] : []),
      { name: "Google Scholar", href: profile.scholar, Icon: SquareArrowOutUpRight },
    ] : [{ name: "Email", href: `mailto:${profile.email}`, Icon: Mail }])
  ];
  return <ul className={`social-links${compact ? " compact-social" : ""}`} aria-label={t.links}>
    {links.map(({ name, href, Icon }) => <li key={name}>
      <a href={href} aria-label={name === "Email" ? t.emailMe : name}><Icon size={17} aria-hidden="true" />{!compact && (name === "Email" ? (locale === "ja" ? "メール" : "Email") : name)}</a>
    </li>)}
  </ul>;
}
