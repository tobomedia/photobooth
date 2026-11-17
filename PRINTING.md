# Printing to a Canon Selphy CP750 from Android (via a Raspberry Pi 4)

The CP750 has no Wi‑Fi, only USB. A Raspberry Pi 4 plugged into it by USB shares it on your Wi‑Fi, and the Android booth tablet then sees it as an ordinary wireless printer. About 30–45 minutes to set up the first time; after that it's just "plug in and switch on".

```
Samsung tablet (booth) ──Wi‑Fi──▶ Raspberry Pi 4 ──USB──▶ Selphy CP750
```

## You need

- **Raspberry Pi 4 Model B** and a **USB‑C power supply, 5 V 3 A** (the official Raspberry Pi 4 supply is best; most phone chargers aren't enough and cause random restarts or Wi‑Fi drop‑outs).
- microSD card, 8 GB or more.
- **USB A‑to‑B cable** (the square "printer" plug) for the CP750's USB port, **not** the little PictBridge cable that pulls out of the printer.
- Selphy **KP‑108IN** paper + ink (Postcard size, 100×148 mm).
- A computer to write the SD card and type a few commands (your desktop PC or Mac).
- Optional: a case, ideally with a fan or heatsink. The Pi 4 runs warm.

## 1. Prepare the Pi

1. On your computer, install **Raspberry Pi Imager** (raspberrypi.com/software).
2. Device: **Raspberry Pi 4**. Operating system: **Raspberry Pi OS (other) → Raspberry Pi OS Lite (64‑bit)**. Storage: your SD card.
3. In the customisation step (**Edit settings** / **OS customisation**, depending on the Imager version):
   - Hostname: `photobooth-printer`
   - Username `pi` and a password you'll remember
   - Wi‑Fi: the network name and password the tablet will use **at the party**, and your country
   - SSH / Services: **Enable SSH** with password authentication
4. Write the card, put it in the Pi, plug in the power, wait about 2 minutes.

**Wi‑Fi:** the Pi 4 works on 2.4 GHz and 5 GHz; the Pi and the tablet just need to be on the **same network**. Guest or hotel Wi‑Fi that stops devices seeing each other won't work; use your own router or a phone hotspot instead (then put that hotspot's name in step 3).

## 2. Install the printer software

From your computer's terminal (Mac: Terminal; Windows: PowerShell):

```sh
ssh pi@photobooth-printer.local
```

Type `yes` if it asks about the fingerprint, then your password. Then, on the Pi:

```sh
sudo apt update
sudo apt install -y cups printer-driver-gutenprint avahi-daemon
sudo usermod -aG lpadmin pi
sudo cupsctl --share-printers --remote-admin --remote-any
sudo systemctl restart cups
```

This takes about 5–10 minutes on a Pi 4.

If `photobooth-printer.local` isn't found, look up the Pi's IP address in your router's list of devices and use `ssh pi@<that address>` instead.

## 3. Add the CP750

Connect the CP750 to one of the Pi's **black USB 2 ports** (not the blue USB 3 ones: they can interfere with the Pi's 2.4 GHz Wi‑Fi, and the printer doesn't need the speed). Load paper and ink, and switch the printer on.

Find the printer's address and its driver:

```sh
lpinfo -v | grep -i usb
lpinfo -m | grep -i cp750
```

You should see something like `usb://Canon/CP750?serial=…` and `gutenprint.5.3://canon-cp750/expert`. Add it, pasting your own two values in place of the examples:

```sh
sudo lpadmin -p Selphy -E \
  -v "usb://Canon/CP750?serial=XXXX" \
  -m "gutenprint.5.3://canon-cp750/expert" \
  -o printer-is-shared=true
```

Set Postcard paper as the default. List the sizes the driver offers, then pick the 100×148 mm / Postcard one:

```sh
lpoptions -p Selphy -l | grep -i pagesize
sudo lpadmin -p Selphy -o PageSize=Postcard   # use the exact name from the list
```

Test print (any photo will do):

```sh
wget -O test.jpg https://picsum.photos/1000/1480
lp -d Selphy -o fit-to-page test.jpg
```

If the CP750 doesn't print, try the CP520 driver instead (`lpinfo -m | grep -i cp520`, then repeat `lpadmin` with that model). Some people find it works better for the CP7xx series.

## 4. Connect the Samsung tablet

1. Join the same Wi‑Fi as the Pi.
2. **Settings → Connections → More connection settings → Printing** (or search Settings for *Printing*). Turn on **Default Print Service**. *Selphy @ photobooth-printer* should appear within a minute.
   - Not there? Install **Mopria Print Service** from the Play Store and switch it on in the same Printing screen. Or in Default Print Service tap ⋮ → **Add printer** → **Add printer by IP address** and enter the Pi's IP (run `hostname -I` on the Pi).
3. Open the booth → Host panel → **Printing**: switch on *Show a Print button* and choose **4×6″ photo paper**.
4. Take a test Turn → **Print** → pick *Selphy* and paper size **Postcard** → Print. Android remembers both next time.

Expect about 15–30 seconds for the Pi to prepare the print, then about a minute in the Selphy.

## On the day

- Plug in the Pi and switch on the Selphy **before** opening the booth; give the Pi 2 minutes to start.
- Keep the Pi somewhere with a bit of airflow, not under a tablecloth.
- One KP‑108IN pack = 108 prints; keep a spare ink cassette and paper handy.
- If prints stop: check the Selphy's screen (out of paper/ink, paper jam), switch it off and on, then print again.
- The print queue is at `http://photobooth-printer.local:631` from any browser on the same Wi‑Fi: you can see and cancel stuck jobs there.
- To turn the Pi off safely afterwards: `ssh` in and run `sudo poweroff`, wait for the green light to stop flashing, then unplug.

## Plan B

Your desktop PC or Mac can do the Pi's job: connect the CP750 by USB, install the driver (Mac: Gutenprint; Windows: Canon's CP750 driver, if there's one for your Windows version), and turn on printer sharing. The PC then has to stay on and nearby during the party, so the Pi is usually tidier.
