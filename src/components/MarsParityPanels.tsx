import React, { useEffect, useMemo, useState } from 'react';
import { InstructionStats } from './InstructionStats';
import {
  analyzeCache,
  exportAssemblerListing,
  formatWordValue,
  getCompiledTextSegment,
  getSpecialRegisters,
  getSymbolTable,
  type CacheConfig,
  type InstrStats,
  type TextSegmentRow,
} from '../simulator/useMips';
import type { Theme } from '../theme/themes';

type ProgramPanelProps = {
  theme: Theme;
  tick: number;
};

type ProgramFormat = 'hex' | 'binary';

type DecodedField = {
  key: 'opcode' | 'rs' | 'rt' | 'rd' | 'shamt' | 'funct' | 'imm' | 'address';
  value: number;
  width: number;
  alias?: string;
};

type DecodedInstruction = {
  kind: 'r' | 'i' | 'j';
  fields: DecodedField[];
};

const REGISTER_ALIASES = [
  '$zero', '$at', '$v0', '$v1', '$a0', '$a1', '$a2', '$a3',
  '$t0', '$t1', '$t2', '$t3', '$t4', '$t5', '$t6', '$t7',
  '$s0', '$s1', '$s2', '$s3', '$s4', '$s5', '$s6', '$s7',
  '$t8', '$t9', '$k0', '$k1', '$gp', '$sp', '$fp', '$ra',
] as const;

type PerformancePanelProps = {
  theme: Theme;
  tick: number;
  stats: InstrStats | null;
};

function registerAlias(index: number): string {
  return REGISTER_ALIASES[index] ?? `$${index}`;
}

function normalizeAssemblyAliases(assembly: string): string {
  return assembly.replace(/(^|[^\w$])\$(\d+)\b/g, (_, prefix, raw) => `${prefix}${registerAlias(Number(raw))}`);
}

function normalizeAssemblySpacing(assembly: string): string {
  return normalizeAssemblyAliases(assembly)
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .trim();
}

function parseNumberToken(token: string): number | null {
  if (/^-?0x[\da-f]+$/i.test(token)) {
    const sign = token.startsWith('-') ? -1 : 1;
    const digits = token.replace(/^-?0x/i, '');
    return sign * parseInt(digits, 16);
  }
  if (/^-?\d+$/.test(token)) return parseInt(token, 10);
  return null;
}

const NUMBER_TOKEN_RE = /(?<![\w$])(-?0x[\da-f]+|-?\d+)(?![\w$])/gi;

function getNumberTokens(text: string): string[] {
  return Array.from(text.matchAll(NUMBER_TOKEN_RE), match => match[1]);
}

function isNegativeSourceMaskOfAssembly(sourceToken: string, assemblyToken: string): boolean {
  if (!sourceToken.startsWith('-') || !/^0x[\da-f]+$/i.test(assemblyToken)) return false;
  const sourceValue = parseNumberToken(sourceToken);
  const assemblyValue = parseNumberToken(assemblyToken);
  if (sourceValue === null || assemblyValue === null) return false;
  const digits = assemblyToken.slice(2).length;
  if (digits < 1 || digits > 8) return false;
  const mask = digits === 8 ? 0xffffffff : (2 ** (digits * 4)) - 1;
  return (sourceValue & mask) === assemblyValue;
}

function preserveSourceNumberStyle(assembly: string, source: string): string {
  const assemblyNumbers = getNumberTokens(assembly);
  const sourceNumbers = getNumberTokens(source.replace(/#.*$/, ''));
  if (assemblyNumbers.length === 0 || assemblyNumbers.length !== sourceNumbers.length) return assembly;
  const pairs = assemblyNumbers.map((assemblyToken, index) => {
    const sourceToken = sourceNumbers[index];
    const assemblyValue = parseNumberToken(assemblyToken);
    const sourceValue = parseNumberToken(sourceToken);
    const matches = assemblyValue !== null
      && sourceValue !== null
      && (assemblyValue === sourceValue || isNegativeSourceMaskOfAssembly(sourceToken, assemblyToken));
    return { assemblyToken, sourceToken, matches };
  });
  if (pairs.some(pair => !pair.matches)) return assembly;
  let replacementIndex = 0;
  return assembly.replace(NUMBER_TOKEN_RE, () => pairs[replacementIndex++]!.sourceToken);
}

function formatInstructionDisplay(assembly: string, source: string): string {
  return normalizeAssemblySpacing(preserveSourceNumberStyle(assembly, source));
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function SmallButton({ theme, children, onClick }: { theme: Theme; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: `1px solid ${theme.border}`,
        backgroundColor: theme.bg,
        color: theme.text,
        borderRadius: 6,
        padding: '4px 8px',
        fontSize: 11,
        fontWeight: 700,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function Empty({ theme, text }: { theme: Theme; text: string }) {
  return <div style={{ color: theme.subText, fontSize: 12, padding: 18, textAlign: 'center' }}>{text}</div>;
}

function HelpText({ theme, children }: { theme: Theme; children: React.ReactNode }) {
  return (
    <div style={{ color: theme.subText, fontSize: 11, lineHeight: '16px' }}>
      {children}
    </div>
  );
}

function PanelToggle({
  theme,
  active,
  label,
  onClick,
}: {
  theme: Theme;
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: `1px solid ${active ? '#2563eb' : theme.border}`,
        backgroundColor: active ? '#2563eb22' : theme.bg,
        color: active ? '#2563eb' : theme.text,
        borderRadius: 6,
        padding: '4px 8px',
        fontSize: 11,
        fontWeight: 700,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

function ToggleGroup({
  theme,
  label,
  children,
}: {
  theme: Theme;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, border: `1px solid ${theme.border}`, borderRadius: 8, padding: 4, backgroundColor: theme.bg }}>
      <span style={{ color: theme.subText, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.6, padding: '0 2px' }}>{label}</span>
      {children}
    </div>
  );
}

function formatBinary(value: number, width: number): string {
  return (value >>> 0).toString(2).padStart(width, '0');
}

function groupBinary(bits: string, size = 4): string {
  const groups: string[] = [];
  for (let index = bits.length; index > 0; index -= size) {
    groups.unshift(bits.slice(Math.max(0, index - size), index));
  }
  return groups.join(' ');
}

function formatFieldValue(field: DecodedField, format: ProgramFormat): string {
  if (format === 'binary') return groupBinary(formatBinary(field.value, field.width));
  return `0x${field.value.toString(16).padStart(Math.ceil(field.width / 4), '0')}`;
}

function fieldDisplayLabel(field: DecodedField): string {
  return field.key === 'address' ? 'target' : field.key;
}

function formatProgramWord(word: number, format: ProgramFormat): string {
  if (format === 'binary') return groupBinary(formatBinary(word >>> 0, 32));
  return formatWordValue(word, 'hex');
}

function formatProgramAddress(address: number, format: ProgramFormat): string {
  if (format === 'binary') return groupBinary(formatBinary(address >>> 0, 32));
  return formatWordValue(address, 'hex');
}

function decodeInstruction(row: TextSegmentRow): DecodedInstruction {
  const word = row.binary >>> 0;
  const opcode = (word >>> 26) & 0x3f;

  if (opcode === 0) {
    const rs = (word >>> 21) & 0x1f;
    const rt = (word >>> 16) & 0x1f;
    const rd = (word >>> 11) & 0x1f;
    return {
      kind: 'r',
      fields: [
        { key: 'opcode', value: opcode, width: 6 },
        { key: 'rs', value: rs, width: 5, alias: registerAlias(rs) },
        { key: 'rt', value: rt, width: 5, alias: registerAlias(rt) },
        { key: 'rd', value: rd, width: 5, alias: registerAlias(rd) },
        { key: 'shamt', value: (word >>> 6) & 0x1f, width: 5 },
        { key: 'funct', value: word & 0x3f, width: 6 },
      ],
    };
  }

  if (opcode === 2 || opcode === 3) {
    return {
      kind: 'j',
      fields: [
        { key: 'opcode', value: opcode, width: 6 },
        { key: 'address', value: word & 0x03ffffff, width: 26 },
      ],
    };
  }

  const rs = (word >>> 21) & 0x1f;
  const rt = (word >>> 16) & 0x1f;
  return {
    kind: 'i',
    fields: [
      { key: 'opcode', value: opcode, width: 6 },
      { key: 'rs', value: rs, width: 5, alias: registerAlias(rs) },
      { key: 'rt', value: rt, width: 5, alias: registerAlias(rt) },
      { key: 'imm', value: word & 0xffff, width: 16 },
    ],
  };
}

function CacheAnalysisPanel({ theme, tick }: { theme: Theme; tick: number }) {
  const [config, setConfig] = useState<CacheConfig>({ cacheBytes: 1024, blockBytes: 16, associativity: 1 });
  const [showConfig, setShowConfig] = useState(false);
  const result = useMemo(() => analyzeCache(config), [tick, config]);

  return (
    <div style={{ border: `1px solid ${theme.border}`, borderRadius: 10, backgroundColor: theme.card, overflow: 'hidden' }}>
      <div style={{ padding: '10px 12px', borderBottom: `1px solid ${theme.border}` }}>
        <div style={{ color: theme.text, fontSize: 12, fontWeight: 700 }}>Cache analysis</div>
        <div style={{ color: theme.subText, fontSize: 11, lineHeight: '16px', marginTop: 4 }}>
          Optional performance detail. Run a program first, then compare hit and miss behavior if you need it.
        </div>
      </div>

      {result.accesses.length > 0 && (
        <>
          <div style={{ padding: '10px 12px', borderBottom: `1px solid ${theme.border}`, color: theme.text, fontSize: 12, display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span><strong>{result.hits}</strong> hits / <strong>{result.misses}</strong> misses · {(result.hitRate * 100).toFixed(1)}% hit rate · {result.sets} sets</span>
            <SmallButton theme={theme} onClick={() => setShowConfig(v => !v)}>
              {showConfig ? 'Hide config' : 'Cache config'}
            </SmallButton>
          </div>
          {showConfig && (
            <div style={{ padding: 8, borderBottom: `1px solid ${theme.border}`, backgroundColor: theme.bg, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[
                ['Cache B', 'cacheBytes', [512, 1024, 2048, 4096]],
                ['Block B', 'blockBytes', [4, 8, 16, 32]],
                ['Ways', 'associativity', [1, 2, 4]],
              ].map(([label, key, values]) => (
                <label key={key as string} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: theme.subText, fontWeight: 700 }}>
                  {label as string}
                  <select value={config[key as keyof CacheConfig]} onChange={e => setConfig(c => ({ ...c, [key as string]: Number(e.target.value) }))} style={{ backgroundColor: theme.card, color: theme.text, border: `1px solid ${theme.border}`, borderRadius: 5, fontSize: 11 }}>
                    {(values as number[]).map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </label>
              ))}
            </div>
          )}
        </>
      )}

      <div style={{ maxHeight: 240, overflow: 'auto', padding: 8 }}>
        {result.accesses.length === 0 ? <Empty theme={theme} text="Run a program to analyze instruction and memory cache accesses." /> : result.accesses.slice(-200).map((a, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '4ch 9ch 1fr 5ch', gap: 8, padding: '3px 2px', borderBottom: `1px solid ${theme.border}22`, fontSize: 11 }}>
            <span style={{ color: a.hit ? '#10b981' : '#ef4444', fontWeight: 800 }}>{a.hit ? 'hit' : 'miss'}</span>
            <span style={{ fontFamily: 'monospace', color: theme.subText }}>{formatWordValue(a.address, 'hex')}</span>
            <span style={{ color: theme.text }}>{a.op}</span>
            <span style={{ color: theme.subText, textAlign: 'right' }}>{a.line ?? ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProgramPanel({ theme, tick }: ProgramPanelProps) {
  const [tab, setTab] = useState<'instructions' | 'labels'>('instructions');
  const [format, setFormat] = useState<ProgramFormat>('hex');
  const [selectedAddress, setSelectedAddress] = useState<number | null>(null);
  const rows = useMemo(() => getCompiledTextSegment(), [tick]);
  const labels = useMemo(() => getSymbolTable(), [tick]);
  const currentPc = useMemo(() => getSpecialRegisters().pc, [tick]);
  const instructionGridColumns = format === 'binary'
    ? '292px 292px minmax(0, 1fr)'
    : '112px 112px minmax(0, 1fr)';

  useEffect(() => {
    if (selectedAddress !== null && !rows.some(row => row.address === selectedAddress)) {
      setSelectedAddress(null);
    }
  }, [rows, selectedAddress]);

  const activeRow = rows.find(row => row.address === selectedAddress)
    ?? rows.find(row => row.address === currentPc)
    ?? rows[0]
    ?? null;

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', backgroundColor: theme.bg }}>
      <div style={{ padding: 10, borderBottom: `1px solid ${theme.border}`, backgroundColor: theme.card, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <ToggleGroup theme={theme} label="Show">
            <PanelToggle theme={theme} active={tab === 'instructions'} label="Instructions" onClick={() => setTab('instructions')} />
            <PanelToggle theme={theme} active={tab === 'labels'} label="Labels" onClick={() => setTab('labels')} />
          </ToggleGroup>
          <ToggleGroup theme={theme} label="View">
            <PanelToggle theme={theme} active={format === 'hex'} label="Hex" onClick={() => setFormat('hex')} />
            <PanelToggle theme={theme} active={format === 'binary'} label="Binary" onClick={() => setFormat('binary')} />
          </ToggleGroup>
          <div style={{ flex: 1 }} />
          <SmallButton theme={theme} onClick={() => downloadText('assembler-listing.txt', exportAssemblerListing())}>
            Download assembler listing
          </SmallButton>
        </div>
        <HelpText theme={theme}>
          Downloads a text file with addresses, machine words, assembled instructions, and source-line mapping.
        </HelpText>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 10, display: 'grid', gap: 10, alignContent: 'start' }}>
        {tab === 'instructions' && (
          rows.length === 0 ? <Empty theme={theme} text="Assemble a program to inspect the instructions the CPU will run." /> : (
            <>
              <div style={{ padding: '10px 12px', border: `1px solid ${theme.border}`, borderRadius: 10, backgroundColor: theme.card }}>
                <HelpText theme={theme}>
                  Machine code is the stored 32-bit word in memory. Instruction is the human-readable assembly form produced by the assembler.
                </HelpText>
              </div>

              <div style={{ border: `1px solid ${theme.border}`, borderRadius: 10, backgroundColor: theme.card, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: instructionGridColumns, gap: 10, padding: '10px 12px', borderBottom: `1px solid ${theme.border}`, color: theme.subText, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', fontFamily: 'monospace' }}>
                  <span style={{ minWidth: 0, whiteSpace: 'normal', overflowWrap: 'anywhere', lineHeight: '14px' }}>Address</span>
                  <span style={{ minWidth: 0, whiteSpace: 'normal', overflowWrap: 'anywhere', lineHeight: '14px' }}>Machine code</span>
                  <span style={{ minWidth: 0, whiteSpace: 'normal', overflowWrap: 'anywhere', lineHeight: '14px' }}>Instruction</span>
                </div>
                <div style={{ maxHeight: 360, overflow: 'auto' }}>
                  {rows.map(row => {
                    const isSelected = activeRow?.address === row.address;
                    const isCurrent = row.address === currentPc;
                    return (
                      <button
                        key={row.address}
                        type="button"
                        onClick={() => setSelectedAddress(row.address)}
                        style={{
                          width: '100%',
                          display: 'grid',
                          gridTemplateColumns: instructionGridColumns,
                          gap: 10,
                          padding: '9px 12px',
                          border: 'none',
                          borderBottom: `1px solid ${theme.border}22`,
                          backgroundColor: isSelected ? '#2563eb18' : isCurrent ? `${theme.border}28` : 'transparent',
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        <span style={{ fontFamily: 'monospace', color: theme.subText, whiteSpace: 'normal', lineHeight: '16px' }}>{formatProgramAddress(row.address, format)}</span>
                        <span style={{ fontFamily: 'monospace', color: theme.text, whiteSpace: 'normal', lineHeight: '16px' }}>
                          {formatProgramWord(row.binary, format)}
                        </span>
                        <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, minWidth: 0, flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: 'monospace', color: theme.text, minWidth: 0, overflowWrap: 'anywhere' }}>{formatInstructionDisplay(row.assembly, row.source)}</span>
                          {isCurrent && <span style={{ color: '#2563eb', fontSize: 10, fontWeight: 800, whiteSpace: 'nowrap' }}>Current</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {activeRow && (
                <div style={{ padding: '12px 14px', border: `1px solid ${theme.border}`, borderRadius: 10, backgroundColor: theme.card }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ color: theme.subText, fontSize: 10, fontWeight: 800, textTransform: 'uppercase' }}>Decoded fields</div>
                      <div style={{ marginTop: 4, color: theme.text, fontFamily: 'monospace', fontSize: 13 }}>{formatInstructionDisplay(activeRow.assembly, activeRow.source)}</div>
                    </div>
                    <div style={{ color: theme.subText, fontFamily: 'monospace', fontSize: 11 }}>{formatProgramAddress(activeRow.address, format)}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                    {decodeInstruction(activeRow).fields.map(field => (
                      <span key={field.key} style={{ border: `1px solid ${theme.border}`, borderRadius: 999, padding: '3px 7px', fontSize: 11, color: theme.subText, fontFamily: 'monospace', whiteSpace: 'normal', lineHeight: '16px' }}>
                        {fieldDisplayLabel(field)}: {formatFieldValue(field, format)}{field.alias ? ` (${field.alias})` : ''}
                      </span>
                    ))}
                  </div>
                  <div style={{ marginTop: 8, color: theme.subText, fontSize: 11, lineHeight: '16px' }}>
                    Source line {activeRow.sourceLine}: {activeRow.source}
                  </div>
                </div>
              )}
            </>
          )
        )}

        {tab === 'labels' && (
          labels.length === 0 ? <Empty theme={theme} text="Assemble a program to inspect code and data labels." /> : (
            <div style={{ border: `1px solid ${theme.border}`, borderRadius: 10, backgroundColor: theme.card, overflow: 'hidden' }}>
              <div style={{ padding: '10px 12px', borderBottom: `1px solid ${theme.border}` }}>
                <HelpText theme={theme}>
                  Labels name code and data locations so you can map symbolic names back to real addresses.
                </HelpText>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 8ch 12ch', gap: 10, padding: '10px 12px', borderBottom: `1px solid ${theme.border}`, color: theme.subText, fontSize: 10, fontWeight: 800, textTransform: 'uppercase' }}>
                <span>Label</span>
                <span>Kind</span>
                <span>Address</span>
              </div>
              <div style={{ maxHeight: 420, overflow: 'auto' }}>
                {labels.map(row => (
                  <div key={`${row.label}-${row.address}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 8ch 12ch', gap: 10, padding: '9px 12px', borderBottom: `1px solid ${theme.border}22`, fontSize: 12 }}>
                    <span style={{ color: theme.text, fontWeight: 700 }}>{row.label}</span>
                    <span style={{ color: theme.subText, textTransform: 'capitalize' }}>{row.segment === 'text' ? 'code' : row.segment}</span>
                    <span style={{ color: theme.text, fontFamily: 'monospace' }}>{formatWordValue(row.address, 'hex')}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}

export function PerformancePanel({ theme, tick, stats }: PerformancePanelProps) {
  const [showCache, setShowCache] = useState(false);

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', backgroundColor: theme.bg }}>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 10, display: 'grid', gap: 10, alignContent: 'start' }}>
        <div style={{ border: `1px solid ${theme.border}`, borderRadius: 10, backgroundColor: theme.card, overflow: 'hidden' }}>
          <div style={{ padding: '10px 12px', borderBottom: `1px solid ${theme.border}` }}>
            <div style={{ color: theme.text, fontSize: 12, fontWeight: 700 }}>Instruction statistics</div>
            <div style={{ color: theme.subText, fontSize: 11, lineHeight: '16px', marginTop: 4 }}>
              See how the program behaved after running it.
            </div>
          </div>
          <InstructionStats theme={theme} stats={stats} />
        </div>

        <div>
          <SmallButton theme={theme} onClick={() => setShowCache(v => !v)}>
            {showCache ? 'Hide cache analysis' : 'Show cache analysis'}
          </SmallButton>
        </div>

        {showCache && <CacheAnalysisPanel theme={theme} tick={tick} />}
      </div>
    </div>
  );
}
