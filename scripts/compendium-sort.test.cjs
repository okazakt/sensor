'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../script.js'), 'utf8');
function fixture(extra = {}) {
  const context = vm.createContext({ currentLang: 'ja', ...extra });
  vm.runInContext(source.slice(source.indexOf('function compendiumCategoryId'), source.indexOf('function renderHistoryList')), context);
  return context;
}
test('distance includes zero, unknown stays last in either direction; name and category sort', () => {
  const c = fixture();
  const items = [{ name: 'い', calcDistance: 10, categories: ['z'] }, { name: 'あ', calcDistance: 0, categories: ['a'] }, { name: 'う' }];
  const names = mode => items.slice().sort((a, b) => c.compareCompendiumItems(a, b, mode)).map(x => x.name).join('');
  assert.equal(names('near_asc'), 'あいう');
  assert.equal(names('near_desc'), 'いあう');
  assert.equal(names('name_asc'), 'あいう');
  assert.equal(names('name_desc'), 'ういあ');
  assert.equal(names('category_asc'), 'あいう');
});
test('last selection is restored on initialization and invalid stored values are ignored', () => {
  const saved = new Map();
  let changed;
  let renders = 0;
  const select = { options: [{ value: 'near_asc' }, { value: 'name_desc' }], value: 'near_asc', addEventListener: (_, fn) => { changed = fn; } };
  const c = fixture({ document: { getElementById: () => select }, localStorage: { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) } });
  c.initializeCompendiumSort('sort-all-history', () => renders++);
  select.value = 'name_desc'; changed();
  select.value = 'near_asc';
  c.initializeCompendiumSort('sort-all-history', () => renders++);
  assert.equal(select.value, 'name_desc');
  assert.equal(renders, 1);
  saved.set('sheikah_sort-all-history', 'invalid'); select.value = 'near_asc';
  c.initializeCompendiumSort('sort-all-history', () => {});
  assert.equal(select.value, 'near_asc');
});

test('multiple categories use the smallest ID without changing saved category order', () => {
  const c = fixture();
  const categories = ['tourism.sights', 'catering.restaurant', 'catering'];
  const item = { name: 'い', categories };
  assert.equal(c.compendiumCategoryId(item), 'catering');
  assert.deepEqual(categories, ['tourism.sights', 'catering.restaurant', 'catering']);
  const sameCategory = { name: 'あ', categories: ['catering'] };
  assert.ok(c.compareCompendiumItems(sameCategory, item, 'category_asc') < 0);
  assert.ok(c.compareCompendiumItems(item, { name: 'あ' }, 'category_asc') < 0);
});
