#!/usr/bin/env bash
# Shows the requests the server has logged, one line per request. Run from Git Bash on your computer:
#
#   scripts/logs.sh root@13.140.235.138          the last 50
#   scripts/logs.sh root@13.140.235.138 500      the last 500
#   scripts/logs.sh root@13.140.235.138 all      every one, oldest first
#   scripts/logs.sh root@13.140.235.138 -f       then keep printing new ones as they come (Ctrl+C stops)
#   scripts/logs.sh root@13.140.235.138 -a       include the files each page loads (scripts, styles, icons)
#
# Each line is the time, status, visitor IP, browser or bot, the request, and the site the visitor
# came from when it isn't this one:
#
#   Oct 30 01:12:28  200  47.132.100.100   Chrome/Windows    GET /cube/  from www.google.com
#
# Caddy has logged every request since Oct 30 2026, to /var/log/caddy/access.log, which it rolls
# into gzipped access-*.log.gz files every 10 MiB. Before that only the parse server kept a log (in
# the journal), so the lines from before Caddy's start are /api requests alone, with no browser.
#
# Times are in LOG_TZ (default America/New_York).
set -euo pipefail

HOST=${1:?usage: scripts/logs.sh user@host [count|all] [-f] [-a]}
shift
COUNT=50 FOLLOW=false ASSETS=false
for arg in "$@"; do
  case $arg in
    -f) FOLLOW=true ;;
    -a) ASSETS=true ;;
    all) COUNT=all ;;
    '' | *[!0-9]*) echo "unknown option: $arg" >&2; exit 1 ;;
    *) COUNT=$arg ;;
  esac
done

# turns each JSON log line into a readable one; without -a, skips files that loaded fine
FORMAT=$(cat <<'JQ'
def pad(n): tostring | if length >= n then . else . + " " * (n - length) end;
def agent:
  if . == null then "-"
  elif test("bot|crawl|spider|slurp"; "i") then
    (capture("(?<name>[A-Za-z0-9._-]*(bot|crawl|spider|slurp)[A-Za-z]*)"; "i").name // "bot")
  elif test("^Mozilla/") | not then split("/")[0] | split(" ")[0]
  else
    (if test("Edg/") then "Edge" elif test("Firefox/|FxiOS/") then "Firefox"
     elif test("Chrome/|CriOS/") then "Chrome" elif test("Safari/") then "Safari" else "Browser" end)
    + "/" +
    (if test("iPhone") then "iPhone" elif test("iPad") then "iPad" elif test("Android") then "Android"
     elif test("Windows") then "Windows" elif test("Mac OS X") then "Mac" elif test("Linux") then "Linux"
     else "?" end)
  end;
if .caddy_starts then
  "----- Caddy's log starts here. Above, only /api was logged, without the browser. -----"
else
  .request as $r
  | select($assets or .status >= 400
      or ($r.uri | split("?")[0] | test("\\.(js|css|svg|ico|png|jpe?g|gif|webp|woff2?|map)$") | not))
  | ($r.headers.Referer[0] // "" | capture("^https?://(?<host>[^/]+)").host // "") as $from
  | [ (.ts | floor | strflocaltime("%b %d %H:%M:%S")),
      (.status | pad(3)),
      ($r.remote_ip | pad(15)),
      ($r.headers["User-Agent"][0] | agent | .[:16] | pad(16)),
      "\($r.method) \($r.uri)",
      (if $from == "" or ($from | test("(^|\\.)evansmith\\.xyz$")) then empty else "from \($from)" end)
    ]
  | join("  ")
end
JQ
)

# turns the parse server's journal lines (uvicorn's "INFO: ip:port - "GET /health HTTP/1.1" 200 OK")
# into Caddy's shape, so FORMAT can show them too
PARSER=$(cat <<'JQ'
(.MESSAGE | strings
  | capture("^INFO: +(?<ip>\\S+):[0-9]+ - \"(?<method>[A-Z]+) (?<uri>\\S+) HTTP/[0-9.]+\" (?<status>[0-9]+)")) as $m
| { ts: (.__REALTIME_TIMESTAMP | tonumber / 1e6),
    status: ($m.status | tonumber),
    request: { remote_ip: $m.ip, method: $m.method, uri: "/api\($m.uri)", headers: {} } }
JQ
)

# runs on the server
REMOTE=$(cat <<'SH'
set -uo pipefail
format=$1 parser=$2 count=$3 assets=$4 follow=$5
dir=/var/log/caddy
files="$(ls $dir/access-*.log.gz 2>/dev/null) $dir/access.log"   # oldest first
start=$(zcat -f $files | head -n 1 | jq '.ts | floor')
# the parse server's requests from before Caddy's log starts
earlier=$(journalctl -q -u sentence-grapher-parser -o json --until "@${start:-$(date +%s)}" | jq -c "$parser")
{
  if [ -n "$earlier" ]; then
    printf '%s\n' "$earlier"
    echo '{"caddy_starts":true}'
  fi
  zcat -f $files
} | jq -r --argjson assets "$assets" "$format" | if [ "$count" = all ]; then cat; else tail -n "$count"; fi
if $follow; then
  tail -n 0 -F $dir/access.log | jq --unbuffered -r --argjson assets "$assets" "$format"
fi
SH
)

TTY=()
if $FOLLOW && [ -t 0 ]; then
  TTY=(-t)   # so Ctrl+C stops the tail on the server too
fi
ssh "${TTY[@]}" "$HOST" "TZ=$(printf %q "${LOG_TZ:-America/New_York}") bash -c $(printf %q "$REMOTE") logs \
  $(printf '%q ' "$FORMAT" "$PARSER" "$COUNT" "$ASSETS" "$FOLLOW")"
