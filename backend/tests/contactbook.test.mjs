import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import worker from '../dist/server/index.js';

function setup() {
  const sql=new DatabaseSync(':memory:');
  sql.exec(readFileSync('drizzle/0000_contacts.sql','utf8').replace('--> statement-breakpoint',''));
  function prepare(query) {
    const params=[];
    return {bind(...values){params.push(...values);return this;},async all(){return {results:sql.prepare(query).all(...params)};},async first(){return sql.prepare(query).get(...params)||null;},async run(){const r=sql.prepare(query).run(...params);return {meta:{changes:Number(r.changes)}};}};
  }
  const env={DB:{prepare,async batch(statements){sql.exec('BEGIN');try{const result=[];for(const s of statements) result.push(await s.run());sql.exec('COMMIT');return result;}catch(error){sql.exec('ROLLBACK');throw error;}}}};
  function browser() {
    let cookie='';
    return async(path,method='GET',body,headers={})=>{
      const response=await worker.fetch(new Request('https://contactbook.test'+path,{method,headers:{Cookie:cookie,'Content-Type':'application/json','X-Requested-With':'ContactBook',...headers},body:body===undefined?undefined:JSON.stringify(body)}),env);
      cookie=response.headers.get('Set-Cookie').split(';')[0];
      return {status:response.status,data:response.headers.get('Content-Type').startsWith('application/json')?await response.json():await response.text()};
    };
  }
  return {browser,sql};
}
const person={name:'林小舟',favorite:true,phones:['013800000001','05910000000'],emails:['demo@example.com','demo@example.org'],socials:['微信：demo'],addresses:['福州市示例路1号'],notes:'虚构演示'};

test('CRUD and favorites persist between requests',async()=>{
  const {browser,sql}=setup();const call=browser();
  let r=await call('/api/contacts','POST',person);assert.equal(r.status,201);const id=r.data.id;
  assert.deepEqual((await call('/api/contacts')).data[0],{...person,id});
  assert.equal((await call('/api/contacts/'+id,'PUT',{...person,favorite:false})).status,200);
  assert.equal((await call('/api/contacts')).data[0].favorite,false);
  assert.equal((await call('/api/contacts/'+id,'DELETE')).status,200);
  assert.deepEqual((await call('/api/contacts')).data,[]);sql.close();
});
test('browser ownership blocks reading and modifying another book',async()=>{
  const {browser,sql}=setup(),a=browser(),b=browser();const r=await a('/api/contacts','POST',person);
  assert.deepEqual((await b('/api/contacts')).data,[]);
  assert.equal((await b('/api/contacts/'+r.data.id,'PUT',person)).status,404);
  assert.equal((await b('/api/contacts/'+r.data.id,'DELETE')).status,404);sql.close();
});
test('import validates the entire batch before writing and deduplicates',async()=>{
  const {browser,sql}=setup(),call=browser();
  assert.equal((await call('/api/import','POST',[person,{...person,name:''}])).status,400);
  assert.deepEqual((await call('/api/contacts')).data,[]);
  assert.deepEqual((await call('/api/import','POST',[person,person])).data,{added:1,skipped:1});
  assert.deepEqual((await call('/api/import','POST',[person])).data,{added:0,skipped:1});sql.close();
});
test('input types, request guard and origin are checked',async()=>{
  const {browser,sql}=setup(),call=browser();
  assert.equal((await call('/api/contacts','POST',person,{'X-Requested-With':''})).status,403);
  assert.equal((await call('/api/contacts','POST',person,{Origin:'https://other.test'})).status,403);
  for(const invalid of [{name:''},{name:'甲',phones:'123'},{name:'甲',favorite:'yes'},{name:'甲',phones:['a\nb']}]) assert.equal((await call('/api/contacts','POST',invalid)).status,400);
  assert.equal((await call('/api/import','POST',Array(1001).fill(person))).status,400);sql.close();
});
test('all locally hosted page assets are served',async()=>{
  const {browser,sql}=setup(),call=browser();
  for(const path of ['/','/style.css','/app.js','/excel.js','/xlsx.full.min.js']) assert.equal((await call(path)).status,200);
  assert.equal((await call('/missing.js')).status,404);sql.close();
});
const context=vm.createContext({window:{},Uint8Array,ArrayBuffer,TextDecoder,TextEncoder,console});
vm.runInContext(readFileSync('public/xlsx.full.min.js','utf8'),context);
vm.runInContext(readFileSync('public/excel.js','utf8'),context);
const excel=context.window.ContactExcel;
test('real XLSX roundtrip retains leading zeros, multiple values and favorites',()=>{
  const bytes=excel.write([person]);assert.equal(new Uint8Array(bytes)[0],80);
  assert.deepEqual(JSON.parse(JSON.stringify(excel.read(bytes))),[person]);
});
test('Excel formula-like user text remains a string cell',()=>{
  const bytes=excel.write([{...person,name:'=1+1'}]);
  const book=context.XLSX.read(bytes,{type:'array'});const cell=book.Sheets[book.SheetNames[0]].A2;
  assert.equal(cell.t,'s');assert.equal(cell.v,'=1+1');assert.equal(cell.f,undefined);
});
test('Excel rejects bad headers and numeric telephone cells',()=>{
  for(const rows of [[['错误表头']],[excel.headers,['甲','否',13800000001,'','','','']]]) {
    const sheet=context.XLSX.utils.aoa_to_sheet(rows),book=context.XLSX.utils.book_new();context.XLSX.utils.book_append_sheet(book,sheet,'通讯录');
    assert.throws(()=>excel.read(context.XLSX.write(book,{type:'array',bookType:'xlsx'})));
  }
});
