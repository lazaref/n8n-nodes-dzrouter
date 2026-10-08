# n8n-nodes-dzrouter

Use **200+ AI models** (GPT, Claude, Gemini, DeepSeek, Llama, Qwen, Mistral and more) in your n8n workflows through a single [DzRouter](https://dzrouter.com) API key, paid with Pulses, DzRouter's AI credit (1 Pulse = 1 DA), bought with Edahabia/CIB, BaridiMob or a card.

DzRouter is an OpenAI-compatible AI router built for Algeria and North Africa. This package gives you:

| Node | What it does |
| --- | --- |
| **DzRouter** | Chat with any model, run ready-made text tasks (summarize, translate, classify, extract, sentiment), browse the model catalog and check your balance. Works as an AI Agent tool. |
| **DzRouter Chat Model** | The language model for n8n's **AI Agent**, **Basic LLM Chain**, **Summarization Chain** and every other AI node. |

Every call reports its **cost in Pulses** (1 Pulse = 1 DA), so you always know what a workflow run costs.

[Installation](#installation) · [Credentials](#credentials) · [DzRouter node](#dzrouter-node) · [DzRouter Chat Model](#dzrouter-chat-model) · [Examples](#examples) · [Compatibility](#compatibility)

## Installation

Follow the [community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n documentation.

In n8n: **Settings → Community Nodes → Install**, then enter:

```
n8n-nodes-dzrouter
```

## Credentials

1. Create an account at [dzrouter.com](https://dzrouter.com) and top up your balance with Pulses (from 500 DA, 1 Pulse = 1 DA).
2. In the DzRouter console, open **API keys** and create a key. It starts with `sk-dz-`.
3. In n8n, create a **DzRouter API** credential and paste the key. Leave **Base URL** as `https://dzrouter.com/v1`.

n8n tests the credential with `GET /v1/key`. The test is free and also works on a new account with a zero balance.

## DzRouter node

### Chat → Message a Model

Send a conversation to any model.

- **Model**: search the live catalog by name or provider. Each entry shows its price per 1M tokens, context size and capabilities (vision, tools, reasoning). You can also type a model ID.
- **Messages**: any number of System, User and Assistant messages, which lets you give the model conversation history.
- **Simplify Output** (on by default) returns:

```json
{
  "text": "Marhba! How can I help you today?",
  "model": "openai/gpt-4o-mini",
  "finishReason": "stop",
  "usage": { "promptTokens": 21, "completionTokens": 9, "totalTokens": 30 },
  "cost": { "pulses": 0.0024 }
}
```

- **Options**: Sampling Temperature, Maximum Number of Tokens, Top P, Frequency and Presence Penalty, Reasoning Effort, Response Format (Text or JSON Object, which is parsed into a `json` field), Seed, Stop Sequences, Timeout.

Turn **Simplify Output** off to get the full OpenAI-compatible response plus `cost`.

### Text: ready-made AI tasks

You don't have to write a prompt. Each task runs at temperature 0, so the same input gives consistent results. It tolerates replies that wrap JSON in code fences or add extra text, and adds a `dzrouter` field with the model, usage and cost.

| Operation | Output |
| --- | --- |
| **Summarize**: length (one sentence to detailed), paragraph or bullet points, output language | `summary` |
| **Translate** into Arabic, Algerian Darja, Kabyle, French, English, Spanish, Turkish, Chinese… or any other language; optional tone | `translation` |
| **Classify** into your categories, with an optional fallback category, multiple labels and reasons | `category` (or `categories`), `reason` |
| **Extract Data** into typed fields: Text, Number, Boolean, Date, List of Text | one key per field (`null` when the text doesn't contain it) |
| **Analyze Sentiment** with your own labels and optional emotions | `sentiment`, `score` (−1…1), `confidence`, `emotions` |

Extracted values are converted to the declared types. For example, `"1 200,50"` becomes `1200.5` and `"oui"` / `"نعم"` become `true`. Classification labels are matched to your list regardless of case.

### Model

- **Get Many**: the catalog with prices per 1M tokens in Pulses. Filter by provider, required capabilities (vision, tool calling, reasoning), maximum input/output price, minimum context, or search words. Sort by recommended order, price, context or name.
- **Find Cheapest**: the cheapest model that matches your filters, compared on input, output or blended price (3 input : 1 output). Pass its `id` to a later node to always use the cheapest suitable model.
- **Get**: one model's details and prices.

### Account → Get Balance

Returns the balance and total spend in Pulses, rate limit and last use of the key. It's free and never billed. Put it before an expensive step, together with an **If** node, to stop a workflow when the balance is low.

## DzRouter Chat Model

Connect it to the **Chat Model** input of an **AI Agent**, a **Basic LLM Chain**, a **Question and Answer Chain**, a **Summarization Chain**, an **Information Extractor**, a **Text Classifier**, and so on.

- Pick any catalog model. For AI Agents, choose a model whose description in the list includes **tools**.
- Options: Sampling Temperature, Maximum Number of Tokens, Top P, Frequency and Presence Penalty, Reasoning Effort, Response Format, Timeout, Max Retries.

## Examples

**Customer messages in Darja → ticket**
Webhook → DzRouter *Translate* (to French) → DzRouter *Classify* (`order, complaint, question, spam`) → Switch on `category` → create a ticket or reply.

**Invoices by email → spreadsheet**
Gmail Trigger → DzRouter *Extract Data* (`supplier` Text, `total` Number, `dueDate` Date, `paid` Boolean) → Google Sheets *Append*.

**Support agent**
Chat Trigger → AI Agent (DzRouter Chat Model + your tools) → reply. Add a DzRouter *Get Balance* + If step to get an alert before credit runs out.

**Cheapest model that fits**
DzRouter *Find Cheapest* (capabilities: Tool Calling, min context 128000) → DzRouter *Message a Model* with the model set by the expression `{{ $json.id }}`.

## Errors

DzRouter errors are shown with a hint:

| Code | Meaning |
| --- | --- |
| 401 | Invalid API key. Check the credential. |
| 402 | Balance is empty. Top up in the console. |
| 429 | Rate limit of the key reached. Add a Wait node or enable *Retry On Fail*. |
| 502 | The upstream model provider failed. Retry or choose another model. |

With **On Error → Continue**, a failed item is returned as `{ "error": "…" }` and the other items keep running.

## Compatibility

- Built and tested against n8n **2.42** (`n8n-workflow` 2.42, `@n8n/ai-node-sdk` 0.32). The Chat Model sub-node needs an n8n version that includes the AI node SDK.
- Node.js 20.15 or newer.
- No runtime dependencies.

## Development

```bash
npm install
npm run build
npm run lint
npm run dev        # starts n8n on http://localhost:5678 with these nodes loaded
npm test           # end-to-end test against a local DzRouter server + mock model provider
```

`npm test` needs the DzRouter server repository built next to this one (or `DZROUTER_DIR=/path/to/server`). It runs both nodes against a real DzRouter instance whose upstream is a local mock, so nothing is billed.

## Resources

- [DzRouter](https://dzrouter.com): models, prices and documentation
- [DzRouter API documentation](https://dzrouter.com/en/docs)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)

## License

[MIT](LICENSE.md)
