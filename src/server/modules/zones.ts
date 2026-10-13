import { Elysia } from 'elysia';

import { authPlugin } from '../auth/plugin';
import { listZones } from '../db/zones';

/** Ciudades y colonias disponibles (catálogo geográfico). */
export const zonesModule = new Elysia({ name: 'zones' }).use(authPlugin).get('/zones', () => listZones(), { auth: true });
