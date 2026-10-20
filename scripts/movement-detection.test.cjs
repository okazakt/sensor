'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../script.js'), 'utf8');
function fixture() {
  const c = { appState: { isWalking:false, lastWalkTimestamp:0, lastMovementHeadingTimestamp:null,
    movementCandidate:null, stopCandidate:null, locationHistory:[], compassSource:'absolute',
    compassAccuracy:10, compassNeedsCalibration:false, filteredCompassHeading:90, lastCompassTimestamp:10000 },
    getDistance:(a,b,x,y)=>Math.hypot(x-a,y-b), getBearing:()=>90,
    headingDelta:(a,b)=>((a-b+540)%360)-180 };
  vm.runInNewContext(source.slice(source.indexOf('function enterStoppedState'),source.indexOf('function onDeviceOrientation')),c);
  return c;
}
const fix = (speed, heading=null, accuracy=5) => ({speed,heading,accuracy});
test('0.8m/sで2秒確認し、GPS方位なしでも新鮮なコンパスを使用する',()=>{
  const c=fixture();
  assert.equal(c.determineMovementHeading(fix(.8),{lat:0,lng:0},10000),null);
  c.appState.lastCompassTimestamp=12000;
  assert.equal(c.determineMovementHeading(fix(.8),{lat:1.6,lng:0},12000),90);
  assert.equal(c.appState.isWalking,true);
  assert.equal(c.appState.lastMovementHeadingTimestamp,null);
});
test('速度が十分なら方位情報がなくても歩行を確認するが不正確・古い方位を返さない',()=>{
  for(const setup of [{lastCompassTimestamp:0},{compassAccuracy:60},{compassNeedsCalibration:true}]){
    const c=fixture();Object.assign(c.appState,setup);
    c.determineMovementHeading(fix(.9),{lat:0,lng:0},10000);
    assert.equal(c.determineMovementHeading(fix(.9),{lat:1.8,lng:0},12000),null);
    assert.equal(c.appState.isWalking,true);
  }
});
test('低速・低精度GPS・方向の大きな変化では歩行を開始しない',()=>{
  for(const coords of [fix(.79,90),fix(1,90,26)]){
    const c=fixture();c.determineMovementHeading(coords,{lat:0,lng:0},10000);
    c.determineMovementHeading(coords,{lat:2,lng:0},12000);assert.equal(c.appState.isWalking,false);
  }
  const c=fixture();c.determineMovementHeading(fix(1,90),{lat:0,lng:0},10000);
  c.determineMovementHeading(fix(1,180),{lat:2,lng:0},12000);assert.equal(c.appState.isWalking,false);
});
test('明示された停止速度はGPSの位置ぶれで上書きせず、停止確認で無効化する',()=>{
  const c=fixture();
  c.determineMovementHeading(fix(.8,90),{lat:0,lng:0},10000);
  c.determineMovementHeading(fix(.8,90),{lat:2,lng:0},12000);
  c.determineMovementHeading(fix(0),{lat:2,lng:0},13000);
  c.determineMovementHeading(fix(0),{lat:2,lng:0},14000);
  assert.equal(c.appState.isWalking,false);
});
