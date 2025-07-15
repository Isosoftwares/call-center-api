const express = require("express");
const router = express.Router();

const { getCallHistory, addComment } = require("../controllers/callController");
const { authenticate, authorize } = require("../middleware/auth");

// Routes
router.post("/add-comment", addComment);
router.get("/history", authenticate, getCallHistory);

module.exports = router;
