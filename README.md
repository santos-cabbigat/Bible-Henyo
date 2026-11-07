# Bible Henyo — Personal GitHub Pages PWA

A small installable, offline-first, one-word Bible guessing game for Android and iPhone.

Play at https://santos-cabbigat.github.io/Bible-Henyo/. GitHub Pages serves the root of the `gh-pages` branch.

## Two phones

Open the same game on both phones. Choose the timer and difficulty on the player phone and tap **Create game**. On the other phone, tap **Join as remote** and enter the game ID, or open the shared invitation. Either phone can start the round. The remote can mark Correct or Pass, pause, resume and start another round. Keep the player phone open. Internet access is required on both phones.

Only two-phone mode contacts the dedicated Bible Henyo room service. The player owns the game state. The temporary room stores its current word, timer, scores and pending command. Each phone receives a separate session token. Leaving on the player phone closes the room. Inactive rooms expire.

## Tilt controls

Hold the phone in landscape at forehead height. With practice disabled, **Start with tilt** sets neutral and starts the timer after a sensor reading. Tilt up for Correct, down for Pass, and return to neutral for the next word. Practice can learn the direction for your device. To reset your holding angle mid-round, pause and tap **Set neutral here & resume**.

## What's implemented
- Full-screen landscape-first game, large single words, level selection, shuffled word deck, persistent seen-word history
- Per-word and full-round timer, correct/pass scores, round summary, pause, haptic/sound cues
- Two-word onboarding trial, motion permission and neutral calibration, threshold/reversal settings
- Touch fallback and optional remote host control using a shared game ID
- Offline service worker, PWA manifest and icons

## Limitations and testing
- Word library is a starter collection, NOT the promised 10,000 verified Bible entries. `words.js` contains the bundled entries; the page displays the actual deduplicated count. Reaching 10,000 authentic, distinct, playable single-token biblical words requires ongoing verified editorial work, and may not be feasible without accepting extremely obscure vocabulary and variants. All current entries are candidates and have NOT been individually proof-checked against Bible text.
- Browser motion access needs HTTPS and user permission. iOS Safari cannot be relied upon to force landscape lock, so turn the physical phone manually.
- For normal local gameplay, network is not required once offline files are cached.
- Test iOS motion permission, tilt direction, landscape, timer and installation on real devices before broad distribution.

## Technical details
Vanilla HTML/CSS/JavaScript, with no build step. `sw.js` precaches local assets and does not cache any remote script. All solo-mode word data ships locally.
