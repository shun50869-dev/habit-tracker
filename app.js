/* ===========================================
   Habits — app.js v2
   グループ機能(多対多タグ方式)
   =========================================== */

(() => {
  // ---------- Constants ----------
  const STORAGE_KEY = 'habits.v1'; // キー名は維持(マイグレーションで処理)
  const CURRENT_VERSION = 2;
  const DEFAULT_COLORS = [
    '#8b4513', '#5c7c4a', '#6b7c93', '#a13a2a',
    '#c2a14d', '#7a5c8b', '#3a6b6b', '#2a2520'
  ];
  const DEFAULT_GROUP_COLORS = [
    '#8b4513', '#5c7c4a', '#6b7c93', '#7a5c8b',
    '#c2a14d', '#3a6b6b', '#a13a2a', '#2a2520'
  ];
  const DOW_LABEL = ['日', '月', '火', '水', '木', '金', '土'];
  const MONTH_LABEL = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

  // ---------- Storage / Migration ----------
  const newGroupId = () => 'g_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const newHabitId = () => 'h_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  const migrate = (data) => {
    const ver = data.version || 1;
    if (ver >= CURRENT_VERSION) return data;

    // v1 → v2: グループ機能追加
    if (!data.groups || data.groups.length === 0) {
      const defaultGroup = {
        id: newGroupId(),
        name: '習慣',
        color: DEFAULT_GROUP_COLORS[0],
        order: 0,
        createdAt: Date.now()
      };
      data.groups = [defaultGroup];

      // 既存習慣をデフォルトグループに所属させる
      (data.habits || []).forEach((h) => {
        if (!h.groupIds || h.groupIds.length === 0) {
          h.groupIds = [defaultGroup.id];
        }
      });
    }

    data.version = CURRENT_VERSION;
    return data;
  };

  const loadState = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        // 新規ユーザー: 初期グループを1個作る
        const g = {
          id: newGroupId(),
          name: '習慣',
          color: DEFAULT_GROUP_COLORS[0],
          order: 0,
          createdAt: Date.now()
        };
        return {
          version: CURRENT_VERSION,
          groups: [g],
          habits: [],
          records: {},
          diary: {},
          settings: { theme: 'light', selectedGroupId: g.id }
        };
      }
      const parsed = JSON.parse(raw);
      parsed.habits ||= [];
      parsed.records ||= {};
      parsed.diary ||= {};
      parsed.settings ||= {};
      parsed.settings.theme ||= 'light';
      parsed.groups ||= [];
      return migrate(parsed);
    } catch (e) {
      console.error(e);
      const g = {
        id: newGroupId(), name: '習慣',
        color: DEFAULT_GROUP_COLORS[0], order: 0, createdAt: Date.now()
      };
      return {
        version: CURRENT_VERSION,
        groups: [g], habits: [], records: {}, diary: {},
        settings: { theme: 'light', selectedGroupId: g.id }
      };
    }
  };
  const saveState = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

  let state = loadState();

  // selectedGroupIdの正規化(削除済みIDが残ってる場合)
  const ensureSelectedGroup = () => {
    if (state.groups.length === 0) {
      // 全グループ削除された → 自動で1個作る
      const g = {
        id: newGroupId(), name: '習慣',
        color: DEFAULT_GROUP_COLORS[0], order: 0, createdAt: Date.now()
      };
      state.groups.push(g);
    }
    const ids = state.groups.map(g => g.id);
    if (!state.settings.selectedGroupId || !ids.includes(state.settings.selectedGroupId)) {
      const sorted = [...state.groups].sort((a,b) => (a.order||0) - (b.order||0));
      state.settings.selectedGroupId = sorted[0].id;
    }
  };
  ensureSelectedGroup();

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
    if (!isAchieved(habit, recs[fmtKey(d)])) d = addDays(d, -1);
    while (true) {
      const k = fmtKey(d);
      if (isAchieved(habit, recs[k])) {
        streak += 1;
        d = addDays(d, -1);
      } else break;
      if (streak > 9999) break;
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
      } else cur = 1;
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

  // ---------- Group helpers ----------
  const getGroup = (id) => state.groups.find((g) => g.id === id);
  const sortedGroups = () => [...state.groups].sort((a, b) => (a.order || 0) - (b.order || 0));
  const habitsInGroup = (groupId) =>
    state.habits.filter((h) => (h.groupIds || []).includes(groupId));
  const habitCountInGroup = (groupId) => habitsInGroup(groupId).length;

  // 今日のグループ達成率
  const groupRateToday = (groupId) => {
    const hs = habitsInGroup(groupId);
    if (hs.length === 0) return null;
    const k = todayKey();
    const done = hs.filter((h) => isAchieved(h, (state.records[h.id] || {})[k])).length;
    return { done, total: hs.length, rate: Math.round((done / hs.length) * 100) };
  };

  // 全体の達成数(統計画面用)
  const todayDoneAll = () => {
    const k = todayKey();
    return state.habits.filter((h) => isAchieved(h, (state.records[h.id] || {})[k])).length;
  };
  const overallRate30 = () => {
    if (state.habits.length === 0) return 0;
    const sum = state.habits.reduce((a, h) => a + calcRate30(h), 0);
    return Math.round(sum / state.habits.length);
  };

  // ---------- Theme ----------
  const applyTheme = () => {
    const t = state.settings.theme || 'light';
    document.documentElement.setAttribute('data-theme', t);
  };

  // ---------- Routing ----------
  const screens = ['today', 'stats', 'detail', 'settings', 'groups'];
  let currentScreen = 'today';
  let detailHabitId = null;
  let calMonth = new Date();
  let navStack = []; // 戻るボタンのため

  const showScreen = (name, push = true) => {
    closeGroupDropdown();
    if (push && currentScreen !== name) navStack.push(currentScreen);
    currentScreen = name;
    screens.forEach((s) => {
      const el = document.getElementById(`screen-${s}`);
      if (el) el.hidden = s !== name;
    });
    const titles = {
      today: 'Today',
      stats: 'Stats',
      detail: 'Detail',
      settings: 'Settings',
      groups: 'Groups'
    };
    document.getElementById('screenTitle').textContent = titles[name];
    document.getElementById('navBack').hidden = name === 'today';
    if (name === 'today') renderToday();
    if (name === 'stats') renderStats();
    if (name === 'detail') renderDetail();
    if (name === 'settings') renderSettings();
    if (name === 'groups') renderGroups();
    window.scrollTo({ top: 0 });
  };

  const goBack = () => {
    const prev = navStack.pop();
    if (prev) showScreen(prev, false);
    else showScreen('today', false);
  };

  // ---------- Render: Today ----------
  const renderToday = () => {
    const now = new Date();
    document.getElementById('todayDay').textContent = now.getDate();
    const dow = DOW_LABEL[now.getDay()];
    document.getElementById('todayMeta').textContent =
      `${now.getFullYear()} · ${MONTH_LABEL[now.getMonth()]} · ${dow}曜`;

    // Group selector
    const sel = getGroup(state.settings.selectedGroupId);
    document.getElementById('selectedGroupLabel').textContent = sel ? sel.name : '—';
    document.getElementById('selectedGroupDot').style.background = sel ? sel.color : 'var(--accent)';

    // 進捗ヘッダー
    const rate = groupRateToday(state.settings.selectedGroupId);
    document.getElementById('todayProgress').textContent =
      rate ? `${rate.done}/${rate.total} 達成` : '';

    // 習慣リスト(現在のグループのみ)
    const list = document.getElementById('habitList');
    list.innerHTML = '';
    const hs = habitsInGroup(state.settings.selectedGroupId);
    if (hs.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'empty-state';
      empty.innerHTML = `<div class="serif">no habits yet</div><p>右下の + から最初の習慣を追加。</p>`;
      list.appendChild(empty);
    } else {
      const k = todayKey();
      hs.forEach((h) => {
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

        const groupCount = (h.groupIds || []).length;
        const multiBadge = groupCount > 1
          ? `<span class="habit-multi-badge" title="${groupCount}つのグループに所属">📌${groupCount}</span>`
          : '';

        li.innerHTML = `
          <div class="habit-dot" style="background:${h.color || 'var(--accent)'}"></div>
          <div class="habit-main">
            <div class="habit-name">
              <span class="name-text">${escapeHtml(h.name)}</span>
              ${multiBadge}
            </div>
            <div class="habit-sub">${target}</div>
          </div>
          <div class="habit-action">${actionHtml}</div>
        `;
        li.addEventListener('click', () => onHabitTap(h));

        // long-press → 詳細画面
        let pressTimer;
        let pressed = false;
        li.addEventListener('touchstart', () => {
          pressed = false;
          pressTimer = setTimeout(() => { pressed = true; openDetail(h.id); }, 500);
        }, { passive: true });
        li.addEventListener('touchend', (e) => {
          clearTimeout(pressTimer);
          if (pressed) e.preventDefault();
        });
        li.addEventListener('touchmove', () => clearTimeout(pressTimer));
        li.addEventListener('contextmenu', (e) => { e.preventDefault(); openDetail(h.id); });

        list.appendChild(li);
      });
    }

    // Diary
    document.getElementById('diaryInput').value = state.diary[todayKey()] || '';
  };

  const onHabitTap = (h) => {
    const k = todayKey();
    state.records[h.id] ||= {};
    if (h.type === 'check') {
      const cur = state.records[h.id][k];
      if (cur && cur.value === 1) delete state.records[h.id][k];
      else state.records[h.id][k] = { value: 1, ts: Date.now() };
      saveState();
      renderToday();
    } else {
      openValueModal(h);
    }
  };

  // ---------- Group dropdown ----------
  const openGroupDropdown = () => {
    const dd = document.getElementById('groupDropdown');
    const sel = document.getElementById('groupSelector');
    dd.innerHTML = '';
    sortedGroups().forEach((g) => {
      const item = document.createElement('div');
      item.className = 'group-dropdown-item' + (g.id === state.settings.selectedGroupId ? ' selected' : '');
      const count = habitCountInGroup(g.id);
      item.innerHTML = `
        <div class="group-color-dot" style="background:${g.color}"></div>
        <div style="flex:1">${escapeHtml(g.name)}</div>
        <div class="muted small">${count}</div>
      `;
      item.addEventListener('click', () => {
        state.settings.selectedGroupId = g.id;
        saveState();
        closeGroupDropdown();
        renderToday();
      });
      dd.appendChild(item);
    });
    // 区切り線+管理リンク
    const manage = document.createElement('div');
    manage.className = 'group-dropdown-item divider';
    manage.innerHTML = `<span style="flex:1">グループを管理</span><span>›</span>`;
    manage.addEventListener('click', () => {
      closeGroupDropdown();
      showScreen('groups');
    });
    dd.appendChild(manage);

    dd.hidden = false;
    sel.classList.add('open');
  };
  const closeGroupDropdown = () => {
    const dd = document.getElementById('groupDropdown');
    const sel = document.getElementById('groupSelector');
    if (dd) dd.hidden = true;
    if (sel) sel.classList.remove('open');
  };

  // ---------- Render: Stats ----------
  const renderStats = () => {
    document.getElementById('statTotalHabits').textContent = state.habits.length;
    document.getElementById('statTodayDone').textContent =
      `${todayDoneAll()}/${state.habits.length}`;
    document.getElementById('statRate30').textContent = `${overallRate30()}%`;

    // グループ別達成率(今日)
    const gList = document.getElementById('groupStatsList');
    gList.innerHTML = '';
    const gs = sortedGroups();
    if (gs.length === 0) {
      gList.innerHTML = '<p class="muted small">グループがありません</p>';
    } else {
      gs.forEach((g) => {
        const r = groupRateToday(g.id);
        const card = document.createElement('div');
        card.className = 'group-stats-card';
        const rateText = r ? `${r.rate}%` : '—';
        const rateNum = r ? r.rate : 0;
        const doneText = r ? `${r.done} / ${r.total}` : '習慣なし';
        card.innerHTML = `
          <div class="group-stats-row">
            <div class="group-stats-name">
              <div class="group-color-dot" style="background:${g.color}"></div>
              <span class="name-text">${escapeHtml(g.name)}</span>
              <span class="muted small">${doneText}</span>
            </div>
            <div class="group-stats-rate">${rateText}</div>
          </div>
          <div class="progress-bar">
            <div class="progress-bar-fill" style="width:${rateNum}%; background:${g.color}"></div>
          </div>
        `;
        gList.appendChild(card);
      });
    }

    // 習慣別
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

      let heatHtml = '<div class="mini-heat">';
      for (let i = 29; i >= 0; i--) {
        const k = fmtKey(addDays(new Date(), -i));
        const r = recs[k];
        const lvl = levelFor(h, r);
        const bg = lvl === 0 ? 'var(--hm-0)' : `var(--hm-${lvl})`;
        heatHtml += `<span style="background:${bg}"></span>`;
      }
      heatHtml += '</div>';

      const groupCount = (h.groupIds || []).length;
      const multiBadge = groupCount > 1 ? ` 📌${groupCount}` : '';

      row.innerHTML = `
        <div class="stats-row-head">
          <div class="stats-row-name">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${h.color || 'var(--accent)'};margin-right:8px;vertical-align:middle"></span>
            ${escapeHtml(h.name)}${multiBadge}
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

    // グループchips
    const gWrap = document.getElementById('detailGroups');
    gWrap.innerHTML = '';
    (h.groupIds || []).forEach((gid) => {
      const g = getGroup(gid);
      if (!g) return;
      const chip = document.createElement('span');
      chip.className = 'detail-group-chip';
      chip.innerHTML = `<span class="chip-dot" style="background:${g.color}"></span>${escapeHtml(g.name)}`;
      gWrap.appendChild(chip);
    });

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

  // ---------- Render: Groups management ----------
  const renderGroups = () => {
    const list = document.getElementById('groupManageList');
    list.innerHTML = '';
    const gs = sortedGroups();
    gs.forEach((g) => {
      const row = document.createElement('div');
      row.className = 'group-manage-row';
      row.dataset.gid = g.id;
      const count = habitCountInGroup(g.id);
      row.innerHTML = `
        <div class="drag-handle" data-gid="${g.id}">⋮⋮</div>
        <div class="group-manage-name">
          <div class="group-color-dot" style="background:${g.color}"></div>
          <span class="name-text">${escapeHtml(g.name)}</span>
        </div>
        <div class="group-manage-meta">${count}</div>
        <div class="group-manage-actions">
          <button class="icon-btn" data-act="edit" data-gid="${g.id}" aria-label="編集">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M12 20h9M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4 12.5-12.5z" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button class="icon-btn" data-act="delete" data-gid="${g.id}" aria-label="削除">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
      `;
      list.appendChild(row);
    });
    list.querySelectorAll('[data-act="edit"]').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        openGroupModal(getGroup(b.dataset.gid));
      });
    });
    list.querySelectorAll('[data-act="delete"]').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteGroup(b.dataset.gid);
      });
    });
    setupGroupDragSort(list);
  };

  // ---------- Drag & Drop sort (mouse + touch) ----------
  const setupGroupDragSort = (list) => {
    let dragging = null;       // 移動中の行要素
    let placeholder = null;    // ドロップ位置を示すための参照行
    let startY = 0;
    let dragOffset = 0;
    let isTouch = false;

    const handles = list.querySelectorAll('.drag-handle');

    const onPointerMove = (clientY) => {
      if (!dragging) return;
      const rect = list.getBoundingClientRect();
      const rows = [...list.querySelectorAll('.group-manage-row:not(.dragging)')];
      let target = null;
      for (const row of rows) {
        const r = row.getBoundingClientRect();
        const mid = r.top + r.height / 2;
        if (clientY < mid) { target = row; break; }
      }
      // 視覚的フィードバック
      list.querySelectorAll('.drop-target').forEach((e) => e.classList.remove('drop-target'));
      if (target) target.classList.add('drop-target');
      placeholder = target;
    };
    const onPointerUp = () => {
      if (!dragging) return;
      const draggedId = dragging.dataset.gid;
      list.querySelectorAll('.drop-target').forEach((e) => e.classList.remove('drop-target'));
      if (placeholder) {
        list.insertBefore(dragging, placeholder);
      } else {
        list.appendChild(dragging);
      }
      dragging.classList.remove('dragging');
      // orderを再採番
      [...list.querySelectorAll('.group-manage-row')].forEach((row, i) => {
        const g = getGroup(row.dataset.gid);
        if (g) g.order = i;
      });
      saveState();
      dragging = null;
      placeholder = null;
      // touchend後の不要なclick防止: 0msでrender
      setTimeout(renderGroups, 0);
    };

    handles.forEach((handle) => {
      // Touch
      handle.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const row = handle.closest('.group-manage-row');
        if (!row) return;
        dragging = row;
        isTouch = true;
        row.classList.add('dragging');
        startY = e.touches[0].clientY;
      }, { passive: false });

      // Mouse
      handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const row = handle.closest('.group-manage-row');
        if (!row) return;
        dragging = row;
        isTouch = false;
        row.classList.add('dragging');
        startY = e.clientY;
      });
    });

    document.addEventListener('touchmove', (e) => {
      if (!dragging || !isTouch) return;
      e.preventDefault();
      onPointerMove(e.touches[0].clientY);
    }, { passive: false });

    document.addEventListener('mousemove', (e) => {
      if (!dragging || isTouch) return;
      onPointerMove(e.clientY);
    });

    document.addEventListener('touchend', () => { if (dragging && isTouch) onPointerUp(); });
    document.addEventListener('mouseup', () => { if (dragging && !isTouch) onPointerUp(); });
  };

  // ---------- Render: Settings ----------
  const renderSettings = () => {
    document.getElementById('themeSelect').value = state.settings.theme || 'light';
    const status = document.getElementById('notifStatus');
    if (!('Notification' in window)) {
      status.textContent = 'このブラウザは通知未対応';
    } else {
      status.textContent = `現在の許可状態: ${Notification.permission}`;
    }
  };

  // ---------- Habit modal ----------
  let editingHabitId = null;
  let selectedColor = DEFAULT_COLORS[0];
  let selectedGroupIdsForHabit = new Set();

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

    // 所属グループ初期値: 編集なら既存、新規なら現在表示中のグループをデフォ選択
    selectedGroupIdsForHabit = new Set(
      habit?.groupIds || [state.settings.selectedGroupId]
    );
    renderGroupCheckList();
    renderColorRow();
    toggleTargetField();
    document.getElementById('hGroupError').hidden = true;
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
      sw.addEventListener('click', () => { selectedColor = c; renderColorRow(); });
      row.appendChild(sw);
    });
  };
  const renderGroupCheckList = () => {
    const wrap = document.getElementById('hGroupList');
    wrap.innerHTML = '';
    sortedGroups().forEach((g) => {
      const item = document.createElement('div');
      const checked = selectedGroupIdsForHabit.has(g.id);
      item.className = 'group-check-item' + (checked ? ' checked' : '');
      item.innerHTML = `
        <div class="check-box">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3">
            <path d="M5 12l5 5L20 7" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="group-color-dot" style="background:${g.color}"></div>
        <div class="name">${escapeHtml(g.name)}</div>
      `;
      item.addEventListener('click', () => {
        if (selectedGroupIdsForHabit.has(g.id)) selectedGroupIdsForHabit.delete(g.id);
        else selectedGroupIdsForHabit.add(g.id);
        renderGroupCheckList();
        document.getElementById('hGroupError').hidden = selectedGroupIdsForHabit.size > 0;
      });
      wrap.appendChild(item);
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
    if (selectedGroupIdsForHabit.size === 0) {
      document.getElementById('hGroupError').hidden = false;
      return;
    }
    const groupIds = [...selectedGroupIdsForHabit];

    if (editingHabitId) {
      const h = state.habits.find((x) => x.id === editingHabitId);
      Object.assign(h, { name, type, target, unit, reminderTime, color: selectedColor, groupIds });
    } else {
      state.habits.push({
        id: newHabitId(),
        name, type, target, unit, reminderTime,
        color: selectedColor,
        groupIds,
        createdAt: Date.now()
      });
    }
    saveState();
    closeHabitModal();
    showScreen(currentScreen, false);
    scheduleAllReminders();
  };

  // ---------- Group modal ----------
  let editingGroupId = null;
  let selectedGroupColor = DEFAULT_GROUP_COLORS[0];

  const openGroupModal = (group = null) => {
    editingGroupId = group?.id || null;
    document.getElementById('groupModalTitle').textContent =
      group ? 'グループを編集' : 'グループを追加';
    document.getElementById('gName').value = group?.name || '';
    selectedGroupColor = group?.color || DEFAULT_GROUP_COLORS[state.groups.length % DEFAULT_GROUP_COLORS.length];
    renderGColorRow();
    document.getElementById('groupModal').hidden = false;
    setTimeout(() => document.getElementById('gName').focus(), 50);
  };
  const closeGroupModal = () => {
    document.getElementById('groupModal').hidden = true;
  };
  const renderGColorRow = () => {
    const row = document.getElementById('gColorRow');
    row.innerHTML = '';
    DEFAULT_GROUP_COLORS.forEach((c) => {
      const sw = document.createElement('div');
      sw.className = 'color-swatch' + (c === selectedGroupColor ? ' selected' : '');
      sw.style.background = c;
      sw.addEventListener('click', () => { selectedGroupColor = c; renderGColorRow(); });
      row.appendChild(sw);
    });
  };
  const saveGroupFromModal = () => {
    const name = document.getElementById('gName').value.trim();
    if (!name) { toast('名前を入力'); return; }
    if (editingGroupId) {
      const g = getGroup(editingGroupId);
      g.name = name;
      g.color = selectedGroupColor;
    } else {
      const maxOrder = Math.max(-1, ...state.groups.map(g => g.order || 0));
      state.groups.push({
        id: newGroupId(),
        name,
        color: selectedGroupColor,
        order: maxOrder + 1,
        createdAt: Date.now()
      });
    }
    saveState();
    closeGroupModal();
    renderGroups();
  };

  const deleteGroup = (gid) => {
    const g = getGroup(gid);
    if (!g) return;
    const habitsInThis = habitsInGroup(gid);
    const orphans = habitsInThis.filter((h) =>
      (h.groupIds || []).filter(id => id !== gid).length === 0
    );

    let msg = `「${g.name}」を削除します。\n\n`;
    if (habitsInThis.length === 0) {
      msg += '所属する習慣はありません。';
    } else {
      msg += `${habitsInThis.length}個の習慣がこのグループに所属しています。\n`;
      if (orphans.length > 0) {
        msg += `うち${orphans.length}個は他のグループに所属していないため、削除すると孤立します。\n`;
        msg += `→ それらの習慣も併せて削除されます。\n`;
      } else {
        msg += `すべて他のグループにも所属しているので、習慣自体は残ります。\n`;
      }
    }
    msg += '\n続行しますか?';
    if (!confirm(msg)) return;

    // 孤立する習慣を削除
    const orphanIds = new Set(orphans.map((h) => h.id));
    state.habits = state.habits.filter((h) => !orphanIds.has(h.id));
    orphanIds.forEach((id) => delete state.records[id]);
    // 残った習慣からこのグループIDを除去
    state.habits.forEach((h) => {
      h.groupIds = (h.groupIds || []).filter((id) => id !== gid);
    });
    // グループ自体を削除
    state.groups = state.groups.filter((g) => g.id !== gid);
    ensureSelectedGroup();
    saveState();
    renderGroups();
    toast('削除しました');
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
    showScreen(currentScreen, false);
  };

  // ---------- Reminders ----------
  const scheduleAllReminders = () => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready.then(() => {
      const now = new Date();
      state.habits.forEach((h) => {
        if (!h.reminderTime) return;
        const [hh, mm] = h.reminderTime.split(':').map(Number);
        const t = new Date();
        t.setHours(hh, mm, 0, 0);
        if (t <= now) t.setDate(t.getDate() + 1);
        const delay = t - now;
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
    if (p === 'granted') { toast('通知を許可しました'); scheduleAllReminders(); }
    else toast('通知は許可されませんでした');
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
        if (!obj.habits) throw new Error('invalid');
        state = migrate({
          ...obj,
          settings: { ...(state.settings || {}), ...(obj.settings || {}) }
        });
        ensureSelectedGroup();
        saveState();
        toast('インポート完了');
        showScreen('today', false);
      } catch (e) {
        toast('読み込み失敗');
      }
    };
    reader.readAsText(file);
  };
  const resetAll = () => {
    if (!confirm('全データを消去します。元に戻せません。続行?')) return;
    const settings = state.settings;
    localStorage.removeItem(STORAGE_KEY);
    state = loadState();
    state.settings.theme = settings.theme || 'light';
    saveState();
    showScreen('today', false);
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
    document.getElementById('navBack').addEventListener('click', goBack);
    document.getElementById('navStats').addEventListener('click', () => showScreen('stats'));
    document.getElementById('navSettings').addEventListener('click', () => showScreen('settings'));
    document.getElementById('addHabitBtn').addEventListener('click', () => {
      if (state.groups.length === 0) {
        toast('先にグループを作成してください');
        showScreen('groups');
        return;
      }
      openHabitModal();
    });

    // Group selector
    document.getElementById('groupSelector').addEventListener('click', (e) => {
      // ドロップダウン内クリックは無視
      if (e.target.closest('.group-dropdown')) return;
      const dd = document.getElementById('groupDropdown');
      if (dd.hidden) openGroupDropdown();
      else closeGroupDropdown();
      e.stopPropagation();
    });
    document.addEventListener('click', (e) => {
      const sel = document.getElementById('groupSelector');
      if (!sel.contains(e.target)) closeGroupDropdown();
    });

    // Diary
    document.getElementById('diaryInput').addEventListener('input', (e) => {
      state.diary[todayKey()] = e.target.value;
      saveState();
    });

    // Habit modal
    document.getElementById('hCancel').addEventListener('click', closeHabitModal);
    document.getElementById('hSave').addEventListener('click', saveHabitFromModal);
    document.getElementById('hType').addEventListener('change', toggleTargetField);

    // Group modal
    document.getElementById('gCancel').addEventListener('click', closeGroupModal);
    document.getElementById('gSave').addEventListener('click', saveGroupFromModal);

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

    // Detail
    document.getElementById('prevMonth').addEventListener('click', () => {
      calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1);
      const h = state.habits.find((x) => x.id === detailHabitId);
      if (h) renderHeatmap(h);
    });
    document.getElementById('nextMonth').addEventListener('click', () => {
      calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1);
      const h = state.habits.find((x) => x.id === detailHabitId);
      if (h) renderHeatmap(h);
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
      goBack();
    });

    // Groups screen
    document.getElementById('addGroupBtn').addEventListener('click', () => openGroupModal());

    // Settings
    document.getElementById('linkGroups').addEventListener('click', () => showScreen('groups'));
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
  showScreen('today', false);

  // Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').then((reg) => {
        // 新しいバージョンの自動取得
        reg.update();
        scheduleAllReminders();
      }).catch((e) => console.warn('SW register failed', e));
    });
  }

  // 0時跨ぎ再描画
  let lastDay = todayKey();
  setInterval(() => {
    const now = todayKey();
    if (now !== lastDay) {
      lastDay = now;
      if (currentScreen === 'today') renderToday();
    }
  }, 60_000);
})();
