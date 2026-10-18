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

function showToast(msg, options = {}) {
  const box     = document.getElementById('toastBox');
  const msgEl   = document.getElementById('toastMessage');
  const undoBtn = document.getElementById('toastUndoBtn');
  if (!box) return;

  if (msgEl) msgEl.textContent = msg;
  else box.textContent = msg;

  if (undoBtn) {
    if (options.undoAction && state.undoBuffer) {
      undoBtn.classList.remove('hidden');
    } else {
      undoBtn.classList.add('hidden');
    }
  }

  box.classList.remove('hidden');
  clearTimeout(showToast._t);
  const duration = options.duration || 3200;
  showToast._t = setTimeout(() => box.classList.add('hidden'), duration);
}

function updateGuestBanner() {
  const banner = document.getElementById('guestStorageBanner');
  if (!banner) return;
  const isGuest = !state.user;
  const dismissed = sessionStorage.getItem('omnichart_dismiss_guest_banner') === 'true';
  if (isGuest && !dismissed) {
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
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
  if (mo < 1 || mo > 12 || d < 1) return null;
  const isLeap = (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
  const daysInMonth = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (d > daysInMonth[mo - 1]) return null;
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
    const startDate = new Date(start.year, start.month, start.day);
    const endDate   = new Date(end.year, end.month, end.day);
    if (startDate > endDate) {
      return null;
    }
    if (start.day === end.day && start.month === end.month && start.year === end.year) {
      return { type: 'single', start, end: null };
    }
    return { type: 'range', start, end };
  }
  return null;
}

// ---------------------------------------------------------------------------
// State Defaults & Helpers for Density, Title Language & Sorting (L6, L7, L8, L9, L10)
// ---------------------------------------------------------------------------

state.viewDensity     = localStorage.getItem('omnichart_density') || 'grid';
state.titleLang       = localStorage.getItem('omnichart_title_lang') || 'english';
state.sortKey         = localStorage.getItem('omnichart_sort_key') || 'rating';
state.sortDir         = localStorage.getItem('omnichart_sort_dir') || 'desc';
state.weekStart       = localStorage.getItem('omnichart_week_start') || 'sun';
state.renderLimit     = 36;
state.expandedSynopses = state.expandedSynopses || new Set();

/** Get display title according to English / Romaji toggle (L7) */
function getItemTitle(item) {
  if (!item) return '';
  const lang = state.titleLang || 'english';
  if (lang === 'english' && item.titleEnglish && item.titleEnglish.trim()) {
    return item.titleEnglish.trim();
  }
  if (lang === 'romaji' && item.titleRomaji && item.titleRomaji.trim()) {
    return item.titleRomaji.trim();
  }
  // Instant fallback to canonical bilingual dictionary or LiveChart recovery
  const match = lookupBilingualTitle(item.title) || lookupBilingualTitle(item.id);
  if (match) {
    if (match.english && !item.titleEnglish) item.titleEnglish = match.english;
    if (match.romaji && !item.titleRomaji) item.titleRomaji = match.romaji;
    if (lang === 'english' && match.english) return match.english;
    if (lang === 'romaji' && match.romaji) return match.romaji;
  }
  return item.title || '';
}

/** Normalize release date into a decimal year for accurate chronological sorting (L6) */
function parseReleaseDateValue(str) {
  if (!str || str === 'TBA') return -1;
  const s = String(str).trim().toLowerCase();
  const yearMatch = s.match(/\b(19\d{2}|20\d{2})\b/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : 0;
  if (!year) return -1;
  let fraction = 0.5;
  if (s.includes('winter')) fraction = 0.1;
  else if (s.includes('spring')) fraction = 0.4;
  else if (s.includes('summer')) fraction = 0.7;
  else if (s.includes('fall') || s.includes('autumn')) fraction = 0.9;
  return year + fraction;
}

// ---------------------------------------------------------------------------
// Filtering & Sorting (L8, L9)
// ---------------------------------------------------------------------------

function getFilteredItems() {
  const q = state.search.trim().toLowerCase();
  const filtered = state.items.filter((item) => {
    if (state.category !== 'All' && item.category !== state.category) return false;
    if (state.status !== 'All') {
      if (state.status === 'Favorites') {
        if (!item.favorite) return false;
      } else {
        const itemStatus = normalizeStatus(item.status);
        if (itemStatus !== state.status) return false;
      }
    }
    if (state.scoreFilter !== null && state.scoreFilter !== undefined) {
      const r = Number(item.rating) || 0;
      if (state.scoreFilter === 0) {
        if (r > 0) return false;
      } else {
        if (Math.round(r) !== state.scoreFilter) return false;
      }
    }
    if (q) {
      let eng = item.titleEnglish || '';
      let rom = item.titleRomaji || '';
      if (!eng || !rom) {
        const m = lookupBilingualTitle(item.title) || lookupBilingualTitle(item.id);
        if (m) {
          if (!eng && m.english) eng = m.english;
          if (!rom && m.romaji) rom = m.romaji;
        }
      }
      const hay = `${item.title} ${eng} ${rom} ${item.studio || ''} ${(item.genres || []).join(' ')} ${(item.tags || []).join(' ')} ${item.consumedDate || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const sortKey = state.sortKey || 'rating';
  const sortDir = state.sortDir || 'desc';
  const dir = sortDir === 'asc' ? 1 : -1;

  filtered.sort((a, b) => {
    let diff = 0;
    if (sortKey === 'rating') {
      diff = (Number(a.rating) || 0) - (Number(b.rating) || 0);
    } else if (sortKey === 'updated') {
      diff = (Number(a.updatedAt) || 0) - (Number(b.updatedAt) || 0);
    } else if (sortKey === 'date-added') {
      const timeA = parseInt(String(a.id || '').replace(/\D/g, ''), 10) || Number(a.updatedAt || 0);
      const timeB = parseInt(String(b.id || '').replace(/\D/g, ''), 10) || Number(b.updatedAt || 0);
      diff = timeA - timeB;
    } else if (sortKey === 'release') {
      diff = parseReleaseDateValue(a.releaseDate) - parseReleaseDateValue(b.releaseDate);
    } else if (sortKey === 'title') {
      diff = getItemTitle(a).localeCompare(getItemTitle(b));
    } else if (sortKey === 'progress') {
      diff = (Number(a.progress) || 0) - (Number(b.progress) || 0);
    }

    if (diff !== 0) return diff * dir;

    // Deterministic secondary sort (L8: Recently Updated -> A to Z)
    return (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0) || (a.title || '').localeCompare(b.title || '');
  });

  return filtered;
}

// ---------------------------------------------------------------------------
// Navigation Rendering & Status Tabs
// ---------------------------------------------------------------------------

function renderNavigation() {
  updateGuestBanner();

  const libCount = state.items.length;
  const datedCount = state.items.filter((i) => parseDateOrRange(i.consumedDate)).length;

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
  const genreCount = genreSet.size;

  // Update counts in logo dropdown View Types bar (User Request 1)
  const tomeLibCount   = document.getElementById('tomeNavLibraryCount');
  const tomeCalCount   = document.getElementById('tomeNavCalendarCount');
  const tomeGenreCount = document.getElementById('tomeNavGenreCount');
  if (tomeLibCount)   tomeLibCount.textContent   = libCount;
  if (tomeCalCount)   tomeCalCount.textContent   = datedCount;
  if (tomeGenreCount) tomeGenreCount.textContent = genreCount;

  // View Types active state in logo dropdown
  const tomeNavLib   = document.getElementById('tomeNavLibrary');
  const tomeNavCal   = document.getElementById('tomeNavCalendar');
  const tomeNavGenre = document.getElementById('tomeNavGenre');

  const tomeActiveCls   = 'w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold transition bg-[#ff9f1c]/15 text-[#ff9f1c] border border-[#ff9f1c]/30 shadow-sm';
  const tomeInactiveCls = 'w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold text-slate-200 hover:bg-[#364146] transition';

  if (tomeNavLib)   tomeNavLib.className   = (state.view === 'library')  ? tomeActiveCls : tomeInactiveCls;
  if (tomeNavCal)   tomeNavCal.className   = (state.view === 'calendar') ? tomeActiveCls : tomeInactiveCls;
  if (tomeNavGenre) tomeNavGenre.className = (state.view === 'genre')    ? tomeActiveCls : tomeInactiveCls;

  const tomeNavStats = document.getElementById('tomeNavStats');
  const tomeNavStatsCount = document.getElementById('tomeNavStatsCount');
  if (tomeNavStats) tomeNavStats.className = (state.view === 'stats') ? tomeActiveCls : tomeInactiveCls;
  if (tomeNavStatsCount) {
    const total = state.items.length;
    const completed = state.items.filter(i => normalizeStatus(i.status) === 'Completed').length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    tomeNavStatsCount.textContent = `${pct}%`;
  }

  // Mobile Bottom Navigation active state (N1 Mobile)
  const mNavLib   = document.getElementById('mobileNavLibrary');
  const mNavCal   = document.getElementById('mobileNavCalendar');
  const mNavGenre = document.getElementById('mobileNavGenre');
  const mNavStats = document.getElementById('mobileNavStats');

  if (mNavLib)   mNavLib.className   = `flex flex-col items-center justify-center min-w-[54px] min-h-[44px] gap-0.5 ${state.view === 'library' ? 'text-[#ff9f1c]' : 'text-slate-400 hover:text-white'}`;
  if (mNavCal)   mNavCal.className   = `flex flex-col items-center justify-center min-w-[54px] min-h-[44px] gap-0.5 ${state.view === 'calendar' ? 'text-[#ff9f1c]' : 'text-slate-400 hover:text-white'}`;
  if (mNavGenre) mNavGenre.className = `flex flex-col items-center justify-center min-w-[54px] min-h-[44px] gap-0.5 ${state.view === 'genre' ? 'text-[#ff9f1c]' : 'text-slate-400 hover:text-white'}`;
  if (mNavStats) mNavStats.className = `flex flex-col items-center justify-center min-w-[54px] min-h-[44px] gap-0.5 ${state.view === 'stats' ? 'text-[#ff9f1c]' : 'text-slate-400 hover:text-white'}`;

  // Actions Tab: Category Filters Dropdown (User Requests 2 & 3)
  const curCatLabel = document.getElementById('currentCategoryLabel');
  if (curCatLabel) {
    curCatLabel.textContent = state.category === 'All' ? 'All Categories' : state.category;
  }

  const catFilterList = document.getElementById('categoryFilterList');
  if (catFilterList) {
    const categoryIcons = {
      'All': '✨',
      'Series & Anime': '📺',
      'Movies': '🎬',
      'Games': '🎮',
      'Books': '📖'
    };
    catFilterList.innerHTML = CATEGORIES.map((cat) => {
      const active = state.category === cat;
      const count = cat === 'All'
        ? state.items.length
        : state.items.filter((i) => i.category === cat).length;
      const icon = categoryIcons[cat] || '📁';
      return `
        <button
          type="button"
          data-action="set-category"
          data-category="${esc(cat)}"
          class="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition ${
            active
              ? 'bg-[#ff9f1c] text-[#0d0e11] font-bold shadow-sm'
              : 'text-slate-200 hover:bg-[#364146] font-medium'
          }"
        >
          <span class="flex items-center gap-2">
            <span>${icon}</span>
            <span>${esc(cat)}</span>
          </span>
          <span class="text-[10px] px-1.5 py-0.2 rounded font-mono ${
            active ? 'bg-[#0d0e11]/20 text-[#0d0e11] font-bold' : 'bg-[#0d0e11] text-slate-400'
          }">${count}</span>
        </button>
      `;
    }).join('');
  }

  const statusTabs = document.getElementById('statusTabs');
  if (statusTabs) {
    const tabsHtml = STATUSES.map((st) => {
      const count = state.items.filter((i) => {
        if (state.category !== 'All' && i.category !== state.category) return false;
        const itemStatus = normalizeStatus(i.status);
        return st === 'All' ? true : itemStatus === st;
      }).length;
      const active = state.status === st;
      const isZero = count === 0 && st !== 'All' && !active;
      return `<button
        data-action="set-status"
        data-status="${esc(st)}"
        class="px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap flex items-center gap-1.5 transition ${
          active
            ? 'bg-[#ff9f1c] text-[#0d0e11] font-bold shadow-sm'
            : isZero
              ? 'bg-[#0d0e11]/50 text-slate-500 border border-[#3d494f]/40 opacity-40 hover:opacity-80'
              : 'bg-[#0d0e11] text-slate-300 hover:text-white border border-[#3d494f]'
        }"
      >
        <span>${esc(st)}</span>
        <span class="text-[10px] px-1.5 py-0.2 rounded ${active ? 'bg-[#0d0e11]/20 text-[#0d0e11]' : isZero ? 'bg-[#0d0e11] text-slate-600' : 'bg-[#2c3539] text-slate-400'}">${count}</span>
      </button>`;
    }).join('');

    const favCount = state.items.filter((i) => {
      if (state.category !== 'All' && i.category !== state.category) return false;
      return Boolean(i.favorite);
    }).length;
    const isFavActive = state.status === 'Favorites';
    const favZero = favCount === 0 && !isFavActive;

    const favTabHtml = `
      <button
        data-action="set-status"
        data-status="Favorites"
        class="px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition ${
          isFavActive
            ? 'bg-amber-400 text-[#0d0e11] font-bold shadow-sm'
            : favZero
              ? 'bg-[#0d0e11]/50 text-amber-500/50 border border-amber-500/20 opacity-40 hover:opacity-80'
              : 'bg-[#0d0e11] text-amber-300 hover:text-amber-200 border border-amber-500/30'
        }"
      >
        <span>★ Favorites</span>
        <span class="text-[10px] px-1.5 py-0.2 rounded ${
          isFavActive ? 'bg-[#0d0e11]/20 text-[#0d0e11]' : favZero ? 'bg-[#0d0e11] text-slate-600' : 'bg-[#2c3539] text-amber-300'
        }">${favCount}</span>
      </button>
    `;

    statusTabs.innerHTML = tabsHtml + favTabHtml;
  }

  // Update Toolbar Toggles (L7, L9, L10)
  const langBadge = document.getElementById('titleLangBadge');
  const langText  = document.getElementById('titleLangText');
  if (langBadge) langBadge.textContent = state.titleLang === 'romaji' ? 'JA' : 'EN';
  if (langText)  langText.textContent  = state.titleLang === 'romaji' ? 'Romaji' : 'English';
  const menuLangBadge = document.getElementById('menuTitleLangBadge');
  if (menuLangBadge) menuLangBadge.textContent = state.titleLang === 'romaji' ? 'Romaji' : 'English';

  const gridBtn = document.getElementById('densityGridBtn');
  const listBtn = document.getElementById('densityListBtn');
  if (gridBtn && listBtn) {
    if (state.viewDensity === 'list') {
      listBtn.className = 'px-1.5 py-1 rounded bg-[#2c3539] text-[#ff9f1c] text-xs transition';
      gridBtn.className = 'px-1.5 py-1 rounded text-slate-400 hover:text-white text-xs transition';
    } else {
      gridBtn.className = 'px-1.5 py-1 rounded bg-[#2c3539] text-[#ff9f1c] text-xs transition';
      listBtn.className = 'px-1.5 py-1 rounded text-slate-400 hover:text-white text-xs transition';
    }
  }

  const sortSel = document.getElementById('sortSelect');
  if (sortSel && sortSel.value !== state.sortKey) {
    sortSel.value = state.sortKey || 'rating';
  }

  const dirArrow = document.getElementById('sortDirArrow');
  if (dirArrow) {
    dirArrow.textContent = state.sortDir === 'asc' ? '↑' : '↓';
  }

  const bulkToolbar = document.getElementById('bulkToolbar');
  if (bulkToolbar) {
    if (state.bulkMode) {
      bulkToolbar.classList.remove('hidden');
      const countEl = document.getElementById('bulkSelectedCount');
      if (countEl) countEl.textContent = `${state.selectedIds.size} selected`;
    } else {
      bulkToolbar.classList.add('hidden');
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
// Cloud Sync & Multi-User Authentication Engine (N4, S5, W3)
// ---------------------------------------------------------------------------

function renderAuthStatus() {
  const iconEl  = document.getElementById('authBtnIcon');
  const labelEl = document.getElementById('authBtnLabel');
  const btnEl   = document.getElementById('authBtn');
  const badgeEl = document.getElementById('menuCloudBadge');

  if (state.user) {
    let displayName = 'User';
    if (state.user.user_metadata?.full_name) {
      displayName = state.user.user_metadata.full_name;
    } else if (state.user.user_metadata?.name) {
      displayName = state.user.user_metadata.name;
    } else if (state.user.email) {
      const prefix = state.user.email.split('@')[0];
      displayName = prefix.charAt(0).toUpperCase() + prefix.slice(1);
    }

    const monogram = (displayName.slice(0, 2) || 'US').toUpperCase();
    let statusTooltip = 'Synced';
    let dotClass = 'bg-emerald-400';

    if (state.cloudStatus === 'syncing') {
      statusTooltip = 'Syncing...';
      dotClass = 'bg-amber-400 animate-pulse';
    } else if (state.cloudStatus === 'offline') {
      statusTooltip = 'Offline (changes saved locally)';
      dotClass = 'bg-slate-400';
    } else if (state.cloudStatus === 'error') {
      statusTooltip = 'Sync error (click to retry)';
      dotClass = 'bg-rose-500';
    }

    if (iconEl) {
      iconEl.innerHTML = `
        <span class="relative flex items-center justify-center w-5 h-5 rounded-full bg-[#ff9f1c] text-[#0d0e11] font-bold text-[10px]">
          <span title="${statusTooltip}" class="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ${dotClass} ring-1 ring-[#0d0e11]"></span>
          ${esc(monogram)}
        </span>
      `;
    }
    if (labelEl) labelEl.textContent = displayName;
    if (btnEl)   btnEl.title = `Signed in as ${displayName} (${statusTooltip})`;
    if (badgeEl) {
      badgeEl.textContent = statusTooltip;
      badgeEl.className   = `text-[10px] uppercase px-1.5 py-0.5 rounded font-bold ${
        state.cloudStatus === 'syncing'
          ? 'bg-amber-500/20 text-amber-300'
          : state.cloudStatus === 'offline'
            ? 'bg-slate-500/20 text-slate-300'
            : state.cloudStatus === 'error'
              ? 'bg-rose-500/20 text-rose-300'
              : 'bg-emerald-500/20 text-emerald-400'
      }`;
    }
  } else {
    if (iconEl)  iconEl.textContent  = '☁️';
    if (labelEl) labelEl.textContent = 'Sync';
    if (btnEl)   btnEl.title         = 'Local only (this device) - Click to sign in and sync';
    if (badgeEl) {
      badgeEl.textContent = 'Local only';
      badgeEl.className   = 'text-[10px] uppercase px-1.5 py-0.5 rounded bg-[#0d0e11] text-slate-400 font-bold';
    }
  }
}

function openAuthModal(activeTab = 'account') {
  const modal = document.getElementById('authModal');
  if (!modal) return;
  modal.classList.remove('hidden');

  const loggedInView       = document.getElementById('authLoggedInView');
  const loggedOutView      = document.getElementById('authLoggedOutView');
  const forgotPasswordView = document.getElementById('authForgotPasswordView');
  const resetPasswordView  = document.getElementById('authResetPasswordView');
  const errEl              = document.getElementById('authErrorMessage');
  if (errEl) errEl.classList.add('hidden');

  const resetSuccess = document.getElementById('authResetSuccessMessage');
  if (resetSuccess) resetSuccess.classList.add('hidden');
  const resetErr = document.getElementById('authResetErrorMessage');
  if (resetErr) resetErr.classList.add('hidden');
  const newPassErr = document.getElementById('authNewPasswordErrorMessage');
  if (newPassErr) newPassErr.classList.add('hidden');

  if (activeTab === 'forgot-password') {
    if (loggedInView)       loggedInView.classList.add('hidden');
    if (loggedOutView)      loggedOutView.classList.add('hidden');
    if (resetPasswordView)  resetPasswordView.classList.add('hidden');
    if (forgotPasswordView) forgotPasswordView.classList.remove('hidden');
    const mainEmail = document.getElementById('authEmailInput');
    const resetEmail = document.getElementById('authResetEmailInput');
    if (resetEmail) {
      if (mainEmail && mainEmail.value) {
        resetEmail.value = mainEmail.value.trim();
      }
      setTimeout(() => resetEmail.focus(), 60);
    }
  } else if (activeTab === 'reset-password') {
    if (loggedInView)       loggedInView.classList.add('hidden');
    if (loggedOutView)      loggedOutView.classList.add('hidden');
    if (forgotPasswordView) forgotPasswordView.classList.add('hidden');
    if (resetPasswordView)  resetPasswordView.classList.remove('hidden');
    const newPwd = document.getElementById('authNewPasswordInput');
    const confPwd = document.getElementById('authConfirmPasswordInput');
    if (newPwd) newPwd.value = '';
    if (confPwd) confPwd.value = '';
    if (newPwd) setTimeout(() => newPwd.focus(), 60);
  } else {
    // Normal account view
    if (forgotPasswordView) forgotPasswordView.classList.add('hidden');
    if (resetPasswordView)  resetPasswordView.classList.add('hidden');
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
  }
}
window.openAuthModal = openAuthModal;

// ---------------------------------------------------------------------------
// Library Card Grid (With Interactive Popped-Out Genre Badges)
// ---------------------------------------------------------------------------

function renderLibrary() {
  const grid  = document.getElementById('mediaGrid');
  if (!grid) return;
  const items = getFilteredItems();

  if (state.items.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full bg-[#2c3539] border border-[#3d494f] rounded-2xl p-8 sm:p-12 text-center max-w-xl mx-auto space-y-4 shadow-xl">
        <div class="w-16 h-16 rounded-2xl bg-[#ff9f1c]/15 text-[#ff9f1c] border border-[#ff9f1c]/30 flex items-center justify-center text-3xl mx-auto shadow-inner">
          ✦
        </div>
        <div class="space-y-1.5">
          <h2 class="text-xl sm:text-2xl font-extrabold text-white tracking-tight">Welcome to OmniChart</h2>
          <p class="text-sm text-slate-300 font-medium">Track anime, shows, movies, games, and books all in one place.</p>
          <p class="text-xs text-slate-400">Keep track of your watch history, calendar dates, reviews, ratings, and genre tags.</p>
        </div>
        <div class="flex flex-wrap items-center justify-center gap-3 pt-2">
          <button data-action="open-add-modal" class="px-5 py-2.5 rounded-xl bg-[#ff9f1c] hover:bg-[#ffb144] text-[#0d0e11] font-bold text-xs transition shadow-lg flex items-center gap-2">
            <span>+</span> Add your first title
          </button>
          <label class="px-4 py-2.5 rounded-xl bg-[#0d0e11] hover:bg-[#364146] border border-[#3d494f] text-slate-200 text-xs font-semibold cursor-pointer transition flex items-center gap-2">
            <span>📂</span> Import Library / MAL / AniList
            <input id="onboardingImportInput" type="file" accept=".json,.xml,application/json,text/xml,application/xml" class="hidden" />
          </label>
        </div>
      </div>
    `;
    const onboardInp = document.getElementById('onboardingImportInput');
    if (onboardInp) {
      onboardInp.addEventListener('change', (e) => {
        if (e.target.files?.[0]) importLibraryJSON(e.target.files[0]);
      });
    }
    return;
  }

  if (items.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full bg-[#2c3539] border border-[#3d494f] rounded-2xl p-8 text-center space-y-3">
        <div class="text-base font-bold text-white">No titles match your current search or filters</div>
        <p class="text-xs text-slate-400">Try clearing your search query or switching category / status filter.</p>
        <button data-action="clear-library-search" class="px-4 py-2 rounded-lg bg-[#0d0e11] hover:bg-[#364146] border border-[#3d494f] text-slate-200 font-semibold text-xs transition">
          Clear Search Filter
        </button>
      </div>
    `;
    return;
  }

  const isOwner = OwnerMode.isOwner();
  const visibleItems = items.slice(0, state.renderLimit);
  const hasMore = items.length > state.renderLimit;

  // Density Mode: List View (L10)
  if (state.viewDensity === 'list') {
    grid.className = 'flex flex-col gap-2.5';
    grid.innerHTML = visibleItems.map((item) => {
      const rating        = Number(item.rating || 0);
      const isMasterpiece = rating >= 9;
      const progress      = Number(item.progress || 0);
      const total         = Math.max(1, Number(item.totalUnits || 1));
      const pct           = Math.min(100, Math.round((progress / total) * 100));
      const isSelected    = state.selectedIds.has(item.id);
      const posterSrc     = item.image || makeFallbackPoster(item.title);
      const displayStatus = normalizeStatus(item.status);
      const displayTitle  = getItemTitle(item);
      const cleanStudio   = Array.from(new Set((item.studio || 'Unknown Studio').split(',').map((s) => s.trim()).filter(Boolean))).join(', ') || 'Unknown Studio';

      let statusBadgeClass = 'bg-[#0d0e11] text-slate-300 border border-[#3d494f]';
      if (displayStatus === 'Ongoing')        statusBadgeClass = 'bg-amber-500/15 text-amber-300 border border-amber-500/30';
      else if (displayStatus === 'Completed') statusBadgeClass = 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30';
      else if (displayStatus === 'Planning')  statusBadgeClass = 'bg-sky-500/15 text-sky-300 border border-sky-500/30';
      else if (displayStatus === 'On Hold')   statusBadgeClass = 'bg-purple-500/15 text-purple-300 border border-purple-500/30';
      else if (displayStatus === 'Dropped')   statusBadgeClass = 'bg-rose-500/15 text-rose-300 border border-rose-500/30';

      return `
        <article
          data-card-id="${esc(item.id)}"
          data-action="${state.bulkMode ? 'toggle-select-card' : ''}"
          class="group relative bg-[#2c3539] hover:bg-[#323d42] rounded-xl border ${
            state.bulkMode && isSelected
              ? 'border-rose-500 ring-2 ring-rose-500/30'
              : 'border-[#3d494f] hover:border-[#ff9f1c]/50'
          } p-2.5 sm:p-3 flex items-center justify-between gap-3 transition"
        >
          <div class="flex items-center gap-3 min-w-0 flex-1">
            ${state.bulkMode ? `
              <input type="checkbox" ${isSelected ? 'checked' : ''} class="w-4 h-4 accent-rose-500 pointer-events-none shrink-0" />
            ` : ''}
            <img
              src="${esc(posterSrc)}"
              alt="${esc(item.title)}"
              data-fallback-title="${esc(item.title)}"
              class="poster-img w-10 h-14 object-cover rounded-lg bg-[#0d0e11] shrink-0 border border-[#3d494f]"
              loading="lazy"
              referrerpolicy="no-referrer"
            />
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  data-action="toggle-favorite"
                  data-id="${esc(item.id)}"
                  title="${item.favorite ? 'Remove from favorites' : 'Mark as favorite'}"
                  class="text-sm transition hover:scale-110 shrink-0 ${item.favorite ? 'text-amber-400' : 'text-slate-500 hover:text-amber-400'}"
                >
                  ${item.favorite ? '★' : '☆'}
                </button>
                <h4
                  class="font-bold text-sm text-white truncate cursor-pointer hover:text-[#ff9f1c] transition"
                  data-action="${isOwner ? 'edit-item' : 'view-item'}"
                  data-id="${esc(item.id)}"
                  title="${esc(displayTitle)}"
                >
                  ${esc(displayTitle)}
                </h4>
                <span class="text-[10px] px-2 py-0.2 rounded-full font-bold shrink-0 ${statusBadgeClass}">${esc(displayStatus)}</span>
              </div>
              <div class="flex items-center gap-2 text-xs text-slate-400 mt-1 flex-wrap">
                <span class="text-slate-300">${esc(item.category)}</span>
                <span>•</span>
                <span class="truncate">${esc(cleanStudio)}</span>
                ${item.releaseDate && item.releaseDate !== 'TBA' ? `<span>•</span><span>${esc(item.releaseDate)}</span>` : ''}
                ${item.consumedDate ? `<span>•</span><span class="text-[#ff9f1c]">📅 ${esc(item.consumedDate)}</span>` : ''}
                ${(Array.isArray(item.tags) && item.tags.length > 0) ? `
                  <span>•</span>
                  ${item.tags.map(t => `<button type="button" data-action="filter-by-tag" data-tag="${esc(t)}" class="text-[10px] px-1.5 py-0.2 rounded bg-amber-400/10 hover:bg-amber-400/20 text-amber-300 border border-amber-400/25 transition">#${esc(t)}</button>`).join(' ')}
                ` : ''}
              </div>
            </div>
          </div>

          <div class="flex items-center gap-3 sm:gap-4 shrink-0">
            <!-- Progress Bar & +/- -->
            <div class="flex items-center gap-2">
              <div class="hidden md:block w-20 h-1.5 rounded-full bg-[#0d0e11] overflow-hidden">
                <div class="h-full bg-[#ff9f1c]" style="width:${pct}%"></div>
              </div>
              <div class="flex items-center gap-1">
                ${isOwner ? `
                  <button data-action="step-progress" data-id="${esc(item.id)}" data-delta="-1" aria-label="Decrease progress by 1" class="w-7 h-7 sm:w-6 sm:h-6 rounded bg-[#0d0e11] hover:bg-[#364146] border border-[#3d494f] text-slate-300 font-bold leading-none text-xs flex items-center justify-center transition">−</button>
                ` : ''}
                <span class="font-mono text-xs text-slate-200 px-1 min-w-[50px] text-center">${progress}/${total}</span>
                ${isOwner ? `
                  <button data-action="step-progress" data-id="${esc(item.id)}" data-delta="1" aria-label="Increase progress by 1" class="w-7 h-7 sm:w-6 sm:h-6 rounded bg-[#0d0e11] hover:bg-[#364146] border border-[#3d494f] text-slate-300 font-bold leading-none text-xs flex items-center justify-center transition">+</button>
                ` : ''}
              </div>
            </div>

            <!-- Rating (W4) -->
            <div class="w-16 text-right">
              ${rating > 0 ? `
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-extrabold ${
                  isMasterpiece ? 'bg-[#ff9f1c] text-[#0d0e11]' : 'bg-[#0d0e11] text-[#ff9f1c] border border-[#ff9f1c]/40'
                }">
                  <span>★</span>
                  <span>${rating.toFixed(1).replace(/\.0$/, '')}</span>
                </span>
              ` : `
                <span class="inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-[11px] text-slate-500 border border-[#3d494f]">
                  <span>☆</span>
                  <span>Unrated</span>
                </span>
              `}
            </div>

            ${(!state.bulkMode && isOwner) ? `
              <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                <button data-action="edit-item" data-id="${esc(item.id)}" title="Edit" class="p-1 rounded bg-[#0d0e11] hover:bg-[#364146] text-slate-300 text-xs">✎</button>
                <button data-action="delete-item" data-id="${esc(item.id)}" title="Delete" class="p-1 rounded bg-[#0d0e11] hover:bg-rose-600 text-slate-300 text-xs">✕</button>
              </div>
            ` : ''}
          </div>
        </article>
      `;
    }).join('');
  } else {
    // Density Mode: Visual Cards Grid View
    grid.className = 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4';
    grid.innerHTML = visibleItems.map((item) => {
      const rating        = Number(item.rating || 0);
      const isMasterpiece = rating >= 9;
      const progress      = Number(item.progress || 0);
      const total         = Math.max(1, Number(item.totalUnits || 1));
      const pct           = Math.min(100, Math.round((progress / total) * 100));
      const hasNotes      = Boolean(item.notes && item.notes.trim());
      let   activeTab     = state.cardTab[item.id] || (hasNotes ? 'notes' : 'synopsis');
      if (!hasNotes && activeTab === 'notes') activeTab = 'synopsis';

      const bodyText      = activeTab === 'notes'
        ? (item.notes || 'No review notes added yet.')
        : (item.synopsis || 'No synopsis available.');
      const isSelected    = state.selectedIds.has(item.id);
      const posterSrc     = item.image || makeFallbackPoster(item.title);
      const displayStatus = normalizeStatus(item.status);
      const displayTitle  = getItemTitle(item);
      const cleanStudio   = Array.from(new Set((item.studio || 'Unknown Studio').split(',').map((s) => s.trim()).filter(Boolean))).join(', ') || 'Unknown Studio';
      const isExpanded    = state.expandedSynopses?.has(item.id);
      const needsToggle   = (bodyText || '').length > 160;

      // Genre pills with +N overflow badge (L2)
      const genres = Array.isArray(item.genres) ? item.genres : [];
      const maxShown = 3;
      const shownGenres = genres.slice(0, maxShown);
      const remainingCount = genres.length - maxShown;

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
                <h3 class="font-bold text-sm text-white truncate" title="${esc(displayTitle)}">${esc(displayTitle)}</h3>
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
                ${(Array.isArray(item.tags) && item.tags.length > 0) ? `
                  <div class="flex items-center gap-1 mt-1 flex-wrap">
                    ${item.tags.map(t => `<button type="button" data-action="filter-by-tag" data-tag="${esc(t)}" class="text-[10px] px-1.5 py-0.2 rounded bg-amber-400/10 hover:bg-amber-400/20 text-amber-300 border border-amber-400/25 transition">#${esc(t)}</button>`).join('')}
                  </div>
                ` : ''}
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

          <!-- Studio & Popped-Out Genres Ribbon (L2, L3) -->
          <div class="px-3.5 py-1.5 bg-[#0d0e11]/50 border-b border-[#3d494f] flex items-center justify-between gap-2 text-[11px]">
            <span class="font-semibold text-slate-300 truncate text-xs" title="${esc(cleanStudio)}">${esc(cleanStudio)}</span>
            <div class="flex items-center gap-1 shrink-0 flex-wrap">
              ${shownGenres.map((g) => `
                <button
                  type="button"
                  data-action="filter-by-genre"
                  data-genre="${esc(g)}"
                  title="Filter library by ${esc(g)}"
                  class="px-2 py-0.5 rounded-full bg-[#ff9f1c]/15 text-[#ff9f1c] hover:bg-[#ff9f1c] hover:text-[#0d0e11] border border-[#ff9f1c]/40 font-bold text-[10px] tracking-wide whitespace-nowrap transition shadow-sm"
                >${esc(g)}</button>
              `).join('')}
              ${remainingCount > 0 ? `
                <span
                  class="px-1.5 py-0.5 rounded-full bg-[#0d0e11] text-[#ff9f1c] border border-[#3d494f] text-[10px] font-bold tracking-wide"
                  title="${esc(genres.slice(maxShown).join(', '))}"
                >+${remainingCount}</span>
              ` : ''}
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
                loading="lazy"
                referrerpolicy="no-referrer"
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
              <button
                type="button"
                data-action="toggle-favorite"
                data-id="${esc(item.id)}"
                title="${item.favorite ? 'Remove from favorites' : 'Mark as favorite'}"
                class="absolute top-2 right-2 w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold shadow-md transition ${
                  item.favorite
                    ? 'bg-amber-400 text-[#0d0e11]'
                    : 'bg-[#0d0e11]/80 text-slate-400 hover:text-amber-300 hover:bg-[#0d0e11]'
                }"
              >
                <span>${item.favorite ? '★' : '☆'}</span>
              </button>
            </div>

            <div class="flex-1 flex flex-col justify-between p-3 min-w-0">
              <div class="space-y-1.5">
                <!-- Clean Review/Synopsis Tab Header (L5) -->
                <div class="flex items-center justify-between border-b border-[#3d494f]/70 pb-1">
                  <div class="flex items-center gap-1">
                    ${hasNotes ? `
                      <button
                        data-action="switch-card-tab"
                        data-id="${esc(item.id)}"
                        data-tab="notes"
                        class="text-[11px] font-semibold px-2 py-0.5 rounded ${
                          activeTab === 'notes' ? 'bg-[#0d0e11] text-[#ff9f1c]' : 'text-slate-400 hover:text-white'
                        }"
                      >Review</button>
                    ` : ''}
                    <button
                      data-action="switch-card-tab"
                      data-id="${esc(item.id)}"
                      data-tab="synopsis"
                      class="text-[11px] font-semibold px-2 py-0.5 rounded ${
                        activeTab === 'synopsis' ? 'bg-[#0d0e11] text-[#ff9f1c]' : 'text-slate-400 hover:text-white'
                      }"
                    >Synopsis</button>
                  </div>
                  ${(!hasNotes && isOwner) ? `
                    <button
                      type="button"
                      data-action="edit-item-focus-review"
                      data-id="${esc(item.id)}"
                      class="text-[10px] text-slate-400 hover:text-[#ff9f1c] transition flex items-center gap-1"
                      title="Add your review"
                    >
                      <span>+ Review</span>
                    </button>
                  ` : ''}
                </div>

                <!-- Synopsis Text without tiny scrollbar, clean line clamping & toggle (L4) -->
                <div>
                  <p class="text-xs text-slate-300 leading-relaxed ${isExpanded ? '' : 'line-clamp-3'}">
                    ${esc(bodyText)}
                  </p>
                  ${needsToggle ? `
                    <button
                      type="button"
                      data-action="toggle-card-synopsis"
                      data-id="${esc(item.id)}"
                      class="text-[10px] text-[#ff9f1c] hover:underline font-bold mt-1 inline-block"
                    >${isExpanded ? '▲ Show less' : '▼ Read more'}</button>
                  ` : ''}
                </div>
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
                        aria-label="Decrease progress by 1"
                        class="w-7 h-7 sm:w-6 sm:h-6 rounded bg-[#0d0e11] hover:bg-[#364146] border border-[#3d494f] text-slate-200 font-bold flex items-center justify-center transition"
                      >\u2212</button>
                    ` : ''}
                    <span class="text-[11px] font-mono px-1.5 text-slate-200">${progress}/${total} ${esc(item.unitName || 'eps')}</span>
                    ${isOwner ? `
                      <button
                        data-action="step-progress"
                        data-id="${esc(item.id)}"
                        data-delta="1"
                        aria-label="Increase progress by 1"
                        class="w-7 h-7 sm:w-6 sm:h-6 rounded bg-[#0d0e11] hover:bg-[#364146] border border-[#3d494f] text-slate-200 font-bold flex items-center justify-center transition"
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
  }

  // Pagination / Load More Bar (L10: Handles 400+ titles smoothly)
  if (hasMore) {
    const moreEl = document.createElement('div');
    moreEl.className = 'col-span-full py-4 text-center space-y-2';
    moreEl.innerHTML = `
      <div class="text-xs text-slate-400">
        Showing <strong>${visibleItems.length}</strong> of <strong>${items.length}</strong> titles
      </div>
      <div class="flex items-center justify-center gap-2">
        <button
          type="button"
          data-action="load-more-items"
          class="px-4 py-2 rounded-xl bg-[#2c3539] hover:bg-[#364146] text-[#ff9f1c] font-bold text-xs border border-[#3d494f] hover:border-[#ff9f1c] transition shadow"
        >
          Show More (+36)
        </button>
        <button
          type="button"
          data-action="load-all-items"
          class="px-4 py-2 rounded-xl bg-[#0d0e11] hover:bg-[#2c3539] text-slate-300 font-semibold text-xs border border-[#3d494f] transition"
        >
          Show All (${items.length})
        </button>
      </div>
    `;
    grid.appendChild(moreEl);
  }

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

  // Monthly summary stats (C1 & Feature 4)
  const currentMonthPrefix = `${state.calYear}-${state.calMonth}-`;
  let monthEventCount = 0;
  const monthItemsSet = new Set();
  for (const [key, evList] of eventsByKey.entries()) {
    if (key.startsWith(currentMonthPrefix)) {
      monthEventCount += evList.length;
      for (const ev of evList) monthItemsSet.add(ev.item.id);
    }
  }
  const summaryEl = document.getElementById('calendarMonthSummary');
  if (summaryEl) {
    summaryEl.textContent = monthEventCount > 0
      ? `${monthItemsSet.size} ${monthItemsSet.size === 1 ? 'title' : 'titles'} logged (${monthEventCount} milestones) in ${monthNames[state.calMonth]}`
      : `No logged milestones in ${monthNames[state.calMonth]}`;
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
                ? 'bg-[#ff9f1c] text-[#0d0e11] font-bold shadow'
                : 'bg-[#2c3539] text-slate-300 hover:text-white border border-[#3d494f]'
            }"
          >${esc(label)}</button>`;
        }).join('');
    } else {
      jumpBar.innerHTML = `<span class="text-xs text-slate-400">Add dates or ranges to your library entries to visualize them here on the calendar.</span>`;
    }
  }

  // Quick Missing Dates Logger Tray (Feature 4)
  const quickTray = document.getElementById('calendarQuickDateTray');
  if (quickTray) {
    const isOwner = OwnerMode.isOwner();
    const undatedCompleted = state.items.filter((i) => {
      const st = normalizeStatus(i.status);
      return st === 'Completed' && (!i.consumedDate || !i.consumedDate.trim());
    });

    if (undatedCompleted.length > 0 && isOwner) {
      quickTray.classList.remove('hidden');
      const isExpanded = Boolean(state.showUndatedTray);
      quickTray.innerHTML = `
        <div class="bg-[#2c3539] border border-amber-500/30 rounded-xl p-3 sm:p-4 space-y-3 shadow-md">
          <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div class="flex items-center gap-2.5">
              <span class="text-xl">📌</span>
              <div>
                <div class="text-xs font-bold text-white">
                  <span class="text-amber-400 font-extrabold">${undatedCompleted.length}</span> completed ${undatedCompleted.length === 1 ? 'title is' : 'titles are'} missing calendar dates
                </div>
                <p class="text-[11px] text-slate-400">Log finish dates so they appear on your monthly calendar timeline</p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <button
                type="button"
                data-action="toggle-undated-tray"
                class="px-3 py-1.5 rounded-lg bg-[#0d0e11] hover:bg-[#364146] text-amber-300 border border-amber-500/30 text-xs font-bold transition flex items-center gap-1.5"
              >
                <span>${isExpanded ? '▲ Hide Undated Titles' : '▼ Quick Assign Dates'}</span>
                <span class="text-[10px] px-1.5 py-0.2 rounded bg-amber-400/20 text-amber-300 font-mono">${undatedCompleted.length}</span>
              </button>
            </div>
          </div>

          ${isExpanded ? `
            <div class="border-t border-[#3d494f] pt-3 max-h-60 overflow-y-auto space-y-2 no-scrollbar">
              ${undatedCompleted.slice(0, 15).map(item => `
                <div class="flex items-center justify-between p-2 rounded-lg bg-[#0d0e11] border border-[#3d494f] gap-2">
                  <div class="flex items-center gap-2.5 min-w-0 flex-1">
                    <img src="${esc(item.image || makeFallbackPoster(item.title))}" class="w-7 h-10 object-cover rounded bg-[#2c3539] shrink-0" />
                    <div class="min-w-0 flex-1">
                      <div class="text-xs font-bold text-white truncate">${esc(getItemTitle(item))}</div>
                      <div class="text-[10px] text-slate-400 truncate">${esc(item.category)} • ${esc(item.studio || 'Studio')}</div>
                    </div>
                  </div>
                  <div class="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      data-action="set-item-finished-today"
                      data-id="${esc(item.id)}"
                      class="px-2.5 py-1 rounded bg-amber-400 hover:bg-amber-300 text-[#0d0e11] text-[11px] font-bold transition shadow-sm"
                      title="Set finish date to today"
                    >
                      ⚡ Finished Today
                    </button>
                    <button
                      type="button"
                      data-action="edit-item"
                      data-id="${esc(item.id)}"
                      class="px-2 py-1 rounded bg-[#2c3539] hover:bg-[#364146] text-slate-200 text-[11px] font-medium border border-[#3d494f] transition"
                      title="Pick specific date"
                    >
                      ✎ Pick Date
                    </button>
                  </div>
                </div>
              `).join('')}
              ${undatedCompleted.length > 15 ? `
                <div class="text-[11px] text-slate-400 text-center py-1">
                  ...and ${undatedCompleted.length - 15} more undated completed titles
                </div>
              ` : ''}
            </div>
          ` : ''}
        </div>
      `;
    } else {
      quickTray.classList.add('hidden');
      quickTray.innerHTML = '';
    }
  }

  // Week Start Setting (C5: Sunday vs. Monday)
  const weekStart = state.weekStart || 'sun';
  const labelStart = document.getElementById('calWeekStartLabel');
  if (labelStart) labelStart.textContent = weekStart === 'mon' ? 'Mon' : 'Sun';

  // Dynamic Day of Week Headers (C5)
  const dayHeadersEl = document.getElementById('calendarDayHeaders');
  if (dayHeadersEl) {
    const dayNames = weekStart === 'mon'
      ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
      : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayHeadersEl.innerHTML = dayNames.map((d) => `<div>${d}</div>`).join('');
  }

  let firstDayWeek = new Date(state.calYear, state.calMonth, 1).getDay();
  if (weekStart === 'mon') {
    firstDayWeek = (firstDayWeek + 6) % 7;
  }

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
      <div class="min-h-[115px] rounded-xl bg-[#2c3539] border ${isToday ? 'border-2 border-amber-400 shadow-[0_0_15px_rgba(255,159,28,0.25)] ring-1 ring-amber-400/40' : 'border-[#3d494f]'} p-2 flex flex-col justify-between">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold ${isToday ? 'px-2 py-0.5 rounded bg-amber-400 text-[#0d0e11] font-extrabold shadow' : 'text-slate-300'}">${d}</span>
          ${isOwner ? `
            <button
              data-action="add-on-date"
              data-date="${dateStr}"
              title="Add Media on ${dateStr}"
              class="w-7 h-7 sm:w-6 sm:h-6 rounded-lg bg-[#0d0e11] hover:bg-[#ff9f1c] text-white hover:text-[#0d0e11] text-xs font-extrabold flex items-center justify-center border border-[#3d494f] hover:border-[#ff9f1c] transition shadow-sm"
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
            const badgeLabel = badge === 'DAY' ? 'Day' : badge === 'START' ? 'Start' : 'End';
            const itemTitle = getItemTitle(item);
            return `
              <button
                data-action="edit-item"
                data-id="${esc(item.id)}"
                class="w-full text-left p-1 rounded bg-[#0d0e11] hover:bg-[#364146] border border-[#3d494f] flex items-center gap-1.5 text-[11px]"
              >
                <span class="px-1 rounded text-[9px] font-extrabold ${badgeCls}">${badgeLabel}</span>
                <span class="truncate text-slate-100 font-medium">${esc(itemTitle)}</span>
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
        const title = getItemTitle(item);
        return (title || '').toLowerCase().includes(q) ||
               (item.title || '').toLowerCase().includes(q) ||
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
    const completedCount = entry.items.filter((i) => normalizeStatus(i.status) === 'Completed').length;
    entry.avgRating = avgRating;
    entry.completedCount = completedCount;

    // Sort items inside this genre: rating descending, then title ascending (L7)
    entry.items.sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0) || (getItemTitle(a) || '').localeCompare(getItemTitle(b) || ''));
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

  // Empty State (G6)
  if (genreEntries.length === 0) {
    const isLibraryEmpty = state.items.length === 0;
    grid.innerHTML = `
      <div class="bg-[#2c3539] border border-[#3d494f] rounded-2xl p-10 text-center space-y-3">
        <div class="text-3xl">🏷️</div>
        <div class="text-base font-bold text-white">${state.genreSearch ? 'No genres found' : 'No genres in your library yet'}</div>
        <p class="text-xs text-slate-400">
          ${state.genreSearch
            ? 'No genres or titles match your search filter.'
            : (isLibraryEmpty
                ? 'Your library is currently empty. Add your first title to start organizing by genre!'
                : 'Add titles with genres or fetch details to see them grouped here.')}
        </p>
        ${state.genreSearch ? `
          <button data-action="clear-genre-search" class="px-4 py-2 rounded-lg bg-[#ff9f1c] text-[#0d0e11] font-bold text-xs transition hover:bg-[#ffb144]">
            Clear Genre Search
          </button>
        ` : (isLibraryEmpty ? `
          <button data-action="open-add-modal" class="px-4 py-2 rounded-lg bg-[#ff9f1c] text-[#0d0e11] font-bold text-xs transition hover:bg-[#ffb144]">
            + Add Your First Title
          </button>
        ` : `
          <button data-action="enrich-library" class="px-4 py-2 rounded-lg bg-[#ff9f1c] text-[#0d0e11] font-bold text-xs transition hover:bg-[#ffb144]">
            ⚡ Fetch details (poster, genres, synopsis)
          </button>
        `)}
      </div>
    `;
    return;
  }

  // Render Sections (G1, G3)
  const isOwner = OwnerMode.isOwner();
  state.genreExpanded = state.genreExpanded || {};

  grid.innerHTML = genreEntries.map((entry) => {
    const slug = entry.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const avgRatingStr = entry.avgRating > 0 ? `${entry.avgRating.toFixed(1).replace(/\.0$/, '')} ★` : 'Unrated';
    const isUncategorized = entry.name.toLowerCase() === 'uncategorized';
    const isExpanded = state.genreExpanded[entry.name] === true;
    const PAGE_SIZE = 12;
    const visibleItems = isExpanded ? entry.items : entry.items.slice(0, PAGE_SIZE);
    const hasMore = entry.items.length > PAGE_SIZE;

    return `
      <section id="genre-sec-${slug}" class="bg-[#2c3539]/70 border border-[#3d494f] rounded-2xl p-4 sm:p-5 space-y-4 scroll-mt-20">
        <!-- Section Header -->
        <div class="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#3d494f]">
          <div class="flex flex-wrap items-center gap-3">
            <div class="flex items-center gap-2">
              <span class="text-lg text-[#ff9f1c]">🏷️</span>
              <h3
                data-action="open-genre-in-library"
                data-genre="${esc(entry.name)}"
                class="text-base sm:text-lg font-bold text-white tracking-wide cursor-pointer hover:text-[#ff9f1c] transition"
                title="Filter library by ${esc(entry.name)}"
              >${esc(entry.name)}</h3>
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

          <div class="flex items-center gap-2">
            ${isUncategorized ? `
              <button
                type="button"
                data-action="fix-uncategorized"
                class="h-7 px-3 rounded-lg bg-[#ff9f1c] hover:bg-[#ffb144] text-[#0d0e11] text-xs font-bold flex items-center gap-1.5 transition shadow"
                title="Fetch metadata and auto-assign genres to uncategorized titles"
              >
                <span>⚡</span>
                <span>Fix these</span>
              </button>
            ` : ''}

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
        </div>

        <!-- Media Cards Grid (Paginated first 12 cards - G1, G2, L7) -->
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
          ${visibleItems.map((item) => {
            const title = getItemTitle(item);
            const rating = Number(item.rating || 0);
            const isMasterpiece = rating >= 9;
            const posterSrc = item.image || makeFallbackPoster(title);
            const displayStatus = normalizeStatus(item.status);
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
                title="${esc(title)} (${displayStatus})"
              >
                <!-- Poster Image & Overlays -->
                <div class="relative w-full aspect-[2/3] bg-[#0d0e11] overflow-hidden">
                  <img
                    src="${esc(posterSrc)}"
                    alt="${esc(title)}"
                    data-fallback-title="${esc(title)}"
                    class="poster-img w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    loading="lazy"
                    referrerpolicy="no-referrer"
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
                  <h4 class="font-bold text-xs text-white line-clamp-2 leading-tight group-hover:text-[#ff9f1c] transition" title="${esc(title)}">
                    ${esc(title)}
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

        ${hasMore ? `
          <div class="pt-2 flex justify-center border-t border-[#3d494f]/50">
            <button
              type="button"
              data-action="toggle-genre-expand"
              data-genre="${esc(entry.name)}"
              class="px-4 py-1.5 rounded-lg bg-[#0d0e11] hover:bg-[#364146] border border-[#3d494f] text-xs font-semibold text-slate-300 hover:text-white transition flex items-center gap-1.5"
            >
              <span>${isExpanded ? '▴ Show fewer titles' : `▾ Show all ${entry.items.length} titles`}</span>
            </button>
          </div>
        ` : ''}
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
  const statsView = document.getElementById('statsView');

  if (state.view === 'library') {
    if (libView)   libView.classList.remove('hidden');
    if (libSub)    libSub.classList.remove('hidden');
    if (calView)   calView.classList.add('hidden');
    if (genreView) genreView.classList.add('hidden');
    if (statsView) statsView.classList.add('hidden');
    renderLibrary();
  } else if (state.view === 'calendar') {
    if (libView)   libView.classList.add('hidden');
    if (libSub)    libSub.classList.add('hidden');
    if (calView)   calView.classList.remove('hidden');
    if (genreView) genreView.classList.add('hidden');
    if (statsView) statsView.classList.add('hidden');
    renderCalendar();
  } else if (state.view === 'genre') {
    if (libView)   libView.classList.add('hidden');
    if (libSub)    libSub.classList.add('hidden');
    if (calView)   calView.classList.add('hidden');
    if (genreView) genreView.classList.remove('hidden');
    if (statsView) statsView.classList.add('hidden');
    renderGenreView();
  } else if (state.view === 'stats') {
    if (libView)   libView.classList.add('hidden');
    if (libSub)    libSub.classList.add('hidden');
    if (calView)   calView.classList.add('hidden');
    if (genreView) genreView.classList.add('hidden');
    if (statsView) statsView.classList.remove('hidden');
    renderStatsView();
  }
}

// ---------------------------------------------------------------------------
// Personal Stats & Analytics Engine (Feature 3)
// ---------------------------------------------------------------------------

function renderStatsView() {
  const container = document.getElementById('statsDashboardContainer');
  if (!container) return;

  const items = state.items;
  if (!items || items.length === 0) {
    container.innerHTML = `
      <div class="bg-[#2c3539] border border-[#3d494f] rounded-2xl p-10 text-center space-y-3">
        <div class="text-4xl">📊</div>
        <h3 class="text-lg font-bold text-white">No Library Data to Analyze</h3>
        <p class="text-xs text-slate-400">Add titles to your library or import your backup to view detailed analytics.</p>
        <button data-action="switch-view" data-view="library" class="px-4 py-2 rounded-xl bg-[#ff9f1c] hover:bg-[#ffb144] text-[#0d0e11] font-bold text-xs transition">
          Go to Library
        </button>
      </div>
    `;
    return;
  }

  const totalTitles = items.length;

  // Category counts
  const catCounts = { 'Series & Anime': 0, 'Movies': 0, 'Games': 0, 'Books': 0 };
  for (const item of items) {
    if (catCounts[item.category] !== undefined) catCounts[item.category]++;
    else catCounts['Series & Anime']++;
  }

  // Status counts
  const statusCounts = { 'Completed': 0, 'Ongoing': 0, 'Planning': 0, 'On Hold': 0, 'Dropped': 0 };
  for (const item of items) {
    const st = normalizeStatus(item.status);
    if (statusCounts[st] !== undefined) statusCounts[st]++;
  }

  const completedCount = statusCounts['Completed'];
  const completionRate = totalTitles > 0 ? Math.round((completedCount / totalTitles) * 100) : 0;

  // Time & Progress calculations
  let totalEpisodesWatched = 0;
  let totalMinutes = 0;
  for (const item of items) {
    const prog = Number(item.progress) || 0;
    totalEpisodesWatched += prog;
    if (item.category === 'Movies') {
      const isDone = normalizeStatus(item.status) === 'Completed';
      totalMinutes += isDone ? 115 : (prog * 115);
    } else if (item.category === 'Games') {
      totalMinutes += prog * 60;
    } else if (item.category === 'Books') {
      totalMinutes += prog * 15;
    } else {
      totalMinutes += prog * 23.5;
    }
  }

  const totalHours = Math.round(totalMinutes / 60);
  const totalDays = (totalMinutes / (60 * 24)).toFixed(1);

  // Ratings calculation
  const ratedItems = items.filter(i => Number(i.rating) > 0);
  const avgRating = ratedItems.length > 0
    ? (ratedItems.reduce((acc, i) => acc + Number(i.rating), 0) / ratedItems.length).toFixed(2)
    : '0.00';
  const masterpieces = items.filter(i => Number(i.rating) >= 9).length;
  const favoritesCount = items.filter(i => Boolean(i.favorite)).length;

  // Score distribution: 10 down to 1 + Unrated
  const scoreDist = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map(score => {
    const count = items.filter(i => Math.round(Number(i.rating || 0)) === score).length;
    return { score, count };
  });
  const unratedCount = items.filter(i => !i.rating || Number(i.rating) === 0).length;
  const maxScoreCount = Math.max(1, ...scoreDist.map(s => s.count), unratedCount);

  // Top 5 Studios
  const studioStats = {};
  for (const item of items) {
    const studioRaw = (item.studio || '').trim();
    if (!studioRaw || studioRaw.toLowerCase().includes('unknown') || studioRaw === 'Wikipedia') continue;
    const studios = studioRaw.split(',').map(s => s.trim()).filter(Boolean);
    for (const st of studios) {
      if (!studioStats[st]) {
        studioStats[st] = { name: st, count: 0, totalRating: 0, ratedCount: 0 };
      }
      studioStats[st].count++;
      const r = Number(item.rating) || 0;
      if (r > 0) {
        studioStats[st].totalRating += r;
        studioStats[st].ratedCount++;
      }
    }
  }

  const topStudios = Object.values(studioStats)
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      const avgA = a.ratedCount ? a.totalRating / a.ratedCount : 0;
      const avgB = b.ratedCount ? b.totalRating / b.ratedCount : 0;
      return avgB - avgA;
    })
    .slice(0, 5);

  // Top Genres
  const genreStats = {};
  for (const item of items) {
    if (Array.isArray(item.genres)) {
      for (const g of item.genres) {
        const cleanG = (g || '').trim();
        if (!cleanG) continue;
        genreStats[cleanG] = (genreStats[cleanG] || 0) + 1;
      }
    }
  }

  const topGenres = Object.entries(genreStats)
    .map(([genre, count]) => ({ genre, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // HTML Rendering
  container.innerHTML = `
    <!-- Top 4 KPI Metrics -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="bg-[#2c3539] border border-[#3d494f] rounded-2xl p-4 sm:p-5 flex flex-col justify-between space-y-3 shadow-md hover:border-[#ff9f1c]/50 transition">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold uppercase tracking-wider text-slate-400">Total Media</span>
          <span class="p-2 rounded-xl bg-amber-400/10 text-amber-400 text-lg">📺</span>
        </div>
        <div>
          <div class="text-3xl font-extrabold text-white tracking-tight">${totalTitles}</div>
          <div class="flex items-center gap-1.5 text-[11px] text-slate-300 mt-1 flex-wrap">
            <span class="text-amber-300 font-semibold">${catCounts['Series & Anime']} Series</span>
            <span>•</span>
            <span>${catCounts['Movies']} Movies</span>
            ${catCounts['Games'] > 0 ? `<span>•</span><span>${catCounts['Games']} Games</span>` : ''}
            ${catCounts['Books'] > 0 ? `<span>•</span><span>${catCounts['Books']} Books</span>` : ''}
          </div>
        </div>
      </div>

      <div class="bg-[#2c3539] border border-[#3d494f] rounded-2xl p-4 sm:p-5 flex flex-col justify-between space-y-3 shadow-md hover:border-[#ff9f1c]/50 transition">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold uppercase tracking-wider text-slate-400">Total Watch Time</span>
          <span class="p-2 rounded-xl bg-sky-400/10 text-sky-400 text-lg">⏱️</span>
        </div>
        <div>
          <div class="text-3xl font-extrabold text-white tracking-tight">${totalDays} <span class="text-base font-normal text-slate-400">days</span></div>
          <div class="text-[11px] text-slate-300 mt-1">
            <strong>${totalHours}</strong> hours • <strong>${totalEpisodesWatched}</strong> units consumed
          </div>
        </div>
      </div>

      <div class="bg-[#2c3539] border border-[#3d494f] rounded-2xl p-4 sm:p-5 flex flex-col justify-between space-y-3 shadow-md hover:border-[#ff9f1c]/50 transition">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold uppercase tracking-wider text-slate-400">Mean Score</span>
          <span class="p-2 rounded-xl bg-amber-400/10 text-amber-400 text-lg">★</span>
        </div>
        <div>
          <div class="text-3xl font-extrabold text-amber-400 tracking-tight">${avgRating} <span class="text-base font-normal text-slate-400">/ 10</span></div>
          <div class="text-[11px] text-slate-300 mt-1">
            <strong>${masterpieces}</strong> Masterpieces (9★+) • <strong>${favoritesCount}</strong> Favorites
          </div>
        </div>
      </div>

      <div class="bg-[#2c3539] border border-[#3d494f] rounded-2xl p-4 sm:p-5 flex flex-col justify-between space-y-3 shadow-md hover:border-[#ff9f1c]/50 transition">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold uppercase tracking-wider text-slate-400">Completion Rate</span>
          <span class="p-2 rounded-xl bg-emerald-400/10 text-emerald-400 text-lg">🎯</span>
        </div>
        <div>
          <div class="text-3xl font-extrabold text-emerald-400 tracking-tight">${completionRate}%</div>
          <div class="text-[11px] text-slate-300 mt-1">
            <strong>${completedCount}</strong> finished out of <strong>${totalTitles}</strong> titles
          </div>
        </div>
      </div>
    </div>

    <!-- Status Distribution Bar -->
    <div class="bg-[#2c3539] border border-[#3d494f] rounded-2xl p-5 space-y-3 shadow-md">
      <div class="flex items-center justify-between">
        <h3 class="font-bold text-sm text-white flex items-center gap-2">
          <span>📋</span> Library Status Distribution
        </h3>
        <span class="text-xs text-slate-400">${totalTitles} Total Entries</span>
      </div>

      <!-- Segmented Bar -->
      <div class="w-full h-3 rounded-full bg-[#0d0e11] flex overflow-hidden p-0.5 gap-0.5 border border-[#3d494f]">
        ${statusCounts['Completed'] > 0 ? `<div style="width:${(statusCounts['Completed'] / totalTitles) * 100}%" class="bg-emerald-500 rounded-sm" title="Completed: ${statusCounts['Completed']}"></div>` : ''}
        ${statusCounts['Ongoing'] > 0 ? `<div style="width:${(statusCounts['Ongoing'] / totalTitles) * 100}%" class="bg-amber-500 rounded-sm" title="Ongoing: ${statusCounts['Ongoing']}"></div>` : ''}
        ${statusCounts['Planning'] > 0 ? `<div style="width:${(statusCounts['Planning'] / totalTitles) * 100}%" class="bg-sky-500 rounded-sm" title="Planning: ${statusCounts['Planning']}"></div>` : ''}
        ${statusCounts['On Hold'] > 0 ? `<div style="width:${(statusCounts['On Hold'] / totalTitles) * 100}%" class="bg-purple-500 rounded-sm" title="On Hold: ${statusCounts['On Hold']}"></div>` : ''}
        ${statusCounts['Dropped'] > 0 ? `<div style="width:${(statusCounts['Dropped'] / totalTitles) * 100}%" class="bg-rose-500 rounded-sm" title="Dropped: ${statusCounts['Dropped']}"></div>` : ''}
      </div>

      <!-- Status Chips -->
      <div class="flex items-center gap-3 text-xs flex-wrap pt-1">
        <button data-action="stats-filter-status" data-status="Completed" class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0d0e11] hover:bg-[#364146] text-slate-200 border border-emerald-500/30 transition">
          <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
          <span>Completed:</span>
          <span class="font-bold text-emerald-400">${statusCounts['Completed']}</span>
        </button>
        <button data-action="stats-filter-status" data-status="Ongoing" class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0d0e11] hover:bg-[#364146] text-slate-200 border border-amber-500/30 transition">
          <span class="w-2 h-2 rounded-full bg-amber-500"></span>
          <span>Ongoing:</span>
          <span class="font-bold text-amber-400">${statusCounts['Ongoing']}</span>
        </button>
        <button data-action="stats-filter-status" data-status="Planning" class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0d0e11] hover:bg-[#364146] text-slate-200 border border-sky-500/30 transition">
          <span class="w-2 h-2 rounded-full bg-sky-500"></span>
          <span>Planning:</span>
          <span class="font-bold text-sky-400">${statusCounts['Planning']}</span>
        </button>
        <button data-action="stats-filter-status" data-status="On Hold" class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0d0e11] hover:bg-[#364146] text-slate-200 border border-purple-500/30 transition">
          <span class="w-2 h-2 rounded-full bg-purple-500"></span>
          <span>On Hold:</span>
          <span class="font-bold text-purple-400">${statusCounts['On Hold']}</span>
        </button>
        <button data-action="stats-filter-status" data-status="Dropped" class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0d0e11] hover:bg-[#364146] text-slate-200 border border-rose-500/30 transition">
          <span class="w-2 h-2 rounded-full bg-rose-500"></span>
          <span>Dropped:</span>
          <span class="font-bold text-rose-400">${statusCounts['Dropped']}</span>
        </button>
      </div>
    </div>

    <!-- Rating Distribution & Top Studios / Genres Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
      <!-- Left: Interactive Rating Score Histogram (7 cols) -->
      <div class="lg:col-span-7 bg-[#2c3539] border border-[#3d494f] rounded-2xl p-5 space-y-4 shadow-md">
        <div class="flex items-center justify-between border-b border-[#3d494f] pb-3">
          <div>
            <h3 class="font-bold text-sm text-white flex items-center gap-2">
              <span>⭐</span> Score Distribution
            </h3>
            <p class="text-[11px] text-slate-400">Frequency of user ratings across your library</p>
          </div>
          <span class="text-xs font-bold text-amber-400">${ratedItems.length} Rated</span>
        </div>

        <div class="space-y-2.5">
          ${scoreDist.map(s => {
            const pctOfMax = Math.round((s.count / maxScoreCount) * 100);
            const isMasterpiece = s.score >= 9;
            return `
              <div
                data-action="stats-filter-score"
                data-score="${s.score}"
                class="group flex items-center gap-3 p-1 rounded-lg hover:bg-[#0d0e11]/60 cursor-pointer transition"
                title="Filter library by score ${s.score}"
              >
                <div class="w-12 text-right shrink-0">
                  <span class="inline-flex items-center gap-1 text-xs font-bold ${isMasterpiece ? 'text-amber-400 font-extrabold' : 'text-slate-300'}">
                    <span>${s.score}</span>
                    <span class="text-[10px]">★</span>
                  </span>
                </div>
                <div class="flex-1 h-4 rounded-md bg-[#0d0e11] overflow-hidden p-0.5">
                  <div
                    class="h-full rounded transition-all duration-500 ${isMasterpiece ? 'bg-[#ff9f1c]' : 'bg-[#ff9f1c]/70 group-hover:bg-[#ff9f1c]'}"
                    style="width: ${pctOfMax}%"
                  ></div>
                </div>
                <div class="w-12 text-right shrink-0 text-xs font-mono font-bold text-slate-300 group-hover:text-amber-300">
                  ${s.count}
                </div>
              </div>
            `;
          }).join('')}

          ${unratedCount > 0 ? `
            <div
              data-action="stats-filter-score"
              data-score="0"
              class="group flex items-center gap-3 p-1 rounded-lg hover:bg-[#0d0e11]/60 cursor-pointer transition"
              title="Filter unrated titles"
            >
              <div class="w-12 text-right shrink-0 text-xs font-bold text-slate-400">
                Unrated
              </div>
              <div class="flex-1 h-4 rounded-md bg-[#0d0e11] overflow-hidden p-0.5">
                <div
                  class="h-full rounded bg-slate-600 group-hover:bg-slate-500 transition-all duration-500"
                  style="width: ${Math.round((unratedCount / maxScoreCount) * 100)}%"
                ></div>
              </div>
              <div class="w-12 text-right shrink-0 text-xs font-mono font-bold text-slate-400 group-hover:text-white">
                ${unratedCount}
              </div>
            </div>
          ` : ''}
        </div>
      </div>

      <!-- Right: Top Studios & Top Genres (5 cols) -->
      <div class="lg:col-span-5 space-y-5">
        <!-- Top Studios -->
        <div class="bg-[#2c3539] border border-[#3d494f] rounded-2xl p-5 space-y-4 shadow-md">
          <div class="flex items-center justify-between border-b border-[#3d494f] pb-3">
            <div>
              <h3 class="font-bold text-sm text-white flex items-center gap-2">
                <span>🏆</span> Top Studios &amp; Creators
              </h3>
              <p class="text-[11px] text-slate-400">Most frequent creators in your library</p>
            </div>
          </div>

          <div class="space-y-2">
            ${topStudios.length === 0 ? `
              <div class="text-xs text-slate-500 py-3 text-center">No studio data available. Use AniList Enricher to auto-populate studios!</div>
            ` : topStudios.map((st, idx) => {
              const medals = ['🥇', '🥈', '🥉', '#4', '#5'];
              const avgScore = st.ratedCount > 0 ? (st.totalRating / st.ratedCount).toFixed(1) : null;
              return `
                <div
                  data-action="stats-filter-studio"
                  data-studio="${esc(st.name)}"
                  class="flex items-center justify-between p-2.5 rounded-xl bg-[#0d0e11] hover:bg-[#364146] border border-[#3d494f] hover:border-[#ff9f1c]/50 cursor-pointer transition"
                  title="Filter library by ${esc(st.name)}"
                >
                  <div class="flex items-center gap-2.5 min-w-0 flex-1">
                    <span class="text-sm font-bold text-amber-400 shrink-0 w-6 text-center">${medals[idx] || '#' + (idx + 1)}</span>
                    <span class="text-xs font-bold text-white truncate">${esc(st.name)}</span>
                  </div>
                  <div class="flex items-center gap-2 shrink-0">
                    <span class="text-[11px] font-mono px-2 py-0.5 rounded bg-[#2c3539] text-slate-300">${st.count} titles</span>
                    ${avgScore ? `
                      <span class="text-[11px] font-bold text-amber-400 flex items-center gap-0.5">
                        <span>★</span>
                        <span>${avgScore}</span>
                      </span>
                    ` : ''}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Top Genres -->
        <div class="bg-[#2c3539] border border-[#3d494f] rounded-2xl p-5 space-y-4 shadow-md">
          <div class="flex items-center justify-between border-b border-[#3d494f] pb-3">
            <div>
              <h3 class="font-bold text-sm text-white flex items-center gap-2">
                <span>🏷️</span> Top Genres
              </h3>
              <p class="text-[11px] text-slate-400">Click to explore genres</p>
            </div>
          </div>

          <div class="flex flex-wrap gap-2">
            ${topGenres.map(g => `
              <button
                type="button"
                data-action="stats-open-genre"
                data-genre="${esc(g.genre)}"
                class="px-3 py-1.5 rounded-xl bg-[#0d0e11] hover:bg-[#ff9f1c] hover:text-[#0d0e11] text-slate-200 border border-[#3d494f] hover:border-[#ff9f1c] text-xs font-bold flex items-center gap-2 transition shadow-sm group"
              >
                <span>${esc(g.genre)}</span>
                <span class="text-[10px] px-1.5 py-0.2 rounded bg-[#2c3539] group-hover:bg-[#0d0e11]/20 font-mono text-amber-400 group-hover:text-[#0d0e11]">${g.count}</span>
              </button>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
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
// ---------------------------------------------------------------------------
// Modal Helpers & Category-Aware Fields (F1, F2, F3, F5, F8, F11)
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

function updateCategoryAwareFormFields() {
  const cat = document.getElementById('fieldCategory')?.value || 'Series & Anime';
  const labelProg = document.getElementById('labelProgress');
  const labelStat = document.getElementById('labelStatus');
  const statusSel = document.getElementById('fieldStatus');
  const totalUnits = document.getElementById('fieldTotalUnits');
  const curStatus = normalizeStatus(statusSel?.value || 'Ongoing');

  const meta = {
    'Movies': { prog: 'Progress (Parts / Movies)', stat: 'Viewing Status', done: 'Watched', active: 'Watching', order: ['Completed', 'Ongoing'] },
    'Games': { prog: 'Progress (Hours / Chapters)', stat: 'Playing Status', done: 'Beaten / Finished', active: 'Playing', order: ['Completed', 'Ongoing'] },
    'Books': { prog: 'Progress (Chapters / Pages)', stat: 'Reading Status', done: 'Read', active: 'Reading', order: ['Completed', 'Ongoing'] },
    'Series & Anime': { prog: 'Progress (Episodes)', stat: 'Watch Status', done: 'Completed', active: 'Watching / Ongoing', order: ['Ongoing', 'Completed'] }
  }[cat] || { prog: 'Progress (Episodes)', stat: 'Watch Status', done: 'Completed', active: 'Watching / Ongoing', order: ['Ongoing', 'Completed'] };

  if (labelProg) labelProg.textContent = meta.prog;
  if (labelStat) labelStat.textContent = meta.stat;
  if (cat === 'Movies' && totalUnits && (!totalUnits.value || totalUnits.value === '12')) {
    totalUnits.value = '1';
  }

  if (statusSel) {
    const labels = {
      Completed: meta.done,
      Ongoing: meta.active,
      'On Hold': 'On Hold',
      Planning: 'Planning',
      Dropped: 'Dropped'
    };
    statusSel.innerHTML = [...meta.order, 'On Hold', 'Planning', 'Dropped']
      .map((val) => `<option value="${val}">${labels[val]}</option>`)
      .join('');
    statusSel.value = curStatus;
  }
}

function checkDuplicateTitle(title, currentId) {
  const warning = document.getElementById('duplicateTitleWarning');
  if (!warning) return;
  const t = (title || '').trim().toLowerCase();
  if (!t) {
    warning.classList.add('hidden');
    return;
  }
  const match = state.items.find(i => i.id !== currentId && (i.title || '').trim().toLowerCase() === t);
  if (match) {
    warning.classList.remove('hidden');
  } else {
    warning.classList.add('hidden');
  }
}

function getModalFormSnapshot() {
  return JSON.stringify({
    title: document.getElementById('fieldTitle')?.value?.trim() || '',
    category: document.getElementById('fieldCategory')?.value || '',
    status: document.getElementById('fieldStatus')?.value || '',
    rating: document.getElementById('fieldRating')?.value || '0',
    progress: document.getElementById('fieldProgress')?.value || '0',
    totalUnits: document.getElementById('fieldTotalUnits')?.value || '12',
    studio: document.getElementById('fieldStudio')?.value?.trim() || '',
    releaseDate: document.getElementById('fieldReleaseDate')?.value?.trim() || '',
    consumedDate: document.getElementById('fieldConsumedDate')?.value?.trim() || '',
    image: document.getElementById('fieldImage')?.value?.trim() || '',
    notes: document.getElementById('fieldNotes')?.value?.trim() || '',
    synopsis: document.getElementById('fieldSynopsis')?.value?.trim() || '',
    genres: currentModalGenres || []
  });
}

function closeMediaModal(force = false) {
  if (!force && state.modalInitialSnapshot) {
    const cur = getModalFormSnapshot();
    if (cur !== state.modalInitialSnapshot) {
      if (!confirm('You have unsaved changes in this form. Discard changes?')) {
        return;
      }
    }
  }
  document.getElementById('mediaModal')?.classList.add('hidden');
  state.modalInitialSnapshot = null;
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

  const consumedStr = item ? (item.consumedDate || '') : (presetDate || '');
  document.getElementById('fieldConsumedDate').value = consumedStr;

  const parsedDate  = parseDateOrRange(consumedStr);
  const dateStartEl = document.getElementById('fieldDateStart');
  const dateEndEl   = document.getElementById('fieldDateEnd');
  const rangeToggle = document.getElementById('fieldRangeToggle');
  const endRow      = document.getElementById('dateEndRow');

  if (parsedDate) {
    if (parsedDate.type === 'range') {
      if (dateStartEl) dateStartEl.value = formatDDMMYYYYtoInputDate(parsedDate.start.label);
      if (dateEndEl)   dateEndEl.value   = formatDDMMYYYYtoInputDate(parsedDate.end.label);
      if (rangeToggle) rangeToggle.checked = true;
      if (endRow)      endRow.classList.remove('hidden');
    } else {
      if (dateStartEl) dateStartEl.value = formatDDMMYYYYtoInputDate(parsedDate.start.label);
      if (dateEndEl)   dateEndEl.value   = '';
      if (rangeToggle) rangeToggle.checked = false;
      if (endRow)      endRow.classList.add('hidden');
    }
  } else {
    if (dateStartEl) dateStartEl.value = '';
    if (dateEndEl)   dateEndEl.value   = '';
    if (rangeToggle) rangeToggle.checked = false;
    if (endRow)      endRow.classList.add('hidden');
  }

  state.currentModalTitleEnglish = item?.titleEnglish || '';
  state.currentModalTitleRomaji  = item?.titleRomaji || '';

  if (item && (!state.currentModalTitleEnglish || !state.currentModalTitleRomaji)) {
    const match = lookupBilingualTitle(item.title) || lookupBilingualTitle(item.id);
    if (match) {
      if (!state.currentModalTitleEnglish && match.english) state.currentModalTitleEnglish = match.english;
      if (!state.currentModalTitleRomaji && match.romaji) state.currentModalTitleRomaji = match.romaji;
    }
  }

  const fieldTitleEnglish = document.getElementById('fieldTitleEnglish');
  const fieldTitleRomaji  = document.getElementById('fieldTitleRomaji');

  if (item) {
    document.getElementById('modalTitle').textContent     = 'Edit Media';
    document.getElementById('fieldId').value              = item.id;
    document.getElementById('fieldTitle').value            = item.title || '';
    if (fieldTitleEnglish) {
      fieldTitleEnglish.value = state.currentModalTitleEnglish || '';
      delete fieldTitleEnglish.dataset.userEdited;
    }
    if (fieldTitleRomaji) {
      fieldTitleRomaji.value = state.currentModalTitleRomaji || '';
      delete fieldTitleRomaji.dataset.userEdited;
    }
    document.getElementById('fieldCategory').value         = catVal;
    updateCategoryAwareFormFields();
    document.getElementById('fieldStatus').value           = normalizeStatus(item.status);
    document.getElementById('fieldRating').value           = item.rating ?? 0;
    document.getElementById('fieldProgress').value         = item.progress ?? 0;
    document.getElementById('fieldTotalUnits').value       = item.totalUnits ?? (catVal === 'Movies' ? 1 : 12);
    document.getElementById('fieldStudio').value           = item.studio || '';
    document.getElementById('fieldReleaseDate').value      = item.releaseDate || '';
    document.getElementById('fieldImage').value            = item.image || '';
    document.getElementById('fieldNotes').value            = item.notes || '';
    document.getElementById('fieldSynopsis').value         = item.synopsis || '';
    const fieldFav = document.getElementById('fieldFavorite');
    const fieldTags = document.getElementById('fieldTags');
    if (fieldFav) fieldFav.checked = !!item.favorite;
    if (fieldTags) fieldTags.value = Array.isArray(item.tags) ? item.tags.join(', ') : (item.tags || '');
    updateModalPosterPreview(item.image || '');

    currentModalGenres = Array.isArray(item.genres)
      ? [...item.genres]
      : (item.genres ? String(item.genres).split(',').map((s) => s.trim()).filter(Boolean) : []);
  } else {
    document.getElementById('modalTitle').textContent     = 'Add Media';
    document.getElementById('fieldId').value              = '';
    document.getElementById('fieldTitle').value            = '';
    if (fieldTitleEnglish) {
      fieldTitleEnglish.value = '';
      delete fieldTitleEnglish.dataset.userEdited;
    }
    if (fieldTitleRomaji) {
      fieldTitleRomaji.value = '';
      delete fieldTitleRomaji.dataset.userEdited;
    }
    document.getElementById('fieldCategory').value         = catVal;
    updateCategoryAwareFormFields();
    document.getElementById('fieldStatus').value           = 'Ongoing';
    document.getElementById('fieldRating').value           = 0;
    document.getElementById('fieldProgress').value         = 0;
    document.getElementById('fieldTotalUnits').value       = (catVal === 'Movies' ? 1 : 12);
    document.getElementById('fieldStudio').value           = '';
    document.getElementById('fieldReleaseDate').value      = '';
    document.getElementById('fieldImage').value            = '';
    document.getElementById('fieldNotes').value            = '';
    document.getElementById('fieldSynopsis').value         = '';
    const fieldFav = document.getElementById('fieldFavorite');
    const fieldTags = document.getElementById('fieldTags');
    if (fieldFav) fieldFav.checked = false;
    if (fieldTags) fieldTags.value = '';
    updateModalPosterPreview('');

    currentModalGenres = [];
  }

  const shareBtn = document.getElementById('modalShareCardBtn');
  if (shareBtn) {
    if (item && item.id) {
      shareBtn.classList.remove('hidden');
    } else {
      shareBtn.classList.add('hidden');
    }
  }

  // Check duplicate title badge (F11)
  const curId = item ? item.id : '';
  checkDuplicateTitle(document.getElementById('fieldTitle').value, curId);

  // Progressive disclosure accordion (F1): open if item has details filled in, else closed
  const acc = document.getElementById('modalMoreDetailsAccordion');
  if (acc) {
    acc.open = !!(item && (item.notes || item.consumedDate || item.synopsis || (item.genres && item.genres.length > 0) || item.studio || item.releaseDate || item.favorite || (item.tags && item.tags.length > 0)));
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

  state.modalInitialSnapshot = getModalFormSnapshot();
  document.getElementById('mediaModal').classList.remove('hidden');
}

function formatDDMMYYYYtoInputDate(str) {
  const p = parseSingleDDMMYYYY(str);
  if (!p) return '';
  const mm = String(p.month + 1).padStart(2, '0');
  const dd = String(p.day).padStart(2, '0');
  return `${p.year}-${mm}-${dd}`;
}

function formatInputDateToDDMMYYYY(val) {
  if (!val) return '';
  const parts = val.split('-');
  if (parts.length !== 3) return '';
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  return `${d}-${m}-${y}`;
}

function syncDatePickerToHiddenField() {
  const startVal  = document.getElementById('fieldDateStart')?.value;
  const isRange   = document.getElementById('fieldRangeToggle')?.checked;
  const endVal    = document.getElementById('fieldDateEnd')?.value;
  const hiddenInp = document.getElementById('fieldConsumedDate');
  if (!hiddenInp) return;

  if (!startVal) {
    hiddenInp.value = '';
    return;
  }
  const startFmt = formatInputDateToDDMMYYYY(startVal);
  if (isRange && endVal) {
    const endFmt = formatInputDateToDDMMYYYY(endVal);
    hiddenInp.value = `${startFmt} to ${endFmt}`;
  } else {
    hiddenInp.value = startFmt;
  }
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

  syncDatePickerToHiddenField();
  const consumedDate = document.getElementById('fieldConsumedDate').value.trim();
  if (consumedDate && consumedDate.includes('to')) {
    const parts = consumedDate.split(/\s+to\s+/i);
    const start = parseSingleDDMMYYYY(parts[0]);
    const end   = parseSingleDDMMYYYY(parts[1]);
    if (start && end) {
      const startDate = new Date(start.year, start.month, start.day);
      const endDate   = new Date(end.year, end.month, end.day);
      if (startDate > endDate) {
        showToast('Start date must be on or before end date');
        return;
      }
    }
  }

  const id         = document.getElementById('fieldId').value || ('id-' + Date.now());
  const category   = document.getElementById('fieldCategory').value;
  const rawStatus  = document.getElementById('fieldStatus').value;
  const status     = normalizeStatus(rawStatus);
  const rating     = Math.min(10, Math.max(0, parseFloat(document.getElementById('fieldRating').value) || 0));
  const totalUnits = Math.max(1, parseInt(document.getElementById('fieldTotalUnits').value, 10) || 1);
  let   progress   = Math.max(0, parseInt(document.getElementById('fieldProgress').value, 10) || 0);
  if (status === 'Completed' && progress === 0) progress = totalUnits;
  if (progress > totalUnits) progress = totalUnits;

  const unitName = category === 'Movies' ? 'movie' : category === 'Books' ? 'chs' : category === 'Games' ? 'hrs' : 'eps';
  const genres   = [...currentModalGenres];

  // Protect manually-edited fields from being clobbered during metadata enrichment (B3)
  const existingItem = state.items.find((i) => i.id === id);
  const manualFields = new Set(existingItem?._manualFields || []);
  if (document.getElementById('fieldStudio').value.trim()) manualFields.add('studio');
  if (document.getElementById('fieldReleaseDate').value.trim()) manualFields.add('releaseDate');
  if (genres.length > 0) manualFields.add('genres');
  if (document.getElementById('fieldSynopsis').value.trim()) manualFields.add('synopsis');

  const fieldEngEl = document.getElementById('fieldTitleEnglish');
  const fieldRomEl = document.getElementById('fieldTitleRomaji');
  let titleEnglish = (fieldEngEl ? fieldEngEl.value.trim() : '') || state.currentModalTitleEnglish || existingItem?.titleEnglish || '';
  let titleRomaji  = (fieldRomEl ? fieldRomEl.value.trim() : '') || state.currentModalTitleRomaji  || existingItem?.titleRomaji  || '';

  // Auto-resolve bilingual titles from dictionary if still missing
  if (!titleEnglish || !titleRomaji) {
    const match = lookupBilingualTitle(title) || lookupBilingualTitle(id);
    if (match) {
      if (!titleEnglish && match.english) titleEnglish = match.english;
      if (!titleRomaji && match.romaji) titleRomaji = match.romaji;
    }
  }

  const fieldFav = document.getElementById('fieldFavorite');
  const fieldTags = document.getElementById('fieldTags');
  const favorite = fieldFav ? fieldFav.checked : false;
  const tags = fieldTags
    ? fieldTags.value.split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean)
    : [];

  const entry = {
    id,
    title,
    titleEnglish,
    titleRomaji,
    category,
    status,
    favorite,
    tags,
    rating,
    progress,
    totalUnits,
    unitName,
    studio:        document.getElementById('fieldStudio').value.trim() || 'Unknown Studio',
    releaseDate:   document.getElementById('fieldReleaseDate').value.trim() || 'TBA',
    consumedDate:  document.getElementById('fieldConsumedDate').value.trim(),
    genres,
    image:         document.getElementById('fieldImage').value.trim(),
    notes:         document.getElementById('fieldNotes').value.trim(),
    synopsis:      document.getElementById('fieldSynopsis').value.trim(),
    _manualFields: Array.from(manualFields),
    updatedAt:     Date.now()
  };

  const idx = state.items.findIndex((i) => i.id === id);
  if (idx >= 0) {
    state.items[idx] = entry;
  } else {
    state.items.unshift(entry);
  }

  saveItems(true, entry);
  state.modalInitialSnapshot = null;
  document.getElementById('mediaModal').classList.add('hidden');
  renderAll();
  showToast('Saved entry');
}

// ---------------------------------------------------------------------------
// Shareable Card Generator Engine (Feature 6)
// ---------------------------------------------------------------------------

function openShareModal(itemId = null) {
  const modal = document.getElementById('shareModal');
  if (!modal) return;

  const select = document.getElementById('shareItemSelect');
  if (select) {
    const sorted = [...state.items].sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    select.innerHTML = sorted.map(item => `
      <option value="${esc(item.id)}">${esc(item.title)} (${item.rating > 0 ? item.rating + '★' : 'Unrated'})</option>
    `).join('');
  }

  if (itemId) {
    state.shareMode = 'single';
    state.shareSelectedItemId = itemId;
    if (select) select.value = itemId;
  } else {
    state.shareMode = state.shareMode || 'top9';
    if (!state.shareSelectedItemId && state.items.length > 0) {
      state.shareSelectedItemId = state.items[0].id;
    }
  }

  updateShareModalModeButtons();
  modal.classList.remove('hidden');
  renderShareCard();
}

function closeShareModal() {
  document.getElementById('shareModal')?.classList.add('hidden');
}

function updateShareModalModeButtons() {
  const top9Btn = document.getElementById('shareModeTop9Btn');
  const singleBtn = document.getElementById('shareModeSingleBtn');
  const selectBox = document.getElementById('shareSingleItemSelectContainer');

  const activeCls = 'flex-1 sm:flex-none px-3.5 py-1.5 rounded-lg text-xs font-bold transition bg-[#ff9f1c] text-[#0d0e11] shadow-sm';
  const inactiveCls = 'flex-1 sm:flex-none px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white transition';

  if (state.shareMode === 'single') {
    if (singleBtn) singleBtn.className = activeCls;
    if (top9Btn) top9Btn.className = inactiveCls;
    if (selectBox) selectBox.classList.remove('hidden');
  } else {
    if (top9Btn) top9Btn.className = activeCls;
    if (singleBtn) singleBtn.className = inactiveCls;
    if (selectBox) selectBox.classList.add('hidden');
  }
}

function drawImageCover(ctx, img, x, y, w, h) {
  if (!img) return;
  const imgW = img.naturalWidth || img.width || w;
  const imgH = img.naturalHeight || img.height || h;
  const targetRatio = w / h;
  const imgRatio = imgW / imgH;
  let sX = 0, sY = 0, sW = imgW, sH = imgH;
  if (imgRatio > targetRatio) {
    sW = imgH * targetRatio;
    sX = (imgW - sW) / 2;
  } else {
    sH = imgW / targetRatio;
    sY = (imgH - sH) / 2;
  }
  ctx.drawImage(img, sX, sY, sW, sH, x, y, w, h);
}

async function loadImageSafe(rawUrl) {
  if (!rawUrl) return null;
  const url = String(rawUrl).trim();
  if (!url) return null;

  // 1. Data URLs or Blob URLs — local, no CORS required
  if (url.startsWith('data:') || url.startsWith('blob:')) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  // 2. Determine best CORS-friendly URL
  let primaryUrl = url;
  if (url.includes('livechart.me')) {
    // Livechart blocks direct CORS with Cloudflare 403 challenge.
    // wsrv.nl proxies LiveChart images with Access-Control-Allow-Origin: *
    const stripped = url.replace(/^https?:\/\//, '');
    primaryUrl = `https://wsrv.nl/?url=${encodeURIComponent(stripped)}`;
  } else {
    // For AniList, MAL, etc., bust the non-CORS browser cache created by the <img> tags
    primaryUrl = url + (url.includes('?') ? '&cors=1' : '?cors=1');
  }

  // Helper to load standard Image element
  const loadImgEl = (src, withCors = true, timeout = 3500) => {
    return new Promise((resolve) => {
      const img = new Image();
      if (withCors) img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      setTimeout(() => resolve(null), timeout);
      img.src = src;
    });
  };

  // Attempt A: Fetch as Blob -> ObjectURL (bypasses CORS cache poison & guarantees non-tainted canvas)
  try {
    const res = await fetch(primaryUrl, { mode: 'cors' });
    if (res.ok) {
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const img = await loadImgEl(objUrl, false, 3000);
      if (img) return img;
    }
  } catch (err) {
    // Fetch failed (network or strict CSP)
  }

  // Attempt B: Load HTML Image with crossOrigin on primaryUrl
  let img = await loadImgEl(primaryUrl, true, 3500);
  if (img) return img;

  // Attempt C: Fallback to direct load WITHOUT CORS
  // Ensures poster ALWAYS renders visually on the canvas even if host blocks CORS
  img = await loadImgEl(url, false, 3000);
  if (img) return img;

  return null;
}

async function renderShareCard() {
  const canvas = document.getElementById('shareCanvas');
  const preview = document.getElementById('sharePreviewImg');
  const spinner = document.getElementById('shareLoadingIndicator');
  if (!canvas || !preview) return;

  if (spinner) spinner.classList.remove('hidden');
  preview.classList.add('opacity-30');

  const ctx = canvas.getContext('2d');

  if (state.shareMode === 'single') {
    // Single Review Card (1080 x 600)
    canvas.width = 1080;
    canvas.height = 600;

    // Dark Gunmetal Base Background
    ctx.fillStyle = '#0d0e11';
    ctx.fillRect(0, 0, 1080, 600);

    // Inner Card (#2c3539 with border)
    ctx.fillStyle = '#2c3539';
    roundRect(ctx, 30, 30, 1020, 540, 24);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#3d494f';
    ctx.stroke();

    const curItem = state.items.find(i => i.id === state.shareSelectedItemId) || state.items[0];
    if (!curItem) {
      if (spinner) spinner.classList.add('hidden');
      preview.classList.remove('opacity-30');
      return;
    }

    // Left Poster (340 x 480)
    const posterX = 60;
    const posterY = 60;
    const posterW = 340;
    const posterH = 480;

    ctx.save();
    roundRect(ctx, posterX, posterY, posterW, posterH, 16);
    ctx.clip();
    ctx.fillStyle = '#0d0e11';
    ctx.fillRect(posterX, posterY, posterW, posterH);

    const posterUrl = curItem.image || makeFallbackPoster(curItem.title);
    const posterImg = await loadImageSafe(posterUrl);
    if (posterImg) {
      drawImageCover(ctx, posterImg, posterX, posterY, posterW, posterH);
    } else {
      ctx.fillStyle = '#1e2428';
      ctx.fillRect(posterX, posterY, posterW, posterH);
      ctx.fillStyle = '#ff9f1c';
      ctx.font = 'bold 48px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('✦', posterX + posterW / 2, posterY + posterH / 2 - 20);
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 20px sans-serif';
      wrapText(ctx, curItem.title, posterX + posterW / 2, posterY + posterH / 2 + 30, posterW - 40, 28);
    }
    ctx.restore();

    // Right Content Area (starts at x = 440)
    const contentX = 440;
    let currY = 85;

    // Rating Badge
    const rating = Number(curItem.rating || 0);
    const isMasterpiece = rating >= 9;
    ctx.fillStyle = isMasterpiece ? '#ff9f1c' : '#0d0e11';
    roundRect(ctx, contentX, currY, 140, 36, 10);
    ctx.fill();
    if (!isMasterpiece) {
      ctx.strokeStyle = '#ff9f1c';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.fillStyle = isMasterpiece ? '#0d0e11' : '#ff9f1c';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`★  ${rating > 0 ? rating.toFixed(1) : 'Unrated'}`, contentX + 16, currY + 25);

    // Status Pill
    const displayStatus = normalizeStatus(curItem.status);
    ctx.fillStyle = '#0d0e11';
    roundRect(ctx, contentX + 155, currY, 110, 36, 10);
    ctx.fill();
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(displayStatus, contentX + 172, currY + 24);

    currY += 75;

    // Title
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'left';
    const titleLines = wrapText(ctx, curItem.title, contentX, currY, 560, 38, 2);
    currY += (titleLines.length * 38) + 10;

    // Meta: Category • Studio • Release Date
    ctx.fillStyle = '#94a3b8';
    ctx.font = '15px sans-serif';
    const metaStr = `${curItem.category} • ${curItem.studio || 'Studio'} • ${curItem.releaseDate || 'TBA'}`;
    ctx.fillText(metaStr, contentX, currY);
    currY += 28;

    // Review / Notes Box
    const reviewText = (curItem.notes && curItem.notes.trim()) || (curItem.synopsis && curItem.synopsis.trim()) || 'No review notes provided.';
    ctx.fillStyle = '#0d0e11';
    roundRect(ctx, contentX, currY, 570, 160, 14);
    ctx.fill();
    ctx.strokeStyle = '#3d494f';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#ff9f1c';
    ctx.font = 'bold 36px serif';
    ctx.fillText('“', contentX + 16, currY + 36);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'italic 15px sans-serif';
    wrapText(ctx, reviewText, contentX + 45, currY + 34, 500, 24, 4);

    // Footer Watermark inside card
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('OmniChart • Personal Media Tracking', contentX, 545);

  } else {
    // 3x3 Poster Grid Collage (1080 x 1080)
    canvas.width = 1080;
    canvas.height = 1080;

    // Background
    ctx.fillStyle = '#0d0e11';
    ctx.fillRect(0, 0, 1080, 1080);

    // Header (Top 95px)
    ctx.fillStyle = '#ff9f1c';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('✦ OmniChart', 45, 52);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px sans-serif';
    ctx.fillText('TOP 9 FAVORITES & MASTERPIECES', 45, 78);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#ff9f1c';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(`${state.items.length} TITLES TRACKED`, 1035, 62);

    // Filter and sort items: Prioritize favorites, then highest rated
    const candidates = [...state.items].sort((a, b) => {
      if (b.favorite && !a.favorite) return 1;
      if (a.favorite && !b.favorite) return -1;
      return (Number(b.rating) || 0) - (Number(a.rating) || 0);
    }).slice(0, 9);

    // 3x3 Grid
    const startX = 45;
    const startY = 100;
    const cellW = 316;
    const cellH = 290;
    const gap = 20;

    const loadedImages = await Promise.all(candidates.map(item => loadImageSafe(item.image || makeFallbackPoster(item.title))));

    for (let i = 0; i < 9; i++) {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = startX + col * (cellW + gap);
      const y = startY + row * (cellH + gap);
      const item = candidates[i];
      const img = loadedImages[i];

      ctx.save();
      roundRect(ctx, x, y, cellW, cellH, 14);
      ctx.clip();

      if (item) {
        if (img) {
          drawImageCover(ctx, img, x, y, cellW, cellH);
        } else {
          ctx.fillStyle = '#2c3539';
          ctx.fillRect(x, y, cellW, cellH);
          ctx.fillStyle = '#ff9f1c';
          ctx.font = 'bold 36px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('✦', x + cellW / 2, y + cellH / 2 - 10);
        }

        // Bottom gradient overlay for title legibility
        const grad = ctx.createLinearGradient(x, y + cellH - 90, x, y + cellH);
        grad.addColorStop(0, 'rgba(13, 14, 17, 0)');
        grad.addColorStop(1, 'rgba(13, 14, 17, 0.95)');
        ctx.fillStyle = grad;
        ctx.fillRect(x, y + cellH - 90, cellW, 90);

        // Rating Star Badge at top-left
        const r = Number(item.rating || 0);
        ctx.fillStyle = r >= 9 ? '#ff9f1c' : 'rgba(13, 14, 17, 0.85)';
        roundRect(ctx, x + 10, y + 10, 68, 26, 6);
        ctx.fill();
        ctx.fillStyle = r >= 9 ? '#0d0e11' : '#ff9f1c';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`★ ${r > 0 ? r.toFixed(1) : '-' }`, x + 44, y + 27);

        // Title at bottom
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'left';
        const displayTitle = item.titleEnglish || item.title;
        ctx.fillText(displayTitle.slice(0, 32), x + 14, y + cellH - 22);

        ctx.fillStyle = '#cbd5e1';
        ctx.font = '11px sans-serif';
        ctx.fillText(item.studio || item.category, x + 14, y + cellH - 8);
      } else {
        // Empty placeholder cell
        ctx.fillStyle = '#1e2428';
        ctx.fillRect(x, y, cellW, cellH);
        ctx.fillStyle = '#3d494f';
        ctx.font = 'bold 28px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('+', x + cellW / 2, y + cellH / 2);
      }
      ctx.restore();

      // Border outline
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#3d494f';
      roundRect(ctx, x, y, cellW, cellH, 14);
      ctx.stroke();
    }

    // Footer Watermark (Bottom 35px)
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Generated with OmniChart • Universal Media Tracking', 540, 1055);
  }

  // Update preview image
  try {
    preview.src = canvas.toDataURL('image/png');
    preview.classList.remove('hidden');
    canvas.classList.add('hidden');
  } catch (err) {
    console.warn('[Canvas Export CORS Fallback - displaying canvas directly]', err);
    preview.classList.add('hidden');
    canvas.classList.remove('hidden');
  }

  if (spinner) spinner.classList.add('hidden');
  preview.classList.remove('opacity-30');
}

function roundRect(ctx, x, y, w, h, r) {
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 10) {
  if (!text) return [];
  const words = text.split(' ');
  let line = '';
  const lines = [];

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      lines.push(line.trim());
      line = words[n] + ' ';
      if (lines.length >= maxLines) break;
    } else {
      line = testLine;
    }
  }
  if (lines.length < maxLines && line) lines.push(line.trim());

  lines.forEach((l, idx) => {
    ctx.fillText(l, x, y + (idx * lineHeight));
  });
  return lines;
}

function downloadShareCard() {
  const canvas = document.getElementById('shareCanvas');
  if (!canvas) return;
  try {
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    const name = state.shareMode === 'single'
      ? `omnichart-${(state.shareSelectedItemId || 'card').replace(/\W+/g, '-').toLowerCase()}.png`
      : 'omnichart-top9.png';
    a.download = name;
    a.click();
    showToast('Downloaded shareable card! 📸');
  } catch (e) {
    showToast('Contains cross-origin images: Right-click card preview and choose "Save image as"');
  }
}

function copyShareCard() {
  const canvas = document.getElementById('shareCanvas');
  if (!canvas) return;
  try {
    canvas.toBlob((blob) => {
      if (blob && navigator.clipboard && navigator.clipboard.write) {
        navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
          .then(() => showToast('Card copied to clipboard! 📋'))
          .catch(() => downloadShareCard());
      } else {
        downloadShareCard();
      }
    });
  } catch (e) {
    downloadShareCard();
  }
}

function openConfirmModal(options, msgLegacy, onConfirmLegacy) {
  let title, message, onConfirm, requirePhrase;
  if (typeof options === 'string') {
    title = options;
    message = msgLegacy;
    onConfirm = onConfirmLegacy;
    requirePhrase = null;
  } else {
    title = options.title;
    message = options.message;
    onConfirm = options.onConfirm;
    requirePhrase = options.requirePhrase || null;
  }

  const modal     = document.getElementById('confirmModal');
  const titleEl   = document.getElementById('confirmModalTitle');
  const msgEl     = document.getElementById('confirmModalMessage');
  const inputRow  = document.getElementById('confirmModalInputBox');
  const inputEl   = document.getElementById('confirmModalInput');
  const actionBtn = document.getElementById('confirmModalActionBtn');

  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = message;
  state.pendingConfirmFn = onConfirm;
  state.confirmRequirePhrase = requirePhrase;

  if (requirePhrase) {
    if (inputRow) inputRow.classList.remove('hidden');
    if (inputEl) {
      inputEl.value = '';
      inputEl.placeholder = requirePhrase;
    }
    if (actionBtn) actionBtn.classList.add('opacity-50', 'pointer-events-none');
  } else {
    if (inputRow) inputRow.classList.add('hidden');
    if (actionBtn) actionBtn.classList.remove('opacity-50', 'pointer-events-none');
  }

  if (modal) modal.classList.remove('hidden');
}

function triggerTitleLangToggle() {
  state.titleLang = state.titleLang === 'romaji' ? 'english' : 'romaji';
  try { localStorage.setItem('omnichart_title_lang', state.titleLang); } catch (e) {}

  // Self-healing pass: resolve any items missing English or Romaji titles
  let healed = false;
  for (const item of state.items) {
    if (!item.titleEnglish || !item.titleRomaji) {
      const match = lookupBilingualTitle(item.title) || lookupBilingualTitle(item.id);
      if (match) {
        if (!item.titleEnglish && match.english) { item.titleEnglish = match.english; healed = true; }
        if (!item.titleRomaji && match.romaji) { item.titleRomaji = match.romaji; healed = true; }
      }
    }
  }
  if (healed) {
    saveItems();
  }

  // If any items are still missing English or Romaji titles, kick off background enrichment
  const missingLangCount = state.items.filter((i) => !i.titleEnglish || !i.titleRomaji).length;
  if (missingLangCount > 0 && !state.enrichRunning) {
    enrichMissingMetadata(false);
  }

  renderNavigation();
  renderAll();
  showToast(`Display titles: ${state.titleLang === 'romaji' ? 'Romaji' : 'English'}`);
}

// ---------------------------------------------------------------------------
// Central Event Delegation
// ---------------------------------------------------------------------------

document.addEventListener('click', async (e) => {
  const btn         = e.target.closest('[data-action]');
  const dropdown    = document.getElementById('tomeDropdown');
  const moreActions = document.getElementById('moreActionsMenu');

  if (!e.target.closest('#tomeMenuBtn') && !e.target.closest('#tomeDropdown') && dropdown) {
    dropdown.classList.add('hidden');
  }

  if (!e.target.closest('#moreActionsBtn') && !e.target.closest('#moreActionsMenu') && moreActions) {
    moreActions.classList.add('hidden');
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
  } else if (action === 'toggle-more-actions') {
    if (moreActions) moreActions.classList.toggle('hidden');
  } else if (action === 'switch-view') {
    state.view = btn.dataset.view;
    if (dropdown) dropdown.classList.add('hidden');
    renderAll();
  } else if (action === 'set-category') {
    state.category = btn.dataset.category;
    state.scoreFilter = null;
    state.renderLimit = 36;
    if (moreActions) moreActions.classList.add('hidden');
    renderAll();
  } else if (action === 'set-status') {
    state.status = btn.dataset.status;
    state.scoreFilter = null;
    state.renderLimit = 36;
    renderAll();
  } else if (action === 'clear-library-search') {
    state.search = '';
    state.scoreFilter = null;
    state.renderLimit = 36;
    const inp = document.getElementById('librarySearchInput');
    if (inp) inp.value = '';
    btn.classList.add('hidden');
    renderAll();
  } else if (action === 'open-add-modal') {
    openMediaModal(null);
  } else if (action === 'close-modal') {
    closeMediaModal(false);
  } else if (action === 'clear-modal-form') {
    document.getElementById('fieldTitle').value = '';
    document.getElementById('fieldRating').value = '0';
    document.getElementById('fieldProgress').value = '0';
    document.getElementById('fieldTotalUnits').value = '12';
    document.getElementById('fieldStudio').value = '';
    document.getElementById('fieldReleaseDate').value = '';
    document.getElementById('fieldImage').value = '';
    document.getElementById('fieldNotes').value = '';
    document.getElementById('fieldSynopsis').value = '';
    const dStart = document.getElementById('fieldDateStart');
    const dEnd   = document.getElementById('fieldDateEnd');
    const dRaw   = document.getElementById('fieldConsumedDate');
    const rTog   = document.getElementById('fieldRangeToggle');
    const endRow = document.getElementById('dateEndRow');
    if (dStart) dStart.value = '';
    if (dEnd)   dEnd.value   = '';
    if (dRaw)   dRaw.value   = '';
    if (rTog)   rTog.checked = false;
    if (endRow) endRow.classList.add('hidden');
    currentModalGenres = [];
    renderModalGenreTags();
    updateModalPosterPreview('');
    checkDuplicateTitle('', null);
    showToast('Form cleared');
  } else if (action === 'quick-step-progress') {
    const delta = parseInt(btn.dataset.delta, 10) || 0;
    const progInp = document.getElementById('fieldProgress');
    const totInp  = document.getElementById('fieldTotalUnits');
    if (progInp) {
      const cur = parseInt(progInp.value, 10) || 0;
      const tot = parseInt(totInp?.value, 10) || 1;
      const next = Math.max(0, cur + delta);
      progInp.value = next;
      const statSel = document.getElementById('fieldStatus');
      if (tot > 0 && next >= tot && statSel && statSel.value === 'Ongoing') {
        statSel.value = 'Completed';
      } else if (tot > 0 && next < tot && statSel && statSel.value === 'Completed') {
        statSel.value = 'Ongoing';
      }
    }
  } else if (action === 'toggle-title-lang') {
    triggerTitleLangToggle();
  } else if (action === 'open-shortcuts-modal') {
    if (dropdown) dropdown.classList.add('hidden');
    document.getElementById('shortcutsModal')?.classList.remove('hidden');
  } else if (action === 'close-shortcuts-modal') {
    document.getElementById('shortcutsModal')?.classList.add('hidden');
  } else if (action === 'open-share-modal') {
    if (dropdown) dropdown.classList.add('hidden');
    openShareModal();
  } else if (action === 'close-share-modal') {
    closeShareModal();
  } else if (action === 'switch-share-mode') {
    state.shareMode = btn.dataset.mode;
    updateShareModalModeButtons();
    renderShareCard();
  } else if (action === 'share-current-modal-item') {
    const curId = document.getElementById('fieldId')?.value;
    if (curId) {
      closeMediaModal(true);
      openShareModal(curId);
    } else {
      showToast('Save the entry first before sharing its review card.');
    }
  } else if (action === 'download-share-card') {
    downloadShareCard();
  } else if (action === 'copy-share-card') {
    copyShareCard();
  } else if (action === 'set-density') {
    const dens = btn.dataset.density;
    if (dens && (dens === 'grid' || dens === 'list')) {
      state.viewDensity = dens;
      try { localStorage.setItem('omnichart_density', dens); } catch (e) {}
      renderNavigation();
      renderLibrary();
    }
  } else if (action === 'toggle-sort-dir') {
    state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    try { localStorage.setItem('omnichart_sort_dir', state.sortDir); } catch (err) {}
    renderNavigation();
    renderLibrary();
  } else if (action === 'toggle-cal-week-start') {
    state.weekStart = state.weekStart === 'mon' ? 'sun' : 'mon';
    try { localStorage.setItem('omnichart_week_start', state.weekStart); } catch (e) {}
    renderCalendar();
  } else if (action === 'save-media') {
    saveMediaFromModal();
  } else if (action === 'toggle-favorite') {
    e.stopPropagation();
    const id = btn.dataset.id;
    const item = state.items.find((i) => i.id === id);
    if (item) {
      item.favorite = !item.favorite;
      item.updatedAt = Date.now();
      saveItems(true, item);
      renderNavigation();
      renderLibrary();
      showToast(item.favorite ? `Marked "${item.title}" as Favorite ★` : `Removed "${item.title}" from Favorites`);
    }
  } else if (action === 'filter-by-tag') {
    e.stopPropagation();
    const tag = btn.dataset.tag;
    state.search = tag;
    const searchInput = document.getElementById('librarySearchInput');
    if (searchInput) searchInput.value = tag;
    renderLibrary();
  } else if (action === 'stats-filter-status') {
    state.status = btn.dataset.status;
    state.scoreFilter = null;
    state.renderLimit = 36;
    state.view = 'library';
    renderAll();
  } else if (action === 'stats-filter-score') {
    const score = parseInt(btn.dataset.score, 10);
    state.view = 'library';
    state.status = 'All';
    state.scoreFilter = score;
    state.renderLimit = 36;
    renderAll();
    showToast(score === 0 ? 'Viewing unrated titles in Library' : `Viewing ${score}★ rated titles in Library`);
  } else if (action === 'stats-filter-studio') {
    const studio = btn.dataset.studio;
    state.view = 'library';
    state.scoreFilter = null;
    state.renderLimit = 36;
    state.search = studio;
    const lInp = document.getElementById('librarySearchInput');
    if (lInp) lInp.value = studio;
    renderAll();
    showToast(`Filtered library by studio "${studio}"`);
  } else if (action === 'stats-open-genre') {
    const genre = btn.dataset.genre;
    state.view = 'genre';
    renderAll();
    setTimeout(() => {
      const section = Array.from(document.querySelectorAll('#genreGrid h3')).find(h => h.textContent.trim().toLowerCase() === genre.toLowerCase());
      if (section) section.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  } else if (action === 'toggle-undated-tray') {
    state.showUndatedTray = !state.showUndatedTray;
    renderCalendar();
  } else if (action === 'set-item-finished-today') {
    const id = btn.dataset.id;
    const item = state.items.find(i => i.id === id);
    if (item) {
      const now = new Date();
      const dd = String(now.getDate());
      const mm = String(now.getMonth() + 1);
      const yyyy = String(now.getFullYear());
      item.consumedDate = `${dd}-${mm}-${yyyy}`;
      item.updatedAt = Date.now();
      saveItems(true, item);
      renderAll();
      showToast(`Logged "${item.title}" finished today (${item.consumedDate}) 📅`);
    }
  } else if (action === 'toggle-card-synopsis') {
    e.stopPropagation();
    const id = btn.dataset.id;
    if (!id) return;
    if (state.expandedSynopses.has(id)) state.expandedSynopses.delete(id);
    else state.expandedSynopses.add(id);
    renderLibrary();
  } else if (action === 'edit-item-focus-review') {
    e.stopPropagation();
    const item = state.items.find((i) => i.id === btn.dataset.id);
    if (item) {
      openMediaModal(item);
      const acc = document.getElementById('modalMoreDetailsAccordion');
      if (acc) acc.open = true;
      setTimeout(() => document.getElementById('fieldNotes')?.focus(), 60);
    }
  } else if (action === 'load-more-items') {
    state.renderLimit = (state.renderLimit || 36) + 36;
    renderLibrary();
  } else if (action === 'load-all-items') {
    state.renderLimit = Math.max(36, state.items.length);
    renderLibrary();
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
    state.undoBuffer = { previousItems: JSON.parse(JSON.stringify(state.items)) };
    state.items = state.items.filter((i) => i.id !== id);
    state.selectedIds.delete(id);
    saveItems();
    if (typeof CloudSync !== 'undefined' && CloudSync.deleteItem) {
      CloudSync.deleteItem(id);
    }
    renderAll();
    showToast('Entry removed', { undoAction: true, duration: 6000 });
  } else if (action === 'toast-close') {
    document.getElementById('toastBox')?.classList.add('hidden');
    clearTimeout(showToast._t);
  } else if (action === 'toast-undo') {
    if (state.undoBuffer && Array.isArray(state.undoBuffer.previousItems)) {
      state.items = state.undoBuffer.previousItems;
      state.undoBuffer = null;
      saveItems();
      renderAll();
      showToast('Action undone! Restored library entries.');
    }
  } else if (action === 'dismiss-guest-banner') {
    sessionStorage.setItem('omnichart_dismiss_guest_banner', 'true');
    updateGuestBanner();
  } else if (action === 'confirm-modal-backup') {
    exportLibraryJSON();
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
    const prevProgress = Number(item.progress || 0);
    item.progress = Math.min(total, Math.max(0, prevProgress + delta));
    if (item.progress === total) {
      item.status = 'Completed';
    } else if (prevProgress === total && item.progress < total && item.status === 'Completed') {
      item.status = 'Ongoing';
    }
    item.updatedAt = Date.now();
    saveItems(true, item);
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
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dStart = document.getElementById('fieldDateStart');
    if (dStart) {
      dStart.value = `${y}-${m}-${day}`;
      syncDatePickerToHiddenField();
    }
  } else if (action === 'clear-date-field') {
    const dStart = document.getElementById('fieldDateStart');
    const dEnd   = document.getElementById('fieldDateEnd');
    const dRaw   = document.getElementById('fieldConsumedDate');
    const rTog   = document.getElementById('fieldRangeToggle');
    const endRow = document.getElementById('dateEndRow');
    if (dStart) dStart.value = '';
    if (dEnd)   dEnd.value   = '';
    if (dRaw)   dRaw.value   = '';
    if (rTog)   rTog.checked = false;
    if (endRow) endRow.classList.add('hidden');
  } else if (action === 'pick-search-result') {
    const r = (window._lastSearchResults || [])[parseInt(btn.dataset.idx, 10)];
    if (r) {
      state.currentModalTitleEnglish = r.titleEnglish || '';
      state.currentModalTitleRomaji  = r.titleRomaji || '';

      if (!state.currentModalTitleEnglish || !state.currentModalTitleRomaji) {
        const match = lookupBilingualTitle(r.title) || lookupBilingualTitle(r.titleEnglish) || lookupBilingualTitle(r.titleRomaji);
        if (match) {
          if (!state.currentModalTitleEnglish && match.english) state.currentModalTitleEnglish = match.english;
          if (!state.currentModalTitleRomaji && match.romaji) state.currentModalTitleRomaji = match.romaji;
        }
      }

      const fieldEng = document.getElementById('fieldTitleEnglish');
      const fieldRom = document.getElementById('fieldTitleRomaji');
      if (fieldEng) {
        fieldEng.value = state.currentModalTitleEnglish || '';
        delete fieldEng.dataset.userEdited;
      }
      if (fieldRom) {
        fieldRom.value = state.currentModalTitleRomaji || '';
        delete fieldRom.dataset.userEdited;
      }

      const chosenTitle = (state.titleLang === 'romaji')
        ? (state.currentModalTitleRomaji || state.currentModalTitleEnglish || r.title || '')
        : (state.currentModalTitleEnglish || state.currentModalTitleRomaji || r.title || '');

      document.getElementById('fieldTitle').value = chosenTitle;
      const catField = document.getElementById('fieldCategory');
      if (catField) {
        catField.value = r.category || 'Series & Anime';
        catField.dispatchEvent(new Event('change'));
      }
      const totalVal = r.totalUnits || (r.category === 'Movies' ? 1 : 12);
      document.getElementById('fieldTotalUnits').value  = totalVal;
      document.getElementById('fieldProgress').value    = document.getElementById('fieldStatus').value === 'Completed' ? totalVal : 0;
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
    if (moreActions) moreActions.classList.add('hidden');
    if (!OwnerMode.isOwner()) {
      showToast('Read-Only mode: Enter owner passcode to enrich library');
      return;
    }
    enrichMissingMetadata(false);
  } else if (action === 'stop-enrich') {
    state.enrichStopRequested = true;
  } else if (action === 'export-json') {
    if (moreActions) moreActions.classList.add('hidden');
    exportLibraryJSON();
  } else if (action === 'toggle-bulk-mode') {
    if (moreActions) moreActions.classList.add('hidden');
    if (!OwnerMode.isOwner()) {
      showToast('Read-Only mode: Bulk delete requires Owner Mode');
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
    openConfirmModal({
      title: `Delete ${count} Selected Entries?`,
      message: `This will remove the ${count} selected entries from your library.`,
      onConfirm: () => {
        const deletedIds = Array.from(state.selectedIds);
        state.undoBuffer = { previousItems: JSON.parse(JSON.stringify(state.items)) };
        state.items = state.items.filter((i) => !state.selectedIds.has(i.id));
        state.selectedIds.clear();
        saveItems();
        if (typeof CloudSync !== 'undefined' && CloudSync.deleteItems) {
          CloudSync.deleteItems(deletedIds);
        }
        renderAll();
        showToast(`Removed ${count} entries`, { undoAction: true, duration: 6000 });
      }
    });
  } else if (action === 'bulk-delete-filtered') {
    if (!OwnerMode.isOwner()) return;
    const visible = getFilteredItems();
    if (visible.length === 0) return;
    openConfirmModal({
      title: `Delete All ${visible.length} Shown Entries?`,
      message: `This will remove all ${visible.length} entries currently matching your active filter.`,
      requirePhrase: 'DELETE',
      onConfirm: () => {
        const deletedIds = visible.map((i) => i.id);
        const removeSet = new Set(deletedIds);
        state.undoBuffer = { previousItems: JSON.parse(JSON.stringify(state.items)) };
        state.items = state.items.filter((i) => !removeSet.has(i.id));
        state.selectedIds.clear();
        saveItems();
        if (typeof CloudSync !== 'undefined' && CloudSync.deleteItems) {
          CloudSync.deleteItems(deletedIds);
        }
        renderAll();
        showToast(`Removed ${visible.length} entries`, { undoAction: true, duration: 6000 });
      }
    });
  } else if (action === 'bulk-wipe-all') {
    if (!OwnerMode.isOwner()) return;
    if (state.items.length === 0) return;
    const total = state.items.length;
    openConfirmModal({
      title: `Wipe Entire Library (${total} Entries)?`,
      message: `This will completely clear all ${total} entries from OmniChart so you can start fresh. Make sure to download a backup copy first!`,
      requirePhrase: 'DELETE',
      onConfirm: async () => {
        state.undoBuffer = { previousItems: JSON.parse(JSON.stringify(state.items)) };
        state.items = [];
        state.selectedIds.clear();
        state.bulkMode = false;
        saveItems();
        if (state.user && typeof CloudSync !== 'undefined' && CloudSync.clearUserLibrary) {
          await CloudSync.clearUserLibrary();
        }
        renderAll();
        showToast('Library wiped clean', { undoAction: true, duration: 7000 });
      }
    });
  } else if (action === 'close-confirm-modal') {
    document.getElementById('confirmModal').classList.add('hidden');
    state.pendingConfirmFn = null;
  } else if (action === 'confirm-modal-proceed') {
    document.getElementById('confirmModal').classList.add('hidden');
    if (typeof state.pendingConfirmFn === 'function') state.pendingConfirmFn();
    state.pendingConfirmFn = null;
  } else if (action === 'toggle-genre-expand') {
    const genre = btn.dataset.genre;
    state.genreExpanded = state.genreExpanded || {};
    state.genreExpanded[genre] = !state.genreExpanded[genre];
    renderGenreView();
  } else if (action === 'fix-uncategorized') {
    const uncategorizedItems = state.items.filter((item) => {
      return !item.genres || !Array.isArray(item.genres) || item.genres.length === 0 ||
        (item.genres.length === 1 && item.genres[0].toLowerCase() === 'uncategorized');
    });
    if (uncategorizedItems.length === 0) {
      showToast('No uncategorized titles to fix!');
    } else {
      showToast(`Fetching genres for ${uncategorizedItems.length} uncategorized titles...`);
      enrichMissingMetadata(false, uncategorizedItems);
    }
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
            <p class="leading-relaxed">Please check your inbox to confirm your email before signing in (<strong>${esc(email)}</strong>).</p>
          `;
        } else if (code === 'over_email_send_rate_limit' || msg.toLowerCase().includes('rate limit')) {
          errEl.innerHTML = `
            <div class="font-bold text-rose-300 flex items-center gap-1.5">
              <span>⏳</span> Email Rate Limit Reached
            </div>
            <p class="leading-relaxed">Too many email requests sent. Please wait a few minutes before trying again.</p>
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
            <p>Account created for <strong>${esc(email)}</strong>. Please check your email to verify your account.</p>
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
            <p class="leading-relaxed">Too many email requests sent. Please wait a few minutes before trying again.</p>
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
    const keepLocal = confirm('Keep a copy of your library on this device for offline guest use?');
    window._signingOutPromptHandled = true;
    await CloudSync.signOut();
    if (!keepLocal) {
      state.items = [];
      saveItems(false);
    }
    renderAll();
    document.getElementById('authModal').classList.add('hidden');
    showToast(keepLocal ? 'Signed out. Your library is kept for offline guest use.' : 'Signed out. Switched to clean guest mode.');
  } else if (action === 'show-forgot-password-view') {
    openAuthModal('forgot-password');
  } else if (action === 'show-sign-in-view') {
    openAuthModal('account');
  } else if (action === 'auth-send-reset-link') {
    const email = document.getElementById('authResetEmailInput')?.value?.trim();
    const successEl = document.getElementById('authResetSuccessMessage');
    const errEl = document.getElementById('authResetErrorMessage');
    if (successEl) successEl.classList.add('hidden');
    if (errEl) errEl.classList.add('hidden');

    if (!email || !email.includes('@')) {
      if (errEl) {
        errEl.textContent = '⚠️ Please enter a valid email address.';
        errEl.classList.remove('hidden');
      }
      return;
    }

    btn.disabled = true;
    const origText = btn.innerHTML;
    btn.textContent = 'Sending...';

    try {
      await CloudSync.resetPasswordForEmail(email);
      if (successEl) {
        successEl.innerHTML = `
          <div class="font-bold text-white flex items-center gap-1.5 mb-0.5">
            <span>✉️</span> Reset Link Sent!
          </div>
          <p>We've sent a password reset link to <strong>${esc(email)}</strong>. Please check your inbox.</p>
        `;
        successEl.classList.remove('hidden');
      }
      showToast('Password reset email sent! Check your inbox.');
    } catch (err) {
      if (errEl) {
        const msg = err.message || '';
        if (msg.toLowerCase().includes('rate limit')) {
          errEl.innerHTML = `⏳ Rate limit reached for reset emails. Please wait a few minutes before trying again.`;
        } else {
          errEl.textContent = msg || 'Failed to send password reset email. Please try again.';
        }
        errEl.classList.remove('hidden');
      }
    } finally {
      btn.disabled = false;
      btn.innerHTML = origText;
    }
  } else if (action === 'auth-update-password') {
    const newPwd = document.getElementById('authNewPasswordInput')?.value?.trim();
    const confirmPwd = document.getElementById('authConfirmPasswordInput')?.value?.trim();
    const errEl = document.getElementById('authNewPasswordErrorMessage');
    if (errEl) errEl.classList.add('hidden');

    if (!newPwd || !confirmPwd) {
      if (errEl) {
        errEl.textContent = '⚠️ Please enter and confirm your new password.';
        errEl.classList.remove('hidden');
      }
      return;
    }
    if (newPwd.length < 6) {
      if (errEl) {
        errEl.textContent = '⚠️ Password must be at least 6 characters.';
        errEl.classList.remove('hidden');
      }
      return;
    }
    if (newPwd !== confirmPwd) {
      if (errEl) {
        errEl.textContent = '⚠️ Passwords do not match. Please re-enter.';
        errEl.classList.remove('hidden');
      }
      return;
    }

    btn.disabled = true;
    const origText = btn.innerHTML;
    btn.textContent = 'Updating...';

    try {
      const data = await CloudSync.updatePassword(newPwd);
      if (data?.user) {
        state.user = data.user;
        renderAuthStatus();
      }
      if (window.location.hash.includes('access_token') || window.location.hash.includes('type=recovery')) {
        history.replaceState(null, '', window.location.pathname);
      }
      document.getElementById('authModal').classList.add('hidden');
      showToast('🎉 Password updated successfully! You are now signed in.');
    } catch (err) {
      if (errEl) {
        errEl.textContent = err.message || 'Failed to update password. Please try again or request a new reset link.';
        errEl.classList.remove('hidden');
      }
    } finally {
      btn.disabled = false;
      btn.innerHTML = origText;
    }
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
    state.sortKey = e.target.value;
    try { localStorage.setItem('omnichart_sort_key', state.sortKey); } catch (err) {}
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

function compressImageFile(file, maxWidth = 360, maxHeight = 540, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxWidth || h > maxHeight) {
          const ratio = Math.min(maxWidth / w, maxHeight / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const posterUpload = document.getElementById('posterUploadInput');
if (posterUpload) {
  posterUpload.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      showToast('Compressing image...');
      const compressedDataUrl = await compressImageFile(file);
      document.getElementById('fieldImage').value = compressedDataUrl;
      updateModalPosterPreview(compressedDataUrl);
      showToast('Poster uploaded & compressed');
    } catch (err) {
      showToast('Could not process image');
    }
  });
}

// Date Picker Synchronization Listeners (F4)
const dStartInp = document.getElementById('fieldDateStart');
if (dStartInp) {
  dStartInp.addEventListener('change', () => {
    syncDatePickerToHiddenField();
  });
}

const dEndInp = document.getElementById('fieldDateEnd');
if (dEndInp) {
  dEndInp.addEventListener('change', () => {
    syncDatePickerToHiddenField();
  });
}

const rToggle = document.getElementById('fieldRangeToggle');
if (rToggle) {
  rToggle.addEventListener('change', (e) => {
    const endRow = document.getElementById('dateEndRow');
    if (endRow) {
      if (e.target.checked) {
        endRow.classList.remove('hidden');
      } else {
        endRow.classList.add('hidden');
        const endInput = document.getElementById('fieldDateEnd');
        if (endInput) endInput.value = '';
      }
    }
    syncDatePickerToHiddenField();
  });
}

// Guardrail confirmation phrase listener (D3)
const confirmPhraseInp = document.getElementById('confirmModalInput');
if (confirmPhraseInp) {
  confirmPhraseInp.addEventListener('input', () => {
    const actionBtn = document.getElementById('confirmModalActionBtn');
    if (!state.confirmRequirePhrase || !actionBtn) return;
    if (confirmPhraseInp.value.trim().toUpperCase() === state.confirmRequirePhrase.toUpperCase()) {
      actionBtn.classList.remove('opacity-50', 'pointer-events-none');
    } else {
      actionBtn.classList.add('opacity-50', 'pointer-events-none');
    }
  });
}

const impFile = document.getElementById('importFileInput');
if (impFile) {
  impFile.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dropdown = document.getElementById('tomeDropdown');
    if (dropdown) dropdown.classList.add('hidden');
    importLibraryJSON(file);
    e.target.value = '';
  });
}

const shareItemSelectEl = document.getElementById('shareItemSelect');
if (shareItemSelectEl) {
  shareItemSelectEl.addEventListener('change', (e) => {
    state.shareSelectedItemId = e.target.value;
    renderShareCard();
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

// Update modal category-aware fields and popular genre tray (F2)
const modalCatSelect = document.getElementById('fieldCategory');
if (modalCatSelect) {
  modalCatSelect.addEventListener('change', (e) => {
    updateCategoryAwareFormFields();

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

// Status-aware progress defaults (F5)
const modalStatusSelect = document.getElementById('fieldStatus');
if (modalStatusSelect) {
  modalStatusSelect.addEventListener('change', (e) => {
    const val = normalizeStatus(e.target.value);
    const progInp = document.getElementById('fieldProgress');
    const totInp  = document.getElementById('fieldTotalUnits');
    if (val === 'Completed' && progInp && totInp) {
      progInp.value = totInp.value || 1;
    } else if (val === 'Planning' && progInp) {
      progInp.value = 0;
    }
  });
}

// Duplicate title detection on input (F11) + Bilingual title auto-fill (L7)
const modalTitleInput = document.getElementById('fieldTitle');
if (modalTitleInput) {
  modalTitleInput.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    const curId = document.getElementById('fieldId')?.value || '';
    checkDuplicateTitle(val, curId);

    if (val) {
      const match = lookupBilingualTitle(val);
      if (match) {
        const fieldEng = document.getElementById('fieldTitleEnglish');
        const fieldRom = document.getElementById('fieldTitleRomaji');
        if (fieldEng && !fieldEng.dataset.userEdited && match.english) {
          fieldEng.value = match.english;
        }
        if (fieldRom && !fieldRom.dataset.userEdited && match.romaji) {
          fieldRom.value = match.romaji;
        }
      }
    }
  });
}

// Track user-edited status for English & Romaji inputs
const fieldTitleEngEl = document.getElementById('fieldTitleEnglish');
if (fieldTitleEngEl) {
  fieldTitleEngEl.addEventListener('input', () => {
    fieldTitleEngEl.dataset.userEdited = 'true';
  });
}
const fieldTitleRomEl = document.getElementById('fieldTitleRomaji');
if (fieldTitleRomEl) {
  fieldTitleRomEl.addEventListener('input', () => {
    fieldTitleRomEl.dataset.userEdited = 'true';
  });
}

// Media Modal Backdrop & Keyboard Shortcut Listeners (F8, F10)
const mediaModalEl = document.getElementById('mediaModal');
if (mediaModalEl) {
  mediaModalEl.addEventListener('click', (e) => {
    if (e.target === mediaModalEl) {
      closeMediaModal(false);
    }
  });

  mediaModalEl.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      saveMediaFromModal();
    }
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

const authResetEmailInp = document.getElementById('authResetEmailInput');
if (authResetEmailInp) {
  authResetEmailInp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('authSendResetBtn')?.click();
    }
  });
}

const authNewPwdInp = document.getElementById('authNewPasswordInput');
if (authNewPwdInp) {
  authNewPwdInp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('authConfirmPasswordInput')?.focus();
    }
  });
}

const authConfirmPwdInp = document.getElementById('authConfirmPasswordInput');
if (authConfirmPwdInp) {
  authConfirmPwdInp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('authUpdatePasswordBtn')?.click();
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

const shortcutsModalBackdrop = document.getElementById('shortcutsModal');
if (shortcutsModalBackdrop) {
  shortcutsModalBackdrop.addEventListener('click', (e) => {
    if (e.target === shortcutsModalBackdrop) {
      shortcutsModalBackdrop.classList.add('hidden');
    }
  });
}

// ---------------------------------------------------------------------------
// Keyboard Shortcuts Navigation & Actions
// ---------------------------------------------------------------------------
document.addEventListener('keydown', (e) => {
  const activeEl = document.activeElement;
  const tag = activeEl ? activeEl.tagName.toLowerCase() : '';
  const isTyping = tag === 'input' || tag === 'textarea' || tag === 'select' || (activeEl && activeEl.isContentEditable);

  if (e.key === 'Escape') {
    const shareModal = document.getElementById('shareModal');
    if (shareModal && !shareModal.classList.contains('hidden')) {
      closeShareModal();
      return;
    }
    const shortcutsModal = document.getElementById('shortcutsModal');
    if (shortcutsModal && !shortcutsModal.classList.contains('hidden')) {
      shortcutsModal.classList.add('hidden');
      return;
    }
    const tomeMenu = document.getElementById('tomeDropdown');
    if (tomeMenu && !tomeMenu.classList.contains('hidden')) {
      tomeMenu.classList.add('hidden');
    }
    const moreActions = document.getElementById('moreActionsMenu');
    if (moreActions && !moreActions.classList.contains('hidden')) {
      moreActions.classList.add('hidden');
    }
    const authModal = document.getElementById('authModal');
    if (authModal && !authModal.classList.contains('hidden')) {
      authModal.classList.add('hidden');
    }
    const mediaModal = document.getElementById('mediaModal');
    if (mediaModal && !mediaModal.classList.contains('hidden')) {
      closeMediaModal(false);
    }
    const confirmModal = document.getElementById('confirmModal');
    if (confirmModal && !confirmModal.classList.contains('hidden')) {
      confirmModal.classList.add('hidden');
      state.pendingConfirmFn = null;
    }
    if (activeEl && typeof activeEl.blur === 'function') {
      activeEl.blur();
    }
    return;
  }

  // Do not trigger single-key actions if the user is typing in a form or field
  if (isTyping) return;

  // Don't trigger if Ctrl / Cmd / Alt is held
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  if (e.key === '/') {
    e.preventDefault();
    if (state.view === 'genre') {
      const gInp = document.getElementById('genreViewSearchInput');
      if (gInp) { gInp.focus(); gInp.select(); }
    } else {
      const lInp = document.getElementById('librarySearchInput');
      if (lInp) { lInp.focus(); lInp.select(); }
    }
  } else if (e.key === 'n' || e.key === 'N' || e.key === '+') {
    e.preventDefault();
    openMediaModal(null);
  } else if (e.key === '1') {
    state.view = 'library';
    document.getElementById('tomeDropdown')?.classList.add('hidden');
    renderAll();
  } else if (e.key === '2') {
    state.view = 'calendar';
    document.getElementById('tomeDropdown')?.classList.add('hidden');
    renderAll();
  } else if (e.key === '3') {
    state.view = 'genre';
    document.getElementById('tomeDropdown')?.classList.add('hidden');
    renderAll();
  } else if (e.key === '4') {
    state.view = 'stats';
    document.getElementById('tomeDropdown')?.classList.add('hidden');
    renderAll();
  } else if (e.key === 'l' || e.key === 'L') {
    triggerTitleLangToggle();
  } else if (e.key === 'd' || e.key === 'D') {
    state.viewDensity = state.viewDensity === 'list' ? 'grid' : 'list';
    try { localStorage.setItem('omnichart_density', state.viewDensity); } catch (err) {}
    renderNavigation();
    renderLibrary();
    showToast(`Density: ${state.viewDensity === 'list' ? 'Compact List' : 'Grid'}`);
  } else if (e.key === 's' || e.key === 'S') {
    e.preventDefault();
    openShareModal();
  } else if (e.key === '?') {
    e.preventDefault();
    const shortcutsModal = document.getElementById('shortcutsModal');
    if (shortcutsModal) {
      shortcutsModal.classList.toggle('hidden');
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
