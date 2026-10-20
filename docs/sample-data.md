# Sample data

Two cooperatives with one user of each profile, for development and for the thesis demo.

```bash
pnpm --filter @multicooperativa/api db:seed
```

- All users have the password `demo-cooperativa-2026`, or that of `SEED_PASSWORD` if defined.
- It is idempotent: a cooperative that already exists (by CIF, the Spanish tax ID) is left untouched. To start from scratch on a local database (never on the hosted one): `pnpm --filter @multicooperativa/api exec prisma migrate reset`, which also reloads this data.
- It is additive: it never deletes or updates anything. It refuses a database that is not local, and `NODE_ENV=production`, unless `--allow-production` is passed (see [04-deployment.md](04-deployment.md)).
- `pnpm --filter @multicooperativa/api db:seed:content` loads sample documents (bylaws, irrigation regulation, minutes) and two announcements for Cooperativa Agrícola San Isidro **through the API**, so files go to the configured storage and are indexed with the configured embeddings provider (ADR-010). Definition: `apps/api/src/dev/sample-content.ts`.
- The CIFs have a valid check digit. The `.test` domain is reserved and never receives real email.

Definition: `apps/api/src/dev/demo-seed.ts`. Its integration test checks that each user logs in with the expected profile.

The names, emails and passwords below are tenant data and stay as defined in the seed.

## Cooperativa Agrícola San Isidro · F12345674

| Email                     | Name         | Profile         | Member    | Status    |
| ------------------------- | ------------ | --------------- | --------- | --------- |
| admin@sanisidro.test      | Ana Torres   | Administrator   | Yes (001) | Active    |
| consejo@sanisidro.test    | Carlos Ruiz  | Governing board | Yes (002) | Active    |
| gestor@sanisidro.test     | Elena Gómez  | Manager         | No        | Active    |
| socio@sanisidro.test      | Javier López | Member          | Yes (003) | Active    |
| lucia@demo.test           | Lucía Martín | Member          | Yes (004) | Active    |
| suspendido@sanisidro.test | Pedro Sanz   | Member          | Yes (005) | Suspended |
| invitada@sanisidro.test   | Marta Díaz   | Member          | Yes (006) | Invited   |

## Cooperativa Olivarera La Esperanza · F76543214

| Email                   | Name          | Profile         | Member    | Status |
| ----------------------- | ------------- | --------------- | --------- | ------ |
| admin@laesperanza.test  | Rosa Navarro  | Administrator   | Yes (001) | Active |
| lucia@demo.test         | Lucía Martín  | Governing board | Yes (002) | Active |
| gestor@laesperanza.test | Miguel Ortega | Manager         | No        | Active |
| socio@laesperanza.test  | Isabel Romero | Member          | Yes (003) | Active |

## Cases they cover

- **Cooperative selector (US-ACC-05)**: Lucía is in both, with a different profile in each.
- **Permission-based navigation (US-ACC-06)**: one user of each predefined profile in each cooperative.
- **Voting depends on being a member (BR-ACC-06)**: managers are hired staff and are not members.
- **Suspended membership (BR-ACC-09)**: Pedro cannot sign in because he has no active cooperative.
- **Activation from an invitation (US-ACC-01)**: the seed prints Marta's `multicooperativa://invitation?token=…` link. It only appears in the run that creates the cooperative, because the database stores the token hash and not the token.
