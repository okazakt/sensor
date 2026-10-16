'use strict';
// The reference functions use these sandbox-only variables.
let audioCtx;
const appState = { isMuted: false, soundVolume: 7 };
function initAudio() {}
let context, bus, nodes = [], timers = [], generation = 0;
const $ = id => document.getElementById(id);
const catalog = [];
function add(group, id, name, description, play, duration = 2.5) {
  catalog.push({group, id, name, description, play, duration});
}
function tone(frequency, time, duration, amplitude = .3, type = 'sine', endFrequency, attack = .008) {
  const osc = context.createOscillator(), gain = context.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, time);
  if (endFrequency) osc.frequency.exponentialRampToValueAtTime(endFrequency, time + duration * .7);
  gain.gain.setValueAtTime(.0001, time);
  gain.gain.exponentialRampToValueAtTime(amplitude, time + attack);
  gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
  osc.connect(gain); gain.connect(bus);
  osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  osc.start(time); osc.stop(time + duration); nodes.push(osc, gain);
}
function echo(level) {
  if (!level) return;
  // Finite taps avoid feedback tails and make immediate stopping predictable.
  for (let i = 1; i <= 5; i++) {
    const delay = context.createDelay(2), gain = context.createGain(), filter = context.createBiquadFilter();
    delay.delayTime.value = [.0, .105, .18, .27][level] * i;
    gain.gain.value = [.0, .22, .38, .54][level] ** i;
    filter.type = 'lowpass'; filter.frequency.value = 4800 - i * 500;
    bus.connect(delay); delay.connect(filter); filter.connect(gain); gain.connect(master);
    nodes.push(delay, gain, filter);
  }
}
let master;
function drop(t, f = 1400) {
  tone(f, t, .19, .36, 'sine', f * .32);
  tone(f * 2.1, t + .012, .11, .075, 'sine', f * .8);
}
function bell(t, f = 1500) {
  [1, 2.76, 4.07].forEach((ratio, i) => tone(f * ratio, t, .85 / (1 + i * .5), .27 / (1 + i * 3)));
}
function bird(t, variant = 0) {
  const notes = variant ? [2600, 3400, 2900, 3900, 3100, 3500] : [2300, 3100, 2700];
  notes.forEach((f, i) => tone(f, t + i * .135, .105, .18, 'sine', f * (i % 2 ? .78 : 1.35), .018));
}
function melody(notes, type = 'sine', step = .17, length = .7, amplitude = .25) {
  const t = context.currentTime + .025;
  notes.forEach((f, i) => tone(f, t + step * i, i === notes.length - 1 ? length : .28, amplitude, type));
}
add('現行音', 'C01', '通常の探知音', '1750 Hz。遠距離で使う現行の音。', () => playBeep(1750));
add('現行音', 'C02', '近距離の探知音', '2100 Hz。近づいたときの現行の音。', () => playBeep(2100));
add('現行音', 'C03', '二連の探知音', '2300 → 2450 Hz、間隔85 ms。', () => {
  playBeep(2300, .07); timers.push(setTimeout(() => playBeep(2450, .07), 85));
});
add('現行音', 'C04', 'チャレンジ開始', '現行の柔らかい2音。', () => playChallengeFanfare(false));
add('現行音', 'C05', 'チャレンジ達成', '現行の上昇する4音。', () => playChallengeFanfare(true));
for (let level = 0; level <= 3; level++) {
  add('探知音 × エコー', `E0${level + 1}`, `探知音 / ${['なし', '弱', '中', '強'][level]}`, '同じ1750 Hzの音で、響きだけを比較。', () => { echo(level); playBeep(1750); });
}
for (let level = 1; level <= 3; level++) {
  add('水滴・鈴・鳥', `W0${level}`, `水滴 / エコー${['', '弱', '中', '強'][level]}`, 'ぽちゃん、と音程が下がる透明な水滴。', () => { echo(level); drop(context.currentTime + .025); });
  add('水滴・鈴・鳥', `B0${level}`, `鈴 / エコー${['', '弱', '中', '強'][level]}`, '高い倍音を重ねた、きらめく鈴の響き。', () => { echo(level); bell(context.currentTime + .025); }, 3);
}
add('水滴・鈴・鳥', 'T01', '鳥 / 短いさえずり', '短い3音。自然を感じる探知音候補。', () => bird(context.currentTime + .025));
add('水滴・鈴・鳥', 'T02', '鳥 / 軽やかなさえずり', '6音のフレーズに弱いエコー。', () => { echo(1); bird(context.currentTime + .025, 1); });
add('追加のおすすめ', 'P01', '木琴の粒', '短く丸い音。繰り返し聴く探知音に。', () => { const t = context.currentTime + .025; tone(880, t, .21, .4); tone(2640, t, .06, .1); });
add('追加のおすすめ', 'P02', '柔らかいソナー', '低めの音程と中程度のエコー。高音が苦手な場合に。', () => { echo(2); tone(660, context.currentTime + .025, .35, .34, 'sine', 720, .025); });
add('追加のおすすめ', 'P03', '風鈴の余韻', '少しずれた2つの鈴。涼しく長い響き。', () => { echo(2); const t = context.currentTime + .025; bell(t, 1200); bell(t + .19, 1610); }, 3);
add('到着音 / 8パターン', 'A01', '現行の到着音', '現行の10音上昇ファンファーレ。', () => playTreasureFanfare(), 3);
add('到着音 / 8パターン', 'A02', '現行音 ＋ 豊かなエコー', 'A01と同じ旋律。中程度のエコーで広がりを追加。', () => { echo(2); playTreasureFanfare(); }, 4);
add('到着音 / 8パターン', 'A03', 'クリスタルの祝福', '澄んだ鈴の3音。短く華やかに。', () => { echo(2); [1046.5, 1318.5, 1568].forEach((f, i) => bell(context.currentTime + .025 + i * .22, f)); }, 3);
add('到着音 / 8パターン', 'A04', '水のきらめき', '水滴が3回弾む、落ち着いた到着音。', () => { echo(2); [1100, 1400, 1800].forEach((f, i) => drop(context.currentTime + .025 + i * .24, f)); });
add('到着音 / 8パターン', 'A05', 'やさしい上昇チャイム', 'ド・ミ・ソ・ド。柔らかな達成感。', () => { echo(1); melody([523.25, 659.25, 783.99, 1046.5]); });
add('到着音 / 8パターン', 'A06', '森の到着', '鳥のさえずりと低い和音。自然に馴染む響き。', () => { echo(1); const t = context.currentTime + .025; bird(t, 1); [392, 493.88, 587.33].forEach(f => tone(f, t + .75, 1, .09, 'sine', null, .04)); }, 3);
add('到着音 / 8パターン', 'A07', '短い決定チャイム', '2音だけの簡潔な通知。頻繁な到着にも。', () => { echo(1); melody([783.99, 1046.5], 'sine', .16, .6); });
add('到着音 / 8パターン', 'A08', 'あたたかいファンファーレ', '三角波の5音と最後の和音。余韻を楽しむ到着音。', () => { echo(2); melody([392, 523.25, 659.25, 783.99, 1046.5], 'triangle', .18, 1, .22); const t = context.currentTime + .745; [523.25, 659.25].forEach(f => tone(f, t, 1, .08, 'triangle')); }, 3.5);
function stop() {
  generation++;
  timers.forEach(clearTimeout); timers = [];
  nodes.forEach(n => { try { if (n.stop) n.stop(); n.disconnect(); } catch (_) {} }); nodes = [];
  if (bus) bus.disconnect();
  document.querySelectorAll('.playing').forEach(el => el.classList.remove('playing'));
}
async function play(item) {
  stop(); const token = generation;
  try {
    if (!context) {
      context = new (window.AudioContext || window.webkitAudioContext)();
      master = context.createGain(); master.connect(context.destination);
    }
    await context.resume();
    if (token !== generation) return;
    master.gain.value = Number($('volume').value) / 100;
    bus = context.createGain(); bus.connect(master);
    // Reference oscillators are routed to the same stoppable preview bus.
    audioCtx = {get state() { return context.state; }, get currentTime() { return context.currentTime; }, destination: bus,
      createOscillator() { const n = context.createOscillator(); nodes.push(n); return n; },
      createGain() { const n = context.createGain(); nodes.push(n); return n; }, resume() { return context.resume(); }};
    document.querySelector(`[data-id="${item.id}"]`).classList.add('playing');
    $('status').textContent = `再生中：${item.id} ${item.name}`;
    // Echo wiring is created once per playback, so repeated previews use separate buses.
    const count = $('mode').value === 'repeat' ? 3 : 1;
    const interval = Math.max(item.duration, 2.5);
    item.play();
    // Repeats rebuild the bus to avoid stacking echo taps.
    for (let i = 1; i < count; i++) timers.push(setTimeout(() => {
      if (token !== generation) return;
      bus.disconnect(); bus = context.createGain(); bus.connect(master); audioCtx.destination = bus;
      item.play();
    }, interval * i * 1000));
    timers.push(setTimeout(() => { if (token === generation) { stop(); $('status').textContent = `試聴済み：${item.id} ${item.name}`; } }, (interval * count + .2) * 1000));
  } catch (error) { stop(); $('status').textContent = '音を再生できませんでした。対応ブラウザで開き、もう一度再生してください。'; }
}
let selected = new Set();
try { selected = new Set(JSON.parse(localStorage.getItem('sensor-sound-lab-selection') || '[]')); } catch (_) {}
function memo() {
  $('memo').value = catalog.filter(x => selected.has(x.id)).map(x => `${x.id}：${x.name}`).join('\n');
  try { localStorage.setItem('sensor-sound-lab-selection', JSON.stringify([...selected])); } catch (_) {}
}
for (const group of new Set(catalog.map(x => x.group))) {
  const section = document.createElement('section'), title = document.createElement('h2'), grid = document.createElement('div');
  title.textContent = group; grid.className = 'grid'; section.append(title, grid);
  for (const item of catalog.filter(x => x.group === group)) {
    const card = document.createElement('article'); card.className = 'card'; card.dataset.id = item.id;
    card.innerHTML = `<span class="number">${item.id}</span><h3>${item.name}</h3><p>${item.description}</p><div class="actions"><button type="button" class="play" aria-label="${item.id} ${item.name}を再生">▶ 再生</button><label><input type="checkbox"> 候補にする</label></div>`;
    card.querySelector('button').onclick = () => play(item);
    const checkbox = card.querySelector('input'); checkbox.checked = selected.has(item.id);
    checkbox.onchange = () => { if (checkbox.checked) selected.add(item.id); else selected.delete(item.id); memo(); };
    grid.append(card);
  }
  $('catalog').append(section);
}
memo();
$('volume').oninput = () => { $('volume-value').value = `${$('volume').value}%`; if (master) master.gain.value = Number($('volume').value) / 100; };
$('stop').onclick = () => { stop(); $('status').textContent = '停止しました。'; };
$('clear').onclick = () => { selected.clear(); document.querySelectorAll('input[type=checkbox]').forEach(x => x.checked = false); memo(); };
$('copy').onclick = async () => { try { await navigator.clipboard.writeText($('memo').value); $('status').textContent = '選択メモをコピーしました。'; } catch (_) { $('memo').focus(); $('memo').select(); $('status').textContent = '選択メモを選択しました。コピーしてください。'; } };
document.addEventListener('visibilitychange', () => { if (document.hidden) { stop(); $('status').textContent = '画面を離れたため停止しました。'; } });
