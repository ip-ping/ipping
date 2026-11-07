#!/usr/bin/env bash
#
# ipping installer: the whole central application (frontend + backend + PostgreSQL + reverse proxy)
# on one host, in Docker or directly on the system (systemd, no Docker). Measurement nodes are
# installed separately with ipping-node.sh. The menu and command layout follow tonyliuzj/file-node
# (MIT).
#
#   sudo bash ipping.sh install --mode docker
#   sudo bash ipping.sh install --mode direct --domain ping.example.com
#   sudo bash ipping.sh {update|start|stop|restart|status|logs|doctor|backup|restore FILE|uninstall}
#
# A release of this repository publishes a release-manifest.json naming the exact frontend and
# backend versions that were tested together. The installer installs that combination; it never
# fetches "the latest frontend" and "the latest backend" separately. Everything downloaded is
# verified against a checksum, nothing is upgraded behind your back, and an update takes a database
# backup before the schema changes.

set -euo pipefail

REPO="${IPPING_REPO:-ip-ping/ipping}"
RELEASE_BASE="${IPPING_RELEASE_BASE:-https://github.com/${REPO}/releases/download}"
RAW_BASE="${IPPING_RAW_BASE:-https://raw.githubusercontent.com/${REPO}}"
API_BASE="${IPPING_API_BASE:-https://api.github.com/repos/${REPO}}"
DOCKERHUB_NAMESPACE="${IPPING_DOCKERHUB_NAMESPACE:-tonyliuzj}"

APP_DIR="${IPPING_DIR:-/opt/ipping}"
CONF_DIR="${IPPING_CONF_DIR:-/etc/ipping}"
BACKUP_DIR="${IPPING_BACKUP_DIR:-/var/backups/ipping}"
MODE_FILE="${APP_DIR}/mode"
VERSION_FILE="${APP_DIR}/version"
COMPOSE_PROJECT="ipping"

# Runtimes that direct mode downloads (pinned, each checked against its publisher's checksums).
NODE_VERSION_DEFAULT="22.23.4"
CADDY_VERSION_DEFAULT="2.11.8"
UV_VERSION_DEFAULT="0.13.7"

ASSUME_YES=0
MODE=""
VERSION=""
DOMAIN=""
HTTP_PORT="80"
HTTPS_PORT="443"
BACKEND_WORKERS="1"
DATABASE_URL=""
PURGE=0
SETUP_TOKEN=""

# ------------------------------------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------------------------------------

# ------------------------------------------------------------------------------------------------
# Terminal interface
#
# These helpers are shared with the other ipping installer and kept identical in both. Colour,
# symbols and the spinner appear only on a terminal that can show them (NO_COLOR is honoured); in a
# pipe or a log file the same information is printed as plain lines. Slow commands go through `run`:
# their output is written to a log file and shown only if the command fails.
# ------------------------------------------------------------------------------------------------

UI_LOG="/dev/null"
UI_SPINNER_PID=""

ui_init() {
  UI_TTY=0; UI_COLOR=0; UI_UNICODE=0
  if [ -t 1 ]; then UI_TTY=1; fi
  if [ "$UI_TTY" -eq 1 ] && [ -z "${NO_COLOR:-}" ] && [ "${TERM:-dumb}" != "dumb" ]; then UI_COLOR=1; fi
  case "${LC_ALL:-${LC_CTYPE:-${LANG:-}}}" in *[Uu][Tt][Ff]-8* | *[Uu][Tt][Ff]8*) UI_UNICODE=1 ;; esac
  if [ "$UI_TTY" -eq 0 ]; then UI_UNICODE=0; fi
  # UI_COLS is how wide the terminal really is; UI_WIDTH what the layout uses (never wider than 100).
  UI_COLS="${COLUMNS:-}"
  case "$UI_COLS" in '' | *[!0-9]*) UI_COLS="$(tput cols 2>/dev/null || echo 80)" ;; esac
  case "$UI_COLS" in '' | *[!0-9]*) UI_COLS=80 ;; esac
  if [ "$UI_COLS" -lt 24 ]; then UI_COLS=24; fi
  UI_WIDTH=$UI_COLS
  if [ "$UI_WIDTH" -gt 100 ]; then UI_WIDTH=100; fi
  if [ "$UI_COLOR" -eq 1 ]; then
    C_BOLD=$'\033[1m'; C_DIM=$'\033[2m'; C_RED=$'\033[31m'; C_GREEN=$'\033[32m'
    C_YELLOW=$'\033[33m'; C_CYAN=$'\033[36m'; C_RESET=$'\033[0m'
  else
    C_BOLD=""; C_DIM=""; C_RED=""; C_GREEN=""; C_YELLOW=""; C_CYAN=""; C_RESET=""
  fi
  if [ "$UI_UNICODE" -eq 1 ]; then
    S_OK="✔"; S_FAIL="✖"; S_WARN="!"; S_STEP="▸"; S_UP="●"; S_DOWN="○"; S_SEP="·"
    S_H="─"; S_V="│"; S_TL="┌"; S_TR="┐"; S_BL="└"; S_BR="┘"
    UI_SPIN=("⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏")
  else
    S_OK="ok"; S_FAIL="!!"; S_WARN="!"; S_STEP="==>"; S_UP="*"; S_DOWN="-"; S_SEP="-"
    S_H="-"; S_V="|"; S_TL="+"; S_TR="+"; S_BL="+"; S_BR="+"
    UI_SPIN=("-" "\\" "|" "/")
  fi
}
ui_init

ui_rule() {
  local width=$UI_WIDTH line="" i
  if [ "$width" -gt 64 ]; then width=64; fi
  for ((i = 0; i < width; i++)); do line+="$S_H"; done
  printf '%s%s%s\n' "$C_DIM" "$line" "$C_RESET"
}

banner() { # banner TITLE [SUBTITLE]
  printf '\n%s%s%s' "$C_BOLD" "$1" "$C_RESET"
  if [ -n "${2:-}" ]; then
    # Beside the title if it fits, on its own line if not (a wrapped line would split a word).
    if [ $((${#1} + ${#2} + 2)) -lt "$UI_COLS" ]; then printf '  '; else printf '\n'; fi
    printf '%s%s%s' "$C_DIM" "$2" "$C_RESET"
  fi
  printf '\n'
  ui_rule
}

step() { printf '\n%s%s%s %s%s%s\n' "$C_CYAN" "$S_STEP" "$C_RESET" "$C_BOLD" "$*" "$C_RESET"; }
info() { printf '  %s\n' "$*"; }
note() { printf '  %s%s%s\n' "$C_DIM" "$*" "$C_RESET"; }
# para INDENT TEXT   dim text, wrapped at word boundaries to the width of the terminal.
para() {
  local pad="" i
  for ((i = 0; i < $1; i++)); do pad+=" "; done
  printf '%s\n' "$2" | fold -s -w $((UI_WIDTH - $1 - 1)) | sed "s/ *$//; s/^/${pad}/; s/^\(.*\)\$/${C_DIM}\1${C_RESET}/"
}
tick() { printf '  %s%s%s %s\n' "$C_GREEN" "$S_OK" "$C_RESET" "$*"; }
warn() { printf '  %s%s%s %s\n' "$C_YELLOW" "$S_WARN" "$C_RESET" "$*" >&2; }
ok() { printf '\n%s%s%s %s%s%s\n' "$C_GREEN" "$S_OK" "$C_RESET" "$C_BOLD" "$*" "$C_RESET"; }
die() { printf '\n%s%s%s %s\n' "$C_RED" "$S_FAIL" "$C_RESET" "$*" >&2; exit 1; }

# The file that collects the output of commands run through `run`.
ui_log_init() { # ui_log_init DEFAULT_PATH
  UI_LOG="${IPPING_LOG:-$1}"
  if ! { mkdir -p "$(dirname "$UI_LOG")" && : >>"$UI_LOG"; } 2>/dev/null; then UI_LOG="$(mktemp)"; fi
  chmod 600 "$UI_LOG" 2>/dev/null || true
  printf '\n===== %s  %s =====\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$(basename "$0")" >>"$UI_LOG"
}

ui_log_tail() {
  if [ "$UI_LOG" = "/dev/null" ] || [ ! -f "$UI_LOG" ]; then return 0; fi
  printf '\n  %slast lines of the output (everything is in %s):%s\n' "$C_DIM" "$UI_LOG" "$C_RESET" >&2
  tail -n 15 "$UI_LOG" | sed 's/^/    /' >&2
}

ui_spin_start() {
  UI_SPINNER_PID=""
  if [ "$UI_TTY" -ne 1 ]; then return 0; fi
  printf '\033[?25l'
  (
    i=0
    n=${#UI_SPIN[@]}
    while :; do
      # Cut to one line: a wrapped spinner line leaves its first row behind when it is cleared.
      printf '\r\033[K  %s%s%s %s' "$C_CYAN" "${UI_SPIN[i % n]}" "$C_RESET" "${1:0:$((UI_COLS - 6))}"
      i=$((i + 1))
      sleep 0.1
    done
  ) &
  UI_SPINNER_PID=$!
}

ui_spin_stop() {
  if [ -n "$UI_SPINNER_PID" ]; then
    kill "$UI_SPINNER_PID" 2>/dev/null || true
    wait "$UI_SPINNER_PID" 2>/dev/null || true
    UI_SPINNER_PID=""
    printf '\r\033[K\033[?25h'
  fi
}

# run_soft "what this does" command args...   shows progress, returns the command's exit status.
# The command must be a program (or a function that is a single command): a function with several
# commands loses `set -e` inside it here, because it is called as part of a `||` list.
run_soft() {
  local what="$1" start=$SECONDS rc=0 took suffix=""
  shift
  printf '\n-- %s\n' "$what" >>"$UI_LOG"
  ui_spin_start "$what"
  "$@" >>"$UI_LOG" 2>&1 </dev/null || rc=$?
  ui_spin_stop
  took=$((SECONDS - start))
  if [ "$took" -ge 3 ]; then suffix=" ${C_DIM}(${took}s)${C_RESET}"; fi
  if [ "$rc" -eq 0 ]; then
    printf '  %s%s%s %s%s\n' "$C_GREEN" "$S_OK" "$C_RESET" "$what" "$suffix"
  else
    printf '  %s%s%s %s%s\n' "$C_RED" "$S_FAIL" "$C_RESET" "$what" "$suffix"
  fi
  return "$rc"
}

# run "what this does" command args...   as run_soft, but a failure ends the installer.
run() {
  local what="$1"
  if run_soft "$@"; then return 0; fi
  ui_log_tail
  die "${what} failed."
}

# box "Title" "line" ...   a framed block. Lines are plain text: their width is measured.
box() {
  local title="$1" line w i bar="" tbar="" color="${UI_BOX_COLOR:-$C_GREEN}"
  shift
  w=$((${#title} + 2))
  for line in "$@"; do if [ "${#line}" -gt "$w" ]; then w=${#line}; fi; done
  if [ $((w + 4)) -gt "$UI_COLS" ]; then
    # Too wide for this terminal: a frame would wrap into a mess, so print the same lines plainly.
    printf '\n%s%s%s\n' "${C_BOLD}${color}" "$title" "$C_RESET"
    for line in "$@"; do printf '  %s\n' "$line"; done
    return 0
  fi
  for ((i = 0; i < w + 2; i++)); do bar+="$S_H"; done
  for ((i = 0; i < w - ${#title} - 1; i++)); do tbar+="$S_H"; done
  printf '\n%s%s%s %s%s%s%s %s%s%s\n' "$color" "$S_TL" "$S_H" "$C_BOLD" "$title" "$C_RESET" "$color" "$tbar" "$S_TR" "$C_RESET"
  for line in "$@"; do
    printf '%s%s%s %-*s %s%s%s\n' "$color" "$S_V" "$C_RESET" "$w" "$line" "$color" "$S_V" "$C_RESET"
  done
  printf '%s%s%s%s%s\n' "$color" "$S_BL" "$bar" "$S_BR" "$C_RESET"
}

# prompt VAR "Question" [DEFAULT] [VALIDATOR] [HINT]
# Skipped when VAR already has a value (it came from the command line) or there is no terminal.
prompt() {
  local var="$1" question="$2" default="${3:-}" validator="${4:-}" hint="${5:-}" answer
  if [ -n "${!var}" ] || ! is_interactive; then return 0; fi
  while :; do
    printf '\n%s%s%s\n' "$C_BOLD" "$question" "$C_RESET"
    if [ -n "$hint" ]; then para 2 "$hint"; fi
    if [ -n "$default" ]; then printf '  %s>%s %s[%s]%s ' "$C_CYAN" "$C_RESET" "$C_DIM" "$default" "$C_RESET"; else printf '  %s>%s ' "$C_CYAN" "$C_RESET"; fi
    read -r answer || answer=""
    answer="${answer:-$default}"
    if [ -z "$validator" ] || "$validator" "$answer"; then
      printf -v "$var" '%s' "$answer"
      return 0
    fi
    warn "That does not look right. Try again."
  done
}

# prompt_secret VAR "Question" [HINT]   like prompt, but what is typed is not shown.
prompt_secret() {
  local var="$1" question="$2" hint="${3:-}" answer
  if [ -n "${!var}" ] || ! is_interactive; then return 0; fi
  while :; do
    printf '\n%s%s%s\n' "$C_BOLD" "$question" "$C_RESET"
    if [ -n "$hint" ]; then para 2 "$hint"; fi
    printf '  %s>%s ' "$C_CYAN" "$C_RESET"
    read -r -s answer || answer=""
    printf '\n'
    if [ -n "$answer" ]; then printf -v "$var" '%s' "$answer"; return 0; fi
    warn "Nothing was entered."
  done
}

# choose VAR "Question" DEFAULT_NUMBER "Label|Description" ...   VAR becomes the chosen number.
choose() {
  local var="$1" question="$2" default="$3" item answer n=0
  shift 3
  if ! is_interactive; then return 0; fi
  printf '\n%s%s%s\n' "$C_BOLD" "$question" "$C_RESET"
  for item in "$@"; do
    n=$((n + 1))
    printf '  %s%d%s  %s\n' "$C_CYAN" "$n" "$C_RESET" "${item%%|*}"
    if [ "$item" != "${item#*|}" ]; then para 5 "${item#*|}"; fi
  done
  while :; do
    printf '  %s>%s %s[%s]%s ' "$C_CYAN" "$C_RESET" "$C_DIM" "$default" "$C_RESET"
    read -r answer || answer=""
    answer="${answer:-$default}"
    if [[ $answer =~ ^[0-9]+$ ]] && [ "$answer" -ge 1 ] && [ "$answer" -le "$n" ]; then
      printf -v "$var" '%s' "$answer"
      return 0
    fi
    warn "Enter a number from 1 to ${n}."
  done
}

# confirm "Question" [y|n]   the default answer is the second argument (y when omitted).
confirm() {
  if ! is_interactive; then return 0; fi
  local default="${2:-y}" hint="Y/n" reply
  if [ "$default" = n ]; then hint="y/N"; fi
  printf '\n%s%s%s %s[%s]%s ' "$C_BOLD" "$1" "$C_RESET" "$C_DIM" "$hint" "$C_RESET"
  read -r reply || reply=""
  reply="${reply:-$default}"
  case "$reply" in [Yy]*) return 0 ;; *) return 1 ;; esac
}

# A host name such as ping.example.com (empty is allowed: it means "no domain").
valid_domain() {
  if [ -z "$1" ]; then return 0; fi
  local pattern='^([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$'
  [[ ${#1} -le 253 && $1 =~ $pattern ]]
}

command_exists() { command -v "$1" >/dev/null 2>&1; }
need_root() { [ "$(id -u)" -eq 0 ] || die "Run this as root (for example: sudo bash $0 $*)."; }
is_interactive() { [ -t 0 ] && [ "$ASSUME_YES" -eq 0 ]; }

TMP_DIRS=()
cleanup() {
  ui_spin_stop
  if [ "${#TMP_DIRS[@]}" -gt 0 ]; then rm -rf "${TMP_DIRS[@]}"; fi
}
trap cleanup EXIT
make_temp_dir() { local d; d="$(mktemp -d)"; TMP_DIRS+=("$d"); echo "$d"; }

random_secret() { head -c 48 /dev/urandom | base64 | tr -d '/+=\n' | head -c "${1:-32}"; }

detect_arch() {
  case "$(uname -m)" in
    x86_64 | amd64) ARCH_DEB=amd64; ARCH_NODE=x64; ARCH_UV=x86_64 ;;
    aarch64 | arm64) ARCH_DEB=arm64; ARCH_NODE=arm64; ARCH_UV=aarch64 ;;
    *) die "Unsupported CPU architecture: $(uname -m) (supported: x86_64, aarch64)." ;;
  esac
}

installed_mode() { if [ -f "$MODE_FILE" ]; then cat "$MODE_FILE"; fi; }
require_mode() {
  local m; m="$(installed_mode)"
  [ -n "$m" ] || die "No installation found. Run: bash $0 install --mode docker|direct"
  echo "$m"
}

APT_UPDATED=0

need_apt() { command_exists apt-get || die "$1 Automatic installation of system packages supports Debian and Ubuntu only."; }

apt_install() {
  # apt_install PACKAGE... : the package lists are refreshed once, unless something changed them.
  need_apt "Missing: $*."
  if [ "$APT_UPDATED" -eq 0 ]; then
    run "Updating the package lists" env DEBIAN_FRONTEND=noninteractive apt-get update -qq
    APT_UPDATED=1
  fi
  run "Installing ${APT_LABEL:-$*}" env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends "$@"
}

ensure_tools() {
  # ensure_tools [extra tools...]: the basics every mode needs, plus whatever the caller names.
  local missing=() tool
  for tool in curl sha256sum tar "$@"; do command_exists "$tool" || missing+=("$tool"); done
  command_exists jq || missing+=(jq)
  if [ "${#missing[@]}" -gt 0 ]; then
    local pkgs=()
    for tool in "${missing[@]}"; do
      case "$tool" in sha256sum | tar) pkgs+=(coreutils tar) ;; xz) pkgs+=(xz-utils) ;; *) pkgs+=("$tool") ;; esac
    done
    step "Installing what the installer itself needs"
    apt_install ca-certificates "${pkgs[@]}"
  fi
}

verify_sha256() {
  # verify_sha256 FILE EXPECTED. Publishers use different hashes (Caddy lists SHA-512), so the
  # algorithm is chosen by the length of the published value. Anything else is refused.
  local actual
  case "${#2}" in
    64) actual="$(sha256sum "$1" | awk '{ print $1 }')" ;;
    128) actual="$(sha512sum "$1" | awk '{ print $1 }')" ;;
    *) die "Unrecognised checksum for $(basename "$1"): ${2:-<empty>}" ;;
  esac
  [ "$actual" = "$2" ] || die "Checksum mismatch for $(basename "$1") (expected $2, got ${actual}). Nothing was installed."
}

download() {
  # download URL DEST [LABEL]: with a label the download shows progress (curl's own output goes to the log).
  if [ -n "${3:-}" ]; then
    run "$3" curl -fsSL --retry 3 "$1" -o "$2"
  else
    curl -fsSL --retry 3 "$1" -o "$2" || die "Could not download $1"
  fi
}

# ------------------------------------------------------------------------------------------------
# Releases: which versions make up this install
# ------------------------------------------------------------------------------------------------

resolve_release() {
  # Sets TAG ("main" means the edge channel) and downloads the release files into $REL_DIR.
  REL_DIR="$(make_temp_dir)"
  if [ "$VERSION" = "main" ]; then
    TAG="main"
    step "Using the edge channel"
    note "Images tagged latest and files from the main branch: the newest, least tested build."
    download "${RAW_BASE}/main/compose.yaml" "${REL_DIR}/compose.yaml"
    download "${RAW_BASE}/main/deploy/Caddyfile" "${REL_DIR}/Caddyfile"
    STACK_VERSION="main"
    FRONTEND_IMAGE="${DOCKERHUB_NAMESPACE}/ipping:latest"
    BACKEND_IMAGE="${DOCKERHUB_NAMESPACE}/ipping-backend:latest"
    return
  fi
  if [ -n "$VERSION" ] && [ "$VERSION" != "latest" ]; then
    TAG="$(normalize_tag "$VERSION")"
  else
    TAG="$(curl -fsSL "${API_BASE}/releases/latest" | jq -r '.tag_name // empty' 2>/dev/null)" || true
    [ -n "$TAG" ] || die "No published release of ${REPO} was found. Use --version vX.Y.Z, or --version main for the edge channel."
  fi
  step "Fetching release ${TAG}"
  for f in release-manifest.json compose.yaml Caddyfile; do
    download "${RELEASE_BASE}/${TAG}/${f}" "${REL_DIR}/${f}"
  done
  local m="${REL_DIR}/release-manifest.json"
  [ "$(jq -r '.schema' "$m")" = "1" ] || die "This installer does not understand release manifest schema $(jq -r '.schema' "$m"). Download a newer ipping.sh."
  STACK_VERSION="$(jq -r '.stack_version' "$m")"
  FRONTEND_IMAGE="$(jq -r '.frontend.image' "$m")"
  BACKEND_IMAGE="$(jq -r '.backend.image' "$m")"
  tick "Release ${STACK_VERSION}: frontend $(jq -r '.frontend.version' "$m"), backend $(jq -r '.backend.version' "$m")"
}

# ------------------------------------------------------------------------------------------------
# Docker mode
# ------------------------------------------------------------------------------------------------

# A release is vX.Y.Z (the v is optional), optionally with a -rc.N style suffix. Anything else is
# refused up front, so a typo can never end up inside a download URL.
valid_version() {
  case "$1" in
    "" | latest | main) return 0 ;;
  esac
  local pattern='^v?[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$'
  [[ $1 =~ $pattern ]]
}

normalize_tag() {
  case "$1" in v*) printf '%s' "$1" ;; *) printf 'v%s' "$1" ;; esac
}

# One value from /etc/os-release, read in a subshell. Never `source` that file into this script:
# it defines VERSION, NAME, ID and more, which silently replaced this script's own variables
# (Debian 13 has VERSION="13 (trixie)", which became the release to download).
os_release() {
  ( # shellcheck source=/dev/null
    . "${OS_RELEASE_FILE:-/etc/os-release}" 2>/dev/null
    printf '%s' "${!1:-}" )
}

install_docker_if_missing() {
  if command_exists docker && docker compose version >/dev/null 2>&1; then return; fi
  need_apt "Docker with the compose plugin is required (https://docs.docker.com/engine/install/)."
  local distro codename
  distro="$(os_release ID)"
  codename="$(os_release UBUNTU_CODENAME)"
  codename="${codename:-$(os_release VERSION_CODENAME)}"
  case "$distro" in ubuntu | debian) ;; *) die "Automatic Docker installation supports Debian and Ubuntu; install Docker manually." ;; esac
  [ -n "$codename" ] || die "Could not tell which release of ${distro} this is (no codename in /etc/os-release)."
  confirm "Docker is not installed. Install it from Docker's apt repository?" \
    || die "Docker is required for --mode docker."
  step "Installing Docker"
  apt_install ca-certificates curl
  install -m 0755 -d /etc/apt/keyrings
  run "Adding Docker's package signing key" curl -fsSL "https://download.docker.com/linux/${distro}/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  cat >/etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/${distro}
Suites: ${codename}
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
  APT_UPDATED=0   # a new package source: the lists have to be refreshed again
  APT_LABEL="Docker Engine and the compose plugin" apt_install docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable --now docker >/dev/null 2>&1 || true
}

compose() {
  docker compose -p "$COMPOSE_PROJECT" -f "${APP_DIR}/compose.yaml" --env-file "${APP_DIR}/.env" "$@"
}

env_get() { grep -E "^$1=" "${APP_DIR}/.env" 2>/dev/null | head -n 1 | cut -d= -f2- || true; }

env_set() {
  # env_set KEY VALUE: replace the line or append it, keeping the file private.
  local key="$1" value="$2" file="${APP_DIR}/.env"
  if grep -qE "^${key}=" "$file" 2>/dev/null; then
    local tmp; tmp="$(mktemp)"
    awk -v k="$key" -v v="$value" 'BEGIN { FS = OFS = "=" } $1 == k { print k "=" v; next } { print }' "$file" >"$tmp"
    cat "$tmp" >"$file"; rm -f "$tmp"
  else
    echo "${key}=${value}" >>"$file"
  fi
  chmod 600 "$file"
}

site_settings() {
  # DOMAIN -> site address, public URL and cookie flag.
  if [ -n "$DOMAIN" ]; then
    SITE_ADDRESS="$DOMAIN"; PUBLIC_URL="https://${DOMAIN}"; COOKIE_SECURE=true
  else
    SITE_ADDRESS=":80"; PUBLIC_URL=""; COOKIE_SECURE=false
  fi
}

wait_for_ready() {
  # wait_for_ready URL SECONDS
  local waited=0
  while [ "$waited" -lt "$2" ]; do
    curl -fsS --max-time 4 "$1" >/dev/null 2>&1 && return 0
    sleep 2; waited=$((waited + 2))
  done
  return 1
}

install_docker_mode() {
  install_docker_if_missing
  local reuse=0
  if [ -f "${APP_DIR}/.env" ]; then
    [ ! -f "$MODE_FILE" ] || die "ipping is already installed in ${APP_DIR}. Use 'update' to change versions, or 'uninstall' first."
    reuse=1
    note "Reusing the settings an earlier install or uninstall saved (the database password in them matches its database)."
  fi
  step "Setting up ${APP_DIR}"
  install -d -m 0750 "${APP_DIR}" "${APP_DIR}/deploy"
  install -m 0644 "${REL_DIR}/compose.yaml" "${APP_DIR}/compose.yaml"
  install -m 0644 "${REL_DIR}/Caddyfile" "${APP_DIR}/deploy/Caddyfile"
  if [ "$reuse" -eq 1 ]; then
    env_set IPPING_FRONTEND_IMAGE "$FRONTEND_IMAGE"
    env_set IPPING_BACKEND_IMAGE "$BACKEND_IMAGE"
  else
    site_settings
    SETUP_TOKEN="${SETUP_TOKEN:-$(random_secret 32)}"
    (
      umask 077
      cat >"${APP_DIR}/.env" <<EOF
POSTGRES_PASSWORD=$(random_secret 40)
IPPING_SETUP_TOKEN=${SETUP_TOKEN}
IPPING_SITE_ADDRESS=${SITE_ADDRESS}
IPPING_PUBLIC_URL=${PUBLIC_URL}
IPPING_COOKIE_SECURE=${COOKIE_SECURE}
IPPING_HTTP_PORT=${HTTP_PORT}
IPPING_HTTPS_PORT=${HTTPS_PORT}
IPPING_BACKEND_WORKERS=${BACKEND_WORKERS}
IPPING_FRONTEND_IMAGE=${FRONTEND_IMAGE}
IPPING_BACKEND_IMAGE=${BACKEND_IMAGE}
EOF
    )
    tick "Generated the database password and setup token (${APP_DIR}/.env, root only)"
  fi

  step "Starting ipping"
  run_soft "Downloading the images" compose pull --quiet \
    || warn "Could not download every image; continuing with local copies if there are any."
  run "Starting the containers" compose up -d
  # Only now is it "installed": a failure before this point can simply be retried.
  echo docker >"$MODE_FILE"
  echo "$TAG" >"$VERSION_FILE"
  run_soft "Waiting for ipping to answer" wait_for_ready "http://127.0.0.1:${HTTP_PORT}/api/v1/health/ready" 120 \
    || { compose ps; die "ipping did not become ready. Look at the logs with: sudo bash $0 logs"; }
  finish_message
}

# ------------------------------------------------------------------------------------------------
# Direct mode
# ------------------------------------------------------------------------------------------------

DIRECT_USERS=(ipping-backend ipping-frontend ipping-caddy)

need_systemd() { command_exists systemctl || die "--mode direct needs systemd. Use --mode docker on this host."; }

ensure_user() {
  id "$1" >/dev/null 2>&1 || useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin "$1"
}

fetch_runtime() {
  # fetch_runtime NAME URL CHECKSUM-FILE-URL ARCHIVE-NAME DEST_DIR [STRIP]: download, verify against
  # the publisher's checksum list, unpack into DEST_DIR (stripping the top-level folder where asked).
  local name="$1" url="$2" sums_url="$3" archive="$4" dest="$5" strip="${6:-0}" tmp expected
  if [ -x "${dest}/.complete" ]; then note "${name} is already installed"; return; fi
  tmp="$(make_temp_dir)"
  download "$url" "${tmp}/${archive}" "Downloading ${name}"
  download "$sums_url" "${tmp}/sums"
  expected="$(awk -v f="$archive" '{ n = $2; sub(/^\*/, "", n); if (n == f) print $1 }' "${tmp}/sums" | head -n 1)"
  [ -n "$expected" ] || expected="$(awk '{ print $1 }' "${tmp}/sums" | head -n 1)"   # a bare .sha256 file
  [ -n "$expected" ] || die "No checksum published for ${archive}."
  verify_sha256 "${tmp}/${archive}" "$expected"
  tick "Checked ${name} against its publisher's checksum"
  rm -rf "$dest"; install -d -m 0755 "$dest"
  run "Unpacking ${name}" tar -xf "${tmp}/${archive}" -C "$dest" --strip-components="$strip" --no-same-owner --no-same-permissions
  chmod 755 "$dest"
  printf '#!/bin/sh\n' >"${dest}/.complete"; chmod +x "${dest}/.complete"
}

wait_for_postgres() {
  local waited=0
  until runuser -u postgres -- psql -tAc 'SELECT 1' >/dev/null 2>&1; do
    sleep 1; waited=$((waited + 1))
    if [ "$waited" -ge 30 ]; then return 1; fi
  done
}

install_postgres() {
  if [ -n "$DATABASE_URL" ]; then note "Using the database you provided."; return; fi
  step "Setting up PostgreSQL"
  if ! command_exists psql; then apt_install postgresql; fi
  run_soft "Starting PostgreSQL" systemctl enable --now postgresql || true
  run "Waiting for PostgreSQL to accept connections" wait_for_postgres
  local pw
  pw="$(random_secret 40)"
  if [ "$(runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='ipping'")" != "1" ]; then
    runuser -u postgres -- psql -qc "CREATE ROLE ipping LOGIN PASSWORD '${pw}'"
    DATABASE_URL="postgresql://ipping:${pw}@127.0.0.1:5432/ipping"
    echo yes >"${APP_DIR}/created-database"
  else
    DATABASE_URL="$(sed -n 's/^IPPING_DATABASE_URL=//p' "${CONF_DIR}/backend.env" 2>/dev/null | head -n 1)"
    [ -n "$DATABASE_URL" ] || die "A PostgreSQL role named ipping already exists but its password is unknown. Pass --database-url, or remove the role."
  fi
  [ "$(runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_database WHERE datname='ipping'")" = "1" ] \
    || runuser -u postgres -- psql -qc "CREATE DATABASE ipping OWNER ipping"
  tick "The ipping database and its user are ready"
}

write_direct_units() {
  local tag="$1"
  cat >/etc/systemd/system/ipping-backend.service <<EOF
[Unit]
Description=ipping backend
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
User=ipping-backend
Group=ipping-backend
EnvironmentFile=${CONF_DIR}/backend.env
# The proxy is the only thing that can reach this port, so its forwarded headers are trusted.
Environment=FORWARDED_ALLOW_IPS=127.0.0.1
ExecStart=${APP_DIR}/backend/current/venv/bin/ipping-backend serve
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictNamespaces=true
LockPersonality=true
CapabilityBoundingSet=
ProtectClock=true
ProtectHostname=true
ProtectProc=invisible
ProcSubset=pid
RestrictSUIDSGID=true
RemoveIPC=true
SystemCallArchitectures=native
UMask=0077

[Install]
WantedBy=multi-user.target
EOF
  cat >/etc/systemd/system/ipping-frontend.service <<EOF
[Unit]
Description=ipping frontend
After=network-online.target

[Service]
User=ipping-frontend
Group=ipping-frontend
Environment=NODE_ENV=production
Environment=NEXT_TELEMETRY_DISABLED=1
Environment=HOSTNAME=127.0.0.1
Environment=PORT=3000
WorkingDirectory=${APP_DIR}/frontend/current
ExecStart=${APP_DIR}/node/bin/node server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictNamespaces=true
LockPersonality=true
CapabilityBoundingSet=
ProtectClock=true
ProtectHostname=true
ProtectProc=invisible
ProcSubset=pid
RestrictSUIDSGID=true
RemoveIPC=true
SystemCallArchitectures=native
UMask=0077

[Install]
WantedBy=multi-user.target
EOF
  cat >/etc/systemd/system/ipping-caddy.service <<EOF
[Unit]
Description=ipping reverse proxy (Caddy)
After=network-online.target ipping-backend.service ipping-frontend.service
Wants=network-online.target

[Service]
User=ipping-caddy
Group=ipping-caddy
Environment=XDG_DATA_HOME=/var/lib/ipping-caddy
Environment=XDG_CONFIG_HOME=/var/lib/ipping-caddy
EnvironmentFile=${CONF_DIR}/caddy.env
ExecStart=${APP_DIR}/caddy/caddy run --config ${CONF_DIR}/Caddyfile --adapter caddyfile
ExecReload=${APP_DIR}/caddy/caddy reload --config ${CONF_DIR}/Caddyfile --adapter caddyfile
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
ReadWritePaths=/var/lib/ipping-caddy
LockPersonality=true
ProtectClock=true
ProtectHostname=true
ProtectProc=invisible
ProcSubset=pid
RestrictSUIDSGID=true
RemoveIPC=true
SystemCallArchitectures=native
UMask=0077

[Install]
WantedBy=multi-user.target
EOF
  : "$tag"
}

direct_runtime_versions() {
  # Versions come from the release manifest; the defaults cover the edge channel.
  if [ -f "${REL_DIR}/release-manifest.json" ]; then
    NODE_VERSION="$(jq -r '.runtime.node // empty' "${REL_DIR}/release-manifest.json")"
    CADDY_VERSION="$(jq -r '.runtime.caddy // empty' "${REL_DIR}/release-manifest.json")"
    UV_VERSION="$(jq -r '.runtime.uv // empty' "${REL_DIR}/release-manifest.json")"
  fi
  NODE_VERSION="${NODE_VERSION:-$NODE_VERSION_DEFAULT}"
  CADDY_VERSION="${CADDY_VERSION:-$CADDY_VERSION_DEFAULT}"
  UV_VERSION="${UV_VERSION:-$UV_VERSION_DEFAULT}"
}

install_direct_artifacts() {
  # Backend (Python wheel + hash-locked dependencies) and frontend (Next.js standalone bundle).
  local m="${REL_DIR}/release-manifest.json" tmp backend_dir frontend_dir
  [ -f "$m" ] || die "Direct mode installs release artifacts and needs a release (--version vX.Y.Z); the edge channel is Docker-only."
  tmp="$(make_temp_dir)"
  local bver fver
  bver="$(jq -r '.backend.version' "$m")"; fver="$(jq -r '.frontend.version' "$m")"

  # Release directories are named by version and checksum: an update never overwrites the release
  # that is running, and installing something already present is a no-op.
  local wheel_sha lock_sha bundle_sha
  wheel_sha="$(jq -r '.backend.wheel.sha256' "$m")"
  lock_sha="$(jq -r '.backend.lock.sha256' "$m")"
  bundle_sha="$(jq -r '.frontend.bundle.sha256' "$m")"
  backend_dir="${APP_DIR}/backend/releases/${bver}-${wheel_sha:0:8}${lock_sha:0:8}"
  frontend_dir="${APP_DIR}/frontend/releases/${fver}-${bundle_sha:0:8}"
  BACKEND_PREVIOUS="$(readlink "${APP_DIR}/backend/current" 2>/dev/null || true)"
  FRONTEND_PREVIOUS="$(readlink "${APP_DIR}/frontend/current" 2>/dev/null || true)"
  BACKEND_NEW="$backend_dir"
  FRONTEND_NEW="$frontend_dir"

  if [ -x "${backend_dir}/venv/bin/ipping-backend" ]; then
    note "Backend ${bver} is already installed"
  else
    step "Installing the backend ${bver}"
    download "$(jq -r '.backend.wheel.url' "$m")" "${tmp}/backend.whl" "Downloading the backend"
    verify_sha256 "${tmp}/backend.whl" "$wheel_sha"
    download "$(jq -r '.backend.lock.url' "$m")" "${tmp}/requirements.lock"
    verify_sha256 "${tmp}/requirements.lock" "$lock_sha"
    tick "Checked the backend and its dependency list against the release manifest"
    # The wheel's file name carries its version and must be kept for pip to accept it.
    local wheel_name
    wheel_name="$(basename "$(jq -r '.backend.wheel.url' "$m")")"
    mv "${tmp}/backend.whl" "${tmp}/${wheel_name}"
    rm -rf "$backend_dir"; install -d -m 0755 "$backend_dir"
    # Python itself comes from uv too, into a directory the service user can read, so this works
    # the same on every distribution whatever Python it ships.
    export UV_PYTHON_INSTALL_DIR="${APP_DIR}/python" UV_CACHE_DIR="${tmp}/uv-cache"
    install -d -m 0755 "$UV_PYTHON_INSTALL_DIR"
    run "Setting up Python 3.12" "${APP_DIR}/uv/uv" python install --quiet 3.12
    run "Creating the backend's environment" "${APP_DIR}/uv/uv" venv --quiet --python 3.12 --python-preference only-managed "${backend_dir}/venv"
    run "Installing the backend's dependencies (each checked against a hash)" "${APP_DIR}/uv/uv" pip install --quiet \
      --python "${backend_dir}/venv/bin/python" --require-hashes -r "${tmp}/requirements.lock"
    run "Installing the backend" "${APP_DIR}/uv/uv" pip install --quiet --python "${backend_dir}/venv/bin/python" --no-deps "${tmp}/${wheel_name}"
  fi

  if [ -f "${frontend_dir}/server.js" ]; then
    note "Frontend ${fver} is already installed"
  else
    step "Installing the frontend ${fver}"
    download "$(jq -r '.frontend.bundle.url' "$m")" "${tmp}/frontend.tar.gz" "Downloading the frontend"
    verify_sha256 "${tmp}/frontend.tar.gz" "$bundle_sha"
    tick "Checked the frontend against the release manifest"
    rm -rf "$frontend_dir"; install -d -m 0755 "$frontend_dir"
    # Whatever owner and modes the archive carries, the service user must be able to read it.
    run "Unpacking the frontend" tar -xzf "${tmp}/frontend.tar.gz" -C "$frontend_dir" --no-same-owner --no-same-permissions
    chmod 755 "$frontend_dir"
  fi
}

switch_direct_releases() {
  ln -sfn "$BACKEND_NEW" "${APP_DIR}/backend/current"
  ln -sfn "$FRONTEND_NEW" "${APP_DIR}/frontend/current"
}

run_migration() {
  runuser -u ipping-backend -- env "IPPING_DATABASE_URL=${DATABASE_URL}" \
    "${APP_DIR}/backend/current/venv/bin/ipping-backend" migrate
}

direct_prepare_runtimes() {
  detect_arch
  direct_runtime_versions
  install -d -m 0755 "$APP_DIR"
  step "Getting the runtimes"
  fetch_runtime "uv ${UV_VERSION}" \
    "https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/uv-${ARCH_UV}-unknown-linux-gnu.tar.gz" \
    "https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/uv-${ARCH_UV}-unknown-linux-gnu.tar.gz.sha256" \
    "uv-${ARCH_UV}-unknown-linux-gnu.tar.gz" "${APP_DIR}/uv" 1
  fetch_runtime "Node.js ${NODE_VERSION}" \
    "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${ARCH_NODE}.tar.xz" \
    "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt" \
    "node-v${NODE_VERSION}-linux-${ARCH_NODE}.tar.xz" "${APP_DIR}/node" 1
  fetch_runtime "Caddy ${CADDY_VERSION}" \
    "https://github.com/caddyserver/caddy/releases/download/v${CADDY_VERSION}/caddy_${CADDY_VERSION}_linux_${ARCH_DEB}.tar.gz" \
    "https://github.com/caddyserver/caddy/releases/download/v${CADDY_VERSION}/caddy_${CADDY_VERSION}_checksums.txt" \
    "caddy_${CADDY_VERSION}_linux_${ARCH_DEB}.tar.gz" "${APP_DIR}/caddy" 0
}

install_direct_mode() {
  need_systemd
  local reuse=0
  if [ -f "${CONF_DIR}/backend.env" ]; then
    [ ! -f "$MODE_FILE" ] || die "ipping is already installed. Use 'update' to change versions, or 'uninstall' first."
    reuse=1
    note "Reusing the settings an earlier install or uninstall saved."
  fi
  if [ "$reuse" -eq 0 ]; then
    site_settings
    SETUP_TOKEN="${SETUP_TOKEN:-$(random_secret 32)}"
  fi

  step "Creating service accounts and directories"
  for u in "${DIRECT_USERS[@]}"; do ensure_user "$u"; done
  install -d -m 0755 "$APP_DIR" "$APP_DIR/backend" "$APP_DIR/frontend"
  install -d -m 0755 "$CONF_DIR"
  install -d -m 0700 -o ipping-caddy -g ipping-caddy /var/lib/ipping-caddy
  tick "Three unprivileged service accounts: ${DIRECT_USERS[*]}"

  direct_prepare_runtimes
  [ "$reuse" -eq 0 ] || DATABASE_URL="$(sed -n 's/^IPPING_DATABASE_URL=//p' "${CONF_DIR}/backend.env" | head -n 1)"
  install_postgres

  # Saved as soon as the database exists, so that an install that stops here can be run again
  # (the database password lives only in this file).
  sed -e 's#reverse_proxy backend:8000#reverse_proxy 127.0.0.1:8000#' \
      -e 's#reverse_proxy frontend:3000#reverse_proxy 127.0.0.1:3000#' "${REL_DIR}/Caddyfile" >"${CONF_DIR}/Caddyfile"
  chmod 644 "${CONF_DIR}/Caddyfile"
  if [ "$reuse" -eq 0 ]; then
    step "Writing the configuration"
    (
      umask 027
      cat >"${CONF_DIR}/backend.env" <<EOF
IPPING_DATABASE_URL=${DATABASE_URL}
IPPING_SETUP_TOKEN=${SETUP_TOKEN}
IPPING_PUBLIC_URL=${PUBLIC_URL}
IPPING_COOKIE_SECURE=${COOKIE_SECURE}
IPPING_HOST=127.0.0.1
IPPING_PORT=8000
IPPING_WORKERS=${BACKEND_WORKERS}
EOF
    )
    chown root:ipping-backend "${CONF_DIR}/backend.env"; chmod 640 "${CONF_DIR}/backend.env"
    if [ "$HTTP_PORT" != "80" ] && [ -z "$DOMAIN" ]; then SITE_ADDRESS=":${HTTP_PORT}"; fi
    echo "IPPING_SITE_ADDRESS=${SITE_ADDRESS}" >"${CONF_DIR}/caddy.env"
    chmod 644 "${CONF_DIR}/caddy.env"
    tick "Wrote ${CONF_DIR} (the secrets are readable by root and the backend only)"
  fi

  install_direct_artifacts
  switch_direct_releases

  step "Starting ipping"
  run "Updating the database schema" run_migration
  write_direct_units "$TAG"
  systemctl daemon-reload
  run "Enabling the services at boot" systemctl enable ipping-backend ipping-frontend ipping-caddy
  run "Starting the backend, the frontend and the web server" systemctl restart ipping-backend ipping-frontend ipping-caddy
  echo direct >"$MODE_FILE"
  echo "$TAG" >"$VERSION_FILE"
  run_soft "Waiting for ipping to answer" wait_for_ready "http://127.0.0.1:${HTTP_PORT}/api/v1/health/ready" 90 \
    || die "ipping did not become ready. Look at the logs with: sudo bash $0 logs"
  finish_message
}

# ------------------------------------------------------------------------------------------------
# Common lifecycle
# ------------------------------------------------------------------------------------------------

site_address() {
  if [ "$(require_mode)" = "docker" ]; then env_get IPPING_SITE_ADDRESS
  else sed -n 's/^IPPING_SITE_ADDRESS=//p' "${CONF_DIR}/caddy.env" | head -n 1; fi
}

# The host port that serves plain HTTP (also where the health check is reached).
http_port() {
  if [ "$(require_mode)" = "docker" ]; then
    env_get IPPING_HTTP_PORT
  else
    local site; site="$(site_address)"
    case "$site" in :*) echo "${site#:}" ;; *) echo 80 ;; esac
  fi
}

public_address() {
  local site port host
  site="$(site_address)"; port="$(http_port)"
  case "$site" in
    :*)
      host="$(hostname -I 2>/dev/null | awk '{ print $1 }')"
      host="${host:-$(hostname)}"
      if [ "$port" = "80" ]; then echo "http://${host}"; else echo "http://${host}:${port}"; fi ;;
    *) echo "https://${site}" ;;
  esac
}

setup_token_value() {
  if [ "$(require_mode)" = "docker" ]; then env_get IPPING_SETUP_TOKEN
  else sed -n 's/^IPPING_SETUP_TOKEN=//p' "${CONF_DIR}/backend.env" | head -n 1; fi
}

finish_message() {
  local url token
  url="$(public_address)"
  token="$(setup_token_value)"
  box "ipping is running" \
    "" \
    "Open          ${url}/setup" \
    "Setup token   ${token}" \
    ""
  printf '\n%sNext%s\n' "$C_BOLD" "$C_RESET"
  info "1  Open the address above and create the administrator with the setup token."
  info "2  In Admin > Enrollment create a token, then on each measurement host run:"
  note "     sudo bash ipping-node.sh install --server ${url} --token <token>"
  case "$url" in http://*) note "     (this site is plain HTTP: add --allow-insecure, or give it a domain for HTTPS)" ;; esac
  printf '\n%sLater%s   sudo bash %s status | doctor | backup | update | access\n' "$C_BOLD" "$C_RESET" "$(basename "$0")"
}

cmd_start() {
  case "$(require_mode)" in
    docker) run "Starting ipping" compose up -d ;;
    direct) run "Starting ipping" systemctl start ipping-backend ipping-frontend ipping-caddy ;;
  esac
  ok "ipping is started."
}
cmd_stop() {
  case "$(require_mode)" in
    docker) run "Stopping ipping" compose stop ;;
    direct) run "Stopping ipping" systemctl stop ipping-caddy ipping-frontend ipping-backend ;;
  esac
  ok "ipping is stopped. The data is untouched; 'start' brings it back."
}
cmd_restart() {
  case "$(require_mode)" in
    docker) run "Restarting ipping" compose restart ;;
    direct) run "Restarting ipping" systemctl restart ipping-backend ipping-frontend ipping-caddy ;;
  esac
  ok "ipping is restarted."
}

docker_running_services() { compose ps --status running --services 2>/dev/null || true; }

service_up() { # service_up MODE NAME  (docker: a compose service, direct: a systemd unit)
  if [ "$1" = docker ]; then
    case $'\n'"$(docker_running_services)"$'\n' in *$'\n'"$2"$'\n'*) return 0 ;; *) return 1 ;; esac
  else
    systemctl is-active --quiet "$2"
  fi
}

cmd_status() {
  local mode name release services
  mode="$(require_mode)"
  release="$(cat "$VERSION_FILE" 2>/dev/null || echo unknown)"
  banner "ipping" "${release}  ${S_SEP}  ${mode}"
  if [ "$mode" = docker ]; then services="proxy frontend backend postgres"; else services="ipping-backend ipping-frontend ipping-caddy"; fi
  step "Services"
  for name in $services; do
    if service_up "$mode" "$name"; then
      printf '  %s%s%s %-16s running\n' "$C_GREEN" "$S_UP" "$C_RESET" "$name"
    else
      printf '  %s%s%s %-16s %sstopped%s\n' "$C_RED" "$S_DOWN" "$C_RESET" "$name" "$C_RED" "$C_RESET"
    fi
  done
  step "Address"
  info "$(public_address)"
  note "Run 'doctor' for a full check, 'access' for the setup token."
}

cmd_access() {
  local url
  require_mode >/dev/null
  url="$(public_address)"
  box "ipping" \
    "" \
    "Open          ${url}" \
    "Setup token   $(setup_token_value)" \
    "" \
    "The setup token only works until the first administrator exists."
}

cmd_logs() {
  case "$(require_mode)" in
    docker) compose logs -f --tail 100 ;;
    direct) journalctl -u ipping-backend -u ipping-frontend -u ipping-caddy -f --no-pager -n 100 ;;
  esac
}

cmd_backup() {
  need_root backup
  local mode ts out
  mode="$(require_mode)"; ts="$(date +%Y%m%d-%H%M%S)"
  install -d -m 0700 "$BACKUP_DIR"
  out="${BACKUP_DIR}/ipping-${ts}.dump"
  step "Backing up the database"
  if [ "$mode" = "docker" ]; then
    compose exec -T postgres pg_dump -U ipping -Fc ipping >"$out"
  else
    local url
    url="$(sed -n 's/^IPPING_DATABASE_URL=//p' "${CONF_DIR}/backend.env" | head -n 1)"
    if [ -f "${APP_DIR}/created-database" ]; then runuser -u postgres -- pg_dump -Fc ipping >"$out"
    else pg_dump -Fc "${url/postgresql+asyncpg:/postgresql:}" >"$out"; fi
  fi
  chmod 600 "$out"
  [ -s "$out" ] || { rm -f "$out"; die "The backup is empty; something went wrong."; }
  ok "Backup written: ${out} ($(du -h "$out" | cut -f1))"
  BACKUP_FILE="$out"
}

# Download the free DB-IP Lite city and ASN databases for the location cross-check. Optional: without them
# results are exactly as before. Safe to repeat (monthly); the backend reads a replaced file without a restart.
cmd_geoip_update() {
  need_root geoip-update
  banner "ipping" "GeoIP databases"
  local mode
  mode="$(require_mode)"
  note "Free databases from DB-IP (db-ip.com), licensed CC BY 4.0; results show the attribution."
  if [ "$mode" = "docker" ]; then
    run "Downloading and checking the databases" compose run --rm --no-deps backend geoip-update
  else
    need_systemd
    local dir=/var/lib/ipping-backend/geoip dropin_dir=/etc/systemd/system/ipping-backend.service.d restart=0
    install -d -m 0750 -o ipping-backend -g ipping-backend /var/lib/ipping-backend "$dir"
    if [ ! -f "${dropin_dir}/geoip.conf" ]; then
      # A drop-in, so the unit the installer wrote is left alone: it names the directory (and gives the
      # sandboxed service somewhere it may read it).
      install -d "$dropin_dir"
      cat >"${dropin_dir}/geoip.conf" <<EOF
[Service]
Environment=IPPING_GEOIP_DIR=${dir}
StateDirectory=ipping-backend
EOF
      run "Telling the backend where the databases are" systemctl daemon-reload
      restart=1
    fi
    run "Downloading and checking the databases" runuser -u ipping-backend -- env "IPPING_GEOIP_DIR=${dir}" \
      "${APP_DIR}/backend/current/venv/bin/ipping-backend" geoip-update
    [ "$restart" -eq 0 ] || run "Restarting the backend so it reads them" systemctl restart ipping-backend
  fi
  ok "Done. Results now name the network of an address and check a database's place against the measurements."
  note "Repeat it each month, for example with cron:  0 4 3 * *  root  bash $0 geoip-update"
}

stop_app_for_restore() {
  if [ "$1" = docker ]; then compose stop frontend backend proxy; else systemctl stop ipping-caddy ipping-backend ipping-frontend; fi
}

cmd_restore() {
  need_root restore
  local file="${1:-}" mode
  [ -f "$file" ] || die "Usage: bash $0 restore /path/to/ipping-….dump"
  mode="$(require_mode)"
  confirm "This replaces the current database with ${file}. Continue?" || exit 0
  step "Restoring the database"
  run "Stopping the application" stop_app_for_restore "$mode"
  if [ "$mode" = "docker" ]; then
    compose exec -T postgres pg_restore -U ipping -d ipping --clean --if-exists --no-owner <"$file"
  elif [ -f "${APP_DIR}/created-database" ]; then
    runuser -u postgres -- pg_restore -d ipping --clean --if-exists --no-owner <"$file"
  else
    local url
    url="$(sed -n 's/^IPPING_DATABASE_URL=//p' "${CONF_DIR}/backend.env" | head -n 1)"
    pg_restore -d "${url/postgresql+asyncpg:/postgresql:}" --clean --if-exists --no-owner <"$file"
  fi
  if [ "$mode" = "docker" ]; then run "Starting the application" compose up -d; else run "Starting the application" systemctl start ipping-backend ipping-frontend ipping-caddy; fi
  ok "Restored. If you restored a backup from an older release, also install that release (update --version)."
}

cmd_update() {
  need_root update
  banner "ipping" "update"
  local mode
  mode="$(require_mode)"
  ensure_tools
  resolve_release
  local current; current="$(cat "$VERSION_FILE" 2>/dev/null || echo unknown)"
  if [ "$current" = "$TAG" ] && [ "$TAG" != "main" ]; then
    ok "Already on ${TAG}; nothing to do."
    return
  fi
  step "Updating ${current} to ${TAG}"
  cmd_backup
  note "If the update goes wrong: sudo bash $0 restore ${BACKUP_FILE}, then install the previous release."

  if [ "$mode" = "docker" ]; then
    install -m 0644 "${REL_DIR}/compose.yaml" "${APP_DIR}/compose.yaml"
    install -m 0644 "${REL_DIR}/Caddyfile" "${APP_DIR}/deploy/Caddyfile"
    env_set IPPING_FRONTEND_IMAGE "$FRONTEND_IMAGE"
    env_set IPPING_BACKEND_IMAGE "$BACKEND_IMAGE"
    run_soft "Downloading the images" compose pull --quiet || warn "Could not download every image; continuing with local copies if there are any."
    run "Starting the containers" compose up -d
    run_soft "Waiting for ipping to answer" wait_for_ready "http://127.0.0.1:$(http_port)/api/v1/health/ready" 120 \
      || die "The updated stack did not become ready. Backup: ${BACKUP_FILE}"
  else
    need_systemd
    direct_prepare_runtimes
    DATABASE_URL="$(sed -n 's/^IPPING_DATABASE_URL=//p' "${CONF_DIR}/backend.env" | head -n 1)"
    install_direct_artifacts
    run "Stopping the backend and frontend" systemctl stop ipping-backend ipping-frontend
    switch_direct_releases
    if ! run_soft "Updating the database schema" run_migration; then
      warn "Migration failed; going back to the previous version."
      [ -n "${BACKEND_PREVIOUS:-}" ] && ln -sfn "$BACKEND_PREVIOUS" "${APP_DIR}/backend/current"
      [ -n "${FRONTEND_PREVIOUS:-}" ] && ln -sfn "$FRONTEND_PREVIOUS" "${APP_DIR}/frontend/current"
      systemctl start ipping-backend ipping-frontend
      die "Update failed during the database migration. Backup: ${BACKUP_FILE}"
    fi
    run "Starting the backend and frontend" systemctl start ipping-backend ipping-frontend
    run "Reloading the web server" systemctl reload-or-restart ipping-caddy
    run_soft "Waiting for ipping to answer" wait_for_ready "http://127.0.0.1:$(http_port)/api/v1/health/ready" 90 \
      || die "The updated application did not become ready. Backup: ${BACKUP_FILE}"
  fi
  echo "$TAG" >"$VERSION_FILE"
  ok "Updated to ${TAG}."
}

cmd_doctor() {
  local mode problems=0 total=0 port s
  mode="$(installed_mode)"
  [ -n "$mode" ] || die "Not installed."
  banner "ipping doctor" "$(cat "$VERSION_FILE" 2>/dev/null || echo unknown)  ${S_SEP}  ${mode}"
  # check "what" "what to try if it fails" command...
  check() {
    local what="$1" hint="$2"
    shift 2
    total=$((total + 1))
    if "$@" >/dev/null 2>&1; then
      tick "$what"
    else
      printf '  %s%s%s %s\n' "$C_RED" "$S_FAIL" "$C_RESET" "$what"
      note "   try: ${hint}"
      problems=$((problems + 1))
    fi
  }
  port="$(http_port)"
  step "Services"
  if [ "$mode" = "docker" ]; then
    for s in proxy frontend backend postgres; do
      check "${s} is running" "sudo bash $0 logs" service_up docker "$s"
    done
  else
    for s in ipping-backend ipping-frontend ipping-caddy; do
      check "${s} is running" "sudo bash $0 logs" service_up direct "$s"
    done
  fi
  step "The site"
  check "the API answers (http://127.0.0.1:${port}/api/v1/health/ready)" "sudo bash $0 logs" \
    curl -fsS --max-time 6 "http://127.0.0.1:${port}/api/v1/health/ready"
  check "the web pages are served through the proxy" "sudo bash $0 restart" \
    curl -fsS --max-time 6 -o /dev/null "http://127.0.0.1:${port}/nodes"
  step "Files"
  if [ "$mode" = "docker" ]; then
    check ".env is private (root only)" "sudo chmod 600 ${APP_DIR}/.env" bash -c "[ \"\$(stat -c %a '${APP_DIR}/.env')\" = 600 ]"
  else
    check "backend.env is not world-readable" "sudo chmod 640 ${CONF_DIR}/backend.env" bash -c "[ \"\$(stat -c %a '${CONF_DIR}/backend.env')\" = 640 ]"
  fi
  if [ "$problems" -eq 0 ]; then
    ok "All ${total} checks passed."
  else
    die "${problems} of ${total} checks failed."
  fi
}

cmd_uninstall() {
  need_root uninstall
  local mode
  mode="$(installed_mode)"
  if [ -z "$mode" ]; then
    # Nothing marks an install, but an earlier uninstall may have left its configuration behind.
    if [ -f "${APP_DIR}/.env" ]; then mode=docker
    elif [ -f "${CONF_DIR}/backend.env" ]; then mode=direct
    else die "Nothing to uninstall."; fi
  fi
  step "Uninstalling ipping"
  if [ "$PURGE" -eq 1 ]; then
    warn "--purge also deletes the database: every measurement, node and account."
  fi
  confirm "Remove ipping from this host?" n || exit 0
  if [ "$mode" = "docker" ]; then
    if [ "$PURGE" -eq 1 ]; then run "Removing the containers and their data" compose down -v; else run "Removing the containers" compose down; fi
  else
    systemctl disable --now ipping-caddy ipping-frontend ipping-backend >/dev/null 2>&1 || true
    rm -f /etc/systemd/system/ipping-backend.service /etc/systemd/system/ipping-frontend.service /etc/systemd/system/ipping-caddy.service
    systemctl daemon-reload
    if [ "$PURGE" -eq 1 ] && [ -f "${APP_DIR}/created-database" ]; then
      runuser -u postgres -- psql -qc 'DROP DATABASE IF EXISTS ipping' -c 'DROP ROLE IF EXISTS ipping' || true
    fi
    rm -rf "${APP_DIR}/backend" "${APP_DIR}/frontend" "${APP_DIR}/node" "${APP_DIR}/caddy" "${APP_DIR}/uv" "${APP_DIR}/python"
    if [ "$PURGE" -eq 1 ]; then
      rm -rf "$CONF_DIR" /var/lib/ipping-caddy
      for u in "${DIRECT_USERS[@]}"; do userdel "$u" 2>/dev/null || true; done
    fi
  fi
  rm -f "$MODE_FILE" "$VERSION_FILE"
  if [ "$PURGE" -eq 1 ]; then
    rm -rf "$APP_DIR"
    ok "Removed, including the database. Backups in ${BACKUP_DIR} were left alone."
  else
    ok "Removed. The database and configuration were kept so a reinstall finds them; add --purge to delete them. Other databases and PostgreSQL itself are never touched."
  fi
}

# ------------------------------------------------------------------------------------------------
# Menu and arguments
# ------------------------------------------------------------------------------------------------

usage() {
  cat <<EOF
Usage: sudo bash $0 <command> [options]

Commands:
  install        Install the application (--mode docker | direct)
  update         Install another release (backs up the database first)
  start | stop | restart | status | logs
  doctor         Check the installation
  access         Show the address and the setup token
  backup         Dump the database to ${BACKUP_DIR}
  geoip-update   Download the free DB-IP Lite databases (optional: names the network of an address and
                 cross-checks a GeoIP place against the measurements); repeat monthly
  restore FILE   Replace the database with a backup
  uninstall      Remove it (data is kept unless --purge)

Options:
  --mode docker|direct   docker: Compose stack, only Docker needed.
                         direct: systemd services, no Docker (Debian/Ubuntu; PostgreSQL from apt).
  --version vX.Y.Z       Release to install (default: latest). "main" is the edge channel (Docker only).
  --domain NAME          Serve HTTPS for this domain (Caddy gets a certificate). Default: plain HTTP.
                         Run without options for a guided install.
  --http-port N          Host port for HTTP (default 80)
  --https-port N         Host port for HTTPS (default 443)
  --backend-workers N    Backend processes (default 1). They share PostgreSQL, so any of them can serve
                         any request or node; more than one is for more CPU cores or crash tolerance.
  --database-url URL     Use your own PostgreSQL instead of a local one (direct mode)
  --purge                With uninstall: also delete the data
  -y, --yes              Do not ask questions
EOF
}

port_in_use() { # port_in_use PORT
  command_exists ss || return 1
  [ -n "$(ss -H -ltn "sport = :$1" 2>/dev/null)" ]
}

port_owner() { # the program listening on PORT, when ss can tell us
  ss -H -ltnp "sport = :$1" 2>/dev/null | sed -n 's/.*users:(("\([^"]*\)".*/\1/p' | head -n 1
}

preflight() {
  # Catch the common mistakes before anything is installed.
  [ "$(uname -s)" = Linux ] || die "ipping installs on Linux; this is $(uname -s)."
  local ports="$HTTP_PORT" port owner
  if [ "$MODE" = docker ] || [ -n "$DOMAIN" ]; then ports="$ports $HTTPS_PORT"; fi
  for port in $ports; do
    if port_in_use "$port"; then
      owner="$(port_owner "$port")"
      die "Port ${port} is already in use${owner:+ by ${owner}}. Stop that program, or pick other ports with --http-port and --https-port."
    fi
  done
}

describe_address() {
  if [ -n "$DOMAIN" ]; then printf 'https://%s  (a certificate is requested automatically)' "$DOMAIN"
  elif [ "$HTTP_PORT" = 80 ]; then printf 'plain HTTP on this machine, port 80'
  else printf 'plain HTTP on this machine, port %s' "$HTTP_PORT"; fi
}

central_questions() {
  is_interactive || return 0
  local pick=1 reuse=0
  if [ -f "${APP_DIR}/.env" ] || [ -f "${CONF_DIR}/backend.env" ]; then reuse=1; fi
  if [ -z "$MODE" ]; then
    choose pick "How should ipping run on this machine?" 1 \
      "Docker (recommended)|Everything runs in containers. Docker is installed for you if it is missing." \
      "Directly on this machine|systemd services and a local PostgreSQL, no Docker. Debian or Ubuntu."
    case "$pick" in 1) MODE=docker ;; *) MODE=direct ;; esac
  fi
  if [ "$reuse" -eq 1 ]; then
    note "Found the settings of an earlier install; they will be reused."
  elif [ -z "$DOMAIN" ]; then
    prompt DOMAIN "Do you have a domain name for this site?" "" valid_domain \
      "Enter it (for example ping.example.com) for automatic HTTPS. It must already point at this machine, with ports 80 and 443 open. Leave empty to use plain HTTP for now."
  fi
  box "Ready to install" \
    "" \
    "Mode      $( [ "$MODE" = docker ] && echo "Docker" || echo "Directly on this machine (systemd)" )" \
    "Address   $(describe_address)" \
    "Release   ${VERSION:-latest}" \
    "Log       ${UI_LOG}" \
    ""
  confirm "Install now?" || { note "Nothing was changed."; exit 0; }
}

cmd_install() {
  need_root install
  ui_log_init /var/log/ipping-install.log
  banner "ipping" "installer"
  if [ -n "$(installed_mode)" ]; then
    die "ipping is already installed. Use 'update' to change versions, or 'uninstall' first."
  fi
  central_questions
  case "$MODE" in
    docker) ensure_tools ;;
    direct) need_systemd; ensure_tools xz ;;
    *) die "Choose how to run it with --mode docker or --mode direct." ;;
  esac
  preflight
  resolve_release
  case "$MODE" in
    docker) install_docker_mode ;;
    direct) install_direct_mode ;;
  esac
}

menu_status_line() {
  local mode state="not installed"
  mode="$(installed_mode)"
  if [ -n "$mode" ]; then
    if service_up "$mode" "$( [ "$mode" = docker ] && echo proxy || echo ipping-caddy )"; then state="running"; else state="stopped"; fi
    printf '%s  %s  %s  %s  %s' "$(cat "$VERSION_FILE" 2>/dev/null || echo unknown)" "$S_SEP" "$mode" "$S_SEP" "$state"
  else
    printf 'not installed'
  fi
}

menu() {
  local choice mode keys=() labels=() i
  trap ':' INT   # Ctrl-C stops a running action (such as logs), not the menu
  while :; do
    mode="$(installed_mode)"
    keys=(); labels=()
    if [ -z "$mode" ]; then
      keys=(install_docker install_direct); labels=("Install with Docker (recommended)" "Install directly on this machine")
    else
      keys=(status access doctor logs update backup restart stop start uninstall)
      labels=("Show what is running" "Show the address and setup token" "Check that everything works" "Follow the logs" "Update to the latest release" "Back up the database" "Restart" "Stop" "Start" "Uninstall")
    fi
    banner "ipping" "$(menu_status_line)"
    printf '\n'
    for ((i = 0; i < ${#keys[@]}; i++)); do printf '  %s%2d%s  %s\n' "$C_CYAN" $((i + 1)) "$C_RESET" "${labels[i]}"; done
    printf '  %s q%s  Quit\n\n' "$C_CYAN" "$C_RESET"
    printf '  %s>%s ' "$C_CYAN" "$C_RESET"
    read -r choice || exit 0
    case "$choice" in q | Q | quit | exit | "") exit 0 ;; esac
    if [[ $choice =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le "${#keys[@]}" ]; then
      case "${keys[choice - 1]}" in
        install_docker) ( MODE=docker; cmd_install ) || true ;;
        install_direct) ( MODE=direct; cmd_install ) || true ;;
        status) ( cmd_status ) || true ;;
        access) ( cmd_access ) || true ;;
        doctor) ( cmd_doctor ) || true ;;
        logs) ( cmd_logs ) || true ;;
        update) ( cmd_update ) || true ;;
        backup) ( cmd_backup ) || true ;;
        restart) ( cmd_restart ) || true ;;
        stop) ( cmd_stop ) || true ;;
        start) ( cmd_start ) || true ;;
        uninstall) ( cmd_uninstall ) || true ;;
      esac
      printf '\n%sPress Enter to return to the menu.%s ' "$C_DIM" "$C_RESET"
      read -r _ || exit 0
    else
      warn "Choose a number from the list, or q to quit."
      sleep 1
    fi
  done
}

elevate_if_needed() {
  # Started as a normal user (the usual "download and run" one-liner)? Run again through sudo,
  # keeping the same arguments. Help text needs no privileges.
  [ "$(id -u)" -eq 0 ] && return 0
  local arg
  for arg in "$@"; do case "$arg" in -h | --help) return 0 ;; esac; done
  if ! command_exists sudo; then die "This needs root and sudo is not installed. Run it as root."; fi
  if [ ! -f "$0" ]; then die "Save the script to a file and run it from there (it has to start itself again with sudo)."; fi
  note "This needs root: running again with sudo."
  exec sudo --preserve-env bash "$0" "$@"
}

main() {
  local command="" original_args=("$@") restore_file=""
  SETUP_TOKEN="${IPPING_SETUP_TOKEN:-}"
  while [ $# -gt 0 ]; do
    case "$1" in
      install | update | start | stop | restart | status | logs | doctor | access | backup | geoip-update | uninstall) command="$1" ;;
      restore) command=restore; restore_file="${2:-}"; [ $# -gt 1 ] && shift ;;
      --mode) MODE="${2:?--mode needs a value}"; shift ;;
      --version)
        VERSION="${2:?--version needs a value}"; shift
        valid_version "$VERSION" || die "'${VERSION}' is not a version. Use something like v0.2.0, latest, or main."
        ;;
      --domain)
        DOMAIN="${2:?--domain needs a value}"; shift
        valid_domain "$DOMAIN" || die "'${DOMAIN}' is not a domain name. Use something like ping.example.com."
        ;;
      --http-port) HTTP_PORT="${2:?--http-port needs a value}"; shift ;;
      --https-port) HTTPS_PORT="${2:?--https-port needs a value}"; shift ;;
      --backend-workers) BACKEND_WORKERS="${2:?--backend-workers needs a value}"; shift ;;
      --database-url) DATABASE_URL="${2:?--database-url needs a value}"; shift ;;
      --purge) PURGE=1 ;;
      -y | --yes) ASSUME_YES=1 ;;
      -h | --help) usage; exit 0 ;;
      *) usage >&2; die "Unknown argument: $1" ;;
    esac
    shift
  done
  case "$BACKEND_WORKERS" in
    '' | *[!0-9]* | 0) die "--backend-workers must be a whole number from 1 to 16." ;;
    *) [ "$BACKEND_WORKERS" -le 16 ] || die "--backend-workers must be a whole number from 1 to 16." ;;
  esac
  # Only now, with the arguments known to be good: asking for a password for a typo is rude.
  elevate_if_needed "${original_args[@]}"
  case "$command" in
    "") if [ -t 0 ]; then need_root; ui_log_init /var/log/ipping-install.log; menu; else usage; exit 1; fi ;;
    install) cmd_install ;;
    update) ui_log_init /var/log/ipping-install.log; cmd_update ;;
    start) need_root; ui_log_init /var/log/ipping-install.log; cmd_start ;;
    stop) need_root; ui_log_init /var/log/ipping-install.log; cmd_stop ;;
    restart) need_root; ui_log_init /var/log/ipping-install.log; cmd_restart ;;
    status) cmd_status ;;
    access) cmd_access ;;
    logs) cmd_logs ;;
    doctor) cmd_doctor ;;
    backup) ui_log_init /var/log/ipping-install.log; cmd_backup ;;
    geoip-update) ui_log_init /var/log/ipping-install.log; cmd_geoip_update ;;
    restore) ui_log_init /var/log/ipping-install.log; cmd_restore "$restore_file" ;;
    uninstall) ui_log_init /var/log/ipping-install.log; cmd_uninstall ;;
  esac
}

# Run when executed (also when piped from curl), but not when a test sources this file.
if [ -z "${BASH_SOURCE[0]:-}" ] || [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main "$@"
fi
