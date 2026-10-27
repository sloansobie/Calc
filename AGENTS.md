# Desktop app workflow

The user uses the native macOS Calc app. For changes to the calculator, always
rebuild the desktop app with `./scripts/build-macos.sh`, then install it with
`./scripts/install-macos.sh`. A web-only build does not complete the task.

If Calc is running, gracefully quit it before installing, then reopen
`~/Applications/Calc.app` after installation. Preserve saved worksheets and
settings. Run the appropriate checks before building and report any build or
installation failure rather than claiming the desktop app was updated.
