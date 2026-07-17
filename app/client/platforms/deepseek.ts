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

        const okxTools = [
          {
            type: "function",
            function: {
              name: "get_ticker",
              description: "获取加密货币实时行情：最新价、24h涨跌幅、最高价、最低价、成交量",
              parameters: {
                type: "object",
                properties: {
                  instId: { type: "string", description: "交易对，如 BTC-USDT, ETH-USDT, SOL-USDT" },
                },
                required: ["instId"],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "get_candles",
              description: "获取K线/蜡烛图数据，用于技术分析和趋势判断",
              parameters: {
                type: "object",
                properties: {
                  instId: { type: "string", description: "交易对，如 BTC-USDT" },
                  bar: { type: "string", description: "K线周期：1m/5m/15m/1H/4H/1D/1W", default: "1H" },
                  limit: { type: "integer", description: "返回K线数量", default: 20 },
                },
                required: ["instId"],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "get_orderbook",
              description: "获取订单簿深度数据，查看买卖盘口挂单情况",
              parameters: {
                type: "object",
                properties: {
                  instId: { type: "string", description: "交易对，如 BTC-USDT" },
                  size: { type: "integer", description: "深度档位数量", default: 20 },
                },
                required: ["instId"],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "get_funding_rate",
              description: "获取永续合约资金费率，判断市场多空情绪",
              parameters: {
                type: "object",
                properties: {
                  instId: { type: "string", description: "合约交易对，如 BTC-USDT-SWAP" },
                },
                required: ["instId"],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "get_market_overview",
              description: "获取加密货币综合市场概况：同时查询行情、K线趋势、深度数据",
              parameters: {
                type: "object",
                properties: {
                  instId: { type: "string", description: "交易对，如 BTC-USDT" },
                },
                required: ["instId"],
              },
            },
          },
        ,
      // ===== 全球股票/指数查询工具 =====
      {
        type: "function" as const,
        function: {
          name: "get_stock_quote",
          description: "查询全球股票/ETF/指数实时股价。美股直接输代码如AAPL,NVDA,TSLA,MSFT,GOOG,AMZN,META。港股加.HK如0700.HK(腾讯),9988.HK(阿里)。A股沪市.SS如600519.SS(茅台)。深市.SZ如000001.SZ。指数加^如^GSPC(标普500),^DJI(道琼斯),^IXIC(纳斯达克),^HSI(恒生指数),^N225(日经225)。可批量查询多个用逗号分隔",
          parameters: {
            type: "object",
            properties: {
              symbol: { type: "string", description: "股票代码。美股如AAPL,NVDA,TSLA。港股0700.HK。A股600519.SS。指数^GSPC。可批量逗号分隔" },
            },
            required: ["symbol"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "get_stock_chart",
          description: "获取股票历史价格走势数据(OHLCV)",
          parameters: {
            type: "object",
            properties: {
              symbol: { type: "string", description: "股票代码如AAPL" },
              range: { type: "string", description: "时间范围:1d/5d/1mo/3mo/6mo/1y/5y/max" },
              interval: { type: "string", description: "数据间隔:1m/5m/1h/1d/1wk/1mo" },
            },
            required: ["symbol"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "search_stocks",
          description: "搜索股票/ETF/基金等金融产品，根据关键词找到代码",
          parameters: {
            type: "object",
            properties: {
              keyword: { type: "string", description: "搜索关键词如Apple/腾讯/茅台" },
              limit: { type: "integer", description: "返回数量" },
            },
            required: ["keyword"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "get_major_indices",
          description: "查询全球主要股票指数：标普500(^GSPC)、道琼斯(^DJI)、纳斯达克(^IXIC)、恒生(^HSI)、日经(^N225)、上证(000001.SS)、富时100(^FTSE)等16个指数",
          parameters: { type: "object", properties: {} },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "get_sector_performance",
          description: "查询美股板块表现：科技(XLK)、金融(XLF)、医疗(XLV)、能源(XLE)、半导体(SMH)",
          parameters: { type: "object", properties: {} },
        },
      },

      ];

        // ===== 交易工具（独立 Worker） =====
        const tradeTools = [
          {
            type: "function",
            function: {
              name: "trade_place_limit_order",
              description: "下限价单 - 买入或卖出加密货币。首次调用返回预览确认，确认后再调用一次（confirmed=true）即可执行下单。",
              parameters: {
                type: "object",
                properties: {
                  instId: { type: "string", description: "交易对，如 BTC-USDT" },
                  side: { type: "string", description: "buy=买入 / sell=卖出", enum: ["buy", "sell"] },
                  px: { type: "string", description: "限价（价格）" },
                  sz: { type: "string", description: "数量" },
                  confirmed: { type: "boolean", description: "是否确认下单，首次调用不要传这个，确认后再传 true" },
                },
                required: ["instId", "side", "px", "sz"],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "trade_cancel_order",
              description: "撤销一笔未成交的委托单",
              parameters: {
                type: "object",
                properties: {
                  instId: { type: "string", description: "交易对，如 BTC-USDT" },
                  ordId: { type: "string", description: "订单ID" },
                },
                required: ["instId", "ordId"],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "trade_get_order",
              description: "查询委托单状态",
              parameters: {
                type: "object",
                properties: {
                  instId: { type: "string", description: "交易对，如 BTC-USDT" },
                  ordId: { type: "string", description: "订单ID" },
                },
                required: ["instId", "ordId"],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "trade_get_balance",
              description: "查询账户余额和资产分布",
              parameters: {
                type: "object",
                properties: {},
              },
            },
          },
          {
            type: "function",
            function: {
              name: "trade_get_positions",
              description: "查询当前持仓（合约）",
              parameters: {
                type: "object",
                properties: {},
              },
            },
          },
        ];

        const tradeFuncs = {
          trade_place_limit_order: async (args: any) => {
            try {
              const res = await fetch(TRADE_WORKER_URL + "/api/call", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tool: "trade_place_limit_order", params: args }),
              });
              return res.json();
            } catch (e) { return { error: String(e) }; }
          },
          trade_cancel_order: async (args: any) => {
            try {
              const res = await fetch(TRADE_WORKER_URL + "/api/call", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tool: "trade_cancel_order", params: args }),
              });
              return res.json();
            } catch (e) { return { error: String(e) }; }
          },
          trade_get_order: async (args: any) => {
            try {
              const res = await fetch(TRADE_WORKER_URL + "/api/call", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tool: "trade_get_order", params: args }),
              });
              return res.json();
            } catch (e) { return { error: String(e) }; }
          },
          trade_get_balance: async (args: any) => {
            try {
              const res = await fetch(TRADE_WORKER_URL + "/api/call", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tool: "trade_get_balance", params: {} }),
              });
              return res.json();
            } catch (e) { return { error: String(e) }; }
          },
          trade_get_positions: async (args: any) => {
            try {
              const res = await fetch(TRADE_WORKER_URL + "/api/call", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tool: "trade_get_positions", params: {} }),
              });
              return res.json();
            } catch (e) { return { error: String(e) }; }
          },
        };

        const okxFuncs = {
          get_ticker: async (args: any) => {
            try {
              const res = await fetch(OKX_WORKER_URL + "/api/ticker?instId=" + encodeURIComponent(args.instId));
              const data = await res.json();
              return data;
            } catch (e) { return { error: String(e) }; }
          },
          get_candles: async (args: any) => {
            try {
              const bar = args.bar || "1H";
              const limit = args.limit || 20;
              const res = await fetch(OKX_WORKER_URL + "/api/candles?instId=" + encodeURIComponent(args.instId) + "&bar=" + bar + "&limit=" + limit);
              const data = await res.json();
              return data;
            } catch (e) { return { error: String(e) }; }
          },
          get_orderbook: async (args: any) => {
            try {
              const size = args.size || 20;
              const res = await fetch(OKX_WORKER_URL + "/api/orderbook?instId=" + encodeURIComponent(args.instId) + "&size=" + size);
              const data = await res.json();
              return data;
            } catch (e) { return { error: String(e) }; }
          },
          get_funding_rate: async (args: any) => {
            try {
              const res = await fetch(OKX_WORKER_URL + "/api/funding?instId=" + encodeURIComponent(args.instId));
              const data = await res.json();
              return data;
            } catch (e) { return { error: String(e) }; }
          },
          get_market_overview: async (args: any) => {
            try {
              const res = await fetch(OKX_WORKER_URL + "/api/overview?instId=" + encodeURIComponent(args.instId));
              const data = await res.json();
              return data;
            } catch (e) { return { error: String(e) }; }
          },
        };

        const pluginData: any = usePluginStore.getState().getAsTools(
            useChatStore.getState().currentSession().mask?.plugin || [],
          );
          const tools: any[] = pluginData[0] || [];
          const funcs: any = pluginData[1] || {};
          tools.push(...okxTools, ...tradeTools);
          Object.assign(funcs, okxFuncs, tradeFuncs);
        return streamWithThink(
          chatPath,
          requestPayload,
          getHeaders(),
          tools as any,
          funcs,
          controller,
          // parseSSE
          (text: string, runTools: ChatMessageTool[]) => {
            // console.log("parseSSE", text, runTools);
            const json = JSON.parse(text);
            const choices = json.choices as Array<{
              delta: {
                content: string | null;
                tool_calls: ChatMessageTool[];
                reasoning_content: string | null;
              };
            }>;
            const tool_calls = choices[0]?.delta?.tool_calls;
            if (tool_calls?.length > 0) {
              const index = tool_calls[0]?.index;
              const id = tool_calls[0]?.id;
              const args = tool_calls[0]?.function?.arguments;
              if (id) {
                runTools.push({
                  id,
                  type: tool_calls[0]?.type,
                  function: {
                    name: tool_calls[0]?.function?.name as string,
                    arguments: args,
                  },
                });
              } else {
                // @ts-ignore
                runTools[index]["function"]["arguments"] += args;
              }
            }
            const reasoning = choices[0]?.delta?.reasoning_content;
            const content = choices[0]?.delta?.content;

            // Skip if both content and reasoning_content are empty or null
            if (
              (!reasoning || reasoning.length === 0) &&
              (!content || content.length === 0)
            ) {
              return {
                isThinking: false,
                content: "",
              };
            }

            if (reasoning && reasoning.length > 0) {
              return {
                isThinking: true,
                content: reasoning,
              };
            } else if (content && content.length > 0) {
              return {
                isThinking: false,
                content: content,
              };
            }

            return {
              isThinking: false,
              content: "",
            };
          },
          // processToolMessage, include tool_calls message and tool call results
          (
            requestPayload: RequestPayload,
            toolCallMessage: any,
            toolCallResult: any[],
          ) => {
            // @ts-ignore
            requestPayload?.messages?.splice(
              // @ts-ignore
              requestPayload?.messages?.length,
              0,
              toolCallMessage,
              ...toolCallResult,
            );
          },
          options,
        );
      } else {
        const res = await fetch(chatPath, chatPayload);
        clearTimeout(requestTimeoutId);

        const resJson = await res.json();
        const message = this.extractMessage(resJson);
        options.onFinish(message, res);
      }
    } catch (e) {
      console.log("[Request] failed to make a chat request", e);
      options.onError?.(e as Error);
    }
  }
  async usage() {
    return {
      used: 0,
      total: 0,
    };
  }

  async models(): Promise<LLMModel[]> {
    return [];
  }
}
