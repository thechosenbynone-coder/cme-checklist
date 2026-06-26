# Backlog — CME Checklist "Pronto para Campo"

**Status:** Sprint concluído (PR #28 mergeado). Código implementado (95%). **BLOQUEADO EM BUILD** e falta cobertura de testes.

**Data:** 2026-06-26 | **Alvo:** Uso em campo (operadores de verdade, equipamentos de verdade)

---

## P0 — Blocker: Corrigir Build (FIX IMMEDIATELY)

TypeScript não compila. 8 erros de tipo impedem `npm run build`.

### P0.1 — Fix Prisma imports em admin.routes.ts

**Problema:** `Prisma.UserSelect` não é exportado; `Prisma.PrismaClientKnownRequestError` não importado.

**Arquivo:** `server/src/routes/admin.routes.ts`
- Linhas 25, 97, 172: Trocar `Prisma.UserSelect` por tipo inline ou importar `PrismaClientKnownRequestError`
- Padrão: `import { Prisma } from '@prisma/client'` já existe (linha 6)?

**Dev task:** Replace type references, verify `npm run build` passes.

**Effort:** 15min | **Risk:** LOW (cosmetic fix, sem lógica)

---

### P0.2 — Fix implicit `any` em transaction callbacks

**Problema:** `tx` parameters em `inspecoes.routes.ts`, `modelos.routes.ts` são `any`.

**Arquivos:**
- `server/src/routes/inspecoes.routes.ts` — linhas 193, 376, 485, 557
- `server/src/routes/modelos.routes.ts` — linha 63

**Pattern:** `prisma.$transaction(async (tx: any) => { ... })`
→ `prisma.$transaction(async (tx: Prisma.TransactionClient) => { ... })`

**Dev task:** Type transaction callbacks, verify `tsc --noEmit` returns zero errors.

**Effort:** 20min | **Risk:** LOW (typing only, sem lógica)

---

### P0.3 — Verify build succeeds

**Dev task:** `npm run build` from root. Should produce zero errors, zero warnings.

**Effort:** 5min | **Risk:** MEDIUM (if other errors hidden)

---

## P1 — Must Have: Test Coverage para Funções Críticas

Zero testes para login, user creation, integrity validation, audit trail. **Não podemos deployar sem isso.**

### P1.1 — Testes de integridade.ts (Integration tests)

**Escopo:** 14 cenários mapeados por QA-Plan (fase 2 dos agents).

**Arquivo a criar:** `server/src/lib/integridade.test.ts`

**Cenários (exemplos):**
1. Inspeção 100% completa → `aprovado=true`, `completude=100`
2. STATUS NAO_APLICAVEL sem observacao → `satisfeito=false`
3. STATUS PENDENTE com evidência (foto/vídeo) → `satisfeito=true`
4. CERTIFICADO vencido → aparece em `certificadosVencidos`
5. MEDICAO com valorNumerico=0 → válido (zero é aceito)
6. TEXTO vazio → `satisfeito=false`
7. Assinatura ausente → `aprovado=false` mesmo com 100% itens
8. Sem fotos nem vídeo → `aprovado=false`
9. Timezone DST (transição mar/set em São Paulo) → certificado expiry correto
10. Sem itens obrigatórios → `completude=100`, `aprovado` depende apenas assinatura+fotos

**Test framework:** Vitest (já está em root package.json)

**Dev task:** Write 14 test cases + 4 edge case suites. Verify all pass.

**Effort:** 2h | **Risk:** LOW (pure function, deterministic via `opts.agora`)

---

### P1.2 — Testes de Login por CPF

**Escopo:** Operador login, CPF normalization, permissões.

**Arquivo a editar:** `server/src/app.test.ts` ou criar `server/src/routes/auth.test.ts`

**Test cases:**
1. Login com CPF formatado "000.000.000-00" → normalizado "00000000000"
2. Login com email (identifier também aceita email)
3. Login com nome (identifier pode ser name, cpf, ou email)
4. CPF não existe → 401 Unauthorized
5. Senha incorreta → 401 Unauthorized
6. Response inclui `cpf` e `email` (ambos podem ser null)
7. Token JWT válido é retornado

**Dev task:** Implement 7 test cases. Verify POST /auth/login endpoint behavior.

**Effort:** 1.5h | **Risk:** LOW (existing endpoint, happy path + error cases)

---

### P1.3 — Testes de User Hierarchy (CRUD + Hierarchy)

**Escopo:** Create user (GESTOR/ADMIN), hierarchy enforcement, last-ADMIN protection.

**Arquivo a criar:** `server/src/routes/admin.test.ts`

**Test cases:**
1. ADMIN creates OPERADOR → 201, user created
2. ADMIN creates SUPERVISOR → 201
3. ADMIN creates another ADMIN → 201
4. GESTOR creates OPERADOR → 201
5. GESTOR creates SUPERVISOR → 201
6. GESTOR tries to create ADMIN → 403 Forbidden
7. Create user com CPF duplicado → 409 Conflict (P2002)
8. Create user sem CPF e sem email → 400 Bad Request (Zod validation)
9. Desativar último ADMIN → 409 Conflict (protection)
10. OPERADOR tenta reset senha de outro user → 403 Forbidden
11. Usuário faz reset da própria senha → 200 OK (sem guard)

**Dev task:** Implement 11 test cases. Cover hierarchy checks and last-ADMIN protection.

**Effort:** 2h | **Risk:** MEDIUM (transactions, hierarchy logic, edge cases)

---

### P1.4 — Testes de Integrity Validation Gate

**Escopo:** Hard gate em PATCH /api/inspecoes/:id/validar.

**Arquivo a editar/criar:** `server/src/routes/inspecoes.test.ts`

**Test cases:**
1. Inspeção completa (aprovado=true) → 200, status='VALIDADA', equipamento liberado
2. Inspeção incompleta (aprovado=false) → 422, retorna `{ error, integridade: report }`
3. Inspeção status != CONCLUIDA → 400 Bad Request (wrong status)
4. Integridade sem modelo → 422 (cannot calculate without model)
5. Response contém lista de gaps (itensObrigatoriosPendentes, evidenciasFaltantes, certificadosVencidos)

**Dev task:** Implement 5 test cases covering happy path, error cases, and report structure.

**Effort:** 1.5h | **Risk:** MEDIUM (integration with integridade engine)

---

### P1.5 — Testes de Audit Trail

**Escopo:** Verificar que eventos são registrados (CRIAR_USUARIO, RESET_SENHA, etc).

**Arquivo a editar:** Create `server/src/routes/audit.test.ts` or add to admin.test.ts

**Test cases:**
1. POST /api/users → cria entry em AuditLog com ação='CRIAR_USUARIO'
2. POST /api/users/:id/reset-password → cria entry com ação='RESET_SENHA'
3. PATCH /api/inspecoes/:id/validar → cria entry com ação='VALIDAR_INSPECAO' (ou similar)
4. AuditLog contém: user.sub, timestamp, ação, entidade, entidadeId, detalhe
5. Nenhum password/hash em AuditLog.detalhe

**Dev task:** Implement 5 test cases. Verify audit entries are created and contain required fields.

**Effort:** 1h | **Risk:** LOW (audit events are recorded, just verify structure)

---

### P1.6 — Integration Test: Full Flow (E2E)

**Escopo:** Login → Preencher checklist → Submeter (preflight) → Validar → Liberar equipamento.

**Arquivo a criar:** `server/src/integration.test.ts`

**Test scenario:**
```
1. Admin cria operador (POST /api/users)
2. Operador faz login com CPF (POST /auth/login)
3. Operador preenche inspecao (PATCH /api/inspecoes/:id — save responses)
4. Operador submete para preflight (GET /api/inspecoes/:id/integridade) 
   → integridade.aprovado = false (tem gaps)
5. Operador corrige gaps, resubmete preflight
   → integridade.aprovado = true
6. Operador conclui inspeção (PATCH /api/inspecoes/:id/concluir)
   → status = CONCLUIDA
7. Gestor valida inspeção (PATCH /api/inspecoes/:id/validar)
   → status = VALIDADA (hard gate passed)
8. Equipamento liberado (verificar status no GET /api/equipamentos/:id)
```

**Dev task:** Write 1 comprehensive test covering the full workflow.

**Effort:** 3h | **Risk:** HIGH (multiple endpoints, state transitions, mocking complexity)

---

## P2 — Should Have: Deployment Readiness

### P2.1 — Create Deployment Checklist

**Arquivo a criar:** `DEPLOY_CHECKLIST.md`

**Contents:**
- Pre-merge: TypeScript build ✓, all tests ✓, CLAUDE.md up-to-date ✓
- Post-merge: `npx prisma migrate deploy`, update Lucas to ADMIN, seed verification
- Post-deploy (production): Monitoring setup, backup verification, rollback plan
- Rollback steps if anything fails

**Effort:** 30min

---

### P2.2 — Fix Lucas ADMIN Issue in Seed

**Problema:** Seed antigo deixou Lucas como GESTOR. Seed novo o cria como ADMIN, mas manual UPDATE é necessário em prod.

**Options:**
1. Update seed para upsert Lucas (avoid duplicates)
2. Add migration to programmatically update Lucas
3. Document manual step clearly (current approach)

**Dev task:** Choose option, implement.

**Effort:** 30min-1h

---

### P2.3 — Test Timezone Edge Cases

**Escopo:** Certificado vencimento no boundary de DST (São Paulo: segunda domingo de março, terceiro domingo de outubro).

**Test:** Verificar que `America/Sao_Paulo` timezone no integridade.ts não falha perto dessas datas.

**Dev task:** Unit test with mocked date at DST transition. Verify certificate expiry is calculated correctly.

**Effort:** 45min

---

### P2.4 — Document Local Dev Setup

**Arquivo a criar/atualizar:** `README.md` ou `DEVELOPMENT.md`

**Contents:**
- Prerequisites: Node, npm, Postgres (local or Neon URL)
- Clone + install: `npm install` from root
- Database setup: `.env` template, `npx prisma migrate dev`, `npx prisma db seed`
- Run dev: `npm run dev:all`, test at `http://localhost:5173` (web), use mobile emulator
- Run tests: `npm test`
- Build: `npm run build`

**Effort:** 1h

---

## Priority Matrix

| Task | P | Effort | Blocker? | Owner |
|------|---|--------|----------|-------|
| **P0.1** Fix Prisma imports | 0 | 15m | YES | Dev |
| **P0.2** Fix `any` in tx params | 0 | 20m | YES | Dev |
| **P0.3** Verify build | 0 | 5m | YES | QA |
| **P1.1** integridade.ts tests | 1 | 2h | YES | QA-Exec |
| **P1.2** Login tests | 1 | 1.5h | YES | QA-Exec |
| **P1.3** Hierarchy tests | 1 | 2h | YES | QA-Exec |
| **P1.4** Validation gate tests | 1 | 1.5h | YES | QA-Exec |
| **P1.5** Audit trail tests | 1 | 1h | YES | QA-Exec |
| **P1.6** E2E flow test | 1 | 3h | MEDIUM | QA-Exec |
| P2.1 Deploy checklist | 2 | 30m | NO | DevOps |
| P2.2 Seed/Lucas fix | 2 | 1h | NO | Dev |
| P2.3 Timezone tests | 2 | 45m | NO | QA-Exec |
| P2.4 Dev docs | 2 | 1h | NO | Docs |

**Total effort:** ~18 hours
**Ready for field?** After P0 + P1 (12h) → **YES** (can deploy). P2 optional but recommended before large rollout.

---

## Next Steps

1. **This week:** Delegate P0 to Dev (30min), P1 to team (12h, run in parallel with agents)
2. **Before merge:** All P0 + P1 done, all tests green
3. **After merge (production):** Run deploy checklist (P2.1-2.4)
4. **Field rollout:** 1-2 operators test in actual environment
