const pu = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '';
if (!pu) return;
try { const {ProxyAgent,setGlobalDispatcher}=require('undici'); setGlobalDispatcher(new ProxyAgent(pu)); } catch(e) { console.warn('[proxy]', e.message); }
