/* ---- Goals tab (issues 85, 89): goals with dated check-ins instead of a progress bar ---- */
const GOAL_WEEKS = 12; // weeks of check-in dots per goal
/** Open a hidden <input type=date>'s native picker. */
function openPicker(picker) {
  try {
    picker.showPicker();
  } catch (err) {
    picker.focus();
    picker.click();
  }
}

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
    const today = this.day;
    const goals = this.plugin.settings.goals;
    const active = goals.filter((g) => !g.done);
    const done = goals.filter((g) => g.done);
    const root = sc.createDiv('ng-inner');

    // header like the Time tab: name pill, date, and four small stat tiles
    const head = root.createDiv('nd-hero ng-head');
    head.createDiv({ cls: 'nd-hero-greet', text: 'Goals' });
    head.createDiv({ cls: 'nd-hero-date', text: moment().format('dddd D MMM') });
    const stats = head.createDiv('ng-stats');
    const weekStart = moment().startOf('isoWeek').format('YYYY-MM-DD');
    const stat = (v, l, accent) => {
      const t = stats.createDiv('nd-tile ng-stat' + (accent ? ' is-accent' : ''));
      t.createDiv({ cls: 'nd-tile-value', text: String(v) });
      t.createDiv({ cls: 'nd-tile-label', text: l });
    };
    stat(`${active.filter((g) => g.log.some((x) => x.d === today)).length}/${active.length}`, 'today', true);
    stat(active.reduce((n, g) => n + g.log.filter((x) => x.d >= weekStart).length, 0), 'this week');
    stat(Math.max(0, ...active.map((g) => goalStreak(g.log, today))), 'best streak');
    stat(done.length, 'done');

    const card = widget(root, 'ng-panel', 'Active', 'target', 'check in on the days you work on one');
    card.badge && card.badge.setText(active.length ? String(active.length) : '');
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
      const dc = widget(root, 'ng-panel ng-done', 'Done', 'check-circle-2', `${done.length} finished`);
      const dl = dc.body.createDiv('ng-list');
      for (const g of done.slice().sort((a, b) => b.done - a.done)) this.row(dl, g);
    }
    sc.scrollTop = scroll;
  }
  /** The ⋯ menu: rename, due date, done / reopen, delete. */
  menu(e, g, picker) {
    const p = this.plugin;
    const m = new Menu();
    m.addItem((i) => i.setTitle('Rename…').setIcon('pencil').onClick(() => new PromptModal(this.app, { title: 'Rename goal', value: g.text, cta: 'Save', onSubmit: (v) => v && p.setGoal(g, { text: v }) }).open()));
    if (!g.done) {
      m.addItem((i) => i.setTitle(g.due ? 'Change due date…' : 'Set due date…').setIcon('calendar').onClick(() => openPicker(picker)));
      if (g.due) m.addItem((i) => i.setTitle('Clear due date').setIcon('calendar-x').onClick(() => p.setGoal(g, { due: '' })));
      m.addItem((i) => i.setTitle('Mark done').setIcon('circle-check-big').onClick(() => p.setGoal(g, { done: Date.now() })));
    } else m.addItem((i) => i.setTitle('Reopen').setIcon('rotate-ccw').onClick(() => p.setGoal(g, { done: null })));
    m.addSeparator();
    m.addItem((i) => i.setTitle('Delete').setIcon('trash-2').setWarning(true).onClick(() => p.removeGoal(g)));
    m.showAtMouseEvent(e);
  }
  row(list, g) {
    const p = this.plugin;
    const today = this.day;
    const todayLog = g.log.find((x) => x.d === today);
    const r = list.createDiv('ng-row' + (g.done ? ' is-done' : '') + (todayLog && !g.done ? ' is-today' : ''));

    // left: the check-in button, like a task's checkbox (done goals show a calm tick)
    const chk = r.createEl('button', { cls: 'ng-check', attr: { type: 'button' } });
    if (g.done) {
      setIcon(chk, 'check');
      chk.setAttr('aria-label', 'Done');
      chk.disabled = true;
    } else {
      setIcon(chk, todayLog ? 'check' : 'plus');
      chk.setAttr('aria-label', todayLog ? 'Checked in today · edit the note' : 'Check in for today');
      chk.addEventListener('click', () =>
        new PromptModal(this.app, { title: `Check in · ${g.text}`, value: todayLog ? todayLog.note : '', placeholder: 'What did you do? (optional)', cta: 'Check in', onSubmit: (v) => p.checkIn(g, v) }).open(),
      );
    }

    const main = r.createDiv('ng-main');
    main.createDiv({ cls: 'ng-name', text: g.text });
    const meta = main.createDiv('ng-meta');
    const picker = r.createEl('input', { cls: 'ng-date', attr: { type: 'date', tabindex: '-1', 'aria-hidden': 'true' } });
    picker.value = g.due || '';
    picker.addEventListener('change', () => p.setGoal(g, { due: picker.value || '' }));
    const streak = goalStreak(g.log, today);
    const last = g.log.length ? g.log.map((x) => x.d).sort().pop() : '';
    if (g.done) meta.createSpan({ text: `done ${moment(g.done).format('D MMM YYYY')} · ${g.log.length} check-in${g.log.length === 1 ? '' : 's'}` });
    else {
      if (streak > 1) meta.createSpan({ cls: 'ng-streak', text: `${streak}-day streak` });
      meta.createSpan({ text: last ? (last === today ? 'checked in today' : `last ${moment(last).from(moment(today))}`) : 'no check-ins yet' });
      if (g.due) {
        const overdue = g.due < today;
        const due = meta.createEl('button', { cls: 'ng-due' + (overdue ? ' is-overdue' : ''), text: `due ${moment(g.due).format('D MMM')}`, attr: { type: 'button', 'aria-label': 'Change due date' } });
        due.addEventListener('click', () => openPicker(picker));
      }
    }
    const notes = g.log.filter((x) => x.note).sort((a, b) => (a.d < b.d ? 1 : -1));
    const open = this.expanded.has(g.id);
    if (notes.length) {
      const tg = meta.createEl('button', { cls: 'ng-toggle', attr: { type: 'button', 'aria-expanded': String(open) } });
      tg.setText(open ? 'hide notes' : `${notes.length} note${notes.length === 1 ? '' : 's'}`);
      tg.addEventListener('click', () => {
        if (open) this.expanded.delete(g.id);
        else this.expanded.add(g.id);
        this.render();
      });
    }

    // right: 12 weeks of dots (one column per week, Monday on top); done goals skip it
    if (!g.done) {
      const byDay = new Map(g.log.map((x) => [x.d, x]));
      const strip = r.createDiv({ cls: 'ng-strip', attr: { role: 'img', 'aria-label': `${g.log.length} check-ins in the last ${GOAL_WEEKS} weeks` } });
      const start = moment(today).startOf('isoWeek').subtract(GOAL_WEEKS - 1, 'weeks');
      for (let i = 0; i < GOAL_WEEKS * 7; i++) {
        const k = start.clone().add(i, 'days').format('YYYY-MM-DD');
        const x = byDay.get(k);
        const dot = strip.createDiv('ng-dot' + (x ? ' is-on' : '') + (k === today ? ' is-now' : '') + (k > today ? ' is-future' : ''));
        if (x) dot.setAttr('aria-label', `${moment(k).format('ddd D MMM')}${x.note ? ': ' + x.note : ''}`);
      }
    }
    const more = r.createEl('button', { cls: 'nd-icon-btn ng-more', attr: { type: 'button', 'aria-label': 'More' } });
    setIcon(more, 'more-horizontal');
    more.addEventListener('click', (e) => this.menu(e, g, picker));
    r.addEventListener('contextmenu', (e) => (e.preventDefault(), this.menu(e, g, picker)));

    if (open && notes.length) {
      const nl = r.createDiv('ng-notes');
      for (const x of notes.slice(0, 20)) {
        const n = nl.createDiv('ng-note');
        n.createSpan({ cls: 'ng-note-d', text: moment(x.d).format('D MMM') });
        n.createSpan({ text: x.note });
      }
    }
  }
}
