# OmniChart 📖✨

> **A LiveChart.me-inspired media tracker and rating app** featuring a **60-30-10 Gunmetal & Amber** palette (`#0d0e11` base, `#2c3539` gunmetal secondary, and `#ff9f1c` vibrant amber accents), AniList GraphQL auto-enrichment, DD-MM-YYYY Date/Range calendar scheduling, Mass Removal bulk cleanup, and seamless Cloud Sync readiness.

[![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/HTML)
[![CSS3](https://img.shields.io/badge/CSS3-1572B6?logo=css3&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/CSS)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-CDN-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![PWA Ready](https://img.shields.io/badge/PWA-Installable-5A0FC8?logo=pwa&logoColor=white)](manifest.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 🌟 Highlights

- **🎯 Zero-Build Architecture**: Runs instantly in any modern web browser or static web host (GitHub Pages, Vercel, Netlify) with zero compilation or bundlers.
- **🏷️ Interactive Pop-Out Genre Engine**: Real-time typing auto-detection, autofill autocomplete, custom genre creation, prelisted popular genres across Anime, Movies, Games & Books, and interactive click-to-filter genre chips on media cards.
- **🗂️ Dedicated Genre Explorer View**: Browse your media library grouped by genres with a quick-jump scrollbar, multi-attribute sorting (Most Titles, Highest Rated, A → Z), live search filtering, genre-level metrics (title count, average star rating, completed count), and instant "View in Library" jump buttons.
- **⚡ Dual-Engine Auto-Search**: Progressively streams results in real time from **AniList GraphQL** (for Anime & Manga) and **Wikipedia REST API** (for Movies, Games & Books).
- **🪄 One-Click Batch Enricher**: Background crawler that automatically queries AniList to auto-fill missing Studios, Release Seasons, Genres, Synopses, Episode counts, and High-Res Cover Art across your entire library.
- **📅 Full DD-MM-YYYY Calendar View**: Supports both single completion days (`DAY`) and multi-day date spans (`START` & `END` with `DD-MM-YYYY to DD-MM-YYYY` syntax) with logged-month quick jumps and single-click date entry.
- **📊 Clean Media Lifecycle Tabs**: Track entries across **Ongoing**, **Completed**, **On Hold**, **Planning**, and **Dropped** with real-time counters and filter tabs.
- **🗑️ Mass Removal & Clean-Up**: Built-in bulk operations with dedicated filters to find placeholder titles (`TV (JP)Released`), unrated entries, or wipe/restore cleanly.
- **🔐 Owner Mode vs. Public Read-Only**: Designed for GitHub portfolio showcases — allows public visitors to browse, search, and view your catalog while requiring an Owner Passcode (`?owner=...`) to edit or delete entries.
- **☁️ Plug-and-Play Cloud Sync**: Pre-configured stubs and data adapters for **Supabase** (Postgres + Realtime) and **Firebase Firestore**.

---

## 🎨 Design System (60-30-10 Rule)

OmniChart adheres strictly to the classic 60-30-10 interior and UI design principle:

```
┌────────────────────────────────────────────────────────┐
│ 60% Dominant Base: #0d0e11 (Deep Obsidian Canvas)     │
│ 30% Structural Secondary: #2c3539 (Gunmetal Surfaces)  │
│ 10% Energetic Accent: #ff9f1c (Vibrant Amber Focus)    │
└────────────────────────────────────────────────────────┘
```

| Token | Hex Value | Semantic Role in UI |
|-------|-----------|----------------------|
| `--bg-base` | `#0d0e11` | Body background, input fields, image fallback badges |
| `--bg-sec` | `#2c3539` | Navigation header, media card background, modal bodies |
| `--bg-sec-hover`| `#364146` | Interactive hover states, secondary action buttons |
| `--border-sec` | `#3d494f` | Card borders, dividers, subtle separators |
| `--accent` | `#ff9f1c` | Active category/status pills, star ratings, CTA buttons |
| `--accent-hover`| `#ffb144` | Button active / press highlight |

---

## 📁 Modular Project Structure

```
OmniChart/
├── index.html          # Lightweight semantic HTML shell & modal overlays
├── manifest.json       # PWA manifest with Black Tome inline vector icons
├── README.md           # Portfolio documentation & cloud setup guide
├── css/
│   └── styles.css      # CSS variables, custom scrollbars, and core reset
└── js/
    ├── sync.js         # Persistence, CloudSync stubs, Owner Mode & recovery map
    ├── api.js          # AniList GraphQL + Wikipedia auto-search & batch enricher
    └── app.js          # UI rendering engine, filters, calendar & event delegation
```

### Script Execution & Dependency Chain

```
index.html
   ├── css/styles.css   (Design tokens & styling)
   ├── js/sync.js       (Data store, state, localStorage, CloudSync, OwnerMode)
   ├── js/api.js        (AniList & Wikipedia search / metadata enrichment)
   └── js/app.js        (UI renderers, event delegation, app bootstrap)
```

---

## 🚀 Quick Start

### Option 1: Double-Click or Static Host
Simply open [`index.html`](file:///c:/Projects/OmniChart/index.html) in any web browser.

### Option 2: Local HTTP Server
```bash
# Python 3
python -m http.server 8000

# Node.js
npx serve .
```
Navigate to `http://localhost:8000`.

### Option 3: Deploy to GitHub Pages
1. Push this repository to GitHub.
2. Go to **Settings** → **Pages**.
3. Under **Build and deployment**, select **Source: Deploy from a branch** and choose `main` / `/ (root)`.
4. Click **Save**. Your tracker is live within seconds!

---

## 🔐 Owner Mode vs. Public Read-Only Showcase

When hosting OmniChart as a public portfolio, you can lock editing capabilities for anonymous visitors while keeping full access for yourself.

### How to Enable Owner Protection

In [`js/sync.js`](file:///c:/Projects/OmniChart/js/sync.js):

```javascript
const OMNICHART_CONFIG = {
  ownerModeEnabled: true,          // Enable protection for public deployment
  ownerPasscode: 'mySecretKey123', // Your private passcode
  // ...
};
```

### Accessing Owner Mode
- **Via URL**: Simply append `?owner=mySecretKey123` to your site URL. OmniChart will remember your session in `localStorage`.
- **Via UI**: Click the `👁️ Public View` badge in the top navigation bar and enter your passcode.
- **Locking**: Click `👑 Owner` in the top bar to lock your session back to read-only view.

---

## ☁️ Cross-Device Cloud Sync Setup

OmniChart provides a clean, pre-built abstraction layer in `js/sync.js`. Follow either guide below to synchronize your media tracker across your phone, tablet, and PC.

### 🐘 Option A: Supabase (Recommended)

1. **Add the Supabase CDN script** to `index.html` inside the `<head>`:
   ```html
   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
   ```

2. **Execute the SQL Table Creation script** in your Supabase SQL Editor:
   ```sql
   CREATE TABLE public.omnichart_items (
       id TEXT PRIMARY KEY,
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
       updated_at BIGINT DEFAULT (extract(epoch from now()) * 1000)
   );

   -- Enable Row Level Security
   ALTER TABLE public.omnichart_items ENABLE ROW LEVEL SECURITY;

   -- Allow anyone to read items (for public showcase)
   CREATE POLICY "Allow public read" ON public.omnichart_items
       FOR SELECT USING (true);

   -- Allow insert/update/delete with anon key
   CREATE POLICY "Allow write access" ON public.omnichart_items
       FOR ALL USING (true);
   ```

3. **Configure credentials** in [`js/sync.js`](file:///c:/Projects/OmniChart/js/sync.js):
   ```javascript
   const OMNICHART_CONFIG = {
     cloudProvider: 'supabase',
     supabase: {
       url: 'https://YOUR_PROJECT_ID.supabase.co',
       anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
       tableName: 'omnichart_items'
     }
   };
   ```

### 🔥 Option B: Firebase Firestore

1. **Add Firebase SDK** to `index.html`:
   ```html
   <script src="https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js"></script>
   <script src="https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore-compat.js"></script>
   ```

2. **Set configuration** in [`js/sync.js`](file:///c:/Projects/OmniChart/js/sync.js):
   ```javascript
   const OMNICHART_CONFIG = {
     cloudProvider: 'firebase',
     firebase: {
       apiKey: "AIzaSy...",
       projectId: "your-project-id"
     }
   };
   ```

---

## 📱 Progressive Web App (PWA) Installation

OmniChart includes a complete [`manifest.json`](file:///c:/Projects/OmniChart/manifest.json) featuring custom inline SVG **Black Tome** icons:
- **iOS Safari**: Tap the Share button → **Add to Home Screen**.
- **Android Chrome**: Tap the three dots menu → **Install OmniChart** or **Add to Home screen**.
- **Desktop Chrome / Edge**: Click the Install icon in the browser address bar.

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for details.
