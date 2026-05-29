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
};

const REGISTER_NAMES = [
  '$zero','$at','$v0','$v1','$a0','$a1','$a2','$a3',
  '$t0','$t1','$t2','$t3','$t4','$t5','$t6','$t7',
  '$s0','$s1','$s2','$s3','$s4','$s5','$s6','$s7',
  '$t8','$t9','$k0','$k1','$gp','$sp','$fp','$ra',
] as const;

let source = '';
let pcToLine = new Map<number, number>();
let instance: JsMips = makeMipsfromSource('');

let allInputs: string[] = [];
let inputCursor = 0;
let isBlockedForInput = false;
let outputBuffer = '';

function buildPcToLineMap(src: string) {
  pcToLine = new Map<number, number>();
  let pc = 0x00400000;
  let inTextSection = true;

  src.split('\n').forEach((rawLine, index) => {
    const lineNumber = index + 1;
    let line = rawLine.split('#')[0].trim();
    if (!line) return;

    if (line === '.data') { inTextSection = false; return; }
    if (line === '.text') { inTextSection = true; return; }
    if (!inTextSection) return;

    line = line.replace(/^[A-Za-z_][\w]*:\s*/, '').trim();
    if (!line) return;

    pcToLine.set(pc, lineNumber);
    pc += 4;
  });
}

function getLineNumberForPc(pc: number): number | null {
  return pcToLine.get(pc) ?? null;
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

function reinitialize(): boolean {
  buildPcToLineMap(source);
  instance = makeMipsfromSource(source);
  const result = instance.assemble();
  if (result.hasErrors) return false;
  instance.initialize(true);
  registerHandlers(instance);
  inputCursor = 0;
  return true;
}

function runLoop(): SimulatorState {
  isBlockedForInput = false;
  while (!instance.terminated && !isBlockedForInput) {
    instance.step();
  }
  return getState();
}

export function assemble(src: string) {
  source = src;
  buildPcToLineMap(source);
  outputBuffer = '';
  allInputs = [];
  inputCursor = 0;
  isBlockedForInput = false;

  instance = makeMipsfromSource(source);
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
  };
}

export function runSim(): SimulatorState {
  if (!source || instance.terminated) return getState();
  return runLoop();
}

export function stepSim(): SimulatorState {
  if (instance.terminated) return getState();
  isBlockedForInput = false;
  instance.step();
  return getState();
}

export function feedInput(rawInput: string): SimulatorState {
  const tokens = rawInput.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return getState();

  allInputs.push(...tokens);
  const previousOutput = outputBuffer;
  outputBuffer = '';

  if (!reinitialize()) return getState();

  const state = runLoop();
  if (outputBuffer === '' && previousOutput !== '') outputBuffer = previousOutput;
  return state;
}

export function resetSim() {
  source = '';
  pcToLine = new Map<number, number>();
  outputBuffer = '';
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
