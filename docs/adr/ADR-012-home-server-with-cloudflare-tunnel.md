# ADR-012: Home server with Cloudflare Tunnel for the hosted demo

**Date**: 2026-10-21

**Status**: Accepted

## Context

[ADR-010](ADR-010-gemini-embeddings-for-the-hosted-demo.md) planned the hosted demo on Render, Neon and Supabase Storage, all without a credit card. In October 2026 that turned out to be false for the part that matters: Render (both the blueprint and a manual web service) and Railway ask for a card, and the author has none. Without a host for the API there is no hosted demo.

What the author does have: a Windows machine at home that can stay on (8 GB of RAM or more), a Cloudflare account and a domain (`chaparro2001.com`) whose DNS is on Cloudflare.

Constraints:

- Cost 0 EUR and no credit card.
- A stable HTTPS URL (the web app on GitHub Pages is built with it, and browsers block mixed content).
- The home network must not be opened (no port forwarding, no public IP assumed).
- The delivery date is 26/10/2026 and the person operating the server is not very technical: few moving parts.

## Options Considered

1. **Another cloud host**: the free tiers that do not ask for a card have too little memory for PostgreSQL, storage and Ollama together.
2. **Home server + Tailscale Funnel**: free, no domain needed, stable `*.ts.net` URL. It works, but the URL is not under our control and Funnel has bandwidth and port restrictions.
3. **Home server + Cloudflare Tunnel**: free, outbound-only connection, HTTPS terminated by Cloudflare on our own hostname, the tunnel runs as one more container of the same Compose file.

## Decision

Host the API on the **home server** with Docker Desktop (WSL2 backend), running the same stack as local development, and expose **only the API** to the internet through **Cloudflare Tunnel** (option 3).

- `deploy/home-server/compose.yaml` runs PostgreSQL with pgvector, RustFS (S3), Ollama with `bge-m3`, the API image (`apps/api/Dockerfile`) and `cloudflared`. No container publishes a port on the host.
- The public hostname is `api-cooperativa.chaparro2001.com`, mapped in the Cloudflare Zero Trust dashboard to `http://api:3000`. The tunnel token is the only Cloudflare secret and lives in `.env.server`.
- Embeddings stay local: `EMBEDDINGS_PROVIDER=ollama`, so [ADR-006](ADR-006-local-model-embeddings.md) applies. Gemini is used only for chat and vision ([ADR-009](ADR-009-gemini-language-and-vision-model.md)).
- The web app stays on GitHub Pages with `API_URL=https://api-cooperativa.chaparro2001.com` and `CORS_ORIGINS=https://chaparro2001.github.io`. The hourly cron workflow keeps calling `/jobs/due-dates`; the in-process timer also runs because the server does not sleep.
- Tailscale Funnel is documented as the alternative for anyone without a domain.

## Consequences

### Positive

- 0 EUR and no card. No cold starts: the server does not sleep.
- Local embeddings: document text does not go to Google for indexing or search, and there is no embedding quota.
- Same stack as development, so what was tested locally is what runs.
- Nothing is opened on the home router; DB, storage and Ollama are not reachable from outside, and the tunnel can be cut with `docker compose stop cloudflared`.

### Negative

- Availability depends on the home machine: power, internet, Windows updates and Docker Desktop starting after a reboot (it needs a signed-in user). A demo, not a service.
- The data lives on that machine, without backups.
- Cloudflare terminates TLS and can see the traffic; acceptable for sample data.
- Windows-specific operation (sleep, updates, WSL2 memory) must be set up by hand.

### Relation to other ADRs

- [ADR-010](ADR-010-gemini-embeddings-for-the-hosted-demo.md) is not superseded: Gemini embeddings remain the right choice for the managed-cloud alternative (`render.yaml`), which cannot host Ollama. This ADR changes where the demo is hosted, not how embeddings work in each environment.
- [ADR-005](ADR-005-s3-file-storage.md): the same S3 port, now with RustFS in production; a one-shot container creates the bucket because production never does.

## References

- `docs/04-deployment.md`, `deploy/home-server/compose.yaml`
- <https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/>
