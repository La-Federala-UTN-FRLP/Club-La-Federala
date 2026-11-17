import { PrismaClient, Lote } from "../generated/prisma";
 // Lo comparten el server web y el job, por eso se lee NODE_ENV directo y no getWebEnv().
 // En producción: ni query (volumen en Cloud Logging) ni error. El log "error" de Prisma imprime el
 // mensaje completo, que en un PrismaClientValidationError incluye la query con sus argumentos; esos
 // errores igual llegan al caller y los loguean de forma segura el handler y los jobs (safeErrorForLog).
 const prisma = new PrismaClient({
 log: process.env.NODE_ENV === "production" ? ["warn"] : ["error", "warn", "query"],
 });
 export default prisma;

