# Deploy Checklist — CME Checklist "Pronto para Campo"

**Version:** 1.0 | **Date:** 2026-06-26 | **Status:** PRE-PRODUCTION DEPLOYMENT

---

## Pre-Merge Verification

Before merging to `main`, verify:

- [ ] **TypeScript build:** `npm run build` succeeds with zero errors
- [ ] **Tests pass:** `npm test` passes (18 pure logic tests minimum)
- [ ] **Code review:** All PRs approved by at least 1 reviewer
- [ ] **No console warnings:** Build output is clean
- [ ] **Lint:** `npm run lint` passes (if configured)
- [ ] **CHANGELOG.md:** Updated with this sprint's changes
- [ ] **CLAUDE.md:** Updated with new flows or decisions
- [ ] **Package versions:** No major version bumps without justification

---

## Post-Merge (Development)

### 1. Database Migration

```bash
# Apply Prisma migration to development environment
cd server
npx prisma migrate deploy

# Or, if using a fresh database:
npx prisma migrate reset --skip-generate --skip-seed

# Seed initial data
npx prisma db seed
```

**Migration:** `server/prisma/migrations/20260626120000_add_cpf_video`
- Adds `User.cpf` column (11 chars, unique)
- Adds `RespostaItem.videoUrl` column (TEXT)
- Adds `Inspecao.videoUrl` column (TEXT)

### 2. User Setup (if using production database)

✅ **Já aplicado em produção em 2026-06-30** (ver [INCIDENTE_2026-06-30_LOGIN_500.md](INCIDENTE_2026-06-30_LOGIN_500.md)). Mantido aqui como referência para outros ambientes (staging/dev):

```sql
-- Promote Lucas to ADMIN (he was created as GESTOR in older seed)
UPDATE "User" SET funcao='ADMIN' WHERE id='usr-lucas';

-- Verify:
SELECT id, nome, funcao, ativo FROM "User" WHERE funcao='ADMIN';
```

### 3. Verify Seed Data

```bash
# Seed loads:
# - 1x ADMIN user (Lucas Lima, pwd=321)
# - 1x GESTOR user (test user)
# - 1x After Cooler equipment model + items
# - Material data for CERTIFICADO items

npx prisma db seed
echo "Seed completed"
```

### 4. Run Tests Locally

```bash
# Set DATABASE_URL in server/.env
DATABASE_URL="postgresql://user:password@localhost:5432/cme_dev" npm test

# Expected:
# ✅ 18 pure logic tests (integridade.test.ts) pass
# ✅ 39 integration tests (auth, admin, validation, audit, E2E) pass
# ✅ Total: 57 tests passing
```

---

## Pre-Production (Staging)

### 1. Environment Setup

```bash
# Create .env from template
cp server/.env.example server/.env

# Fill in values:
# DATABASE_URL = staging database (Neon pooled connection)
# DIRECT_URL = staging database (Neon direct connection, for migrations)
# JWT_SECRET = strong random key (32+ chars)
# NODE_ENV = staging
# CORS_ORIGINS = staging domain(s)
```

### 2. Build Verification

```bash
npm run build
# Verify:
# - No TypeScript errors
# - No bundle size warnings
# - Mobile APK builds (if applicable)
# - Web bundle size acceptable (<2MB gzipped)
```

### 3. Database

```bash
# Apply migrations
DATABASE_URL="..." DIRECT_URL="..." npx prisma migrate deploy

# Seed data
npx prisma db seed

# Verify schema
npx prisma db seed -- --verify
```

### 4. Smoke Tests

```bash
# Start server
npm run dev:server

# In another terminal, test critical endpoints:
curl http://localhost:3333/health                          # 200 OK
curl -X POST http://localhost:3333/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"12345678901","senha":"321"}'         # 200 + token

# Login response should include:
# { "token": "eyJ...", "user": { "id", "nome", "cpf", "email", "funcao" } }
```

### 5. Run Full Test Suite

```bash
DATABASE_URL="..." npm test

# Expected: 100% pass rate (57/57 tests)
```

---

## Production Deployment

### 1. Final Verification Checklist

- [ ] All staging smoke tests pass
- [ ] Database migrations are reversible (have `DOWN` steps in Prisma)
- [ ] Environment variables are set (no secrets in .env.example)
- [ ] Backup of production database scheduled
- [ ] Rollback plan documented (see "Rollback" section)
- [ ] Monitoring/alerting configured (if applicable)
- [ ] Team is on-call for 24h post-deploy

### 2. Deploy Steps

```bash
# 1. Tag the release
git tag -a v1.0-campo -m "CME Checklist - Pronto para Campo"
git push origin v1.0-campo

# 2. Build production artifacts
NODE_ENV=production npm run build

# 3. Apply migrations (use DIRECT_URL, not pooled)
DIRECT_URL="..." npx prisma migrate deploy

# 4. Seed production data (if first deploy)
npx prisma db seed

# 5. Start server
npm run start:server

# 6. Verify health endpoint
curl https://api.cme.yourdomain.com/health
```

### 3. Post-Deploy Verification

```bash
# 1. Check server logs (should be clean, no errors)
# 2. Verify JWT tokens are being issued and validated
# 3. Test login endpoint with a real operator
# 4. Test checklist submission flow
# 5. Verify audit trail is being logged (check database)
# 6. Check Sentry/error tracking (if configured)
```

---

## Rollback Plan

If production issues are detected, rollback is **database-based**:

### Fast Rollback (within 15 min of deploy)

```bash
# 1. Stop production server
# 2. Revert to previous application version (git tag)
# 3. Keep database as-is (migrations are backward-compatible)
# 4. Restart server pointing to previous code

# No explicit migration rollback needed because:
# - User.cpf and videoUrl columns were ADDED (additive)
# - No destructive schema changes in this sprint
```

### Full Rollback (within 1h of deploy)

If data corruption is suspected:

```bash
# 1. Restore production database from backup (pre-deploy snapshot)
# 2. Revert application to previous version
# 3. Run migrations on restored database
# 4. Restart server
```

**Estimated rollback time:** 15-30 minutes (depends on backup restore speed)

---

## Monitoring & Health Checks

### Health Endpoint

```
GET /health
Response: { "status": "ok", "version": "1.0-campo", "timestamp": "ISO8601" }
```

### Critical Paths to Monitor

| Endpoint | Alert if | Threshold |
|----------|----------|-----------|
| `POST /auth/login` | Error rate > 5% | Last 5 min |
| `PATCH /api/inspecoes/:id/respostas` | Response time > 5s | p99 |
| `PATCH /api/inspecoes/:id/validar` | Error rate > 2% | Last 5 min |
| `GET /api/integridade` | Response time > 2s | p95 |

### Database Health

```sql
-- Check database connection pool
SELECT count(*) as active_connections FROM pg_stat_activity;

-- Check table sizes
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) 
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Check for slow queries
SELECT query, calls, mean_time FROM pg_stat_statements 
WHERE query NOT LIKE '%pg_stat%' 
ORDER BY mean_time DESC 
LIMIT 10;
```

---

## Post-Deploy Tasks (24-72h)

- [ ] Monitor error rates and latency for 24 hours
- [ ] Gather feedback from field operators (first 5-10 users)
- [ ] Review audit logs for unexpected patterns
- [ ] Verify all users can login with CPF
- [ ] Confirm checklist submission → integridade validation flow works
- [ ] Test preflight on mobile with low connectivity
- [ ] Schedule post-deploy retrospective with team

---

## Rollback Triggers

Rollback immediately if:

- [ ] Authentication is broken (login endpoint 5xx or consistently returning 401)
- [ ] Database is unreachable (migrations failed, schema issues)
- [ ] Critical bug prevents inspections from being saved
- [ ] Audit trail is not being logged
- [ ] Performance degradation > 50% compared to baseline

---

## Success Criteria

After 24 hours of production deployment, verify:

- ✅ Zero critical errors in logs
- ✅ Error rate < 1%
- ✅ p95 response time < 3s
- ✅ At least 2 operators successfully completed full inspection → validation flow
- ✅ All audit entries logged correctly (no missing user/timestamp/action)
- ✅ Mobile app works with real field connectivity conditions

---

## Contacts & Escalation

| Role | Name | Phone | On-Call |
|------|------|-------|---------|
| Backend Lead | — | — | 24h |
| DevOps | — | — | 24h (first 72h) |
| Product | — | — | 24h (first 24h) |

**Escalation:** If unable to resolve in 30 min, call product lead and prepare rollback.

---

## Appendix: Common Issues & Fixes

### Issue: "column 'cpf' does not exist"

**Cause:** Migrations not applied to database.

**Fix:**
```bash
DIRECT_URL="..." npx prisma migrate deploy
```

**Aconteceu em produção em 2026-06-30** — banco ficou 4 migrations atrasado por ~2 semanas porque o `migrate deploy` manual documentado nunca foi executado. Detalhes completos, erros de processo cometidos na resposta ao incidente, e dívida técnica remanescente: [INCIDENTE_2026-06-30_LOGIN_500.md](INCIDENTE_2026-06-30_LOGIN_500.md).

### Issue: "último ADMIN cannot be deactivated"

**Cause:** Protection logic is working as intended.

**Fix:** This is not an issue. You cannot deactivate the only ADMIN. Create another ADMIN first if needed.

### Issue: "Login returns 401 even with correct CPF"

**Cause:** CPF normalization issue or user inactive.

**Fix:**
1. Verify user exists: `SELECT * FROM "User" WHERE cpf='11122233344';`
2. Check if `ativo=true`: `UPDATE "User" SET ativo=true WHERE cpf='11122233344';`
3. Verify password hash is valid: `SELECT senhaHash FROM "User" WHERE cpf='11122233344';`

### Issue: "Preflight integrity report not calculated"

**Cause:** `GET /api/inspecoes/:id/integridade` endpoint not returning `IntegridadeReport`.

**Fix:**
1. Verify `modeloId` is set on inspection: `SELECT modeloId FROM "Inspecao" WHERE id='...';`
2. Verify items exist: `SELECT COUNT(*) FROM "ItemChecklist" WHERE modeloId='...';`
3. Verify responses exist: `SELECT COUNT(*) FROM "RespostaItem" WHERE inspecaoId='...';`
4. Restart server to clear any caching

---

**Last Updated:** 2026-06-26  
**Next Review:** After field deployment (1 week)
