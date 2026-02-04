// Background service worker for ai-slider

const BACKEND_URL = "http://localhost:8787";
const CONTEXT_CHAR_LIMIT = 40000;

// Create context menu on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "ai-slider-selection",
    title: "Ask AI Slider",
    contexts: ["selection"],
  });
});

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// Handle context menu click
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "ai-slider-selection" && info.selectionText) {
    // Open the side panel FIRST (must be synchronous with user gesture)
    const openPromise = chrome.sidePanel
      .open({ tabId: tab.id })
      .catch(() => chrome.sidePanel.open({ windowId: tab.windowId }));

    openPromise
      .then(() => {
        // Focus the window so the side panel can receive input focus
        chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
        chrome.storage.local.set({ pendingFocus: Date.now() }).catch(() => {});
        chrome.runtime.sendMessage({ type: "focus-input" }).catch(() => {});
      })
      .catch((err) => {
        console.error("Failed to open side panel:", err);
      });

    // Then do the async work to extract context and store selection
    (async () => {
      let pageContext = "";
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: extractPage,
        });
        if (results && results[0]) {
          pageContext = results[0].result || "";
          if (pageContext.length > CONTEXT_CHAR_LIMIT) {
            pageContext = pageContext.substring(0, CONTEXT_CHAR_LIMIT);
          }
        }
      } catch (err) {
        console.error("Failed to extract page context:", err);
      }

      // Store the selection data for the side panel to pick up
      await chrome.storage.local.set({
        pendingSelection: {
          selectedText: info.selectionText,
          pageContext: pageContext,
          url: tab.url,
          title: tab.title,
          timestamp: Date.now(),
        },
      });
    })();
  }
});

// Handle messages from the side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "extract") {
    handleExtract(message.mode).then(sendResponse).catch((err) => {
      sendResponse({ error: err.message });
    });
    return true; // Keep channel open for async response
  }

  if (message.type === "ask") {
    handleAsk(message.question, message.context, message.url, message.title, message.history || [], message.provider || "codex")
      .then(sendResponse)
      .catch((err) => {
        sendResponse({ error: err.message });
      });
    return true;
  }

  if (message.type === "create-session") {
    handleCreateSession(message.context, message.url, message.title)
      .then(sendResponse)
      .catch((err) => {
        sendResponse({ error: err.message });
      });
    return true;
  }

  if (message.type === "session-ask") {
    handleSessionAsk(message.sessionId, message.question, message.provider || "codex")
      .then(sendResponse)
      .catch((err) => {
        // Check if session expired
        if (err.message.includes("Session not found") || err.message.includes("404")) {
          sendResponse({ sessionExpired: true, error: err.message });
        } else {
          sendResponse({ error: err.message });
        }
      });
    return true;
  }
});

async function handleExtract(mode) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !tab.id) {
    throw new Error("No active tab found");
  }

  if (tab.url && (tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://"))) {
    throw new Error("Cannot extract from browser internal pages");
  }

  if (tab.url && tab.url.endsWith(".pdf")) {
    throw new Error("PDF extraction not supported in MVP");
  }

  const extractionFunction = mode === "selection" ? extractSelection : extractPage;

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: extractionFunction,
  });

  if (!results || results.length === 0 || results[0].result === null) {
    throw new Error("Failed to extract content from page");
  }

  let text = results[0].result || "";

  if (mode === "selection" && !text.trim()) {
    throw new Error("No text selected. Please select some text first.");
  }

  // Truncate to context limit (deterministic: just cut at limit)
  if (text.length > CONTEXT_CHAR_LIMIT) {
    text = text.substring(0, CONTEXT_CHAR_LIMIT);
  }

  return {
    context: text,
    url: tab.url,
    title: tab.title,
    charCount: text.length,
  };
}

function extractSelection() {
  return window.getSelection().toString();
}

function extractPage() {
  // Selectors for main content areas (in priority order)
  const mainSelectors = [
    'main',
    'article',
    '[role="main"]',
    '.post-content',
    '.article-content',
    '.entry-content',
    '.content',
    '#content',
    '.post',
    '.article',
  ];

  // Elements to exclude from extraction
  const excludeSelectors = [
    'nav',
    'header',
    'footer',
    'aside',
    '.sidebar',
    '.navigation',
    '.nav',
    '.menu',
    '.advertisement',
    '.ad',
    '.ads',
    '.cookie-banner',
    '.cookie-consent',
    '.popup',
    '.modal',
    '.comments',
    '.comment-section',
    '.social-share',
    '.related-posts',
    '[role="navigation"]',
    '[role="banner"]',
    '[role="contentinfo"]',
    '[aria-hidden="true"]',
  ];

  // Try to find main content container
  let contentRoot = null;
  for (const selector of mainSelectors) {
    const el = document.querySelector(selector);
    if (el && el.innerText && el.innerText.trim().length > 200) {
      contentRoot = el;
      break;
    }
  }

  // Fall back to body if no main content found
  if (!contentRoot) {
    contentRoot = document.body;
  }

  // Clone the content root to avoid modifying the actual page
  const clone = contentRoot.cloneNode(true);

  // Remove excluded elements from the clone
  for (const selector of excludeSelectors) {
    const elements = clone.querySelectorAll(selector);
    for (const el of elements) {
      el.remove();
    }
  }

  // Also remove script, style, noscript, svg, canvas elements
  const techElements = clone.querySelectorAll('script, style, noscript, svg, canvas, iframe');
  for (const el of techElements) {
    el.remove();
  }

  // Extract text with structure preservation
  function extractWithStructure(element) {
    const parts = [];

    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent.trim();
        if (text) {
          parts.push(text);
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const tagName = node.tagName.toLowerCase();

        // Handle headings
        if (/^h[1-6]$/.test(tagName)) {
          const level = parseInt(tagName[1]);
          const prefix = '#'.repeat(level);
          const text = node.innerText.trim();
          if (text) {
            parts.push(`\n${prefix} ${text}\n`);
          }
        }
        // Handle list items
        else if (tagName === 'li') {
          const text = node.innerText.trim();
          if (text) {
            parts.push(`- ${text}`);
          }
        }
        // Handle paragraphs and divs
        else if (tagName === 'p' || tagName === 'div') {
          const text = node.innerText.trim();
          if (text) {
            parts.push(`\n${text}\n`);
          }
        }
        // Handle block elements
        else if (['blockquote', 'pre', 'code'].includes(tagName)) {
          const text = node.innerText.trim();
          if (text) {
            parts.push(`\n${text}\n`);
          }
        }
        // Recurse for other elements
        else {
          const childText = extractWithStructure(node);
          if (childText) {
            parts.push(childText);
          }
        }
      }
    }

    return parts.join(' ');
  }

  let text = extractWithStructure(clone);

  // Clean up: collapse multiple spaces and newlines
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n\s*\n\s*\n/g, '\n\n');
  text = text.trim();

  return text;
}

async function handleAsk(question, context, url, title, history, provider) {
  if (!question || !question.trim()) {
    throw new Error("Please enter a question");
  }

  if (!context || !context.trim()) {
    throw new Error("No context available. Use 'Use Selection' or 'Use Page' first.");
  }

  const response = await fetch(`${BACKEND_URL}/ask`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      question: question.trim(),
      context: context,
      url: url || "",
      title: title || "",
      history: history || [],
      provider: provider || "codex",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Backend error (${response.status}): ${errorText}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error);
  }

  return { answer: data.answer };
}

async function handleCreateSession(context, url, title) {
  if (!context || !context.trim()) {
    throw new Error("No context available for session creation.");
  }

  const response = await fetch(`${BACKEND_URL}/session/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      context: context,
      url: url || "",
      title: title || "",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Backend error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return { sessionId: data.session_id };
}

async function handleSessionAsk(sessionId, question, provider) {
  if (!question || !question.trim()) {
    throw new Error("Please enter a question");
  }

  if (!sessionId) {
    throw new Error("No session ID provided");
  }

  const response = await fetch(`${BACKEND_URL}/session/ask`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      session_id: sessionId,
      question: question.trim(),
      provider: provider || "codex",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Backend error (${response.status}): ${errorText}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error);
  }

  return { answer: data.answer };
}
