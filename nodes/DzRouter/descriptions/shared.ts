import type { INodeProperties } from 'n8n-workflow';

export const DEFAULT_MODEL = 'openai/gpt-4o-mini';

/** Model picker: searchable list of the live DzRouter catalog, or a typed ID */
export function modelLocator(resource: string[], operation?: string[]): INodeProperties {
	return {
		displayName: 'Model',
		name: 'model',
		type: 'resourceLocator',
		default: { mode: 'list', value: DEFAULT_MODEL },
		required: true,
		description: 'The model to use. Prices are per 1M tokens, billed from your DzRouter balance.',
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
		displayOptions: { show: operation ? { resource, operation } : { resource } },
	};
}

/** Model sampling options shared by the Chat and Text resources (alphabetical, as n8n requires) */
export const temperatureOption: INodeProperties = {
	displayName: 'Sampling Temperature',
	name: 'temperature',
	type: 'number',
	default: 0.7,
	typeOptions: { minValue: 0, maxValue: 2, numberPrecision: 1 },
	description:
		'Controls randomness. Lower values give more focused, deterministic replies; higher values more varied ones.',
};

export const maxTokensOption: INodeProperties = {
	displayName: 'Maximum Number of Tokens',
	name: 'maxTokens',
	type: 'number',
	default: 1024,
	typeOptions: { minValue: 1 },
	description: 'The maximum number of tokens to generate. You are only billed for tokens actually generated.',
};

export const timeoutOption: INodeProperties = {
	displayName: 'Timeout',
	name: 'timeout',
	type: 'number',
	default: 120000,
	typeOptions: { minValue: 1000 },
	description: 'Maximum time to wait for the reply, in milliseconds',
};
