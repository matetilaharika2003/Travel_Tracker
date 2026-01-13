// import express from "express";
// import bodyParser from "body-parser";
// import pg from "pg";

// const app = express();
// const port = 3000;

// const db = new pg.Client({
//   user: "postgres",
//   host: "localhost",
//   database: "worldDB",
//   password: "postgre",
//   port: 5432,
// });
// db.connect();

// app.use(bodyParser.urlencoded({ extended: true }));
// app.use(express.static("public"));

// let currentUserId = 1;

// let users = [
//   { id: 1, name: "Laharika", color: "teal" },
//   { id: 2, name: "Jack", color: "powderblue" },
// ];

// async function checkVisisted() {
//   const result = await db.query(
//     "SELECT country_code FROM visited_countries JOIN users ON users.id = user_id WHERE user_id = $1; ",
//     [currentUserId]
//   );
//   let countries = [];
//   result.rows.forEach((country) => {
//     countries.push(country.country_code);
//   });
//   return countries;
// }

// async function getCurrentUser() {
//   const result = await db.query("SELECT * FROM users");
//   users = result.rows;
//   return users.find((user) => user.id == currentUserId);
// }

// app.get("/", async (req, res) => {
//   const countries = await checkVisisted();

//     const currentUser = await getCurrentUser();
//   res.render("index.ejs", {
//     countries: countries,
//     total: countries.length,
//     users: users,
//     color: currentUser.color,
//   });
// });
// app.post("/add", async (req, res) => {
//   const input = req.body["country"];
//   const currentUser = await getCurrentUser();

//   try {
//     const result = await db.query(
//       "SELECT country_code FROM countries WHERE LOWER(country_name) LIKE '%' || $1 || '%';",
//       [input.toLowerCase()]
//     );

//     const data = result.rows[0];
//     const countryCode = data.country_code;
//     try {
//       await db.query(
//         "INSERT INTO visited_countries (country_code, user_id) VALUES ($1, $2)",
//         [countryCode, currentUserId]
//       );
//       res.redirect("/");
//     } catch (err) {
//       console.log(err);
//     }
//   } catch (err) {
//     console.log(err);
//   }
// });

// app.post("/user", async (req, res) => {
//   if (req.body.add === "new") {
//     res.render("new.ejs");
//   } else {
//     currentUserId = req.body.user;
//     res.redirect("/");
//   }
// });

// app.post("/new", async (req, res) => {
//   const name = req.body.name;
//   const color = req.body.color;

//   const result = await db.query(
//     "INSERT INTO users (name, color) VALUES($1, $2) RETURNING *;",
//     [name, color]
//   );

//   const id = result.rows[0].id;
//   currentUserId = id;

//   res.redirect("/");
// });

// app.listen(port, () => {
//   console.log(`Server running on http://localhost:${port}`);
// });


import express from "express";
import bodyParser from "body-parser";
import pg from "pg";

const app = express();
const port = 3000;

const db = new pg.Client({
  user: "postgres",
  host: "localhost",
  database: "worldDB",
  password: "postgre",
  port: 5432,
});
db.connect();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.set("view engine", "ejs");

let currentUserId = 1;

let users = [
  { id: 1, name: "Laharika", color: "teal" },
  { id: 2, name: "Jack", color: "powderblue" },
];

async function checkVisited() {
  const result = await db.query(
    "SELECT country_code FROM visited_countries WHERE user_id = $1;",
    [currentUserId]
  );
  return result.rows.map((country) => country.country_code);
}

async function getCurrentUser() {
  const result = await db.query("SELECT * FROM users");
  users = result.rows;
  return users.find((user) => user.id == currentUserId);
}

// Home page
app.get("/", async (req, res) => {
  const countries = await checkVisited();
  const currentUser = await getCurrentUser();
  res.render("index.ejs", {
    countries: countries,
    total: countries.length,
    users: users,
    color: currentUser.color,
    error: null,
  });
});

// Add visited country
app.post("/add", async (req, res) => {
  const input = req.body["country"];
  const currentUser = await getCurrentUser();

  try {
    // Check if country exists
    const result = await db.query(
      "SELECT country_code FROM countries WHERE LOWER(country_name) = $1",
      [input.trim().toLowerCase()]
    );

    if (result.rows.length === 0) {
      // Country does not exist
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

    try {
      // Check if country already visited
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

      // Insert country for user
      await db.query(
        "INSERT INTO visited_countries (country_code, user_id) VALUES ($1, $2)",
        [countryCode, currentUserId]
      );

      res.redirect("/");
    } catch (err) {
      console.log(err);
      const countries = await checkVisited();
      return res.render("index.ejs", {
        countries,
        total: countries.length,
        users,
        color: currentUser.color,
        error: "Something went wrong. Try again.",
      });
    }
  } catch (err) {
    console.log(err);
    const countries = await checkVisited();
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
    currentUserId = req.body.user;
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

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
