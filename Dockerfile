FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc python3-dev curl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt  # Install from requirements.txt

# Make /app writable
RUN chmod 777 /app

COPY ./app/ .

EXPOSE ${PORT:-5005}

CMD ["python", "rd_symlink_backend.py"]
