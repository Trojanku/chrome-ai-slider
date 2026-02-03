// Background service worker for ai-slider

const BACKEND_URL = "http://localhost:8787";
const CONTEXT_CHAR_LIMIT = 40000;

// Create context menu on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "ai-slider-selection",
    title: "Continue with ai-slider",
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
    chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {
      // Fallback to tabId if windowId fails
      chrome.sidePanel.open({ tabId: tab.id }).catch((err) => {
        console.error("Failed to open side panel:", err);
      });
    });

    // Then do the async work to extract context and store selection
    (async () => {
      let pageContext = "";
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const text = document.body.innerText || "";
            return text.replace(/\s+/g, " ").trim();
          },
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
    handleAsk(message.question, message.context, message.url, message.title, message.history || [])
      .then(sendResponse)
      .catch((err) => {
        sendResponse({ error: err.message });
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
  // Get body text, collapse whitespace, trim
  const text = document.body.innerText || "";
  return text.replace(/\s+/g, " ").trim();
}

async function handleAsk(question, context, url, title, history) {
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
