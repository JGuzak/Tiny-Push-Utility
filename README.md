<h1>Tiny Push Utility</h1>

Electron based desktop utility for Push 3 Standalone 3rd party app setup and management.

- [Disclaimer](#disclaimer)
- [Installation and Use](#installation-and-use)
- [FAQ](#faq)
- [Related Projects](#related-projects)
- [App Support and Structure](#app-support-and-structure)
- [Brainstorming](#brainstorming)
- [Contributing \& Development](#contributing--development)
  - [Build and Run](#build-and-run)
    - [Install dependencies](#install-dependencies)
    - [Running the App Locally](#running-the-app-locally)
  - [Package App for Release](#package-app-for-release)

## Disclaimer

This project is not supported in any capacity by Ableton. Use at your own risk.

This tool has been built with the help of AI. I am a software developer but have not spent time with web software since college. All code is reviewed and thoroughly tested before release.

> [!CAUTION]
> There are NO guarantees regarding safety/security with 3rd party apps. These apps can potentially do malicious things. Be very careful where you get your packages. It is recommended to provide checksums along side your packages so users can verify if the package was tampered with prior to installation.

## Installation and Use

Get the [latest version here](https://github.com/JGuzak/Tiny-Push-Utility/releases).

User Manual can be found along side each release.

![Tiny Push Utility demo video]()

## FAQ

**What is this utility for?**

Installing and managing 3rd party apps for `Push 3 Standalone`.

**I don't have Push Standalone but I do have a Push controller, can I still use this tool?**

No, this tool only works with `Push 3 Standalone` devices. `Push 1`, `Push 2`, and `Push 3 controller` are controllers for PC and Mac. This tool is for interacting with the computer inside of `Push 3 Standalone`.

**Can I navigate the file system on Push Standalone from this app?**

Not as of now. This tool is intended to be simple and light weight.

**Are apps installed with this tool safe?**

Not necessarily, be extremely careful when installing 3rd party apps on your `Push`. Make sure you trust the authors of the apps you install.

**What is an SSH key?**

An SSH key is a tool used to securely connect to another computer. `Tiny Push Utility` uses an SSH key to connect to `Push 3 Standalone` to interact with `AbletonOS`.

## Related Projects

- [push-dev](https://github.com/JGuzak/push-dev) by Jordo
- [Ableton Push Hack](https://github.com/federico-pepe/ableton-push-hack) by Fede

## App Support and Structure

`Tiny Push Utility` expects apps to be bundled in the following way;

- All payload bits (binaries, scripts, and other dependencies) should be packaged into a `.tar.gz` file.
- The `.tar.gz` package needs to contain an `install.sh`, `uninstall.sh`, and `collect-logs.sh` script.
- Developers of these app packages are expected to clean up their tools via the uninstall script. In the future, this should be enforced.

*Example:*

```text
my-package.tar.gz
  - install.sh
  - uninstall.sh
  - collect-logs.sh
  - my-package.bin
  - images/sub-folders/etc.
```

## Brainstorming

**App feature ideas:**

- Verify package checksums prior to installation on `Push`
- Add an `Update` option for installed apps
- Open up additional per-app functionality by supporting more than just install, uninstall, and collect-logs options.
  - Consider any script at the root of the installed package as a function?
  - Allow interactive scripts and user input?
  - Per-app config viewing/editing?

**Dev workflow improvements:**

- Migrate Azure Pipeline to GitHub actions for building releases (Is this possible for MacOS?)

## Contributing & Development

This project is open to public contributions. Please be respectful with feature requests and PRs.

### Build and Run

If you use `VS Code`, all of the steps below are available via `Tasks`.

The repository pins the host toolchain in `package.json`:

- Node.js `24.18.0`
- npm `11.13.0`

*Windows only:*

After installing Volta, open a new terminal in this repository and run:

```powershell
npm run setup
npm run check
```

Volta will automatically use the pinned Node and npm versions when commands are
run from this project directory.

#### Install dependencies

```powershell
npm run setup
```

```powershell
npm run check # Run syntax checks
```

#### Running the App Locally

```powershell
npm start # Single start
npm run dev # Run the app with automatic restart on source changes
```

### Package App for Release

```powershell
npm run release:win # Create a Windows distributable on a Windows host
npm run release:linux # Create a Linux distributable on a Linux host
npm run release:mac # Create a MacOS distributable on a MacOS host
```
