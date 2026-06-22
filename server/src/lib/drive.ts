import { google } from 'googleapis';

// ── Google Drive OAuth2 ────────────────────────────────────────────
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'http://localhost:3333/oauth/callback'
);
oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

export const drive = google.drive({ version: 'v3', auth: oauth2Client });

// ── Upload para o Drive (privado — sem permissão pública) ──────────
// Retorna o fileId; o acesso ao conteúdo passa pelo proxy autenticado /api/files/:id.
export async function uploadToDrive(buffer: Buffer, filename: string, mimeType: string): Promise<string> {
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
