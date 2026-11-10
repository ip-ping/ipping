#!/bin/bash
# Tests for scripts/ipping-cli.sh against a stand-in server: what it asks for, how it passes the key, what
# it does with errors. Needs python3 and curl.
# The trap handler and the predicates passed to `check` are called indirectly (ShellCheck 0.10 says SC2317, newer
# versions SC2329), so both are silenced for the file.
# shellcheck disable=SC2317,SC2329
set -eu
cd "$(dirname "$0")/.."
cli="$PWD/scripts/ipping-cli.sh"
work="$(mktemp -d)"
server_pid=""
cleanup() {
  [ -z "$server_pid" ] || kill "$server_pid" 2>/dev/null || true
  [ -z "$server_pid" ] || wait "$server_pid" 2>/dev/null || true
  rm -rf "$work"
}
trap cleanup EXIT

cat >"$work/server.py" <<'PY'
import http.server, json, sys, urllib.parse
log = sys.argv[1]
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        url = urllib.parse.urlsplit(self.path)
        with open(log, "a") as f:
            f.write(json.dumps({"path": url.path, "query": urllib.parse.parse_qs(url.query), "auth": self.headers.get("Authorization")}) + "\n")
        key = (self.headers.get("Authorization") or "").removeprefix("Bearer ")
        if key == "ipk_good":
            body, code = b"Ping example.com (fake)\n\n1 of 1 nodes answered. Measured with ipping.\n", 200
        elif key == "ipk_limited":
            body, code = json.dumps({"error": {"code": "rate_limited", "message": "This key may start 2 measurements a minute."}}).encode(), 429
        else:
            body, code = json.dumps({"error": {"code": "invalid_api_key", "message": "That API key is not valid."}}).encode(), 401
        self.send_response(code); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)
    def log_message(self, *a): pass
s = http.server.HTTPServer(("127.0.0.1", 0), H)
open(sys.argv[2], "w").write(str(s.server_address[1]))
s.serve_forever()
PY
: >"$work/log"
python3 "$work/server.py" "$work/log" "$work/port" &
server_pid=$!
for _ in $(seq 1 50); do
  [ -s "$work/port" ] && break
  sleep 0.1
done
site="http://127.0.0.1:$(cat "$work/port")"

# a curl that notes what it was given before running the real one
mkdir -p "$work/bin"
real_curl="$(command -v curl)"
cat >"$work/bin/curl" <<SH
#!/bin/sh
printf '%s\n' "\$*" >>"$work/curl-args"
exec "$real_curl" "\$@"
SH
chmod +x "$work/bin/curl"

fail=0
check() { # name, then a command that must succeed
  local name="$1"
  shift
  if "$@"; then printf 'ok   %s\n' "$name"; else printf 'FAIL %s\n' "$name"; fail=1; fi
}
eq() { [ "$1" = "$2" ]; }
has() { grep -q -- "$2" <<<"$1"; }
# what the stand-in server last heard: the path, a query parameter, the Authorization header
heard() { python3 -c 'import json,sys; d=json.loads(sys.argv[1]); print(d["path"] if sys.argv[2] == "@path" else d["auth"] if sys.argv[2] == "@auth" else d["query"].get(sys.argv[2], [""])[0])' "$(tail -n 1 "$work/log")" "$1"; }

export PATH="$work/bin:$PATH"
out="$("$cli" -s "$site" -k ipk_good ping example.com 2>&1)"
check "prints the report" eq "$out" "Ping example.com (fake)

1 of 1 nodes answered. Measured with ipping."
check "asks for the text path" eq "$(heard @path)" /api/v1/text
check "sends the key as a Bearer token" eq "$(heard @auth)" "Bearer ipk_good"
check "sends the target" eq "$(heard target)" example.com
check "sends the kind" eq "$(heard kind)" ping

"$cli" -s "$site" -k ipk_good -n 3 -p 8443 -f -w 5 -c "DE,NL" http "https://example.com/a b?x=1&y=2" >/dev/null
check "encodes a URL target" eq "$(heard target)" "https://example.com/a b?x=1&y=2"
check "passes the count" eq "$(heard count)" 3
check "passes the port" eq "$(heard port)" 8443
check "passes follow redirects" eq "$(heard follow_redirects)" true
check "passes the wait" eq "$(heard wait)" 5
check "passes the countries" eq "$(heard countries)" "DE,NL"

"$cli" -s "$site" -k ipk_good -t MX -r google dns example.com >/dev/null
check "dns kind" eq "$(heard kind)" dns
check "dns record type" eq "$(heard record_type)" MX
check "dns resolver" eq "$(heard resolver)" google
"$cli" -s "$site" -k ipk_good -r cloudflare -T doh dns example.com >/dev/null
check "dns transport" eq "$(heard transport)" doh
"$cli" -s "$site" -k ipk_good -C ping example.com >/dev/null
check "community nodes are asked for with -C" eq "$(heard include_community)" true
"$cli" -s "$site" -k ipk_good ping example.com >/dev/null
check "and left out otherwise" eq "$(heard include_community)" ""
"$cli" -s "$site" -k ipk_good -R 9f3c0a ping example.com >/dev/null
check "a node to resolve the name is asked for with -R" eq "$(heard resolve_node_id)" 9f3c0a
check "and that makes the address one for every node" eq "$(heard dns_mode)" fixed
"$cli" -s "$site" -k ipk_good ping example.com >/dev/null
check "each node resolves it otherwise (the server's default)" eq "$(heard dns_mode)$(heard resolve_node_id)" ""
"$cli" -s "$site" -k ipk_good trace example.com >/dev/null
check "trace is traceroute" eq "$(heard kind)" traceroute
"$cli" -s "$site" -k ipk_good -n 3 trace example.com >/dev/null
check "rounds are the count of a traceroute" eq "$(heard count)" 3
"$cli" -s "$site" -k ipk_good -p 8443 tls example.com >/dev/null
check "tls kind" eq "$(heard kind)" tls
check "tls port" eq "$(heard port)" 8443

IPPING_SERVER="$site/" IPPING_API_KEY=ipk_good "$cli" ping example.com >/dev/null
check "reads the environment and ignores a trailing slash" eq "$(heard target)" example.com

mkdir -p "$work/home/ipping"
printf '%s\n' "$site" >"$work/home/ipping/server"
printf 'ipk_good\n' >"$work/home/ipping/key"
chmod 600 "$work/home/ipping/key"
XDG_CONFIG_HOME="$work/home" "$cli" ping example.com >/dev/null 2>"$work/err"
check "reads the config files" eq "$(heard target)" example.com
check "and says nothing about a private key file" test ! -s "$work/err"
chmod 644 "$work/home/ipping/key"
XDG_CONFIG_HOME="$work/home" "$cli" ping example.com >/dev/null 2>"$work/err"
check "warns about a readable key file" grep -q "readable by other users" "$work/err"

# the key is given to curl on its standard input, never as an argument that a process list would show
check "the key never appears among curl's arguments" test -s "$work/curl-args"
check "(no argument carries it)" eq "$(grep -c ipk_ "$work/curl-args" || true)" 0

set +e
msg="$("$cli" -s "$site" -k ipk_limited ping example.com 2>&1)"
code=$?
check "a refusal exits 2" eq "$code" 2
check "and shows the server's reason" eq "$msg" "ipping-cli: This key may start 2 measurements a minute. (HTTP 429)"
msg="$("$cli" -s "$site" -k ipk_nope ping example.com 2>&1)"
code=$?
check "a bad key exits 2" eq "$code" 2
check "and says so" has "$msg" "not valid"
"$cli" -s "$site" ping >/dev/null 2>&1
check "a missing target exits 1" eq "$?" 1
env -u IPPING_API_KEY -u IPPING_SERVER XDG_CONFIG_HOME="$work/none" "$cli" -s "$site" ping example.com >/dev/null 2>&1
check "a missing key exits 1" eq "$?" 1
"$cli" -s "$site" -k ipk_good scan example.com >/dev/null 2>&1
check "an unknown kind exits 1" eq "$?" 1
"$cli" -s "ftp://x" -k ipk_good ping example.com >/dev/null 2>&1
check "a site that is not http exits 1" eq "$?" 1
msg="$("$cli" -s "http://203.0.113.9" -k ipk_good -w 1 ping example.com 2>&1 | head -n 1)"
check "warns when the key would travel unencrypted" has "$msg" "not HTTPS"
set -e
exit "$fail"
