# AI Slider

Chrome extension that lets you ask Claude or Codex about the current page using your existing, locally authenticated CLI.

The extension sends page context and your question to a small local backend, which forwards it to your already-logged-in Claude/Codex CLI and returns the response in a browser's side panel.

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

## Disclaimer

- **Prompt injection risk**: The AI reads page content, which could include hidden malicious instructions. Don't blindly trust responses on untrusted sites.
- **Data privacy**: Page content is sent to Codex/Claude via their CLI tools. Nothing is stored or sent elsewhere.
- **Not a security tool**: This is a convenience tool, not designed for analyzing suspicious content.
