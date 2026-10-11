import { PrismaClient, Lote } from "../generated/prisma";
 // Lo comparten el server web y el job, por eso se lee NODE_ENV directo y no getWebEnv().
 // En producción no se loguea cada query para no inflar Cloud Logging.
 const prisma = new PrismaClient({
 log: process.env.NODE_ENV === "production" ? ["error", "warn"] : ["error", "warn", "query"],
 });
 export default prisma;

