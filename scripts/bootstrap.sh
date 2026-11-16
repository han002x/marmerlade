#!/usr/bin/env bash
set -euo pipefail

# Run from a source checkout, or supply a trusted release tarball with --package.
marmerlade_package=''
marmerlade_args=()
while (($#)); do
  case "$1" in
    --package) marmerlade_package="${2:?--package needs a tarball path or URL}"; shift 2 ;;
    *) marmerlade_args+=("$1"); shift ;;
  esac
done
marmerlade_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
marmerlade_data="${XDG_DATA_HOME:-$HOME/.local/share}/marmerlade"

if ! command -v node >/dev/null || ! command -v npm >/dev/null || ! node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||a===22&&b>=12?0:1)' ; then
  command -v curl >/dev/null || { echo 'curl is required to download Node.js.' >&2; exit 1; }
  case "$(uname -s)" in Linux) marmerlade_os=linux ;; Darwin) marmerlade_os=darwin ;; *) echo 'Use bootstrap.ps1 on Windows.' >&2; exit 1 ;; esac
  case "$(uname -m)" in x86_64|amd64) marmerlade_arch=x64 ;; arm64|aarch64) marmerlade_arch=arm64 ;; *) echo 'Unsupported Node.js architecture.' >&2; exit 1 ;; esac
  marmerlade_tmp="$(mktemp -d)"
  trap 'rm -rf "$marmerlade_tmp"' EXIT
  curl --fail --silent --show-error --location --connect-timeout 15 --max-time 180 https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt -o "$marmerlade_tmp/SHASUMS256.txt"
  marmerlade_entry="$(awk -v suffix="-$marmerlade_os-$marmerlade_arch.tar.gz" '$2 ~ suffix "$" {print; exit}' "$marmerlade_tmp/SHASUMS256.txt")"
  read -r marmerlade_hash marmerlade_archive <<< "$marmerlade_entry"
  [[ "$marmerlade_hash" =~ ^[0-9a-f]{64}$ && "$marmerlade_archive" =~ ^node-v22\.[0-9]+\.[0-9]+- ]] || { echo 'No supported Node.js release found.' >&2; exit 1; }
  curl --fail --silent --show-error --location --connect-timeout 15 --max-time 180 "https://nodejs.org/dist/latest-v22.x/$marmerlade_archive" -o "$marmerlade_tmp/node.tar.gz"
  if command -v sha256sum >/dev/null; then marmerlade_actual="$(sha256sum "$marmerlade_tmp/node.tar.gz" | awk '{print $1}')"
  else marmerlade_actual="$(shasum -a 256 "$marmerlade_tmp/node.tar.gz" | awk '{print $1}')"; fi
  [[ "$marmerlade_actual" == "$marmerlade_hash" ]] || { echo 'Node.js checksum verification failed.' >&2; exit 1; }
  marmerlade_runtime="$marmerlade_data/runtime/${marmerlade_archive%.tar.gz}"
  mkdir -p "$marmerlade_runtime"
  tar -xzf "$marmerlade_tmp/node.tar.gz" -C "$marmerlade_runtime" --strip-components=1
  export PATH="$marmerlade_runtime/bin:$PATH"
fi

if [[ -n "$marmerlade_package" ]]; then
  npm install --prefix "$marmerlade_data/app" --no-audit --no-fund -- "$marmerlade_package"
  marmerlade_cli="$marmerlade_data/app/node_modules/marmerlade/dist/cli.js"
elif [[ -f "$marmerlade_root/src/main.tsx" ]]; then
  npm --prefix "$marmerlade_root" ci --no-audit --no-fund
  npm --prefix "$marmerlade_root" run build
  marmerlade_cli="$marmerlade_root/dist/cli.js"
else
  echo 'Supply --package with a trusted Marmerlade release tarball.' >&2
  exit 1
fi
exec node "$marmerlade_cli" setup "${marmerlade_args[@]}"
