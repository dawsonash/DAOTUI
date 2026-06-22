# DAOTUI

A terminal UI for transcribing audio on an Azure GPU VM with WhisperX: it
starts the VM, uploads your file, runs transcription, pulls the result back,
lets you QC low-confidence words, then cleans up and deallocates the VM.

## Setup

### 1. External tools

These must be installed and on your `PATH` — the app shells out to them, so
`npm install` does **not** provide them:

| Tool | Purpose | Install |
|------|---------|---------|
| **Node.js ≥ 18** | Runs the app | [nodejs.org](https://nodejs.org) or `brew install node` |
| **Azure CLI (`az`)** | Starts / deallocates the VM | `brew install azure-cli` |
| **`ssh`, `scp`, `ssh-keygen`** | Upload, run, download, cleanup, key generation | Preinstalled on macOS (OpenSSH) |

Then authenticate the Azure CLI once:

```bash
az login
```

### 2. Run the app

From the repo root:

```bash
npm install
npm start
```

### 3. Verify your environment

```bash
node --version    # >= 18
az --version      # Azure CLI present
az account show   # logged in
ssh -V            # present (preinstalled on macOS)
```

## Configuration

Settings and the SSH key path are stored outside the repo, in the OS config
directory (`~/Library/Preferences/daotui-nodejs/config.json`).
