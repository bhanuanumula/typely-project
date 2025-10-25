// middleware/admin.js
export function isAdmin(req, res, next) {
  if (req.session?.user && req.session.user.role === 'admin') {
    // optionally attach user object for views
    req.user = req.session.user;
    return next();
  }
  // if not logged in as admin, redirect to admin login
  return res.redirect('/admin/login');
}
