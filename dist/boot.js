import("./app.js").catch((error) => {
  console.error("Cinema Field could not start:", error);
  const panel = document.getElementById("startup-error");
  panel.hidden = false;
  panel.focus();
  document.getElementById("retry-load").onclick = () => location.reload();
});
