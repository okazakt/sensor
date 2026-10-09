'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'../script.js'),'utf8');
function fixture() {
  const watches = [], cleared = [], positions = [], errors = [];
  const c = { watchId:null, locationWatchGeneration:0, navigator:{geolocation:{
    watchPosition(success,error,options){watches.push({success,error,options});return watches.length-1;},
    clearWatch(id){cleared.push(id);}
  }},onPositionUpdate:pos=>positions.push(pos),reportGpsError:error=>errors.push(error) };
  vm.createContext(c);
  vm.runInContext(source.slice(source.indexOf('function startLocationWatch'),source.indexOf('function getDistance')),c);
  return {c,watches,cleared,positions,errors};
}
test('拒否され終了した監視を再作成し、位置更新を再開する（監視ID 0にも対応）',()=>{
  const {c,watches,cleared,positions}=fixture();
  c.startLocationWatch();
  watches[0].error({code:1});
  assert.equal(c.watchId,null);
  assert.deepEqual(cleared,[0]);
  c.startLocationWatch();
  watches[1].success({coords:{latitude:35,longitude:139}});
  assert.equal(positions.length,1);
  assert.equal(c.watchId,1);
});
test('監視の再開後、古い監視からのエラーや座標で状態を上書きしない',()=>{
  const {c,watches,cleared,positions,errors}=fixture();
  c.startLocationWatch();c.startLocationWatch();
  watches[0].error({code:1});watches[0].success({old:true});
  watches[1].success({new:true});
  assert.deepEqual(cleared,[0]);
  assert.equal(errors.length,0);
  assert.equal(positions.length,1);
  assert.equal(c.watchId,1);
});
test('HTTPでの公開サイトアクセスはパス・クエリ・ハッシュを保持してHTTPSへ転送する',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const run=(href)=>{
    const location=new URL(href);let redirect;
    location.replace=url=>{redirect=url;};
    vm.runInNewContext(script,{location,URL});return redirect;
  };
  assert.equal(run('http://sensorchallenge.xyz/?test=1#map'),'https://sensorchallenge.xyz/?test=1#map');
  assert.equal(run('https://sensorchallenge.xyz/'),undefined);
  assert.equal(run('http://localhost:8765/'),undefined);
});
