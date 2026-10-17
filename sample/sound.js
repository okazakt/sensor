'use strict';
// The reference functions use these sandbox-only variables.
let audioCtx;
const appState = { isMuted: false, soundVolume: 7 };
function initAudio() {}
let context, bus, nodes = [], timers = [], generation = 0;
const $ = id => document.getElementById(id);
const catalog = [];
const favorites = new Set(['P01', 'P02', 'A01', 'A02', 'A05', 'A08', 'A31', 'A33']);
function add(group, id, name, description, play, duration = 2.5, options = {}) {
  catalog.push({group, id, name, description, play, duration, ...options});
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

// Second collection: keep original IDs and timbres stable for comparison.
function sonar(t, frequency = 660, duration = .35, end = 720, attack = .025, shimmer = false) {
  tone(frequency, t, duration, .34, 'sine', end, attack);
  if (shimmer) {
    // Slightly detuned voices beat gently against the fundamental.
    tone(frequency * 1.006, t, duration * 1.1, .065, 'sine', end * 1.006, attack);
    tone(frequency * 2, t, duration * .65, .035, 'sine', end * 2, attack);
  }
}
const sonarVariants = [
  ['S01', '原音そのまま / エコー弱', 'P02と同じ660→720 Hz。反射を控えて、輪郭を比較。', 660, .35, 720, .025, 1, false],
  ['S02', '原音そのまま / エコー強', 'P02と同じ音色。反射だけを深くした比較候補。', 660, .35, 720, .025, 3, false],
  ['S03', '深海のソナー', '440→470 Hz。少し低く、落ち着いた響き。', 440, .55, 470, .04, 2, false],
  ['S04', '明るいソナー', '880→960 Hz。高めで、輪郭をつかみやすい音。', 880, .3, 960, .02, 2, false],
  ['S05', '水面の揺らぎ', 'P02にわずかな音程差の音を重ね、ゆっくり揺れる響きに。', 660, .65, 720, .04, 2, true],
  ['S06', 'やわらかな下降', '720→560 Hz。上昇ではなく、静かに沈むソナー。', 720, .55, 560, .04, 2, false],
  ['S07', '丸い立ち上がり', '660→720 Hz。出だしをゆっくり膨らませ、余韻を長く。', 660, .85, 720, .1, 2, false],
  ['S08', '二つの応答', '660→720 Hzの後、少し高いソナーが返答。近距離の合図候補。', 660, .32, 720, .025, 2, false]
];
for (const [id, name, description, frequency, duration, end, attack, level, shimmer] of sonarVariants) {
  add('新候補 / ソナーを掘り下げる', id, name, description, () => {
    echo(level); const t = context.currentTime + .025;
    sonar(t, frequency, duration, end, attack, shimmer);
    if (id === 'S08') sonar(t + .28, 790, .32, 850);
  }, 2.5);
}
function mallet(t, f, duration = .3, amplitude = .3) {
  tone(f, t, duration, amplitude);
  tone(f * 3, t, duration * .24, amplitude * .2);
}
add('新候補 / 木琴の粒を掘り下げる', 'M01', '低い木琴', 'P01より低い660 Hz。丸さと落ち着きを比較。', () => mallet(context.currentTime + .025, 660, .3, .4));
add('新候補 / 木琴の粒を掘り下げる', 'M02', '木琴 ＋ 小さな反射', 'P01に近い880 Hz、弱いエコーで少し空間を追加。', () => { echo(1); mallet(context.currentTime + .025, 880, .21, .4); });
add('新候補 / 木琴の粒を掘り下げる', 'M03', '木琴とソナーの中間', '木琴の短い打音から、低いソナーの余韻へ。', () => { echo(2); const t = context.currentTime + .025; mallet(t, 660, .13, .3); tone(660, t + .015, .65, .16, 'sine', 700, .04); });
const hz = midi => 440 * 2 ** ((midi - 69) / 12);
// Notes use musical time, so longer arrivals contain a developed phrase, not just a stretched tail.
const arrivals = [
  {id:'A09', name:'現行ファンファーレ / ゆったり', parent:'A01・A02', step:.24, notes:[60,62,64,65,67,69,71,72,74,76], tail:2, type:'triangle', echo:2, chord:[60,64,67], description:'現行の10音をゆったり上昇。最後を和音で包む。'},
  {id:'A10', name:'やさしいチャイム / 二つのフレーズ', parent:'A05', step:.42, notes:[60,64,67,72,null,69,67,64,67,72], tail:1.8, echo:1, chord:[60,64,67], description:'上昇、ひと呼吸、応答。短い曲としてまとまるチャイム。'},
  {id:'A11', name:'あたたかい祝福 / 広がる終止', parent:'A08', step:.38, notes:[55,60,64,67,72,null,71,67,69,72], tail:2.3, type:'triangle', echo:2, chord:[48,60,64,67], description:'低い音から始まり、明るい和音へ着地するファンファーレ。'},
  {id:'A12', name:'ソナー / 目的地を発見', parent:'P02', step:.52, notes:[64,null,67,null,72,71,67,72], tail:2, voice:'sonar', echo:2, chord:[48,60,64,67], description:'ソナーが三度応答してから、穏やかな和音で到着を知らせる。'},
  {id:'A13', name:'木琴 / 小さな旅の終わり', parent:'P01・A05', step:.34, notes:[60,64,67,72,69,67,null,64,67,74,72], tail:1.6, voice:'mallet', echo:2, chord:[60,64,67], description:'粒立ちのある旋律と、最後だけに添える柔らかい持続和音。'},
  {id:'A14', name:'夜明けのチャイム', parent:'A05', step:.48, notes:[60,67,74,76,null,74,72,67,72], tail:2.2, echo:2, chord:[48,60,67,74], description:'音の間を広く取り、開放感のある和音を残す。'},
  {id:'A15', name:'冒険のファンファーレ', parent:'A01・A08', step:.28, notes:[60,60,67,64,67,72,null,71,69,67,69,71,72], tail:2.3, type:'triangle', echo:2, chord:[48,55,64,72], description:'繰り返す出だしと折り返す旋律。少し華やかな達成演出。'},
  {id:'A16', name:'静かな達成 / 低いチャイム', parent:'P02・A05', step:.58, notes:[55,59,62,67,null,64,62,67], tail:2.4, echo:1, chord:[43,55,59,62], description:'高音を控え、低めの旋律と長い余韻で落ち着いた到着に。'},
  {id:'A17', name:'ソナーからファンファーレへ', parent:'P02・A08', step:.44, notes:[60,null,67,null,64,67,72,76,74,72], tail:2.3, voice:'hybrid', echo:2, chord:[48,60,64,67], description:'最初はソナーの応答、後半は三角波の旋律へ切り替わる。'},
  {id:'A18', name:'木琴とチャイムの対話', parent:'P01・A05', step:.4, notes:[60,64,67,null,72,76,74,null,69,67,72], tail:2, voice:'dialogue', echo:2, chord:[48,60,64,67], description:'木琴の問いかけにチャイムが応える、二つの音色の到着音。'},
  {id:'A19', name:'長編 / 祝福のセレモニー', parent:'A02・A08', step:.38, notes:[55,60,64,67,null,64,67,72,76,null,74,71,67,69,71,72], tail:2.6, type:'triangle', echo:2, chord:[48,55,60,64,72], description:'導入・上昇・応答・終止の四つの展開。特別な到達向け。'},
  {id:'A20', name:'長編 / 深いソナーの帰還', parent:'P02・A05', step:.62, notes:[55,null,62,null,67,66,62,null,59,62,67], tail:2.5, voice:'sonar', echo:3, chord:[43,55,59,62], description:'低いソナーをゆっくり重ね、最後に柔らかな和音が広がる。'}
];
for (const score of arrivals) {
  const last = (score.notes.length - 1) * score.step;
  const duration = Math.ceil((last + score.tail * (score.voice === 'sonar' ? 1.1 : 1) + (score.echo === 3 ? 1.35 : score.echo === 2 ? .9 : .525) + .1) * 10) / 10;
  add('新候補 / 長めの到着音', score.id, score.name,
    `${score.parent}系 / 約${duration}秒（余韻込み）。${score.description}`, () => {
      echo(score.echo); const t = context.currentTime + .025;
      score.notes.forEach((note, i) => {
        if (note === null) return;
        const start = t + i * score.step, f = hz(note), final = i === score.notes.length - 1;
        const length = final ? score.tail : score.step * 1.4;
        if (score.voice === 'sonar' || (score.voice === 'hybrid' && i < 4)) {
          sonar(start, f, length, f * 1.045, .045, true);
        } else if (score.voice === 'mallet' || (score.voice === 'dialogue' && i < 4)) {
          mallet(start, f, final ? 1.2 : .42, .26);
        } else {
          tone(f, start, length, .23, score.type || (score.voice === 'hybrid' ? 'triangle' : 'sine'), null, .02);
        }
      });
      score.chord.forEach(note => tone(hz(note), t + last, score.tail, .11 / Math.sqrt(score.chord.length), 'sine', null, .12));
    }, duration);
}


// Replacement suites keep production pitch ratios, double spacing and pulse intervals.
const detectionSuites = [
  {id:'R01', name:'基本ソナー', parent:'P02', frequency:660, end:720, attack:.025, shimmer:false},
  {id:'R02', name:'深海ソナー', parent:'S03', frequency:440, end:470, attack:.04, shimmer:false},
  {id:'R03', name:'揺らぐソナー', parent:'S05', frequency:660, end:720, attack:.04, shimmer:true},
  {id:'R04', name:'丸いソナー', parent:'S07', frequency:660, end:720, attack:.06, shimmer:false}
];
function detectionPulse(suite, role, t) {
  const notes = role === 'double' ? [[2300 / 1750, 0], [2450 / 1750, .085]] :
    [[role === 'near' ? 2100 / 1750 : 1, 0]];
  const length = role === 'double' ? .07 : role === 'near' ? .2 : .35;
  const attack = Math.min(suite.attack, role === 'double' ? .012 : role === 'near' ? .03 : .06);
  notes.forEach(([ratio, offset]) => sonar(t + offset, suite.frequency * ratio, length,
    suite.end * ratio, attack, suite.shimmer));
}
for (const suite of detectionSuites) {
  const group = `第3弾 / ${suite.id} ${suite.name}で探知音を置き換え`;
  for (const [suffix, role, name, interval] of [
    ['N', 'normal', '通常の探知音', 2.6],
    ['H', 'near', '近距離の探知音', .8],
    ['D', 'double', '至近距離の二連音', .45]
  ]) {
    add(group, `${suite.id}-${suffix}`, name,
      `${suite.parent}系。${role === 'normal' ? '基本の高さ、長さ0.35秒。' : role === 'near' ? '通常の1.2倍の音程、長さ0.20秒。' : '通常の1.31→1.4倍の音程、1音0.07秒・二連の間隔85ms。'}中エコー。連続試聴では${interval}秒間隔。`,
      () => { echo(2); detectionPulse(suite, role, context.currentTime + .025); }, 1.6, {pulseInterval:interval});
  }
  add(group, `${suite.id}-ALL`, '接近する流れをまとめて試聴',
    '約15秒。通常（2.6→1.5秒間隔）→近距離（0.8秒）→二連（0.45→0.35秒）。現行の探知段階と詳細モード最速を再現。', () => {
      echo(2); const t = context.currentTime + .025; let offset = 0;
      for (const [label, role, interval, count] of [
        ['遠距離 / 通常音・2.6秒間隔', 'normal', 2.6, 2],
        ['中距離 / 通常音・1.5秒間隔', 'normal', 1.5, 2],
        ['近距離 / 高い音・0.8秒間隔', 'near', .8, 3],
        ['至近距離 / 二連音・0.45秒間隔', 'double', .45, 4],
        ['詳細モード最速 / 二連音・0.35秒間隔', 'double', .35, 4]
      ]) {
        timers.push(setTimeout(() => { $('status').textContent = `再生中：${suite.id}-ALL ${label}`; }, offset * 1000));
        for (let i = 0; i < count; i++) detectionPulse(suite, role, t + offset + i * interval);
        offset += count * interval;
      }
    }, 15);
}
const ORIGINAL_ARRIVAL_STEP = .115;
const originalRun = [60,62,64,65,67,69,71,72,74,76];
const extendedRun = [...originalRun,74,72,71,69,67,64,67,69,71,72,74,76,79,76,74,72,71,69,67,69,71,74,72,67,64,67,71,74,72];
const fastArrivals = [
  {id:'A21', name:'現行の続編 / エコーなし', notes:extendedRun, voice:'triangle', echo:0, description:'現行と同じ10音で始まり、折り返し・上昇・終止へ続く旋律。'},
  {id:'A22', name:'現行の続編 / 豊かなエコー', notes:extendedRun, voice:'triangle', echo:2, description:'A21と同じ旋律とテンポに中エコーを追加。A01・A02の延長として比較。'},
  {id:'A23', name:'軽やかな上昇チャイム / 長い旋律', voice:'sine', echo:1, notes:[60,64,67,72,76,72,67,64,62,65,69,74,77,74,69,65,64,67,71,76,79,76,71,67,65,69,72,77,76,74,72,69,67,64,67,71,74,71,67,72], description:'A05の柔らかい音色で、上昇するフレーズを受け渡す。'},
  {id:'A24', name:'あたたかいファンファーレ / 展開版', voice:'triangle', echo:2, notes:[55,60,64,67,72,67,64,60,57,60,65,69,74,69,65,60,59,62,67,71,76,71,67,62,60,64,67,72,79,76,74,72,69,65,69,72,74,71,67,72], description:'A08の三角波を基調に、低い導入から明るい応答へ展開する。'},
  {id:'A25', name:'ソナーの旋律 / 軽快な到着', voice:'sonar', echo:1, notes:[55,59,62,67,71,67,62,59,57,60,64,69,72,69,64,60,59,62,66,71,74,71,66,62,60,64,67,72,76,72,67,64,62,66,69,74,71,67,62,67], description:'探知音につながるソナーの音色を、短く歯切れよく旋律として演奏。'},
  {id:'A26', name:'木琴の旅路 / 軽快な到着', voice:'mallet', echo:2, notes:[60,67,64,72,67,76,72,67,62,69,65,74,69,77,74,69,64,71,67,76,71,79,76,71,65,72,69,77,74,72,69,65,64,67,72,76,74,71,67,72], description:'P01の丸い粒を連ねた旋律。音域を行き来しながら終止へ進む。'},
  {id:'A27', name:'長編ファンファーレ / 冒険の達成', voice:'triangle', echo:2, notes:[60,64,67,72,76,72,67,64,62,65,69,74,77,74,69,65,64,67,71,76,79,76,71,67,65,69,72,77,81,77,72,69,67,71,74,79,83,79,74,71,69,72,76,81,79,76,72,69,65,69,72,77,76,74,72,69,67,64,67,71,74,71,67,72], description:'64音の旋律。現行の速度で、導入・発展・山場・終止まで演奏する長編。'},
  {id:'A28', name:'ソナーとチャイム / 交差する旋律', voice:'dialogue', echo:2, notes:[60,64,67,72,76,72,67,64,62,65,69,74,77,74,69,65,64,67,71,76,79,76,71,67,65,69,72,77,81,77,72,69,67,71,74,79,76,74,71,67,65,69,72,76,74,71,67,72], description:'8音ごとにソナーとチャイムが交代。同じ速さのまま音色で展開する。'}
];
for (const score of fastArrivals) {
  const last = (score.notes.length - 1) * ORIGINAL_ARRIVAL_STEP;
  const tail = 1.5, echoTail = score.echo === 2 ? .9 : score.echo === 1 ? .525 : 0;
  const duration = Math.ceil((.025 + last + tail + echoTail + .1) * 10) / 10;
  add('第3弾 / 元のテンポで長い到着メロディ', score.id, score.name,
    `現行と同じ1音0.115秒・${score.notes.length}音・約${duration}秒（余韻込み）。${score.description}`, () => {
      echo(score.echo); const t = context.currentTime + .025;
      score.notes.forEach((note, i) => {
        const start = t + i * ORIGINAL_ARRIVAL_STEP, final = i === score.notes.length - 1;
        const voice = score.voice === 'dialogue' ? (Math.floor(i / 8) % 2 ? 'sine' : 'sonar') : score.voice;
        // Ordinary notes keep the original 0.18s envelope; only the final note sustains.
        if (voice === 'sonar') sonar(start, hz(note), final ? tail : .18, hz(note) * 1.045, .012);
        else if (voice === 'mallet') mallet(start, hz(note), final ? tail : .18, .25);
        else tone(hz(note), start, final ? tail : .18, .25, voice, null, .008);
      });
    }, duration);
}


// Selected N variants stay unchanged: only the repeat interval changes by distance.
const mixedDetectionStages = [
  {suffix:'N', name:'通常 / R02-N', source:'R02-N', suite:detectionSuites[1], interval:2.6},
  {suffix:'H', name:'近距離 / R01-N', source:'R01-N', suite:detectionSuites[0], interval:.8},
  {suffix:'D', name:'至近距離 / R03-N', source:'R03-N', suite:detectionSuites[2], interval:.45}
];
for (const stage of mixedDetectionStages) {
  add('第4弾 / 選択したソナーの組み合わせ', `X01-${stage.suffix}`, stage.name,
    `${stage.source}の音程・長さ・中エコーをそのまま使用。「実際の間隔で6回」で${stage.interval}秒間隔。至近距離も指定どおり単音です。`,
    () => { echo(2); detectionPulse(stage.suite, 'normal', context.currentTime + .025); }, 1.6,
    {pulseInterval:stage.interval});
}
add('第4弾 / 選択したソナーの組み合わせ', 'X01-ALL', 'R02-N → R01-N → R03-N / 接近の流れ',
  '約15秒。通常は低いソナー、近距離は基本ソナー、至近距離は揺らぐソナーへ。音色は各Nのまま、探知間隔だけが速くなります。', () => {
    echo(2); const t = context.currentTime + .025; let offset = 0;
    for (const [index, interval, count, label] of [
      [0, 2.6, 2, '通常 / R02-N・2.6秒間隔'],
      [0, 1.5, 2, '通常 / R02-N・1.5秒間隔'],
      [1, .8, 3, '近距離 / R01-N・0.8秒間隔'],
      [2, .45, 4, '至近距離 / R03-N・0.45秒間隔'],
      [2, .35, 4, '詳細モード最速 / R03-N・0.35秒間隔']
    ]) {
      timers.push(setTimeout(() => { $('status').textContent = `再生中：X01-ALL ${label}`; }, offset * 1000));
      for (let i = 0; i < count; i++) detectionPulse(mixedDetectionStages[index].suite, 'normal', t + offset + i * interval);
      offset += count * interval;
    }
  }, 15.5);
const shortArrivals = [
  {id:'A29', name:'現行の上昇 / 余韻をコンパクトに', voice:'triangle', notes:originalRun, tail:.65, echo:1},
  {id:'A30', name:'短い続編 / 上昇して着地', voice:'triangle', notes:[...originalRun,74,71,67,72], tail:.7, echo:1},
  {id:'A31', name:'あたたかいファンファーレ / 小さな展開', voice:'triangle', notes:[55,60,64,67,72,67,64,60,62,65,69,74,76,74,71,72], tail:.8, echo:1},
  {id:'A32', name:'やさしいチャイム / 短い祝福', voice:'sine', notes:[60,64,67,72,76,72,67,64,67,71,74,72], tail:.65, echo:1},
  {id:'A33', name:'木琴 / 小さなゴール', voice:'mallet', notes:[60,67,64,72,67,76,72,67,65,69,74,72,67,64,67,72], tail:.6, echo:1},
  {id:'A34', name:'ソナー / 短い到着メロディ', voice:'sonar', notes:[55,59,62,67,71,67,62,59,60,64,67,71,69,67], tail:.65, echo:1}
];
// Controlled comparisons keep the selected A31/A33 references unchanged.
const warmReference = shortArrivals.find(score => score.id === 'A31');
const woodReference = shortArrivals.find(score => score.id === 'A33');
shortArrivals.push(
  {...warmReference, id:'A35', name:'A31派生 / 響きを少し豊かに', echo:2, group:'A31を掘り下げる', comparison:'A31と同じ旋律・音色。エコーだけ弱→中にして、広がりを比較。'},
  {...warmReference, id:'A36', name:'A31派生 / 簡潔な上昇と着地', notes:[55,60,64,67,72,67,64,62,65,69,71,72], tail:.65, group:'A31を掘り下げる', comparison:'三角波の温かさを残し、旋律を12音にまとめた短い候補。'},
  {...warmReference, id:'A37', name:'A31派生 / 折り返すメロディ', notes:[55,60,64,67,72,76,74,72,69,65,62,65,67,71,74,72], group:'A31を掘り下げる', comparison:'A31と同じ音数・音色・エコー。旋律だけを変え、上昇後に折り返す展開に。'},
  {...woodReference, id:'A38', name:'A33派生 / 空間のある木琴', echo:2, group:'A33を掘り下げる', comparison:'A33と同じ旋律・音色。エコーだけ弱→中にして、木琴の余韻を比較。'},
  {...woodReference, id:'A39', name:'A33派生 / 低く丸い木琴', notes:woodReference.notes.map(note => note - 5), group:'A33を掘り下げる', comparison:'A33の旋律を5半音下げた候補。長さ・テンポ・エコーは同じ。'},
  {...woodReference, id:'A40', name:'A33派生 / 跳ねる応答', notes:[60,64,67,72,69,65,69,74,67,64,67,72,76,74,71,72], group:'A33を掘り下げる', comparison:'A33と同じ音数・木琴の音色・エコー。上下する旋律に変え、応答する印象に。'}
);
for (const score of shortArrivals) {
  const last = (score.notes.length - 1) * ORIGINAL_ARRIVAL_STEP;
  const duration = Math.ceil((.025 + last + score.tail + (score.echo === 2 ? .9 : .525) + .1) * 10) / 10;
  add(score.group || '第4弾 / 短めのファンファーレ', score.id, score.name,
    `約${duration}秒（余韻込み）。${score.notes.length}音・現行と同じ1音0.115秒。${score.comparison || '短い旋律と弱いエコーで、すっきり終わります。'}`, () => {
      echo(score.echo); const t = context.currentTime + .025;
      score.notes.forEach((note, i) => {
        const start = t + i * ORIGINAL_ARRIVAL_STEP;
        const length = i === score.notes.length - 1 ? score.tail : .18;
        if (score.voice === 'sonar') sonar(start, hz(note), length, hz(note) * 1.045, .012);
        else if (score.voice === 'mallet') mallet(start, hz(note), length, .25);
        else tone(hz(note), start, length, .25, score.voice, null, .008);
      });
    }, duration);
}

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
    const radarRepeat = $('mode').value === 'radar' && item.pulseInterval;
    const count = radarRepeat ? 6 : $('mode').value === 'repeat' ? 3 : 1;
    const interval = radarRepeat ? item.pulseInterval : Math.max(item.duration, 2.5);
    item.play();
    // Repeats rebuild the bus to avoid stacking echo taps.
    for (let i = 1; i < count; i++) timers.push(setTimeout(() => {
      if (token !== generation) return;
      bus.disconnect(); bus = context.createGain(); bus.connect(master); audioCtx.destination = bus;
      item.play();
    }, interval * i * 1000));
    timers.push(setTimeout(() => { if (token === generation) { stop(); $('status').textContent = `試聴済み：${item.id} ${item.name}`; } }, ((count - 1) * interval + item.duration + .2) * 1000));
  } catch (error) { stop(); $('status').textContent = '音を再生できませんでした。対応ブラウザで開き、もう一度再生してください。'; }
}
const activeIds = new Set(['X01-N', 'X01-H', 'X01-D', 'X01-ALL', 'A31', 'A33', 'A35', 'A36', 'A37', 'A38', 'A39', 'A40']);
let selected = new Set();
try { selected = new Set(JSON.parse(localStorage.getItem('sensor-sound-lab-selection') || '[]')); } catch (_) {}
function memo() {
  const archived = catalog.filter(item => !activeIds.has(item.id));
  const selectedCount = archived.filter(item => selected.has(item.id)).length;
  $('archive-summary').textContent = `過去の候補を表示（${archived.length}件${selectedCount ? `・選択済み${selectedCount}件` : ''}）`;
  $('memo').value = catalog.filter(x => selected.has(x.id)).map(x => `${x.id}：${x.name}`).join('\n');
  try { localStorage.setItem('sensor-sound-lab-selection', JSON.stringify([...selected])); } catch (_) {}
}
function renderGroup(group, items, target) {
  const section = document.createElement('section'), title = document.createElement('h2'), grid = document.createElement('div');
  title.textContent = group; grid.className = 'grid'; section.append(title, grid);
  for (const item of items) {
    const card = document.createElement('article'); card.className = 'card'; card.dataset.id = item.id;
    card.innerHTML = `<span class="number">${item.id}${favorites.has(item.id) ? ' / 比較の基準' : ''}</span><h3>${item.name}</h3><p>${item.description}</p><div class="actions"><button type="button" class="play" aria-label="${item.id} ${item.name}を再生">▶ 再生</button><label><input type="checkbox"> 候補にする</label></div>`;
    card.querySelector('button').onclick = () => play(item);
    const checkbox = card.querySelector('input'); checkbox.checked = selected.has(item.id);
    checkbox.onchange = () => { if (checkbox.checked) selected.add(item.id); else selected.delete(item.id); memo(); };
    grid.append(card);
  }
  target.append(section);
}
renderGroup('探知音 / R02-N → R01-N → R03-N', catalog.filter(item => item.id.startsWith('X01-')), $('catalog'));
renderGroup('比較の基準 / A31・A33', catalog.filter(item => ['A31', 'A33'].includes(item.id)), $('catalog'));
for (const group of ['A31を掘り下げる', 'A33を掘り下げる']) {
  renderGroup(group, catalog.filter(item => item.group === group), $('catalog'));
}
const archived = catalog.filter(item => !activeIds.has(item.id));
for (const group of new Set(archived.map(item => item.group))) {
  renderGroup(group, archived.filter(item => item.group === group), $('archive-catalog'));
}
$('archive').addEventListener('toggle', () => {
  if (!$('archive').open && $('archive-catalog').querySelector('.playing')) {
    stop(); $('status').textContent = '過去の候補を閉じたため停止しました。';
  }
});

memo();
$('volume').oninput = () => { $('volume-value').value = `${$('volume').value}%`; if (master) master.gain.value = Number($('volume').value) / 100; };
$('stop').onclick = () => { stop(); $('status').textContent = '停止しました。'; };
$('clear').onclick = () => { selected.clear(); document.querySelectorAll('input[type=checkbox]').forEach(x => x.checked = false); memo(); };
$('copy').onclick = async () => { try { await navigator.clipboard.writeText($('memo').value); $('status').textContent = '選択メモをコピーしました。'; } catch (_) { $('memo').focus(); $('memo').select(); $('status').textContent = '選択メモを選択しました。コピーしてください。'; } };
document.addEventListener('visibilitychange', () => { if (document.hidden) { stop(); $('status').textContent = '画面を離れたため停止しました。'; } });
