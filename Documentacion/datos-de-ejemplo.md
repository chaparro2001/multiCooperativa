# Datos de ejemplo

Dos cooperativas con un usuario de cada perfil, para desarrollo y para la demostración del TFM.

```bash
pnpm --filter @multicooperativa/api db:seed
```

- Todos los usuarios tienen la contraseña `demo-cooperativa-2026`, o la de `SEED_PASSWORD` si se define.
- Es idempotente: una cooperativa que ya existe (por CIF) no se toca. Para empezar de cero: `pnpm --filter @multicooperativa/api exec prisma migrate reset`, que también vuelve a cargar estos datos.
- No se ejecuta en producción.
- Los CIF tienen dígito de control válido. El dominio `.test` está reservado y nunca recibe correo real.

Definición: `apps/api/src/dev/demo-seed.ts`. Su test de integración comprueba que cada usuario inicia sesión con el perfil previsto.

## Cooperativa Agrícola San Isidro · F12345674

| Email | Nombre | Perfil | Socio | Estado |
|---|---|---|---|---|
| admin@sanisidro.test | Ana Torres | Administrador | Sí (001) | Activa |
| consejo@sanisidro.test | Carlos Ruiz | Consejo rector | Sí (002) | Activa |
| gestor@sanisidro.test | Elena Gómez | Gestor | No | Activa |
| socio@sanisidro.test | Javier López | Socio | Sí (003) | Activa |
| lucia@demo.test | Lucía Martín | Socio | Sí (004) | Activa |
| suspendido@sanisidro.test | Pedro Sanz | Socio | Sí (005) | Suspendida |
| invitada@sanisidro.test | Marta Díaz | Socio | Sí (006) | Invitada |

## Cooperativa Olivarera La Esperanza · F76543214

| Email | Nombre | Perfil | Socio | Estado |
|---|---|---|---|---|
| admin@laesperanza.test | Rosa Navarro | Administrador | Sí (001) | Activa |
| lucia@demo.test | Lucía Martín | Consejo rector | Sí (002) | Activa |
| gestor@laesperanza.test | Miguel Ortega | Gestor | No | Activa |
| socio@laesperanza.test | Isabel Romero | Socio | Sí (003) | Activa |

## Casos que cubren

- **Selector de cooperativa (HU-ACC-05)**: Lucía está en las dos, con un perfil distinto en cada una.
- **Navegación según permisos (HU-ACC-06)**: un usuario de cada perfil predefinido en cada cooperativa.
- **Votar depende de ser socio (RN-ACC-06)**: los gestores son personal contratado y no son socios.
- **Membresía suspendida (RN-ACC-09)**: Pedro no puede entrar porque no tiene ninguna cooperativa activa.
- **Activación desde invitación (HU-ACC-01)**: el seed imprime el enlace `multicooperativa://invitacion?token=…` de Marta. Solo aparece en la ejecución que crea la cooperativa, porque en la base de datos se guarda el hash del token y no el token.
