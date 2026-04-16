#!/usr/bin/env bash
set -euo pipefail

VAULT_ROOT="${1:-}"
if [ -z "$VAULT_ROOT" ]; then
  echo "Usage: bun run deploy <vault-root>" >&2
  echo "  e.g. bun run deploy ~/notes" >&2
  exit 1
fi

VAULT_ROOT="${VAULT_ROOT/#\~/$HOME}"

if [ ! -d "$VAULT_ROOT/.obsidian" ]; then
  echo "error: $VAULT_ROOT does not look like an Obsidian vault (missing .obsidian/)" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

bun run --cwd "$ROOT_DIR" build

PLUGIN_DIR="$VAULT_ROOT/.obsidian/plugins/daily-schedule"
mkdir -p "$PLUGIN_DIR"

cp "$ROOT_DIR/dist/main.js" "$ROOT_DIR/dist/manifest.json" "$ROOT_DIR/dist/styles.css" "$PLUGIN_DIR/"
echo "Deployed to $PLUGIN_DIR"
