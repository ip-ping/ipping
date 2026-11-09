#!/bin/sh
# ipping-cli: run an ipping measurement from a terminal and print the result as text.
#
#   ipping-cli ping example.com
#   ipping-cli tcp example.com:443
#   ipping-cli http https://example.com/
#   ipping-cli traceroute example.com
#   ipping-cli tls example.com
#   ipping-cli -t MX dns example.com
#   ipping-cli -r cloudflare -T doh dns example.com
#
# It needs the address of an ipping site and an API key (an administrator creates one on the admin page):
#
#   export IPPING_SERVER=https://ipping.example.com
#   export IPPING_API_KEY=ipk_...
#
# or put them, one per file, in ~/.config/ipping/server and ~/.config/ipping/key (the key file should be
# readable only by you). POSIX sh and curl, nothing else.
set -eu

usage() {
  cat <<'USAGE'
Usage: ipping-cli [options] KIND TARGET

  KIND    ping | tcp | http | traceroute (or trace) | dns | tls (a certificate check)
  TARGET  an address, a host name or, for http, a URL; for tcp and tls host:port; for dns a domain name

Options:
  -s URL     the ipping site (default: $IPPING_SERVER or ~/.config/ipping/server)
  -k KEY     the API key (default: $IPPING_API_KEY or the first line of ~/.config/ipping/key)
  -n N       probes per node (ping, tcp), or rounds (traceroute: repeat it like mtr)
  -p PORT    port (tcp, http, tls; tls defaults to 443)
  -t TYPE    record type (dns): A AAAA CNAME MX NS TXT SOA
  -r NAME    resolver (dns): system cloudflare google quad9
  -T NAME    transport (dns): udp (default) or doh, DNS over HTTPS (cloudflare and google)
  -c CC,CC   only nodes in these countries (ISO 3166 codes)
  -f         follow redirects (http)
  -C         also use community nodes (run by volunteers; their results are not verified)
  -w SEC     wait up to SEC seconds for the result (1 to 30, default 20)
  -h         this help

Exit status: 0 the report was printed; 1 wrong usage; 2 the server refused the request.
USAGE
}

die() {
  printf 'ipping-cli: %s\n' "$1" >&2
  exit "${2:-1}"
}

config_dir="${XDG_CONFIG_HOME:-${HOME:-.}/.config}/ipping"
server="${IPPING_SERVER:-}"
key="${IPPING_API_KEY:-}"
count="" port="" record="" resolver="" transport="" countries="" follow="" community="" wait=""

while getopts 's:k:n:p:t:r:T:c:fCw:h' option; do
  case "$option" in
    s) server="$OPTARG" ;;
    k) key="$OPTARG" ;;
    n) count="$OPTARG" ;;
    p) port="$OPTARG" ;;
    t) record="$OPTARG" ;;
    r) resolver="$OPTARG" ;;
    T) transport="$OPTARG" ;;
    c) countries="$OPTARG" ;;
    f) follow="true" ;;
    C) community="true" ;;
    w) wait="$OPTARG" ;;
    h)
      usage
      exit 0
      ;;
    *)
      usage >&2
      exit 1
      ;;
  esac
done
shift $((OPTIND - 1))
[ $# -eq 2 ] || {
  usage >&2
  exit 1
}
kind="$1"
target="$2"
case "$kind" in
  trace) kind="traceroute" ;;
  ping | tcp | http | traceroute | dns | tls) ;;
  *) die "unknown kind '$kind' (ping, tcp, http, traceroute, dns, tls)" ;;
esac

if [ -z "$server" ] && [ -r "$config_dir/server" ]; then
  server="$(head -n 1 "$config_dir/server")"
fi
if [ -z "$key" ] && [ -r "$config_dir/key" ]; then
  # a key that other people can read is not much of a secret
  # shellcheck disable=SC2012 # the permission string of one named file is exactly what is wanted
  case "$(ls -ld "$config_dir/key" | cut -c5-10)" in
    *[rwx]*) printf 'ipping-cli: warning: %s is readable by other users\n' "$config_dir/key" >&2 ;;
  esac
  key="$(head -n 1 "$config_dir/key")"
fi
[ -n "$server" ] || die "no site: use -s, set IPPING_SERVER or write it to $config_dir/server"
[ -n "$key" ] || die "no API key: use -k, set IPPING_API_KEY or write it to $config_dir/key"
server="${server%/}"
case "$server" in
  https://*) ;;
  http://localhost* | http://127.* | "http://[::1]"*) ;;
  http://*) printf 'ipping-cli: warning: %s is not HTTPS, so the key is sent unencrypted\n' "$server" >&2 ;;
  *) die "the site must start with https:// (or http://)" ;;
esac
command -v curl >/dev/null 2>&1 || die "curl is needed"

set -- --get --data-urlencode "target=$target" --data-urlencode "kind=$kind"
[ -z "$count" ] || set -- "$@" --data-urlencode "count=$count"
[ -z "$port" ] || set -- "$@" --data-urlencode "port=$port"
[ -z "$record" ] || set -- "$@" --data-urlencode "record_type=$record"
[ -z "$resolver" ] || set -- "$@" --data-urlencode "resolver=$resolver"
[ -z "$transport" ] || set -- "$@" --data-urlencode "transport=$transport"
[ -z "$countries" ] || set -- "$@" --data-urlencode "countries=$countries"
[ -z "$follow" ] || set -- "$@" --data-urlencode "follow_redirects=true"
[ -z "$community" ] || set -- "$@" --data-urlencode "include_community=true"
[ -z "$wait" ] || set -- "$@" --data-urlencode "wait=$wait"

body="$(mktemp)"
trap 'rm -f "$body"' EXIT INT TERM HUP
# The key goes to curl on its standard input, so it never shows in a process list.
# The request waits for the result, so allow it as long as the server may.
status="$(printf 'header = "Authorization: Bearer %s"\n' "$key" |
  curl -sS -K - --max-time "$(((${wait:-20}) + 15))" -o "$body" -w '%{http_code}' "$@" "$server/api/v1/text")"

if [ "$status" != "200" ]; then
  message="$(sed -n 's/.*"message" *: *"\([^"]*\)".*/\1/p' "$body" | head -n 1)"
  die "${message:-the server answered $status} (HTTP $status)" 2
fi
cat "$body"
