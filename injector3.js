(async function() {
    const scriptUrl = "https://raw.githubusercontent.com/darort/blockname/main/content3.js";

    try {
        const response = await fetch(scriptUrl);
        const scriptText = await response.text();
        
        // Create a new script element and inject it into the webpage
        const script = document.createElement("script");
        script.textContent = scriptText;
        document.documentElement.appendChild(script);

        console.log("✅ Content script loaded from GitHub.");
    } catch (error) {
        console.error("❌ Failed to load content3.js:", error);
    }
})();
