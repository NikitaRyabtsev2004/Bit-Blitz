const express = require('express');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const jwt = require('jsonwebtoken');

const router = express.Router();
const pendingRegistrations = {};

const transporter = nodemailer.createTransport({
    host: "smtp.yandex.ru",
    port: 465,
    secure: true,
    auth: {
        user: "Your@email.com",
        pass: "YourSMTPPass",
    },
});

const generateRandomCode = () => Math.floor(100000 + Math.random() * 900000).toString();

const generateUniqueIdentifier = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let identifier = '';
    for (let i = 0; i < 10; i++) {
        identifier += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return identifier;
};

const createAdminAccount = async () => {
    const hashedPassword = await bcrypt.hash('Qwe12345!', 10);
    const uniqueIdentifier = generateUniqueIdentifier();

    db.run(
        `INSERT OR IGNORE INTO Users (email, username, password, confirmationCode, isVerified, canPlacePixel, pixelCount, uniqueIdentifier) 
        VALUES ('your@email.com', 'Admin', ?, '', 1, 1, 100, ?)`, [hashedPassword, uniqueIdentifier], (err) => {
        if (err) {
            console.error("Error creating admin account:", err.message);
        } else {
            console.log("Admin account created or already exists.");
        }
    });
};
createAdminAccount();

router.post('/register', async (req, res) => {
    const { email, username, password, confirmPassword } = req.body;

    const passwordPattern = /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (password !== confirmPassword) {
        return res.status(400).json({ message: "Пароли не совпадают." });
    }
    if (!passwordPattern.test(password)) {
        return res.status(400).json({
            message: 
                "Пароль должен содержать минимум 8 символов,\n" +
                "включая:\n" +
                "- Заглавные и строчные буквы\n" +
                "- Цифры\n" +
                "- Специальные символы: @, $, !, %, *, ?, &\n" 
        });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const confirmationCode = generateRandomCode();
    const uniqueIdentifier = generateUniqueIdentifier();

    pendingRegistrations[email] = { username, hashedPassword, confirmationCode, uniqueIdentifier };

    const mailOptions = {
        from: '"Pixel Art" <SoftSeason@yandex.ru>',
        to: email,
        subject: 'Подтверждение регистрации',
        text: `Ваш код подтверждения: ${confirmationCode}`,
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            return res.status(500).json({ message: "Ошибка отправки письма." });
        }
        res.status(200).json({ 
            message: "Проверьте вашу почту для подтверждения.", 
            needVerification: true, 
            uniqueIdentifier
        });
    });
});

router.post('/verify', (req, res) => {
    const { email, confirmationCode } = req.body;

    const pendingUser = pendingRegistrations[email];

    if (!pendingUser || pendingUser.confirmationCode !== confirmationCode) {
        return res.status(400).json({ message: "Неверный код подтверждения." });
    }

    db.run(
        'INSERT INTO Users (email, username, password, confirmationCode, isVerified, canPlacePixel, pixelCount, uniqueIdentifier) VALUES (?, ?, ?, "", 1, 1, 100, ?)',
        [email, pendingUser.username, pendingUser.hashedPassword, pendingUser.uniqueIdentifier],
        (err) => {
            if (err) {
                return res.status(500).json({ message: "Ошибка создания аккаунта." });
            }
            delete pendingRegistrations[email];
            res.status(200).json({ message: "Успешная верификация. Теперь вы можете войти." });
        }
    );
});

router.post('/login', (req, res) => {
    const { usernameOrEmail, password } = req.body;

    db.get('SELECT * FROM Users WHERE (username = ? OR email = ?) AND isVerified = 1', [usernameOrEmail, usernameOrEmail], (err, user) => {
        if (err || !user) {
            return res.status(400).json({ message: "Неверный логин или пароль." });
        }

        bcrypt.compare(password, user.password, (err, result) => {
            if (err || !result) {
                return res.status(400).json({ message: "Неверный логин или пароль." });
            }

            const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
            res.status(200).json({ message: "Успешный вход.", token, uniqueIdentifier: user.uniqueIdentifier });
        });
    });
});

router.post('/reset-password', (req, res) => {
    const { email, confirmationCode, newPassword } = req.body;

    db.get('SELECT * FROM Users WHERE email = ? AND confirmationCode = ?', [email, confirmationCode], async (err, user) => {
        if (err || !user) {
            return res.status(400).json({ message: "Неверный код подтверждения." });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        db.run('UPDATE Users SET password = ? WHERE email = ?', [hashedPassword, email], (err) => {
            if (err) {
                return res.status(500).json({ message: "Ошибка изменения пароля." });
            }
            res.status(200).json({ message: "Пароль успешно изменен." });
        });
    });
});

router.post('/resend-code', (req, res) => {
    const { email } = req.body;
    const confirmationCode = generateRandomCode();

    db.run('UPDATE Users SET confirmationCode = ? WHERE email = ?', [confirmationCode, email], (err) => {
        if (err) {
            return res.status(500).json({ message: "Ошибка повторной отправки кода." });
        }

        const mailOptions = {
            from: '"Pixel Art" <SoftSeason@yandex.ru>',
            to: email,
            subject: 'Повторное подтверждение регистрации',
            text: `Ваш новый код подтверждения: ${confirmationCode}`,
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                return res.status(500).json({ message: "Ошибка отправки письма." });
            }
            res.status(200).json({ message: "Новый код отправлен на вашу почту." });
        });
    });
});

module.exports = router;
