import os
import logging
import sys
import urllib.parse
import requests
import re
import time
import threading
import uuid
import shutil
from collections import deque
from flask import Flask, request, jsonify
from pathlib import Path

app = Flask(__name__)

# ======================
# ENVIRONMENT CONFIG
# ======================
RD_API_KEY = os.getenv("RD_API_KEY")
MEDIA_SERVER = os.getenv("MEDIA_SERVER", "plex").lower()
ENABLE_DOWNLOADS = os.getenv("ENABLE_DOWNLOADS", "false").lower() == "true"
MOVE_TO_FINAL_LIBRARY = os.getenv("MOVE_TO_FINAL_LIBRARY", "true").lower() == "true"

# Path configuration
SYMLINK_BASE_PATH = Path(os.getenv("SYMLINK_BASE_PATH", "/symlinks"))
DOWNLOAD_COMPLETE_PATH = Path(os.getenv("DOWNLOAD_COMPLETE_PATH", "/dl_complete"))
FINAL_LIBRARY_PATH = Path(os.getenv("FINAL_LIBRARY_PATH", "/library"))
RCLONE_MOUNT_PATH = Path(os.getenv("RCLONE_MOUNT_PATH", "/mnt/data/media/remote/realdebrid/__all__"))

# Media server config
PLEX_TOKEN = os.getenv("PLEX_TOKEN")
PLEX_LIBRARY_NAME = os.getenv("PLEX_LIBRARY_NAME")
PLEX_SERVER_IP = os.getenv("PLEX_SERVER_IP")
EMBY_SERVER_IP = os.getenv("EMBY_SERVER_IP")
EMBY_API_KEY = os.getenv("EMBY_API_KEY")
EMBY_LIBRARY_NAME = os.getenv("EMBY_LIBRARY_NAME")  # New variable

# Advanced
MAX_CONCURRENT_TASKS = int(os.getenv("MAX_CONCURRENT_TASKS", "3"))
DELETE_AFTER_COPY = os.getenv("DELETE_AFTER_COPY", "false").lower() == "true"
REMOVE_WORDS = [w.strip() for w in os.getenv("REMOVE_WORDS", "").split(",") if w.strip()]
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
LOG_FILE = os.getenv("SYMLINK_LOG_FILE", "symlink_backend.log")
SCAN_DELAY = int(os.getenv("SCAN_DELAY", "60"))

# ======================
# GLOBAL STATE
# ======================
plex_section_id = None
plex_initialized = False
task_semaphore = threading.BoundedSemaphore(MAX_CONCURRENT_TASKS)
download_semaphore = threading.BoundedSemaphore(MAX_CONCURRENT_TASKS)
request_queue = deque()
queue_lock = threading.Lock()
active_tasks = set()
download_speeds = []
speed_lock = threading.Lock()

# ======================
# LOGGING SETUP
# ======================
logging.basicConfig(
    level=LOG_LEVEL,
    format="%(asctime)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler(sys.stdout)
    ]
)

class TaskWorker(threading.Thread):
    def __init__(self):
        super().__init__(daemon=True)
        self.running = True

    def run(self):
        while self.running:
            try:
                task_id, raw_data = None, None
                with queue_lock:
                    if request_queue:
                        task_id, raw_data = request_queue.popleft()

                if raw_data:
                    with task_semaphore:
                        try:
                            start_time = time.time()
                            with app.test_request_context(
                                method="POST",
                                data=raw_data,
                                headers={"Content-Type": "application/json"}
                            ):
                                data = request.get_json()
                                response = process_symlink_creation(data)

                                if response[1] != 200:
                                    logging.error(f"Task {task_id} failed: {response[0].get_json()}")
                        except Exception as e:
                            logging.error(f"Task {task_id} processing failed: {str(e)}")
                        finally:
                            if task_id in active_tasks:
                                active_tasks.remove(task_id)
                            logging.info(f"Task {task_id} completed in {time.time()-start_time:.1f}s")
                else:
                    time.sleep(1)
            except Exception as e:
                logging.error(f"Queue worker error: {str(e)}")
                time.sleep(5)

def get_restricted_links(torrent_id):
    headers = {"Authorization": f"Bearer {RD_API_KEY}"}
    response = requests.get(
        f"https://api.real-debrid.com/rest/1.0/torrents/info/{torrent_id}",
        headers=headers,
        timeout=15
    )
    response.raise_for_status()
    return response.json().get("links", [])

def unrestrict_link(restricted_link):
    headers = {"Authorization": f"Bearer {RD_API_KEY}"}
    response = requests.post(
        "https://api.real-debrid.com/rest/1.0/unrestrict/link",
        headers=headers,
        data={"link": restricted_link},
        timeout=15
    )
    response.raise_for_status()
    return response.json()["download"]

def log_total_speed():
    while True:
        start = time.time()
        with speed_lock:
            if download_speeds:
                total = sum(download_speeds)
                count = len(download_speeds)
                download_speeds.clear()
                avg_speed = total / count if count > 0 else 0
                logging.info(
                    f"[Aggregate] Total: {total/1024/1024:.2f} MB/s | "
                    f"Avg: {avg_speed/1024/1024:.2f} MB/s | Active: {count}"
                )

        sleep_time = 4 - (time.time() - start)
        if sleep_time > 0:
            time.sleep(sleep_time)

def clean_filename(original_name):
    cleaned = original_name
    for pattern in REMOVE_WORDS:
        cleaned = re.sub(rf"{re.escape(pattern)}", "", cleaned, flags=re.IGNORECASE)

    name_part, ext_part = os.path.splitext(cleaned)
    name_part = re.sub(r"_(\d+)(?=\.\w+$|$)", r"-cd\1", name_part)
    name_part = re.sub(r"[\W_]+", "-", name_part).strip("-")
    return f"{name_part or 'file'}"

def log_download_speed(torrent_id, dest_path):
    with download_semaphore:
        temp_path = None
        try:
            headers = {"Authorization": f"Bearer {RD_API_KEY}"}
            response = requests.get(
                f"https://api.real-debrid.com/rest/1.0/torrents/info/{torrent_id}",
                headers=headers,
                timeout=15
            )
            response.raise_for_status()
            torrent_info = response.json()
            
            base_name = clean_filename(os.path.splitext(torrent_info["filename"])[0])
            dest_dir = DOWNLOAD_COMPLETE_PATH / base_name
            dest_dir.mkdir(parents=True, exist_ok=True)
            temp_path = dest_dir / f"{dest_path.name}.tmp"

            restricted_links = get_restricted_links(torrent_id)
            if not restricted_links:
                raise Exception("No downloadable links found")

            download_url = unrestrict_link(restricted_links[0])
            logging.info(
                f"Download initialized\n"
                f"|-> Source: {download_url}\n"
                f"|-> Temp: {temp_path}\n"
                f"|-> Final: {dest_path}"
            )

            with requests.get(download_url, stream=True, timeout=(10, 300)) as r:
                r.raise_for_status()
                total_size = int(r.headers.get("content-length", 0))
                bytes_copied = 0
                start_time = time.time()
                last_log = start_time

                with open(temp_path, "wb") as f:
                    for chunk in r.iter_content(chunk_size=10*1024*1024):
                        if chunk:
                            f.write(chunk)
                            bytes_copied += len(chunk)

                            if time.time() - last_log >= 3:
                                elapsed = time.time() - start_time
                                speed = bytes_copied / elapsed
                                with speed_lock:
                                    download_speeds.append(speed)
                                logging.info(
                                    f"[Downloading] {dest_path.name} | "
                                    f"Progress: {bytes_copied/total_size:.1%} | "
                                    f"Speed: {speed/1024/1024:.2f} MB/s"
                                )
                                last_log = time.time()

            temp_path.rename(dest_dir / dest_path.name)
            logging.info(f"Download completed: {dest_dir / dest_path.name}")

            if MOVE_TO_FINAL_LIBRARY:
                final_path = FINAL_LIBRARY_PATH / dest_path.relative_to(DOWNLOAD_COMPLETE_PATH)
                final_path.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(dest_dir / dest_path.name, final_path)
                logging.info(f"Moved to final library: {final_path}")

                try:
                    if not any(dest_dir.iterdir()):
                        dest_dir.rmdir()
                        logging.info(f"Cleaned empty directory: {dest_dir}")
                except Exception as e:
                    logging.error(f"Directory cleanup failed: {str(e)}")

                scan_path = final_path
            else:
                scan_path = FINAL_LIBRARY_PATH
                logging.info(f"File retained in downloads: {dest_dir / dest_path.name}")

            time.sleep(SCAN_DELAY)
            trigger_media_scan(scan_path)

        except Exception as e:
            logging.error(f"Download failed: {str(e)}")
            if temp_path and temp_path.exists():
                temp_path.unlink()

def get_plex_section_id():
    global plex_section_id, plex_initialized
    if plex_initialized:
        return plex_section_id

    try:
        response = requests.get(
            f"http://{PLEX_SERVER_IP}:32400/library/sections",
            headers={"Accept": "application/json"},
            params={"X-Plex-Token": PLEX_TOKEN},
            timeout=10
        )
        response.raise_for_status()
        for directory in response.json()["MediaContainer"]["Directory"]:
            if directory["title"] == PLEX_LIBRARY_NAME:
                plex_section_id = str(directory["key"])
                plex_initialized = True
                logging.info(f"Plex section resolved: {plex_section_id}")
                return plex_section_id
        logging.error("Plex library missing")
        return None
    except Exception as e:
        logging.error(f"Plex error: {str(e)}")
        return None

def trigger_plex_scan(path):
    try:
        section_id = get_plex_section_id()
        if not section_id:
            logging.error("Plex section ID not resolved. Check library name or token.")
            return False

        if ENABLE_DOWNLOADS:
            base_path = FINAL_LIBRARY_PATH if MOVE_TO_FINAL_LIBRARY else DOWNLOAD_COMPLETE_PATH
        else:
            base_path = SYMLINK_BASE_PATH

        try:
            rel_path = path.relative_to(base_path)
            encoded_path = "/".join([urllib.parse.quote(p.name) for p in rel_path.parents[::-1]][:-1])
        except ValueError:
            logging.error(f"Path {path} is not relative to {base_path}. Check path mappings.")
            return False

        response = requests.get(
            f"http://{PLEX_SERVER_IP}:32400/library/sections/{section_id}/refresh",
            params={"path": encoded_path, "X-Plex-Token": PLEX_TOKEN},
            timeout=15
        )
        logging.info(f"Plex scan response code: {response.status_code}")
        return response.status_code == 200
    except Exception as e:
        logging.error(f"Plex scan error: {str(e)}", exc_info=True)
        return False

def trigger_emby_scan(path):
    try:
        libs_url = f"http://{EMBY_SERVER_IP}/emby/Library/VirtualFolders?api_key={EMBY_API_KEY}"
        libs_response = requests.get(libs_url, timeout=10)
        
        if libs_response.status_code != 200:
            logging.error(f"Emby API failed: {libs_response.status_code}")
            return False

        library_id = None
        for lib in libs_response.json():
            if lib['Name'] == EMBY_LIBRARY_NAME:
                library_id = lib['ItemId']
                break

        if not library_id:
            logging.error(f"Emby library '{EMBY_LIBRARY_NAME}' not found")
            return False

        scan_url = f"http://{EMBY_SERVER_IP}/emby/Library/Refresh?api_key={EMBY_API_KEY}"
        scan_response = requests.post(
            scan_url,
            params={"Recursive": "true", "Path": str(path)},
            timeout=15
        )
        return scan_response.status_code in [200, 204]
    except Exception as e:
        logging.error(f"Emby scan error: {str(e)}")
        return False

def trigger_media_scan(path):
    try:
        if MEDIA_SERVER == "plex":
            return trigger_plex_scan(path)
        elif MEDIA_SERVER == "emby":
            if ENABLE_DOWNLOADS:
                base_path = FINAL_LIBRARY_PATH if MOVE_TO_FINAL_LIBRARY else DOWNLOAD_COMPLETE_PATH
            else:
                base_path = SYMLINK_BASE_PATH
            
            try:
                rel_path = path.relative_to(base_path)
                emby_scan_path = base_path / rel_path.parent
            except ValueError:
                emby_scan_path = base_path
            
            return trigger_emby_scan(emby_scan_path)
        return False
    except Exception as e:
        logging.error(f"Media scan failed: {str(e)}")
        return False

def process_symlink_creation(data):
    try:
        headers = {"Authorization": f"Bearer {RD_API_KEY}"}
        response = requests.get(
            f"https://api.real-debrid.com/rest/1.0/torrents/info/{data['torrent_id']}",
            headers=headers,
            timeout=15
        )
        response.raise_for_status()
        torrent_info = response.json()

        if not torrent_info.get("files") or not torrent_info.get("filename"):
            return jsonify({"error": "Invalid torrent"}), 400

        selected_files = [f for f in torrent_info["files"] if f.get("selected") == 1]
        if not selected_files:
            return jsonify({"error": "No files selected"}), 400

        created_paths = []
        base_dir = DOWNLOAD_COMPLETE_PATH if ENABLE_DOWNLOADS else SYMLINK_BASE_PATH
        base_name = clean_filename(os.path.splitext(torrent_info["filename"])[0])
        dest_dir = base_dir / base_name
        dest_dir.mkdir(parents=True, exist_ok=True)

        for file in selected_files:
            try:
                file_path = Path(file["path"].lstrip("/"))
                dest_path = dest_dir / f"{clean_filename(file_path.stem)}{file_path.suffix.lower()}"

                if ENABLE_DOWNLOADS:
                    threading.Thread(
                        target=log_download_speed,
                        args=(data['torrent_id'], dest_path),
                        daemon=True
                    ).start()
                else:
                    src_path = RCLONE_MOUNT_PATH / torrent_info["filename"] / file_path
                    if dest_path.exists():
                        logging.warning(f"Symlink already exists: {dest_path}")
                    else:
                        dest_path.symlink_to(src_path)
                        logging.info(f"Symlink created: {dest_path} → {src_path}")
                    trigger_media_scan(dest_path)

                created_paths.append(str(dest_path))

            except Exception as e:
                logging.error(f"File error: {str(e)}")

        return jsonify({
            "status": "success",
            "created_paths": created_paths,
            "scan_triggered": True
        })

    except requests.RequestException as e:
        logging.error(f"API error: {str(e)}")
        return jsonify({"error": "API failure"}), 502
    except Exception as e:
        logging.error(f"Processing error: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route("/symlink", methods=["POST"])
def create_symlink():
    if task_semaphore.acquire(blocking=False):
        try:
            return process_symlink_creation(request.get_json())
        finally:
            task_semaphore.release()
    else:
        task_id = str(uuid.uuid4())
        with queue_lock:
            request_queue.append((task_id, request.get_data()))
            active_tasks.add(task_id)
        return jsonify({
            "status": "queued",
            "task_id": task_id,
            "position": len(request_queue)
        }), 429

@app.route("/health")
def health_check():
    return jsonify({
        "status": "healthy",
        "queue_size": len(request_queue),
        "active_tasks": len(active_tasks),
        "concurrency_limit": MAX_CONCURRENT_TASKS,
        "workers_alive": sum(1 for t in workers if t.is_alive())
    }), 200

if __name__ == "__main__":
    workers = [TaskWorker() for _ in range(MAX_CONCURRENT_TASKS * 2)]
    for w in workers:
        w.start()

    threading.Thread(target=log_total_speed, daemon=True).start()
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5002")), threaded=True)
