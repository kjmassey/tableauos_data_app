#!/usr/bin/env bash
# Builds build/TableauOS.twbx from the sources in this folder.
set -euo pipefail
cd "$(dirname "$0")"
rm -rf build && mkdir -p build/pkg
cp "Tableau Finder.twb" build/pkg/TableauOS.twb
cp -R Packages build/pkg/
find build -name .DS_Store -delete
(cd build/pkg && zip -qr ../TableauOS.twbx .)
echo "Built build/TableauOS.twbx"
