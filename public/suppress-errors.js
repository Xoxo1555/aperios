window.addEventListener("error", function(e) {
  try {
    if (e && e.filename && e.filename.indexOf("chrome-extension") !== -1) {
      e.stopImmediatePropagation();
    }
  } catch (t) {}
});
