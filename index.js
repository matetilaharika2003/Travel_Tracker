import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Database client
const db = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // REQUIRED on Render
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.set("view engine", "ejs");

let currentUserId = 1;
let users = [];

// Initialize database tables & default data
async function initDB() {
  await db.connect();

  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS countries (
      country_code VARCHAR(2) PRIMARY KEY,
      country_name TEXT NOT NULL
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS visited_countries (
      id SERIAL PRIMARY KEY,
      country_code VARCHAR(2) REFERENCES countries(country_code),
      user_id INTEGER REFERENCES users(id),
      UNIQUE (country_code, user_id)
    );
  `);

  // Insert default users
  const resUsers = await db.query("SELECT COUNT(*) FROM users;");
  if (parseInt(resUsers.rows[0].count) === 0) {
    await db.query(`
      INSERT INTO users (name, color)
      VALUES 
        ('Laharika', 'teal'),
        ('Jack', 'powderblue');
    `);
  }

  // Insert default countries
  const resCountries = await db.query("SELECT COUNT(*) FROM countries;");
  if (parseInt(resCountries.rows[0].count) === 0) {
    await db.query(`
      INSERT INTO countries (country_code, country_name)
      VALUES 
        ('US', 'United States'),
        ('IN', 'India'),
        ('JP', 'Japan'),
        ('FR', 'France'),
        ('BR', 'Brazil');
    `);
  }

  console.log("Database initialized");
}

// Get visited countries for current user
async function checkVisited() {
  const result = await db.query(
    "SELECT country_code FROM visited_countries WHERE user_id = $1 ORDER BY country_code;",
    [currentUserId]
  );
  return result.rows.map(row => row.country_code);
}

// Get current user safely
async function getCurrentUser() {
  const result = await db.query("SELECT * FROM users WHERE id = $1;", [currentUserId]);
  
  if (result.rows.length > 0) {
    return result.rows[0];
  }

  // fallback: pick the first user if current user not found
  const allUsers = await db.query("SELECT * FROM users ORDER BY id LIMIT 1;");
  if (allUsers.rows.length === 0) {
    throw new Error("No users found in the database!");
  }

  currentUserId = allUsers.rows[0].id;
  return allUsers.rows[0];
}

// Home page
app.get("/", async (req, res) => {
  try {
    const countries = await checkVisited();
    const currentUser = await getCurrentUser();

    // Get all users for dropdown
    const allUsers = await db.query("SELECT * FROM users;");
    users = allUsers.rows;

    res.render("index.ejs", {
      countries,
      total: countries.length,
      users,
      color: currentUser.color,
      error: null,
    });
  } catch (err) {
    console.error(err);
    res.send("Error loading the page.");
  }
});

// Add visited country
app.post("/add", async (req, res) => {
  const input = req.body["country"];

  try {
    const currentUser = await getCurrentUser();

    // Use ILIKE for case-insensitive match
    const result = await db.query(
      "SELECT country_code FROM countries WHERE country_name ILIKE $1;",
      [input.trim()]
    );

    if (result.rows.length === 0) {
      const countries = await checkVisited();
      return res.render("index.ejs", {
        countries,
        total: countries.length,
        users,
        color: currentUser.color,
        error: "Country does not exist!",
      });
    }

    const countryCode = result.rows[0].country_code;

    // Check if already visited
    const exists = await db.query(
      "SELECT 1 FROM visited_countries WHERE country_code = $1 AND user_id = $2",
      [countryCode, currentUserId]
    );

    if (exists.rows.length > 0) {
      const countries = await checkVisited();
      return res.render("index.ejs", {
        countries,
        total: countries.length,
        users,
        color: currentUser.color,
        error: "Country is already visited!",
      });
    }

    // Insert visited country
    await db.query(
      "INSERT INTO visited_countries (country_code, user_id) VALUES ($1, $2)",
      [countryCode, currentUserId]
    );

    res.redirect("/");
  } catch (err) {
    console.error(err);
    const countries = await checkVisited();
    const currentUser = await getCurrentUser();
    res.render("index.ejs", {
      countries,
      total: countries.length,
      users,
      color: currentUser.color,
      error: "Something went wrong. Try again.",
    });
  }
});

// Switch user or go to new user page
app.post("/user", async (req, res) => {
  if (req.body.add === "new") {
    res.render("new.ejs");
  } else {
    currentUserId = parseInt(req.body.user); // important: convert to integer
    res.redirect("/");
  }
});

// Add new user
app.post("/new", async (req, res) => {
  const name = req.body.name;
  const color = req.body.color;

  const result = await db.query(
    "INSERT INTO users (name, color) VALUES($1, $2) RETURNING *;",
    [name, color]
  );

  currentUserId = result.rows[0].id;
  res.redirect("/");
});

// Start server after DB init
initDB().then(() => {
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}).catch(err => {
  console.error("Failed to initialize database:", err);
});
