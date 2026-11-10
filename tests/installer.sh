#!/usr/bin/env bash
# shellcheck disable=SC2329,SC2317,SC2034  # test doubles and variables that the sourced script uses; shellcheck cannot see that
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

echo
if [ "$failures" -eq 0 ]; then echo "all passed"; else echo "$failures failed"; exit 1; fi
