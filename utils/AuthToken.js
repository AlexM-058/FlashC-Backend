import jwt from "jsonwebtoken";
const JWT_SECRET = process.env.JWT_SECRET;

// Middleware pentru autentificare JWT din cookie SAU header Authorization
export function authenticateToken(req, res, next) {
  // Try cookie first
  let token = req.cookies?.token;
  // If not in cookie, try Authorization header
  if (
    !token &&
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer ")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }
  if (!token) {
    return res
      .status(401)
      .json({ message: "JWT cookie or Authorization header missing." });
  }
  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "your_super_secret_jwt_key"
    );
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: "JWT invalid or expired." });
  }
}
