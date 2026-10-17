'use strict';
let radarFrame = null;
function radarLevels(mode) {
  const levels = [{level:'idle', label:'待機 / 無音', interval:null, source:null}];
  const intervals = [2.6, 1.5, .8, .45], intermediate = [2.05, 1.15, .625, .35];
  for (let band = 1; band <= 4; band++) {
    const source = band <= 2 ? 0 : band === 3 ? 1 : 2;
    levels.push({level:`level${band}`, label:['遠距離','中距離','近距離','至近距離'][band - 1], interval:intervals[band - 1], source});
    if (mode === 'detailed') levels.push({level:`level${band}-half`, label:['遠距離＋','中距離＋','近距離＋','至近距離＋'][band - 1], interval:intermediate[band - 1], source});
  }
  return levels;
}
function radarSchedule(mode, selected = -1, rate = 1) {
  const levels = radarLevels(mode), segments = [], pulses = [];
  const indices = selected < 0 ? levels.map((_, i) => i) : [selected];
  let at = 0;
  for (const index of indices) {
    const level = levels[index], interval = level.interval === null ? null : level.interval / rate;
    const count = selected < 0 ? 2 : 6;
    const duration = interval === null ? (selected < 0 ? 1.2 : 3) : interval * count;
    segments.push({...level, at, duration, index, interval});
    if (interval !== null) for (let i = 0; i < count; i++) pulses.push({at:at + interval * i, source:level.source, level:level.level});
    at += duration;
  }
  return {segments, pulses, duration:at + 1.3, selected, rate};
}
function registerRadarPreviews() {
  for (const [id, mode, name] of [['D05','standard','通常モード / 5段階'],['D09','detailed','九段階モード / 詳細9段階']]) {
    const schedule = radarSchedule(mode);
    add('探索 / 表示と音', id, name,
      '待機から至近距離まで進み、選択したソナーと波紋を確認。段階を指定した6回反復、探知速度の切り替えにも対応。',
      function(t = context.currentTime + .025) {
        echo(2);
        for (const pulse of this.schedule.pulses) detectionPulse(mixedDetectionStages[pulse.source].suite, 'normal', t + pulse.at);
      }, schedule.duration, {radar:mode, schedule});
  }
}
function stopRadarPreview() {
  if (radarFrame !== null) { cancelAnimationFrame(radarFrame); radarFrame = null; }
  if ($('radar-dialog').open) $('radar-dialog').close();
}
function beginRadarPreview(item, startTime) {
  const levels = radarLevels(item.radar), schedule = item.schedule;
  $('radar-title').textContent = `${item.id} / ${item.name}`;
  $('radar-mode').value = item.radar;
  $('radar-level').replaceChildren();
  const all = document.createElement('option'); all.value = '-1'; all.textContent = '全段階を自動で'; $('radar-level').append(all);
  levels.forEach((level, index) => { const option = document.createElement('option'); option.value = index; option.textContent = `${index + 1}/${levels.length} ${level.label}`; $('radar-level').append(option); });
  $('radar-level').value = schedule.selected;
  $('radar-rate').value = schedule.rate;
  $('radar-progress').max = item.duration; $('radar-progress').value = 0;
  $('radar-phase').textContent = '待機 / 無音';
  $('lab-radar-ring').className = 'circle-map-wrapper signal-idle';
  $('lab-radar-pulse').className = 'radar-pulse-ring';
  $('lab-radar-pulse').dataset.pulse = '0';
  $('radar-dialog').showModal();
  const token = generation;
  let currentSegment = null, lastPulse = -1;
  function frame() {
    if (token !== generation) return;
    const elapsed = Math.max(0, context.currentTime - startTime);
    const segment = schedule.segments.filter(part => part.at <= elapsed).at(-1);
    if (segment && segment !== currentSegment) {
      currentSegment = segment;
      $('lab-radar-ring').className = `circle-map-wrapper signal-${segment.level}`;
      $('radar-phase').textContent = `${segment.index + 1}/${levels.length} ${segment.label} / ${segment.interval === null ? '無音' : `${mixedDetectionStages[segment.source].source}・${Number(segment.interval.toFixed(3))}秒間隔`}`;
    }
    const pulseIndex = schedule.pulses.findLastIndex(pulse => pulse.at <= elapsed && context.currentTime >= startTime);
    if (pulseIndex !== lastPulse && pulseIndex >= 0) {
      lastPulse = pulseIndex;
      const wave = $('lab-radar-pulse');
      wave.className = 'radar-pulse-ring'; void wave.offsetWidth;
      wave.classList.add(schedule.pulses[pulseIndex].level.startsWith('level4') ? 'pulse-double-anim' : 'pulse-anim');
      wave.dataset.pulse = String(pulseIndex + 1);
      wave.dataset.audioTime = String(startTime + schedule.pulses[pulseIndex].at);
      wave.dataset.visualTime = String(context.currentTime);
    }
    $('radar-progress').value = elapsed;
    if (elapsed < item.duration) radarFrame = requestAnimationFrame(frame);
    else { radarFrame = null; $('radar-phase').textContent = '試聴終了'; }
  }
  radarFrame = requestAnimationFrame(frame);
}
function restartRadarPreview(selected = Number($('radar-level').value)) {
  const mode = $('radar-mode').value;
  const base = catalog.find(item => item.id === (mode === 'detailed' ? 'D09' : 'D05'));
  const schedule = radarSchedule(mode, selected, Number($('radar-rate').value));
  play({...base, schedule, duration:schedule.duration});
}
// Bind only after the document and sound catalog are ready.
window.addEventListener('DOMContentLoaded', () => {
  $('radar-close').onclick = () => { stop(); $('status').textContent = '停止しました。'; };
  $('radar-dialog').addEventListener('cancel', event => { event.preventDefault(); stop(); $('status').textContent = '停止しました。'; });
  $('radar-mode').onchange = () => restartRadarPreview(-1);
  $('radar-level').onchange = () => restartRadarPreview();
  $('radar-rate').onchange = () => restartRadarPreview();
  $('radar-replay').onclick = () => restartRadarPreview(-1);
  $('radar-prev').onclick = () => restartRadarPreview(Math.max(0, Number($('radar-level').value) - 1));
  $('radar-next').onclick = () => {
    const mode = $('radar-mode').value;
    restartRadarPreview(Math.min(radarLevels(mode).length - 1, Number($('radar-level').value) + 1));
  };
});
