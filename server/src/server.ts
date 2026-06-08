import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import { google } from 'googleapis';
import { PrismaClient } from '@prisma/client';

dotenv.config();
const app = express();
const prisma = new PrismaClient();
const upload = multer({ storage: multer.memoryStorage() });
const PORT = process.env.PORT || 3333;

app.use(cors());
app.use(express.json({ limit: '1mb' })); // JSON pequeno — sem base64

// ── Google Drive OAuth2 ────────────────────────────────────────────
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'http://localhost:3333/oauth/callback'
);
oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
const drive = google.drive({ version: 'v3', auth: oauth2Client });

// ── Função de upload para o Drive ────────────────────────────────
async function uploadToDrive(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<string> {
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

  const fileId = res.data.id!;
  
  // Tornar público para acesso direto por URL
  await drive.permissions.create({
    fileId,
    requestBody: { role: 'reader', type: 'anyone' },
  });

  return `https://drive.google.com/uc?id=${fileId}`;
}

// ── Rotas ─────────────────────────────────────────────────────────

// GET /health
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'cme-checklist-api' });
});

// POST /api/upload
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    
    const timestamp = Date.now();
    const ext = req.file.originalname.split('.').pop() || 'bin';
    const filename = `cme-${timestamp}.${ext}`;
    
    const url = await uploadToDrive(req.file.buffer, filename, req.file.mimetype);
    res.json({ url });
  } catch (error: any) {
    console.error('Error during Google Drive upload:', error);
    res.status(500).json({ error: error.message || 'Error uploading file' });
  }
});

// GET /api/equipamentos
app.get('/api/equipamentos', async (req, res) => {
  try {
    const data = await prisma.equipamento.findMany({ orderBy: { codigo: 'asc' } });
    res.json(data);
  } catch (error: any) {
    console.error('Error fetching equipamentos:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// GET /api/modelos/tipo/:tipo
app.get('/api/modelos/tipo/:tipo', async (req, res) => {
  try {
    const { tipo } = req.params;
    const data = await prisma.checklistModelo.findFirst({
      where: { tipoEquipamento: tipo, ativo: true },
      include: { itens: { orderBy: { ordem: 'asc' } } }
    });
    res.json(data);
  } catch (error: any) {
    console.error('Error fetching models:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// GET /api/materiais
app.get('/api/materiais', async (req, res) => {
  try {
    const data = await prisma.material.findMany({ where: { ativo: true }, orderBy: { descricao: 'asc' } });
    res.json(data);
  } catch (error: any) {
    console.error('Error fetching materiais:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// GET /api/users
app.get('/api/users', async (req, res) => {
  try {
    const data = await prisma.user.findMany({ orderBy: { nome: 'asc' } });
    res.json(data);
  } catch (error: any) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// GET /api/inspecoes
app.get('/api/inspecoes', async (req, res) => {
  try {
    const data = await prisma.inspecao.findMany({
      include: {
        equipamento: true,
        respostas: { include: { item: true } },
        materiais: { include: { material: true } }
      },
      orderBy: { data: 'desc' }
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
        materiais: { include: { material: true } }
      }
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
    const inspecaoData = req.body;
    
    const { respostas, materiais, ...rest } = inspecaoData;

    const result = await prisma.$transaction(async (tx) => {
      const createdInspecao = await tx.inspecao.create({
        data: {
          id: rest.id,
          equipamentoId: rest.equipamentoId,
          tipo: rest.tipo,
          data: rest.data ? new Date(rest.data) : new Date(),
          responsavelGeral: rest.responsavelGeral,
          localizacao: rest.localizacao,
          status: rest.status,
          observacoesGerais: rest.observacoesGerais,
          createdById: rest.createdById || null,
          assinaturaUrl: rest.assinaturaUrl || null,
          fotosUrls: rest.fotosUrls || rest.fotosEquipamento || [],
          origem: rest.origem || null,
          destino: rest.destino || null,
          compressorUtilizado: rest.compressorUtilizado || null,
          classificacao: rest.classificacao || null,
        }
      });

      if (respostas && respostas.length > 0) {
        await tx.respostaItem.createMany({
          data: respostas.map((r: any) => ({
            id: r.id,
            inspecaoId: createdInspecao.id,
            itemId: r.itemId,
            status: r.status,
            observacao: r.observacao || null,
            responsavel: r.responsavel || null,
            createdById: r.createdById || null,
            fotoUrl: r.fotoUrl || null,
            fotoResolvidaUrl: r.fotoResolvidaUrl || null,
            certificadoId: r.certificadoId || null,
            certificadoValidade: r.certificadoValidade || null,
            pendenciaResolvida: r.pendenciaResolvida !== undefined ? r.pendenciaResolvida : null,
          }))
        });
      }

      if (materiais && materiais.length > 0) {
        await tx.materialUtilizado.createMany({
          data: materiais.map((m: any) => ({
            id: m.id,
            inspecaoId: createdInspecao.id,
            materialId: m.materialId,
            quantidade: m.quantidade,
            observacao: m.observacao || null,
          }))
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

// Start the server
app.listen(PORT, () => {
  console.log(`✅ Server CME Checklist rodando na porta ${PORT}`);
});