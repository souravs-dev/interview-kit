import { describe, expect, it } from "vitest";
import { cleanPage } from "../cleanPage.js";

describe("cleanPage", () => {
  it("extracts plain text with script/style stripped", () => {
    const result = cleanPage({
      url: "http://localhost:8099/acme/",
      status: 200,
      contentType: "text/html",
      html: `<html><head><title>Acme Corp</title><style>.x{color:red}</style></head>
        <body><script>alert('hi')</script><h1>Welcome to Acme</h1><p>We build developer tools.</p></body></html>`,
    });
    expect(result.title).toBe("Acme Corp");
    expect(result.text).toContain("Welcome to Acme");
    expect(result.text).toContain("We build developer tools");
    expect(result.text).not.toContain("alert(");
    expect(result.text).not.toContain("color:red");
  });

  it("extracts links with href and anchor text", () => {
    const result = cleanPage({
      url: "http://localhost:8099/acme/",
      status: 200,
      contentType: "text/html",
      html: `<body><a href="/careers">Careers</a><a href="https://example.com/about">About Us</a></body>`,
    });
    expect(result.links).toEqual([
      { href: "/careers", anchorText: "Careers" },
      { href: "https://example.com/about", anchorText: "About Us" },
    ]);
  });

  it("handles a page with no links or title gracefully", () => {
    const result = cleanPage({ url: "http://x/", status: 200, contentType: "text/html", html: "<body>Just text.</body>" });
    expect(result.title).toBe("");
    expect(result.links).toEqual([]);
    expect(result.text).toBe("Just text.");
  });
});
