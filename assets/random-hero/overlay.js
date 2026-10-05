/* Random hero overlay: preserves the article and its existing hero underneath. */
(() => {
  "use strict";
  const ASSIGNMENT_URL = "/assets/random-hero/assignment.json";
  const IMAGE_ROOT = "/assets/random-hero/";
  const SHOW_FOR_MS = 30 * 60 * 1000;
  const POSITION = "center 28%";
  const pagePath = window.location.pathname;

  fetch(ASSIGNMENT_URL, { cache: "no-cache" })
    .then((response) => {
      if (!response.ok) throw new Error("Assignment file HTTP " + response.status);
      return response.json();
    })
    .then((data) => {
      const filename = data.assignments && data.assignments[pagePath];
      if (!filename || !/^Hossein_\d{3}\.webp$/.test(filename)) return;

      const overlay = document.createElement("div");
      overlay.setAttribute("role", "button");
      overlay.setAttribute("aria-label", "برای دیدن مقاله لمس کنید");
      overlay.tabIndex = 0;
      Object.assign(overlay.style, {
        position: "fixed",
        inset: "0",
        zIndex: "2147483647",
        overflow: "hidden",
        background: "#111",
        cursor: "pointer",
        touchAction: "manipulation"
      });

      const image = document.createElement("img");
      image.src = IMAGE_ROOT + filename;
      image.alt = (data.altTexts && data.altTexts[pagePath]) || "پرترهٔ حسین عطار جان‌نثار نوبری";
      image.draggable = false;
      Object.assign(image.style, {
        display: "block",
        width: "100%",
        height: "100%",
        objectFit: "cover",
        objectPosition: POSITION
      });
      overlay.appendChild(image);

      let dismissed = false;
      const dismiss = () => {
        if (dismissed) return;
        dismissed = true;
        overlay.remove();
      };
      overlay.addEventListener("pointerdown", dismiss, { once: true });
      overlay.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") dismiss();
      });
      document.body.appendChild(overlay);
      window.setTimeout(dismiss, SHOW_FOR_MS);
    })
    .catch((error) => console.error("Random hero overlay failed:", error));
})();
