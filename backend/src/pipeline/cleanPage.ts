import * as cheerio from "cheerio";
import type { FetchedPage } from "./types.js";

export interface PageLink {
  href: string;
  anchorText: string;
}

export interface CleanedPage {
  url: string;
  title: string;
  text: string;
  links: PageLink[];
}

/**
 * Strips script/style/nav boilerplate down to plain text and a link list.
 * Pure function over an already-fetched page — no I/O — so it's testable
 * against static HTML fixtures independent of any real network call.
 */
export function cleanPage(page: FetchedPage): CleanedPage {
  const $ = cheerio.load(page.html);
  $("script, style, noscript, svg").remove();

  const title = $("title").first().text().trim();

  const text = $("body")
    .text()
    .replace(/\s+/g, " ")
    .trim();

  const links: PageLink[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const anchorText = $(el).text().replace(/\s+/g, " ").trim();
    links.push({ href, anchorText });
  });

  return { url: page.url, title, text, links };
}
