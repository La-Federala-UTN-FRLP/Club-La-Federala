import dotenv from 'dotenv';
import express from 'express';
import { loteRoutes } from './routes/lote.routes';
import { logRequest } from './middlewares/logger.middleware';
import { handleError } from './middlewares/error.middleware';
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

dotenv.config();

const app = express();

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

const corsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    callback(null, resolveCorsOrigin(origin, process.env.FRONTEND_URL, process.env.NODE_ENV));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204,
}



// Middlewares globlales
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(logRequest);

// App Routes
app.use('/api/auth', authRoutes);
app.use('/api/lotes', loteRoutes);
app.use("/api/usuarios", usuarioRoutes);
app.use("/api/reservas", reservaRoutes);
app.use("/api/inmobiliarias", inmobRoutes);
app.use("/api/ventas", ventaRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/personas', personaRoutes);
app.use('/api/fracciones', fraccionRoutes);
app.use('/api/ubicaciones', ubicacionRoutes);
app.use('/api/prioridades', prioridadRoutes);

// Error handling middleware (DEBE ir después de todas las rutas)
app.use(handleError);


export default app;