import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { validate } from '../middlewares/validation.middleware';
import { loginSchema } from '../validations/auth.validation';
import { loginRateLimiter } from '../middlewares/loginRateLimit.middleware';

const router = Router();

// Rutas Públicas
// El rate limit va primero: cuenta también los intentos con body inválido.
router.post('/login', loginRateLimiter, validate(loginSchema), authController.login);

export const authRoutes = router;