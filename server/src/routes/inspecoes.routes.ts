import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireRole } from '../auth.js';
import { registrarAuditoria } from '../lib/audit.js';
import { calcularStatusLiberacao } from '../lib/equipamento.js';
import { inspecaoSchema, patchRespostasSchema, iniciarInspecaoSchema } from '../schemas.js';

export const inspecoesRouter = Router();

// Campos editáveis por resposta (usados no diff/histórico do PATCH granular).
const CAMPOS_RESPOSTA = [
  'status',
  'observacao',
  'responsavel',
  'valorNumerico',
  'valorTexto',
  'certificadoId',
  'certificadoValidade',
  'pendenciaResolvida',
  'fotoUrl',
  'fotosUrls',
  'fotoResolvidaUrl',
] as const;

// Normaliza um valor para comparação/histórico (sempre string ou null).
const normHist = (v: unknown): string | null =>
  v === undefined || v === null ? null : String(v);

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
              fotosUrls: r.fotosUrls || [],
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
              fotosUrls: r.fotosUrls || [],
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
            fotosUrls: r.fotosUrls || [],
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

// PATCH /api/inspecoes/:id/respostas — gravação granular (Fase 1).
// Recebe apenas o que mudou; faz diff por campo, grava no RespostaItem e
// registra cada alteração em RespostaHistorico (quem, de -> para, quando).
inspecoesRouter.patch('/api/inspecoes/:id/respostas', async (req, res) => {
  try {
    const { id } = req.params;
    const parsed = patchRespostasSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Dados inválidos.' });
    }
    const { alteracoes } = parsed.data;

    const inspecao = await prisma.inspecao.findUnique({ where: { id }, select: { status: true } });
    if (!inspecao) return res.status(404).json({ error: 'Inspeção não encontrada.' });
    if (inspecao.status === 'CONCLUIDA' || inspecao.status === 'VALIDADA') {
      return res.status(409).json({ error: 'Não é possível alterar uma inspeção já concluída ou validada.' });
    }

    const userId = req.user?.sub || null;
    const userNome = req.user?.nome || null;

    await prisma.$transaction(async (tx) => {
      for (const alt of alteracoes) {
        const { itemId, ...campos } = alt;

        const atual = await tx.respostaItem.findUnique({
          where: { inspecaoId_itemId: { inspecaoId: id, itemId } },
        });
        const item = await tx.itemChecklist.findUnique({
          where: { id: itemId },
          select: { secao: true },
        });
        const secao = item?.secao ?? null;

        // Monta apenas os campos presentes no payload (ausente = não mexe) e
        // acumula uma linha de histórico para cada campo que realmente mudou.
        const data: Record<string, unknown> = {};
        const historicos: any[] = [];
        for (const campo of CAMPOS_RESPOSTA) {
          const novo = (campos as Record<string, unknown>)[campo];
          if (novo === undefined) continue;
          data[campo] = novo;
          const anterior = atual ? (atual as Record<string, unknown>)[campo] : undefined;
          if (normHist(anterior) !== normHist(novo)) {
            historicos.push({
              inspecaoId: id,
              itemId,
              secao,
              campo,
              valorAnterior: normHist(anterior),
              valorNovo: normHist(novo),
              responsavelDeclarado: (campos.responsavel ?? atual?.responsavel) ?? null,
              userId,
              userNome,
            });
          }
        }

        if (Object.keys(data).length === 0) continue;

        await tx.respostaItem.upsert({
          where: { inspecaoId_itemId: { inspecaoId: id, itemId } },
          create: { inspecaoId: id, itemId, ...data, createdById: userId, updatedById: userId },
          update: { ...data, updatedById: userId },
        });

        if (historicos.length > 0) {
          await tx.respostaHistorico.createMany({ data: historicos });
        }
      }
    });

    res.json({ ok: true, updatedAt: new Date().toISOString() });
  } catch (error: any) {
    console.error('Error patching respostas:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// POST /api/inspecoes/:id/iniciar — cria a inspeção no servidor já no início
// (status EM_ANDAMENTO, sem respostas). Idempotente: se já existe, retorna-a.
inspecoesRouter.post('/api/inspecoes/:id/iniciar', async (req, res) => {
  try {
    const { id } = req.params;
    const parsed = iniciarInspecaoSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Dados inválidos.' });
    }
    const d = parsed.data;

    const existing = await prisma.inspecao.findUnique({ where: { id } });
    if (existing) return res.json(existing);

    const numeroDocumento = `OPE-PC-03/${new Date().toISOString().slice(0, 10).replace(/-/g, '')}/${id.slice(-6).toUpperCase()}`;

    const created = await prisma.inspecao.create({
      data: {
        id,
        equipamentoId: d.equipamentoId,
        tipo: d.tipo,
        status: 'EM_ANDAMENTO',
        numeroDocumento,
        modeloId: d.modeloId || null,
        modeloVersao: d.modeloVersao ?? null,
        responsavelGeral: d.responsavelGeral,
        origem: d.origem || null,
        destino: d.destino || null,
        compressorUtilizado: d.compressorUtilizado || null,
        classificacao: d.classificacao || null,
        createdById: req.user?.sub || null,
      },
    });

    await registrarAuditoria(
      req.user?.sub,
      req.user?.nome,
      'CRIAR_INSPECAO',
      'INSPECAO',
      created.id,
      { status: created.status, numeroDocumento, iniciar: true }
    );

    res.status(201).json(created);
  } catch (error: any) {
    console.error('Error starting inspection:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// GET /api/inspecoes/:id/historico — timeline de alterações por campo (auditoria).
inspecoesRouter.get('/api/inspecoes/:id/historico', async (req, res) => {
  try {
    const { id } = req.params;
    const data = await prisma.respostaHistorico.findMany({
      where: { inspecaoId: id },
      orderBy: { criadoEm: 'desc' },
      take: 500,
    });
    res.json(data);
  } catch (error: any) {
    console.error('Error fetching inspection history:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// DELETE /api/inspecoes/:id — exclui inspeção (limpeza). Respostas e materiais
// caem por cascata. Inspeção VALIDADA é protegida (registro oficial ISO).
inspecoesRouter.delete('/api/inspecoes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const insp = await prisma.inspecao.findUnique({ where: { id }, select: { status: true } });
    if (!insp) return res.status(404).json({ error: 'Inspeção não encontrada.' });
    if (insp.status === 'VALIDADA') {
      return res.status(409).json({ error: 'Inspeção validada não pode ser excluída.' });
    }
    await prisma.inspecao.delete({ where: { id } });
    res.json({ ok: true });
  } catch (error: any) {
    console.error('Error deleting inspection:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});
