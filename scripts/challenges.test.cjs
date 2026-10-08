'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').resolve(__dirname, '../script.js'), 'utf8');
function fixture(completed = []) {
  const db = { completedChallenges: completed };
  const context = { loadSavedData: () => db, currentLang: 'ja' };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('const CHALLENGE_GROUPS'), source.indexOf('const RADIUS_OPTIONS')), context);
  context.challenges = vm.runInContext('CHALLENGES', context);
  return { context, db };
}
test('15シナリオの並びと段階開放', () => {
  const { context: c, db } = fixture();
  assert.equal(c.challenges.length, 15);
  assert.equal(c.challengeName(c.challenges[0]), 'グルメ1km最寄り');
  assert.equal(c.challengeName(c.challenges[14]), 'シークレット3kmランダム');
  assert.equal(c.isChallengeAvailable(c.challenges[5]), false);
  db.completedChallenges = c.challenges.slice(0, 2).map(x => x.id);
  assert.equal(c.isChallengeAvailable(c.challenges[5]), false);
  db.completedChallenges.push(c.challenges[2].id);
  assert.equal(c.isChallengeAvailable(c.challenges[5]), true);
  assert.equal(c.isChallengeAvailable(c.challenges[10]), false);
  db.completedChallenges.push(...c.challenges.slice(5, 8).map(x => x.id));
  assert.equal(c.isChallengeAvailable(c.challenges[10]), true);
});
test('機能開放の各境界と重複・不明IDの除外', () => {
  const { context: c, db } = fixture();
  assert.equal(c.challengeProgress().target, false);
  assert.equal(c.challengeProgress().sensor, false);
  assert.equal(c.challengeProgress().maxRadius, 3000);
  db.completedChallenges.push(c.challenges[5].id, c.challenges[5].id, 'unknown');
  assert.equal(c.challengeProgress().random, 1);
  assert.equal(c.challengeProgress().target, true);
  db.completedChallenges.push(...c.challenges.slice(6, 9).map(x => x.id));
  assert.equal(c.challengeProgress().sensor, false);
  db.completedChallenges.push(c.challenges[9].id);
  assert.equal(c.challengeProgress().sensor, true);
  db.completedChallenges.push(c.challenges[10].id);
  assert.equal(c.challengeProgress().maxRadius, 10000);
  db.completedChallenges.push(c.challenges[11].id);
  assert.equal(c.challengeProgress().maxRadius, 10000);
  db.completedChallenges.push(c.challenges[12].id);
  assert.equal(c.challengeProgress().maxRadius, 50000);
  db.completedChallenges = c.challenges.map(x => x.id);
  assert.equal(c.challengeProgress().maxRadius, 100000);
});

test('チャレンジ到達一覧はIDと旧形式の日本語・英語の記録を参照する', () => {
  const { context: c } = fixture();
  vm.runInContext(source.slice(source.indexOf('function getChallengeArrivals'), source.indexOf('function openChallengeArrivals')), c);
  const db = { arrivals: [
    { id: 'ja', keyword: 'グルメ1km最寄り' },
    { id: 'en', keyword: 'Gourmet 1km Nearest' },
    { id: 'tagged', keyword: 'restaurant', challengeIds: ['nearest1-gourmet', 'random1-life'] },
    { id: 'legacy-and-tagged', keyword: 'グルメ1km最寄り', challengeIds: ['random1-life'] },
    { id: 'other', keyword: 'cafe' }
  ] };
  assert.equal(JSON.stringify(c.getChallengeArrivals(db, c.challenges[0]).map(x => x.id)),
    '["ja","en","tagged","legacy-and-tagged"]');
  assert.equal(JSON.stringify(c.getChallengeArrivals(db, c.challenges[6]).map(x => x.id)),
    '["tagged","legacy-and-tagged"]');
});
