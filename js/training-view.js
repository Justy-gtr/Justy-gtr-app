/**
 * Platz für den Rückspiel-Modus.
 * Eine andere Änderung ersetzt den Inhalt von #training-mount
 * oder diese Funktion. Die Seiten-Id page-training und der Tab
 * data-page="training" bleiben. PAGES in js/nav.js nicht umsortieren.
 */
export function renderTraining() {
  return `
    <header class="page-head">
      <p class="eyebrow">Training</p>
      <h2>Rückspiel</h2>
    </header>
    <article class="card training-slot" id="training-mount" data-training-slot="rueckspiel">
      <p class="lede">Der Rückspiel-Modus wird hier eingehängt.</p>
      <p class="muted">Bis die Übung da ist, bleibt dieser Bereich leer. Kurse und Texte liegen in den anderen Bereichen.</p>
    </article>
  `;
}
