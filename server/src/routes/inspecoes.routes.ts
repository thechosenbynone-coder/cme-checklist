import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireRole } from '../auth.js';
import { registrarAuditoria } from '../lib/audit.js';
import { calcularStatusLiberacao } from '../lib/equipamento.js';
import { inspecaoSchema } from '../schemas.js';

export const inspecoesRouter = Router();

// GET /api/inspecoes
inspecoesRouter.get('/api/inspecoes', async (_req, res) => {
  try {
    const data = await prisma.inspecao.findMany({
      include: {
        equipamento: true,
        respostas: { include: { item: true } },
        materiais: { include: { material: true } },
        createdBy: { select: { nome: true } },
        validadaPor: { select: { nome: true } },
      },
      orderBy: { data: 'desc' },
    });
    res.json(data);
  } catch (error: any) {
    console.error('Error fetching inspections:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// GET /api/inspecoes/mine — registrada ANTES de /:id
inspecoesRouter.get('/api/inspecoes/mine', async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    const userId = req.user?.sub;

    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado.' });
    }

    const where: any = {
      createdById: userId,
    };

    if (status) {
      if (status.includes(',')) {
        where.status = { in: status.split(',') };
      } else {
        where.status = status;
      }
    }

    const data = await prisma.inspecao.findMany({
      where,
      select: {
        id: true,
        status: true,
        data: true,
        updatedAt: true,
        tipo: true,
        equipamento: {
          select: {
            codigo: true,
            codigoExibicao: true,
            nome: true,
          },
        },
        _count: {
          select: {
            respostas: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json(data);
  } catch (error: any) {
    console.error('Error fetching mine inspections:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// GET /api/checklist/bootstrap
inspecoesRouter.get('/api/checklist/bootstrap', async (req, res) => {
  try {
    const { equipamentoId, tipo } = req.query;
    if (typeof equipamentoId !== 'string' || typeof tipo !== 'string') {
      return res.status(400).json({ error: 'Parâmetros equipamentoId e tipo são obrigatórios.' });
    }

    const eq = await prisma.equipamento.findFirst({
      where: { OR: [{ id: equipamentoId }, { codigo: equipamentoId }] },
      include: { certificados: { orderBy: { validade: 'asc' } } },
    });

    if (!eq) {
      return res.status(404).json({ error: 'Equipamento não encontrado.' });
    }

    // O modelo de checklist é determinado pelo TIPO DO EQUIPAMENTO
    // (Booster, Compressor, Membrana, After Cooler...) e não pelo tipo de
    // inspeção (PRE_EMBARQUE/OPERACIONAL/RETORNO). O parâmetro `tipo` da query
    // é o tipo de equipamento enviado pelo app; usamos `eq.tipo` como fallback
    // autoritativo para rascunhos antigos que enviavam o tipo de inspeção.
    const tipoEquipamento = eq.tipo || tipo;
    const model = await prisma.checklistModelo.findFirst({
      where: { tipoEquipamento, ativo: true },
      include: { itens: { orderBy: { ordem: 'asc' } } },
    });

    const materials = await prisma.material.findMany({
      where: { ativo: true },
      orderBy: { descricao: 'asc' },
    });

    res.json({
      equipamento: { ...eq, statusLiberacao: calcularStatusLiberacao(eq) },
      modelo: model || null,
      materiais: materials,
    });
  } catch (error: any) {
    console.error('Error during bootstrap:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// PUT /api/inspecoes/:id — upsert idempotente
inspecoesRouter.put('/api/inspecoes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const parsed = inspecaoSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Dados da inspeção inválidos.' });
    }
    const { respostas, materiais, ...rest } = parsed.data;

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.inspecao.findUnique({
        where: { id },
      });

      if (existing && (existing.status === 'CONCLUIDA' || existing.status === 'VALIDADA')) {
        throw { status: 409, message: 'Não é possível alterar uma inspeção já concluída ou validada.' };
      }

      const dataField: any = {
        equipamentoId: rest.equipamentoId,
        tipo: rest.tipo,
        data: rest.data ? new Date(rest.data) : (existing ? existing.data : new Date()),
        modeloId: rest.modeloId || null,
        modeloVersao: rest.modeloVersao ?? null,
        responsavelGeral: rest.responsavelGeral,
        localizacao: rest.localizacao,
        status: rest.status,
        observacoesGerais: rest.observacoesGerais,
        assinaturaUrl: rest.assinaturaUrl || null,
        fotosUrls: rest.fotosUrls || rest.fotosEquipamento || [],
        origem: rest.origem || null,
        destino: rest.destino || null,
        compressorUtilizado: rest.compressorUtilizado || null,
        classificacao: rest.classificacao || null,
      };

      let savedInspecao;

      if (existing) {
        savedInspecao = await tx.inspecao.update({
          where: { id },
          data: dataField,
        });
      } else {
        const numeroDocumento =
          rest.numeroDocumento ||
          `OPE-PC-03/${new Date().toISOString().slice(0, 10).replace(/-/g, '')}/${id.slice(-6).toUpperCase()}`;

        savedInspecao = await tx.inspecao.create({
          data: {
            ...dataField,
            id,
            numeroDocumento,
            createdById: rest.createdById || req.user?.sub || null,
          },
        });
      }

      // Upsert Respostas
      if (respostas) {
        const itemIds = respostas.map((r) => r.itemId);
        // Remove item responses that are no longer in the payload
        await tx.respostaItem.deleteMany({
          where: {
            inspecaoId: id,
            itemId: { notIn: itemIds },
          },
        });

        // Upsert each response in the payload
        for (const r of respostas) {
          await tx.respostaItem.upsert({
            where: {
              inspecaoId_itemId: {
                inspecaoId: id,
                itemId: r.itemId,
              },
            },
            create: {
              id: r.id || `resp-${r.itemId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              inspecaoId: id,
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
            },
            update: {
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
            },
          });
        }
      }

      // Delete + recreate materiais
      await tx.materialUtilizado.deleteMany({ where: { inspecaoId: id } });
      if (materiais && materiais.length > 0) {
        await tx.materialUtilizado.createMany({
          data: materiais.map((m, idx) => ({
            id: m.id || `mu-${idx}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            inspecaoId: id,
            materialId: m.materialId,
            quantidade: m.quantidade,
            observacao: m.observacao || null,
          })),
        });
      }

      return savedInspecao;
    });

    // Auditoria: ONLY log when status = CONCLUIDA
    if (result.status === 'CONCLUIDA') {
      await registrarAuditoria(
        req.user?.sub,
        req.user?.nome,
        'CRIAR_INSPECAO',
        'INSPECAO',
        result.id,
        { status: result.status, numeroDocumento: result.numeroDocumento, upsert: true }
      );
    }

    res.json(result);
  } catch (error: any) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Error in PUT inspection:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// GET /api/inspecoes/:id
inspecoesRouter.get('/api/inspecoes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = await prisma.inspecao.findUnique({
      where: { id },
      include: {
        equipamento: true,
        respostas: { include: { item: true } },
        materiais: { include: { material: true } },
        createdBy: { select: { nome: true } },
        validadaPor: { select: { nome: true } },
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
inspecoesRouter.post('/api/inspecoes', async (req, res) => {
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

    await registrarAuditoria(
      req.user?.sub,
      req.user?.nome,
      'CRIAR_INSPECAO',
      'INSPECAO',
      result.id,
      { status: result.status, numeroDocumento: result.numeroDocumento }
    );

    res.json(result);
  } catch (error: any) {
    console.error('Error creating inspection:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// PATCH /api/inspecoes/:id/validar — Gestor/Admin valida e libera o equipamento (ISO 9001)
inspecoesRouter.patch('/api/inspecoes/:id/validar', requireRole('GESTOR', 'ADMIN'), async (req, res) => {
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
        createdBy: { select: { nome: true } },
        validadaPor: { select: { nome: true } },
      },
    });

    await registrarAuditoria(
      req.user?.sub,
      req.user?.nome,
      'VALIDAR_INSPECAO',
      'INSPECAO',
      completa?.id,
      { status: completa?.status, numeroDocumento: completa?.numeroDocumento }
    );

    res.json(completa);
  } catch (error: any) {
    console.error('Error validating inspection:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});
