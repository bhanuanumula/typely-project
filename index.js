// index.js
import express from "express";
import session from "express-session";
import flash from "connect-flash";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import { pool } from "./db.js";
import expressLayouts from "express-ejs-layouts";
import adminRoutes from "./adminRoutes.js";

const app = express();
const port = 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------- EJS + Static ----------------
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static("public"));
app.use(expressLayouts);
app.set("layout", "layouts/layout");

// ---------------- Middleware ----------------
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "typely_secret",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 }, // 1 day
  })
);
app.use(flash());

// ---------------- Global Template Variables ----------------
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.success_msg = req.flash("success");
  res.locals.error_msg = req.flash("error");
  res.locals.title = "Typely";
  res.locals.hideNavbar = false;
  res.locals.showTagline = true;
  next();
});

// ---------------- Helpers ----------------
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const validateId = (id) => Number.isInteger(parseInt(id));

const checkAuth = (req, res, next) => {
  if (req.session.user) return next();
  req.flash("error", "Please login to continue");
  return res.redirect("/login");
};

// ---------------- Admin Routes ----------------
app.use("/admin", adminRoutes);

// ---------------- Public Routes ----------------

// Home Page
app.get("/", asyncHandler(async (req, res) => {
  const result = await pool.query(
    "SELECT blogs.*, users.username FROM blogs JOIN users ON blogs.user_id = users.id ORDER BY created_at DESC"
  );
  res.render("index", { blogs: result.rows, title: "Home" });
}));

// Signup
app.route("/signup")
  .get((req, res) => {
    if (req.session.user) return res.redirect("/");
    res.render("signup", { title: "Signup", hideNavbar: true });
  })
  .post(asyncHandler(async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      req.flash("error", "All fields are required");
      return res.redirect("/signup");
    }

    if (password.length < 6) {
      req.flash("error", "Password must be at least 6 characters long");
      return res.redirect("/signup");
    }

    const existing = await pool.query(
      "SELECT id FROM users WHERE email=$1 OR username=$2",
      [email, username]
    );

    if (existing.rows.length > 0) {
      req.flash("error", "Email or username already exists");
      return res.redirect("/signup");
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      "INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id, username",
      [username, email, hashedPassword]
    );

    req.session.user = { id: result.rows[0].id, username: result.rows[0].username };
    req.flash("success", "Signup successful! Welcome!");
    res.redirect("/");
  }));

// Login
app.route("/login")
  .get((req, res) => {
    if (req.session.user) return res.redirect("/");
    res.render("login", { title: "Login", hideNavbar: true });
  })
  .post(asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      req.flash("error", "All fields are required");
      return res.redirect("/login");
    }

    const result = await pool.query("SELECT * FROM users WHERE email=$1", [email]);
    if (result.rows.length === 0) {
      req.flash("error", "User not found");
      return res.redirect("/login");
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      req.flash("error", "Incorrect password");
      return res.redirect("/login");
    }

    req.session.user = { id: user.id, username: user.username };
    req.flash("success", `Welcome back, ${user.username}!`);
    res.redirect("/");
  }));

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

// ---------------- Forgot Password ----------------
app.route("/forgot-password")
  .get((req, res) => {
    res.render("forgot-password", {
      title: "Forgot Password",
      hideNavbar: true,
      error_msg: req.flash("error") || "",
      success_msg: req.flash("success") || ""
    });
  })
  .post(asyncHandler(async (req, res) => {
    const { email, newPassword } = req.body;

    if (!email || !newPassword) {
      req.flash("error", "All fields are required");
      return res.redirect("/forgot-password");
    }

    const userResult = await pool.query("SELECT * FROM users WHERE email=$1", [email]);
    if (userResult.rows.length === 0) {
      req.flash("error", "No account found with this email");
      return res.redirect("/forgot-password");
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query("UPDATE users SET password=$1 WHERE email=$2", [hashedPassword, email]);

    req.flash("success", "Password reset successfully. You can now login.");
    res.redirect("/login");
  }));

// Contact Form (AJAX JSON)
app.post("/contact", asyncHandler(async (req, res) => {
  const { name, email, message } = req.body;

  if (!name || !email || !message) {
    return res.json({ success: false, error: "All fields are required" });
  }

  try {
    await pool.query(
      "INSERT INTO contact_messages (name, email, message) VALUES ($1, $2, $3)",
      [name, email, message]
    );
    return res.json({ success: true, message: "Message sent successfully!" });
  } catch (err) {
    console.error(err);
    return res.json({ success: false, error: "Server error while sending message" });
  }
}));

// Dashboard (User Blogs)
app.get("/dashboard", checkAuth, asyncHandler(async (req, res) => {
  const result = await pool.query(
    "SELECT * FROM blogs WHERE user_id=$1 ORDER BY created_at DESC",
    [req.session.user.id]
  );
  res.render("dashboard", { userBlogs: result.rows, title: "Dashboard" });
}));

// Create Blog
app.route("/create")
  .get(checkAuth, (req, res) => res.render("create", { title: "Create Blog" }))
  .post(checkAuth, asyncHandler(async (req, res) => {
    const { title, content } = req.body;
    if (!title || !content) {
      req.flash("error", "All fields are required");
      return res.redirect("/create");
    }

    await pool.query(
      "INSERT INTO blogs (user_id, title, content) VALUES ($1, $2, $3)",
      [req.session.user.id, title, content]
    );

    req.flash("success", "Blog created successfully");
    res.redirect("/dashboard");
  }));

// View Blog
app.get("/view/:id", asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (!validateId(id)) return res.status(400).render("error", { message: "Invalid blog ID" });

  const result = await pool.query(
    "SELECT blogs.*, users.username FROM blogs JOIN users ON blogs.user_id = users.id WHERE blogs.id=$1",
    [id]
  );

  if (result.rows.length === 0) return res.status(404).render("404", { message: "Blog not found" });

  res.render("viewblog", { blog: result.rows[0], title: result.rows[0].title });
}));

// Edit Blog
app.route("/edit/:id")
  .get(checkAuth, asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    if (!validateId(id)) return res.status(400).render("error", { message: "Invalid blog ID" });

    const result = await pool.query(
      "SELECT * FROM blogs WHERE id=$1 AND user_id=$2",
      [id, req.session.user.id]
    );

    if (result.rows.length === 0) return res.status(403).render("error", { message: "Not authorized" });

    res.render("edit", { blog: result.rows[0], title: "Edit Blog" });
  }))
  .post(checkAuth, asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    const { title, content } = req.body;

    if (!title || !content) {
      req.flash("error", "All fields are required");
      return res.redirect(`/edit/${id}`);
    }

    await pool.query(
      "UPDATE blogs SET title=$1, content=$2 WHERE id=$3 AND user_id=$4",
      [title, content, id, req.session.user.id]
    );

    req.flash("success", "Blog updated successfully");
    res.redirect("/dashboard");
  }));

// Delete Blog
app.post("/delete/:id", checkAuth, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (!validateId(id)) return res.status(400).render("error", { message: "Invalid blog ID" });

  await pool.query("DELETE FROM blogs WHERE id=$1 AND user_id=$2", [id, req.session.user.id]);
  req.flash("success", "Blog deleted successfully");
  res.redirect("/dashboard");
}));

// Info Pages
app.get("/contact", (req, res) => res.render("contact", { title: "Contact" }));
app.get("/about", (req, res) => res.render("about", { title: "About" }));

// 404 & Error Handling
app.use((req, res) => res.status(404).render("404", { title: "Page Not Found" }));
app.use((err, req, res, next) => {
  console.error("SERVER ERROR:", err.stack);
  res.status(500).render("error", { message: err.message || "Server Error" });
});

// Start Server
app.listen(port, () => console.log(`✅ Typely running at http://localhost:${port}`));
