const express = require("express");
const PhoneNumber = require("../models/PhoneNumber");

// Create phone number
const createPhoneNumber = async (req, res) => {
  try {
    const phoneNumber = await PhoneNumber.create(req.body);
    res
      .status(201)
      .json({ phoneNumber, message: "Phone number added successfully" });
  } catch (error) {
    console.log(error)
    res.status(400).json({ error: error.message });
  }
};

// Get all phone numbers
const getAllPhoneNumbers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const { categoryId, schoolId, phoneNumber } = req.query;
    const filter = {
      phoneNumber: { $regex: phoneNumber || "", $options: "i" },
    };
    if (categoryId) filter.categoryId = categoryId;
    if (schoolId) filter.schoolId = schoolId;

    const phoneNumbers = await PhoneNumber.find(filter)
      .populate("categoryId")
      .populate("schoolId")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await PhoneNumber.countDocuments(filter);
    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      phoneNumbers,
      pagination: {
        currentPage: page,
        totalPages,
        totalRecords: total,
        limit,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get phone number by ID
const getPhoneNumberById = async (req, res) => {
  try {
    const phoneNumber = await PhoneNumber.findById(req.params.id)
      .populate("categoryId")
      .populate("schoolId");

    if (!phoneNumber) {
      return res.status(404).json({ error: "Phone number not found" });
    }

    res.status(200).json(phoneNumber);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getOnePhoneNumber = async (req, res) => {
  try {
    const phoneNumber = await PhoneNumber.findOne(req.params.phoneNumber)
      .populate("categoryId")
      .populate("schoolId");

    if (!phoneNumber) {
      return res.status(404).json({ error: "Phone number not found" });
    }

    res.status(200).json({ phoneNumber });
  } catch (error) {
    res
      .status(500)
      .json({ error: error.message, message: "Something went wrong" });
  }
};

// Update phone number
const updatePhoneNumber = async (req, res) => {
  try {
    const phoneNumber = await PhoneNumber.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    )
      .populate("categoryId")
      .populate("schoolId");

    if (!phoneNumber) {
      return res.status(404).json({ error: "Phone number not found" });
    }

    res
      .status(200)
      .json({ phoneNumber, message: "Phone Number updated successfully" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Delete phone number
const deletePhoneNumber = async (req, res) => {
  try {
    const phoneNumber = await PhoneNumber.findByIdAndDelete(req.params.id);

    if (!phoneNumber) {
      return res.status(404).json({ error: "Phone number not found" });
    }

    res.status(200).json({ message: "Phone number deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  createPhoneNumber,
  getAllPhoneNumbers,
  getPhoneNumberById,
  updatePhoneNumber,
  deletePhoneNumber,
  getOnePhoneNumber,
};
