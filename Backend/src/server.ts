// server.ts
import app from './app';
import prisma from './config/prisma';
import { createShutdown } from './serverLifecycle';

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
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
