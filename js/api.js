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
  'Racing', 'Puzzle', 'Hack and slash', 'Stealth', 'Open World',
  'Sandbox', 'Visual Novel', 'Battle Royale', 'Tactical', 'Soulslike',
  'Dungeon Crawler', 'Dark Fantasy', 'Sci-Fi', 'Indie'
];

/** Regex rule set for matching video game genres from Wikipedia extracts & category tags */
const GAME_GENRE_RULES = [
  { name: 'Soulslike', regex: /\b(?:soulslike|souls-like)\b/i },
  { name: 'Action RPG', regex: /\b(?:action role-playing|action rpg|arpg)\b/i },
  { name: 'Role-playing', regex: /\b(?:role-playing|rpg|jrpg|crpg|turn-based role-playing)\b/i },
  { name: 'Metroidvania', regex: /\bmetroidvania\b/i },
  { name: 'Roguelike', regex: /\b(?:roguelike|roguelite|rogue-like)\b/i },
  { name: 'First-person shooter', regex: /\b(?:first-person shooter|first-person shooters|fps)\b/i },
  { name: 'Third-person shooter', regex: /\bthird-person shooter(?:s)?\b/i },
  { name: 'Platformer', regex: /\b(?:platformer|platformers|platform game|platform video game)\b/i },
  { name: 'Open World', regex: /\b(?:open-world|open world)\b/i },
  { name: 'Survival horror', regex: /\bsurvival horror\b/i },
  { name: 'Hack and slash', regex: /\bhack and slash\b/i },
  { name: 'Tactical', regex: /\b(?:tactical shooter|tactical role-playing|tactical rpg|strategy video game|turn-based strategy|real-time strategy)\b/i },
  { name: 'Fighting', regex: /\bfighting (?:game|video game)s?\b/i },
  { name: 'Stealth', regex: /\bstealth (?:game|video game)s?\b/i },
  { name: 'Puzzle', regex: /\bpuzzle (?:game|video game)s?\b/i },
  { name: 'Racing', regex: /\bracing (?:game|video game)s?\b/i },
  { name: 'Sports', regex: /\bsports (?:game|video game)s?\b/i },
  { name: 'Simulation', regex: /\b(?:simulation video game|life simulator|simulator)\b/i },
  { name: 'Visual Novel', regex: /\bvisual novel\b/i },
  { name: 'Battle Royale', regex: /\bbattle royale\b/i },
  { name: 'Dungeon Crawler', regex: /\bdungeon crawler\b/i },
  { name: 'Dark Fantasy', regex: /\bdark fantasy\b/i },
  { name: 'Sci-Fi', regex: /\b(?:science fiction|sci-fi|cyberpunk)\b/i },
  { name: 'Indie', regex: /\bindie (?:game|video game|studio)s?\b/i },
  { name: 'Sandbox', regex: /\bsandbox\b/i },
  { name: 'Action-adventure', regex: /\baction-adventure\b/i }
];

/**
 * Curated benchmark lookup table for popular video games.
 * Maps normalized game title keys to accurate HowLongToBeat main story hours and primary genres.
 */
const POPULAR_GAME_BENCHMARKS = {
  // FromSoftware / Souls
  'elden ring': { hours: 60, genres: ['Action RPG', 'Open World', 'Soulslike', 'Dark Fantasy'] },
  'elden ring shadow of the erdtree': { hours: 25, genres: ['Action RPG', 'Soulslike', 'Dark Fantasy'] },
  'dark souls': { hours: 41, genres: ['Action RPG', 'Soulslike', 'Dark Fantasy'] },
  'dark souls remastered': { hours: 41, genres: ['Action RPG', 'Soulslike', 'Dark Fantasy'] },
  'dark souls 2': { hours: 44, genres: ['Action RPG', 'Soulslike', 'Dark Fantasy'] },
  'dark souls ii': { hours: 44, genres: ['Action RPG', 'Soulslike', 'Dark Fantasy'] },
  'dark souls 3': { hours: 32, genres: ['Action RPG', 'Soulslike', 'Dark Fantasy'] },
  'dark souls iii': { hours: 32, genres: ['Action RPG', 'Soulslike', 'Dark Fantasy'] },
  'bloodborne': { hours: 33, genres: ['Action RPG', 'Soulslike', 'Dark Fantasy', 'Survival horror'] },
  'sekiro': { hours: 30, genres: ['Action-adventure', 'Soulslike', 'Stealth'] },
  'sekiro shadows die twice': { hours: 30, genres: ['Action-adventure', 'Soulslike', 'Stealth'] },
  'demons souls': { hours: 30, genres: ['Action RPG', 'Soulslike', 'Dark Fantasy'] },
  'armored core 6': { hours: 15, genres: ['Action', 'Sci-Fi', 'Simulation'] },
  'armored core vi': { hours: 15, genres: ['Action', 'Sci-Fi', 'Simulation'] },
  'armored core vi fires of rubicon': { hours: 15, genres: ['Action', 'Sci-Fi', 'Simulation'] },
  'lies of p': { hours: 30, genres: ['Action RPG', 'Soulslike', 'Dark Fantasy'] },
  'black myth wukong': { hours: 35, genres: ['Action RPG', 'Soulslike', 'Dark Fantasy'] },

  // CD Projekt Red
  'witcher 3': { hours: 52, genres: ['Action RPG', 'Open World', 'Dark Fantasy'] },
  'witcher 3 wild hunt': { hours: 52, genres: ['Action RPG', 'Open World', 'Dark Fantasy'] },
  'witcher 2': { hours: 24, genres: ['Action RPG', 'Dark Fantasy', 'Role-playing'] },
  'witcher 2 assassins of kings': { hours: 24, genres: ['Action RPG', 'Dark Fantasy', 'Role-playing'] },
  'witcher': { hours: 35, genres: ['Action RPG', 'Dark Fantasy', 'Role-playing'] },
  'cyberpunk 2077': { hours: 26, genres: ['Action RPG', 'Open World', 'Sci-Fi'] },
  'cyberpunk 2077 phantom liberty': { hours: 13, genres: ['Action RPG', 'Open World', 'Sci-Fi'] },

  // Bethesda / Obsidian
  'skyrim': { hours: 34, genres: ['Action RPG', 'Open World', 'Role-playing'] },
  'elder scrolls v skyrim': { hours: 34, genres: ['Action RPG', 'Open World', 'Role-playing'] },
  'elder scrolls iv oblivion': { hours: 30, genres: ['Action RPG', 'Open World', 'Role-playing'] },
  'fallout 3': { hours: 23, genres: ['Action RPG', 'Open World', 'Sci-Fi'] },
  'fallout new vegas': { hours: 27, genres: ['Action RPG', 'Open World', 'Role-playing'] },
  'fallout 4': { hours: 27, genres: ['Action RPG', 'Open World', 'Sci-Fi'] },
  'starfield': { hours: 23, genres: ['Action RPG', 'Open World', 'Sci-Fi'] },
  'dishonored': { hours: 12, genres: ['Stealth', 'Action-adventure', 'Dark Fantasy'] },
  'dishonored 2': { hours: 12, genres: ['Stealth', 'Action-adventure', 'Dark Fantasy'] },
  'prey': { hours: 16, genres: ['Sci-Fi', 'Survival horror', 'First-person shooter'] },
  'deathloop': { hours: 16, genres: ['First-person shooter', 'Action-adventure', 'Sci-Fi'] },
  'doom': { hours: 11, genres: ['First-person shooter', 'Action', 'Sci-Fi'] },
  'doom 2016': { hours: 11, genres: ['First-person shooter', 'Action', 'Sci-Fi'] },
  'doom eternal': { hours: 14, genres: ['First-person shooter', 'Action', 'Sci-Fi'] },

  // BioWare
  'baldurs gate 3': { hours: 75, genres: ['Role-playing', 'Tactical', 'Dark Fantasy'] },
  'baldurs gate 2': { hours: 45, genres: ['Role-playing', 'Tactical', 'Dark Fantasy'] },
  'baldurs gate': { hours: 30, genres: ['Role-playing', 'Tactical', 'Dark Fantasy'] },
  'mass effect': { hours: 17, genres: ['Action RPG', 'Sci-Fi', 'Third-person shooter'] },
  'mass effect 2': { hours: 24, genres: ['Action RPG', 'Sci-Fi', 'Third-person shooter'] },
  'mass effect 3': { hours: 24, genres: ['Action RPG', 'Sci-Fi', 'Third-person shooter'] },
  'mass effect legendary edition': { hours: 60, genres: ['Action RPG', 'Sci-Fi', 'Third-person shooter'] },
  'dragon age origins': { hours: 41, genres: ['Role-playing', 'Dark Fantasy', 'Tactical'] },
  'dragon age 2': { hours: 27, genres: ['Action RPG', 'Dark Fantasy', 'Role-playing'] },
  'dragon age inquisition': { hours: 46, genres: ['Action RPG', 'Open World', 'Dark Fantasy'] },
  'dragon age the veilguard': { hours: 40, genres: ['Action RPG', 'Dark Fantasy'] },

  // Rockstar
  'red dead redemption 2': { hours: 50, genres: ['Action-adventure', 'Open World'] },
  'red dead redemption': { hours: 18, genres: ['Action-adventure', 'Open World'] },
  'grand theft auto v': { hours: 32, genres: ['Action-adventure', 'Open World'] },
  'gta 5': { hours: 32, genres: ['Action-adventure', 'Open World'] },
  'grand theft auto iv': { hours: 28, genres: ['Action-adventure', 'Open World'] },
  'gta 4': { hours: 28, genres: ['Action-adventure', 'Open World'] },
  'grand theft auto san andreas': { hours: 31, genres: ['Action-adventure', 'Open World'] },
  'grand theft auto vice city': { hours: 18, genres: ['Action-adventure', 'Open World'] },
  'grand theft auto iii': { hours: 15, genres: ['Action-adventure', 'Open World'] },

  // Sony PlayStation
  'god of war': { hours: 21, genres: ['Action-adventure', 'Hack and slash', 'Dark Fantasy'] },
  'god of war 2018': { hours: 21, genres: ['Action-adventure', 'Hack and slash', 'Dark Fantasy'] },
  'god of war ragnarok': { hours: 26, genres: ['Action-adventure', 'Hack and slash', 'Dark Fantasy'] },
  'last of us': { hours: 15, genres: ['Action-adventure', 'Survival horror', 'Stealth'] },
  'last of us part i': { hours: 15, genres: ['Action-adventure', 'Survival horror', 'Stealth'] },
  'last of us part 1': { hours: 15, genres: ['Action-adventure', 'Survival horror', 'Stealth'] },
  'last of us part ii': { hours: 24, genres: ['Action-adventure', 'Survival horror', 'Stealth'] },
  'last of us part 2': { hours: 24, genres: ['Action-adventure', 'Survival horror', 'Stealth'] },
  'ghost of tsushima': { hours: 25, genres: ['Action-adventure', 'Open World', 'Stealth'] },
  'spiderman': { hours: 17, genres: ['Action-adventure', 'Open World'] },
  'marvels spiderman': { hours: 17, genres: ['Action-adventure', 'Open World'] },
  'spiderman remastered': { hours: 17, genres: ['Action-adventure', 'Open World'] },
  'spiderman miles morales': { hours: 8, genres: ['Action-adventure', 'Open World'] },
  'spiderman 2': { hours: 17, genres: ['Action-adventure', 'Open World'] },
  'marvels spiderman 2': { hours: 17, genres: ['Action-adventure', 'Open World'] },
  'horizon zero dawn': { hours: 30, genres: ['Action RPG', 'Open World', 'Sci-Fi'] },
  'horizon forbidden west': { hours: 28, genres: ['Action RPG', 'Open World', 'Sci-Fi'] },
  'uncharted drakes fortune': { hours: 8, genres: ['Action-adventure', 'Third-person shooter'] },
  'uncharted 2 among thieves': { hours: 10, genres: ['Action-adventure', 'Third-person shooter'] },
  'uncharted 3 drakes deception': { hours: 9, genres: ['Action-adventure', 'Third-person shooter'] },
  'uncharted 4 a thiefs end': { hours: 15, genres: ['Action-adventure', 'Third-person shooter'] },
  'death stranding': { hours: 40, genres: ['Action-adventure', 'Open World', 'Sci-Fi'] },
  'infamous second son': { hours: 10, genres: ['Action-adventure', 'Open World'] },
  'shadow of the colossus': { hours: 8, genres: ['Action-adventure', 'Puzzle'] },
  'returnal': { hours: 19, genres: ['Roguelike', 'Third-person shooter', 'Sci-Fi'] },

  // Nintendo
  'legend of zelda breath of the wild': { hours: 50, genres: ['Action-adventure', 'Open World', 'Puzzle'] },
  'breath of the wild': { hours: 50, genres: ['Action-adventure', 'Open World', 'Puzzle'] },
  'legend of zelda tears of the kingdom': { hours: 59, genres: ['Action-adventure', 'Open World', 'Puzzle'] },
  'tears of the kingdom': { hours: 59, genres: ['Action-adventure', 'Open World', 'Puzzle'] },
  'legend of zelda ocarina of time': { hours: 17, genres: ['Action-adventure', 'Puzzle'] },
  'ocarina of time': { hours: 17, genres: ['Action-adventure', 'Puzzle'] },
  'legend of zelda majoras mask': { hours: 20, genres: ['Action-adventure', 'Puzzle'] },
  'legend of zelda twilight princess': { hours: 35, genres: ['Action-adventure', 'Puzzle'] },
  'legend of zelda wind waker': { hours: 29, genres: ['Action-adventure', 'Open World'] },
  'super mario odyssey': { hours: 13, genres: ['Platformer', 'Action-adventure'] },
  'super mario galaxy': { hours: 13, genres: ['Platformer'] },
  'super mario 64': { hours: 12, genres: ['Platformer'] },
  'super mario sunshine': { hours: 14, genres: ['Platformer'] },
  'super mario bros wonder': { hours: 10, genres: ['Platformer'] },
  'super mario wonder': { hours: 10, genres: ['Platformer'] },
  'metroid dread': { hours: 9, genres: ['Metroidvania', 'Platformer', 'Sci-Fi'] },
  'metroid prime': { hours: 13, genres: ['First-person shooter', 'Metroidvania', 'Sci-Fi'] },
  'metroid prime remastered': { hours: 13, genres: ['First-person shooter', 'Metroidvania', 'Sci-Fi'] },
  'xenoblade chronicles definitive edition': { hours: 68, genres: ['Role-playing', 'Open World', 'Sci-Fi'] },
  'xenoblade chronicles 2': { hours: 65, genres: ['Role-playing', 'Open World', 'Sci-Fi'] },
  'xenoblade chronicles 3': { hours: 61, genres: ['Role-playing', 'Open World', 'Sci-Fi'] },
  'fire emblem three houses': { hours: 48, genres: ['Tactical', 'Role-playing'] },
  'fire emblem engage': { hours: 38, genres: ['Tactical', 'Role-playing'] },
  'pokemon red': { hours: 26, genres: ['Role-playing', 'Adventure'] },
  'pokemon blue': { hours: 26, genres: ['Role-playing', 'Adventure'] },
  'pokemon emerald': { hours: 31, genres: ['Role-playing', 'Adventure'] },
  'pokemon platinum': { hours: 43, genres: ['Role-playing', 'Adventure'] },
  'pokemon heartgold': { hours: 37, genres: ['Role-playing', 'Adventure'] },
  'pokemon black': { hours: 32, genres: ['Role-playing', 'Adventure'] },
  'pokemon sword': { hours: 14, genres: ['Role-playing', 'Adventure'] },
  'pokemon scarlet': { hours: 26, genres: ['Role-playing', 'Open World'] },
  'pokemon legends arceus': { hours: 25, genres: ['Action RPG', 'Open World'] },

  // Square Enix & JRPGs
  'final fantasy vii': { hours: 37, genres: ['Role-playing', 'Sci-Fi'] },
  'final fantasy vii remake': { hours: 33, genres: ['Action RPG', 'Sci-Fi'] },
  'final fantasy vii rebirth': { hours: 45, genres: ['Action RPG', 'Open World', 'Sci-Fi'] },
  'final fantasy viii': { hours: 40, genres: ['Role-playing', 'Sci-Fi'] },
  'final fantasy ix': { hours: 39, genres: ['Role-playing', 'Fantasy'] },
  'final fantasy x': { hours: 46, genres: ['Role-playing', 'Fantasy'] },
  'final fantasy xii': { hours: 61, genres: ['Role-playing', 'Fantasy'] },
  'final fantasy xiv': { hours: 120, genres: ['Role-playing', 'Open World'] },
  'final fantasy xv': { hours: 28, genres: ['Action RPG', 'Open World'] },
  'final fantasy xvi': { hours: 36, genres: ['Action RPG', 'Dark Fantasy'] },
  'nier automata': { hours: 21, genres: ['Action RPG', 'Hack and slash', 'Sci-Fi'] },
  'nier replicant': { hours: 20, genres: ['Action RPG', 'Hack and slash', 'Dark Fantasy'] },
  'chrono trigger': { hours: 23, genres: ['Role-playing', 'Sci-Fi'] },
  'dragon quest xi': { hours: 57, genres: ['Role-playing', 'Fantasy'] },
  'dragon quest xi s': { hours: 57, genres: ['Role-playing', 'Fantasy'] },
  'kingdom hearts': { hours: 28, genres: ['Action RPG', 'Action-adventure'] },
  'kingdom hearts ii': { hours: 32, genres: ['Action RPG', 'Action-adventure'] },
  'kingdom hearts 2': { hours: 32, genres: ['Action RPG', 'Action-adventure'] },
  'kingdom hearts iii': { hours: 29, genres: ['Action RPG', 'Action-adventure'] },
  'kingdom hearts 3': { hours: 29, genres: ['Action RPG', 'Action-adventure'] },
  'octopath traveler': { hours: 60, genres: ['Role-playing', 'Turn-based RPG'] },
  'octopath traveler ii': { hours: 60, genres: ['Role-playing', 'Turn-based RPG'] },
  'octopath traveler 2': { hours: 60, genres: ['Role-playing', 'Turn-based RPG'] },

  // Atlus / Sega
  'persona 3 reload': { hours: 65, genres: ['Role-playing', 'Simulation'] },
  'persona 3 portable': { hours: 65, genres: ['Role-playing', 'Simulation'] },
  'persona 3': { hours: 65, genres: ['Role-playing', 'Simulation'] },
  'persona 4 golden': { hours: 68, genres: ['Role-playing', 'Simulation'] },
  'persona 4': { hours: 72, genres: ['Role-playing', 'Simulation'] },
  'persona 5': { hours: 97, genres: ['Role-playing', 'Simulation'] },
  'persona 5 royal': { hours: 101, genres: ['Role-playing', 'Simulation'] },
  'metaphor refantazio': { hours: 80, genres: ['Role-playing', 'Turn-based RPG', 'Fantasy'] },
  'shin megami tensei v': { hours: 45, genres: ['Role-playing', 'Dark Fantasy'] },
  'shin megami tensei v vengeance': { hours: 50, genres: ['Role-playing', 'Dark Fantasy'] },
  'shin megami tensei iii nocturne': { hours: 50, genres: ['Role-playing', 'Dark Fantasy'] },
  'yakuza 0': { hours: 31, genres: ['Action-adventure', 'Beat em up', 'Open World'] },
  'yakuza kiwami': { hours: 17, genres: ['Action-adventure', 'Beat em up'] },
  'yakuza kiwami 2': { hours: 18, genres: ['Action-adventure', 'Beat em up'] },
  'yakuza like a dragon': { hours: 45, genres: ['Role-playing', 'Turn-based RPG'] },
  'like a dragon infinite wealth': { hours: 55, genres: ['Role-playing', 'Turn-based RPG'] },
  'like a dragon the man who erased his name': { hours: 12, genres: ['Action-adventure', 'Beat em up'] },
  'judgment': { hours: 27, genres: ['Action-adventure', 'Detective'] },
  'lost judgment': { hours: 23, genres: ['Action-adventure', 'Detective'] },

  // Valve
  'half life': { hours: 12, genres: ['First-person shooter', 'Sci-Fi'] },
  'half life 2': { hours: 13, genres: ['First-person shooter', 'Sci-Fi', 'Puzzle'] },
  'half life 2 episode one': { hours: 4, genres: ['First-person shooter', 'Sci-Fi'] },
  'half life 2 episode two': { hours: 6, genres: ['First-person shooter', 'Sci-Fi'] },
  'half life alyx': { hours: 12, genres: ['First-person shooter', 'VR', 'Sci-Fi'] },
  'portal': { hours: 3, genres: ['Puzzle', 'First-person', 'Sci-Fi'] },
  'portal 2': { hours: 8, genres: ['Puzzle', 'First-person', 'Sci-Fi'] },
  'left 4 dead 2': { hours: 9, genres: ['First-person shooter', 'Survival horror'] },

  // Capcom
  'resident evil': { hours: 10, genres: ['Survival horror', 'Puzzle'] },
  'resident evil 2': { hours: 8, genres: ['Survival horror', 'Third-person shooter'] },
  'resident evil 2 remake': { hours: 8, genres: ['Survival horror', 'Third-person shooter'] },
  'resident evil 3': { hours: 6, genres: ['Survival horror', 'Action'] },
  'resident evil 3 remake': { hours: 6, genres: ['Survival horror', 'Action'] },
  'resident evil 4': { hours: 15, genres: ['Survival horror', 'Third-person shooter'] },
  'resident evil 4 remake': { hours: 16, genres: ['Survival horror', 'Third-person shooter'] },
  'resident evil 7': { hours: 9, genres: ['Survival horror', 'First-person shooter'] },
  'resident evil 7 biohazard': { hours: 9, genres: ['Survival horror', 'First-person shooter'] },
  'resident evil village': { hours: 10, genres: ['Survival horror', 'First-person shooter'] },
  'resident evil 8': { hours: 10, genres: ['Survival horror', 'First-person shooter'] },
  'monster hunter world': { hours: 48, genres: ['Action RPG', 'Co-op'] },
  'monster hunter world iceborne': { hours: 36, genres: ['Action RPG', 'Co-op'] },
  'monster hunter rise': { hours: 22, genres: ['Action RPG', 'Co-op'] },
  'monster hunter wilds': { hours: 35, genres: ['Action RPG', 'Open World'] },
  'dragons dogma dark arisen': { hours: 33, genres: ['Action RPG', 'Dark Fantasy'] },
  'dragons dogma 2': { hours: 26, genres: ['Action RPG', 'Open World', 'Dark Fantasy'] },
  'devil may cry 5': { hours: 11, genres: ['Hack and slash', 'Action'] },

  // Konami & Kojima
  'metal gear solid': { hours: 11, year: '1998', studio: 'Konami', genres: ['Stealth', 'Action-adventure'] },
  'metal gear solid 2 sons of liberty': { hours: 13, year: '2001', studio: 'Konami', genres: ['Stealth', 'Action-adventure'] },
  'metal gear solid 2': { hours: 13, year: '2001', studio: 'Konami', genres: ['Stealth', 'Action-adventure'] },
  'metal gear solid 3 snake eater': { hours: 16, year: '2004', studio: 'Konami', genres: ['Stealth', 'Action-adventure'] },
  'metal gear solid 3': { hours: 16, year: '2004', studio: 'Konami', genres: ['Stealth', 'Action-adventure'] },
  'metal gear solid 4 guns of the patriots': { hours: 18, year: '2008', studio: 'Kojima Productions', genres: ['Stealth', 'Third-person shooter'] },
  'metal gear solid 4': { hours: 18, year: '2008', studio: 'Kojima Productions', genres: ['Stealth', 'Third-person shooter'] },
  'metal gear solid v the phantom pain': { hours: 46, year: '2015', studio: 'Kojima Productions', genres: ['Stealth', 'Open World', 'Third-person shooter'] },
  'metal gear solid 5 the phantom pain': { hours: 46, year: '2015', studio: 'Kojima Productions', genres: ['Stealth', 'Open World', 'Third-person shooter'] },
  'metal gear solid v ground zeroes': { hours: 2, year: '2014', studio: 'Kojima Productions', genres: ['Stealth', 'Third-person shooter'] },
  'metal gear solid peace walker': { hours: 18, year: '2010', studio: 'Kojima Productions', genres: ['Stealth', 'Action-adventure'] },
  'silent hill 2': { hours: 9, year: '2001', studio: 'Konami', genres: ['Survival horror', 'Psychological horror'] },
  'silent hill 2 remake': { hours: 16, year: '2024', studio: 'Bloober Team', genres: ['Survival horror', 'Psychological horror'] },
  'castlevania symphony of the night': { hours: 9, year: '1997', studio: 'Konami', genres: ['Metroidvania', 'Platformer', 'Dark Fantasy'] },

  // EA & Respawn
  'titanfall 2': { hours: 6, genres: ['First-person shooter', 'Sci-Fi', 'Platformer'] },
  'star wars jedi fallen order': { hours: 17, genres: ['Action-adventure', 'Soulslike', 'Sci-Fi'] },
  'star wars jedi survivor': { hours: 20, genres: ['Action-adventure', 'Soulslike', 'Sci-Fi'] },
  'dead space': { hours: 11, genres: ['Survival horror', 'Third-person shooter', 'Sci-Fi'] },
  'dead space remake': { hours: 12, genres: ['Survival horror', 'Third-person shooter', 'Sci-Fi'] },

  // Microsoft / Xbox
  'halo combat evolved': { hours: 10, genres: ['First-person shooter', 'Sci-Fi'] },
  'halo 2': { hours: 9, genres: ['First-person shooter', 'Sci-Fi'] },
  'halo 3': { hours: 8, genres: ['First-person shooter', 'Sci-Fi'] },
  'halo 3 odst': { hours: 6, genres: ['First-person shooter', 'Sci-Fi'] },
  'halo reach': { hours: 8, genres: ['First-person shooter', 'Sci-Fi'] },
  'halo 4': { hours: 8, genres: ['First-person shooter', 'Sci-Fi'] },
  'halo infinite': { hours: 11, genres: ['First-person shooter', 'Open World', 'Sci-Fi'] },
  'gears of war': { hours: 9, genres: ['Third-person shooter', 'Action'] },
  'gears of war 2': { hours: 9, genres: ['Third-person shooter', 'Action'] },
  'gears of war 3': { hours: 9, genres: ['Third-person shooter', 'Action'] },
  'gears 5': { hours: 11, genres: ['Third-person shooter', 'Action'] },

  // Ubisoft
  'assassins creed': { hours: 15, genres: ['Action-adventure', 'Stealth'] },
  'assassins creed 2': { hours: 19, genres: ['Action-adventure', 'Open World', 'Stealth'] },
  'assassins creed ii': { hours: 19, genres: ['Action-adventure', 'Open World', 'Stealth'] },
  'assassins creed brotherhood': { hours: 15, genres: ['Action-adventure', 'Open World', 'Stealth'] },
  'assassins creed iv black flag': { hours: 23, genres: ['Action-adventure', 'Open World'] },
  'assassins creed black flag': { hours: 23, genres: ['Action-adventure', 'Open World'] },
  'assassins creed origins': { hours: 30, genres: ['Action RPG', 'Open World'] },
  'assassins creed odyssey': { hours: 45, genres: ['Action RPG', 'Open World'] },
  'assassins creed valhalla': { hours: 61, genres: ['Action RPG', 'Open World'] },
  'assassins creed mirage': { hours: 15, genres: ['Action-adventure', 'Stealth'] },
  'far cry 3': { hours: 15, genres: ['First-person shooter', 'Open World'] },
  'far cry 4': { hours: 17, genres: ['First-person shooter', 'Open World'] },
  'far cry 5': { hours: 18, genres: ['First-person shooter', 'Open World'] },
  'far cry 6': { hours: 23, genres: ['First-person shooter', 'Open World'] },

  // Remedy
  'alan wake': { hours: 11, genres: ['Survival horror', 'Action-adventure'] },
  'alan wake 2': { hours: 18, genres: ['Survival horror', 'Psychological horror'] },
  'control': { hours: 12, genres: ['Third-person shooter', 'Sci-Fi', 'Metroidvania'] },
  'quantum break': { hours: 10, genres: ['Third-person shooter', 'Sci-Fi'] },

  // Indie Masterpieces
  'hollow knight': { hours: 27, genres: ['Metroidvania', 'Platformer', 'Dark Fantasy', 'Indie'] },
  'celeste': { hours: 8, genres: ['Platformer', 'Indie'] },
  'hades': { hours: 22, genres: ['Roguelike', 'Action RPG', 'Hack and slash', 'Indie'] },
  'hades ii': { hours: 25, genres: ['Roguelike', 'Action RPG', 'Hack and slash', 'Indie'] },
  'hades 2': { hours: 25, genres: ['Roguelike', 'Action RPG', 'Hack and slash', 'Indie'] },
  'dead cells': { hours: 14, genres: ['Roguelike', 'Metroidvania', 'Platformer', 'Indie'] },
  'slay the spire': { hours: 12, genres: ['Roguelike', 'Strategy', 'Indie'] },
  'cuphead': { hours: 10, genres: ['Platformer', 'Indie'] },
  'stardew valley': { hours: 53, genres: ['Simulation', 'Role-playing', 'Indie'] },
  'subnautica': { hours: 30, genres: ['Survival horror', 'Open World', 'Sci-Fi', 'Indie'] },
  'outer wilds': { hours: 16, genres: ['Adventure', 'Puzzle', 'Sci-Fi', 'Indie'] },
  'disco elysium': { hours: 22, genres: ['Role-playing', 'Dark Fantasy', 'Indie'] },
  'disco elysium the final cut': { hours: 22, genres: ['Role-playing', 'Dark Fantasy', 'Indie'] },
  'undertale': { hours: 6, genres: ['Role-playing', 'Indie'] },
  'deltarune': { hours: 8, genres: ['Role-playing', 'Indie'] },
  'omori': { hours: 21, genres: ['Role-playing', 'Psychological horror', 'Indie'] },
  'firewatch': { hours: 4, genres: ['Adventure', 'Indie'] },
  'what remains of edith finch': { hours: 2, genres: ['Adventure', 'Indie'] },
  'stray': { hours: 5, genres: ['Adventure', 'Sci-Fi', 'Indie'] },
  'journey': { hours: 2, genres: ['Adventure', 'Indie'] },
  'inside': { hours: 4, genres: ['Platformer', 'Puzzle', 'Dark Fantasy', 'Indie'] },
  'limbo': { hours: 3, genres: ['Platformer', 'Puzzle', 'Dark Fantasy', 'Indie'] },
  'little nightmares': { hours: 4, genres: ['Platformer', 'Survival horror', 'Dark Fantasy', 'Indie'] },
  'little nightmares ii': { hours: 5, genres: ['Platformer', 'Survival horror', 'Dark Fantasy', 'Indie'] },
  'little nightmares 2': { hours: 5, genres: ['Platformer', 'Survival horror', 'Dark Fantasy', 'Indie'] },
  'ori and the blind forest': { hours: 8, genres: ['Metroidvania', 'Platformer', 'Indie'] },
  'ori and the will of the wisps': { hours: 12, genres: ['Metroidvania', 'Platformer', 'Indie'] },
  'sifu': { hours: 10, genres: ['Fighting', 'Action', 'Indie'] },
  'hi fi rush': { hours: 11, genres: ['Hack and slash', 'Platformer', 'Action'] },
  'sea of stars': { hours: 27, genres: ['Role-playing', 'Turn-based RPG', 'Indie'] },
  'palworld': { hours: 30, genres: ['Open World', 'Survival', 'Action RPG'] },
  'helldivers 2': { hours: 20, genres: ['Third-person shooter', 'Sci-Fi', 'Co-op'] },
  'warhammer 40000 space marine 2': { hours: 10, genres: ['Third-person shooter', 'Hack and slash', 'Sci-Fi'] },
  'space marine 2': { hours: 10, genres: ['Third-person shooter', 'Hack and slash', 'Sci-Fi'] },
  'tunic': { hours: 12, genres: ['Action-adventure', 'Puzzle', 'Indie'] },
  'dredge': { hours: 9, genres: ['Adventure', 'Survival horror', 'Indie'] },
  'dave the diver': { hours: 25, genres: ['Simulation', 'Adventure', 'Indie'] },
  'balatro': { hours: 15, genres: ['Roguelike', 'Strategy', 'Indie'] },
  'vampire survivors': { hours: 13, genres: ['Roguelike', 'Action', 'Indie'] },
  'animal crossing new horizons': { hours: 60, genres: ['Simulation', 'Sandbox'] },
  'terraria': { hours: 50, genres: ['Sandbox', 'Survival', 'Indie'] },
  'minecraft': { hours: 35, genres: ['Sandbox', 'Survival', 'Open World'] }
};

/** Normalize title for accurate benchmark lookup */
function normalizeGameKey(title) {
  if (!title) return '';
  return String(title)
    .toLowerCase()
    .replace(/^(?:the|a|an)\s+/i, '')
    .replace(/[:\-–—_]/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract installment number (Arabic or Roman numeral) from normalized title string.
 * Returns integer (1 to 9) or 0 if unnumbered/standalone.
 */
function getGameInstallmentNum(str) {
  if (!str) return 0;
  const s = ' ' + str.toLowerCase() + ' ';
  if (/\b(?:viii|8)\b/.test(s)) return 8;
  if (/\b(?:vii|7)\b/.test(s)) return 7;
  if (/\b(?:vi|6)\b/.test(s)) return 6;
  if (/\b(?:v|5)\b/.test(s)) return 5;
  if (/\b(?:iv|4)\b/.test(s)) return 4;
  if (/\b(?:iii|3)\b/.test(s)) return 3;
  if (/\b(?:ii|2)\b/.test(s)) return 2;
  if (/\b(?:i|1)\b/.test(s) && !/\b(?:part|act|volume|vol)\b/.test(s)) return 1;
  return 0;
}

/** Check benchmark table with strict installment awareness */
function lookupGameBenchmark(title) {
  const norm = normalizeGameKey(title);
  if (!norm) return null;

  // 1. Exact match
  if (POPULAR_GAME_BENCHMARKS[norm]) {
    return POPULAR_GAME_BENCHMARKS[norm];
  }

  // 2. Roman/Arabic numeral variation exact match (e.g. "dark souls 2" <-> "dark souls ii")
  const numT = getGameInstallmentNum(norm);
  const romanMap = { 2: 'ii', 3: 'iii', 4: 'iv', 5: 'v', 6: 'vi', 7: 'vii', 8: 'viii' };
  const arabicMap = { 'ii': '2', 'iii': '3', 'iv': '4', 'v': '5', 'vi': '6', 'vii': '7', 'viii': '8' };

  if (numT > 1) {
    if (romanMap[numT]) {
      const swappedRoman = norm.replace(new RegExp(`\\b${numT}\\b`), romanMap[numT]);
      if (POPULAR_GAME_BENCHMARKS[swappedRoman]) return POPULAR_GAME_BENCHMARKS[swappedRoman];
    }
    for (const [rom, ara] of Object.entries(arabicMap)) {
      if (new RegExp(`\\b${rom}\\b`).test(norm)) {
        const swappedAra = norm.replace(new RegExp(`\\b${rom}\\b`), ara);
        if (POPULAR_GAME_BENCHMARKS[swappedAra]) return POPULAR_GAME_BENCHMARKS[swappedAra];
      }
    }
  }

  // 3. Substring or prefix match with strict installment guard
  // Sort keys by length DESCENDING so more specific installments are tested first
  const keys = Object.keys(POPULAR_GAME_BENCHMARKS).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    const numK = getGameInstallmentNum(k);
    // Never allow a sequel to match the base game or a different sequel
    if (numT !== numK) continue;

    if (norm === k || norm.startsWith(k + ' ') || k.startsWith(norm + ' ')) {
      return POPULAR_GAME_BENCHMARKS[k];
    }
  }
  return null;
}

/**
 * Score how well a candidate Wikipedia article matches the target game title.
 * Prevents generic franchise pages or earlier installments from clobbering sequels
 * (e.g., stops Metal Gear Solid 1998 from matching Metal Gear Solid 2, 3, 4, V).
 */
function scoreWikiGameMatch(targetTitle, candidateTitle, candidateExtract = '') {
  if (!targetTitle || !candidateTitle) return -1000;

  const normT = normalizeGameKey(targetTitle);
  const normC = normalizeGameKey(candidateTitle);

  // Franchise/Series overview page penalty
  const isSeriesPage = /\b(?:series|franchise)\b/i.test(candidateTitle) ||
    /is an? (?:action-adventure|role-playing|stealth|video game|multimedia)?\s*(?:video game )?(?:series|media franchise|franchise)\b/i.test(candidateExtract) ||
    /is a series of\b/i.test(candidateExtract);
  if (isSeriesPage) {
    return -600;
  }

  // Exact normalized match
  if (normT === normC) {
    return 1000;
  }

  const numT = getGameInstallmentNum(normT);
  const numC = getGameInstallmentNum(normC);

  // Disqualify if installment numbers conflict
  if (numT !== 0 && numC !== 0 && numT !== numC) {
    return -1000;
  }
  // Target has a sequel number (e.g. MGS 2), but candidate does not (e.g. MGS 1)
  if (numT !== 0 && numC === 0 && !/\b(?:delta|remake|definitive|remastered)\b/i.test(normC)) {
    return -500;
  }
  // Target is base game without number, but candidate is a numbered sequel
  if (numT === 0 && numC !== 0) {
    return -500;
  }

  // Word token overlap
  const tokensT = normT.split(' ').filter(Boolean);
  const tokensC = normC.split(' ').filter(Boolean);
  let matchCount = 0;
  for (const tok of tokensT) {
    if (tokensC.includes(tok)) matchCount++;
  }
  let score = matchCount * 50;

  // Matching installment number bonus
  if (numT !== 0 && numT === numC) {
    score += 350;
  }

  // Distinctive subtitle matching
  const knownSubtitles = [
    'snake eater', 'sons of liberty', 'phantom pain', 'ground zeroes',
    'guns of the patriots', 'peace walker', 'twin snakes', 'solid snake',
    'assassins of kings', 'wild hunt', 'shadow of the erdtree', 'scholar of the first sin',
    'the ringed city', 'blood and wine', 'hearts of stone', 'phantom liberty',
    'ragnarok', 'miles morales', 'drakes fortune', 'among thieves',
    'drakes deception', 'thiefs end', 'infinite wealth', 'like a dragon',
    'space marine', 'fires of rubicon', 'tactics', 'portable ops'
  ];

  for (const sub of knownSubtitles) {
    const hasT = normT.includes(sub);
    const hasC = normC.includes(sub);
    if (hasT && hasC) {
      score += 500;
    } else if (hasT && !hasC) {
      score -= 800;
    } else if (!hasT && hasC) {
      score -= 500;
    }
  }

  return score;
}

/** Pick best matching Wikipedia page among candidates for a game title */
function findBestMatchingWikiGame(targetTitle, wikiPages) {
  if (!Array.isArray(wikiPages) || wikiPages.length === 0) return null;

  let bestPage = null;
  let bestScore = 50; // Minimum threshold to prevent arbitrary matching

  for (const p of wikiPages) {
    const pageTitle = (p.title || p.rawTitle || '').replace(/\s*\([^)]*game[^)]*\)/gi, '').trim();
    const extract = p.extract || p.synopsis || '';
    const score = scoreWikiGameMatch(targetTitle, pageTitle, extract);
    if (score > bestScore) {
      bestScore = score;
      bestPage = p;
    }
  }

  return bestPage;
}

/**
 * Detect if a game item in the library has clobbered series metadata from an earlier installment
 * (e.g., MGS 2 / 3 / 4 / V having 1998 release date or MGS 1 synopsis).
 */
function isGameInstallmentMismatched(item) {
  if (!item || item.category !== 'Games' || !item.title) return false;

  const bench = lookupGameBenchmark(item.title);
  if (bench && bench.year && item.releaseDate && item.releaseDate !== 'TBA' && item.releaseDate !== bench.year) {
    return true;
  }

  const normTitle = normalizeGameKey(item.title);
  const num = getGameInstallmentNum(normTitle);

  // If title has a sequel number (e.g. 2, 3, 4, 5) but synopsis describes original/different installment
  if (num > 1 && item.synopsis) {
    const synNorm = normalizeGameKey(item.synopsis.slice(0, 140));
    const synNum = getGameInstallmentNum(synNorm);
    if (synNum === 1 || (synNum > 0 && synNum !== num)) {
      return true;
    }
  }

  return false;
}

/** Extract single-player campaign or main story duration from Wikipedia text */
function extractGameHoursFromText(text) {
  if (!text) return null;
  const m = text.match(/(?:takes|lasts|requires|around|about|approximately|average of|campaign takes|playtime of)\s*(\d{1,3})(?:\s*(?:to|-)\s*(\d{1,3}))?\s*(?:hours|hrs)\b/i)
    || text.match(/\b(\d{1,3})(?:\s*(?:to|-)\s*(\d{1,3}))?\s*(?:-| )?(?:hour|hr|hours|hrs)\s*(?:long\s*)?(?:campaign|storyline|story|single-player campaign|playtime)/i);
  if (m) {
    const minH = parseInt(m[1], 10);
    const maxH = m[2] ? parseInt(m[2], 10) : minH;
    if (minH > 0 && minH <= 250) {
      return Math.round((minH + maxH) / 2);
    }
  }
  return null;
}

/**
 * Determine accurate main story length in hours for any game.
 * Uses:
 * 1. Curated benchmark table (HLTB metrics for top 180+ titles)
 * 2. Wikipedia extract campaign duration parser
 * 3. Smart genre-based playtime fallback heuristics
 */
function getGameStoryLength(title, extractText = '', genres = []) {
  // 1. Benchmark lookup
  const bench = lookupGameBenchmark(title);
  if (bench && bench.hours) {
    return bench.hours;
  }

  // 2. Wikipedia text match
  const textHours = extractGameHoursFromText(extractText);
  if (textHours) {
    return textHours;
  }

  // 3. Genre-based estimate fallback
  const genStr = Array.isArray(genres) ? genres.join(' ') : String(genres || '');
  if (/jrpg/i.test(genStr) || (/role-playing/i.test(genStr) && /open world/i.test(genStr))) {
    return 45;
  }
  if (/action rpg|role-playing|soulslike/i.test(genStr)) {
    return 35;
  }
  if (/strategy|simulation|tactical|dungeon crawler/i.test(genStr)) {
    return 25;
  }
  if (/metroidvania|roguelike|survival horror|action-adventure/i.test(genStr)) {
    return 15;
  }
  if (/platformer|fighting|puzzle|racing|sports/i.test(genStr)) {
    return 10;
  }
  if (/shooter|fps/i.test(genStr)) {
    return 8;
  }
  return 12;
}

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

/** Parse Developer, Publisher & Genres from English Wikipedia extract and category list */
function parseWikiGameMetadata(extract, categories = []) {
  if (!extract && (!categories || categories.length === 0)) {
    return { studio: 'Unknown Developer', genres: [], releaseDate: 'TBA', synopsis: '' };
  }

  const catTitles = (categories || []).map((c) => (typeof c === 'string' ? c : c?.title || ''));
  const allCategoryText = catTitles.join(' ');
  const combinedHaystack = `${extract || ''} ${allCategoryText}`.toLowerCase();

  let studio = 'Unknown Developer';
  const devMatch = (extract || '').match(/developed by ([^.,;]+?)(?: and published by|, published by|\.|,|;)/i)
    || (extract || '').match(/by developer ([^.,;]+?)(?: and published by|, published by|\.|,|;)/i)
    || (extract || '').match(/published by ([^.,;]+?)(?:\.|,|;)/i);
  if (devMatch && devMatch[1]) {
    const dev = devMatch[1].replace(/\s*\([^)]*\)/g, '').trim();
    if (dev && dev.length < 50 && !/^(the|a|an)$/i.test(dev)) studio = dev;
  }

  // Fallback: check categories for developer studio (e.g., "Category:FromSoftware games")
  if (studio === 'Unknown Developer') {
    for (const c of catTitles) {
      const cm = c.match(/Category:(.+?)\s+(?:games|video games)/i);
      if (cm && cm[1]) {
        const candidate = cm[1].trim();
        if (candidate && !/^(?:\d{4}|action|role-playing|open-world|first-person|platform|indie|cooperative|multiplayer|single-player|cancelled|unreleased)/i.test(candidate)) {
          studio = candidate;
          break;
        }
      }
    }
  }

  const genres = [];
  for (const rule of GAME_GENRE_RULES) {
    if (rule.regex.test(combinedHaystack)) {
      if (!genres.includes(rule.name)) {
        genres.push(rule.name);
      }
      if (genres.length >= 4) break;
    }
  }

  let releaseDate = 'TBA';
  const yearMatch = (extract || '').match(/\b(19[7-9]\d|20[0-3]\d)\b/);
  if (yearMatch) {
    releaseDate = yearMatch[1];
  } else {
    for (const c of catTitles) {
      const ym = c.match(/\b(19[7-9]\d|20[0-3]\d)\b/);
      if (ym) {
        releaseDate = ym[1];
        break;
      }
    }
  }

  return {
    studio,
    genres,
    releaseDate,
    synopsis: (extract || '').trim()
  };
}

// ---------------------------------------------------------------------------
// Category-Specific API Search Engines
// ---------------------------------------------------------------------------

/** 1. Games: CheapShark (Steam 600x900 CDN) + Wikipedia Video Game + Story Length */
async function searchGamesApi(cleanTitle, signal) {
  const results = [];
  try {
    const [sharkRes, wikiRes] = await Promise.allSettled([
      fetch(`https://www.cheapshark.com/api/1.0/games?title=${encodeURIComponent(cleanTitle)}&limit=5`, { signal })
        .then((r) => (r.ok ? r.json() : [])),
      fetch(
        `https://en.wikipedia.org/w/api.php?action=query&origin=*&format=json&generator=search&gsrsearch=${encodeURIComponent(
          cleanTitle + ' video game'
        )}&gsrlimit=10&prop=pageimages|extracts|categories&cllimit=40&pilicense=any&exintro=1&explaintext=1&exchars=420&piprop=thumbnail&pithumbsize=600`,
        { signal }
      ).then((r) => (r.ok ? r.json() : {}))
    ]);

    const sharkData = sharkRes.status === 'fulfilled' && Array.isArray(sharkRes.value) ? sharkRes.value : [];
    const wikiPages = wikiRes.status === 'fulfilled' ? Object.values(wikiRes.value?.query?.pages || {}) : [];

    const parsedWiki = wikiPages.map((p) => {
      const meta = parseWikiGameMetadata(p.extract || '', p.categories || []);
      const rawTitle = (p.title || '').replace(/\s*\([^)]*game[^)]*\)/gi, '').trim();
      return {
        rawTitle,
        ...meta,
        thumbnail: p.thumbnail?.source || '',
        isSeriesPage: /is a video game series|is a series of video games|is a franchise|video game franchise|\(series\)/i.test((p.title || '') + ' ' + (p.extract || ''))
      };
    });

    if (sharkData.length > 0) {
      for (const g of sharkData) {
        const steamCover = g.steamAppID
          ? `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${g.steamAppID}/library_600x900.jpg`
          : (g.thumb || '');
        let matchedWiki = findBestMatchingWikiGame(g.external, parsedWiki);
        const benchmark = lookupGameBenchmark(g.external);

        // If candidate release year strongly contradicts curated benchmark (>1 year apart), candidate is the wrong game
        if (benchmark?.year && matchedWiki?.releaseDate && matchedWiki.releaseDate !== 'TBA') {
          const wikiY = parseInt(matchedWiki.releaseDate, 10);
          const benchY = parseInt(benchmark.year, 10);
          if (!isNaN(wikiY) && !isNaN(benchY) && Math.abs(wikiY - benchY) > 1) {
            matchedWiki = null;
          }
        }

        const finalStudio = (matchedWiki?.studio && matchedWiki.studio !== 'Unknown Developer')
          ? matchedWiki.studio
          : (benchmark?.studio || 'Unknown Developer');

        const finalReleaseDate = (matchedWiki?.releaseDate && matchedWiki.releaseDate !== 'TBA')
          ? matchedWiki.releaseDate
          : (benchmark?.year || 'TBA');

        let finalGenres = matchedWiki?.genres || [];
        if (finalGenres.length === 0 && benchmark?.genres) {
          finalGenres = [...benchmark.genres];
        }

        const finalHours = benchmark?.hours || getGameStoryLength(g.external, matchedWiki?.synopsis || '', finalGenres);
        const finalSynopsis = matchedWiki?.synopsis || '';

        results.push({
          title: g.external,
          titleEnglish: g.external,
          titleRomaji: '',
          category: 'Games',
          totalUnits: finalHours,
          unitName: 'hrs',
          studio: finalStudio,
          releaseDate: finalReleaseDate,
          genres: finalGenres,
          image: steamCover || matchedWiki?.thumbnail || '',
          synopsis: finalSynopsis
        });
      }
    } else if (parsedWiki.length > 0) {
      for (const w of parsedWiki) {
        if (w.isSeriesPage && parsedWiki.some((p) => !p.isSeriesPage)) continue;
        const benchmark = lookupGameBenchmark(w.rawTitle);
        const finalStudio = (w.studio && w.studio !== 'Unknown Developer')
          ? w.studio
          : (benchmark?.studio || 'Unknown Developer');
        const finalReleaseDate = (w.releaseDate && w.releaseDate !== 'TBA')
          ? w.releaseDate
          : (benchmark?.year || 'TBA');

        let finalGenres = w.genres || [];
        if (finalGenres.length === 0 && benchmark?.genres) {
          finalGenres = [...benchmark.genres];
        }
        const finalHours = benchmark?.hours || getGameStoryLength(w.rawTitle, w.synopsis || '', finalGenres);

        results.push({
          title: w.rawTitle,
          titleEnglish: w.rawTitle,
          titleRomaji: '',
          category: 'Games',
          totalUnits: finalHours,
          unitName: 'hrs',
          studio: finalStudio,
          releaseDate: finalReleaseDate,
          genres: finalGenres,
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

/** Enrich Games via CheapShark (Steam 600x900 cover) + Wikipedia VG parser + Story Length & Genres */
async function enrichGameItem(item, forceAll = false) {
  const cleanTitle = getCleanSearchTitle(item.title);
  let changed = false;
  const edited = item._manualFields || [];
  const isMismatched = isGameInstallmentMismatched(item);

  try {
    const [sharkRes, wikiRes] = await Promise.allSettled([
      fetch(`https://www.cheapshark.com/api/1.0/games?title=${encodeURIComponent(cleanTitle)}&limit=5`)
        .then((r) => (r.ok ? r.json() : [])),
      fetch(
        `https://en.wikipedia.org/w/api.php?action=query&origin=*&format=json&generator=search&gsrsearch=${encodeURIComponent(
          cleanTitle + ' video game'
        )}&gsrlimit=8&prop=pageimages|extracts|categories&cllimit=40&pilicense=any&exintro=1&explaintext=1&exchars=420&piprop=thumbnail&pithumbsize=600`
      ).then((r) => (r.ok ? r.json() : {}))
    ]);

    const sharkGames = sharkRes.status === 'fulfilled' && Array.isArray(sharkRes.value) ? sharkRes.value : [];
    const wikiPages = wikiRes.status === 'fulfilled' ? Object.values(wikiRes.value?.query?.pages || {}) : [];
    const bestWikiPage = findBestMatchingWikiGame(item.title, wikiPages);
    const wikiData = bestWikiPage ? {
      ...parseWikiGameMetadata(bestWikiPage.extract || '', bestWikiPage.categories || []),
      thumbnail: bestWikiPage.thumbnail?.source || ''
    } : null;

    const benchmark = lookupGameBenchmark(item.title);

    // If candidate release year strongly contradicts curated benchmark (>1 year apart), candidate is the wrong game
    if (benchmark?.year && wikiData?.releaseDate && wikiData.releaseDate !== 'TBA') {
      const wikiY = parseInt(wikiData.releaseDate, 10);
      const benchY = parseInt(benchmark.year, 10);
      if (!isNaN(wikiY) && !isNaN(benchY) && Math.abs(wikiY - benchY) > 1) {
        wikiData = null;
      }
    }

    if (!item.image || forceAll) {
      const steamMatch = sharkGames.find((g) => {
        if (!g.steamAppID) return false;
        const normG = normalizeGameKey(g.external);
        const normT = normalizeGameKey(item.title);
        const numG = getGameInstallmentNum(normG);
        const numT = getGameInstallmentNum(normT);
        if (numT > 0 && numG > 0 && numG !== numT) return false;
        return normG.includes(normT) || normT.includes(normG);
      }) || sharkGames.find((g) => g.steamAppID);

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

    if (wikiData || benchmark) {
      if (!edited.includes('studio') && (!item.studio || item.studio === 'Unknown Studio' || item.studio === 'Wikipedia' || isMismatched || forceAll)) {
        if (wikiData?.studio && wikiData.studio !== 'Unknown Developer') {
          if (item.studio !== wikiData.studio) {
            item.studio = wikiData.studio;
            changed = true;
          }
        } else if (benchmark?.studio) {
          if (item.studio !== benchmark.studio) {
            item.studio = benchmark.studio;
            changed = true;
          }
        }
      }
      if (!edited.includes('releaseDate') && (!item.releaseDate || item.releaseDate === 'TBA' || isMismatched || forceAll)) {
        if (wikiData?.releaseDate && wikiData.releaseDate !== 'TBA') {
          if (item.releaseDate !== wikiData.releaseDate) {
            item.releaseDate = wikiData.releaseDate;
            changed = true;
          }
        } else if (benchmark?.year) {
          if (item.releaseDate !== benchmark.year) {
            item.releaseDate = benchmark.year;
            changed = true;
          }
        }
      }
      if (!edited.includes('genres') && (!item.genres || item.genres.length === 0 || (item.genres.length === 1 && item.genres[0].toLowerCase() === 'uncategorized') || forceAll)) {
        if (Array.isArray(wikiData?.genres) && wikiData.genres.length > 0) {
          item.genres = wikiData.genres.slice(0, 4);
          changed = true;
        } else if (benchmark?.genres && benchmark.genres.length > 0) {
          item.genres = [...benchmark.genres];
          changed = true;
        }
      }
      if (!edited.includes('synopsis') && (!item.synopsis || item.synopsis.trim() === '' || isMismatched || forceAll)) {
        if (wikiData?.synopsis) {
          if (item.synopsis !== wikiData.synopsis) {
            item.synopsis = wikiData.synopsis;
            changed = true;
          }
        }
      }
    }

    // Benchmark fallback if genres still empty
    if (!edited.includes('genres') && (!item.genres || item.genres.length === 0 || (item.genres.length === 1 && item.genres[0].toLowerCase() === 'uncategorized') || forceAll)) {
      if (benchmark?.genres && benchmark.genres.length > 0) {
        item.genres = [...benchmark.genres];
        changed = true;
      }
    }

    // Story length in hours & unit name
    const currentGenres = (Array.isArray(item.genres) && item.genres.length > 0)
      ? item.genres
      : (wikiData?.genres || benchmark?.genres || []);
    const storyHours = benchmark?.hours || getGameStoryLength(item.title, wikiData?.synopsis || '', currentGenres);

    if (!edited.includes('unitName') && item.unitName !== 'hrs') {
      item.unitName = 'hrs';
      changed = true;
    }

    if (!edited.includes('totalUnits') && (!item.totalUnits || item.totalUnits === 1 || item.totalUnits === 12 || isMismatched || forceAll)) {
      if (storyHours && storyHours > 0) {
        const oldTotal = item.totalUnits || 1;
        if (item.totalUnits !== storyHours) {
          item.totalUnits = storyHours;
          changed = true;
        }
        // If completed with old default progress, synchronize progress to full hours
        if (item.status === 'Completed' && (item.progress === oldTotal || item.progress === 1 || item.progress === 12 || item.progress === 0)) {
          item.progress = storyHours;
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
    const missingGameMetadata = item.category === 'Games' && (!item.totalUnits || item.totalUnits === 1 || item.totalUnits === 12 || item.unitName !== 'hrs' || isGameInstallmentMismatched(item));
    return missingStudio || missingDate || missingSyn || missingGenres || missingLang || missingGameMetadata;
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
    if (statusText) statusText.textContent = `🎮 [Games] Auto-filling Steam Box Art, Genres & Story Length (${processed + 1} / ${targets.length})...`;
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
