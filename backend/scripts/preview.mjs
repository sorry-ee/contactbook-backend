import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync} from 'node:fs';
import worker from '../dist/server/index.js';
mkdirSync('.sites-runtime',{recursive:true});
const db=new DatabaseSync('.sites-runtime/preview.db');
if(!db.prepare("SELECT name FROM sqlite_master WHERE name='contacts'").get()) db.exec(readFileSync('drizzle/0000_contacts.sql','utf8').replace('--> statement-breakpoint',''));
function prepare(query){let values=[];return{bind(...args){values=args;return this;},async all(){return{results:db.prepare(query).all(...values)};},async first(){return db.prepare(query).get(...values)||null;},async run(){return{meta:{changes:Number(db.prepare(query).run(...values).changes)}};}};}
const env={DB:{prepare,async batch(statements){db.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());db.exec('COMMIT');return out;}catch(error){db.exec('ROLLBACK');throw error;}}}};
http.createServer(async(req,res)=>{try{const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);const response=await worker.fetch(new Request('http://127.0.0.1:8001'+req.url,{method:req.method,headers:req.headers,body:body.length?body:undefined}),env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch(error){console.error(error);res.writeHead(500);res.end('Preview error');}}).listen(8001,'127.0.0.1',()=>console.log('Local URL: http://127.0.0.1:8001'));
