#!/usr/bin/env python3
"""Deploy to Netlify without interactive login"""
import os
import json
import urllib.request
import urllib.error
import zipfile
import io

# Create a simple zip of the HTML file
html_path = "/Users/kangmiaoqing/Desktop/OPC-总部/业务/个人业务/cycle_experiment.html"

# Read the HTML content
with open(html_path, 'r', encoding='utf-8') as f:
    html_content = f.read()

# Create zip in memory
zip_buffer = io.BytesIO()
with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
    zf.writestr('index.html', html_content)
zip_data = zip_buffer.getvalue()

# Try to deploy to Netlify using their API
# Note: This requires a token. Without auth, we'll get an error.
# Better approach: Use Netlify's manual deploy via drop page

print("HTML file ready for deployment")
print(f"Size: {len(html_content)} bytes")
print(f"Zip size: {len(zip_data)} bytes")
print("\nTo deploy:")
print("1. Open https://app.netlify.com/drop")
print("2. Drag and drop this folder or the HTML file")
print("3. Get instant URL!")
