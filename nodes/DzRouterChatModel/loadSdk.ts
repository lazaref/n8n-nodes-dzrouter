import type { ISupplyDataFunctions, SupplyData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

export type DzModelConfig = {
	baseUrl: string;
	apiKey: string;
	model: string;
	temperature?: number;
	maxTokens?: number;
	topP?: number;
	frequencyPenalty?: number;
	presencePenalty?: number;
	reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high';
	timeout?: number;
	maxRetries?: number;
	responseFormat?: 'text' | 'json_object';
};

/**
 * The AI node SDK ships with n8n 2.x only. It is imported lazily, when the model is first
 * used: a top-level import made n8n 1.x refuse to load the whole package (including the
 * DzRouter node, which works on 1.x). On 1.x this explains what to use instead.
 */
export async function supplyDzRouterModel(ctx: ISupplyDataFunctions, itemIndex: number, c: DzModelConfig): Promise<SupplyData> {
	let sdk: typeof import('@n8n/ai-node-sdk');
	try {
		sdk = await import('@n8n/ai-node-sdk');
	} catch {
		throw new NodeOperationError(ctx.getNode(), 'The DzRouter Chat Model needs n8n 2.0 or newer', {
			itemIndex,
			description:
				'On this n8n version, connect n8n\'s built-in "OpenAI Chat Model" instead: create an OpenAI credential with your DzRouter API key and Base URL https://dzrouter.com/v1, then type any DzRouter model id. The DzRouter node itself works on this version.',
		});
	}
	return sdk.supplyModel(ctx, {
		type: 'openai',
		baseUrl: c.baseUrl,
		apiKey: c.apiKey,
		model: c.model,
		temperature: c.temperature,
		maxTokens: c.maxTokens,
		topP: c.topP,
		frequencyPenalty: c.frequencyPenalty,
		presencePenalty: c.presencePenalty,
		reasoning: c.reasoningEffort ? { effort: c.reasoningEffort } : undefined,
		timeout: c.timeout,
		maxRetries: c.maxRetries,
		defaultHeaders: { 'X-DzRouter-Client': 'n8n' },
		additionalParams: c.responseFormat === 'json_object' ? { response_format: { type: 'json_object' } } : undefined,
	});
}
