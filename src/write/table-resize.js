/* ---- resizable table columns (issue 92) --------------------------------------------------
 * Drag the right edge of a header cell (Live Preview and Reading view); double-click it to reset.
 * Widths live in plugin data, per note and per header text, so notes stay plain markdown. */
const TABLE_MIN_COL = 40; // px
/** Key for one table in a note: its header cells' text. */
function tableSig(texts) {
  return texts.map((t) => String(t).trim().replace(/\s+/g, ' ')).join('|');
}
/** Saved widths after a note or folder rename: keys under the old path move to the new one. */
function renameWidthKeys(widths, oldPath, newPath) {
  const out = {};
  for (const [k, v] of Object.entries(widths)) {
    const moved = k === oldPath ? newPath : k.startsWith(oldPath + '/') ? newPath + k.slice(oldPath.length) : k;
    out[moved] = v;
  }
  return out;
}

Object.assign(NeonWrite.prototype, {
  saveSoon() {
    if (!this._saveSoon) this._saveSoon = debounce(() => this.saveSettings(), 800, true);
    this._saveSoon();
  },
  setWidths(path, sig, w) {
    const all = this.settings.tableWidths;
    if (w) (all[path] = all[path] || {})[sig] = w;
    else if (all[path]) {
      delete all[path][sig];
      if (!Object.keys(all[path]).length) delete all[path];
    }
    this.saveSoon();
  },
  /** Live Preview tables in one editor: size them and add grips (cheap when nothing changed). */
  sizeEditorTables(view) {
    const info = obsidian.editorInfoField ? view.state.field(obsidian.editorInfoField, false) : null;
    const path = info && info.file && info.file.path;
    if (path) for (const t of view.dom.querySelectorAll('.cm-table-widget table')) this.resizable(t, path);
  },
  /** Size a rendered table from its saved widths and give each header cell a drag grip. */
  resizable(table, path) {
    const head = table.tHead && table.tHead.rows[0];
    if (!path || !head) return;
    const ths = [...head.cells];
    const sig = tableSig(ths.map((c) => c.textContent));
    const saved = (this.settings.tableWidths[path] || {})[sig];
    const apply = (w) => {
      const ok = w && w.length === ths.length;
      table.toggleClass('nw-sized', !!ok);
      table.style.width = ok ? `${w.reduce((a, b) => a + b, 0)}px` : '';
      ths.forEach((c, i) => (c.style.width = ok ? `${w[i]}px` : ''));
    };
    apply(saved);
    table.addClass('nw-resizable');
    table.dataset.ndPath = path;
    // the note's path when a grip is used (it may have been renamed since the grips were drawn)
    const pathNow = () => {
      const leaf = this.app.workspace.getLeavesOfType('markdown').find((l) => l.view.containerEl.contains(table));
      return (leaf && leaf.view.file && leaf.view.file.path) || table.dataset.ndPath;
    };
    ths.forEach((th, i) => {
      if (th.querySelector(':scope > .nw-col-grip')) return;
      const grip = th.createDiv({ cls: 'nw-col-grip', attr: { 'aria-label': 'Drag to resize · double-click to reset', 'data-tooltip-position': 'top' } });
      // keep Live Preview from opening the cell for editing
      for (const t of ['mousedown', 'click']) grip.addEventListener(t, (e) => (e.preventDefault(), e.stopPropagation()));
      grip.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.setWidths(pathNow(), tableSig([...head.cells].map((c) => c.textContent)), null);
        apply(null);
      });
      grip.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        const cells = [...head.cells];
        const start = cells.map((c) => Math.round(c.getBoundingClientRect().width));
        const x0 = e.clientX;
        let w = start;
        grip.setPointerCapture(e.pointerId);
        grip.addClass('is-drag');
        document.body.addClass('nw-col-dragging');
        const move = (ev) => {
          w = start.slice();
          w[i] = Math.max(TABLE_MIN_COL, Math.round(start[i] + ev.clientX - x0));
          apply(w);
        };
        const up = () => {
          grip.removeEventListener('pointermove', move);
          grip.removeEventListener('lostpointercapture', up);
          grip.removeClass('is-drag');
          document.body.removeClass('nw-col-dragging');
          if (w !== start) this.setWidths(pathNow(), tableSig(cells.map((c) => c.textContent)), w);
        };
        grip.addEventListener('pointermove', move);
        grip.addEventListener('lostpointercapture', up);
      });
    });
  },
});
