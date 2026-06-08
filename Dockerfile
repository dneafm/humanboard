FROM python:3.11-slim

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app
ENV PORT=8080

WORKDIR /app

# Install system dependencies (e.g. build tools for any compiled dependencies if needed)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code
COPY . .

# Make entrypoint.sh executable
RUN chmod +x entrypoint.sh

# Expose port 8080 (app.py default)
EXPOSE 8080

# Execute entrypoint script
CMD ["/app/entrypoint.sh"]
