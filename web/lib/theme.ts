/**
 * Theme registry — the single source of truth for the theme picker.
 *
 * The ids here MUST match both the `themes` array passed to next-themes
 * (components/theme-provider.tsx) and the `:root[data-theme="<id>"]` token sets
 * in app/globals.css. The swatch values mirror those same token hexes so the
 * preview cards on /settings/appearance render each theme's *real* colors from
 * one place — change a palette here and in globals.css together.
 *
 * `hookd` is the default (dark) brand theme and must stay visually unchanged.
 */

export type ThemeGroup = "dark" | "light";

/** The token subset the preview cards paint with. Mirrors globals.css. */
export interface ThemeSwatch {
  bg: string;
  surface: string;
  surfaceHi: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  onAccent: string;
  pass: string;
  fail: string;
  warn: string;
}

export interface ThemeMeta {
  id: string;
  label: string;
  /** A short, honest one-liner shown under the label on the card. */
  blurb: string;
  group: ThemeGroup;
  /** True for the brand default — the card is badged "default". */
  isDefault?: boolean;
  swatch: ThemeSwatch;
}

/** localStorage key next-themes persists the chosen theme under. */
export const THEME_STORAGE_KEY = "hookd-theme";

/** The default theme id (brand dark). */
export const DEFAULT_THEME = "hookd";

export const THEMES: ThemeMeta[] = [
  {
    id: "hookd",
    label: "hookd",
    blurb: "Graphite & signal — the house lime on near-black.",
    group: "dark",
    isDefault: true,
    swatch: {
      bg: "#0b0d0f",
      surface: "#14171a",
      surfaceHi: "#1c2024",
      border: "#262b30",
      text: "#e6e9ed",
      muted: "#8b949e",
      accent: "#b8ff2e",
      onAccent: "#0b0d0f",
      pass: "#b8ff2e",
      fail: "#ff5c5c",
      warn: "#ffb224",
    },
  },
  {
    id: "singularity",
    label: "Singularity",
    blurb: "Warm graphite, monochrome — a quiet, terminal-grade dark.",
    group: "dark",
    swatch: {
      bg: "#131210",
      surface: "#191715",
      surfaceHi: "#2b2826",
      border: "#312d2b",
      text: "#f4f4f1",
      muted: "#b2ada9",
      accent: "#f4f4f1",
      onAccent: "#191615",
      pass: "#47c289",
      fail: "#dd4040",
      warn: "#f4ae34",
    },
  },
  {
    id: "hookd-light",
    label: "hookd light",
    blurb: "The house palette on cool off-white.",
    group: "light",
    swatch: {
      bg: "#f7f8f8",
      surface: "#ffffff",
      surfaceHi: "#eef0f1",
      border: "#e4e7ea",
      text: "#11161a",
      muted: "#5b646c",
      accent: "#3f6212",
      onAccent: "#11161a",
      pass: "#3f6212",
      fail: "#d62828",
      warn: "#9a5b00",
    },
  },
  {
    id: "singularity-light",
    label: "Singularity Light",
    blurb: "The same monochrome calm on warm paper white.",
    group: "light",
    swatch: {
      bg: "#fbfbf9",
      surface: "#ffffff",
      surfaceHi: "#f1f1ee",
      border: "#e5e4e1",
      text: "#161412",
      muted: "#66605c",
      accent: "#191615",
      onAccent: "#fbfbf9",
      pass: "#1f7a50",
      fail: "#c11f1f",
      warn: "#9b5608",
    },
  },
  {
    id: "dracula",
    label: "Dracula",
    blurb: "The classic purple-on-charcoal cult favourite.",
    group: "dark",
    swatch: {
      bg: "#282a36",
      surface: "#2d2f3d",
      surfaceHi: "#343746",
      border: "#44475a",
      text: "#f8f8f2",
      muted: "#6272a4",
      accent: "#bd93f9",
      onAccent: "#282a36",
      pass: "#50fa7b",
      fail: "#ff5555",
      warn: "#ffb86c",
    },
  },
  {
    id: "nord",
    label: "Nord",
    blurb: "Arctic, muted, frost-blue accents.",
    group: "dark",
    swatch: {
      bg: "#2e3440",
      surface: "#343b49",
      surfaceHi: "#3b4252",
      border: "#434c5e",
      text: "#eceff4",
      muted: "#7b88a1",
      accent: "#88c0d0",
      onAccent: "#2e3440",
      pass: "#a3be8c",
      fail: "#bf616a",
      warn: "#ebcb8b",
    },
  },
  {
    id: "tokyo-night",
    label: "Tokyo Night",
    blurb: "Deep indigo with electric-blue signal.",
    group: "dark",
    swatch: {
      bg: "#1a1b26",
      surface: "#24283b",
      surfaceHi: "#292e42",
      border: "#2f334d",
      text: "#c0caf5",
      muted: "#565f89",
      accent: "#7aa2f7",
      onAccent: "#1a1b26",
      pass: "#9ece6a",
      fail: "#f7768e",
      warn: "#e0af68",
    },
  },
  {
    id: "catppuccin",
    label: "Catppuccin",
    blurb: "Mocha — soft pastel mauve on cocoa.",
    group: "dark",
    swatch: {
      bg: "#1e1e2e",
      surface: "#313244",
      surfaceHi: "#45475a",
      border: "#45475a",
      text: "#cdd6f4",
      muted: "#7f849c",
      accent: "#cba6f7",
      onAccent: "#1e1e2e",
      pass: "#a6e3a1",
      fail: "#f38ba8",
      warn: "#f9e2af",
    },
  },
];

/** All valid theme ids, in picker order — pass straight to next-themes. */
export const THEME_IDS: string[] = THEMES.map((t) => t.id);
