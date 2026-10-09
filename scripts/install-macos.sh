#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
calculator_source="$PWD/build/macos/Calc.app"
calculator_target="$HOME/Applications/Calc.app"
if [ ! -d "$calculator_source" ]; then
  printf '%s\n' 'Build the app first with ./scripts/build-macos.sh.' >&2
  exit 1
fi
if pgrep -f '(Calc|Scientific Calculator)[.]app/Contents/MacOS/ScientificCalculator' >/dev/null; then
  printf '%s\n' 'Quit Calc before installing this update.' >&2
  exit 1
fi
codesign --verify --deep --strict "$calculator_source"
mkdir -p "$HOME/Applications"
calculator_stage="$(mktemp -d "$HOME/Applications/.scientific-calculator-update.XXXXXX")"
trap 'rm -rf "$calculator_stage"' EXIT
# Replace the complete signed bundle. Merging updates leaves stale JavaScript
# assets behind and invalidates macOS resource sealing.
ditto "$calculator_source" "$calculator_stage/new.app"
codesign --verify --deep --strict "$calculator_stage/new.app"
if [ -d "$calculator_target" ]; then
  ditto -c -k --keepParent "$calculator_target" "$PWD/build/macos/previous-version.zip"
  mv "$calculator_target" "$calculator_stage/previous"
fi
if ! mv "$calculator_stage/new.app" "$calculator_target"; then
  if [ -d "$calculator_stage/previous" ]; then mv "$calculator_stage/previous" "$calculator_target"; fi
  exit 1
fi
if ! codesign --verify --deep --strict "$calculator_target"; then
  rm -rf "$calculator_target"
  if [ -d "$calculator_stage/previous" ]; then mv "$calculator_stage/previous" "$calculator_target"; fi
  exit 1
fi
calculator_previous_name="$HOME/Applications/Scientific Calculator.app"
if [ -d "$calculator_previous_name" ]; then
  ditto -c -k --keepParent "$calculator_previous_name" "$PWD/build/macos/previous-name.zip"
  mv "$calculator_previous_name" "$calculator_stage/previous-name.app"
fi
swift scripts/set-app-icon.swift "$calculator_target" desktop/macos/Calculator.png
# Finder custom-icon metadata is allowed by ordinary signature verification.
codesign --verify --deep "$calculator_target"
printf 'Installed: %s\n' "$calculator_target"
