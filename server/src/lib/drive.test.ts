// Testes puros de classifyDriveError — sem I/O, sem mock de rede.
import { describe, it, expect } from 'vitest';
import { classifyDriveError, DriveError } from './drive.js';

describe('classifyDriveError', () => {
  it('passa adiante um DriveError já classificado sem reclassificar', () => {
    const original = new DriveError('AUTH_EXPIRED', 'x');
    expect(classifyDriveError(original)).toBe(original);
  });

  it('classifica status 401 como AUTH_EXPIRED', () => {
    const err = { response: { status: 401 } };
    expect(classifyDriveError(err).code).toBe('AUTH_EXPIRED');
  });

  it('classifica invalid_grant como AUTH_EXPIRED', () => {
    const err = {
      response: { data: { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' } },
    };
    expect(classifyDriveError(err).code).toBe('AUTH_EXPIRED');
  });

  it('classifica storageQuotaExceeded como QUOTA_OU_PERMISSAO', () => {
    const err = { response: { status: 403, data: { error: { errors: [{ reason: 'storageQuotaExceeded' }] } } } };
    expect(classifyDriveError(err).code).toBe('QUOTA_OU_PERMISSAO');
  });

  it('classifica rateLimitExceeded como QUOTA_OU_PERMISSAO', () => {
    const err = { response: { status: 429, data: { error: { errors: [{ reason: 'rateLimitExceeded' }] } } } };
    expect(classifyDriveError(err).code).toBe('QUOTA_OU_PERMISSAO');
  });

  it('classifica pasta notFound como QUOTA_OU_PERMISSAO', () => {
    const err = { response: { status: 404, data: { error: { errors: [{ reason: 'notFound' }] } } } };
    expect(classifyDriveError(err).code).toBe('QUOTA_OU_PERMISSAO');
  });

  it('classifica erro desconhecido/inesperado como UNKNOWN', () => {
    const err = new Error('algo inesperado');
    expect(classifyDriveError(err).code).toBe('UNKNOWN');
  });

  it('nunca inclui a mensagem crua do Google na mensagem classificada', () => {
    const err = { response: { status: 401 }, message: 'invalid_grant: Token has been expired or revoked.' };
    expect(classifyDriveError(err).message).not.toContain('invalid_grant');
  });
});
