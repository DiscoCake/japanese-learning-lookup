/**
 * jp-ui: shared furigana toggle core.
 * Adds/removes `hide-furigana` on <body>; works with furigana.css.
 * Each app wraps this to update its own button states.
 */
export function setFurigana(on) {
  document.body.classList.toggle('hide-furigana', !on);
}
