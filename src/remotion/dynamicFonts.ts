import { useEffect, useState } from "react";
import { delayRender, continueRender } from "remotion";

const loadedFamilies = new Set<string>();

// Loads arbitrary Google Fonts by family name at render time (not known ahead
// of time — the `fonts` table is user-extensible), via the CSS2 API. Merely
// linking the stylesheet doesn't force the browser to download glyph data, so
// we explicitly call document.fonts.load() per family before continuing.
export function useDynamicGoogleFonts(families: string[]) {
  const unique = Array.from(new Set(families.filter(Boolean)));
  const [handle] = useState(() => delayRender(`Loading fonts: ${unique.join(", ")}`));

  useEffect(() => {
    const toLoad = unique.filter((f) => !loadedFamilies.has(f));
    if (toLoad.length === 0) {
      continueRender(handle);
      return;
    }

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?${toLoad
      .map((f) => `family=${encodeURIComponent(f)}:wght@400;700;800`)
      .join("&")}&display=swap`;

    const finish = async () => {
      try {
        await Promise.all(toLoad.map((f) => document.fonts.load(`800 24px "${f}"`)));
      } catch {
        // Fall through — continue anyway rather than hang the render.
      }
      toLoad.forEach((f) => loadedFamilies.add(f));
      continueRender(handle);
    };

    link.onload = finish;
    link.onerror = finish;
    document.head.appendChild(link);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle]);
}
