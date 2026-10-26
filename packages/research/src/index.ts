import type { ResearchRequest, ResearchResult } from '../../contracts/src/index.ts';
export async function research(_request: ResearchRequest): Promise<ResearchResult> {
  throw new Error('NOT_IMPLEMENTED: research belongs to the Research development chat');
}
