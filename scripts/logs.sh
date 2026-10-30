#!/usr/bin/env bash
# Shows the site's request log (/var/log/caddy/access.log on the server) as one line per request.
# Run from Git Bash on your computer:
#
#   scripts/logs.sh root@13.140.235.138          the last 50 requests
#   scripts/logs.sh root@13.140.235.138 500      the last 500
#   scripts/logs.sh root@13.140.235.138 -f       then keep printing new ones as they come (Ctrl+C stops)
#   scripts/logs.sh root@13.140.235.138 -a       include the files each page loads (scripts, styles, icons)
#
# Each line is the time, status, visitor IP, browser or bot, the request, and the site the visitor
# came from when it isn't this one:
#
#   Oct 30 01:12:28  200  47.132.100.100   Chrome/Windows    GET /cube/  from www.google.com
#
# Times are in LOG_TZ (default America/New_York). Caddy starts a new file every 10 MiB; older
# requests are in the gzipped access-*.log.gz files beside the log.
set -euo pipefail

HOST=${1:?usage: scripts/logs.sh user@host [count] [-f] [-a]}
shift
COUNT=50 FOLLOW=false ALL=false
for arg in "$@"; do
  case $arg in
    -f) FOLLOW=true ;;
    -a) ALL=true ;;
    '' | *[!0-9]*) echo "unknown option: $arg" >&2; exit 1 ;;
    *) COUNT=$arg ;;
  esac
done
LOG=/var/log/caddy/access.log

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
.request as $r
| select($all or .status >= 400
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
JQ
)
RUN="TZ=$(printf %q "${LOG_TZ:-America/New_York}") jq -r --argjson all $ALL $(printf %q "$FORMAT")"

if $FOLLOW; then
  # a terminal lets Ctrl+C stop the remote tail too
  TTY=()
  [ -t 0 ] && TTY=(-t)
  ssh "${TTY[@]}" "$HOST" "$RUN $LOG | tail -n $COUNT; tail -n 0 -F $LOG | $RUN --unbuffered"
else
  ssh "$HOST" "$RUN $LOG | tail -n $COUNT"
fi
