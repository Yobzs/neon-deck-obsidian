/* ---- Goals tab (issues 85, 89): goals with dated check-ins instead of a progress bar ---- */
const GOAL_WEEKS = 12; // weeks of check-in dots per goal

Object.assign(NeonTasks.prototype, {
  openGoals() {
    return activateView(this.app, VIEW_GOALS, 'tab');
  },
  async addGoal(text) {
    text = String(text || '').trim();
    if (!text) return;
    this.settings.goals.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), text, due: '', created: Date.now(), done: null, log: [] });
    await this.globalChanged(); // same emit, save and backup as global tasks
  },
  /** One check-in per day: a second one the same day replaces the note. */
  async checkIn(g, note, d = dayKey()) {
    const prev = g.log.find((x) => x.d === d);
    const old = prev ? prev.note : null;
    if (prev) prev.note = note;
    else g.log.push({ d, note });
    await this.globalChanged();
    const n = new Notice(createFragment((f) => {
      f.appendText(prev ? 'Check-in updated · ' : '✦ Checked in · ');
      f.createEl('a', { text: 'Undo', href: '#' }).addEventListener('click', async (e) => {
        e.preventDefault();
        if (prev) prev.note = old;
        else g.log = g.log.filter((x) => x.d !== d);
        await this.globalChanged();
        n.hide();
      });
    }), 6000);
  },
  async setGoal(g, patch) {
    Object.assign(g, patch);
    await this.globalChanged();
  },
  async removeGoal(g) {
    const list = this.settings.goals;
    const idx = list.indexOf(g);
    if (idx < 0) return;
    list.splice(idx, 1);
    await this.globalChanged();
    const n = new Notice(createFragment((f) => {
      f.appendText('Goal deleted · ');
      f.createEl('a', { text: 'Undo', href: '#' }).addEventListener('click', async (e) => {
        e.preventDefault();
        list.splice(Math.min(idx, list.length), 0, g);
        await this.globalChanged();
        n.hide();
      });
    }), 6000);
  },
});

class GoalsView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.navigation = true;
    this.plugin = plugin;
    this.expanded = new Set(); // goals with their notes shown (not "open": that is View.open())
  }
  getViewType() {
    return VIEW_GOALS;
  }
  getDisplayText() {
    return 'Goals';
  }
  getIcon() {
    return 'target';
  }
  async onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass('nd-root', 'nd-pattern-host', 'ng-view');
    this.scroller = this.contentEl.createDiv('ng-scroll');
    this.mountPattern();
    this.registerEvent(this.app.workspace.on('neon-deck:core-ready', () => this.mountPattern()));
    this.registerEvent(this.app.workspace.on('neon-deck:core-unloaded', () => this.unmountPattern()));
    this.register(this.plugin.onChange(() => this.render()));
    // a new day: today's dot and the streaks move on
    this.registerInterval(window.setInterval(() => this.day !== dayKey() && this.render(), 60 * 1000));
    this.render();
  }
  async onClose() {
    this.unmountPattern();
    this.contentEl.empty();
  }
  mountPattern() {
    this.unmountPattern();
    const api = deckApi(this.app);
    if (api && api.mountPattern) this.pattern = api.mountPattern(this.contentEl, this.scroller, '.ng-panel');
  }
  unmountPattern() {
    if (this.pattern) this.pattern.destroy();
    this.pattern = null;
  }
  render() {
    const sc = this.scroller;
    if (!sc) return;
    // typing a new goal: don't wipe the input under the cursor
    const typing = document.activeElement && document.activeElement.closest('.ng-add') && sc.contains(document.activeElement);
    const draft = typing ? document.activeElement.value : null;
    const scroll = sc.scrollTop;
    sc.empty();
    this.day = dayKey();
    const goals = this.plugin.settings.goals;
    const active = goals.filter((g) => !g.done);
    const done = goals.filter((g) => g.done);
    const root = sc.createDiv('ng-inner');

    const head = root.createDiv('nd-hero ng-head');
    head.createDiv({ cls: 'nd-hero-greet', text: 'Goals' });
    head.createDiv({ cls: 'nd-hero-date', text: goals.length ? `${active.length} active · ${done.length} done` : 'Track what you work towards' });

    const card = widget(root, 'ng-panel', 'Active', 'target', active.length ? String(active.length) : '');
    const list = card.body.createDiv('ng-list');
    if (!active.length) emptyState(list, 'No goals yet: add one below ✦');
    for (const g of active) this.row(list, g);
    const add = card.body.createDiv('nt-add ng-add');
    const input = add.createEl('input', { cls: 'nd-input', attr: { type: 'text', placeholder: 'Add a goal… (Enter)', 'aria-label': 'New goal' } });
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.isComposing) return;
      if (!input.value.trim()) return shake(add);
      const v = input.value;
      input.value = '';
      this.plugin.addGoal(v);
    });
    if (draft != null) {
      input.value = draft;
      input.focus();
    }

    if (done.length) {
      const dc = widget(root, 'ng-panel ng-done', 'Done', 'check-circle-2', String(done.length));
      const dl = dc.body.createDiv('ng-list');
      for (const g of done.slice().sort((a, b) => b.done - a.done)) this.row(dl, g);
    }
    sc.scrollTop = scroll;
  }
  row(list, g) {
    const p = this.plugin;
    const today = this.day;
    const r = list.createDiv('ng-row' + (g.done ? ' is-done' : ''));
    const top = r.createDiv('ng-top');
    const name = top.createEl('button', { cls: 'ng-name', text: g.text, attr: { type: 'button', title: 'Rename' } });
    name.addEventListener('click', () => new PromptModal(this.app, { title: 'Rename goal', value: g.text, cta: 'Save', onSubmit: (v) => v && p.setGoal(g, { text: v }) }).open());

    const overdue = !g.done && !!g.due && g.due < today;
    const due = top.createEl('button', { cls: 'ng-due' + (overdue ? ' is-overdue' : '') + (g.due ? '' : ' is-empty'), text: g.due ? moment(g.due).format('D MMM') : 'due?', attr: { type: 'button', title: 'Set due date' } });
    const picker = top.createEl('input', { cls: 'ng-date', attr: { type: 'date', tabindex: '-1', 'aria-hidden': 'true' } });
    picker.value = g.due || '';
    picker.addEventListener('change', () => p.setGoal(g, { due: picker.value || '' }));
    due.addEventListener('click', () => {
      try {
        picker.showPicker();
      } catch (err) {
        picker.focus();
        picker.click();
      }
    });

    const acts = top.createDiv('ng-acts');
    const todayLog = g.log.find((x) => x.d === today);
    if (!g.done) {
      button(acts, {
        icon: todayLog ? 'check' : 'plus',
        text: todayLog ? 'Checked in' : 'Check in',
        cls: todayLog ? 'ng-checked' : 'mod-cta',
        title: todayLog ? 'Edit today’s note' : 'Log that you worked on this today',
        onClick: () => {
          new PromptModal(this.app, { title: `Check in · ${g.text}`, value: todayLog ? todayLog.note : '', placeholder: 'What did you do? (optional)', cta: 'Check in', onSubmit: (v) => p.checkIn(g, v) }).open();
        },
      });
      button(acts, { icon: 'circle-check-big', cls: 'nd-icon-btn', title: 'Mark done', onClick: () => p.setGoal(g, { done: Date.now() }) });
    } else button(acts, { icon: 'rotate-ccw', cls: 'nd-icon-btn', title: 'Reopen', onClick: () => p.setGoal(g, { done: null }) });
    button(acts, { icon: 'x', cls: 'nd-icon-btn', title: 'Delete goal', onClick: () => p.removeGoal(g) });

    // 12 weeks of dots, one column per week (Monday on top), filled on check-in days
    const byDay = new Map(g.log.map((x) => [x.d, x]));
    const strip = r.createDiv({ cls: 'ng-strip', attr: { role: 'img', 'aria-label': `${g.log.length} check-ins` } });
    const start = moment(today).startOf('isoWeek').subtract(GOAL_WEEKS - 1, 'weeks');
    for (let i = 0; i < GOAL_WEEKS * 7; i++) {
      const k = start.clone().add(i, 'days').format('YYYY-MM-DD');
      const x = byDay.get(k);
      const dot = strip.createDiv('ng-dot' + (x ? ' is-on' : '') + (k === today ? ' is-today' : '') + (k > today ? ' is-future' : ''));
      if (x) dot.setAttr('aria-label', `${moment(k).format('ddd D MMM')}${x.note ? ': ' + x.note : ''}`);
    }

    const streak = goalStreak(g.log, today);
    const last = g.log.length ? g.log.map((x) => x.d).sort().pop() : '';
    const meta = r.createDiv('ng-meta');
    const bits = [];
    if (streak > 1) bits.push(`${streak}-day streak`);
    bits.push(last ? `last check-in ${last === today ? 'today' : moment(last).from(moment(today))}` : 'no check-ins yet');
    if (g.done) bits.push(`done ${moment(g.done).format('D MMM YYYY')}`);
    meta.createSpan({ text: bits.join(' · ') });
    const notes = g.log.filter((x) => x.note).sort((a, b) => (a.d < b.d ? 1 : -1));
    if (notes.length) {
      const open = this.expanded.has(g.id);
      const tg = meta.createEl('button', { cls: 'ng-toggle', text: open ? 'Hide notes' : `Notes (${notes.length})`, attr: { type: 'button', 'aria-expanded': String(open) } });
      tg.addEventListener('click', () => {
        if (open) this.expanded.delete(g.id);
        else this.expanded.add(g.id);
        this.render();
      });
      if (open) {
        const nl = r.createDiv('ng-notes');
        for (const x of notes.slice(0, 20)) {
          const n = nl.createDiv('ng-note');
          n.createSpan({ cls: 'ng-note-d', text: moment(x.d).format('D MMM') });
          n.createSpan({ text: x.note });
        }
      }
    }
  }
}
