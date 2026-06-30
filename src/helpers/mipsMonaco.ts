// MIPS ↔ Monaco glue: language registration (tokenizer + autocomplete + hover)
// and theme definitions. Reuses the canonical tables in mipsSyntax.ts so the
// editor, docs, and highlighter stay in sync.

import { THEMES } from '../theme/themes';
import {
  DIRECTIVES,
  DIRECTIVE_LIST,
  INSTRUCTIONS,
  INSTRUCTION_LIST,
  REGISTER_LIST,
  SYSCALLS,
} from './mipsSyntax';

type MonacoNS = typeof import('monaco-editor');

export const MIPS_LANGUAGE_ID = 'mips';
export const MIPS_DARK = 'wimps-dark';
export const MIPS_LIGHT = 'wimps-light';

export const mipsThemeName = (isDark: boolean) => (isDark ? MIPS_DARK : MIPS_LIGHT);

// ---------------------------------------------------------------------------
// Lookup maps for hover docs (built once)
// ---------------------------------------------------------------------------
const instructionMap = new Map(INSTRUCTIONS.map(i => [i.mnemonic, i]));
const directiveMap = new Map(DIRECTIVES.map(d => [d.directive.split(' ')[0], d]));

function registerConvention(name: string): string {
  if (name === '$zero' || name === '$0') return 'Always zero. Writes are discarded.';
  if (name === '$at' || name === '$1') return 'Reserved for the assembler.';
  if (/^\$v[01]$/.test(name)) return 'Function return values / syscall code.';
  if (/^\$a[0-3]$/.test(name)) return 'Function arguments.';
  if (/^\$t[0-9]$/.test(name)) return 'Temporary; caller-saved.';
  if (/^\$s[0-7]$/.test(name)) return 'Saved temporary; callee-saved.';
  if (/^\$k[01]$/.test(name)) return 'Reserved for the OS kernel.';
  if (name === '$gp') return 'Global pointer.';
  if (name === '$sp') return 'Stack pointer.';
  if (name === '$fp') return 'Frame pointer.';
  if (name === '$ra') return 'Return address.';
  return 'General-purpose register.';
}

// Instruction position: start of line, or right after a label.
const AT_INSTRUCTION_POS = /^(\s*[A-Za-z_]\w*:\s*|\s*)$/;

// ---------------------------------------------------------------------------
// Registration (idempotent)
// ---------------------------------------------------------------------------
let registered = false;

export function registerMipsLanguage(monaco: MonacoNS) {
  if (registered) return;
  registered = true;

  monaco.languages.register({ id: MIPS_LANGUAGE_ID });

  // --- Monarch tokenizer ---
  monaco.languages.setMonarchTokensProvider(MIPS_LANGUAGE_ID, {
    ignoreCase: true,
    defaultToken: '',
    instructions: INSTRUCTION_LIST,
    tokenizer: {
      root: [
        [/#.*$/, 'comment'],
        [/"/, { token: 'string', next: '@string_d' }],
        [/'/, { token: 'string', next: '@string_s' }],
        [/\.[A-Za-z_]\w*/, 'directive'],
        [/[A-Za-z_]\w*:/, 'label'],
        [/\$[A-Za-z0-9]+/, 'register'],
        [/-?0x[0-9a-fA-F]+/, 'number'],
        [/-?\d+/, 'number'],
        [/[A-Za-z_]\w*/, { cases: { '@instructions': 'instruction', '@default': 'identifier' } }],
        [/[ \t\r]+/, ''],
        [/./, ''],
      ],
      string_d: [
        [/[^"]+/, 'string'],
        [/"/, { token: 'string', next: '@pop' }],
      ],
      string_s: [
        [/[^']+/, 'string'],
        [/'/, { token: 'string', next: '@pop' }],
      ],
    },
  } as any);

  // --- Autocomplete ---
  monaco.languages.registerCompletionItemProvider(MIPS_LANGUAGE_ID, {
    triggerCharacters: ['$', '.'],
    provideCompletionItems(model, position) {
      const textBefore = model
        .getValueInRange({ startLineNumber: position.lineNumber, startColumn: 1, endLineNumber: position.lineNumber, endColumn: position.column });
      const token = (textBefore.match(/[$.\w]*$/) ?? [''])[0];
      if (!token) return { suggestions: [] };

      const startColumn = position.column - token.length;
      const tokenLower = token.toLowerCase();
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn,
        endColumn: position.column,
      };

      let pool: string[];
      let kind: number;
      const K = monaco.languages.CompletionItemKind;
      if (token.startsWith('$')) {
        pool = REGISTER_LIST;
        kind = K.Variable;
      } else if (token.startsWith('.')) {
        pool = DIRECTIVE_LIST;
        kind = K.Keyword;
      } else {
        const lineBeforeToken = textBefore.slice(0, textBefore.length - token.length);
        if (!AT_INSTRUCTION_POS.test(lineBeforeToken)) return { suggestions: [] };
        pool = INSTRUCTION_LIST;
        kind = K.Function;
      }

      const startsWith = pool.filter(c => c.toLowerCase().startsWith(tokenLower));
      const includes = pool.filter(c => !c.toLowerCase().startsWith(tokenLower) && c.toLowerCase().includes(tokenLower));
      const candidates = [...startsWith, ...includes];

      return {
        suggestions: candidates.map(c => {
          const doc = instructionMap.get(c);
          return {
            label: c,
            kind,
            insertText: c,
            range,
            detail: doc?.syntax,
            documentation: doc?.desc,
          };
        }),
      };
    },
  });

  // --- Hover docs ---
  monaco.languages.registerHoverProvider(MIPS_LANGUAGE_ID, {
    provideHover(model, position) {
      const line = model.getLineContent(position.lineNumber);
      const re = /\$[A-Za-z0-9]+|\.[A-Za-z_]\w*|[A-Za-z_]\w*/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line))) {
        const start = m.index + 1;
        const end = start + m[0].length;
        if (position.column < start || position.column > end) continue;

        const tok = m[0];
        const range = new monaco.Range(position.lineNumber, start, position.lineNumber, end);
        let md: string | null = null;

        if (tok.startsWith('$')) {
          md = `**${tok}** — register\n\n${registerConvention(tok)}`;
        } else if (tok.startsWith('.')) {
          const d = directiveMap.get(tok);
          if (d) md = `**${d.directive}** — directive\n\n${d.desc}`;
        } else {
          const ins = instructionMap.get(tok.toLowerCase());
          if (ins) {
            md = `\`${ins.syntax}\` — *${ins.type}-type*\n\n${ins.desc}`;
          }
        }

        if (md) return { range, contents: [{ value: md }] };
        return null;
      }
      return null;
    },
  });
}

// ---------------------------------------------------------------------------
// Themes
// ---------------------------------------------------------------------------
const hex = (c: string) => c.replace('#', '');

function buildRules(syntax: typeof THEMES.dark.syntax) {
  return [
    { token: 'instruction', foreground: hex(syntax.instruction) },
    { token: 'register', foreground: hex(syntax.register) },
    { token: 'directive', foreground: hex(syntax.directive) },
    { token: 'comment', foreground: hex(syntax.comment) },
    { token: 'number', foreground: hex(syntax.number) },
    { token: 'label', foreground: hex(syntax.label) },
    { token: 'string', foreground: hex(syntax.string) },
  ];
}

let themesDefined = false;

export function defineMipsThemes(monaco: MonacoNS) {
  if (themesDefined) return;
  themesDefined = true;

  monaco.editor.defineTheme(MIPS_DARK, {
    base: 'vs-dark',
    inherit: true,
    rules: buildRules(THEMES.dark.syntax),
    colors: {
      'editor.background': THEMES.dark.card,
      'editor.foreground': THEMES.dark.text,
      'editorLineNumber.foreground': THEMES.dark.subText,
      'editorLineNumber.activeForeground': THEMES.dark.text,
      'editorGutter.background': THEMES.dark.card,
      // Autocomplete suggestion widget
      'editorSuggestWidget.background': THEMES.dark.card,
      'editorSuggestWidget.border': THEMES.dark.border,
      'editorSuggestWidget.foreground': THEMES.dark.text,
      'editorSuggestWidget.selectedBackground': THEMES.dark.tabActive,
      'editorSuggestWidget.selectedForeground': THEMES.dark.text,
      'editorSuggestWidget.highlightForeground': THEMES.dark.linkColor,
      'editorSuggestWidget.focusHighlightForeground': THEMES.dark.linkColor,
      // Find / replace widget + highlights
      'editorWidget.background': THEMES.dark.card,
      'editorWidget.border': THEMES.dark.linkColor,
      'editorWidget.foreground': THEMES.dark.text,
      'editor.findMatchBackground': '#2563eb66',
      'editor.findMatchForeground': THEMES.dark.text,
      'editor.findMatchHighlightBackground': '#2563eb33',
      'editor.findMatchHighlightForeground': THEMES.dark.text,
      'editor.findRangeHighlightBackground': '#2563eb1f',
      'editor.findMatchBorder': THEMES.dark.linkColor,
      'editor.findMatchHighlightBorder': THEMES.dark.linkColor,
      'editor.findRangeHighlightBorder': THEMES.dark.linkColor,
      // Shared input box styling used by Monaco's find/replace fields
      'input.background': THEMES.dark.card,
      'input.foreground': THEMES.dark.text,
      'input.border': THEMES.dark.linkColor,
      'input.placeholderForeground': THEMES.dark.subText,
      'inputOption.activeBorder': THEMES.dark.linkColor,
      'inputOption.hoverBackground': '#2563eb22',
      'inputOption.activeBackground': '#2563eb33',
      'inputOption.activeForeground': THEMES.dark.text,
      // Hover info widget
      'editorHoverWidget.background': THEMES.dark.card,
      'editorHoverWidget.border': THEMES.dark.border,
      'editorHoverWidget.foreground': THEMES.dark.text,
      'editorHoverWidget.statusBarBackground': THEMES.dark.bg,
      // Generic editor widgets (parameter hints, etc.)
      'editorWidget.resizeBorder': THEMES.dark.linkColor,
    },
  });

  monaco.editor.defineTheme(MIPS_LIGHT, {
    base: 'vs',
    inherit: true,
    rules: buildRules(THEMES.light.syntax),
    colors: {
      'editor.background': THEMES.light.card,
      'editor.foreground': THEMES.light.text,
      'editorLineNumber.foreground': THEMES.light.subText,
      'editorLineNumber.activeForeground': THEMES.light.text,
      'editorGutter.background': THEMES.light.card,
      // Autocomplete suggestion widget
      'editorSuggestWidget.background': THEMES.light.card,
      'editorSuggestWidget.border': THEMES.light.border,
      'editorSuggestWidget.foreground': THEMES.light.text,
      'editorSuggestWidget.selectedBackground': THEMES.light.tabActive,
      'editorSuggestWidget.selectedForeground': THEMES.light.text,
      'editorSuggestWidget.highlightForeground': THEMES.light.linkColor,
      'editorSuggestWidget.focusHighlightForeground': THEMES.light.linkColor,
      // Find / replace widget + highlights
      'editorWidget.background': THEMES.light.card,
      'editorWidget.border': THEMES.light.linkColor,
      'editorWidget.foreground': THEMES.light.text,
      'editor.findMatchBackground': '#2563eb66',
      'editor.findMatchForeground': THEMES.light.text,
      'editor.findMatchHighlightBackground': '#2563eb33',
      'editor.findMatchHighlightForeground': THEMES.light.text,
      'editor.findRangeHighlightBackground': '#2563eb1f',
      'editor.findMatchBorder': THEMES.light.linkColor,
      'editor.findMatchHighlightBorder': THEMES.light.linkColor,
      'editor.findRangeHighlightBorder': THEMES.light.linkColor,
      // Shared input box styling used by Monaco's find/replace fields
      'input.background': THEMES.light.card,
      'input.foreground': THEMES.light.text,
      'input.border': THEMES.light.linkColor,
      'input.placeholderForeground': THEMES.light.subText,
      'inputOption.activeBorder': THEMES.light.linkColor,
      'inputOption.hoverBackground': '#2563eb18',
      'inputOption.activeBackground': '#2563eb22',
      'inputOption.activeForeground': THEMES.light.text,
      // Hover info widget
      'editorHoverWidget.background': THEMES.light.card,
      'editorHoverWidget.border': THEMES.light.border,
      'editorHoverWidget.foreground': THEMES.light.text,
      'editorHoverWidget.statusBarBackground': THEMES.light.bg,
      // Generic editor widgets (parameter hints, etc.)
      'editorWidget.resizeBorder': THEMES.light.linkColor,
    },
  });
}
