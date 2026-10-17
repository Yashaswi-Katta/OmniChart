/* ==========================================================================
   OmniChart — Sync & Persistence Module
   localStorage persistence, JSON import / export, LiveChart title recovery,
   Owner Mode vs. Public Read-Only Visitor security, and CloudSync stubs
   for instant Supabase or Firebase cross-device synchronization.
   ========================================================================== */

const STORAGE_KEY = 'omnichart_v4_items';

// ---------------------------------------------------------------------------
// HTML Escaping Utility for XSS Prevention
// ---------------------------------------------------------------------------
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
window.esc = esc;

// ---------------------------------------------------------------------------
// Cloud Sync & Deployment Configuration
// ---------------------------------------------------------------------------
const OMNICHART_CONFIG = {
  // Provider: 'localStorage' (default) | 'supabase' | 'firebase'
  cloudProvider: 'supabase',

  // Owner Mode Protection:
  // Set to true if deploying to GitHub Pages or a public portfolio.
  // Public visitors can browse, search, and view ratings/calendar in read-only.
  // The owner can unlock edit mode by visiting with ?owner=omnichart123
  // or clicking the "Public View" badge and entering the passcode.
  ownerModeEnabled: false,
  ownerPasscode: 'omnichart123',

  // Supabase Configuration:
  // 1. Add CDN to index.html: <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  // 2. Set cloudProvider: 'supabase'
  // 3. Fill url and anonKey below
  supabase: {
    url: 'https://vfwjyulubcmbiuizkwhd.supabase.co',
    anonKey: 'sb_publishable_E_MNyYoiqFaQ6fbLWGQoUA_o4Gxzlr7',
    tableName: 'omnichart_items'
  },

  // Firebase Configuration:
  // 1. Set cloudProvider: 'firebase'
  // 2. Fill credentials below
  firebase: {
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: ''
  }
};

// ---------------------------------------------------------------------------
// Global Application State (Single Source of Truth)
// ---------------------------------------------------------------------------
const state = window.state = {
  items:               [],
  view:                'library',
  category:            'All',
  status:              'All',
  search:              '',
  sort:                'rating-desc',
  cardTab:             {},
  bulkMode:            false,
  selectedIds:         new Set(),
  pendingConfirmFn:    null,
  enrichRunning:       false,
  enrichStopRequested: false,
  calYear:             new Date().getFullYear(),
  calMonth:            new Date().getMonth(),
  genreSort:           'count-desc',
  genreSearch:         '',
  user:                null,
  cloudStatus:         'offline',
  authTab:             'account',
  undoBuffer:          null
};

// ---------------------------------------------------------------------------
// Owner Mode (Public Visitor vs. Library Owner)
// ---------------------------------------------------------------------------
const OwnerMode = {
  isOwner() {
    if (!OMNICHART_CONFIG.ownerModeEnabled) return true;
    const urlParams = new URLSearchParams(window.location.search);
    const paramVal = urlParams.get('owner');
    if (paramVal === OMNICHART_CONFIG.ownerPasscode || paramVal === 'true') {
      localStorage.setItem('omnichart_owner_session', 'true');
      return true;
    }
    return localStorage.getItem('omnichart_owner_session') === 'true';
  },

  unlock(passcode) {
    if (passcode === OMNICHART_CONFIG.ownerPasscode) {
      localStorage.setItem('omnichart_owner_session', 'true');
      return true;
    }
    return false;
  },

  lock() {
    localStorage.removeItem('omnichart_owner_session');
  }
};

// ---------------------------------------------------------------------------
// Recovery map for short anime titles that LiveChart poster overlays
// overwrote with "TV (JP)Released"
// ---------------------------------------------------------------------------
// Recovery map for short anime titles that LiveChart poster overlays
// overwrote with "TV (JP)Released", with English & Romaji titles (L7)
// ---------------------------------------------------------------------------
const LIVECHART_ID_TITLE_RECOVERY = {
  'lc-321':   { title: 'One Piece', english: 'One Piece', romaji: 'One Piece' },
  'lc-3340':  { title: 'Bleach', english: 'Bleach', romaji: 'Bleach' },
  'lc-3437':  { title: 'Death Note', english: 'Death Note', romaji: 'Death Note' },
  'lc-3585':  { title: 'Naruto', english: 'Naruto', romaji: 'Naruto' },
  'lc-3632':  { title: 'Dragon Ball Z', english: 'Dragon Ball Z', romaji: 'Dragon Ball Z' },
  'lc-2478':  { title: 'Black Clover', english: 'Black Clover', romaji: 'Black Clover' },
  'lc-3612':  { title: 'Black Lagoon', english: 'Black Lagoon', romaji: 'Black Lagoon' },
  'lc-9984':  { title: 'A Will Eternal', english: 'A Will Eternal', romaji: 'Yi Nian Yong Heng' },
  'lc-10257': { title: 'Chainsaw Man', english: 'Chainsaw Man', romaji: 'Chainsaw Man' },
  'lc-12428': { title: 'DAN DA DAN', english: 'DAN DA DAN', romaji: 'Dandadan' },
  'lc-9680':  { title: 'JUJUTSU KAISEN', english: 'JUJUTSU KAISEN', romaji: 'Jujutsu Kaisen' },
  'lc-10491': { title: 'JUJUTSU KAISEN 0', english: 'JUJUTSU KAISEN 0', romaji: 'Gekijouban Jujutsu Kaisen 0' },
  'lc-11320': { title: 'Solo Leveling', english: 'Solo Leveling', romaji: 'Ore dake Level Up na Ken' },
  'lc-11247': { title: 'Oshi no Ko', english: '[Oshi No Ko]', romaji: 'Oshi no Ko' },
  'lc-3169':  { title: 'Vinland Saga', english: 'Vinland Saga', romaji: 'Vinland Saga' },
  'lc-10456': { title: 'SPY x FAMILY', english: 'SPY x FAMILY', romaji: 'SPY x FAMILY' },
  'lc-10042': { title: 'Cyberpunk: Edgerunners', english: 'Cyberpunk: Edgerunners', romaji: 'Cyberpunk: Edgerunners' },
  'lc-10687': { title: 'BLUE LOCK', english: 'BLUELOCK', romaji: 'Blue Lock' },
  'lc-11352': { title: 'Kaiju No. 8', english: 'Kaiju No.8', romaji: 'Kaijuu 8-gou' },
  'lc-3418':  { title: 'Cowboy Bebop', english: 'Cowboy Bebop', romaji: 'Cowboy Bebop' },
  'lc-8349':  { title: 'Dr. STONE', english: 'Dr. STONE', romaji: 'Dr. Stone' },
  'lc-8355':  { title: 'Fire Force', english: 'Fire Force', romaji: 'Enen no Shouboutai' },
  'lc-412':   { title: 'Tokyo Ghoul', english: 'Tokyo Ghoul', romaji: 'Tokyo Ghoul' },
  'lc-9793':  { title: 'Tower of God', english: 'Tower of God', romaji: 'Kami no Tou: Tower of God' },
  'lc-3168':  { title: 'Dororo', english: 'Dororo', romaji: 'Dororo' },
  'lc-956':   { title: 'PSYCHO-PASS', english: 'PSYCHO-PASS', romaji: 'Psycho-Pass' },
  'lc-3109':  { title: 'Goblin Slayer', english: 'Goblin Slayer', romaji: 'Goblin Slayer' },
  'lc-1241':  { title: 'Blue Exorcist', english: 'Blue Exorcist', romaji: 'Ao no Exorcist' },
  'lc-154':   { title: 'Noragami', english: 'Noragami: Stray God', romaji: 'Noragami' },
  'lc-1481':  { title: 'Drifters', english: 'Drifters', romaji: 'Drifters' },
  'lc-11916': { title: 'WIND BREAKER', english: 'WIND BREAKER', romaji: 'Wind Breaker' },
  'lc-10891': { title: 'Chained Soldier', english: 'Chained Soldier', romaji: 'Mato Seihei no Slave' },
  'lc-11714': { title: 'Go! Go! Loser Ranger!', english: 'Go! Go! Loser Ranger!', romaji: 'Sentai Daishikkaku' },
  'lc-10281': { title: 'Record of Ragnarok', english: 'Record of Ragnarok', romaji: 'Shuumatsu no Valkyrie' },
  'lc-10754': { title: 'Record of Ragnarok II', english: 'Record of Ragnarok II', romaji: 'Shuumatsu no Valkyrie II' },
  'lc-13083': { title: 'Record of Ragnarok III', english: 'Record of Ragnarok III', romaji: 'Shuumatsu no Valkyrie III' },
  'lc-11088': { title: 'Baki Hanma', english: 'Baki Hanma', romaji: 'Hanma Baki: Son of Ogre' },
  'lc-11380': { title: 'Baki Hanma Season 2', english: 'Baki Hanma Season 2', romaji: 'Hanma Baki 2nd Season' },
  'lc-4603':  { title: 'Mo Dao Zu Shi', english: 'The Founder of Diabolism', romaji: 'Mo Dao Zu Shi' },
  'lc-10083': { title: 'Scissor Seven Season 2', english: 'Scissor Seven Season 2', romaji: 'Cike Wu Liuqi 2nd Season' },
  'lc-10512': { title: "JoJo's Bizarre Adventure: Stone Ocean", english: "JoJo's Bizarre Adventure: STONE OCEAN", romaji: "JoJo no Kimyou na Bouken: Stone Ocean" },
  'lc-10156': { title: 'Horimiya', english: 'Horimiya', romaji: 'Horimiya' },
  'lc-9501':  { title: 'ID: INVADED', english: 'ID: INVADED', romaji: 'Id:Invaded' },
  'lc-1344':  { title: 'Charlotte', english: 'Charlotte', romaji: 'Charlotte' },
  'lc-1280':  { title: 'Death Parade', english: 'Death Parade', romaji: 'Death Parade' },
  'lc-2585':  { title: 'DEVILMAN crybaby', english: 'Devilman: Crybaby', romaji: 'Devilman Crybaby' },
  'lc-3582':  { title: 'Elfen Lied', english: 'Elfen Lied', romaji: 'Elfen Lied' },
  'lc-3583':  { title: 'Tengen Toppa Gurren Lagann', english: 'Gurren Lagann', romaji: 'Tengen Toppa Gurren Lagann' },
  'lc-1936':  { title: 'Mob Psycho 100', english: 'Mob Psycho 100', romaji: 'Mob Psycho 100' },
  'lc-784':   { title: 'Overlord', english: 'Overlord', romaji: 'Overlord' },
  'lc-2574':  { title: 'Overlord II', english: 'Overlord II', romaji: 'Overlord II' },
  'lc-3206':  { title: 'Overlord III', english: 'Overlord III', romaji: 'Overlord III' },
  'lc-752':   { title: 'Plastic Memories', english: 'Plastic Memories', romaji: 'Plastic Memories' },
  'lc-1956':  { title: 'Your Name.', english: 'Your Name.', romaji: 'Kimi no Na wa.' },
  'lc-3399':  { title: 'A Silent Voice', english: 'A Silent Voice', romaji: 'Koe no Katachi' },
  'lc-401':   { title: 'Akame ga Kill!', english: 'Akame ga Kill!', romaji: 'Akame ga Kill!' },
  'lc-3627':  { title: 'Future Diary', english: 'The Future Diary', romaji: 'Mirai Nikki' },
  'lc-12331': { title: 'Dragon Raja', english: 'Dragon Raja', romaji: 'Long Zu' },
  'lc-11377': { title: 'Undead Unluck', english: 'Undead Unluck', romaji: 'Undead Unluck' },
  'lc-12917': { title: 'SAKAMOTO DAYS', english: 'Sakamoto Days', romaji: 'Sakamoto Days' },
  'lc-12697': { title: 'Gachiakuta', english: 'Gachiakuta', romaji: 'Gachiakuta' },
  'lc-12601': { title: 'ZENSHU', english: 'Zenshu.', romaji: 'Zenshuu.' },
  'lc-12651': { title: 'Tougen Anki', english: 'Tougen Anki: Dark Demon of Tougen', romaji: 'Tougen Anki' },
  'lc-11225': { title: 'Ninja Kamui', english: 'Ninja Kamui', romaji: 'Ninja Kamui' },
  'lc-9563':  { title: 'Kengan Ashura', english: 'Kengan Ashura', romaji: 'Kengan Ashura' },
  'lc-1580':  { title: 'Kakegurui', english: 'Kakegurui', romaji: 'Kakegurui' }
};

// ---------------------------------------------------------------------------
// Title validation & recovery
// ---------------------------------------------------------------------------

function isBrokenTitle(title) {
  if (!title) return true;
  const t = title.trim();
  return /^(?:TV|THTR|OVA|ONA|Movie|Special|Streaming|Sub|Dub|RLS|EP\d+)[\s\S]*?(?:Released|Upcoming|Airing|20\d{2})\s*$/i.test(t);
}

function normalizeStatus(st) {
  if (st === 'Watching') return 'Ongoing';
  if (st === 'Plan to Watch') return 'Planning';
  return st || 'Completed';
}

function sanitizeAndRecoverItems(list) {
  let changed = false;
  for (const item of list) {
    // Strip old example dates that were only meant as prompt examples
    if (
      item.consumedDate === '3-6-2026 to 18-6-2026' ||
      item.consumedDate === '3-6-2026 to 1-1-2027' ||
      (item.id === 'seed-2' && item.consumedDate === '14-10-2026')
    ) {
      item.consumedDate = '';
      changed = true;
    }
    // Recover known broken LiveChart titles and supply English / Romaji titles (L7)
    if (LIVECHART_ID_TITLE_RECOVERY[item.id]) {
      const rec = LIVECHART_ID_TITLE_RECOVERY[item.id];
      const recTitle = (typeof rec === 'object' && rec.title) ? rec.title : rec;
      const recEng   = (typeof rec === 'object' && rec.english) ? rec.english : '';
      const recRom   = (typeof rec === 'object' && rec.romaji) ? rec.romaji : '';

      if (isBrokenTitle(item.title) && recTitle) {
        item.title = recTitle;
        changed = true;
      }
      if (recEng && !item.titleEnglish) {
        item.titleEnglish = recEng;
        changed = true;
      }
      if (recRom && !item.titleRomaji) {
        item.titleRomaji = recRom;
        changed = true;
      }
    }
    // Normalize status names: Watching -> Ongoing, Plan to Watch -> Planning
    const norm = normalizeStatus(item.status);
    if (norm !== item.status) {
      item.status = norm;
      changed = true;
    }
  }
  return changed;
}

// ---------------------------------------------------------------------------
// Conflict Resolution (S3: Deterministic Last-Write-Wins)
// ---------------------------------------------------------------------------

function mergeLibraries(localList, remoteList) {
  const byId = new Map();
  for (const item of (localList || [])) {
    if (item && item.id) byId.set(item.id, item);
  }
  for (const remote of (remoteList || [])) {
    if (!remote || !remote.id) continue;
    const local = byId.get(remote.id);
    if (!local) {
      byId.set(remote.id, remote);
    } else {
      const localTime = Number(local.updatedAt || 0);
      const remoteTime = Number(remote.updatedAt || 0);
      if (remoteTime >= localTime) {
        byId.set(remote.id, remote);
      }
    }
  }
  return Array.from(byId.values());
}
window.mergeLibraries = mergeLibraries;

// Listen for network reconnect to flush offline sync queue (S4)
window.addEventListener('online', () => {
  if (typeof CloudSync !== 'undefined' && CloudSync.flushOfflineQueue) {
    CloudSync.flushOfflineQueue();
  }
});
window.addEventListener('offline', () => {
  state.cloudStatus = 'offline';
  if (typeof renderAuthStatus === 'function') renderAuthStatus();
});

// ---------------------------------------------------------------------------
// localStorage persistence
// ---------------------------------------------------------------------------

function loadItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        state.items = parsed;
        if (sanitizeAndRecoverItems(state.items)) {
          saveItems();
        }
        // If cloud sync provider is active, pull cloud data and merge
        if (OMNICHART_CONFIG.cloudProvider !== 'localStorage') {
          CloudSync.pull().then((cloudItems) => {
            if (cloudItems && cloudItems.length > 0) {
              state.items = mergeLibraries(state.items, cloudItems);
              saveItems(false);
              if (typeof renderAll === 'function') renderAll();
            }
          });
        }
        return;
      }
    }
  } catch (e) {}
  state.items = [];
  saveItems();
}

function saveItems(shouldPushCloud = true) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
  } catch (e) {}

  // Push to cloud if user is signed in or cloud sync is configured
  if (shouldPushCloud && typeof CloudSync !== 'undefined' && CloudSync.push) {
    CloudSync.push(state.items);
  }
}

// ---------------------------------------------------------------------------
// JSON export
// ---------------------------------------------------------------------------

function exportLibraryJSON() {
  const blob = new Blob([JSON.stringify(state.items, null, 2)], { type: 'application/json' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `omnichart-export-${state.items.length}.json`;
  a.click();
  localStorage.setItem('omnichart_last_backup_time', String(Date.now()));
  if (typeof updateGuestBanner === 'function') updateGuestBanner();
}

// ---------------------------------------------------------------------------
// JSON import
// ---------------------------------------------------------------------------

function importLibraryJSON(file) {
  if (!OwnerMode.isOwner()) {
    if (typeof showToast === 'function') showToast('Read-Only mode: Enter owner passcode to import');
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!Array.isArray(imported)) throw new Error('Invalid JSON');
      const byId = new Map(state.items.map((i) => [i.id, i]));
      for (const raw of imported) {
        if (!raw || !raw.title) continue;
        const id = raw.id || ('imp-' + Math.random().toString(36).slice(2, 9));
        const rec = LIVECHART_ID_TITLE_RECOVERY[id];
        const recTitle = (typeof rec === 'object' && rec.title) ? rec.title : rec;
        const recEng   = (typeof rec === 'object' && rec.english) ? rec.english : '';
        const recRom   = (typeof rec === 'object' && rec.romaji) ? rec.romaji : '';

        const recoveredTitle = isBrokenTitle(raw.title) && recTitle
          ? recTitle
          : raw.title;
        byId.set(id, {
          id,
          title:        recoveredTitle,
          titleEnglish: raw.titleEnglish || recEng || '',
          titleRomaji:  raw.titleRomaji  || recRom || '',
          category:     raw.category || 'Series & Anime',
          status:       normalizeStatus(raw.status),
          rating:       Number(raw.rating || 0),
          progress:     Number(raw.progress ?? raw.totalUnits ?? 1),
          totalUnits:   Math.max(1, Number(raw.totalUnits || 12)),
          unitName:     raw.unitName || 'eps',
          studio:       raw.studio || 'Unknown Studio',
          releaseDate:  raw.releaseDate || 'TBA',
          consumedDate: raw.consumedDate || '',
          genres:       Array.isArray(raw.genres) ? raw.genres : [],
          image:        raw.image || '',
          synopsis:     raw.synopsis || '',
          notes:        raw.notes || '',
          updatedAt:    raw.updatedAt || Date.now()
        });
      }
      state.items = Array.from(byId.values());
      saveItems();
      if (typeof renderAll === 'function') renderAll();
      if (typeof showToast === 'function') {
        showToast(`Imported ${imported.length} entries — starting metadata enrichment...`);
      }
      // Automatically enrich missing Studio, Synopsis, Release Date & Genres!
      if (typeof enrichMissingMetadata === 'function') {
        enrichMissingMetadata(false);
      }
    } catch (err) {
      if (typeof showToast === 'function') showToast('Failed to parse JSON file');
    }
  };
  reader.readAsText(file);
}

// ---------------------------------------------------------------------------
// Cloud Synchronisation Engine (Multi-User Supabase Realtime)
// ---------------------------------------------------------------------------

/**
 * CloudSync — Multi-User Cross-Device Synchronization Engine.
 *
 * Each user creates their own private account.
 * Data is isolated per user using PostgreSQL Row-Level Security (RLS).
 * Realtime updates propagate changes across phones, tablets, and laptops instantly.
 */
const CloudSync = {
  _client: null,
  _realtimeChannel: null,

  getUrl() {
    return (OMNICHART_CONFIG.supabase.url || localStorage.getItem('omnichart_supabase_url') || '').trim();
  },

  getAnonKey() {
    return (OMNICHART_CONFIG.supabase.anonKey || localStorage.getItem('omnichart_supabase_anon_key') || '').trim();
  },

  isConfigured() {
    return Boolean(this.getUrl() && this.getAnonKey());
  },

  saveCredentials(url, key) {
    if (url) localStorage.setItem('omnichart_supabase_url', url.trim());
    if (key) localStorage.setItem('omnichart_supabase_anon_key', key.trim());
    this._client = null;
    return this.init();
  },

  getClient() {
    if (this._client) return this._client;
    const url = this.getUrl();
    const key = this.getAnonKey();
    if (window.supabase && url && key) {
      try {
        this._client = window.supabase.createClient(url, key, {
          auth: {
            persistSession: true,
            autoRefreshToken: true
          }
        });
      } catch (err) {
        console.warn('[CloudSync] Failed to initialize Supabase client:', err);
      }
    }
    return this._client;
  },

  /** Initialize connection, check existing session, and listen to auth changes */
  async init() {
    const client = this.getClient();
    if (!client) {
      state.cloudStatus = 'offline';
      if (typeof renderAuthStatus === 'function') renderAuthStatus();
      return;
    }

    try {
      state.cloudStatus = 'connecting';
      const { data: { session }, error } = await client.auth.getSession();
      if (!error && session?.user) {
        state.user = session.user;
        state.cloudStatus = 'connected';
        const remoteItems = await this.pull();
        if (Array.isArray(remoteItems) && remoteItems.length > 0) {
          state.items = remoteItems;
          saveItems(false);
          if (typeof renderAll === 'function') renderAll();
        }
        this.subscribe();
      } else {
        state.user = null;
        state.cloudStatus = 'offline';
      }
    } catch (err) {
      state.cloudStatus = 'offline';
    }

    if (typeof renderAuthStatus === 'function') renderAuthStatus();

    // Listen to real-time auth events (Sign In, Sign Out, Token Refresh)
    client.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        state.user = session.user;
        state.cloudStatus = 'connected';
        const remoteItems = await this.pull();
        if (Array.isArray(remoteItems) && remoteItems.length > 0) {
          state.items = remoteItems;
          saveItems(false);
        } else if (state.items.length > 0) {
          // If remote is empty but user has local items, offer or auto-upload
          await this.push(state.items);
        }
        this.subscribe();
      } else {
        state.user = null;
        state.cloudStatus = 'offline';
        if (this._realtimeChannel) {
          client.removeChannel(this._realtimeChannel);
          this._realtimeChannel = null;
        }
      }
      if (typeof renderAuthStatus === 'function') renderAuthStatus();
      if (typeof renderAll === 'function') renderAll();
    });
  },

  /** Sign up a new user account with email and password */
  async signUp(email, password) {
    const client = this.getClient();
    if (!client) throw new Error('Supabase credentials not configured yet. Please configure them in Database Setup.');
    const { data, error } = await client.auth.signUp({
      email: email.trim(),
      password: password.trim()
    });
    if (error) throw error;
    return data;
  },

  /** Sign in an existing user with email and password */
  async signIn(email, password) {
    const client = this.getClient();
    if (!client) throw new Error('Supabase credentials not configured yet. Please configure them in Database Setup.');
    const { data, error } = await client.auth.signInWithPassword({
      email: email.trim(),
      password: password.trim()
    });
    if (error) throw error;
    return data;
  },

  /** Sign out current user session */
  async signOut() {
    const client = this.getClient();
    if (!client) return;
    await client.auth.signOut();
  },

  /** Push items to user's isolated cloud table (Upsert) */
  /** Push items to user's isolated cloud table (Upsert) - S3, S4, S5 */
  async push(items) {
    if (!state.user || !Array.isArray(items) || items.length === 0) return { ok: true, count: 0 };
    
    // S4: If offline, queue changes locally
    if (!navigator.onLine) {
      this.queueOffline(items);
      return { ok: true, queued: true };
    }

    const client = this.getClient();
    if (!client) {
      this.queueOffline(items);
      return { error: new Error('Supabase client not initialized') };
    }

    try {
      state.cloudStatus = 'syncing';
      if (typeof renderAuthStatus === 'function') renderAuthStatus();

      const rows = items.map((item) => ({
        id: item.id,
        user_id: state.user.id,
        title: item.title,
        category: item.category || 'Series & Anime',
        status: (typeof normalizeStatus === 'function') ? normalizeStatus(item.status) : item.status,
        rating: Number(item.rating || 0),
        progress: Number(item.progress || 0),
        total_units: Number(item.totalUnits || 12),
        unit_name: item.unitName || 'eps',
        studio: item.studio || 'Unknown Studio',
        release_date: item.releaseDate || 'TBA',
        consumed_date: item.consumedDate || '',
        genres: Array.isArray(item.genres) ? item.genres : [],
        image: item.image || '',
        synopsis: item.synopsis || '',
        notes: item.notes || '',
        updated_at: Number(item.updatedAt || Date.now())
      }));

      const { error } = await client
        .from(OMNICHART_CONFIG.supabase.tableName)
        .upsert(rows, { onConflict: 'id,user_id' });

      if (error) {
        console.warn('[CloudSync] Upsert error:', error.message);
        state.cloudStatus = 'error';
        if (typeof renderAuthStatus === 'function') renderAuthStatus();
        this.queueOffline(items);
        return { error };
      }

      this._lastLocalPushTime = Date.now();
      state.cloudStatus = 'connected';
      if (typeof renderAuthStatus === 'function') renderAuthStatus();
      return { ok: true, count: rows.length };
    } catch (err) {
      console.warn('[CloudSync] Push exception:', err);
      state.cloudStatus = 'offline';
      if (typeof renderAuthStatus === 'function') renderAuthStatus();
      this.queueOffline(items);
      return { error: err };
    }
  },

  /** S4: Queue items in localStorage when offline or network fails */
  queueOffline(items) {
    try {
      const raw = localStorage.getItem('omnichart_offline_sync_queue');
      const queue = raw ? JSON.parse(raw) : [];
      const merged = mergeLibraries(queue, items);
      localStorage.setItem('omnichart_offline_sync_queue', JSON.stringify(merged));
      state.cloudStatus = 'offline';
      if (typeof renderAuthStatus === 'function') renderAuthStatus();
    } catch (e) {}
  },

  /** S4: Flush offline queue when network is restored */
  async flushOfflineQueue() {
    try {
      const raw = localStorage.getItem('omnichart_offline_sync_queue');
      if (!raw) return;
      const pending = JSON.parse(raw);
      if (Array.isArray(pending) && pending.length > 0 && navigator.onLine && state.user) {
        state.cloudStatus = 'syncing';
        if (typeof renderAuthStatus === 'function') renderAuthStatus();
        const res = await this.push(pending);
        if (res && res.ok) {
          localStorage.removeItem('omnichart_offline_sync_queue');
          state.cloudStatus = 'connected';
          if (typeof renderAuthStatus === 'function') renderAuthStatus();
          if (typeof showToast === 'function') {
            showToast(`⚡ Back online: Synced ${pending.length} pending items to cloud`);
          }
        }
      }
    } catch (e) {}
  },

  /** Delete a single item from the cloud */
  async deleteItem(id) {
    if (!state.user || !id) return;
    const client = this.getClient();
    if (!client) return;
    try {
      this._lastLocalPushTime = Date.now();
      await client
        .from(OMNICHART_CONFIG.supabase.tableName)
        .delete()
        .eq('id', id)
        .eq('user_id', state.user.id);
    } catch (err) {
      console.warn('[CloudSync] Delete exception:', err);
    }
  },

  /** Pull all items for the authenticated user - S3 Last-Write-Wins */
  async pull() {
    if (!state.user) return null;
    const client = this.getClient();
    if (!client) return null;

    try {
      const { data, error } = await client
        .from(OMNICHART_CONFIG.supabase.tableName)
        .select('*')
        .eq('user_id', state.user.id)
        .order('updated_at', { ascending: false });

      if (error) {
        console.warn('[CloudSync] Pull error:', error.message);
        state.cloudStatus = 'error';
        if (typeof renderAuthStatus === 'function') renderAuthStatus();
        return null;
      }

      if (Array.isArray(data)) {
        return data.map((row) => ({
          id: row.id,
          title: row.title,
          category: row.category,
          status: (typeof normalizeStatus === 'function') ? normalizeStatus(row.status) : row.status,
          rating: Number(row.rating || 0),
          progress: Number(row.progress || 0),
          totalUnits: Number(row.total_units || 12),
          unitName: row.unit_name || 'eps',
          studio: row.studio || 'Unknown Studio',
          releaseDate: row.release_date || 'TBA',
          consumedDate: row.consumed_date || '',
          genres: Array.isArray(row.genres) ? row.genres : [],
          image: row.image || '',
          synopsis: row.synopsis || '',
          notes: row.notes || '',
          updatedAt: Number(row.updated_at || Date.now())
        }));
      }
    } catch (err) {
      console.warn('[CloudSync] Pull exception:', err);
      state.cloudStatus = 'offline';
      if (typeof renderAuthStatus === 'function') renderAuthStatus();
    }
    return null;
  },

  /** Subscribe to realtime postgres changes for the current user - S3 Conflict Resolution */
  subscribe() {
    if (!state.user) return;
    const client = this.getClient();
    if (!client) return;

    if (this._realtimeChannel) {
      client.removeChannel(this._realtimeChannel);
      this._realtimeChannel = null;
    }

    try {
      this._realtimeChannel = client
        .channel(`omnichart_sync_${state.user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: OMNICHART_CONFIG.supabase.tableName,
            filter: `user_id=eq.${state.user.id}`
          },
          async () => {
            const timeSincePush = Date.now() - (CloudSync._lastLocalPushTime || 0);
            const isSelfPush = timeSincePush < 4000;
            const remoteItems = await this.pull();
            if (remoteItems) {
              // S3: Merge with last-write-wins
              state.items = mergeLibraries(state.items, remoteItems);
              saveItems(false);
              if (typeof renderAll === 'function') renderAll();
              if (!isSelfPush && typeof showToast === 'function') {
                showToast('⚡ Synced changes from your other device');
              }
            }
          }
        )
        .subscribe();
    } catch (err) {
      console.warn('[CloudSync] Realtime subscribe error:', err);
    }
  },

  /** SQL schema script to copy-paste into Supabase SQL editor */
  getSqlSchema() {
    return `-- ==========================================================================
-- OmniChart Multi-User Realtime Schema (PostgreSQL + Row-Level Security)
-- Run this in your Supabase Project -> SQL Editor -> Run
-- ==========================================================================

-- 1. Create Media Library Table
CREATE TABLE IF NOT EXISTS public.omnichart_items (
    id TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    category TEXT DEFAULT 'Series & Anime',
    status TEXT DEFAULT 'Completed',
    rating NUMERIC DEFAULT 0,
    progress INTEGER DEFAULT 0,
    total_units INTEGER DEFAULT 12,
    unit_name TEXT DEFAULT 'eps',
    studio TEXT DEFAULT 'Unknown Studio',
    release_date TEXT DEFAULT 'TBA',
    consumed_date TEXT DEFAULT '',
    genres TEXT[] DEFAULT '{}',
    image TEXT DEFAULT '',
    synopsis TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    updated_at BIGINT DEFAULT (extract(epoch from now()) * 1000),
    PRIMARY KEY (id, user_id)
);

-- 2. Enable Row-Level Security (RLS) for complete privacy
ALTER TABLE public.omnichart_items ENABLE ROW LEVEL SECURITY;

-- 3. Security Policies: Each user can ONLY view, insert, update & delete their own items
DROP POLICY IF EXISTS "Users can select own items" ON public.omnichart_items;
CREATE POLICY "Users can select own items"
    ON public.omnichart_items FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own items" ON public.omnichart_items;
CREATE POLICY "Users can insert own items"
    ON public.omnichart_items FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own items" ON public.omnichart_items;
CREATE POLICY "Users can update own items"
    ON public.omnichart_items FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own items" ON public.omnichart_items;
CREATE POLICY "Users can delete own items"
    ON public.omnichart_items FOR DELETE
    USING (auth.uid() = user_id);

-- 4. Enable Supabase Realtime broadcast
ALTER PUBLICATION supabase_realtime ADD TABLE public.omnichart_items;`;
  }
};

window.CloudSync = CloudSync;
window.OwnerMode = OwnerMode;
