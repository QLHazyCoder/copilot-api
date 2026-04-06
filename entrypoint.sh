#!/bin/sh
# Simple entrypoint - just start the server
# Configuration is done via environment variables and /admin web interface
exec bun run dist/main.js
