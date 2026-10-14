export type Theme = {
  id: string;
  number: number;
  name: string;
  dark: boolean;
  canvas: string;
  surface: string;
  ink: string;
  muted: string;
  line: string;
  accent: string;
  primary: string;
  primaryInk: string;
  soft: string;
  sidebar: string;
  sidebarInk: string;
  sidebarMuted: string;
  nav: string;
  navInk: string;
  featured: string;
  featuredInk: string;
  featuredMuted: string;
};

const light = {
  dark: false,
  surface: "#FFFFFF",
  ink: "#17243B",
  muted: "#53636F",
  line: "#DCE4EC",
  primaryInk: "#FFFFFF",
  sidebar: "#FFFFFF",
  sidebarInk: "#17243B",
  sidebarMuted: "#53636F",
  featuredInk: "#FFFFFF",
  featuredMuted: "#FFFFFF",
};
export const themes: readonly Theme[] = [
  {
    ...light,
    id: "royal-blue",
    number: 1,
    name: "Royal Blue",
    canvas: "#F4F7FC",
    accent: "#2454D6",
    primary: "#2454D6",
    soft: "#EAF0FF",
    nav: "#EAF0FF",
    navInk: "#2454D6",
    featured: "#2454D6",
  },
  {
    ...light,
    id: "emerald",
    number: 2,
    name: "Emerald",
    canvas: "#F3F8F5",
    ink: "#18342B",
    accent: "#087F5B",
    primary: "#087F5B",
    soft: "#E5F4EC",
    nav: "#E5F4EC",
    navInk: "#086748",
    featured: "#087F5B",
  },
  {
    ...light,
    id: "graphite",
    number: 3,
    name: "Graphite",
    canvas: "#F5F5F4",
    ink: "#1B222A",
    accent: "#29333F",
    primary: "#29333F",
    soft: "#E8EBEE",
    nav: "#E8EBEE",
    navInk: "#29333F",
    featured: "#29333F",
  },
  {
    ...light,
    id: "midnight",
    number: 4,
    name: "Midnight",
    dark: true,
    canvas: "#101827",
    surface: "#1B2940",
    ink: "#EEF4FF",
    muted: "#B0BED2",
    line: "#3F526C",
    accent: "#9EBFFF",
    primary: "#9EBFFF",
    primaryInk: "#101827",
    soft: "#263B59",
    sidebar: "#141F32",
    sidebarInk: "#EEF4FF",
    sidebarMuted: "#B0BED2",
    nav: "#305B98",
    navInk: "#FFFFFF",
    featured: "#2859A5",
    featuredMuted: "#E6EFFF",
  },
  {
    ...light,
    id: "warm-sand",
    number: 5,
    name: "Warm Sand",
    canvas: "#F8F5EF",
    surface: "#FFFDF9",
    ink: "#382F26",
    accent: "#8A653A",
    primary: "#8A653A",
    line: "#DFD4C4",
    soft: "#EEE4D3",
    nav: "#EEE4D3",
    navInk: "#684923",
    featured: "#8A653A",
  },
  {
    ...light,
    id: "teal",
    number: 6,
    name: "Teal",
    canvas: "#F0F7F8",
    ink: "#183238",
    accent: "#087D8A",
    primary: "#087D8A",
    line: "#D4E5E8",
    soft: "#E0F0F2",
    nav: "#E0F0F2",
    navInk: "#076875",
    featured: "#087D8A",
  },
  {
    ...light,
    id: "navy-champagne",
    number: 7,
    name: "Navy & Champagne",
    canvas: "#F5F3EE",
    ink: "#18263A",
    accent: "#13263E",
    primary: "#13263E",
    line: "#DFDAD0",
    soft: "#F0EADB",
    sidebar: "#13263E",
    sidebarInk: "#FFF9ED",
    sidebarMuted: "#D3DCE7",
    nav: "#D8BF89",
    navInk: "#13263E",
    featured: "#13263E",
  },
  {
    ...light,
    id: "ink-cobalt",
    number: 8,
    name: "Ink & Cobalt",
    canvas: "#F3F6FC",
    ink: "#17212E",
    accent: "#275DDF",
    primary: "#275DDF",
    soft: "#E8EFFF",
    nav: "#E8EFFF",
    navInk: "#2454CE",
    featured: "#FFFFFF",
    featuredInk: "#17212E",
    featuredMuted: "#53636F",
  },
  {
    ...light,
    id: "ivory-walnut",
    number: 9,
    name: "Ivory & Walnut",
    canvas: "#F8F5EF",
    surface: "#FFFDF9",
    ink: "#49382E",
    accent: "#49382E",
    primary: "#49382E",
    line: "#DCCAB4",
    soft: "#EEE6DA",
    sidebar: "#EEE6DA",
    sidebarInk: "#49382E",
    sidebarMuted: "#615044",
    nav: "#E2D2BC",
    navInk: "#49382E",
    featured: "#49382E",
  },
  {
    ...light,
    id: "teal-mint",
    number: 10,
    name: "Teal & Mint",
    canvas: "#EFF7F4",
    ink: "#15332F",
    muted: "#4C665F",
    accent: "#146653",
    primary: "#9EE6C2",
    primaryInk: "#123D3A",
    line: "#D5E5DF",
    soft: "#E0F1E9",
    sidebar: "#123D3A",
    sidebarInk: "#F2FFF8",
    sidebarMuted: "#C2DDD3",
    nav: "#9EE6C2",
    navInk: "#123D3A",
    featured: "#123D3A",
    featuredMuted: "#D1F3E2",
  },
  {
    ...light,
    id: "plum-pearl",
    number: 11,
    name: "Plum & Pearl",
    canvas: "#F7F4FA",
    ink: "#2D2334",
    accent: "#59345F",
    primary: "#59345F",
    line: "#E1D7E7",
    soft: "#EFE5F1",
    sidebar: "#38243F",
    sidebarInk: "#FFF6FF",
    sidebarMuted: "#E4D1E5",
    nav: "#DEC0D4",
    navInk: "#38243F",
    featured: "#38243F",
    featuredMuted: "#F4E5F4",
  },
  {
    ...light,
    id: "obsidian-amber",
    number: 12,
    name: "Obsidian & Amber",
    dark: true,
    canvas: "#101215",
    surface: "#1C2026",
    ink: "#F5F3EC",
    muted: "#B8BEC7",
    line: "#414A56",
    accent: "#E8B35D",
    primary: "#E8B35D",
    primaryInk: "#101215",
    soft: "#2D3036",
    sidebar: "#0B0D10",
    sidebarInk: "#F5F3EC",
    sidebarMuted: "#B8BEC7",
    nav: "#E8B35D",
    navInk: "#101215",
    featured: "#1C2026",
    featuredMuted: "#D5D8DE",
  },
];
export const defaultTheme = "teal-mint";
export const getTheme = (id?: string): Theme =>
  themes.find((theme) => theme.id === id) || themes[9];

export function applyTheme(id?: string) {
  const theme = getTheme(id),
    root = document.documentElement;
  const tokens: Record<string, string> = {
    canvas: theme.canvas,
    surface: theme.surface,
    ink: theme.ink,
    muted: theme.muted,
    line: theme.line,
    border: theme.line,
    blue: theme.accent,
    dusty: theme.muted,
    soft: theme.soft,
    primary: theme.primary,
    "primary-ink": theme.primaryInk,
    sidebar: theme.sidebar,
    "sidebar-ink": theme.sidebarInk,
    "sidebar-muted": theme.sidebarMuted,
    "nav-active": theme.nav,
    "nav-ink": theme.navInk,
    featured: theme.featured,
    "featured-ink": theme.featuredInk,
    "featured-muted": theme.featuredMuted,
    "success-ink": theme.dark ? "#A2E1BD" : "#23674A",
    "success-bg": theme.dark ? "#1D392E" : "#E6F4EB",
    "warning-ink": theme.dark ? "#F3D08C" : "#71521F",
    "warning-bg": theme.dark ? "#443721" : "#FFF3DA",
    "danger-ink": theme.dark ? "#FFA0A0" : "#A33737",
    "danger-bg": theme.dark ? "#44272B" : "#FFF0F0",
  };
  for (const [key, value] of Object.entries(tokens))
    root.style.setProperty("--" + key, value);
  root.dataset.theme = theme.id;
  root.style.colorScheme = theme.dark ? "dark" : "light";
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme.sidebar);
  try {
    localStorage.setItem("mcube-theme", theme.id);
  } catch {
    /* The account setting remains authoritative. */
  }
  return theme;
}

export function initializeTheme() {
  let id: string | undefined;
  try {
    id = localStorage.getItem("mcube-theme") || undefined;
  } catch {
    /* Use the default before account storage opens. */
  }
  applyTheme(id);
}

export function themeLogo(id?: string) {
  const theme = getTheme(id);
  const bg = theme.id === "teal-mint" ? theme.primary : theme.accent;
  const ink =
    theme.id === "teal-mint" || theme.dark ? theme.primaryInk : "#FFFFFF";
  return (
    "data:image/svg+xml," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="24" fill="${bg}"/><path d="M24 68V28H32L48 47L64 28H72V68H61V47L48 63L35 47V68Z" fill="${ink}"/><path d="M25 77H71" stroke="${ink}" stroke-width="3" stroke-linecap="round"/></svg>`,
    )
  );
}
