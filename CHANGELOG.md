# Changelog

## 0.1.0 (2026-10-06)

First release.

- **DzRouter** node
  - Chat → Message a Model: any model from the live catalog, multi-turn messages, JSON mode, reasoning effort, stop sequences; returns reply, usage and cost in USD and DZD
  - Text → Summarize, Translate (incl. Algerian Darja and Kabyle), Classify, Extract Data (typed fields), Analyze Sentiment
  - Model → Get, Get Many (filters: provider, capabilities, price, context; sorting), Find Cheapest
  - Account → Get Balance (free, works with a zero balance)
  - Usable as an AI Agent tool
- **DzRouter Chat Model** sub-node for AI Agents, chains and other LangChain nodes
- **DzRouter API** credential, tested against `GET /v1/key`
