/* Shared site chrome: nav + back button + theme toggle + progress bar.
 * Usage: <script defer src="/assets/nav.js"></script> in <head> (or anywhere).
 * Replaces the element <nav data-site-nav></nav> if present, else prepends to <body>.
 * Optional per-page override: <script defer src="/assets/nav.js" data-back="/writing.html"></script>
 * Relies on the page defining the shared CSS tokens (--bg-nav, --text, --border, ...).
 */
(function () {
  var script = document.currentScript;

  function backTarget() {
    if (script && script.dataset.back) return script.dataset.back;
    var p = location.pathname;
    if (/^\/posts\//.test(p)) return "/writing.html";           // posts live under writing
    if (/^\/lab\/.+/.test(p)) return "/lab/";                   // notebook pages -> lab index
    if (p === "/" || /^\/(index\.html)?$/.test(p)) return null; // home: no back
    return "/";                                                 // everything else -> home
  }

  var CSS = [
    "#sn-progress{position:fixed;top:0;left:0;height:3px;background:var(--progress-bar,var(--accent,#1a6dd4));z-index:1001;transition:width .1s linear;}",
    "nav.sn-nav{position:fixed;top:0;left:0;right:0;height:52px;background:var(--bg-nav,#fff);border-bottom:1px solid var(--border,#e0e0e0);display:flex;align-items:center;justify-content:center;z-index:1000;transition:background .3s,border-color .3s;}",
    ".sn-inner{width:100%;max-width:800px;padding:0 24px;display:flex;align-items:center;justify-content:space-between;}",
    ".sn-left,.sn-right{display:flex;align-items:center;gap:20px;}",
    ".sn-right{gap:14px;}",
    ".sn-left a{color:var(--text,#333);text-decoration:none;font-size:14px;font-weight:500;transition:color .2s;}",
    ".sn-left a:hover{color:var(--accent,#1a6dd4);text-decoration:none;}",
    ".sn-left a.sn-back{color:var(--text-muted,#999);font-weight:400;}",
    ".sn-left a.sn-active{color:var(--accent,#1a6dd4);}",
    ".sn-right a{color:var(--text-muted,#999);text-decoration:none;font-size:13px;transition:color .2s;}",
    ".sn-right a:hover{color:var(--accent,#1a6dd4);text-decoration:none;}",
    "#sn-theme{background:none;border:1px solid var(--border,#e0e0e0);color:var(--text,#333);cursor:pointer;font-size:16px;padding:4px 8px;border-radius:6px;line-height:1;}",
    "#sn-theme:hover{background:var(--highlight-bg,#f7f7f7);}",
    "@media (max-width:600px){.sn-left{gap:14px;}.sn-right{gap:10px;}.sn-right a[data-sm-hide]{display:none;}}"
  ].join("\n");

  var LINKS = [
    { href: "/index.html", label: "about", match: /^\/(index\.html)?$/ },
    { href: "/writing.html", label: "writing", match: /^\/(writing\.html|posts\/)/ },
    { href: "/lab/", label: "lab", match: /^\/lab\// }
  ];
  var ICONS = [
    { href: "mailto:sod2112@columbia.edu", label: "email", smHide: true },
    { href: "https://scholar.google.com/citations?user=-UeEc_oAAAAJ&hl=en", label: "scholar", smHide: true },
    { href: "https://github.com/sdelaurentiis123", label: "github" },
    { href: "https://x.com/sdelaurentiis_/", label: "x", smHide: true },
    { href: "/resume.pdf", label: "cv" }
  ];

  function build() {
    var style = document.createElement("style");
    style.id = "sn-style";
    style.textContent = CSS;
    document.head.appendChild(style);

    var nav = document.createElement("nav");
    nav.className = "sn-nav";
    nav.setAttribute("aria-label", "Site");

    var left = "";
    var back = backTarget();
    if (back) left += '<a class="sn-back" href="' + back + '" title="Back">&larr;</a>';
    LINKS.forEach(function (l) {
      var active = l.match.test(location.pathname) ? " sn-active" : "";
      left += '<a class="' + active.trim() + '" href="' + l.href + '">' + l.label + "</a>";
    });

    var right = "";
    ICONS.forEach(function (i) {
      right += '<a href="' + i.href + '"' + (i.smHide ? " data-sm-hide" : "") + ' title="' + i.label + '">' + i.label + "</a>";
    });
    var authed = false;
    try { authed = !!localStorage.getItem("staticrypt_passphrase"); } catch (e) {}
    right += '<a href="/signin/" id="sn-signin"' + (authed ? ' style="color:#b58900"' : "") + ' title="internal access">' + (authed ? "internal &#10003;" : "sign in") + "</a>";
    right += '<button id="sn-theme" title="Toggle dark mode">☀️</button>';

    nav.innerHTML = '<div class="sn-inner"><div class="sn-left">' + left + '</div><div class="sn-right">' + right + "</div></div>";

    var slot = document.querySelector("nav[data-site-nav]");
    if (slot) slot.replaceWith(nav);
    else document.body.prepend(nav);

    // progress bar (skip if page already has one)
    if (!document.getElementById("progress-bar") && !document.getElementById("sn-progress")) {
      var bar = document.createElement("div");
      bar.id = "sn-progress";
      document.body.prepend(bar);
      window.addEventListener("scroll", function () {
        var st = document.documentElement.scrollTop;
        var sh = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        bar.style.width = (sh > 0 ? (st / sh) * 100 : 0) + "%";
      });
    }

    // theme toggle (shared localStorage key: "theme")
    var toggle = document.getElementById("sn-theme");
    var html = document.documentElement;
    function setTheme(t) {
      html.setAttribute("data-theme", t);
      toggle.textContent = t === "dark" ? "🌙" : "☀️";
      localStorage.setItem("theme", t);
    }
    var saved = localStorage.getItem("theme");
    if (saved) setTheme(saved);
    else if (window.matchMedia("(prefers-color-scheme: dark)").matches) setTheme("dark");
    toggle.addEventListener("click", function () {
      setTheme(html.getAttribute("data-theme") === "dark" ? "light" : "dark");
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
  else build();
})();
