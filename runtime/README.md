# Private RodSandbox runtime agent

Implementation: `packages/runtime-agent` (Node 24 + official Elysia Node adapter). Architecture, contracts, trust boundaries and activation status live in [Rodverse REMOTE_RUNTIME](https://github.com/rodverse/rodverse/blob/feat/workflow-studio-consolidation/docs/module/federation/REMOTE_RUNTIME.md). This directory is an installation bundle, not an additional application.

The agent pulls approved GHCR images by digest, uses Docker Compose without local builds, checks health, and restores the previous image on failure. Volumes persist; image rollback **does not revert data**. Review application data migrations before promotion. Accepted operations survive browser disconnect and have a durable process-recovery journal; this is not a guarantee against filesystem/power loss.

## Installation prerequisites

The user confirmed `rod-kvm4`; no installation has been performed. An operator must use the existing administrative access, after the caller workflow has been reviewed/merged and a real agent image has been published and verified. Do not run package managers or compilers on the VPS.

1. Copy `compose.agent.yaml`, an approved `policy.json` based on `policy.example.json`, and `scripts/install-runtime-agent.sh` into the installation directory. Only approved repositories/image repositories/targets/ports can appear in policy. Select the VPS native platform.
2. Provision `runtime-token` through existing secret management, at least 32 random characters, owner UID 1000 and mode 0400. The same value belongs only in the Sandbox production Worker secret `RUNTIME_AGENT_TOKEN`. Never put it in Git, logs, browser code or a PR preview.
3. Create `registry-config/`, readable by UID 1000, without group/world access. For private GHCR images, provision a Docker `config.json` with only read access to the approved packages. Generate it outside the agent container using the existing credential system; do not pass credentials as command arguments. No registry credentials are mounted into application containers.
4. Set `RUNTIME_AGENT_IMAGE` to `ghcr.io/rodkisten/rodsandbox/runtime-agent@sha256:<verified digest>`, `DOCKER_GID` to the local Unix socket group, and `RUNTIME_CONTROL_NETWORK` to the **existing trusted Docker network shared with rod-kvm4's Tunnel container**. Verify this network before installation. The agent has alias `rod-runtime-agent` there; do not publish Docker TCP.
5. From this directory run `bash ./install-runtime-agent.sh`. It validates policy/token/network inputs and executes only Compose config/pull/up with `--no-build --pull never`.
6. Verify `http://127.0.0.1:9183/v1/health` on the VPS and an unauthenticated target request returning 401. A running health endpoint proves the process, not the full GHCR build chain.

Proposed management route: `runtime-kvm.migos.club` through the existing Tunnel to `http://rod-runtime-agent:9183`, protected by a **dedicated Access service-token policy** and Tunnel origin Access validation for that application audience. The runtime Worker requires both Access service credentials and the separate agent bearer credential. This route/policy has not been created. Existing health, Infisical, Dozzle and Beszel routes must remain untouched. A loopback binding cannot be reached directly from a separate Tunnel container; use the shared private network alias above.

## Operations and checks

`/v1/workspaces/<workspace>/targets/<target>` supports status, `/deploy`, `/rollback`, `/operations/<UUID>` and bounded `/logs`. These are machine endpoints, with no browser Origin allowed. There is no arbitrary command, host path or port proxy API. State and operations are kept in the named `state` volume; keep that volume across agent upgrades. Change the agent image digest to roll back the agent itself.

The agent's local Unix Docker socket is an administrative capability: keep the agent/network/token limited to trusted operators. Application containers never receive it. Workloads have nonzero UID/GID, read-only root filesystem, dropped capabilities, no-new-privileges, resource limits, log rotation, named volumes and loopback-only published ports.

Local validation: agent typecheck/build, eight runtime/auth/recovery/rollback tests (including process lease on a read-only parent), compiled Node HTTP 200/401, and `node packages/runtime-agent/tests/docker-smoke.mjs` with actual GHCR digest pulls, health failure and previous-image restoration. The smoke creates a unique test Compose project and cleans only that project; never run it indiscriminately on production. CI builds the agent image and checks its real HTTP listener without mounting Docker.

`runtime/examples/web` is a tiny build/health fixture, not another product. Production publishing is the manual approved-main caller `.github/workflows/runtime-build.yml`, consuming the SHA-pinned reusable workflow in `rodkisten/github`.
