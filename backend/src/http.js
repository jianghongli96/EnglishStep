export function send(res, status, payload, headers) {
  res.writeHead(status, headers);
  res.end(JSON.stringify(payload));
}

export function notFound(res, headers) {
  send(res, 404, { error: "Not found" }, headers);
}

export function badRequest(res, message, headers) {
  send(res, 400, { error: message }, headers);
}

export function unauthorized(res, headers, message = "Authentication required") {
  send(res, 401, { error: message }, headers);
}

export function forbidden(res, headers, message = "Permission denied") {
  send(res, 403, { error: message }, headers);
}

export function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 2_000_000) {
        req.destroy();
        reject(new Error("Request body is too large"));
      }
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Body must be valid JSON"));
      }
    });
    req.on("error", reject);
  });
}
