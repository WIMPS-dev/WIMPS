# WIMPS

![WIMPS logo](public/favicon.svg)

### The Web Interactive MIPS Playground & Simulator

WIMPS is a browser-based MIPS assembly simulator built for CS students who shouldn't need to download a 20-year-old Java program just to study computer architecture. Write, assemble, step through, and debug MIPS programs in your browser. No install required.

It supports the same instruction set and syscalls as MARS, runs in any modern browser, and works on desktop, tablet, and mobile.

Visit the WIMPS at [wimps.dev](https://wimps.dev)
---

### Basic Usage

Write MIPS assembly in the editor, then hit **Assemble** (⚙) in the toolbar. Errors land in the Console. Once your code assembles, the run controls turn blue:

- **Run (▶):** starts a fresh execution from the top and stops at the first breakpoint, or runs to the end.
- **Continue (⏭):** resumes from wherever you're paused to the next breakpoint or the end.
- **Step (→):** executes one instruction at a time. The editor highlights the active line.
- **Step Back (←):** undoes the last instruction. Registers revert and any output it produced disappears.
- **Reset (↺):** clears execution state and output. Breakpoints survive.

To place a breakpoint, click any line number in the gutter. A red dot appears on that line. Click again to remove it.

Output from `syscall` appears in the Console panel. When a read syscall fires, a cursor appears. Type your input and press Enter. Register and memory state update in the right panels after each step.

Files auto-save to browser storage. Sign in to sync to the cloud and keep your work across sessions and devices.

---

## Features

- **Full MIPS Instruction Set:** R-type, I-type, J-type, and the pseudo-instructions MARS supports.
- **Breakpoint Debugging:** Click a line number to place a breakpoint (red dot). Run stops at the first one; Continue advances to the next.
- **Step Back / Rewind:** Undo the last instruction, including any output it produced. Works for however many instructions you've stepped through.
- **Live Register View:** All 32 registers update after every step or run. Toggle between hex and decimal at any time.
- **Memory Inspector:** Shows 32 words of the data segment starting at 0x10010000, updated after every step or run.
- **Bitmap Display:** Memory-mapped pixel canvas. Write 32-bit color words (`0x00RRGGBB`) to memory and the display updates. Configurable base address, canvas size, and zoom. Matches MARS Bitmap Display format.
- **Instruction Statistics:** Per-category counts (arithmetic, logic, memory, branch, jump, syscall) across the full execution. Bar chart with percentages.
- **Tabbed Editor:** Open and edit multiple `.asm` files. Double-click a tab to rename it.
- **File Upload & Download:** Import `.asm`, `.s`, or `.txt` files from disk and export them.
- **File Manager:** Browse cloud files, locally saved files, and built-in examples from the Files drawer. Works for guests and signed-in users.
- **Cloud Sync:** Sign in to back up files to a personal account (1 MB total). Access from any device.
- **Console I/O:** Full program output in the console. Programs that need input pause and wait for you to type.
- **Syntax Highlighting:** Instructions, registers, directives, labels, and comments each get their own color.
- **Resizable Panels:** Drag the dividers between editor, console, and register/memory panels to fit your screen.
- **Dark & Light Mode:** Persistent theme toggle on every page.

---

## Planned

- Better runtime error messages with more detail on what went wrong
- Expanded cloud storage

---

## Account & File Storage

**Guest (no account):** WIMPS writes files to browser localStorage on every change. Clear browser data or switch devices and they're gone.

**Signed in:** Files sync to a personal account (1 MB total). Press 💾 in the toolbar to push the current state. Hover over a tab to reveal a red trash icon and delete the file from your account.

---

## Technologies

- **Frontend:** React + TypeScript, bundled with Vite
- **Simulator:** [`@specy/mips`](https://github.com/Specy/mars), an open-source MIPS simulator
- **Backend:** Node.js + Express, MongoDB via Mongoose

---

## Self-Hosting

```bash
# Install all dependencies
npm install && npm --prefix backend install
```

Create `backend/.env`:

```
MONGO_URI=mongodb+srv://user:password@cluster/dbname
JWT_SECRET=your_secret_here
```

Create `.env` in the project root:

```
VITE_API_URL=http://localhost:3001
```

Run the backend (one terminal):

```bash
node backend/server.js
```

Run the frontend dev server (another terminal):

```bash
npm run dev
```

The app runs at `http://localhost:5173`.

---

## License

WIMPS is open source under the MIT License.
