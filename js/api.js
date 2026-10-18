/* ==========================================================================
   OmniChart — API Module
   Multi-Source Category-Aware Metadata & Auto-Search Engine:
   - Games: CheapShark (Steam 600x900 CDN) + Wikipedia (WP:VG parser)
   - Movies: iTunes Movies API + AniList Movie GraphQL
   - Series & Anime: AniList Anime GraphQL + TVMaze API
   - Books: Google Books API + AniList Manga GraphQL
   ========================================================================== */

// ---------------------------------------------------------------------------
// Shared Utility Helpers & GraphQL Fragments
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

const KNOWN_GAME_GENRES = [
  'Action-adventure', 'Action RPG', 'Role-playing', 'First-person shooter',
  'Third-person shooter', 'Platformer', 'Metroidvania', 'Roguelike',
  'Survival horror', 'Strategy', 'Simulation', 'Fighting', 'Sports',
  'Racing', 'Puzzle', 'Hack and slash', 'Stealth', 'Open world',
  'Sandbox', 'Visual novel', 'Battle royale', 'Tactical shooter', 'Soulslike'
];

/** Generate an in-memory SVG poster fallback if remote image is missing or blocked */
function makeFallbackPoster(title) {
  const clean = (title || 'Media').slice(0, 22).replace(/[<>&'"]/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="360" viewBox="0 0 240 360">
    <rect width="240" height="360" fill="#0d0e11"/>
    <rect x="10" y="10" width="220" height="340" rx="10" fill="#2c3539" stroke="#3d494f" stroke-width="2"/>
    <text x="120" y="180" text-anchor="middle" fill="#ff9f1c" font-family="sans-serif" font-size="14" font-weight="bold">${clean}</text>
  </svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

/** Sanitise a synopsis returned as HTML into clean plain text */
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

/** Format season + year into human-friendly release date */
function formatSeasonYear(season, year, fallbackYear) {
  const y = year || fallbackYear;
  if (season && y) {
    const cap = season.charAt(0).toUpperCase() + season.slice(1).toLowerCase();
    return `${cap} ${y}`;
  }
  if (y) return String(y);
  return 'TBA';
}

/** Strip release tags, formats, season numbers for crisp search queries */
function getCleanSearchTitle(rawTitle) {
  if (!rawTitle) return '';
  let t = String(rawTitle).trim();
  t = t.replace(/\s*\[[^\]]+\]/gi, '');
  t = t.replace(/\s*\(?(?:TV|Movie|ONA|OVA|Special|Dub|Sub|Subbed|Dubbed)\)?/gi, '');
  t = t.replace(/\s*[-:]?\s*\(?(?:Season\s*\d+|2nd\s*Season|3rd\s*Season|4th\s*Season|Final\s*Season|Part\s*\d+|Cour\s*\d+)\)?/gi, '');
  t = t.replace(/[\s\-:]+$/g, '');
  t = t.replace(/\s+/g, ' ').trim();
  return t || rawTitle.trim();
}

/** Parse Developer, Publisher & Genres from English Wikipedia extract */
function parseWikiGameMetadata(extract) {
  if (!extract) return { studio: 'Unknown Developer', genres: [], releaseDate: 'TBA', synopsis: '' };

  let studio = 'Unknown Developer';
  const devMatch = extract.match(/developed by ([^.,;]+?)(?: and published by|, published by|\.|,|;)/i)
    || extract.match(/by developer ([^.,;]+?)(?: and published by|, published by|\.|,|;)/i)
    || extract.match(/published by ([^.,;]+?)(?:\.|,|;)/i);
  if (devMatch && devMatch[1]) {
    const dev = devMatch[1].replace(/\s*\([^)]*\)/g, '').trim();
    if (dev && dev.length < 50 && !/^(the|a|an)$/i.test(dev)) studio = dev;
  }

  const genres = [];
  const lowExt = extract.toLowerCase();
  for (const g of KNOWN_GAME_GENRES) {
    const lowG = g.toLowerCase();
    if (lowExt.includes(lowG) || (lowG === 'action rpg' && lowExt.includes('action role-playing'))) {
      if (!genres.includes(g)) genres.push(g);
      if (genres.length >= 4) break;
    }
  }

  let releaseDate = 'TBA';
  const yearMatch = extract.match(/\b(19[7-9]\d|20[0-3]\d)\b/);
  if (yearMatch) {
    releaseDate = yearMatch[1];
  }

  return {
    studio,
    genres,
    releaseDate,
    synopsis: extract.trim()
  };
}

// ---------------------------------------------------------------------------
// Category-Specific API Search Engines
// ---------------------------------------------------------------------------

/** 1. Games: CheapShark (Steam 600x900 CDN) + Wikipedia Video Game */
async function searchGamesApi(cleanTitle, signal) {
  const results = [];
  try {
    const [sharkRes, wikiRes] = await Promise.allSettled([
      fetch(`https://www.cheapshark.com/api/1.0/games?title=${encodeURIComponent(cleanTitle)}&limit=5`, { signal })
        .then((r) => (r.ok ? r.json() : [])),
      fetch(
        `https://en.wikipedia.org/w/api.php?action=query&origin=*&format=json&generator=search&gsrsearch=${encodeURIComponent(
          cleanTitle + ' video game'
        )}&gsrlimit=4&prop=pageimages|extracts&pilicense=any&exintro=1&explaintext=1&exchars=420&piprop=thumbnail&pithumbsize=600`,
        { signal }
      ).then((r) => (r.ok ? r.json() : {}))
    ]);

    const sharkData = sharkRes.status === 'fulfilled' && Array.isArray(sharkRes.value) ? sharkRes.value : [];
    const wikiPages = wikiRes.status === 'fulfilled' ? Object.values(wikiRes.value?.query?.pages || {}) : [];

    const parsedWiki = wikiPages.map((p) => ({
      rawTitle: (p.title || '').replace(/\s*\([^)]*game[^)]*\)/gi, '').trim(),
      ...parseWikiGameMetadata(p.extract || ''),
      thumbnail: p.thumbnail?.source || ''
    }));

    if (sharkData.length > 0) {
      for (const g of sharkData) {
        const steamCover = g.steamAppID
          ? `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${g.steamAppID}/library_600x900.jpg`
          : (g.thumb || '');
        const matchedWiki = parsedWiki.find(
          (w) =>
            w.rawTitle.toLowerCase() === g.external.toLowerCase() ||
            w.rawTitle.toLowerCase().includes(g.external.toLowerCase()) ||
            g.external.toLowerCase().includes(w.rawTitle.toLowerCase())
        ) || parsedWiki[0];

        results.push({
          title: g.external,
          titleEnglish: g.external,
          titleRomaji: '',
          category: 'Games',
          totalUnits: 1,
          unitName: 'hrs',
          studio: matchedWiki?.studio || 'Unknown Developer',
          releaseDate: matchedWiki?.releaseDate || 'TBA',
          genres: matchedWiki?.genres || [],
          image: steamCover || matchedWiki?.thumbnail || '',
          synopsis: matchedWiki?.synopsis || ''
        });
      }
    } else if (parsedWiki.length > 0) {
      for (const w of parsedWiki) {
        results.push({
          title: w.rawTitle,
          titleEnglish: w.rawTitle,
          titleRomaji: '',
          category: 'Games',
          totalUnits: 1,
          unitName: 'hrs',
          studio: w.studio,
          releaseDate: w.releaseDate,
          genres: w.genres,
          image: w.thumbnail,
          synopsis: w.synopsis
        });
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') throw err;
  }
  return results;
}

/** 2. Movies: Apple / iTunes Movies API + AniList Anime Movie */
async function searchMoviesApi(cleanTitle, signal) {
  const results = [];
  try {
    const [itunesRes, anilistRes] = await Promise.allSettled([
      fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(cleanTitle)}&media=movie&entity=movie&limit=5`, { signal })
        .then((r) => (r.ok ? r.json() : { results: [] })),
      fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          query: `query ($s: String) {
            Page(perPage: 3) {
              media(search: $s, type: ANIME, format: MOVIE) {
                ${ANILIST_MEDIA_FIELDS}
              }
            }
          }`,
          variables: { s: cleanTitle }
        }),
        signal
      }).then((r) => (r.ok ? r.json() : {}))
    ]);

    if (itunesRes.status === 'fulfilled' && Array.isArray(itunesRes.value?.results)) {
      for (const m of itunesRes.value.results) {
        const poster = m.artworkUrl100
          ? m.artworkUrl100.replace(/100x100bb\.jpg$/i, '600x900bb.jpg')
          : '';
        results.push({
          title: m.trackName,
          titleEnglish: m.trackName,
          titleRomaji: '',
          category: 'Movies',
          totalUnits: 1,
          unitName: 'movie',
          studio: m.artistName || 'Unknown Director',
          releaseDate: m.releaseDate ? m.releaseDate.slice(0, 4) : 'TBA',
          genres: m.primaryGenreName ? [m.primaryGenreName] : [],
          image: poster,
          synopsis: cleanHtmlSynopsis(m.longDescription || m.shortDescription || '')
        });
      }
    }

    if (anilistRes.status === 'fulfilled') {
      const mediaList = anilistRes.value?.data?.Page?.media || [];
      for (const m of mediaList) {
        const studioNodes = m.studios?.nodes || [];
        const anim = Array.from(new Set(studioNodes.filter((n) => n.isAnimationStudio).map((n) => n.name).filter(Boolean)));
        const allNames = Array.from(new Set(studioNodes.map((n) => n.name).filter(Boolean)));
        const studio = (anim.length ? anim : allNames).slice(0, 2).join(', ') || 'Unknown Studio';
        results.push({
          title: m.title?.english || m.title?.romaji || cleanTitle,
          titleEnglish: m.title?.english || m.title?.romaji || cleanTitle,
          titleRomaji: m.title?.romaji || '',
          category: 'Movies',
          totalUnits: 1,
          unitName: 'movie',
          studio,
          releaseDate: formatSeasonYear(m.season, m.seasonYear, m.startDate?.year),
          genres: (m.genres || []).slice(0, 4),
          image: m.coverImage?.extraLarge || m.coverImage?.large || '',
          synopsis: cleanHtmlSynopsis(m.description)
        });
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') throw err;
  }
  return results;
}

/** 3. Series & Anime: AniList Anime GraphQL + TVMaze API */
async function searchSeriesApi(cleanTitle, signal) {
  const results = [];
  try {
    const [anilistRes, tvmazeRes] = await Promise.allSettled([
      fetch('https://graphql.anilist.co', {
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
          variables: { s: cleanTitle }
        }),
        signal
      }).then((r) => (r.ok ? r.json() : {})),
      fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(cleanTitle)}`, { signal })
        .then((r) => (r.ok ? r.json() : []))
    ]);

    if (anilistRes.status === 'fulfilled') {
      const mediaList = anilistRes.value?.data?.Page?.media || [];
      for (const m of mediaList) {
        const isMovie = m.format === 'MOVIE';
        const studioNodes = m.studios?.nodes || [];
        const anim = Array.from(new Set(studioNodes.filter((n) => n.isAnimationStudio).map((n) => n.name).filter(Boolean)));
        const allNames = Array.from(new Set(studioNodes.map((n) => n.name).filter(Boolean)));
        const studio = (anim.length ? anim : allNames).slice(0, 2).join(', ') || 'Unknown Studio';
        results.push({
          title: m.title?.english || m.title?.romaji || cleanTitle,
          titleEnglish: m.title?.english || m.title?.romaji || cleanTitle,
          titleRomaji: m.title?.romaji || '',
          category: isMovie ? 'Movies' : 'Series & Anime',
          totalUnits: isMovie ? 1 : (m.episodes || 12),
          unitName: isMovie ? 'movie' : 'eps',
          studio,
          releaseDate: formatSeasonYear(m.season, m.seasonYear, m.startDate?.year),
          genres: (m.genres || []).slice(0, 4),
          image: m.coverImage?.extraLarge || m.coverImage?.large || '',
          synopsis: cleanHtmlSynopsis(m.description)
        });
      }
    }

    if (tvmazeRes.status === 'fulfilled' && Array.isArray(tvmazeRes.value)) {
      for (const item of tvmazeRes.value.slice(0, 4)) {
        const show = item.show;
        if (!show) continue;
        const studio = show.network?.name || show.webChannel?.name || 'Unknown Network';
        const relDate = show.premiered ? show.premiered.slice(0, 4) : 'TBA';
        const poster = show.image?.original || show.image?.medium || '';
        results.push({
          title: show.name,
          titleEnglish: show.name,
          titleRomaji: '',
          category: 'Series & Anime',
          totalUnits: 12,
          unitName: 'eps',
          studio,
          releaseDate: relDate,
          genres: Array.isArray(show.genres) ? show.genres.slice(0, 4) : [],
          image: poster,
          synopsis: cleanHtmlSynopsis(show.summary || '')
        });
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') throw err;
  }
  return results;
}

/** 4. Books: Google Books API + AniList Manga GraphQL */
async function searchBooksApi(cleanTitle, signal) {
  const results = [];
  try {
    const [booksRes, mangaRes] = await Promise.allSettled([
      fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(cleanTitle)}&maxResults=5`, { signal })
        .then((r) => (r.ok ? r.json() : { items: [] })),
      fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          query: `query ($s: String) {
            Page(perPage: 3) {
              media(search: $s, type: MANGA) {
                title { english romaji native }
                startDate { year }
                chapters
                volumes
                genres
                description(asHtml: false)
                staff { nodes { name { full } } }
                coverImage { extraLarge large }
              }
            }
          }`,
          variables: { s: cleanTitle }
        }),
        signal
      }).then((r) => (r.ok ? r.json() : {}))
    ]);

    if (booksRes.status === 'fulfilled' && Array.isArray(booksRes.value?.items)) {
      for (const b of booksRes.value.items) {
        const v = b.volumeInfo || {};
        let img = v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail || '';
        if (img) img = img.replace(/^http:/, 'https:').replace(/&edge=curl/g, '').replace(/zoom=\d/, 'zoom=2');
        const authors = Array.isArray(v.authors) ? v.authors.join(', ') : (v.publisher || 'Unknown Author');
        results.push({
          title: v.title || cleanTitle,
          titleEnglish: v.title || cleanTitle,
          titleRomaji: '',
          category: 'Books',
          totalUnits: v.pageCount || 1,
          unitName: 'chs',
          studio: authors,
          releaseDate: v.publishedDate ? v.publishedDate.slice(0, 4) : 'TBA',
          genres: Array.isArray(v.categories) ? v.categories.slice(0, 4) : [],
          image: img,
          synopsis: cleanHtmlSynopsis(v.description || '')
        });
      }
    }

    if (mangaRes.status === 'fulfilled') {
      const mediaList = mangaRes.value?.data?.Page?.media || [];
      for (const m of mediaList) {
        const staffNodes = m.staff?.nodes || [];
        const creator = staffNodes[0]?.name?.full || 'Unknown Creator';
        results.push({
          title: m.title?.english || m.title?.romaji || cleanTitle,
          titleEnglish: m.title?.english || m.title?.romaji || cleanTitle,
          titleRomaji: m.title?.romaji || '',
          category: 'Books',
          totalUnits: m.chapters || m.volumes || 1,
          unitName: 'chs',
          studio: creator,
          releaseDate: m.startDate?.year ? String(m.startDate.year) : 'TBA',
          genres: (m.genres || []).slice(0, 4),
          image: m.coverImage?.extraLarge || m.coverImage?.large || '',
          synopsis: cleanHtmlSynopsis(m.description)
        });
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') throw err;
  }
  return results;
}

// ---------------------------------------------------------------------------
// Progressive Category-Aware Auto-Search Controller
// ---------------------------------------------------------------------------

let activeSearchController = null;
let searchTimer = null;
let searchSeq = 0;

/**
 * Run category-aware progressive search with AbortController cancellation,
 * streaming results to the UI dropdown immediately.
 */
async function runAutoSearch(query) {
  const q = (query || '').trim();
  const box = document.getElementById('autoSearchResults');
  const statusEl = document.getElementById('autoSearchStatus');

  if (q.length < 2) {
    if (box) box.classList.add('hidden');
    if (statusEl) statusEl.textContent = '';
    return;
  }

  // Cancel prior in-flight search
  if (activeSearchController) {
    activeSearchController.abort();
  }
  activeSearchController = new AbortController();
  const signal = activeSearchController.signal;

  const mySeq = ++searchSeq;
  if (statusEl) statusEl.textContent = 'Searching...';

  const results = [];
  const seenKeys = new Set();

  function renderDropdown() {
    if (mySeq !== searchSeq || !box) return;
    if (results.length === 0) {
      box.innerHTML = `<div class="p-3 text-xs text-slate-400">No matches found across catalog.</div>`;
    } else {
      box.innerHTML = results.slice(0, 8).map((r, idx) => `
        <button
          type="button"
          data-action="pick-search-result"
          data-idx="${idx}"
          class="w-full p-2.5 text-left hover:bg-[#2c3539] flex items-center gap-3 transition border-b border-[#2c3539]/40 last:border-0"
        >
          <img
            src="${typeof esc === 'function' ? esc(r.image || makeFallbackPoster(r.title)) : (r.image || makeFallbackPoster(r.title))}"
            class="w-10 h-14 object-cover rounded bg-[#2c3539] shrink-0"
            onerror="this.src='${makeFallbackPoster(r.title)}'"
          />
          <div class="min-w-0 flex-1">
            <div class="font-bold text-xs text-white truncate">${typeof esc === 'function' ? esc(r.title) : r.title}</div>
            <div class="text-[11px] text-[#ff9f1c] truncate">${typeof esc === 'function' ? esc(r.category) : r.category} \u2022 ${typeof esc === 'function' ? esc(r.releaseDate || 'TBA') : (r.releaseDate || 'TBA')} \u2022 ${typeof esc === 'function' ? esc(r.studio || '') : (r.studio || '')}</div>
            <div class="text-[11px] text-slate-400 truncate">${typeof esc === 'function' ? esc(r.synopsis || '') : (r.synopsis || '')}</div>
          </div>
        </button>
      `).join('');
    }
    box.classList.remove('hidden');
  }

  function addResults(newItems) {
    for (const item of newItems) {
      const key = `${(item.category || '').toLowerCase()}::${(item.title || '').toLowerCase()}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        results.push(item);
      }
    }
    window._lastSearchResults = results;
    renderDropdown();
  }

  window._lastSearchResults = results;

  const cleanTitle = getCleanSearchTitle(q);
  const modalCat = document.getElementById('fieldCategory')?.value || (state?.category !== 'All' ? state?.category : 'All');

  try {
    if (modalCat === 'Games') {
      const gResults = await searchGamesApi(cleanTitle, signal);
      addResults(gResults);
    } else if (modalCat === 'Movies') {
      const mResults = await searchMoviesApi(cleanTitle, signal);
      addResults(mResults);
    } else if (modalCat === 'Books') {
      const bResults = await searchBooksApi(cleanTitle, signal);
      addResults(bResults);
    } else if (modalCat === 'Series & Anime') {
      // Primary AniList Anime + TVMaze
      const sResults = await searchSeriesApi(cleanTitle, signal);
      addResults(sResults);

      // Supplementary search in background if sparse
      if (results.length < 3) {
        Promise.allSettled([
          searchMoviesApi(cleanTitle, signal),
          searchGamesApi(cleanTitle, signal)
        ]).then(([mSettled, gSettled]) => {
          if (mSettled.status === 'fulfilled') addResults(mSettled.value);
          if (gSettled.status === 'fulfilled') addResults(gSettled.value);
        });
      }
    } else {
      // All categories concurrent search
      Promise.allSettled([
        searchSeriesApi(cleanTitle, signal).then(addResults),
        searchGamesApi(cleanTitle, signal).then(addResults),
        searchMoviesApi(cleanTitle, signal).then(addResults),
        searchBooksApi(cleanTitle, signal).then(addResults)
      ]);
    }
  } catch (err) {
    if (err.name === 'AbortError') return;
  }

  if (mySeq === searchSeq && statusEl) {
    statusEl.textContent = '';
  }
}

// ---------------------------------------------------------------------------
// Single Item Category Enrichers & AniList Matchers
// ---------------------------------------------------------------------------

/** Pick best AniList match among candidates based on format and title */
function pickBestAniListMedia(candidates, item) {
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const clean = getCleanSearchTitle(item.title).toLowerCase();

  const exact = candidates.find((c) => {
    const eng = (c.title?.english || '').toLowerCase();
    const rom = (c.title?.romaji || '').toLowerCase();
    return eng === clean || rom === clean;
  });
  if (exact) return exact;

  if (item.category === 'Movies') {
    const movie = candidates.find((c) => c.format === 'MOVIE');
    if (movie) return movie;
  } else {
    const tv = candidates.find((c) => c.format === 'TV' || c.format === 'TV_SHORT' || c.format === 'ONA');
    if (tv) return tv;
  }

  return candidates[0];
}

/** Apply enriched AniList media cleanly to an item without clobbering manual edits */
function applyAniListMedia(item, media, forceAll = false) {
  if (!item || !media) return false;
  let changed = false;
  const edited = item._manualFields || [];

  if (media.title?.english && (!item.titleEnglish || forceAll)) {
    item.titleEnglish = media.title.english;
    changed = true;
  }
  if (media.title?.romaji && (!item.titleRomaji || forceAll)) {
    item.titleRomaji = media.title.romaji;
    changed = true;
  }

  const studioNodes = media.studios?.nodes || [];
  const animStudios = Array.from(new Set(studioNodes.filter((n) => n.isAnimationStudio).map((n) => n.name).filter(Boolean)));
  const allStudios = Array.from(new Set(studioNodes.map((n) => n.name).filter(Boolean)));
  const chosenStudios = (animStudios.length > 0 ? animStudios : allStudios).slice(0, 2).join(', ');

  if (chosenStudios && !edited.includes('studio') && (!item.studio || item.studio === 'Unknown Studio' || forceAll)) {
    item.studio = chosenStudios;
    changed = true;
  }

  const rel = formatSeasonYear(media.season, media.seasonYear, media.startDate?.year);
  if (rel !== 'TBA' && !edited.includes('releaseDate') && (!item.releaseDate || item.releaseDate === 'TBA' || forceAll)) {
    item.releaseDate = rel;
    changed = true;
  }

  if (Array.isArray(media.genres) && media.genres.length > 0 && !edited.includes('genres') && (!item.genres || item.genres.length === 0 || forceAll)) {
    item.genres = media.genres.slice(0, 4);
    changed = true;
  }

  const cleanDesc = cleanHtmlSynopsis(media.description);
  if (cleanDesc && !edited.includes('synopsis') && (!item.synopsis || item.synopsis.trim() === '' || forceAll)) {
    item.synopsis = cleanDesc;
    changed = true;
  }

  if (!item.image && (media.coverImage?.extraLarge || media.coverImage?.large)) {
    item.image = media.coverImage.extraLarge || media.coverImage.large;
    changed = true;
  }

  if (media.episodes && (!item.totalUnits || item.totalUnits === 12)) {
    item.totalUnits = media.episodes;
    if (item.status === 'Completed') item.progress = media.episodes;
    changed = true;
  }

  if (media.format === 'MOVIE') {
    item.category = 'Movies';
    item.unitName = 'movie';
    item.totalUnits = 1;
    if (item.status === 'Completed') item.progress = 1;
    changed = true;
  }

  if (changed) item.updatedAt = Date.now();
  return changed;
}

/** Fallback to TVMaze for live-action or Western TV shows */
async function fetchTvMazeFallback(item) {
  try {
    const cleanTitle = getCleanSearchTitle(item.title);
    const res = await fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(cleanTitle)}`);
    if (!res.ok) return false;
    const data = await res.json();
    const show = data?.[0]?.show;
    if (!show) return false;
    let changed = false;
    const edited = item._manualFields || [];

    if (!edited.includes('studio') && (!item.studio || item.studio === 'Unknown Studio')) {
      const net = show.network?.name || show.webChannel?.name;
      if (net) { item.studio = net; changed = true; }
    }
    if (!edited.includes('releaseDate') && (!item.releaseDate || item.releaseDate === 'TBA')) {
      if (show.premiered) { item.releaseDate = show.premiered.slice(0, 4); changed = true; }
    }
    if (!edited.includes('genres') && (!item.genres || item.genres.length === 0)) {
      if (Array.isArray(show.genres) && show.genres.length > 0) { item.genres = show.genres.slice(0, 4); changed = true; }
    }
    if (!edited.includes('synopsis') && (!item.synopsis || item.synopsis.trim() === '')) {
      const syn = cleanHtmlSynopsis(show.summary || '');
      if (syn) { item.synopsis = syn; changed = true; }
    }
    if (!item.image && (show.image?.original || show.image?.medium)) {
      item.image = show.image.original || show.image.medium;
      changed = true;
    }
    if (changed) item.updatedAt = Date.now();
    return changed;
  } catch (e) {
    return false;
  }
}

/** Enrich Games via CheapShark (Steam 600x900 cover) + Wikipedia VG parser */
async function enrichGameItem(item, forceAll = false) {
  const cleanTitle = getCleanSearchTitle(item.title);
  let changed = false;
  const edited = item._manualFields || [];

  try {
    const [sharkRes, wikiRes] = await Promise.allSettled([
      fetch(`https://www.cheapshark.com/api/1.0/games?title=${encodeURIComponent(cleanTitle)}&limit=3`)
        .then((r) => (r.ok ? r.json() : [])),
      fetch(
        `https://en.wikipedia.org/w/api.php?action=query&origin=*&format=json&generator=search&gsrsearch=${encodeURIComponent(
          cleanTitle + ' video game'
        )}&gsrlimit=2&prop=pageimages|extracts&pilicense=any&exintro=1&explaintext=1&exchars=420&piprop=thumbnail&pithumbsize=600`
      ).then((r) => (r.ok ? r.json() : {}))
    ]);

    const sharkGames = sharkRes.status === 'fulfilled' && Array.isArray(sharkRes.value) ? sharkRes.value : [];
    const wikiPages = wikiRes.status === 'fulfilled' ? Object.values(wikiRes.value?.query?.pages || {}) : [];
    const wikiData = wikiPages.length > 0 ? {
      ...parseWikiGameMetadata(wikiPages[0].extract || ''),
      thumbnail: wikiPages[0].thumbnail?.source || ''
    } : null;

    if (!item.image || forceAll) {
      const steamMatch = sharkGames.find((g) => g.steamAppID);
      if (steamMatch) {
        item.image = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${steamMatch.steamAppID}/library_600x900.jpg`;
        changed = true;
      } else if (sharkGames[0]?.thumb) {
        item.image = sharkGames[0].thumb;
        changed = true;
      } else if (wikiData?.thumbnail) {
        item.image = wikiData.thumbnail;
        changed = true;
      }
    }

    if (wikiData) {
      if (!edited.includes('studio') && (!item.studio || item.studio === 'Unknown Studio' || item.studio === 'Wikipedia' || forceAll)) {
        if (wikiData.studio && wikiData.studio !== 'Unknown Developer') {
          item.studio = wikiData.studio;
          changed = true;
        }
      }
      if (!edited.includes('releaseDate') && (!item.releaseDate || item.releaseDate === 'TBA' || forceAll)) {
        if (wikiData.releaseDate && wikiData.releaseDate !== 'TBA') {
          item.releaseDate = wikiData.releaseDate;
          changed = true;
        }
      }
      if (!edited.includes('genres') && (!item.genres || item.genres.length === 0 || forceAll)) {
        if (Array.isArray(wikiData.genres) && wikiData.genres.length > 0) {
          item.genres = wikiData.genres.slice(0, 4);
          changed = true;
        }
      }
      if (!edited.includes('synopsis') && (!item.synopsis || item.synopsis.trim() === '' || forceAll)) {
        if (wikiData.synopsis) {
          item.synopsis = wikiData.synopsis;
          changed = true;
        }
      }
    }
  } catch (err) {}

  if (changed) item.updatedAt = Date.now();
  return changed;
}

/** Enrich Movies via Apple / iTunes Movies API + Wikipedia fallback */
async function enrichMovieItem(item, forceAll = false) {
  const cleanTitle = getCleanSearchTitle(item.title);
  let changed = false;
  const edited = item._manualFields || [];

  try {
    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(cleanTitle)}&media=movie&entity=movie&limit=3`);
    if (res.ok) {
      const data = await res.json();
      const m = data.results?.[0];
      if (m) {
        if (!item.image || forceAll) {
          if (m.artworkUrl100) {
            item.image = m.artworkUrl100.replace(/100x100bb\.jpg$/i, '600x900bb.jpg');
            changed = true;
          }
        }
        if (!edited.includes('studio') && (!item.studio || item.studio === 'Unknown Studio' || forceAll)) {
          if (m.artistName) {
            item.studio = m.artistName;
            changed = true;
          }
        }
        if (!edited.includes('releaseDate') && (!item.releaseDate || item.releaseDate === 'TBA' || forceAll)) {
          if (m.releaseDate) {
            item.releaseDate = m.releaseDate.slice(0, 4);
            changed = true;
          }
        }
        if (!edited.includes('genres') && (!item.genres || item.genres.length === 0 || forceAll)) {
          if (m.primaryGenreName) {
            item.genres = [m.primaryGenreName];
            changed = true;
          }
        }
        if (!edited.includes('synopsis') && (!item.synopsis || item.synopsis.trim() === '' || forceAll)) {
          const desc = cleanHtmlSynopsis(m.longDescription || m.shortDescription || '');
          if (desc) {
            item.synopsis = desc;
            changed = true;
          }
        }
      }
    }
  } catch (err) {}

  if (!changed) {
    changed = await fetchWikiFallback(item);
  }

  if (changed) item.updatedAt = Date.now();
  return changed;
}

/** Enrich Books via Google Books API + Wikipedia fallback */
async function enrichBookItem(item, forceAll = false) {
  const cleanTitle = getCleanSearchTitle(item.title);
  let changed = false;
  const edited = item._manualFields || [];

  try {
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(cleanTitle)}&maxResults=3`);
    if (res.ok) {
      const data = await res.json();
      const b = data.items?.[0]?.volumeInfo;
      if (b) {
        if (!item.image || forceAll) {
          let img = b.imageLinks?.thumbnail || b.imageLinks?.smallThumbnail || '';
          if (img) {
            img = img.replace(/^http:/, 'https:').replace(/&edge=curl/g, '').replace(/zoom=\d/, 'zoom=2');
            item.image = img;
            changed = true;
          }
        }
        if (!edited.includes('studio') && (!item.studio || item.studio === 'Unknown Studio' || forceAll)) {
          const authors = Array.isArray(b.authors) ? b.authors.join(', ') : (b.publisher || '');
          if (authors) {
            item.studio = authors;
            changed = true;
          }
        }
        if (!edited.includes('releaseDate') && (!item.releaseDate || item.releaseDate === 'TBA' || forceAll)) {
          if (b.publishedDate) {
            item.releaseDate = b.publishedDate.slice(0, 4);
            changed = true;
          }
        }
        if (!edited.includes('genres') && (!item.genres || item.genres.length === 0 || forceAll)) {
          if (Array.isArray(b.categories) && b.categories.length > 0) {
            item.genres = b.categories.slice(0, 4);
            changed = true;
          }
        }
        if (!edited.includes('synopsis') && (!item.synopsis || item.synopsis.trim() === '' || forceAll)) {
          const desc = cleanHtmlSynopsis(b.description || '');
          if (desc) {
            item.synopsis = desc;
            changed = true;
          }
        }
      }
    }
  } catch (err) {}

  if (!changed) {
    changed = await fetchWikiFallback(item);
  }

  if (changed) item.updatedAt = Date.now();
  return changed;
}

/** Wikipedia API fallback for unindexed entries */
async function fetchWikiFallback(item) {
  try {
    const cleanTitle = getCleanSearchTitle(item.title);
    const url = `https://en.wikipedia.org/w/api.php?action=query&origin=*&format=json&generator=search&gsrsearch=${encodeURIComponent(
      cleanTitle
    )}&gsrlimit=1&prop=pageimages|extracts&pilicense=any&exintro=1&explaintext=1&exchars=350&piprop=thumbnail&pithumbsize=500`;
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
    if (changed) item.updatedAt = Date.now();
    return changed;
  } catch (e) {
    return false;
  }
}

/** Single AniList query fallback if batch query fails */
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
// Category-Aware Batch Metadata Enricher
// ---------------------------------------------------------------------------

/**
 * Walk through every library item missing metadata and enrich using the
 * category-aware pipeline: Games (CheapShark/Wiki), Movies (iTunes/AniList),
 * Books (Google Books/Wiki), and Series & Anime (AniList/TVMaze).
 */
async function enrichMissingMetadata(forceAll = false, customTargets = null) {
  if (state.enrichRunning) return;

  if (typeof sanitizeAndRecoverItems === 'function') {
    sanitizeAndRecoverItems(state.items);
  }

  const targets = Array.isArray(customTargets) ? customTargets : state.items.filter((item) => {
    if (typeof isBrokenTitle === 'function' && isBrokenTitle(item.title)) return false;
    if (forceAll) return true;
    const missingStudio = !item.studio || item.studio === 'Unknown Studio';
    const missingDate = !item.releaseDate || item.releaseDate === 'TBA';
    const missingSyn = !item.synopsis || item.synopsis.trim() === '';
    const missingGenres = !Array.isArray(item.genres) || item.genres.length === 0;
    const missingLang = (item.category === 'Series & Anime' || !item.category) && (!item.titleEnglish || !item.titleRomaji);
    return missingStudio || missingDate || missingSyn || missingGenres || missingLang;
  });

  if (targets.length === 0) {
    if (typeof showToast === 'function') {
      showToast('All targeted entries already have complete metadata!');
    }
    if (typeof renderAll === 'function') renderAll();
    return;
  }

  state.enrichRunning = true;
  state.enrichStopRequested = false;

  const banner = document.getElementById('enrichBanner');
  const statusText = document.getElementById('enrichStatusText');
  const progressBar = document.getElementById('enrichProgressBar');
  if (banner) banner.classList.remove('hidden');

  let processed = 0;
  let updatedCount = 0;

  // Split targets by category for optimal pipeline routing
  const gameItems = targets.filter((i) => i.category === 'Games');
  const movieItems = targets.filter((i) => i.category === 'Movies');
  const bookItems = targets.filter((i) => i.category === 'Books');
  const seriesItems = targets.filter((i) => i.category !== 'Games' && i.category !== 'Movies' && i.category !== 'Books');

  // 1. Enrich Games (CheapShark + Steam 600x900 + Wikipedia VG)
  for (const item of gameItems) {
    if (state.enrichStopRequested) break;
    if (statusText) statusText.textContent = `🎮 [Games] Auto-filling Steam Box Art & Studio (${processed + 1} / ${targets.length})...`;
    const didChange = await enrichGameItem(item, forceAll);
    if (didChange) updatedCount++;
    processed++;
    if (progressBar) progressBar.style.width = `${Math.round((processed / targets.length) * 100)}%`;
    if (typeof saveItems === 'function') saveItems(false);
    if (typeof renderLibrary === 'function') renderLibrary();
    await new Promise((r) => setTimeout(r, 200));
  }

  // 2. Enrich Movies (iTunes Movies API + AniList Movie)
  for (const item of movieItems) {
    if (state.enrichStopRequested) break;
    if (statusText) statusText.textContent = `🎬 [Movies] Auto-filling iTunes 600x900 Posters & Director (${processed + 1} / ${targets.length})...`;
    const didChange = await enrichMovieItem(item, forceAll);
    if (didChange) updatedCount++;
    processed++;
    if (progressBar) progressBar.style.width = `${Math.round((processed / targets.length) * 100)}%`;
    if (typeof saveItems === 'function') saveItems(false);
    if (typeof renderLibrary === 'function') renderLibrary();
    await new Promise((r) => setTimeout(r, 200));
  }

  // 3. Enrich Books (Google Books + AniList Manga)
  for (const item of bookItems) {
    if (state.enrichStopRequested) break;
    if (statusText) statusText.textContent = `📚 [Books] Auto-filling Google Books Covers & Authors (${processed + 1} / ${targets.length})...`;
    const didChange = await enrichBookItem(item, forceAll);
    if (didChange) updatedCount++;
    processed++;
    if (progressBar) progressBar.style.width = `${Math.round((processed / targets.length) * 100)}%`;
    if (typeof saveItems === 'function') saveItems(false);
    if (typeof renderLibrary === 'function') renderLibrary();
    await new Promise((r) => setTimeout(r, 200));
  }

  // 4. Enrich Series & Anime (AniList Batch GraphQL + TVMaze fallback)
  const BATCH_SIZE = 8;
  for (let i = 0; i < seriesItems.length; i += BATCH_SIZE) {
    if (state.enrichStopRequested) break;

    const batch = seriesItems.slice(i, i + BATCH_SIZE);
    if (statusText) {
      statusText.textContent = `⚡ [AniList] Auto-filling Studio, Release Date, Genres & Titles (${processed + 1} / ${targets.length})...`;
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
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ query: fullQuery, variables })
      });

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
            if (applyAniListMedia(item, media, forceAll)) updatedCount++;
          } else {
            const tvMazeUpdated = await fetchTvMazeFallback(item);
            if (tvMazeUpdated) {
              updatedCount++;
            } else {
              const wikiUpdated = await fetchWikiFallback(item);
              if (wikiUpdated) updatedCount++;
            }
          }
        }
        batchSuccess = true;
      }
    } catch (err) {
      batchSuccess = false;
    }

    if (!batchSuccess) {
      for (const item of batch) {
        if (state.enrichStopRequested) break;
        const candidates = await fetchSingleAniList(item);
        const media = pickBestAniListMedia(candidates, item);
        if (media) {
          if (applyAniListMedia(item, media, forceAll)) updatedCount++;
        } else {
          const tvMazeUpdated = await fetchTvMazeFallback(item);
          if (tvMazeUpdated) {
            updatedCount++;
          } else {
            const wikiUpdated = await fetchWikiFallback(item);
            if (wikiUpdated) updatedCount++;
          }
        }
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    processed += batch.length;
    if (progressBar) progressBar.style.width = `${Math.round((processed / targets.length) * 100)}%`;
    if (typeof saveItems === 'function') saveItems(false);
    if (typeof renderLibrary === 'function') renderLibrary();

    await new Promise((r) => setTimeout(r, 450));
  }

  if (progressBar) progressBar.style.width = '100%';
  state.enrichRunning = false;
  if (banner) setTimeout(() => banner.classList.add('hidden'), 1200);

  // Single final push to CloudSync once the enrichment run has completely finished
  if (typeof saveItems === 'function') saveItems(true);
  if (typeof renderAll === 'function') renderAll();
  if (typeof showToast === 'function') {
    showToast(`Enriched ${updatedCount} entries with Studio, Release Date, Genres & Artwork!`);
  }
}
