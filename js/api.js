/* ==========================================================================
   OmniChart — API Module
   AniList GraphQL progressive auto-search + Wikipedia fallback,
   and the AniList batch metadata enricher for Studio, Release Date,
   Genres, Synopsis, Poster, and Episode count.
   ========================================================================== */

// ---------------------------------------------------------------------------
// Shared Utility Helpers
// ---------------------------------------------------------------------------

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function makeFallbackPoster(title) {
  const clean = (title || 'Media').slice(0, 22);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="360" viewBox="0 0 240 360">
    <rect width="240" height="360" fill="#0d0e11"/>
    <rect x="10" y="10" width="220" height="340" rx="10" fill="#2c3539" stroke="#3d494f" stroke-width="2"/>
    <text x="120" y="180" text-anchor="middle" fill="#ff9f1c" font-family="sans-serif" font-size="15" font-weight="bold">${esc(clean)}</text>
  </svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

/** Sanitise a synopsis returned as HTML from AniList into plain text. */
function cleanHtmlSynopsis(str) {
  if (!str) return '';
  return str
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/?[^>]+(>|$)/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s*\((?:Source|Written by):[^)]+\)\s*$/i, '')
    .replace(/\s*\[(?:Source|Written by):[^\]]+\]\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Format AniList season + year into a human-friendly release date. */
function formatSeasonYear(season, year, fallbackYear) {
  const y = year || fallbackYear;
  if (season && y) {
    const cap = season.charAt(0).toUpperCase() + season.slice(1).toLowerCase();
    return `${cap} ${y}`;
  }
  if (y) return String(y);
  return 'TBA';
}

// ---------------------------------------------------------------------------
// Progressive Auto-Search (AniList GraphQL + Wikipedia)
// ---------------------------------------------------------------------------

let searchTimer = null;
let searchSeq   = 0;

/**
 * Run a dual-source progressive search: results stream in as each API
 * responds (AniList first, Wikipedia second) so the dropdown feels instant.
 */
async function runAutoSearch(query) {
  const q       = query.trim();
  const box     = document.getElementById('autoSearchResults');
  const statusEl = document.getElementById('autoSearchStatus');

  if (q.length < 2) {
    if (box) box.classList.add('hidden');
    if (statusEl) statusEl.textContent = '';
    return;
  }

  const mySeq = ++searchSeq;
  if (statusEl) statusEl.textContent = 'Searching...';
  const results = [];

  function renderDropdown() {
    if (mySeq !== searchSeq || !box) return;
    if (results.length === 0) {
      box.innerHTML = `<div class="p-3 text-xs text-slate-400">No matches found.</div>`;
    } else {
      box.innerHTML = results.slice(0, 8).map((r, idx) => `
        <button
          type="button"
          data-action="pick-search-result"
          data-idx="${idx}"
          class="w-full p-2.5 text-left hover:bg-[#2c3539] flex items-center gap-3 transition"
        >
          <img src="${esc(r.image || makeFallbackPoster(r.title))}" class="w-10 h-14 object-cover rounded bg-[#2c3539] shrink-0" />
          <div class="min-w-0 flex-1">
            <div class="font-bold text-xs text-white truncate">${esc(r.title)}</div>
            <div class="text-[11px] text-[#ff9f1c]">${esc(r.category)} \u2022 ${esc(r.releaseDate || 'TBA')} \u2022 ${esc(r.studio || '')}</div>
            <div class="text-[11px] text-slate-400 truncate">${esc(r.synopsis || '')}</div>
          </div>
        </button>
      `).join('');
    }
    box.classList.remove('hidden');
  }

  window._lastSearchResults = results;

  // --- AniList GraphQL ---
  const anilistPromise = fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      query: `query ($s: String) {
        Page(perPage: 5) {
          media(search: $s, type: ANIME) {
            title { english romaji }
            season
            seasonYear
            startDate { year }
            episodes
            format
            genres
            description(asHtml: false)
            studios { nodes { name isAnimationStudio } }
            coverImage { extraLarge large }
          }
        }
      }`,
      variables: { s: q }
    })
  })
    .then((r) => r.json())
    .then((json) => {
      for (const m of json?.data?.Page?.media || []) {
        const isMovie     = m.format === 'MOVIE';
        const studioNodes = m.studios?.nodes || [];
        const anim        = studioNodes.filter((n) => n.isAnimationStudio).map((n) => n.name);
        const studio      = (anim.length ? anim : studioNodes.map((n) => n.name)).slice(0, 2).join(', ') || 'Unknown Studio';
        results.push({
          title:       m.title?.english || m.title?.romaji || q,
          category:    isMovie ? 'Movies' : 'Series & Anime',
          totalUnits:  isMovie ? 1 : (m.episodes || 12),
          studio,
          releaseDate: formatSeasonYear(m.season, m.seasonYear, m.startDate?.year),
          genres:      (m.genres || []).slice(0, 4),
          image:       m.coverImage?.extraLarge || m.coverImage?.large || '',
          synopsis:    cleanHtmlSynopsis(m.description)
        });
      }
      renderDropdown();
    })
    .catch(() => {});

  // --- Wikipedia API ---
  const wikiPromise = fetch(
    `https://en.wikipedia.org/w/api.php?action=query&origin=*&format=json&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrlimit=4&prop=pageimages|extracts&exintro=1&explaintext=1&exchars=260&piprop=thumbnail&pithumbsize=500`
  )
    .then((r) => r.json())
    .then((data) => {
      const pages = Object.values(data?.query?.pages || {});
      for (const p of pages) {
        const ext = p.extract || '';
        let cat = 'Movies';
        if (/anime|television series|tv series/i.test(ext)) cat = 'Series & Anime';
        else if (/video game/i.test(ext))                    cat = 'Games';
        else if (/novel|book|manga/i.test(ext))              cat = 'Books';
        const ym = ext.match(/\b(19\d{2}|20\d{2})\b/);
        results.push({
          title:       p.title.replace(/\s*\([^)]*\)\s*$/, ''),
          category:    cat,
          totalUnits:  cat === 'Movies' ? 1 : 12,
          studio:      'Wikipedia',
          releaseDate: ym ? ym[1] : 'TBA',
          genres:      [],
          image:       p.thumbnail?.source || '',
          synopsis:    ext
        });
      }
      renderDropdown();
    })
    .catch(() => {});

  await Promise.allSettled([anilistPromise, wikiPromise]);
  if (mySeq === searchSeq) {
    if (statusEl) statusEl.textContent = '';
    renderDropdown();
  }
}

// ---------------------------------------------------------------------------
// Batch Metadata Enricher (AniList GraphQL)
// ---------------------------------------------------------------------------

/**
 * Walk through every library item that is missing Studio, Release Date,
 * Genres, or Synopsis and batch-query AniList to auto-fill them.
 */
async function enrichMissingMetadata(forceAll = false) {
  if (state.enrichRunning) return;

  // First run ID title recovery
  if (typeof sanitizeAndRecoverItems === 'function') {
    sanitizeAndRecoverItems(state.items);
  }

  const targets = state.items.filter((item) => {
    if (typeof isBrokenTitle === 'function' && isBrokenTitle(item.title)) return false;
    if (forceAll) return true;
    const missingStudio  = !item.studio || item.studio === 'Unknown Studio';
    const missingDate    = !item.releaseDate || item.releaseDate === 'TBA';
    const missingSyn     = !item.synopsis || item.synopsis.trim() === '';
    const missingGenres  = !Array.isArray(item.genres) || item.genres.length === 0;
    return missingStudio || missingDate || missingSyn || missingGenres;
  });

  if (targets.length === 0) {
    if (typeof showToast === 'function') {
      showToast('All entries with valid titles already have metadata!');
    }
    if (typeof renderAll === 'function') renderAll();
    return;
  }

  state.enrichRunning       = true;
  state.enrichStopRequested = false;

  const banner      = document.getElementById('enrichBanner');
  const statusText  = document.getElementById('enrichStatusText');
  const progressBar = document.getElementById('enrichProgressBar');
  if (banner) banner.classList.remove('hidden');

  const BATCH_SIZE   = 12;
  let   processed    = 0;
  let   updatedCount = 0;

  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    if (state.enrichStopRequested) break;

    const batch = targets.slice(i, i + BATCH_SIZE);
    const pct   = Math.round((processed / targets.length) * 100);
    if (progressBar) progressBar.style.width = `${pct}%`;
    if (statusText) {
      statusText.textContent = `\u26A1 Auto-filling Studio, Release Date, Genres & Synopsis (${processed} / ${targets.length})...`;
    }

    const queryFields = batch.map((item, idx) => {
      const safeSearch = item.title
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\s+/g, ' ')
        .trim();
      return `q${idx}: Page(perPage: 1) {
        media(search: "${safeSearch}", type: ANIME) {
          title { english romaji }
          season
          seasonYear
          startDate { year }
          episodes
          format
          genres
          description(asHtml: false)
          studios { nodes { name isAnimationStudio } }
          coverImage { extraLarge large }
        }
      }`;
    });

    const fullQuery = `query {\n${queryFields.join('\n')}\n}`;

    try {
      const res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept':       'application/json'
        },
        body: JSON.stringify({ query: fullQuery })
      });

      if (res.ok) {
        const json = await res.json();
        const data = json?.data || {};

        batch.forEach((item, idx) => {
          const media = data[`q${idx}`]?.media?.[0];
          if (!media) return;

          // Studio / Creator
          const studioNodes  = media.studios?.nodes || [];
          const animStudios  = studioNodes.filter((n) => n.isAnimationStudio).map((n) => n.name);
          const allStudios   = studioNodes.map((n) => n.name);
          const chosenStudios = (animStudios.length > 0 ? animStudios : allStudios).slice(0, 2).join(', ');
          if (chosenStudios && (!item.studio || item.studio === 'Unknown Studio')) {
            item.studio = chosenStudios;
          }

          // Release Date
          const rel = formatSeasonYear(media.season, media.seasonYear, media.startDate?.year);
          if (rel !== 'TBA' && (!item.releaseDate || item.releaseDate === 'TBA')) {
            item.releaseDate = rel;
          }

          // Genres
          if (Array.isArray(media.genres) && media.genres.length > 0 && (!item.genres || item.genres.length === 0)) {
            item.genres = media.genres.slice(0, 4);
          }

          // Synopsis
          const cleanDesc = cleanHtmlSynopsis(media.description);
          if (cleanDesc && (!item.synopsis || item.synopsis.trim() === '')) {
            item.synopsis = cleanDesc;
          }

          // Poster fallback if missing
          if (!item.image && (media.coverImage?.extraLarge || media.coverImage?.large)) {
            item.image = media.coverImage.extraLarge || media.coverImage.large;
          }

          // Total episodes if missing
          if (media.episodes && (!item.totalUnits || item.totalUnits === 12)) {
            item.totalUnits = media.episodes;
            if (item.status === 'Completed') item.progress = media.episodes;
          }

          if (media.format === 'MOVIE') {
            item.category   = 'Movies';
            item.unitName   = 'movie';
            item.totalUnits = 1;
            if (item.status === 'Completed') item.progress = 1;
          }

          updatedCount++;
        });

        if (typeof saveItems === 'function') saveItems();
        if (typeof renderLibrary === 'function') renderLibrary();
      }
    } catch (err) {
      // Continue next batch smoothly
    }

    processed += batch.length;
    await new Promise((r) => setTimeout(r, 650));
  }

  if (progressBar) progressBar.style.width = '100%';
  state.enrichRunning = false;
  if (banner) setTimeout(() => banner.classList.add('hidden'), 1200);
  if (typeof saveItems === 'function') saveItems();
  if (typeof renderAll === 'function') renderAll();
  if (typeof showToast === 'function') {
    showToast(`Enriched ${updatedCount} entries with Studio, Release Date & Synopsis!`);
  }
}
