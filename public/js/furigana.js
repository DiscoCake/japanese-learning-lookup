let furiganaOn = true;
let imeBound = false;

export function setFurigana(on) {
  furiganaOn = on;
  document.body.classList.toggle('hide-furigana', !on);
  document.getElementById('furigana-btn').classList.toggle('active', on);
}

export function toggleFurigana() {
  setFurigana(!furiganaOn);
}

export function bindIME(inputEl) {
  if (!imeBound && window.wanakana) {
    wanakana.bind(inputEl, { IMEMode: true });
    imeBound = true;
  }
}

export function unbindIME(inputEl) {
  if (imeBound && window.wanakana) {
    wanakana.unbind(inputEl);
    imeBound = false;
  }
}

export function toggleIME(inputEl, btnEl) {
  if (imeBound) {
    unbindIME(inputEl);
    btnEl.classList.remove('active');
  } else {
    bindIME(inputEl);
    btnEl.classList.add('active');
  }
  inputEl.focus();
}
