// Global variable to store current summary
let currentSummary = null;

document.addEventListener("DOMContentLoaded", function () {
  // Initialize tab functionality
  setupTabs();

  // Load history if on history tab
  const historyTab = document.querySelector("#history-tab");
  if (historyTab && historyTab.classList.contains("active")) {
    loadHistory();
  }

  // Initialize event listeners
  initializeEventListeners();
});

function initializeEventListeners() {
  // Summarize button
  const summarizeBtn = document.getElementById("summarize");
  if (summarizeBtn) {
    summarizeBtn.addEventListener("click", summarizeHandler);
  }

  // Detect language button
  const detectLangBtn = document.getElementById("detect-lang");
  if (detectLangBtn) {
    detectLangBtn.addEventListener("click", detectLangHandler);
  }

  // Download button
  const downloadBtn = document.getElementById("download-btn");
  if (downloadBtn) {
    downloadBtn.addEventListener("click", downloadHandler);
  }

  // Save Button
  const saveHistoryBtn = document.getElementById("save-history-btn");
  if (saveHistoryBtn) {
    saveHistoryBtn.addEventListener("click", saveHistoryHandler);
  }

  // Copy button
  const copyBtn = document.getElementById("copy-btn");
  if (copyBtn) {
    copyBtn.addEventListener("click", copyHandler);
  }

  // Follow-up button
  const followupBtn = document.getElementById("followup-btn");
  if (followupBtn) {
    followupBtn.addEventListener("click", followupHandler);
  }

  // Clear history button
  const clearHistoryBtn = document.getElementById("clear-history");
  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener("click", clearHistoryHandler);
  }
}

// Tab functionality
function setupTabs() {
  const tabs = document.querySelectorAll(".tab-btn");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      // Remove active class from all tabs and content
      document
        .querySelectorAll(".tab-btn")
        .forEach((t) => t.classList.remove("active"));
      document
        .querySelectorAll(".tab-content")
        .forEach((c) => c.classList.remove("active"));

      // Add active class to clicked tab and corresponding content
      tab.classList.add("active");
      const tabId = tab.getAttribute("data-tab");
      const tabContent = document.getElementById(tabId);
      if (tabContent) {
        tabContent.classList.add("active");
      }

      // Load history if history tab is selected
      if (tabId === "history-tab") {
        loadHistory();
      }
    });
  });
}

// Handler functions
async function summarizeHandler() {
  const resultDiv = document.getElementById("result");
  if (!resultDiv) return;

  resultDiv.innerHTML =
    '<div class="loading"><div class="loader"></div><div>Generating summary...</div></div>';

  const summaryType =
    document.getElementById("summary-type")?.value || "detailed";
  const language = document.getElementById("language-select")?.value || "";

  try {
    const result = await chrome.storage.sync.get(["geminiApiKey"]);
    if (!result.geminiApiKey) {
      resultDiv.innerHTML = `
        <div class="error-state">
          API key not found. Please set your API key in the extension options.
        </div>
      `;
      return;
    }

    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab) {
      resultDiv.innerHTML = `
        <div class="error-state">
          Could not access the current tab.
        </div>
      `;
      return;
    }

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "GET_ARTICLE_TEXT",
    });
    if (!response?.text) {
      resultDiv.innerHTML = `
        <div class="error-state">
          Could not extract article text from this page.
        </div>
      `;
      return;
    }

    const summary = await getGeminiSummary(
      response.text,
      summaryType,
      result.geminiApiKey,
      language
    );

    // In the summarizeHandler function, modify the bullet point formatting section:
    if (summaryType === "bullets") {
      // Split by new lines and filter out empty lines
      const bulletPoints = summary
        .split("\n")
        .filter((line) => line.trim().length > 0);

      // Create HTML for each bullet point
      resultDiv.innerHTML = bulletPoints
        .map((line) => {
          // Clean up the line by removing any extra bullet characters
          const cleanedLine = line.replace(/^[â—•\s]+/, "").trim();
          return `<div class="bullet-point">${cleanedLine}</div>`;
        })
        .join("");
    } else {
      resultDiv.innerHTML = summary;
    }

    // Enable action buttons
    const copyBtn = document.getElementById("copy-btn");
    const downloadBtn = document.getElementById("download-btn");
    const saveHistoryBtn = document.getElementById("save-history-btn");
    if (saveHistoryBtn) saveHistoryBtn.disabled = false;
    if (copyBtn) copyBtn.disabled = false;
    if (downloadBtn) downloadBtn.disabled = false;

    // Store the current summary for potential saving
    currentSummary = {
      text: summary,
      type: summaryType,
      language: language,
      url: tab.url,
      title: tab.title,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    resultDiv.innerHTML = `
      <div class="error-state">
        Error: ${error.message || "Failed to generate summary."}
      </div>
    `;
  }
}

async function detectLangHandler() {
  showStatusMessage("Detecting language...", 3000);

  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab) {
      showStatusMessage("Could not access the current tab.", 3000);
      return;
    }

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "GET_ARTICLE_TEXT",
    });
    if (!response?.text) {
      showStatusMessage("Could not extract text for language detection.", 3000);
      return;
    }

    const detectedLanguage = await detectLanguage(response.text);
    showStatusMessage(`Detected language: ${detectedLanguage}`, 3000);

    // Auto-select the detected language in the dropdown if available
    const langSelect = document.getElementById("language-select");
    if (langSelect) {
      const options = Array.from(langSelect.options);
      const matchingOption = options.find(
        (opt) =>
          opt.value.toLowerCase() === detectedLanguage.toLowerCase() ||
          opt.text.toLowerCase() === detectedLanguage.toLowerCase()
      );

      if (matchingOption) {
        matchingOption.selected = true;
      }
    }
  } catch (error) {
    showStatusMessage(`Error detecting language: ${error.message}`, 3000);
  }
}

async function saveToHistory(summary) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(["savedSummaries"], (result) => {
      const savedSummaries = result.savedSummaries || [];
      savedSummaries.push(summary);
      chrome.storage.sync.set({ savedSummaries: savedSummaries }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  });
}

function downloadHandler() {
  const resultDiv = document.getElementById("result");
  if (!resultDiv) return;

  const summaryText = resultDiv.innerText;
  if (!summaryText || summaryText.trim() === "") {
    showStatusMessage("No summary to download.", 2000);
    return;
  }

  const summaryType =
    document.getElementById("summary-type")?.value || "detailed";
  const language = document.getElementById("language-select")?.value || "";
  const langSelect = document.getElementById("language-select");
  const langName =
    langSelect?.options[langSelect.selectedIndex]?.text || "English";

  const typeNames = {
    detailed: "In-Depth",
    brief: "Concise",
    bullets: "KeyPoints",
  };

  const fileName = `SumUp_${typeNames[summaryType]}_${langName}_${new Date()
    .toISOString()
    .slice(0, 10)}.txt`;

  const blob = new Blob([summaryText], { type: "text/plain" });
  const url = URL.createObjectURL(blob);

  chrome.downloads.download(
    {
      url: url,
      filename: fileName,
      saveAs: true,
    },
    () => {
      if (chrome.runtime.lastError) {
        showStatusMessage(
          "Download failed: " + chrome.runtime.lastError.message,
          2000
        );
      } else {
        showStatusMessage("Summary downloaded!", 2000);
      }
      URL.revokeObjectURL(url);
    }
  );
}

async function saveHistoryHandler() {
  if (!currentSummary) {
    showStatusMessage("No summary to save", 2000);
    return;
  }

  try {
    await saveToHistory(currentSummary);
    showStatusMessage("Summary saved to history!", 2000);
    // Refresh history tab if it's open
    if (document.querySelector("#history-tab.active")) {
      loadHistory();
    }
  } catch (error) {
    showStatusMessage("Failed to save: " + error.message, 2000);
  }
}

function copyHandler() {
  const resultDiv = document.getElementById("result");
  if (!resultDiv) return;

  const summaryText = resultDiv.innerText;
  if (summaryText && summaryText.trim() !== "") {
    navigator.clipboard
      .writeText(summaryText)
      .then(() => {
        const copyBtn = document.getElementById("copy-btn");
        if (copyBtn) {
          const originalText = copyBtn.innerText;
          copyBtn.innerText = "Copied!";
          setTimeout(() => {
            copyBtn.innerText = originalText;
          }, 2000);
        }
      })
      .catch((err) => {
        showStatusMessage("Failed to copy text", 2000);
        console.error("Failed to copy text: ", err);
      });
  }
}

async function followupHandler() {
  const questionInput = document.getElementById("followup-input");
  if (!questionInput) return;

  const question = questionInput.value.trim();
  const resultDiv = document.getElementById("result");
  if (!resultDiv) return;

  const context = resultDiv.innerText;
  if (!question) {
    showStatusMessage("Please enter a question", 2000);
    return;
  }

  if (!context || context.includes("Could not extract")) {
    showStatusMessage("Please summarize an article first", 2000);
    return;
  }

  resultDiv.innerHTML =
    '<div class="loading"><div class="loader"></div><div>Generating answer...</div></div>';

  try {
    const result = await chrome.storage.sync.get(["geminiApiKey"]);
    if (!result.geminiApiKey) {
      resultDiv.innerHTML = `
        <div class="error-state">
          API key not found. Please set your API key in the extension options.
        </div>
      `;
      return;
    }

    const response = await askFollowupQuestion(
      context,
      question,
      result.geminiApiKey
    );
    resultDiv.innerHTML = response;
  } catch (error) {
    resultDiv.innerHTML = `
      <div class="error-state">
        Error: ${error.message || "Failed to answer follow-up."}
      </div>
    `;
  }
}

function clearHistoryHandler() {
  if (confirm("Are you sure you want to clear all saved summaries?")) {
    chrome.storage.sync.set({ savedSummaries: [] }, () => {
      loadHistory();
      showStatusMessage("History cleared", 2000);
    });
  }
}

// Helper functions
function showStatusMessage(message, duration = 3000) {
  const statusMessage = document.getElementById("status-message");
  statusMessage.textContent = message;
  statusMessage.classList.add("show");

  setTimeout(() => {
    statusMessage.classList.remove("show");
  }, duration);
}

function getSummaryTypeName(type) {
  const typeNames = {
    detailed: "In-Depth",
    brief: "Concise",
    bullets: "Key Points",
  };
  return typeNames[type] || type;
}

function getLanguageName(code) {
  const langNames = {
    "": "English",
    hi: "Hindi",
    fr: "French",
    es: "Spanish",
    de: "German",
    zh: "Chinese",
  };
  return langNames[code] || code;
}

function loadHistory() {
  chrome.storage.sync.get(["savedSummaries"], (result) => {
    const historyList = document.getElementById("history-list");
    historyList.innerHTML = "";

    const savedSummaries = result.savedSummaries || [];

    if (savedSummaries.length === 0) {
      historyList.innerHTML =
        '<li class="no-history">No saved summaries yet.</li>';
      return;
    }

    // Sort by timestamp (newest first)
    savedSummaries.sort(
      (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
    );

    savedSummaries.forEach((summary, index) => {
      const li = document.createElement("li");
      li.className = "history-item";

      const summaryPreview = document.createElement("div");
      summaryPreview.className = "history-preview";
      summaryPreview.textContent =
        summary.text.length > 100
          ? summary.text.substring(0, 100) + "..."
          : summary.text;

      const metaInfo = document.createElement("div");
      metaInfo.className = "history-meta";

      const title = document.createElement("div");
      title.className = "history-title";
      title.textContent = summary.title || `Summary ${index + 1}`;

      const details = document.createElement("div");
      details.className = "history-details";
      details.innerHTML = `
        <span>${getSummaryTypeName(summary.type)}</span> • 
        <span>${getLanguageName(summary.language)}</span> • 
        <span>${new Date(summary.timestamp).toLocaleDateString()}</span>
      `;

      const actions = document.createElement("div");
      actions.className = "history-actions";

      const viewBtn = document.createElement("button");
      viewBtn.textContent = "View";
      viewBtn.style.padding = "4px 8px"; // reduced padding
      viewBtn.style.marginRight = "6px"; // add margin between buttons
      viewBtn.addEventListener("click", () => {
        document.getElementById("summarize-tab").click();
        document.getElementById("result").innerText = summary.text;
        currentSummary = summary;
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.textContent = "Delete";
      deleteBtn.style.padding = "4px 8px"; // reduced padding
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteSummary(index);
      });

      actions.appendChild(viewBtn);
      actions.appendChild(deleteBtn);

      metaInfo.appendChild(title);
      metaInfo.appendChild(details);

      li.appendChild(metaInfo);
      li.appendChild(summaryPreview);
      li.appendChild(actions);

      historyList.appendChild(li);
    });
  });
}

function deleteSummary(index) {
  chrome.storage.sync.get(["savedSummaries"], (result) => {
    const savedSummaries = result.savedSummaries || [];
    if (index >= 0 && index < savedSummaries.length) {
      savedSummaries.splice(index, 1);
      chrome.storage.sync.set({ savedSummaries: savedSummaries }, () => {
        loadHistory();
        showStatusMessage("Summary deleted", 2000);
      });
    }
  });
}

async function detectLanguage(text) {
  const sampleText = text.substring(0, 500);
  const languagePatterns = {
    en: /[a-zA-Z]/g,
    hi: /[\u0900-\u097F]/g,
    fr: /[éèêëàâùûüîïôœç]/gi,
    es: /[áéíóúüñ]/gi,
    de: /[äöüß]/gi,
    zh: /[\u4e00-\u9FFF]/g,
  };

  const scores = {};
  for (const [lang, pattern] of Object.entries(languagePatterns)) {
    const matches = sampleText.match(pattern);
    scores[lang] = matches ? matches.length : 0;
  }

  const detectedLang = Object.keys(scores).reduce((a, b) =>
    scores[a] > scores[b] ? a : b
  );

  const langNames = {
    en: "English",
    hi: "Hindi",
    fr: "French",
    es: "Spanish",
    de: "German",
    zh: "Chinese",
  };

  return langNames[detectedLang] || "English";
}

// Gemini API functions
async function getGeminiSummary(text, summaryType, apiKey, language = "en") {
  const maxLength = 20000;
  const truncatedText =
    text.length > maxLength ? text.substring(0, maxLength) + "..." : text;

  let summaryInstruction;
  switch (summaryType) {
    case "brief":
      summaryInstruction =
        "Provide a brief summary of the following article in 2–3 sentences.";
      break;
    case "detailed":
      summaryInstruction =
        "Provide a detailed summary of the following article, covering all main points and key details.";
      break;
    case "bullets":
      summaryInstruction =
        "Summarize the following article in 5–7 key points. Format each point as a separate line starting with ● (a dark circle followed by a space). Do not use dashes or asterisks—only use the dark circle. Keep each point concise and focused on a single key insight.";
      break;
    default:
      summaryInstruction = "Summarize the following article.";
  }

  const languageInstructions = {
    hi: "Output must be in Hindi.",
    es: "Output must be in Spanish.",
    fr: "Output must be in French.",
    de: "Output must be in German.",
    zh: "Output must be in Simplified Chinese.",
  };

  if (language && languageInstructions[language]) {
    summaryInstruction += ` ${languageInstructions[language]}`;
  }

  const prompt = `${summaryInstruction}\n\n${truncatedText}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2 },
        }),
      }
    );

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error?.message || "API request failed");
    }

    const data = await res.json();
    return (
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "No summary available."
    );
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    throw new Error("Failed to generate summary. Please try again later.");
  }
}

async function askFollowupQuestion(context, question, apiKey) {
  const prompt = `You previously summarized this article:\n\n"${context}"\n\nNow answer the following question based on it:\n\n"${question}"`;
  return await callGeminiAPI(prompt, apiKey);
}

async function callGeminiAPI(prompt, apiKey) {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2 },
        }),
      }
    );

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error?.message || "API request failed");
    }

    const data = await res.json();
    return (
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "No response available."
    );
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    throw new Error("Failed to get response from Gemini API.");
  }
}
