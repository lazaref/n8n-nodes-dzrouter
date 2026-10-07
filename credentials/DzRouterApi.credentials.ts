import type { IAuthenticateGeneric, ICredentialTestRequest, ICredentialType, Icon, INodeProperties } from 'n8n-workflow';

export class DzRouterApi implements ICredentialType {
	name = 'dzRouterApi';

	displayName = 'DzRouter API';

	icon: Icon = { light: 'file:../icons/dzrouter.svg', dark: 'file:../icons/dzrouter.dark.svg' };

	documentationUrl = 'https://dzrouter.com/en/docs';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			placeholder: 'e.g. sk-dz-…',
			description: 'Create a key in the DzRouter console under API keys',
		},
		{
			displayName: 'Base URL',
			name: 'url',
			type: 'string',
			required: true,
			default: 'https://dzrouter.com/v1',
			description: 'Only change this if you were given a different DzRouter endpoint',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	// GET /key is free and works with a zero balance, so a brand-new key tests green
	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.url.replace(/\\/+$/, "")}}',
			url: '/key',
			method: 'GET',
		},
	};
}
