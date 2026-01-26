import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import dotenv from "dotenv";
import session from "express-session";
import bcrypt from "bcrypt";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// ✅ Postgres connection (Render compatible)
const db = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await db.connect();

// -------------------- MIDDLEWARE --------------------
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.set("view engine", "ejs");

app.use(
  session({
    secret: "travel-tracker-secret",
    resave: false,
    saveUninitialized: false,
  })
);

// -------------------- AUTH HELPERS --------------------
function requireLogin(req, res, next) {
  if (!req.session.userId) return res.redirect("/login");
  next();
}

async function getCurrentUser(req) {
  if (!req.session.userId) return null;
  const result = await db.query("SELECT * FROM users WHERE id=$1", [req.session.userId]);
  return result.rows[0];
}





async function getVisitedCountries(userId) {
  const result = await db.query(
    `
    SELECT 
      vc.country_code AS code,
      c.country_name AS name,
      c.continent
    FROM visited_countries vc
    JOIN countries c 
      ON vc.country_code = c.country_code
    WHERE vc.user_id = $1
    ORDER BY vc.id
    `,
    [userId]
  );

  return result.rows; // returns array of objects like { code, name, continent }
}


async function getVisitedByContinent(userId) {
  const result = await db.query(
    `
    SELECT 
      c.continent,
      COUNT(*) AS count
    FROM visited_countries vc
    JOIN countries c 
      ON vc.country_code = c.country_code
    WHERE vc.user_id = $1
    GROUP BY c.continent
    ORDER BY c.continent
    `,
    [userId]
  );

  return result.rows;
}




// -------------------- AUTH ROUTES --------------------

// Register page
app.get("/register", (req, res) => {
  res.render("register.ejs", { error: null });
});

// Register submit
app.post("/register", async (req, res) => {
  const { name, email, password, color } = req.body;

  // Check if email already exists
  const exists = await db.query("SELECT 1 FROM users WHERE email=$1", [email]);
  if (exists.rows.length > 0) {
    return res.render("register.ejs", { error: "Email already registered" });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const result = await db.query(
    "INSERT INTO users (name, email, password, color) VALUES ($1,$2,$3,$4) RETURNING id",
    [name, email, hashedPassword, color]
  );

  // Store user in session
  req.session.userId = result.rows[0].id;
  res.redirect("/");
});

// Login page
app.get("/login", (req, res) => {
  res.render("login.ejs", { error: null });
});

// Login submit
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const result = await db.query("SELECT * FROM users WHERE email=$1", [email]);
  if (result.rows.length === 0) 
    return res.render("login.ejs", { error: "Email not found" });

  const user = result.rows[0];
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.render("login.ejs", { error: "Wrong password" });

  req.session.userId = user.id;
  res.redirect("/");
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

// -------------------- MAIN APP --------------------
app.get("/", requireLogin, async (req, res) => { 
  try { const user = await getCurrentUser(req); 
  const countries = await getVisitedCountries(user.id); 
 const continentStats = await getVisitedByContinent(user.id);
 

  res.render("index.ejs", { 
    countries,
     continentStats,
      total: countries.length, 
    color: user.color, 
    error: null,
     userName: user.name, 
    });
   } catch (err) { 
    console.error(err); 
  res.send("Something went wrong"); } }); 


  // // Add visited country 
  // app.post("/add", requireLogin, async (req, res) => { 
  //   const { country } = req.body; 
  //   const user = await getCurrentUser(req); 
  //   try { 
  //     const result = await db.query( "SELECT country_code FROM countries WHERE country_name ILIKE $1", [country] ); 
  //     if (result.rows.length === 0) { 
  //         const countries = await getVisitedCountries(user.id); 
  //          const continentStats = await getVisitedByContinent(user.id);
  //         return res.render("index.ejs", {
  //        countries, 
  //          continentStats,
  //        total: countries.length, 
  //        color: user.color, 
  //        error: "Country not found", 
  //        userName: user.name, }); 
  //       } 
  //       const countryCode = result.rows[0].country_code; 
  //       // Insert if not already visited
  //        await db.query( "INSERT INTO visited_countries (user_id, country_code) VALUES ($1,$2) ON CONFLICT DO NOTHING", [user.id, countryCode] );
  //        res.redirect("/"); } 
  //        catch (err) { 
  //         console.error(err);
  //          res.redirect("/"); 
  //         } 
  //       }); 

  app.post("/add", requireLogin, async (req, res) => {
  const country = req.body.country.trim();
  const user = await getCurrentUser(req);

  try {
    // Find country
    const result = await db.query(
      "SELECT country_code, country_name FROM countries WHERE country_name ILIKE $1",
      [country]
    );

    if (result.rows.length === 0) {
      const countries = await getVisitedCountries(user.id);
      const continentStats = await getVisitedByContinent(user.id);
      return res.render("index.ejs", {
        countries,
        continentStats,
        total: countries.length,
        color: user.color,
        error: "Country not found",
        userName: user.name,
      });
    }

    const { country_code, country_name } = result.rows[0];

    // Check if already visited
    const alreadyVisited = await db.query(
      "SELECT 1 FROM visited_countries WHERE user_id = $1 AND country_code = $2",
      [user.id, country_code]
    );

    if (alreadyVisited.rows.length > 0) {
      const countries = await getVisitedCountries(user.id);
      const continentStats = await getVisitedByContinent(user.id);
      return res.render("index.ejs", {
        countries,
        continentStats,
        total: countries.length,
        color: user.color,
        error: `${country_name} is already visited`,
        userName: user.name,
      });
    }

    //  Insert only if not visited
    await db.query(
      "INSERT INTO visited_countries (user_id, country_code) VALUES ($1, $2)",
      [user.id, country_code]
    );

    res.redirect("/");

  } catch (err) {
    console.error(err);
    res.redirect("/");
  }
});




// -------------------- START SERVER --------------------
app.listen(port, () => {
  console.log(`Server running on port http://localhost:${port}`);
});
