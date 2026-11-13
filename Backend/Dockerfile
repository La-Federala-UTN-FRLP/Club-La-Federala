# Backend — imagen productiva (multi-stage).
#
# El mismo artefacto sirve para el proceso web y para el job de expiraciones:
#   web: CMD por defecto      → node dist/server.js
#   job: override del comando → node dist/jobs/runExpirations.js
#
# Stages:
#   deps      npm ci con devDependencies (Prisma CLI, TypeScript). También es el target de
#             desarrollo de docker-compose (ts-node-dev + código montado por volumen).
#   build     prisma generate + tsc + copia del cliente Prisma a dist/generated/prisma.
#   prod-deps node_modules sin devDependencies.
#   runtime   solo dist + node_modules de producción, NODE_ENV=production, usuario sin privilegios.

FROM node:20-slim AS base
# OpenSSL: lo requiere el query engine de Prisma (binaryTarget debian-openssl-3.0.x).
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
# El schema va antes de npm ci: el postinstall de @prisma/client lo busca.
COPY prisma ./prisma
RUN npm ci

FROM deps AS build
COPY tsconfig.json ./
COPY scripts/copy-prisma-generated.cjs ./scripts/copy-prisma-generated.cjs
COPY src ./src
# Genera el cliente desde el schema de la imagen (nunca uno generado en el host).
# URLs DUMMY solo para este comando: el build no se conecta a ninguna base. `prisma generate` (6.x)
# no las exige, pero otros comandos que leen la config del schema (validate, migrate) sí, y el build
# no debe depender de eso ni de un .env (excluido por .dockerignore). No son secretos, no quedan en
# ENV/ARG y este stage no forma parte de la imagen final: el runtime recibe las URLs reales por entorno.
RUN rm -rf src/generated \
    && DATABASE_URL="postgresql://build:build@localhost:5432/build" \
       DIRECT_URL="postgresql://build:build@localhost:5432/build" \
       npm run build

FROM build AS prod-deps
RUN npm prune --omit=dev

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=prod-deps --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 3000
# node como PID 1: recibe SIGTERM/SIGINT directamente (cierre ordenado en serverLifecycle).
CMD ["node", "dist/server.js"]
