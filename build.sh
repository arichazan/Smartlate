#!/bin/bash

# Smartlate Extension Build Script
# Creates a production-ready ZIP file for Chrome Web Store submission

set -e  # Exit on any error

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}Building Smartlate Extension...${NC}"

# Get version from manifest.json
VERSION=$(grep -o '"version": "[^"]*"' manifest.json | cut -d'"' -f4)
echo -e "${BLUE}Version: ${VERSION}${NC}"

# Create build directory
BUILD_DIR="build"
DIST_DIR="chrome-store-submission"
ZIP_NAME="smartlate-${VERSION}.zip"

echo -e "${BLUE}Creating build directory...${NC}"
rm -rf "${BUILD_DIR}"
mkdir -p "${BUILD_DIR}"

# Copy only necessary files for the extension
echo -e "${BLUE}Copying extension files...${NC}"

# List of files to include in the extension package
FILES=(
  "manifest.json"
  "background.js"
  "content.js"
  "content.css"
  "offscreen.html"
  "offscreen.js"
  "options.html"
  "options.js"
  "popup.html"
  "popup.js"
)

for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    cp "$file" "${BUILD_DIR}/"
  else
    echo -e "${RED}Warning: $file not found${NC}"
  fi
done

# Copy icons directory
echo -e "${BLUE}Copying icons...${NC}"
cp -r icons "${BUILD_DIR}/"

# Create distribution directory if it doesn't exist
mkdir -p "${DIST_DIR}"

# Create ZIP file
echo -e "${BLUE}Creating ZIP file: ${ZIP_NAME}${NC}"
cd "${BUILD_DIR}"
zip -r "../${DIST_DIR}/${ZIP_NAME}" . -x "*.DS_Store"
cd ..

# Clean up build directory
echo -e "${BLUE}Cleaning up...${NC}"
rm -rf "${BUILD_DIR}"

# Calculate ZIP size
ZIP_SIZE=$(du -h "${DIST_DIR}/${ZIP_NAME}" | cut -f1)

echo -e "${GREEN}✅ Build complete!${NC}"
echo -e "${GREEN}Package: ${DIST_DIR}/${ZIP_NAME}${NC}"
echo -e "${GREEN}Size: ${ZIP_SIZE}${NC}"
echo ""
echo -e "${BLUE}Ready to upload to Chrome Web Store!${NC}"
