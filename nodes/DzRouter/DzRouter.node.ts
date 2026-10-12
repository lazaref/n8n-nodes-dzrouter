import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

import { NodeConnectionTypes } from '../connections';

import { accountFields, accountOperations } from './descriptions/AccountDescription';
import { chatFields, chatOperations } from './descriptions/ChatDescription';
import { modelFields, modelOperations } from './descriptions/ModelDescription';
import { textFields, textOperations } from './descriptions/TextDescription';
import type { ChatMessage, DzRouterModel } from './GenericFunctions';
import {
	createChatCompletion,
	dzRouterRequest,
	getModels,
	getProviders,
	parseJsonReply,
	perMillion,
	searchModels,
} from './GenericFunctions';
import { runTextOperation } from './TextFunctions';

function simplifyModel(model: DzRouterModel): IDataObject {
	const input = perMillion(model.pricing?.prompt);
	const output = perMillion(model.pricing?.completion);
	const out: IDataObject = {
		id: model.id,
		name: model.name ?? model.id,
		provider: model.owned_by ?? null,
		description: model.description ?? null,
		contextLength: model.context_length ?? null,
		maxOutputTokens: model.max_output_tokens ?? null,
		vision: !!model.capabilities?.vision,
		tools: !!model.capabilities?.tools,
		reasoning: !!model.capabilities?.reasoning,
		// prices in Pulses, DzRouter's AI credit (1 Pulse = 1 DA)
		inputPerMillionPulses: input,
		outputPerMillionPulses: output,
		cacheReadPerMillionPulses: perMillion(model.pricing?.input_cache_read),
	};
	out.url = `https://dzrouter.com/en/models/${encodeURI(model.id)}`;
	return out;
}

function filterModels(models: DzRouterModel[], filters: IDataObject): DzRouterModel[] {
	const providers = (filters.providers as string[] | undefined) ?? [];
	const capabilities = (filters.capabilities as Array<'vision' | 'tools' | 'reasoning'> | undefined) ?? [];
	const terms = String(filters.search ?? '')
		.toLowerCase()
		.split(/\s+/)
		.filter(Boolean);
	return models.filter((m) => {
		if (providers.length && !providers.includes(m.owned_by ?? '')) return false;
		if (capabilities.some((c) => !m.capabilities?.[c])) return false;
		if (filters.maxInputPrice !== undefined && perMillion(m.pricing?.prompt) > (filters.maxInputPrice as number))
			return false;
		if (filters.maxOutputPrice !== undefined && perMillion(m.pricing?.completion) > (filters.maxOutputPrice as number))
			return false;
		if (filters.minContextLength !== undefined && (m.context_length ?? 0) < (filters.minContextLength as number))
			return false;
		const haystack = `${m.id} ${m.name ?? ''}`.toLowerCase();
		return terms.every((t) => haystack.includes(t));
	});
}

export class DzRouter implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'DzRouter',
		name: 'dzRouter',
		icon: { light: 'file:../../icons/dzrouter.svg', dark: 'file:../../icons/dzrouter.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Use 200+ AI models (GPT, Claude, Gemini, DeepSeek, Llama…) through one DzRouter API key',
		defaults: {
			name: 'DzRouter',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'dzRouterApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Account', value: 'account' },
					{ name: 'Chat', value: 'chat' },
					{ name: 'Model', value: 'model' },
					{ name: 'Text', value: 'text' },
				],
				default: 'chat',
			},
			...chatOperations,
			...chatFields,
			...textOperations,
			...textFields,
			...modelOperations,
			...modelFields,
			...accountOperations,
			...accountFields,
		],
	};

	methods = {
		listSearch: { searchModels },
		loadOptions: { getProviders },
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		// fetched at most once per execution, only by operations that need it
		let catalog: DzRouterModel[] | undefined;
		const loadCatalog = async () => (catalog ??= await getModels.call(this));

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;
				const results: IDataObject[] = [];

				if (resource === 'chat' && operation === 'message') {
					const model = this.getNodeParameter('model', i, '', { extractValue: true }) as string;
					const collection = this.getNodeParameter('messages', i, {}) as IDataObject;
					const messages = ((collection.values as ChatMessage[] | undefined) ?? []).filter((m) =>
						m.content?.trim(),
					);
					if (!messages.length) {
						throw new NodeOperationError(this.getNode(), 'Add at least one message with content', {
							itemIndex: i,
						});
					}
					const simplify = this.getNodeParameter('simplify', i, true) as boolean;
					const options = this.getNodeParameter('options', i, {}) as IDataObject;

					const body: IDataObject & { model: string; messages: ChatMessage[] } = { model, messages };
					if (options.temperature !== undefined) body.temperature = options.temperature;
					if (options.maxTokens) body.max_tokens = options.maxTokens;
					if (options.topP !== undefined) body.top_p = options.topP;
					if (options.frequencyPenalty) body.frequency_penalty = options.frequencyPenalty;
					if (options.presencePenalty) body.presence_penalty = options.presencePenalty;
					if (options.reasoningEffort) body.reasoning_effort = options.reasoningEffort;
					if (options.seed !== undefined) body.seed = options.seed;
					const jsonMode = options.responseFormat === 'json_object';
					if (jsonMode) body.response_format = { type: 'json_object' };
					const stop = String(options.stop ?? '')
						.split(',')
						.map((s) => s.trim())
						.filter(Boolean);
					if (stop.length) body.stop = stop;

					const result = await createChatCompletion.call(this, i, body, options.timeout as number | undefined);
					if (!simplify) {
						results.push({ ...result.raw, cost: result.cost });
					} else {
						const out: IDataObject = { text: result.text };
						if (jsonMode) out.json = parseJsonReply.call(this, result.text, i);
						if (result.reasoning) out.reasoning = result.reasoning;
						Object.assign(out, {
							model: result.model,
							finishReason: result.finishReason ?? null,
							usage: result.usage,
							cost: result.cost,
						});
						results.push(out);
					}
				} else if (resource === 'text') {
					const model = this.getNodeParameter('model', i, '', { extractValue: true }) as string;
					results.push(await runTextOperation.call(this, operation, i, model));
				} else if (resource === 'model') {
					const options = this.getNodeParameter('options', i, {}) as IDataObject;
					const models = await loadCatalog();

					if (operation === 'get') {
						const id = this.getNodeParameter('model', i, '', { extractValue: true }) as string;
						const model =
							models.find((m) => m.id === id) ?? models.find((m) => m.id.toLowerCase() === id.toLowerCase());
						if (!model) {
							throw new NodeOperationError(this.getNode(), `Model "${id}" is not in the DzRouter catalog`, {
								itemIndex: i,
								description: 'Pick the model from the list, or use Model → Get Many to see what is available.',
							});
						}
						results.push(simplifyModel(model));
					} else if (operation === 'getAll' || operation === 'getCheapest') {
						const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
						const matches = filterModels(models, filters);

						if (operation === 'getCheapest') {
							const basis = this.getNodeParameter('priceBasis', i, 'blended') as string;
							const price = (m: DzRouterModel) => {
								const input = perMillion(m.pricing?.prompt);
								const output = perMillion(m.pricing?.completion);
								return basis === 'input' ? input : basis === 'output' ? output : (3 * input + output) / 4;
							};
							// free and zero-priced entries are routers or placeholders, not real offers
							const priced = matches.filter((m) => price(m) > 0).sort((a, b) => price(a) - price(b));
							if (!priced.length) {
								throw new NodeOperationError(this.getNode(), 'No model matches these filters', {
									itemIndex: i,
									description: 'Relax the price, context or capability filters.',
								});
							}
							results.push(simplifyModel(priced[0]));
						} else {
							const sortBy = (options.sortBy as string | undefined) ?? 'rank';
							const sorted = [...matches];
							if (sortBy === 'inputPrice')
								sorted.sort((a, b) => perMillion(a.pricing?.prompt) - perMillion(b.pricing?.prompt));
							else if (sortBy === 'outputPrice')
								sorted.sort((a, b) => perMillion(a.pricing?.completion) - perMillion(b.pricing?.completion));
							else if (sortBy === 'context')
								sorted.sort((a, b) => (b.context_length ?? 0) - (a.context_length ?? 0));
							else if (sortBy === 'name')
								sorted.sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id));

							const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;
							const limit = returnAll ? sorted.length : (this.getNodeParameter('limit', i, 50) as number);
							results.push(...sorted.slice(0, limit).map((m) => simplifyModel(m)));
						}
					}
				} else if (resource === 'account' && operation === 'getBalance') {
					const { body } = await dzRouterRequest.call(this, 'GET', '/key', undefined, i);
					const data = (body.data as IDataObject | undefined) ?? {};
					results.push({
						label: data.label ?? null,
						keyPrefix: data.prefix ?? null,
						balancePulses: data.balance ?? 0,
						usagePulses: data.usage ?? 0,
						rateLimit: data.rate_limit ?? null,
						createdAt: data.created_at ?? null,
						lastUsedAt: data.last_used_at ?? null,
					});
				} else {
					throw new NodeOperationError(
						this.getNode(),
						`The operation "${operation}" is not supported for "${resource}"`,
						{ itemIndex: i },
					);
				}

				returnData.push(...results.map((json) => ({ json, pairedItem: { item: i } })));
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				// both constructors hand back an error that is already of their own type unchanged
				if (error instanceof NodeApiError) throw new NodeApiError(this.getNode(), error as unknown as JsonObject);
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
