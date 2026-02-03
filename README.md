# ai-slider Chrome Extension

A minimal Chrome extension that lets you ask questions about the current page content using AI, powered by your existing Codex subscription.

## Overview

- Side panel UI for questions about the current page
- Extracts selection or full page text (truncated deterministically)
- Uses your Codex CLI login (no API keys; no extra API billing)
- Local-only credentials stored in `~/.codex/auth.json`

## Setup

### 1. Install the Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Run the Backend (Codex subscription required)

```bash
cd backend
codex login
python main.py
```

### 3. Load the Extension in Chrome

1. Open `chrome://extensions/`
2. Enable Developer mode
3. Click Load unpacked
4. Select the project folder containing `manifest.json`

### 4. Use It

1. Open any web page
2. Click the extension icon to open the side panel
3. Use selection or page text, ask your question, click Send

