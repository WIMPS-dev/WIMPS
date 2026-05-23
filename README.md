# WIMPS

### The Web Interactive MIPS Pocket Simulator

WIMPS is a browser-based MIPS assembly simulator built for CS students who shouldn't need to download a 20+ year old Java program just to learn computer architecture. Write, assemble, and step through, MIPS programs directly in your browser.

WIMPS is designed for convenience as a modern, accessible alternative to MARS, supporting the same instruction set and syscalls, while running natively on desktop, tablet, and mobile.

---

### Basic Usage

Write MIPS Asssembly code in the Code Editor, open the floating dropdown menu on the editor, and click the hammer icon to assemble it. Then, to execute your code, click the arrow icon to run it. Any output will appear in the Console, and the execution will pause if the program is waiting for input, which can be typed directly in the console.

To step through  your program, assemble it, then click the step icon, which will highlight the line that is currently being executed. Register and memory values will update in real time.

Any files and their contents are automatically saved into browser data. If you plan to use WIMPS long term, it is recommended to create an account, which will save your files into our backend server, so you never lose them!

If you're tired of your current color scheme, or it doesn't fit your current lighting situation, change your site theme using the switch in the top right. This change will persist across pages.

Need a refresher, or new to MIPS? No problem. Visit the documentation page for a fuzzy-searchable MIPS manual that includes instructions, convention, and a tester program.

---

## Feature List

- **Full MIPS Instruction Set:** Supports all R-type, I-type, and J-type instructions, as well as the syscalls that MARS supports.
- **Interactive Register View:** Track the values of all 32 registers in real-time as your program runs. Includes both hex and decimal display modes, switchable at any time.
- **Step-Through Simulation:** Step instruction-by-instruction through your program and inspect the registers and memory state after every step.
- **Memory Inspector:** Browse the simulated memory space and inspect individual memory addresses around chunks of memory relevant to your program.
- **Syntax Coloring:** Assembly syntax is highlighted as you type, just like a real IDE.
- **Tabbed Editor:** Open and edit multiple `.asm` files simultaneously with a familiar tab-based interface. Tabs can be renamed by double-tapping.
- **File Upload & Download:** Import `.asm`, `.s`, or `.txt` files directly from your device, and export your work back to disk at any time.
- **Console I/O:** Full program output is displayed in the console panel. Programs that request input via syscall will pause and wait for you to type a response.
- **Resizable Panels:** On desktop, all four panels (Editor, Console, Registers, Memory) are independently resizable and can be minimized.
- **Runs Anywhere:** Pure web: works on desktop, tablet, or mobile. Save files directly to browser storage, or sign in to sync across devices and prevent data loss.
- **Dark & Light Mode:** A persistent theme toggle is available on every screen, with your preference saved across sessions.

---

## Planned Features

- Interactive debugging with breakpoints
- Better, more detailed runtime error outputs
- Complete UI overhaul
- Extra MARS-like tools: Bitmap Display, Data Cache Simulator, and more

---

## Account & File Storage

WIMPS supports two modes of file persistence:

**Guest (no account):** Files are saved automatically to your browser's local storage. This is convenient for quick sessions, but data may be lost if you clear your browser storage or switch devices.

**Signed in:** Files are saved to a personal account in the cloud, accessible from any device. Up to 15 files can be stored, each up to 1MB. Files auto-save every 10 seconds when changes are detected.

To create an account, click **Sign Up** from the homepage or the IDE. To delete a saved file, open the file browser (📂) and press the **✕** next to the file.

---

## Technologies
This website is written using React Native & TypeScript. The simulator uses an open source node package [`@specy/mips`](https://github.com/Specy/mars). The backend is written in JavaScript and uses a mongodb for data storage.

---
## Self Hosting & Personal Development

Feel free to personally edit WIMPS for your own usage, or just play around with it!

To start out this project, first install all dependencies with the command:

```
npm install && npm --prefix backend install
```

Then, make a new file in `/backend/.env` and fill it in with your database link and credentials like so:

```
MONGO_URI=mongodb+srv://someuser:somepassword@somelink
JWT_SECRET=someencpassword
```

Next, run the backend server in `/backend` with:

```
node server.js
```

To run this server on iOS and Android too, forward this endpoint in a new terminal with:

```
ngrok http 3001
```

Then make a new `.env` file in the base directory with the format:

```
EXPO_PUBLIC_API_URL=https://somengroklinkyougotinthepreviousstep.ngrok-free.app
```

Then, you can run the main app with the following command in a 3rd terminal located in the base directory:

```
npx expo start --tunnel -c
```

---

## License

WIMPS is open source under the MIT License.