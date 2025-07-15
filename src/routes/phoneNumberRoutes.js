const express = require("express");
const router = express.Router();

const {
  createPhoneNumber,
  getAllPhoneNumbers,
  updatePhoneNumber,
  getPhoneNumberById,
  deletePhoneNumber,
} = require("../controllers/phoneNumberController");

router.post("/", createPhoneNumber);
router.get("/", getAllPhoneNumbers);
router.get("/one/:id", getPhoneNumberById);
router.patch("/update/:id", updatePhoneNumber);
router.delete("/:id", deletePhoneNumber);

module.exports = router;
