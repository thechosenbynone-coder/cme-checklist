# cme-checklist

Sistema de **Checklist Digital CME** para inspeção de equipamentos, controle de materiais e rastreabilidade operacional.

## Estrutura do Monorepo (seguindo padrão do logistica_pessoal_app_portal)

```
cme-checklist/
├── apps/
│   ├── mobile/          # Aplicativo de campo (Capacitor + React + Tailwind)
│   └── web/             # Dashboard gerencial (React + Vite + Tailwind)
├── packages/
│   ├── ui/              # Componentes compartilhados + identidade visual
│   └── types/           # Tipos TypeScript compartilhados
├── server/              # Backend Express + Prisma
├── package.json         # Root com npm workspaces
└── README.md
```

## Stack

- **Frontend**: React + Vite + Tailwind CSS
- **Mobile**: Capacitor (para tablet e celular)
- **Backend**: Express + Prisma (PostgreSQL)
- **Gerenciador**: npm (workspaces)

## Como rodar (após setup inicial)

```bash
# Instalar dependências
npm install

# Gerar Prisma Client
npm run prisma:generate

# Rodar migrations (após configurar DATABASE_URL)
# npm run prisma:migrate

# Desenvolvimento
npm run dev:all
```

## Status do MVP

- [x] Estrutura base do monorepo
- [x] Prisma schema inicial (baseado no checklist real de After Cooler)
- [ ] Identidade visual compartilhada
- [ ] Fluxo principal de inspeção
- [ ] Geração de PDF
- [ ] Exportação Excel
- [ ] Dashboard gerencial

---

**Nome do projeto:** Checklist CME  
**Contexto:** Operação de manutenção e inspeção de equipamentos (After Cooler e similares)