// Testes de integração de POST /api/upload e GET /api/files/:id — mocka o
// client googleapis (nunca chama o Google real), servidor real via HTTP.
// Testes que envolvem a pasta por inspeção precisam de um banco real
// (HAS_DB) — a rota consulta Prisma.inspecao antes de decidir a pasta.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const { mockFilesCreate, mockFilesGet, mockFilesList, mockOAuth2Constructor, mockDriveConstructor } = vi.hoisted(() => {
  const mockFilesCreate = vi.fn();
  const mockFilesGet = vi.fn();
  const mockFilesList = vi.fn();
  const mockOAuth2Constructor = vi.fn().mockImplementation(() => ({ setCredentials: vi.fn() }));
  const mockDriveConstructor = vi.fn(() => ({ files: { create: mockFilesCreate, get: mockFilesGet, list: mockFilesList } }));
  return { mockFilesCreate, mockFilesGet, mockFilesList, mockOAuth2Constructor, mockDriveConstructor };
});

vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: mockOAuth2Constructor,
    },
    drive: mockDriveConstructor,
  },
}));

import { startServer, stopServer, getBase, tokenFor, prisma, HAS_DB } from '../test-helpers.js';

const ORIGINAL_ENV = { ...process.env };

function setDriveEnv() {
  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
  process.env.GOOGLE_REFRESH_TOKEN = 'test-refresh-token';
  process.env.GOOGLE_DRIVE_FOLDER_ID = 'test-root-folder-id';
}

function clearDriveEnv() {
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.GOOGLE_REFRESH_TOKEN;
  delete process.env.GOOGLE_DRIVE_FOLDER_ID;
}

let token: string;

beforeAll(async () => {
  await startServer();
  token = tokenFor('usr-test-conta-drive', 'Teste Drive', 'OPERADOR');
});

afterAll(async () => {
  await stopServer();
  process.env = { ...ORIGINAL_ENV };
});

beforeEach(() => {
  mockFilesCreate.mockReset();
  mockFilesGet.mockReset();
  mockFilesList.mockReset();
});

function uploadForm(bytes: Buffer, mimeType: string, filename: string, inspecaoId?: string): FormData {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(bytes)], { type: mimeType }), filename);
  if (inspecaoId) form.append('inspecaoId', inspecaoId);
  return form;
}

// ── Testes que não dependem de banco (multer rejeita antes de qualquer lookup) ──
describe('POST /api/upload — validação de arquivo', () => {
  it('retorna 413 quando o arquivo excede o limite de 25MB', async () => {
    setDriveEnv();
    const big = Buffer.alloc(26 * 1024 * 1024, 1);
    const res = await fetch(`${getBase()}/api/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: uploadForm(big, 'image/jpeg', 'foto-grande.jpg'),
    });
    expect(res.status).toBe(413);
  });

  it('retorna 415 para tipo de arquivo não permitido', async () => {
    setDriveEnv();
    const res = await fetch(`${getBase()}/api/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: uploadForm(Buffer.from('conteudo'), 'application/pdf', 'documento.pdf'),
    });
    expect(res.status).toBe(415);
  });
});

// ── Testes de pasta por inspeção e classificação de erro (precisam de DB real) ──
const EQUIP_ID = 'eq-test-conta-drive';
const INSP_SEM_PASTA_ID = 'insp-test-conta-sempasta';
const INSP_COM_PASTA_ID = 'insp-test-conta-compasta';
const INSP_PASTA_INVALIDA_ID = 'insp-test-conta-pastainvalida';
const INSP_RECUPERAVEL_ID = 'insp-test-conta-recuperavel';
const INSP_CONCORRENCIA_ID = 'insp-test-conta-concorrencia';
const INSP_SEM_NUMERO_ID = 'insp-test-conta-semnumero';

describe.skipIf(!HAS_DB)('POST /api/upload — pasta por inspeção', () => {
  beforeAll(async () => {
    await prisma.equipamento.upsert({
      where: { id: EQUIP_ID },
      update: {},
      create: { id: EQUIP_ID, codigo: 'EQ-TEST-DRIVE', nome: 'Equipamento Teste Drive', tipo: 'Compressor' },
    });

    const baseInspecao = {
      equipamentoId: EQUIP_ID,
      tipo: 'OPERACIONAL' as const,
      status: 'EM_ANDAMENTO' as const,
    };

    await prisma.inspecao.upsert({
      where: { id: INSP_SEM_PASTA_ID },
      update: { driveFolderId: null },
      create: { id: INSP_SEM_PASTA_ID, numeroDocumento: 'OPE-PC-03/20260701/AAA001', driveFolderId: null, ...baseInspecao },
    });
    await prisma.inspecao.upsert({
      where: { id: INSP_COM_PASTA_ID },
      update: { driveFolderId: 'preset-folder-id' },
      create: { id: INSP_COM_PASTA_ID, numeroDocumento: 'OPE-PC-03/20260701/AAA002', driveFolderId: 'preset-folder-id', ...baseInspecao },
    });
    await prisma.inspecao.upsert({
      where: { id: INSP_PASTA_INVALIDA_ID },
      update: { driveFolderId: 'stale-folder-id' },
      create: { id: INSP_PASTA_INVALIDA_ID, numeroDocumento: 'OPE-PC-03/20260701/AAA003', driveFolderId: 'stale-folder-id', ...baseInspecao },
    });
    await prisma.inspecao.upsert({
      where: { id: INSP_RECUPERAVEL_ID },
      update: { driveFolderId: null },
      create: { id: INSP_RECUPERAVEL_ID, numeroDocumento: 'OPE-PC-03/20260701/AAA004', driveFolderId: null, ...baseInspecao },
    });
    await prisma.inspecao.upsert({
      where: { id: INSP_CONCORRENCIA_ID },
      update: { driveFolderId: null },
      create: { id: INSP_CONCORRENCIA_ID, numeroDocumento: 'OPE-PC-03/20260701/AAA005', driveFolderId: null, ...baseInspecao },
    });
    await prisma.inspecao.upsert({
      where: { id: INSP_SEM_NUMERO_ID },
      update: { driveFolderId: null, numeroDocumento: null },
      create: { id: INSP_SEM_NUMERO_ID, numeroDocumento: null, driveFolderId: null, ...baseInspecao },
    });
  });

  afterAll(async () => {
    await prisma.inspecao.deleteMany({
      where: {
        id: {
          in: [
            INSP_SEM_PASTA_ID,
            INSP_COM_PASTA_ID,
            INSP_PASTA_INVALIDA_ID,
            INSP_RECUPERAVEL_ID,
            INSP_CONCORRENCIA_ID,
            INSP_SEM_NUMERO_ID,
          ],
        },
      },
    });
    await prisma.equipamento.deleteMany({ where: { id: EQUIP_ID } });
  });

  it('retorna 400 quando inspecaoId está ausente', async () => {
    setDriveEnv();
    const res = await fetch(`${getBase()}/api/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: uploadForm(Buffer.from('conteudo'), 'image/jpeg', 'foto.jpg'),
    });
    expect(res.status).toBe(400);
    // Nenhuma chamada ao Drive deve ter sido feita sem inspecaoId.
    expect(mockFilesCreate).not.toHaveBeenCalled();
  });

  it('retorna 404 quando inspecaoId não corresponde a nenhuma inspeção', async () => {
    setDriveEnv();
    const res = await fetch(`${getBase()}/api/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: uploadForm(Buffer.from('conteudo'), 'image/jpeg', 'foto.jpg', 'inspecao-inexistente'),
    });
    expect(res.status).toBe(404);
  });

  it('retorna 503 NOT_CONFIGURED quando faltam variáveis do Drive', async () => {
    clearDriveEnv();
    const res = await fetch(`${getBase()}/api/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: uploadForm(Buffer.from('conteudo'), 'image/jpeg', 'foto.jpg', INSP_SEM_PASTA_ID),
    });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe('NOT_CONFIGURED');
  });

  it('cria a pasta no primeiro upload e persiste driveFolderId', async () => {
    setDriveEnv();
    mockFilesList.mockResolvedValue({ data: { files: [] } });
    mockFilesCreate.mockImplementation(async (args: any) => {
      if (args.requestBody.mimeType === 'application/vnd.google-apps.folder') {
        expect(args.requestBody.appProperties).toEqual({ inspecaoId: INSP_SEM_PASTA_ID });
        expect(args.requestBody.parents).toEqual(['test-root-folder-id']);
        return { data: { id: 'folder-novo-001' } };
      }
      expect(args.requestBody.parents).toEqual(['folder-novo-001']);
      return { data: { id: 'file-001' } };
    });

    const res = await fetch(`${getBase()}/api/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: uploadForm(Buffer.from('conteudo'), 'image/jpeg', 'foto.jpg', INSP_SEM_PASTA_ID),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe('/api/files/file-001');
    expect(mockFilesCreate).toHaveBeenCalledTimes(2);

    const inspecao = await prisma.inspecao.findUnique({ where: { id: INSP_SEM_PASTA_ID } });
    expect(inspecao?.driveFolderId).toBe('folder-novo-001');
  });

  it('reutiliza pasta já existente no Drive (encontrada via appProperties) sem criar outra', async () => {
    setDriveEnv();
    await prisma.inspecao.update({ where: { id: INSP_RECUPERAVEL_ID }, data: { driveFolderId: null } });
    mockFilesList.mockResolvedValue({ data: { files: [{ id: 'folder-recuperado-001', name: 'x' }] } });
    mockFilesCreate.mockResolvedValue({ data: { id: 'file-002' } });

    const res = await fetch(`${getBase()}/api/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: uploadForm(Buffer.from('conteudo'), 'image/jpeg', 'foto.jpg', INSP_RECUPERAVEL_ID),
    });
    expect(res.status).toBe(200);
    // Só a chamada de criação do arquivo — nenhuma pasta nova criada.
    expect(mockFilesCreate).toHaveBeenCalledTimes(1);
    expect(mockFilesCreate.mock.calls[0][0].requestBody.mimeType).not.toBe('application/vnd.google-apps.folder');

    const inspecao = await prisma.inspecao.findUnique({ where: { id: INSP_RECUPERAVEL_ID } });
    expect(inspecao?.driveFolderId).toBe('folder-recuperado-001');
  });

  it('reutiliza driveFolderId já salvo no banco sem consultar o Drive', async () => {
    setDriveEnv();
    mockFilesCreate.mockResolvedValue({ data: { id: 'file-003' } });

    const res = await fetch(`${getBase()}/api/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: uploadForm(Buffer.from('conteudo'), 'image/jpeg', 'foto.jpg', INSP_COM_PASTA_ID),
    });
    expect(res.status).toBe(200);
    expect(mockFilesList).not.toHaveBeenCalled();
    expect(mockFilesCreate).toHaveBeenCalledTimes(1);
    expect(mockFilesCreate.mock.calls[0][0].requestBody.parents).toEqual(['preset-folder-id']);
  });

  it('recupera de um driveFolderId salvo que aponta para pasta apagada/sem permissão', async () => {
    setDriveEnv();
    mockFilesList.mockResolvedValue({ data: { files: [] } });
    mockFilesCreate.mockImplementation(async (args: any) => {
      if (args.requestBody.mimeType === 'application/vnd.google-apps.folder') {
        return { data: { id: 'folder-nova-002' } };
      }
      if (args.requestBody.parents[0] === 'stale-folder-id') {
        throw { response: { status: 404, data: { error: { errors: [{ reason: 'notFound' }] } } } };
      }
      return { data: { id: 'file-004' } };
    });

    const res = await fetch(`${getBase()}/api/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: uploadForm(Buffer.from('conteudo'), 'image/jpeg', 'foto.jpg', INSP_PASTA_INVALIDA_ID),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe('/api/files/file-004');

    const inspecao = await prisma.inspecao.findUnique({ where: { id: INSP_PASTA_INVALIDA_ID } });
    expect(inspecao?.driveFolderId).toBe('folder-nova-002');
  });

  it('só cria uma pasta quando duas requisições concorrentes chegam para a mesma inspeção', async () => {
    setDriveEnv();
    mockFilesList.mockResolvedValue({ data: { files: [] } });
    let folderCreations = 0;
    mockFilesCreate.mockImplementation(async (args: any) => {
      if (args.requestBody.mimeType === 'application/vnd.google-apps.folder') {
        folderCreations += 1;
        return { data: { id: 'folder-concorrencia-001' } };
      }
      return { data: { id: `file-concorrente-${Math.random()}` } };
    });

    const doUpload = () =>
      fetch(`${getBase()}/api/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: uploadForm(Buffer.from('conteudo'), 'image/jpeg', 'foto.jpg', INSP_CONCORRENCIA_ID),
      });

    const [res1, res2] = await Promise.all([doUpload(), doUpload()]);
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(folderCreations).toBe(1);
  });

  it('usa o próprio id como fallback no nome da pasta quando numeroDocumento é nulo', async () => {
    setDriveEnv();
    mockFilesList.mockResolvedValue({ data: { files: [] } });
    mockFilesCreate.mockImplementation(async (args: any) => {
      if (args.requestBody.mimeType === 'application/vnd.google-apps.folder') {
        expect(args.requestBody.name).toContain(INSP_SEM_NUMERO_ID);
        return { data: { id: 'folder-sem-numero-001' } };
      }
      return { data: { id: 'file-005' } };
    });

    const res = await fetch(`${getBase()}/api/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: uploadForm(Buffer.from('conteudo'), 'image/jpeg', 'foto.jpg', INSP_SEM_NUMERO_ID),
    });
    expect(res.status).toBe(200);
  });

  it('faz upload com sucesso e devolve a URL do proxy autenticado', async () => {
    setDriveEnv();
    mockFilesCreate.mockResolvedValue({ data: { id: 'file-006' } });
    const res = await fetch(`${getBase()}/api/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: uploadForm(Buffer.from('conteudo'), 'image/jpeg', 'foto.jpg', INSP_COM_PASTA_ID),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe('/api/files/file-006');
  });

  it('retorna 503 AUTH_EXPIRED sem vazar a mensagem crua do Google', async () => {
    setDriveEnv();
    mockFilesCreate.mockRejectedValue({ response: { status: 401 }, message: 'invalid_grant' });
    const res = await fetch(`${getBase()}/api/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: uploadForm(Buffer.from('conteudo'), 'image/jpeg', 'foto.jpg', INSP_COM_PASTA_ID),
    });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe('AUTH_EXPIRED');
    expect(body.error).not.toContain('invalid_grant');
  });

  it('retorna 502 UNKNOWN para erro não mapeado do Drive', async () => {
    setDriveEnv();
    mockFilesCreate.mockRejectedValue(new Error('falha inesperada de rede'));
    const res = await fetch(`${getBase()}/api/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: uploadForm(Buffer.from('conteudo'), 'image/jpeg', 'foto.jpg', INSP_COM_PASTA_ID),
    });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.code).toBe('UNKNOWN');
  });

  it('reconstrói o client OAuth só quando a config muda, não a cada chamada', async () => {
    setDriveEnv();
    mockFilesCreate.mockResolvedValue({ data: { id: 'file-cache-001' } });
    // Chamadas anteriores neste arquivo já podem ter deixado o client cacheado
    // com a config atual (mesmas env vars) — zera a contagem pra medir só o
    // que acontece a partir daqui.
    mockDriveConstructor.mockClear();

    await fetch(`${getBase()}/api/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: uploadForm(Buffer.from('conteudo'), 'image/jpeg', 'foto.jpg', INSP_COM_PASTA_ID),
    });
    await fetch(`${getBase()}/api/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: uploadForm(Buffer.from('conteudo'), 'image/jpeg', 'foto.jpg', INSP_COM_PASTA_ID),
    });
    // Config idêntica nas duas chamadas — client não deve ser reconstruído.
    expect(mockDriveConstructor).not.toHaveBeenCalled();

    process.env.GOOGLE_REFRESH_TOKEN = 'test-refresh-token-mudou';
    await fetch(`${getBase()}/api/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: uploadForm(Buffer.from('conteudo'), 'image/jpeg', 'foto.jpg', INSP_COM_PASTA_ID),
    });
    // Config mudou — client deve ser reconstruído desta vez.
    expect(mockDriveConstructor).toHaveBeenCalledTimes(1);

    setDriveEnv(); // restaura pro valor padrão usado pelas demais chamadas
  });
});

describe('GET /api/files/:id', () => {
  it('retorna 503 AUTH_EXPIRED (não mais "arquivo não encontrado") quando o token expirou', async () => {
    setDriveEnv();
    mockFilesGet.mockRejectedValue({ response: { status: 401 }, message: 'invalid_grant' });
    const res = await fetch(`${getBase()}/api/files/abc123`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe('AUTH_EXPIRED');
  });

  it('retorna 404 FILE_NOT_FOUND quando o arquivo foi deletado ou não existe', async () => {
    setDriveEnv();
    mockFilesGet.mockRejectedValue({
      response: { status: 404, data: { error: { errors: [{ reason: 'notFound' }] } } },
    });
    const res = await fetch(`${getBase()}/api/files/deleted-file-id`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe('FILE_NOT_FOUND');
  });
});
