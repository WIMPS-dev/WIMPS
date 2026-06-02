export type SyntaxColors = {
  instruction: string;
  register: string;
  directive: string;
  comment: string;
  number: string;
  label: string;
  string: string;
  text: string;
};

export type Theme = {
  bg: string;
  text: string;
  subText: string;
  card: string;
  border: string;
  resizer: string;
  tabActive: string;
  tabInactive: string;
  consoleText: string;
  btnBg: string;
  linkColor: string;
  syntax: SyntaxColors;
};

export const THEMES: Record<'dark' | 'light', Theme> = {
  dark: {
    bg: '#0b1020',
    text: '#f8fafc',
    subText: '#94a3b8',
    card: '#1f2937',
    border: '#1f2937',
    resizer: '#334155',
    tabActive: '#1e293b',
    tabInactive: '#111827',
    consoleText: '#cbd5e1',
    btnBg: '#111827',
    linkColor: '#3b82f6',
    syntax: {
      instruction: '#60a5fa',
      register: '#fb923c',
      directive: '#f472b6',
      comment: '#4ade80',
      number: '#f8fafc',
      label: '#f8fafc',
      string: '#f8fafc',
      text: '#f8fafc',
    },
  },
  light: {
    bg: '#f1f5f9',
    text: '#0f172a',
    subText: '#475569',
    card: '#ffffff',
    border: '#cbd5e1',
    resizer: '#94a3b8',
    tabActive: '#e2e8f0',
    tabInactive: '#ffffff',
    consoleText: '#334155',
    btnBg: '#ffffff',
    linkColor: '#2563eb',
    syntax: {
      instruction: '#2563eb',
      register: '#f97316',
      directive: '#ec4899',
      comment: '#16a34a',
      number: '#0f172a',
      label: '#0f172a',
      string: '#0f172a',
      text: '#0f172a',
    },
  },
};
