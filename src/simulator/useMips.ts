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

const REGISTER_NAMES = [
  '$zero','$at','$v0','$v1','$a0','$a1','$a2','$a3',
  '$t0','$t1','$t2','$t3','$t4','$t5','$t6','$t7',
  '$s0','$s1','$s2','$s3','$s4','$s5','$s6','$s7',
  '$t8','$t9','$k0','$k1','$gp','$sp','$fp','$ra',
] as const;

const UNDO_SIZE = 100;

let source = '';
let instance: JsMips = makeMipsfromSource('');

let allInputs: string[] = [];
let inputCursor = 0;
let isBlockedForInput = false;
let outputBuffer = '';
// Parallel stack to the library's undo stack — each entry is the outputBuffer
// state *before* that step, so stepBack can restore it exactly.
let outputSnapshots: string[] = [];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// Full restart: clears all execution state including inputs and output history.
function restart(): boolean {
  outputBuffer = '';
  outputSnapshots = [];
  allInputs = [];
  inputCursor = 0;
  isBlockedForInput = false;
  instance = makeMipsfromSource(source);
  instance.setUndoSize(UNDO_SIZE);
  const result = instance.assemble();
  if (result.hasErrors) return false;
  instance.initialize(true);
  registerHandlers(instance);
  return true;
}

// Soft restart used by feedInput: keeps accumulated inputs, resets everything else.
function reinitialize(): boolean {
  instance = makeMipsfromSource(source);
  instance.setUndoSize(UNDO_SIZE);
  const result = instance.assemble();
  if (result.hasErrors) return false;
  instance.initialize(true);
  registerHandlers(instance);
  inputCursor = 0;
  return true;
}

// Runs from the current PC, checking breakpoints BEFORE each step.
// Used for fresh starts so a breakpoint on line 1 is respected.
function executeLoop(breakpointAddresses: Set<number>): SimulatorState {
  isBlockedForInput = false;
  while (!instance.terminated && !isBlockedForInput) {
    if (breakpointAddresses.size > 0 && breakpointAddresses.has(instance.programCounter)) break;
    instance.step();
  }
  return getState();
}

// Steps once unconditionally (to move past the current position), then checks
// breakpoints. Used by continueSim so pausing on the same BP twice in a row
// does not get stuck.
function continueLoop(breakpointAddresses: Set<number>): SimulatorState {
  isBlockedForInput = false;
  instance.step();
  while (!instance.terminated && !isBlockedForInput) {
    if (breakpointAddresses.size > 0 && breakpointAddresses.has(instance.programCounter)) break;
    instance.step();
  }
  return getState();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function assemble(src: string) {
  source = src;
  outputBuffer = '';
  outputSnapshots = [];
  allInputs = [];
  inputCursor = 0;
  isBlockedForInput = false;

  instance = makeMipsfromSource(source);
  instance.setUndoSize(UNDO_SIZE);
  const result = instance.assemble();
  if (result.hasErrors) return { ok: false, error: result.report };

  instance.initialize(true);
  registerHandlers(instance);
  return { ok: true };
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
    // Only advertise undo when both the library stack and our output snapshot
    // stack are in sync (they're always kept parallel for explicit steps).
    canUndo: instance.canUndo && outputSnapshots.length > 0,
  };
}

// Restart the program from scratch and run to the first breakpoint (or end).
// Each call is a completely independent execution.
export function runSim(breakpointLines: number[] = []): SimulatorState {
  if (!source) return getState();
  if (!restart()) return getState();
  const bpAddresses = buildBreakpointAddresses(breakpointLines);
  return executeLoop(bpAddresses);
}

// Resume execution from the current paused position to the next breakpoint (or end).
// Clears the step-back snapshot stack because we can't cheaply undo a bulk run.
export function continueSim(breakpointLines: number[] = []): SimulatorState {
  if (!source || instance.terminated) return getState();
  outputSnapshots = [];
  const bpAddresses = buildBreakpointAddresses(breakpointLines);
  return continueLoop(bpAddresses);
}

// Execute one instruction. Snapshots output so stepBackSim can retract it.
export function stepSim(): SimulatorState {
  if (instance.terminated) return getState();
  isBlockedForInput = false;
  // Snapshot before stepping; cap to UNDO_SIZE to stay in sync with the library.
  if (outputSnapshots.length >= UNDO_SIZE) outputSnapshots.shift();
  outputSnapshots.push(outputBuffer);
  instance.step();
  return getState();
}

// Undo one instruction and retract its output.
export function stepBackSim(): SimulatorState {
  if (!instance.canUndo || outputSnapshots.length === 0) return getState();
  outputBuffer = outputSnapshots.pop()!;
  instance.undo();
  return getState();
}

// Provide input to a waiting program, replay from scratch, and continue.
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
  outputBuffer = '';
  outputSnapshots = [];
  allInputs = [];
  inputCursor = 0;
  isBlockedForInput = false;
  instance = makeMipsfromSource('');
}

export function getMemoryRange(startAddr: number, wordCount: number) {
  if (!instance) return [];
  const memory = [];
  try {
    const bytes = instance.readMemoryBytes(startAddr, wordCount * 4);
    for (let i = 0; i < wordCount; i++) {
      const addr = startAddr + i * 4;
      const wordValue =
        ((bytes[i * 4] << 24) | (bytes[i * 4 + 1] << 16) | (bytes[i * 4 + 2] << 8) | bytes[i * 4 + 3]) >>> 0;
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
