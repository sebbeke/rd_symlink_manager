# Real-Debrid Symlink  + RD Unrestrict Downloader  
**All-in-One Solution for (Movies|Anime|Shows) - Direct Media Server Integration with Multi-Path Support**

[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](https://docs.docker.com)
[![Userscript](https://img.shields.io/badge/Tampermonkey-Supported-yellow.svg)](https://www.tampermonkey.net/)

## Features

### 1. Frontend Userscript (Tampermonkey/Violentmonkey)
🎮 **Floating Control Center**  
- 🖱️ Real-Debrid Icon with Status Indicators (Instant color changes for RD connectivity/symlink status)
- 🎥 Auto-Video Detection: Smart file size analysis for optimal caching
- 🚀 One-Click Actions:
  - `Cache Only`: Direct Real-Debrid cloud caching
  - `Cache + Symlink`: Full pipeline (Cache → Clean filenames → Symlink → Media Server Scan)
- 📌 Persistent Tracking: Visual indicators for previously handled content

### 2. Task Manager+ Dashboard
📊 **Centralized Download Control**  
- 🕹️ Live Monitoring:
  - Real-time download speeds
  - Symlink creation status
  - Error tracking with auto-retry
- 🔄 Smart Queue Management:
  - Concurrent task throttling (`MAX_CONCURRENT_TASKS`)
  - Status filters: Downloading | Symlinking | Completed
- 💾 Data Portability:
  - Export/import task history
  - Cross-browser session persistence
- 🧹 Maintenance Tools:
  - Bulk task removal
  - Cloud+Local cleanup (RD deletion + symlink removal)

### 3. Backend Engine
⚙️ **Automated Processing Core**  
- 🔄 Dual Mode Operation:
  - `Symlink Mode`: Instant media server-ready links
  - `Download Mode`: Full-file downloads from RD unrestrict links
- 🧼 Content Sanitization:
  - Automated bad word removal (`REMOVE_WORDS` list)
  - Filename pattern standardization
- 🎬 Media Server Integration:
  - Multi-path symlink support
  - Instant Plex/Emby/Jellyfin library scans
- 📈 Performance Features:
  - Multi-instance support (different ports)
  - Docker-ready configuration

## 📥 Userscript Installation Guide

### 1. Browser Extension Setup
**Required Extensions** (Choose One):
- [Tampermonkey](https://www.tampermonkey.net/)  
  [![Chrome](https://img.shields.io/badge/Chrome-Install-green)](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
  [![Firefox](https://img.shields.io/badge/Firefox-Install-green)](https://addons.mozilla.org/firefox/addon/tampermonkey/)
  
- [Violentmonkey](https://violentmonkey.github.io/)  
  [![Chrome](https://img.shields.io/badge/Chrome-Install-green)](https://chrome.google.com/webstore/detail/violentmonkey/jinjaccalgkegednnccohejagnlnfdag)
  [![Firefox](https://img.shields.io/badge/Firefox-Install-green)](https://addons.mozilla.org/firefox/addon/violentmonkey/)

### 2. Install the Userscript
[![Install Script](https://img.shields.io/badge/Install_Userscript-2ecc71)](https://github.com/ericvlog/rd_symlink_manager/raw/main/rd_symlink.user.js)

1. Click the green "Install Userscript" button above
2. Confirm installation in your userscript manager
3. **First-Time Configuration**:

```javascript
// ==UserScript==
// @name         RD Symlink Manager
// @namespace    http://tampermonkey.net/
// @version      1.1.0
// @description  Real-Debrid integration with direct downloads and symlink management
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @connect      api.real-debrid.com
// @connect      localhost
// ==/UserScript==

const config = {
    instanceName: "Main",          // Unique identifier for multiple instances
    rdApiKey: 'YOUR_API_KEY_HERE', // Get from Real-Debrid settings
    backendUrl: 'http://localhost:5002', // Local server address
    videoExtensions: ['mp4', 'mkv', 'avi'], // Supported file formats
    minFileSize: 50 * 1024 * 1024 // 50MB minimum file size filter
};
```

### 3. Verification & First Use
✅ **Successful Installation Indicators**:
1. Visit any torrent/magnet link site (e.g., 1337x, RARBG clone)
2. Look for <button style="background:#2ecc71;color:white;padding:2px 5px;border-radius:3px">RD</button> buttons next to magnet links
3. Click the floating control panel: <div style="display:inline-block;width:30px;height:30px;background:#3498db;color:white;text-align:center;border-radius:50%;line-height:30px">RD</div>

![UI Demo](https://via.placeholder.com/800x500.png/007bff/fff?text=Interface+Preview)

## 🚀 Quick Start

```bash
git clone https://github.com/ericvlog/rd_symlink_manager.git
cd rd_symlink_manager
cp .env.example .env  # Configure with your API tokens/paths
# Create directories from your .env paths
mkdir -p \
    "${SYMLINK_BASE_PATH}" \
    "${DOWNLOAD_INCOMPLETE_PATH}" \
    "${DOWNLOAD_COMPLETE_PATH}"

# Set permissions once
sudo chown -R 1000:1000 \
    "${SYMLINK_BASE_PATH}" \
    "${DOWNLOAD_INCOMPLETE_PATH}" \
    "${DOWNLOAD_COMPLETE_PATH}"

sudo chmod -R 2775 \
    "${SYMLINK_BASE_PATH}" \
    "${DOWNLOAD_INCOMPLETE_PATH}" \
    "${DOWNLOAD_COMPLETE_PATH}"
docker compose up -d --build
```
## 📥 Installation Guide
Follow along with our YouTube tutorial:  
[![Installation Video](https://img.youtube.com/vi/bQid2AOE-o0/0.jpg)](https://youtu.be/bQid2AOE-o0)

## ⚙️ Requirements

- **Essential**:
  - Real-Debrid Premium Account ([API Key](https://real-debrid.com/apitoken))
  - Mounted Cloud Storage ([Zurg](https://github.com/dexter21767/zurg) + Rclone)
  
- **Media Stack**:
  - Plex/Emby/Jellyfin (Optional but recommended)
  - Linux filesystem (ext4/XFS recommended for symlinks)

- **Browser Environment**:
  - Chrome/Edge with Tampermonkey
  - Violentmonkey extension

## 🔑 Key Benefits

- 🕒 **One-Click Automation** - From torrent to streaming in 3 clicks
- 🔄 **Zero Reprocessing** - Smart tracking of handled content
- 🛡️ **Failure Resilience**:
  - Download resume support
  - Symlink error auto-retry
- 🎞️ **Instant Gratification**:
  - Media server-ready files
  - Clean metadata formatting
- 📡 **Hybrid Operation**:
  - Mix symlinks and direct downloads
  - Multiple media library paths

## Support
**Optimized for** Linux (Debian/Ubuntu) + Chrome/Edge  
Report issues: [GitHub Issues](https://github.com/ericvlog/rd_symlink_manager/issues)

## ☕ Support Development
If this project helps you, consider supporting us:
**Bitcoin (BTC):**  
`1NizzCiosWryLMv51jp118MSjsN7FZQxjC`  
![Bitcoin QR Code](https://bitcoinqr.dev/qr/1NizzCiosWryLMv51jp118MSjsN7FZQxjC?size=200)
