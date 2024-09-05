import "./App.css";
import React, { useState, useEffect } from "react";
import Canvas from "./components/Canvas";
import AuthModal from "./components/AuthModal";

const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(true);
  const [showRulesModal, setShowRulesModal] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("authToken");
    const uniqueIdentifier = localStorage.getItem("uniqueIdentifier");
    if (token && uniqueIdentifier) {
      setIsAuthenticated(true);
      setShowAuthModal(false);
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("uniqueIdentifier");
    localStorage.removeItem("authToken");
    setIsAuthenticated(false);
    setShowAuthModal(true);
    setShowRulesModal(true);
  };

  const handleRulesClose = () => {
    setShowRulesModal(false);
  };

  const [colors, setColors] = React.useState({
    B: "#24ffff",
    i: "#00FF00",
    t: "#FFFF00",
    В: "#FF0000",
    l: "#0000FF",
    // eslint-disable-next-line no-dupe-keys
    i: "#00FF00",
    z: "#FF00FF",
  });

  React.useEffect(() => {
    const intervalId = setInterval(() => {
      const newColors = Object.keys(colors).reduce((acc, key) => {
        acc[key] = getRandomColor();
        return acc;
      }, {});
      setColors(newColors);
    }, 1000);

    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getRandomColor = () => {
    const r = Math.floor(Math.random() * 256);
    const g = Math.floor(Math.random() * 256);
    const b = Math.floor(Math.random() * 256);
    return `rgb(${r}, ${g}, ${b})`;
  };

  return (
    <>
      <div className="App">
        <div className="letters-h2">
          <h2 style={{ color: colors.B }}>B</h2>
          <h2 style={{ color: colors.i }}>i</h2>
          <h2 style={{ color: colors.t }}>t</h2>
          <h2>_</h2>
          <h2 style={{ color: colors.В }}>B</h2>
          <h2 style={{ color: colors.l }}>l</h2>
          <h2 style={{ color: colors.i }}>i</h2>
          <h2 style={{ color: colors.t }}>t</h2>
          <h2 style={{ color: colors.z }}>z</h2>
        </div>

        {showRulesModal && (
          <div style={{textAlign:"justify"}} className="Rules-Modal">
            <h1>
              <div className="h1-main">
                Rules
              </div>
            </h1>
            <a className="a-biggger">
              После регистрации или входа вы можете начать играть
            </a>
            <a>
              Регистрация нужна для безопасной а также честной игры
            </a>
            <a className="a-biggger">
              Прошу ознакомится с правилами и рекомендоциями для игры
            </a>
            <a>
              Удерживание(пкм, лкм, скм) - перемещение по полю, + и - для
              масштаба
            </a>
            <a>лкм - оставить пиксель, пкм - копировать цвет</a>
            <a className="a-biggger">Запрещено</a>
            <a>Рисовать непристойные надписи а так же выражения = блокировка</a>
            <a>Читерство = блокировка</a>
            <button onClick={handleRulesClose}>x</button>
          </div>
        )}

        {showAuthModal && (
          <AuthModal
            onClose={() => setShowAuthModal(false)}
            onLoginSuccess={() => setIsAuthenticated(true)}
          />
        )}
        {!showAuthModal && (
          <button
            style={{
              right: "0",
              position: "fixed",
              width: "70px",
              marginRight: "10px",
              marginTop: "10px",
              border: "4px black solid",
              fontSize: "14px",
              fontWeight: "800",
            }}
            onClick={handleLogout}
          >
            Выйти
          </button>
        )}
        <Canvas isAuthenticated={isAuthenticated} />
      </div>
    </>
  );
};

export default App;
