/* ==========================================================================
   OmniChart — API Module
   AniList GraphQL progressive auto-search + Wikipedia fallback,
   and the AniList batch metadata enricher for Studio, Release Date,
   Genres, Synopsis, Poster, and Episode count.
   ========================================================================== */

// ---------------------------------------------------------------------------
// Shared Utility Helpers & AniList GraphQL Fragment
// ---------------------------------------------------------------------------

const ANILIST_MEDIA_FIELDS = `
  title { english romaji native }
  season
  seasonYear
  startDate { year }
  episodes
  format
  genres
  description(asHtml: false)
  studios { nodes { name isAnimationStudio } }
  coverImage { extraLarge large }
`;

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
            ${ANILIST_MEDIA_FIELDS}
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
        const anim        = Array.from(new Set(studioNodes.filter((n) => n.isAnimationStudio).map((n) => n.name).filter(Boolean)));
        const allNames    = Array.from(new Set(studioNodes.map((n) => n.name).filter(Boolean)));
        const studio      = (anim.length ? anim : allNames).slice(0, 2).join(', ') || 'Unknown Studio';
        results.push({
          title:        m.title?.english || m.title?.romaji || q,
          titleEnglish: m.title?.english || '',
          titleRomaji:  m.title?.romaji || '',
          category:     isMovie ? 'Movies' : 'Series & Anime',
          totalUnits:   isMovie ? 1 : (m.episodes || 12),
          studio,
          releaseDate:  formatSeasonYear(m.season, m.seasonYear, m.startDate?.year),
          genres:       (m.genres || []).slice(0, 4),
          image:        m.coverImage?.extraLarge || m.coverImage?.large || '',
          synopsis:     cleanHtmlSynopsis(m.description)
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
// Smart Title Cleaning & Candidate Matching Helper
// ---------------------------------------------------------------------------

/** Clean anime title for accurate AniList & Wikipedia queries */
function getCleanSearchTitle(rawTitle) {
  if (!rawTitle) return '';
  let t = String(rawTitle).trim();
  // 1. Strip bracketed noise e.g. [Dub], [Sub], [1080p]
  t = t.replace(/\s*\[[^\]]+\]/gi, '');
  // 2. Strip broadcast tags e.g. (TV), (Movie), (ONA)
  t = t.replace(/\s*\(?(?:TV|Movie|ONA|OVA|Special|Dub|Sub|Subbed|Dubbed)\)?/gi, '');
  // 3. Strip seasons, parts, cours with optional hyphen or colon
  t = t.replace(/\s*[-:]?\s*\(?(?:Season\s*\d+|2nd\s*Season|3rd\s*Season|4th\s*Season|Final\s*Season|Part\s*\d+|Cour\s*\d+)\)?/gi, '');
  // 4. Strip dangling punctuation at the end
  t = t.replace(/[\s\-:]+$/g, '');
  t = t.replace(/\s+/g, ' ').trim();
  return t || rawTitle.trim();
}

/** Pick best AniList match among candidates based on format and title */
function pickBestAniListMedia(candidates, item) {
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const clean = getCleanSearchTitle(item.title).toLowerCase();

  // 1. Try exact match on English or Romaji title
  const exact = candidates.find((c) => {
    const eng = (c.title?.english || '').toLowerCase();
    const rom = (c.title?.romaji || '').toLowerCase();
    return eng === clean || rom === clean;
  });
  if (exact) return exact;

  // 2. Format matching (prefer TV for series, MOVIE for movie)
  if (item.category === 'Movies') {
    const movie = candidates.find((c) => c.format === 'MOVIE');
    if (movie) return movie;
  } else {
    const tv = candidates.find((c) => c.format === 'TV' || c.format === 'TV_SHORT' || c.format === 'ONA');
    if (tv) return tv;
  }

  return candidates[0];
}

/** Apply enriched media metadata cleanly to an item without clobbering manual edits */
function applyAniListMedia(item, media, forceAll = false) {
  if (!item || !media) return false;
  let changed = false;
  const edited = item._manualFields || [];

  // English & Romaji titles (L7)
  if (media.title?.english && (!item.titleEnglish || forceAll)) {
    item.titleEnglish = media.title.english;
    changed = true;
  }
  if (media.title?.romaji && (!item.titleRomaji || forceAll)) {
    item.titleRomaji = media.title.romaji;
    changed = true;
  }

  // Deduplicated Studios (L3)
  const studioNodes   = media.studios?.nodes || [];
  const animStudios   = Array.from(new Set(studioNodes.filter((n) => n.isAnimationStudio).map((n) => n.name).filter(Boolean)));
  const allStudios    = Array.from(new Set(studioNodes.map((n) => n.name).filter(Boolean)));
  const chosenStudios = (animStudios.length > 0 ? animStudios : allStudios).slice(0, 2).join(', ');

  if (chosenStudios && !edited.includes('studio') && (!item.studio || item.studio === 'Unknown Studio' || forceAll)) {
    item.studio = chosenStudios;
    changed = true;
  }

  // Release Date
  const rel = formatSeasonYear(media.season, media.seasonYear, media.startDate?.year);
  if (rel !== 'TBA' && !edited.includes('releaseDate') && (!item.releaseDate || item.releaseDate === 'TBA' || forceAll)) {
    item.releaseDate = rel;
    changed = true;
  }

  // Genres
  if (Array.isArray(media.genres) && media.genres.length > 0 && !edited.includes('genres') && (!item.genres || item.genres.length === 0 || forceAll)) {
    item.genres = media.genres.slice(0, 4);
    changed = true;
  }

  // Synopsis
  const cleanDesc = cleanHtmlSynopsis(media.description);
  if (cleanDesc && !edited.includes('synopsis') && (!item.synopsis || item.synopsis.trim() === '' || forceAll)) {
    item.synopsis = cleanDesc;
    changed = true;
  }

  // Poster fallback
  if (!item.image && (media.coverImage?.extraLarge || media.coverImage?.large)) {
    item.image = media.coverImage.extraLarge || media.coverImage.large;
    changed = true;
  }

  // Total episodes
  if (media.episodes && (!item.totalUnits || item.totalUnits === 12)) {
    item.totalUnits = media.episodes;
    if (item.status === 'Completed') item.progress = media.episodes;
    changed = true;
  }

  if (media.format === 'MOVIE') {
    item.category   = 'Movies';
    item.unitName   = 'movie';
    item.totalUnits = 1;
    if (item.status === 'Completed') item.progress = 1;
    changed = true;
  }

  if (changed) {
    item.updatedAt = Date.now();
  }
  return changed;
}

/** Wikipedia API fallback for titles missed or unindexed by AniList */
async function fetchWikiFallback(item) {
  try {
    const cleanTitle = getCleanSearchTitle(item.title);
    const url = `https://en.wikipedia.org/w/api.php?action=query&origin=*&format=json&generator=search&gsrsearch=${encodeURIComponent(cleanTitle)}&gsrlimit=1&prop=pageimages|extracts&exintro=1&explaintext=1&exchars=350&piprop=thumbnail&pithumbsize=500`;
    const res = await fetch(url);
    if (!res.ok) return false;
    const data = await res.json();
    const page = Object.values(data?.query?.pages || {})[0];
    if (!page) return false;
    let changed = false;
    const edited = item._manualFields || [];

    if (page.extract && !edited.includes('synopsis') && (!item.synopsis || item.synopsis.trim() === '')) {
      item.synopsis = page.extract.trim();
      changed = true;
    }
    if (page.thumbnail?.source && !item.image) {
      item.image = page.thumbnail.source;
      changed = true;
    }
    const ym = page.extract?.match(/\b(19\d{2}|20\d{2})\b/);
    if (ym && !edited.includes('releaseDate') && (!item.releaseDate || item.releaseDate === 'TBA')) {
      item.releaseDate = ym[1];
      changed = true;
    }
    if (changed) {
      item.updatedAt = Date.now();
    }
    return changed;
  } catch (e) {
    return false;
  }
}

/** Individual single query fallback if a batch query fails */
async function fetchSingleAniList(item) {
  const cleanTitle = getCleanSearchTitle(item.title);
  const q = `query ($s: String) {
    Page(perPage: 3) {
      media(search: $s, type: ANIME) {
        ${ANILIST_MEDIA_FIELDS}
      }
    }
  }`;
  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ query: q, variables: { s: cleanTitle } })
    });
    if (res.ok) {
      const json = await res.json();
      return json?.data?.Page?.media || [];
    }
  } catch (e) {}
  return [];
}

// ---------------------------------------------------------------------------
// Batch Metadata Enricher (AniList GraphQL + Wikipedia Fallback)
// ---------------------------------------------------------------------------

/**
 * Walk through every library item that is missing Studio, Release Date,
 * Genres, Synopsis, English title, or Romaji title and enrich them.
 */
async function enrichMissingMetadata(forceAll = false, customTargets = null) {
  if (state.enrichRunning) return;

  // First run ID title recovery
  if (typeof sanitizeAndRecoverItems === 'function') {
    sanitizeAndRecoverItems(state.items);
  }

  const targets = Array.isArray(customTargets) ? customTargets : state.items.filter((item) => {
    if (typeof isBrokenTitle === 'function' && isBrokenTitle(item.title)) return false;
    if (forceAll) return true;
    const missingStudio  = !item.studio || item.studio === 'Unknown Studio';
    const missingDate    = !item.releaseDate || item.releaseDate === 'TBA';
    const missingSyn     = !item.synopsis || item.synopsis.trim() === '';
    const missingGenres  = !Array.isArray(item.genres) || item.genres.length === 0;
    const missingLang    = !item.titleEnglish || !item.titleRomaji;
    return missingStudio || missingDate || missingSyn || missingGenres || missingLang;
  });

  if (targets.length === 0) {
    if (typeof showToast === 'function') {
      showToast('All targeted entries already have complete metadata!');
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

  const BATCH_SIZE   = 8;
  let   processed    = 0;
  let   updatedCount = 0;

  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    if (state.enrichStopRequested) break;

    const batch = targets.slice(i, i + BATCH_SIZE);
    const pct   = Math.round((processed / targets.length) * 100);
    if (progressBar) progressBar.style.width = `${pct}%`;
    if (statusText) {
      statusText.textContent = `⚡ [AniList] Auto-filling Studio, Release Date, Genres & Titles (${processed} / ${targets.length})...`;
    }

    const varDefs = batch.map((_, idx) => `$s${idx}: String`).join(', ');
    const queryFields = batch.map((_, idx) => `
      q${idx}: Page(perPage: 3) {
        media(search: $s${idx}, type: ANIME) {
          ${ANILIST_MEDIA_FIELDS}
        }
      }
    `).join('\n');

    const variables = Object.fromEntries(
      batch.map((item, idx) => [`s${idx}`, getCleanSearchTitle(item.title)])
    );

    const fullQuery = `query (${varDefs}) {\n${queryFields}\n}`;
    let batchSuccess = false;

    try {
      let res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept':       'application/json'
        },
        body: JSON.stringify({ query: fullQuery, variables })
      });

      // Handle AniList rate limit gracefully
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 2000));
        res = await fetch('https://graphql.anilist.co', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ query: fullQuery, variables })
        });
      }

      if (res.ok) {
        const json = await res.json();
        const data = json?.data || {};

        for (let idx = 0; idx < batch.length; idx++) {
          const item = batch[idx];
          const candidates = data[`q${idx}`]?.media || [];
          const media = pickBestAniListMedia(candidates, item);

          if (media) {
            if (applyAniListMedia(item, media, forceAll)) {
              updatedCount++;
            }
          } else {
            // Fallback to Wikipedia if AniList returned empty
            const wikiUpdated = await fetchWikiFallback(item);
            if (wikiUpdated) updatedCount++;
          }
        }
        batchSuccess = true;
      }
    } catch (err) {
      batchSuccess = false;
    }

    // Single-query fallback if batch encountered an error
    if (!batchSuccess) {
      for (const item of batch) {
        if (state.enrichStopRequested) break;
        const candidates = await fetchSingleAniList(item);
        const media = pickBestAniListMedia(candidates, item);
        if (media) {
          if (applyAniListMedia(item, media, forceAll)) updatedCount++;
        } else {
          const wikiUpdated = await fetchWikiFallback(item);
          if (wikiUpdated) updatedCount++;
        }
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    if (typeof saveItems === 'function') saveItems(false);
    if (typeof renderLibrary === 'function') renderLibrary();

    processed += batch.length;
    await new Promise((r) => setTimeout(r, 500));
  }

  if (progressBar) progressBar.style.width = '100%';
  state.enrichRunning = false;
  if (banner) setTimeout(() => banner.classList.add('hidden'), 1200);
  if (typeof saveItems === 'function') saveItems(true);
  if (typeof renderAll === 'function') renderAll();
  if (typeof showToast === 'function') {
    showToast(`Enriched ${updatedCount} entries with Studio, Release Date, Genres & Titles!`);
  }
}
