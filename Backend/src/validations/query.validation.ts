import { z } from 'zod';

/**
 * Booleano HTTP de query: solo el texto "true" o "false", en minúscula, y el resultado es un
 * boolean. Rechaza "1", "0", "yes", "TRUE", "", y los arrays de una query repetida.
 *
 * No usar z.coerce.boolean(): convierte cualquier string no vacío en true ("false" y "0"
 * incluidos). Los IDs de query usan positiveIntString (params.validation.ts), igual que los
 * IDs de path.
 */
export const booleanQuery = z.enum(['true', 'false']).transform((value) => value === 'true');
