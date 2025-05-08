FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    gosu \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd -g 1000 appuser && \
    useradd -u 1000 -g appuser -m -s /bin/bash appuser

WORKDIR /app
COPY ./app/ .
COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt && \
    chmod +x entrypoint.sh && \
    chown -R appuser:appuser /app

USER appuser

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["python", "-u", "rd_symlink_backend.py"]
