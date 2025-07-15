const express = require("express");
const router = express.Router();

const {
  createSchool,
  getAllSchools,
  getSchoolById,
  updateSchool,
  deleteSchool,
} = require("../controllers/schoolController");

router.post("/", createSchool);
router.get("/", getAllSchools);
router.get("/one/:id", getSchoolById);
router.put("/update/:id", updateSchool);
router.delete("/delete/:id", deleteSchool);

module.exports = router;
