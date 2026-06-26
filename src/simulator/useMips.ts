import type { JsMips } from '@specy/mips';
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetInstrStats() {
  instrCounts = makeEmptyCounts();
  totalInstructions = 0;
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
  } catch {}
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

export function continueSim(breakpointLines: number[] = []): SimulatorState {
  if (!source || instance.terminated) return getState();
  outputSnapshots = [];
  const bpAddresses = buildBreakpointAddresses(breakpointLines);
  return continueLoop(bpAddresses);
}

export function stepSim(): SimulatorState {
  if (instance.terminated) return getState();
  isBlockedForInput = false;
  if (outputSnapshots.length >= UNDO_SIZE) outputSnapshots.shift();
  outputSnapshots.push(outputBuffer);
  trackCurrentInstruction();
  instance.step();
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
