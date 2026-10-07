import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import type { ChatMessage } from './GenericFunctions';
import { createChatCompletion, parseJsonReply } from './GenericFunctions';

interface ExtractField {
	name: string;
	type: 'string' | 'number' | 'boolean' | 'date' | 'string[]';
	description?: string;
}

function list(value: string): string[] {
	return value
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
}

function withInstructions(system: string, instructions: unknown): string {
	return typeof instructions === 'string' && instructions.trim()
		? `${system}\n\nAdditional instructions:\n${instructions.trim()}`
		: system;
}

/** Match a label the model returned to one of the allowed labels, ignoring case and punctuation */
function matchLabel(value: unknown, allowed: string[]): string | undefined {
	if (typeof value !== 'string') return undefined;
	const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
	const wanted = norm(value);
	return allowed.find((a) => norm(a) === wanted);
}

function coerce(value: unknown, type: ExtractField['type']): unknown {
	if (value === null || value === undefined || value === '') return null;
	switch (type) {
		case 'number': {
			const n = typeof value === 'number' ? value : Number(String(value).replace(/[^\d.,-]/g, '').replace(',', '.'));
			return Number.isFinite(n) ? n : null;
		}
		case 'boolean':
			if (typeof value === 'boolean') return value;
			return ['true', 'yes', 'oui', 'نعم', '1'].includes(String(value).trim().toLowerCase());
		case 'string[]':
			return Array.isArray(value) ? value.map(String) : list(String(value));
		default:
			return typeof value === 'string' ? value : JSON.stringify(value);
	}
}

/** Build the prompt for a Text operation, run it, and shape the result */
export async function runTextOperation(
	this: IExecuteFunctions,
	operation: string,
	itemIndex: number,
	model: string,
): Promise<IDataObject> {
	const text = this.getNodeParameter('text', itemIndex) as string;
	const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;
	if (!text.trim()) {
		throw new NodeOperationError(this.getNode(), 'The "Text" parameter is empty', { itemIndex });
	}

	let system: string;
	let expectJson = true;

	switch (operation) {
		case 'summarize': {
			const length = this.getNodeParameter('length', itemIndex) as string;
			const format =
				options.format === 'bullets' ? 'Format it as a bulleted list using "- ".' : 'Write it as plain prose.';
			const language = options.language
				? `Write the summary in ${String(options.language)}.`
				: 'Write the summary in the same language as the text.';
			system = withInstructions(
				`You summarize text. Write ${length}. ${format} ${language} Reply with the summary only: no title, no preamble.`,
				options.instructions,
			);
			expectJson = false;
			break;
		}
		case 'translate': {
			let target = this.getNodeParameter('targetLanguage', itemIndex) as string;
			if (target === 'other') target = this.getNodeParameter('customLanguage', itemIndex) as string;
			const tone = options.tone ? ` Use a ${String(options.tone)} tone.` : '';
			system = withInstructions(
				`Translate the user's text into ${target}.${tone} Keep the meaning, formatting, line breaks, numbers, names and URLs. ` +
					'Reply with the translation only. If the text is already in that language, return it unchanged.',
				options.instructions,
			);
			expectJson = false;
			break;
		}
		case 'classify': {
			const categories = list(this.getNodeParameter('categories', itemIndex) as string);
			if (!categories.length) {
				throw new NodeOperationError(this.getNode(), 'Add at least one category', { itemIndex });
			}
			const fallback = String(options.fallback ?? 'other').trim();
			const allowed = fallback && !categories.includes(fallback) ? [...categories, fallback] : categories;
			const shape = options.multiple ? '"categories": ["<category>", ...]' : '"category": "<category>"';
			system = withInstructions(
				`Classify the user's text. Allowed categories: ${JSON.stringify(allowed)}. ` +
					(options.multiple ? 'Choose every category that applies. ' : 'Choose exactly one category. ') +
					(fallback ? `If none fits, use "${fallback}". ` : '') +
					`Reply only with JSON: {${shape}${options.includeReason ? ', "reason": "<one short sentence>"' : ''}}`,
				options.instructions,
			);
			break;
		}
		case 'extract': {
			const fields = ((this.getNodeParameter('fields', itemIndex, {}) as IDataObject).values ?? []) as ExtractField[];
			const named = fields.filter((f) => f.name?.trim());
			if (!named.length) {
				throw new NodeOperationError(this.getNode(), 'Add at least one field to extract', { itemIndex });
			}
			const spec = named
				.map((f) => {
					const type = f.type === 'string[]' ? 'array of strings' : f.type === 'date' ? 'date as YYYY-MM-DD' : f.type;
					return `- "${f.name.trim()}" (${type})${f.description ? `: ${f.description}` : ''}`;
				})
				.join('\n');
			system = withInstructions(
				`Extract data from the user's text. Reply only with a JSON object with exactly these keys:\n${spec}\n` +
					'Use null when the text does not contain a value. Never invent values.',
				options.instructions,
			);
			break;
		}
		case 'sentiment': {
			const labels = list(String(options.categories ?? 'positive, neutral, negative'));
			system =
				`Analyze the sentiment of the user's text, in any language. Reply only with JSON: ` +
				`{"sentiment": one of ${JSON.stringify(labels)}, "score": number from -1 (very negative) to 1 (very positive), ` +
				`"confidence": number from 0 to 1${options.includeEmotions ? ', "emotions": ["<emotion>", ...]' : ''}}`;
			break;
		}
		default:
			throw new NodeOperationError(this.getNode(), `Unknown operation "${operation}"`, { itemIndex });
	}

	const messages: ChatMessage[] = [
		{ role: 'system', content: system },
		{ role: 'user', content: text },
	];
	const body: IDataObject & { model: string; messages: ChatMessage[] } = {
		model,
		messages,
		temperature: (options.temperature as number | undefined) ?? 0,
	};
	if (options.maxTokens) body.max_tokens = options.maxTokens;

	const result = await createChatCompletion.call(this, itemIndex, body, options.timeout as number | undefined);
	const meta: IDataObject = { model: result.model, usage: result.usage, cost: result.cost };

	if (!expectJson) {
		const key = operation === 'summarize' ? 'summary' : 'translation';
		return { [key]: result.text.trim(), dzrouter: meta };
	}

	const parsed = parseJsonReply.call(this, result.text, itemIndex);

	if (operation === 'classify') {
		const categories = list(this.getNodeParameter('categories', itemIndex) as string);
		const fallback = String(options.fallback ?? 'other').trim();
		const allowed = fallback ? [...categories, fallback] : categories;
		const out: IDataObject = {};
		if (options.multiple) {
			const raw = Array.isArray(parsed.categories) ? parsed.categories : [parsed.category];
			const picked = [...new Set(raw.map((c) => matchLabel(c, allowed)).filter((c): c is string => !!c))];
			out.categories = picked.length ? picked : fallback ? [fallback] : [];
		} else {
			out.category = matchLabel(parsed.category, allowed) ?? (fallback || parsed.category || null);
		}
		if (options.includeReason) out.reason = parsed.reason ?? null;
		return { ...out, dzrouter: meta };
	}

	if (operation === 'extract') {
		const fields = ((this.getNodeParameter('fields', itemIndex, {}) as IDataObject).values ?? []) as ExtractField[];
		const out: IDataObject = {};
		for (const f of fields.filter((x) => x.name?.trim())) {
			out[f.name.trim()] = coerce(parsed[f.name.trim()], f.type) as IDataObject[keyof IDataObject];
		}
		return { ...out, dzrouter: meta };
	}

	// sentiment
	const labels = list(String(options.categories ?? 'positive, neutral, negative'));
	const score = Number(parsed.score);
	const confidence = Number(parsed.confidence);
	const out: IDataObject = {
		sentiment: matchLabel(parsed.sentiment, labels) ?? parsed.sentiment ?? null,
		score: Number.isFinite(score) ? Math.max(-1, Math.min(1, score)) : null,
		confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : null,
	};
	if (options.includeEmotions) out.emotions = Array.isArray(parsed.emotions) ? parsed.emotions : [];
	return { ...out, dzrouter: meta };
}
