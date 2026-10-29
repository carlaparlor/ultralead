# ultralead+ for Windows

## Install (recommended)

1. Open [Releases](https://github.com/carlaparlor/ultralead/releases).
2. Download **`ultralead-plus-Setup-<version>-x64.exe`** from the latest release's **Assets**. Do not download “Source code”.
3. Double-click the EXE. It installs for your Windows user and opens ultralead+. Desktop and Start menu shortcuts are created automatically.

**That's it.** No Node.js, npm, terminal commands, administrator password, separate browser, account, backend, WebView2 install, or runtime download is needed. All application files, fonts, icons, Chromium and the embedded runtime are in the EXE. After the initial download, you can disconnect from the internet before installation and continue using the app offline.

Supported package: **Windows 10/11, x64 (64-bit)**. There is no 32-bit build or native ARM64 build; use an x64-compatible Windows installation. Download size is larger than the web app because the runtime is included.

If no release is listed yet, a maintainer must build/publish the first package. A completed [Windows app workflow](https://github.com/carlaparlor/ultralead/actions/workflows/windows.yml) also has an **ultralead-windows** artifact: download and extract that ZIP to get the Setup and Portable EXEs. GitHub requires sign-in for workflow artifacts; published release downloads do not require a GitHub account for a public repository.

## Run without installing

Download **`ultralead-plus-Portable-<version>-x64.exe`** and double-click it. Keep it somewhere convenient and run that file again next time. No shortcuts or uninstall entry are created. The first launch can take a little longer while the bundled files are extracted to Windows' temporary directory.

**Portable means no installation, not a workspace carried on a USB stick.** It stores your data in this Windows user's local profile, not beside the EXE. Installed and portable editions use the **same workspace**, and launching another copy brings the existing window forward. Use JSON backup/restore to move data between computers or Windows users.

## Existing browser workspace

1. In your original browser/address, open **Data & settings → Export backup**.
2. Open the Windows app and choose **Data & settings → Restore backup**.
3. Select the JSON file and confirm. Restoring replaces the current desktop workspace, including sample data.

The app cannot automatically read a different browser's private storage. Your browser workspace remains unchanged. Backups contain customer information; store and transfer them securely.

## Saving, upgrading and uninstalling

- Your workspace and preferences are saved automatically under **`%APPDATA%\ultralead-plus`**, using the embedded browser's localStorage. They are not stored in the program's installation or temporary extraction folder.
- To back up, choose **Data & settings → Export backup**, then choose a folder in the Windows save dialog. Keep regular backups outside the app's data folder. Restore uses the normal file picker and the same validation/confirmation as the web app.
- To upgrade, export a backup, close ultralead+, and run the newer **Setup EXE**. The installation is replaced while the workspace is retained. For portable use, close the old copy and open the newer Portable EXE.
- There is no background updater or runtime download. New versions are installed deliberately from Releases.
- Uninstall from **Windows Settings → Apps → Installed apps → ultralead+**. Ordinary uninstallation keeps the saved workspace so reinstalling does not erase your work. The portable EXE can simply be deleted while closed.
- For complete removal, export anything you need, uninstall/delete the EXE, close all copies, and deliberately delete **`%APPDATA%\ultralead-plus`** as well. This is irreversible unless you have a backup. Keep/delete any exported backups according to your organisation's retention policy.

Local storage and JSON backups are **not encrypted** and are not synced. Follow the same device-security and customer-data policies as for the browser edition.

## Windows warnings and workplace restrictions

A build without a code-signing certificate may display **“Windows protected your PC”** or **“Unknown publisher”**. A valid signing certificate can reduce these warnings, but does not guarantee SmartScreen reputation. Only use the repository's trusted release or a build from your own organisation. If you have verified and trust the source and your policy allows it, SmartScreen may offer **More info → Run anyway**. Do not disable SmartScreen, Defender, or other security controls. If your workplace blocks the app or does not offer an override, ask IT to approve/sign the package; portable mode does not bypass workplace policy.

If the app does not open:

- Confirm you downloaded the **x64 Setup or Portable EXE**, not the source ZIP, and that your Windows version is supported.
- If a copy is already open, check the taskbar: a second launch focuses the existing window.
- A standard Windows user can install without elevation, but needs write access to their own profile and temporary folders. Low disk space or a locked-down profile can prevent launch/save. Do not run as administrator to hide these issues; check with IT.
- If the workspace looks empty after moving from a browser or another PC/user, restore an exported backup. Do not delete the original browser data or desktop profile while investigating.

Each release includes a separate **`SHA256SUMS.txt`** listing hashes of the two EXEs. A maintainer or IT team can compare these with `Get-FileHash <downloaded-file> -Algorithm SHA256` in PowerShell. Hashes check that a file matches the release; they are not a replacement for trusting the publisher.

## Building and publishing (maintainers only)

End users do **not** need these tools or steps.

On Windows, with Node.js **22.12+** installed:

```sh
npm ci
npm test
npm run dist:win
```

Outputs (version comes from `package.json`):

```text
release/
  ultralead-plus-Setup-1.0.0-x64.exe
  ultralead-plus-Portable-1.0.0-x64.exe
  SHA256SUMS.txt
  win-unpacked/                         # staging files, not the user download
```

`electron-builder.yml` uses the **full NSIS installer**, not `nsis-web`. `npm run desktop` launches the production UI in Electron for local development; it never depends on a running Vite server. Web-only development and hosting still work as before. Packaging downloads the native runtime/build tools at **build time**, so a first build needs internet access. Build on Windows (or use CI), not this project's Linux development sandbox.

### Build using GitHub, without local build tools

The **Windows app** workflow runs on pushes to `main` / `arena/**`, pull requests, matching version tags, and manual **Run workflow** dispatches. It:

1. Installs locked build dependencies and runs web/desktop unit tests.
2. Type-checks web and desktop code and smoke-tests the desktop UI (including responsive navigation) before building both Windows EXEs and hashes.
3. Silently installs the real Setup EXE, checks shortcuts, and tests its sandboxed UI, import, real clipboard copying, backup export/restore, bundled fonts and restart persistence. The application's environment has **no Node.js on PATH**.
4. Opens and closes the actual Portable EXE, also without Node.js on PATH.
5. Uploads an **ultralead-windows** artifact with both EXEs and their checksums (14-day retention).

For a public release, update the version in `package.json` and `package-lock.json`, then push a Git tag **`v<version>`** pointing to that source. The workflow rejects a mismatched tag, waits for all build/smoke tests to pass, and creates a GitHub Release with the tested downloads and simple installation instructions. Do not create an empty release first. Workflow artifacts are temporary; release assets are the long-term download channel. Generated `release/` and `dist/` files are ignored by Git.

Optional signing: configure the repository Actions secrets **`WINDOWS_CERTIFICATE`** (a base64-encoded Windows signing PFX, supported by electron-builder) and **`WINDOWS_CERTIFICATE_PASSWORD`**. The workflow passes these only to the packaging step via `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD`. Without them it produces unsigned builds and documents the warning. Never commit a PFX, password, or certificate URL containing credentials.

Keep **`com.ultralead.plus`**, **`ultralead://app/`**, and **`%APPDATA%\ultralead-plus`** stable across releases: they define upgrade identity and workspace storage. Retest the Windows smoke suite whenever Electron, the protocol handler, installer configuration, backup format or storage schema changes.
