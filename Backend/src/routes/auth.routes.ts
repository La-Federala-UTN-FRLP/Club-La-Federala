import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { validate } from '../middlewares/validation.middleware';
import { loginSchema } from '../validations/auth.validation';
import { loginRateLimiter } from '../middlewares/loginRateLimit.middleware';
import { loginObservation } from '../middlewares/loginObservation.middleware';

const router = Router();

// Rutas Públicas
// Observación temporal pasiva; el limiter sigue contando los bodies inválidos.
router.post('/login', loginObservation, loginRateLimiter, validate(loginSchema), authController.login);

export const authRoutes = router;
