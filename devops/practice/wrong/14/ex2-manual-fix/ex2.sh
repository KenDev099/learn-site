#!/bin/sh
set -e
cd "$1"
sed -i.bak 's/Math.floor/Math.round/' src/tax.ts && rm src/tax.ts.bak
git commit -q -am 'fix: 稅額改回四捨五入'
