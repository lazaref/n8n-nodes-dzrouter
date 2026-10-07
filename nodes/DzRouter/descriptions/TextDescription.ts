import type { INodeProperties } from 'n8n-workflow';
import { maxTokensOption, modelLocator, timeoutOption } from './shared';

const show = (operation: string[]) => ({ show: { resource: ['text'], operation } });

/** Text tasks run at temperature 0 by default: they should be repeatable */
const textTemperature: INodeProperties = {
	displayName: 'Sampling Temperature',
	name: 'temperature',
	type: 'number',
	default: 0,
	typeOptions: { minValue: 0, maxValue: 2, numberPrecision: 1 },
	description: 'Controls randomness. 0 gives the most consistent results for the same input.',
};

export const textOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['text'] } },
		options: [
			{
				name: 'Analyze Sentiment',
				value: 'sentiment',
				description: 'Detect whether text is positive, neutral or negative',
				action: 'Analyze sentiment',
			},
			{
				name: 'Classify',
				value: 'classify',
				description: 'Sort text into one of your categories',
				action: 'Classify text',
			},
			{
				name: 'Extract Data',
				value: 'extract',
				description: 'Pull structured fields out of free text',
				action: 'Extract data from text',
			},
			{
				name: 'Summarize',
				value: 'summarize',
				description: 'Write a short summary of text',
				action: 'Summarize text',
			},
			{
				name: 'Translate',
				value: 'translate',
				description: 'Translate text, including to and from Algerian Arabic (Darja)',
				action: 'Translate text',
			},
		],
		default: 'summarize',
	},
];

const ALL = ['sentiment', 'classify', 'extract', 'summarize', 'translate'];

export const textFields: INodeProperties[] = [
	modelLocator(['text'], ALL),
	{
		displayName: 'Text',
		name: 'text',
		type: 'string',
		typeOptions: { rows: 4 },
		required: true,
		default: '',
		placeholder: 'e.g. {{ $json.message }}',
		description: 'The text to process',
		displayOptions: show(ALL),
	},

	// ── Summarize ─────────────────────────────────────────────
	{
		displayName: 'Length',
		name: 'length',
		type: 'options',
		options: [
			{ name: 'One Sentence', value: 'one sentence' },
			{ name: 'Short (2–3 Sentences)', value: 'two or three sentences' },
			{ name: 'Medium (One Paragraph)', value: 'one paragraph' },
			{ name: 'Detailed', value: 'a detailed summary covering every key point' },
		],
		default: 'two or three sentences',
		displayOptions: show(['summarize']),
	},

	// ── Translate ─────────────────────────────────────────────
	{
		displayName: 'Target Language',
		name: 'targetLanguage',
		type: 'options',
		options: [
			{ name: 'Algerian Arabic (Darja)', value: 'Algerian Arabic (Darja), written in Arabic script' },
			{ name: 'Arabic (Modern Standard)', value: 'Modern Standard Arabic' },
			{ name: 'Chinese (Simplified)', value: 'Simplified Chinese' },
			{ name: 'English', value: 'English' },
			{ name: 'French', value: 'French' },
			{ name: 'German', value: 'German' },
			{ name: 'Italian', value: 'Italian' },
			{ name: 'Other', value: 'other' },
			{ name: 'Spanish', value: 'Spanish' },
			{ name: 'Tamazight (Kabyle)', value: 'Kabyle (Taqbaylit), written in Latin script' },
			{ name: 'Turkish', value: 'Turkish' },
		],
		default: 'French',
		displayOptions: show(['translate']),
	},
	{
		displayName: 'Other Language',
		name: 'customLanguage',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. Portuguese (Brazil)',
		displayOptions: { show: { resource: ['text'], operation: ['translate'], targetLanguage: ['other'] } },
	},

	// ── Classify ──────────────────────────────────────────────
	{
		displayName: 'Categories',
		name: 'categories',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. order, complaint, question, spam',
		description: 'Comma-separated list of categories to choose from',
		displayOptions: show(['classify']),
	},

	// ── Extract ───────────────────────────────────────────────
	{
		displayName: 'Fields to Extract',
		name: 'fields',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true, sortable: true },
		placeholder: 'Add Field',
		required: true,
		default: {},
		displayOptions: show(['extract']),
		options: [
			{
				displayName: 'Field',
				name: 'values',
				values: [
					{
						displayName: 'Name',
						name: 'name',
						type: 'string',
						default: '',
						placeholder: 'e.g. customerName',
						description: 'Key of the field in the output',
					},
					{
						displayName: 'Type',
						name: 'type',
						type: 'options',
						options: [
							{ name: 'Boolean', value: 'boolean' },
							{ name: 'Date (YYYY-MM-DD)', value: 'date' },
							{ name: 'List of Text', value: 'string[]' },
							{ name: 'Number', value: 'number' },
							{ name: 'Text', value: 'string' },
						],
						default: 'string',
					},
					{
						displayName: 'Description',
						name: 'description',
						type: 'string',
						default: '',
						placeholder: 'e.g. Full name of the person placing the order',
						description: 'What the field means. Clear descriptions give much better results.',
					},
				],
			},
		],
	},

	// ── Options per operation ─────────────────────────────────
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: show(['summarize']),
		options: [
			{
				displayName: 'Format',
				name: 'format',
				type: 'options',
				options: [
					{ name: 'Paragraph', value: 'paragraph' },
					{ name: 'Bullet Points', value: 'bullets' },
				],
				default: 'paragraph',
			},
			{
				displayName: 'Instructions',
				name: 'instructions',
				type: 'string',
				default: '',
				placeholder: 'e.g. Focus on prices and delivery dates',
				description: 'Extra guidance for the summary',
			},
			maxTokensOption,
			{
				displayName: 'Output Language',
				name: 'language',
				type: 'string',
				default: '',
				placeholder: 'e.g. Arabic',
				description: 'Language of the summary. Leave empty to use the language of the text.',
			},
			textTemperature,
			timeoutOption,
		],
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: show(['translate']),
		options: [
			{
				displayName: 'Instructions',
				name: 'instructions',
				type: 'string',
				default: '',
				placeholder: 'e.g. Keep product names in English',
				description: 'Extra guidance for the translation',
			},
			maxTokensOption,
			textTemperature,
			timeoutOption,
			{
				displayName: 'Tone',
				name: 'tone',
				type: 'options',
				options: [
					{ name: 'Formal', value: 'formal' },
					{ name: 'Informal', value: 'informal' },
					{ name: 'Same as Original', value: '' },
				],
				default: '',
			},
		],
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: show(['classify']),
		options: [
			{
				displayName: 'Allow Multiple Categories',
				name: 'multiple',
				type: 'boolean',
				default: false,
				description: 'Whether the text can belong to more than one category',
			},
			{
				displayName: 'Fallback Category',
				name: 'fallback',
				type: 'string',
				default: 'other',
				description: 'Category to use when none of the categories fit. Leave empty to always pick one.',
			},
			{
				displayName: 'Include Reason',
				name: 'includeReason',
				type: 'boolean',
				default: false,
				description: 'Whether to add a one-sentence explanation of the choice',
			},
			{
				displayName: 'Instructions',
				name: 'instructions',
				type: 'string',
				default: '',
				placeholder: 'e.g. "order" means the customer wants to buy something',
				description: 'Extra guidance, such as what each category means',
			},
			maxTokensOption,
			textTemperature,
			timeoutOption,
		],
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: show(['extract']),
		options: [
			{
				displayName: 'Instructions',
				name: 'instructions',
				type: 'string',
				default: '',
				placeholder: 'e.g. Phone numbers are Algerian; format them as +213…',
				description: 'Extra guidance for the extraction',
			},
			maxTokensOption,
			textTemperature,
			timeoutOption,
		],
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: show(['sentiment']),
		options: [
			{
				displayName: 'Categories',
				name: 'categories',
				type: 'string',
				default: 'positive, neutral, negative',
				description: 'Comma-separated sentiment labels to choose from',
			},
			{
				displayName: 'Include Emotions',
				name: 'includeEmotions',
				type: 'boolean',
				default: false,
				description: 'Whether to also list the emotions detected, such as anger or joy',
			},
			maxTokensOption,
			textTemperature,
			timeoutOption,
		],
	},
];
