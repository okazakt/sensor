// Fit text to the actual space remaining after icons, padding and separators.
(() => {
  const labels = [...document.querySelectorAll(
    '#label-sound-state, #label-wake-state, #label-continuous-state, .volume-label, .condition-label'
  )];
  const toasts = [...document.querySelectorAll('.sound-mode-toast, #toast-text')];
  let pending = false;
  function fit(element, maximum, heightLimit) {
    if (!element.clientWidth || !element.textContent.trim()) return;
    let low = 1;
    let high = maximum;
    for (let i = 0; i < 12; i++) {
      const size = (low + high) / 2;
      element.style.fontSize = `${size}px`;
      if (element.scrollWidth <= element.clientWidth &&
          (!heightLimit || element.scrollHeight <= heightLimit)) low = size;
      else high = size;
    }
    const fitted = Math.floor(low * 10) / 10;
    element.style.fontSize = `${fitted}px`;
    return fitted;
  }
  function update() {
    pending = false;
    const panel = document.querySelector('.bottom-section');
    const panelStyle = getComputedStyle(panel);
    const panelWidth = panel.clientWidth - parseFloat(panelStyle.paddingLeft) - parseFloat(panelStyle.paddingRight);
    const sizes = labels.map(label => fit(label, Math.min(12.5, panelWidth * 0.033))).filter(Number.isFinite);
    const sharedSize = Math.min(...sizes);
    if (sizes.length) labels.forEach(label => { label.style.fontSize = `${sharedSize}px`; });
    toasts.forEach(toast => {
      const box = toast.id === 'toast-text' ? toast.parentElement : toast;
      const css = getComputedStyle(box);
      const availableHeight = box.clientHeight - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom);
      fit(toast, Math.min(13, box.clientWidth * 0.035), toast === box ? box.clientHeight : availableHeight);
    });
  }
  function schedule() {
    if (!pending) { pending = true; requestAnimationFrame(update); }
  }
  const resize = new ResizeObserver(schedule);
  resize.observe(document.querySelector('#app-container'));
  resize.observe(document.querySelector('.bottom-section'));
  const mutations = new MutationObserver(schedule);
  [...labels, ...toasts].forEach(element => {
    mutations.observe(element, { childList: true, characterData: true, subtree: true });
  });
  document.fonts.ready.then(schedule);
  schedule();
})();
