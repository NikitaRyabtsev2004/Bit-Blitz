import React, { useEffect, useState, useRef } from "react";
import io from "socket.io-client";

let socket;

const PIXEL_SIZE = 10;
const GRID_WIDTH = 220;
const GRID_HEIGHT = 220;

const Canvas = ({ isAuthenticated }) => {
  const [canvasSize] = useState({
    width: GRID_WIDTH,
    height: GRID_HEIGHT,
  });
  const [pixels, setPixels] = useState([]);
  const [selectedColor, setSelectedColor] = useState("#000000");
  const [recentColors, setRecentColors] = useState([]);
  const [userCount, setUserCount] = useState(0);
  const [scale, setScale] = useState(1);
  const canvasRef = useRef(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const config = require("./config");
  const [canDraw, setCanDraw] = useState(true);
  const [remainingTime, setRemainingTime] = useState(0);
  const [pixelCount, setPixelCount] = useState(0);
  const [hasNoMorePixels, setHasNoMorePixels] = useState(false);

  useEffect(() => {
    const storedColors = JSON.parse(localStorage.getItem("recentColors")) || [];
    setRecentColors(storedColors);
  }, []);

  useEffect(() => {
    localStorage.setItem("recentColors", JSON.stringify(recentColors));
  }, [recentColors]);

  useEffect(() => {
    if (canvasSize.width > 0 && canvasSize.height > 0) {
      setPixels(
        Array(canvasSize.height)
          .fill(null)
          .map(() => Array(canvasSize.width).fill("#FFFFFF"))
      );
    }
  }, [canvasSize]);

  const connectSocket = () => {
    socket = io(config.serverUrl, {
      auth: {
        token: localStorage.getItem("authToken"),
        uniqueIdentifier: localStorage.getItem("uniqueIdentifier"),
      },
    });

    socket.on("canvas-data", (data) => {
      const canvasData = Array(canvasSize.height)
        .fill(null)
        .map(() => Array(canvasSize.width).fill("#FFFFFF"));
      data.forEach((pixel) => {
        if (canvasData[pixel.y] && canvasData[pixel.y][pixel.x]) {
          canvasData[pixel.y][pixel.x] = pixel.color;
        }
      });
      setPixels(canvasData);
      drawCanvas(canvasData);
    });

    socket.on("pixel-drawn", (pixelData) => {
      setPixels((prevPixels) => {
        const newPixels = [...prevPixels];
        pixelData.forEach(({ x, y, color }) => {
          if (newPixels[y] && newPixels[y][x]) {
            newPixels[y][x] = color;
            drawPixel(x, y, color);
          }
        });
        return newPixels;
      });
    });
    socket.on("no-more-pixels", (value) => {
      setHasNoMorePixels(value);
    });

    socket.on("user-count", (count) => {
      setUserCount(count);
    });

    socket.on("user-pixel-count", (count) => {
      setPixelCount(count);
    });

    socket.on("connect_error", (err) => {
      console.error("Connection error:", err);
    });

    socket.on("disconnect", () => {
      console.log("Disconnected from server");
    });

    socket.emit("client-info", {
      uniqueIdentifier: localStorage.getItem("uniqueIdentifier"),
    });
  };

  useEffect(() => {
    connectSocket();
    return () => {
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const drawCanvas = (canvasData) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, offset.x, offset.y);

    canvasData.forEach((row, y) => {
      row.forEach((color, x) => {
        drawPixel(x, y, color);
      });
    });

    ctx.restore();
  };

  const drawPixel = (x, y, color) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = color;
    ctx.fillRect(
      x * PIXEL_SIZE * scale,
      y * PIXEL_SIZE * scale,
      PIXEL_SIZE * scale,
      PIXEL_SIZE * scale
    );
  };

  const increaseScale = () => {
    setScale((prevScale) => Math.min(prevScale + 0.1, 1.7));
  };
  
  const decreaseScale = () => {
    setScale((prevScale) => Math.max(prevScale - 0.1, 0.3));
  };

  const handlePixelClick = (x, y) => {
    if (!isAuthenticated || !localStorage.getItem("uniqueIdentifier")) {
      alert(
        "Вам нужно войти чтобы оставлять пиксели.\nЕсли вы вошли возможно вы попытались использовть обходные пути, заново произведите вход"
      );
      return;
    }

    if (!canDraw) {
      return;
    }

    if (hasNoMorePixels) {
      alert("Wait, your balance is zero");
      return;
    }

    setCanDraw(false);
    setRemainingTime(300);

    const interval = setInterval(() => {
      setRemainingTime((prev) => {
        if (prev <= 100) {
          clearInterval(interval);
          setCanDraw(true);
          return 0;
        }
        return prev - 100;
      });
    }, 100);

    const adjustedX = Math.floor((x - offset.x) / (PIXEL_SIZE * scale));
    const adjustedY = Math.floor((y - offset.y) / (PIXEL_SIZE * scale));
    const color = selectedColor;

    setRecentColors((prevColors) => {
      const newColors = [color, ...prevColors.filter((c) => c !== color)];
      return newColors.slice(0, 10);
    });

    const newPixel = {
      x: adjustedX,
      y: adjustedY,
      color,
      userId: localStorage.getItem("uniqueIdentifier"),
    };

    setPixels((prevPixels) => {
      const newPixels = prevPixels.map((row) => [...row]);
      if (newPixels[adjustedY] && newPixels[adjustedX]) {
        newPixels[adjustedY][adjustedX] = newPixel.color;
        drawPixel(adjustedX, adjustedY, newPixel.color);
      }
      return newPixels;
    });

    socket.emit("draw-pixel", newPixel);
  };

  const handleCanvasClick = (e) => {
    if (e.button === 0 && !isDragging) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      handlePixelClick(x, y);
    }
  };

  const handleMouseDown = (e) => {
    if (e.button === 0 || e.button === 1 || e.button === 2) {
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
    }

    if (e.button === 2) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = Math.floor(
        (e.clientX - rect.left - offset.x) / (PIXEL_SIZE * scale)
      );
      const y = Math.floor(
        (e.clientY - rect.top - offset.y) / (PIXEL_SIZE * scale)
      );

      if (pixels[y] && pixels[y][x]) {
        setSelectedColor(pixels[y][x]);
      }
    }
  };

  const handleMouseUp = (e) => {
    if (e.button === 0 || e.button === 1 || e.button === 2) {
      setIsDragging(false);
    }
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;

    const newOffsetX = offset.x + (e.clientX - dragStart.x);
    const newOffsetY = offset.y + (e.clientY - dragStart.y);

    setOffset({ x: newOffsetX, y: newOffsetY });
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  useEffect(() => {
    drawCanvas(pixels);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset, pixels, scale]);

  const moveUp = () => {
    setOffset((prevOffset) => ({ ...prevOffset, y: prevOffset.y + 40 }));
  };

  const moveDown = () => {
    setOffset((prevOffset) => ({ ...prevOffset, y: prevOffset.y - 40 }));
  };

  const moveLeft = () => {
    setOffset((prevOffset) => ({ ...prevOffset, x: prevOffset.x + 40 }));
  };

  const moveRight = () => {
    setOffset((prevOffset) => ({ ...prevOffset, x: prevOffset.x - 40 }));
  };

  return (
    <>
      <div>
        <h3 className="counter">
          Онлайн пользователей {userCount}
          <div
            style={{
              height: "10px",
              width: "100px",
              backgroundColor: "#ddd",
              margin: "5px auto",
              position: "relative",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${canDraw ? 0 : (remainingTime / 300) * 100}%`,
                backgroundColor: "green",
                transition: "width 0.2s linear",
              }}
            />
            <div
              style={{
                position: "absolute",
                top: "0",
                left: "0",
                right: "0",
                bottom: "0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "black",
              }}
            >
              {remainingTime > 0 ? `${remainingTime} ms` : "Готово"}
            </div>
          </div>
          <div
            style={{
              marginTop: "5px",
              color: "black",
              textAlign: "center",
            }}
          >
            Количество: {pixelCount}
            <div>(20s) recharge per 1</div>
          </div>
        </h3>
        <div className="zoom-buttons">
          <button className="zoom-button" onClick={decreaseScale}>
            -
          </button>
          <button className="zoom-button" onClick={increaseScale}>
            +
          </button>
        </div>

        <div className="color-selector">
          <ColorPalette
            selectedColor={selectedColor}
            setSelectedColor={setSelectedColor}
          />
          <h3>Ваш цвет: {selectedColor}</h3>
          <h3>Недавние цвета:</h3>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <div
              style={{
                position: "absolute",
                marginBottom: "30px",
                display: "flex",
                justifyContent: "center",
                flexWrap: "wrap",
              }}
            >
              {recentColors.map((color, index) => (
                <div
                  key={index}
                  onClick={() => setSelectedColor(color)}
                  style={{
                    width: "20px",
                    height: "20px",
                    backgroundColor: color,
                    cursor: "pointer",
                    border: "1px solid black",
                    margin: "2px",
                  }}
                />
              ))}
            </div>
          </div>
          <div style={{ marginTop: "80px" }} />
        </div>

        <canvas
          ref={canvasRef}
          width={canvasSize.width * PIXEL_SIZE * scale}
          height={canvasSize.height * PIXEL_SIZE * scale}
          onClick={handleCanvasClick}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseMove={handleMouseMove}
          onContextMenu={(e) => e.preventDefault()}
          style={{
            cursor: "crosshair",
            border: "1px solid black",
          }}
        />
        <button className="move-arrow up-arrow" onClick={moveUp}>
          ↑
        </button>
        <button className="move-arrow down-arrow" onClick={moveDown}>
          ↓
        </button>
        <button className="move-arrow left-arrow" onClick={moveLeft}>
          ←
        </button>
        <button className="move-arrow right-arrow" onClick={moveRight}>
          →
        </button>
      </div>
    </>
  );
};

const ColorPalette = ({ selectedColor, setSelectedColor }) => {
  const colors = [
    "#000000",
    "#FFFFFF",
    "#808080",
    "#FF0000",
    "#00FF00",
    "#0000FF",
    "#FFFF00",
    "#00ccff",
    "#800080",
    "#ff8800",
  ];

  const handleColorSelect = (color) => {
    setSelectedColor(color);
  };

  return (
    <>
      <div className="colors-pallete">
        {colors.map((color, index) => (
          <div
            key={index}
            onClick={() => handleColorSelect(color)}
            style={{
              width: "20px",
              height: "20px",
              backgroundColor: color,
              cursor: "pointer",
              border:
                color === selectedColor ? "3px solid black" : "1px solid #ddd",
              margin: "2px",
            }}
          />
        ))}
        <input
          type="color"
          value={selectedColor}
          onChange={(e) => setSelectedColor(e.target.value)}
        />
      </div>
    </>
  );
};

export default Canvas;
