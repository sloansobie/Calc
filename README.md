# Calc

An offline scientific calculator for macOS, with a glassy dark interface and editable mathematical notation. Built with React, TypeScript, MathLive, math.js, Nerdamer, and a native Swift/WebKit shell.

## Features

- Live results, variables, custom functions, and dependent expressions.
- Fractions, roots, powers, percentages, logarithms, trigonometry, statistics, combinatorics, and complex numbers.
- Symbolic derivatives, function prime notation, supported antiderivatives, numerical definite integrals, and finite sums.
- Greek-name shortcuts, automatic numbered subscripts, bracket completion, and keyboard navigation within fractions.
- Click results to copy; choose 1–15 displayed significant figures without rounding intermediate calculations.
- Undo/redo, a one-click keyboard mode, and a resizable floating window on the current desktop.
- Named worksheets saved as local `.calc` files. Click the title to rename; click + to open the native file window.
- Bundled fonts and calculation libraries; no internet connection or external API required.

## Development

Install Node.js 22.12+ and pnpm, then:

```sh
pnpm install
pnpm dev
```

Open `http://localhost:5173`. The browser version stores worksheets locally in the browser.

```sh
pnpm test
pnpm typecheck
pnpm build
```

The `scripts/run.sh` launcher also supports the Codex desktop bundled runtime when available.

## Build the macOS app

Requirements: macOS 14+, Apple's Command Line Tools, and installed project dependencies.

```sh
./scripts/build-macos.sh
./scripts/install-macos.sh
```

The build produces `build/macos/Calc.app`, compiled for the current Mac's architecture and signed locally. The installer places it in `~/Applications/Calc.app`. Quit Calc before installing an update. A backup of the previous app is retained under `build/macos/`.

Native worksheets are saved in `~/Documents/Calc Worksheets/`, with session recovery and preferences stored locally. Existing worksheets migrate automatically. Launch from Finder, Spotlight, or the Dock. Use File → Reload Calculator (⌘R) if needed.

## Structure

- `src/Editor.tsx`: mathematical input and keyboard editing.
- `src/App.tsx`: worksheet state, history, controls, and help.
- `src/engine.ts`: notation translation, dependency resolution, and evaluation.
- `src/evaluation.ts` and `src/worker.ts`: interruptible worker calculations.
- `desktop/macos/main.swift`: native window, local asset server, clipboard, and worksheet files.

Calculations retain JavaScript number precision. Workers are interrupted on edits or after a time limit. Symbolic calculus uses radians; numerical trigonometry follows RAD/DEG. Symbolic simplification may omit restrictions at singular points. This is an independent implementation inspired by Desmos, without accounts, graphing, or cloud sync.

Third-party font licenses are included in `public/fonts/`.
