import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// ✅ Postgres connection (Render compatible)
const db = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await db.connect();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.set("view engine", "ejs");

let currentUserId = 1;
let users = [];

/* -------------------- HELPERS -------------------- */

// Get visited countries for current user
async function checkVisited() {
  const result = await db.query(
    `SELECT country_code 
     FROM visited_countries 
     WHERE user_id = $1 
     ORDER BY country_code`,
    [currentUserId]
  );
  return result.rows.map(row => row.country_code);
}

// Get current user safely (NO crash)
async function getCurrentUser() {
  const result = await db.query(
    "SELECT * FROM users WHERE id = $1",
    [currentUserId]
  );

  if (result.rows.length > 0) {
    return result.rows[0];
  }

  // fallback user
  const fallback = await db.query(
    "SELECT * FROM users ORDER BY id LIMIT 1"
  );

  currentUserId = fallback.rows[0].id;
  return fallback.rows[0];
}

/* -------------------- ROUTES -------------------- */

// Home
app.get("/", async (req, res) => {
  try {
    const countries = await checkVisited();
    const currentUser = await getCurrentUser();

    const allUsers = await db.query("SELECT * FROM users");
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
    res.send("Something went wrong");
  }
});

// Add visited country
app.post("/add", async (req, res) => {
  const input = req.body.country.trim();

  try {
    const currentUser = await getCurrentUser();

    const result = await db.query(
      `SELECT country_code 
       FROM countries 
       WHERE country_name ILIKE $1`,
      [input]
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
      `SELECT 1 
       FROM visited_countries 
       WHERE country_code = $1 AND user_id = $2`,
      [countryCode, currentUserId]
    );

    if (exists.rows.length > 0) {
      const countries = await checkVisited();
      return res.render("index.ejs", {
        countries,
        total: countries.length,
        users,
        color: currentUser.color,
        error: "You have already visited this country!",
      });
    }

    
    // Insert visited country
    
    await db.query(
      `INSERT INTO visited_countries (country_code, user_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [countryCode, currentUserId]
    );

    res.redirect("/");
  } catch (err) {
    console.error(err);
    res.redirect("/");
  }
});

// Switch user / New user page
app.post("/user", (req, res) => {
  if (req.body.add === "new") {
    res.render("new.ejs");
  } else {
    currentUserId = parseInt(req.body.user);
    res.redirect("/");
  }
});

// Add new user
app.post("/new", async (req, res) => {
  const { name, color } = req.body;

  const result = await db.query(
    `INSERT INTO users (name, color)
     VALUES ($1, $2)
     RETURNING *`,
    [name, color]
  );

  currentUserId = result.rows[0].id;
  res.redirect("/");
});

/* -------------------- START SERVER -------------------- */

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
