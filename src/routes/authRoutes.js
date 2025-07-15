const express = require("express");
const { body } = require("express-validator");
const router = express.Router();

const {
  register,
  login,
  getProfile,
  updateProfile,
  getRefreshToken,
  changePassword,
} = require("../controllers/authController");
const { authenticate } = require("../middleware/auth");
const { handleValidationErrors } = require("../middleware/validation");
const { seedDatabase } = require("../../scripts/seed");

// Validation rules
const registerValidation = [
  body("username")
    .isLength({ min: 3 })
    .withMessage("Username must be at least 3 characters"),
  body("email").isEmail().withMessage("Please provide a valid email"),
  body("password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters"),
  body("role")
    .optional()
    .isIn(["admin", "supervisor", "agent"])
    .withMessage("Invalid role"),
];

const loginValidation = [
  body("username").notEmpty().withMessage("Username or email is required"),
  body("password").notEmpty().withMessage("Password is required"),
];

// Routes
router.post("/register", registerValidation, handleValidationErrors, register);
router.post("/login", loginValidation, login);
router.get("/profile/:userId", getProfile);
router.get("/refresh-token/:userId", getRefreshToken);
router.patch("/profile", updateProfile);
router.post("/seed", seedDatabase);
router.patch("/change-pass", changePassword);

module.exports = router;
