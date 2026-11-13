import express from 'express';
import { loteRoutes } from './routes/lote.routes';
import { logRequest } from './middlewares/logger.middleware';
import { handleError, notFoundHandler, JSON_BODY_LIMIT } from './middlewares/error.middleware';
import cors from 'cors';
import { resolveCorsOrigin } from './config/cors.origins';
import { authRoutes } from './routes/auth.routes';
import { usuarioRoutes } from './routes/usuario.routes';
import { reservaRoutes } from './routes/reserva.routes';
import {inmobRoutes} from './routes/inmobiliaria.routes';
import {ventaRoutes} from "./routes/ventas.routes";
import { fileRoutes } from './routes/files.routes';
import {personaRoutes} from "./routes/persona.routes";
import { fraccionRoutes } from './routes/fraccion.routes';
import { ubicacionRoutes } from './routes/ubicacion.routes';
import { prioridadRoutes } from './routes/prioridad.routes';

const app = express();

// Sin X-Powered-By: no anunciar el framework.
app.disable('x-powered-by');

// Evitar 304 en endpoints de API protegidos
app.set('etag', false); // desactiva ETag (condicionales -> 304)

// Cabeceras anti-cache solo para /api/*
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store'); // nada de cache en browser/proxy
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Vary', 'Authorization');     // importante si usás Bearer
  }
  next();
});

// CORS es política del navegador (qué origins pueden leer respuestas desde JS); la seguridad del
// recurso la dan JWT + RBAC. Sin `credentials`: la auth es Bearer en Authorization, sin cookies.
const corsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    callback(null, resolveCorsOrigin(origin, process.env.FRONTEND_URL, process.env.NODE_ENV));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204,
}



// Middlewares globlales
app.use(cors(corsOptions));
// El logger va antes del parser: también registra los 413/400 que corta express.json.
app.use(logRequest);
// Los archivos viajan por multipart (multer, 20 MB); el JSON de la API es chico.
app.use(express.json({ limit: JSON_BODY_LIMIT }));

app.get('/health', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ status: 'ok' });
});

// App Routes: prefijo → router. Fuente única para montar la API y para el test que compara las
// rutas reales con la OpenAPI (tests/unit/openapi). Agregar un router acá lo suma a ese control.
export const apiRouters = [
  ['/api/auth', authRoutes],
  ['/api/lotes', loteRoutes],
  ['/api/usuarios', usuarioRoutes],
  ['/api/reservas', reservaRoutes],
  ['/api/inmobiliarias', inmobRoutes],
  ['/api/ventas', ventaRoutes],
  ['/api/files', fileRoutes],
  ['/api/personas', personaRoutes],
  ['/api/fracciones', fraccionRoutes],
  ['/api/ubicaciones', ubicacionRoutes],
  ['/api/prioridades', prioridadRoutes],
] as const;

for (const [prefix, router] of apiRouters) {
  app.use(prefix, router);
}

// 404 JSON para rutas (o métodos) sin handler: después de todas las rutas, antes del error handler.
app.use(notFoundHandler);

// Error handling middleware (DEBE ir después de todas las rutas)
app.use(handleError);


export default app;