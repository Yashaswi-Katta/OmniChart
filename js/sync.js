/* ==========================================================================
   OmniChart — Sync & Persistence Module
   localStorage persistence, JSON import / export, LiveChart title recovery,
   Owner Mode vs. Public Read-Only Visitor security, and CloudSync stubs
   for instant Supabase or Firebase cross-device synchronization.
   ========================================================================== */

const STORAGE_KEY = 'omnichart_v5_items';

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
    if (paramVal === OMNICHART_CONFIG.ownerPasscode) {
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
  { id: 'lc-11320', english: "Solo Leveling", romaji: "Ore dake Level Up na Ken", aliases: ["lc-sololeveling", "Na Honjaman Rebeleop", "Ore dake Level Up", "Solo Leveling Season 2"] },
  { id: 'lc-3399', english: "A Silent Voice", romaji: "Koe no Katachi", aliases: ["lc-silentvoice", "The Shape of Voice"] },
  { id: 'lc-1956', english: "Your Name.", romaji: "Kimi no Na wa.", aliases: ["lc-yourname", "Your Name", "Kimi no Nawa"] },
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
  { id: 'lc-11352', english: "Kaiju No. 8", romaji: "Kaijuu 8-gou", aliases: ["lc-kaiju8", "Kaijuu 8-gou", "Kaiju No.8"] },
  { id: 'lc-12428', english: "DAN DA DAN", romaji: "Dandadan", aliases: ["lc-dandadan", "Dandadan"] },
  { id: 'lc-10257', english: "Chainsaw Man", romaji: "Chainsaw Man", aliases: ["lc-chainsaw", "CSM"] },
  { id: 'lc-9680', english: "JUJUTSU KAISEN", romaji: "Jujutsu Kaisen", aliases: ["lc-jujutsu", "JJK"] },
  { id: 'lc-10491', english: "JUJUTSU KAISEN 0", romaji: "Gekijouban Jujutsu Kaisen 0", aliases: ["lc-jujutsu0", "JJK 0"] },
  { id: 'lc-10687', english: "BLUELOCK", romaji: "Blue Lock", aliases: ["lc-bluelock", "Blue Lock"] },
  { id: 'lc-bocchi', english: "BOCCHI THE ROCK!", romaji: "Bocchi the Rock!", aliases: ["Bocchi"] },
  { id: 'lc-11247', english: "[Oshi No Ko]", romaji: "Oshi no Ko", aliases: ["lc-oshinoko", "Oshi no Ko", "My Star"] },
  { id: 'lc-10456', english: "SPY x FAMILY", romaji: "SPY x FAMILY", aliases: ["lc-spyfamily", "Spy Family", "Spy x Family"] },
  { id: 'lc-3169', english: "Vinland Saga", romaji: "Vinland Saga", aliases: ["lc-vinland"] },
  { id: 'lc-10042', english: "Cyberpunk: Edgerunners", romaji: "Cyberpunk: Edgerunners", aliases: ["lc-cyberpunk", "Edgerunners"] },
  { id: 'lc-8355', english: "Fire Force", romaji: "Enen no Shouboutai", aliases: ["lc-fireforce", "Enen no Shouboutai"] },
  { id: 'lc-8349', english: "Dr. STONE", romaji: "Dr. Stone", aliases: ["lc-drstone", "Doctor Stone"] },
  { id: 'lc-1241', english: "Blue Exorcist", romaji: "Ao no Exorcist", aliases: ["lc-blueexorcist", "Ao no Exorcist"] },
  { id: 'lc-154', english: "Noragami: Stray God", romaji: "Noragami", aliases: ["lc-noragami", "Stray God", "Noragami"] },
  { id: 'lc-erased', english: "ERASED", romaji: "Boku dake ga Inai Machi", aliases: ["The Town Where Only I am Missing"] },
  { id: 'lc-yourlie', english: "Your Lie in April", romaji: "Shigatsu wa Kimi no Uso", aliases: ["Kimiuso"] },
  { id: 'lc-anohana', english: "Anohana: The Flower We Saw That Day", romaji: "Ano Hi Mita Hana no Namae wo Bokutachi wa Mada Shiranai.", aliases: ["Anohana"] },
  { id: 'lc-assclass', english: "Assassination Classroom", romaji: "Ansatsu Kyoushitsu", aliases: ["Ansatsu"] },
  { id: 'lc-neverland', english: "The Promised Neverland", romaji: "Yakusoku no Neverland", aliases: ["Yakusoku"] },
  { id: 'lc-codegeass', english: "Code Geass: Lelouch of the Rebellion", romaji: "Code Geass: Hangyaku no Lelouch", aliases: ["Code Geass", "Lelouch"] },
  { id: 'lc-fma', english: "Fullmetal Alchemist: Brotherhood", romaji: "Hagane no Renkinjutsushi: Fullmetal Alchemist", aliases: ["FMAB", "Fullmetal Alchemist"] },
  { id: 'lc-parasyte', english: "Parasyte -the maxim-", romaji: "Kiseijuu: Sei no Kakuritsu", aliases: ["Parasyte", "Kiseijuu"] },
  { id: 'lc-412', english: "Tokyo Ghoul", romaji: "Tokyo Ghoul", aliases: ["lc-tokyoghoul"] },
  { id: 'lc-steinsgate', english: "Steins;Gate", romaji: "Steins;Gate", aliases: ["Steins Gate"] },
  { id: 'lc-hxh', english: "Hunter x Hunter", romaji: "Hunter x Hunter (2011)", aliases: ["HxH"] },
  { id: 'lc-haikyu', english: "Haikyu!!", romaji: "Haikyuu!!", aliases: ["Haikyu"] },
  { id: 'lc-1936', english: "Mob Psycho 100", romaji: "Mob Psycho 100", aliases: ["lc-mobpsycho", "Mob"] },
  { id: 'lc-onepunch', english: "One-Punch Man", romaji: "One Punch Man", aliases: ["OPM"] },
  { id: 'lc-3437', english: "Death Note", romaji: "Death Note", aliases: ["lc-deathnote"] },
  { id: 'lc-3340', english: "Bleach", romaji: "Bleach", aliases: ["lc-bleach"] },
  { id: 'lc-bleachtybw', english: "Bleach: Thousand-Year Blood War", romaji: "Bleach: Sennen Kessen-hen", aliases: ["Bleach TYBW"] },
  { id: 'lc-3585', english: "Naruto", romaji: "Naruto", aliases: ["lc-naruto", "Naruto Shippuden"] },
  { id: 'lc-321', english: "One Piece", romaji: "One Piece", aliases: ["lc-onepiece"] },
  { id: 'lc-3632', english: "Dragon Ball Z", romaji: "Dragon Ball Z", aliases: ["lc-dbz", "DBZ"] },
  { id: 'lc-2478', english: "Black Clover", romaji: "Black Clover", aliases: ["lc-blackclover"] },
  { id: 'lc-3612', english: "Black Lagoon", romaji: "Black Lagoon", aliases: ["lc-blacklagoon"] },
  { id: 'lc-3418', english: "Cowboy Bebop", romaji: "Cowboy Bebop", aliases: ["lc-cowboybebop"] },
  { id: 'lc-3168', english: "Dororo", romaji: "Dororo", aliases: ["lc-dororo"] },
  { id: 'lc-956', english: "PSYCHO-PASS", romaji: "Psycho-Pass", aliases: ["lc-psychopass"] },
  { id: 'lc-3109', english: "Goblin Slayer", romaji: "Goblin Slayer", aliases: ["lc-goblinslayer"] },
  { id: 'lc-1481', english: "Drifters", romaji: "Drifters", aliases: ["lc-drifters"] },
  { id: 'lc-11916', english: "WIND BREAKER", romaji: "Wind Breaker", aliases: ["lc-windbreaker"] },
  { id: 'lc-10891', english: "Chained Soldier", romaji: "Mato Seihei no Slave", aliases: ["lc-chainedsoldier"] },
  { id: 'lc-11714', english: "Go! Go! Loser Ranger!", romaji: "Sentai Daishikkaku", aliases: ["lc-loserranger"] },
  { id: 'lc-10281', english: "Record of Ragnarok", romaji: "Shuumatsu no Valkyrie", aliases: ["lc-ragnarok"] },
  { id: 'lc-10754', english: "Record of Ragnarok II", romaji: "Shuumatsu no Valkyrie II", aliases: ["Record of Ragnarok 2"] },
  { id: 'lc-13083', english: "Record of Ragnarok III", romaji: "Shuumatsu no Valkyrie III", aliases: ["Record of Ragnarok 3"] },
  { id: 'lc-11088', english: "Baki Hanma", romaji: "Hanma Baki", aliases: ["lc-bakihanma"] },
  { id: 'lc-11380', english: "Baki Hanma Season 2", romaji: "Hanma Baki 2nd Season", aliases: ["Baki Hanma 2"] },
  { id: 'lc-4603', english: "The Founder of Diabolism", romaji: "Mo Dao Zu Shi", aliases: ["lc-modaozushi", "Grandmaster of Demonic Cultivation", "Mo Dao Zu Shi"] },
  { id: 'lc-scissor7', english: "Scissor Seven", romaji: "Cike Wu Liuqi", aliases: ["Killer 7"] },
  { id: 'lc-10083', english: "Scissor Seven Season 2", romaji: "Cike Wu Liuqi 2nd Season", aliases: ["Scissor Seven 2"] },
  { id: 'lc-10512', english: "JoJo's Bizarre Adventure: Stone Ocean", romaji: "JoJo no Kimyou na Bouken: Stone Ocean", aliases: ["lc-jojo6", "Stone Ocean"] },
  { id: 'lc-10156', english: "Horimiya", romaji: "Horimiya", aliases: ["lc-horimiya", "Hori-san to Miyamura-kun"] },
  { id: 'lc-9501', english: "ID: INVADED", romaji: "Id:Invaded", aliases: ["lc-idinvaded"] },
  { id: 'lc-1344', english: "Charlotte", romaji: "Charlotte", aliases: ["lc-charlotte"] },
  { id: 'lc-1280', english: "Death Parade", romaji: "Death Parade", aliases: ["lc-deathparade"] },
  { id: 'lc-2585', english: "DEVILMAN crybaby", romaji: "Devilman Crybaby", aliases: ["lc-devilman"] },
  { id: 'lc-3582', english: "Elfen Lied", romaji: "Elfen Lied", aliases: ["lc-elfenlied"] },
  { id: 'lc-3583', english: "Gurren Lagann", romaji: "Tengen Toppa Gurren Lagann", aliases: ["lc-gurrenlagann", "TTGL", "Tengen Toppa Gurren Lagann"] },
  { id: 'lc-784', english: "Overlord", romaji: "Overlord", aliases: ["lc-overlord"] },
  { id: 'lc-2574', english: "Overlord II", romaji: "Overlord II", aliases: ["Overlord 2"] },
  { id: 'lc-3206', english: "Overlord III", romaji: "Overlord III", aliases: ["Overlord 3"] },
  { id: 'lc-752', english: "Plastic Memories", romaji: "Plastic Memories", aliases: ["lc-plasticmemories"] },
  { id: 'lc-401', english: "Akame ga Kill!", romaji: "Akame ga Kill!", aliases: ["lc-akamegakill"] },
  { id: 'lc-3627', english: "The Future Diary", romaji: "Mirai Nikki", aliases: ["lc-futurediary", "Future Diary"] },
  { id: 'lc-12331', english: "Dragon Raja", romaji: "Long Zu", aliases: ["lc-dragonraja"] },
  { id: 'lc-11377', english: "Undead Unluck", romaji: "Undead Unluck", aliases: ["lc-undeadunluck"] },
  { id: 'lc-12917', english: "SAKAMOTO DAYS", romaji: "Sakamoto Days", aliases: ["lc-sakamoto"] },
  { id: 'lc-12697', english: "Gachiakuta", romaji: "Gachiakuta", aliases: ["lc-gachiakuta"] },
  { id: 'lc-12601', english: "ZENSHU", romaji: "Zenshuu.", aliases: ["lc-zenshu"] },
  { id: 'lc-12651', english: "Tougen Anki", romaji: "Tougen Anki", aliases: ["lc-tougenanki"] },
  { id: 'lc-11225', english: "Ninja Kamui", romaji: "Ninja Kamui", aliases: ["lc-ninjakamui"] },
  { id: 'lc-9563', english: "Kengan Ashura", romaji: "Kengan Ashura", aliases: ["lc-kenganashura"] },
  { id: 'lc-1580', english: "Kakegurui", romaji: "Kakegurui", aliases: ["lc-kakegurui"] },
  { id: 'lc-9984', english: "A Will Eternal", romaji: "Yi Nian Yong Heng", aliases: ["Yi Nian Yong Heng"] },
  { id: 'lc-9793', english: "Tower of God", romaji: "Kami no Tou: Tower of God", aliases: ["Tower of God"] },
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
    if (String(alias).toLowerCase().startsWith('lc-')) {
      BILINGUAL_ANIME_INDEX.set(String(alias).toLowerCase(), entry);
    }
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

    // Recover known broken LiveChart titles & supply English / Romaji titles (L7)
    const match = lookupBilingualTitle(item.title) || lookupBilingualTitle(item.id);
    if (match) {
      if (isBrokenTitle(item.title)) {
        item.title = match.english || match.romaji || item.title;
        changed = true;
      }
      if (match.english && !item.titleEnglish) {
        item.titleEnglish = match.english;
        changed = true;
      }
      if (match.romaji && !item.titleRomaji) {
        item.titleRomaji = match.romaji;
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
    // One-time purge of legacy auto-seeded library from pre-v5 versions
    if (!localStorage.getItem('omnichart_seed_purged_v5')) {
      localStorage.removeItem('omnichart_v4_items');
      localStorage.removeItem('omnichart_v3_items');
      localStorage.removeItem('omnichart_items');
      localStorage.setItem('omnichart_seed_purged_v5', 'true');
    }

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

function saveItems(shouldPushCloud = true, subset = null) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
  } catch (e) {}

  // Push to cloud if user is signed in or cloud sync is configured
  if (shouldPushCloud && typeof CloudSync !== 'undefined' && CloudSync.push) {
    CloudSync.push(subset ? (Array.isArray(subset) ? subset : [subset]) : state.items);
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

// ---------------------------------------------------------------------------
// Universal Library Importer (OmniChart JSON, MAL XML, AniList JSON) - Feature 5
// ---------------------------------------------------------------------------

function parseMalXml(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  const animeNodes = Array.from(doc.querySelectorAll('anime'));
  const items = [];

  const malStatusMap = {
    '1': 'Ongoing',
    '2': 'Completed',
    '3': 'On Hold',
    '4': 'Dropped',
    '6': 'Planning',
    'watching': 'Ongoing',
    'completed': 'Completed',
    'on-hold': 'On Hold',
    'dropped': 'Dropped',
    'plan to watch': 'Planning'
  };

  function reformatMalDate(dStr) {
    if (!dStr || dStr.startsWith('0000')) return '';
    const p = dStr.split('-');
    if (p.length === 3) {
      const y = parseInt(p[0], 10);
      const m = parseInt(p[1], 10);
      const d = parseInt(p[2], 10);
      if (y && m && d) return `${d}-${m}-${y}`;
      if (y && m) return `1-${m}-${y}`;
      if (y) return `1-1-${y}`;
    }
    return '';
  }

  for (const node of animeNodes) {
    const title = node.querySelector('series_title')?.textContent?.trim();
    if (!title) continue;
    const malId = node.querySelector('series_animedb_id')?.textContent?.trim() || Math.random().toString(36).slice(2, 8);
    const id = 'mal-' + malId;
    const type = (node.querySelector('series_type')?.textContent?.trim() || 'TV').toLowerCase();
    const isMovie = type.includes('movie');
    const category = isMovie ? 'Movies' : 'Series & Anime';
    const episodes = parseInt(node.querySelector('series_episodes')?.textContent, 10) || (isMovie ? 1 : 12);
    const watched = parseInt(node.querySelector('my_watched_episodes')?.textContent, 10) || 0;
    const rawScore = parseFloat(node.querySelector('my_score')?.textContent) || 0;
    const rawStatus = (node.querySelector('my_status')?.textContent || '').trim().toLowerCase();
    const status = malStatusMap[rawStatus] || 'Completed';

    const startDate = node.querySelector('my_start_date')?.textContent?.trim();
    const finishDate = node.querySelector('my_finish_date')?.textContent?.trim();
    let consumedDate = '';
    const sFmt = reformatMalDate(startDate);
    const fFmt = reformatMalDate(finishDate);
    if (sFmt && fFmt && sFmt !== fFmt) {
      consumedDate = `${sFmt} to ${fFmt}`;
    } else if (fFmt) {
      consumedDate = fFmt;
    } else if (sFmt) {
      consumedDate = sFmt;
    }

    const tagsRaw = node.querySelector('my_tags')?.textContent?.trim() || '';
    const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean) : [];
    const notes = node.querySelector('my_comments')?.textContent?.trim() || '';

    items.push({
      id,
      title,
      category,
      status,
      rating: rawScore,
      progress: status === 'Completed' ? Math.max(watched, episodes) : watched,
      totalUnits: episodes,
      unitName: isMovie ? 'movie' : 'eps',
      studio: 'Unknown Studio',
      releaseDate: 'TBA',
      consumedDate,
      genres: [],
      favorite: tags.some(t => t.toLowerCase() === 'favorite' || t.toLowerCase() === 'fav'),
      tags,
      image: '',
      synopsis: '',
      notes,
      updatedAt: Date.now()
    });
  }
  return items;
}

function parseAniListJson(data) {
  const rawList = [];
  if (Array.isArray(data)) {
    for (const item of data) {
      if (item.media || item.mediaId) rawList.push(item);
    }
  } else if (data?.data?.MediaListCollection?.lists) {
    for (const list of data.data.MediaListCollection.lists) {
      if (Array.isArray(list.entries)) rawList.push(...list.entries);
    }
  } else if (Array.isArray(data?.lists)) {
    for (const list of data.lists) {
      if (Array.isArray(list.entries)) rawList.push(...list.entries);
    }
  }

  const anilistStatusMap = {
    'CURRENT': 'Ongoing',
    'COMPLETED': 'Completed',
    'PAUSED': 'On Hold',
    'DROPPED': 'Dropped',
    'PLANNING': 'Planning',
    'REPEATING': 'Ongoing'
  };

  function fmtAniDate(obj) {
    if (obj && obj.year && obj.month && obj.day) {
      return `${obj.day}-${obj.month}-${obj.year}`;
    }
    return '';
  }

  return rawList.map(entry => {
    const m = entry.media || {};
    const titleEng = m.title?.english || '';
    const titleRom = m.title?.romaji || '';
    const title = titleEng || titleRom || m.title?.userPreferred || 'Untitled Media';
    const id = 'al-' + (m.id || entry.mediaId || Math.random().toString(36).slice(2, 8));
    const isMovie = m.format === 'MOVIE';
    const category = isMovie ? 'Movies' : 'Series & Anime';
    const status = anilistStatusMap[entry.status] || 'Completed';

    let rating = Number(entry.score || 0);
    if (rating > 10) rating = Number((rating / 10).toFixed(1));

    const totalUnits = Math.max(1, Number(m.episodes || (isMovie ? 1 : 12)));
    const progress = status === 'Completed' ? totalUnits : Number(entry.progress || 0);

    let consumedDate = '';
    const sStr = fmtAniDate(entry.startedAt);
    const cStr = fmtAniDate(entry.completedAt);
    if (sStr && cStr && sStr !== cStr) consumedDate = `${sStr} to ${cStr}`;
    else if (cStr) consumedDate = cStr;
    else if (sStr) consumedDate = sStr;

    const studioNodes = m.studios?.nodes || [];
    const animStudios = studioNodes.filter(n => n.isAnimationStudio).map(n => n.name);
    const allStudios = studioNodes.map(n => n.name);
    const studio = (animStudios.length ? animStudios : allStudios).slice(0, 2).join(', ') || 'Unknown Studio';

    const image = m.coverImage?.extraLarge || m.coverImage?.large || '';
    const synopsis = typeof cleanHtmlSynopsis === 'function' ? cleanHtmlSynopsis(m.description) : (m.description || '');

    return {
      id,
      title,
      titleEnglish: titleEng,
      titleRomaji: titleRom,
      category,
      status,
      rating,
      progress,
      totalUnits,
      unitName: isMovie ? 'movie' : 'eps',
      studio,
      releaseDate: (typeof formatSeasonYear === 'function') ? formatSeasonYear(m.season, m.seasonYear, m.startDate?.year) : (m.seasonYear ? String(m.seasonYear) : 'TBA'),
      consumedDate,
      genres: Array.isArray(m.genres) ? m.genres.slice(0, 4) : [],
      favorite: false,
      tags: Array.isArray(entry.customLists) ? entry.customLists.filter(Boolean) : [],
      image,
      synopsis,
      notes: entry.notes || '',
      updatedAt: entry.updatedAt ? entry.updatedAt * 1000 : Date.now()
    };
  });
}

function importLibraryJSON(file) {
  if (!OwnerMode.isOwner()) {
    if (typeof showToast === 'function') showToast('Read-Only mode: Enter owner passcode to import');
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const rawText = (reader.result || '').trim();
      let imported = [];
      let formatSource = 'OmniChart Backup';

      // 1. Detect MyAnimeList XML
      if (rawText.startsWith('<?xml') || rawText.includes('<myanimelist>') || rawText.includes('<anime>')) {
        imported = parseMalXml(rawText);
        formatSource = 'MyAnimeList';
      } else {
        // 2. Parse JSON
        const parsed = JSON.parse(rawText);

        // Check AniList format
        if (parsed?.data?.MediaListCollection || (Array.isArray(parsed) && parsed.some(x => x && (x.media || x.mediaId)))) {
          imported = parseAniListJson(parsed);
          formatSource = 'AniList';
        } else if (Array.isArray(parsed)) {
          imported = parsed;
          formatSource = 'OmniChart Backup';
        } else if (Array.isArray(parsed?.items)) {
          imported = parsed.items;
          formatSource = 'OmniChart Backup';
        } else {
          throw new Error('Unrecognized JSON format');
        }
      }

      if (!Array.isArray(imported) || imported.length === 0) {
        throw new Error('No valid entries found to import');
      }

      const byId = new Map(state.items.map((i) => [i.id, i]));
      const titleLookup = new Map(state.items.map((i) => [(i.title || '').toLowerCase().trim(), i]));

      for (const raw of imported) {
        if (!raw || !raw.title) continue;

        // Title deduplication check
        const cleanTitle = (raw.title || '').toLowerCase().trim();
        const existingByTitle = titleLookup.get(cleanTitle);

        const id = raw.id || existingByTitle?.id || ('imp-' + Math.random().toString(36).slice(2, 9));
        const rec = lookupBilingualTitle(id) || lookupBilingualTitle(raw.title);
        const recTitle = rec?.english || rec?.romaji || '';
        const recEng   = rec?.english || '';
        const recRom   = rec?.romaji || '';

        const recoveredTitle = isBrokenTitle(raw.title) && recTitle
          ? recTitle
          : raw.title;

        byId.set(id, {
          id,
          title:        recoveredTitle,
          titleEnglish: raw.titleEnglish || existingByTitle?.titleEnglish || recEng || '',
          titleRomaji:  raw.titleRomaji  || existingByTitle?.titleRomaji  || recRom || '',
          category:     raw.category || existingByTitle?.category || 'Series & Anime',
          status:       normalizeStatus(raw.status || existingByTitle?.status),
          rating:       Number(raw.rating ?? existingByTitle?.rating ?? 0),
          progress:     Number(raw.progress ?? existingByTitle?.progress ?? raw.totalUnits ?? 1),
          totalUnits:   Math.max(1, Number(raw.totalUnits || existingByTitle?.totalUnits || 12)),
          unitName:     raw.unitName || existingByTitle?.unitName || 'eps',
          studio:       raw.studio && raw.studio !== 'Unknown Studio' ? raw.studio : (existingByTitle?.studio || 'Unknown Studio'),
          releaseDate:  raw.releaseDate && raw.releaseDate !== 'TBA' ? raw.releaseDate : (existingByTitle?.releaseDate || 'TBA'),
          consumedDate: raw.consumedDate || existingByTitle?.consumedDate || '',
          genres:       Array.isArray(raw.genres) && raw.genres.length > 0 ? raw.genres : (existingByTitle?.genres || []),
          favorite:     Boolean(raw.favorite ?? existingByTitle?.favorite),
          tags:         Array.isArray(raw.tags) ? raw.tags : (existingByTitle?.tags || []),
          image:        raw.image || existingByTitle?.image || '',
          synopsis:     raw.synopsis || existingByTitle?.synopsis || '',
          notes:        raw.notes || existingByTitle?.notes || '',
          updatedAt:    raw.updatedAt || Date.now()
        });
      }

      state.items = Array.from(byId.values());
      saveItems();
      if (typeof renderAll === 'function') renderAll();
      if (typeof showToast === 'function') {
        showToast(`Imported ${imported.length} titles from ${formatSource}! Starting metadata enricher...`);
      }
      // Automatically enrich missing Studio, Synopsis, Release Date & Genres
      if (typeof enrichMissingMetadata === 'function') {
        enrichMissingMetadata(false);
      }
    } catch (err) {
      console.warn('[Importer Error]', err);
      if (typeof showToast === 'function') {
        showToast('Failed to import file. Make sure it is OmniChart JSON, MAL XML, or AniList JSON.');
      }
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
    return (OMNICHART_CONFIG.supabase?.url || '').trim();
  },

  getAnonKey() {
    return (OMNICHART_CONFIG.supabase?.anonKey || '').trim();
  },

  isConfigured() {
    return Boolean(this.getUrl() && this.getAnonKey());
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
            flowType: 'pkce',
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

      let rows = items.map((item) => ({
        id: item.id,
        user_id: state.user.id,
        title: item.title,
        title_english: item.titleEnglish || '',
        title_romaji: item.titleRomaji || '',
        category: item.category || 'Series & Anime',
        status: normalizeStatus(item.status),
        favorite: Boolean(item.favorite),
        tags: Array.isArray(item.tags) ? item.tags : [],
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

      let { error } = await client
        .from(OMNICHART_CONFIG.supabase.tableName)
        .upsert(rows, { onConflict: 'id,user_id' });

      // Graceful fallback if remote Supabase schema has not added optional columns yet
      if (error && (error.message?.includes('favorite') || error.message?.includes('tags') || error.message?.includes('title_english') || error.message?.includes('title_romaji'))) {
        const fallbackRows = rows.map(({ favorite, tags, title_english, title_romaji, ...rest }) => rest);
        const retry = await client
          .from(OMNICHART_CONFIG.supabase.tableName)
          .upsert(fallbackRows, { onConflict: 'id,user_id' });
        error = retry.error;
      }

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

  /** Delete multiple items from the cloud */
  async deleteItems(ids) {
    if (!state.user || !Array.isArray(ids) || ids.length === 0) return;
    const client = this.getClient();
    if (!client) return;
    try {
      this._lastLocalPushTime = Date.now();
      await client
        .from(OMNICHART_CONFIG.supabase.tableName)
        .delete()
        .in('id', ids)
        .eq('user_id', state.user.id);
    } catch (err) {
      console.warn('[CloudSync] Bulk delete exception:', err);
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
          status: normalizeStatus(row.status),
          rating: Number(row.rating || 0),
          progress: Number(row.progress || 0),
          totalUnits: Number(row.total_units || 12),
          unitName: row.unit_name || 'eps',
          studio: row.studio || 'Unknown Studio',
          releaseDate: row.release_date || 'TBA',
          consumedDate: row.consumed_date || '',
          genres: Array.isArray(row.genres) ? row.genres : [],
          favorite: Boolean(row.favorite),
          tags: Array.isArray(row.tags) ? row.tags : [],
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
  }
};

window.CloudSync = CloudSync;
window.OwnerMode = OwnerMode;
