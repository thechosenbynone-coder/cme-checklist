---
name: error-messages
description: Garante que mensagens de erro voltadas ao usuário sejam claras, específicas e acionáveis em pt-BR. Use ao escrever ou revisar respostas de erro de API (Zod, Express), validações de schema, ou qualquer texto de erro exibido na UI.
---

# Padrão de Mensagens de Erro

Adaptado da skill `error-messages` do projeto [gh-aw](https://github.com/github/gh-aw/blob/main/.github/skills/error-messages/SKILL.md) para o stack deste projeto (TypeScript, Zod, Express, respostas em pt-BR). Estrutura original preservada; exemplos Go trocados por exemplos reais deste codebase.

## Template

```
[o que está errado]. [o que é esperado]. [exemplo de uso correto, quando aplicável]
```

Toda mensagem de erro voltada ao usuário deve responder três perguntas:
1. **O que está errado?** — identifique o problema com precisão (qual campo, qual valor)
2. **O que é esperado?** — explique o formato ou valores válidos
3. **Como corrigir?** — dê um exemplo concreto, quando o formato não for óbvio

## Linguagem construtiva

Evite negação isolada. Combine com o comportamento esperado e uma correção concreta.

| Evitar (só negativo) | Preferir (construtivo) |
|---|---|
| "inválido" | "esperado" + formato/valores válidos |
| "não é possível" | "requer" + pré-condição |
| "obrigatório" (sem dizer o quê) | nome do campo + motivo |
| "erro desconhecido" / "Dados inválidos." | contexto da ação + passo de recuperação |

❌ `{ error: 'Dados inválidos.' }` (fallback genérico de `admin.routes.ts`)
✅ `{ error: 'CPF deve ter 11 dígitos (recebido: 8 dígitos após remover pontuação).' }`

❌ Zod enum sem mensagem customizada (`funcaoSchema` em `schemas.ts` hoje) → erro padrão do Zod, em inglês, sem traduzir
✅ `z.enum(['OPERADOR', 'SUPERVISOR', 'GESTOR', 'ADMIN'], { errorMap: () => ({ message: 'Função inválida. Valores aceitos: OPERADOR, SUPERVISOR, GESTOR, ADMIN.' }) })`

## Quando usar fallback genérico vs mensagem específica

- Toda branch de `.refine()`/`.transform()`/`.enum()` em `schemas.ts` deve ter mensagem customizada explícita. Nunca depender do texto padrão do Zod (vem em inglês, quebra a convenção pt-BR do CLAUDE.md).
- O fallback `parsed.error.errors[0]?.message || 'Dados inválidos.'` (presente em `admin.routes.ts`) só é aceitável como rede de segurança para erros não mapeados — não como mensagem primária. Se aparece com frequência, é sinal de que falta `.refine()` com mensagem própria.
- Erros de auth/permissão (`auth.ts`) já seguem o padrão bem — são específicos por contexto: `'Token de autenticação ausente.'`, `'Permissão insuficiente para esta ação.'` — usar como referência.

## Checklist de sugestão

Toda mensagem de erro nova deve:
1. Nomear o campo ou recurso específico (não "algo deu errado")
2. Dizer o formato/valor esperado
3. Incluir exemplo quando o formato não é auto-evidente (CPF, data, enum)
4. Estar em português, sem termos técnicos de implementação (não expor "ZodError", "P2002", nomes de coluna do banco)

## Bons exemplos (já no codebase)

| Código | Por que funciona |
|---|---|
| `'CPF deve ter 11 dígitos.'` (schemas.ts) | Diz o campo e a regra exata |
| `'Informe CPF ou e-mail — ao menos um identificador é obrigatório.'` (schemas.ts) | Explica a regra de negócio, não só "campo obrigatório" |
| `'Já existe um usuário com este CPF ou e-mail.'` (admin.routes.ts, 409) | Contexto da causa (conflito), aponta os dois campos possíveis |
| `'Não é possível desativar ou rebaixar o último administrador ativo.'` (admin.routes.ts, 409) | Explica a regra de proteção, não só rejeita |

## Maus exemplos (gaps reais a corrigir)

| Código | Problema |
|---|---|
| `funcaoSchema = z.enum([...])` sem segundo argumento | Sem mensagem customizada → erro padrão do Zod em inglês se valor inválido |
| `parsed.error.errors[0]?.message \|\| 'Dados inválidos.'` | Fallback vago não diz qual campo nem o que é esperado |
| `throw new Error('erro desconhecido')` ou equivalente | Viola a convenção do CLAUDE.md: "Mensagens de erro: em português, específicas" |

## Testando qualidade da mensagem

Para mensagens críticas (criação de usuário, validação de inspeção, login), o teste deve verificar o conteúdo da mensagem, não só o status HTTP:

```ts
const res = await request(app).post('/api/users').send({ nome: 'A', senha: '123' });
expect(res.status).toBe(400);
expect(res.body.error).toMatch(/CPF ou e-mail/); // não só toBe(400)
```

Isso evita regressão silenciosa onde o status continua certo mas a mensagem vira genérica.

## Referências

- Exemplos a seguir: `server/src/schemas.ts`, `server/src/auth.ts`
- Gap conhecido a corrigir quando tocar o arquivo: `funcaoSchema` em `server/src/schemas.ts:10` sem mensagem customizada
- Skill original (Go/gh-aw, antes da adaptação): https://github.com/github/gh-aw/blob/main/.github/skills/error-messages/SKILL.md
