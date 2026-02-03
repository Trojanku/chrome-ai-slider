# ai-slider Chrome Extension

A minimal Chrome extension that lets you ask questions about the current page content using AI.

## Features

- Side panel UI with simple question/answer interface
- Extract text from selection or entire page
- 40,000 character context limit (truncated deterministically)
- Secure prompt injection defenses
- Interactive setup wizard for first-time configuration
- No chat history, storage, or accounts required

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Side Panel UI  │────▶│ Background Worker│────▶│ Python Backend  │
│  (sidepanel.*)  │     │  (background.js) │     │ (localhost:8787)│
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                │                         │
                                ▼                         ▼
                        chrome.scripting            OpenAI API
                        (extract content)
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

### 2. Run the Backend (with Setup Wizard)

```bash
cd backend
python main.py
```

On first run, an **interactive setup wizard** will guide you through:

```
============================================================
   ai-slider Backend - Setup Wizard
============================================================

This wizard will help you configure the backend.
You'll need an OpenAI API key to continue.

[Step 1] OpenAI API Key
----------------------------------------

To get an API key:
  1. Go to: https://platform.openai.com/api-keys
  2. Sign in or create an account
  3. Click 'Create new secret key'
  4. Copy the key (starts with 'sk-')

Open the API keys page in your browser? [Y/n]:
```

The wizard will:
1. **Open the OpenAI API keys page** in your browser (optional)
2. **Validate your API key** before saving
3. **Let you choose a model** (gpt-4o-mini, gpt-4o, etc.)
4. **Save configuration** to `backend/.env`

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

## Getting an OpenAI API Key

1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Sign in or create an OpenAI account
3. Click **Create new secret key**
4. Give it a name (e.g., "ai-slider Extension")
5. Copy the key immediately (it won't be shown again)
6. Add billing/credits to your account if needed

**Note**: This extension uses the standard OpenAI API. There is no separate "Codex API key" - the OpenAI Codex CLI tool uses the same API key.

## Available Models

The setup wizard lets you choose from:

| Model | Description | Cost |
|-------|-------------|------|
| `gpt-4o-mini` | Fast & cheap, good for most Q&A (default) | $0.15/1M tokens |
| `gpt-4o` | Best quality, higher cost | $2.50/1M tokens |
| `gpt-4-turbo` | Good balance of quality and speed | $10/1M tokens |
| `gpt-3.5-turbo` | Legacy, cheapest option | $0.50/1M tokens |
| `o3-mini` | Reasoning model, slower but thorough | $1.10/1M tokens |

## Reconfiguring

To change your API key or model:

```bash
# Delete the config file
rm backend/.env

# Run the wizard again
cd backend
python main.py
```

Or manually edit `backend/.env`:

```env
OPENAI_API_KEY="sk-..."
OPENAI_MODEL="gpt-4o"
```

## Security Notes

- **API Key Security**: The OpenAI API key is stored server-side only, never in the extension
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
│   ├── main.py         # FastAPI server with setup wizard
│   ├── requirements.txt
│   └── .env            # Generated config (after first run)
└── README.md
```

## Troubleshooting

### "Cannot connect to backend"
- Ensure the Python backend is running on port 8787
- Check that nothing else is using port 8787

### "Invalid API key"
- Delete `backend/.env` and restart to reconfigure
- Make sure you have a valid OpenAI API key with credits

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
