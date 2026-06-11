"use client";

import { useEffect, useSyncExternalStore } from "react";
import { LOCALE_COOKIE, isLocale, translateString, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * DOM-level EN→ZH translation runtime.
 *
 * Mounted once in the root layout. When the locale is "zh" it walks rendered
 * text nodes + UI attributes (placeholder/title/aria-label) and swaps strings
 * that match the dictionary; a MutationObserver keeps newly rendered content
 * translated. Switching back to "en" restores every original.
 *
 * It deliberately never touches <input>/<textarea> values (user input), any
 * subtree marked data-no-i18n, or text already containing CJK characters.
 */

// ── tiny locale store (shared by runtime + every toggle button) ──────────────
function readCookieLocale(): Locale {
  if (typeof document === "undefined") return "en";
  const m = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]+)`));
  return isLocale(m?.[1]) ? (m![1] as Locale) : "en";
}
let current: Locale = "en";
const listeners = new Set<() => void>();
function setLocale(l: Locale) {
  current = l;
  document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  document.documentElement.lang = l === "zh" ? "zh-CN" : "en";
  listeners.forEach((fn) => fn());
}
function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function useLocale(): [Locale, (l: Locale) => void] {
  const locale = useSyncExternalStore(subscribe, () => current, () => "en" as Locale);
  return [locale, setLocale];
}

// ── translation engine ───────────────────────────────────────────────────────
const ATTRS = ["placeholder", "title", "aria-label", "alt"] as const;
// TEXTAREA is skipped in the tree walk so its text child (the user's value) is
// never touched — its placeholder is still translated via the explicit pass in
// applyAll. INPUT is safe to walk: values live in properties, not text nodes.
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA", "NOSCRIPT"]);

const textOriginals = new Map<Text, string>();
const attrOriginals = new Map<Element, Map<string, string>>();
let applying = false;
let observer: MutationObserver | null = null;

function skippable(el: Element | null): boolean {
  return !!el && (SKIP_TAGS.has(el.tagName) || !!el.closest("[data-no-i18n]"));
}

function translateText(node: Text) {
  const raw = node.nodeValue ?? "";
  const trimmed = raw.trim();
  if (!trimmed) return;
  const t = translateString(trimmed);
  if (t == null) return;
  if (!textOriginals.has(node)) textOriginals.set(node, raw);
  const lead = raw.match(/^\s*/)?.[0] ?? "";
  const tail = raw.match(/\s*$/)?.[0] ?? "";
  node.nodeValue = lead + t + tail;
}

function translateAttrs(el: Element) {
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (!v) continue;
    const t = translateString(v.trim());
    if (t == null) continue;
    let bag = attrOriginals.get(el);
    if (!bag) attrOriginals.set(el, (bag = new Map()));
    if (!bag.has(a)) bag.set(a, v);
    el.setAttribute(a, t);
  }
}

/** Join-translate an element whose children are only text (and comment) nodes —
 *  composed JSX like `Welcome back, {name}` renders as sibling text nodes with
 *  SSR comment markers (<!-- -->) between them. */
function translateJoined(el: Element) {
  const kids = Array.from(el.childNodes);
  if (!kids.every((k) => k.nodeType === Node.TEXT_NODE || k.nodeType === Node.COMMENT_NODE)) return;
  const texts = kids.filter((k): k is Text => k.nodeType === Node.TEXT_NODE);
  if (texts.length < 2) return;
  const joined = texts.map((k) => k.nodeValue ?? "").join("");
  const trimmed = joined.trim();
  if (!trimmed) return;
  const t = translateString(trimmed);
  if (t == null) return;
  for (const k of texts) if (!textOriginals.has(k)) textOriginals.set(k, k.nodeValue ?? "");
  texts[0].nodeValue = (joined.match(/^\s*/)?.[0] ?? "") + t + (joined.match(/\s*$/)?.[0] ?? "");
  for (let i = 1; i < texts.length; i++) texts[i].nodeValue = "";
}

function applyAll(root: Node) {
  applying = true;
  try {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (n.nodeType === Node.ELEMENT_NODE) {
          return skippable(n as Element) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const els: Element[] = root.nodeType === Node.ELEMENT_NODE && !skippable(root as Element) ? [root as Element] : [];
    const texts: Text[] = root.nodeType === Node.TEXT_NODE ? [root as Text] : [];
    let n: Node | null;
    while ((n = walker.nextNode())) {
      if (n.nodeType === Node.ELEMENT_NODE) els.push(n as Element);
      else texts.push(n as Text);
    }
    for (const el of els) {
      translateAttrs(el);
      translateJoined(el);
    }
    for (const t of texts) {
      if (!skippable(t.parentElement)) translateText(t);
    }
    // Textareas are excluded from the walk (their text child is user input),
    // but their placeholder is still UI copy.
    if (root.nodeType === Node.ELEMENT_NODE || root.nodeType === Node.DOCUMENT_NODE) {
      (root as Element | Document).querySelectorAll?.("textarea").forEach((ta) => {
        if (!ta.closest("[data-no-i18n]")) translateAttrs(ta);
      });
    }
  } finally {
    observer?.takeRecords();
    applying = false;
  }
}

function restoreAll() {
  applying = true;
  try {
    for (const [node, orig] of textOriginals) node.nodeValue = orig;
    textOriginals.clear();
    for (const [el, bag] of attrOriginals) for (const [a, v] of bag) el.setAttribute(a, v);
    attrOriginals.clear();
  } finally {
    observer?.takeRecords();
    applying = false;
  }
}

export default function I18nRuntime() {
  const [locale] = useLocale();

  // Adopt the persisted locale once on mount.
  useEffect(() => {
    const saved = readCookieLocale();
    if (saved !== current) setLocale(saved);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (locale === "zh") {
      applyAll(document.body);
      observer = new MutationObserver((muts) => {
        if (applying || current !== "zh") return;
        for (const m of muts) {
          if (m.type === "characterData" && m.target.nodeType === Node.TEXT_NODE) {
            // React rewrote this node (e.g. a count changed) — retranslate fresh.
            textOriginals.delete(m.target as Text);
            const parent = (m.target as Text).parentElement;
            if (parent && !skippable(parent)) {
              applying = true;
              try { translateJoined(parent); translateText(m.target as Text); } finally { observer?.takeRecords(); applying = false; }
            }
          } else if (m.type === "childList") {
            m.addedNodes.forEach((n) => applyAll(n));
          }
        }
      });
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      return () => { observer?.disconnect(); observer = null; };
    }
    restoreAll();
  }, [locale]);

  return null;
}

/** EN / 中文 pill toggle. Works on desktop sidebar, mobile top bar, login. */
export function LangToggle({ compact = false }: { compact?: boolean }) {
  const [locale, set] = useLocale();
  return (
    <div className={cn("inline-flex rounded-lg border border-border bg-white p-0.5", compact ? "" : "p-1")} data-no-i18n>
      {(["en", "zh"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => set(l)}
          aria-pressed={locale === l}
          className={cn(
            "rounded-md font-medium transition",
            compact ? "px-2 py-1 text-[11px]" : "px-2.5 py-1 text-xs",
            locale === l ? "bg-foreground text-white" : "text-muted hover:text-foreground",
          )}
        >
          {l === "en" ? "EN" : "中文"}
        </button>
      ))}
    </div>
  );
}
