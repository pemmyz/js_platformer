# js_platformer

# 🎮 Planck.js Platformer

A browser-based 2D platformer built using **Planck.js** physics engine.  
Features classic platformer mechanics, 2-player support, and an infinite procedural mode.

## Play it now: https://pemmyz.github.io/js_platformer/

---

## 🚀 Features

- 🧱 Physics-based gameplay using Planck.js
- 👥 Local 2-player mode (keyboard)
- 🗺️ Two game modes:
  - **Original Map** (hand-crafted level)
  - **Procedural Map** (infinite generation)
- 📱 Mobile-friendly with touch controls
- 🖥️ Fullscreen scaling support
- 🎯 Score, coins, lives, and timer system
- 👾 Enemies, blocks, and power-ups

---

## 🎮 Controls

### Player 1
- Move: Arrow Left / Right
- Jump: Arrow Up

### Player 2
- Move: A / D
- Jump: W

### Mobile
- On-screen touch controls (auto-enabled in fullscreen mode)

---

## 🧠 Gameplay

- Jump on enemies to defeat them
- Hit question blocks to collect coins
- Collect 100 coins to gain an extra life
- Avoid falling into pits
- Survive as long as possible in procedural mode

---

## 📦 Project Structure

```
project/
│── index.html   # Main HTML file
│── style.css    # Styling and layout
│── script.js    # Game logic
```

---

## ▶️ How to Run

1. Download or clone the project
2. Open `index.html` in your browser

No build tools or installation required.

---

## ⚙️ Dependencies

- [Planck.js](https://github.com/shakiba/planck.js) (loaded via CDN)

---

## 📱 Mobile Mode

- Click **📱 Fullscreen / Mobile** button
- Game scales to screen
- Touch controls become active

---

## 🧩 Technical Notes

- Uses fixed internal resolution: **800x450**
- Physics timestep: **1/60**
- Pixel-to-meter ratio: **32 PPM**
- Procedural generation creates chunks dynamically
- Old objects are garbage-collected for performance

---

## 💡 Future Ideas

- Sound effects & music
- More enemy types
- Power-ups (mushrooms, speed boost, etc.)
- Multiplayer online support
- Save system

---

## 📜 License

MIT License

---

## 👤 Author

Your project 🚀
