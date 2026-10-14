'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {synchronize,ASSETS}=require('./sync-asset-versions.cjs');
test('内容変更時だけ参照URLとHTMLリビジョンを更新し、未同期を検出する',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'sensor-assets-'));
 try {
 for(const asset of ASSETS)fs.writeFileSync(path.join(root,asset),'original '+asset);
 fs.writeFileSync(path.join(root,'index.html'),'<meta name="html-rev" content="99">'+ASSETS.map(a=>`<script src="${a}?v=old"></script>`).join(''));
 assert.throws(()=>synchronize(root,{check:true}),/out of sync/);
 synchronize(root);const first=fs.readFileSync(path.join(root,'index.html'),'utf8');assert.match(first,/content="01"/);
 assert.equal(synchronize(root),false);assert.equal(synchronize(root,{check:true}),false);
 fs.appendFileSync(path.join(root,'style.css'),' changed');assert.throws(()=>synchronize(root,{check:true}));
 synchronize(root);const next=fs.readFileSync(path.join(root,'index.html'),'utf8');assert.match(next,/content="02"/);
 const url=(html,asset)=>html.match(new RegExp(asset.replace('.','\\.')+'\\?v=[a-f0-9]+'))[0];
 assert.notEqual(url(next,'style.css'),url(first,'style.css'));assert.equal(url(next,'script.js'),url(first,'script.js'));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
