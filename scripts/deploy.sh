#!/usr/bin/env bash
# Builds the site and puts it on the server over SSH. Run from Git Bash on your computer:
#
#   scripts/deploy.sh root@13.140.235.138
#
# Each part goes to its own folder, which deploy/Caddyfile maps to an address:
#
#   /              homepage               /srv/homesite
#   /diagrammer/   Sentence Diagrammer    /srv/sentence-grapher
#   /cube/         Cube Timer             /srv/cube
#
# The diagrammer's spaCy parse server (/api) isn't touched: ../grammar/scripts/deploy.sh sets it up
# and updates it.
set -euo pipefail

HOST=${1:?usage: scripts/deploy.sh user@host}
cd "$(dirname "$0")/.."

npm run build

# upload DEST TAR-ARGS...: unpack beside the live copy, then swap, so nobody is served half a site
upload() {
  local dest=$1
  shift
  echo "== Uploading $dest"
  tar -cf - "$@" | ssh "$HOST" "set -e
    rm -rf $dest.new $dest.old
    mkdir -p $dest.new
    tar -C $dest.new --no-same-owner -xf -
    chmod -R a+rX $dest.new
    if [ -d $dest ]; then mv $dest $dest.old; fi
    mv $dest.new $dest
    rm -rf $dest.old"
}

upload /srv/sentence-grapher -C dist/diagrammer .
upload /srv/cube -C dist/cube .
upload /srv/homesite -C dist --exclude=./diagrammer --exclude=./cube .

echo "== Caddy"
# checked before it replaces the live config, so a mistake can't take the site down
tr -d '\r' < deploy/Caddyfile | ssh "$HOST" 'set -e
  cat > /etc/caddy/Caddyfile.new
  caddy validate --config /etc/caddy/Caddyfile.new --adapter caddyfile
  mv /etc/caddy/Caddyfile.new /etc/caddy/Caddyfile
  systemctl reload caddy'

echo "== Done: https://evansmith.xyz/"
