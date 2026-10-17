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
// Comprehensive Bilingual Anime Title Dictionary & Normalization (L7)
// Provides instant bidirectional English <-> Romaji title resolution
// ---------------------------------------------------------------------------
const BILINGUAL_ANIME_MAP = [
  // High-priority titles specifically highlighted in review & common favorites
  { id: 'lc-takopi', english: "Takopi's Original Sin", romaji: "Takopii no Genzai", aliases: ["Takopi", "Takopi no Genzai"] },
  { id: 'lc-aot', english: "Attack on Titan", romaji: "Shingeki no Kyojin", aliases: ["AOT", "Shingeki", "Attack on Titan: The Final Season"] },
  { id: 'lc-frieren', english: "Frieren: Beyond Journey's End", romaji: "Sousou no Frieren", aliases: ["Frieren", "Sousou no Frieren Season 1"] },
  { id: 'lc-demonslayer', english: "Demon Slayer: Kimetsu no Yaiba", romaji: "Kimetsu no Yaiba", aliases: ["Demon Slayer", "Kimetsu", "Kimetsu no Yaiba: Yuukaku-hen", "Kimetsu no Yaiba: Katanakaji no Sato-hen"] },
  { id: 'lc-mha', english: "My Hero Academia", romaji: "Boku no Hero Academia", aliases: ["MHA", "My Hero", "Boku no Hero"] },
  { id: 'lc-sololeveling', english: "Solo Leveling", romaji: "Ore dake Level Up na Ken", aliases: ["Na Honjaman Rebeleop", "Ore dake Level Up", "Solo Leveling Season 2"] },
  { id: 'lc-silentvoice', english: "A Silent Voice", romaji: "Koe no Katachi", aliases: ["The Shape of Voice"] },
  { id: 'lc-yourname', english: "Your Name.", romaji: "Kimi no Na wa.", aliases: ["Your Name", "Kimi no Nawa"] },
  { id: 'lc-apothecary', english: "The Apothecary Diaries", romaji: "Kusuriya no Hitorigoto", aliases: ["Kusuriya", "The Pharmacist's Monologue"] },
  { id: 'lc-dungeonmeshi', english: "Delicious in Dungeon", romaji: "Dungeon Meshi", aliases: ["Delicious in Dungeon"] },
  { id: 'lc-konosuba', english: "KonoSuba: God's Blessing on This Wonderful World!", romaji: "Kono Subarashii Sekai ni Shukufuku wo!", aliases: ["KonoSuba", "Konosuba!"] },
  { id: 'lc-rezero', english: "Re:ZERO -Starting Life in Another World-", romaji: "Re:Zero kara Hajimeru Isekai Seikatsu", aliases: ["Re:Zero", "ReZero"] },
  { id: 'lc-slime', english: "That Time I Got Reincarnated as a Slime", romaji: "Tensei Shitara Slime Datta Ken", aliases: ["Tensura", "Slime Isekai"] },
  { id: 'lc-mushoku', english: "Mushoku Tensei: Jobless Reincarnation", romaji: "Mushoku Tensei: Isekai Ittara Honki Dasu", aliases: ["Mushoku Tensei", "Jobless Reincarnation"] },
  { id: 'lc-7deadly', english: "The Seven Deadly Sins", romaji: "Nanatsu no Taizai", aliases: ["Seven Deadly Sins"] },
  { id: 'lc-kuroko', english: "Kuroko's Basketball", romaji: "Kuroko no Basket", aliases: ["The Basketball which Kuroko Plays"] },
  { id: 'lc-shieldhero', english: "The Rising of the Shield Hero", romaji: "Tate no Yuusha no Nariagari", aliases: ["Shield Hero"] },
  { id: 'lc-oregairu', english: "My Teen Romantic Comedy SNAFU", romaji: "Yahari Ore no Seishun Love Come wa Machigatteiru.", aliases: ["Oregairu", "SNAFU"] },
  { id: 'lc-bunnygirl', english: "Rascal Does Not Dream of Bunny Girl Senpai", romaji: "Seishun Buta Yarou wa Bunny Girl Senpai no Yume wo Minai", aliases: ["Bunny Girl Senpai", "Aobuta"] },
  { id: 'lc-kaguya', english: "Kaguya-sama: Love Is War", romaji: "Kaguya-sama wa Kokurasetai: Tensai-tachi no Renai Zunousen", aliases: ["Kaguya-sama", "Love is War"] },
  { id: 'lc-komi', english: "Komi Can't Communicate", romaji: "Komi-san wa, Komyushou desu.", aliases: ["Komi-san", "Komi"] },
  { id: 'lc-dressup', english: "My Dress-Up Darling", romaji: "Sono Bisque Doll wa Koi wo Suru", aliases: ["Bisque Doll", "Marin Kitagawa"] },
  { id: 'lc-summertime', english: "Summer Time Rendering", romaji: "Summertime Render", aliases: ["Summer Time Render"] },
  { id: 'lc-hellsparadise', english: "Hell's Paradise", romaji: "Jigokuraku", aliases: ["Hells Paradise"] },
  { id: 'lc-kaiju8', english: "Kaiju No. 8", romaji: "Kaijuu 8-gou", aliases: ["Kaijuu 8-gou", "Kaiju No.8"] },
  { id: 'lc-dandadan', english: "DAN DA DAN", romaji: "Dandadan", aliases: ["Dandadan"] },
  { id: 'lc-chainsaw', english: "Chainsaw Man", romaji: "Chainsaw Man", aliases: ["CSM"] },
  { id: 'lc-jujutsu', english: "JUJUTSU KAISEN", romaji: "Jujutsu Kaisen", aliases: ["JJK"] },
  { id: 'lc-jujutsu0', english: "JUJUTSU KAISEN 0", romaji: "Gekijouban Jujutsu Kaisen 0", aliases: ["JJK 0"] },
  { id: 'lc-bluelock', english: "BLUELOCK", romaji: "Blue Lock", aliases: ["Blue Lock"] },
  { id: 'lc-bocchi', english: "BOCCHI THE ROCK!", romaji: "Bocchi the Rock!", aliases: ["Bocchi"] },
  { id: 'lc-oshinoko', english: "[Oshi No Ko]", romaji: "Oshi no Ko", aliases: ["Oshi no Ko", "My Star"] },
  { id: 'lc-spyfamily', english: "SPY x FAMILY", romaji: "SPY x FAMILY", aliases: ["Spy Family", "Spy x Family"] },
  { id: 'lc-vinland', english: "Vinland Saga", romaji: "Vinland Saga", aliases: [] },
  { id: 'lc-cyberpunk', english: "Cyberpunk: Edgerunners", romaji: "Cyberpunk: Edgerunners", aliases: ["Edgerunners"] },
  { id: 'lc-fireforce', english: "Fire Force", romaji: "Enen no Shouboutai", aliases: ["Enen no Shouboutai"] },
  { id: 'lc-drstone', english: "Dr. STONE", romaji: "Dr. Stone", aliases: ["Doctor Stone"] },
  { id: 'lc-blueexorcist', english: "Blue Exorcist", romaji: "Ao no Exorcist", aliases: ["Ao no Exorcist"] },
  { id: 'lc-noragami', english: "Noragami: Stray God", romaji: "Noragami", aliases: ["Stray God"] },
  { id: 'lc-erased', english: "ERASED", romaji: "Boku dake ga Inai Machi", aliases: ["The Town Where Only I am Missing"] },
  { id: 'lc-yourlie', english: "Your Lie in April", romaji: "Shigatsu wa Kimi no Uso", aliases: ["Kimiuso"] },
  { id: 'lc-anohana', english: "Anohana: The Flower We Saw That Day", romaji: "Ano Hi Mita Hana no Namae wo Bokutachi wa Mada Shiranai.", aliases: ["Anohana"] },
  { id: 'lc-assclass', english: "Assassination Classroom", romaji: "Ansatsu Kyoushitsu", aliases: ["Ansatsu"] },
  { id: 'lc-neverland', english: "The Promised Neverland", romaji: "Yakusoku no Neverland", aliases: ["Yakusoku"] },
  { id: 'lc-codegeass', english: "Code Geass: Lelouch of the Rebellion", romaji: "Code Geass: Hangyaku no Lelouch", aliases: ["Code Geass", "Lelouch"] },
  { id: 'lc-fma', english: "Fullmetal Alchemist: Brotherhood", romaji: "Hagane no Renkinjutsushi: Fullmetal Alchemist", aliases: ["FMAB", "Fullmetal Alchemist"] },
  { id: 'lc-parasyte', english: "Parasyte -the maxim-", romaji: "Kiseijuu: Sei no Kakuritsu", aliases: ["Parasyte", "Kiseijuu"] },
  { id: 'lc-tokyoghoul', english: "Tokyo Ghoul", romaji: "Tokyo Ghoul", aliases: [] },
  { id: 'lc-steinsgate', english: "Steins;Gate", romaji: "Steins;Gate", aliases: ["Steins Gate"] },
  { id: 'lc-hxh', english: "Hunter x Hunter", romaji: "Hunter x Hunter (2011)", aliases: ["HxH"] },
  { id: 'lc-haikyu', english: "Haikyu!!", romaji: "Haikyuu!!", aliases: ["Haikyu"] },
  { id: 'lc-mobpsycho', english: "Mob Psycho 100", romaji: "Mob Psycho 100", aliases: ["Mob"] },
  { id: 'lc-onepunch', english: "One-Punch Man", romaji: "One Punch Man", aliases: ["OPM"] },
  { id: 'lc-deathnote', english: "Death Note", romaji: "Death Note", aliases: [] },
  { id: 'lc-bleach', english: "Bleach", romaji: "Bleach", aliases: [] },
  { id: 'lc-bleachtybw', english: "Bleach: Thousand-Year Blood War", romaji: "Bleach: Sennen Kessen-hen", aliases: ["Bleach TYBW"] },
  { id: 'lc-naruto', english: "Naruto", romaji: "Naruto", aliases: ["Naruto Shippuden"] },
  { id: 'lc-onepiece', english: "One Piece", romaji: "One Piece", aliases: [] },
  { id: 'lc-dbz', english: "Dragon Ball Z", romaji: "Dragon Ball Z", aliases: ["DBZ"] },
  { id: 'lc-blackclover', english: "Black Clover", romaji: "Black Clover", aliases: [] },
  { id: 'lc-blacklagoon', english: "Black Lagoon", romaji: "Black Lagoon", aliases: [] },
  { id: 'lc-cowboybebop', english: "Cowboy Bebop", romaji: "Cowboy Bebop", aliases: [] },
  { id: 'lc-dororo', english: "Dororo", romaji: "Dororo", aliases: [] },
  { id: 'lc-psychopass', english: "PSYCHO-PASS", romaji: "Psycho-Pass", aliases: [] },
  { id: 'lc-goblinslayer', english: "Goblin Slayer", romaji: "Goblin Slayer", aliases: [] },
  { id: 'lc-drifters', english: "Drifters", romaji: "Drifters", aliases: [] },
  { id: 'lc-windbreaker', english: "WIND BREAKER", romaji: "Wind Breaker", aliases: [] },
  { id: 'lc-chainedsoldier', english: "Chained Soldier", romaji: "Mato Seihei no Slave", aliases: [] },
  { id: 'lc-loserranger', english: "Go! Go! Loser Ranger!", romaji: "Sentai Daishikkaku", aliases: [] },
  { id: 'lc-ragnarok', english: "Record of Ragnarok", romaji: "Shuumatsu no Valkyrie", aliases: [] },
  { id: 'lc-bakihanma', english: "Baki Hanma", romaji: "Hanma Baki", aliases: [] },
  { id: 'lc-modaozushi', english: "The Founder of Diabolism", romaji: "Mo Dao Zu Shi", aliases: ["Grandmaster of Demonic Cultivation"] },
  { id: 'lc-scissor7', english: "Scissor Seven", romaji: "Cike Wu Liuqi", aliases: ["Killer 7"] },
  { id: 'lc-jojo6', english: "JoJo's Bizarre Adventure: Stone Ocean", romaji: "JoJo no Kimyou na Bouken: Stone Ocean", aliases: ["Stone Ocean"] },
  { id: 'lc-horimiya', english: "Horimiya", romaji: "Horimiya", aliases: ["Hori-san to Miyamura-kun"] },
  { id: 'lc-idinvaded', english: "ID: INVADED", romaji: "Id:Invaded", aliases: [] },
  { id: 'lc-charlotte', english: "Charlotte", romaji: "Charlotte", aliases: [] },
  { id: 'lc-deathparade', english: "Death Parade", romaji: "Death Parade", aliases: [] },
  { id: 'lc-devilman', english: "DEVILMAN crybaby", romaji: "Devilman Crybaby", aliases: [] },
  { id: 'lc-elfenlied', english: "Elfen Lied", romaji: "Elfen Lied", aliases: [] },
  { id: 'lc-gurrenlagann', english: "Gurren Lagann", romaji: "Tengen Toppa Gurren Lagann", aliases: ["TTGL"] },
  { id: 'lc-overlord', english: "Overlord", romaji: "Overlord", aliases: [] },
  { id: 'lc-plasticmemories', english: "Plastic Memories", romaji: "Plastic Memories", aliases: [] },
  { id: 'lc-akamegakill', english: "Akame ga Kill!", romaji: "Akame ga Kill!", aliases: [] },
  { id: 'lc-futurediary', english: "The Future Diary", romaji: "Mirai Nikki", aliases: ["Future Diary"] },
  { id: 'lc-dragonraja', english: "Dragon Raja", romaji: "Long Zu", aliases: [] },
  { id: 'lc-undeadunluck', english: "Undead Unluck", romaji: "Undead Unluck", aliases: [] },
  { id: 'lc-sakamoto', english: "SAKAMOTO DAYS", romaji: "Sakamoto Days", aliases: [] },
  { id: 'lc-gachiakuta', english: "Gachiakuta", romaji: "Gachiakuta", aliases: [] },
  { id: 'lc-zenshu', english: "ZENSHU", romaji: "Zenshuu.", aliases: [] },
  { id: 'lc-tougenanki', english: "Tougen Anki", romaji: "Tougen Anki", aliases: [] },
  { id: 'lc-ninjakamui', english: "Ninja Kamui", romaji: "Ninja Kamui", aliases: [] },
  { id: 'lc-kenganashura', english: "Kengan Ashura", romaji: "Kengan Ashura", aliases: [] },
  { id: 'lc-kakegurui', english: "Kakegurui", romaji: "Kakegurui", aliases: [] },
  { id: 'lc-shinsekai', english: "From the New World", romaji: "Shinsekai yori", aliases: ["Shin Sekai Yori"] },
  { id: 'lc-madoka', english: "Puella Magi Madoka Magica", romaji: "Mahou Shoujo Madoka★Magica", aliases: ["Madoka Magica"] },
  { id: 'lc-killlakill', english: "Kill la Kill", romaji: "Kill la Kill", aliases: [] },
  { id: 'lc-violet', english: "Violet Evergarden", romaji: "Violet Evergarden", aliases: [] },
  { id: 'lc-fatezero', english: "Fate/Zero", romaji: "Fate/Zero", aliases: [] },
  { id: 'lc-fatestay', english: "Fate/stay night: Unlimited Blade Works", romaji: "Fate/stay night: Unlimited Blade Works", aliases: ["UBW"] },
  { id: 'lc-sao', english: "Sword Art Online", romaji: "Sword Art Online", aliases: ["SAO"] },
  { id: 'lc-evangelion', english: "Neon Genesis Evangelion", romaji: "Shin Seiki Evangelion", aliases: ["Evangelion", "NGE"] },
  { id: 'lc-toradora', english: "Toradora!", romaji: "Toradora!", aliases: ["Toradora"] },
  { id: 'lc-clannad', english: "Clannad: After Story", romaji: "Clannad: After Story", aliases: ["Clannad"] },
  { id: 'lc-tokyorevengers', english: "Tokyo Revengers", romaji: "Tokyo Revengers", aliases: [] },
  { id: 'lc-86', english: "86: Eighty Six", romaji: "86: Eighty Six", aliases: ["86", "Eighty Six"] },
  { id: 'lc-vivy', english: "Vivy: Fluorite Eye's Song", romaji: "Vivy: Fluorite Eye's Song", aliases: ["Vivy"] },
  { id: 'lc-lycoris', english: "Lycoris Recoil", romaji: "Lycoris Recoil", aliases: [] },
  { id: 'lc-rentagirlfriend', english: "Rent-a-Girlfriend", romaji: "Kanojo, Okarishimasu", aliases: ["Kanokari"] },
  { id: 'lc-tonikawa', english: "TONIKAWA: Over The Moon For You", romaji: "Tonikaku Kawaii", aliases: ["Fly Me to the Moon"] },
  { id: 'lc-cote', english: "Classroom of the Elite", romaji: "Youkoso Jitsuryoku Shijou Shugi no Kyoushitsu e", aliases: ["CotE", "Youkoso Jitsuryoku", "You-Zitsu"] },
  { id: 'lc-eminence', english: "The Eminence in Shadow", romaji: "Kage no Jitsuryokusha ni Naritakute!", aliases: ["Eminence in Shadow", "Kage no Jitsuryokusha"] },
  { id: 'lc-ngnl', english: "No Game, No Life", romaji: "No Game No Life", aliases: ["NGNL"] },
  { id: 'lc-makeine', english: "Makeine: Too Many Losing Heroines!", romaji: "Make Heroine ga Oosugiru!", aliases: ["Makeine", "Too Many Losing Heroines"] },
  { id: 'lc-roshidere', english: "Alya Sometimes Hides Her Feelings in Russian", romaji: "Tokidoki Bosotto Russia-go de Dereru Tonari no Alya-san", aliases: ["Roshidere", "Alya-san"] },
  { id: 'lc-shanfro', english: "Shangri-La Frontier", romaji: "Shangri-La Frontier", aliases: ["ShanFro"] },
  { id: 'lc-wistoria', english: "Wistoria: Wand and Sword", romaji: "Tsue to Tsurugi no Wistoria", aliases: ["Wistoria"] },
  { id: 'lc-mushishi', english: "Mushi-Shi", romaji: "Mushishi", aliases: ["Mushishi"] },
  { id: 'lc-bakemonogatari', english: "Bakemonogatari", romaji: "Bakemonogatari", aliases: ["Monogatari", "Kizumonogatari", "Nisemonogatari"] },
  { id: 'lc-gto', english: "Great Teacher Onizuka", romaji: "Great Teacher Onizuka", aliases: ["GTO"] },
  { id: 'lc-berserk', english: "Berserk", romaji: "Kenpuu Denki Berserk", aliases: ["Berserk 1997"] },
  { id: 'lc-jojo', english: "JoJo's Bizarre Adventure", romaji: "JoJo no Kimyou na Bouken", aliases: ["JoJo", "JJBA", "Stardust Crusaders", "Diamond is Unbreakable", "Golden Wind"] },
  { id: 'lc-madeinabyss', english: "Made in Abyss", romaji: "Made in Abyss", aliases: ["Made in Abyss: The Golden City of the Scorching Sun"] },
  { id: 'lc-dorohedoro', english: "Dorohedoro", romaji: "Dorohedoro", aliases: [] },
  { id: 'lc-goldenkamuy', english: "Golden Kamuy", romaji: "Golden Kamuy", aliases: [] },
  { id: 'lc-durarara', english: "Durarara!!", romaji: "Durarara!!", aliases: ["DRRR"] },
  { id: 'lc-baccano', english: "Baccano!", romaji: "Baccano!", aliases: [] },
  { id: 'lc-samuraichamploo', english: "Samurai Champloo", romaji: "Samurai Champloo", aliases: ["Champloo"] },
  { id: 'lc-trigun', english: "Trigun", romaji: "Trigun", aliases: ["Trigun Stampede"] },
  { id: 'lc-hellsing', english: "Hellsing Ultimate", romaji: "Hellsing Ultimate", aliases: ["Hellsing"] },
  { id: 'lc-souleater', english: "Soul Eater", romaji: "Soul Eater", aliases: [] },
  { id: 'lc-dgrayman', english: "D.Gray-man", romaji: "D.Gray-man", aliases: ["D Gray Man"] },
  { id: 'lc-relife', english: "ReLIFE", romaji: "ReLIFE", aliases: [] },
  { id: 'lc-gintama', english: "Gintama", romaji: "Gintama", aliases: [] },
  { id: 'lc-monster', english: "Monster", romaji: "Monster", aliases: ["Naoki Urasawa's Monster"] }
];

function normalizeTitleKey(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/\s*\(?(?:TV|Movie|ONA|OVA|Special|Dub|Sub|Subbed|Dubbed)\)?/gi, '')
    .replace(/\s*[-:]?\s*\(?(?:Season\s*\d+|2nd\s*Season|3rd\s*Season|4th\s*Season|Final\s*Season|Part\s*\d+|Cour\s*\d+)\)?/gi, '')
    .replace(/[^\w]/g, '')
    .trim();
}

const BILINGUAL_ANIME_INDEX = new Map();
for (const entry of BILINGUAL_ANIME_MAP) {
  if (entry.id) BILINGUAL_ANIME_INDEX.set(entry.id.toLowerCase(), entry);
  if (entry.english) BILINGUAL_ANIME_INDEX.set(normalizeTitleKey(entry.english), entry);
  if (entry.romaji) BILINGUAL_ANIME_INDEX.set(normalizeTitleKey(entry.romaji), entry);
  for (const alias of entry.aliases || []) {
    BILINGUAL_ANIME_INDEX.set(normalizeTitleKey(alias), entry);
  }
}

/** Look up canonical bilingual titles for any anime query, title, or ID */
function lookupBilingualTitle(query) {
  if (!query) return null;
  const raw = String(query).trim().toLowerCase();
  if (BILINGUAL_ANIME_INDEX.has(raw)) return BILINGUAL_ANIME_INDEX.get(raw);
  const key = normalizeTitleKey(query);
  if (key && BILINGUAL_ANIME_INDEX.has(key)) {
    const base = BILINGUAL_ANIME_INDEX.get(key);
    // If query has a season or part suffix (e.g. "Season 2"), preserve suffix
    const seasonMatch = String(query).match(/\b(Season\s*\d+|2nd\s*Season|3rd\s*Season|4th\s*Season|Final\s*Season|Part\s*\d+|Cour\s*\d+)\b/i);
    if (seasonMatch && base) {
      const suffix = seasonMatch[1];
      const hasEngSuffix = base.english.toLowerCase().includes(suffix.toLowerCase());
      const hasRomSuffix = base.romaji.toLowerCase().includes(suffix.toLowerCase());
      return {
        id: base.id,
        english: hasEngSuffix ? base.english : `${base.english} ${suffix}`,
        romaji: hasRomSuffix ? base.romaji : `${base.romaji} ${suffix}`
      };
    }
    return base;
  }
  return null;
}
window.lookupBilingualTitle = lookupBilingualTitle;
window.BILINGUAL_ANIME_MAP = BILINGUAL_ANIME_MAP;

// ---------------------------------------------------------------------------
// Recovery map for legacy LiveChart IDs
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
  'lc-11088': { title: 'Baki Hanma', english: 'Baki Hanma', romaji: 'Hanma Baki' },
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
  'lc-12651': { title: 'Tougen Anki', english: 'Tougen Anki', romaji: 'Tougen Anki' },
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

    // Recover known broken LiveChart titles
    const rec = LIVECHART_ID_TITLE_RECOVERY[item.id];
    if (rec && isBrokenTitle(item.title)) {
      item.title = (typeof rec === 'object' && rec.title) ? rec.title : rec;
      changed = true;
    }

    // Supply English / Romaji titles (L7) by title lookup or ID lookup
    const match = (typeof lookupBilingualTitle === 'function')
      ? (lookupBilingualTitle(item.title) || lookupBilingualTitle(item.id))
      : null;

    if (match) {
      if (match.english && !item.titleEnglish) {
        item.titleEnglish = match.english;
        changed = true;
      }
      if (match.romaji && !item.titleRomaji) {
        item.titleRomaji = match.romaji;
        changed = true;
      }
    } else if (rec && typeof rec === 'object') {
      if (rec.english && !item.titleEnglish) {
        item.titleEnglish = rec.english;
        changed = true;
      }
      if (rec.romaji && !item.titleRomaji) {
        item.titleRomaji = rec.romaji;
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
      if (Array.isArray(parsed) && parsed.length > 0) {
        state.items = parsed;
        if (sanitizeAndRecoverItems(state.items)) {
          saveItems(false);
        }
        return;
      }
    }
  } catch (e) {}

  state.items = [];
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
            autoRefreshToken: true,
            flowType: 'implicit',
            detectSessionInUrl: true
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

    // Register onAuthStateChange immediately so PASSWORD_RECOVERY is never missed
    client.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        if (session?.user) state.user = session.user;
        if (typeof openAuthModal === 'function') {
          openAuthModal('reset-password');
        }
        return;
      }
      if (session?.user) {
        state.user = session.user;
        state.cloudStatus = 'connected';
        const remoteItems = await this.pull();
        state.items = Array.isArray(remoteItems) ? remoteItems : [];
        saveItems(false);
        this.subscribe();
      } else {
        state.user = null;
        state.cloudStatus = 'offline';
        if (event === 'SIGNED_OUT') {
          state.items = [];
          saveItems(false);
        }
        if (this._realtimeChannel) {
          client.removeChannel(this._realtimeChannel);
          this._realtimeChannel = null;
        }
      }
      if (typeof renderAuthStatus === 'function') renderAuthStatus();
      if (typeof renderAll === 'function') renderAll();
    });

    try {
      state.cloudStatus = 'connecting';

      // Check if arrived with PKCE auth code (?code=...)
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      if (code) {
        try {
          const { data } = await client.auth.exchangeCodeForSession(code);
          if (data?.session) {
            state.user = data.session.user;
            const isRecoveryCode = window.location.search.includes('type=recovery') || window.location.hash.includes('type=recovery');
            if (isRecoveryCode && typeof openAuthModal === 'function') {
              openAuthModal('reset-password');
              return;
            }
          }
        } catch (e) {
          console.warn('[CloudSync] PKCE exchange error:', e);
        }
      }

      const { data: { session }, error } = await client.auth.getSession();
      const isRecovery = window.location.hash.includes('type=recovery') || window.location.search.includes('type=recovery');
      if (isRecovery) {
        if (session?.user) state.user = session.user;
        if (typeof openAuthModal === 'function') {
          openAuthModal('reset-password');
        }
      } else if (!error && session?.user) {
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

  /** Calculate safe redirect URL for auth emails (supports GitHub Pages and localhost) */
  getResetRedirectUrl() {
    const loc = window.location;
    if (loc.protocol === 'http:' || loc.protocol === 'https:') {
      return `${loc.origin}${loc.pathname}`;
    }
    return 'https://yashaswi-katta.github.io/OmniChart/';
  },

  /** Send password recovery email */
  async resetPasswordForEmail(email) {
    const client = this.getClient();
    if (!client) throw new Error('Supabase credentials not configured yet. Please configure them in Database Setup.');
    const redirectTo = this.getResetRedirectUrl();
    const { data, error } = await client.auth.resetPasswordForEmail(email.trim(), {
      redirectTo
    });
    if (error) throw error;
    return data;
  },

  /** Parse recovery credentials from URL, hash, query params, or raw token string */
  parseRecoveryInput(input) {
    if (!input || typeof input !== 'string') return null;
    const str = input.trim();

    let hashStr = '';
    let queryStr = '';

    if (str.includes('#')) {
      hashStr = str.substring(str.indexOf('#') + 1);
    }
    if (str.includes('?')) {
      const qPart = str.substring(str.indexOf('?') + 1);
      queryStr = qPart.includes('#') ? qPart.substring(0, qPart.indexOf('#')) : qPart;
    }

    const hashParams = new URLSearchParams(hashStr);
    const queryParams = new URLSearchParams(queryStr);

    const accessToken = hashParams.get('access_token') || queryParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token') || queryParams.get('refresh_token');
    const type = hashParams.get('type') || queryParams.get('type');
    const tokenHash = queryParams.get('token_hash') || hashParams.get('token_hash');
    const token = queryParams.get('token') || hashParams.get('token');
    const code = queryParams.get('code') || hashParams.get('code');

    return {
      accessToken,
      refreshToken,
      type,
      tokenHash,
      token: token || (!str.includes('/') && !str.includes('?') && !str.includes('#') && !str.includes('&') ? str : null),
      code
    };
  },

  /** Verify pasted recovery URL, token_hash, PKCE code, or raw token */
  async applyRecoveryUrlOrToken(input, email = '') {
    const client = this.getClient();
    if (!client) throw new Error('Supabase client not initialized');

    if (!input || typeof input !== 'string') {
      throw new Error('Please paste a link, URL, or token.');
    }

    const str = input.trim();

    // Check if the user pasted an expired/consumed error URL from Supabase
    if (str.includes('error_description=') || str.includes('error=')) {
      const match = str.match(/error_description=([^&]+)/);
      const desc = match ? decodeURIComponent(match[1].replace(/\+/g, ' ')) : 'Email link is invalid or has expired';
      throw new Error(`⚠️ ${desc}. Supabase reset links can only be used once. Please click "Send Reset Link" above to request a fresh email.`);
    }

    // Check if user pasted bare localhost URL without any token/hash
    if (/^https?:\/\/localhost(?::\d+)?\/?$/i.test(str)) {
      throw new Error("⚠️ Only the address 'localhost:3000' was pasted, missing the security token. In that tab's address bar, press Ctrl+A to copy the whole address including '#access_token=...', or copy the link directly from your email.");
    }

    const parsed = this.parseRecoveryInput(str);
    if (!parsed) throw new Error('Please enter a valid reset link, token, or URL.');

    // 1. Direct access_token (+ refresh_token) from localhost address bar
    if (parsed.accessToken) {
      const { data, error } = await client.auth.setSession({
        access_token: parsed.accessToken,
        refresh_token: parsed.refreshToken || parsed.accessToken
      });
      if (error) {
        if (error.message && (error.message.includes('expired') || error.message.includes('invalid'))) {
          throw new Error('⚠️ This reset token has expired or was already used. Please click "Send Reset Link" above to request a fresh email.');
        }
        throw error;
      }
      if (data?.user) state.user = data.user;
      return data;
    }

    // 2. Token from verify URL (e.g. pkce_... or hex hash from email link)
    const tokenHash = parsed.tokenHash || (parsed.token && (parsed.token.startsWith('pkce_') || parsed.token.length > 20) ? parsed.token : null);
    if (tokenHash) {
      const { data, error } = await client.auth.verifyOtp({
        token_hash: tokenHash,
        type: 'recovery'
      });
      if (!error && data?.user) {
        state.user = data.user;
        return data;
      }
      if (error) {
        const msg = error.message || '';
        if (msg.toLowerCase().includes('expired') || msg.toLowerCase().includes('invalid')) {
          throw new Error('⚠️ This recovery link has expired or was already used. Please click "Send Reset Link" above to request a fresh email.');
        }
        throw error;
      }
    }

    // 3. Raw 6-digit OTP code or short token
    if (parsed.token) {
      const targetEmail = (email || document.getElementById('authResetEmailInput')?.value || '').trim();
      if (!targetEmail) {
        throw new Error('Please enter your account email in the box above so we can verify this code.');
      }
      const { data, error } = await client.auth.verifyOtp({
        email: targetEmail,
        token: parsed.token,
        type: 'recovery'
      });
      if (error) {
        const msg = error.message || '';
        if (msg.toLowerCase().includes('expired') || msg.toLowerCase().includes('invalid')) {
          throw new Error('⚠️ Invalid or expired code. Please click "Send Reset Link" above to request a new email.');
        }
        throw error;
      }
      if (data?.user) state.user = data.user;
      return data;
    }

    // 4. PKCE code exchange (?code=...)
    if (parsed.code) {
      const { data, error } = await client.auth.exchangeCodeForSession(parsed.code);
      if (error) {
        throw new Error('⚠️ Could not exchange auth code. Please request a new reset link using "Send Reset Link" above.');
      }
      if (data?.user) state.user = data.user;
      return data;
    }

    throw new Error('Could not find recovery credentials in the provided text. Please copy the full URL from your address bar or email.');
  },

  /** Update user password (used after password recovery) */
  async updatePassword(newPassword) {
    const client = this.getClient();
    if (!client) throw new Error('Supabase credentials not configured yet. Please configure them in Database Setup.');
    const { data, error } = await client.auth.updateUser({
      password: newPassword.trim()
    });
    if (error) throw error;
    return data;
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

  /** Clear all items for the authenticated user from the cloud */
  async clearUserLibrary() {
    if (!state.user) return;
    const client = this.getClient();
    if (!client) return;
    try {
      this._lastLocalPushTime = Date.now();
      await client
        .from(OMNICHART_CONFIG.supabase.tableName)
        .delete()
        .eq('user_id', state.user.id);
    } catch (err) {
      console.warn('[CloudSync] Clear user library exception:', err);
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
          titleEnglish: row.title_english || row.titleEnglish || '',
          titleRomaji: row.title_romaji || row.titleRomaji || '',
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
