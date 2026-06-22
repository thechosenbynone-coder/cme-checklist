import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Segredo dummy para o auth.ts não falhar no load durante os testes
    // (os smoke tests não validam tokens reais).
    env: { JWT_SECRET: 'test-secret-cme' },
    include: ['**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/android/**'],
  },
});
