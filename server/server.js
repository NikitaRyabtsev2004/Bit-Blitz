require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const https = require("https");
const http = require("http");
const path = require("path");
const fs = require("fs");
const { Server } = require("socket.io");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const xss = require("xss-clean");
const csurf = require("csurf");
const expressBrute = require("express-brute");
const { createClient } = require("redis");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const winston = require("winston");
const expressWinston = require("express-winston");
const db = require("./db");
const moment = require("moment");
require("moment/locale/ru");
const authRoutes = require("./auth");

const app = express();

const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "combined.log" }),
  ],
});

const limiter = rateLimit({
  windowMs: 100 * 1000, 
  max: 100, 
  message: "Превышен лимит запросов, попробуйте позже.",
});

app.use(cors({
  origin: process.env.CLIENT_URL,
  methods: ["GET", "POST"],
  credentials: true,
}));
app.use(helmet());
const store = new expressBrute.MemoryStore();
const bruteforce = new expressBrute(store, {
  freeRetries: 5,
  minWait: 5000, 
  maxWait: 60000,
});

app.use(xss());
app.use(limiter);
app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));
app.use(bruteforce.prevent);
app.use(
  expressWinston.logger({
    transports: [
      new winston.transports.Console(),
      new winston.transports.File({ filename: "requests.log" }),
    ],
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.json()
    ),
  })
);

app.use("/auth", authRoutes);

let redisClientPub;
let redisClientSub;
let isRedisConnected = false;

(async () => {
  try {
    redisClientPub = createClient({
      url: process.env.REDIS_URL || "redis://127.0.0.1:6379",
    });
    redisClientSub = createClient({
      url: process.env.REDIS_URL || "redis://127.0.0.1:6379",
    });

    redisClientPub.on("error", (err) => {
      logger.error("Redis Publisher Client Error", err);
      throw err;
    });

    redisClientSub.on("error", (err) => {
      logger.error("Redis Subscriber Client Error", err);
      throw err;
    });

    await redisClientPub.connect();
    await redisClientSub.connect();
    logger.info("Connected to Redis");
    isRedisConnected = true;
  } catch (err) {
    logger.error("Could not connect to Redis. Running without Redis.");
    isRedisConnected = false;
  }

  const sslOptions = {
    key: fs.readFileSync(path.join(__dirname, "key.pem")), 
    cert: fs.readFileSync(path.join(__dirname, "cert.pem")),
  };

  let server = http.createServer(sslOptions, app);
  let io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL,
      methods: ["GET", "POST"],
    },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    const uniqueIdentifier = socket.handshake.auth.uniqueIdentifier;

    if (!token || !uniqueIdentifier) {
      return next(
        new Error("Authentication error: Missing token or unique identifier")
      );
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) {
        return next(new Error("Authentication error: Invalid token"));
      }

      db.get(
        "SELECT uniqueIdentifier, pixelCount FROM Users WHERE id = ?",
        [decoded.userId],
        (err, user) => {
          if (err) {
            logger.error("Database error:", err);
            return next(new Error("Authentication error: Database error"));
          }

          if (!user || !user.uniqueIdentifier) {
            return next(
              new Error(
                "Authentication error: User not found or unique identifier missing"
              )
            );
          }

          const isIdentifierMatch = bcrypt.compareSync(
            uniqueIdentifier,
            user.uniqueIdentifier
          );
          if (!isIdentifierMatch) {
            return next(
              new Error("Authentication error: Unique identifier mismatch")
            );
          }

          socket.user = { ...decoded, pixelCount: user.pixelCount };
          next();
        }
      );
    });
  });

  let onlineUsers = 0;

  const initiateServer = (port) => {
    server = http.createServer(app);
    io = new Server(server, {
      cors: {
        origin: process.env.CLIENT_URL,
        methods: ["GET", "POST"],
      },
    });

    server.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });

    io.on("connection", (socket) => {
      const userIp = socket.handshake.address;
      const origin = socket.handshake.headers.origin;

      if (origin !== process.env.CLIENT_URL) {
        logger.error("Unauthorized connection attempt:", origin);
        socket.disconnect();
        return;
      }

      socket.on("client-info", (data) => {
        uniqueIdentifier = data.uniqueIdentifier;
        sendUserPixelCount(socket, uniqueIdentifier);
      });

      let uniqueIdentifier;

      onlineUsers++;
      console.log(
        `User connected at ${new Date().toISOString()} from ${userIp}`
      );

      io.emit("user-count", onlineUsers);

      let pixelCount = 0;

      db.all("SELECT x, y, color FROM Canvas", [], (err, rows) => {
        if (err) {
          logger.error("Database error:", err.message);
          return;
        }
        socket.emit("canvas-data", rows);
      });

      function checkAndEmitPixelStatus() {
        db.get(
          "SELECT pixelCount FROM Users WHERE uniqueIdentifier = ?",
          [uniqueIdentifier],
          (err, row) => {
            if (err) {
              logger.error("Database error:", err.message);
              return;
            }

            pixelCount = row ? row.pixelCount : 0;

            const hasNoMorePixels = pixelCount === 0;
            socket.emit("no-more-pixels", hasNoMorePixels);
          }
        );
      }

      setInterval(checkAndEmitPixelStatus, 1000);

      socket.on("draw-pixel", async (pixelData) => {
  try {
    const { x, y, color, userId } = pixelData;
    await handlePixelDraw(x, y, color, userId, io);
    
    db.run(
      "UPDATE Users SET pixelCount = pixelCount - 1 WHERE uniqueIdentifier = ? AND pixelCount > 0",
      [uniqueIdentifier],
      (updateErr) => {
        if (updateErr) {
          logger.error("Database error:", updateErr.message);
          return;
        }

        // После успешного обновления пикселей, отправляем актуальные данные клиенту
        sendUserPixelCount(socket, uniqueIdentifier);
      }
    );
  } catch (err) {
    logger.error("Error handling pixel draw:", err.message);
  }
});


      socket.on("disconnect", () => {
        onlineUsers = Math.max(onlineUsers - 1, 0);
        moment.locale('ru');
        const formattedDate = moment().format('LL LTS');
        logger.info(`User disconnected at ${formattedDate} from ${userIp}`);
        io.emit("user-count", onlineUsers);
    });
    });
  };

  function sendUserPixelCount(socket, uniqueIdentifier) {
  db.get(
    "SELECT pixelCount FROM Users WHERE uniqueIdentifier = ?",
    [uniqueIdentifier],
    (err, row) => {
      if (err) {
        logger.error("Database error:", err.message);
        return;
      }

      if (row) {
        // Отправляем клиенту обновленное количество пикселей
        socket.emit("user-pixel-count", row.pixelCount);
      }
    }
  );
}


  async function handlePixelDraw(x, y, color, userId, io) {
    db.get(
      "SELECT color, userId FROM Canvas WHERE x = ? AND y = ?",
      [x, y],
      (err, row) => {
        if (err) {
            logger.error("Database error:", err.message);
          return;
        }

        const queryCallback = (err) => {
          if (err) {
            logger.error("Database error:", err.message);
            return;
          }

          if (isRedisConnected) {
            redisClientPub.publish(
              "pixel-channel",
              JSON.stringify({ x, y, color })
            );
          }
          io.emit("pixel-drawn", [{ x, y, color }]);
        };

        if (row) {
          db.run(
            "UPDATE Canvas SET color = ?, userId = ? WHERE x = ? AND y = ?",
            [color, userId, x, y],
            queryCallback
          );
        } else {
          db.run(
            "INSERT INTO Canvas (x, y, color, userId) VALUES (?, ?, ?, ?)",
            [x, y, color, userId],
            queryCallback
          );
        }
      }
    );
  }

  function incrementPixelCount() {
    db.serialize(() => {
      db.all(
        `SELECT id, username, pixelCount FROM Users WHERE pixelCount < 100`,
        (err, users) => {
          if (err) {
            logger.error("Error fetching users:", err.message);
            return;
          }

          users.forEach((user) => {
            const newPixelCount = Math.min(user.pixelCount + 1, 100);
            db.run(
              `UPDATE Users SET pixelCount = ? WHERE id = ?`,
              [newPixelCount, user.id],
              (err) => {
                if (err) {
                  logger.error(
                    `Error updating pixelCount for user ${user.username}:`,
                    err.message
                  );
                } else {
                  logger.info(
                    `${user.username} +1, new pixel count: ${newPixelCount}`
                  );
                }
              }
            );
          });
        }
      );
    });
  }

  setInterval(incrementPixelCount, 20000);
  setInterval(() => {
    console.log("status: Work");
  }, 60000);

  const PORT = process.env.PORT || 5000;
  initiateServer(PORT);
})();
