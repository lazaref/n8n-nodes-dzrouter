import type { INodeProperties } from 'n8n-workflow';

export const accountOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['account'] } },
		options: [
			{
				name: 'Get Balance',
				value: 'getBalance',
				description: 'Get the balance, spend and rate limit of the API key (free, never billed)',
				action: 'Get the account balance',
			},
		],
		default: 'getBalance',
	},
];

export const accountFields: INodeProperties[] = [
	{
		displayName:
			'Tip: put this before an expensive step together with an If node to stop a workflow when the balance runs low',
		name: 'balanceNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: { resource: ['account'], operation: ['getBalance'] } },
	},
];
