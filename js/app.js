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
  if (state.titleLang === 'english' && item.titleEnglish && item.titleEnglish.trim()) {
    return item.titleEnglish.trim();
  }
  if (state.titleLang === 'romaji' && item.titleRomaji && item.titleRomaji.trim()) {
    return item.titleRomaji.trim();
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
      const itemStatus = (typeof normalizeStatus === 'function') ? normalizeStatus(item.status) : item.status;
      if (itemStatus !== state.status) return false;
    }
    if (q) {
      const eng = item.titleEnglish || '';
      const rom = item.titleRomaji || '';
      const hay = `${item.title} ${eng} ${rom} ${item.studio || ''} ${(item.genres || []).join(' ')} ${item.consumedDate || ''}`.toLowerCase();
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

  // Update counts in desktop nav and tome menu
  const libCountEl  = document.getElementById('menuLibraryCount');
  const calCountEl  = document.getElementById('menuCalendarCount');
  const genreCountEl = document.getElementById('menuGenreCount');
  if (libCountEl)  libCountEl.textContent  = libCount;
  if (calCountEl)  calCountEl.textContent  = datedCount;
  if (genreCountEl) genreCountEl.textContent = genreCount;

  const topLibCount   = document.getElementById('navLibraryCount');
  const topCalCount   = document.getElementById('navCalendarCount');
  const topGenreCount = document.getElementById('navGenreCount');
  if (topLibCount)   topLibCount.textContent   = libCount;
  if (topCalCount)   topCalCount.textContent   = datedCount;
  if (topGenreCount) topGenreCount.textContent = genreCount;

  // Desktop Primary Navigation Tabs active state (N1)
  const topNavLib   = document.getElementById('topNavLibrary');
  const topNavCal   = document.getElementById('topNavCalendar');
  const topNavGenre = document.getElementById('topNavGenre');

  const topActiveCls   = 'px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 bg-[#2c3539] text-[#ff9f1c] border border-[#3d494f] shadow-sm';
  const topInactiveCls = 'px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-[#364146] transition flex items-center gap-1.5';

  if (topNavLib)   topNavLib.className   = (state.view === 'library')  ? topActiveCls : topInactiveCls;
  if (topNavCal)   topNavCal.className   = (state.view === 'calendar') ? topActiveCls : topInactiveCls;
  if (topNavGenre) topNavGenre.className = (state.view === 'genre')    ? topActiveCls : topInactiveCls;

  // Mobile Bottom Navigation active state (N1 Mobile)
  const mNavLib   = document.getElementById('mobileNavLibrary');
  const mNavCal   = document.getElementById('mobileNavCalendar');
  const mNavGenre = document.getElementById('mobileNavGenre');

  if (mNavLib)   mNavLib.className   = `flex flex-col items-center gap-0.5 ${state.view === 'library' ? 'text-[#ff9f1c]' : 'text-slate-400 hover:text-white'}`;
  if (mNavCal)   mNavCal.className   = `flex flex-col items-center gap-0.5 ${state.view === 'calendar' ? 'text-[#ff9f1c]' : 'text-slate-400 hover:text-white'}`;
  if (mNavGenre) mNavGenre.className = `flex flex-col items-center gap-0.5 ${state.view === 'genre' ? 'text-[#ff9f1c]' : 'text-slate-400 hover:text-white'}`;

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
  }

  // Update Toolbar Toggles (L7, L9, L10)
  const langBadge = document.getElementById('titleLangBadge');
  const langText  = document.getElementById('titleLangText');
  if (langBadge) langBadge.textContent = state.titleLang === 'romaji' ? 'JA' : 'EN';
  if (langText)  langText.textContent  = state.titleLang === 'romaji' ? 'Romaji' : 'English';

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
}
window.openAuthModal = openAuthModal;

function switchAuthTab(tab) {
  state.authTab = tab;
  const accountView = state.user ? document.getElementById('authLoggedInView') : document.getElementById('authLoggedOutView');
  const setupView   = document.getElementById('authSetupView');
  if (setupView) setupView.classList.add('hidden');
  if (accountView) accountView.classList.remove('hidden');
}

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
            <span>📂</span> Import JSON backup
            <input id="onboardingImportInput" type="file" accept=".json,application/json" class="hidden" />
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
      const displayStatus = (typeof normalizeStatus === 'function') ? normalizeStatus(item.status) : item.status;
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
      const displayStatus = (typeof normalizeStatus === 'function') ? normalizeStatus(item.status) : item.status;
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

  // Monthly summary stats (C1)
  const currentMonthPrefix = `${state.calYear}-${state.calMonth}-`;
  let monthEventCount = 0;
  for (const [key, evList] of eventsByKey.entries()) {
    if (key.startsWith(currentMonthPrefix)) monthEventCount += evList.length;
  }
  const summaryEl = document.getElementById('calendarMonthSummary');
  if (summaryEl) {
    summaryEl.textContent = monthEventCount > 0
      ? `${monthEventCount} ${monthEventCount === 1 ? 'item' : 'items'} in ${monthNames[state.calMonth]}`
      : `No items in ${monthNames[state.calMonth]}`;
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
      jumpBar.innerHTML = `<span class="text-xs text-slate-400">Add dates or ranges to your library entries to visualize them here on the calendar.</span>`;
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
      <div class="min-h-[115px] rounded-xl bg-[#2c3539] border ${isToday ? 'border-[#ff9f1c]' : 'border-[#3d494f]'} p-2 flex flex-col justify-between">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold ${isToday ? 'px-1.5 py-0.5 rounded bg-[#ff9f1c] text-[#0d0e11]' : 'text-slate-300'}">${d}</span>
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
    const completedCount = entry.items.filter((i) => {
      const st = (typeof normalizeStatus === 'function') ? normalizeStatus(i.status) : i.status;
      return st === 'Completed';
    }).length;
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
  const curStatus = statusSel?.value || 'Ongoing';
  const totalUnits = document.getElementById('fieldTotalUnits');

  if (cat === 'Movies') {
    if (labelProg) labelProg.textContent = 'Progress (Parts / Movies)';
    if (labelStat) labelStat.textContent = 'Viewing Status';
    if (totalUnits && (!totalUnits.value || totalUnits.value === '12')) {
      totalUnits.value = '1';
    }
    if (statusSel) {
      statusSel.innerHTML = `
        <option value="Completed">Watched</option>
        <option value="Ongoing">Watching</option>
        <option value="On Hold">On Hold</option>
        <option value="Planning">Planning</option>
        <option value="Dropped">Dropped</option>
      `;
      statusSel.value = (curStatus === 'Completed' || curStatus === 'Watched') ? 'Completed' : curStatus;
    }
  } else if (cat === 'Games') {
    if (labelProg) labelProg.textContent = 'Progress (Hours / Chapters)';
    if (labelStat) labelStat.textContent = 'Playing Status';
    if (statusSel) {
      statusSel.innerHTML = `
        <option value="Completed">Beaten / Finished</option>
        <option value="Ongoing">Playing</option>
        <option value="On Hold">On Hold</option>
        <option value="Planning">Planning</option>
        <option value="Dropped">Dropped</option>
      `;
      statusSel.value = (curStatus === 'Completed' || curStatus === 'Beaten') ? 'Completed' : curStatus;
    }
  } else if (cat === 'Books') {
    if (labelProg) labelProg.textContent = 'Progress (Chapters / Pages)';
    if (labelStat) labelStat.textContent = 'Reading Status';
    if (statusSel) {
      statusSel.innerHTML = `
        <option value="Completed">Read</option>
        <option value="Ongoing">Reading</option>
        <option value="On Hold">On Hold</option>
        <option value="Planning">Planning</option>
        <option value="Dropped">Dropped</option>
      `;
      statusSel.value = (curStatus === 'Completed' || curStatus === 'Read') ? 'Completed' : curStatus;
    }
  } else {
    // Series & Anime
    if (labelProg) labelProg.textContent = 'Progress (Episodes)';
    if (labelStat) labelStat.textContent = 'Watch Status';
    if (statusSel) {
      statusSel.innerHTML = `
        <option value="Ongoing">Watching / Ongoing</option>
        <option value="Completed">Completed</option>
        <option value="On Hold">On Hold</option>
        <option value="Planning">Planning</option>
        <option value="Dropped">Dropped</option>
      `;
      statusSel.value = (curStatus === 'Watched' || curStatus === 'Beaten' || curStatus === 'Read') ? 'Completed' : curStatus;
    }
  }
}

function checkDuplicateTitle(title, currentId) {
  const warning = document.getElementById('duplicateTitleWarning');
  const existingEl = document.getElementById('duplicateTitleExisting');
  if (!warning) return;
  const t = (title || '').trim().toLowerCase();
  if (!t) {
    warning.classList.add('hidden');
    return;
  }
  const match = state.items.find(i => i.id !== currentId && (i.title || '').trim().toLowerCase() === t);
  if (match) {
    if (existingEl) existingEl.textContent = match.title;
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

  if (item) {
    document.getElementById('modalTitle').textContent     = 'Edit Media';
    document.getElementById('fieldId').value              = item.id;
    document.getElementById('fieldTitle').value            = item.title || '';
    document.getElementById('fieldCategory').value         = catVal;
    updateCategoryAwareFormFields();
    document.getElementById('fieldStatus').value           = (typeof normalizeStatus === 'function') ? normalizeStatus(item.status) : (item.status || 'Ongoing');
    document.getElementById('fieldRating').value           = item.rating ?? 0;
    document.getElementById('fieldProgress').value         = item.progress ?? 0;
    document.getElementById('fieldTotalUnits').value       = item.totalUnits ?? (catVal === 'Movies' ? 1 : 12);
    document.getElementById('fieldStudio').value           = item.studio || '';
    document.getElementById('fieldReleaseDate').value      = item.releaseDate || '';
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
    updateModalPosterPreview('');

    currentModalGenres = [];
  }

  // Check duplicate title badge (F11)
  const curId = item ? item.id : '';
  checkDuplicateTitle(document.getElementById('fieldTitle').value, curId);

  // Progressive disclosure accordion (F1): open if item has details filled in, else closed
  const acc = document.getElementById('modalMoreDetailsAccordion');
  if (acc) {
    acc.open = !!(item && (item.notes || item.consumedDate || item.synopsis || (item.genres && item.genres.length > 0) || item.studio || item.releaseDate));
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

  // Protect manually-edited fields from being clobbered during metadata enrichment (B3)
  const existingItem = state.items.find((i) => i.id === id);
  const manualFields = new Set(existingItem?._manualFields || []);
  if (document.getElementById('fieldStudio').value.trim()) manualFields.add('studio');
  if (document.getElementById('fieldReleaseDate').value.trim()) manualFields.add('releaseDate');
  if (genres.length > 0) manualFields.add('genres');
  if (document.getElementById('fieldSynopsis').value.trim()) manualFields.add('synopsis');

  const entry = {
    id,
    title,
    category,
    status,
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

  saveItems();
  state.modalInitialSnapshot = null;
  document.getElementById('mediaModal').classList.add('hidden');
  renderAll();
  showToast('Saved entry');
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
      }
    }
  } else if (action === 'toggle-title-lang') {
    state.titleLang = state.titleLang === 'romaji' ? 'english' : 'romaji';
    try { localStorage.setItem('omnichart_title_lang', state.titleLang); } catch (e) {}
    renderNavigation();
    renderAll();
    showToast(`Display titles: ${state.titleLang === 'romaji' ? 'Romaji' : 'English'}`);
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
    renderNavigation();
    renderLibrary();
  } else if (action === 'toggle-cal-week-start') {
    state.weekStart = state.weekStart === 'monday' ? 'sunday' : 'monday';
    try { localStorage.setItem('omnichart_week_start', state.weekStart); } catch (e) {}
    renderCalendar();
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
        state.undoBuffer = { previousItems: JSON.parse(JSON.stringify(state.items)) };
        state.items = state.items.filter((i) => !state.selectedIds.has(i.id));
        state.selectedIds.clear();
        saveItems();
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
        state.undoBuffer = { previousItems: JSON.parse(JSON.stringify(state.items)) };
        const removeSet = new Set(visible.map((i) => i.id));
        state.items = state.items.filter((i) => !removeSet.has(i.id));
        state.selectedIds.clear();
        saveItems();
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
      onConfirm: () => {
        state.undoBuffer = { previousItems: JSON.parse(JSON.stringify(state.items)) };
        state.items = [];
        state.selectedIds.clear();
        state.bulkMode = false;
        saveItems();
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
    const val = (typeof normalizeStatus === 'function') ? normalizeStatus(e.target.value) : e.target.value;
    const progInp = document.getElementById('fieldProgress');
    const totInp  = document.getElementById('fieldTotalUnits');
    if (val === 'Completed' && progInp && totInp) {
      progInp.value = totInp.value || 1;
    } else if (val === 'Planning' && progInp) {
      progInp.value = 0;
    }
  });
}

// Duplicate title detection on input (F11)
const modalTitleInput = document.getElementById('fieldTitle');
if (modalTitleInput) {
  modalTitleInput.addEventListener('input', (e) => {
    const curId = document.getElementById('fieldId')?.value || '';
    checkDuplicateTitle(e.target.value, curId);
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
    const mediaModal = document.getElementById('mediaModal');
    if (mediaModal && !mediaModal.classList.contains('hidden')) {
      closeMediaModal(false);
    }
    const confirmModal = document.getElementById('confirmModal');
    if (confirmModal && !confirmModal.classList.contains('hidden')) {
      confirmModal.classList.add('hidden');
      state.pendingConfirmFn = null;
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
