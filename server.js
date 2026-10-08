'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const rooms = new Map();
const MAX_ROOMS = 500;
function createServer() {
  return http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    const reply = (code, data) => { res.writeHead(code); res.end(JSON.stringify(data)); };
    if (req.method === 'GET' && req.url === '/health') return reply(200, {ok:true});
    if (req.method !== 'POST' || !['/poll','/send'].includes(req.url)) return reply(404,{error:'not_found'});
    let bytes = 0, chunks = [];
    try {
      for await (const chunk of req) { bytes += chunk.length; if (bytes > 4096) { reply(413,{error:'too_large'}); return; } chunks.push(chunk); }
      const b = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (typeof b.room !== 'string' || !/^[A-Za-z0-9_-]{16,80}$/.test(b.room) || typeof b.client !== 'string' || !/^[a-f0-9-]{36}$/.test(b.client)) return reply(400,{error:'invalid_identity'});
      const now = Date.now();
      for (const [key,r] of rooms) if (now-r.touched > 3600000) rooms.delete(key);
      const key = crypto.createHash('sha256').update(b.room).digest('hex');
      if (!rooms.has(key)) { if (rooms.size >= MAX_ROOMS) return reply(503,{error:'capacity'}); rooms.set(key,{clients:new Map(),events:[],seq:0,touched:now}); }
      const r = rooms.get(key);
      for (const [id,c] of r.clients) if (now-c.seen > 15000) r.clients.delete(id);
      if (!r.clients.has(b.client) && r.clients.size >= 2) return reply(409,{error:'room_full'});
      const c = r.clients.get(b.client) || {seen:now,lastSend:0};
      c.seen=now; r.clients.set(b.client,c); r.touched=now;
      if (req.url === '/send') {
        if (now-c.lastSend < 700) return reply(429,{error:'too_fast'});
        if (!['text','wave','jump','heart','sleep'].includes(b.type)) return reply(400,{error:'invalid_type'});
        if (b.type==='text' && (typeof b.text !== 'string' || !b.text.trim() || b.text.length>160)) return reply(400,{error:'invalid_text'});
        if (typeof b.name !== 'string' || !b.name.trim() || b.name.length>20) return reply(400,{error:'invalid_name'});
        c.lastSend=now;
        r.events.push({id:++r.seq,client:b.client,name:b.name.trim(),type:b.type,text:b.type==='text'?b.text.trim():'',time:now});
        r.events=r.events.filter(e=>now-e.time<300000).slice(-100);
        return reply(200,{ok:true});
      }
      const cursor=Number.isSafeInteger(b.cursor) && b.cursor>=0 ? b.cursor : 0;
      reply(200,{cursor:r.seq,online:r.clients.size,events:b.initial?[]:r.events.filter(e=>e.id>cursor && e.client!==b.client && now-e.time<300000)});
    } catch { if (!res.headersSent) reply(400,{error:'bad_request'}); }
  });
}
if (require.main === module) {
  const server=createServer();
  server.requestTimeout=10000; server.headersTimeout=10000;
  server.listen(Number(process.env.PORT)||8787,'0.0.0.0',()=>console.log('LinePup relay listening. Use HTTPS reverse proxy for internet access.'));
}
module.exports={createServer};
