import { NodeConnectionTypes as N8nConnectionTypes } from 'n8n-workflow';

/*
 * n8n-workflow's NodeConnectionTypes arrived in n8n 1.85 (March 2025). On older n8n it imports
 * as undefined, so this stands in with the same string values those releases understand.
 * Only the members these nodes use are provided.
 */
export const NodeConnectionTypes =
	N8nConnectionTypes ??
	({ Main: 'main', AiLanguageModel: 'ai_languageModel' } as unknown as typeof N8nConnectionTypes);
