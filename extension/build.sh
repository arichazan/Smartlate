#!/usr/bin/env bash
# Phravexa build script: creates the Chrome Web Store ZIP in dist/ and
# verifies its contents. Usage: ./extension/build.sh (from any directory)
set -euo pipefail

EXT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${EXT_DIR}/.." && pwd)"
DIST_DIR="${ROOT_DIR}/dist"

VERSION="$(node -p "require('${EXT_DIR}/manifest.json').version")"
ZIP_NAME="phravexa-${VERSION}.zip"
ZIP_PATH="${DIST_DIR}/${ZIP_NAME}"

# Files shipped in the store package. Anything not listed here is left out.
FILES=(
  manifest.json
  background.js
  lib/core.js
  content.js
  content.css
  offscreen.html
  offscreen.js
  options.html
  options.js
  popup.html
  popup.js
  icons/icon16.png
  icons/icon48.png
  icons/icon128.png
)

echo "Building Phravexa ${VERSION}"
STAGE="$(mktemp -d)"
trap 'rm -rf "${STAGE}"' EXIT

for file in "${FILES[@]}"; do
  if [ ! -f "${EXT_DIR}/${file}" ]; then
    echo "Missing file: ${file}" >&2
    exit 1
  fi
  mkdir -p "${STAGE}/$(dirname "${file}")"
  cp "${EXT_DIR}/${file}" "${STAGE}/${file}"
done

mkdir -p "${DIST_DIR}"
rm -f "${ZIP_PATH}"
# -X drops extra file attributes; fixed timestamps keep the ZIP reproducible
find "${STAGE}" -exec touch -t 202001010000 {} +
(cd "${STAGE}" && zip -q -X -r "${ZIP_PATH}" "${FILES[@]}")

node "${ROOT_DIR}/scripts/verify-package.js" "${ZIP_PATH}" "${FILES[@]}"

echo "Package: ${ZIP_PATH} ($(du -h "${ZIP_PATH}" | cut -f1))"
