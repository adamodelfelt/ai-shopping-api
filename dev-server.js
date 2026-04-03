import http from "http";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const { default: handler } = await import("./api/search.js");

const server = http.createServer((req, res) => {
  res.status = function (code) {
    res.statusCode = code;
    return res;
  };

  res.json = function (data) {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(data));
  };

  let body = "";

  req.on("data", (chunk) => {
    body += chunk;
  });

  req.on("end", async () => {
    try {
      req.body = body ? JSON.parse(body) : {};
      await handler(req, res);
    } catch (error) {
      console.error("Dev server error:", error);
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Dev server crashed" }));
    }
  });
});

const PORT = 3000;

server.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
