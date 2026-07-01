// Testes de integração de POST /api/upload e GET /api/files/:id — mocka o
// client googleapis (nunca chama o Google real), servidor real via HTTP.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const mockFilesCreate = vi.fn();
const mockFilesGet = vi.fn();

vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: vi.fn().mockImplementation(() => ({ setCredentials: vi.fn() })),
    },
    drive: vi.fn(() => ({ files: { create: mockFilesCreate, get: mockFilesGet } })),
  },
}));

import { startServer, stopServer, getBase, tokenFor } from '../test-helpers.js';

const ORIGINAL_ENV = { ...process.env };

function setDriveEnv() {
  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
  process.env.GOOGLE_REFRESH_TOKEN = 'test-refresh-token';
  process.env.GOOGLE_DRIVE_FOLDER_ID = 'test-folder-id';
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
});

function uploadForm(bytes: Buffer, mimeType: string, filename: string): FormData {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(bytes)], { type: mimeType }), filename);
  return form;
}

describe('POST /api/upload', () => {
  it('retorna 503 NOT_CONFIGURED quando faltam variáveis do Drive', async () => {
    clearDriveEnv();
    const res = await fetch(`${getBase()}/api/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: uploadForm(Buffer.from('conteudo'), 'image/jpeg', 'foto.jpg'),
    });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe('NOT_CONFIGURED');
  });

  it('faz upload com sucesso e devolve a URL do proxy autenticado', async () => {
    setDriveEnv();
    mockFilesCreate.mockResolvedValue({ data: { id: 'file-123' } });
    const res = await fetch(`${getBase()}/api/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: uploadForm(Buffer.from('conteudo'), 'image/jpeg', 'foto.jpg'),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe('/api/files/file-123');
  });

  it('retorna 503 AUTH_EXPIRED sem vazar a mensagem crua do Google', async () => {
    setDriveEnv();
    mockFilesCreate.mockRejectedValue({ response: { status: 401 }, message: 'invalid_grant' });
    const res = await fetch(`${getBase()}/api/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: uploadForm(Buffer.from('conteudo'), 'image/jpeg', 'foto.jpg'),
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
      body: uploadForm(Buffer.from('conteudo'), 'image/jpeg', 'foto.jpg'),
    });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.code).toBe('UNKNOWN');
  });

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
});
