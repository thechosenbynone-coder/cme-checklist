import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { google } from 'googleapis';
import { PrismaClient } from '@prisma/client';
import {
  hashSenha,
  verificarSenha,
  assinarToken,
  requireAuth,
  requireRole,
  type Funcao,
} from './auth.js';
import { normalizeChave } from './equipamentos/parsePlanilha.js';

dotenv.config();
const app = express();
const prisma = new PrismaClient();
const upload = multer({ storage: multer.memoryStorage() });
const PORT = process.env.PORT || 3333;

// ── CORS allowlist ─────────────────────────────────────────────────
// Origens liberadas via env CORS_ORIGINS (separadas por vírgula). Default: dev local.
// "*" libera tudo (use só em desenvolvimento).
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

// ── Rate limit ─────────────────────────────────────────────────────
// Limite agressivo no login (anti brute-force) e um limite geral mais folgado.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login. Tente novamente em alguns minutos.' },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Google Drive OAuth2 ────────────────────────────────────────────
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'http://localhost:3333/oauth/callback'
);
oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
const drive = google.drive({ version: 'v3', auth: oauth2Client });

// ── Upload para o Drive (privado — sem permissão pública) ──────────
// Retorna o fileId; o acesso ao conteúdo passa pelo proxy autenticado /api/files/:id.
async function uploadToDrive(buffer: Buffer, filename: string, mimeType: string): Promise<string> {
  const { Readable } = await import('stream');
  const stream = Readable.from(buffer);

  const res = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [process.env.GOOGLE_DRIVE_FOLDER_ID!],
    },
    media: { mimeType, body: stream },
    fields: 'id',
  });

  // IMPORTANTE: não tornamos o arquivo público. O app acessa via proxy autenticado.
  return res.data.id!;
}

// ── Schemas de validação (zod) ─────────────────────────────────────
const loginSchema = z.object({
  identifier: z.string().min(1, 'Informe nome ou e-mail.'),
  senha: z.string().min(1, 'Informe a senha.'),
});

const respostaSchema = z.object({
  id: z.string().optional(),
  itemId: z.string(),
  status: z.enum(['OK', 'PENDENTE', 'NAO_APLICAVEL']).nullish(), // MEDICAO/TEXTO não têm status
  observacao: z.string().nullish(),
  responsavel: z.string().nullish(),
  valorNumerico: z.number().nullish(),
  valorTexto: z.string().nullish(),
  createdById: z.string().nullish(),
  fotoUrl: z.string().nullish(),
  fotoResolvidaUrl: z.string().nullish(),
  certificadoId: z.string().nullish(),
  certificadoValidade: z.string().nullish(),
  pendenciaResolvida: z.boolean().nullish(),
});

const materialSchema = z.object({
  id: z.string().optional(),
  materialId: z.string(),
  quantidade: z.number(),
  observacao: z.string().nullish(),
});

const inspecaoSchema = z.object({
  id: z.string().optional(),
  equipamentoId: z.string().min(1),
  tipo: z.enum(['PRE_EMBARQUE', 'OPERACIONAL', 'RETORNO_EMBARQUE']),
  data: z.string().nullish(),
  numeroDocumento: z.string().nullish(),
  modeloId: z.string().nullish(),
  modeloVersao: z.number().nullish(),
  responsavelGeral: z.string().nullish(),
  localizacao: z.string().nullish(),
  status: z.enum(['EM_ANDAMENTO', 'CONCLUIDA', 'VALIDADA', 'CANCELADA']),
  observacoesGerais: z.string().nullish(),
  createdById: z.string().nullish(),
  assinaturaUrl: z.string().nullish(),
  fotosUrls: z.array(z.string()).nullish(),
  fotosEquipamento: z.array(z.string()).nullish(),
  origem: z.string().nullish(),
  destino: z.string().nullish(),
  compressorUtilizado: z.string().nullish(),
  classificacao: z.string().nullish(),
  respostas: z.array(respostaSchema).default([]),
  materiais: z.array(materialSchema).default([]),
});

const modeloItemSchema = z.object({
  secao: z.string().min(1),
  descricao: z.string().min(1),
  ordem: z.number(),
  obrigatorio: z.boolean().default(true),
  tipo: z.enum(['STATUS', 'CERTIFICADO', 'MEDICAO', 'TEXTO']).default('STATUS'),
  unidade: z.string().nullish(),
});

const modeloSchema = z.object({
  nome: z.string().min(1),
  tipoEquipamento: z.string().min(1),
  itens: z.array(modeloItemSchema).min(1, 'O modelo precisa de ao menos um item.'),
});

// ── Rotas públicas ─────────────────────────────────────────────────

// GET /health
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'cme-checklist-api' });
});

// POST /auth/login
app.post('/auth/login', loginLimiter, async (req, res) => {
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

// ── A partir daqui, tudo exige autenticação ────────────────────────
app.use('/api', apiLimiter, requireAuth);

// GET /api/me — dados do usuário logado
app.get('/api/me', (req, res) => {
  res.json(req.user);
});

// GET /api/files/:id — proxy autenticado para mídia do Drive (mantém o arquivo privado)
app.get('/api/files/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const meta = await drive.files.get({ fileId: id, fields: 'mimeType, name' });
    const driveRes = await drive.files.get(
      { fileId: id, alt: 'media' },
      { responseType: 'stream' }
    );
    if (meta.data.mimeType) res.setHeader('Content-Type', meta.data.mimeType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    (driveRes.data as any).pipe(res);
  } catch (error: any) {
    console.error('Error proxying Drive file:', error);
    res.status(404).json({ error: 'Arquivo não encontrado.' });
  }
});

// POST /api/upload — retorna a URL do proxy autenticado
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

    const timestamp = Date.now();
    const ext = req.file.originalname.split('.').pop() || 'bin';
    const filename = `cme-${timestamp}.${ext}`;

    const fileId = await uploadToDrive(req.file.buffer, filename, req.file.mimetype);
    res.json({ url: `/api/files/${fileId}` });
  } catch (error: any) {
    console.error('Error during Google Drive upload:', error);
    res.status(500).json({ error: error.message || 'Error uploading file' });
  }
});

// Status de liberação dinâmico: LIBERADO se há checklist VALIDADA sem pendência aberta;
// VENCIDO se o certificado expirou; senão PENDENTE.
function calcularStatusLiberacao(eq: any): 'PENDENTE' | 'LIBERADO' | 'VENCIDO' {
  const inspecoes = eq.inspecoes || [];
  const liberado = inspecoes.some(
    (i: any) =>
      i.status === 'VALIDADA' &&
      !(i.respostas || []).some((r: any) => r.status === 'PENDENTE' && r.pendenciaResolvida !== true)
  );
  if (liberado) return 'LIBERADO';
  if (eq.validadeCertificado && new Date(eq.validadeCertificado) < new Date()) return 'VENCIDO';
  return 'PENDENTE';
}

// GET /api/equipamentos  (busca inteligente via ?busca=)
app.get('/api/equipamentos', async (req, res) => {
  try {
    const busca = typeof req.query.busca === 'string' ? req.query.busca.trim() : '';
    let where: any = {};
    if (busca) {
      const chave = normalizeChave(busca);
      where = {
        OR: [
          ...(chave ? [{ chaveBusca: { contains: chave } }] : []),
          { codigoExibicao: { contains: busca, mode: 'insensitive' } },
          { codigo: { contains: busca, mode: 'insensitive' } },
          { nome: { contains: busca, mode: 'insensitive' } },
          { tipo: { contains: busca, mode: 'insensitive' } },
          { localizacaoAtual: { contains: busca, mode: 'insensitive' } },
        ],
      };
    }
    const data = await prisma.equipamento.findMany({
      where,
      orderBy: { codigo: 'asc' },
      include: { _count: { select: { certificados: true, inspecoes: true } } },
    });
    res.json(data);
  } catch (error: any) {
    console.error('Error fetching equipamentos:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// GET /api/equipamentos/:id  (detalhe: certificados + histórico + status calculado)
app.get('/api/equipamentos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const eq = await prisma.equipamento.findFirst({
      where: { OR: [{ id }, { codigo: id }] },
      include: {
        certificados: { orderBy: { validade: 'asc' } },
        inspecoes: {
          orderBy: { data: 'desc' },
          include: { respostas: true },
        },
      },
    });
    if (!eq) return res.status(404).json({ error: 'Equipamento não encontrado.' });
    res.json({ ...eq, statusLiberacao: calcularStatusLiberacao(eq) });
  } catch (error: any) {
    console.error('Error fetching equipamento details:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// GET /api/modelos — lista todos os templates (todas as versões) p/ o builder
app.get('/api/modelos', async (_req, res) => {
  try {
    const data = await prisma.checklistModelo.findMany({
      orderBy: [{ tipoEquipamento: 'asc' }, { versao: 'desc' }],
      include: { _count: { select: { itens: true, inspecoes: true } } },
    });
    res.json(data);
  } catch (error: any) {
    console.error('Error listing models:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// GET /api/modelos/tipo/:tipo — versão ativa de um tipo (usada na execução)
app.get('/api/modelos/tipo/:tipo', async (req, res) => {
  try {
    const { tipo } = req.params;
    const data = await prisma.checklistModelo.findFirst({
      where: { tipoEquipamento: tipo, ativo: true },
      include: { itens: { orderBy: { ordem: 'asc' } } },
    });
    res.json(data);
  } catch (error: any) {
    console.error('Error fetching models:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// GET /api/modelos/:id — template completo (com itens)
app.get('/api/modelos/:id', async (req, res) => {
  try {
    const data = await prisma.checklistModelo.findUnique({
      where: { id: req.params.id },
      include: { itens: { orderBy: { ordem: 'asc' } } },
    });
    if (!data) return res.status(404).json({ error: 'Modelo não encontrado.' });
    res.json(data);
  } catch (error: any) {
    console.error('Error fetching model:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// POST /api/modelos — cria nova versão do template (ISO 9001). Só Gestor/Admin.
// Editar = nova versão: desativa a ativa do tipo e cria uma nova com versao+1.
app.post('/api/modelos', requireRole('GESTOR', 'ADMIN'), async (req, res) => {
  try {
    const parsed = modeloSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Modelo inválido.' });
    }
    const { nome, tipoEquipamento, itens } = parsed.data;

    const novo = await prisma.$transaction(async (tx) => {
      const ativa = await tx.checklistModelo.findFirst({
        where: { tipoEquipamento, ativo: true },
        orderBy: { versao: 'desc' },
      });
      const novaVersao = (ativa?.versao ?? 0) + 1;
      if (ativa) {
        await tx.checklistModelo.update({ where: { id: ativa.id }, data: { ativo: false } });
      }
      return tx.checklistModelo.create({
        data: {
          nome,
          tipoEquipamento,
          versao: novaVersao,
          ativo: true,
          itens: {
            create: itens.map((it, idx) => ({
              secao: it.secao,
              descricao: it.descricao,
              ordem: it.ordem ?? idx + 1,
              obrigatorio: it.obrigatorio,
              tipo: it.tipo,
              unidade: it.unidade || null,
            })),
          },
        },
        include: { itens: { orderBy: { ordem: 'asc' } } },
      });
    });

    res.json(novo);
  } catch (error: any) {
    console.error('Error creating model version:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// GET /api/materiais
app.get('/api/materiais', async (_req, res) => {
  try {
    const data = await prisma.material.findMany({
      where: { ativo: true },
      orderBy: { descricao: 'asc' },
    });
    res.json(data);
  } catch (error: any) {
    console.error('Error fetching materiais:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// GET /api/users — só Gestor/Admin
app.get('/api/users', requireRole('GESTOR', 'ADMIN'), async (_req, res) => {
  try {
    const data = await prisma.user.findMany({
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true, email: true, funcao: true, ativo: true, createdAt: true },
    });
    res.json(data);
  } catch (error: any) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// GET /api/inspecoes
app.get('/api/inspecoes', async (_req, res) => {
  try {
    const data = await prisma.inspecao.findMany({
      include: {
        equipamento: true,
        respostas: { include: { item: true } },
        materiais: { include: { material: true } },
      },
      orderBy: { data: 'desc' },
    });
    res.json(data);
  } catch (error: any) {
    console.error('Error fetching inspections:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// GET /api/inspecoes/:id
app.get('/api/inspecoes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = await prisma.inspecao.findUnique({
      where: { id },
      include: {
        equipamento: true,
        respostas: { include: { item: true } },
        materiais: { include: { material: true } },
      },
    });

    if (!data) return res.status(404).json({ error: 'Inspection not found' });
    res.json(data);
  } catch (error: any) {
    console.error('Error fetching inspection details:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// POST /api/inspecoes
app.post('/api/inspecoes', async (req, res) => {
  try {
    const parsed = inspecaoSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Dados da inspeção inválidos.' });
    }
    const { respostas, materiais, ...rest } = parsed.data;

    const result = await prisma.$transaction(async (tx) => {
      const numeroDocumento =
        rest.numeroDocumento ||
        `OPE-PC-03/${new Date().toISOString().slice(0, 10).replace(/-/g, '')}/${(rest.id || `${Date.now()}`).slice(-6).toUpperCase()}`;

      const createdInspecao = await tx.inspecao.create({
        data: {
          id: rest.id,
          equipamentoId: rest.equipamentoId,
          tipo: rest.tipo,
          data: rest.data ? new Date(rest.data) : new Date(),
          numeroDocumento,
          modeloId: rest.modeloId || null,
          modeloVersao: rest.modeloVersao ?? null,
          responsavelGeral: rest.responsavelGeral,
          localizacao: rest.localizacao,
          status: rest.status,
          observacoesGerais: rest.observacoesGerais,
          createdById: rest.createdById || req.user?.sub || null,
          assinaturaUrl: rest.assinaturaUrl || null,
          fotosUrls: rest.fotosUrls || rest.fotosEquipamento || [],
          origem: rest.origem || null,
          destino: rest.destino || null,
          compressorUtilizado: rest.compressorUtilizado || null,
          classificacao: rest.classificacao || null,
        },
      });

      if (respostas && respostas.length > 0) {
        await tx.respostaItem.createMany({
          data: respostas.map((r) => ({
            id: r.id,
            inspecaoId: createdInspecao.id,
            itemId: r.itemId,
            status: r.status ?? null,
            observacao: r.observacao || null,
            responsavel: r.responsavel || null,
            valorNumerico: r.valorNumerico ?? null,
            valorTexto: r.valorTexto || null,
            createdById: r.createdById || null,
            fotoUrl: r.fotoUrl || null,
            fotoResolvidaUrl: r.fotoResolvidaUrl || null,
            certificadoId: r.certificadoId || null,
            certificadoValidade: r.certificadoValidade || null,
            pendenciaResolvida: r.pendenciaResolvida ?? null,
          })),
        });
      }

      if (materiais && materiais.length > 0) {
        await tx.materialUtilizado.createMany({
          data: materiais.map((m) => ({
            id: m.id,
            inspecaoId: createdInspecao.id,
            materialId: m.materialId,
            quantidade: m.quantidade,
            observacao: m.observacao || null,
          })),
        });
      }

      return createdInspecao;
    });

    res.json(result);
  } catch (error: any) {
    console.error('Error creating inspection:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// PATCH /api/inspecoes/:id/validar — Gestor/Admin valida e libera o equipamento (ISO 9001)
app.patch('/api/inspecoes/:id/validar', requireRole('GESTOR', 'ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    const inspecao = await prisma.inspecao.findUnique({ where: { id } });
    if (!inspecao) return res.status(404).json({ error: 'Inspeção não encontrada.' });
    if (inspecao.status === 'VALIDADA') {
      return res.status(409).json({ error: 'Inspeção já validada.' });
    }

    const atualizada = await prisma.$transaction(async (tx) => {
      const insp = await tx.inspecao.update({
        where: { id },
        data: {
          status: 'VALIDADA',
          validadaPorId: req.user?.sub || null,
          validadaEm: new Date(),
        },
      });

      // Recalcula e persiste o status de liberação do equipamento.
      const eq = await tx.equipamento.findUnique({
        where: { id: insp.equipamentoId },
        include: { inspecoes: { include: { respostas: true } } },
      });
      if (eq) {
        await tx.equipamento.update({
          where: { id: eq.id },
          data: { statusLiberacao: calcularStatusLiberacao(eq) },
        });
      }
      return insp;
    });

    const completa = await prisma.inspecao.findUnique({
      where: { id: atualizada.id },
      include: {
        equipamento: true,
        respostas: { include: { item: true } },
        materiais: { include: { material: true } },
      },
    });
    res.json(completa);
  } catch (error: any) {
    console.error('Error validating inspection:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`✅ Server CME Checklist rodando na porta ${PORT}`);
});