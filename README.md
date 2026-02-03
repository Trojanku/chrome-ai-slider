# ai-slider Chrome Extension

A minimal Chrome extension that lets you ask questions about the current page content using AI.

## Features

- Side panel UI with simple question/answer interface
- Extract text from selection or entire page
- 40,000 character context limit (truncated deterministically)
- Secure prompt injection defenses
- Uses Codex CLI login for OpenAI authentication
- No chat history, storage, or accounts required

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Side Panel UI  │────▶│ Background Worker│────▶│ Python Backend  │
│  (sidepanel.*)  │     │  (background.js) │     │ (localhost:8787)│
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                │                         │
                                ▼                         ▼
                        chrome.scripting          ChatGPT Backend API
                        (extract content)       (uses your subscription)
```

## Setup Instructions

### 1. Install the Backend

```bash
cd backend

# Create virtual environment (recommended)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 2. Run the Backend

```bash
cd backend
codex login
python main.py
```

### 3. Create Extension Icons

Icons are already created, but you can replace them:

```bash
# From project root (requires ImageMagick)
convert -size 16x16 xc:#4285f4 icons/icon16.png
convert -size 48x48 xc:#4285f4 icons/icon48.png
convert -size 128x128 xc:#4285f4 icons/icon128.png
```

### 4. Load the Extension in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked**
4. Select the `chrome-slider-ai` folder (the one containing `manifest.json`)
5. The extension icon should appear in your toolbar

### 5. Using the Extension

1. Navigate to any web page
2. Click the extension icon to open the side panel
3. Either:
   - Select text on the page and click **Use Selection**
   - Or click **Use Page** to extract the entire page text
4. Type your question in the textarea
5. Click **Send** (or press Ctrl+Enter)
6. The AI response appears in the response area

## Authentication

This extension uses your **Codex CLI login** (stored in `~/.codex/auth.json`) to access the ChatGPT Backend API. This means:

- **No separate API costs** - uses your existing ChatGPT Plus/Pro subscription
- **Same rate limits** as your ChatGPT subscription
- **OAuth authentication** - no API keys needed

```bash
codex login
```

## Available Models

Set `OPENAI_MODEL` in `backend/.env` to choose. These use your **ChatGPT subscription** (no separate API costs):

| Model | Description |
|-------|-------------|
| `gpt-5.1-codex-mini` | Optimized for Codex, cheaper and faster (default) |
| `gpt-5.2-codex` | Latest frontier agentic coding model |
| `gpt-5.1-codex-max` | Codex-optimized flagship for deep reasoning |
| `gpt-5.2` | Latest frontier model |

## Reconfiguring

To change the model, edit `backend/.env`:

```env
OPENAI_MODEL="gpt-5.2-codex"
```

## Security Notes

- **Credential Security**: Codex credentials are stored locally by the Codex CLI, never in the extension
- **Prompt Injection Defense**: All page content is treated as untrusted data with clear delimiters
- **XSS Prevention**: All output is rendered as plain text using `textContent`, never `innerHTML`
- **Input Validation**: Context limited to 40k chars in extension, 50k in backend

## Files

```
chrome-slider-ai/
├── manifest.json       # Extension manifest (MV3)
├── background.js       # Service worker for message handling
├── sidepanel.html      # Side panel UI
├── sidepanel.js        # Side panel logic
├── sidepanel.css       # Side panel styling
├── icons/              # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── backend/
│   ├── main.py         # FastAPI server
│   ├── requirements.txt
│   └── .env            # Generated config (after first run)
└── README.md
```

## Troubleshooting

### "Cannot connect to backend"
- Ensure the Python backend is running on port 8787
- Check that nothing else is using port 8787

### "No credentials found"
- Run `codex login` and restart the backend

### "Cannot extract from browser internal pages"
- The extension cannot access `chrome://` pages
- Navigate to a regular web page

### Side panel doesn't open
- Make sure Developer mode is enabled
- Try reloading the extension
- Check the Chrome console for errors

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/ask` | POST | Submit a question with context |
| `/health` | GET | Health check, returns model name |
| `/config` | GET | Get current configuration status |

## License

MIT
