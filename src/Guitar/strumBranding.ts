function setHeadLink(rel: string, href: string) {
  const link = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`) ?? document.createElement("link");
  link.rel = rel;
  link.href = href;
  document.head.appendChild(link);
}

function setHeadMeta(name: string, content: string) {
  const meta = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`) ?? document.createElement("meta");
  meta.name = name;
  meta.content = content;
  document.head.appendChild(meta);
}

// index.html describes the personal site. STRUM installs as its own app, so it
// claims the tab title, icon, and web app manifest only while it is open.
export function applyStrumBranding() {
  document.title = "STRUM";
  setHeadLink("manifest", "/manifest.webmanifest");
  setHeadLink("icon", "/songbook-icon.svg");
  setHeadLink("apple-touch-icon", "/images/Guitar_Photo.png");
  setHeadMeta("theme-color", "#292720");
  setHeadMeta("apple-mobile-web-app-capable", "yes");
  setHeadMeta("apple-mobile-web-app-status-bar-style", "black-translucent");
}
