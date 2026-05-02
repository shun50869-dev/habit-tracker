/* ===========================================
   Habits — app.js v3
   頻度機能(daily/weekdays/monthly_n/interval) + グループ
   =========================================== */

(() => {
  // ---------- Constants ----------
  const STORAGE_KEY = 'habits.v1';
  const CURRENT_VERSION = 3;
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

  // ---------- ID gen ----------
  const newGroupId = () => 'g_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const newHabitId = () => 'h_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // ---------- Migration ----------
  const migrate = (data) => {
    const ver = data.version || 1;

    // v1 → v2: groups
    if (ver < 2) {
      if (!data.groups || data.groups.length === 0) {
        const dg = {
          id: newGroupId(), name: '習慣',
          color: DEFAULT_GROUP_COLORS[0], order: 0, createdAt: Date.now()
        };
        data.groups = [dg];
        (data.habits || []).forEach((h) => {
          if (!h.groupIds || h.groupIds.length === 0) h.groupIds = [dg.id];
        });
      }
    }

    // v2 → v3: frequency + habit order
    if (ver < 3) {
      (data.habits || []).forEach((h, i) => {
        if (!h.frequency) h.frequency = { type: 'daily' };
        if (typeof h.order !== 'number') h.order = i;
      });
    }

    data.version = CURRENT_VERSION;
    return data;
  };

  const initEmptyState = () => {
    const g = {
      id: newGroupId(), name: '習慣',
      color: DEFAULT_GROUP_COLORS[0], order: 0, createdAt: Date.now()
    };
    return {
      version: CURRENT_VERSION,
      groups: [g],
      habits: [],
      records: {},
      diary: {},
      settings: { theme: 'light', selectedGroupId: g.id }
    };
  };

  const loadState = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return initEmptyState();
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
      return initEmptyState();
    }
  };
  const saveState = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

  let state = loadState();

  const ensureSelectedGroup = () => {
    if (state.groups.length === 0) {
      state.groups.push({
        id: newGroupId(), name: '習慣',
        color: DEFAULT_GROUP_COLORS[0], order: 0, createdAt: Date.now()
      });
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
  const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); r.setHours(0,0,0,0); return r; };
  const parseKey = (k) => {
    const [y, m, d] = k.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const dayDiff = (a, b) => Math.round((a - b) / 86400000);

  // ---------- Habit logic ----------
  const isAchieved = (habit, record) => {
    if (!record) return false;
    if (habit.type === 'check') return record.value === 1;
    const target = Number(habit.target) || 0;
    if (target <= 0) return Number(record.value) > 0;
    return Number(record.value) >= target;
  };

  // ---------- Frequency logic ----------
  // その日が「やる日」かを判定。
  // monthly_n と interval は履歴を見て動的に判定する。
  const isDueDay = (habit, dateKey) => {
    const f = habit.frequency || { type: 'daily' };
    const date = parseKey(dateKey);

    if (f.type === 'daily') return true;

    if (f.type === 'weekdays') {
      const wd = (f.weekdays || []);
      if (wd.length === 0) return true; // 未指定なら毎日扱い
      return wd.includes(date.getDay());
    }

    if (f.type === 'monthly_n') {
      const n = Math.max(1, Number(f.monthlyN) || 1);
      // その日までに当月で何回達成済みか
      const recs = state.records[habit.id] || {};
      const y = date.getFullYear();
      const m = date.getMonth();
      let doneInMonth = 0;
      for (const [k, r] of Object.entries(recs)) {
        const dk = parseKey(k);
        if (dk.getFullYear() === y && dk.getMonth() === m && dk < date) {
          if (isAchieved(habit, r)) doneInMonth++;
        }
      }
      // すでにN回達成 → 今日はやらない日
      return doneInMonth < n;
    }

    if (f.type === 'interval') {
      const days = Math.max(1, Number(f.intervalDays) || 1);
      const recs = state.records[habit.id] || {};
      // 直近の達成日を探す(その日より前)
      let lastDone = null;
      for (const [k, r] of Object.entries(recs)) {
        if (!isAchieved(habit, r)) continue;
        const dk = parseKey(k);
        if (dk >= date) continue;
        if (!lastDone || dk > lastDone) lastDone = dk;
      }
      const startDate = habit.createdAt
        ? new Date(habit.createdAt)
        : parseKey(dateKey);
      startDate.setHours(0, 0, 0, 0);
      const baseline = lastDone || addDays(startDate, -days);
      const diff = dayDiff(date, baseline);
      // diff >= days なら「次の周期がもう来てる」=やる日
      return diff >= days;
    }
    return true;
  };

  // 過去30日の達成率: やる日のうち達成した日 / やる日
  const calcRate30 = (habit) => {
    const recs = state.records[habit.id] || {};
    let due = 0, done = 0;
    for (let i = 0; i < 30; i++) {
      const k = fmtKey(addDays(new Date(), -i));
      if (isDueDay(habit, k)) {
        due++;
        if (isAchieved(habit, recs[k])) done++;
      }
    }
    if (due === 0) return null;
    return Math.round((done / due) * 100);
  };

  // ストリーク(頻度別単位)
  const calcStreak = (habit) => {
    const f = habit.frequency || { type: 'daily' };
    const recs = state.records[habit.id] || {};

    if (f.type === 'daily') {
      let streak = 0;
      let d = new Date();
      d.setHours(0,0,0,0);
      // 今日まだ未達成なら昨日から数える
      if (!isAchieved(habit, recs[fmtKey(d)])) d = addDays(d, -1);
      while (true) {
        const k = fmtKey(d);
        if (isAchieved(habit, recs[k])) {
          streak++;
          d = addDays(d, -1);
        } else break;
        if (streak > 9999) break;
      }
      return streak;
    }

    if (f.type === 'weekdays') {
      // 連続「やる日」達成数を数える
      const wd = f.weekdays || [];
      if (wd.length === 0) return 0;
      let streak = 0;
      let d = new Date();
      d.setHours(0,0,0,0);
      // 直近のやる日まで遡る
      let scanned = 0;
      // 今日がやる日でないならスキップ
      while (!wd.includes(d.getDay()) && scanned < 8) { d = addDays(d, -1); scanned++; }
      // 今日(やる日)に未達成なら前のやる日から
      if (!isAchieved(habit, recs[fmtKey(d)])) {
        d = addDays(d, -1);
        scanned = 0;
        while (!wd.includes(d.getDay()) && scanned < 8) { d = addDays(d, -1); scanned++; }
      }
      while (true) {
        const k = fmtKey(d);
        if (wd.includes(d.getDay())) {
          if (isAchieved(habit, recs[k])) {
            streak++;
            d = addDays(d, -1);
          } else break;
        } else {
          d = addDays(d, -1);
        }
        if (streak > 9999) break;
      }
      return streak;
    }

    if (f.type === 'monthly_n') {
      const n = Math.max(1, Number(f.monthlyN) || 1);
      let streak = 0;
      const today = new Date();
      let y = today.getFullYear();
      let m = today.getMonth();
      // 今月達成回数チェック
      const monthDone = (yy, mm) => {
        let cnt = 0;
        for (const [k, r] of Object.entries(recs)) {
          const dk = parseKey(k);
          if (dk.getFullYear() === yy && dk.getMonth() === mm && isAchieved(habit, r)) cnt++;
        }
        return cnt;
      };
      // 今月N回未達なら先月から数える
      if (monthDone(y, m) < n) { m -= 1; if (m < 0) { m = 11; y--; } }
      while (true) {
        if (monthDone(y, m) >= n) {
          streak++;
          m -= 1; if (m < 0) { m = 11; y--; }
        } else break;
        if (streak > 9999) break;
      }
      return streak;
    }

    if (f.type === 'interval') {
      // 達成日を時系列ソートして、前回からN日以内(=同周期)で達成し続けた回数
      // ただし「N日ごと」なので、達成日の間隔が intervalDays 以上なら連続扱い、未満なら同じ周期
      // ここでは「達成日の数を直近から数える」シンプル版
      const days = Math.max(1, Number(f.intervalDays) || 1);
      const dates = Object.entries(recs)
        .filter(([_, r]) => isAchieved(habit, r))
        .map(([k]) => parseKey(k))
        .sort((a, b) => b - a); // 新しい順
      if (dates.length === 0) return 0;
      let streak = 1;
      for (let i = 1; i < dates.length; i++) {
        const gap = dayDiff(dates[i - 1], dates[i]);
        // 1.5倍以内ならOK(柔軟)
        if (gap <= days * 1.5) streak++;
        else break;
      }
      return streak;
    }
    return 0;
  };

  const calcBestStreak = (habit) => {
    const f = habit.frequency || { type: 'daily' };
    const recs = state.records[habit.id] || {};

    if (f.type === 'daily') {
      const keys = Object.keys(recs).sort();
      let best = 0, cur = 0, prev = null;
      for (const k of keys) {
        if (!isAchieved(habit, recs[k])) { cur = 0; prev = k; continue; }
        if (prev) {
          const diff = dayDiff(parseKey(k), parseKey(prev));
          cur = diff === 1 ? cur + 1 : 1;
        } else cur = 1;
        best = Math.max(best, cur);
        prev = k;
      }
      return best;
    }

    if (f.type === 'weekdays') {
      const wd = f.weekdays || [];
      if (wd.length === 0) return 0;
      // 全期間のやる日を順にスキャン
      const recDates = Object.entries(recs)
        .filter(([_, r]) => isAchieved(habit, r))
        .map(([k]) => parseKey(k))
        .sort((a, b) => a - b);
      if (recDates.length === 0) return 0;
      const start = recDates[0];
      const end = new Date();
      let best = 0, cur = 0;
      for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
        if (!wd.includes(d.getDay())) continue;
        const k = fmtKey(d);
        if (isAchieved(habit, recs[k])) {
          cur++;
          best = Math.max(best, cur);
        } else cur = 0;
      }
      return best;
    }

    if (f.type === 'monthly_n') {
      const n = Math.max(1, Number(f.monthlyN) || 1);
      const monthMap = new Map(); // "yyyy-mm" → done count
      Object.entries(recs).forEach(([k, r]) => {
        if (!isAchieved(habit, r)) return;
        const d = parseKey(k);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        monthMap.set(key, (monthMap.get(key) || 0) + 1);
      });
      // 全期間で連続月をスキャン
      const dates = Object.keys(recs).map(parseKey).sort((a,b)=>a-b);
      if (dates.length === 0) return 0;
      let best = 0, cur = 0;
      let y = dates[0].getFullYear();
      let m = dates[0].getMonth();
      const today = new Date();
      while (y < today.getFullYear() || (y === today.getFullYear() && m <= today.getMonth())) {
        const cnt = monthMap.get(`${y}-${m}`) || 0;
        if (cnt >= n) { cur++; best = Math.max(best, cur); }
        else cur = 0;
        m++; if (m > 11) { m = 0; y++; }
      }
      return best;
    }

    if (f.type === 'interval') {
      const days = Math.max(1, Number(f.intervalDays) || 1);
      const dates = Object.entries(recs)
        .filter(([_, r]) => isAchieved(habit, r))
        .map(([k]) => parseKey(k))
        .sort((a, b) => a - b);
      if (dates.length === 0) return 0;
      let best = 1, cur = 1;
      for (let i = 1; i < dates.length; i++) {
        const gap = dayDiff(dates[i], dates[i - 1]);
        if (gap <= days * 1.5) { cur++; best = Math.max(best, cur); }
        else cur = 1;
      }
      return best;
    }
    return 0;
  };

  const streakUnitLabel = (habit) => {
    const t = habit.frequency?.type;
    if (t === 'weekdays') return '連続(回)';
    if (t === 'monthly_n') return '連続(月)';
    if (t === 'interval') return '連続(回)';
    return '連続日数';
  };

  const frequencyLabel = (habit) => {
    const f = habit.frequency || { type: 'daily' };
    if (f.type === 'daily') return '毎日';
    if (f.type === 'weekdays') {
      const wd = f.weekdays || [];
      if (wd.length === 0) return '未設定';
      if (wd.length === 7) return '毎日';
      return wd.sort().map(i => DOW_LABEL[i]).join('・');
    }
    if (f.type === 'monthly_n') return `月${f.monthlyN || 1}回`;
    if (f.type === 'interval') return `${f.intervalDays || 1}日ごと`;
    return '';
  };

  // ---------- Group helpers ----------
  const getGroup = (id) => state.groups.find((g) => g.id === id);
  const sortedGroups = () => [...state.groups].sort((a, b) => (a.order || 0) - (b.order || 0));
  const sortedHabits = () => [...state.habits].sort((a, b) => (a.order || 0) - (b.order || 0));
  const habitsInGroup = (groupId) =>
    sortedHabits().filter((h) => (h.groupIds || []).includes(groupId));
  const habitCountInGroup = (groupId) => habitsInGroup(groupId).length;

  // 今日のグループ達成率(やる日 / 達成数 ベース)
  const groupRateToday = (groupId) => {
    const hs = habitsInGroup(groupId);
    if (hs.length === 0) return null;
    const k = todayKey();
    let due = 0, done = 0;
    hs.forEach((h) => {
      if (isDueDay(h, k)) {
        due++;
        if (isAchieved(h, (state.records[h.id] || {})[k])) done++;
      }
    });
    if (due === 0) return { done: 0, total: 0, rate: 0, allRest: true };
    return { done, total: due, rate: Math.round((done / due) * 100), allRest: false };
  };

  const todayDoneAll = () => {
    const k = todayKey();
    return state.habits.filter((h) =>
      isDueDay(h, k) && isAchieved(h, (state.records[h.id] || {})[k])
    ).length;
  };
  const todayDueAll = () => {
    const k = todayKey();
    return state.habits.filter((h) => isDueDay(h, k)).length;
  };
  const overallRate30 = () => {
    if (state.habits.length === 0) return 0;
    const rates = state.habits.map(calcRate30).filter((r) => r !== null);
    if (rates.length === 0) return 0;
    return Math.round(rates.reduce((a, b) => a + b, 0) / rates.length);
  };

  // ---------- Theme ----------
  const applyTheme = () => {
    const t = state.settings.theme || 'light';
    document.documentElement.setAttribute('data-theme', t);
  };

  // ---------- Routing ----------
  const screens = ['today', 'stats', 'detail', 'settings', 'groups', 'habits-reorder'];
  let currentScreen = 'today';
  let detailHabitId = null;
  let calMonth = new Date();
  let navStack = [];

  const showScreen = (name, push = true) => {
    closeGroupDropdown();
    if (push && currentScreen !== name) navStack.push(currentScreen);
    currentScreen = name;
    screens.forEach((s) => {
      const el = document.getElementById(`screen-${s}`);
      if (el) el.hidden = s !== name;
    });
    const titles = {
      today: 'Today', stats: 'Stats', detail: 'Detail',
      settings: 'Settings', groups: 'Groups', 'habits-reorder': '習慣の並び順'
    };
    document.getElementById('screenTitle').textContent = titles[name];
    document.getElementById('navBack').hidden = name === 'today';
    if (name === 'today') renderToday();
    if (name === 'stats') renderStats();
    if (name === 'detail') renderDetail();
    if (name === 'settings') renderSettings();
    if (name === 'groups') renderGroups();
    if (name === 'habits-reorder') renderHabitsReorder();
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

    const sel = getGroup(state.settings.selectedGroupId);
    document.getElementById('selectedGroupLabel').textContent = sel ? sel.name : '—';
    document.getElementById('selectedGroupDot').style.background = sel ? sel.color : 'var(--accent)';

    const rate = groupRateToday(state.settings.selectedGroupId);
    const progEl = document.getElementById('todayProgress');
    if (!rate || rate.total === 0) {
      progEl.textContent = rate?.allRest ? '今日はやる日じゃない習慣のみ' : '';
    } else {
      progEl.textContent = `${rate.done}/${rate.total} 達成`;
    }

    const list = document.getElementById('habitList');
    list.innerHTML = '';
    const hs = habitsInGroup(state.settings.selectedGroupId);
    if (hs.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'empty-state';
      empty.innerHTML = `<div class="serif">no habits yet</div><p>右下の + から最初の習慣を追加。</p>`;
      list.appendChild(empty);
      document.getElementById('diaryInput').value = state.diary[todayKey()] || '';
      return;
    }

    const k = todayKey();
    hs.forEach((h) => {
      const rec = (state.records[h.id] || {})[k];
      const done = isAchieved(h, rec);
      const due = isDueDay(h, k);
      const li = document.createElement('li');
      li.className = 'habit-item' + (done ? ' done' : '') + (due ? '' : ' not-due');

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

      const targetTxt = h.type === 'check'
        ? '○×'
        : (h.type === 'time' ? `目標 ${h.target || 0}分` : `目標 ${h.target || 0}${h.unit || ''}`);

      const groupCount = (h.groupIds || []).length;
      const multiBadge = groupCount > 1 ? `<span class="habit-badge" title="${groupCount}つのグループに所属">📌${groupCount}</span>` : '';
      const freqBadge = h.frequency?.type !== 'daily'
        ? `<span class="habit-badge">${frequencyLabel(h)}</span>`
        : '';

      li.innerHTML = `
        <div class="habit-dot" style="background:${h.color || 'var(--accent)'}"></div>
        <div class="habit-main">
          <div class="habit-name">
            <span class="name-text">${escapeHtml(h.name)}</span>
            ${freqBadge}
            ${multiBadge}
          </div>
          <div class="habit-sub">${targetTxt}${due ? '' : ' · 今日はやる日じゃない'}</div>
        </div>
        <div class="habit-action">${actionHtml}</div>
      `;
      li.addEventListener('click', () => onHabitTap(h));

      // long-press
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
    const manage = document.createElement('div');
    manage.className = 'group-dropdown-item divider';
    manage.innerHTML = `<span style="flex:1">グループを管理</span><span>›</span>`;
    manage.addEventListener('click', () => { closeGroupDropdown(); showScreen('groups'); });
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
      `${todayDoneAll()}/${todayDueAll()}`;
    document.getElementById('statRate30').textContent = `${overallRate30()}%`;

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
        const doneText = !r ? '習慣なし' : (r.allRest ? '本日対象なし' : `${r.done} / ${r.total}`);
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

    const list = document.getElementById('statsList');
    list.innerHTML = '';
    if (state.habits.length === 0) {
      list.innerHTML = `<div class="empty-state"><div class="serif">no data</div><p>習慣を追加すると統計が表示される。</p></div>`;
      return;
    }
    sortedHabits().forEach((h) => {
      const recs = state.records[h.id] || {};
      const streak = calcStreak(h);
      const row = document.createElement('div');
      row.className = 'stats-row';
      row.addEventListener('click', () => openDetail(h.id));

      let heatHtml = '<div class="mini-heat">';
      for (let i = 29; i >= 0; i--) {
        const k = fmtKey(addDays(new Date(), -i));
        const r = recs[k];
        const lvl = levelFor(h, r, k);
        const bg = lvl === 0 ? 'var(--hm-0)' : `var(--hm-${lvl})`;
        heatHtml += `<span style="background:${bg}"></span>`;
      }
      heatHtml += '</div>';

      const groupCount = (h.groupIds || []).length;
      const multiBadge = groupCount > 1 ? ` 📌${groupCount}` : '';
      const freqLabel = h.frequency?.type !== 'daily' ? ` · ${frequencyLabel(h)}` : '';

      row.innerHTML = `
        <div class="stats-row-head">
          <div class="stats-row-name">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${h.color || 'var(--accent)'};margin-right:8px;vertical-align:middle"></span>
            ${escapeHtml(h.name)}<span class="muted small">${freqLabel}${multiBadge}</span>
          </div>
          <div class="stats-row-streak">${streak}${streakUnitSuffix(h)}</div>
        </div>
        ${heatHtml}
      `;
      list.appendChild(row);
    });
  };

  const streakUnitSuffix = (h) => {
    const t = h.frequency?.type;
    if (t === 'weekdays' || t === 'interval') return '回連続';
    if (t === 'monthly_n') return 'か月連続';
    return '日連続';
  };

  const levelFor = (habit, rec, dateKey) => {
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
    const freq = ` · ${frequencyLabel(h)}`;
    document.getElementById('detailMeta').textContent = targetTxt + freq + rem;

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
    document.getElementById('detailStreakLabel').textContent = streakUnitLabel(h);
    document.getElementById('detailBestStreak').textContent = calcBestStreak(h);
    const rate = calcRate30(h);
    document.getElementById('detailRate').textContent = rate === null ? '—' : `${rate}%`;

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
      const lvl = levelFor(h, r, k);
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
      bars.appendChild(bar);
    }
  };

  // ---------- Render: Groups ----------
  const renderGroups = () => {
    const list = document.getElementById('groupManageList');
    list.innerHTML = '';
    sortedGroups().forEach((g) => {
      const row = document.createElement('div');
      row.className = 'reorder-row';
      row.dataset.gid = g.id;
      const count = habitCountInGroup(g.id);
      row.innerHTML = `
        <div class="drag-handle">⋮⋮</div>
        <div class="reorder-name">
          <div class="group-color-dot" style="background:${g.color}"></div>
          <span class="name-text">${escapeHtml(g.name)}</span>
        </div>
        <div class="reorder-meta">${count}</div>
        <div class="reorder-actions">
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
      b.addEventListener('click', (e) => { e.stopPropagation(); openGroupModal(getGroup(b.dataset.gid)); });
    });
    list.querySelectorAll('[data-act="delete"]').forEach((b) => {
      b.addEventListener('click', (e) => { e.stopPropagation(); deleteGroup(b.dataset.gid); });
    });
    setupDragSort(list, (orderedIds) => {
      orderedIds.forEach((id, i) => {
        const g = getGroup(id);
        if (g) g.order = i;
      });
      saveState();
      renderGroups();
    });
  };

  // ---------- Render: Habits Reorder ----------
  const renderHabitsReorder = () => {
    const wrap = document.getElementById('habitReorderList');
    wrap.innerHTML = '';
    if (state.habits.length === 0) {
      wrap.innerHTML = `<div class="empty-state"><div class="serif">no habits</div><p>習慣がありません</p></div>`;
      return;
    }
    const list = document.createElement('div');
    list.className = 'reorder-list';
    sortedHabits().forEach((h) => {
      const row = document.createElement('div');
      row.className = 'reorder-row';
      row.dataset.hid = h.id;
      row.innerHTML = `
        <div class="drag-handle">⋮⋮</div>
        <div class="reorder-name">
          <div class="group-color-dot" style="background:${h.color || 'var(--accent)'}"></div>
          <span class="name-text">${escapeHtml(h.name)}</span>
        </div>
        <div class="reorder-meta">${frequencyLabel(h)}</div>
      `;
      list.appendChild(row);
    });
    wrap.appendChild(list);
    setupDragSort(list, (orderedIds) => {
      orderedIds.forEach((id, i) => {
        const h = state.habits.find((x) => x.id === id);
        if (h) h.order = i;
      });
      saveState();
      renderHabitsReorder();
    });
  };

  // ---------- Drag & Drop sort (汎用) ----------
  const setupDragSort = (list, onCommit) => {
    let dragging = null;
    let placeholder = null;
    let isTouch = false;

    const onPointerMove = (clientY) => {
      if (!dragging) return;
      const rows = [...list.querySelectorAll('.reorder-row:not(.dragging)')];
      let target = null;
      for (const row of rows) {
        const r = row.getBoundingClientRect();
        const mid = r.top + r.height / 2;
        if (clientY < mid) { target = row; break; }
      }
      list.querySelectorAll('.drop-target').forEach((e) => e.classList.remove('drop-target'));
      if (target) target.classList.add('drop-target');
      placeholder = target;
    };
    const onPointerUp = () => {
      if (!dragging) return;
      list.querySelectorAll('.drop-target').forEach((e) => e.classList.remove('drop-target'));
      if (placeholder) list.insertBefore(dragging, placeholder);
      else list.appendChild(dragging);
      dragging.classList.remove('dragging');
      const orderedIds = [...list.querySelectorAll('.reorder-row')].map(
        (r) => r.dataset.gid || r.dataset.hid
      );
      dragging = null;
      placeholder = null;
      onCommit(orderedIds);
    };

    const handles = list.querySelectorAll('.drag-handle');
    handles.forEach((handle) => {
      handle.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const row = handle.closest('.reorder-row');
        if (!row) return;
        dragging = row;
        isTouch = true;
        row.classList.add('dragging');
      }, { passive: false });

      handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const row = handle.closest('.reorder-row');
        if (!row) return;
        dragging = row;
        isTouch = false;
        row.classList.add('dragging');
      });
    });

    const tm = (e) => {
      if (!dragging || !isTouch) return;
      e.preventDefault();
      onPointerMove(e.touches[0].clientY);
    };
    const mm = (e) => {
      if (!dragging || isTouch) return;
      onPointerMove(e.clientY);
    };
    const tu = () => { if (dragging && isTouch) onPointerUp(); };
    const mu = () => { if (dragging && !isTouch) onPointerUp(); };

    document.addEventListener('touchmove', tm, { passive: false });
    document.addEventListener('mousemove', mm);
    document.addEventListener('touchend', tu);
    document.addEventListener('mouseup', mu);
  };

  // ---------- Render: Settings ----------
  const renderSettings = () => {
    document.getElementById('themeSelect').value = state.settings.theme || 'light';
    const status = document.getElementById('notifStatus');
    if (!('Notification' in window)) status.textContent = 'このブラウザは通知未対応';
    else status.textContent = `現在の許可状態: ${Notification.permission}`;
  };

  // ---------- Habit modal ----------
  let editingHabitId = null;
  let selectedColor = DEFAULT_COLORS[0];
  let selectedGroupIdsForHabit = new Set();
  let selectedWeekdays = new Set();

  const openHabitModal = (habit = null) => {
    editingHabitId = habit?.id || null;
    document.getElementById('habitModalTitle').textContent = habit ? '習慣を編集' : '習慣を追加';
    document.getElementById('hName').value = habit?.name || '';
    document.getElementById('hType').value = habit?.type || 'check';
    document.getElementById('hTarget').value = habit?.target || '';
    document.getElementById('hUnit').value = habit?.unit || '';
    document.getElementById('hReminder').value = habit?.reminderTime || '';
    selectedColor = habit?.color || DEFAULT_COLORS[0];

    // 頻度
    const f = habit?.frequency || { type: 'daily' };
    document.getElementById('hFreqType').value = f.type;
    selectedWeekdays = new Set(f.weekdays || []);
    document.getElementById('hMonthlyN').value = f.monthlyN || 1;
    document.getElementById('hIntervalDays').value = f.intervalDays || 3;
    renderWeekdayPicker();
    toggleFreqDetail();

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

  const renderWeekdayPicker = () => {
    const wrap = document.getElementById('hWeekdayPicker');
    wrap.innerHTML = '';
    // 月始まり: 1,2,3,4,5,6,0
    const order = [1,2,3,4,5,6,0];
    order.forEach((dow) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'weekday-btn' + (selectedWeekdays.has(dow) ? ' selected' : '');
      btn.textContent = DOW_LABEL[dow];
      btn.addEventListener('click', () => {
        if (selectedWeekdays.has(dow)) selectedWeekdays.delete(dow);
        else selectedWeekdays.add(dow);
        renderWeekdayPicker();
      });
      wrap.appendChild(btn);
    });
  };

  const toggleFreqDetail = () => {
    const t = document.getElementById('hFreqType').value;
    document.getElementById('hWeekdaysDetail').hidden = t !== 'weekdays';
    document.getElementById('hMonthlyDetail').hidden = t !== 'monthly_n';
    document.getElementById('hIntervalDetail').hidden = t !== 'interval';
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

    // 頻度
    const fType = document.getElementById('hFreqType').value;
    const frequency = { type: fType };
    if (fType === 'weekdays') {
      if (selectedWeekdays.size === 0) { toast('曜日を1つ以上選択'); return; }
      frequency.weekdays = [...selectedWeekdays];
    }
    if (fType === 'monthly_n') {
      const n = Math.max(1, Math.min(31, Number(document.getElementById('hMonthlyN').value) || 1));
      frequency.monthlyN = n;
    }
    if (fType === 'interval') {
      const d = Math.max(1, Math.min(365, Number(document.getElementById('hIntervalDays').value) || 3));
      frequency.intervalDays = d;
    }

    if (editingHabitId) {
      const h = state.habits.find((x) => x.id === editingHabitId);
      Object.assign(h, { name, type, target, unit, reminderTime, color: selectedColor, groupIds, frequency });
    } else {
      const maxOrder = Math.max(-1, ...state.habits.map(h => h.order || 0));
      state.habits.push({
        id: newHabitId(),
        name, type, target, unit, reminderTime,
        color: selectedColor, groupIds, frequency,
        order: maxOrder + 1,
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
    document.getElementById('groupModalTitle').textContent = group ? 'グループを編集' : 'グループを追加';
    document.getElementById('gName').value = group?.name || '';
    selectedGroupColor = group?.color || DEFAULT_GROUP_COLORS[state.groups.length % DEFAULT_GROUP_COLORS.length];
    renderGColorRow();
    document.getElementById('groupModal').hidden = false;
    setTimeout(() => document.getElementById('gName').focus(), 50);
  };
  const closeGroupModal = () => { document.getElementById('groupModal').hidden = true; };
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
        id: newGroupId(), name, color: selectedGroupColor,
        order: maxOrder + 1, createdAt: Date.now()
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
        msg += `うち${orphans.length}個は他のグループに所属していないため、それらの習慣も併せて削除されます。\n`;
      } else {
        msg += `すべて他のグループにも所属しているので、習慣自体は残ります。\n`;
      }
    }
    msg += '\n続行しますか?';
    if (!confirm(msg)) return;

    const orphanIds = new Set(orphans.map((h) => h.id));
    state.habits = state.habits.filter((h) => !orphanIds.has(h.id));
    orphanIds.forEach((id) => delete state.records[id]);
    state.habits.forEach((h) => {
      h.groupIds = (h.groupIds || []).filter((id) => id !== gid);
    });
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
    document.getElementById('vTargetHint').textContent = `目標: ${habit.target || 0}${unit}`;
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

    document.getElementById('groupSelector').addEventListener('click', (e) => {
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

    document.getElementById('diaryInput').addEventListener('input', (e) => {
      state.diary[todayKey()] = e.target.value;
      saveState();
    });

    document.getElementById('hCancel').addEventListener('click', closeHabitModal);
    document.getElementById('hSave').addEventListener('click', saveHabitFromModal);
    document.getElementById('hType').addEventListener('change', toggleTargetField);
    document.getElementById('hFreqType').addEventListener('change', toggleFreqDetail);

    document.getElementById('gCancel').addEventListener('click', closeGroupModal);
    document.getElementById('gSave').addEventListener('click', saveGroupFromModal);

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

    document.getElementById('addGroupBtn').addEventListener('click', () => openGroupModal());

    document.getElementById('linkGroups').addEventListener('click', () => showScreen('groups'));
    document.getElementById('linkHabitsReorder').addEventListener('click', () => showScreen('habits-reorder'));
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

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').then((reg) => {
        reg.update();
        scheduleAllReminders();
      }).catch((e) => console.warn('SW register failed', e));
    });
  }

  let lastDay = todayKey();
  setInterval(() => {
    const now = todayKey();
    if (now !== lastDay) {
      lastDay = now;
      if (currentScreen === 'today') renderToday();
    }
  }, 60_000);
})();
