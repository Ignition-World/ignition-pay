import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * WCAG 2.1 contrast guard for the `destructive` Button variant (issue #893).
 *
 * The variant paints a translucent tint of `--destructive` and puts text on top
 * of it, so its contrast is a function of two design tokens and the surface the
 * button happens to sit on. axe-core — the engine behind the jest-axe checks in
 * `tests/accessibility.test.tsx` — cannot evaluate its `color-contrast` rule
 * under jsdom, because the rule needs a real layout engine to know what is
 * actually painted behind an element. Resolving the tokens arithmetically is
 * therefore the only way to keep this pair from silently regressing.
 *
 * `app/globals.css` stays the single source of truth: this file reads the tokens
 * out of it and recomputes the ratios rather than restating the colours.
 */

const ROOT = process.cwd();
const CSS = readFileSync(join(ROOT, 'app/globals.css'), 'utf8')
  // Comments carry example values and prose that must not be parsed as tokens.
  .replace(/\/\*[\s\S]*?\*\//g, '');
const BUTTON_SOURCE = readFileSync(
  join(ROOT, 'components/ui/button.tsx'),
  'utf8',
);

/** AA for normal-sized text. The variant uses `text-sm`, which is normal text. */
const MIN_RATIO = 4.5;

type Rgb = [number, number, number];

// ---------------------------------------------------------------------------
// Token extraction
// ---------------------------------------------------------------------------

const DECLARATION = /--([a-z0-9-]+):\s*([^;]+);/g;

function declarationsIn(selector: string): Record<string, string> {
  const at = CSS.indexOf(`\n${selector} {`);
  if (at < 0) {
    throw new Error(`app/globals.css no longer declares a ${selector} block`);
  }

  const open = CSS.indexOf('{', at);
  const close = CSS.indexOf('}', open);
  const declarations: Record<string, string> = {};

  for (const [, name, value] of CSS.slice(open + 1, close).matchAll(
    DECLARATION,
  )) {
    declarations[name] = value.trim();
  }

  return declarations;
}

/** Resolves a scope list the way the cascade does: later blocks win. */
function tokensFor(scopes: string[]): Record<string, string> {
  return Object.assign({}, ...scopes.map(declarationsIn));
}

// ---------------------------------------------------------------------------
// Colour maths (sRGB / WCAG 2.1 relative luminance)
// ---------------------------------------------------------------------------

function oklchToRgb(value: string): Rgb {
  const match = value.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/);
  if (!match) {
    throw new Error(`expected a plain oklch() token, received "${value}"`);
  }

  const [lightness, chroma, hue] = match.slice(1).map(Number);
  const radians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);

  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;

  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];

  return linear.map((channel) => {
    const clamped = Math.min(1, Math.max(0, channel));
    return clamped <= 0.0031308
      ? 12.92 * clamped
      : 1.055 * clamped ** (1 / 2.4) - 0.055;
  }) as Rgb;
}

/**
 * Tailwind's `/NN` opacity modifier is `color-mix(in oklab, <token> NN%, transparent)`,
 * which premultiplies down to "the token at NN% alpha". Painting that over a
 * surface composites in sRGB, which is what the browser then measures.
 */
function overTint(token: Rgb, alpha: number, surface: Rgb): Rgb {
  return token.map(
    (channel, index) => alpha * channel + (1 - alpha) * surface[index],
  ) as Rgb;
}

function relativeLuminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(foreground: Rgb, background: Rgb): number {
  const lighter = Math.max(
    relativeLuminance(foreground),
    relativeLuminance(background),
  );
  const darker = Math.min(
    relativeLuminance(foreground),
    relativeLuminance(background),
  );
  return (lighter + 0.05) / (darker + 0.05);
}

function toHex(rgb: Rgb): string {
  return `#${rgb
    .map((channel) =>
      Math.round(channel * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

// ---------------------------------------------------------------------------
// The variant recipe
// ---------------------------------------------------------------------------

/**
 * Opacity of `bg-destructive` for each theme and interaction state, taken from
 * the `destructive` entry of `buttonVariants`. The "recipe lock" test below
 * fails when these stop matching the component.
 */
const THEMES = [
  { name: 'light', scopes: [':root'], rest: 0.1, hover: 0.2 },
  { name: 'dark', scopes: [':root', '.dark'], rest: 0.2, hover: 0.3 },
  {
    name: 'high-contrast dark',
    scopes: [':root', '.dark', '.high-contrast.dark'],
    rest: 0.2,
    hover: 0.3,
  },
] as const;

/** A button is rendered on the page background or on a card; both are checked. */
const SURFACES = ['background', 'card'] as const;

function measuredPairs() {
  return THEMES.flatMap((theme) => {
    const tokens = tokensFor([...theme.scopes]);
    const foreground = oklchToRgb(tokens['destructive-foreground']);
    const destructive = oklchToRgb(tokens.destructive);

    return SURFACES.flatMap((surface) =>
      (['rest', 'hover'] as const).map((state) => {
        const background = overTint(
          destructive,
          theme[state],
          oklchToRgb(tokens[surface]),
        );
        return {
          label: `${theme.name} / ${surface} / ${state}`,
          foreground,
          background,
          ratio: contrastRatio(foreground, background),
        };
      }),
    );
  });
}

// ---------------------------------------------------------------------------

describe('destructive button contrast', () => {
  it('keeps the resolved foreground and background at AA or better', () => {
    const failures = measuredPairs().filter((pair) => pair.ratio < MIN_RATIO);

    expect(
      failures.map(
        (pair) =>
          `${pair.label}: ${pair.ratio.toFixed(2)}:1 (${toHex(pair.foreground)} on ${toHex(
            pair.background,
          )})`,
      ),
      `Every destructive button pair must reach ${MIN_RATIO}:1`,
    ).toEqual([]);
  });

  it('fixes the light-mode pair that issue #893 reported at 3.99:1', () => {
    const light = measuredPairs().find(
      (pair) => pair.label === 'light / background / rest',
    );

    expect(light?.ratio).toBeGreaterThan(MIN_RATIO);
  });

  it('exposes the token as a Tailwind utility, so the class is not a no-op', () => {
    // Without this mapping `text-destructive-foreground` generates no CSS and the
    // button silently falls back to an inherited colour, which is exactly how
    // this pair regressed unnoticed.
    expect(CSS).toContain(
      '--color-destructive-foreground: var(--destructive-foreground);',
    );
  });

  it('paints the variant with the token it is tuned for', () => {
    const destructive =
      BUTTON_SOURCE.match(/destructive:\s*'([^']+)'/)?.[1] ?? '';

    expect(destructive).toContain('text-destructive-foreground');
    expect(destructive).not.toContain('text-destructive ');
    // Lock the recipe the ratios above were computed from.
    expect(destructive).toContain('bg-destructive/10');
    expect(destructive).toContain('hover:bg-destructive/20');
    expect(destructive).toContain('dark:bg-destructive/20');
    expect(destructive).toContain('dark:hover:bg-destructive/30');
  });
});
