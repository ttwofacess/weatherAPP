import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'jsdom',
        globals: true,
        include: ['tests/**/*.test.js'],
        setupFiles: ['tests/setup.js'],
        restoreMocks: true,
        unstubEnvs: true,
        unstubGlobals: true,
        // OJO: no usar pool 'vmThreads'. Los tests de time.js dependen de
        // mutar process.env.TZ, y en worker threads Node no invalida su caché
        // de zona horaria, así que los resultados serían incorrectos.
        pool: 'forks',
    },
});