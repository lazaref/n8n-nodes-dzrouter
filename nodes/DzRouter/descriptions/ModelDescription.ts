import type { INodeProperties } from 'n8n-workflow';
import { modelLocator } from './shared';

export const modelOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['model'] } },
		options: [
			{
				name: 'Find Cheapest',
				value: 'getCheapest',
				description: 'Find the cheapest model that matches your filters',
				action: 'Find the cheapest model',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Get a model’s details and prices',
				action: 'Get a model',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'List models from the DzRouter catalog',
				action: 'Get many models',
			},
		],
		default: 'getAll',
	},
];

const filters = (operation: string[]): INodeProperties => ({
	displayName: 'Filters',
	name: 'filters',
	type: 'collection',
	placeholder: 'Add Filter',
	default: {},
	displayOptions: { show: { resource: ['model'], operation } },
	options: [
		{
			displayName: 'Max Input Price',
			name: 'maxInputPrice',
			type: 'number',
			default: 250,
			typeOptions: { minValue: 0, numberPrecision: 2 },
			description: 'Maximum price in Pulses per 1M input tokens (1 Pulse = 1 DA)',
		},
		{
			displayName: 'Max Output Price',
			name: 'maxOutputPrice',
			type: 'number',
			default: 1000,
			typeOptions: { minValue: 0, numberPrecision: 2 },
			description: 'Maximum price in Pulses per 1M output tokens (1 Pulse = 1 DA)',
		},
		{
			displayName: 'Min Context Length',
			name: 'minContextLength',
			type: 'number',
			default: 128000,
			typeOptions: { minValue: 0 },
			description: 'Minimum context window, in tokens',
		},
		{
			displayName: 'Provider Names or IDs',
			name: 'providers',
			type: 'multiOptions',
			typeOptions: { loadOptionsMethod: 'getProviders' },
			default: [],
			description:
				'Only models from these providers. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		},
		{
			displayName: 'Required Capabilities',
			name: 'capabilities',
			type: 'multiOptions',
			options: [
				{ name: 'Reasoning', value: 'reasoning' },
				{ name: 'Tool Calling', value: 'tools' },
				{ name: 'Vision (Images)', value: 'vision' },
			],
			default: [],
			description: 'Only models that support all of these',
		},
		{
			displayName: 'Search',
			name: 'search',
			type: 'string',
			default: '',
			placeholder: 'e.g. gemini flash',
			description: 'Only models whose ID or name contains all of these words',
		},
	],
});

export const modelFields: INodeProperties[] = [
	modelLocator(['model'], ['get']),
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		displayOptions: { show: { resource: ['model'], operation: ['getAll'] } },
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		default: 50,
		typeOptions: { minValue: 1 },
		displayOptions: { show: { resource: ['model'], operation: ['getAll'], returnAll: [false] } },
		description: 'Max number of results to return',
	},
	{
		displayName: 'Price Basis',
		name: 'priceBasis',
		type: 'options',
		options: [
			{
				name: 'Blended (3 Input : 1 Output)',
				value: 'blended',
				description: 'Typical chat traffic: three input tokens for every output token',
			},
			{ name: 'Input Price', value: 'input' },
			{ name: 'Output Price', value: 'output' },
		],
		default: 'blended',
		displayOptions: { show: { resource: ['model'], operation: ['getCheapest'] } },
		description: 'Which price to compare models on',
	},
	filters(['getAll', 'getCheapest']),
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: { resource: ['model'], operation: ['getAll'] } },
		options: [
			{
				displayName: 'Sort By',
				name: 'sortBy',
				type: 'options',
				options: [
					{ name: 'Context Length (Largest First)', value: 'context' },
					{ name: 'Input Price (Cheapest First)', value: 'inputPrice' },
					{ name: 'Name', value: 'name' },
					{ name: 'Output Price (Cheapest First)', value: 'outputPrice' },
					{ name: 'Recommended', value: 'rank', description: 'DzRouter’s catalog order' },
				],
				default: 'rank',
			},
		],
	},
];
