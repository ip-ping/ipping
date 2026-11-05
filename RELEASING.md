# Releasing ipping

ipping is three repositories that ship together:

| Repository | Tag publishes |
|---|---|
| [`ipping-backend`](https://github.com/ip-ping/ipping-backend) | image `ipping-backend:X.Y.Z`; wheel, hash-locked `requirements.lock`, API/protocol contracts, `SHA256SUMS` |
| [`ipping-node`](https://github.com/ip-ping/ipping-node) | image `ipping-node:X.Y.Z`; Linux binaries (amd64, arm64), `ipping-node.sh`, `SHA256SUMS` |
| [`ipping`](https://github.com/ip-ping/ipping) (this one) | image `ipping:X.Y.Z`; `ipping.sh`, `compose.yaml`, `Caddyfile`, frontend bundle, `release-manifest.json`, `SHA256SUMS` |

## Versions and tags

* [Semantic versioning](https://semver.org), tags are `vX.Y.Z`; a preview is `vX.Y.Z-rc.1` (or
  `-beta.1`). Before 1.0 a minor bump (`0.2.0`) may break things; a patch (`0.1.1`) never should.
* **Each repository is versioned on its own.** The version of *this* repository is the version of
  the application: its `release-manifest.json` names the exact backend release and the node
  protocol that were tested with it, and `ipping.sh` installs exactly that combination.
* A tag must match the version in the code, and the release run refuses it otherwise:
  `ipping-backend` → `pyproject.toml` (and `__version__`, checked by a test), `ipping-node` →
  `Cargo.toml` (and `Cargo.lock`), `ipping` → `package.json` (and `package-lock.json`). A preview
  tag (`v0.2.0-rc.1`) matches the version it previews (`0.2.0`).
* **Tags never move and are never reused.** To fix a bad release, publish the next patch.

## Where things are published

| What | Address |
|---|---|
| Newest stable installer | `https://github.com/ip-ping/ipping/releases/latest/download/ipping.sh` (node: `ipping-node/releases/latest/download/ipping-node.sh`) |
| A specific release | `https://github.com/ip-ping/ipping/releases/download/v0.1.0/ipping.sh` |
| Unreleased installer from `main` | `https://github.com/ip-ping/ipping/releases/download/edge/ipping.sh` |
| Docker images | `X.Y.Z` and, for stable releases, `X.Y` on Docker Hub. `latest` is **not** a release: it is whatever `main` last built. |

`edge` is a rolling *prerelease* that a workflow re-uploads on every change to the installer on
`main` (the way a rolling `latest` release would work), so it never becomes GitHub's "latest". The
stable link therefore always serves the installer of the newest tagged release, which is what an
installer running as root should be.

## Releasing

Order matters because each release pins the one before it:

1. **Bump the version** in the code of the repository you are releasing and merge it to `main`.
2. **Backend first.** Nothing depends on it.
3. **Node** (any time after its own bump; it is independent).
4. **Application (`ipping`) last.** Before tagging, in this repository:
   * set `BACKEND_TAG` (and `BACKEND_SCHEMA_REVISION`, `NODE_MIN_VERSION`) in `release.env`;
   * pin the API contract to that backend tag: `scripts/sync-contracts.sh v0.1.0`;
   * merge to `main`.

For each repository, do a dry run first, then the real thing:

```bash
gh workflow run release.yml -R ip-ping/ipping-backend -f version=0.1.0 -f dry_run=true
gh workflow run release.yml -R ip-ping/ipping-backend -f version=0.1.0 -f dry_run=false
```

(or the **Run workflow** button on the repository's Actions tab, or `git tag v0.1.0 && git push origin
v0.1.0`; all three take the same path). A dry run does everything except publish: it checks the
version, runs the full test suite, builds the images and the release files, and leaves the files as a
workflow artifact for you to inspect. A real run publishes only from `main`.

If a run fails halfway, fix the cause and run the same version again: publishing replaces files
instead of failing on the ones that already exist.

## Verifying a download

* **Checksums:** every release has a `SHA256SUMS`, and both installers check what they download
  against it before installing anything.
* **Provenance:** from v0.2.0 on, every release file also carries a signed GitHub
  attestation, which proves it was built by this repository's release workflow from the tagged
  commit. With the [GitHub CLI](https://cli.github.com):

  ```bash
  gh attestation verify ipping.sh -R ip-ping/ipping
  gh attestation verify ipping-node-linux-amd64 -R ip-ping/ipping-node
  gh attestation verify ipping_backend-0.2.0-py3-none-any.whl -R ip-ping/ipping-backend
  ```

  `gh attestation verify` prints nothing when its output is not a terminal; the exit code is the
  answer (`0` verified, non-zero refused, including for a file that was altered after release).
  Add `--format json` to see who built it: the workflow, the commit and what triggered it.

A release's `compose.yaml` pins the images of that release; the one in the repository (and on
`edge`) follows `latest`, which is whatever `main` built last.

## Compatibility

* **Node ↔ backend:** they talk protocol version 1 (`node-protocol-v1.schema.json`). A backend can
  support several protocol versions at once, so nodes upgrade on their own schedule; the manifest
  records the protocols and the oldest node version a release supports.
* **Database:** migrations run as an explicit step with a backup before it. Keep them backward
  compatible, so going back one release after a restore is possible.
* **Frontend ↔ backend:** the frontend is built against a pinned copy of the backend's OpenAPI
  document (`contracts/`), and CI fails if the generated types drift from it.

## Taking a release back

Releases are not deleted lightly. To stop people installing a bad one, mark it as a prerelease on
GitHub (`releases/latest` then points at the previous stable one) and publish a fixed patch. Docker
tags for a version are overwritten only by re-running that version's release.
