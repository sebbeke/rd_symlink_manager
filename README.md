# RealDebrid Symlink Manager

[![Docker](https://img.shields.io/badge/Docker-Enabled-blue.svg)](https://docs.docker.com)

Automated symlink management for RealDebrid with media server integration.

## Features
- Automatic symlink creation
- Plex/Emby library scanning
- Download queue management
- Permission management

## Quick Start
```bash
git clone https://github.com/YOURUSERNAME/rd_symlink_manager.git
cd rd_symlink_manager
cp .env.example .env
# Edit .env with your values
docker compose up -d --build
```

## Configuration
1. Get RealDebrid API key from [here](https://real-debrid.com/apitoken)
2. Set paths in `.env` file
3. Configure media server settings

## Support
Open an issue on GitHub for assistance.
