# WIMPS

### The Web Interactive MIPS Pocket Simulator

WIMPS is a browser-based MIPS assembly simulator built for CS students who shouldn't need to download a 20+ year old Java program just to study computer architecture. Write, assemble, step through, and debug MIPS programs directly in your browser — no install required.

It supports the same instruction set and syscalls as MARS, runs in any modern browser, and works on desktop, tablet, and mobile.

---

### Basic Usage

Write MIPS assembly in the editor, then hit **Assemble** (⚙) in the toolbar. Errors land in the Console immediately. Once your code compiles, the run controls turn blue:

- **Run (▶)** — starts a fresh execution from the top and stops at the first breakpoint, or runs to the end.
- **Continue (⏭)** — resumes from wherever you're paused to the next breakpoint or the end.
- **Step (→)** — executes one instruction at a time. The active line is highlighted in the editor.
- **Step Back (←)** — undoes the last instruction. Registers revert and any output it produced disappears.
- **Reset (↺)** — clears execution state and output. Breakpoints are preserved.

To place a breakpoint, click any line number in the gutter. A red dot appears on that line. Click again to remove it.

Output from `syscall` appears in the Console panel. When a read syscall fires, the console goes interactive — type your input and press Enter. All register and memory state updates in real time in the right panels.

Files auto-save to browser storage. Sign in to sync to the cloud so you never lose work across sessions or devices.

---

## Features

- **Full MIPS Instruction Set** — R-type, I-type, J-type, and the pseudo-instructions MARS supports.
- **Breakpoint debugging** — click a line number to place a breakpoint (red dot). Run stops at the first one it hits; Continue advances to the next.
- **Step Back / Rewind** — undo the last instruction, including any output it produced. Works for however many instructions you've explicitly stepped through.
- **Live Register View** — all 32 registers update after every step or run. Toggle between hex and decimal at any time.
- **Memory Inspector** — shows 32 words of the data segment starting at 0x10010000, updated after every step or run.
- **Tabbed Editor** — open and edit multiple `.asm` files simultaneously. Double-click a tab to rename it.
- **File Upload & Download** — import `.asm`, `.s`, or `.txt` files from disk, and export them back at any time.
- **Cloud Sync** — sign in to back up up to 15 files (1 MB each) to a personal account, accessible from any device. Delete individual files from the account via the trash icon that appears on tab hover.
- **Console I/O** — full program output in the console. Programs that read input pause and wait for you to type.
- **Syntax Highlighting** — instructions, registers, directives, labels, and comments each get their own color.
- **Resizable Panels** — drag the dividers between the editor, console, and register/memory panels to fit your screen.
- **Dark & Light Mode** — persistent theme toggle on every page.

---

## Planned

- Better runtime error messages with more detail on what went wrong
- MARS-style extra tools: Bitmap Display, Data Cache Simulator
- Expanded cloud storage

---

## Account & File Storage

**Guest (no account):** Files are saved automatically to browser localStorage. Convenient for quick sessions, but clearing browser data or switching devices will lose them.

**Signed in:** Files sync to a personal account in the cloud. Up to 15 files, 1 MB each. Press the 💾 Save button in the toolbar to push the current state. To delete a file from your account, hover over its tab — a red trash icon appears.

---

## Technologies

- **Frontend:** React + TypeScript, bundled with Vite
- **Simulator:** [`@specy/mips`](https://github.com/Specy/mars) — an open-source MIPS simulator
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

The app will be available at `http://localhost:5173` by default.

---

## License

WIMPS is open source under the MIT License.
