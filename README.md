# Photobooth

A browser photo booth for a party. Guests tap **Start**, get four countdowns, and the four Photos become one 2×2 **Grid** that's shown on screen and saved on the device. After the party, the Host exports every Grid to Google Photos (or a zip). Vocabulary lives in [CONTEXT.md](CONTEXT.md).

No build step, no dependencies: plain HTML/CSS/JS.

## Try it on your computer

```sh
python3 -m http.server 8000
```

Open <http://localhost:8000> in Chrome or Safari and allow the camera. (The camera only works on `localhost` or `https://` — opening `index.html` as a file won't work.)

## Put it online (GitHub Pages)

1. Create a GitHub repo and push these files to it.
2. Repo → **Settings → Pages** → Source: *Deploy from a branch*, branch `main`, folder `/ (root)`.
3. After a minute it's live at `https://<your-username>.github.io/<repo-name>/`.

When you change files later, bump `VERSION` in `sw.js` so devices fetch the new version instead of the cached one.

## Using it

| Who | What |
| --- | --- |
| Guest | Tap **Start** → 4 countdowns → Grid stays on screen until **Done** → back to Start. |
| Guest or Host | Tap **▦ Grids** (bottom right) to see every Grid taken so far, newest first. Tap one to see it full size. Closes itself after a minute of no touches. |
| Host | **Press and hold the top-left corner for 3 seconds** to open the Host panel. |

**Host panel**

- **Share Grids 1–30, 31–60, …** — opens the share sheet; pick Google Photos (or "Save Images"). Done in batches because some phones limit how many files one share can carry. A ✓ marks batches already shared.
- **Download all as zip** — fallback if sharing doesn't work.
- **Grid style** — text printed under the Photos (e.g. names and occasion), its font, an optional date, the background colour, and a background pattern (plain, gradient, dots, stripes, hearts or confetti). Text is black or white automatically to suit the colour. A small preview shows the result. Changes apply to the next Turn.
- **Props** — speech bubbles, glasses & moustache, crown, party decorations, hearts, or *Mix* (a different set on each Photo). They show over the live camera so guests can line up with them, and are saved in the Photos. Edit the speech bubble phrases (one per line). Switch on *Let guests choose props* to show a row of prop buttons on the start screen; it goes back to the Host's choice after each Turn.
- **Camera** — **Front** (default) or **Back**. Remembered on the device. If the back camera won't start, the booth goes back to the front one and says why. Front is mirrored; back isn't.
- **Backup** — when on (default on Android/desktop, off on iPhone), each Grid is also downloaded to the device's Downloads folder as it's taken, so a copy survives even if the browser's storage is cleared. On Android it shows up in Google Photos / Gallery.
- **Printing** — when on, a **Print** button appears after each Turn and prints 4 copies of the Grid on one A4 portrait sheet with cut lines. Someone has to tap through the phone's print dialog.
- **Clear & start new Event** — deletes every Grid on the device. Needs a second tap, and warns if anything hasn't been exported.

Timings, Photo size, Grid borders and the default colour are in `CONFIG` at the top of `js/app.js`.

## Before the party checklist

- [ ] Open the GitHub Pages link on the booth device and allow the camera.
- [ ] Add it to the home screen (iPhone: Share → *Add to Home Screen*; Android: ⋮ → *Install app*) and open it from there.
- [ ] Do a test Turn, then open the Host panel and check it counts 1 Grid.
- [ ] Check the backup copy of the test Grid is in Downloads / Gallery. If Chrome asks to allow multiple downloads, tap **Allow**.
- [ ] Test **Share** once to Google Photos so you know it works — then **Clear** the test Grids.
- [ ] If printing: connect the printer to Wi-Fi, switch printing on in the Host panel, and print one test sheet.
- [ ] Plug the device in. Turn off auto-lock (iPhone: Settings → Display → Auto-Lock → Never).
- [ ] Lock it into the app:
  - **iPhone:** Settings → Accessibility → Guided Access → On. In the app, triple-click the side/home button → Start.
  - **Android:** Settings → Security → App pinning → On. Open Recents, tap the app's icon → Pin.
- [ ] Mount it upright (portrait) at about face height, a step or two back from where guests stand.

## After the party

1. Unlock the device (triple-click again / unpin).
2. Open the Host panel → share each batch to Google Photos (or download the zip).
3. Check the album, then **Clear** if you'll reuse the booth.

If the app itself won't open, see [Rescuing Grids from browser storage](#rescuing-grids-from-browser-storage).

Do this the same night or next morning — browser storage can be cleared by the system if the app sits unused for weeks.

## Rescuing Grids from browser storage

Grids live in the browser's IndexedDB (database `photobooth`, store `grids`), not in the Gallery. Normally you get them out with the Host panel. If the app is broken and the Host panel won't open:

1. Plug the Android device into a computer with USB. On the device turn on **Developer options → USB debugging**.
2. On the computer open Chrome at `chrome://inspect#devices`, find the booth page and click **inspect**.
3. In the **Console** tab paste this and press Enter. Each Grid downloads to the device's Downloads folder:

```js
const db = await new Promise((ok, no) => { const r = indexedDB.open('photobooth'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
const grids = await new Promise((ok) => { const r = db.transaction('grids').objectStore('grids').getAll(); r.onsuccess = () => ok(r.result); });
for (const g of grids) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([g.data], { type: g.type || 'image/jpeg' }));
  a.download = `grid-${g.id}.jpg`;
  a.click();
  await new Promise((r) => setTimeout(r, 300));
}
console.log(`Downloaded ${grids.length} Grids`);
```

On a computer browser, open DevTools directly (F12) and do step 3.
