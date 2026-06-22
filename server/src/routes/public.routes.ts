import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { prisma } from '../lib/prisma.js';
import { verificarSenha, assinarToken, type Funcao } from '../auth.js';
import { loginSchema } from '../schemas.js';

export const publicRouter = Router();

// Limite agressivo no login (anti brute-force).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login. Tente novamente em alguns minutos.' },
});

// GET /health
publicRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'cme-checklist-api' });
});

// GET /api/update/check — check for OTA updates (pública, registrada antes do gate de auth)
publicRouter.get('/api/update/check', async (req, res) => {
  try {
    const currentVersion = typeof req.query.currentVersion === 'string' ? req.query.currentVersion : '0.0.0';

    const githubUrl = 'https://raw.githubusercontent.com/thechosenbynone-coder/cme-checklist/main/apps/mobile/package.json';
    const response = await fetch(githubUrl);
    if (!response.ok) {
      return res.json({ updateAvailable: false });
    }

    const pkg = (await response.json()) as { version: string };
    const latestVersion = pkg.version || '0.0.0';

    const parseVersion = (v: string) => v.split('.').map(Number);
    const [cMajor, cMinor, cPatch] = parseVersion(currentVersion);
    const [lMajor, lMinor, lPatch] = parseVersion(latestVersion);

    const updateAvailable =
      lMajor > cMajor ||
      (lMajor === cMajor && lMinor > cMinor) ||
      (lMajor === cMajor && lMinor === cMinor && lPatch > cPatch);

    if (updateAvailable) {
      return res.json({
        updateAvailable: true,
        version: latestVersion,
        url: `https://github.com/thechosenbynone-coder/cme-checklist/releases/download/v${latestVersion}/dist.zip`,
      });
    }

    res.json({ updateAvailable: false });
  } catch (error: any) {
    console.error('Error checking for updates:', error);
    res.status(500).json({ error: 'Erro ao verificar atualizações.' });
  }
});

// POST /auth/login
publicRouter.post('/auth/login', loginLimiter, async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Dados inválidos.' });
    }
    const { identifier, senha } = parsed.data;

    // Login por e-mail OU nome (case-insensitive).
    const user = await prisma.user.findFirst({
      where: {
        ativo: true,
        OR: [
          { email: { equals: identifier, mode: 'insensitive' } },
          { nome: { equals: identifier, mode: 'insensitive' } },
        ],
      },
    });

    // Mensagem genérica para não revelar se o usuário existe.
    if (!user || !user.senhaHash) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }
    const ok = await verificarSenha(senha, user.senhaHash);
    if (!ok) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    const funcao = (user.funcao || 'OPERADOR').toUpperCase() as Funcao;
    const token = assinarToken({ sub: user.id, nome: user.nome, funcao });

    res.json({
      token,
      user: { id: user.id, nome: user.nome, email: user.email, funcao: user.funcao },
    });
  } catch (error: any) {
    console.error('Error during login:', error);
    res.status(500).json({ error: 'Erro interno no login.' });
  }
});
