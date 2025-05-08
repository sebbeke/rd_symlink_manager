FROM python:3.11-slim

ARG UID=1000
ARG GID=1000
ARG USERNAME=appuser

RUN groupadd -g ${GID} ${USERNAME} && \
    useradd -u ${UID} -g ${GID} -s /bin/bash -m ${USERNAME}

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc python3-dev curl gosu && \
    pip install --no-cache-dir flask requests && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

RUN mkdir -p /logs && \
    chown ${USERNAME}:${USERNAME} /logs && \
    chmod 755 /logs

COPY ./app/rd_symlink_backend.py .
COPY ./app/entrypoint.sh .

RUN chmod +x entrypoint.sh && \
    chown -R ${USERNAME}:${USERNAME} /app

HEALTHCHECK --interval=2m --timeout=10s --start-period=1m \
  CMD curl -f "http://localhost:${PORT}/health" || exit 1

EXPOSE ${PORT}

ENTRYPOINT ["./entrypoint.sh"]
CMD ["python", "rd_symlink_backend.py"]

USER ${USERNAME}
