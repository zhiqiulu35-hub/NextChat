/**
 * 全球金融数据 + 交易 代理 API
 * ==============================
 * 内置在 NextChat 中，无需外部 Worker
 * 数据源：OKX (加密货币行情+交易) + Yahoo Finance (全球股票/指数)
 *
 * 查询：
 *   POST /api/finance  → { tool: "get_ticker", params: { instId: "BTC-USDT" } }
 *
 * 交易：
 *   POST /api/finance  → { tool: "trade_place_limit_order", params: { instId: "OKB-USDT", side: "buy", px: "30", sz: "1" } }
 *   POST /api/finance  → { tool: "trade_get_balance", params: {} }
 *   POST /api/finance  → { tool: "trade_get_positions", params: {} }
 */

import { NextRequest, NextResponse } from "next/server";

// ========== API 配置 ==========

const OKX_BASE = "https://www.okx.com/api/v5";
const YAHOO_Q = "https://query1.finance.yahoo.com/v7/finance/quote";
const YAHOO_C = "https://query1.finance.yahoo.com/v8/finance/chart";
const YAHOO_S = "https://query1.finance.yahoo.com/v1/finance/search";

// OKX 交易 API 凭证
const OKX_API_KEY = "55961818-b9df-4ef1-8383-18b34c88b98e";
const OKX_SECRET_KEY = "CAB5E5297054645FFCAF65E9A62D40C6";
const OKX_PASSPHRASE = "Qq2248077246...";
const MAX_ORDER_USDT = 100; // 单笔最大 100 USDT（风控）

// ========== 数据列表 ==========

const HOT = [
  "BTC-USDT","ETH-USDT","SOL-USDT","XRP-USDT","DOGE-USDT",
  "ADA-USDT","AVAX-USDT","DOT-USDT","LINK-USDT","MATIC-USDT",
  "UNI-USDT","OKB-USDT","ATOM-USDT","TRX-USDT","APT-USDT",
  "SUI-USDT","ARB-USDT","OP-USDT","PEPE-USDT","INJ-USDT",
];

const INDICES = [
  { s:"^GSPC", n:"标普500" }, { s:"^DJI", n:"道琼斯" }, { s:"^IXIC", n:"纳斯达克" },
  { s:"^HSI", n:"恒生指数" }, { s:"000001.SS", n:"上证指数" }, { s:"^N225", n:"日经225" },
  { s:"^FTSE", n:"富时100" }, { s:"^GDAXI", n:"德国DAX" }, { s:"^FCHI", n:"法国CAC40" },
  { s:"^STI", n:"新加坡海峡" }, { s:"^AXJO", n:"澳洲ASX200" }, { s:"^BSESN", n:"印度Sensex" },
  { s:"^KS11", n:"韩国KOSPI" }, { s:"^TWII", n:"台湾加权" },
];

const SECTORS = [
  { s:"XLK", n:"科技" }, { s:"XLF", n:"金融" }, { s:"XLV", n:"医疗" },
  { s:"XLE", n:"能源" }, { s:"XLI", n:"工业" }, { s:"XLP", n:"必需消费" },
  { s:"XLY", n:"可选消费" }, { s:"XLU", n:"公用事业" }, { s:"SMH", n:"半导体" },
  { s:"IBB", n:"生物科技" }, { s:"QQQ", n:"纳斯达克100" }, { s:"GLD", n:"黄金" },
];

const CORS = { "Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type" };

// ========== 路由处理 ==========

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const tool = body.tool || body.name;
    const params = body.params || body.arguments || body.args || {};
    if (!tool) return NextResponse.json({ error: "缺少 tool 名称" }, { status: 400, headers: CORS });
    const data = await exec(tool, params);
    return NextResponse.json({ success: true, data }, { headers: CORS });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500, headers: CORS });
  }
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const params: Record<string,any> = {};
    url.searchParams.forEach((v,k) => { params[k] = isNaN(Number(v)) ? v : Number(v); });
    const tool = params.tool;
    if (!tool) {
      return NextResponse.json({
        help: true,
        usage: {
          crypto: "GET /api/finance?tool=get_ticker&instId=BTC-USDT",
          stock: "GET /api/finance?tool=get_stock_quote&symbol=AAPL",
          trade: "POST /api/finance with JSON body { tool, params }",
          balance: "POST /api/finance { tool:'trade_get_balance', params:{} }",
        }
      }, { headers: CORS });
    }
    const data = await exec(tool, params);
    return NextResponse.json({ success: true, data }, { headers: CORS });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500, headers: CORS });
  }
}

// ========== 工具执行器 ==========

async function exec(tool: string, p: Record<string,any>) {
  switch (tool) {

    // ---- 加密货币行情 ----
    case "get_ticker": case "ticker": {
      req(p,["instId"]);
      return fmtTicker(await okxPub(`/market/ticker?instId=${e(p.instId)}`));
    }
    case "get_candles": case "candles": {
      req(p,["instId"]);
      return fmtCandles(await okxPub(`/market/candles?instId=${e(p.instId)}&bar=${p.bar||"1H"}&limit=${Math.min(p.limit||20,300)}`), p.instId, p.bar||"1H");
    }
    case "get_orderbook": case "orderbook": {
      req(p,["instId"]);
      return fmtBook(await okxPub(`/market/books?instId=${e(p.instId)}&sz=${Math.min(p.size||20,400)}`));
    }
    case "get_funding_rate": case "funding": {
      req(p,["instId"]);
      return fmtFunding(await okxPub(`/public/funding-rate?instId=${e(p.instId)}`));
    }
    case "get_market_overview": case "overview": {
      req(p,["instId"]);
      const id = p.instId;
      const [tk,cl,ob] = await Promise.all([
        okxPub(`/market/ticker?instId=${e(id)}`).catch(()=>null),
        okxPub(`/market/candles?instId=${e(id)}&bar=1D&limit=7`).catch(()=>null),
        okxPub(`/market/books?instId=${e(id)}&sz=10`).catch(()=>null),
      ]);
      return { summary: fmtTicker(tk), trend: cl?fmtCandles(cl,id,"1D"):null, depth: ob?fmtBook(ob):null };
    }
    case "get_hot_cryptos": case "hot": {
      const r = [];
      for (let i=0;i<HOT.length;i+=5) {
        const batch = HOT.slice(i,i+5);
        const br = await Promise.all(batch.map(s=>okxPub(`/market/ticker?instId=${e(s)}`).then(fmtTicker).catch(()=>null)));
        r.push(...br.filter(Boolean));
      }
      return { coins: r };
    }

    // ---- 股票/指数 ----
    case "get_stock_quote": case "stock": case "quote": {
      req(p,["symbol"]);
      return await yq(p.symbol);
    }
    case "get_stock_chart": case "chart": {
      req(p,["symbol"]);
      return await yc(p.symbol, p.range||"1mo", p.interval||gi(p.range||"1mo"));
    }
    case "search_securities": case "search": {
      req(p,["keyword"]);
      return await ys(p.keyword, Math.min(p.limit||8,20));
    }
    case "get_major_indices": case "indices": {
      const syms = INDICES.map(x=>x.s).join(",");
      const q = await yq(syms);
      return { indices: INDICES.map((x,i)=>({ name:x.n, symbol:x.s, quote:q.results?.[i]||null })) };
    }
    case "get_sector_performance": case "sectors": {
      const syms = SECTORS.map(x=>x.s).join(",");
      const q = await yq(syms);
      return { sectors: SECTORS.map((x,i)=>({ name:x.n, symbol:x.s, quote:q.results?.[i]||null })) };
    }

    // ---- 交易功能 ----
    case "trade_place_limit_order": case "place_order": case "buy": case "sell": {
      req(p,["instId","side","px","sz"]);
      return await placeLimitOrder(p);
    }
    case "trade_cancel_order": case "cancel_order": {
      req(p,["instId","ordId"]);
      return await cancelOrder(p.instId, p.ordId);
    }
    case "trade_get_order": case "get_order": {
      req(p,["instId","ordId"]);
      return await getOrder(p.instId, p.ordId);
    }
    case "trade_get_balance": case "balance": case "get_balance": {
      return await getBalance();
    }
    case "trade_get_positions": case "positions": case "get_positions": {
      return await getPositions();
    }

    default: throw new Error(`未知工具: ${tool}`);
  }
}

// ========== OKX 公开 API（无需签名） ==========

async function okxPub(path: string) {
  const c = new AbortController();
  const t = setTimeout(()=>c.abort(),10000);
  try {
    const r = await fetch(`${OKX_BASE}${path}`, { signal:c.signal, headers:{Accept:"application/json"} });
    if (!r.ok) throw new Error(`OKX ${r.status}`);
    const b = await r.json();
    if (b.code !== "0") throw new Error(b.msg);
    return b.data;
  } finally { clearTimeout(t); }
}

// ========== OKX 签名 API（交易等需要身份验证的操作） ==========

async function okxSign(timestamp: string, method: string, requestPath: string, body: string): Promise<string> {
  const message = timestamp + method + requestPath + body;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(OKX_SECRET_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function okxAuth(method: string, requestPath: string, body: string = "") {
  const timestamp = new Date().toISOString().slice(0, -5) + "Z";
  const signature = await okxSign(timestamp, method, requestPath, body);

  const headers = {
    "OK-ACCESS-KEY": OKX_API_KEY,
    "OK-ACCESS-SIGN": signature,
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": OKX_PASSPHRASE,
    "Content-Type": "application/json",
  };

  const c = new AbortController();
  const t = setTimeout(()=>c.abort(),10000);
  try {
    const r = await fetch(`${OKX_BASE}${requestPath}`, {
      method, headers, body: body || undefined,
      signal: c.signal,
    });
    const json = await r.json();
    if (json.code !== "0") throw new Error(json.msg || JSON.stringify(json));
    return json;
  } finally { clearTimeout(t); }
}

// ========== 交易功能实现 ==========

async function placeLimitOrder(p: Record<string,any>) {
  const side = p.side.toLowerCase();
  if (side !== "buy" && side !== "sell") throw new Error("side 必须是 buy 或 sell");

  const orderValue = parseFloat(p.px) * parseFloat(p.sz);

  // 风控检查
  if (orderValue > MAX_ORDER_USDT) {
    return {
      warning: true,
      message: `⚠️ 订单金额 $${orderValue.toFixed(2)} 超过单笔上限 $${MAX_ORDER_USDT}`,
      max_order_usdt: MAX_ORDER_USDT,
      order_value_usd: orderValue.toFixed(2),
    };
  }

  // 未确认时返回预览
  if (p.confirmed !== true && p.confirmed !== "true") {
    return {
      requires_confirmation: true,
      preview: {
        action: side === "buy" ? "买入" : "卖出",
        instId: p.instId,
        price: p.px,
        amount: p.sz,
        estimated_value_usd: `$${orderValue.toFixed(2)}`,
        order_type: "限价单",
      },
      message: `请确认：${side === "buy" ? "买入" : "卖出"} ${p.sz} ${p.instId}，限价 $${p.px}，预估 $${orderValue.toFixed(2)}`,
      hint: '确认请将 confirmed 设为 true，如: { ... params: { ..., confirmed: true } }',
    };
  }

  // 执行下单
  const body = JSON.stringify({
    instId: p.instId.toUpperCase(),
    tdMode: "cash",
    side: side,
    ordType: "limit",
    px: String(p.px),
    sz: String(p.sz),
  });

  const result = await okxAuth("POST", "/api/v5/trade/order", body);
  const orderId = result.data?.[0]?.ordId;

  return {
    success: true,
    orderId,
    instId: p.instId,
    side,
    price: p.px,
    amount: p.sz,
    state: "已提交",
    message: `✅ 已提交${side === "buy" ? "买入" : "卖出"}委托：${p.sz} ${p.instId}，限价 $${p.px}`,
  };
}

async function cancelOrder(instId: string, ordId: string) {
  const body = JSON.stringify({ instId: instId.toUpperCase(), ordId });
  const result = await okxAuth("POST", "/api/v5/trade/cancel-order", body);
  return { success: true, message: `✅ 已撤销订单 ${ordId}` };
}

async function getOrder(instId: string, ordId: string) {
  const result = await okxAuth("GET", `/api/v5/trade/order?instId=${e(instId.toUpperCase())}&ordId=${e(ordId)}`);
  return { order: result.data?.[0] || null };
}

async function getBalance() {
  const result = await okxAuth("GET", "/api/v5/account/balance");
  const details = (result.data?.[0]?.details || []).map((d:any) => ({
    currency: d.ccy,
    balance: d.bal,
    frozen: d.frozen,
    available: d.availBal,
    usdt_value: d.eqUsd,
  }));

  return {
    total_usdt: result.data?.[0]?.totalEq,
    details,
    summary: details.map((d:any) => `${d.currency}: ${d.balance} (≈ $${d.usdt_value || "0"})`).join(" | "),
  };
}

async function getPositions() {
  const result = await okxAuth("GET", "/api/v5/account/positions");
  return {
    positions: (result.data || []).map((p:any) => ({
      instId: p.instId,
      pos: p.pos,
      avgPx: p.avgPx,
      markPx: p.markPx,
      upl: p.upl,
      margin: p.margin,
    })),
  };
}

// ========== Yahoo Finance API ==========

async function yq(s: string) {
  const r = await ft(`${YAHOO_Q}?symbols=${e(s)}`);
  const b = await r.json();
  return { results: (b.quoteResponse?.result||[]).map(fyq), total: (b.quoteResponse?.result||[]).length };
}

async function yc(sym: string, rng: string, intv: string) {
  const r = await ft(`${YAHOO_C}/${e(sym)}?range=${rng}&interval=${intv}`);
  const b = await r.json();
  const cd = b.chart?.result?.[0];
  if (!cd) throw new Error(`无数据: ${sym}`);
  const m = cd.meta||{}, q = cd.indicators?.quote?.[0]||{}, ts = cd.timestamp||[];
  const ohlcv = ts.map((ts:number,i:number)=>({
    date: new Date(ts*1000).toISOString(), open: q.open?.[i], high: q.high?.[i],
    low: q.low?.[i], close: q.close?.[i], volume: q.volume?.[i],
  })).filter((d:any)=>d.close!==null);
  return { symbol:m.symbol||sym, currency:m.currency, exchange:m.exchangeName,
    instrumentType:m.instrumentType, price:m.regularMarketPrice, previousClose:m.previousClose,
    range:rng, interval:intv, count:ohlcv.length, data:ohlcv };
}

async function ys(kw: string, lim: number) {
  const r = await ft(`${YAHOO_S}?q=${e(kw)}&count=${lim}`);
  const b = await r.json();
  return { keyword:kw, results:(b.quotes||[]).map((x:any)=>({
    symbol:x.symbol, name:x.shortname||x.longname||x.name, exchange:x.exchange, type:x.quoteType||""
  })) };
}

async function ft(url: string) {
  const c = new AbortController();
  const t = setTimeout(()=>c.abort(),10000);
  try {
    return await fetch(url, { signal:c.signal, headers:{"User-Agent":"Mozilla/5.0","Accept":"application/json"} });
  } finally { clearTimeout(t); }
}

// ========== 格式化 ==========

function fmtTicker(d: any) {
  if (!d||!d[0]) return null;
  const t = d[0];
  const last = parseFloat(t.last||"0"), open = parseFloat(t.open24h||t.last||"1");
  return { type:"crypto", pair:t.instId, price:t.last, bid:t.bidPx, ask:t.askPx,
    change24h:t.change24h, changePct:open>0?(((last-open)/open)*100).toFixed(2)+"%":"0%",
    high:t.high24h, low:t.low24h, vol:t.vol24h, volUsd:t.volCcy24h, ts:t.ts };
}

function fmtCandles(d: any, id: string, bar: string) {
  if (!d||!d.length) return null;
  return { type:"crypto", pair:id, bar, candles:d.map((c:string[])=>({
    time:c[0], open:c[1], high:c[2], low:c[3], close:c[4], vol:c[5] })) };
}

function fmtBook(d: any) {
  if (!d||!d[0]) return null;
  const b = d[0];
  return { asks:(b.asks||[]).slice(0,10).map((a:string[])=>({p:a[0],a:a[1]})),
    bids:(b.bids||[]).slice(0,10).map((a:string[])=>({p:a[0],a:a[1]})) };
}

function fmtFunding(d: any) {
  if (!d||!d[0]) return null;
  const f = d[0];
  return { pair:f.instId, rate:f.fundingRate, nextTime:f.fundingTime, est:f.estimatedRate };
}

function fyq(item: any) {
  const ch = item.regularMarketChange, cp = item.regularMarketChangePercent;
  return { type:"stock", symbol:item.symbol, name:item.shortName||item.longName||item.symbol,
    exchange:item.exchange, quoteType:item.quoteType, price:item.regularMarketPrice,
    change:ch, changePct:cp, changePctStr:cp!=null?`${cp>=0?"+":""}${cp.toFixed(2)}%`:null,
    marketState:item.marketState, afterHours:item.postMarketPrice, preMarket:item.preMarketPrice,
    marketCap:item.marketCap, marketCapStr:item.marketCap?fmc(item.marketCap):null,
    pe:item.trailingPE||item.forwardPE, divYield:item.dividendYield?`${(item.dividendYield*100).toFixed(2)}%`:null,
    wkHigh:item.fiftyTwoWeekHigh, wkLow:item.fiftyTwoWeekLow, vol:item.regularMarketVolume,
    avgVol:item.averageDailyVolume3Month, ts:item.regularMarketTime };
}

function fmc(cap: number) {
  return cap>=1e12?`$${(cap/1e12).toFixed(2)}T`:cap>=1e9?`$${(cap/1e9).toFixed(2)}B`:`$${(cap/1e6).toFixed(2)}M`;
}

// ========== 工具函数 ==========

function req(p: Record<string,any>, ks: string[]) {
  const missing = ks.filter(k=>!p[k]&&p[k]!==0);
  if (missing.length) throw new Error(`缺少参数: ${missing.join(",")}`);
}

function e(s: string) { return encodeURIComponent(s); }
function gi(r: string) { const m:Record<string,string>={"1d":"5m","5d":"15m","1mo":"1h","3mo":"1d","6mo":"1d","1y":"1d","2y":"1wk","5y":"1wk",max:"1mo"}; return m[r]||"1d"; }
