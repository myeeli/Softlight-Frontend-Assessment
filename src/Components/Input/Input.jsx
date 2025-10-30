import React, { useState } from "react";
import { generateCssFromFrame, generateHtmlFromFrame } from "../Output/DownloadFiles";
import { saveAs } from "file-saver";
import styles from "./Input.module.css";   

export default function Input() {
  // Stores the URL entered by the user
  const [input, setInput] = useState("");

  // Figma personal access token stored in .env
  const token = process.env.REACT_APP_FIGMA_TOKEN;

  /**
   * Checks if the given URL is a valid Figma design link.
   */
  const isFigmaUrl = (url) => {
    try {
      const u = new URL(url.trim());
      return u.hostname.includes("figma.com") && /\/design\/[A-Za-z0-9]+/.test(u.pathname);
    } catch {
      return false;
    }
  };

  /**
   * Extracts the Figma file key from the URL.
   * Example: https://www.figma.com/design/ABC123/... → "ABC123"
   */
  const extractKey = (url) => {
    const m = url.match(/\/design\/([A-Za-z0-9]+)(?:\/|$)/);
    return m ? m[1] : null;
  };

  /**
   * Called when the user clicks "Download Files".
   * Fetches the Figma file → extracts a frame → converts to HTML + CSS → downloads them.
   */
  const handleSubmit = async () => {
    if (!isFigmaUrl(input)) return alert("Enter a valid Figma design URL.");
    if (!token) return alert("Issue with FIGMA_TOKEN");

    try {
      const key = extractKey(input);

      // Step 1: Fetch entire Figma file structure
      const response = await fetch(`https://api.figma.com/v1/files/${key}`, {
        headers: { "X-Figma-Token": token },
      });
      const file = await response.json();

      // Select first frame in the first canvas
      const canvas = file.document.children?.[0];
      const frame = canvas?.children?.find((n) => n.type === "FRAME") || canvas?.children?.[0];

      const frameId = frame.id;

      // Step 2: Fetch detailed node info, including styles and layout
      const nodesRes = await fetch(
        `https://api.figma.com/v1/files/${key}/nodes?ids=${encodeURIComponent(frameId)}&depth=4`,
        { headers: { "X-Figma-Token": token } }
      );
      const nodesJson = await nodesRes.json();
      const frameNode = nodesJson?.nodes?.[frameId]?.document;

      // Step 3: Convert frame to HTML and CSS strings
      const html = generateHtmlFromFrame(frameNode);
      const css = generateCssFromFrame(frameNode);

      // Step 4: Trigger downloads
      downloadFile("index.html", html);
      downloadFile("styles.css", css);
    } catch (e) {
      console.error(e);
    }
  };

  /**
   * Creates a downloadable file in the browser.
   */
  const downloadFile = (filename, text, type) => {
    const blob = new Blob([text], { type });
    saveAs(blob, filename);
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <input
          className={styles.inputField}
          type="text"
          placeholder="Enter URL here"
          onChange={(e) => setInput(e.target.value)}
        />
        <button className={styles.button} onClick={handleSubmit}>
          Download Files
        </button>
      </div>
    </div>
  );
}
