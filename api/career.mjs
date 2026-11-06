import { authenticated } from '../server/auth.mjs';
import { handleCareer } from '../server/career.mjs';

export const GET = authenticated(request => handleCareer(request));
