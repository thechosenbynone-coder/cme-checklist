// Configuração do Express: middlewares + montagem dos routers por domínio.
// O entry point (server.ts) importa { app } e sobe o servidor.
import './lib/env.js'; // PRIMEIRO: carrega .env antes de módulos que leem process.env
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { requireAuth } from './auth.js';
import { publicRouter } from './routes/public.routes.js';
import { contaRouter } from './routes/conta.routes.js';
import { equipamentosRouter } from './routes/equipamentos.routes.js';
import { modelosRouter } from './routes/modelos.routes.js';
import { materiaisRouter } from './routes/materiais.routes.js';
import { inspecoesRouter } from './routes/inspecoes.routes.js';
import { adminRouter } from './routes/admin.routes.js';

const app = express();

// Confiar no header X-Forwarded-For quando atrás de proxy (Render, Vercel, etc).
// Necessário para o express-rate-limit identificar corretamente o IP do cliente.
app.set('trust proxy', 1);

// gzip nas respostas — reduz muito o payload (bootstrap/respostas) em rede de campo.
app.use(compression());

// ── CORS allowlist ─────────────────────────────────────────────────
// Origens liberadas via env CORS_ORIGINS (separadas por vírgula). "*" libera tudo.
const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:5174')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Sem origin (curl, mesma origem via proxy) é permitido.
      if (!origin) return callback(null, true);
      if (corsOrigins.includes('*') || corsOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origem não permitida pelo CORS: ${origin}`));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '1mb' })); // JSON pequeno — sem base64

// Limite geral das rotas /api.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Rotas públicas (inclui /api/update/check, registrada ANTES do gate) ──
app.use(publicRouter);

// ── A partir daqui, tudo sob /api exige autenticação ──────────────────
app.use('/api', apiLimiter, requireAuth);

// ── Rotas protegidas ──────────────────────────────────────────────────
app.use(contaRouter);
app.use(equipamentosRouter);
app.use(modelosRouter);
app.use(materiaisRouter);
app.use(inspecoesRouter);
app.use(adminRouter);

export { app };
