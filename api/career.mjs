import { handleCareer } from '../server/career.mjs';

export const GET = request => handleCareer(request);
