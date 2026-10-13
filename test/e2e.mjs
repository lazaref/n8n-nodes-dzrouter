// End-to-end test: runs the built nodes (dist/) against a real DzRouter server
// backed by a mock upstream model provider. Nothing is billed anywhere.
//
//   npm run build && npm test
//
// Needs the DzRouter server repo built (npm run build there). Its location
// is given by DZROUTER_DIR (default: ../dzrouter, next to this repository).
import { spawn, execSync } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, '..');
const serverDir = path.resolve(process.env.DZROUTER_DIR ?? path.join(pkgRoot, '..', 'dzrouter'));

const UPSTREAM_PORT = 4311;
const BRIDGE_PORT = 4322;
const UPSTREAM_KEY = 'mock-upstream-key';
const base = `http://127.0.0.1:${BRIDGE_PORT}`;

let passed = 0;
let failed = 0;
function ok(name, cond, detail = '') {
	if (cond) {
		passed++;
		console.log(`  ok   ${name}`);
	} else {
		failed++;
		console.log(`  FAIL ${name}${detail ? `\n       ${String(detail).slice(0, 400)}` : ''}`);
	}
}

// ── mock upstream: answers like a real model would, including the messy bits
// (code fences, chatter before JSON, wrong-case labels) the node must handle
let lastChat = null;
const KNOWN = new Set(['openai/gpt-4o-mini', 'anthropic/claude-sonnet-x', 'google/gemini-x-flash', 'meta-llama/tiny']);
const upstream = http.createServer((req, res) => {
	let raw = '';
	req.on('data', (c) => (raw += c));
	req.on('end', () => {
		const send = (code, obj) => {
			res.writeHead(code, { 'content-type': 'application/json' });
			res.end(JSON.stringify(obj));
		};
		if (req.headers.authorization !== `Bearer ${UPSTREAM_KEY}`) return send(401, { error: { message: 'bad key' } });
		if (req.url === '/v1/models') {
			const m = (id, prompt, completion, extra = {}) => ({
				id,
				object: 'model',
				pricing: { prompt: String(prompt / 1e6), completion: String(completion / 1e6) },
				...extra,
			});
			return send(200, {
				data: [
					m('openai/gpt-4o-mini', 0.15, 0.6, { name: 'GPT-4o mini', context_length: 128000, supported_parameters: ['tools'] }),
					m('anthropic/claude-sonnet-x', 3, 15, { name: 'Claude Sonnet X', context_length: 200000, supported_parameters: ['tools'], catalog: { reasoning: true, vision: true } }),
					m('google/gemini-x-flash', 0.05, 0.2, { name: 'Gemini X Flash', context_length: 1000000, catalog: { vision: true } }),
					m('meta-llama/tiny', 0.01, 0.02, { name: 'Tiny Llama', context_length: 8000 }),
				],
			});
		}
		if (req.url === '/v1/chat/completions') {
			const body = JSON.parse(raw || '{}');
			lastChat = body;
			if (!KNOWN.has(body.model)) return send(404, { error: { message: `model ${body.model} not found`, type: 'invalid_request_error' } });
			const system = body.messages?.find((m) => m.role === 'system')?.content ?? '';
			let content = 'Hello from the mock model';
			if (system.startsWith('Classify')) content = '```json\n{"category": "COMPLAINT", "reason": "The customer is unhappy."}\n```';
			else if (system.startsWith('Extract'))
				content = 'Here is the data: {"customerName": "Amine B.", "total": "1 200,50", "paid": "oui", "items": "couscous, makroud", "deliveryDate": null}';
			else if (system.startsWith('Analyze the sentiment'))
				content = '{"sentiment": "Negative", "score": -1.7, "confidence": 0.92, "emotions": ["anger"]}';
			else if (system.startsWith('Translate')) content = 'Bonjour le monde';
			else if (system.startsWith('You summarize')) content = '  A short summary.  ';
			else if (body.response_format?.type === 'json_object') content = '{"ok": true}';
			return send(200, {
				id: 'chatcmpl-mock',
				object: 'chat.completion',
				model: body.model,
				choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content, reasoning_content: 'thinking…' } }],
				usage: { prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500 },
			});
		}
		send(404, { error: { message: 'not found' } });
	});
});

async function waitReady(url, timeoutMs = 40000) {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		try {
			const r = await fetch(url);
			if (r.status < 500) return true;
		} catch {}
		await new Promise((r) => setTimeout(r, 300));
	}
	return false;
}

// ── minimal n8n execution context ─────────────────────────────
let credentials = {};
const node = { id: 'n1', name: 'DzRouter', type: 'n8n-nodes-dzrouter.dzRouter', typeVersion: 1, position: [0, 0], parameters: {} };

async function httpRequestWithAuthentication(_type, opts) {
	const url = new URL(opts.url.replace(/^\//, ''), opts.baseURL.replace(/\/?$/, '/'));
	const res = await fetch(url, {
		method: opts.method,
		headers: { ...opts.headers, authorization: `Bearer ${credentials.apiKey}`, ...(opts.body ? { 'content-type': 'application/json' } : {}) },
		body: opts.body ? JSON.stringify(opts.body) : undefined,
		signal: opts.timeout ? AbortSignal.timeout(opts.timeout) : undefined,
	});
	const text = await res.text();
	let body;
	try {
		body = JSON.parse(text);
	} catch {
		body = text;
	}
	if (!opts.ignoreHttpStatusErrors && res.status >= 400) throw new Error(`HTTP ${res.status}`);
	return opts.returnFullResponse ? { body, headers: Object.fromEntries(res.headers), statusCode: res.status } : body;
}

function context(params, { items = [{ json: {} }], continueOnFail = false } = {}) {
	return {
		getInputData: () => items,
		getNodeParameter(name, _i, fallback, opts) {
			const v = params[name];
			if (v === undefined) return fallback;
			if (opts?.extractValue && v && typeof v === 'object' && 'value' in v) return v.value;
			return v;
		},
		getCredentials: async () => credentials,
		getNode: () => node,
		continueOnFail: () => continueOnFail,
		helpers: { httpRequestWithAuthentication, getSecureEgressFilter: () => 'disabled' },
		// used by the LangChain tracing callbacks of the chat-model sub-node
		addInputData: () => ({ index: 0 }),
		addOutputData: () => {},
		getNextRunIndex: () => 0,
		getExecutionCancelSignal: () => undefined,
		logger: { debug() {}, info() {}, warn() {}, error() {} },
	};
}

const model = (id) => ({ __rl: true, mode: 'list', value: id });

async function run(params, opts) {
	const { DzRouter } = require(path.join(pkgRoot, 'dist/nodes/DzRouter/DzRouter.node.js'));
	const out = await new DzRouter().execute.call(context(params, opts));
	return out[0].map((x) => x.json);
}

async function expectError(params, opts) {
	try {
		await run(params, opts);
		return null;
	} catch (e) {
		return e;
	}
}

// ── boot ──────────────────────────────────────────────────────
const dbFile = path.join(os.tmpdir(), `dzrouter-n8n-e2e-${Date.now()}.db`).replace(/\\/g, '/');
const env = {
	...process.env,
	PORT: String(BRIDGE_PORT),
	HOST: '127.0.0.1',
	DATABASE_URL: `file:${dbFile}`,
	UPSTREAM_API_KEY: UPSTREAM_KEY,
	UPSTREAM_BASE_URL: `http://127.0.0.1:${UPSTREAM_PORT}/v1`,
	JWT_SECRET: 'e2e-secret',
	MARKUP: '1.2',
	SIGNUP_CREDIT_USD: '1',
	DZD_PER_USD: '250',
	LOG_LEVEL: 'warn',
	MAIL_TRANSPORT: 'log',
	PUBLIC_URL: base,
	REQUIRE_EMAIL_VERIFICATION: 'false',
	NODE_ENV: 'test',
};

console.log(`DzRouter server: ${serverDir}`);
execSync('npx prisma db push --skip-generate', { cwd: serverDir, env, stdio: 'pipe' });
await new Promise((r) => upstream.listen(UPSTREAM_PORT, '127.0.0.1', r));
const server = spawn(process.execPath, ['dist/server.js'], { cwd: serverDir, env, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
server.stdout.on('data', (d) => (serverLog += d));
server.stderr.on('data', (d) => (serverLog += d));

try {
	if (!(await waitReady(`${base}/api/public-config`))) throw new Error(`server did not start\n${serverLog}`);

	// a customer with $1 signup credit and one API key
	const signup = await fetch(`${base}/api/auth/signup`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ email: 'n8n@test.dev', password: 'supersecret1', acceptTerms: true }),
	});
	const cookie = (signup.headers.get('set-cookie') ?? '').match(/sb_session=[^;]+/)?.[0];
	const keyRes = await fetch(`${base}/api/keys`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', cookie },
		body: JSON.stringify({ name: 'n8n e2e' }),
	});
	const apiKey = (await keyRes.json()).key;
	ok('test account and key created', !!apiKey, signup.status);
	credentials = { apiKey, url: `${base}/v1/` }; // trailing slash on purpose
	await waitReady(`${base}/api/models`);

	console.log('\n— credential test request —');
	{
		const { DzRouterApi } = require(path.join(pkgRoot, 'dist/credentials/DzRouterApi.credentials.js'));
		const cred = new DzRouterApi();
		ok('credential test is GET /key', cred.test.request.url === '/key' && cred.test.request.method === 'GET');
		ok('API key is a password field', cred.properties.find((p) => p.name === 'apiKey').typeOptions.password === true);
		const r = await fetch(`${base}/v1/key`, { headers: { authorization: `Bearer ${apiKey}` } });
		ok('GET /v1/key answers 200 for the key', r.status === 200);
	}

	console.log('\n— Chat → Message a Model —');
	{
		const [out] = await run({
			resource: 'chat',
			operation: 'message',
			model: model('openai/gpt-4o-mini'),
			messages: { values: [{ role: 'system', content: 'Be brief.' }, { role: 'user', content: 'Hi' }, { role: 'user', content: '   ' }] },
			simplify: true,
			options: { temperature: 0.3, maxTokens: 64, reasoningEffort: 'low', stop: 'END, ###', topP: 0.9 },
		});
		ok('reply text', out.text === 'Hello from the mock model', JSON.stringify(out));
		ok('reasoning surfaced', out.reasoning === 'thinking…');
		ok('usage normalised', out.usage.promptTokens === 1000 && out.usage.completionTokens === 500 && out.usage.totalTokens === 1500, JSON.stringify(out.usage));
		// 1000 × 0.15×1.2/1e6 + 500 × 0.6×1.2/1e6 = 0.00018 + 0.00036
		// $0.00054 of list price × markup, at 250 Pulses per dollar
		ok('cost in Pulses from headers', Math.abs(out.cost.pulses - 0.135) < 1e-4 && out.cost.usd === undefined, JSON.stringify(out.cost));
		ok('empty messages dropped', lastChat.messages.length === 2, JSON.stringify(lastChat.messages));
		ok(
			'options mapped to OpenAI fields',
			lastChat.temperature === 0.3 && lastChat.max_tokens === 64 && lastChat.reasoning_effort === 'low' && lastChat.top_p === 0.9 && JSON.stringify(lastChat.stop) === '["END","###"]',
			JSON.stringify(lastChat),
		);

		const [json] = await run({
			resource: 'chat',
			operation: 'message',
			model: { mode: 'id', value: 'openai/gpt-4o-mini' },
			messages: { values: [{ role: 'user', content: 'Reply in JSON' }] },
			simplify: true,
			options: { responseFormat: 'json_object' },
		});
		ok('JSON mode parsed into "json"', json.json?.ok === true && lastChat.response_format?.type === 'json_object', JSON.stringify(json));

		const [raw] = await run({
			resource: 'chat',
			operation: 'message',
			model: model('openai/gpt-4o-mini'),
			messages: { values: [{ role: 'user', content: 'Hi' }] },
			simplify: false,
			options: {},
		});
		ok('raw output keeps OpenAI shape + cost', raw.object === 'chat.completion' && Array.isArray(raw.choices) && raw.cost.pulses > 0, JSON.stringify(raw).slice(0, 200));

		const many = await run(
			{ resource: 'chat', operation: 'message', model: model('openai/gpt-4o-mini'), messages: { values: [{ role: 'user', content: 'Hi' }] }, simplify: true, options: {} },
			{ items: [{ json: {} }, { json: {} }, { json: {} }] },
		);
		ok('one output per input item', many.length === 3);
	}

	console.log('\n— Text operations —');
	{
		const textBase = { resource: 'text', model: model('openai/gpt-4o-mini'), text: 'Le colis est arrivé cassé, je suis très déçu. Commande de couscous et makroud, 1 200,50 DA, payée.' };

		const [sum] = await run({ ...textBase, operation: 'summarize', length: 'one sentence', options: { format: 'bullets', language: 'Arabic' } });
		ok('summary trimmed', sum.summary === 'A short summary.', JSON.stringify(sum));
		ok('summary prompt has length, format, language', /one sentence/.test(lastChat.messages[0].content) && /bulleted/.test(lastChat.messages[0].content) && /Arabic/.test(lastChat.messages[0].content));
		ok('text tasks default to temperature 0', lastChat.temperature === 0);
		ok('usage + cost under "dzrouter"', sum.dzrouter.cost.pulses > 0 && sum.dzrouter.model === 'openai/gpt-4o-mini', JSON.stringify(sum.dzrouter));

		const [tr] = await run({ ...textBase, operation: 'translate', targetLanguage: 'other', customLanguage: 'Portuguese', options: { tone: 'formal' } });
		ok('translation returned', tr.translation === 'Bonjour le monde');
		ok('custom target language + tone in prompt', /Portuguese/.test(lastChat.messages[0].content) && /formal/.test(lastChat.messages[0].content));

		const [cl] = await run({ ...textBase, operation: 'classify', categories: 'order, complaint, question', options: { includeReason: true } });
		ok('fenced JSON parsed and label matched case-insensitively', cl.category === 'complaint' && cl.reason === 'The customer is unhappy.', JSON.stringify(cl));
		ok('fallback category offered to the model', /"other"/.test(lastChat.messages[0].content));

		const [clm] = await run({ ...textBase, operation: 'classify', categories: 'order, complaint', options: { multiple: true, fallback: '' } });
		ok('multiple mode returns an array', JSON.stringify(clm.categories) === '["complaint"]', JSON.stringify(clm));

		const [ex] = await run({
			...textBase,
			operation: 'extract',
			fields: {
				values: [
					{ name: 'customerName', type: 'string', description: 'Name' },
					{ name: 'total', type: 'number' },
					{ name: 'paid', type: 'boolean' },
					{ name: 'items', type: 'string[]' },
					{ name: 'deliveryDate', type: 'date' },
				],
			},
			options: {},
		});
		ok('chatter before JSON tolerated', ex.customerName === 'Amine B.', JSON.stringify(ex));
		ok('number coerced from "1 200,50"', ex.total === 1200.5, ex.total);
		ok('boolean coerced from "oui"', ex.paid === true);
		ok('list coerced from comma text', JSON.stringify(ex.items) === '["couscous","makroud"]');
		ok('missing value is null', ex.deliveryDate === null);

		const [se] = await run({ ...textBase, operation: 'sentiment', options: { includeEmotions: true } });
		ok('sentiment label normalised', se.sentiment === 'negative', JSON.stringify(se));
		ok('score clamped to [-1, 1]', se.score === -1);
		ok('emotions included', JSON.stringify(se.emotions) === '["anger"]');

		const err = await expectError({ ...textBase, operation: 'classify', categories: ' , ', options: {} });
		ok('empty categories rejected', /at least one category/.test(err?.message ?? ''), err?.message);
	}

	console.log('\n— Model resource —');
	{
		const all = await run({ resource: 'model', operation: 'getAll', returnAll: true, filters: {}, options: { sortBy: 'inputPrice' } });
		ok('catalog listed (4 models)', all.length === 4, all.length);
		ok('sorted by input price', all[0].id === 'meta-llama/tiny' && all.at(-1).id === 'anthropic/claude-sonnet-x', all.map((m) => m.id).join(','));
		const mini = all.find((m) => m.id === 'openai/gpt-4o-mini');
		ok('customer prices per 1M in Pulses (markup applied)', mini.inputPerMillionPulses === 45 && mini.outputPerMillionPulses === 180 && mini.inputPerMillionUsd === undefined, JSON.stringify(mini));

		const limited = await run({ resource: 'model', operation: 'getAll', returnAll: false, limit: 2, filters: {}, options: {} });
		ok('limit respected', limited.length === 2);

		const vision = await run({ resource: 'model', operation: 'getAll', returnAll: true, filters: { capabilities: ['vision'], maxInputPrice: 250 }, options: {} });
		ok('capability + price filters', vision.length === 1 && vision[0].id === 'google/gemini-x-flash', JSON.stringify(vision.map((m) => m.id)));

		const search = await run({ resource: 'model', operation: 'getAll', returnAll: true, filters: { search: 'claude sonnet' }, options: {} });
		ok('word search', search.length === 1 && search[0].id === 'anthropic/claude-sonnet-x');

		const [cheap] = await run({ resource: 'model', operation: 'getCheapest', priceBasis: 'blended', filters: { minContextLength: 100000 }, options: {} });
		ok('cheapest with min context', cheap.id === 'google/gemini-x-flash', cheap.id);

		const [one] = await run({ resource: 'model', operation: 'get', model: model('OpenAI/GPT-4o-mini'), options: {} });
		ok('get is case-insensitive', one.id === 'openai/gpt-4o-mini' && one.url.endsWith('/models/openai/gpt-4o-mini'));

		const missing = await expectError({ resource: 'model', operation: 'get', model: model('nope/none'), options: {} });
		ok('unknown model → clear error', /not in the DzRouter catalog/.test(missing?.message ?? ''), missing?.message);

		const { DzRouter } = require(path.join(pkgRoot, 'dist/nodes/DzRouter/DzRouter.node.js'));
		const listCtx = context({});
		const found = await new DzRouter().methods.listSearch.searchModels.call(listCtx, 'gemini');
		ok('model picker search', found.results.length === 1 && /per 1M tokens/.test(found.results[0].description) && /vision/.test(found.results[0].description), JSON.stringify(found));
		const providers = await new DzRouter().methods.loadOptions.getProviders.call(listCtx);
		ok('provider filter options', providers.length >= 3 && providers.every((p) => /\(\d+\)$/.test(p.name)), JSON.stringify(providers));
	}

	console.log('\n— Account —');
	{
		const [acc] = await run({ resource: 'account', operation: 'getBalance' });
		// signup credit: $1 × 250 = 250 Pulses, minus what the tests above spent
		ok('balance in Pulses', acc.balancePulses > 0 && acc.balancePulses < 250 && acc.balanceUsd === undefined, JSON.stringify(acc));
		ok('spend reported in Pulses', acc.usagePulses > 0 && acc.label === 'n8n e2e');
	}

	console.log('\n— Errors —');
	{
		const good = credentials.apiKey;
		credentials = { ...credentials, apiKey: 'sk-dz-wrong' };
		const e401 = await expectError({ resource: 'account', operation: 'getBalance' });
		ok('401 → NodeApiError with hint', e401?.constructor?.name === 'NodeApiError' && e401.httpCode === '401' && /API key/.test(e401.description ?? ''), `${e401?.constructor?.name} ${e401?.httpCode} ${e401?.description}`);

		const soft = await run({ resource: 'account', operation: 'getBalance' }, { continueOnFail: true });
		ok('continueOnFail returns the error as data', typeof soft[0].error === 'string');
		credentials = { ...credentials, apiKey: good };

		const e404 = await expectError({ resource: 'chat', operation: 'message', model: { mode: 'id', value: 'nope/none' }, messages: { values: [{ role: 'user', content: 'Hi' }] }, simplify: true, options: {} });
		ok('unknown model on chat → API error', e404?.constructor?.name === 'NodeApiError', `${e404?.constructor?.name}: ${e404?.message}`);

		const noMsg = await expectError({ resource: 'chat', operation: 'message', model: model('openai/gpt-4o-mini'), messages: { values: [] }, simplify: true, options: {} });
		ok('no messages → operation error', /at least one message/.test(noMsg?.message ?? ''));
	}

	console.log('\n— Chat Model sub-node (LangChain) —');
	{
		const { DzRouterChatModel } = require(path.join(pkgRoot, 'dist/nodes/DzRouterChatModel/DzRouterChatModel.node.js'));
		const supplied = await new DzRouterChatModel().supplyData.call(
			context({ model: model('openai/gpt-4o-mini'), options: { temperature: 0.2, maxTokens: 50 } }),
			0,
		);
		const lc = supplied.response;
		ok('supplies a chat model', typeof lc?.invoke === 'function');
		const reply = await lc.invoke('Say hi');
		ok('model answers through DzRouter', reply.content === 'Hello from the mock model', JSON.stringify(reply.content));
		ok('options reach the request', lastChat.temperature === 0.2 && lastChat.model === 'openai/gpt-4o-mini', JSON.stringify(lastChat));
	}
} catch (e) {
	failed++;
	console.error('\nFATAL', e);
	console.error(serverLog.slice(-2000));
} finally {
	// E2E_KEEP=<file>: keep the mock-backed server up for manual testing in n8n,
	// writing its base URL and the test key to that file (never to the console)
	if (process.env.E2E_KEEP && credentials.apiKey) {
		const fs = await import('node:fs');
		fs.writeFileSync(process.env.E2E_KEEP, `Base URL: ${base}/v1
API key: ${credentials.apiKey}
`);
		console.log(`
RESULT: ${passed} passed, ${failed} failed. Server kept running on ${base} (details in ${process.env.E2E_KEEP}); Ctrl+C to stop.`);
		await new Promise(() => {});
	}
	server.kill();
	upstream.close();
}

console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
