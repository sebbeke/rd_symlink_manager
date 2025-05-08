# Real-Debrid Symlink Manager + Downloader  
​**All-in-One Solution for (Movies|Anime|Shows) - Direct Media Server Integration with Multi-Path Support**​

[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](https://docs.docker.com)
[![Userscript](https://img.shields.io/badge/Tampermonkey-Supported-yellow.svg)](https://www.tampermonkey.net/)

## Features

### 1. Frontend Userscript (Tampermonkey/Violentmonkey)
🎮 ​**Floating Control Center**​  
- 🖱️ Real-Debrid Icon with Status Indicators (Instant color changes for RD connectivity/symlink status)
- 🎥 Auto-Video Detection: Smart file size analysis for optimal caching
- 🚀 One-Click Actions:
  - `Cache Only`: Direct Real-Debrid cloud caching
  - `Cache + Symlink`: Full pipeline (Cache → Clean filenames → Symlink → Media Server Scan)
- 📌 Persistent Tracking: Visual indicators for previously handled content

### 2. Task Manager+ Dashboard
📊 ​**Centralized Download Control**​  
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
⚙️ ​**Automated Processing Core**​  
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

## 🚀 Quick Start

```bash
git clone https://github.com/ericvlog/rd_symlink_manager.git
cd rd_symlink_manager
cp .env.example .env  # Configure with your API tokens/paths
docker compose up -d --build
```

## ⚙️ Requirements

- ​**Essential**:
  - Real-Debrid Premium Account ([API Key](https://real-debrid.com/apitoken))
  - Mounted Cloud Storage ([Zurg](https://github.com/dexter21767/zurg) + Rclone)
  
- ​**Media Stack**:
  - Plex/Emby/Jellyfin (Optional but recommended)
  - Linux filesystem (ext4/XFS recommended for symlinks)

- ​**Browser Environment**:
  - Chrome/Edge with Tampermonkey
  - Violentmonkey extension

## 🔑 Key Benefits

- 🕒 ​**One-Click Automation**​ - From torrent to streaming in 3 clicks
- 🔄 ​**Zero Reprocessing**​ - Smart tracking of handled content
- 🛡️ ​**Failure Resilience**:
  - Download resume support
  - Symlink error auto-retry
- 🎞️ ​**Instant Gratification**:
  - Media server-ready files
  - Clean metadata formatting
- 📡 ​**Hybrid Operation**:
  - Mix symlinks and direct downloads
  - Multiple media library paths

## Support
​**Optimized for**​ Linux (Debian/Ubuntu) + Chrome/Edge  
Report issues: [GitHub Issues](https://github.com/ericvlog/rd_symlink_manager/issues)
