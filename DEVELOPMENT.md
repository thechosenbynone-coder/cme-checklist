# Local Development Setup — CME Checklist

## Prerequisites

- **Node.js:** 18.x or higher (check with `node --version`)
- **npm:** 9.x or higher (included with Node.js)
- **PostgreSQL:** 14+ (for local development; can use managed database like Neon)
- **Git:** Latest version

## Quick Start

### 1. Clone Repository

```bash
git clone https://github.com/thechosenbynone-coder/cme-checklist.git
cd cme-checklist
```

### 2. Install Dependencies

```bash
npm install
```

This installs dependencies for all workspaces (server, apps/web, apps/mobile, packages).

### 3. Setup Environment Variables

```bash
# Copy template to server/.env
cp server/.env.example server/.env

# Edit server/.env with your database URL:
# DATABASE_URL=postgresql://user:password@localhost:5432/cme_dev
# DIRECT_URL=postgresql://user:password@localhost:5432/cme_dev  (for migrations)

# For development, you can use:
# - Local Postgres (postgresql://postgres:password@localhost:5432/cme_dev)
# - Neon (free tier: https://neon.tech) — copy the pooled connection string
```

### 4. Setup Database

```bash
# Apply migrations
cd server
npx prisma migrate dev

# This will:
# 1. Create database schema
# 2. Run all migrations
# 3. Prompt to generate Prisma Client
# 4. Optionally run seed script

# (Or seed manually if skipped above)
npx prisma db seed
```

### 5. Start Development Servers

```bash
# From root directory, start all three in parallel:
npm run dev:all

# This starts:
# - Backend: http://localhost:3333
# - Web: http://localhost:5173
# - Mobile: http://localhost:5174 (Capacitor dev server)
```

Alternatively, start them individually:

```bash
# Terminal 1 — Backend
npm run dev --workspace=server

# Terminal 2 — Web
npm run dev --workspace=apps/web

# Terminal 3 — Mobile
npm run dev --workspace=apps/mobile
```

### 6. Verify Setup

**Backend health check:**
```bash
curl http://localhost:3333/health
# Expected: { "status": "ok" }
```

**Login endpoint (test data):**
```bash
curl -X POST http://localhost:3333/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"12345678901","senha":"321"}'
# Expected: { "token": "eyJ...", "user": { ... } }
```

---

## Project Structure

```
cme-checklist/
├── server/                    # Backend (Express.js + Prisma)
│   ├── src/
│   │   ├── routes/           # API endpoints
│   │   ├── lib/              # Business logic (integridade engine, audit, etc.)
│   │   ├── schemas.ts        # Zod validation schemas
│   │   ├── auth.ts           # JWT + password hashing
│   │   ├── db.ts             # Prisma client
│   │   └── app.ts            # Express app setup
│   ├── prisma/               # Database schema + migrations
│   │   ├── schema.prisma     # Prisma schema
│   │   └── migrations/       # SQL migration files
│   └── package.json
│
├── apps/web/                 # Web dashboard (React + Vite)
│   ├── src/
│   │   ├── pages/            # Route pages
│   │   ├── components/       # Reusable UI components
│   │   ├── services/         # API client calls
│   │   └── utils/            # Helpers
│   └── package.json
│
├── apps/mobile/              # Mobile app (React + Capacitor)
│   ├── src/
│   │   ├── pages/            # Screens
│   │   ├── components/       # UI components
│   │   ├── services/         # API calls
│   │   ├── theme/            # Design tokens
│   │   └── lib/              # Utilities
│   └── package.json
│
├── packages/types/           # Shared TypeScript types
│   ├── src/index.ts         # User, Inspecao, RespostaItem, etc.
│   └── package.json
│
├── packages/ui/              # Shared UI components
│   ├── src/                 # Reusable React components
│   └── package.json
│
└── package.json              # Root workspace config
```

---

## Common Tasks

### Run Tests

```bash
# All tests
npm test

# Specific file
npm test -- server/src/lib/integridade.test.ts

# Watch mode (auto-rerun on file change)
npm test:watch

# With coverage
npm test -- --coverage
```

### Lint Code

```bash
npm run lint
npm run lint:fix  # Auto-fix issues
```

### Format Code

```bash
npm run format
```

### Type Check

```bash
npm run typecheck
# or specifically for server
cd server && npx tsc --noEmit
```

### Build for Production

```bash
npm run build

# This builds:
# - Web app (apps/web/dist/)
# - Mobile app (apps/mobile/dist/)
# - Server (server/dist/) if applicable
```

---

## Database Operations

### View Database

```bash
# Open Prisma Studio (interactive DB viewer)
cd server
npx prisma studio
```

This opens http://localhost:5555 where you can browse tables, add/edit data.

### Run Migrations

```bash
cd server

# Apply pending migrations
npx prisma migrate deploy

# Create new migration
npx prisma migrate dev --name add_new_feature

# Reset database (destructive!)
npx prisma migrate reset --skip-generate --skip-seed
```

### Seed Database

```bash
cd server
npx prisma db seed
```

Runs `prisma/seed.ts` which populates test data (admin user, equipment model, etc.).

---

## Debugging

### Backend Logging

The server logs to stdout. For more verbose output:

```bash
NODE_DEBUG=* npm run dev --workspace=server
```

### Browser DevTools

- **Web:** Ctrl+Shift+I (or F12)
- **Mobile:** Use Chrome DevTools to connect to Capacitor WebView

### Breakpoints in VS Code

Add `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Backend",
      "cwd": "${workspaceFolder}/server",
      "program": "${workspaceFolder}/server/src/app.ts",
      "runtimeArgs": ["--loader=tsx"],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen"
    }
  ]
}
```

Then press F5 to debug.

---

## Testing Checklist Flow

### 1. Manual Test (Web)

1. Open http://localhost:5173
2. Login as "Admin" (email: admin@cme.local, or CPF: 12345678901, pwd: 321)
3. Navigate to "Equipamentos"
4. Select "After Cooler"
5. Create inspection
6. Fill out all questions:
   - STATUS: select "OK"
   - CERTIFICADO: select a cert from dropdown
   - MEDICAO: enter a number
   - TEXTO: enter text
7. Add a photo (upload or camera)
8. Add signature
9. Click "Concluir"
10. Web should show integrity report
11. Switch to "Gestor" role
12. Click "Validar" on the inspection
13. Verify equipment is marked as "Liberado"

### 2. Manual Test (Mobile)

Same flow, but on http://localhost:5174 (or APK if built).

### 3. API Test (Curl)

```bash
# 1. Login
TOKEN=$(curl -s -X POST http://localhost:3333/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"12345678901","senha":"321"}' \
  | jq -r '.token')

# 2. Get equipment list
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3333/api/equipamentos

# 3. Create inspection
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"equipamentoId":"EQ-001","modeloId":"MDL-001"}' \
  http://localhost:3333/api/inspecoes

# 4. Get integridade report
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3333/api/inspecoes/INSP-001/integridade
```

---

## Troubleshooting

### "Cannot find module '@cme/types'"

```bash
# Reinstall workspaces
npm install

# Or regenerate Prisma client
cd server && npx prisma generate
```

### "Database connection refused"

```bash
# Check if Postgres is running
psql -U postgres -h localhost -c "SELECT 1"

# If not, start it:
# macOS:   brew services start postgresql
# Linux:   sudo systemctl start postgresql
# Windows: (open Services app, find PostgreSQL, start)
```

### "Migration already exists"

```bash
# Don't create new migrations with the same name
# If you made a mistake, reset and try again:
cd server
npx prisma migrate reset --skip-seed
```

### Tests timeout

Increase Vitest timeout in `vitest.config.ts`:

```typescript
export default defineConfig({
  test: {
    testTimeout: 30000,  // 30 seconds
  },
})
```

---

## Resources

- **Prisma Docs:** https://www.prisma.io/docs/
- **React Docs:** https://react.dev/
- **Express Docs:** https://expressjs.com/
- **Capacitor Docs:** https://capacitorjs.com/docs/
- **Vite Docs:** https://vitejs.dev/

---

## Getting Help

1. Check [CLAUDE.md](CLAUDE.md) for project conventions and decisions
2. Check [BACKLOG.md](BACKLOG.md) for known issues and priorities
3. Check git history: `git log --oneline`
4. Ask in team Slack or open a GitHub issue

---

**Last Updated:** 2026-06-26
