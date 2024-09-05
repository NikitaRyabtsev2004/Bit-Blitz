import React, { useState, useEffect } from "react";

const AuthModal = ({ onClose, onLoginSuccess }) => {
  const [isRegister, setIsRegister] = useState(true);
  const [formData, setFormData] = useState({
    email: "",
    username: "",
    password: "",
    confirmPassword: "",
    confirmationCode: "",
  });
  const [message, setMessage] = useState("");
  const [isVerification, setIsVerification] = useState(false);
  const [isDisabled, setIsDisabled] = useState(false);
  const [timer, setTimer] = useState(30);
  const config = require("./config");

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isVerification) {
      await verifyAccount();
    } else if (isRegister) {
      await registerAccount();
    } else {
      await loginAccount();
    }
  };

  const registerAccount = async () => {
    try {
      const response = await fetch(`${config.serverUrl}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const result = await response.json();
      setMessage(result.message);
      if (response.ok && result.needVerification) {
        setIsVerification(true);
        localStorage.setItem('uniqueIdentifier', result.uniqueIdentifier);
      }
    } catch (error) {
      setMessage("Ошибка регистрации. Попробуйте снова.");
    }
  };

  const verifyAccount = async () => {
    try {
      const response = await fetch(`${config.serverUrl}/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.email,
          confirmationCode: formData.confirmationCode,
        }),
      });
      const result = await response.json();
      setMessage(result.message);
      if (response.ok) {
        setIsVerification(false);
        setIsRegister(false);
      }
    } catch (error) {
      setMessage("Ошибка подтверждения. Попробуйте снова.");
    }
  };

  const loginAccount = async () => {
    try {
      const response = await fetch(`${config.serverUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usernameOrEmail: formData.usernameOrEmail,
          password: formData.password,
        }),
      });
      const result = await response.json();
      setMessage(result.message);
      if (response.ok) {
        localStorage.setItem("authToken", result.token);
        localStorage.setItem("uniqueIdentifier", result.uniqueIdentifier);
        onLoginSuccess();
        onClose();
      }
    } catch (error) {
      setMessage("Ошибка. Попробуйте снова.");
    }
  };

  const resendCode = async () => {
    setIsDisabled(true);
    setTimer(30);
    try {
      const response = await fetch(`${config.serverUrl}/auth/resend-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: formData.email }),
      });
      const result = await response.json();
      setMessage(result.message);
    } catch (error) {
      setMessage("Ошибка отправки кода. Попробуйте снова.");
    }
  };

  useEffect(() => {
    if (isDisabled) {
      const interval = setInterval(() => {
        setTimer((prevTimer) => {
          if (prevTimer === 1) {
            clearInterval(interval);
            setIsDisabled(false);
          }
          return prevTimer - 1;
        });
      }, 1000);
    }
  }, [isDisabled]);

  return (
    <div className="modal">
      <form onSubmit={handleSubmit}>
        <h2>{isRegister ? "Регистрация" : "Вход"}</h2>
        {isVerification ? (
          <>
            <input
              type="text"
              name="confirmationCode"
              placeholder="Код подтверждения"
              onChange={handleChange}
              required
            />
            <button type="submit">Подтвердить</button>
            <button type="button" onClick={resendCode} disabled={isDisabled}>
              Отправить код снова {isDisabled && `(${timer}s)`}
            </button>
          </>
        ) : (
          <>
            {isRegister && (
              <>
                <input
                  type="email"
                  name="email"
                  placeholder="Email"
                  onChange={handleChange}
                  required
                />
                <input
                  type="text"
                  name="username"
                  placeholder="Имя пользователя"
                  onChange={handleChange}
                  required
                />
                <input
                  type="password"
                  name="password"
                  placeholder="Пароль"
                  onChange={handleChange}
                  required
                />
                <input
                  type="password"
                  name="confirmPassword"
                  placeholder="Подтверждение пароля"
                  onChange={handleChange}
                  required
                />
              </>
            )}
            {!isRegister && (
              <>
                <input
                  type="text"
                  name="usernameOrEmail"
                  placeholder="Имя или Email"
                  onChange={handleChange}
                  required
                />
                <input
                  type="password"
                  name="password"
                  placeholder="Пароль"
                  onChange={handleChange}
                  required
                />
              </>
            )}
            <div className="buttons">
              <button type="submit">
                {isRegister ? "Зарегистрироваться" : "Войти"}
              </button>
              <button type="button" onClick={() => setIsRegister(!isRegister)}>
                {isRegister
                  ? "Вход"
                  : "Регистрация"}
              </button>
            </div>
          </>
        )}
        {message && <p style={{ width: "150px" }}>{message}</p>}
      </form>
    </div>
  );
};

export default AuthModal;
