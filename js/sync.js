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
const LIVECHART_ID_TITLE_RECOVERY = {
  'lc-321':   'One Piece',
  'lc-3340':  'Bleach',
  'lc-3437':  'Death Note',
  'lc-3585':  'Naruto',
  'lc-3632':  'Dragon Ball Z',
  'lc-2478':  'Black Clover',
  'lc-3612':  'Black Lagoon',
  'lc-9984':  'A Will Eternal',
  'lc-10257': 'Chainsaw Man',
  'lc-12428': 'DAN DA DAN',
  'lc-9680':  'JUJUTSU KAISEN',
  'lc-10491': 'JUJUTSU KAISEN 0',
  'lc-11320': 'Solo Leveling',
  'lc-11247': 'Oshi no Ko',
  'lc-3169':  'Vinland Saga',
  'lc-10456': 'SPY x FAMILY',
  'lc-10042': 'Cyberpunk: Edgerunners',
  'lc-10687': 'BLUE LOCK',
  'lc-11352': 'Kaiju No. 8',
  'lc-3418':  'Cowboy Bebop',
  'lc-8349':  'Dr. STONE',
  'lc-8355':  'Fire Force',
  'lc-412':   'Tokyo Ghoul',
  'lc-9793':  'Tower of God',
  'lc-3168':  'Dororo',
  'lc-956':   'PSYCHO-PASS',
  'lc-3109':  'Goblin Slayer',
  'lc-1241':  'Blue Exorcist',
  'lc-154':   'Noragami',
  'lc-1481':  'Drifters',
  'lc-11916': 'WIND BREAKER',
  'lc-10891': 'Chained Soldier',
  'lc-11714': 'Go! Go! Loser Ranger!',
  'lc-10281': 'Record of Ragnarok',
  'lc-10754': 'Record of Ragnarok II',
  'lc-13083': 'Record of Ragnarok III',
  'lc-11088': 'Baki Hanma',
  'lc-11380': 'Baki Hanma Season 2',
  'lc-4603':  'Mo Dao Zu Shi',
  'lc-10083': 'Scissor Seven Season 2',
  'lc-10512': "JoJo's Bizarre Adventure: Stone Ocean",
  'lc-10156': 'Horimiya',
  'lc-9501':  'ID: INVADED',
  'lc-1344':  'Charlotte',
  'lc-1280':  'Death Parade',
  'lc-2585':  'DEVILMAN crybaby',
  'lc-3582':  'Elfen Lied',
  'lc-3583':  'Tengen Toppa Gurren Lagann',
  'lc-1936':  'Mob Psycho 100',
  'lc-784':   'Overlord',
  'lc-2574':  'Overlord II',
  'lc-3206':  'Overlord III',
  'lc-752':   'Plastic Memories',
  'lc-1956':  'Your Name.',
  'lc-3399':  'A Silent Voice',
  'lc-401':   'Akame ga Kill!',
  'lc-3627':  'Future Diary',
  'lc-12331': 'Dragon Raja',
  'lc-11377': 'Undead Unluck',
  'lc-12917': 'SAKAMOTO DAYS',
  'lc-12697': 'Gachiakuta',
  'lc-12601': 'ZENSHU',
  'lc-12651': 'Tougen Anki',
  'lc-11225': 'Ninja Kamui',
  'lc-9563':  'Kengan Ashura',
  'lc-1580':  'Kakegurui'
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
    // Recover known broken LiveChart titles
    if (isBrokenTitle(item.title) && LIVECHART_ID_TITLE_RECOVERY[item.id]) {
      item.title = LIVECHART_ID_TITLE_RECOVERY[item.id];
      changed = true;
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
        // If cloud sync provider is active, pull cloud data
        if (OMNICHART_CONFIG.cloudProvider !== 'localStorage') {
          CloudSync.pull().then((cloudItems) => {
            if (cloudItems && cloudItems.length > 0) {
              state.items = cloudItems;
              saveItems();
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
        const recoveredTitle = isBrokenTitle(raw.title) && LIVECHART_ID_TITLE_RECOVERY[id]
          ? LIVECHART_ID_TITLE_RECOVERY[id]
          : raw.title;
        byId.set(id, {
          id,
          title:        recoveredTitle,
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
  async push(items) {
    if (!state.user || !Array.isArray(items) || items.length === 0) return { ok: true, count: 0 };
    const client = this.getClient();
    if (!client) return { error: new Error('Supabase client not initialized') };

    try {
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
        return { error };
      }
      this._lastLocalPushTime = Date.now();
      return { ok: true, count: rows.length };
    } catch (err) {
      console.warn('[CloudSync] Push exception:', err);
      return { error: err };
    }
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

  /** Pull all items for the authenticated user */
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
    }
    return null;
  },

  /** Subscribe to realtime postgres changes for the current user */
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
              state.items = remoteItems;
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
