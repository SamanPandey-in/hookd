import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  THEMES,
  THEME_IDS,
  DEFAULT_THEME,
  type ThemeSwatch,
} from "./theme";

const SWATCH_KEYS: (keyof ThemeSwatch)[] = [
  "bg",
  "surface",
  "surfaceHi",
  "border",
  "text",
  "muted",
  "accent",
  "onAccent",
  "pass",
  "fail",
  "warn",
];
const HEX = /^#[0-9a-fA-F]{6}$/;

describe("theme registry", () => {
  it("THEME_IDS mirrors THEMES exactly, in order", () => {
    expect(THEME_IDS).toEqual(THEMES.map((t) => t.id));
  });

  it("has unique ids", () => {
    expect(new Set(THEME_IDS).size).toBe(THEME_IDS.length);
  });

  it("has exactly one default, and it is DEFAULT_THEME", () => {
    const defaults = THEMES.filter((t) => t.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].id).toBe(DEFAULT_THEME);
    expect(THEME_IDS).toContain(DEFAULT_THEME);
  });

  it("includes the Singularity themes", () => {
    expect(THEME_IDS).toContain("singularity");
    expect(THEME_IDS).toContain("singularity-light");
  });

  it("every theme has a complete swatch of valid 6-digit hex colors", () => {
    for (const t of THEMES) {
      for (const key of SWATCH_KEYS) {
        const v = t.swatch[key];
        expect(v, `${t.id}.${key} missing`).toBeTruthy();
        expect(HEX.test(v), `${t.id}.${key} = ${v} is not #rrggbb`).toBe(true);
      }
      // No stray keys beyond the known swatch shape.
      expect(Object.keys(t.swatch).sort()).toEqual([...SWATCH_KEYS].sort());
    }
  });

  it("has a token block in globals.css for every theme id", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(path.join(here, "..", "app", "globals.css"), "utf8");
    for (const id of THEME_IDS) {
      if (id === DEFAULT_THEME) {
        // The default theme is defined on the base :root, not a data-theme block.
        continue;
      }
      expect(
        css.includes(`data-theme="${id}"`),
        `globals.css has no :root[data-theme="${id}"] block — theme.ts and globals.css are out of sync`,
      ).toBe(true);
    }
  });
});
