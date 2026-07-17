"use client";
// azure and openai, using same models. so using same LLMApi.
import { ApiPath, DEEPSEEK_BASE_URL, DeepSeek } from "@/app/constant";
import {
  useAccessStore,
  useAppConfig,
  useChatStore,
  ChatMessageTool,
  usePluginStore,
} from "@/app/store";
import { streamWithThink } from "@/app/utils/chat";
import {
  ChatOptions,
  getHeaders,
  LLMApi,
  LLMModel,
  SpeechOptions,
} from "../api";
import { getClientConfig } from "@/app/config/client";
import {
  getMessageTextContent,
  getMessageTextContentWithoutThinking,
  getTimeoutMSByModel,
} from "@/app/utils";
import { RequestPayload } from "./openai";
import { fetch } from "@/app/utils/stream";

export class DeepSeekApi implements LLMApi {
  private disableListModels = true;

  path(path: string): string {
    const accessStore = useAccessStore.getState();

    let baseUrl = "";

    if (accessStore.useCustomConfig) {
      baseUrl = accessStore.deepseekUrl;
    }

    if (baseUrl.length === 0) {
      const isApp = !!getClientConfig()?.isApp;
      const apiPath = ApiPath.DeepSeek;
      baseUrl = isApp ? DEEPSEEK_BASE_URL : apiPath;
    }

    if (baseUrl.endsWith("/")) {
      baseUrl = baseUrl.slice(0, baseUrl.length - 1);
    }
    if (!baseUrl.startsWith("http") && !baseUrl.startsWith(ApiPath.DeepSeek)) {
      baseUrl = "https://" + baseUrl;
    }

    console.log("[Proxy Endpoint] ", baseUrl, path);

    return [baseUrl, path].join("/");
  }

  extractMessage(res: any) {
    return res.choices?.at(0)?.message?.content ?? "";
  }

  speech(options: SpeechOptions): Promise<ArrayBuffer> {
    throw new Error("Method not implemented.");
  }

  async chat(options: ChatOptions) {
    const messages: ChatOptions["messages"] = [];
    for (const v of options.messages) {
      if (v.role === "assistant") {
        const content = getMessageTextContentWithoutThinking(v);
        messages.push({ role: v.role, content });
      } else {
        const content = getMessageTextContent(v);
        messages.push({ role: v.role, content });
      }
    }

    // 检测并修复消息顺序，确保除system外的第一个消息是user
    const filteredMessages: ChatOptions["messages"] = [];
    let hasFoundFirstUser = false;

    for (const msg of messages) {
      if (msg.role === "system") {
        // Keep all system messages
        filteredMessages.push(msg);
      } else if (msg.role === "user") {
        // User message directly added
        filteredMessages.push(msg);
        hasFoundFirstUser = true;
      } else if (hasFoundFirstUser) {
        // After finding the first user message, all subsequent non-system messages are retained.
        filteredMessages.push(msg);
      }
      // If hasFoundFirstUser is false and it is not a system message, it will be skipped.
    }

    const modelConfig = {
      ...useAppConfig.getState().modelConfig,
      ...useChatStore.getState().currentSession().mask.modelConfig,
      ...{
        model: options.config.model,
        providerName: options.config.providerName,
      },
    };

    const requestPayload: RequestPayload = {
      messages: filteredMessages,
      stream: options.config.stream,
      model: modelConfig.model,
      temperature: modelConfig.temperature,
      presence_penalty: modelConfig.presence_penalty,
      frequency_penalty: modelConfig.frequency_penalty,
      top_p: modelConfig.top_p,
      // max_tokens: Math.max(modelConfig.max_tokens, 1024),
      // Please do not ask me why not send max_tokens, no reason, this param is just shit, I dont want to explain anymore.
    };

    console.log("[Request] openai payload: ", requestPayload);

    const shouldStream = !!options.config.stream;
    const controller = new AbortController();
    options.onController?.(controller);

    try {
      const chatPath = this.path(DeepSeek.ChatPath);
      const chatPayload = {
        method: "POST",
        body: JSON.stringify(requestPayload),
        signal: controller.signal,
        headers: getHeaders(),
      };

      // make a fetch request
      const requestTimeoutId = setTimeout(
        () => controller.abort(),
        getTimeoutMSByModel(options.config.model),
      );

      if (shouldStream) {
        // ===== OKX 加密货币数据工具 =====
        const OKX_WORKER_URL = "https://white-pine-a4b9.zhiqiulu35.workers.dev";
        const TRADE_WORKER_URL = "https://raspy-tree-211e.zhiqiulu35.workers.dev";

        const okxTools = [          {            type: "function",            function: {              name: "get_ticker",              description: "获取加密货币实时行情：最新价、24h涨跌幅、最高价、最低价、成交量",              parameters: {                type: "object",                properties: {                  instId: { type: "string", description: "交易对，如 BTC-USDT, ETH-USDT, SOL-USDT, OKB-USDT" },                },                required: ["instId"],              },            },          },          {            type: "function",            function: {              name: "get_candles",              description: "获取K线/蜡烛图数据，用于技术分析和趋势判断",              parameters: {                type: "object",                properties: {                  instId: { type: "string", description: "交易对，如 BTC-USDT" },                  bar: { type: "string", description: "K线周期：1m/5m/15m/1H/4H/1D/1W" },                  limit: { type: "integer", description: "返回K线数量" },                },                required: ["instId"],              },            },          },          {            type: "function",            function: {              name: "get_orderbook",              description: "获取订单簿深度数据，查看买卖盘口挂单情况",              parameters: {                type: "object",                properties: {                  instId: { type: "string", description: "交易对，如 BTC-USDT" },                  size: { type: "integer", description: "深度档位数量" },                },                required: ["instId"],              },            },          },          {            type: "function",            function: {              name: "get_funding_rate",              description: "获取永续合约资金费率，判断市场多空情绪",              parameters: {                type: "object",                properties: {                  instId: { type: "string", description: "合约交易对，如 BTC-USDT-SWAP" },                },                required: ["instId"],              },            },          },          {            type: "function",            function: {              name: "get_market_overview",              description: "获取加密货币综合市场概况：同时查询行情、K线趋势、深度数据",              parameters: {                type: "object",                properties: {                  instId: { type: "string", description: "交易对，如 BTC-USDT" },                },                required: ["instId"],              },            },          },          {            type: "function",            function: {              name: "get_stock_quote",              description: "查询全球股票/ETF/指数实时股价。美股:AAPL,NVDA,TSLA,MSFT。港股:0700.HK(腾讯)。A股:600519.SS(茅台)。指数:^GSPC(标普500),^HSI(恒生),^N225(日经)",              parameters: {                type: "object",                properties: {                  symbol: { type: "string", description: "股票代码。美股AAPL,港股0700.HK,A股600519.SS,指数^GSPC。可批量逗号分隔" },                },                required: ["symbol"],              },            },          },          {            type: "function",            function: {              name: "get_stock_chart",              description: "获取股票历史价格走势数据",              parameters: {                type: "object",                properties: {                  symbol: { type: "string", description: "股票代码如AAPL" },                  range: { type: "string", description: "范围:1d/5d/1mo/3mo/6mo/1y" },                },                required: ["symbol"],              },            },          },          {            type: "function",            function: {              name: "search_stocks",              description: "搜索股票/ETF/基金，根据关键词查找代码",              parameters: {                type: "object",                properties: {                  keyword: { type: "string", description: "搜索关键词如Apple/腾讯/茅台" },                },                required: ["keyword"],              },            },          },          {            type: "function",            function: {              name: "get_major_indices",              description: "查询全球主要股票指数：标普500、道琼斯、纳斯达克、恒生、日经、上证等",              parameters: { type: "object", properties: {} },            },          },          {            type: "function",            function: {              name: "get_sector_performance",              description: "查询美股板块表现：科技、金融、医疗、能源、半导体等",              parameters: { type: "object", properties: {} },            },          },        ]