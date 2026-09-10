import { describe, expect, it } from "vitest";
import { rankLinks } from "../rankLinks.js";

const BASE = "https://acme.example.com/";

describe("rankLinks", () => {
  it("ranks a real /careers page above unrelated nav links", () => {
    const links = [
      { href: "/about", anchorText: "About" },
      { href: "/careers", anchorText: "Careers" },
      { href: "/pricing", anchorText: "Pricing" },
      { href: "/contact", anchorText: "Contact" },
    ];
    const ranked = rankLinks(links, BASE);
    expect(ranked[0]!.href).toBe("https://acme.example.com/careers");
  });

  it("finds a hiring page at an unpredictable path via a strong anchor-text signal, not a fixed path list", () => {
    const links = [
      { href: "/eng/blog/handbook", anchorText: "How We Hire" },
      { href: "/about", anchorText: "About" },
    ];
    const ranked = rankLinks(links, BASE);
    expect(ranked[0]!.href).toBe("https://acme.example.com/eng/blog/handbook");
  });

  it("does NOT rank a decoy marketing blog post above a real careers page (adversarial negative case)", () => {
    const links = [
      { href: "/blog/2023/careers-in-real-estate", anchorText: "Careers in Real Estate: A Guide" },
      { href: "/careers", anchorText: "Careers" },
    ];
    const ranked = rankLinks(links, BASE);
    expect(ranked[0]!.href).toBe("https://acme.example.com/careers");
    const decoy = ranked.find((l) => l.href.includes("careers-in-real-estate"))!;
    const real = ranked.find((l) => l.href === "https://acme.example.com/careers")!;
    expect(decoy.score).toBeLessThan(real.score);
  });

  it("penalizes deeply-nested paths relative to shallow ones with similar keyword signal", () => {
    const links = [
      { href: "/careers", anchorText: "Careers" },
      { href: "/company/about/team/history/careers", anchorText: "Careers" },
    ];
    const ranked = rankLinks(links, BASE);
    expect(ranked[0]!.href).toBe("https://acme.example.com/careers");
  });

  it("deduplicates links that resolve to the same absolute URL", () => {
    const links = [
      { href: "/careers", anchorText: "Careers" },
      { href: "https://acme.example.com/careers", anchorText: "Join us" },
    ];
    const ranked = rankLinks(links, BASE);
    expect(ranked).toHaveLength(1);
  });

  it("silently drops unresolvable hrefs rather than throwing", () => {
    const links = [
      { href: "not a url and no base can fix it://", anchorText: "broken" },
      { href: "/careers", anchorText: "Careers" },
    ];
    expect(() => rankLinks(links, BASE)).not.toThrow();
  });

  it("returns an empty array for a page with no links (no hiring page found)", () => {
    expect(rankLinks([], BASE)).toEqual([]);
  });
});
