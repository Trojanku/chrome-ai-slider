// Side panel logic for ai-slider chat interface

const messageInput = document.getElementById("message-input");
const btnPage = document.getElementById("btn-page");
const btnSend = document.getElementById("btn-send");
const contextIndicator = document.getElementById("context-indicator");
const chatMessages = document.getElementById("chat-messages");

// State
let currentContext = null;
let currentUrl = null;
let currentTitle = null;
let messageHistory = [];
let isProcessing = false;

function setInputEnabled(enabled) {
  messageInput.disabled = !enabled;
  btnSend.disabled = !enabled;
  btnPage.disabled = !enabled;
  isProcessing = !enabled;
}

function updateContextDisplay(charCount) {
  if (charCount > 0) {
    contextIndicator.textContent = `${charCount.toLocaleString()} chars`;
    contextIndicator.classList.remove("hidden");
    btnPage.classList.add("loaded");
  } else {
    contextIndicator.classList.add("hidden");
    btnPage.classList.remove("loaded");
  }
}

function scrollToBottom() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function clearWelcomeMessage() {
  const welcome = chatMessages.querySelector(".welcome-message");
  if (welcome) {
    welcome.remove();
  }
}

function addMessage(role, content) {
  clearWelcomeMessage();

  const messageEl = document.createElement("div");
  messageEl.className = `message ${role}`;
  // SECURITY: Always use textContent to prevent XSS
  messageEl.textContent = content;

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

async function extractContent() {
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
  } catch (err) {
    addErrorMessage(`Failed to extract: ${err.message}`);
    currentContext = null;
    updateContextDisplay(0);
  } finally {
    setInputEnabled(true);
    messageInput.focus();
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
    const result = await chrome.runtime.sendMessage({
      type: "ask",
      question: question,
      context: currentContext,
      url: currentUrl,
      title: currentTitle,
    });

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
btnPage.addEventListener("click", extractContent);
btnSend.addEventListener("click", sendMessage);

// Enter to send
messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !isProcessing) {
    e.preventDefault();
    sendMessage();
  }
});

// Initial state
updateContextDisplay(0);
messageInput.focus();
