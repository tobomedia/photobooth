# Photobooth

A browser-based photo booth that captures four photos and composes them into a single printable image.

## Language

**Guest**:
Anyone at the **Event** who uses the booth. Guests only ever start **Turns** and view **Grids**.
_Avoid_: User, customer

**Host**:
The person running the booth for the **Event**; the only one who can **Export**, clear, or switch printing on and off.
_Avoid_: Admin, owner, operator

**Photo**:
One captured frame from the camera. A **Grid** contains exactly four.
_Avoid_: Shot, picture, snap, frame

**Turn**:
One guest group's single run through the booth: one tap to start, four countdowns, four **Photos**, ending in one **Grid**.
_Avoid_: Session, round, go

**Grid**:
The single combined image of four **Photos** arranged 2×2; the thing that is displayed and printed.
_Avoid_: Collage, strip, sheet, montage

**Event**:
The party the booth is used at, and the set of all **Grids** captured during it. There is only ever one current Event.
_Avoid_: Party, session, album, gallery

**Export**:
Handing every **Grid** in the current **Event** off the device in one go, so they can be shared and printed after the party.
_Avoid_: Download, backup, sync
