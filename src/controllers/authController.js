const jwt = require("jsonwebtoken");
const User = require("../models/User");
const bcrypt = require("bcrypt");

const {
  createSuccessResponse,
  createErrorResponse,
  pipe,
} = require("../utils/helpers");
const { default: mongoose } = require("mongoose");

// Functional token generation
const generateToken = (userId) =>
  jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "7d" });

const sanitizeUser = (user) => {
  const { password, ...sanitizedUser } = user.toObject();
  return sanitizedUser;
};

// Register user
const register = async (req, res) => {
  try {
    const { username, email, password, role, profile } = req.body;

    const existingUser = await User.findOne({
      $or: [{ email }, { username }],
    });

    if (existingUser) {
      return res.status(409).json(createErrorResponse("User already exists"));
    }
    const encryptedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      username,
      email,
      password: encryptedPassword,
      role,
      profile,
    });

    await user.save();

    const token = generateToken(user._id);
    const sanitizedUser = sanitizeUser(user);

    res.status(201).json(
      createSuccessResponse(
        {
          user: sanitizedUser,
          token,
        },
        "User registered successfully"
      )
    );
  } catch (error) {
    res.status(500).json(createErrorResponse(error.message));
  }
};

const changePassword = async (req, res) => {
  try {
    const { userId, password } = req.body;
    if (!userId || !password) {
      return res
        .status(400)
        .json(createErrorResponse("User ID and password are required"));
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json(createErrorResponse("User not found"));
    }

    const encryptedPassword = await bcrypt.hash(password, 10);
    user.password = encryptedPassword;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    res.status(500).json(createErrorResponse("Error changing password"));
  }
};

const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({
      $or: [{ email: username }, { username }],
    });

    if (!user) {
      return res.status(401).json(createErrorResponse("Invalid credentials"));
    }

    // Compare password with hashed password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json(createErrorResponse("Invalid credentials"));
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    const token = generateToken(user._id);
    const sanitizedUser = sanitizeUser(user);

    res.json(
      createSuccessResponse(
        {
          user: sanitizedUser,
          accessToken: token,
        },
        "Login successful"
      )
    );
  } catch (error) {
    console.log(error);
    res.status(500).json(createErrorResponse(error.message));
  }
};

// refresh token
const getRefreshToken = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json(createErrorResponse("User ID is required"));
    }
    // Validate user ID
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json(createErrorResponse("Invalid User ID"));
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(401).json(createErrorResponse("Invalid credentials"));
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    const token = generateToken(user._id);
    const sanitizedUser = sanitizeUser(user);

    res.json(
      createSuccessResponse(
        {
          user: sanitizedUser,
          accessToken: token,
        },
        "refresh token successful"
      )
    );
  } catch (error) {
    res.status(500).json(createErrorResponse(error.message));
  }
};

// Get current user profile
const getProfile = async (req, res) => {
  try {
    const sanitizedUser = sanitizeUser(req.user);
    res.json(createSuccessResponse(sanitizedUser));
  } catch (error) {
    res.status(500).json(createErrorResponse(error.message));
  }
};

// Update user profile
const updateProfile = async (req, res) => {
  try {
    const { profile } = req.body;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: { profile } },
      { new: true, runValidators: true }
    );

    const sanitizedUser = sanitizeUser(user);
    res.json(
      createSuccessResponse(sanitizedUser, "Profile updated successfully")
    );
  } catch (error) {
    res.status(500).json(createErrorResponse(error.message));
  }
};

module.exports = {
  register,
  login,
  getProfile,
  updateProfile,
  getRefreshToken,
  changePassword,
};
