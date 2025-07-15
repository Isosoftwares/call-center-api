const express = require("express");
const router = express.Router();

const {
  createPhoneNumber,
  getAllPhoneNumbers,
  updatePhoneNumber,
  getPhoneNumberById,
  deletePhoneNumber,
  getOnePhoneNumber
} = require("../controllers/phoneNumberController");

router.post("/", createPhoneNumber);
router.get("/", getAllPhoneNumbers);
router.get("/one/:id", getPhoneNumberById);
router.get("/one-by-phone/:phoneNumber", getOnePhoneNumber);
router.patch("/update/:id", updatePhoneNumber);
router.delete("/delete/:id", deletePhoneNumber);

module.exports = router;
