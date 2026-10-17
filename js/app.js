/* ==========================================================================
   OmniChart — App Module (UI Rendering Engine)
   Category / Status filters (Ongoing, Planning, etc.),
   DD-MM-YYYY Date / Range Calendar view, Mass Removal bulk mode,
   Interactive Pop-Out Genre Auto-Detection & Quick-Pick System,
   Modal management, Owner Mode security, and central event delegation.
   ========================================================================== */

const CATEGORIES = ['All', 'Series & Anime', 'Movies', 'Games', 'Books'];
const STATUSES   = ['All', 'Ongoing', 'Completed', 'On Hold', 'Planning', 'Dropped'];

// ---------------------------------------------------------------------------
// Prelisted Popular Genres Across All Categories
// ---------------------------------------------------------------------------

const POPULAR_GENRES_BY_CATEGORY = {
  anime: [
    'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Sci-Fi', 'Mystery',
    'Horror', 'Psychological', 'Romance', 'Slice of Life', 'Supernatural',
    'Thriller', 'Mecha', 'Sports', 'Isekai', 'Shounen', 'Seinen', 'Shoujo'
  ],
  movies: [
    'Action', 'Adventure', 'Comedy', 'Crime', 'Drama', 'Animation', 'Documentary',
    'Fantasy', 'Historical', 'Horror', 'Mystery', 'Romance', 'Sci-Fi',
    'Thriller', 'Western', 'Cyberpunk', 'Dystopian', 'Dark Fantasy'
  ],
  games: [
    'Action', 'Adventure', 'RPG', 'Strategy', 'Open World', 'Survival', 'Sandbox',
    'Shooter', 'Indie', 'Roguelike', 'Visual Novel', 'Simulation', 'Horror',
    'Platformer', 'Fighting', 'Sports'
  ],
  books: [
    'Fantasy', 'High Fantasy', 'Urban Fantasy', 'Sci-Fi', 'LitRPG', 'Dystopian',
    'Mystery', 'Thriller', 'Romance', 'Horror', 'Historical Fiction', 'Non-Fiction',
    'Biography', 'Steampunk', 'Post-Apocalyptic'
  ]
};

const ALL_POPULAR_GENRES = Array.from(new Set([
  ...POPULAR_GENRES_BY_CATEGORY.anime,
  ...POPULAR_GENRES_BY_CATEGORY.movies,
  ...POPULAR_GENRES_BY_CATEGORY.games,
  ...POPULAR_GENRES_BY_CATEGORY.books
])).sort((a, b) => a.localeCompare(b));

// ---------------------------------------------------------------------------
// Toast Notification
// ---------------------------------------------------------------------------

function showToast(msg) {
  const el = document.getElementById('toastBox');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.add('hidden'), 2800);
}

// ---------------------------------------------------------------------------
// Date Parsing (DD-MM-YYYY and DD-MM-YYYY to DD-MM-YYYY)
// ---------------------------------------------------------------------------

function parseSingleDDMMYYYY(str) {
  if (!str) return null;
  const m = str.trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (!m) return null;
  const d  = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const y  = parseInt(m[3], 10);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { day: d, month: mo - 1, year: y, label: `${d}-${mo}-${y}` };
}

function parseDateOrRange(raw) {
  if (!raw || !raw.trim()) return null;
  const parts = raw.trim().split(/\s+to\s+/i);
  if (parts.length === 1) {
    const single = parseSingleDDMMYYYY(parts[0]);
    return single ? { type: 'single', start: single, end: null } : null;
  }
  const start = parseSingleDDMMYYYY(parts[0]);
  const end   = parseSingleDDMMYYYY(parts[1]);
  if (start && end) {
    if (start.day === end.day && start.month === end.month && start.year === end.year) {
      return { type: 'single', start, end: null };
    }
    return { type: 'range', start, end };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Filtering & Sorting
// ---------------------------------------------------------------------------

function getFilteredItems() {
  const q = state.search.trim().toLowerCase();
  const filtered = state.items.filter((item) => {
    if (state.category !== 'All' && item.category !== state.category) return false;
    if (state.status !== 'All') {
      const itemStatus = (typeof normalizeStatus === 'function') ? normalizeStatus(item.status) : item.status;
      if (itemStatus !== state.status) return false;
    }
    if (q) {
      const hay = `${item.title} ${item.studio || ''} ${(item.genres || []).join(' ')} ${item.consumedDate || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    if (state.sort === 'rating-desc')   return (b.rating   || 0) - (a.rating   || 0);
    if (state.sort === 'updated-desc')  return (b.updatedAt || 0) - (a.updatedAt || 0);
    if (state.sort === 'title-asc')     return (a.title || '').localeCompare(b.title || '');
    if (state.sort === 'progress-desc') return (b.progress || 0) - (a.progress || 0);
    return 0;
  });

  return filtered;
}

// ---------------------------------------------------------------------------
// Navigation Rendering & Status Tabs
// ---------------------------------------------------------------------------

function renderNavigation() {
  const libCountEl = document.getElementById('menuLibraryCount');
  if (libCountEl) libCountEl.textContent = state.items.length;

  const calCountEl = document.getElementById('menuCalendarCount');
  const datedCount = state.items.filter((i) => parseDateOrRange(i.consumedDate)).length;
  if (calCountEl) calCountEl.textContent = datedCount;

  // Genre count
  const genreSet = new Set();
  for (const item of state.items) {
    if (Array.isArray(item.genres)) {
      for (const g of item.genres) {
        const clean = (g || '').trim();
        if (clean) genreSet.add(clean.toLowerCase());
      }
    }
  }
  const genreCountEl = document.getElementById('menuGenreCount');
  if (genreCountEl) genreCountEl.textContent = genreSet.size;

  const libBtn   = document.getElementById('menuViewLibrary');
  const calBtn   = document.getElementById('menuViewCalendar');
  const genreBtn = document.getElementById('menuViewGenre');

  const activeCls   = 'w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-bold bg-[#ff9f1c] text-[#0d0e11] transition';
  const inactiveCls = 'w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium text-slate-200 hover:bg-[#364146] transition';

  if (libBtn)   libBtn.className   = (state.view === 'library')  ? activeCls : inactiveCls;
  if (calBtn)   calBtn.className   = (state.view === 'calendar') ? (activeCls + ' mt-0.5') : (inactiveCls + ' mt-0.5');
  if (genreBtn) genreBtn.className = (state.view === 'genre')    ? (activeCls + ' mt-0.5') : (inactiveCls + ' mt-0.5');

  const catNav = document.getElementById('categoryNav');
  if (catNav) {
    catNav.innerHTML = CATEGORIES.map((cat) => {
      const active = state.category === cat;
      return `<button
        data-action="set-category"
        data-category="${esc(cat)}"
        class="px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
          active
            ? 'bg-[#ff9f1c] text-[#0d0e11] shadow'
            : 'bg-[#2c3539] text-slate-300 hover:text-white border border-[#3d494f]'
        }"
      >${esc(cat)}</button>`;
    }).join('');
  }

  const statusTabs = document.getElementById('statusTabs');
  if (statusTabs) {
    statusTabs.innerHTML = STATUSES.map((st) => {
      const count = state.items.filter((i) => {
        if (state.category !== 'All' && i.category !== state.category) return false;
        const itemStatus = (typeof normalizeStatus === 'function') ? normalizeStatus(i.status) : i.status;
        return st === 'All' ? true : itemStatus === st;
      }).length;
      const active = state.status === st;
      return `<button
        data-action="set-status"
        data-status="${esc(st)}"
        class="px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap flex items-center gap-1.5 transition ${
          active
            ? 'bg-[#ff9f1c] text-[#0d0e11] font-bold'
            : 'bg-[#0d0e11] text-slate-300 hover:text-white border border-[#3d494f]'
        }"
      >
        <span>${esc(st)}</span>
        <span class="text-[10px] px-1.5 py-0.2 rounded ${active ? 'bg-[#0d0e11]/20 text-[#0d0e11]' : 'bg-[#2c3539] text-slate-400'}">${count}</span>
      </button>`;
    }).join('');
  }

  const bulkToolbar = document.getElementById('bulkToolbar');
  const bulkModeBtn = document.getElementById('bulkModeBtn');
  if (bulkToolbar && bulkModeBtn) {
    if (state.bulkMode) {
      bulkToolbar.classList.remove('hidden');
      bulkModeBtn.className = 'h-8 px-2.5 rounded-lg bg-rose-600 text-white border border-rose-400 text-xs font-bold flex items-center gap-1.5 transition';
      const countEl = document.getElementById('bulkSelectedCount');
      if (countEl) countEl.textContent = `${state.selectedIds.size} selected`;
    } else {
      bulkToolbar.classList.add('hidden');
      bulkModeBtn.className = 'h-8 px-2.5 rounded-lg bg-[#0d0e11] hover:bg-rose-950/60 border border-[#3d494f] hover:border-rose-500/60 text-xs text-slate-200 hover:text-rose-200 flex items-center gap-1.5 transition';
    }
  }

  // Update Owner Mode / Public Visitor Badge
  let authBadge = document.getElementById('ownerAuthBadge');
  if (!authBadge) {
    authBadge = document.createElement('button');
    authBadge.id = 'ownerAuthBadge';
    authBadge.dataset.action = 'toggle-owner-auth';
    const headerLeft = document.getElementById('tomeMenuBtn')?.parentElement;
    if (headerLeft) headerLeft.appendChild(authBadge);
  }

  if (OMNICHART_CONFIG.ownerModeEnabled) {
    if (OwnerMode.isOwner()) {
      authBadge.className = 'hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold bg-[#ff9f1c]/15 text-[#ff9f1c] border border-[#ff9f1c]/40 hover:bg-[#ff9f1c]/25 transition';
      authBadge.title = 'Owner Mode Active (Click to lock session)';
      authBadge.innerHTML = '👑 Owner';
    } else {
      authBadge.className = 'hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-[#2c3539] text-slate-400 border border-[#3d494f] hover:text-[#ff9f1c] hover:border-[#ff9f1c]/50 transition cursor-pointer';
      authBadge.title = 'Public Read-Only View (Click to unlock Owner Mode)';
      authBadge.innerHTML = '👁️ Public View';
    }
  } else {
    authBadge.classList.add('hidden');
  }

  renderAuthStatus();
}

// ---------------------------------------------------------------------------
// Cloud Sync & Multi-User Authentication Engine
// ---------------------------------------------------------------------------

function renderAuthStatus() {
  const iconEl  = document.getElementById('authBtnIcon');
  const labelEl = document.getElementById('authBtnLabel');
  const badgeEl = document.getElementById('menuCloudBadge');

  if (state.user) {
    const displayName = state.user.email ? state.user.email.split('@')[0] : 'User';
    if (iconEl)  iconEl.textContent  = '🟢';
    if (labelEl) labelEl.textContent = displayName;
    if (badgeEl) {
      badgeEl.textContent = 'Synced';
      badgeEl.className   = 'text-[10px] uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold';
    }
  } else if (typeof CloudSync !== 'undefined' && CloudSync.isConfigured()) {
    if (iconEl)  iconEl.textContent  = '☁️';
    if (labelEl) labelEl.textContent = 'Sync';
    if (badgeEl) {
      badgeEl.textContent = 'Guest';
      badgeEl.className   = 'text-[10px] uppercase px-1.5 py-0.5 rounded bg-[#0d0e11] text-slate-400 font-bold';
    }
  } else {
    if (iconEl)  iconEl.textContent  = '☁️';
    if (labelEl) labelEl.textContent = 'Setup';
    if (badgeEl) {
      badgeEl.textContent = 'Setup';
      badgeEl.className   = 'text-[10px] uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-[#ff9f1c] font-bold';
    }
  }
}

function openAuthModal(activeTab = 'account') {
  const modal = document.getElementById('authModal');
  if (!modal) return;
  modal.classList.remove('hidden');

  switchAuthTab(activeTab);

  const loggedInView  = document.getElementById('authLoggedInView');
  const loggedOutView = document.getElementById('authLoggedOutView');
  const errEl         = document.getElementById('authErrorMessage');
  if (errEl) errEl.classList.add('hidden');

  if (state.user) {
    if (loggedInView)  loggedInView.classList.remove('hidden');
    if (loggedOutView) loggedOutView.classList.add('hidden');
    const emailEl = document.getElementById('authLoggedInEmail');
    if (emailEl) emailEl.textContent = state.user.email;
  } else {
    if (loggedInView)  loggedInView.classList.add('hidden');
    if (loggedOutView) loggedOutView.classList.remove('hidden');
    const pwdInput = document.getElementById('authPasswordInput');
    if (pwdInput) pwdInput.value = '';
  }

  // Populate config tab inputs
  if (typeof CloudSync !== 'undefined') {
    const cfgUrl = document.getElementById('cfgSupabaseUrl');
    const cfgKey = document.getElementById('cfgSupabaseAnonKey');
    const sqlEl  = document.getElementById('supabaseSqlCode');
    if (cfgUrl) cfgUrl.value = CloudSync.getUrl();
    if (cfgKey) cfgKey.value = CloudSync.getAnonKey();
    if (sqlEl)  sqlEl.textContent = CloudSync.getSqlSchema();
  }
}
window.openAuthModal = openAuthModal;

function switchAuthTab(tab) {
  state.authTab = tab;
  const tabAccountBtn = document.getElementById('authTabAccountBtn');
  const tabSetupBtn   = document.getElementById('authTabSetupBtn');
  const accountView   = state.user ? document.getElementById('authLoggedInView') : document.getElementById('authLoggedOutView');
  const setupView     = document.getElementById('authSetupView');

  const activeCls   = 'px-3.5 py-1.5 text-xs font-bold rounded-t-lg bg-[#2c3539] text-[#ff9f1c] border-t border-x border-[#3d494f]';
  const inactiveCls = 'px-3.5 py-1.5 text-xs font-semibold rounded-t-lg text-slate-400 hover:text-white';

  if (tab === 'account') {
    if (tabAccountBtn) tabAccountBtn.className = activeCls;
    if (tabSetupBtn)   tabSetupBtn.className   = inactiveCls;
    if (setupView)     setupView.classList.add('hidden');
    if (accountView)   accountView.classList.remove('hidden');
  } else {
    if (tabAccountBtn) tabAccountBtn.className = inactiveCls;
    if (tabSetupBtn)   tabSetupBtn.className   = activeCls;
    if (accountView)   accountView.classList.add('hidden');
    if (setupView)     setupView.classList.remove('hidden');
  }
}

// ---------------------------------------------------------------------------
// Library Card Grid (With Interactive Popped-Out Genre Badges)
// ---------------------------------------------------------------------------

function renderLibrary() {
  const grid  = document.getElementById('mediaGrid');
  if (!grid) return;
  const items = getFilteredItems();

  if (items.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full bg-[#2c3539] border border-[#3d494f] rounded-2xl p-10 text-center space-y-3">
        <div class="text-base font-bold text-white">Your library is empty or no entries match your filter</div>
        <p class="text-xs text-slate-400">Click + Add Media or use Import in the top-right to load your LiveChart JSON.</p>
        <button data-action="open-add-modal" class="px-4 py-2 rounded-lg bg-[#ff9f1c] text-[#0d0e11] font-bold text-xs">+ Add Media</button>
      </div>
    `;
    return;
  }

  const isOwner = OwnerMode.isOwner();

  grid.innerHTML = items.map((item) => {
    const rating        = Number(item.rating || 0);
    const isMasterpiece = rating >= 9;
    const progress      = Number(item.progress || 0);
    const total         = Math.max(1, Number(item.totalUnits || 1));
    const pct           = Math.min(100, Math.round((progress / total) * 100));
    const activeTab     = state.cardTab[item.id] || (item.notes ? 'notes' : 'synopsis');
    const bodyText      = activeTab === 'notes'
      ? (item.notes || 'No review notes added yet.')
      : (item.synopsis || 'No synopsis available.');
    const isSelected    = state.selectedIds.has(item.id);
    const posterSrc     = item.image || makeFallbackPoster(item.title);
    const displayStatus = (typeof normalizeStatus === 'function') ? normalizeStatus(item.status) : item.status;

    return `
      <article
        data-card-id="${esc(item.id)}"
        data-action="${state.bulkMode ? 'toggle-select-card' : ''}"
        class="group relative bg-[#2c3539] rounded-xl overflow-hidden flex flex-col border transition ${
          state.bulkMode
            ? isSelected
              ? 'border-rose-500 ring-2 ring-rose-500/40 cursor-pointer'
              : 'border-[#3d494f] hover:border-rose-400/60 cursor-pointer'
            : 'border-[#3d494f] hover:border-[#ff9f1c]/60'
        }"
      >
        <!-- Top Title Header -->
        <div class="px-3.5 py-2.5 bg-[#0d0e11]/60 border-b border-[#3d494f] flex items-start justify-between gap-2">
          <div class="min-w-0 flex items-start gap-2">
            ${state.bulkMode ? `
              <input
                type="checkbox"
                ${isSelected ? 'checked' : ''}
                class="mt-0.5 w-4 h-4 accent-rose-500 rounded pointer-events-none"
              />
            ` : ''}
            <div class="min-w-0">
              <h3 class="font-bold text-sm text-white truncate" title="${esc(item.title)}">${esc(item.title)}</h3>
              <div class="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400 mt-0.5">
                <span>${esc(item.category || 'Series & Anime')}</span>
                <span>\u2022</span>
                <span class="${item.releaseDate && item.releaseDate !== 'TBA' ? 'text-slate-200 font-medium' : ''}">${esc(item.releaseDate || 'TBA')}</span>
                ${item.consumedDate ? `
                  <span>\u2022</span>
                  <button
                    data-action="jump-to-item-date"
                    data-date="${esc(item.consumedDate)}"
                    class="text-[#ff9f1c] hover:underline font-medium"
                    title="View on Calendar"
                  >\uD83D\uDCC5 ${esc(item.consumedDate)}</button>
                ` : ''}
              </div>
            </div>
          </div>

          ${(!state.bulkMode && isOwner) ? `
            <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
              <button
                data-action="edit-item"
                data-id="${esc(item.id)}"
                title="Edit"
                class="p-1 rounded bg-[#2c3539] hover:bg-[#364146] text-slate-300 hover:text-white text-xs"
              >\u270E</button>
              <button
                data-action="delete-item"
                data-id="${esc(item.id)}"
                title="Remove"
                class="p-1 rounded bg-[#2c3539] hover:bg-rose-600 text-slate-300 hover:text-white text-xs"
              >\u2715</button>
            </div>
          ` : ''}
        </div>

        <!-- Studio & Popped-Out Genres Ribbon -->
        <div class="px-3.5 py-1.5 bg-[#0d0e11]/50 border-b border-[#3d494f] flex items-center justify-between gap-2 text-[11px]">
          <span class="font-semibold text-slate-300 truncate text-xs" title="${esc(item.studio || 'Unknown Studio')}">${esc(item.studio || 'Unknown Studio')}</span>
          <div class="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            ${(item.genres || []).map((g) => `
              <button
                type="button"
                data-action="filter-by-genre"
                data-genre="${esc(g)}"
                title="Filter library by ${esc(g)}"
                class="px-2 py-0.5 rounded-full bg-[#ff9f1c]/15 text-[#ff9f1c] hover:bg-[#ff9f1c] hover:text-[#0d0e11] border border-[#ff9f1c]/40 font-bold text-[10px] tracking-wide whitespace-nowrap transition shadow-sm"
              >${esc(g)}</button>
            `).join('')}
          </div>
        </div>

        <!-- Card Body -->
        <div class="flex flex-1 min-h-[185px]">
          <div class="relative w-[125px] shrink-0 bg-[#0d0e11] border-r border-[#3d494f]">
            <img
              src="${esc(posterSrc)}"
              alt="${esc(item.title)}"
              data-fallback-title="${esc(item.title)}"
              class="poster-img w-full h-full object-cover"
            />
            <button
              data-action="${isOwner ? 'edit-item' : 'view-item'}"
              data-id="${esc(item.id)}"
              title="${isOwner ? 'Click to rate or edit' : 'Rating'}"
              class="absolute top-2 left-2 px-2 py-0.5 rounded-md text-xs font-extrabold shadow-md flex items-center gap-1 ${
                isMasterpiece
                  ? 'bg-[#ff9f1c] text-[#0d0e11]'
                  : rating > 0
                    ? 'bg-[#0d0e11]/90 text-white border border-[#ff9f1c]/60'
                    : 'bg-[#0d0e11]/80 text-slate-400 border border-[#3d494f]'
              }"
            >
              <span>\u2605</span>
              <span>${rating > 0 ? rating.toFixed(1).replace(/\.0$/, '') : '\u2013'}</span>
            </button>
          </div>

          <div class="flex-1 flex flex-col justify-between p-3 min-w-0">
            <div class="space-y-1.5">
              <div class="flex items-center gap-1 border-b border-[#3d494f]/70 pb-1">
                <button
                  data-action="switch-card-tab"
                  data-id="${esc(item.id)}"
                  data-tab="notes"
                  class="text-[11px] font-semibold px-2 py-0.5 rounded ${
                    activeTab === 'notes' ? 'bg-[#0d0e11] text-[#ff9f1c]' : 'text-slate-400 hover:text-white'
                  }"
                >Review</button>
                <button
                  data-action="switch-card-tab"
                  data-id="${esc(item.id)}"
                  data-tab="synopsis"
                  class="text-[11px] font-semibold px-2 py-0.5 rounded ${
                    activeTab === 'synopsis' ? 'bg-[#0d0e11] text-[#ff9f1c]' : 'text-slate-400 hover:text-white'
                  }"
                >Synopsis</button>
              </div>
              <p class="text-xs text-slate-300 leading-relaxed line-clamp-4 overflow-y-auto max-h-[84px] pr-1">
                ${esc(bodyText)}
              </p>
            </div>

            <div class="pt-2 mt-2 border-t border-[#3d494f]/80 space-y-1.5">
              <div class="w-full h-1.5 rounded-full bg-[#0d0e11] overflow-hidden">
                <div class="h-full bg-[#ff9f1c] transition-all" style="width:${pct}%"></div>
              </div>
              <div class="flex items-center justify-between gap-2 text-xs">
                <span class="text-[11px] font-semibold text-slate-300">${esc(displayStatus)}</span>
                <div class="flex items-center gap-1">
                  ${isOwner ? `
                    <button
                      data-action="step-progress"
                      data-id="${esc(item.id)}"
                      data-delta="-1"
                      class="w-6 h-6 rounded bg-[#0d0e11] hover:bg-[#364146] border border-[#3d494f] text-slate-200 font-bold"
                    >\u2212</button>
                  ` : ''}
                  <span class="text-[11px] font-mono px-1.5 text-slate-200">${progress}/${total} ${esc(item.unitName || 'eps')}</span>
                  ${isOwner ? `
                    <button
                      data-action="step-progress"
                      data-id="${esc(item.id)}"
                      data-delta="1"
                      class="w-6 h-6 rounded bg-[#0d0e11] hover:bg-[#364146] border border-[#3d494f] text-slate-200 font-bold"
                    >+</button>
                  ` : ''}
                </div>
              </div>
            </div>
          </div>
        </div>
      </article>
    `;
  }).join('');

  grid.querySelectorAll('img.poster-img').forEach((img) => {
    img.addEventListener('error', function handleImgErr() {
      this.removeEventListener('error', handleImgErr);
      this.src = makeFallbackPoster(this.dataset.fallbackTitle || 'Media');
    });
  });
}

// ---------------------------------------------------------------------------
// Calendar View
// ---------------------------------------------------------------------------

function renderCalendar() {
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const labelEl = document.getElementById('calendarMonthLabel');
  if (labelEl) labelEl.textContent = `${monthNames[state.calMonth]} ${state.calYear}`;

  const eventsByKey  = new Map();
  const loggedMonths = new Map();

  for (const item of state.items) {
    const parsed = parseDateOrRange(item.consumedDate);
    if (!parsed) continue;

    if (parsed.type === 'single') {
      const { day, month, year } = parsed.start;
      const key = `${year}-${month}-${day}`;
      if (!eventsByKey.has(key)) eventsByKey.set(key, []);
      eventsByKey.get(key).push({ item, badge: 'DAY' });
      loggedMonths.set(`${year}-${month}`, `${monthNames[month].slice(0, 3)} ${year}`);
    } else if (parsed.type === 'range') {
      const s = parsed.start;
      const e = parsed.end;
      const sKey = `${s.year}-${s.month}-${s.day}`;
      const eKey = `${e.year}-${e.month}-${e.day}`;
      if (!eventsByKey.has(sKey)) eventsByKey.set(sKey, []);
      eventsByKey.get(sKey).push({ item, badge: 'START' });
      if (!eventsByKey.has(eKey)) eventsByKey.set(eKey, []);
      eventsByKey.get(eKey).push({ item, badge: 'END' });
      loggedMonths.set(`${s.year}-${s.month}`, `${monthNames[s.month].slice(0, 3)} ${s.year}`);
      loggedMonths.set(`${e.year}-${e.month}`, `${monthNames[e.month].slice(0, 3)} ${e.year}`);
    }
  }

  const jumpBar = document.getElementById('calendarJumpBar');
  const monthEntries = Array.from(loggedMonths.entries());
  if (jumpBar) {
    if (monthEntries.length > 0) {
      jumpBar.innerHTML = `<span class="text-xs text-slate-400 mr-1">Logged Months:</span>` +
        monthEntries.map(([ym, label]) => {
          const [y, m] = ym.split('-').map(Number);
          const active = y === state.calYear && m === state.calMonth;
          return `<button
            data-action="cal-jump-ym"
            data-year="${y}"
            data-month="${m}"
            class="px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
              active
                ? 'bg-[#ff9f1c] text-[#0d0e11]'
                : 'bg-[#2c3539] text-slate-300 hover:text-white border border-[#3d494f]'
            }"
          >${esc(label)}</button>`;
        }).join('');
    } else {
      jumpBar.innerHTML = `<span class="text-xs text-slate-400">Click + on any calendar day or edit an entry to add a Date / Range.</span>`;
    }
  }

  const firstDayWeek = new Date(state.calYear, state.calMonth, 1).getDay();
  const daysInMonth  = new Date(state.calYear, state.calMonth + 1, 0).getDate();
  const today        = new Date();
  const isOwner      = OwnerMode.isOwner();

  const cells = [];
  for (let i = 0; i < firstDayWeek; i++) {
    cells.push(`<div class="min-h-[115px] rounded-xl bg-[#0d0e11]/40 border border-[#3d494f]/30"></div>`);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const key       = `${state.calYear}-${state.calMonth}-${d}`;
    const dayEvents = eventsByKey.get(key) || [];
    const isToday   = today.getFullYear() === state.calYear && today.getMonth() === state.calMonth && today.getDate() === d;
    const dateStr   = `${d}-${state.calMonth + 1}-${state.calYear}`;

    cells.push(`
      <div class="min-h-[115px] rounded-xl bg-[#2c3539] border ${isToday ? 'border-[#ff9f1c]' : 'border-[#3d494f]'} p-2 flex flex-col justify-between">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold ${isToday ? 'px-1.5 py-0.5 rounded bg-[#ff9f1c] text-[#0d0e11]' : 'text-slate-300'}">${d}</span>
          ${isOwner ? `
            <button
              data-action="add-on-date"
              data-date="${dateStr}"
              title="Add Media on ${dateStr}"
              class="w-5 h-5 rounded bg-[#0d0e11] hover:bg-[#ff9f1c] text-slate-300 hover:text-[#0d0e11] text-xs font-bold leading-none"
            >+</button>
          ` : ''}
        </div>
        <div class="space-y-1 mt-1.5 overflow-y-auto max-h-[82px] no-scrollbar">
          ${dayEvents.map(({ item, badge }) => {
            const badgeCls = badge === 'DAY'
              ? 'bg-[#ff9f1c] text-[#0d0e11]'
              : badge === 'START'
                ? 'bg-emerald-400 text-[#0d0e11]'
                : 'bg-sky-400 text-[#0d0e11]';
            return `
              <button
                data-action="edit-item"
                data-id="${esc(item.id)}"
                class="w-full text-left p-1 rounded bg-[#0d0e11] hover:bg-[#364146] border border-[#3d494f] flex items-center gap-1.5 text-[11px]"
              >
                <span class="px-1 rounded text-[9px] font-extrabold ${badgeCls}">${badge}</span>
                <span class="truncate text-slate-100 font-medium">${esc(item.title)}</span>
              </button>
            `;
          }).join('')}
        </div>
      </div>
    `);
  }

  const calGrid = document.getElementById('calendarGrid');
  if (calGrid) calGrid.innerHTML = cells.join('');
}

// ---------------------------------------------------------------------------
// Genre View (Explorer Engine)
// ---------------------------------------------------------------------------

function renderGenreView() {
  const statsEl   = document.getElementById('genreViewStats');
  const searchInp = document.getElementById('genreViewSearchInput');
  const clearBtn  = document.getElementById('clearGenreSearchBtn');
  const sortSel   = document.getElementById('genreSortSelect');
  const jumpBar   = document.getElementById('genreJumpBar');
  const grid      = document.getElementById('genreGrid');
  if (!grid) return;

  if (searchInp && searchInp.value !== state.genreSearch) {
    searchInp.value = state.genreSearch;
  }
  if (clearBtn) {
    clearBtn.classList.toggle('hidden', !state.genreSearch);
  }
  if (sortSel && sortSel.value !== state.genreSort) {
    sortSel.value = state.genreSort;
  }

  // Group items by genre
  const genreMap = new Map();
  for (const item of state.items) {
    const genres = Array.isArray(item.genres) && item.genres.length > 0
      ? item.genres
      : ['Uncategorized'];
    for (const rawG of genres) {
      const g = (rawG || '').trim();
      if (!g) continue;
      const key = g.toLowerCase();
      if (!genreMap.has(key)) {
        genreMap.set(key, {
          name: g,
          items: []
        });
      }
      const entry = genreMap.get(key);
      if (!entry.items.some((i) => i.id === item.id)) {
        entry.items.push(item);
      }
    }
  }

  // Filter by search query (genre name or item titles/studio)
  const q = (state.genreSearch || '').trim().toLowerCase();
  let genreEntries = Array.from(genreMap.values());

  if (q) {
    genreEntries = genreEntries.map((entry) => {
      const genreMatches = entry.name.toLowerCase().includes(q);
      if (genreMatches) {
        return entry;
      }
      const matchingItems = entry.items.filter((item) => {
        return (item.title || '').toLowerCase().includes(q) ||
               (item.studio || '').toLowerCase().includes(q);
      });
      return {
        name: entry.name,
        items: matchingItems
      };
    }).filter((entry) => entry.items.length > 0);
  }

  // Compute stats for each genre
  for (const entry of genreEntries) {
    const ratedItems = entry.items.filter((i) => Number(i.rating) > 0);
    const avgRating = ratedItems.length > 0
      ? (ratedItems.reduce((acc, i) => acc + Number(i.rating), 0) / ratedItems.length)
      : 0;
    const completedCount = entry.items.filter((i) => {
      const st = (typeof normalizeStatus === 'function') ? normalizeStatus(i.status) : i.status;
      return st === 'Completed';
    }).length;
    entry.avgRating = avgRating;
    entry.completedCount = completedCount;

    // Sort items inside this genre: rating descending, then title ascending
    entry.items.sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0) || (a.title || '').localeCompare(b.title || ''));
  }

  // Sort genres
  if (state.genreSort === 'count-desc') {
    genreEntries.sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name));
  } else if (state.genreSort === 'rating-desc') {
    genreEntries.sort((a, b) => b.avgRating - a.avgRating || b.items.length - a.items.length || a.name.localeCompare(b.name));
  } else if (state.genreSort === 'name-asc') {
    genreEntries.sort((a, b) => a.name.localeCompare(b.name));
  }

  // Overall stats
  const totalUniqueItems = new Set();
  genreEntries.forEach((e) => e.items.forEach((i) => totalUniqueItems.add(i.id)));
  if (statsEl) {
    statsEl.textContent = `${genreEntries.length} ${genreEntries.length === 1 ? 'Genre' : 'Genres'} (${totalUniqueItems.size} ${totalUniqueItems.size === 1 ? 'Title' : 'Titles'})`;
  }

  // Jump Bar
  if (jumpBar) {
    if (genreEntries.length > 0) {
      jumpBar.innerHTML = `<span class="text-xs text-slate-400 shrink-0 mr-1 flex items-center gap-1">Jump to:</span>` +
        genreEntries.map((entry) => {
          const slug = entry.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
          return `<button
            type="button"
            data-action="jump-to-genre-section"
            data-target="genre-sec-${slug}"
            class="px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap bg-[#0d0e11] hover:bg-[#364146] text-slate-300 hover:text-white border border-[#3d494f] hover:border-[#ff9f1c] flex items-center gap-1.5 transition shrink-0"
          >
            <span>${esc(entry.name)}</span>
            <span class="text-[10px] px-1.5 py-0.2 rounded-full bg-[#2c3539] text-[#ff9f1c] font-bold">${entry.items.length}</span>
          </button>`;
        }).join('');
    } else {
      jumpBar.innerHTML = `<span class="text-xs text-slate-400">No genres found matching query.</span>`;
    }
  }

  // Empty State
  if (genreEntries.length === 0) {
    grid.innerHTML = `
      <div class="bg-[#2c3539] border border-[#3d494f] rounded-2xl p-10 text-center space-y-3">
        <div class="text-3xl">🏷️</div>
        <div class="text-base font-bold text-white">No genres found</div>
        <p class="text-xs text-slate-400">
          ${state.genreSearch ? 'No genres or titles match your search filter.' : 'Your library has no genres assigned yet.'}
        </p>
        ${state.genreSearch ? `
          <button data-action="clear-genre-search" class="px-4 py-2 rounded-lg bg-[#ff9f1c] text-[#0d0e11] font-bold text-xs transition hover:bg-[#ffb144]">
            Clear Genre Search
          </button>
        ` : `
          <button data-action="enrich-library" class="px-4 py-2 rounded-lg bg-[#ff9f1c] text-[#0d0e11] font-bold text-xs transition hover:bg-[#ffb144]">
            ⚡ Enrich Metadata to Auto-Fill Genres
          </button>
        `}
      </div>
    `;
    return;
  }

  // Render Sections
  const isOwner = OwnerMode.isOwner();
  grid.innerHTML = genreEntries.map((entry) => {
    const slug = entry.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const avgRatingStr = entry.avgRating > 0 ? `${entry.avgRating.toFixed(1).replace(/\.0$/, '')} ★` : 'Unrated';

    return `
      <section id="genre-sec-${slug}" class="bg-[#2c3539]/70 border border-[#3d494f] rounded-2xl p-4 sm:p-5 space-y-4 scroll-mt-20">
        <!-- Section Header -->
        <div class="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#3d494f]">
          <div class="flex flex-wrap items-center gap-3">
            <div class="flex items-center gap-2">
              <span class="text-lg text-[#ff9f1c]">🏷️</span>
              <h3 class="text-base sm:text-lg font-bold text-white tracking-wide">${esc(entry.name)}</h3>
            </div>
            <span class="text-xs px-2.5 py-0.5 rounded-full bg-[#ff9f1c]/15 text-[#ff9f1c] border border-[#ff9f1c]/40 font-bold">
              ${entry.items.length} ${entry.items.length === 1 ? 'title' : 'titles'}
            </span>
            <div class="text-xs text-slate-300 flex items-center gap-2">
              <span>Avg: <strong class="text-[#ff9f1c]">${avgRatingStr}</strong></span>
              <span class="text-[#3d494f]">•</span>
              <span>Completed: <strong class="text-emerald-400">${entry.completedCount}</strong></span>
            </div>
          </div>

          <button
            type="button"
            data-action="open-genre-in-library"
            data-genre="${esc(entry.name)}"
            class="h-7 px-3 rounded-lg bg-[#0d0e11] hover:bg-[#364146] border border-[#3d494f] hover:border-[#ff9f1c] text-xs font-semibold text-slate-200 hover:text-[#ff9f1c] flex items-center gap-1.5 transition"
          >
            <span>View in Library</span>
            <svg class="w-3.5 h-3.5 text-[#ff9f1c]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/>
            </svg>
          </button>
        </div>

        <!-- Media Cards Grid -->
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
          ${entry.items.map((item) => {
            const rating = Number(item.rating || 0);
            const isMasterpiece = rating >= 9;
            const posterSrc = item.image || makeFallbackPoster(item.title);
            const displayStatus = (typeof normalizeStatus === 'function') ? normalizeStatus(item.status) : item.status;
            const progress = Number(item.progress || 0);
            const total = Math.max(1, Number(item.totalUnits || 1));

            let statusBadgeClass = 'bg-slate-700 text-slate-200';
            if (displayStatus === 'Ongoing')        statusBadgeClass = 'bg-amber-500/90 text-[#0d0e11]';
            else if (displayStatus === 'Completed') statusBadgeClass = 'bg-emerald-500/90 text-[#0d0e11]';
            else if (displayStatus === 'Planning')  statusBadgeClass = 'bg-sky-500/90 text-[#0d0e11]';
            else if (displayStatus === 'On Hold')   statusBadgeClass = 'bg-purple-500/90 text-white';
            else if (displayStatus === 'Dropped')   statusBadgeClass = 'bg-rose-500/90 text-white';

            return `
              <div
                data-action="edit-item"
                data-id="${esc(item.id)}"
                class="group relative bg-[#0d0e11] hover:bg-[#1a1f23] border border-[#3d494f] hover:border-[#ff9f1c] rounded-xl overflow-hidden shadow transition duration-200 flex flex-col cursor-pointer"
                title="${esc(item.title)} (${displayStatus})"
              >
                <!-- Poster Image & Overlays -->
                <div class="relative w-full aspect-[2/3] bg-[#0d0e11] overflow-hidden">
                  <img
                    src="${esc(posterSrc)}"
                    alt="${esc(item.title)}"
                    data-fallback-title="${esc(item.title)}"
                    class="poster-img w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    loading="lazy"
                  />
                  ${rating > 0 ? `
                    <div class="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[10px] font-extrabold shadow flex items-center gap-0.5 ${
                      isMasterpiece
                        ? 'bg-[#ff9f1c] text-[#0d0e11]'
                        : 'bg-[#0d0e11]/90 backdrop-blur-sm text-[#ff9f1c] border border-[#ff9f1c]/50'
                    }">
                      <span>★</span>
                      <span>${rating.toFixed(1).replace(/\.0$/, '')}</span>
                    </div>
                  ` : ''}
                  <div class="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider backdrop-blur-sm shadow ${statusBadgeClass}">
                    ${esc(displayStatus)}
                  </div>
                </div>

                <!-- Info Footer -->
                <div class="p-2 flex flex-col justify-between flex-1 min-w-0">
                  <h4 class="font-bold text-xs text-white line-clamp-2 leading-tight group-hover:text-[#ff9f1c] transition" title="${esc(item.title)}">
                    ${esc(item.title)}
                  </h4>
                  <div class="mt-1.5 pt-1 border-t border-[#3d494f]/50 flex items-center justify-between text-[10px] text-slate-400">
                    <span class="truncate pr-1">${esc(item.category || '')}</span>
                    <span class="font-mono text-slate-300 shrink-0">${progress}/${total}</span>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </section>
    `;
  }).join('');

  // Poster fallback listeners
  grid.querySelectorAll('img.poster-img').forEach((img) => {
    img.addEventListener('error', function handleImgErr() {
      this.removeEventListener('error', handleImgErr);
      this.src = makeFallbackPoster(this.dataset.fallbackTitle || 'Media');
    });
  });
}

// ---------------------------------------------------------------------------
// Master Render
// ---------------------------------------------------------------------------

function renderAll() {
  renderNavigation();
  const libView   = document.getElementById('libraryView');
  const libSub    = document.getElementById('librarySubHeader');
  const calView   = document.getElementById('calendarView');
  const genreView = document.getElementById('genreView');

  if (state.view === 'library') {
    if (libView)   libView.classList.remove('hidden');
    if (libSub)    libSub.classList.remove('hidden');
    if (calView)   calView.classList.add('hidden');
    if (genreView) genreView.classList.add('hidden');
    renderLibrary();
  } else if (state.view === 'calendar') {
    if (libView)   libView.classList.add('hidden');
    if (libSub)    libSub.classList.add('hidden');
    if (calView)   calView.classList.remove('hidden');
    if (genreView) genreView.classList.add('hidden');
    renderCalendar();
  } else if (state.view === 'genre') {
    if (libView)   libView.classList.add('hidden');
    if (libSub)    libSub.classList.add('hidden');
    if (calView)   calView.classList.add('hidden');
    if (genreView) genreView.classList.remove('hidden');
    renderGenreView();
  }
}

// ---------------------------------------------------------------------------
// Interactive Genre Management Engine
// ---------------------------------------------------------------------------

let currentModalGenres = [];
let currentGenreTrayCategory = 'all';

function renderModalGenreTags() {
  const container = document.getElementById('modalGenreTags');
  const badge = document.getElementById('genreCountBadge');
  const hiddenInput = document.getElementById('fieldGenres');
  if (!container) return;

  if (badge) badge.textContent = currentModalGenres.length;
  if (hiddenInput) hiddenInput.value = currentModalGenres.join(', ');

  if (currentModalGenres.length === 0) {
    container.innerHTML = `<span class="text-xs text-slate-500 italic px-1 select-none">No genres selected yet. Type above or click popular genres below.</span>`;
  } else {
    container.innerHTML = currentModalGenres.map((g, idx) => `
      <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#2c3539] text-[#ff9f1c] border border-[#ff9f1c]/50 text-xs font-semibold shadow-sm transition hover:border-[#ff9f1c]">
        <span>${esc(g)}</span>
        <button
          type="button"
          data-action="remove-modal-genre"
          data-genre-idx="${idx}"
          title="Remove ${esc(g)}"
          class="w-3.5 h-3.5 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-rose-600 transition text-[10px] leading-none"
        >✕</button>
      </span>
    `).join('');
  }

  renderPopularGenresTray(currentGenreTrayCategory);
}

function addGenreToModal(genreName) {
  const clean = (genreName || '').trim().replace(/^,+|,+$/g, '');
  if (!clean) return;
  const exists = currentModalGenres.some((g) => g.toLowerCase() === clean.toLowerCase());
  if (!exists) {
    currentModalGenres.push(clean);
    renderModalGenreTags();
  }
  const inp = document.getElementById('genreSearchInput');
  if (inp) {
    inp.value = '';
    inp.focus();
  }
  const drop = document.getElementById('genreSuggestionsDropdown');
  if (drop) drop.classList.add('hidden');
  const addBtn = document.getElementById('genreAddCustomBtn');
  if (addBtn) addBtn.classList.add('hidden');
}

function removeGenreFromModal(index) {
  if (index >= 0 && index < currentModalGenres.length) {
    currentModalGenres.splice(index, 1);
    renderModalGenreTags();
  }
}

function renderPopularGenresTray(category = 'all') {
  currentGenreTrayCategory = category;
  const tray = document.getElementById('popularGenresTray');
  if (!tray) return;

  let list = ALL_POPULAR_GENRES;
  if (category !== 'all' && POPULAR_GENRES_BY_CATEGORY[category]) {
    list = POPULAR_GENRES_BY_CATEGORY[category];
  }

  tray.innerHTML = list.map((g) => {
    const isSelected = currentModalGenres.some((cg) => cg.toLowerCase() === g.toLowerCase());
    return `
      <button
        type="button"
        data-action="toggle-tray-genre"
        data-genre="${esc(g)}"
        class="px-2.5 py-1 rounded-md text-[11px] transition font-medium ${
          isSelected
            ? 'bg-[#ff9f1c] text-[#0d0e11] font-bold shadow'
            : 'bg-[#2c3539] hover:bg-[#364146] text-slate-300 hover:text-white border border-[#3d494f] hover:border-[#ff9f1c]/50'
        }"
      >
        ${isSelected ? '✓ ' : '+ '}${esc(g)}
      </button>
    `;
  }).join('');
}

function handleGenreSearchInput(query) {
  const q = (query || '').trim().toLowerCase();
  const drop = document.getElementById('genreSuggestionsDropdown');
  const addBtn = document.getElementById('genreAddCustomBtn');
  if (!drop) return;

  if (!q) {
    drop.classList.add('hidden');
    if (addBtn) addBtn.classList.add('hidden');
    return;
  }

  if (addBtn) {
    addBtn.classList.remove('hidden');
    addBtn.textContent = `+ Add "${query.trim().slice(0, 12)}"`;
  }

  const matches = ALL_POPULAR_GENRES.filter((g) =>
    g.toLowerCase().includes(q) &&
    !currentModalGenres.some((cg) => cg.toLowerCase() === g.toLowerCase())
  ).slice(0, 8);

  const exactMatch = ALL_POPULAR_GENRES.some((g) => g.toLowerCase() === q);
  const customOption = !exactMatch ? `
    <button
      type="button"
      data-action="add-custom-genre-suggestion"
      data-genre="${esc(query.trim())}"
      class="w-full px-3 py-2 text-left text-xs text-[#ff9f1c] font-bold hover:bg-[#2c3539] flex items-center justify-between transition"
    >
      <span>+ Add custom genre: "${esc(query.trim())}"</span>
      <span class="text-[10px] px-1.5 py-0.5 rounded bg-[#ff9f1c]/20">Enter ↵</span>
    </button>
  ` : '';

  if (matches.length === 0 && !customOption) {
    drop.innerHTML = `<div class="p-2.5 text-xs text-slate-400">Genre already selected.</div>`;
  } else {
    drop.innerHTML = customOption + matches.map((m) => `
      <button
        type="button"
        data-action="pick-genre-suggestion"
        data-genre="${esc(m)}"
        class="w-full px-3 py-2 text-left text-xs text-slate-200 hover:text-white hover:bg-[#2c3539] flex items-center justify-between transition"
      >
        <span class="font-semibold text-white">${esc(m)}</span>
        <span class="text-[10px] text-[#ff9f1c]">Popular</span>
      </button>
    `).join('');
  }

  drop.classList.remove('hidden');
}

// ---------------------------------------------------------------------------
// Modal Helpers
// ---------------------------------------------------------------------------

function updateModalPosterPreview(url) {
  const img = document.getElementById('modalPosterPreview');
  const ph  = document.getElementById('modalPosterPlaceholder');
  if (!img || !ph) return;
  if (url && url.trim()) {
    img.src = url.trim();
    img.classList.remove('hidden');
    ph.classList.add('hidden');
  } else {
    img.src = '';
    img.classList.add('hidden');
    ph.classList.remove('hidden');
  }
}

function openMediaModal(item = null, presetDate = '') {
  if (!OwnerMode.isOwner()) {
    showToast('Read-Only mode: Enter owner passcode to add or edit entries');
    return;
  }

  const searchInp = document.getElementById('autoSearchInput');
  const searchBox = document.getElementById('autoSearchResults');
  const searchStat = document.getElementById('autoSearchStatus');
  if (searchInp)  searchInp.value = '';
  if (searchBox)  searchBox.classList.add('hidden');
  if (searchStat) searchStat.textContent = '';

  const genreInp = document.getElementById('genreSearchInput');
  const genreDrop = document.getElementById('genreSuggestionsDropdown');
  const genreAdd = document.getElementById('genreAddCustomBtn');
  if (genreInp)  genreInp.value = '';
  if (genreDrop) genreDrop.classList.add('hidden');
  if (genreAdd)  genreAdd.classList.add('hidden');

  const catVal = item ? (item.category || 'Series & Anime') : (state.category !== 'All' ? state.category : 'Series & Anime');
  let mappedCategory = 'all';
  if (catVal.includes('Anime')) mappedCategory = 'anime';
  else if (catVal === 'Movies') mappedCategory = 'movies';
  else if (catVal === 'Games')  mappedCategory = 'games';
  else if (catVal === 'Books')  mappedCategory = 'books';

  if (item) {
    document.getElementById('modalTitle').textContent     = 'Edit Media';
    document.getElementById('fieldId').value              = item.id;
    document.getElementById('fieldTitle').value            = item.title || '';
    document.getElementById('fieldCategory').value         = catVal;
    document.getElementById('fieldStatus').value           = (typeof normalizeStatus === 'function') ? normalizeStatus(item.status) : (item.status || 'Ongoing');
    document.getElementById('fieldRating').value           = item.rating ?? 0;
    document.getElementById('fieldProgress').value         = item.progress ?? 0;
    document.getElementById('fieldTotalUnits').value       = item.totalUnits ?? 12;
    document.getElementById('fieldStudio').value           = item.studio || '';
    document.getElementById('fieldReleaseDate').value      = item.releaseDate || '';
    document.getElementById('fieldConsumedDate').value     = item.consumedDate || '';
    document.getElementById('fieldImage').value            = item.image || '';
    document.getElementById('fieldNotes').value            = item.notes || '';
    document.getElementById('fieldSynopsis').value         = item.synopsis || '';
    updateModalPosterPreview(item.image || '');

    currentModalGenres = Array.isArray(item.genres)
      ? [...item.genres]
      : (item.genres ? String(item.genres).split(',').map((s) => s.trim()).filter(Boolean) : []);
  } else {
    document.getElementById('modalTitle').textContent     = 'Add Media';
    document.getElementById('fieldId').value              = '';
    document.getElementById('fieldTitle').value            = '';
    document.getElementById('fieldCategory').value         = catVal;
    document.getElementById('fieldStatus').value           = 'Ongoing';
    document.getElementById('fieldRating').value           = 0;
    document.getElementById('fieldProgress').value         = 12;
    document.getElementById('fieldTotalUnits').value       = 12;
    document.getElementById('fieldStudio').value           = '';
    document.getElementById('fieldReleaseDate').value      = '';
    document.getElementById('fieldConsumedDate').value     = presetDate || '';
    document.getElementById('fieldImage').value            = '';
    document.getElementById('fieldNotes').value            = '';
    document.getElementById('fieldSynopsis').value         = '';
    updateModalPosterPreview('');

    currentModalGenres = [];
  }

  // Set active genre category pill
  const filterBtns = document.querySelectorAll('#genreCategoryFilter button');
  filterBtns.forEach((b) => {
    const isCat = b.dataset.cat === mappedCategory;
    b.className = isCat
      ? 'px-2 py-0.5 rounded text-[10px] font-bold bg-[#ff9f1c] text-[#0d0e11] transition'
      : 'px-2 py-0.5 rounded text-[10px] text-slate-300 hover:text-white bg-[#2c3539] transition';
  });

  renderModalGenreTags();
  renderPopularGenresTray(mappedCategory);

  document.getElementById('mediaModal').classList.remove('hidden');
}

function saveMediaFromModal() {
  if (!OwnerMode.isOwner()) {
    showToast('Read-Only mode: Cannot save changes');
    return;
  }

  const title = document.getElementById('fieldTitle').value.trim();
  if (!title) {
    showToast('Please enter a title');
    return;
  }
  const id         = document.getElementById('fieldId').value || ('id-' + Date.now());
  const category   = document.getElementById('fieldCategory').value;
  const rawStatus  = document.getElementById('fieldStatus').value;
  const status     = (typeof normalizeStatus === 'function') ? normalizeStatus(rawStatus) : rawStatus;
  const rating     = Math.min(10, Math.max(0, parseFloat(document.getElementById('fieldRating').value) || 0));
  const totalUnits = Math.max(1, parseInt(document.getElementById('fieldTotalUnits').value, 10) || 1);
  let   progress   = Math.max(0, parseInt(document.getElementById('fieldProgress').value, 10) || 0);
  if (status === 'Completed') progress = totalUnits;

  const unitName = category === 'Movies' ? 'movie' : category === 'Books' ? 'chs' : category === 'Games' ? 'hrs' : 'eps';
  const genres   = [...currentModalGenres];

  const entry = {
    id,
    title,
    category,
    status,
    rating,
    progress,
    totalUnits,
    unitName,
    studio:       document.getElementById('fieldStudio').value.trim() || 'Unknown Studio',
    releaseDate:  document.getElementById('fieldReleaseDate').value.trim() || 'TBA',
    consumedDate: document.getElementById('fieldConsumedDate').value.trim(),
    genres,
    image:        document.getElementById('fieldImage').value.trim(),
    notes:        document.getElementById('fieldNotes').value.trim(),
    synopsis:     document.getElementById('fieldSynopsis').value.trim(),
    updatedAt:    Date.now()
  };

  const idx = state.items.findIndex((i) => i.id === id);
  if (idx >= 0) {
    state.items[idx] = entry;
  } else {
    state.items.unshift(entry);
  }

  saveItems();
  document.getElementById('mediaModal').classList.add('hidden');
  renderAll();
  showToast('Saved entry');
}

function openConfirmModal(title, message, onConfirm) {
  document.getElementById('confirmModalTitle').textContent   = title;
  document.getElementById('confirmModalMessage').textContent = message;
  state.pendingConfirmFn = onConfirm;
  document.getElementById('confirmModal').classList.remove('hidden');
}

// ---------------------------------------------------------------------------
// Central Event Delegation
// ---------------------------------------------------------------------------

document.addEventListener('click', async (e) => {
  const btn      = e.target.closest('[data-action]');
  const dropdown = document.getElementById('tomeDropdown');
  if (!e.target.closest('#tomeMenuBtn') && !e.target.closest('#tomeDropdown') && dropdown) {
    dropdown.classList.add('hidden');
  }

  // Close genre suggestions dropdown when clicking outside
  if (!e.target.closest('#genreSearchInput') && !e.target.closest('#genreSuggestionsDropdown') && !e.target.closest('#genreAddCustomBtn')) {
    const drop = document.getElementById('genreSuggestionsDropdown');
    if (drop) drop.classList.add('hidden');
  }

  if (!btn) return;
  const action = btn.dataset.action;

  if (action === 'toggle-tome-menu') {
    if (dropdown) dropdown.classList.toggle('hidden');
  } else if (action === 'switch-view') {
    state.view = btn.dataset.view;
    if (dropdown) dropdown.classList.add('hidden');
    renderAll();
  } else if (action === 'set-category') {
    state.category = btn.dataset.category;
    renderAll();
  } else if (action === 'set-status') {
    state.status = btn.dataset.status;
    renderAll();
  } else if (action === 'clear-library-search') {
    state.search = '';
    const inp = document.getElementById('librarySearchInput');
    if (inp) inp.value = '';
    btn.classList.add('hidden');
    renderAll();
  } else if (action === 'open-add-modal') {
    openMediaModal(null);
  } else if (action === 'close-modal') {
    document.getElementById('mediaModal').classList.add('hidden');
  } else if (action === 'save-media') {
    saveMediaFromModal();
  } else if (action === 'edit-item') {
    e.stopPropagation();
    const item = state.items.find((i) => i.id === btn.dataset.id);
    if (item) openMediaModal(item);
  } else if (action === 'view-item') {
    e.stopPropagation();
    const item = state.items.find((i) => i.id === btn.dataset.id);
    if (item && item.synopsis) {
      showToast(`${item.title}: ${item.synopsis.slice(0, 100)}...`);
    }
  } else if (action === 'delete-item') {
    e.stopPropagation();
    if (!OwnerMode.isOwner()) {
      showToast('Read-Only mode: Cannot remove entries');
      return;
    }
    const id = btn.dataset.id;
    state.items = state.items.filter((i) => i.id !== id);
    state.selectedIds.delete(id);
    saveItems();
    if (typeof CloudSync !== 'undefined' && CloudSync.deleteItem) {
      CloudSync.deleteItem(id);
    }
    renderAll();
    showToast('Entry removed');
  } else if (action === 'step-progress') {
    e.stopPropagation();
    if (!OwnerMode.isOwner()) {
      showToast('Read-Only mode: Enter owner passcode to change progress');
      return;
    }
    const item = state.items.find((i) => i.id === btn.dataset.id);
    if (!item) return;
    const delta = parseInt(btn.dataset.delta, 10);
    const total = Math.max(1, Number(item.totalUnits || 1));
    item.progress = Math.min(total, Math.max(0, Number(item.progress || 0) + delta));
    if (item.progress === total) item.status = 'Completed';
    item.updatedAt = Date.now();
    saveItems();
    renderAll();
  } else if (action === 'switch-card-tab') {
    e.stopPropagation();
    state.cardTab[btn.dataset.id] = btn.dataset.tab;
    renderLibrary();
  } else if (action === 'jump-to-item-date') {
    e.stopPropagation();
    const parsed = parseDateOrRange(btn.dataset.date);
    if (parsed) {
      state.calYear  = parsed.start.year;
      state.calMonth = parsed.start.month;
      state.view     = 'calendar';
      renderAll();
    }
  } else if (action === 'cal-prev-month') {
    state.calMonth--;
    if (state.calMonth < 0) { state.calMonth = 11; state.calYear--; }
    renderCalendar();
  } else if (action === 'cal-next-month') {
    state.calMonth++;
    if (state.calMonth > 11) { state.calMonth = 0; state.calYear++; }
    renderCalendar();
  } else if (action === 'cal-today') {
    const now = new Date();
    state.calYear  = now.getFullYear();
    state.calMonth = now.getMonth();
    renderCalendar();
  } else if (action === 'cal-jump-ym') {
    state.calYear  = parseInt(btn.dataset.year, 10);
    state.calMonth = parseInt(btn.dataset.month, 10);
    renderCalendar();
  } else if (action === 'add-on-date') {
    openMediaModal(null, btn.dataset.date);
  } else if (action === 'fill-today-date') {
    const d = new Date();
    const inp = document.getElementById('fieldConsumedDate');
    if (inp) inp.value = `${d.getDate()}-${d.getMonth() + 1}-${d.getFullYear()}`;
  } else if (action === 'append-date-to') {
    const inp = document.getElementById('fieldConsumedDate');
    if (inp) {
      if (inp.value && !inp.value.includes('to')) inp.value = inp.value.trim() + ' to ';
      inp.focus();
    }
  } else if (action === 'pick-search-result') {
    const r = (window._lastSearchResults || [])[parseInt(btn.dataset.idx, 10)];
    if (r) {
      document.getElementById('fieldTitle').value      = r.title || '';
      document.getElementById('fieldCategory').value   = r.category || 'Series & Anime';
      document.getElementById('fieldTotalUnits').value  = r.totalUnits || 12;
      document.getElementById('fieldProgress').value    = document.getElementById('fieldStatus').value === 'Completed' ? (r.totalUnits || 12) : 0;
      document.getElementById('fieldStudio').value      = r.studio || '';
      document.getElementById('fieldReleaseDate').value = r.releaseDate || '';
      document.getElementById('fieldImage').value       = r.image || '';
      document.getElementById('fieldSynopsis').value    = r.synopsis || '';
      updateModalPosterPreview(r.image || '');

      // Set genres in our interactive chip system
      currentModalGenres = Array.isArray(r.genres) ? [...r.genres] : [];
      renderModalGenreTags();

      document.getElementById('autoSearchResults').classList.add('hidden');
    }
  } else if (action === 'enrich-library') {
    if (dropdown) dropdown.classList.add('hidden');
    if (!OwnerMode.isOwner()) {
      showToast('Read-Only mode: Enter owner passcode to enrich library');
      return;
    }
    enrichMissingMetadata(false);
  } else if (action === 'stop-enrich') {
    state.enrichStopRequested = true;
  } else if (action === 'export-json') {
    exportLibraryJSON();
  } else if (action === 'toggle-bulk-mode') {
    if (!OwnerMode.isOwner()) {
      showToast('Read-Only mode: Mass removal requires Owner Mode');
      return;
    }
    state.bulkMode = !state.bulkMode;
    if (!state.bulkMode) state.selectedIds.clear();
    state.view = 'library';
    if (dropdown) dropdown.classList.add('hidden');
    renderAll();
  } else if (action === 'toggle-select-card') {
    const id = btn.dataset.cardId;
    if (!id) return;
    if (state.selectedIds.has(id)) state.selectedIds.delete(id);
    else state.selectedIds.add(id);
    renderAll();
  } else if (action === 'bulk-select-visible') {
    getFilteredItems().forEach((i) => state.selectedIds.add(i.id));
    renderAll();
  } else if (action === 'bulk-deselect-all') {
    state.selectedIds.clear();
    renderAll();
  } else if (action === 'bulk-select-broken') {
    state.selectedIds.clear();
    state.items.forEach((i) => {
      if (isBrokenTitle(i.title)) state.selectedIds.add(i.id);
    });
    renderAll();
    showToast(`Selected ${state.selectedIds.size} broken title entries`);
  } else if (action === 'bulk-select-unrated') {
    state.selectedIds.clear();
    state.items.forEach((i) => {
      if (!i.rating || Number(i.rating) === 0) state.selectedIds.add(i.id);
    });
    renderAll();
    showToast(`Selected ${state.selectedIds.size} unrated entries`);
  } else if (action === 'bulk-delete-selected') {
    if (!OwnerMode.isOwner()) return;
    const count = state.selectedIds.size;
    if (count === 0) {
      showToast('Select at least 1 entry first');
      return;
    }
    openConfirmModal(
      `Remove ${count} Selected Entries?`,
      `This will permanently remove the ${count} selected entries from your OmniChart library.`,
      () => {
        state.items = state.items.filter((i) => !state.selectedIds.has(i.id));
        state.selectedIds.clear();
        saveItems();
        renderAll();
        showToast(`Removed ${count} entries`);
      }
    );
  } else if (action === 'bulk-delete-filtered') {
    if (!OwnerMode.isOwner()) return;
    const visible = getFilteredItems();
    if (visible.length === 0) return;
    openConfirmModal(
      `Remove All ${visible.length} Shown Entries?`,
      `This will remove all ${visible.length} entries currently matching your active category/status/search filter.`,
      () => {
        const removeSet = new Set(visible.map((i) => i.id));
        state.items = state.items.filter((i) => !removeSet.has(i.id));
        state.selectedIds.clear();
        saveItems();
        renderAll();
        showToast(`Removed ${visible.length} entries`);
      }
    );
  } else if (action === 'bulk-wipe-all') {
    if (!OwnerMode.isOwner()) return;
    if (state.items.length === 0) return;
    const total = state.items.length;
    openConfirmModal(
      `Wipe Entire Library (${total} Entries)?`,
      `This will clear all ${total} entries from OmniChart so you can start fresh or import a clean JSON file.`,
      () => {
        state.items = [];
        state.selectedIds.clear();
        state.bulkMode = false;
        saveItems();
        renderAll();
        showToast('Library wiped clean');
      }
    );
  } else if (action === 'close-confirm-modal') {
    document.getElementById('confirmModal').classList.add('hidden');
    state.pendingConfirmFn = null;
  } else if (action === 'confirm-modal-proceed') {
    document.getElementById('confirmModal').classList.add('hidden');
    if (typeof state.pendingConfirmFn === 'function') state.pendingConfirmFn();
    state.pendingConfirmFn = null;
  } else if (action === 'toggle-owner-auth') {
    if (OwnerMode.isOwner()) {
      if (confirm('Lock Owner Mode and switch to Public Read-Only View?')) {
        OwnerMode.lock();
        renderAll();
        showToast('Switched to Public View');
      }
    } else {
      const code = prompt('Enter Owner Passcode to unlock editing:');
      if (code && OwnerMode.unlock(code)) {
        renderAll();
        showToast('👑 Owner Mode unlocked!');
      } else if (code) {
        showToast('Incorrect passcode');
      }
    }
  } else if (action === 'remove-modal-genre') {
    removeGenreFromModal(parseInt(btn.dataset.genreIdx, 10));
  } else if (action === 'toggle-tray-genre') {
    const g = btn.dataset.genre;
    const idx = currentModalGenres.findIndex((cg) => cg.toLowerCase() === g.toLowerCase());
    if (idx >= 0) {
      removeGenreFromModal(idx);
    } else {
      addGenreToModal(g);
    }
  } else if (action === 'pick-genre-suggestion') {
    addGenreToModal(btn.dataset.genre);
  } else if (action === 'add-custom-genre-suggestion') {
    addGenreToModal(btn.dataset.genre);
  } else if (action === 'add-custom-genre') {
    const inp = document.getElementById('genreSearchInput');
    if (inp) addGenreToModal(inp.value);
  } else if (action === 'filter-genre-tray') {
    const cat = btn.dataset.cat;
    const filterBtns = document.querySelectorAll('#genreCategoryFilter button');
    filterBtns.forEach((b) => {
      const isCat = b.dataset.cat === cat;
      b.className = isCat
        ? 'px-2 py-0.5 rounded text-[10px] font-bold bg-[#ff9f1c] text-[#0d0e11] transition'
        : 'px-2 py-0.5 rounded text-[10px] text-slate-300 hover:text-white bg-[#2c3539] transition';
    });
    renderPopularGenresTray(cat);
  } else if (action === 'filter-by-genre') {
    e.stopPropagation();
    state.search = btn.dataset.genre;
    state.view = 'library';
    const inp = document.getElementById('librarySearchInput');
    if (inp) inp.value = state.search;
    const clr = document.getElementById('clearLibrarySearchBtn');
    if (clr) clr.classList.remove('hidden');
    renderAll();
    showToast(`Filtering by genre: ${btn.dataset.genre}`);
  } else if (action === 'jump-to-genre-section') {
    const targetId = btn.dataset.target;
    const targetEl = document.getElementById(targetId);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  } else if (action === 'open-genre-in-library') {
    state.search = btn.dataset.genre;
    state.view = 'library';
    const inp = document.getElementById('librarySearchInput');
    if (inp) inp.value = state.search;
    const clr = document.getElementById('clearLibrarySearchBtn');
    if (clr) clr.classList.remove('hidden');
    renderAll();
    showToast(`Showing ${btn.dataset.genre} in Library`);
  } else if (action === 'clear-genre-search') {
    state.genreSearch = '';
    const inp = document.getElementById('genreViewSearchInput');
    if (inp) inp.value = '';
    const clr = document.getElementById('clearGenreSearchBtn');
    if (clr) clr.classList.add('hidden');
    renderGenreView();
  } else if (action === 'open-auth-modal') {
    openAuthModal();
  } else if (action === 'close-auth-modal') {
    document.getElementById('authModal').classList.add('hidden');
  } else if (action === 'switch-auth-tab') {
    switchAuthTab(btn.dataset.tab);
  } else if (action === 'auth-sign-in') {
    const email = document.getElementById('authEmailInput')?.value?.trim();
    const pwd   = document.getElementById('authPasswordInput')?.value?.trim();
    const errEl = document.getElementById('authErrorMessage');
    if (!email || !pwd) {
      if (errEl) {
        errEl.className = 'p-2.5 rounded-lg bg-rose-950/60 border border-rose-500/50 text-xs text-rose-300';
        errEl.innerHTML = '⚠️ Please enter both email and password.';
        errEl.classList.remove('hidden');
      }
      return;
    }
    btn.disabled = true;
    const origText = btn.innerHTML;
    btn.textContent = 'Signing In...';
    try {
      const data = await CloudSync.signIn(email, pwd);
      if (data?.user) {
        state.user = data.user;
        renderAuthStatus();
      }
      document.getElementById('authModal').classList.add('hidden');
      showToast(`Signed in as ${email}`);
    } catch (err) {
      if (errEl) {
        errEl.className = 'p-3 rounded-lg bg-rose-950/60 border border-rose-500/50 text-xs text-rose-300 space-y-1.5';
        const msg = err.message || '';
        const code = err.error_code || err.code || '';
        if (code === 'email_not_confirmed' || msg.toLowerCase().includes('email not confirmed')) {
          errEl.className = 'p-3 rounded-lg bg-amber-950/60 border border-amber-500/50 text-xs text-amber-200 space-y-1.5';
          errEl.innerHTML = `
            <div class="font-bold text-white flex items-center gap-1.5">
              <span>✉️</span> Email Confirmation Required
            </div>
            <p class="leading-relaxed">Supabase requires clicking the confirmation link sent to <strong>${esc(email)}</strong> before signing in.</p>
            <div class="mt-2 p-2 rounded bg-black/40 border border-[#3d494f] text-[11px] text-slate-300">
              <span class="text-[#ff9f1c] font-semibold">⚡ Instant Access (No Email Wait):</span> In your Supabase Dashboard, go to <strong>Authentication → Providers → Email</strong> and turn OFF <strong>"Confirm email"</strong>. Then you can log in immediately!
            </div>
          `;
        } else if (code === 'over_email_send_rate_limit' || msg.toLowerCase().includes('rate limit')) {
          errEl.innerHTML = `
            <div class="font-bold text-rose-300 flex items-center gap-1.5">
              <span>⏳</span> Email Rate Limit Reached
            </div>
            <p class="leading-relaxed">Supabase free tier limits confirmation emails to 3-4 per hour.</p>
            <div class="mt-2 p-2 rounded bg-black/40 border border-[#3d494f] text-[11px] text-slate-300">
              <span class="text-[#ff9f1c] font-semibold">👉 10-Second Fix:</span> In your Supabase Dashboard under <strong>Authentication → Providers → Email</strong>, turn OFF <strong>"Confirm email"</strong>. You will be able to log in instantly without waiting for emails!
            </div>
          `;
        } else if (msg.toLowerCase().includes('invalid login credentials')) {
          errEl.innerHTML = `⚠️ Invalid email or password. If you haven't created an account yet, click <strong>Create Account</strong>.`;
        } else {
          errEl.textContent = msg || 'Failed to sign in. Please verify your credentials.';
        }
        errEl.classList.remove('hidden');
      }
    } finally {
      btn.disabled = false;
      btn.innerHTML = origText;
    }
  } else if (action === 'auth-sign-up') {
    const email = document.getElementById('authEmailInput')?.value?.trim();
    const pwd   = document.getElementById('authPasswordInput')?.value?.trim();
    const errEl = document.getElementById('authErrorMessage');
    if (!email || !pwd) {
      if (errEl) {
        errEl.className = 'p-2.5 rounded-lg bg-rose-950/60 border border-rose-500/50 text-xs text-rose-300';
        errEl.innerHTML = '⚠️ Please enter both email and password.';
        errEl.classList.remove('hidden');
      }
      return;
    }
    if (pwd.length < 6) {
      if (errEl) {
        errEl.className = 'p-2.5 rounded-lg bg-rose-950/60 border border-rose-500/50 text-xs text-rose-300';
        errEl.innerHTML = '⚠️ Password must be at least 6 characters.';
        errEl.classList.remove('hidden');
      }
      return;
    }
    btn.disabled = true;
    const origText = btn.innerHTML;
    btn.textContent = 'Creating...';
    try {
      const data = await CloudSync.signUp(email, pwd);
      if (data?.session) {
        state.user = data.session.user;
        renderAuthStatus();
        document.getElementById('authModal').classList.add('hidden');
        showToast('Account created & signed in!');
      } else {
        // Supabase has "Confirm email" turned ON, so user was created without a live session
        if (errEl) {
          errEl.className = 'p-3 rounded-lg bg-amber-950/60 border border-amber-500/50 text-xs text-amber-200 space-y-1.5';
          errEl.innerHTML = `
            <div class="font-bold text-white flex items-center gap-1.5">
              <span>✉️</span> Verification Link Sent!
            </div>
            <p>Account created for <strong>${esc(email)}</strong>. Please check your inbox (and spam) to confirm your account.</p>
            <div class="mt-2 p-2 rounded bg-black/40 border border-[#3d494f] text-[11px] text-slate-300">
              <span class="text-[#ff9f1c] font-semibold">⚡ Skip Verification:</span> Turn off <strong>"Confirm email"</strong> in your Supabase Dashboard (<strong>Authentication → Providers → Email</strong>) for instant 1-click accounts on all devices.
            </div>
          `;
          errEl.classList.remove('hidden');
        }
        showToast('Account created! Please check your email to verify.');
      }
    } catch (err) {
      if (errEl) {
        errEl.className = 'p-3 rounded-lg bg-rose-950/60 border border-rose-500/50 text-xs text-rose-300 space-y-1.5';
        const msg = err.message || '';
        const code = err.error_code || err.code || '';
        if (code === 'over_email_send_rate_limit' || msg.toLowerCase().includes('rate limit')) {
          errEl.innerHTML = `
            <div class="font-bold text-rose-300 flex items-center gap-1.5">
              <span>⏳</span> Email Rate Limit Reached
            </div>
            <p class="leading-relaxed">Supabase's built-in email service limits verification emails on the free tier.</p>
            <div class="mt-2 p-2 rounded bg-black/40 border border-[#3d494f] text-[11px] text-slate-300">
              <span class="text-[#ff9f1c] font-semibold">👉 10-Second Fix:</span> In your Supabase Dashboard under <strong>Authentication → Providers → Email</strong>, turn OFF <strong>"Confirm email"</strong>. Then you can create accounts and sign in instantly without any email limit!
            </div>
          `;
        } else {
          errEl.textContent = msg || 'Failed to create account';
        }
        errEl.classList.remove('hidden');
      }
    } finally {
      btn.disabled = false;
      btn.innerHTML = origText;
    }
  } else if (action === 'auth-sign-out') {
    await CloudSync.signOut();
    document.getElementById('authModal').classList.add('hidden');
    showToast('Signed out. Switched to offline guest mode.');
  } else if (action === 'auth-upload-local') {
    if (!state.user) return;
    btn.disabled = true;
    btn.textContent = 'Uploading...';
    const res = await CloudSync.push(state.items);
    btn.disabled = false;
    btn.innerHTML = '<span>⬆️</span> Upload Local Entries to Cloud';
    if (res?.error) {
      showToast(`Upload failed: ${res.error.message || 'Database error'}`);
    } else {
      showToast(`Uploaded ${state.items.length} entries to your cloud account!`);
    }
  } else if (action === 'auth-pull-cloud') {
    if (!state.user) return;
    btn.disabled = true;
    btn.textContent = 'Fetching...';
    const remote = await CloudSync.pull();
    btn.disabled = false;
    btn.innerHTML = '<span>⬇️</span> Pull Latest Cloud Library';
    if (remote && Array.isArray(remote)) {
      state.items = remote;
      saveItems(false);
      renderAll();
      showToast(`Fetched ${remote.length} entries from cloud!`);
    } else {
      showToast('No entries found in cloud database');
    }
  } else if (action === 'auth-save-config') {
    const url = document.getElementById('cfgSupabaseUrl')?.value;
    const key = document.getElementById('cfgSupabaseAnonKey')?.value;
    CloudSync.saveCredentials(url, key);
    const notice = document.getElementById('cfgSaveNotice');
    if (notice) {
      notice.classList.remove('hidden');
      setTimeout(() => notice.classList.add('hidden'), 3000);
    }
    renderAuthStatus();
    showToast('Supabase credentials saved!');
  } else if (action === 'copy-sql-schema') {
    navigator.clipboard.writeText(CloudSync.getSqlSchema());
    showToast('SQL schema copied to clipboard!');
  }
});

// ---------------------------------------------------------------------------
// Input Listeners
// ---------------------------------------------------------------------------

const libSearch = document.getElementById('librarySearchInput');
if (libSearch) {
  libSearch.addEventListener('input', (e) => {
    state.search = e.target.value;
    const clearBtn = document.getElementById('clearLibrarySearchBtn');
    if (clearBtn) clearBtn.classList.toggle('hidden', !state.search);
    renderLibrary();
  });
}

const sortSel = document.getElementById('sortSelect');
if (sortSel) {
  sortSel.addEventListener('change', (e) => {
    state.sort = e.target.value;
    renderLibrary();
  });
}

const autoInp = document.getElementById('autoSearchInput');
if (autoInp) {
  autoInp.addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runAutoSearch(e.target.value), 150);
  });
}

const fImg = document.getElementById('fieldImage');
if (fImg) {
  fImg.addEventListener('input', (e) => {
    updateModalPosterPreview(e.target.value);
  });
}

const posterUpload = document.getElementById('posterUploadInput');
if (posterUpload) {
  posterUpload.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      document.getElementById('fieldImage').value = reader.result;
      updateModalPosterPreview(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

const impFile = document.getElementById('importFileInput');
if (impFile) {
  impFile.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    importLibraryJSON(file);
    e.target.value = '';
  });
}

// Genre Search Input with Realtime Auto-detection & Keyboard controls
const genreSearch = document.getElementById('genreSearchInput');
if (genreSearch) {
  genreSearch.addEventListener('input', (e) => {
    handleGenreSearchInput(e.target.value);
  });

  genreSearch.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = e.target.value.trim();
      if (!val) return;

      // Check if there's a visible suggestion in the dropdown
      const drop = document.getElementById('genreSuggestionsDropdown');
      const firstSug = drop?.querySelector('[data-action="pick-genre-suggestion"]');
      if (firstSug && !drop.classList.contains('hidden') && firstSug.dataset.genre.toLowerCase().startsWith(val.toLowerCase())) {
        addGenreToModal(firstSug.dataset.genre);
      } else {
        addGenreToModal(val);
      }
    } else if (e.key === 'Escape') {
      const drop = document.getElementById('genreSuggestionsDropdown');
      if (drop) drop.classList.add('hidden');
    }
  });
}

// Update popular genre tray when category changes in modal
const modalCatSelect = document.getElementById('fieldCategory');
if (modalCatSelect) {
  modalCatSelect.addEventListener('change', (e) => {
    const catVal = e.target.value;
    let mappedCategory = 'all';
    if (catVal.includes('Anime')) mappedCategory = 'anime';
    else if (catVal === 'Movies') mappedCategory = 'movies';
    else if (catVal === 'Games')  mappedCategory = 'games';
    else if (catVal === 'Books')  mappedCategory = 'books';

    const filterBtns = document.querySelectorAll('#genreCategoryFilter button');
    filterBtns.forEach((b) => {
      const isCat = b.dataset.cat === mappedCategory;
      b.className = isCat
        ? 'px-2 py-0.5 rounded text-[10px] font-bold bg-[#ff9f1c] text-[#0d0e11] transition'
        : 'px-2 py-0.5 rounded text-[10px] text-slate-300 hover:text-white bg-[#2c3539] transition';
    });

    renderPopularGenresTray(mappedCategory);
  });
}

// Genre View Search and Sort Listeners
const genreViewSearch = document.getElementById('genreViewSearchInput');
if (genreViewSearch) {
  genreViewSearch.addEventListener('input', (e) => {
    state.genreSearch = e.target.value;
    const clearBtn = document.getElementById('clearGenreSearchBtn');
    if (clearBtn) clearBtn.classList.toggle('hidden', !state.genreSearch);
    renderGenreView();
  });
}

const genreSortSelect = document.getElementById('genreSortSelect');
if (genreSortSelect) {
  genreSortSelect.addEventListener('change', (e) => {
    state.genreSort = e.target.value;
    renderGenreView();
  });
}

// Auth Modal Keyboard and Backdrop Listeners
const authEmailInp = document.getElementById('authEmailInput');
if (authEmailInp) {
  authEmailInp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('authPasswordInput')?.focus();
    }
  });
}

const authPwdInp = document.getElementById('authPasswordInput');
if (authPwdInp) {
  authPwdInp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('authSignInBtn')?.click();
    }
  });
}

const authModalBackdrop = document.getElementById('authModal');
if (authModalBackdrop) {
  authModalBackdrop.addEventListener('click', (e) => {
    if (e.target === authModalBackdrop) {
      authModalBackdrop.classList.add('hidden');
    }
  });
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const authModal = document.getElementById('authModal');
    if (authModal && !authModal.classList.contains('hidden')) {
      authModal.classList.add('hidden');
    }
  }
});

// ---------------------------------------------------------------------------
// App Bootstrap
// ---------------------------------------------------------------------------

loadItems();
renderAll();

if (typeof CloudSync !== 'undefined' && CloudSync.init) {
  CloudSync.init();
}

if (state.items.some((i) => !isBrokenTitle(i.title) && (i.studio === 'Unknown Studio' || !i.synopsis || i.releaseDate === 'TBA'))) {
  enrichMissingMetadata(false);
}
