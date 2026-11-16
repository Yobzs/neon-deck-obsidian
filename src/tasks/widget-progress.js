Object.assign(NeonTasks.prototype, {
  /* progress: goals with a bar, a percent and an optional due date -------- */
  async progressChanged() {
    await this.globalChanged(); // same emit, save and backup as global tasks
  },
  mountProgress(card) {
    const body = card.body;
    const list = body.createDiv('nt-list np-list');
    const add = body.createDiv('nt-add');
    const input = add.createEl('input', { cls: 'nd-input', attr: { type: 'text', placeholder: 'Track a goal… (Enter)' } });
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.isComposing) return;
      if (!input.value.trim()) return shake(add);
      const text = input.value.trim();
      input.value = '';
      this.settings.progress.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), text, pct: 0, due: '', created: Date.now() });
      this.progressChanged();
    });
    let first = true;
    const render = () => {
      if (!list.isConnected || editingIn(list)) return;
      const items = this.settings.progress;
      card.badge.setText(items.length ? String(items.length) : '');
      const old = new Map([...list.children].filter((el) => el.dataset.key && !el.hasClass('is-leaving')).map((el) => [el.dataset.key, el]));
      const want = [];
      if (!items.length) {
        let e = old.get('empty');
        if (!e) {
          e = emptyState(list, 'Track a goal: type it below ✦');
          e.addClass('nt-fade-in');
          e.dataset.key = 'empty';
        }
        want.push(e);
      }
      const today = moment().format('YYYY-MM-DD');
      items.forEach((t) => {
        const sig = `${t.text}|${t.pct}|${t.due}`;
        const prevRow = old.get(t.id);
        if (prevRow && prevRow.dataset.sig === sig) return want.push(prevRow);
        const row = list.createDiv('np-row' + (t.pct >= 100 ? ' is-done' : '') + (!first && !prevRow ? ' is-new' : ''));
        row.dataset.key = t.id;
        row.dataset.sig = sig;
        if (prevRow) prevRow.replaceWith(row); // edited: swap in place
        want.push(row);
        row.createDiv({ cls: 'np-name', text: t.text });
        const bar = row.createDiv('np-bar');
        bar.createDiv('np-fill').style.width = `${t.pct}%`;
        tip(bar, 'Click to set progress');
        bar.addEventListener('click', async (e) => {
          const r = bar.getBoundingClientRect();
          t.pct = snapPct(((e.clientX - r.left) / r.width) * 100);
          await this.progressChanged();
        });
        row.createDiv({ cls: 'np-pct', text: `${t.pct}%` });
        const overdue = !!t.due && t.due < today && t.pct < 100;
        const due = row.createDiv({ cls: 'np-due' + (overdue ? ' is-overdue' : '') + (t.due ? '' : ' is-empty'), text: t.due ? moment(t.due).format('D MMM') : 'due?' });
        tip(due, 'Set due date');
        const picker = row.createEl('input', { cls: 'np-date', attr: { type: 'date', tabindex: '-1' } });
        picker.value = t.due || '';
        picker.addEventListener('change', async () => {
          t.due = picker.value || '';
          await this.progressChanged();
        });
        due.addEventListener('click', () => {
          picker.value = t.due || '';
          try {
            picker.showPicker?.();
          } catch (err) {
            picker.focus();
            picker.click();
          }
        });
        const del = row.createDiv('nt-del');
        setIcon(del, 'x');
        tip(del, 'Delete');
        del.addEventListener('click', async () => {
          const idx = this.settings.progress.findIndex((x) => x.id === t.id);
          if (idx < 0) return;
          const [removed] = this.settings.progress.splice(idx, 1);
          await this.progressChanged();
          const n = new Notice(createFragment((f) => {
            f.appendText('Goal deleted · ');
            f.createEl('a', { text: 'Undo', href: '#' }).addEventListener('click', async (e) => {
              e.preventDefault();
              this.settings.progress.splice(Math.min(idx, this.settings.progress.length), 0, removed);
              await this.progressChanged();
              n.hide();
            });
          }), 6000);
        });
      });
      patchList(list, want);
      first = false;
    };
    const off = this.onChange(render);
    render();
    return { destroy: off };
  },
});
