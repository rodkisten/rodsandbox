#!/usr/bin/env bash
set -euo pipefail
# Installs only prebuilt immutable images; never invokes npm/pnpm/cargo/go build.
# Run from the installed runtime/ directory after copying approved policy/config.
: "${RUNTIME_AGENT_IMAGE:?Set the approved immutable image reference}"
if [[ ! "$RUNTIME_AGENT_IMAGE" =~ ^ghcr\.io/rodkisten/rodsandbox/runtime-agent@sha256:[a-f0-9]{64}$ ]]; then
  echo 'Expected the approved runtime-agent GHCR image by digest' >&2; exit 1
fi
: "${DOCKER_GID:?Set the local Docker Unix socket group id}"
[[ "$DOCKER_GID" =~ ^[0-9]+$ ]] || exit 1
test -s policy.json && test -s runtime-token && test -S /var/run/docker.sock
test "$(stat -c '%a' runtime-token)" = 400 || { echo 'runtime-token must be mode 0400 and owned by UID 1000' >&2; exit 1; }
test "$(stat -c '%u' runtime-token)" = 1000 || { echo 'runtime-token must be owned by UID 1000' >&2; exit 1; }
docker compose -f compose.agent.yaml config --quiet
docker compose -f compose.agent.yaml pull
docker compose -f compose.agent.yaml up --detach --no-build --pull never --wait --wait-timeout 60
