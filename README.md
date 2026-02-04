# AI Slider

Ask questions about any webpage using AI.

Uses your existing Codex or Claude subscription — no API keys, no extra costs.

![AI Slider Screenshot](assets/screenshot.png)

## Quick Start

### 1. Start the backend
```bash
cd backend
./setup.sh      # One-time setup
python main.py  # Start server
```

### 2. Load the extension
1. Go to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" → select this folder

### 3. Use it
- Click the extension icon to open the side panel
- Or select text → right-click → "Ask AI Slider"

## Requirements
- Python 3.10+
- [Codex CLI](https://github.com/openai/codex) or [Claude CLI](https://github.com/anthropics/claude-code)
