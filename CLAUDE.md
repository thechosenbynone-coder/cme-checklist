# Claude Code Guidelines — CME Checklist

## Sprint "Pronto para Campo" (PRs #28–#33)

### Contexto
App de checklist ISO 9001 para inspeção de equipamentos. Operadores em campo criam checklists, anexam evidências (fotos/vídeos), recebem feedback de integridade. Gestor/admin valida do dashboard web.

**Bloqueio crítico resolvido:** Não havia forma de criar usuários reais (só 1 user de teste). Pessoal de campo não tem e-mail. Vídeo e foto eram misturados. Sem validação de integridade antes de liberar equipamento.

### Arquitetura de Dados

#### User (novo CRUD)
- **Identificadores:** `cpf` (normalizado: 11 dígitos) OU `email`, nunca ambos null
- **Hierarquia:** OPERADOR < SUPERVISOR < GESTOR < ADMIN
  - GESTOR cria/edita OPERADOR/SUPERVISOR
  - ADMIN cria qualquer papel
  - Último ADMIN não pode ser desativado/rebaixado (proteção 409)
- **Senha:** mínimo 3 chars (operadores em campo, ISO 9001 = rastreabilidade não complexidade)

#### Inspecao + RespostaItem (novo: videoUrl)
- `videoUrl` é campo dedicado (não heurística de nome)
- `fotosUrls` é array de fotos apenas (`.max(6)`)
- Cada resposta de item pode ter: `fotoUrl` (legado, single), `fotosUrls` (array), `videoUrl` (dedicado), `fotoResolvidaUrl` (evidência de pendência resolvida)

### Fluxos Críticos

#### 1. Login por CPF
- `POST /auth/login { identifier, senha }`
  - `identifier` pode ser CPF (com ou sem formatação → normalizado), nome, ou email
  - Resposta inclui `cpf` e `email` (ambos podem ser null)
- Mobile usa CPF; web também aceita

#### 2. Criar Usuário (GESTOR/ADMIN)
- `POST /api/users { nome, cpf?, email?, funcao, senha }`
- Validação Zod: CPF normalizado automaticamente via `.transform()`, ao menos 1 identificador
- Catch `P2002` (duplicate) → `409 "Já existe um usuário com este CPF ou e-mail"`
- Hierarquia: `podeAtribuirFuncao(ator, funcao)` bloqueia 403 se violada
- Audit: `CRIAR_USUARIO`

#### 3. Reset de Senha
- Self: `POST /api/users/:id/reset-password { novaSenha }` sem guard
- Outro user: requer `podeGerenciarUsuario(req.user.funcao, alvo.funcao)`
- Audit: `RESET_SENHA`

#### 4. Conclusão de Checklist (Mobile)
**Fluxo com preflight:**
1. Operador preenche tudo, clica "Finalizar"
2. Save todas as respostas + assinatura + fotos + vídeo como `status='EM_ANDAMENTO'` (reversível)
3. Se save falhar → parar, banner erro vermelho
4. Se save ok → `GET /integridade` calcula com dados reais no servidor
5. Se `aprovado===true` → concluir direto, sucesso verde auto-dismiss 4s
6. Se `aprovado===false` → bottom sheet com gaps (itens pendentes, evidências, certs vencidos)
   - Botão "Voltar e corrigir" → `setShowPreflight(false)` (volta às seções)
   - Botão "Concluir mesmo assim" → persiste como CONCLUIDA mas com aviso âmbar

#### 5. Validação de Inspeção (Web/GESTOR)
- `PATCH /api/inspecoes/:id/validar` (hard gate)
- Requer `status='CONCLUIDA'`
- Calcula integridade; se `aprovado===false` → `422 { error, integridade: report }`
- Se aprovado → `status='VALIDADA'`, equipamento liberado
- Web: card de integridade mostra barra + gaps, botão travado com texto estático "Corrija as pendências acima para validar" (não tooltip — touch devices não suportam)

### Engine de Integridade (server/src/lib/integridade.ts)

**Input:** inspeção + itens do modelo exato
**Output:** IntegridadeReport (completude%, gaps, aprovado=bool)

**Regras por tipo de item obrigatório:**

| Tipo | "Respondido"? |
|------|---------------|
| STATUS | `status` not null, AND: |
| | • `OK` → sempre válido |
| | • `NAO_APLICAVEL` → exige `observacao.trim()` preenchida |
| | • `PENDENTE` → exige `pendenciaResolvida===true` AND (`fotoResolvidaUrl` OR `videoUrl`) |
| CERTIFICADO | `certificadoId` + `certificadoValidade` (not null, not expired) |
| MEDICAO | `valorNumerico` not null (0 é válido) |
| TEXTO | `valorTexto?.trim()` not empty |

**Campos adicionais de validação:**
- `temAssinatura` = `assinaturaUrl.length > 0`
- `temFotosOuVideoEquipamento` = `fotosUrls.length > 0 OR videoUrl not null`
- `aprovado` = todas as 3 categorias ok + assinatura + fotos/vídeo

**Timezone:** `America/Sao_Paulo` via `Intl.DateTimeFormat` (respeita DST, zero deps)

### UI Feedback Pattern (Global)

```
const SUCCESS_DISMISS_MS = 4000;

| Operação | Loading | Sucesso | Erro |
|----------|---------|---------|------|
| Salvar | Spinner + "Salvando..." | Banner verde + auto-dismiss 4s | Banner vermelho (persistente) |
| Validar | Spinner + "Validando..." | Banner verde + auto-dismiss 4s | Banner vermelho (persistente) |
| Reset senha | Spinner + "Redefinindo..." | Banner verde + auto-dismiss 4s | Banner vermelho (persistente) |
```

- **Sucesso:** `CheckCircle2`, verde
- **Erro:** `XCircle`, vermelho com mensagem do servidor
- **Aviso:** `AlertTriangle`, âmbar (ex: conclusão com pendências)

### Paginação (Padrão)

**Req:** `GET /api/users?page=1&limit=20`
**Res:** `{ data, total, page, limit, totalPages }`

```ts
interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
```

- Page 1-indexed
- Limit default 20, max 100
- Web: botões "Anterior/Próxima" com indicador "Página X de Y"

### Decisões de Design

| Decisão | Por quê |
|---------|---------|
| CPF obrigatório OU email, não ambos | Operadores em campo (CPF), escritório (email) |
| Senha 3+ chars | Operadores em campo, ISO 9001 = rastreabilidade não força |
| Gate suave CONCLUIDA | Operador em baixa conectividade; avisa mas não bloqueia |
| Gate duro VALIDADA | GESTOR valida do dashboard; inspeção incompleta não pode liberar |
| videoUrl dedicado | Sistema distingue tipo (renderização, limites: 6 fotos/item, 1 video/item) |
| modeloId null → 422 | Integridade pressupõe modelo; report sem modelo é enganoso |
| Preflight mobile | Pega erros de conectividade antes do cálculo no servidor |
| Texto estático em botão | Tooltip nativo não funciona em touch/tablet |
| `Intl` timezone | Respeita DST, zero dependências |

### Deploy (Passos Manuais)

✅ **Ambos aplicados em produção em 2026-06-30** — ver [Incidente: Login 500](#incidente-login-500-em-produção-2026-06-30) abaixo. Mantido aqui como runbook de referência (ex.: novo ambiente/staging):

1. **Aplicar migrations**
   ```bash
   npx prisma migrate deploy
   ```
   (No ambiente com DB, usando `DIRECT_URL`. Rode `prisma migrate status` primeiro para confirmar o que está pendente antes de aplicar.)

2. **Promover Lucas a ADMIN**
   ```sql
   UPDATE "User" SET funcao='ADMIN' WHERE id='usr-lucas';
   ```
   (Seed anterior o deixou como GESTOR; seed novo o cria como ADMIN, mas banco já tem registro antigo)

### Arquivos Críticos

- `server/src/lib/integridade.ts` — engine puro, testável
- `server/src/routes/admin.routes.ts` — user CRUD + hierarquia
- `server/src/routes/inspecoes.routes.ts` — gates + endpoint integridade
- `apps/web/src/pages/Configuracoes.tsx` — tab Usuários + card integridade
- `apps/mobile/src/pages/ChecklistPreenchimento.tsx` — preflight + videoUrl
- `packages/types/src/index.ts` — tipos compartilhados (Funcao, IntegridadeReport, PaginatedResponse)
- `.github/workflows/test.yml` — CI (Lint, Tests Node 18.x/20.x, Build). Precisa de `DIRECT_URL` além de `DATABASE_URL`, usa `prisma db push` (não `migrate deploy`) para a DB de teste, e gera o Prisma Client explicitamente antes do typecheck do job Build — ver Backlog abaixo para o porquê

### Testing Hints

- Operador login com CPF "000.000.000-00" → normalizado "00000000000"
- GESTOR tenta criar ADMIN → 403
- Criar user com CPF existente → 409 P2002
- Desativar último ADMIN → 409 proteção
- Item NAO_APLICAVEL sem observacao → stepStatus='pendente', botão travado
- Mobile preflight: desconecta na step 2 (save) → banner erro, preflight bloqueado
- Mobile preflight: gaps na step 4 → bottom sheet, botão "Concluir mesmo assim"
- Web: card integridade âmbar (completude <80%) → botão validar travado + texto vermelho

### Convenções do Projeto

- **Audit trail:** todos os eventos registram user.sub, timestamp, ação, entidade, entidadeId, detalhe (sem passwords/hashes)
- **CPF:** sempre normalizado (11 dígitos, sem símbolos) no banco e em respostas
- **Mensagens de erro:** em português, específicas (não "erro desconhecido")
- **Feedback UI:** padrão SUCCESS_DISMISS_MS; loadings com ícone animado
- **Timezone:** sempre America/Sao_Paulo no cálculo de datas (não local do browser)
- **Resposta paginada:** sempre envelope {data, total, page, limit, totalPages}

### Time de Desenvolvimento (Sub-Agents)

Definições de papéis, regras de orquestração e formatos de entrega em [team-agents.md](team-agents.md). Inclui o papel "UI/UX Specialist" (opus, leitura/paralelo, só roda em diffs que tocam `apps/web/`/`apps/mobile/`) e QA-Plan/Reviewer reforçados com a skill `error-messages`. As skills que os papéis invocam (`emil-design-eng`, `review-animations`, `frontend-ui-engineering`, `error-messages`) estão versionadas em `.claude/skills/` neste repo — qualquer papel novo que mande invocar uma skill via Skill tool precisa repetir esse padrão (ter `Skill` na lista de Ferramentas + a skill versionada aqui, não só numa biblioteca local fora do checkout).

### Backlog & Próximos Passos

**Status:** Sprint "Pronto para Campo" (PRs #28–#33, #35) mergeado. PR #34 (fix de CI) foi fechado sem merge — redundante após #33. Sprint "App Instantâneo" (PR #36, abaixo) mergeado. CI verde de ponta a ponta (Lint, Tests Node 18.x/20.x, Build).
**Alvo:** Uso em campo (2-4 semanas).

O "bloqueador de build (8 erros de tipo)" nunca foi um bug real de código-fonte: o job de Build do CI nunca tinha executado de fato (dependia do job de Tests, que sempre falhava antes — faltava `DIRECT_URL` e a migration baseline `0_init` é vazia de propósito, incompatível com `migrate deploy` contra um Postgres novo). Sem o job de Build rodar, ninguém percebeu que faltava um passo de `prisma generate` antes do typecheck — sem ele, os tipos gerados pelo Prisma (`Prisma.UserSelect`, `Prisma.PrismaClientKnownRequestError`, etc.) não existem e o `tsc` aponta erros que desaparecem assim que o client é gerado. Corrigido em [PR #33](https://github.com/thechosenbynone-coder/cme-checklist/pull/33) — ver `.github/workflows/test.yml`. Esse mesmo PR também corrigiu um teste (`admin.test.ts`, "Deactivate last ADMIN") que assumia nenhum outro admin ativo além do criado pelo próprio teste, ignorando o `usr-lucas` do seed.

Os passos manuais de deploy (seção "Deploy" acima) foram executados em produção em 2026-06-30 (ver [Incidente: Login 500](#incidente-login-500-em-produção-2026-06-30)). Continuam sem automação — qualquer novo ambiente (staging, banco recriado) precisa repeti-los manualmente. P2.2 (seed do Lucas) permanece como passo manual documentado — ver [BACKLOG.md](BACKLOG.md) (cujo status geral está desatualizado e merece revisão própria).

### Links Úteis

- [Plano de implementação completo](https://github.com/thechosenbynone-coder/cme-checklist) (no PR #28)
- [Definições do time de agents](team-agents.md) — papéis, regras, formatos
- [Backlog detalhado](BACKLOG.md) — prioridades, esforço, riscos, next steps
- Memory project: `sprint-campo-deploy.md` — passos manuais de produção
- Migration Prisma: `server/prisma/migrations/20260626120000_add_cpf_video/migration.sql`

## Sprint "App Instantâneo" (PR #36)

### Contexto
App mobile demorava muito pra mostrar dado ao abrir. Diagnóstico: não era "visualização no navegador" (APK Capacitor real, bundle local) — era cold-start do backend no plano gratuito do Render, que hiberna após ~15min sem tráfego. Teste direto contra produção: 1ª requisição depois de idle = 32.4s; 2ª (já acordado) = 0.2s.

### Estratégia: esconder o cold-start, não eliminá-lo
Decisão consciente do usuário: sem keep-alive automático nem upgrade de plano Render por enquanto. Em vez disso, o tempo entre abrir o app e o usuário terminar de logar é aproveitado pra acordar o backend, e quem já está autenticado (pula o Login) ganha abertura instantânea via cache.

#### 1. Warmup global único
- `GET /ready` (`server/src/routes/public.routes.ts`) roda `prisma.$queryRaw\`SELECT 1\`` — força o boot completo Render → Node → Prisma → Postgres. Diferente do `/health` existente, que só confirma o processo Node de pé (não o banco).
- `apps/mobile/src/services/warmup.ts`: `warmupBackend()` é uma promise singleton por sessão do app — não importa quantas telas chamem, só dispara uma requisição.
- Disparado o mais cedo possível em `apps/mobile/src/App.tsx` (junto da splash), antes de qualquer roteamento — cobre tanto quem cai no Login quanto quem vai direto pro Hub (autenticado).

#### 2. Splash screen
- `apps/mobile/src/components/ui/SplashScreen.tsx`: identidade visual, fica de pé só o tempo de ler sessão local — nunca espera rede. `App.tsx` controla via state `booting`.

#### 3. Hub cache-first (`apps/mobile/src/pages/Hub.tsx`)
- Última lista conhecida (rascunhos + concluídos) renderiza instantaneamente do `localStorage`, revalida em segundo plano (indicador `syncing`, não spinner cheio).
- **Cache escopado por usuário** (`cme_hub_cache_${userId}`, não uma chave global) — em aparelho compartilhado, login de outro operador não deve ver a lista do anterior. Também limpo explicitamente no logout.
- **Revalidação falha preserva o último estado bom:** se `api.inspecoes.getMine()` falhar (offline/cold-start), a lista de concluídos NÃO é sobrescrita por um merge vazio — fica com o valor anterior via `completedListRef` (ref sempre atualizada, necessária porque o listener de `focus`/`online` é registrado uma única vez no mount e ficaria com closure presa em valores stale sem isso).
- Eventos `focus`/`online` não voltam a mostrar o spinner cheio quando já há dado na tela.

#### 4. Mensagem de espera (fallback)
- `apps/mobile/src/components/ui/SlowRequestHint.tsx`: hook `useSlowRequestHint(loading)` só revela a mensagem depois de ~4s de espera real (evita flicker em respostas rápidas). Texto não-técnico, sem menção a "Render" ou contagem de segundos. Usado em Login (submit) e Hub (loading sem cache).

#### 5. Paginação opt-in
- `GET /api/equipamentos?page&limit` (`server/src/routes/equipamentos.routes.ts`) retorna o envelope `PaginatedResponse` só quando os parâmetros são informados — sem eles, mantém o array simples (compatibilidade com Dashboard web e seleção de equipamento mobile, que dependem do array completo pra KPIs calculados no cliente).

### Arquivos Críticos (PR #36)

- `server/src/routes/public.routes.ts` — `/health` (smoke-test) vs `/ready` (boot completo + banco)
- `apps/mobile/src/services/warmup.ts` — promise singleton de aquecimento
- `apps/mobile/src/App.tsx` — splash + disparo do warmup
- `apps/mobile/src/pages/Hub.tsx` — cache-first, escopo por usuário, fallback em falha de revalidação
- `apps/mobile/src/components/ui/SplashScreen.tsx`, `SlowRequestHint.tsx`

### Lição operacional: limites de infra em preview deployments
A integração Vercel↔Neon cria um branch de banco Postgres por preview deployment. O plano gratuito do Neon permite só 10 branches simultâneos. Como o repo não apagava branches do git automaticamente após merge, os branches de preview do Neon nunca eram limpos — acumularam até bater o limite e travar o preview do próprio PR #36. Corrigido:
- **GitHub:** `delete_branch_on_merge` ativado nas configs do repo (Settings → General) — branch do git some sozinho ao mergear, o que deixa a integração Neon limpar o branch do banco correspondente.
- **Neon:** branches órfãos (ligados a PRs já mergeados/fechados: #28, #29, #31, #32, #33, #34, #35) apagados manualmente via API (`console.neon.tech/api/v2`) — mantidos só `production`, `dev` e `vercel-dev`.
- Projeto Neon do `cme_checklist`: org `org-withered-brook-27354833`, project id `bitter-grass-55209330` (útil se for preciso depurar branches/uso de novo).

## Incidente: Login 500 em produção (2026-06-30)

Relatório completo (cronologia, causas raiz, autocrítica de processo, dívida técnica): [INCIDENTE_2026-06-30_LOGIN_500.md](INCIDENTE_2026-06-30_LOGIN_500.md). Resumo:

### O que aconteceu
Login retornava 500 porque **o banco de produção (Neon) estava 4 migrations atrasado** (parado desde 19/06) — `prisma migrate deploy` nunca tinha sido executado de fato em produção, apesar de documentado como passo manual pendente desde o sprint "Pronto para Campo". O bug ficou invisível por dias porque o web na Vercel não tinha `VITE_API_BASE_URL` configurada (chamava a própria origem, não o backend) — corrigir essa variável não criou o bug, só revelou a dívida acumulada.

Duas tentativas de hotfix pioraram o quadro antes da correção real: colocar `prisma db push` como dependência do `start` do servidor causou **crash loop** (servidor não subia se o push falhasse). Resolvido aplicando `prisma migrate deploy` (não `db push`) após confirmar via introspecção direta do banco (`prisma db pull --print`) que os alvos estavam ausentes — zero risco de conflito.

### Regras de processo adotadas a partir deste incidente (ver `[[feedback-producao-ground-truth]]` na memória)
1. **Sincronização de schema nunca acoplada a boot ou build.** `start` é `node dist/src/server.js` puro; `build` é `prisma generate && tsc` (não toca no banco). Sync de produção é sempre passo de deploy **explícito** (`prisma migrate deploy`).
2. **`prisma db push` não é política de produção** — é ferramenta de dev/recuperação excepcional. Produção usa migrations versionadas.
3. **Ground-truth antes de decidir, nunca inferência:** confirmar que o checkout/branch usado está sincronizado com `origin/main` antes de rodar `migrate status`; se possível, introspectar o banco real (`prisma db pull --print`) antes de escolher o mecanismo de sync.
4. **Qualquer mudança em produção/banco/deploy passa pelo ciclo de sub-agents com DevOps-Review obrigatório** (`team-agents.md`) antes do commit, não depois.
5. Nunca descrever migrations aditivas como "risco zero" — usar linguagem defensável (risco de perda de dado baixo, mas riscos operacionais permanecem) e sempre ter snapshot/PITR do Neon antes de DDL em produção.

### Estado do checkout local
O checkout principal (`C:\Users\Compras.2\Projetos\cme-checklist`, fora dos worktrees) tinha ~36 commits de atraso e diversos arquivos soltos nunca commitados (CLAUDE.md/.gitignore antigos, um clone Git aninhado redundante, symlinks para uma lib de skills externa). Resolvido em 2026-06-30: sincronizado 100% com `origin/main`; tudo com valor histórico/de dados (specs, planilhas-fonte dos checklists, HANDOFFs de fases antigas, docs do After Cooler) preservado em `C:\Users\Compras.2\Projetos\cme-checklist-backup-residuos\` (fora do repo).
