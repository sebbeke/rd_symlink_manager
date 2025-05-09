FROM python:3.11-slim

WORKDIR /app

# Install dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc python3-dev curl && \
    pip install --no-cache-dir flask requests bencode.py && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Make /app writable
RUN chmod 777 /app

COPY ./app/ .

EXPOSE ${PORT:-5005}

CMD ["python", "rd_symlink_backend.py"]
