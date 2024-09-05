const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const db = new sqlite3.Database('./canvas.db');

db.serialize(() => {
    db.run(
        `CREATE TABLE IF NOT EXISTS Users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE,
            username TEXT UNIQUE,
            password TEXT,
            confirmationCode TEXT,
            isVerified INTEGER DEFAULT 0,
            canPlacePixel INTEGER DEFAULT 0,
            pixelCount INTEGER DEFAULT 100,
            uniqueIdentifier TEXT UNIQUE
        )`
    );

    db.run(`
        CREATE TABLE IF NOT EXISTS Canvas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            x INTEGER,
            y INTEGER,
            color TEXT,
            userId INTEGER,
            UNIQUE(x, y),
            FOREIGN KEY(userId) REFERENCES Users(id)
        )
    `);

    const generateUniqueIdentifier = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let identifier = '';
        for (let i = 0; i < 10; i++) {
            identifier += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return identifier;
    };

    bcrypt.hash('AdminPass1!', 10, (err, hashedPassword) => {
        if (err) {
            console.error("Error creating admin account:", err.message);
        } else {
            const uniqueIdentifier = generateUniqueIdentifier();
            const hashedIdentifier = bcrypt.hashSync(uniqueIdentifier, 10);
            db.run(
                `INSERT OR IGNORE INTO Users 
                (email, username, password, confirmationCode, isVerified, canPlacePixel, pixelCount, uniqueIdentifier) 
                VALUES ('your@email.com', 'Admin', ?, '', 1, 1, 100, ?)`,
                [hashedPassword, hashedIdentifier],
                (err) => {
                    if (err) {
                        console.error("Error creating admin account:", err.message);
                    } else {
                        console.log("Admin account created or already exists.");
                    }
                }
            );
        }
    });
});

module.exports = db;
