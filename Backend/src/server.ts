// server.ts
import './config/bootstrapWeb';
import app from './app';
import prisma from './config/prisma';
import { createShutdown } from './serverLifecycle';
import { getWebEnv } from './config/env';

const { port } = getWebEnv();

const server = app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

const shutdown = createShutdown({
    server,
    prisma,
});

process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
});
process.on('SIGINT', () => {
    void shutdown('SIGINT');
});
