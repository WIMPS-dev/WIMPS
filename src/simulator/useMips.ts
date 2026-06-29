import type { JsMips, JsProgramStatement, RegisterName } from '@specy/mips';
import { MIPS } from '@specy/mips';

const makeMipsfromSource = MIPS.makeMipsFromSource.bind(MIPS);

export type SimulatorState = {
  registers: { name: string; number: number; hexValue: string; decimalValue: string }[];
  output: string;
  pc: number;
  lineNumber: number | null;
  isWaiting: boolean;
  terminated: boolean;
  canUndo: boolean;
};

export type InstrCategory = 'arithmetic' | 'logic' | 'memory' | 'branch' | 'jump' | 'syscall' | 'other';
export type InstrStats = { counts: Record<InstrCategory, number>; total: number };
export type ValueFormat = 'hex' | 'dec' | 'bin';
export type TextSegmentRow = {
  address: number;
  sourceLine: number;
  source: string;
  assembly: string;
  machine: string;
  binary: number;
};
export type SymbolRow = { label: string; address: number; segment: 'text' | 'data' | 'unknown' };
export type SpecialRegisters = {
  hi: number;
  lo: number;
  pc: number;
  conditionFlags: number[];
};
export type PseudoExpansionInfo = {
  sourceLine: number;
  index: number;
  total: number;
};
export type CacheConfig = {
  cacheBytes: number;
  blockBytes: number;
  associativity: number;
};
export type CacheAccess = {
  address: number;
  line: number | null;
  op: 'read' | 'write' | 'instruction';
  hit: boolean;
};
export type CacheAnalysis = {
  accesses: CacheAccess[];
  hits: number;
  misses: number;
  hitRate: number;
  sets: number;
};

const REGISTER_NAMES = [
  '$zero','$at','$v0','$v1','$a0','$a1','$a2','$a3',
  '$t0','$t1','$t2','$t3','$t4','$t5','$t6','$t7',
  '$s0','$s1','$s2','$s3','$s4','$s5','$s6','$s7',
  '$t8','$t9','$k0','$k1','$gp','$sp','$fp','$ra',
] as const;

const UNDO_SIZE = 100;

// ---------------------------------------------------------------------------
// Instruction classification
// ---------------------------------------------------------------------------
const ARITHMETIC_SET = new Set([
  'add','addi','addu','addiu','sub','subu','mul','mult','multu',
  'div','divu','mfhi','mflo','neg','negu','abs','rem','remu',
  'slt','slti','sltu','sltiu',
]);
const LOGIC_SET = new Set([
  'and','andi','or','ori','xor','xori','nor','not',
  'sll','srl','sra','sllv','srlv','srav','rol','ror',
]);
const MEMORY_SET = new Set([
  'lw','sw','lb','lbu','lh','lhu','sh','sb','ll','sc',
  'lwl','lwr','swl','swr','la','li','lui','move','ulw','usw',
  'ldc1','sdc1','lwc1','swc1',
]);
const BRANCH_SET = new Set([
  'beq','bne','blt','bgt','ble','bge','beqz','bnez',
  'bltz','bgtz','blez','bgez','bltzal','bgezal','bc1t','bc1f',
]);
const JUMP_SET = new Set(['j','jr','jal','jalr']);

function categorizeInstr(mnemonic: string): InstrCategory {
  if (mnemonic === 'syscall' || mnemonic === 'break') return 'syscall';
  if (ARITHMETIC_SET.has(mnemonic)) return 'arithmetic';
  if (LOGIC_SET.has(mnemonic)) return 'logic';
  if (MEMORY_SET.has(mnemonic)) return 'memory';
  if (BRANCH_SET.has(mnemonic)) return 'branch';
  if (JUMP_SET.has(mnemonic)) return 'jump';
  return 'other';
}

function makeEmptyCounts(): Record<InstrCategory, number> {
  return { arithmetic: 0, logic: 0, memory: 0, branch: 0, jump: 0, syscall: 0, other: 0 };
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------
let source = '';
let sourceLines: string[] = [];
let instance: JsMips = makeMipsfromSource('');

let allInputs: string[] = [];
let inputCursor = 0;
let isBlockedForInput = false;
let outputBuffer = '';
let outputSnapshots: string[] = [];

let instrCounts = makeEmptyCounts();
let totalInstructions = 0;
let memoryAccesses: CacheAccess[] = [];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetInstrStats() {
  instrCounts = makeEmptyCounts();
  totalInstructions = 0;
  memoryAccesses = [];
}

function trackCurrentInstruction(): void {
  if (instance.terminated) return;
  try {
    const stmt = instance.getStatementAtAddress(instance.programCounter);
    if (!stmt?.assemblyStatement) return;
    const mnemonic = stmt.assemblyStatement.trimStart().split(/[\s,\t(]/)[0].toLowerCase();
    if (!mnemonic) return;
    instrCounts[categorizeInstr(mnemonic)]++;
    totalInstructions++;
    memoryAccesses.push({ address: stmt.address, line: stmt.sourceLine ?? null, op: 'instruction', hit: false });
    const mem = estimateMemoryAccess(stmt.assemblyStatement);
    if (mem) memoryAccesses.push({ ...mem, line: stmt.sourceLine ?? null, hit: false });
  } catch {}
}

function estimateMemoryAccess(assembly: string): Omit<CacheAccess, 'line' | 'hit'> | null {
  const mnemonic = assembly.trimStart().split(/[\s,\t(]/)[0].toLowerCase();
  if (!/^(l|s)[a-z0-9.]*/.test(mnemonic)) return null;
  const match = assembly.match(/(-?(?:0x[\da-f]+|\d+))?\((\$[a-z0-9]+)\)/i);
  if (!match) return null;
  const offset = parseWordValue(match[1] || '0') ?? 0;
  const base = getRegisterValueRaw(match[2] as RegisterName);
  return { address: (base + offset) >>> 0, op: mnemonic.startsWith('s') ? 'write' : 'read' };
}

function getLineNumberForPc(pc: number): number | null {
  if (instance.terminated) return null;
  try {
    const stmt = instance.getStatementAtAddress(pc);
    return stmt?.sourceLine ?? null;
  } catch {
    return null;
  }
}

function getRegisters(sim: JsMips) {
  return REGISTER_NAMES.map((name, i) => {
    const val = sim.getRegisterValue(name) >>> 0;
    return {
      name,
      number: i,
      hexValue: '0x' + val.toString(16).padStart(8, '0').toUpperCase(),
      decimalValue: val.toString(10),
    };
  });
}

function getRegisterValueRaw(name: RegisterName): number {
  try {
    return instance.getRegisterValue(name) >>> 0;
  } catch {
    return 0;
  }
}

function appendOutputLine(line: string) {
  outputBuffer += outputBuffer === '' || outputBuffer.endsWith('\n') ? line : `\n${line}`;
}

function appendFinishedLine() {
  appendOutputLine('=== Program finished ===');
}

function normalizeStatements(): TextSegmentRow[] {
  try {
    return instance.getCompiledStatements().map((s: JsProgramStatement) => ({
      address: s.address >>> 0,
      sourceLine: s.sourceLine,
      source: s.source || sourceLines[Math.max(0, s.sourceLine - 1)] || '',
      assembly: s.assemblyStatement,
      machine: s.machineStatement,
      binary: s.binaryStatement >>> 0,
    }));
  } catch {
    return [];
  }
}

function registerHandlers(sim: JsMips) {
  sim.registerHandler('printInt',    (i: any) => { outputBuffer += String(i); });
  sim.registerHandler('printFloat',  (f: any) => { outputBuffer += String(f); });
  sim.registerHandler('printDouble', (d: any) => { outputBuffer += String(d); });
  sim.registerHandler('printString', (s: any) => { outputBuffer += s; });
  sim.registerHandler('printChar',   (c: any) => { outputBuffer += c; });

  sim.registerHandler('readInt', () => {
    if (inputCursor < allInputs.length) {
      const val = allInputs[inputCursor++];
      outputBuffer += val + '\n';
      return parseInt(val, 10) || 0;
    }
    isBlockedForInput = true;
    return 0;
  });

  sim.registerHandler('readString', () => {
    if (inputCursor < allInputs.length) {
      const val = allInputs[inputCursor++] ?? '';
      outputBuffer += val + '\n';
      return val;
    }
    isBlockedForInput = true;
    return '';
  });

  sim.registerHandler('readChar', () => {
    if (inputCursor < allInputs.length) {
      const s = allInputs[inputCursor++] ?? '';
      const c = s.charAt(0);
      outputBuffer += c + '\n';
      return c;
    }
    isBlockedForInput = true;
    return '';
  });

  sim.registerHandler('readFloat', () => {
    if (inputCursor < allInputs.length) {
      const val = allInputs[inputCursor++];
      outputBuffer += val + '\n';
      return parseFloat(val) || 0;
    }
    isBlockedForInput = true;
    return 0;
  });

  sim.registerHandler('readDouble', () => {
    if (inputCursor < allInputs.length) {
      const val = allInputs[inputCursor++];
      outputBuffer += val + '\n';
      return parseFloat(val) || 0;
    }
    isBlockedForInput = true;
    return 0;
  });
}

function buildBreakpointAddresses(lines: number[]): Set<number> {
  const addresses = new Set<number>();
  for (const line of lines) {
    try {
      const stmt = instance.getStatementAtSourceLine(line);
      if (stmt) addresses.add(stmt.address);
    } catch {}
  }
  return addresses;
}

function restart(): boolean {
  outputBuffer = '';
  outputSnapshots = [];
  allInputs = [];
  inputCursor = 0;
  isBlockedForInput = false;
  resetInstrStats();
  sourceLines = source.split('\n');
  instance = makeMipsfromSource(source);
  instance.setUndoSize(UNDO_SIZE);
  const result = instance.assemble();
  if (result.hasErrors) return false;
  instance.initialize(true);
  registerHandlers(instance);
  return true;
}

function reinitialize(): boolean {
  resetInstrStats();
  sourceLines = source.split('\n');
  instance = makeMipsfromSource(source);
  instance.setUndoSize(UNDO_SIZE);
  const result = instance.assemble();
  if (result.hasErrors) return false;
  instance.initialize(true);
  registerHandlers(instance);
  inputCursor = 0;
  return true;
}

function executeLoop(breakpointAddresses: Set<number>): SimulatorState {
  isBlockedForInput = false;
  while (!instance.terminated && !isBlockedForInput) {
    if (breakpointAddresses.size > 0 && breakpointAddresses.has(instance.programCounter)) break;
    trackCurrentInstruction();
    instance.step();
  }
  if (instance.terminated) appendFinishedLine();
  return getState();
}

function continueLoop(breakpointAddresses: Set<number>): SimulatorState {
  isBlockedForInput = false;
  if (!instance.terminated) {
    trackCurrentInstruction();
    instance.step();
  }
  while (!instance.terminated && !isBlockedForInput) {
    if (breakpointAddresses.size > 0 && breakpointAddresses.has(instance.programCounter)) break;
    trackCurrentInstruction();
    instance.step();
  }
  if (instance.terminated) appendFinishedLine();
  return getState();
}

function executeLimited(limit: number, breakpointAddresses: Set<number>): SimulatorState {
  isBlockedForInput = false;
  for (let i = 0; i < limit && !instance.terminated && !isBlockedForInput; i++) {
    if (breakpointAddresses.size > 0 && breakpointAddresses.has(instance.programCounter)) break;
    trackCurrentInstruction();
    instance.step();
  }
  if (instance.terminated) appendFinishedLine();
  return getState();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function assemble(src: string) {
  source = src;
  sourceLines = src.split('\n');
  outputBuffer = '';
  outputSnapshots = [];
  allInputs = [];
  inputCursor = 0;
  isBlockedForInput = false;
  resetInstrStats();

  instance = makeMipsfromSource(source);
  instance.setUndoSize(UNDO_SIZE);
  const result = instance.assemble();
  if (result.hasErrors) return { ok: false as const, error: result.report, errors: result.errors };

  instance.initialize(true);
  registerHandlers(instance);
  return { ok: true as const };
}

export function getState(): SimulatorState {
  const pc = instance.programCounter;
  return {
    registers: getRegisters(instance),
    output: outputBuffer,
    pc,
    lineNumber: getLineNumberForPc(pc),
    isWaiting: isBlockedForInput,
    terminated: instance.terminated,
    canUndo: instance.canUndo && outputSnapshots.length > 0,
  };
}

export function runSim(breakpointLines: number[] = []): SimulatorState {
  if (!source) return getState();
  if (!restart()) return getState();
  const bpAddresses = buildBreakpointAddresses(breakpointLines);
  return executeLoop(bpAddresses);
}

export function runSimWithLimit(limit: number, breakpointLines: number[] = []): SimulatorState {
  if (!source) return getState();
  if (!restart()) return getState();
  return executeLimited(Math.max(1, limit), buildBreakpointAddresses(breakpointLines));
}

export function continueSim(breakpointLines: number[] = []): SimulatorState {
  if (!source || instance.terminated) return getState();
  outputSnapshots = [];
  const bpAddresses = buildBreakpointAddresses(breakpointLines);
  return continueLoop(bpAddresses);
}

export function runWithLimit(limit: number, breakpointLines: number[] = []): SimulatorState {
  if (!source || instance.terminated) return getState();
  outputSnapshots = [];
  return executeLimited(Math.max(1, limit), buildBreakpointAddresses(breakpointLines));
}

export function runUntilLine(line: number, breakpointLines: number[] = []): SimulatorState {
  if (!source) return getState();
  const target = (() => {
    try { return instance.getStatementAtSourceLine(line)?.address; } catch { return null; }
  })();
  if (target == null) return getState();
  const state = executeLimited(100000, new Set([...buildBreakpointAddresses(breakpointLines), target]));
  if (!state.terminated && !state.isWaiting && instance.programCounter === target) appendOutputLine(`=== Ran to selected line ${line} ===`);
  return getState();
}

export function stepSim(): SimulatorState {
  if (instance.terminated) return getState();
  isBlockedForInput = false;
  if (outputSnapshots.length >= UNDO_SIZE) outputSnapshots.shift();
  outputSnapshots.push(outputBuffer);
  trackCurrentInstruction();
  instance.step();
  if (instance.terminated) appendFinishedLine();
  return getState();
}

export function stepBackSim(): SimulatorState {
  if (!instance.canUndo || outputSnapshots.length === 0) return getState();
  outputBuffer = outputSnapshots.pop()!;
  instance.undo();
  return getState();
}

export function feedInput(rawInput: string): SimulatorState {
  const tokens = rawInput.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return getState();

  allInputs.push(...tokens);
  const previousOutput = outputBuffer;
  outputBuffer = '';
  outputSnapshots = [];

  if (!reinitialize()) return getState();

  const state = executeLoop(new Set());
  if (outputBuffer === '' && previousOutput !== '') outputBuffer = previousOutput;
  return state;
}

export function resetSim() {
  source = '';
  sourceLines = [];
  outputBuffer = '';
  outputSnapshots = [];
  allInputs = [];
  inputCursor = 0;
  isBlockedForInput = false;
  resetInstrStats();
  instance = makeMipsfromSource('');
}

export function getMemoryRange(startAddr: number, wordCount: number) {
  if (!instance) return [];
  const memory = [];
  try {
    const bytes = instance.readMemoryBytes(startAddr, wordCount * 4);
    for (let i = 0; i < wordCount; i++) {
      const addr = startAddr + i * 4;
      // @specy/mips stores words in little-endian byte order
      const wordValue =
        ((bytes[i * 4 + 3] << 24) | (bytes[i * 4 + 2] << 16) | (bytes[i * 4 + 1] << 8) | bytes[i * 4]) >>> 0;
      memory.push({
        address: '0x' + addr.toString(16).toUpperCase(),
        value: '0x' + wordValue.toString(16).padStart(8, '0').toUpperCase(),
      });
    }
  } catch (e) {
    console.error(e);
  }
  return memory;
}

export function parseWordValue(input: string): number | null {
  const s = input.trim().replace(/_/g, '');
  if (!s) return null;
  let n: number;
  if (/^[+-]?0x[\da-f]+$/i.test(s)) n = Number.parseInt(s, 16);
  else if (/^[+-]?0b[01]+$/i.test(s)) n = Number.parseInt(s.replace(/^([+-]?)0b/i, '$1'), 2);
  else if (/^[+-]?\d+$/.test(s)) n = Number.parseInt(s, 10);
  else return null;
  return Number.isFinite(n) ? n >>> 0 : null;
}

export function formatWordValue(value: number, format: ValueFormat): string {
  const v = value >>> 0;
  if (format === 'bin') return '0b' + v.toString(2).padStart(32, '0');
  if (format === 'dec') return (v | 0).toString(10);
  return '0x' + v.toString(16).padStart(8, '0').toUpperCase();
}

export function setRegisterValue(name: string, value: number): SimulatorState {
  if (name !== '$zero' && (REGISTER_NAMES as readonly string[]).includes(name)) {
    instance.setRegisterValue(name as RegisterName, value | 0);
  }
  return getState();
}

export function setMemoryWord(address: number, value: number): SimulatorState {
  const v = value >>> 0;
  instance.setMemoryBytes(address >>> 0, [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]);
  return getState();
}

export function getCompiledTextSegment(): TextSegmentRow[] {
  return normalizeStatements();
}

export function getPseudoExpansion(): PseudoExpansionInfo | null {
  if (instance.terminated) return null;
  const rows = normalizeStatements();
  const current = rows.find(r => r.address === (instance.programCounter >>> 0));
  if (!current) return null;
  const sameLine = rows.filter(r => r.sourceLine === current.sourceLine);
  if (sameLine.length <= 1) return null;
  return {
    sourceLine: current.sourceLine,
    index: sameLine.findIndex(r => r.address === current.address) + 1,
    total: sameLine.length,
  };
}

export function getCurrentPseudoExpansionRows(): TextSegmentRow[] {
  const info = getPseudoExpansion();
  if (!info) return [];
  return normalizeStatements().filter(r => r.sourceLine === info.sourceLine);
}

export function getSymbolTable(): SymbolRow[] {
  const rows = new Map<string, SymbolRow>();
  for (const stmt of normalizeStatements()) {
    let label: string | null = null;
    try { label = instance.getLabelAtAddress(stmt.address); } catch {}
    if (label) rows.set(`${label}:${stmt.address}`, { label, address: stmt.address, segment: 'text' });
  }
  const data = getDataLabels();
  for (const row of data) rows.set(`${row.label}:${row.address}`, row);
  return [...rows.values()].sort((a, b) => a.address - b.address || a.label.localeCompare(b.label));
}

export function getDataLabels(): SymbolRow[] {
  const rows: SymbolRow[] = [];
  let inData = false;
  let addr = 0x10010000;
  for (const rawLine of sourceLines) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    if (line.startsWith('.data')) { inData = true; continue; }
    if (line.startsWith('.text')) { inData = false; continue; }
    if (!inData) continue;
    const label = line.match(/^([A-Za-z_]\w*):/);
    if (label) rows.push({ label: label[1], address: addr >>> 0, segment: 'data' });
    const rest = line.replace(/^([A-Za-z_]\w*):\s*/, '');
    const count = (rest.match(/-?0x[\da-f]+|-?\d+|"([^"\\]|\\.)*"/gi) || []).length || 1;
    if (rest.startsWith('.byte') || rest.startsWith('.ascii')) addr += count;
    else if (rest.startsWith('.half')) addr += count * 2;
    else if (rest.startsWith('.double')) addr += count * 8;
    else if (rest.startsWith('.space')) addr += parseWordValue(rest.split(/\s+/)[1] || '0') ?? 0;
    else addr += count * 4;
  }
  return rows;
}

export function getSpecialRegisters(): SpecialRegisters {
  return {
    hi: instance.getHi() >>> 0,
    lo: instance.getLo() >>> 0,
    pc: instance.programCounter >>> 0,
    conditionFlags: instance.getConditionFlags(),
  };
}

export function exportAssemblerListing(): string {
  return normalizeStatements()
    .map(r => `${formatWordValue(r.address, 'hex')}\t${formatWordValue(r.binary, 'hex')}\t${r.assembly}\t# ${r.sourceLine}: ${r.source}`)
    .join('\n');
}

export function exportMemoryDump(startAddr = 0x10010000, wordCount = 128, format: ValueFormat = 'hex'): string {
  return getMemoryRange(startAddr, wordCount)
    .map(w => `${w.address}\t${formatWordValue(parseWordValue(w.value) ?? 0, format)}`)
    .join('\n');
}

export function analyzeCache(config: CacheConfig): CacheAnalysis {
  const blockBytes = Math.max(4, config.blockBytes || 16);
  const associativity = Math.max(1, config.associativity || 1);
  const sets = Math.max(1, Math.floor((config.cacheBytes || 1024) / blockBytes / associativity));
  const cache = Array.from({ length: sets }, () => [] as number[]);
  const accesses = memoryAccesses.map(access => {
    const block = Math.floor((access.address >>> 0) / blockBytes);
    const setIndex = block % sets;
    const set = cache[setIndex];
    const existing = set.indexOf(block);
    const hit = existing !== -1;
    if (hit) set.splice(existing, 1);
    set.unshift(block);
    if (set.length > associativity) set.pop();
    return { ...access, hit };
  });
  const hits = accesses.filter(a => a.hit).length;
  const misses = accesses.length - hits;
  return { accesses, hits, misses, hitRate: accesses.length ? hits / accesses.length : 0, sets };
}

export function getInstructionStats(): InstrStats {
  return { counts: { ...instrCounts }, total: totalInstructions };
}

// Returns RGBA pixel data for the given memory region.
// Word format: 0x00RRGGBB (MARS Bitmap Display convention), stored little-endian by @specy/mips.
// Little-endian layout: byte[0]=BB, byte[1]=GG, byte[2]=RR, byte[3]=00.
export function getMemoryBitmapData(startAddr: number, width: number, height: number): Uint8ClampedArray {
  const count = width * height;
  const rgba = new Uint8ClampedArray(count * 4);
  try {
    const bytes = instance.readMemoryBytes(startAddr, count * 4);
    for (let i = 0; i < count; i++) {
      rgba[i * 4]     = bytes[i * 4 + 2]; // R (bits 23–16)
      rgba[i * 4 + 1] = bytes[i * 4 + 1]; // G (bits 15–8)
      rgba[i * 4 + 2] = bytes[i * 4 + 0]; // B (bits 7–0)
      rgba[i * 4 + 3] = 255;              // A
    }
  } catch {}
  return rgba;
}
