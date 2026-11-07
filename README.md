# Bible Henyo — Personal GitHub Pages PWA

A small installable, offline-first, one-word Bible guessing game for Android and iPhone.

## Publish ONLY to your personal GitHub

1. Sign in to your **personal** GitHub account (check the profile avatar/account in GitHub).
2. Create a **new personal repository** named `bible-henyo` (not under Oon Jai or another organization).
3. Upload everything in this folder to the repository root.
4. Open **Settings → Pages → Build and deployment → Deploy from a branch → main / (root) → Save**.
5. Your app will normally be available at `https://YOUR-PERSONAL-USERNAME.github.io/bible-henyo/` once GitHub Pages builds it.
6. Android: install using browser's Install app. iOS: Safari → Share → Add to Home Screen.

## What's implemented
- Full-screen landscape-first game, large single words, level selection, shuffled word deck, persistent seen-word history
- Per-word and full-round timer, correct/pass scores, round summary, pause, haptic/sound cues
- Two-word onboarding trial, motion permission and neutral calibration, threshold/reversal settings
- Touch fallback and optional remote host control using Supabase Realtime
- Offline service worker, PWA manifest and icons

## Limitations and testing
- Word library is a starter collection, NOT the promised 10,000 verified Bible entries. `words.js` contains the bundled entries; the page displays the actual deduplicated count. Reaching 10,000 authentic, distinct, playable single-token biblical words requires ongoing verified editorial work, and may not be feasible without accepting extremely obscure vocabulary and variants. All current entries are candidates and have NOT been individually proof-checked against Bible text.
- Browser motion access needs HTTPS and user permission. iOS Safari cannot be relied upon to force landscape lock, so turn the physical phone manually.
- For normal local gameplay, network is not required once offline files are cached.
- The **remote host** option needs both phones connected to the internet and a **separate personal** Supabase project with public Realtime Broadcast enabled. In settings enter its project URL and **publishable/anon** key. Never enter a secret/service-role key. The game makes an unguessable-ish six-character room code and shows a pairing URL on the player screen; open that URL on the host phone. Rooms are publicly addressable by code and are not suitable for sensitive data. There is no user login or room authentication.
- Host remote is an optional proof-of-concept, not yet end-to-end tested on two physical phones. The word list is public and any connected host can see it.
- Test iOS motion permission, tilt direction, landscape, timer and installation on real devices before broad distribution.

## Technical details
Vanilla HTML/CSS/JavaScript, with no build step. `sw.js` precaches local assets and does not cache any remote script. The only external library is loaded lazily if remote mode is selected. All solo-mode word data ships locally.
