#!/usr/bin/env bash
# shellcheck disable=SC2329,SC2317,SC2034,SC2016,SC2153,SC2218  # test doubles and variables the sourced script uses, and literal $ in test data; shellcheck cannot see that
# Tests for the installer's own logic (no root, no network, nothing installed).
#   bash tests/installer.sh
set -u
cd "$(dirname "$0")/.." || exit 1
SCRIPT=./ipping.sh
HERE="$PWD/tests/fixtures"

failures=0
check() { # check "what" expected actual
  if [ "$2" = "$3" ]; then printf '  ok    %s\n' "$1"; else printf '  FAIL  %s\n        expected: %s\n        actual:   %s\n' "$1" "$2" "$3"; failures=$((failures + 1)); fi
}

echo "sourcing the script must not run it"
out="$(bash -c ". $SCRIPT; echo sourced" 2>&1)"
check "no output other than ours, no exit" "sourced" "$out"

# Everything below runs in this shell, with the script's functions loaded and its variables set.
# shellcheck source=/dev/null
. "$SCRIPT"
set +e +u +o pipefail

echo "os-release is read without touching the script's own variables"
VERSION="v0.2.0"; NAME="my node"; MODE="docker"
for fixture in debian13 ubuntu2404; do
  export OS_RELEASE_FILE="$HERE/os-release.$fixture"
  distro="$(os_release ID)"
  codename="$(os_release UBUNTU_CODENAME)"; codename="${codename:-$(os_release VERSION_CODENAME)}"
  case "$fixture" in
    debian13) check "debian 13: distro" debian "$distro"; check "debian 13: codename" trixie "$codename" ;;
    ubuntu2404) check "ubuntu 24.04: distro" ubuntu "$distro"; check "ubuntu 24.04: codename" noble "$codename" ;;
  esac
  check "$fixture: VERSION survives" "v0.2.0" "$VERSION"
  check "$fixture: NAME survives" "my node" "$NAME"
  check "$fixture: MODE survives" "docker" "$MODE"
done
export OS_RELEASE_FILE=/nonexistent
check "a missing file reads as empty" "" "$(os_release ID)"
unset OS_RELEASE_FILE

echo "downloads are tried again when the connection dies halfway"
sleep() { :; }
attempts=0
curl() { attempts=$((attempts + 1)); [ "$attempts" -le "$FAIL_FIRST" ] && return 56; return 0; }
FAIL_FIRST=0; attempts=0; fetch http://x /dev/null; check "a download that works is fetched once" "0 1" "$? $attempts"
FAIL_FIRST=2; attempts=0; fetch http://x /dev/null; check "two dropped connections, then it works (curl exit 56 is retried)" "0 3" "$? $attempts"
FAIL_FIRST=99; attempts=0; fetch http://x /dev/null; check "it gives up after four tries" "1 4" "$? $attempts"
unset -f curl sleep
# shellcheck disable=SC2016 # the pattern is literal text, not something to expand
bad="$(grep -nE 'curl -fsSL' "$SCRIPT" | grep -v 'curl -fsSL --connect-timeout 20 "\$1" -o "\$2" && return 0' || true)"
check "no download bypasses fetch" "" "$bad"

echo "no code path sources os-release into the main shell"
bad="$(grep -nE '^[[:space:]]*(\.|source)[[:space:]]+/etc/os-release' "$SCRIPT" || true)"
check "nothing sources /etc/os-release directly" "" "$bad"

echo "versions"
for v in "" latest v0.2.0 0.2.0 v1.10.3 v0.3.0-rc.1 1.0.0-beta.2 main; do
  valid_version "$v"; check "accepted: '$v'" 0 "$?"
done
for v in "13 (trixie)" "v1.2" "1.2.3.4" "vv1.2.3" "../../etc" "1.2.3;rm" "v1.2.3 " "latest2"; do
  valid_version "$v"; check "refused: '$v'" 1 "$?"
done
check "tag gets its v" "v0.2.0" "$(normalize_tag 0.2.0)"
check "tag keeps its v" "v0.2.0" "$(normalize_tag v0.2.0)"

echo "interface helpers"
UI_LOG="$(mktemp)"
out="$(run "Say hello" echo hello 2>&1)"; rc=$?
check "run: a command that works returns 0" 0 "$rc"
case "$out" in *"Say hello"*) check "run: reports what it did" ok ok ;; *) check "run: reports what it did" ok "$out" ;; esac
check "run: keeps the command's output in the log, not on screen" "hello" "$(grep -x hello "$UI_LOG")"
case "$out" in *hello*"Say hello"* | *"Say hello"*hello*) check "run: does not print the command's output" "no" "yes" ;; *) check "run: does not print the command's output" ok ok ;; esac
out="$( ( run "Break things" sh -c 'echo boom-text >&2; exit 3' ) 2>&1 )"; rc=$?
check "run: a failing command ends the installer" 1 "$rc"
case "$out" in *"Break things failed"*) check "run: says which step failed" ok ok ;; *) check "run: says which step failed" ok "$out" ;; esac
case "$out" in *boom-text*) check "run: shows the command's own error" ok ok ;; *) check "run: shows the command's own error" ok "$out" ;; esac
run_soft "Soft failure" false >/dev/null 2>&1; check "run_soft: returns the exit status" 1 "$?"
out="$(box "Title" "one" "a much longer line of text")"
check "box: every line has the same width" 1 "$(printf '%s\n' "$out" | grep -v '^$' | awk '{ print length }' | sort -u | wc -l | tr -d ' ')"
UI_COLS=80
out="$(box "Title" "one" "a much longer line of text")"
check "box: a frame on a terminal that is wide enough" 4 "$(printf '%s\n' "$out" | grep -c "^[+|]")"
UI_COLS=24
out="$(box "Title" "a line that cannot fit inside a narrow terminal")"
check "box: no frame on a narrow terminal" 0 "$(printf '%s\n' "$out" | grep -c '^[+|]')"
check "box: ...but every line is still there" 1 "$(printf '%s\n' "$out" | grep -c 'cannot fit')"
UI_COLS=80
ui_init_cols() { COLUMNS="$1" ui_init; echo "$UI_COLS/$UI_WIDTH"; }
check "a 50-column terminal is not stretched to 60" "50/50" "$(ui_init_cols 50)"
check "a very wide terminal is capped at 100" "200/100" "$(ui_init_cols 200)"
check "an absurdly narrow one gets a floor" "24/24" "$(ui_init_cols 5)"
check "a junk COLUMNS falls back" "ok" "$(COLUMNS=abc ui_init; [ "$UI_COLS" -ge 24 ] && echo ok)"
# shellcheck disable=SC2034  # ASSUME_YES is read by is_interactive in the script under test
X=already; ASSUME_YES=1; prompt X "Question?" "" ""; check "prompt: leaves a value given on the command line alone" already "$X"
Y=""; prompt Y "Question?" "default" ""; check "prompt: asks nothing without a terminal" "" "$Y"
# shellcheck disable=SC2034
ASSUME_YES=0

echo "domain names"
for d in "" ping.example.com a.co sub-1.example.org; do valid_domain "$d"; check "accepted domain: '$d'" 0 "$?"; done
for d in "nope!" example -a.example.com a..b.com http://x.com x.com/path "a b.com" "$(printf 'a%.0s' $(seq 1 64)).example.com"; do valid_domain "$d"; check "refused domain: '${d:0:30}'" 1 "$?"; done

echo "the command line"
out="$(bash "$SCRIPT" --help 2>&1)"; rc=$?
check "--help exits 0" 0 "$rc"
case "$out" in *Usage:*) check "--help prints usage" ok ok ;; *) check "--help prints usage" ok "$out" ;; esac
out="$(bash "$SCRIPT" --version "13 (trixie)" install 2>&1)"; rc=$?
check "a bad --version is refused" 1 "$rc"
case "$out" in *"is not a version"*) check "...with a message that says so" ok ok ;; *) check "...with a message that says so" ok "$out" ;; esac
out="$(bash "$SCRIPT" --no-such-flag 2>&1)"; rc=$?
check "an unknown flag is refused" 1 "$rc"
out="$(bash "$SCRIPT" --help 2>&1)"
case "$out" in *geoip-update*) check "--help lists geoip-update" ok ok ;; *) check "--help lists geoip-update" ok "$out" ;; esac
check "the compose file gives the backend a volume for the databases" 1 "$(grep -c 'geoip:/data/geoip' compose.yaml)"
check "...and declares it" 1 "$(grep -c '^  geoip:' compose.yaml)"
case "$out" in *geofeed-update*) check "--help lists geofeed-update" ok ok ;; *) check "--help lists geofeed-update" ok "$out" ;; esac

echo "geofeed-update remembers the feeds it was given and passes them on"
gf="$(mktemp -d)"
CONF_DIR="$gf/conf"
need_root() { :; }; banner() { :; }; note() { :; }; ok() { :; }
require_mode() { echo docker; }
run() { shift; "$@"; }
compose() { printf '%s\n' "$*" >"$gf/compose.args"; }
GEOFEEDS=(https://a.example/geofeed.csv https://b.example/g.csv)
(cmd_geofeed_update) >/dev/null 2>&1
check "the feeds go to the backend, each as --url" "run --rm --no-deps backend geofeed-update --url https://a.example/geofeed.csv --url https://b.example/g.csv" "$(cat "$gf/compose.args")"
check "and are remembered, one a line" "https://a.example/geofeed.csv https://b.example/g.csv" "$(tr '\n' ' ' <"$CONF_DIR/geofeeds" | sed 's/ $//')"
rm -f "$gf/compose.args"
GEOFEEDS=()
(cmd_geofeed_update) >/dev/null 2>&1
check "with none named, the remembered ones are used" "run --rm --no-deps backend geofeed-update --url https://a.example/geofeed.csv --url https://b.example/g.csv" "$(cat "$gf/compose.args")"
GEOFEEDS=(https://c.example/only.csv)
(cmd_geofeed_update) >/dev/null 2>&1
check "naming feeds again replaces the list" "run --rm --no-deps backend geofeed-update --url https://c.example/only.csv" "$(cat "$gf/compose.args")"
rm -f "$gf/compose.args"
for bad in http://insecure.example/x.csv ftp://x.example/y file:///etc/passwd https:// "x.example/geofeed.csv"; do
  GEOFEEDS=("$bad")
  out="$( (cmd_geofeed_update) 2>&1 )"; rc=$?
  check "'$bad' is refused" 1 "$rc"
  case "$out" in *"must start with https://"*) check "...with a message that says so" ok ok ;; *) check "...with a message that says so" ok "$out" ;; esac
  check "...and nothing is fetched" "" "$(cat "$gf/compose.args" 2>/dev/null)"
done
GEOFEEDS=(); CONF_DIR="$gf/empty"
out="$( (cmd_geofeed_update) 2>&1 )"; rc=$?
check "with nothing named or remembered it asks for a feed" 1 "$rc"
case "$out" in *"--feed https://"*) check "...and shows how" ok ok ;; *) check "...and shows how" ok "$out" ;; esac
out="$(bash "$SCRIPT" --feed 2>&1)"
case "$out" in *"--feed needs an https address"*) check "--feed without an address is refused" ok ok ;; *) check "--feed without an address is refused" ok "$out" ;; esac
rm -rf "$gf"

echo "a proxy of your own in front: what is accepted"
ok_if() { if "$@" >/dev/null 2>&1; then echo yes; else echo no; fi; }
for good in 80 8080 65535; do check "port $good is valid" yes "$(ok_if valid_port "$good")"; done
for bad in 0 65536 abc "" 80a -1; do check "port '$bad' is refused" no "$(ok_if valid_port "$bad")"; done
check "a domain is required" no "$(ok_if valid_domain_required "")"
check "ping.example.com is a domain" yes "$(ok_if valid_domain_required ping.example.com)"
for good in 203.0.113.10 10.0.0.0/8 192.168.1.0/24 0.0.0.0/0 ::1 2001:db8::/32 fd00::1 2606:4700:4700::1111 1:2:3:4:5:6:7:8 ::; do
  check "'$good' is an address or network" yes "$(ok_if valid_ip_or_network "$good")"
done
for bad in 256.1.1.1 1.2.3 1.2.3.4/33 1.2.3.4/ 1.2.3.4/x ping.example.com "1.2.3.4;rm" "1.2.3.4 5.6.7.8" 2001:db8::/129 1:2:3:4:5:6:7 1::2::3 :::1 12345::1 'g::1' "" '$(id)'; do
  check "'$bad' is refused as an address" no "$(ok_if valid_ip_or_network "$bad")"
done
check "several addresses, spaces and commas" yes "$(ok_if valid_proxy_list "203.0.113.10, 10.0.0.0/8 private_ranges")"
check "private_ranges alone" yes "$(ok_if valid_proxy_list private_ranges)"
check "one bad address spoils the list" no "$(ok_if valid_proxy_list "203.0.113.10 nope")"
check "an empty list is refused" no "$(ok_if valid_proxy_list "")"
check "a list of 17 is refused" no "$(ok_if valid_proxy_list "$(for i in $(seq 1 17); do printf '10.0.0.%s ' "$i"; done)")"
check "a glob is not an address" no "$(ok_if valid_proxy_list '*')"
check "a header name" yes "$(ok_if valid_header_list CF-Connecting-IP)"
check "two header names" yes "$(ok_if valid_header_list "True-Client-IP, X-Real-IP")"
check "two names separated by a space are two headers" yes "$(ok_if valid_header_list "X Forwarded")"
for bad in "" "X.Forwarded" "X_Forwarded" "X-Real-IP;" "1Header" "A B C D E" '$(id)' "*"; do check "'$bad' is not a header list" no "$(ok_if valid_header_list "$bad")"; done
check "lists are written with single spaces" "10.0.0.0/8 203.0.113.10 private_ranges" "$(normalize_list " 10.0.0.0/8,203.0.113.10 ,, private_ranges ")"

echo "the settings for each way of sitting in front of the internet"
settings() { BEHIND_PROXY="$1" DOMAIN="$2" PROXY_IP="$3" CLIENT_IP_HEADER="$4"; site_settings; echo "$SITE_ADDRESS|$PUBLIC_URL|$COOKIE_SECURE|$TRUSTED_PROXIES|$CLIENT_IP_HEADERS|$HTTPS_PUBLISH"; }
check "no proxy, no domain: plain HTTP" ":80||false|||" "$(settings "" "" "" "")"
check "no proxy, a domain: Caddy serves HTTPS itself" "ping.example.com|https://ping.example.com|true|||" "$(settings 0 ping.example.com "" "")"
check "behind nginx: plain HTTP for it, https for the world, private networks trusted" ":80|https://ping.example.com|true|private_ranges|X-Forwarded-For|127.0.0.1::443" "$(settings 1 ping.example.com "" "")"
check "behind nginx on another server" ":80|https://ping.example.com|true|203.0.113.10|X-Forwarded-For|127.0.0.1::443" "$(settings 1 ping.example.com 203.0.113.10 "")"
check "behind nginx and Cloudflare: the visitor's address from Cloudflare first" ":80|https://ping.example.com|true|private_ranges|CF-Connecting-IP X-Forwarded-For|127.0.0.1::443" "$(settings 1 ping.example.com "" CF-Connecting-IP)"
check "several proxies, spaces tidied" ":80|https://p.example.org|true|10.0.0.5 10.0.0.6|True-Client-IP X-Forwarded-For|127.0.0.1::443" "$(settings 1 p.example.org "10.0.0.5,  10.0.0.6" True-Client-IP)"
out="$( (BEHIND_PROXY=1 DOMAIN="" site_settings) 2>&1 )"; rc=$?
check "a proxy without a domain is refused" 1 "$rc"
case "$out" in *"--domain"*) check "...saying to add --domain" ok ok ;; *) check "...saying to add --domain" ok "$out" ;; esac
for combo in "PROXY_IP=10.0.0.1" "CLIENT_IP_HEADER=CF-Connecting-IP"; do
  out="$( (BEHIND_PROXY=0 DOMAIN=ping.example.com; eval "$combo"; check_proxy_options) 2>&1 )"; rc=$?
  check "$combo without --behind-proxy is refused" 1 "$rc"
  case "$out" in *"add --behind-proxy"*) check "...saying to add --behind-proxy" ok ok ;; *) check "...saying to add --behind-proxy" ok "$out" ;; esac
done
(BEHIND_PROXY=1 DOMAIN=ping.example.com PROXY_IP=10.0.0.1; check_proxy_options) >/dev/null 2>&1; check "a proxy with a domain is fine" 0 "$?"

echo "the options on the command line"
out="$(bash "$SCRIPT" --proxy-ip "not an address" install 2>&1)"
case "$out" in *"is not a list of addresses"*) check "a bad --proxy-ip is refused up front" ok ok ;; *) check "a bad --proxy-ip is refused up front" ok "$out" ;; esac
out="$(bash "$SCRIPT" --client-ip-header "bad header!" install 2>&1)"
case "$out" in *"is not a header name"*) check "a bad --client-ip-header is refused up front" ok ok ;; *) check "a bad --client-ip-header is refused up front" ok "$out" ;; esac
out="$(bash "$SCRIPT" --help 2>&1)"
for word in --behind-proxy --proxy-ip --cloudflare --client-ip-header --no-proxy "  proxy "; do case "$out" in *"$word"*) check "--help mentions $word" ok ok ;; *) check "--help mentions $word" ok "missing" ;; esac; done

echo "the questions: scripted answers"
is_interactive() { return 0; }
ask() { ( HTTP_PORT_GIVEN=0 BEHIND_PROXY="" DOMAIN="" PROXY_IP="" CLIENT_IP_HEADER=""; "$@" ; echo; echo "RESULT $BEHIND_PROXY|$DOMAIN|$HTTP_PORT|$PROXY_IP|$CLIENT_IP_HEADER" ) 2>/dev/null | sed -n 's/^RESULT //p'; }
answers() { printf '%s\n' "$@"; }
check "no proxy: nothing else is asked" "0||80||" "$(answers 1 | ask proxy_questions 80)"
check "nginx on this machine, no CDN (the port suggested is taken)" "1|ping.example.com|8080||" "$(answers 2 ping.example.com "" 1 1 | ask proxy_questions 8080)"
check "nginx and Cloudflare" "1|ping.example.com|8080||CF-Connecting-IP" "$(answers 2 ping.example.com "" 1 2 | ask proxy_questions 8080)"
check "a proxy on another server, another CDN (the list is tidied later, when the settings are made)" "1|ping.example.com|9000|203.0.113.10, 10.0.0.0/8|True-Client-IP" "$(answers 2 ping.example.com 9000 2 "203.0.113.10, 10.0.0.0/8" 3 True-Client-IP | ask proxy_questions 8080)"
check "a bad domain, port and address are asked again" "1|ping.example.com|8081|10.0.0.9|" "$(answers 2 "not a domain" "-x" ping.example.com 70000 8081 2 "10.0.0.9 oops" 10.0.0.9 1 | ask proxy_questions 8080)"
check "an out-of-range choice is asked again" "0||80||" "$(answers 7 abc 1 | ask proxy_questions 80)"
check "what was given as an option is not asked" "1|ping.example.com|9090|10.0.0.1|CF-Connecting-IP" "$( (HTTP_PORT=9090; HTTP_PORT_GIVEN=1; BEHIND_PROXY=1; DOMAIN=ping.example.com; PROXY_IP=10.0.0.1; CLIENT_IP_HEADER=CF-Connecting-IP; proxy_questions 80; echo; echo "RESULT $BEHIND_PROXY|$DOMAIN|$HTTP_PORT|$PROXY_IP|$CLIENT_IP_HEADER") </dev/null 2>/dev/null | sed -n 's/^RESULT //p')"
is_interactive() { return 1; }   # not a terminal, as under test

echo "settings files are changed one line at a time"
pf="$(mktemp -d)"
printf 'A=1\nB="two words"\nC=3\n' >"$pf/f.env"; chmod 640 "$pf/f.env"
check "a quoted value is read without its quotes" "two words" "$(conf_get "$pf/f.env" B)"
check "a missing key is empty" "" "$(conf_get "$pf/f.env" Z)"
check "a missing file is empty" "" "$(conf_get "$pf/none" A)"
conf_set "$pf/f.env" B '"x y z"'; conf_set "$pf/f.env" D 4; conf_set "$pf/f.env" D 5
check "set replaces one line, appends a new one, and never repeats a key" "A=1|B=\"x y z\"|C=3|D=5" "$(tr '\n' '|' <"$pf/f.env" | sed 's/|$//')"
conf_unset "$pf/f.env" B; conf_unset "$pf/f.env" NOPE
check "unset removes just that line" "A=1|C=3|D=5" "$(tr '\n' '|' <"$pf/f.env" | sed 's/|$//')"
check "the file's mode is kept" 640 "$(stat -c %a "$pf/f.env" 2>/dev/null || stat -f %Lp "$pf/f.env")"
rm -rf "$pf"

echo "the address people are told to use"
pf="$(mktemp -d)"; APP_DIR="$pf"; CONF_DIR="$pf/conf"; mkdir -p "$CONF_DIR"
require_mode() { echo "$FAKE_MODE"; }
FAKE_MODE=docker
printf 'IPPING_SITE_ADDRESS=:80\nIPPING_PUBLIC_URL=https://ping.example.com\nIPPING_HTTP_PORT=8080\nIPPING_TRUSTED_PROXIES="10.0.0.0/8 203.0.113.10"\nIPPING_CLIENT_IP_HEADER="CF-Connecting-IP X-Forwarded-For"\n' >"$APP_DIR/.env"
check "behind a proxy the address is the https one, not this machine's port" "https://ping.example.com" "$(public_address)"
check "the proxy settings are read without quotes (Docker)" "10.0.0.0/8 203.0.113.10" "$(proxy_setting IPPING_TRUSTED_PROXIES)"
FAKE_MODE=direct
printf 'IPPING_SITE_ADDRESS=:8080\nIPPING_TRUSTED_PROXIES="private_ranges"\n' >"$CONF_DIR/caddy.env"
printf 'IPPING_PUBLIC_URL=https://ping.example.com/\n' >"$CONF_DIR/backend.env"
check "...and in direct mode, a trailing slash tidied" "https://ping.example.com" "$(public_address)"
check "the proxy settings are read without quotes (direct)" "private_ranges" "$(proxy_setting IPPING_TRUSTED_PROXIES)"
check "the port is the one ipping listens on" 8080 "$(http_port)"
printf 'IPPING_PUBLIC_URL=\n' >"$CONF_DIR/backend.env"; printf 'IPPING_SITE_ADDRESS=:8080\n' >"$CONF_DIR/caddy.env"
hostname() { echo "192.0.2.7 "; }
check "no public URL: this machine and its port, as before" "http://192.0.2.7:8080" "$(public_address)"
check "no proxy settings: none reported" "" "$(proxy_setting IPPING_TRUSTED_PROXIES)"
unset -f hostname require_mode

echo "what the installer tells you to put in the proxy"
FAKE_MODE=docker; require_mode() { echo docker; }; hostname() { echo "192.0.2.7 "; }
APP_DIR="$pf"; printf 'IPPING_HTTP_PORT=8080\nIPPING_CLIENT_IP_HEADER="CF-Connecting-IP X-Forwarded-For"\n' >"$APP_DIR/.env"
hints="$(proxy_hints https://ping.example.com 2>&1)"
for want in "proxy_pass http://192.0.2.7:8080;" 'proxy_set_header Host $host;' 'proxy_set_header Upgrade $http_upgrade;' 'proxy_set_header Connection $connection_upgrade;' "server_name ping.example.com;" "proxy_buffering off;" "Full (strict)" "CF-Connecting-IP"; do
  case "$hints" in *"$want"*) check "the hints contain: $want" ok ok ;; *) check "the hints contain: $want" ok "missing" ;; esac
done
printf 'IPPING_HTTP_PORT=8080\nIPPING_CLIENT_IP_HEADER="X-Forwarded-For"\n' >"$APP_DIR/.env"
hints="$(proxy_hints https://ping.example.com 2>&1)"
case "$hints" in *"Full (strict)"*) check "without a CDN, nothing about Cloudflare" none "mentioned" ;; *) check "without a CDN, nothing about Cloudflare" none none ;; esac
unset -f hostname require_mode
rm -rf "$pf"

echo "changing an installation with the proxy command"
pf="$(mktemp -d)"; APP_DIR="$pf/app"; CONF_DIR="$pf/conf"; mkdir -p "$APP_DIR/deploy" "$CONF_DIR"
need_root() { :; }; banner() { :; }; ok() { :; }; note() { :; }; info() { :; }; need_systemd() { :; }
run() { shift; "$@"; }; run_soft() { shift; "$@"; }; wait_for_ready() { :; }; port_in_use() { return 1; }
require_mode() { echo "$FAKE_MODE"; }; hostname() { echo "192.0.2.7"; }
compose() { echo "compose $*" >>"$pf/actions"; }
systemctl() { echo "systemctl $*" >>"$pf/actions"; }
reset_opts() { BEHIND_PROXY="" DOMAIN="" PROXY_IP="" CLIENT_IP_HEADER="" HTTP_PORT=80 HTTP_PORT_GIVEN=0; }

FAKE_MODE=docker
printf 'IPPING_TRUSTED_PROXIES\n' >"$APP_DIR/deploy/Caddyfile"
printf 'IPPING_SITE_ADDRESS=ping.example.com\nIPPING_PUBLIC_URL=https://ping.example.com\nIPPING_COOKIE_SECURE=true\nIPPING_HTTP_PORT=80\nIPPING_HTTPS_PORT=443\n' >"$APP_DIR/.env"; chmod 600 "$APP_DIR/.env"
reset_opts; BEHIND_PROXY=1 DOMAIN=ping.example.com CLIENT_IP_HEADER=CF-Connecting-IP HTTP_PORT=8080 HTTP_PORT_GIVEN=1
(cmd_proxy) >/dev/null 2>&1
env_line() { grep "^$1=" "$APP_DIR/.env"; }
check "Docker: Caddy serves plain HTTP for the proxy" "IPPING_SITE_ADDRESS=:80" "$(env_line IPPING_SITE_ADDRESS)"
check "Docker: the public address stays https" "IPPING_PUBLIC_URL=https://ping.example.com" "$(env_line IPPING_PUBLIC_URL)"
check "Docker: cookies stay secure" "IPPING_COOKIE_SECURE=true" "$(env_line IPPING_COOKIE_SECURE)"
check "Docker: the port is the one given" "IPPING_HTTP_PORT=8080" "$(env_line IPPING_HTTP_PORT)"
check "Docker: private networks are trusted" 'IPPING_TRUSTED_PROXIES="private_ranges"' "$(env_line IPPING_TRUSTED_PROXIES)"
check "Docker: Cloudflare's header first" 'IPPING_CLIENT_IP_HEADER="CF-Connecting-IP X-Forwarded-For"' "$(env_line IPPING_CLIENT_IP_HEADER)"
check "Docker: 443 is not taken from the proxy" "IPPING_HTTPS_PUBLISH=127.0.0.1::443" "$(env_line IPPING_HTTPS_PUBLISH)"
check "Docker: the stack is recreated" "compose up -d" "$(tail -1 "$pf/actions")"
check "Docker: the .env stays private" 600 "$(stat -c %a "$APP_DIR/.env" 2>/dev/null || stat -f %Lp "$APP_DIR/.env")"
rm -f "$pf/actions"
reset_opts; BEHIND_PROXY=0 DOMAIN=ping.example.com
(cmd_proxy) >/dev/null 2>&1
check "Docker, back to ipping serving itself: Caddy has the domain again" "IPPING_SITE_ADDRESS=ping.example.com" "$(env_line IPPING_SITE_ADDRESS)"
check "...the proxy settings are gone" "0" "$(grep -c 'TRUSTED_PROXIES\|CLIENT_IP_HEADER\|HTTPS_PUBLISH' "$APP_DIR/.env")"
check "...and it takes port 80 back, which its certificate needs" "IPPING_HTTP_PORT=80" "$(env_line IPPING_HTTP_PORT)"
reset_opts; BEHIND_PROXY=0 DOMAIN=ping.example.com HTTP_PORT=8088 HTTP_PORT_GIVEN=1
(cmd_proxy) >/dev/null 2>&1
check "...unless a port was asked for" "IPPING_HTTP_PORT=8088" "$(env_line IPPING_HTTP_PORT)"
is_interactive() { return 0; }
reset_opts; BEHIND_PROXY=0
(cmd_proxy <<< "ping.example.org") >/dev/null 2>&1
check "answering no to a proxy, the domain is asked for (interactive)" "IPPING_SITE_ADDRESS=ping.example.org" "$(env_line IPPING_SITE_ADDRESS)"
reset_opts; BEHIND_PROXY=0
(cmd_proxy <<< "") >/dev/null 2>&1
check "...and an empty answer means plain HTTP" "IPPING_SITE_ADDRESS=:80" "$(env_line IPPING_SITE_ADDRESS)"
is_interactive() { return 1; }   # not a terminal, as under test
reset_opts; BEHIND_PROXY=1 DOMAIN=ping.example.com HTTP_PORT=8080 HTTP_PORT_GIVEN=1
(cmd_proxy) >/dev/null 2>&1
check "(set up again for the next checks)" "IPPING_HTTP_PORT=8080" "$(env_line IPPING_HTTP_PORT)"
compose() { echo "compose $*" >>"$pf/actions"; grep -q "^IPPING_TRUSTED_PROXIES=" "$APP_DIR/.env" && [ -n "${FAIL_PROXY_APPLY:-}" ] && return 1; return 0; }
before="$(cat "$APP_DIR/.env")"
reset_opts; BEHIND_PROXY=1 DOMAIN=ping.example.org PROXY_IP=203.0.113.9 HTTP_PORT=9999 HTTP_PORT_GIVEN=1; FAIL_PROXY_APPLY=1
rm -f "$pf/actions"
out="$( (cmd_proxy) 2>&1 )"; rc=$?
check "a change that cannot be applied fails" 1 "$rc"
case "$out" in *"previous settings were put back"*) check "...and says it put the settings back" ok ok ;; *) check "...and says it put the settings back" ok "$out" ;; esac
check "...the file is exactly as it was" "$before" "$(cat "$APP_DIR/.env")"
check "...and the stack was started again with it" "2" "$(grep -c 'compose up -d' "$pf/actions")"
check "...the file kept its mode" 600 "$(stat -c %a "$APP_DIR/.env" 2>/dev/null || stat -f %Lp "$APP_DIR/.env")"
unset FAIL_PROXY_APPLY
compose() { echo "compose $*" >>"$pf/actions"; }
port_in_use() { [ "$1" = 443 ]; }; port_owner() { echo nginx; }
rm -f "$pf/actions"
reset_opts; BEHIND_PROXY=0 DOMAIN=ping.example.com
out="$( (cmd_proxy) 2>&1 )"; rc=$?
check "leaving the proxy while it still holds 443 is refused" 1 "$rc"
case "$out" in *"Port 443 is in use by nginx"*) check "...naming the port and who has it" ok ok ;; *) check "...naming the port and who has it" ok "$out" ;; esac
check "...before anything is changed" "IPPING_HTTP_PORT=8080" "$(env_line IPPING_HTTP_PORT)"
check "...and nothing was restarted" "" "$(cat "$pf/actions" 2>/dev/null)"
reset_opts; BEHIND_PROXY=0 DOMAIN=ping.example.com; HTTP_PORT_GIVEN=0
port_in_use() { [ "$1" = 80 ]; }
out="$( (cmd_proxy) 2>&1 )"; rc=$?
case "$out" in *"Port 80 is already in use by nginx"*) check "...and so is 80, which ipping's certificate needs" ok ok ;; *) check "...and so is 80, which ipping's certificate needs" ok "$out" ;; esac
port_in_use() { return 1; }; unset -f port_owner
reset_opts; BEHIND_PROXY=1 PROXY_IP="203.0.113.10,198.51.100.0/24" DOMAIN=ping.example.com
(cmd_proxy) >/dev/null 2>&1
check "Docker: a proxy on another server, and the port kept" 'IPPING_TRUSTED_PROXIES="203.0.113.10 198.51.100.0/24"' "$(env_line IPPING_TRUSTED_PROXIES)"
check "Docker: the port was kept" "IPPING_HTTP_PORT=8080" "$(env_line IPPING_HTTP_PORT)"

printf 'nothing about a proxy\n' >"$APP_DIR/deploy/Caddyfile"
reset_opts; BEHIND_PROXY=1 DOMAIN=ping.example.com
out="$( (cmd_proxy) 2>&1 )"; rc=$?
check "an installation from an older release is told to update first" 1 "$rc"
case "$out" in *"Run 'update' first"*) check "...with that message" ok ok ;; *) check "...with that message" ok "$out" ;; esac

FAKE_MODE=direct
printf 'IPPING_TRUSTED_PROXIES\n' >"$CONF_DIR/Caddyfile"
printf 'IPPING_SITE_ADDRESS=:80\n' >"$CONF_DIR/caddy.env"
printf 'IPPING_DATABASE_URL=postgresql://x\nIPPING_PUBLIC_URL=\nIPPING_COOKIE_SECURE=false\nIPPING_PORT=8000\n' >"$CONF_DIR/backend.env"; chmod 640 "$CONF_DIR/backend.env"
rm -f "$pf/actions"
reset_opts; BEHIND_PROXY=1 DOMAIN=ping.example.com CLIENT_IP_HEADER=CF-Connecting-IP HTTP_PORT=8080 HTTP_PORT_GIVEN=1
(cmd_proxy) >/dev/null 2>&1
check "direct: Caddy listens on the chosen port, plain HTTP" "IPPING_SITE_ADDRESS=:8080" "$(grep '^IPPING_SITE_ADDRESS=' "$CONF_DIR/caddy.env")"
check "direct: private networks are trusted" 'IPPING_TRUSTED_PROXIES="private_ranges"' "$(grep '^IPPING_TRUSTED_PROXIES=' "$CONF_DIR/caddy.env")"
check "direct: Cloudflare's header first" 'IPPING_CLIENT_IP_HEADER="CF-Connecting-IP X-Forwarded-For"' "$(grep '^IPPING_CLIENT_IP_HEADER=' "$CONF_DIR/caddy.env")"
check "direct: the backend knows the public address" "IPPING_PUBLIC_URL=https://ping.example.com" "$(grep '^IPPING_PUBLIC_URL=' "$CONF_DIR/backend.env")"
check "direct: and that visitors use https" "IPPING_COOKIE_SECURE=true" "$(grep '^IPPING_COOKIE_SECURE=' "$CONF_DIR/backend.env")"
check "direct: the database setting is untouched" "IPPING_DATABASE_URL=postgresql://x" "$(grep '^IPPING_DATABASE_URL=' "$CONF_DIR/backend.env")"
check "direct: the backend's mode is kept" 640 "$(stat -c %a "$CONF_DIR/backend.env" 2>/dev/null || stat -f %Lp "$CONF_DIR/backend.env")"
check "direct: both services are restarted" "systemctl restart ipping-backend ipping-caddy" "$(tail -1 "$pf/actions")"
reset_opts; BEHIND_PROXY=0
(cmd_proxy) >/dev/null 2>&1
check "direct, back to plain HTTP: no proxy settings left" "IPPING_SITE_ADDRESS=:8080" "$(cat "$CONF_DIR/caddy.env")"
check "direct, back to plain HTTP: no public address" "IPPING_PUBLIC_URL=" "$(grep '^IPPING_PUBLIC_URL=' "$CONF_DIR/backend.env")"
check "direct, back to plain HTTP: cookies need not be secure" "IPPING_COOKIE_SECURE=false" "$(grep '^IPPING_COOKIE_SECURE=' "$CONF_DIR/backend.env")"
reset_opts
out="$( (cmd_proxy) 2>&1 )"; rc=$?
check "with nothing said and nobody to ask, it says what to do" 1 "$rc"
case "$out" in *"Say what you want"*) check "...with that message" ok ok ;; *) check "...with that message" ok "$out" ;; esac
unset -f need_root banner ok note info need_systemd run run_soft wait_for_ready port_in_use require_mode hostname compose systemctl
rm -rf "$pf"

echo
if [ "$failures" -eq 0 ]; then echo "all passed"; else echo "$failures failed"; exit 1; fi
