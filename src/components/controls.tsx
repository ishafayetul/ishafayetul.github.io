"use client";

import { Check, Copy, Languages, Menu, Moon, Play, Sun, X } from "lucide-react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { useRef, useState, type ReactNode } from "react";
import { pagePath, sitePath } from "@/lib/site-path";
import { messages, route, type ImageAsset, type Locale } from "@/lib/content";

type NavItem = { label: string; href: string };

export function HeaderNavigation({ locale, items }: { locale: Locale; items: NavItem[] }) {
  const t = messages[locale];
  const pathname = usePathname().replace(/\/$/, "") || "/";
  const englishPath = locale === "ja" ? pathname.replace(/^\/ja(?=\/|$)/, "") || "/" : pathname;
  const japanesePath = englishPath === "/" ? "/ja" : `/ja${englishPath}`;
  const navLinks = items.map(({ href, label }, index) => {
    const current = pagePath(pathname);
    const active = current === href || (index !== 0 && current.startsWith(href));
    return <a key={href} href={href} aria-current={active ? "page" : undefined}>{label}</a>;
  });
  return <>
    <nav className="desktop-nav" aria-label={t.primaryNav}>{navLinks}</nav>
    <div className="language-control" role="group" aria-label={t.language}>
      <Languages size={15} aria-hidden="true" />
      <a href={pagePath(englishPath)} lang="en" hrefLang="en" aria-current={locale === "en" ? "true" : undefined}>EN</a>
      <a href={pagePath(japanesePath)} lang="ja" hrefLang="ja" aria-current={locale === "ja" ? "true" : undefined}>日本語</a>
    </div>
    <details className="mobile-nav">
      <summary className="icon-button" aria-label={t.menu}><Menu size={23} aria-hidden="true" /></summary>
      <nav aria-label={t.primaryNav}>{navLinks}<a href={route(locale, "resume")}>{t.nav.resume}</a></nav>
    </details>
  </>;
}

export function ThemeButton({ label }: { label: string }) {
  function toggle() {
    const root = document.documentElement;
    const theme = root.dataset.theme === "light" ? "dark" : "light";
    root.dataset.theme = theme;
    try { localStorage.setItem("portfolio-theme", theme); } catch {}
  }
  return <button className="icon-button theme-switch" type="button" aria-label={label} onClick={toggle}>
    <Sun className="sun" size={19} aria-hidden="true" /><Moon className="moon" size={18} aria-hidden="true" />
  </button>;
}

export function CopyButton({ value, label, locale }: { value: string; label: string; locale: Locale }) {
  const [state, setState] = useState("");
  const t = messages[locale];
  return <button type="button" className="button button-small" onClick={async () => {
    try {
      await navigator.clipboard.writeText(value);
      setState(t.copied);
    } catch {
      setState(t.copyFailed);
    }
  }}>
    {state === t.copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
    <span aria-live="polite">{state || label}</span>
  </button>;
}

export function MediaImage({ image, locale }: { image: ImageAsset; locale: Locale }) {
  const ref = useRef<HTMLDialogElement>(null);
  const t = messages[locale];
  const alt = image.alt[locale];
  return <figure className="gallery-item">
    <button type="button" className="gallery-trigger" aria-label={`${t.openMedia} · ${alt}`} onClick={() => ref.current?.showModal()}>
      <Image fill sizes="(max-width: 700px) 100vw, 560px" src={sitePath(image.src)} alt={alt} style={{ objectPosition: image.position }} />
    </button>
    {image.caption && <figcaption>{image.caption[locale]}</figcaption>}
    <dialog ref={ref} aria-label={alt} className="lightbox" onClick={event => {
      if (event.target === event.currentTarget) ref.current?.close();
    }}>
      <div className="lightbox-inner">
        <form method="dialog"><button className="icon-button" aria-label={t.close}><X size={22} aria-hidden="true" /></button></form>
        <Image width={1440} height={1000} src={sitePath(image.src)} alt={alt} />
        {image.caption && <p>{image.caption[locale]}</p>}
      </div>
    </dialog>
  </figure>;
}

export function VideoPlayer({ id, title, locale }: { id: string; title: string; locale: Locale }) {
  const [loaded, setLoaded] = useState(false);
  const t = messages[locale];
  return <div className="video-panel">
    {loaded ? <iframe title={title} src={`https://www.youtube-nocookie.com/embed/${id}`} allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
      : <button type="button" onClick={() => setLoaded(true)}><Play size={24} aria-hidden="true" />{t.loadVideo}</button>}
  </div>;
}

export function FilterablePublications({ labels, entries, label }: { labels: Record<string, string>; entries: { type: string; id: string; content: ReactNode }[]; label: string }) {
  const [kind, setKind] = useState("all");
  return <>
    <label className="publication-filter"><span>{label}</span><select value={kind} onChange={event => setKind(event.target.value)}>
      {Object.entries(labels).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
    </select></label>
    <div className="publication-list">
      {entries.filter(entry => kind === "all" || kind === entry.type).map(({ id, content }) => <div key={id}>{content}</div>)}
    </div>
  </>;
}
