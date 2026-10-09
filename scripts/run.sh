#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if [ "$#" -eq 0 ]; then set -- dev; fi
if command -v node >/dev/null 2>&1 && command -v pnpm >/dev/null 2>&1; then
  exec pnpm "$@"
fi
calculator_runtime="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies"
if [ -x "$calculator_runtime/node/bin/node" ] && [ -x "$calculator_runtime/bin/fallback/pnpm" ]; then
  export PATH="$calculator_runtime/node/bin:$PATH"
  exec "$calculator_runtime/bin/fallback/pnpm" "$@"
fi
printf '%s\n' 'Install Node.js 22.12+ and pnpm, then run pnpm install and pnpm dev.' >&2
exit 1
