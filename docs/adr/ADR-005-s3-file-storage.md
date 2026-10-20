# ADR-005: S3-compatible file storage behind a port

**Date**: 2026-10-04

**Status**: Accepted

## Context

Announcements, documents and invoices store files (PDFs and photos of delivery notes). The requirements set:

- Outside the database and with unguessable keys (NFR-DOC-04).
- Served with signed URLs that expire after 5 minutes (NFR-ANN-03, NFR-DOC-02).
- Isolation per cooperative, like the rest of the data (ADR-003).

The backend is deployed on Railway and developed locally with Docker Compose. Integration tests also run on GitHub Actions.

## Options Considered

1. **Local server disk**
   - No external dependencies.
   - Railway does not guarantee a persistent disk across deployments, and URL signing and expiry would have to be implemented by hand.

2. **Binary columns in PostgreSQL**
   - A single store.
   - Contradicts NFR-DOC-04, bloats backups and forces files to be served from the API.

3. **Object storage with an S3 API**
   - Signed URLs with expiry out of the box (SigV4 signing).
   - Offered by AWS, Cloudflare R2 and Railway buckets, among others; locally, a compatible server in Docker.

## Decision

Use **object storage with an S3 API** (option 3) through a `FileStorage` port in `apps/api/src/shared/files/`. Modules only know the port: store, sign a download URL, read (for indexing) and delete.

- Key of each file: `cooperatives/<cooperativeId>/<area>/<random uuid>`. The UUID makes it unguessable; the prefix allows deleting or auditing per cooperative.
- Signed URLs expire after 5 minutes and fix the `Content-Type` and the download name.
- Uploads go through the API, which validates type and size before storing. The app does not upload directly to storage.
- In development and CI, **RustFS** (`rustfs/rustfs:1.0.1`) is used, an S3-compatible server that validates signatures and expiry like a real one. MinIO, the usual option, stopped publishing images of its community edition.
- The production provider is chosen at deployment (Milestone 6) using only environment variables, without touching code.

## Consequences

### Positive

- Signing and URL expiry are handled by the provider.
- Changing provider is a matter of configuration.
- Integration tests exercise the same protocol as production.

### Negative

- One more service in Docker Compose and in CI.
- Uploads consume API bandwidth and memory. With limits of 10–20 MB per file this is acceptable.
- The signed URL points to the storage: on a physical device, the configured endpoint must be reachable from the phone's network.

## References

- [requirements/02-announcements.md](../requirements/02-announcements.md), [requirements/03-documents.md](../requirements/03-documents.md)
- [ADR-003](ADR-003-multi-cooperative.md)
