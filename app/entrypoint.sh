#!/bin/bash
set -e

USERNAME=${CONTAINER_USER:-appuser}

chown -R ${USERNAME}:${USERNAME} \
  "${SYMLINK_BASE_PATH}" \
  "${DOWNLOAD_INCOMPLETE_PATH}" \
  "${DOWNLOAD_COMPLETE_PATH}" \
  "${FINAL_LIBRARY_PATH}" \
  2>/dev/null || true

exec gosu ${USERNAME} "$@"
