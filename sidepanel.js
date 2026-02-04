// Side panel logic for ai-slider chat interface

const messageInput = document.getElementById("message-input");
const btnSend = document.getElementById("btn-send");
const chatMessages = document.getElementById("chat-messages");
const providerSelect = document.getElementById("provider-select");

// State
let currentContext = null;
let currentUrl = null;
let currentTitle = null;
let currentSessionId = null;
let messageHistory = [];
let isProcessing = false;
let currentProvider = "codex";
let availableProviders = [];

// History sliding window config
const HISTORY_KEEP_FIRST = 2; // Keep first N messages (establishes context)
const HISTORY_KEEP_LAST = 12; // Keep last N messages (6 exchanges = 12 messages)

const ALLOWED_TAGS = new Set([
  "A",
  "BLOCKQUOTE",
  "BR",
  "CODE",
  "EM",
  "H1",
  "H2",
  "H3",
  "H4",
  "I",
  "LI",
  "OL",
  "P",
  "PRE",
  "STRONG",
  "UL",
]);

const ALLOWED_ATTRS = {
  A: new Set(["href", "title", "target", "rel"]),
};

const FOCUS_REQUEST_TTL_MS = 15000;

function setInputEnabled(enabled) {
  messageInput.disabled = !enabled;
  btnSend.disabled = !enabled;
  providerSelect.disabled = !enabled;
  isProcessing = !enabled;
}

function updateContextDisplay(charCount) {
  // Context indicator removed - auto-extract handles this
}

function scrollToBottom() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function getSlidingWindowHistory() {
  // For short histories, return everything
  if (messageHistory.length <= HISTORY_KEEP_FIRST + HISTORY_KEEP_LAST) {
    return messageHistory.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
  }

  // Keep first N messages (context establishment)
  const firstMessages = messageHistory.slice(0, HISTORY_KEEP_FIRST);

  // Keep last N messages (recent context)
  const lastMessages = messageHistory.slice(-HISTORY_KEEP_LAST);

  // Calculate how many messages we're skipping
  const skippedCount = messageHistory.length - HISTORY_KEEP_FIRST - HISTORY_KEEP_LAST;

  // Build the windowed history with a marker for skipped messages
  const result = firstMessages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));

  // Add a summary marker for skipped messages
  result.push({
    role: "user",
    content: `[${skippedCount} earlier messages omitted for brevity]`,
  });

  // Add recent messages
  for (const msg of lastMessages) {
    result.push({
      role: msg.role,
      content: msg.content,
    });
  }

  return result;
}

function clearWelcomeMessage() {
  const welcome = chatMessages.querySelector(".welcome-message");
  if (welcome) {
    welcome.remove();
  }
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildLists(text) {
  const lines = text.split("\n");
  let inList = false;
  const out = [];

  for (const line of lines) {
    const match = line.match(/^\s*[-*]\s+(.*)$/);
    if (match) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${match[1]}</li>`);
    } else {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      out.push(line);
    }
  }

  if (inList) {
    out.push("</ul>");
  }

  return out.join("\n");
}

function renderMarkdownLite(raw) {
  if (!raw) return "";

  const codeBlocks = [];
  let text = raw.replace(/```([\s\S]*?)```/g, (match, code) => {
    const token = `@@CODEBLOCK${codeBlocks.length}@@`;
    codeBlocks.push(`<pre><code>${escapeHtml(code.trim())}</code></pre>`);
    return token;
  });

  const inlineCode = [];
  text = text.replace(/`([^`]+)`/g, (match, code) => {
    const token = `@@INLINECODE${inlineCode.length}@@`;
    inlineCode.push(`<code>${escapeHtml(code)}</code>`);
    return token;
  });

  text = text.replace(/^(#{1,4})\s+(.*)$/gm, (match, hashes, content) => {
    const level = hashes.length;
    return `<h${level}>${content}</h${level}>`;
  });

  text = text.replace(/^>\s?(.*)$/gm, "<blockquote>$1</blockquote>");
  text = buildLists(text);
  text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/\*(.+?)\*/g, "<em>$1</em>");
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  text = text.replace(/\n{3,}/g, "\n\n"); // Collapse 3+ newlines to 2
  text = text.replace(/\n/g, "<br>");

  text = text.replace(/@@INLINECODE(\d+)@@/g, (match, index) => {
    return inlineCode[Number(index)];
  });
  text = text.replace(/@@CODEBLOCK(\d+)@@/g, (match, index) => {
    return codeBlocks[Number(index)];
  });

  return text;
}

function sanitizeHtml(rawHtml) {
  const doc = new DOMParser().parseFromString(rawHtml, "text/html");
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT);
  const nodesToRemove = [];

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const tagName = node.tagName;

    if (!ALLOWED_TAGS.has(tagName)) {
      nodesToRemove.push(node);
      continue;
    }

    const allowedAttrs = ALLOWED_ATTRS[tagName] || new Set();
    for (const attr of Array.from(node.attributes)) {
      if (!allowedAttrs.has(attr.name)) {
        node.removeAttribute(attr.name);
      }
    }

    if (tagName === "A") {
      const href = node.getAttribute("href") || "";
      const isSafe =
        href.startsWith("#") ||
        href.startsWith("/") ||
        !/^\s*javascript:/i.test(href);

      if (!isSafe) {
        node.removeAttribute("href");
      }

      if (node.getAttribute("href")) {
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", "noopener noreferrer");
      }
    }
  }

  for (const node of nodesToRemove) {
    const text = doc.createTextNode(node.textContent || "");
    node.replaceWith(text);
  }

  return doc.body.innerHTML;
}

function formatMessageContent(content) {
  const withMarkup = renderMarkdownLite(content);
  return sanitizeHtml(withMarkup);
}

function focusInput(retries = 15) {
  // Try multiple focus strategies
  requestAnimationFrame(() => {
    try {
      // Click to trigger focus (works better in some Chrome contexts)
      messageInput.click();
      messageInput.focus({ preventScroll: true });
    } catch (err) {
      messageInput.focus();
    }
  });

  if (retries <= 0 || document.activeElement === messageInput) {
    return;
  }

  setTimeout(() => {
    focusInput(retries - 1);
  }, 100);
}

async function consumePendingFocus() {
  try {
    const result = await chrome.storage.local.get("pendingFocus");
    const pendingFocus = result.pendingFocus;
    if (!pendingFocus) return;

    const age = Date.now() - pendingFocus;
    if (age < FOCUS_REQUEST_TTL_MS) {
      await chrome.storage.local.remove("pendingFocus");
      focusInput();
    } else {
      await chrome.storage.local.remove("pendingFocus");
    }
  } catch (err) {
    console.error("Error consuming pending focus:", err);
  }
}

function addMessage(role, content) {
  clearWelcomeMessage();

  const messageEl = document.createElement("div");
  messageEl.className = `message ${role}`;
  messageEl.innerHTML = formatMessageContent(content);

  chatMessages.appendChild(messageEl);
  scrollToBottom();

  messageHistory.push({ role, content });
}

function addErrorMessage(content) {
  clearWelcomeMessage();

  const messageEl = document.createElement("div");
  messageEl.className = "message error";
  messageEl.textContent = content;

  chatMessages.appendChild(messageEl);
  scrollToBottom();
}

function showTypingIndicator() {
  const indicator = document.createElement("div");
  indicator.className = "typing-indicator";
  indicator.id = "typing-indicator";
  indicator.innerHTML = "<span></span><span></span><span></span>";

  chatMessages.appendChild(indicator);
  scrollToBottom();
}

function hideTypingIndicator() {
  const indicator = document.getElementById("typing-indicator");
  if (indicator) {
    indicator.remove();
  }
}

async function sendMessage() {
  const question = messageInput.value.trim();

  if (!question) {
    return;
  }

  // Auto-extract context if not loaded
  if (!currentContext) {
    setInputEnabled(false);
    try {
      const result = await chrome.runtime.sendMessage({
        type: "extract",
        mode: "page",
      });

      if (result.error) {
        throw new Error(result.error);
      }

      currentContext = result.context;
      currentUrl = result.url;
      currentTitle = result.title;
      updateContextDisplay(result.charCount);

      // Try to create a session
      try {
        const sessionResult = await chrome.runtime.sendMessage({
          type: "create-session",
          context: currentContext,
          url: currentUrl,
          title: currentTitle,
        });
        if (sessionResult.sessionId) {
          currentSessionId = sessionResult.sessionId;
        }
      } catch (err) {
        console.warn("Session creation failed:", err);
        currentSessionId = null;
      }
    } catch (err) {
      addErrorMessage(`Failed to extract page: ${err.message}`);
      setInputEnabled(true);
      return;
    }
  }

  // Add user message
  addMessage("user", question);
  messageInput.value = "";

  setInputEnabled(false);
  showTypingIndicator();

  try {
    let result;

    // Try session-based request first if we have a session
    if (currentSessionId) {
      result = await chrome.runtime.sendMessage({
        type: "session-ask",
        sessionId: currentSessionId,
        question: question,
        provider: currentProvider,
      });

      // If session expired, fall back to regular request
      if (result.sessionExpired) {
        currentSessionId = null;
      }
    }

    // Fall back to regular request (or if session failed)
    if (!currentSessionId) {
      // Build conversation history with sliding window
      const history = getSlidingWindowHistory();

      result = await chrome.runtime.sendMessage({
        type: "ask",
        question: question,
        context: currentContext,
        url: currentUrl,
        title: currentTitle,
        history: history,
        provider: currentProvider,
      });
    }

    hideTypingIndicator();

    if (result.error) {
      throw new Error(result.error);
    }

    addMessage("assistant", result.answer);
  } catch (err) {
    hideTypingIndicator();

    let errorMessage = err.message;

    // Friendly error for connection issues
    if (
      errorMessage.includes("Failed to fetch") ||
      errorMessage.includes("NetworkError")
    ) {
      errorMessage =
        "Cannot connect to backend. Is it running at localhost:8787?";
    }

    addErrorMessage(errorMessage);
  } finally {
    setInputEnabled(true);
    messageInput.focus();
  }
}

// Event listeners
btnSend.addEventListener("click", sendMessage);

// Enter to send
messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !isProcessing) {
    e.preventDefault();
    sendMessage();
  }
});

// Handle incoming selection from context menu
async function handlePendingSelection(pending) {
  if (!pending || !pending.selectedText) return;

  // Clear the pending selection from storage
  await chrome.storage.local.remove("pendingSelection");

  // Clear all previous messages and history (fresh start with new selection)
  chatMessages.innerHTML = "";
  messageHistory = [];

  // Build context that includes both selection and page
  const selectionContext = `SELECTED TEXT:\n${pending.selectedText}\n\nFULL PAGE CONTEXT:\n${pending.pageContext}`;
  currentContext = selectionContext;
  currentUrl = pending.url;
  currentTitle = pending.title;

  // Try to create a session for this content
  try {
    const sessionResult = await chrome.runtime.sendMessage({
      type: "create-session",
      context: currentContext,
      url: currentUrl,
      title: currentTitle,
    });
    if (sessionResult.sessionId) {
      currentSessionId = sessionResult.sessionId;
    }
  } catch (err) {
    console.warn("Session creation failed:", err);
    currentSessionId = null;
  }

  // Update display
  updateContextDisplay(currentContext.length);

  // Show the selection as a message in the chat
  const selectionText =
    pending.selectedText.length > 500
      ? pending.selectedText.substring(0, 500) + "..."
      : pending.selectedText;

  const selectionMsg = document.createElement("div");
  selectionMsg.className = "message selection";
  selectionMsg.textContent = `📋 Selected text:\n"${selectionText}"`;
  chatMessages.appendChild(selectionMsg);

  // Update placeholder and focus
  messageInput.placeholder = "Ask about this selection...";

  // Multiple focus attempts with increasing delays for panel initialization
  focusInput();
  setTimeout(() => focusInput(), 200);
  setTimeout(() => focusInput(), 500);
}

// Check for pending selection from context menu
async function checkPendingSelection() {
  try {
    const result = await chrome.storage.local.get("pendingSelection");
    const pending = result.pendingSelection;

    if (pending && pending.timestamp) {
      // Only use if recent (within last 10 seconds)
      const age = Date.now() - pending.timestamp;
      if (age < 10000) {
        await handlePendingSelection(pending);
      } else {
        // Clear stale pending selection
        await chrome.storage.local.remove("pendingSelection");
      }
    }
  } catch (err) {
    console.error("Error checking pending selection:", err);
  }
}

// Listen for storage changes (when selection comes in while panel is open)
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.pendingSelection?.newValue) {
    const pending = changes.pendingSelection.newValue;
    // Only handle recent selections
    const age = Date.now() - pending.timestamp;
    if (age < 10000) {
      handlePendingSelection(pending);
    }
  }

  if (areaName === "local" && changes.pendingFocus?.newValue) {
    focusInput();
    setTimeout(() => focusInput(), 200);
    setTimeout(() => focusInput(), 500);
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "focus-input") {
    focusInput();
    setTimeout(() => focusInput(), 200);
    setTimeout(() => focusInput(), 500);
  }
});

// Provider selection handling
async function loadProviderPreference() {
  try {
    const result = await chrome.storage.local.get("selectedProvider");
    if (result.selectedProvider) {
      currentProvider = result.selectedProvider;
      providerSelect.value = currentProvider;
    }
  } catch (err) {
    console.error("Error loading provider preference:", err);
  }
}

async function saveProviderPreference(provider) {
  try {
    await chrome.storage.local.set({ selectedProvider: provider });
  } catch (err) {
    console.error("Error saving provider preference:", err);
  }
}

async function checkAvailableProviders() {
  try {
    const response = await fetch("http://localhost:8787/health");
    if (!response.ok) return;

    const data = await response.json();
    availableProviders = data.providers || [];

    // Update dropdown options
    const codexOption = providerSelect.querySelector('option[value="codex"]');
    const claudeOption = providerSelect.querySelector('option[value="claude"]');

    if (codexOption) {
      if (!data.codex_available) {
        codexOption.textContent = "Codex (not configured)";
        codexOption.disabled = true;
      } else {
        codexOption.textContent = "Codex";
        codexOption.disabled = false;
      }
    }

    if (claudeOption) {
      if (!data.claude_available) {
        claudeOption.textContent = "Claude (not configured)";
        claudeOption.disabled = true;
      } else {
        claudeOption.textContent = "Claude";
        claudeOption.disabled = false;
      }
    }

    // If current provider is not available, switch to first available
    if (!availableProviders.includes(currentProvider) && availableProviders.length > 0) {
      currentProvider = availableProviders[0];
      providerSelect.value = currentProvider;
      await saveProviderPreference(currentProvider);
    }
  } catch (err) {
    // Backend not running, leave dropdown as-is
    console.error("Error checking providers:", err);
  }
}

providerSelect.addEventListener("change", async (e) => {
  currentProvider = e.target.value;
  await saveProviderPreference(currentProvider);
});

// Initial state
updateContextDisplay(0);
messageInput.placeholder = "Ask a question about this page...";
focusInput();
checkPendingSelection();
consumePendingFocus();
loadProviderPreference().then(() => checkAvailableProviders());

window.addEventListener("focus", () => {
  focusInput();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    focusInput();
  }
});
