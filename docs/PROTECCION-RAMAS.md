# Proteger `develop` y `staging`

Hazlo una vez, despues de copiar los workflows (paso 0). Necesitas ser admin del repo.

## 0. Instalar los workflows
GitHub no deja subirlos por la API. En tu computador:

```bash
git checkout develop && git pull
mkdir -p .github/workflows && cp docs/pipelines/*.yml .github/workflows/
git add .github/workflows && git commit -m "Install pipelines" && git push
```

Abre una PR cualquiera hacia `develop` para que los checks aparezcan: GitHub solo deja elegir checks que ya corrieron al menos una vez en los ultimos 7 dias.

## 1. Crear la regla (repetir para `develop` y luego para `staging`)
1. GitHub -> repo `desertica-cms` -> **Settings** -> **Branches** (menu izquierdo).
2. **Add branch ruleset** (o **Add classic branch protection rule**). Nombre: `develop` (luego `staging`). **Enforcement status**: Active.
3. **Target branches** -> **Add target** -> **Include by pattern** -> escribe `develop` (luego `staging`).
4. Marca estas casillas:
   - **Restrict deletions** y **Block force pushes**.
   - **Require a pull request before merging** -> **Required approvals: 1**, y **Require review from Code Owners** (hay `.github/CODEOWNERS`).
   - **Require status checks to pass** -> **Require branches to be up to date before merging** -> **Add checks** y elige exactamente:

| Check | Que hace |
|---|---|
| `commit-policy` | sin Co-Authored-By ni ramas `claude/*` |
| `lint` | ESLint sobre `src/` y `config/` (errores bloquean; `any` y variables sin usar solo avisan) |
| `build` | typecheck, tests, seed-check, build del admin |
| `smoke` | arranca Strapi con SQLite y exige `/_health` = 204 |
| `secrets` | gitleaks sobre todo el historial |
| `audit` | `npm audit --omit=dev --audit-level=high` |
| `dockerfile-lint` | hadolint sobre el Dockerfile |

5. **Create** / **Save changes**.

Si un check no aparece en el buscador, aun no ha corrido: abre una PR y vuelve.

Los workflows corren en toda PR (cualquier rama base) y en todo push a cualquier rama. `docker.yml` solo publica/despliega desde `develop` y tags `v*`.

## 2. Alertas (Settings -> Code security)
Activa **Dependabot alerts**, **Dependabot security updates**, **Secret scanning** y **Push protection**. Dependabot ya esta configurado en `.github/dependabot.yml`.

## Notas
- CodeQL y dependency-review no estan: en repos privados requieren GitHub Advanced Security. Si el repo pasa a publico, agregalos desde `docs/pipelines/README.md`.
- Dependabot abre sus PR contra `develop`; `staging` se actualiza con la PR `develop` -> `staging`.
