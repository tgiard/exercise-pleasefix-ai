export function setStatus(
    message: string,
    type: "info" | "success" | "error" = "info",
  ) {
    const statusDiv = document.getElementById("status");
    if (!statusDiv) return;
  
    const color =
      type === "error" ? "#fee2e2" : type === "success" ? "#dcfce7" : "#e0f2fe";
  
    const safe = message
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>");
  
    statusDiv.innerHTML = `
      <div style="
        background:${color};
        padding:8px;
        border-radius:6px;
        white-space:normal;
        word-break:break-word;
      ">
        ${safe}
      </div>
    `;
  }
  
  export function scrollOutputToBottom() {
    const outputDiv = document.getElementById("output");
    if (!outputDiv) return;
    requestAnimationFrame(() => {
      outputDiv.scrollTop = outputDiv.scrollHeight;
    });
  }
  
  export function addMessage(message: string, role: "user" | "assistant") {
    const outputDiv = document.getElementById("output");
    if (!outputDiv) return;
  
    const background = role === "user" ? "#e0f2fe" : "#f3f4f6";
    const title = role === "user" ? "🧑‍💻 Vous" : "🤖 Assistant";
  
    const formatted = message
      .replace(/\n/g, "<br>")
      .replace(/- /g, "• ");
  
    outputDiv.innerHTML += `
      <div style="
        background:${background};
        padding:12px;
        border-radius:8px;
        margin-bottom:8px;
        font-family:system-ui;
        line-height:1.5;
      ">
        <strong>${title}</strong><br><br>
        ${formatted}
      </div>
    `;
  
    scrollOutputToBottom();
  }