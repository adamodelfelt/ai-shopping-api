import http from "http";
import dotenv from "dotenv";
import handler from "./api/search.js";

dotenv.config({ path: ".env.local" });

const server = http.createServer(async (req, res) => {
  // Lägg till helpers som Vercel normalt ger dig
  res.status = function (code) {
    res.statusCode = code;
    return res;
  };

  res.json = function (data) {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(data));
  };

  // Parse body för POST/OPTIONS
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });

  req.on("end", async () => {
    try {
      if (body) {
        try {
          req.body = JSON.parse(body);
        } catch {
          req.body = {};
        }
      } else {
        req.body = {};
      }

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