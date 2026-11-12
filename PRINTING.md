# Printing to a Canon Selphy CP750 from Android (via a Raspberry Pi)

The CP750 has no Wi‑Fi, only USB. A Raspberry Pi plugged into it by USB shares it on your Wi‑Fi, and the Android booth device then sees it as an ordinary wireless printer. About an hour to set up the first time; after that it's just "plug in and switch on".

```
Android booth ──Wi‑Fi──▶ Raspberry Pi ──USB──▶ Selphy CP750
```

## You need

- Raspberry Pi with Wi‑Fi (Pi 3, 4, 5 or Zero 2 W) and its power supply. A Pi Zero also needs a micro‑USB OTG adapter for the printer cable.
- microSD card (8 GB or more).
- USB A‑to‑B cable (the square "printer" plug) for the CP750's USB port, **not** the little PictBridge cable that pulls out of the printer.
- Selphy KP‑108IN paper + ink (Postcard size, 100×148 mm).
- A computer to flash the SD card and type a few commands (your desktop PC or Mac is fine).

## 1. Prepare the Pi

1. On your computer, install **Raspberry Pi Imager** (raspberrypi.com/software).
2. Choose your Pi model → **Raspberry Pi OS Lite (64‑bit)** (32‑bit for a Pi Zero / Pi 2) → your SD card.
3. When it asks to customise settings (**Edit settings**):
   - Hostname: `photobooth-printer`
   - Username `pi` and a password you'll remember
   - Wi‑Fi: the network name and password the booth phone will use **at the party**
   - Services tab: **Enable SSH** (password authentication)
4. Write the card, put it in the Pi, power it on, wait ~2 minutes.

## 2. Install the printer software

From your computer's terminal (Mac: Terminal; Windows: PowerShell):

```sh
ssh pi@photobooth-printer.local
```

Then, on the Pi:

```sh
sudo apt update
sudo apt install -y cups printer-driver-gutenprint avahi-daemon
sudo usermod -aG lpadmin pi
sudo cupsctl --share-printers --remote-admin --remote-any
sudo systemctl restart cups
```

## 3. Add the CP750

Connect the CP750 to the Pi with the USB cable, load paper and ink, and switch it on.

Find the printer's address and its driver:

```sh
lpinfo -v | grep -i usb
lpinfo -m | grep -i cp750
```

You should see something like `usb://Canon/CP750?serial=…` and `gutenprint.5.3://canon-cp750/expert`. Add it (paste your own two values in place of the examples):

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

## 4. Connect the Android booth device

1. Same Wi‑Fi as the Pi.
2. Settings → search **Printing** → turn on **Default Print Service**. *Selphy @ photobooth-printer* should appear within a minute.
   - Not there? Install **Mopria Print Service** from the Play Store and switch it on, or in Default Print Service tap ⋮ → **Add printer** → **Add printer by IP address** and enter the Pi's IP (run `hostname -I` on the Pi).
3. Open the booth → Host panel → **Printing**: switch on *Show a Print button* and choose **4×6″ photo paper**.
4. Take a test Turn → **Print** → pick *Selphy* and paper size **Postcard** → Print. Android remembers both next time.

## On the day

- Plug in the Pi and switch on the Selphy **before** opening the booth; give the Pi 2 minutes to start.
- Each Selphy print takes about a minute. One KP‑108IN pack = 108 prints; keep a spare ink cassette and paper handy.
- If prints stop: check the Selphy's screen (out of paper/ink, paper jam), switch it off and on, then print again.
- The Pi's print queue is at `http://photobooth-printer.local:631` from any browser on the same Wi‑Fi: you can see and cancel stuck jobs there.

## Plan B

Your desktop PC or Mac can do the Pi's job: connect the CP750 by USB, install the driver (Mac: Gutenprint; Windows: Canon's CP750 driver, if there's one for your Windows version), and turn on printer sharing. The PC then has to stay on and nearby during the party, so the Pi is usually tidier.
