import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireRole } from '../auth.js';
import { registrarAuditoria } from '../lib/audit.js';
import { modeloSchema } from '../schemas.js';

export const modelosRouter = Router();

// GET /api/modelos — lista todos os templates (todas as versões) p/ o builder
modelosRouter.get('/api/modelos', async (_req, res) => {
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
modelosRouter.get('/api/modelos/tipo/:tipo', async (req, res) => {
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
modelosRouter.get('/api/modelos/:id', async (req, res) => {
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
modelosRouter.post('/api/modelos', requireRole('GESTOR', 'ADMIN'), async (req, res) => {
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

    await registrarAuditoria(
      req.user?.sub,
      req.user?.nome,
      'EDITAR_TEMPLATE',
      'CHECKLIST_MODELO',
      novo.id,
      { nome: novo.nome, tipoEquipamento: novo.tipoEquipamento, versao: novo.versao }
    );

    res.json(novo);
  } catch (error: any) {
    console.error('Error creating model version:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});
