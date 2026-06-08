#!/bin/bash
set -e

# Ensure mount directory /app/data exists
mkdir -p /app/data

echo "Preparing persistent mount at /app/data..."

# Copy static assets to the persistent directory if they are missing or updated
cp /app/index.html /app/data/
cp /app/index_remote.html /app/data/
cp /app/flowy.min.css /app/data/
cp /app/flowy.min.js /app/data/

# Change directory to the persistent mount folder
cd /app/data

# Run the app.py server using PYTHONPATH
echo "Starting Humanboard application..."
exec python /app/app.py
