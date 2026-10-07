import type { INodeType, INodeTypeDescription, ISupplyDataFunctions } from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';
import { supplyModel } from '@n8n/ai-node-sdk';

import { searchModels } from '../DzRouter/GenericFunctions';
import { DEFAULT_MODEL } from '../DzRouter/descriptions/shared';

type ModelOptions = {
	frequencyPenalty?: number;
	maxRetries?: number;
	maxTokens?: number;
	presencePenalty?: number;
	reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high';
	responseFormat?: 'text' | 'json_object';
	temperature?: number;
	timeout?: number;
	topP?: number;
};

export class DzRouterChatModel implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'DzRouter Chat Model',
		name: 'dzRouterChatModel',
		icon: { light: 'file:../../icons/dzrouter.svg', dark: 'file:../../icons/dzrouter.dark.svg' },
		group: ['transform'],
		version: [1],
		subtitle: '={{ $parameter["model"]?.value || $parameter["model"] }}',
		description: 'Use any DzRouter model (GPT, Claude, Gemini, DeepSeek…) in AI Agents and chains',
		defaults: {
			name: 'DzRouter Chat Model',
		},
		codex: {
			categories: ['assistant'],
			subcategories: {
				AI: ['Language Models', 'Root Nodes'],
				'Language Models': ['Chat Models (Recommended)'],
			},
			resources: {
				primaryDocumentation: [{ url: 'https://github.com/lazaref/n8n-nodes-dzrouter#dzrouter-chat-model' }],
			},
		},

		inputs: [],

		outputs: [NodeConnectionTypes.AiLanguageModel],
		outputNames: ['Model'],
		credentials: [
			{
				name: 'dzRouterApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Model',
				name: 'model',
				type: 'resourceLocator',
				default: { mode: 'list', value: DEFAULT_MODEL },
				required: true,
				description:
					'The model that generates the replies. For AI Agents, pick one with tool calling support.',
				modes: [
					{
						displayName: 'From List',
						name: 'list',
						type: 'list',
						typeOptions: {
							searchListMethod: 'searchModels',
							searchable: true,
						},
					},
					{
						displayName: 'ID',
						name: 'id',
						type: 'string',
						placeholder: 'e.g. openai/gpt-4o-mini',
					},
				],
			},
			{
				displayName: 'Options',
				name: 'options',
				placeholder: 'Add Option',
				description: 'Additional options to add',
				type: 'collection',
				default: {},
				options: [
					{
						displayName: 'Frequency Penalty',
						name: 'frequencyPenalty',
						type: 'number',
						default: 0,
						typeOptions: { minValue: -2, maxValue: 2, numberPrecision: 1 },
						description: 'Positive values make the model less likely to repeat the same lines',
					},
					{
						displayName: 'Max Retries',
						name: 'maxRetries',
						type: 'number',
						default: 2,
						typeOptions: { minValue: 0 },
						description: 'How many times to retry a failed request',
					},
					{
						displayName: 'Maximum Number of Tokens',
						name: 'maxTokens',
						type: 'number',
						default: 1024,
						typeOptions: { minValue: 1 },
						description: 'The maximum number of tokens to generate per reply',
					},
					{
						displayName: 'Presence Penalty',
						name: 'presencePenalty',
						type: 'number',
						default: 0,
						typeOptions: { minValue: -2, maxValue: 2, numberPrecision: 1 },
						description: 'Positive values encourage the model to talk about new topics',
					},
					{
						displayName: 'Reasoning Effort',
						name: 'reasoningEffort',
						type: 'options',
						options: [
							{ name: 'High', value: 'high' },
							{ name: 'Low', value: 'low' },
							{ name: 'Medium', value: 'medium' },
							{ name: 'Minimal', value: 'minimal' },
							{ name: 'None', value: 'none' },
						],
						default: 'medium',
						description:
							'How much the model thinks before answering. Only reasoning models use it; more effort costs more output tokens.',
					},
					{
						displayName: 'Response Format',
						name: 'responseFormat',
						type: 'options',
						options: [
							{ name: 'Text', value: 'text' },
							{ name: 'JSON Object', value: 'json_object' },
						],
						default: 'text',
						description:
							'JSON mode needs the word "JSON" in the prompt and a model that supports it',
					},
					{
						displayName: 'Sampling Temperature',
						name: 'temperature',
						type: 'number',
						default: 0.7,
						typeOptions: { minValue: 0, maxValue: 2, numberPrecision: 1 },
						description:
							'Controls randomness. Lower values give more focused, deterministic replies; higher values more varied ones.',
					},
					{
						displayName: 'Timeout',
						name: 'timeout',
						type: 'number',
						default: 120000,
						typeOptions: { minValue: 1000 },
						description: 'Maximum time to wait for a reply, in milliseconds',
					},
					{
						displayName: 'Top P',
						name: 'topP',
						type: 'number',
						default: 1,
						typeOptions: { minValue: 0, maxValue: 1, numberPrecision: 2 },
						description:
							'Nucleus sampling: the model considers only the tokens making up this probability mass',
					},
				],
			},
		],
	};

	methods = {
		listSearch: { searchModels },
	};

	async supplyData(this: ISupplyDataFunctions, itemIndex: number) {
		const credentials = await this.getCredentials('dzRouterApi');
		const model = this.getNodeParameter('model', itemIndex, '', { extractValue: true }) as string;
		const options = this.getNodeParameter('options', itemIndex, {}) as ModelOptions;

		return supplyModel(this, {
			type: 'openai',
			baseUrl: String(credentials.url ?? 'https://dzrouter.com/v1').replace(/\/+$/, ''),
			apiKey: credentials.apiKey as string,
			model,
			temperature: options.temperature,
			maxTokens: options.maxTokens,
			topP: options.topP,
			frequencyPenalty: options.frequencyPenalty,
			presencePenalty: options.presencePenalty,
			reasoning: options.reasoningEffort ? { effort: options.reasoningEffort } : undefined,
			timeout: options.timeout,
			maxRetries: options.maxRetries,
			defaultHeaders: { 'X-DzRouter-Client': 'n8n' },
			additionalParams:
				options.responseFormat === 'json_object' ? { response_format: { type: 'json_object' } } : undefined,
		});
	}
}
