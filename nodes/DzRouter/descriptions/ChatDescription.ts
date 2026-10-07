import type { INodeProperties } from 'n8n-workflow';
import { maxTokensOption, modelLocator, temperatureOption, timeoutOption } from './shared';

const showChat = { show: { resource: ['chat'], operation: ['message'] } };

export const chatOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['chat'] } },
		options: [
			{
				name: 'Message a Model',
				value: 'message',
				description: 'Send a conversation to any model and get its reply',
				action: 'Message a model',
			},
		],
		default: 'message',
	},
];

export const chatFields: INodeProperties[] = [
	modelLocator(['chat'], ['message']),
	{
		displayName: 'Messages',
		name: 'messages',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true, sortable: true },
		placeholder: 'Add Message',
		default: { values: [{ role: 'user', content: '' }] },
		displayOptions: showChat,
		options: [
			{
				displayName: 'Message',
				name: 'values',
				values: [
					{
						displayName: 'Role',
						name: 'role',
						type: 'options',
						options: [
							{
								name: 'Assistant',
								value: 'assistant',
								description: 'An earlier reply from the model, to give it conversation history',
							},
							{
								name: 'System',
								value: 'system',
								description: 'Instructions that set the model’s behaviour',
							},
							{ name: 'User', value: 'user', description: 'A message from the user' },
						],
						default: 'user',
					},
					{
						displayName: 'Content',
						name: 'content',
						type: 'string',
						typeOptions: { rows: 3 },
						default: '',
						placeholder: 'e.g. Write a short welcome message for new customers',
					},
				],
			},
		],
	},
	{
		displayName: 'Simplify Output',
		name: 'simplify',
		type: 'boolean',
		default: true,
		displayOptions: showChat,
		description:
			'Whether to return only the reply text, usage and cost instead of the full OpenAI-compatible response',
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: showChat,
		options: [
			{
				displayName: 'Frequency Penalty',
				name: 'frequencyPenalty',
				type: 'number',
				default: 0,
				typeOptions: { minValue: -2, maxValue: 2, numberPrecision: 1 },
				description: 'Positive values make the model less likely to repeat the same lines',
			},
			maxTokensOption,
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
					{
						name: 'JSON Object',
						value: 'json_object',
						description: 'Ask for valid JSON and parse it into the "JSON" output field',
					},
				],
				default: 'text',
				description:
					'JSON mode needs the word "JSON" in your messages and a model that supports it',
			},
			temperatureOption,
			{
				displayName: 'Seed',
				name: 'seed',
				type: 'number',
				default: 0,
				description: 'Ask for repeatable output. Supported by some models only.',
			},
			{
				displayName: 'Stop Sequences',
				name: 'stop',
				type: 'string',
				default: '',
				placeholder: 'e.g. END, ###',
				description: 'Comma-separated sequences where the model stops generating',
			},
			timeoutOption,
			{
				displayName: 'Top P',
				name: 'topP',
				type: 'number',
				default: 1,
				typeOptions: { minValue: 0, maxValue: 1, numberPrecision: 2 },
				description: 'Nucleus sampling: the model considers only the tokens making up this probability mass',
			},
		],
	},
];
