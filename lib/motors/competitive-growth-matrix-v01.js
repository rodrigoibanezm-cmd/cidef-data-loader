import { buildCompetitiveGrowthMatrix } from '../competitive-growth-matrix/buildCompetitiveGrowthMatrix.js';

export async function competitiveGrowthMatrixV01(input = {}) {
  return buildCompetitiveGrowthMatrix(input);
}
