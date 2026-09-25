// A real smart-HTTP git server for the adopt tests, wrapping the
// `git-http-backend` CGI that ships with git.
//
// ‼ isomorphic-git speaks HTTP and nothing else — `file:///tmp/bare` fails
// with `TypeError: Protocol "file:" not supported. Expected "http:"`. So a
// bare repo on disk is not enough; something has to serve it. This is the
// smallest thing that does, and it means the adopt path is exercised over the
// same transport it uses in production rather than a stub.
//
// Usage: node git-server.mjs <root-dir> [port]   → prints PORT=<n>
import http from "node:http";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const ROOT = process.argv[2];
const PORT = Number(process.argv[3] ?? 0);
const BACKEND = ["/usr/lib/git-core/git-http-backend", "/usr/libexec/git-core/git-http-backend"]
  .find((p) => existsSync(p));
if (!BACKEND) {
  console.error("git-http-backend not found — is git installed?");
  process.exit(1);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const cgi = spawn(BACKEND, {
    env: {
      ...process.env,
      GIT_PROJECT_ROOT: ROOT,
      GIT_HTTP_EXPORT_ALL: "1",
      PATH_INFO: url.pathname,
      QUERY_STRING: url.search.replace(/^\?/, ""),
      REQUEST_METHOD: req.method,
      CONTENT_TYPE: req.headers["content-type"] ?? "",
      CONTENT_LENGTH: req.headers["content-length"] ?? "",
      REMOTE_USER: "e2e",
    },
  });
  req.pipe(cgi.stdin);

  // CGI writes headers, a blank line, then the body. Split on the first
  // CRLFCRLF and stream the rest straight through.
  let buffered = Buffer.alloc(0);
  let headersSent = false;
  cgi.stdout.on("data", (chunk) => {
    if (headersSent) return void res.write(chunk);
    buffered = Buffer.concat([buffered, chunk]);
    const split = buffered.indexOf("\r\n\r\n");
    if (split < 0) return;
    const headers = {};
    let status = 200;
    for (const line of buffered.subarray(0, split).toString().split("\r\n")) {
      const [name, ...rest] = line.split(":");
      if (!rest.length) continue;
      const value = rest.join(":").trim();
      if (name.toLowerCase() === "status") status = parseInt(value, 10);
      else headers[name] = value;
    }
    res.writeHead(status, headers);
    headersSent = true;
    const body = buffered.subarray(split + 4);
    if (body.length) res.write(body);
  });
  cgi.stdout.on("end", () => res.end());
});

server.listen(PORT, "127.0.0.1", () => console.log(`PORT=${server.address().port}`));
