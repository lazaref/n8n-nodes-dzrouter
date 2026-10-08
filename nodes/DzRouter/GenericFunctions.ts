import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	INodeListSearchResult,
	INodePropertyOptions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

export const CREDENTIALS_TYPE = 'dzRouterApi';

type Context = IExecuteFunctions | ILoadOptionsFunctions;

/** One model as returned by DzRouter's OpenAI-compatible GET /v1/models */
export interface DzRouterModel {
	id: string;
	name?: string;
	owned_by?: string;
	description?: string | null;
	context_length?: number | null;
	max_output_tokens?: number | null;
	capabilities?: { vision?: boolean; reasoning?: boolean; tools?: boolean };
	/** Pulses per token, as strings (1 Pulse = 1 DA) */
	pricing?: { unit?: string; prompt?: string; completion?: string; input_cache_read?: string };
}

export interface DzRouterResponse {
	body: IDataObject;
	headers: Record<string, string | string[] | undefined>;
}

/** Hints shown under the error message, keyed by HTTP status */
const ERROR_HINTS: Record<number, string> = {
	401: 'Check the API key in your DzRouter credential. Keys are created in the DzRouter console under API keys.',
	402: 'Your DzRouter balance is empty. Top up at https://dzrouter.com/app (Stripe, Edahabia/CIB or BaridiMob).',
	404: 'The model or endpoint was not found. Pick the model from the list to be sure the ID is valid.',
	429: 'Rate limit reached for this key. Add a Wait node between batches or enable "Retry On Fail" in the node settings.',
	502: 'The upstream model provider returned an error. Retry, or choose another model.',
	503: 'DzRouter is temporarily unavailable. Retry in a few seconds.',
};

function baseUrl(credentials: IDataObject): string {
	return String(credentials.url ?? 'https://dzrouter.com/v1').replace(/\/+$/, '');
}

/**
 * Authenticated request to the DzRouter API. Returns body and headers, because
 * billable calls report their cost in x-dzrouter-* response headers.
 */
export async function dzRouterRequest(
	this: Context,
	method: IHttpRequestMethods,
	path: string,
	body?: IDataObject,
	itemIndex = 0,
	timeout?: number,
): Promise<DzRouterResponse> {
	const credentials = await this.getCredentials(CREDENTIALS_TYPE);
	const options: IHttpRequestOptions = {
		method,
		baseURL: baseUrl(credentials),
		url: path,
		headers: { 'X-DzRouter-Client': 'n8n' },
		json: true,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
	};
	if (body) options.body = body;
	if (timeout) options.timeout = timeout;

	const response = (await this.helpers.httpRequestWithAuthentication.call(
		this,
		CREDENTIALS_TYPE,
		options,
	)) as { body: IDataObject; headers: Record<string, string>; statusCode: number };

	if (response.statusCode >= 400) {
		const errorBody = (
			typeof response.body === 'object' && response.body !== null ? response.body : { message: String(response.body) }
		) as JsonObject;
		const apiError = (errorBody.error ?? errorBody) as JsonObject;
		const message =
			typeof apiError.message === 'string' ? apiError.message : `DzRouter returned HTTP ${response.statusCode}`;
		throw new NodeApiError(this.getNode(), errorBody, {
			message,
			description: ERROR_HINTS[response.statusCode],
			httpCode: String(response.statusCode),
			itemIndex,
		});
	}
	return { body: response.body, headers: response.headers ?? {} };
}

function headerNumber(headers: DzRouterResponse['headers'], name: string): number | undefined {
	const raw = headers[name];
	const value = Array.isArray(raw) ? raw[0] : raw;
	if (value === undefined || value === '') return undefined;
	const n = Number(value);
	return Number.isFinite(n) ? n : undefined;
}

/** Cost of the call in Pulses, DzRouter's AI credit (1 Pulse = 1 DA), from the response headers */
export function costFromHeaders(headers: DzRouterResponse['headers']): IDataObject {
	const pulses = headerNumber(headers, 'x-dzrouter-cost-pulses');
	return pulses === undefined ? {} : { pulses };
}

export async function getModels(this: Context): Promise<DzRouterModel[]> {
	const { body } = await dzRouterRequest.call(this, 'GET', '/models');
	return (body.data as DzRouterModel[] | undefined) ?? [];
}

/** Pulses per 1M tokens, rounded for display */
export function perMillion(perToken: string | undefined): number {
	const n = Number(perToken ?? 0) * 1e6;
	return Number.isFinite(n) ? Math.round(n * 10000) / 10000 : 0;
}

function formatContext(tokens: number | null | undefined): string {
	if (!tokens) return '';
	return tokens >= 1e6 ? `${+(tokens / 1e6).toFixed(1)}M ctx` : `${Math.round(tokens / 1000)}K ctx`;
}

export function modelSummary(model: DzRouterModel): string {
	const parts = [
		`${perMillion(model.pricing?.prompt)} in / ${perMillion(model.pricing?.completion)} out Pulses per 1M tokens`,
		formatContext(model.context_length),
	];
	const caps = model.capabilities ?? {};
	const flags = [caps.vision && 'vision', caps.tools && 'tools', caps.reasoning && 'reasoning'].filter(Boolean);
	if (flags.length) parts.push(flags.join(', '));
	return parts.filter(Boolean).join(' · ');
}

/** Searchable model list for resource locators */
export async function searchModels(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
	const models = await getModels.call(this);
	const terms = (filter ?? '').toLowerCase().split(/\s+/).filter(Boolean);
	const results = models
		.filter((m) => {
			const haystack = `${m.id} ${m.name ?? ''} ${m.owned_by ?? ''}`.toLowerCase();
			return terms.every((t) => haystack.includes(t));
		})
		.map((m) => ({
			name: m.name && m.name !== m.id ? `${m.name} (${m.id})` : m.id,
			value: m.id,
			description: modelSummary(m),
			url: `https://dzrouter.com/en/models/${encodeURI(m.id)}`,
		}));
	return { results };
}

/** Distinct providers, for the Get Many filter */
export async function getProviders(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const models = await getModels.call(this);
	const counts = new Map<string, number>();
	for (const m of models) {
		const provider = m.owned_by ?? 'other';
		counts.set(provider, (counts.get(provider) ?? 0) + 1);
	}
	return [...counts.entries()]
		.sort((a, b) => a[0].localeCompare(b[0]))
		.map(([provider, count]) => ({ name: `${provider} (${count})`, value: provider }));
}

/**
 * Pull the first JSON object or array out of a model reply. Models often wrap
 * JSON in ```json fences or add a sentence before it.
 */
export function parseJsonReply(this: IExecuteFunctions, text: string, itemIndex: number): IDataObject {
	const cleaned = text.replace(/```(?:json)?/gi, '').trim();
	const candidates = [cleaned];
	const start = cleaned.search(/[[{]/);
	if (start > 0) candidates.push(cleaned.slice(start));
	for (const candidate of candidates) {
		const end = Math.max(candidate.lastIndexOf('}'), candidate.lastIndexOf(']'));
		try {
			const parsed = JSON.parse(end >= 0 ? candidate.slice(0, end + 1) : candidate) as unknown;
			if (Array.isArray(parsed)) return { items: parsed } as IDataObject;
			if (parsed && typeof parsed === 'object') return parsed as IDataObject;
		} catch {
			// try the next candidate
		}
	}
	throw new NodeOperationError(this.getNode(), 'The model did not return valid JSON', {
		itemIndex,
		description: `Reply was: ${text.slice(0, 300)}. Try a more capable model, or lower the temperature.`,
	});
}

export interface ChatMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

export interface ChatResult {
	text: string;
	reasoning?: string;
	model: string;
	finishReason?: string;
	usage: IDataObject;
	cost: IDataObject;
	raw: IDataObject;
}

/** POST /chat/completions and normalise the reply */
export async function createChatCompletion(
	this: IExecuteFunctions,
	itemIndex: number,
	body: IDataObject & { model: string; messages: ChatMessage[] },
	timeout?: number,
): Promise<ChatResult> {
	const { body: raw, headers } = await dzRouterRequest.call(
		this,
		'POST',
		'/chat/completions',
		body,
		itemIndex,
		timeout,
	);
	const choices = (raw.choices as IDataObject[] | undefined) ?? [];
	const first = choices[0] ?? {};
	const message = (first.message as IDataObject | undefined) ?? {};
	const usage = (raw.usage as IDataObject | undefined) ?? {};
	const reasoning = message.reasoning_content ?? message.reasoning;
	return {
		text: typeof message.content === 'string' ? message.content : '',
		reasoning: typeof reasoning === 'string' && reasoning ? reasoning : undefined,
		model: String(raw.model ?? body.model),
		finishReason: first.finish_reason as string | undefined,
		usage: {
			promptTokens: usage.prompt_tokens ?? 0,
			completionTokens: usage.completion_tokens ?? 0,
			totalTokens: usage.total_tokens ?? 0,
		},
		cost: costFromHeaders(headers),
		raw,
	};
}
