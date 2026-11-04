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
DATABASE_URL=""
PURGE=0
SETUP_TOKEN=""

# ------------------------------------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------------------------------------

if [ -t 1 ]; then
  BOLD=$'\033[1m'; RED=$'\033[31m'; YELLOW=$'\033[33m'; GREEN=$'\033[32m'; RESET=$'\033[0m'
else
  BOLD=""; RED=""; YELLOW=""; GREEN=""; RESET=""
fi

step() { printf '%s==>%s %s\n' "$BOLD" "$RESET" "$*"; }
info() { printf '    %s\n' "$*"; }
warn() { printf '%sWarning:%s %s\n' "$YELLOW" "$RESET" "$*" >&2; }
ok()   { printf '%s%s%s\n' "$GREEN" "$*" "$RESET"; }
die()  { printf '%sError:%s %s\n' "$RED" "$RESET" "$*" >&2; exit 1; }

command_exists() { command -v "$1" >/dev/null 2>&1; }
need_root() { [ "$(id -u)" -eq 0 ] || die "Run this as root (for example: sudo bash $0 $*)."; }
is_interactive() { [ -t 0 ] && [ "$ASSUME_YES" -eq 0 ]; }

confirm() {
  if ! is_interactive; then return 0; fi
  local reply
  read -r -p "$1 [Y/n] " reply
  case "${reply:-y}" in [Yy]*) return 0 ;; *) return 1 ;; esac
}

ask() {
  # ask VAR "prompt": leaves VAR alone when it is set already or there is no terminal.
  local var="$1" prompt="$2" current
  current="${!var}"
  if [ -n "$current" ] || ! is_interactive; then return 0; fi
  read -r -p "$prompt: " current
  printf -v "$var" '%s' "$current"
}

TMP_DIRS=()
cleanup() { [ "${#TMP_DIRS[@]}" -eq 0 ] || rm -rf "${TMP_DIRS[@]}"; }
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

need_apt() { command_exists apt-get || die "$1 Automatic installation of system packages supports Debian and Ubuntu only."; }

apt_install() {
  need_apt "Missing: $*."
  step "Installing system packages: $*"
  DEBIAN_FRONTEND=noninteractive apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends "$@" >/dev/null
}

ensure_tools() {
  # ensure_tools [extra tools...]: the basics every mode needs, plus whatever the caller names.
  local missing=()
  for tool in curl sha256sum tar "$@"; do command_exists "$tool" || missing+=("$tool"); done
  command_exists jq || missing+=(jq)
  if [ "${#missing[@]}" -gt 0 ]; then
    local pkgs=()
    for tool in "${missing[@]}"; do
      case "$tool" in sha256sum | tar) pkgs+=(coreutils tar) ;; xz) pkgs+=(xz-utils) ;; *) pkgs+=("$tool") ;; esac
    done
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
  # download URL DEST
  curl -fsSL --retry 3 "$1" -o "$2" || die "Could not download $1"
}

# ------------------------------------------------------------------------------------------------
# Releases: which versions make up this install
# ------------------------------------------------------------------------------------------------

resolve_release() {
  # Sets TAG ("main" means the edge channel) and downloads the release files into $REL_DIR.
  REL_DIR="$(make_temp_dir)"
  if [ "$VERSION" = "main" ]; then
    TAG="main"
    step "Using the edge channel (images tagged latest, files from the main branch)"
    download "${RAW_BASE}/main/compose.yaml" "${REL_DIR}/compose.yaml"
    download "${RAW_BASE}/main/deploy/Caddyfile" "${REL_DIR}/Caddyfile"
    STACK_VERSION="main"
    FRONTEND_IMAGE="${DOCKERHUB_NAMESPACE}/ipping:latest"
    BACKEND_IMAGE="${DOCKERHUB_NAMESPACE}/ipping-backend:latest"
    return
  fi
  if [ -n "$VERSION" ] && [ "$VERSION" != "latest" ]; then
    case "$VERSION" in v*) TAG="$VERSION" ;; *) TAG="v$VERSION" ;; esac
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
  info "stack ${STACK_VERSION}: frontend $(jq -r '.frontend.version' "$m"), backend $(jq -r '.backend.version' "$m")"
}

# ------------------------------------------------------------------------------------------------
# Docker mode
# ------------------------------------------------------------------------------------------------

install_docker_if_missing() {
  if command_exists docker && docker compose version >/dev/null 2>&1; then return; fi
  need_apt "Docker with the compose plugin is required (https://docs.docker.com/engine/install/)."
  confirm "Docker (with the compose plugin) is not installed. Install it from Docker's apt repository?" \
    || die "Docker is required for --mode docker."
  step "Installing Docker from Docker's apt repository"
  # shellcheck source=/dev/null
  . /etc/os-release
  case "$ID" in ubuntu | debian) ;; *) die "Automatic Docker installation supports Debian and Ubuntu; install Docker manually." ;; esac
  apt_install ca-certificates curl
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/${ID}/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  cat >/etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/${ID}
Suites: ${UBUNTU_CODENAME:-$VERSION_CODENAME}
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
  apt_install docker-ce docker-ce-cli containerd.io docker-compose-plugin
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
  resolve_release
  local reuse=0
  if [ -f "${APP_DIR}/.env" ]; then
    [ ! -f "$MODE_FILE" ] || die "ipping is already installed in ${APP_DIR}. Use 'update' to change versions, or 'uninstall' first."
    reuse=1
    info "Found the configuration kept by an earlier uninstall; reusing it (the database password in it matches the kept database)."
  fi
  step "Writing ${APP_DIR}"
  install -d -m 0750 "${APP_DIR}" "${APP_DIR}/deploy"
  install -m 0644 "${REL_DIR}/compose.yaml" "${APP_DIR}/compose.yaml"
  install -m 0644 "${REL_DIR}/Caddyfile" "${APP_DIR}/deploy/Caddyfile"
  if [ "$reuse" -eq 1 ]; then
    env_set IPPING_FRONTEND_IMAGE "$FRONTEND_IMAGE"
    env_set IPPING_BACKEND_IMAGE "$BACKEND_IMAGE"
  else
    ask DOMAIN "Domain name for HTTPS (leave empty for plain HTTP on port ${HTTP_PORT})"
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
IPPING_FRONTEND_IMAGE=${FRONTEND_IMAGE}
IPPING_BACKEND_IMAGE=${BACKEND_IMAGE}
EOF
    )
  fi
  echo docker >"$MODE_FILE"
  echo "$TAG" >"$VERSION_FILE"

  step "Pulling images and starting the stack"
  compose pull --quiet || warn "Could not pull every image; continuing with local copies if present."
  compose up -d
  step "Waiting for the application to answer"
  wait_for_ready "http://127.0.0.1:${HTTP_PORT}/api/v1/health/ready" 120 \
    || { compose ps; die "The application did not become ready. See: bash $0 logs"; }
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
  # fetch_runtime NAME URL CHECKSUM-FILE-URL ARCHIVE-NAME DEST_DIR: download, verify against the
  # publisher's checksum list, unpack into DEST_DIR (stripping the top-level folder where asked).
  local name="$1" url="$2" sums_url="$3" archive="$4" dest="$5" strip="${6:-0}" tmp expected
  [ -x "${dest}/.complete" ] && { info "${name} already present"; return; }
  tmp="$(make_temp_dir)"
  step "Downloading ${name}"
  download "$url" "${tmp}/${archive}"
  download "$sums_url" "${tmp}/sums"
  expected="$(awk -v f="$archive" '{ n = $2; sub(/^\*/, "", n); if (n == f) print $1 }' "${tmp}/sums" | head -n 1)"
  [ -n "$expected" ] || expected="$(awk '{ print $1 }' "${tmp}/sums" | head -n 1)"   # a bare .sha256 file
  [ -n "$expected" ] || die "No checksum published for ${archive}."
  verify_sha256 "${tmp}/${archive}" "$expected"
  rm -rf "$dest"; install -d -m 0755 "$dest"
  tar -xf "${tmp}/${archive}" -C "$dest" --strip-components="$strip" --no-same-owner --no-same-permissions
  chmod 755 "$dest"
  printf '#!/bin/sh\n' >"${dest}/.complete"; chmod +x "${dest}/.complete"
}

install_postgres() {
  if [ -n "$DATABASE_URL" ]; then info "Using the database you provided."; return; fi
  command_exists psql || apt_install postgresql
  step "Starting PostgreSQL and creating the ipping database"
  systemctl enable --now postgresql >/dev/null 2>&1 || true
  local waited=0
  until runuser -u postgres -- psql -tAc 'SELECT 1' >/dev/null 2>&1; do
    sleep 1; waited=$((waited + 1)); [ "$waited" -lt 30 ] || die "PostgreSQL did not start."
  done
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
    info "backend ${bver} is already installed"
  else
    step "Installing the backend ${bver}"
    download "$(jq -r '.backend.wheel.url' "$m")" "${tmp}/backend.whl"
    verify_sha256 "${tmp}/backend.whl" "$wheel_sha"
    download "$(jq -r '.backend.lock.url' "$m")" "${tmp}/requirements.lock"
    verify_sha256 "${tmp}/requirements.lock" "$lock_sha"
    # The wheel's file name carries its version and must be kept for pip to accept it.
    local wheel_name
    wheel_name="$(basename "$(jq -r '.backend.wheel.url' "$m")")"
    mv "${tmp}/backend.whl" "${tmp}/${wheel_name}"
    rm -rf "$backend_dir"; install -d -m 0755 "$backend_dir"
    # Python itself comes from uv too, into a directory the service user can read, so this works
    # the same on every distribution whatever Python it ships.
    export UV_PYTHON_INSTALL_DIR="${APP_DIR}/python" UV_CACHE_DIR="${tmp}/uv-cache"
    install -d -m 0755 "$UV_PYTHON_INSTALL_DIR"
    "${APP_DIR}/uv/uv" python install --quiet 3.12
    "${APP_DIR}/uv/uv" venv --quiet --python 3.12 --python-preference only-managed "${backend_dir}/venv"
    "${APP_DIR}/uv/uv" pip install --quiet --python "${backend_dir}/venv/bin/python" \
      --require-hashes -r "${tmp}/requirements.lock"
    "${APP_DIR}/uv/uv" pip install --quiet --python "${backend_dir}/venv/bin/python" --no-deps "${tmp}/${wheel_name}"
  fi

  if [ -f "${frontend_dir}/server.js" ]; then
    info "frontend ${fver} is already installed"
  else
    step "Installing the frontend ${fver}"
    download "$(jq -r '.frontend.bundle.url' "$m")" "${tmp}/frontend.tar.gz"
    verify_sha256 "${tmp}/frontend.tar.gz" "$bundle_sha"
    rm -rf "$frontend_dir"; install -d -m 0755 "$frontend_dir"
    # Whatever owner and modes the archive carries, the service user must be able to read it.
    tar -xzf "${tmp}/frontend.tar.gz" -C "$frontend_dir" --no-same-owner --no-same-permissions
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
  ensure_tools xz
  local reuse=0
  if [ -f "${CONF_DIR}/backend.env" ]; then
    [ ! -f "$MODE_FILE" ] || die "ipping is already installed. Use 'update' to change versions, or 'uninstall' first."
    reuse=1
    info "Found the configuration kept by an earlier uninstall; reusing it."
  fi
  resolve_release
  if [ "$reuse" -eq 0 ]; then
    ask DOMAIN "Domain name for HTTPS (leave empty for plain HTTP on port ${HTTP_PORT})"
    site_settings
    SETUP_TOKEN="${SETUP_TOKEN:-$(random_secret 32)}"
  fi

  step "Creating service accounts and directories"
  for u in "${DIRECT_USERS[@]}"; do ensure_user "$u"; done
  install -d -m 0755 "$APP_DIR" "$APP_DIR/backend" "$APP_DIR/frontend"
  install -d -m 0755 "$CONF_DIR"
  install -d -m 0700 -o ipping-caddy -g ipping-caddy /var/lib/ipping-caddy

  direct_prepare_runtimes
  [ "$reuse" -eq 0 ] || DATABASE_URL="$(sed -n 's/^IPPING_DATABASE_URL=//p' "${CONF_DIR}/backend.env" | head -n 1)"
  install_postgres
  install_direct_artifacts
  switch_direct_releases

  sed -e 's#reverse_proxy backend:8000#reverse_proxy 127.0.0.1:8000#' \
      -e 's#reverse_proxy frontend:3000#reverse_proxy 127.0.0.1:3000#' "${REL_DIR}/Caddyfile" >"${CONF_DIR}/Caddyfile"
  chmod 644 "${CONF_DIR}/Caddyfile"
  if [ "$reuse" -eq 0 ]; then
    step "Writing configuration"
    (
      umask 027
      cat >"${CONF_DIR}/backend.env" <<EOF
IPPING_DATABASE_URL=${DATABASE_URL}
IPPING_SETUP_TOKEN=${SETUP_TOKEN}
IPPING_PUBLIC_URL=${PUBLIC_URL}
IPPING_COOKIE_SECURE=${COOKIE_SECURE}
IPPING_HOST=127.0.0.1
IPPING_PORT=8000
EOF
    )
    chown root:ipping-backend "${CONF_DIR}/backend.env"; chmod 640 "${CONF_DIR}/backend.env"
    if [ "$HTTP_PORT" != "80" ] && [ -z "$DOMAIN" ]; then SITE_ADDRESS=":${HTTP_PORT}"; fi
    echo "IPPING_SITE_ADDRESS=${SITE_ADDRESS}" >"${CONF_DIR}/caddy.env"
    chmod 644 "${CONF_DIR}/caddy.env"
  fi
  echo direct >"$MODE_FILE"
  echo "$TAG" >"$VERSION_FILE"

  step "Applying database migrations"
  run_migration

  step "Starting the services"
  write_direct_units "$TAG"
  systemctl daemon-reload
  systemctl enable ipping-backend ipping-frontend ipping-caddy >/dev/null 2>&1
  systemctl restart ipping-backend ipping-frontend ipping-caddy
  step "Waiting for the application to answer"
  wait_for_ready "http://127.0.0.1:${HTTP_PORT}/api/v1/health/ready" 90 \
    || die "The application did not become ready. See: bash $0 logs"
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
  echo
  ok "ipping is running at ${url}"
  info "1. Open ${url}/setup and create the administrator with this one-time setup token:"
  info "     ${token}"
  info "2. In Admin -> Enrollment create a token, then install a node on each measurement host:"
  info "     sudo bash ipping-node.sh install --mode docker --server ${url} --token <token>"
  case "$url" in http://*) info "   (plain HTTP: add --allow-insecure to the node install, or give this site a domain for HTTPS)" ;; esac
  info "Backups: sudo bash $0 backup    Health: sudo bash $0 doctor"
}

svc() { systemctl "$1" ipping-backend ipping-frontend ipping-caddy; }

cmd_start()   { case "$(require_mode)" in docker) compose up -d ;; direct) svc start ;; esac; }
cmd_stop()    { case "$(require_mode)" in docker) compose stop ;; direct) svc stop ;; esac; }
cmd_restart() { case "$(require_mode)" in docker) compose restart ;; direct) svc restart ;; esac; }

cmd_status() {
  case "$(require_mode)" in
    docker) compose ps ;;
    direct) systemctl status ipping-backend ipping-frontend ipping-caddy --no-pager || true ;;
  esac
  [ -f "$VERSION_FILE" ] && echo "Installed release: $(cat "$VERSION_FILE")"
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
  step "Backing up the database to ${out}"
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

cmd_restore() {
  need_root restore
  local file="${1:-}" mode
  [ -f "$file" ] || die "Usage: bash $0 restore /path/to/ipping-….dump"
  mode="$(require_mode)"
  confirm "This replaces the current database with ${file}. Continue?" || exit 0
  step "Stopping the application"
  if [ "$mode" = "docker" ]; then compose stop frontend backend proxy; else systemctl stop ipping-caddy ipping-backend ipping-frontend; fi
  step "Restoring"
  if [ "$mode" = "docker" ]; then
    compose exec -T postgres pg_restore -U ipping -d ipping --clean --if-exists --no-owner <"$file"
  elif [ -f "${APP_DIR}/created-database" ]; then
    runuser -u postgres -- pg_restore -d ipping --clean --if-exists --no-owner <"$file"
  else
    local url
    url="$(sed -n 's/^IPPING_DATABASE_URL=//p' "${CONF_DIR}/backend.env" | head -n 1)"
    pg_restore -d "${url/postgresql+asyncpg:/postgresql:}" --clean --if-exists --no-owner <"$file"
  fi
  step "Starting the application"
  if [ "$mode" = "docker" ]; then compose up -d; else systemctl start ipping-backend ipping-frontend ipping-caddy; fi
  ok "Restored. If you restored a backup from an older release, also install that release (update --version)."
}

cmd_update() {
  need_root update
  local mode
  mode="$(require_mode)"
  ensure_tools
  resolve_release
  local current; current="$(cat "$VERSION_FILE" 2>/dev/null || echo unknown)"
  if [ "$current" = "$TAG" ] && [ "$TAG" != "main" ]; then
    info "Already on ${TAG}."
    return
  fi
  step "Updating ${current} -> ${TAG}"
  cmd_backup
  info "If the update goes wrong: bash $0 restore ${BACKUP_FILE}, then install the previous release."

  if [ "$mode" = "docker" ]; then
    install -m 0644 "${REL_DIR}/compose.yaml" "${APP_DIR}/compose.yaml"
    install -m 0644 "${REL_DIR}/Caddyfile" "${APP_DIR}/deploy/Caddyfile"
    env_set IPPING_FRONTEND_IMAGE "$FRONTEND_IMAGE"
    env_set IPPING_BACKEND_IMAGE "$BACKEND_IMAGE"
    compose pull --quiet || warn "Could not pull every image; continuing with local copies if present."
    compose up -d
    wait_for_ready "http://127.0.0.1:$(http_port)/api/v1/health/ready" 120 \
      || die "The updated stack did not become ready. Backup: ${BACKUP_FILE}"
  else
    need_systemd
    direct_prepare_runtimes
    DATABASE_URL="$(sed -n 's/^IPPING_DATABASE_URL=//p' "${CONF_DIR}/backend.env" | head -n 1)"
    install_direct_artifacts
    systemctl stop ipping-backend ipping-frontend
    switch_direct_releases
    if ! run_migration; then
      warn "Migration failed; going back to the previous version."
      [ -n "${BACKEND_PREVIOUS:-}" ] && ln -sfn "$BACKEND_PREVIOUS" "${APP_DIR}/backend/current"
      [ -n "${FRONTEND_PREVIOUS:-}" ] && ln -sfn "$FRONTEND_PREVIOUS" "${APP_DIR}/frontend/current"
      systemctl start ipping-backend ipping-frontend
      die "Update failed during the database migration. Backup: ${BACKUP_FILE}"
    fi
    systemctl start ipping-backend ipping-frontend
    systemctl reload-or-restart ipping-caddy
    wait_for_ready "http://127.0.0.1:$(http_port)/api/v1/health/ready" 90 \
      || die "The updated application did not become ready. Backup: ${BACKUP_FILE}"
  fi
  echo "$TAG" >"$VERSION_FILE"
  ok "Updated to ${TAG}."
}

cmd_doctor() {
  local mode problems=0
  mode="$(installed_mode)"
  [ -n "$mode" ] || die "Not installed."
  check() { local what="$1"; shift; if "$@" >/dev/null 2>&1; then printf '  %sok%s   %s\n' "$GREEN" "$RESET" "$what"; else printf '  %sFAIL%s %s\n' "$RED" "$RESET" "$what"; problems=$((problems + 1)); fi; }
  echo "ipping doctor (mode: ${mode}, release: $(cat "$VERSION_FILE" 2>/dev/null || echo unknown))"
  local port
  port="$(http_port)"
  if [ "$mode" = "docker" ]; then
    for s in proxy frontend backend postgres; do
      check "${s} container running" bash -c "docker compose -p '$COMPOSE_PROJECT' -f '${APP_DIR}/compose.yaml' --env-file '${APP_DIR}/.env' ps --status running --services | grep -qx ${s}"
    done
    check ".env is private (mode 600)" bash -c "[ \"\$(stat -c %a '${APP_DIR}/.env')\" = 600 ]"
  else
    for s in ipping-backend ipping-frontend ipping-caddy; do check "${s} running" systemctl is-active --quiet "$s"; done
    check "backend.env is not world-readable" bash -c "[ \"\$(stat -c %a '${CONF_DIR}/backend.env')\" = 640 ]"
  fi
  check "API ready (http://127.0.0.1:${port}/api/v1/health/ready)" curl -fsS --max-time 6 "http://127.0.0.1:${port}/api/v1/health/ready"
  check "frontend served through the proxy" curl -fsS --max-time 6 -o /dev/null "http://127.0.0.1:${port}/nodes"
  if [ "$problems" -eq 0 ]; then ok "No problems found."; else die "${problems} problem(s) found."; fi
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
  confirm "Remove ipping from this host?" || exit 0
  if [ "$mode" = "docker" ]; then
    if [ "$PURGE" -eq 1 ]; then compose down -v; else compose down; fi
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
  backup         Dump the database to ${BACKUP_DIR}
  restore FILE   Replace the database with a backup
  uninstall      Remove it (data is kept unless --purge)

Options:
  --mode docker|direct   docker: Compose stack, only Docker needed.
                         direct: systemd services, no Docker (Debian/Ubuntu; PostgreSQL from apt).
  --version vX.Y.Z       Release to install (default: latest). "main" is the edge channel (Docker only).
  --domain NAME          Serve HTTPS for this domain (Caddy gets a certificate). Default: plain HTTP.
  --http-port N          Host port for HTTP (default 80)
  --https-port N         Host port for HTTPS (default 443)
  --database-url URL     Use your own PostgreSQL instead of a local one (direct mode)
  --purge                With uninstall: also delete the data
  -y, --yes              Do not ask questions
EOF
}

cmd_install() {
  need_root install
  [ -n "$MODE" ] || ask MODE "Mode (docker or direct)"
  case "$MODE" in
    docker) ensure_tools; install_docker_mode ;;
    direct) install_direct_mode ;;
    *) die "--mode must be docker or direct." ;;
  esac
}

menu() {
  echo "ipping"
  # shellcheck disable=SC2034  # the menu acts on $REPLY, not the selected text
  select choice in "Install (Docker)" "Install (direct, systemd)" "Update" "Status" "Logs" "Doctor" "Backup" "Restart" "Uninstall" "Quit"; do
    case "$REPLY" in
      1) MODE=docker; cmd_install; break ;;
      2) MODE=direct; cmd_install; break ;;
      3) cmd_update; break ;;
      4) cmd_status; break ;;
      5) cmd_logs; break ;;
      6) cmd_doctor; break ;;
      7) cmd_backup; break ;;
      8) cmd_restart; break ;;
      9) cmd_uninstall; break ;;
      10) break ;;
    esac
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
  info "Root is needed; running again with sudo."
  exec sudo --preserve-env bash "$0" "$@"
}

main() {
  elevate_if_needed "$@"
  local command="" restore_file=""
  SETUP_TOKEN="${IPPING_SETUP_TOKEN:-}"
  while [ $# -gt 0 ]; do
    case "$1" in
      install | update | start | stop | restart | status | logs | doctor | backup | uninstall) command="$1" ;;
      restore) command=restore; restore_file="${2:-}"; [ $# -gt 1 ] && shift ;;
      --mode) MODE="${2:?--mode needs a value}"; shift ;;
      --version) VERSION="${2:?--version needs a value}"; shift ;;
      --domain) DOMAIN="${2:?--domain needs a value}"; shift ;;
      --http-port) HTTP_PORT="${2:?--http-port needs a value}"; shift ;;
      --https-port) HTTPS_PORT="${2:?--https-port needs a value}"; shift ;;
      --database-url) DATABASE_URL="${2:?--database-url needs a value}"; shift ;;
      --purge) PURGE=1 ;;
      -y | --yes) ASSUME_YES=1 ;;
      -h | --help) usage; exit 0 ;;
      *) usage >&2; die "Unknown argument: $1" ;;
    esac
    shift
  done
  case "$command" in
    "") if [ -t 0 ]; then need_root; menu; else usage; exit 1; fi ;;
    install) cmd_install ;;
    update) cmd_update ;;
    start) need_root; cmd_start ;;
    stop) need_root; cmd_stop ;;
    restart) need_root; cmd_restart ;;
    status) cmd_status ;;
    logs) cmd_logs ;;
    doctor) cmd_doctor ;;
    backup) cmd_backup ;;
    restore) cmd_restore "$restore_file" ;;
    uninstall) cmd_uninstall ;;
  esac
}

main "$@"
