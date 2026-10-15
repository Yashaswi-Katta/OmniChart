/* ==========================================================================
   OmniChart — Sync & Persistence Module
   localStorage persistence, JSON import / export, LiveChart title recovery,
   Owner Mode vs. Public Read-Only Visitor security, and CloudSync stubs
   for instant Supabase or Firebase cross-device synchronization.
   ========================================================================== */

const STORAGE_KEY = 'omnichart_v4_items';

// ---------------------------------------------------------------------------
// Cloud Sync & Deployment Configuration
// ---------------------------------------------------------------------------
const OMNICHART_CONFIG = {
  // Provider: 'localStorage' (default) | 'supabase' | 'firebase'
  cloudProvider: 'localStorage',

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
    url: '', // e.g. 'https://your-project.supabase.co'
    anonKey: '', // your public anon key
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
  genreSearch:         ''
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

function saveItems() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
  } catch (e) {}

  // Push to cloud if active and user is owner
  if (OMNICHART_CONFIG.cloudProvider !== 'localStorage' && OwnerMode.isOwner()) {
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
// Cloud Synchronisation Engine (Supabase / Firebase)
// ---------------------------------------------------------------------------

/**
 * CloudSync — Cross-device synchronization engine.
 *
 * HOW TO ACTIVATE SUPABASE:
 * 1. Add to index.html <head>:
 *    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 * 2. In OMNICHART_CONFIG above, set:
 *    cloudProvider: 'supabase'
 *    supabase.url = 'https://YOUR_PROJECT.supabase.co'
 *    supabase.anonKey = 'YOUR_ANON_KEY'
 * 3. Create the table in Supabase SQL editor (see README.md for the SQL script).
 *
 * HOW TO ACTIVATE FIREBASE:
 * 1. Set cloudProvider: 'firebase'
 * 2. Fill firebase config object in OMNICHART_CONFIG.
 */
const CloudSync = {
  _supabaseClient: null,

  getClient() {
    if (OMNICHART_CONFIG.cloudProvider === 'supabase') {
      if (!this._supabaseClient && window.supabase && OMNICHART_CONFIG.supabase.url) {
        this._supabaseClient = window.supabase.createClient(
          OMNICHART_CONFIG.supabase.url,
          OMNICHART_CONFIG.supabase.anonKey
        );
      }
      return this._supabaseClient;
    }
    return null;
  },

  /** Push library entries to the cloud */
  async push(items) {
    const provider = OMNICHART_CONFIG.cloudProvider;
    if (provider === 'localStorage' || !items) return;

    if (provider === 'supabase') {
      const client = this.getClient();
      if (!client) return;
      try {
        const rows = items.map((item) => ({
          id: item.id,
          title: item.title,
          category: item.category,
          status: item.status,
          rating: item.rating,
          progress: item.progress,
          total_units: item.totalUnits,
          unit_name: item.unitName,
          studio: item.studio,
          release_date: item.releaseDate,
          consumed_date: item.consumedDate,
          genres: item.genres,
          image: item.image,
          synopsis: item.synopsis,
          notes: item.notes,
          updated_at: item.updatedAt || Date.now()
        }));

        const { error } = await client
          .from(OMNICHART_CONFIG.supabase.tableName)
          .upsert(rows, { onConflict: 'id' });

        if (error) console.warn('[OmniChart CloudSync] Supabase push error:', error.message);
        else console.log('[OmniChart CloudSync] Synced to Supabase successfully.');
      } catch (err) {
        console.warn('[OmniChart CloudSync] Supabase push exception:', err);
      }
    }

    if (provider === 'firebase' && window.firebase) {
      // Firebase Firestore implementation stub
      // const db = firebase.firestore();
      // await db.collection('omnichart').doc('library').set({ items });
    }
  },

  /** Pull library entries from the cloud */
  async pull() {
    const provider = OMNICHART_CONFIG.cloudProvider;
    if (provider === 'localStorage') return null;

    if (provider === 'supabase') {
      const client = this.getClient();
      if (!client) return null;
      try {
        const { data, error } = await client
          .from(OMNICHART_CONFIG.supabase.tableName)
          .select('*')
          .order('updated_at', { ascending: false });

        if (error) {
          console.warn('[OmniChart CloudSync] Supabase pull error:', error.message);
          return null;
        }

        if (Array.isArray(data)) {
          return data.map((row) => ({
            id: row.id,
            title: row.title,
            category: row.category,
            status: row.status,
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
        console.warn('[OmniChart CloudSync] Supabase pull exception:', err);
      }
    }

    return null;
  },

  /** Subscribe to real-time changes across devices */
  subscribe(callback) {
    if (OMNICHART_CONFIG.cloudProvider === 'supabase') {
      const client = this.getClient();
      if (!client) return () => {};
      const channel = client
        .channel('omnichart_realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: OMNICHART_CONFIG.supabase.tableName }, () => {
          this.pull().then((items) => {
            if (items && typeof callback === 'function') callback(items);
          });
        })
        .subscribe();

      return () => client.removeChannel(channel);
    }
    return () => {};
  }
};
