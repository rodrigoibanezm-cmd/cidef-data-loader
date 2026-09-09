import { buildCompetitiveShareTransfer } from '../competitive-share-transfer/buildCompetitiveShareTransfer.js';

export const ENGINE_NAME = 'competitive_share_transfer_v01';
export const ENGINE_VERSION = '0.1';

export async function competitiveShareTransferV01(input = {}) {
  return buildCompetitiveShareTransfer(input);
}
