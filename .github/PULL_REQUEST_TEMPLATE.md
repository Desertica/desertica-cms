## What and why

## Contract impact
- [ ] No change to API ids or field names
- [ ] Changed fields: updated `CONTRACT.md` and the matching change in `desertica-web` is linked

## Checks
- [ ] `npm run typecheck && npm run build && npm run seed-check`
- [ ] No `.env`, `.tmp/` or uploads committed
- [ ] Public role permissions unchanged (read + create-only for `reservation` and `contact-message`)
