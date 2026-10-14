import { expect, it } from "vitest";
import { themes, getTheme, defaultTheme } from "./themes";

function contrast(a: string, b: string) {
  const luminance = (hex: string) => {
    const channels = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((value) =>
        value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
      );
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

it("keeps text and primary controls readable in all twelve themes", () => {
  for (const theme of themes) {
    for (const [foreground, background] of [
      [theme.ink, theme.surface],
      [theme.muted, theme.surface],
      [theme.muted, theme.canvas],
      [theme.primaryInk, theme.primary],
      [theme.sidebarInk, theme.sidebar],
      [theme.sidebarMuted, theme.sidebar],
      [theme.navInk, theme.nav],
      [theme.featuredInk, theme.featured],
      [theme.featuredMuted, theme.featured],
    ])
      expect(
        contrast(foreground, background),
        theme.name + ": " + foreground + " on " + background,
      ).toBeGreaterThanOrEqual(4.5);
  }
  expect(themes).toHaveLength(12);
  expect(new Set(themes.map((theme) => theme.id)).size).toBe(12);
  expect(getTheme().number).toBe(10);
  expect(getTheme("unknown").id).toBe(defaultTheme);
});
