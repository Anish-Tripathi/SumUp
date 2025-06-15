function getArticleText() {
  // Try common article selectors first
  const articleSelectors = [
    "article",
    ".article",
    ".post",
    ".content",
    ".main-content",
    '[itemprop="articleBody"]',
    "#article",
    "#content",
  ];

  for (const selector of articleSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      // Clean up the text by removing unnecessary whitespace and elements
      const clone = element.cloneNode(true);

      // Remove elements that typically don't contain main content
      const unwantedElements = clone.querySelectorAll(
        "nav, footer, aside, .ad, .sidebar, .comments, .related, script, style, iframe"
      );
      unwantedElements.forEach((el) => el.remove());

      return clone.innerText.trim();
    }
  }

  // Fallback: Use a more sophisticated approach for pages without clear article structure
  const mainContentSelectors = [
    "main",
    "#main",
    ".main",
    ".entry-content",
    ".post-content",
  ];

  for (const selector of mainContentSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      return element.innerText.trim();
    }
  }

  // Final fallback: Combine all paragraphs with heuristic filtering
  const paragraphs = Array.from(document.querySelectorAll("p, div"));
  const text = paragraphs
    .map((p) => p.innerText.trim())
    .filter(
      (text) =>
        text.length > 50 && // Minimum length
        !text.includes("©") && // Copyright notices
        !text.includes("Privacy Policy") && // Common footer text
        !text.match(/^[0-9]+ of [0-9]+$/) // Pagination
    )
    .join("\n\n");

  return text || document.body.innerText.trim();
}

// Detect language from the page's HTML lang attribute or content
function detectPageLanguage() {
  // Check HTML lang attribute
  const htmlLang = document.documentElement.lang;
  if (htmlLang) {
    return htmlLang.substring(0, 2); // Just the primary language code
  }

  // Check meta tags
  const metaLang = document.querySelector(
    'meta[http-equiv="content-language"]'
  );
  if (metaLang) {
    return metaLang.getAttribute("content").substring(0, 2);
  }

  // Fallback: analyze text content (simple approach)
  const text = document.body.innerText.substring(0, 1000);
  const englishRatio = (text.match(/[a-zA-Z]/g) || []).length;
  const nonEnglishRatio = (text.match(/[^\x00-\x7F]/g) || []).length;

  return nonEnglishRatio > englishRatio ? "auto" : "en";
}

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.type === "GET_ARTICLE_TEXT") {
    const text = getArticleText();
    sendResponse({
      text,
      language: detectPageLanguage(),
      url: window.location.href,
      title: document.title,
    });
  }
  return true; // Required for async sendResponse
});
