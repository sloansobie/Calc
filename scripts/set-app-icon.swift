import AppKit
// A Finder custom icon preserves the supplied transparent artwork in the Dock,
// including when the application is closed.
let appPath = CommandLine.arguments[1]
let imagePath = CommandLine.arguments[2]
guard let image = NSImage(contentsOfFile: imagePath),
      NSWorkspace.shared.setIcon(image, forFile: appPath, options: []) else {
    fputs("Could not apply the custom app icon\n", stderr)
    exit(1)
}
