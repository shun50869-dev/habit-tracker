/* ===========================================
   Habits — app.js
   Pure vanilla JS. localStorage.
   =========================================== */

(() => {
  // ---------- Constants ----------
  const STORAGE_KEY = 'habits.v1';
  const DEFAULT_COLORS = [
    '#8b4513', '#5c7c4a', '#6b7c93', '#a13a2a',
    '#c2a14d', '#7a5c8b', '#3a6b6b', '#2a2520'
  ];
  const DOW_LABEL = ['日', '月', '火', '水', '木', '金', '土'];
  const MONTH_LABEL = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

  // ---------- Storage ----------
  const loadState = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { habits: [], records: {}, diary: {}, settings: { theme: 'auto' } };
      const parsed = JSON.parse(raw);
      parsed.habits ||= [];
      parsed.records ||= {};
      parsed.diary ||= {};
      parsed.settings ||= { theme: 'auto' };
      return parsed;
    } catch (e) {
      console.error(e);
      return { habits: [], records: {}, diary: {}, settings: { theme: 'auto' } };
    }
  };
  const saveState = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

  let state = loadState();

  // ---------- Date helpers ----------
  const fmtKey = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const todayKey = () => fmtKey(new Date());
  const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
  const parseKey = (k) => {
    const [y, m, d] = k.split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  // ---------- Habit logic ----------
  const isAchieved = (habit, record) => {
    if (!record) return false;
    if (habit.type === 'check') return record.value === 1;
    const target = Number(habit.target) || 0;
    if (target <= 0) return Number(record.value) > 0;
    return Number(record.value) >= target;
  };

  const calcStreak = (habit) => {
    const recs = state.records[habit.id] || {};
    let streak = 0;
    let d = new Date();
    // 今日が未達でも昨日まで連続なら継続中とみなさない仕様: 今日達成してなくても昨日からカウント
    // → 今日は判定スキップ、昨日から数える(よくある実装)
    if (!isAchieved(habit, recs[fmtKey(d)])) {
      d = addDays(d, -1);
    }
    while (true) {
      const k = fmtKey(d);
      if (isAchieved(habit, recs[k])) {
        streak += 1;
        d = addDays(d, -1);
      } else break;
      if (streak > 9999) break; // safety
    }
    return streak;
  };

  const calcBestStreak = (habit) => {
    const recs = state.records[habit.id] || {};
    const keys = Object.keys(recs).sort();
    let best = 0, cur = 0, prev = null;
    for (const k of keys) {
      if (!isAchieved(habit, recs[k])) { cur = 0; prev = k; continue; }
      if (prev) {
        const dprev = parseKey(prev);
        const dcur = parseKey(k);
        const diff = (dcur - dprev) / 86400000;
        cur = diff === 1 ? cur + 1 : 1;
      } else {
        cur = 1;
      }
      best = Math.max(best, cur);
      prev = k;
    }
    return best;
  };

  const calcRate30 = (habit) => {
    const recs = state.records[habit.id] || {};
    let done = 0;
    for (let i = 0; i < 30; i++) {
      const k = fmtKey(addDays(new Date(), -i));
      if (isAchieved(habit, recs[k])) done++;
    }
    return Math.round((done / 30) * 100);
  };

  const overallRate30 = () => {
    if (state.habits.length === 0) return 0;
    const sum = state.habits.reduce((a, h) => a + calcRate30(h), 0);
    return Math.round(sum / state.habits.length);
  };

  const todayDoneCount = () => {
    const k = todayKey();
    return state.habits.filter((h) => isAchieved(h, (state.records[h.id] || {})[k])).length;
  };

  // ---------- Theme ----------
  const applyTheme = () => {
    const t = state.settings.theme || 'auto';
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  };

  // ---------- Routing ----------
  const screens = ['today', 'stats', 'detail', 'settings'];
  let currentScreen = 'today';
  let detailHabitId = null;
  let calMonth = new Date(); // for detail calendar

  const showScreen = (name) => {
    currentScreen = name;
    screens.forEach((s) => {
      const el = document.getElementById(`screen-${s}`);
      if (el) el.hidden = s !== name;
    });
    const titles = { today: 'Today', stats: 'Stats', detail: 'Detail', settings: 'Settings' };
    document.getElementById('screenTitle').textContent = titles[name];
    document.getElementById('navBack').hidden = name === 'today';
    if (name === 'today') renderToday();
    if (name === 'stats') renderStats();
    if (name === 'detail') renderDetail();
    if (name === 'settings') renderSettings();
    window.scrollTo({ top: 0 });
  };

  // ---------- Render: Today ----------
  const renderToday = () => {
    const now = new Date();
    document.getElementById('todayDay').textContent = now.getDate();
    const dow = DOW_LABEL[now.getDay()];
    document.getElementById('todayMeta').textContent =
      `${now.getFullYear()} · ${MONTH_LABEL[now.getMonth()]} · ${dow}曜`;

    const list = document.getElementById('habitList');
    list.innerHTML = '';
    if (state.habits.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'empty-state';
      empty.innerHTML = `<div class="serif">no habits yet</div><p>右下の + から最初の習慣を追加。</p>`;
      list.appendChild(empty);
    } else {
      const k = todayKey();
      state.habits.forEach((h) => {
        const rec = (state.records[h.id] || {})[k];
        const done = isAchieved(h, rec);
        const li = document.createElement('li');
        li.className = 'habit-item' + (done ? ' done' : '');

        let actionHtml = '';
        if (h.type === 'check') {
          actionHtml = `<div class="check-circle" aria-label="達成">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M5 12l5 5L20 7" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>`;
        } else {
          const v = rec ? rec.value : 0;
          const unit = h.type === 'time' ? '分' : (h.unit || '');
          actionHtml = `<div class="value-pill">${v}${unit}</div>`;
        }

        const target = h.type === 'check'
          ? '○×'
          : (h.type === 'time' ? `目標 ${h.target || 0}分` : `目標 ${h.target || 0}${h.unit || ''}`);

        li.innerHTML = `
          <div class="habit-dot" style="background:${h.color || 'var(--accent)'}"></div>
          <div class="habit-main">
            <div class="habit-name">${escapeHtml(h.name)}</div>
            <div class="habit-sub">${target}</div>
          </div>
          <div class="habit-action">${actionHtml}</div>
        `;
        li.addEventListener('click', () => onHabitTap(h));
        li.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          openDetail(h.id);
        });
        // long-press for mobile
        let pressTimer;
        li.addEventListener('touchstart', () => {
          pressTimer = setTimeout(() => openDetail(h.id), 500);
        }, { passive: true });
        li.addEventListener('touchend', () => clearTimeout(pressTimer));
        li.addEventListener('touchmove', () => clearTimeout(pressTimer));

        list.appendChild(li);
      });
    }

    // Diary
    const diaryEl = document.getElementById('diaryInput');
    diaryEl.value = state.diary[todayKey()] || '';
  };

  const onHabitTap = (h) => {
    const k = todayKey();
    state.records[h.id] ||= {};
    if (h.type === 'check') {
      const cur = state.records[h.id][k];
      if (cur && cur.value === 1) {
        delete state.records[h.id][k];
      } else {
        state.records[h.id][k] = { value: 1, ts: Date.now() };
      }
      saveState();
      renderToday();
    } else {
      openValueModal(h);
    }
  };

  // ---------- Render: Stats ----------
  const renderStats = () => {
    document.getElementById('statTotalHabits').textContent = state.habits.length;
    document.getElementById('statTodayDone').textContent =
      `${todayDoneCount()}/${state.habits.length}`;
    document.getElementById('statRate30').textContent = `${overallRate30()}%`;

    const list = document.getElementById('statsList');
    list.innerHTML = '';
    if (state.habits.length === 0) {
      list.innerHTML = `<div class="empty-state"><div class="serif">no data</div><p>習慣を追加すると統計が表示される。</p></div>`;
      return;
    }
    state.habits.forEach((h) => {
      const recs = state.records[h.id] || {};
      const streak = calcStreak(h);
      const row = document.createElement('div');
      row.className = 'stats-row';
      row.addEventListener('click', () => openDetail(h.id));

      // mini heatmap (last 30 days)
      let heatHtml = '<div class="mini-heat">';
      for (let i = 29; i >= 0; i--) {
        const k = fmtKey(addDays(new Date(), -i));
        const r = recs[k];
        const lvl = levelFor(h, r);
        const bg = lvl === 0 ? 'var(--hm-0)' : `var(--hm-${lvl})`;
        heatHtml += `<span style="background:${bg}"></span>`;
      }
      heatHtml += '</div>';

      row.innerHTML = `
        <div class="stats-row-head">
          <div class="stats-row-name">
            <span class="habit-dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${h.color || 'var(--accent)'};margin-right:8px;vertical-align:middle"></span>
            ${escapeHtml(h.name)}
          </div>
          <div class="stats-row-streak">${streak}日連続</div>
        </div>
        ${heatHtml}
      `;
      list.appendChild(row);
    });
  };

  const levelFor = (habit, rec) => {
    if (!rec) return 0;
    if (habit.type === 'check') return rec.value === 1 ? 4 : 0;
    const target = Number(habit.target) || 0;
    const v = Number(rec.value) || 0;
    if (target <= 0) return v > 0 ? 4 : 0;
    const ratio = v / target;
    if (ratio <= 0) return 0;
    if (ratio < 0.34) return 1;
    if (ratio < 0.67) return 2;
    if (ratio < 1) return 3;
    return 4;
  };

  // ---------- Render: Detail ----------
  const openDetail = (id) => {
    detailHabitId = id;
    calMonth = new Date();
    showScreen('detail');
  };

  const renderDetail = () => {
    const h = state.habits.find((x) => x.id === detailHabitId);
    if (!h) { showScreen('today'); return; }
    document.getElementById('detailName').textContent = h.name;
    const targetTxt = h.type === 'check'
      ? '記録方式: ○×'
      : (h.type === 'time' ? `目標 ${h.target || 0}分` : `目標 ${h.target || 0}${h.unit || ''}`);
    const rem = h.reminderTime ? ` · 通知 ${h.reminderTime}` : '';
    document.getElementById('detailMeta').textContent = targetTxt + rem;

    document.getElementById('detailStreak').textContent = calcStreak(h);
    document.getElementById('detailBestStreak').textContent = calcBestStreak(h);
    document.getElementById('detailRate').textContent = `${calcRate30(h)}%`;

    renderHeatmap(h);
    renderBars(h);
  };

  const renderHeatmap = (h) => {
    const heat = document.getElementById('heatmap');
    heat.innerHTML = '';
    document.getElementById('calMonthLabel').textContent =
      `${calMonth.getFullYear()} ${MONTH_LABEL[calMonth.getMonth()]}`;

    DOW_LABEL.forEach((d) => {
      const el = document.createElement('div');
      el.className = 'dow';
      el.textContent = d;
      heat.appendChild(el);
    });

    const y = calMonth.getFullYear();
    const m = calMonth.getMonth();
    const first = new Date(y, m, 1);
    const startDow = first.getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const todayK = todayKey();

    for (let i = 0; i < startDow; i++) {
      const e = document.createElement('div');
      e.className = 'cell empty';
      heat.appendChild(e);
    }
    const recs = state.records[h.id] || {};
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(y, m, d);
      const k = fmtKey(dt);
      const r = recs[k];
      const lvl = levelFor(h, r);
      const cell = document.createElement('div');
      cell.className = 'cell' + (lvl > 0 ? ` l${lvl}` : '') + (k === todayK ? ' today' : '');
      cell.textContent = d;
      cell.title = r
        ? (h.type === 'check' ? '達成' : `${r.value}${h.type === 'time' ? '分' : (h.unit || '')}`)
        : '記録なし';
      cell.addEventListener('click', () => {
        // 過去日も編集可
        if (parseKey(k) > new Date()) return;
        if (h.type === 'check') {
          state.records[h.id] ||= {};
          if (state.records[h.id][k]?.value === 1) delete state.records[h.id][k];
          else state.records[h.id][k] = { value: 1, ts: Date.now() };
          saveState();
          renderHeatmap(h);
          renderBars(h);
          renderDetail();
        } else {
          openValueModal(h, k);
        }
      });
      heat.appendChild(cell);
    }
  };

  const renderBars = (h) => {
    const bars = document.getElementById('barsChart');
    bars.innerHTML = '';
    const recs = state.records[h.id] || {};
    let max = 1;
    if (h.type !== 'check') {
      for (let i = 29; i >= 0; i--) {
        const k = fmtKey(addDays(new Date(), -i));
        const v = Number(recs[k]?.value) || 0;
        if (v > max) max = v;
      }
      const target = Number(h.target) || 0;
      if (target > max) max = target;
    }
    for (let i = 29; i >= 0; i--) {
      const k = fmtKey(addDays(new Date(), -i));
      const r = recs[k];
      const bar = document.createElement('div');
      bar.className = 'bar';
      let height = 0;
      if (h.type === 'check') {
        height = r?.value === 1 ? 100 : 6;
        if (r?.value === 1) bar.classList.add('done');
      } else {
        const v = Number(r?.value) || 0;
        height = Math.max(2, (v / max) * 100);
        if (isAchieved(h, r)) bar.classList.add('done');
      }
      bar.style.height = `${height}%`;
      bar.title = `${k}: ${r ? (h.type === 'check' ? (r.value === 1 ? '達成' : '—') : r.value) : '—'}`;
      bars.appendChild(bar);
    }
  };

  // ---------- Render: Settings ----------
  const renderSettings = () => {
    document.getElementById('themeSelect').value = state.settings.theme || 'auto';
    const status = document.getElementById('notifStatus');
    if (!('Notification' in window)) {
      status.textContent = 'このブラウザは通知未対応';
    } else {
      status.textContent = `現在の許可状態: ${Notification.permission}`;
    }
  };

  // ---------- Modals ----------
  let editingHabitId = null;
  let selectedColor = DEFAULT_COLORS[0];

  const openHabitModal = (habit = null) => {
    editingHabitId = habit?.id || null;
    document.getElementById('habitModalTitle').textContent =
      habit ? '習慣を編集' : '習慣を追加';
    document.getElementById('hName').value = habit?.name || '';
    document.getElementById('hType').value = habit?.type || 'check';
    document.getElementById('hTarget').value = habit?.target || '';
    document.getElementById('hUnit').value = habit?.unit || '';
    document.getElementById('hReminder').value = habit?.reminderTime || '';
    selectedColor = habit?.color || DEFAULT_COLORS[0];
    renderColorRow();
    toggleTargetField();
    document.getElementById('habitModal').hidden = false;
  };
  const closeHabitModal = () => {
    document.getElementById('habitModal').hidden = true;
  };
  const renderColorRow = () => {
    const row = document.getElementById('colorRow');
    row.innerHTML = '';
    DEFAULT_COLORS.forEach((c) => {
      const sw = document.createElement('div');
      sw.className = 'color-swatch' + (c === selectedColor ? ' selected' : '');
      sw.style.background = c;
      sw.addEventListener('click', () => {
        selectedColor = c;
        renderColorRow();
      });
      row.appendChild(sw);
    });
  };
  const toggleTargetField = () => {
    const t = document.getElementById('hType').value;
    document.getElementById('hTargetField').style.display = t === 'check' ? 'none' : '';
    if (t === 'time') {
      document.getElementById('hUnit').value = '分';
      document.getElementById('hUnit').disabled = true;
    } else {
      document.getElementById('hUnit').disabled = false;
    }
  };

  const saveHabitFromModal = () => {
    const name = document.getElementById('hName').value.trim();
    const type = document.getElementById('hType').value;
    const target = Number(document.getElementById('hTarget').value) || 0;
    const unit = type === 'time' ? '分' : document.getElementById('hUnit').value.trim();
    const reminderTime = document.getElementById('hReminder').value || null;

    if (!name) { toast('名前を入力'); return; }

    if (editingHabitId) {
      const h = state.habits.find((x) => x.id === editingHabitId);
      Object.assign(h, { name, type, target, unit, reminderTime, color: selectedColor });
    } else {
      state.habits.push({
        id: 'h_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name, type, target, unit, reminderTime,
        color: selectedColor,
        createdAt: Date.now()
      });
    }
    saveState();
    closeHabitModal();
    showScreen(currentScreen);
    scheduleAllReminders();
  };

  // ---------- Value modal ----------
  let valueContext = null;
  const openValueModal = (habit, dateKey = null) => {
    valueContext = { habit, dateKey: dateKey || todayKey() };
    const recs = state.records[habit.id] || {};
    const cur = recs[valueContext.dateKey];
    document.getElementById('valueModalTitle').textContent =
      `${habit.name}  ·  ${valueContext.dateKey}`;
    document.getElementById('vInput').value = cur?.value ?? '';
    document.getElementById('vMemo').value = cur?.memo || '';
    const unit = habit.type === 'time' ? '分' : (habit.unit || '');
    document.getElementById('vTargetHint').textContent =
      `目標: ${habit.target || 0}${unit}`;
    document.getElementById('valueModal').hidden = false;
    setTimeout(() => document.getElementById('vInput').focus(), 50);
  };
  const closeValueModal = () => {
    valueContext = null;
    document.getElementById('valueModal').hidden = true;
  };
  const saveValueFromModal = () => {
    if (!valueContext) return;
    const { habit, dateKey } = valueContext;
    const v = Number(document.getElementById('vInput').value);
    const memo = document.getElementById('vMemo').value.trim();
    state.records[habit.id] ||= {};
    if (Number.isNaN(v) || v <= 0) {
      delete state.records[habit.id][dateKey];
    } else {
      state.records[habit.id][dateKey] = { value: v, memo, ts: Date.now() };
    }
    saveState();
    closeValueModal();
    showScreen(currentScreen);
  };

  // ---------- Reminders ----------
  const scheduleAllReminders = () => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready.then((reg) => {
      const now = new Date();
      state.habits.forEach((h) => {
        if (!h.reminderTime) return;
        const [hh, mm] = h.reminderTime.split(':').map(Number);
        const t = new Date();
        t.setHours(hh, mm, 0, 0);
        if (t <= now) t.setDate(t.getDate() + 1);
        const delay = t - now;
        // SWに送る簡易版(アプリが起動中の間のみ確実)
        navigator.serviceWorker.controller?.postMessage({
          type: 'SCHEDULE_REMINDER',
          title: 'Habits',
          body: `${h.name} の時間です`,
          delayMs: delay
        });
      });
    });
  };

  const requestNotifPermission = async () => {
    if (!('Notification' in window)) { toast('このブラウザは通知未対応'); return; }
    const p = await Notification.requestPermission();
    renderSettings();
    if (p === 'granted') {
      toast('通知を許可しました');
      scheduleAllReminders();
    } else {
      toast('通知は許可されませんでした');
    }
  };

  // ---------- Export / Import / Reset ----------
  const exportData = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `habits-backup-${todayKey()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast('エクスポートしました');
  };
  const importData = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(reader.result);
        if (!obj.habits || !obj.records) throw new Error('invalid');
        state = { ...state, ...obj };
        saveState();
        toast('インポート完了');
        showScreen('today');
      } catch (e) {
        toast('読み込み失敗');
      }
    };
    reader.readAsText(file);
  };
  const resetAll = () => {
    if (!confirm('全データを消去します。元に戻せません。続行?')) return;
    state = { habits: [], records: {}, diary: {}, settings: state.settings };
    saveState();
    showScreen('today');
    toast('消去しました');
  };

  // ---------- Toast ----------
  let toastTimer = null;
  const toast = (msg) => {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), 1800);
  };

  const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );

  // ---------- Wire up ----------
  const wire = () => {
    document.getElementById('navBack').addEventListener('click', () => showScreen('today'));
    document.getElementById('navStats').addEventListener('click', () => showScreen('stats'));
    document.getElementById('navSettings').addEventListener('click', () => showScreen('settings'));
    document.getElementById('addHabitBtn').addEventListener('click', () => openHabitModal());

    // Diary autosave
    document.getElementById('diaryInput').addEventListener('input', (e) => {
      state.diary[todayKey()] = e.target.value;
      saveState();
    });

    // Habit modal
    document.getElementById('hCancel').addEventListener('click', closeHabitModal);
    document.getElementById('hSave').addEventListener('click', saveHabitFromModal);
    document.getElementById('hType').addEventListener('change', toggleTargetField);

    // Value modal
    document.getElementById('vCancel').addEventListener('click', closeValueModal);
    document.getElementById('vSave').addEventListener('click', saveValueFromModal);
    document.getElementById('vMinus').addEventListener('click', () => {
      const i = document.getElementById('vInput');
      i.value = Math.max(0, (Number(i.value) || 0) - 1);
    });
    document.getElementById('vPlus').addEventListener('click', () => {
      const i = document.getElementById('vInput');
      i.value = (Number(i.value) || 0) + 1;
    });

    // Detail buttons
    document.getElementById('prevMonth').addEventListener('click', () => {
      calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1);
      const h = state.habits.find((x) => x.id === detailHabitId);
      renderHeatmap(h);
    });
    document.getElementById('nextMonth').addEventListener('click', () => {
      calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1);
      const h = state.habits.find((x) => x.id === detailHabitId);
      renderHeatmap(h);
    });
    document.getElementById('editHabitBtn').addEventListener('click', () => {
      const h = state.habits.find((x) => x.id === detailHabitId);
      if (h) openHabitModal(h);
    });
    document.getElementById('deleteHabitBtn').addEventListener('click', () => {
      if (!confirm('この習慣と全記録を削除します。続行?')) return;
      state.habits = state.habits.filter((x) => x.id !== detailHabitId);
      delete state.records[detailHabitId];
      saveState();
      detailHabitId = null;
      showScreen('today');
    });

    // Settings
    document.getElementById('enableNotifBtn').addEventListener('click', requestNotifPermission);
    document.getElementById('exportBtn').addEventListener('click', exportData);
    document.getElementById('importBtn').addEventListener('click', () =>
      document.getElementById('importFile').click()
    );
    document.getElementById('importFile').addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (f) importData(f);
      e.target.value = '';
    });
    document.getElementById('resetBtn').addEventListener('click', resetAll);
    document.getElementById('themeSelect').addEventListener('change', (e) => {
      state.settings.theme = e.target.value;
      saveState();
      applyTheme();
    });
  };

  // ---------- Init ----------
  applyTheme();
  wire();
  showScreen('today');

  // Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').then(() => {
        scheduleAllReminders();
      }).catch((e) => console.warn('SW register failed', e));
    });
  }

  // 日付変更時の再描画(0時を跨いだら)
  let lastDay = todayKey();
  setInterval(() => {
    const now = todayKey();
    if (now !== lastDay) {
      lastDay = now;
      if (currentScreen === 'today') renderToday();
    }
  }, 60_000);
})();
