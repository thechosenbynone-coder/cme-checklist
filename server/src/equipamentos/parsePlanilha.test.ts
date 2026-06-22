import { describe, it, expect } from 'vitest';
import { codigoCanonico, normalizeChave, serialParaISO } from './parsePlanilha';

describe('codigoCanonico', () => {
  it('descarta o que vem após "(" e normaliza para hífen-maiúsculo', () => {
    expect(codigoCanonico('booster 01 (sobressalente)')).toBe('BOOSTER-01');
  });

  it('apara espaços e remove hífens nas pontas', () => {
    expect(codigoCanonico('  AC-123  ')).toBe('AC-123');
    expect(codigoCanonico('--x--')).toBe('X');
  });
});

describe('normalizeChave', () => {
  it('mantém apenas alfanumérico maiúsculo', () => {
    expect(normalizeChave('AC-12.3 b')).toBe('AC123B');
  });
});

describe('serialParaISO', () => {
  it('converte serial do Excel para ISO (YYYY-MM-DD)', () => {
    // 44197 = 2021-01-01 no calendário do Excel.
    expect(serialParaISO(44197)).toBe('2021-01-01');
  });

  it('retorna null para valores não numéricos', () => {
    expect(serialParaISO('abc')).toBeNull();
    expect(serialParaISO(null)).toBeNull();
    expect(serialParaISO(NaN)).toBeNull();
  });
});
