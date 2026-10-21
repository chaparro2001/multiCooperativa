# ADR-017: Custom domain for the web app

**Date**: 2026-10-21

**Status**: Accepted

## Context

The web app was published at `https://chaparro2001.github.io/multiCooperativa/`, a project path that forced `experiments.baseUrl` in `apps/mobile/app.json`, a CORS origin on the shared `github.io` host and invitation links with the base path ([ADR-016](ADR-016-invitation-links-delivered-by-the-administrator.md)). The author already owns `chaparro2001.com` with DNS on Cloudflare ([ADR-012](ADR-012-home-server-with-cloudflare-tunnel.md)), and the API and file links already live under `*-cooperativa.chaparro2001.com`.

## Options Considered

1. **Keep the `github.io` project URL**: nothing to do; the URL is long, depends on the repository name and needs `baseUrl`.
2. **Custom domain on GitHub Pages** (`cooperativa.chaparro2001.com`): CNAME in Cloudflare to `chaparro2001.github.io`, DNS only; GitHub issues the certificate. Free.
3. **Host the web app behind Cloudflare Tunnel or Cloudflare Pages**: adds a second hosting path for a static site that already deploys well.

## Decision

Option 2.

- Cloudflare DNS: CNAME `cooperativa` to `chaparro2001.github.io`, **DNS only** so GitHub can validate it and issue the HTTPS certificate; Enforce HTTPS enabled in Settings > Pages.
- The app is served at the domain root: `experiments.baseUrl` is removed. `pages.yml` keeps the Actions deploy, `404.html` as SPA fallback and `.nojekyll`, and adds a `CNAME` file to the artifact.
- `CORS_ORIGINS` allows `https://cooperativa.chaparro2001.com`, and `https://chaparro2001.github.io` during the transition (it redirects to the custom domain, but old tabs may still call the API). `WEB_APP_URL` defaults to `https://cooperativa.chaparro2001.com`.
- ADR-012 is not edited; where it names the `github.io` origin, this ADR supersedes that detail.

## Consequences

**Positive**

- Short, stable URL independent of the repository name; same paths in development and production.
- Invitation links lose the base path.

**Negative**

- One more DNS record and a manual Pages setting (custom domain) to keep; losing the setting breaks the domain until reapplied.
- The old project URL redirects to the domain, but its CORS origin should be removed once it is no longer used.
