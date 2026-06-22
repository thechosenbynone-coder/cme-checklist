import { describe, it, expect } from 'vitest';
import { maiusculas } from './index';

describe('maiusculas', () => {
  it('apara espaços e converte para maiúsculas (pt-BR)', () => {
    expect(maiusculas('  olá mundo ')).toBe('OLÁ MUNDO');
  });

  it('retorna undefined para string vazia ou só espaços', () => {
    expect(maiusculas('')).toBeUndefined();
    expect(maiusculas('   ')).toBeUndefined();
  });

  it('retorna undefined para null/undefined', () => {
    expect(maiusculas(null)).toBeUndefined();
    expect(maiusculas(undefined)).toBeUndefined();
  });
});
