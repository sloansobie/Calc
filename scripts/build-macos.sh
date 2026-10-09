#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
./scripts/run.sh build
calculator_build="$PWD/build/macos"
calculator_app="$calculator_build/Calc.app"
if [ -d "$calculator_app" ]; then rm -rf "$calculator_app"; fi
mkdir -p "$calculator_app/Contents/MacOS" "$calculator_app/Contents/Resources"
cp desktop/macos/Info.plist "$calculator_app/Contents/Info.plist"
cp desktop/macos/Calculator.png "$calculator_app/Contents/Resources/Calculator.png"
cp -R dist "$calculator_app/Contents/Resources/web"
swiftc -O -swift-version 5 -target "$(uname -m)-apple-macosx14.0" -framework Cocoa -framework WebKit -framework Network desktop/macos/main.swift -o "$calculator_app/Contents/MacOS/ScientificCalculator"
cp desktop/macos/Calculator.png "$calculator_build/Calculator.png"
mkdir -p "$calculator_build/Calculator.iconset"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$calculator_build/Calculator.png" --out "$calculator_build/Calculator.iconset/icon_${size}x${size}.png" >/dev/null
  doubled=$((size * 2))
  sips -z "$doubled" "$doubled" "$calculator_build/Calculator.png" --out "$calculator_build/Calculator.iconset/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$calculator_build/Calculator.iconset" -o "$calculator_app/Contents/Resources/Calculator.icns"
codesign --force --sign - "$calculator_app"
printf '\nBuilt: %s\n' "$calculator_app"
