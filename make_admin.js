const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'game.db'));

const username = process.argv[2];

if (!username) {
    console.log('Usage: node make_admin.js <username>');
    process.exit(1);
}

const stmt = db.prepare('UPDATE users SET is_admin = 1 WHERE username = ?');
const info = stmt.run(username);

if (info.changes > 0) {
    console.log(`User "${username}" is now an admin.`);
} else {
    console.log(`User "${username}" not found.`);
}
