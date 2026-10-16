'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname,'../script.js'),'utf8');
test('詳細画面を閉じたら追加のWebGL地図を破棄し、表示中の地図は維持する', () => {
  let open = true, removed = 0, observe;
  const page = {classList:{contains:() => open}};
  const c = {detailMinimapInstance:{remove(){removed++;}}, pageSpotDetail:page,
    MutationObserver:class {constructor(callback){this.callback=callback;} observe(element,options){observe={element,options,callback:this.callback};}}};
  vm.createContext(c);
  vm.runInContext(source.slice(source.indexOf('function releaseHiddenDetailMap()'),source.indexOf('const pageAllHistory')),c);
  assert.equal(observe.element,page);
  assert.equal(observe.options.attributeFilter[0],'class');
  observe.callback();
  assert.equal(removed,0);
  open = false;
  observe.callback(); observe.callback();
  assert.equal(removed,1);
  assert.equal(c.detailMinimapInstance,null);
});
