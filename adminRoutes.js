// adminRoutes.js
import express from "express";
import { pool } from "./db.js";
import { isAdmin } from "./middleware/admin.js";
import bcrypt from "bcryptjs";

const router = express.Router();

// =====================
// Admin Login
// =====================
router.get("/login", (req, res) => {
  res.render("admin/admin-login", { layout: false, error: null });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE email=$1 AND role='admin'",
      [email]
    );

    if (result.rows.length === 0) {
      return res.render("admin/admin-login", { layout: false, error: "Invalid email or password" });
    }

    const admin = result.rows[0];
    const match = await bcrypt.compare(password, admin.password);
    if (!match) {
      return res.render("admin/admin-login", { layout: false, error: "Invalid email or password" });
    }

    // Store admin session
    req.session.user = {
      id: admin.id,
      username: admin.username,
      email: admin.email,
      role: admin.role
    };

    res.redirect("/admin");
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

router.get("/logout", isAdmin, (req, res) => {
  req.session.destroy(err => {
    if (err) console.error(err);
    res.redirect("/admin/login");
  });
});

// =====================
// Admin Dashboard
// =====================
router.get("/", isAdmin, async (req, res) => {
  try {
    const usersResult = await pool.query("SELECT * FROM users ORDER BY id DESC");
    const blogsResult = await pool.query(`
      SELECT blogs.*, users.username
      FROM blogs
      JOIN users ON blogs.user_id = users.id
      ORDER BY blogs.created_at DESC
    `);

    res.render("admin/admin-dashboard", {
      layout: false,
      user: req.session.user,
      users: usersResult.rows,
      blogs: blogsResult.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// =====================
// Contact Messages
// =====================
router.get("/messages", isAdmin, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM contact_messages ORDER BY created_at DESC");
    res.render("admin/admin-messages", {
      layout: false,
      user: req.session.user,
      messages: result.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error retrieving messages");
  }
});

// =====================
// Manage Users
// =====================
router.get("/users", isAdmin, async (req, res) => {
  try {
    const usersResult = await pool.query("SELECT * FROM users ORDER BY id DESC");
    res.render("admin/admin-users", { layout: false, user: req.session.user, users: usersResult.rows });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

router.post("/users/delete/:id", isAdmin, async (req, res) => {
  const userId = req.params.id;
  try {
    const userResult = await pool.query("SELECT * FROM users WHERE id=$1", [userId]);
    if (userResult.rows.length === 0) return res.status(404).send("User not found");
    if (userResult.rows[0].role === "admin") return res.status(403).send("Cannot delete another admin");

    await pool.query("DELETE FROM users WHERE id=$1", [userId]);
    res.redirect("/admin/users");
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

router.post("/users/promote/:id", isAdmin, async (req, res) => {
  try {
    await pool.query("UPDATE users SET role='admin' WHERE id=$1", [req.params.id]);
    res.redirect("/admin/users");
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

router.post("/users/demote/:id", isAdmin, async (req, res) => {
  try {
    await pool.query("UPDATE users SET role='user' WHERE id=$1", [req.params.id]);
    res.redirect("/admin/users");
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

router.post("/users/reset-password/:id", isAdmin, async (req, res) => {
  try {
    const newPassword = "123456"; // default password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query("UPDATE users SET password=$1 WHERE id=$2", [hashedPassword, req.params.id]);
    res.redirect("/admin/users");
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// =====================
// Manage Blogs
// =====================
router.get("/blogs", isAdmin, async (req, res) => {
  try {
    const blogsResult = await pool.query(`
      SELECT blogs.*, users.username
      FROM blogs
      JOIN users ON blogs.user_id = users.id
      ORDER BY blogs.created_at DESC
    `);
    res.render("admin/admin-blogs", { layout: false, user: req.session.user, blogs: blogsResult.rows });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

router.post("/blogs/delete/:id", isAdmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM blogs WHERE id=$1", [req.params.id]);
    res.redirect("/admin/blogs");
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

router.post("/blogs/approve/:id", isAdmin, async (req, res) => {
  try {
    await pool.query("UPDATE blogs SET status='approved' WHERE id=$1", [req.params.id]);
    res.redirect("/admin/blogs");
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

router.get("/blogs/edit/:id", isAdmin, async (req, res) => {
  try {
    const blogResult = await pool.query("SELECT * FROM blogs WHERE id=$1", [req.params.id]);
    if (blogResult.rows.length === 0) return res.status(404).send("Blog not found");

    res.render("admin/admin-edit-blog", { layout: false, user: req.session.user, blog: blogResult.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

router.post("/blogs/edit/:id", isAdmin, async (req, res) => {
  const { title, content } = req.body;
  try {
    await pool.query("UPDATE blogs SET title=$1, content=$2 WHERE id=$3", [title, content, req.params.id]);
    res.redirect("/admin/blogs");
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});


router.get("/contact-messages", isAdmin, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM contact_messages ORDER BY created_at DESC");
    res.render("admin/admin-messages", { layout: false, user: req.session.user, messages: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error retrieving messages");
  }
});

// =====================
// Export Router
// =====================
export default router;
