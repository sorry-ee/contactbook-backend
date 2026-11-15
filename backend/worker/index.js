export function validate(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('联系人必须为对象');
  const c = {};
  for (const key of ['name','notes']) {
    const value = data[key] ?? '';
    if (typeof value !== 'string' || value.length > (key==='name'?100:2000)) throw new Error('姓名最多100字，备注最多2000字');
    c[key] = value.trim();
  }
  if (!c.name) throw new Error('姓名不能为空');
  if (data.favorite !== undefined && typeof data.favorite !== 'boolean') throw new Error('收藏状态必须为布尔值');
  c.favorite = data.favorite ?? false;
  for (const key of ['phones','emails','socials','addresses']) {
    const values = data[key] ?? [];
    if (!Array.isArray(values) || values.length > 20 || values.some(v=>typeof v!=='string' || v.length>300 || /[\r\n]/.test(v))) throw new Error('每类最多20条联系方式，每条最多300字且不能含换行');
    c[key] = [...new Set(values.map(v=>v.trim()).filter(Boolean))];
  }
  return c;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cookie = request.headers.get('Cookie')?.match(/(?:^|;\s*)cb_owner=([a-f0-9]{64})(?:;|$)/)?.[1];
    const owner = cookie || Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
    const reply = (body,status=200,type='application/json; charset=utf-8') => new Response(type.startsWith('application/json')?JSON.stringify(body):body,{status,headers:{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Set-Cookie':`cb_owner=${owner}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000${url.protocol==='https:'?'; Secure':''}`}});
    if (!url.pathname.startsWith('/api/')) {
      const name = url.pathname==='/'?'index.html':url.pathname.slice(1);
      if (!Object.hasOwn(assets,name)) return reply({error:'页面不存在'},404);
      const type = name.endsWith('.css')?'text/css; charset=utf-8':name.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8';
      return reply(assets[name],200,type);
    }
    if (['POST','PUT','DELETE'].includes(request.method)) {
      if (request.headers.get('X-Requested-With')!=='ContactBook' || (request.headers.get('Origin') && request.headers.get('Origin')!==url.origin)) return reply({error:'请求来源无效'},403);
      if (Number(request.headers.get('Content-Length') || 0)>3*1024*1024) return reply({error:'请求不能超过3 MB'},413);
    }
    let input;
    if (['POST','PUT'].includes(request.method)) {
      try {
        const text = await request.text();
        if (new TextEncoder().encode(text).length>3*1024*1024) return reply({error:'请求不能超过3 MB'},413);
        input = JSON.parse(text);
      } catch { return reply({error:'请求不是有效 JSON'},400); }
    }
    try {
      if (url.pathname==='/api/contacts' && request.method==='GET') {
        const {results} = await env.DB.prepare('SELECT id,body FROM contacts WHERE owner=? ORDER BY id DESC').bind(owner).all();
        return reply(results.map(r=>({...JSON.parse(r.body),id:r.id})));
      }
      if (url.pathname==='/api/contacts' && request.method==='POST') {
        let item;
        try { item=validate(input); } catch(error) { return reply({error:error.message},400); }
        const body=JSON.stringify(item);
        const r=await env.DB.prepare('INSERT INTO contacts(owner,body,fingerprint) VALUES (?,?,?) ON CONFLICT(owner,fingerprint) DO UPDATE SET body=excluded.body RETURNING id').bind(owner,body,body).first();
        return reply({...item,id:r.id},201);
      }
      const match=url.pathname.match(/^\/api\/contacts\/(\d+)$/);
      if (match && ['PUT','DELETE'].includes(request.method)) {
        const id=Number(match[1]);
        let statement;
        if (request.method==='DELETE') statement=env.DB.prepare('DELETE FROM contacts WHERE id=? AND owner=?').bind(id,owner);
        else {
          let item;
          try { item=validate(input); } catch(error) { return reply({error:error.message},400); }
          const body=JSON.stringify(item);
          const duplicate=await env.DB.prepare('SELECT id FROM contacts WHERE owner=? AND fingerprint=? AND id<>?').bind(owner,body,id).first();
          if (duplicate) return reply({error:'已存在完全相同的联系人'},409);
          statement=env.DB.prepare('UPDATE contacts SET body=?,fingerprint=? WHERE id=? AND owner=?').bind(body,body,id,owner);
        }
        const result=await statement.run();
        return result.meta.changes?reply({ok:true}):reply({error:'联系人不存在'},404);
      }
      if (url.pathname==='/api/import' && request.method==='POST') {
        if (!Array.isArray(input) || input.length>1000) return reply({error:'每次最多导入1000位联系人'},400);
        let items;
        try { items=input.map(validate); } catch(error) { return reply({error:error.message},400); }
        const results=items.length?await env.DB.batch(items.map(item=>{const body=JSON.stringify(item); return env.DB.prepare('INSERT OR IGNORE INTO contacts(owner,body,fingerprint) VALUES (?,?,?)').bind(owner,body,body);})):[];
        const added=results.reduce((sum,r)=>sum+r.meta.changes,0);
        return reply({added,skipped:items.length-added});
      }
      return reply({error:'接口不存在'},404);
    } catch(error) {
      console.error('ContactBook database request failed',error.message);
      return reply({error:'保存失败，请稍后重试'},500);
    }
  }
};
