'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { IDBFactory } = require('fake-indexeddb');
const source = fs.readFileSync(require('node:path').join(__dirname, '../app-storage.js'), 'utf8');
const spot = id => ({ id, name: '店'+id, lat:35, lng:139, date:'2026-10-14', keyword:'カフェ', keywords:['カフェ'], muted:true,
 geometry:{type:'Polygon',coordinates:[[[139,35],[140,35],[140,36],[139,35]]]}, formatted_address:'住所'+id, phone:'03-1234', website:'https://example.com' });
function fixture(initial = { keywordHistory:{'カフェ':{}}, arrivals:[spot('a'),spot('b')], completedChallenges:[] }) {
 const indexedDB = new IDBFactory(), values = new Map([['sheikah_db_v1',JSON.stringify(initial)]]), errors=[];
 const localStorage = { getItem:key=>values.get(key)||null, setItem:(key,value)=>values.set(key,value) };
 const c={structuredClone}; vm.createContext(c); vm.runInContext(source,c);
 const create=()=>c.SensorStorage.create({indexedDB,localStorage,onError:e=>errors.push(e)});
 return {create,indexedDB,localStorage,values,errors,legacy:values.get('sheikah_db_v1')};
}
test('自動移行は原本を保持し、一覧と詳細を分離して再起動時に二重移行しない',async()=>{
 const f=fixture(),s=f.create(); await s.initialize(); assert.equal(s.mode,'indexeddb');
 assert.equal(f.values.get('sheikah_db_v1'),f.legacy);
 const db=s.read(); assert.equal(db.arrivals.length,2); assert.equal(db.arrivals[0].geometry,undefined);
 assert.equal(db.arrivals[0].formatted_address,undefined);
 const detail=await s.detail('a'); assert.equal(detail.formatted_address,'住所a'); assert.ok(detail.geometry);
 assert.equal(s.detection().length,2); const clone=s.read(); clone.arrivals[0].muted=false;
 assert.equal(s.read().arrivals[0].muted,true); // Reads do not share mutable objects.
 await s.save(clone); const restarted=f.create(); await restarted.initialize();
 assert.equal(restarted.read().arrivals[0].muted,false); assert.equal(f.values.get('sheikah_db_v1'),f.legacy);
});
test('古い一覧からの更新は別の変更を消さず、表示用距離を永続化しない',async()=>{
 const f=fixture(),s=f.create(); await s.initialize(); const a=s.read(),b=s.read();
 a.arrivals[0].name='新名称'; a.arrivals[0].calcDistance=123; await s.save(a);
 b.arrivals[1].muted=false; await s.save(b);
 assert.equal(s.read().arrivals[0].name,'新名称'); assert.equal(s.read().arrivals[0].calcDistance,undefined);
 assert.equal(s.read().arrivals[1].muted,false); assert.ok((await s.detail('a')).geometry);
});
test('削除を古い一覧が復活させず、個別詳細も削除する',async()=>{
 const f=fixture(),s=f.create(); await s.initialize(); const stale=s.read(),db=s.read();
 db.arrivals=db.arrivals.filter(item=>item.id!=='a'); await s.save(db);
 stale.arrivals[1].muted=false; await s.save(stale);
 assert.equal(s.read().arrivals.length,1); assert.equal(await s.detail('a'),undefined);
});
test('新規到達・地形更新と一括復元を保存し、完全なデータをエクスポートする',async()=>{
 const f=fixture(),s=f.create(); await s.initialize(); const db=s.read(); db.arrivals.push(spot('c')); await s.save(db);
 assert.ok((await s.detail('c')).geometry);
 const full=await s.exportData(); full.arrivals=full.arrivals.filter(item=>item.id==='c'); full.arrivals[0].formatted_address='変更住所';
 await s.save(full,{replace:true}); assert.equal(s.read().arrivals.length,1);
 assert.equal((await s.exportData()).arrivals[0].formatted_address,'変更住所'); assert.equal(await s.detail('a'),undefined);
});
test('試用中の履歴をlocalStorageへ書き戻して切り戻し、IndexedDBを削除しない',async()=>{
 const f=fixture(),s=f.create(); await s.initialize(); const db=s.read();db.arrivals.push(spot('c'));await s.save(db);
 assert.equal(await s.rollbackToLocalStorage(),3);assert.equal(s.mode,'local');
 assert.equal(JSON.parse(f.values.get('sheikah_db_v1')).arrivals.length,3);
 assert.equal(f.values.get('sheikah_storage_mode'),'local');
 const restarted=f.create();await restarted.initialize();assert.equal(restarted.mode,'local');
});
test('切り戻しが容量不足で失敗した場合はIndexedDBを継続する',async()=>{
 const f=fixture(),s=f.create(); await s.initialize();
 f.localStorage.setItem=()=>{throw new Error('QuotaExceededError');};
 await assert.rejects(s.rollbackToLocalStorage(),/Quota/);assert.equal(s.mode,'indexeddb');
 assert.equal(f.values.get('sheikah_db_v1'),f.legacy);
});
test('IndexedDBが利用できない環境では既存保存へフォールバックする',async()=>{
 const f=fixture();const c={structuredClone};vm.createContext(c);vm.runInContext(source,c);
 const s=c.SensorStorage.create({indexedDB:null,localStorage:f.localStorage});await s.initialize();
 assert.equal(s.mode,'local');const db=s.read();db.arrivals[0].muted=false;await s.save(db);
 assert.equal(JSON.parse(f.values.get('sheikah_db_v1')).arrivals[0].muted,false);
});
test('別タブの更新後は古いタブの保存を拒否して確定データを保持する',async()=>{
 const f=fixture(),a=f.create(),b=f.create();await a.initialize();await b.initialize();
 const first=a.read();first.arrivals[0].name='確定';await a.save(first);
 const stale=b.read();stale.arrivals[0].name='古い';await assert.rejects(b.save(stale));await b.flush();
 assert.equal(f.errors.length,1);const c=f.create();await c.initialize();assert.equal(c.read().arrivals[0].name,'確定');
 assert.equal(f.values.get('sheikah_db_v1'),f.legacy);
});
test('保存失敗は一覧・探知・詳細をまとめて取り消し、次の保存も停止する',async()=>{
 const f=fixture(),s=f.create();await s.initialize();
 // Simulate failure in the persisted revision check without touching application data.
 const request=f.indexedDB.open('sensor_challenge_v1',1);
 const connection=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
 const tx=connection.transaction('management','readwrite');tx.objectStore('management').put({key:'revision',value:999});
 await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});connection.close();
 const db=s.read();db.arrivals[0].muted=false;db.arrivals[0].geometry=null;
 await assert.rejects(s.save(db));await s.flush();
 assert.equal(s.read().arrivals[0].muted,true);assert.ok((await s.detail('a')).geometry);
 await assert.rejects(s.save(s.read()));assert.equal(f.values.get('sheikah_db_v1'),f.legacy);
});
test('待たずに連続保存しても順序を保ち、関連情報を失わない',async()=>{
 const f=fixture(),s=f.create();await s.initialize();const a=s.read(),b=s.read();
 a.arrivals[0].keywords.push('公園');a.completedChallenges.push('one');
 b.arrivals[0].keywords.push('店');b.completedChallenges.push('two');
 await Promise.all([s.save(a),s.save(b)]);
 assert.deepEqual([...s.read().arrivals[0].keywords],['カフェ','公園','店']);
 assert.deepEqual([...s.read().completedChallenges],['one','two']);
});
test('同時初回起動でも移行は重複せず、原本と300件を保持する',async()=>{
 const f=fixture({keywordHistory:{},arrivals:Array.from({length:300},(_,i)=>spot(String(i)))});
 const a=f.create(),b=f.create();await Promise.all([a.initialize(),b.initialize()]);
 assert.equal(a.read().arrivals.length,300);assert.equal(b.read().arrivals.length,300);
 assert.equal(f.values.get('sheikah_db_v1'),f.legacy);
});
test('移行済みのIndexedDBが使えない場合、古い原本へ黙って戻らない',async()=>{
 const f=fixture(),a=f.create();await a.initialize();
 const c={structuredClone};vm.createContext(c);vm.runInContext(source,c);
 const s=c.SensorStorage.create({indexedDB:null,localStorage:f.localStorage});
 await assert.rejects(s.initialize(),/unavailable/);assert.equal(f.values.get('sheikah_db_v1'),f.legacy);
});
