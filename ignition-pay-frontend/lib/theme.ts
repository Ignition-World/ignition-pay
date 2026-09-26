export type ThemeMode = 'light' | 'dark' | 'system'
export type ContrastLevel = 'normal' | 'high'

export interface ThemePalette {
  brandAccent: string
  brandAccentHover?: string
  brandAccentMuted?: string
  background: string
  foreground: string
  card: string
  cardForeground: string
  popover: string
  popoverForeground: string
  primary: string
  primaryForeground: string
  secondary: string
  secondaryForeground: string
  muted: string
  mutedForeground: string
  accent: string
  accentForeground: string
  destructive: string
  border: string
  input: string
  ring: string
  sidebar: string
  sidebarForeground: string
  sidebarPrimary: string
  sidebarPrimaryForeground: string
  sidebarAccent: string
  sidebarAccentForeground: string
  sidebarBorder: string
  sidebarRing: string
}

export interface TypographyScale {
  fontSize: Record<string, string>
  fontWeight: Record<string, number>
  lineHeight: Record<string, string>
  letterSpacing: Record<string, string>
}

export interface ThemeConfig {
  mode: ThemeMode
  contrast: ContrastLevel
  palette: ThemePalette
  typography: TypographyScale
  borderRadius: Record<string, string>
}

export const typographyScale: TypographyScale = {
  fontSize: {
    xs: '0.75rem',
    sm: '0.875rem',
    base: '1rem',
    lg: '1.125rem',
    xl: '1.25rem',
    '2xl': '1.5rem',
    '3xl': '1.875rem',
    '4xl': '2.25rem',
    '5xl': '3rem',
  },
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  lineHeight: {
    tight: '1.25',
    normal: '1.5',
    relaxed: '1.75',
  },
  letterSpacing: {
    tight: '-0.025em',
    normal: '0em',
    wide: '0.025em',
    wider: '0.05em',
    widest: '0.1em',
  },
}

export const borderRadiusScale = {
  sm: 'calc(var(--radius) * 0.6)',
  md: 'calc(var(--radius) * 0.8)',
  lg: 'var(--radius)',
  xl: 'calc(var(--radius) * 1.4)',
  '2xl': 'calc(var(--radius) * 1.8)',
  '3xl': 'calc(var(--radius) * 2.2)',
  '4xl': 'calc(var(--radius) * 2.6)',
  full: '9999px',
}

export const brandAccent = 'oklch(0.56 0.184 161.36)'
export const brandAccentHighContrastDark = 'oklch(0.62 0.22 161.36)'
export const brandAccentHighContrastLight = 'oklch(0.52 0.25 161.36)'

export const lightPalette: ThemePalette = {
  brandAccent: brandAccent,
  brandAccentHover: 'oklch(0.5 0.22 161.36)',
  brandAccentMuted: 'oklch(0.56 0.184 161.36 / 0.15)',
  background: 'oklch(1 0 0)',
  foreground: 'oklch(0.145 0 0)',
  card: 'oklch(1 0 0)',
  cardForeground: 'oklch(0.145 0 0)',
  popover: 'oklch(1 0 0)',
  popoverForeground: 'oklch(0.145 0 0)',
  primary: 'oklch(0.205 0 0)',
  primaryForeground: 'oklch(0.985 0 0)',
  secondary: 'oklch(0.97 0 0)',
  secondaryForeground: 'oklch(0.205 0 0)',
  muted: 'oklch(0.97 0 0)',
  mutedForeground: 'oklch(0.556 0 0)',
  accent: brandAccent,
  accentForeground: 'oklch(0.205 0 0)',
  destructive: 'oklch(0.577 0.245 27.325)',
  border: 'oklch(0.922 0 0)',
  input: 'oklch(0.922 0 0)',
  ring: 'oklch(0.708 0 0)',
  sidebar: 'oklch(0.985 0 0)',
  sidebarForeground: 'oklch(0.145 0 0)',
  sidebarPrimary: 'oklch(0.205 0 0)',
  sidebarPrimaryForeground: 'oklch(0.985 0 0)',
  sidebarAccent: brandAccent,
  sidebarAccentForeground: 'oklch(0.205 0 0)',
  sidebarBorder: 'oklch(0.922 0 0)',
  sidebarRing: 'oklch(0.708 0 0)',
}

export const darkPalette: ThemePalette = {
  brandAccent: brandAccent,
  brandAccentHover: 'oklch(0.5 0.22 161.36)',
  brandAccentMuted: 'oklch(0.56 0.184 161.36 / 0.15)',
  background: 'oklch(0.08 0 0)',
  foreground: 'oklch(0.95 0 0)',
  card: 'oklch(0.12 0 0)',
  cardForeground: 'oklch(0.95 0 0)',
  popover: 'oklch(0.12 0 0)',
  popoverForeground: 'oklch(0.95 0 0)',
  primary: brandAccent,
  primaryForeground: 'oklch(0.95 0 0)',
  secondary: 'oklch(0.18 0 0)',
  secondaryForeground: 'oklch(0.95 0 0)',
  muted: 'oklch(0.22 0 0)',
  mutedForeground: 'oklch(0.64 0 0)',
  accent: brandAccent,
  accentForeground: 'oklch(0.08 0 0)',
  destructive: 'oklch(0.704 0.191 22.216)',
  border: 'oklch(1 0 0 / 8%)',
  input: 'oklch(1 0 0 / 12%)',
  ring: brandAccent,
  sidebar: 'oklch(0.12 0 0)',
  sidebarForeground: 'oklch(0.95 0 0)',
  sidebarPrimary: brandAccent,
  sidebarPrimaryForeground: 'oklch(0.08 0 0)',
  sidebarAccent: brandAccent,
  sidebarAccentForeground: 'oklch(0.08 0 0)',
  sidebarBorder: 'oklch(1 0 0 / 8%)',
  sidebarRing: brandAccent,
}

export const fontConfig = {
  sans: 'var(--font-geist-sans), system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  mono: 'var(--font-geist-mono), "SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", monospace',
  heading: 'var(--font-heading), var(--font-geist-sans), system-ui, sans-serif',
} as const

export function getThemeConfig(mode: ThemeMode, contrast: ContrastLevel = 'normal'): ThemeConfig {
  return {
    mode,
    contrast,
    palette: mode === 'dark' ? darkPalette : lightPalette,
    typography: typographyScale,
    borderRadius: borderRadiusScale,
  }
}

export function applyTheme(mode: ThemeMode, contrast: ContrastLevel = 'normal'): void {
  const root = document.documentElement
  const resolved =
    mode === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : mode

  root.classList.toggle('dark', resolved === 'dark')
  root.classList.toggle('high-contrast', contrast === 'high')
  root.style.colorScheme = resolved === 'dark' ? 'dark' : 'light'
}

export function getStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'system'
  return (localStorage.getItem('theme') as ThemeMode) || 'system'
}

export function storeTheme(mode: ThemeMode): void {
  localStorage.setItem('theme', mode)
}

export function getStoredContrast(): ContrastLevel {
  if (typeof window === 'undefined') return 'normal'
  return (localStorage.getItem('contrast') as ContrastLevel) || 'normal'
}

export function storeContrast(contrast: ContrastLevel): void {
  localStorage.setItem('contrast', contrast)
}
