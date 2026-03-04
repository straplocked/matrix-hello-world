# Matrix Hello - User Guide

## What Is This?

Matrix Hello is an interactive web visualization inspired by the Matrix films. It displays cascading digital rain characters on a simulated CRT television screen. The page responds to your mouse and device movement with physics-based effects.

## Boot Sequence

When you first load the page, you'll see a CRT television powering on:
1. A green power LED lights up on the frame
2. A thin horizontal beam line appears and flickers
3. The beam expands to fill the screen
4. A brief phosphor flash, then the Matrix rain is revealed

This takes about 2 seconds and plays automatically.

## Interactions

### Mouse Controls

| Action | How | Effect |
|--------|-----|--------|
| **Move** | Move mouse anywhere | Rain bends away from cursor, parallax shifts, screen tilts |
| **Click** | Single left-click | Drops a "stone" into the rain — creates expanding ripple waves |
| **Double-click** | Double left-click | Burst of 60 matrix characters exploding from click point |
| **Hold** | Press and hold (~180ms) | Freezes all rain in place with glitch effects. Release to unfreeze |
| **Cross text** | Move mouse over [WAKE UP] | Text shatters like a bullet impact, then reassembles with Matrix decode effect |

### Mobile/Tablet

- Tilting your device shifts the parallax layers and tilts the perspective (uses gyroscope)
- Touch interactions map to click/hold behaviors

### Visual Hints

Small hints appear at the bottom of the screen after boot:
```
// click: ripple    // double-click: burst    // hold: freeze
```

## Visual Effects

- **Digital Rain**: Cascading katakana, Latin, and symbol characters in green on black
- **CRT Frame**: Dark bezel border with realistic depth shadows and a pulsing green power LED
- **Scanlines**: Horizontal line pattern overlay simulating a CRT display
- **Scanline Sweep**: A faint bright bar sweeps vertically across the screen every 6 seconds
- **Phosphor Dots**: Subtle RGB sub-pixel pattern simulating CRT phosphor triads
- **Vignette**: Darkened corners simulating curved CRT glass
- **Screen Curvature**: Rounded edges on the display area
- **Parallax**: Text and rain layers shift at different speeds creating depth
- **3D Tilt**: The entire scene tilts slightly based on mouse position, like peering into a monitor
- **LED Flicker**: The power LED randomly flickers every few seconds

## Typewriter Messages

Below the main text, a terminal-style typewriter cycles through messages:
- `> follow the white rabbit`
- `> there is no spoon`
- `> the construct is real`
- `> free your mind`
- `> knock knock, neo`
- `> the matrix has you`

## Browser Requirements

- **Recommended**: Chrome, Firefox, Edge (latest versions)
- **Required**: WebGL support (virtually all modern browsers)
- **Screen**: Works on any size; responsive via CSS `clamp()` values
- **Performance**: GPU-accelerated; runs at 60fps on modern hardware

## Accessing the Page

- **Production**: `http://localhost:3001`
- The page requires no login, no cookies, and collects no data
