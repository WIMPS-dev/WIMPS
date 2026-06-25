export type SyntaxTokenType =
  | "instruction"
  | "register"
  | "number"
  | "label"
  | "comment"
  | "string"
  | "directive"
  | "text";

export type SyntaxToken = {
  text: string;
  type: SyntaxTokenType;
};

// ---------------------------------------------------------------------------
// Canonical reference tables (single source of truth for docs + highlighter)
// ---------------------------------------------------------------------------

export interface InstructionDoc {
  syntax: string;
  mnemonic: string;
  type: 'R' | 'I' | 'J' | 'P';
  category: string;
  desc: string;
  example?: string;
}

export interface SyscallDoc {
  code: string;
  args: string;
  ret?: string;
  desc: string;
}

export interface RegisterDoc {
  name: string;
  number: string;
  convention: string;
}

export interface DirectiveDoc {
  directive: string;
  desc: string;
  example?: string;
}

export const INSTRUCTIONS: InstructionDoc[] = [
  // ── Arithmetic ────────────────────────────────────────────────────────────
  { syntax: 'add $d,$s,$t',     mnemonic: 'add',    type: 'R', category: 'arithmetic', desc: 'Signed addition; traps on overflow',           example: 'add $t0,$t1,$t2' },
  { syntax: 'addu $d,$s,$t',    mnemonic: 'addu',   type: 'R', category: 'arithmetic', desc: 'Unsigned addition; no overflow trap',           example: 'addu $t0,$t1,$t2' },
  { syntax: 'addi $t,$s,imm',   mnemonic: 'addi',   type: 'I', category: 'arithmetic', desc: 'Add sign-extended 16-bit immediate',            example: 'addi $t0,$t1,5' },
  { syntax: 'addiu $t,$s,imm',  mnemonic: 'addiu',  type: 'I', category: 'arithmetic', desc: 'Add immediate, no overflow trap',               example: 'addiu $sp,$sp,-8' },
  { syntax: 'sub $d,$s,$t',     mnemonic: 'sub',    type: 'R', category: 'arithmetic', desc: 'Signed subtraction; traps on overflow',         example: 'sub $t0,$t1,$t2' },
  { syntax: 'subu $d,$s,$t',    mnemonic: 'subu',   type: 'R', category: 'arithmetic', desc: 'Unsigned subtraction; no overflow trap',        example: 'subu $t0,$t1,$t2' },
  { syntax: 'mul $d,$s,$t',     mnemonic: 'mul',    type: 'R', category: 'arithmetic', desc: 'Multiply; lower 32 bits to $d (pseudo)',        example: 'mul $t0,$t1,$t2' },
  { syntax: 'mulo $d,$s,$t',    mnemonic: 'mulo',   type: 'P', category: 'arithmetic', desc: 'Multiply; trap if result overflows 32 bits (pseudo)', example: 'mulo $t0,$t1,$t2' },
  { syntax: 'mulou $d,$s,$t',   mnemonic: 'mulou',  type: 'P', category: 'arithmetic', desc: 'Unsigned multiply; trap on overflow (pseudo)',  example: 'mulou $t0,$t1,$t2' },
  { syntax: 'mult $s,$t',       mnemonic: 'mult',   type: 'R', category: 'arithmetic', desc: 'Signed 32×32 multiply; 64-bit result → HI:LO', example: 'mult $t1,$t2' },
  { syntax: 'multu $s,$t',      mnemonic: 'multu',  type: 'R', category: 'arithmetic', desc: 'Unsigned 32×32 multiply → HI:LO',              example: 'multu $t1,$t2' },
  { syntax: 'div $s,$t',        mnemonic: 'div',    type: 'R', category: 'arithmetic', desc: 'Signed divide; quotient → LO, remainder → HI', example: 'div $t1,$t2' },
  { syntax: 'divu $s,$t',       mnemonic: 'divu',   type: 'R', category: 'arithmetic', desc: 'Unsigned divide; quotient → LO, rem → HI',     example: 'divu $t1,$t2' },
  { syntax: 'rem $d,$s,$t',     mnemonic: 'rem',    type: 'P', category: 'arithmetic', desc: 'Signed remainder: $d = $s % $t (pseudo)',       example: 'rem $t0,$t1,$t2' },
  { syntax: 'remu $d,$s,$t',    mnemonic: 'remu',   type: 'P', category: 'arithmetic', desc: 'Unsigned remainder (pseudo)',                   example: 'remu $t0,$t1,$t2' },
  { syntax: 'mfhi $d',          mnemonic: 'mfhi',   type: 'R', category: 'arithmetic', desc: 'Move HI register to $d',                       example: 'div $t1,$t2  # then: mfhi $t0' },
  { syntax: 'mflo $d',          mnemonic: 'mflo',   type: 'R', category: 'arithmetic', desc: 'Move LO register to $d',                       example: 'mult $t1,$t2  # then: mflo $t0' },
  { syntax: 'mthi $s',          mnemonic: 'mthi',   type: 'R', category: 'arithmetic', desc: 'Move $s to HI register',                       example: 'mthi $t0' },
  { syntax: 'mtlo $s',          mnemonic: 'mtlo',   type: 'R', category: 'arithmetic', desc: 'Move $s to LO register',                       example: 'mtlo $t0' },
  { syntax: 'neg $d,$s',        mnemonic: 'neg',    type: 'P', category: 'arithmetic', desc: 'Negate: $d = −$s; traps on overflow (pseudo)', example: 'neg $t0,$t1' },
  { syntax: 'negu $d,$s',       mnemonic: 'negu',   type: 'P', category: 'arithmetic', desc: 'Negate without overflow trap (pseudo)',         example: 'negu $t0,$t1' },
  { syntax: 'abs $d,$s',        mnemonic: 'abs',    type: 'P', category: 'arithmetic', desc: 'Absolute value: $d = |$s| (pseudo)',            example: 'abs $t0,$t1' },

  // ── Logic ─────────────────────────────────────────────────────────────────
  { syntax: 'and $d,$s,$t',     mnemonic: 'and',    type: 'R', category: 'logic', desc: 'Bitwise AND',                                     example: 'and $t0,$t1,$t2' },
  { syntax: 'andi $t,$s,imm',   mnemonic: 'andi',   type: 'I', category: 'logic', desc: 'Bitwise AND with zero-extended 16-bit immediate', example: 'andi $t0,$t1,0xFF' },
  { syntax: 'or $d,$s,$t',      mnemonic: 'or',     type: 'R', category: 'logic', desc: 'Bitwise OR',                                      example: 'or $t0,$t1,$t2' },
  { syntax: 'ori $t,$s,imm',    mnemonic: 'ori',    type: 'I', category: 'logic', desc: 'Bitwise OR with zero-extended immediate',          example: 'ori $t0,$t1,0x8000' },
  { syntax: 'xor $d,$s,$t',     mnemonic: 'xor',    type: 'R', category: 'logic', desc: 'Bitwise XOR',                                     example: 'xor $t0,$t1,$t2' },
  { syntax: 'xori $t,$s,imm',   mnemonic: 'xori',   type: 'I', category: 'logic', desc: 'Bitwise XOR with zero-extended immediate',         example: 'xori $t0,$t0,0xFF' },
  { syntax: 'nor $d,$s,$t',     mnemonic: 'nor',    type: 'R', category: 'logic', desc: 'Bitwise NOR: $d = ~($s | $t)',                    example: 'nor $t0,$t1,$zero' },
  { syntax: 'not $d,$s',        mnemonic: 'not',    type: 'P', category: 'logic', desc: 'Bitwise NOT: $d = ~$s (pseudo for nor $d,$s,$zero)', example: 'not $t0,$t1' },

  // ── Shifts ────────────────────────────────────────────────────────────────
  { syntax: 'sll $d,$t,sa',     mnemonic: 'sll',    type: 'R', category: 'shift', desc: 'Shift left logical by immediate amount sa (0–31)',   example: 'sll $t0,$t1,2' },
  { syntax: 'srl $d,$t,sa',     mnemonic: 'srl',    type: 'R', category: 'shift', desc: 'Shift right logical (zero-fill) by sa',              example: 'srl $t0,$t1,1' },
  { syntax: 'sra $d,$t,sa',     mnemonic: 'sra',    type: 'R', category: 'shift', desc: 'Shift right arithmetic (sign-extend) by sa',         example: 'sra $t0,$t1,1' },
  { syntax: 'sllv $d,$t,$s',    mnemonic: 'sllv',   type: 'R', category: 'shift', desc: 'Shift left logical by amount in $s (low 5 bits)',    example: 'sllv $t0,$t1,$t2' },
  { syntax: 'srlv $d,$t,$s',    mnemonic: 'srlv',   type: 'R', category: 'shift', desc: 'Shift right logical, variable',                      example: 'srlv $t0,$t1,$t2' },
  { syntax: 'srav $d,$t,$s',    mnemonic: 'srav',   type: 'R', category: 'shift', desc: 'Shift right arithmetic, variable',                   example: 'srav $t0,$t1,$t2' },
  { syntax: 'rol $d,$s,$t',     mnemonic: 'rol',    type: 'P', category: 'shift', desc: 'Rotate left (pseudo)',                               example: 'rol $t0,$t1,$t2' },
  { syntax: 'ror $d,$s,$t',     mnemonic: 'ror',    type: 'P', category: 'shift', desc: 'Rotate right (pseudo)',                              example: 'ror $t0,$t1,$t2' },

  // ── Comparison ────────────────────────────────────────────────────────────
  { syntax: 'slt $d,$s,$t',     mnemonic: 'slt',    type: 'R', category: 'comparison', desc: 'Set $d = 1 if $s < $t (signed), else 0',        example: 'slt $t0,$t1,$t2' },
  { syntax: 'sltu $d,$s,$t',    mnemonic: 'sltu',   type: 'R', category: 'comparison', desc: 'Set $d = 1 if $s < $t (unsigned), else 0',      example: 'sltu $t0,$t1,$t2' },
  { syntax: 'slti $t,$s,imm',   mnemonic: 'slti',   type: 'I', category: 'comparison', desc: 'Set $t = 1 if $s < sign-extended imm',          example: 'slti $t0,$t1,10' },
  { syntax: 'sltiu $t,$s,imm',  mnemonic: 'sltiu',  type: 'I', category: 'comparison', desc: 'Set $t = 1 if $s < imm (unsigned)',             example: 'sltiu $t0,$t1,10' },
  { syntax: 'seq $d,$s,$t',     mnemonic: 'seq',    type: 'P', category: 'comparison', desc: 'Set $d = 1 if $s == $t (pseudo)',               example: 'seq $t0,$t1,$t2' },
  { syntax: 'sne $d,$s,$t',     mnemonic: 'sne',    type: 'P', category: 'comparison', desc: 'Set $d = 1 if $s != $t (pseudo)',               example: 'sne $t0,$t1,$t2' },
  { syntax: 'sgt $d,$s,$t',     mnemonic: 'sgt',    type: 'P', category: 'comparison', desc: 'Set $d = 1 if $s > $t signed (pseudo)',         example: 'sgt $t0,$t1,$t2' },
  { syntax: 'sgtu $d,$s,$t',    mnemonic: 'sgtu',   type: 'P', category: 'comparison', desc: 'Set $d = 1 if $s > $t unsigned (pseudo)',       example: 'sgtu $t0,$t1,$t2' },
  { syntax: 'sge $d,$s,$t',     mnemonic: 'sge',    type: 'P', category: 'comparison', desc: 'Set $d = 1 if $s >= $t signed (pseudo)',        example: 'sge $t0,$t1,$t2' },
  { syntax: 'sgeu $d,$s,$t',    mnemonic: 'sgeu',   type: 'P', category: 'comparison', desc: 'Set $d = 1 if $s >= $t unsigned (pseudo)',      example: 'sgeu $t0,$t1,$t2' },
  { syntax: 'sle $d,$s,$t',     mnemonic: 'sle',    type: 'P', category: 'comparison', desc: 'Set $d = 1 if $s <= $t signed (pseudo)',        example: 'sle $t0,$t1,$t2' },
  { syntax: 'sleu $d,$s,$t',    mnemonic: 'sleu',   type: 'P', category: 'comparison', desc: 'Set $d = 1 if $s <= $t unsigned (pseudo)',      example: 'sleu $t0,$t1,$t2' },

  // ── Memory ────────────────────────────────────────────────────────────────
  { syntax: 'lw $t,off($s)',    mnemonic: 'lw',     type: 'I', category: 'memory', desc: 'Load 32-bit word from memory at $s + offset',      example: 'lw $t0,0($sp)' },
  { syntax: 'sw $t,off($s)',    mnemonic: 'sw',     type: 'I', category: 'memory', desc: 'Store 32-bit word to memory at $s + offset',       example: 'sw $ra,4($sp)' },
  { syntax: 'lh $t,off($s)',    mnemonic: 'lh',     type: 'I', category: 'memory', desc: 'Load halfword (16 bits), sign-extended to 32',     example: 'lh $t0,2($s0)' },
  { syntax: 'lhu $t,off($s)',   mnemonic: 'lhu',    type: 'I', category: 'memory', desc: 'Load halfword, zero-extended to 32',               example: 'lhu $t0,2($s0)' },
  { syntax: 'sh $t,off($s)',    mnemonic: 'sh',     type: 'I', category: 'memory', desc: 'Store low 16 bits of $t to memory',                example: 'sh $t0,2($s0)' },
  { syntax: 'lb $t,off($s)',    mnemonic: 'lb',     type: 'I', category: 'memory', desc: 'Load byte, sign-extended to 32 bits',              example: 'lb $t0,0($s0)' },
  { syntax: 'lbu $t,off($s)',   mnemonic: 'lbu',    type: 'I', category: 'memory', desc: 'Load byte, zero-extended to 32 bits',              example: 'lbu $t0,0($s0)' },
  { syntax: 'sb $t,off($s)',    mnemonic: 'sb',     type: 'I', category: 'memory', desc: 'Store low 8 bits of $t to memory',                 example: 'sb $t0,0($s0)' },
  { syntax: 'lui $t,imm',       mnemonic: 'lui',    type: 'I', category: 'memory', desc: 'Load 16-bit immediate into upper 16 bits of $t; lower 16 set to zero', example: 'lui $t0,0x1001' },
  { syntax: 'la $t,label',      mnemonic: 'la',     type: 'P', category: 'memory', desc: 'Load address of label into $t (pseudo)',           example: 'la $a0,myArray' },
  { syntax: 'li $t,imm',        mnemonic: 'li',     type: 'P', category: 'memory', desc: 'Load 32-bit immediate into $t (pseudo)',            example: 'li $v0,4' },

  // ── Branches ──────────────────────────────────────────────────────────────
  { syntax: 'beq $s,$t,lbl',    mnemonic: 'beq',    type: 'I', category: 'branch', desc: 'Branch to lbl if $s == $t',                        example: 'beq $t0,$t1,equal' },
  { syntax: 'bne $s,$t,lbl',    mnemonic: 'bne',    type: 'I', category: 'branch', desc: 'Branch to lbl if $s != $t',                        example: 'bne $t0,$zero,loop' },
  { syntax: 'beqz $s,lbl',      mnemonic: 'beqz',   type: 'P', category: 'branch', desc: 'Branch if $s == 0 (pseudo)',                       example: 'beqz $t0,done' },
  { syntax: 'bnez $s,lbl',      mnemonic: 'bnez',   type: 'P', category: 'branch', desc: 'Branch if $s != 0 (pseudo)',                       example: 'bnez $t0,loop' },
  { syntax: 'bltz $s,lbl',      mnemonic: 'bltz',   type: 'I', category: 'branch', desc: 'Branch if $s < 0',                                 example: 'bltz $t0,negative' },
  { syntax: 'bgtz $s,lbl',      mnemonic: 'bgtz',   type: 'I', category: 'branch', desc: 'Branch if $s > 0',                                 example: 'bgtz $t0,positive' },
  { syntax: 'blez $s,lbl',      mnemonic: 'blez',   type: 'I', category: 'branch', desc: 'Branch if $s <= 0',                                example: 'blez $t0,nonpos' },
  { syntax: 'bgez $s,lbl',      mnemonic: 'bgez',   type: 'I', category: 'branch', desc: 'Branch if $s >= 0',                                example: 'bgez $t0,nonneg' },
  { syntax: 'bltzal $s,lbl',    mnemonic: 'bltzal', type: 'I', category: 'branch', desc: 'Branch if $s < 0 and link: $ra = PC+4',            example: 'bltzal $t0,func' },
  { syntax: 'bgezal $s,lbl',    mnemonic: 'bgezal', type: 'I', category: 'branch', desc: 'Branch if $s >= 0 and link: $ra = PC+4',           example: 'bgezal $t0,func' },
  { syntax: 'blt $s,$t,lbl',    mnemonic: 'blt',    type: 'P', category: 'branch', desc: 'Branch if $s < $t signed (pseudo)',                example: 'blt $t0,$t1,less' },
  { syntax: 'bgt $s,$t,lbl',    mnemonic: 'bgt',    type: 'P', category: 'branch', desc: 'Branch if $s > $t signed (pseudo)',                example: 'bgt $t0,$t1,greater' },
  { syntax: 'ble $s,$t,lbl',    mnemonic: 'ble',    type: 'P', category: 'branch', desc: 'Branch if $s <= $t signed (pseudo)',               example: 'ble $t0,$t1,leq' },
  { syntax: 'bge $s,$t,lbl',    mnemonic: 'bge',    type: 'P', category: 'branch', desc: 'Branch if $s >= $t signed (pseudo)',               example: 'bge $t0,$t1,geq' },
  { syntax: 'bltu $s,$t,lbl',   mnemonic: 'bltu',   type: 'P', category: 'branch', desc: 'Branch if $s < $t unsigned (pseudo)',              example: 'bltu $t0,$t1,less' },
  { syntax: 'bgtu $s,$t,lbl',   mnemonic: 'bgtu',   type: 'P', category: 'branch', desc: 'Branch if $s > $t unsigned (pseudo)',              example: 'bgtu $t0,$t1,greater' },
  { syntax: 'bleu $s,$t,lbl',   mnemonic: 'bleu',   type: 'P', category: 'branch', desc: 'Branch if $s <= $t unsigned (pseudo)',             example: 'bleu $t0,$t1,leq' },
  { syntax: 'bgeu $s,$t,lbl',   mnemonic: 'bgeu',   type: 'P', category: 'branch', desc: 'Branch if $s >= $t unsigned (pseudo)',             example: 'bgeu $t0,$t1,geq' },
  { syntax: 'b lbl',            mnemonic: 'b',      type: 'P', category: 'branch', desc: 'Unconditional branch (pseudo for beq $zero,$zero,lbl)', example: 'b loop' },

  // ── Jumps ─────────────────────────────────────────────────────────────────
  { syntax: 'j label',          mnemonic: 'j',      type: 'J', category: 'jump', desc: 'Unconditional jump to label (must be in same 256 MB region)', example: 'j main' },
  { syntax: 'jal label',        mnemonic: 'jal',    type: 'J', category: 'jump', desc: 'Jump and link: $ra = PC+4, then jump',             example: 'jal myFunc' },
  { syntax: 'jr $s',            mnemonic: 'jr',     type: 'R', category: 'jump', desc: 'Jump to address in register $s',                   example: 'jr $ra' },
  { syntax: 'jalr $s',          mnemonic: 'jalr',   type: 'R', category: 'jump', desc: 'Jump to $s and link: $ra = PC+4',                  example: 'jalr $t9' },

  // ── System ────────────────────────────────────────────────────────────────
  { syntax: 'syscall',          mnemonic: 'syscall',type: 'R', category: 'system', desc: 'OS call — behavior determined by $v0',            example: 'li $v0,1  # then: syscall' },
  { syntax: 'break n',          mnemonic: 'break',  type: 'R', category: 'system', desc: 'Trigger a breakpoint trap with code n',           example: 'break 0' },
  { syntax: 'nop',              mnemonic: 'nop',    type: 'P', category: 'system', desc: 'No operation (pseudo for sll $zero,$zero,0)',     example: 'nop' },

  // ── Pseudo misc ───────────────────────────────────────────────────────────
  { syntax: 'move $d,$s',       mnemonic: 'move',   type: 'P', category: 'pseudo', desc: 'Copy $s into $d (pseudo for addu $d,$s,$zero)',  example: 'move $s0,$v0' },
];

export const SYSCALLS: SyscallDoc[] = [
  { code: '1',  args: '$a0 = integer',         ret: '—',           desc: 'Print integer to console' },
  { code: '2',  args: '$f12 = float',          ret: '—',           desc: 'Print single-precision float' },
  { code: '3',  args: '$f12 = double',         ret: '—',           desc: 'Print double-precision float' },
  { code: '4',  args: '$a0 = string address',  ret: '—',           desc: 'Print null-terminated string' },
  { code: '5',  args: '—',                     ret: '$v0 = int',   desc: 'Read integer from console' },
  { code: '6',  args: '—',                     ret: '$f0 = float', desc: 'Read float from console' },
  { code: '7',  args: '—',                     ret: '$f0 = double',desc: 'Read double from console' },
  { code: '8',  args: '$a0 = buffer addr, $a1 = max length', ret: '—', desc: 'Read string into buffer (null-terminated, truncated to $a1−1 chars)' },
  { code: '9',  args: '$a0 = byte count',      ret: '$v0 = address',desc: 'Allocate heap memory (sbrk); returns pointer to new block' },
  { code: '10', args: '—',                     ret: '—',           desc: 'Exit program normally' },
  { code: '11', args: '$a0 = char (ASCII)',     ret: '—',           desc: 'Print character to console' },
  { code: '12', args: '—',                     ret: '$v0 = char',  desc: 'Read single character from console' },
  { code: '17', args: '$a0 = exit code',        ret: '—',           desc: 'Exit with a specific integer code' },
  { code: '34', args: '$a0 = integer',          ret: '—',           desc: 'Print integer in hexadecimal (0x prefix)' },
  { code: '35', args: '$a0 = integer',          ret: '—',           desc: 'Print integer in binary (leading zeros to 32 bits)' },
  { code: '36', args: '$a0 = integer',          ret: '—',           desc: 'Print integer as unsigned decimal' },
];

export const REGISTERS: RegisterDoc[] = [
  { name: '$zero / $0', number: '0',       convention: 'Always zero. Writes are silently discarded.' },
  { name: '$at / $1',   number: '1',       convention: 'Reserved for the assembler. Do not use directly.' },
  { name: '$v0 / $2',   number: '2',       convention: 'Return value (low word) and syscall code.' },
  { name: '$v1 / $3',   number: '3',       convention: 'Return value (high word, rarely used).' },
  { name: '$a0 / $4',   number: '4',       convention: 'Function argument 0. Also used for syscall arguments.' },
  { name: '$a1 / $5',   number: '5',       convention: 'Function argument 1.' },
  { name: '$a2 / $6',   number: '6',       convention: 'Function argument 2.' },
  { name: '$a3 / $7',   number: '7',       convention: 'Function argument 3.' },
  { name: '$t0–$t7',    number: '8–15',    convention: 'Temporaries. Caller-saved — a callee may overwrite these freely.' },
  { name: '$s0–$s7',    number: '16–23',   convention: 'Saved temporaries. Callee-saved — must be preserved across calls.' },
  { name: '$t8–$t9',    number: '24–25',   convention: 'Additional temporaries. Caller-saved.' },
  { name: '$k0–$k1',    number: '26–27',   convention: 'Reserved for the OS kernel. Never use in user programs.' },
  { name: '$gp / $28',  number: '28',      convention: 'Global pointer. Points into the middle of the static data area.' },
  { name: '$sp / $29',  number: '29',      convention: 'Stack pointer. Always points to the top of the stack. Decrement before use.' },
  { name: '$fp / $30',  number: '30',      convention: 'Frame pointer. Optional; marks the base of the current stack frame.' },
  { name: '$ra / $31',  number: '31',      convention: 'Return address. Set by jal and jalr; used by jr $ra to return from a function.' },
];

export const DIRECTIVES: DirectiveDoc[] = [
  { directive: '.data',          desc: 'Begin the data segment. Labels and allocations here go to static memory.',        example: '.data' },
  { directive: '.text',          desc: 'Begin the code segment. All executable instructions go here.',                    example: '.text' },
  { directive: '.globl label',   desc: 'Declare label as globally visible (required for main).',                           example: '.globl main' },
  { directive: '.word n[,n…]',   desc: 'Allocate one or more 32-bit words, separated by commas.',                        example: 'arr: .word 1,2,3,4' },
  { directive: '.half n[,n…]',   desc: 'Allocate one or more 16-bit halfwords.',                                          example: 'vals: .half 100,200' },
  { directive: '.byte n[,n…]',   desc: 'Allocate one or more bytes.',                                                    example: 'flags: .byte 0,1,0,1' },
  { directive: '.ascii "s"',     desc: 'Store a string without a null terminator.',                                       example: '.ascii "hello"' },
  { directive: '.asciiz "s"',    desc: 'Store a null-terminated string. Use \\n for newline, \\t for tab.',              example: 'msg: .asciiz "hello\\n"' },
  { directive: '.float n',       desc: 'Allocate a 32-bit single-precision float.',                                       example: 'pi: .float 3.14159' },
  { directive: '.double n',      desc: 'Allocate a 64-bit double-precision float.',                                       example: 'e: .double 2.71828' },
  { directive: '.space n',       desc: 'Allocate n bytes of zero-filled space.',                                          example: 'buf: .space 64' },
  { directive: '.align n',       desc: 'Align the next datum to a 2ⁿ-byte boundary. .align 2 = 4-byte align.',          example: '.align 2' },
  { directive: '.eqv name,val',  desc: 'Define a symbolic constant (like #define in C). Replaced at assembly time.',     example: '.eqv SIZE 100' },
];

// Flat lists for autocomplete + syntax highlighting (derived from canonical tables)
export const INSTRUCTION_LIST: string[] = INSTRUCTIONS.map(i => i.mnemonic);
export const DIRECTIVE_LIST: string[] = DIRECTIVES.map(d => d.directive.split(' ')[0]);
export const REGISTER_LIST: string[] = [
  '$zero', '$0',
  '$at',
  '$v0', '$v1',
  '$a0', '$a1', '$a2', '$a3',
  '$t0', '$t1', '$t2', '$t3', '$t4', '$t5', '$t6', '$t7',
  '$s0', '$s1', '$s2', '$s3', '$s4', '$s5', '$s6', '$s7',
  '$t8', '$t9',
  '$k0', '$k1',
  '$gp', '$sp', '$fp', '$ra',
];

// Instruction groups (for docs page grouped display)
export const INSTRUCTION_CATEGORIES: { label: string; key: string }[] = [
  { key: 'arithmetic',  label: 'Arithmetic' },
  { key: 'logic',       label: 'Logic' },
  { key: 'shift',       label: 'Shifts' },
  { key: 'comparison',  label: 'Comparison' },
  { key: 'memory',      label: 'Memory' },
  { key: 'branch',      label: 'Branches' },
  { key: 'jump',        label: 'Jumps & Calls' },
  { key: 'system',      label: 'System' },
  { key: 'pseudo',      label: 'Pseudo — misc' },
];

// ---------------------------------------------------------------------------
// Tokenizer sets (derived from canonical tables above)
// ---------------------------------------------------------------------------

const instructions = new Set(INSTRUCTION_LIST);
const registers = new Set(REGISTER_LIST);

export function tokenizeMipsLine(line: string): SyntaxToken[] {
  const commentIndex = line.indexOf("#");
  const code = commentIndex >= 0 ? line.slice(0, commentIndex) : line;
  const comment = commentIndex >= 0 ? line.slice(commentIndex) : "";

  const tokens: SyntaxToken[] = [];

  const regex =
    /("[^"]*"|'[^']*'|\.[A-Za-z_]\w*|\$[A-Za-z0-9]+|-?0x[0-9a-fA-F]+|-?\d+|[A-Za-z_]\w*:|[A-Za-z_]\w*|\s+|.)/g;

  for (const match of code.matchAll(regex)) {
    const text = match[0];
    const lower = text.toLowerCase();

    if (/^\s+$/.test(text)) {
      tokens.push({ text, type: "text" });
    } else if (/^["']/.test(text)) {
      tokens.push({ text, type: "string" });
    } else if (instructions.has(lower)) {
      tokens.push({ text, type: "instruction" });
    } else if (registers.has(lower)) {
      tokens.push({ text, type: "register" });
    } else if (/^\.[A-Za-z_]\w*$/.test(text)) {
      tokens.push({ text, type: "directive" });
    } else if (/^[A-Za-z_]\w*:$/.test(text)) {
      tokens.push({ text, type: "label" });
    } else if (/^-?(0x[0-9a-fA-F]+|\d+)$/.test(text)) {
      tokens.push({ text, type: "number" });
    } else {
      tokens.push({ text, type: "text" });
    }
  }

  if (comment) {
    tokens.push({ text: comment, type: "comment" });
  }

  return tokens;
}

const escapeHtml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

export function highlightMipsCode(
  code: string,
  colors: Record<SyntaxTokenType, string>
) {
  return code
    .split('\n')
    .map((line) =>
      tokenizeMipsLine(line)
        .map((token) => {
          const color = colors[token.type] ?? colors.text;
          return `<span style="color:${color}">${escapeHtml(token.text)}</span>`;
        })
        .join('')
    )
    .join('\n');
}
