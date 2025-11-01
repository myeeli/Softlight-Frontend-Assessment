import React, { useState } from "react";
import { generateCssFromFrame, generateHtmlFromFrame } from "../Output/DownloadFiles";
import { saveAs } from "file-saver";
import styles from "./Input.module.css";

export default function Input() {
  // Stores the URL entered by the user
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  // Figma personal access token stored in .env
  const token = process.env.REACT_APP_FIGMA_TOKEN;

  /**
   * Checks if the given URL is a valid Figma design link.
   */
  const isFigmaUrl = (url) => {
    try {
      const u = new URL(url.trim());
      if (!u.hostname.endsWith("figma.com")) return false;
      return /\/[A-Za-z0-9]{22}(\/|$)/.test(u.pathname);
    } catch {
      return false;
    }
  };

  /**
   * Extracts the Figma file key from the URL.
   * Example: https://www.figma.com/design/ABC123/... → "ABC123"
   */
  const extractKey = (url) => {
    try {
      const m = url.match(/\/([A-Za-z0-9]{22})(\/|$)/);
      return m ? m[1] : null;
    } catch {
      return null;
    }
  };

  /**
   * Called when the user clicks "Download Files".
   * Fetches the Figma file → extracts a frame → converts to HTML + CSS → downloads them.
   */
  const downloadFile = (filename, text, type) => {
    const blob = new Blob([text], { type });
    saveAs(blob, filename);
  };

  // Picks the largest good node (used when we need just one)
  const pickBestExportNode = (root) => {
    if (!root) return null;
    const primary = new Set(["FRAME", "COMPONENT", "INSTANCE"]);
    const secondary = new Set(["SECTION", "GROUP"]);
    const area = (n) =>
      n?.absoluteBoundingBox
        ? (n.absoluteBoundingBox.width || 0) * (n.absoluteBoundingBox.height || 0)
        : 0;

    const q = [root];
    let bestP = null,
      bestS = null;
    while (q.length) {
      const n = q.shift();
      if (!n) continue;
      const a = area(n);
      if (primary.has(n.type)) {
        if (!bestP || a > bestP.area) bestP = { node: n, area: a };
      } else if (secondary.has(n.type)) {
        if (!bestS || a > bestS.area) bestS = { node: n, area: a };
      }
      if (Array.isArray(n.children)) q.push(...n.children);
    }
    return bestP?.node || bestS?.node || null;
  };

  // Gets all top-level screens under pages (FRAME / COMPONENT / INSTANCE / SECTION)
  const getAllTopScreens = (doc) => {
    const out = [];
    const isScreen = new Set(["FRAME", "COMPONENT", "INSTANCE", "SECTION"]);
    const pages = (doc.children || []).filter((c) => c.type === "CANVAS" || c.type === "PAGE");
    pages.forEach((p) => {
      (p.children || []).forEach((n) => {
        if (n.visible === false) return;
        if (isScreen.has(n.type) && n.absoluteBoundingBox) out.push(n);
      });
    });
    return out;
  };

  const collectIds = (node, acc = new Set()) => {
    if (!node || node.visible === false) return acc;

    const needsImage = () => {
      // if a node contains IMAGE fills or is a vector-type shape, convert it to an image output
      const fills = Array.isArray(node.fills) ? node.fills : [];
      const hasImageFill = fills.some((f) => f?.type === "IMAGE" && f.visible !== false);
      const vectorish = new Set([
        "ELLIPSE",
        "VECTOR",
        "LINE",
        "STAR",
        "POLYGON",
        "BOOLEAN_OPERATION",
        "REGULAR_POLYGON",
        "ARROW",
      ]);
      return hasImageFill || vectorish.has(node.type);
    };

    if (needsImage() && node.id) acc.add(node.id);
    (node.children || []).forEach((c) => collectIds(c, acc));
    return acc;
  };

  // Fetch /images to get signed PNG URLs for the node ids
  const fetchImageUrls = async (fileKey, ids, scale = 2) => {
    if (!ids.size) return {};
    const idsCsv = Array.from(ids).join(",");
    const resp = await fetch(
      `https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(
        idsCsv
      )}&format=png&scale=${scale}`,
      { headers: { "X-Figma-Token": token } }
    );
    const json = await resp.json();
    return json?.images || {};
  };

  // makes a simple safe file name
  const safeName = (s, fb = "screen") =>
    String(s || fb).replace(/[:*?"<>|\\/]/g, "_").replace(/\s+/g, "-").slice(0, 80);

  const handleSubmit = async () => {
    if (!isFigmaUrl(input)) return alert("Enter a valid Figma URL.");
    if (!token) return alert("Missing REACT_APP_FIGMA_TOKEN");

    setBusy(true);
    try {
      const key = extractKey(input);
      if (!key) throw new Error("Could not extract file key from URL.");

      // Step 1: Fetch entire Figma file structure
      const fileRes = await fetch(`https://api.figma.com/v1/files/${key}`, {
        headers: { "X-Figma-Token": token },
      });
      const fileJson = await fileRes.json();

      // Step 2: Find all top-level screens
      const screens = getAllTopScreens(fileJson.document);
      if (!screens.length) {
        // fallback to a single best pick if none found
        const one = pickBestExportNode(fileJson.document);
        if (!one) throw new Error("No exportable frame found.");
        screens.push(one);
      }

      // Step 3..6: For each screen, build and download files
      for (const screen of screens) {
        const rootId = screen.id;

        // Step 3: Fetch the subtree with depth and styles resolved
        const nodesRes = await fetch(
          `https://api.figma.com/v1/files/${key}/nodes?ids=${encodeURIComponent(rootId)}&depth=20`,
          { headers: { "X-Figma-Token": token } }
        );
        const nodesJson = await nodesRes.json();
        const frameNode = nodesJson?.nodes?.[rootId]?.document;
        if (!frameNode) continue;

        // Step 4: Collect ids to convert to images (images/vectors) and fetch PNG URLs
        const ids = collectIds(frameNode);
        const imagesMap = await fetchImageUrls(key, ids, 2);

        // Step 5: Generate HTML/CSS with images
        const base = safeName(frameNode.name || rootId);
        const cssFileName = `${base}.css`;
        const html = generateHtmlFromFrame(frameNode, imagesMap, cssFileName);
        const css = generateCssFromFrame(frameNode, imagesMap);

        // Step 6: Download files
        const htmlFileName = `${base}.html`;
        downloadFile(htmlFileName, html, "text/html;charset=utf-8");
        downloadFile(cssFileName, css, "text/css;charset=utf-8");
      }
    } catch (err) {
      console.error(err);
      alert(err.message || "Unexpected error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <input
          className={styles.inputField}
          type="text"
          placeholder="Paste any Figma template link"
          onChange={(e) => setInput(e.target.value)}
          value={input}
        />
        <button className={styles.button} onClick={handleSubmit} disabled={busy}>
          {busy ? "Generating…" : "Download Files"}
        </button>
      </div>
    </div>
  );
}
