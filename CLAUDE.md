# Claude Code Guidelines — CME Checklist

## Sprint "Pronto para Campo" (PR #28)

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

Depois de merge de PR #28:

1. **Aplicar migration**
   ```bash
   npx prisma migrate deploy
   ```
   (No ambiente com DB. Migration: `server/prisma/migrations/20260626120000_add_cpf_video`)

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

Definições de papéis, regras de orquestração e formatos de entrega em [team-agents.md](team-agents.md).

### Backlog & Próximos Passos

**Status:** Sprint "Pronto para Campo" (PR #28) mergeado. Código implementado (~95%).  
**Bloqueador:** TypeScript build com erros de tipo (8 erros em routes). Zero testes de integração.  
**Alvo:** Uso em campo (2-4 semanas).

Backlog detalhado em [BACKLOG.md](BACKLOG.md):
- **P0 (Blocker):** Corrigir erros de build Prisma (30min)
- **P1 (Must have):** Implementar 6 suites de teste (12h, rodando em paralelo com team de agents)
- **P2 (Should have):** Deployment checklist, seed fix, timezone tests, docs (4h)

### Links Úteis

- [Plano de implementação completo](https://github.com/thechosenbynone-coder/cme-checklist) (no PR #28)
- [Definições do time de agents](team-agents.md) — papéis, regras, formatos
- [Backlog detalhado](BACKLOG.md) — prioridades, esforço, riscos, next steps
- Memory project: `sprint-campo-deploy.md` — passos manuais de produção
- Migration Prisma: `server/prisma/migrations/20260626120000_add_cpf_video/migration.sql`
