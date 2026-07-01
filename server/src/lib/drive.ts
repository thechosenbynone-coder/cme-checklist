import { google } from 'googleapis';

// ── Google Drive OAuth2 ────────────────────────────────────────────
// Client criado sob demanda (lazy), não no import do módulo — permite validar
// a configuração antes de qualquer chamada real e evita um client "vazio"
// silencioso quando faltam variáveis de ambiente.

export type DriveErrorCode =
  | 'NOT_CONFIGURED'
  | 'AUTH_EXPIRED'
  | 'QUOTA_OU_PERMISSAO'
  | 'FILE_NOT_FOUND'
  | 'UNKNOWN';

export class DriveError extends Error {
  code: DriveErrorCode;
  constructor(code: DriveErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

interface DriveConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  folderId: string;
}

function getDriveConfig(): DriveConfig {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  if (!clientId || !clientSecret || !refreshToken || !folderId) {
    throw new DriveError(
      'NOT_CONFIGURED',
      'O sistema de armazenamento de evidências não está configurado no servidor. Contate o suporte técnico.'
    );
  }

  return { clientId, clientSecret, refreshToken, folderId };
}

let cachedDrive: ReturnType<typeof google.drive> | null = null;
let cachedConfig: DriveConfig | null = null;

function getDriveClient() {
  const config = getDriveConfig();

  // Reconstrói o client se a config mudou (ex.: variáveis atualizadas em runtime/teste).
  if (!cachedDrive || cachedConfig !== config) {
    const oauth2Client = new google.auth.OAuth2(
      config.clientId,
      config.clientSecret,
      'http://localhost:3333/oauth/callback'
    );
    oauth2Client.setCredentials({ refresh_token: config.refreshToken });
    cachedDrive = google.drive({ version: 'v3', auth: oauth2Client });
    cachedConfig = config;
  }

  return { drive: cachedDrive, config };
}

// Classifica o erro por campos estruturados (status HTTP, code, reason da API do
// Google) em vez de casar texto de mensagem — mensagens podem mudar sem aviso,
// os campos estruturados abaixo são o contrato estável da API.
// `operation` permite diferenciar tratamento (ex.: no download, 404 = arquivo deletado).
export function classifyDriveError(error: any, operation?: 'upload' | 'download'): DriveError {
  if (error instanceof DriveError) return error;

  const status: number | undefined = error?.response?.status ?? error?.code;
  const reason: string | undefined = error?.response?.data?.error?.errors?.[0]?.reason;
  const errorCode: string | undefined = error?.response?.data?.error_description
    ? error.response.data.error
    : undefined;

  if (status === 401 || errorCode === 'invalid_grant' || reason === 'authError') {
    return new DriveError(
      'AUTH_EXPIRED',
      'A conexão do servidor com o Google Drive expirou. Contate o suporte técnico.'
    );
  }

  // Em download, 404 significa arquivo não encontrado/deletado (não permissão).
  if (operation === 'download' && (status === 404 || reason === 'notFound')) {
    return new DriveError(
      'FILE_NOT_FOUND',
      'O arquivo de evidência não foi encontrado ou foi deletado.'
    );
  }

  if (
    status === 403 ||
    status === 404 ||
    status === 429 ||
    reason === 'rateLimitExceeded' ||
    reason === 'userRateLimitExceeded' ||
    reason === 'storageQuotaExceeded' ||
    reason === 'notFound'
  ) {
    return new DriveError(
      'QUOTA_OU_PERMISSAO',
      'Não foi possível acessar o armazenamento de evidências (permissão ou limite excedido). Contate o suporte técnico.'
    );
  }

  return new DriveError('UNKNOWN', 'Falha ao acessar o armazenamento de evidências. Tente novamente.');
}

// Log sanitizado — nunca inclui o objeto de erro bruto (pode conter headers,
// tokens ou URLs internas), só os campos relevantes pro diagnóstico manual.
function logDriveError(operation: 'upload' | 'download', error: DriveError, raw: any) {
  console.error(
    `[INTEGRATION][DRIVE] operation=${operation} code=${error.code} http_status=${raw?.response?.status ?? raw?.code ?? 'n/a'}`
  );
}

// ── Upload para o Drive (privado — sem permissão pública) ──────────
// Retorna o fileId; o acesso ao conteúdo passa pelo proxy autenticado /api/files/:id.
export async function uploadToDrive(buffer: Buffer, filename: string, mimeType: string): Promise<string> {
  let drive, config;
  try {
    ({ drive, config } = getDriveClient());
  } catch (error: any) {
    throw classifyDriveError(error);
  }

  try {
    const { Readable } = await import('stream');
    const stream = Readable.from(buffer);

    const res = await drive.files.create({
      requestBody: {
        name: filename,
        parents: [config.folderId],
      },
      media: { mimeType, body: stream },
      fields: 'id',
    });

    // IMPORTANTE: não tornamos o arquivo público. O app acessa via proxy autenticado.
    return res.data.id!;
  } catch (error: any) {
    const classified = classifyDriveError(error);
    logDriveError('upload', classified, error);
    throw classified;
  }
}

// ── Leitura do Drive (proxy autenticado) ────────────────────────────
// Usada por GET /api/files/:id. Antes, erros de auth/config apareciam pro
// usuário como "arquivo não encontrado" — agora passam pela mesma classificação.
export async function downloadFromDrive(fileId: string): Promise<{
  stream: NodeJS.ReadableStream;
  mimeType: string | null | undefined;
}> {
  let drive;
  try {
    ({ drive } = getDriveClient());
  } catch (error: any) {
    throw classifyDriveError(error);
  }

  try {
    const meta = await drive.files.get({ fileId, fields: 'mimeType, name' });
    const driveRes = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
    return { stream: driveRes.data as any, mimeType: meta.data.mimeType };
  } catch (error: any) {
    const classified = classifyDriveError(error, 'download');
    logDriveError('download', classified, error);
    throw classified;
  }
}
